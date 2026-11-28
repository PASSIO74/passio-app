// Rencontrer — les DERNIERS défauts de la création et de la gestion d'activité
// (2026-11-28). Faux serveur PostgREST multi-comptes (vrai SDK, vrais handlers)
// ou état local ; AUCUNE écriture réelle.
//
// Défauts fermés (dossiers CRE/FIC), chacun rouge sur le code d'avant :
//
//   n° 212  Demande refusée : le bandeau « Ta demande n'a pas été acceptée »
//           surmontait un pied « Je participe » identique à une première fois —
//           un appui renvoyait une demande (et une notification à l'organisation)
//           sans le moindre mot. Le pied dit le refus ; redemander reste
//           possible, mais comme un geste explicite et confirmé (①).
//   n° 227  Suppression d'une activité : le miroir local de sa discussion
//           restait dans la messagerie de l'organisateur, et la fusion des
//           conversations l'aurait gardé au redémarrage (②).
//
// Les autres sujets du lot (207, 209, 216-226, 228, 229) étaient déjà fermés en
// production : `rencontrer-creation.spec.js`, `rencontrer-fiche.spec.js` et
// `rencontrer-lieu-dates.spec.js` les gardent.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");
const { bootOnboarded } = require("./app-helper");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000051";
const B = "bbbbbbbb-0000-4000-8000-000000000052";
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");
const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });

// `mon_refus_demande_sortie` (production) : vrai tant que l'organisation a refusé
// ma demande et que je ne me suis pas réinscrit (le déclencheur `clore_refus_demande`
// clôt le refus à la réinscription). Le banc commun ne la connaît pas.
function serveurRefus() {
  const srv = new FauxServeur();
  srv.compte(ORGA, "orga_rst"); srv.compte(B, "bob_rst");
  srv.refus = new Set();
  const orig = srv.traiter.bind(srv);
  srv.traiter = async function (req) {
    const url = new URL(req.url());
    if (req.method() === "POST" && /\/rest\/v1\/rpc\/mon_refus_demande_sortie$/.test(url.pathname)) {
      let corps = {}; try { corps = JSON.parse(req.postData() || "{}"); } catch (e) {}
      return json(200, srv.refus.has(corps.p_event_id + "|" + B));
    }
    const r = await orig(req);
    if (req.method() === "POST" && /\/rest\/v1\/event_attendees/.test(url.pathname)) {
      srv.t.event_attendees.forEach((a) => srv.refus.delete(a.event_id + "|" + a.user_id));
    }
    return r;
  };
  return srv;
}

test.describe("Rencontrer — reste de la création et de la gestion", () => {
  test.setTimeout(120000);

  test("① n° 212 — demande refusée : le pied dit le refus, et redemander demande confirmation", async ({ browser }) => {
    const srv = serveurRefus();
    srv.t.events.push({ id: "evt_rst_1", author_id: ORGA, organizer_id: ORGA, title: "Atelier refusé", passion_id: "musique", city: "Annecy",
      emoji: "🎸", max_attendees: 8, date_at: iso(Date.now() + 2 * 86400000), status: "active", co_organizers: [], visibilite: "publique",
      created_at: iso(Date.now() - 86400000), lat: 45.9, lng: 6.12 });
    srv.t.event_attendees.push({ event_id: "evt_rst_1", user_id: ORGA, rsvp: "going", created_at: new Date(Date.now() - 3600000).toISOString() });
    srv.refus.add("evt_rst_1|" + B);
    const ctx = await browser.newContext();
    try {
      const { page } = await ouvrirCompte(ctx, srv, B, { nom: "bob_rst" });
      await page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
      await page.evaluate(async () => {
        state.seed.events = await supaLoadEvents(); state.userEvents = []; saveState();
        goTo("irl"); renderIRL(); openEventDetails("evt_rst_1");
      });
      await expect(page.locator("[data-refus-demande]"), "témoin : la base dit le refus").toBeVisible({ timeout: 15000 });
      const pied = page.locator("#eventDetailCta");
      await expect(pied.locator("[data-v4b-rsvp-refus]")).toHaveText("Demande non acceptée");
      await expect(pied.locator("[data-v4b-rsvp-go]"), "plus de « Je participe » nu après un refus").toHaveCount(0);
      const demandesDeB = () => srv.journal.filter((j) => j.me === B && j.table === "event_attendees" && j.m === "POST").length;
      // Le banc commun confirme tout d'office : ici, la réponse est la nôtre, et la
      // question posée est relevée.
      await page.evaluate(() => { window._questions = []; window._reponse = false;
        window.confirmerAction = async (o) => { window._questions.push(o && o.titre); return window._reponse; }; });
      // Renoncer : rien ne part.
      await pied.locator("[data-v4b-rsvp-redemander]").click();
      await expect.poll(() => page.evaluate(() => window._questions.length)).toBe(1);
      expect(await page.evaluate(() => window._questions[0])).toBe("Redemander à participer ?");
      await page.waitForTimeout(800);
      expect(demandesDeB(), "renoncer n'écrit rien").toBe(0);
      expect(srv.t.event_attendees.some((a) => a.user_id === B)).toBe(false);
      // Confirmer : la nouvelle demande part, et le pied redevient « Demande envoyée ».
      await expect(pied.locator("[data-v4b-rsvp-refus]"), "renoncer garde l'état de refus").toHaveText("Demande non acceptée");
      await page.evaluate(() => { window._reponse = true; });
      await pied.locator("[data-v4b-rsvp-redemander]").click();
      await expect.poll(() => srv.t.event_attendees.some((a) => a.event_id === "evt_rst_1" && a.user_id === B && a.rsvp === "going"), { timeout: 15000 }).toBe(true);
      await expect(pied.locator("[data-v4b-rsvp-refus]")).toHaveCount(0);
      await expect(pied.locator("[data-v4b-rsvp-etat]")).toHaveText("Demande envoyée", { timeout: 15000 });
    } finally { await ctx.close(); }
  });

  test("② n° 227 — supprimer une activité retire aussi sa discussion de ma messagerie, durablement", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const ev = { id: "evt_rst_2", title: "Sortie à supprimer", passion: "musique", emoji: "🎸", date: Date.now() + 2 * 86400000,
        city: "Annecy", organizerId: MY_UID, attendees: [MY_UID], status: "active", convId: "evgrp_evt_rst_2" };
      state.userEvents = [ev]; saveState();
      _ensureLocalEventConv(ev);
      const avant = getConversations().some((c) => c.id === "evgrp_evt_rst_2");
      window.confirmerAction = async () => true;
      await deleteEventConfirm("evt_rst_2");
      const ls = localStorage.getItem("passio_conversations_v1") || "";
      let idb = [];
      try { if (typeof idbConvLoad === "function") idb = (await idbConvLoad()) || []; } catch (e) {}
      // Une hydratation depuis le stockage durable ne la ressuscite pas.
      try { if (typeof hydrateConvsFromIDB === "function") await hydrateConvsFromIDB(); } catch (e) {}
      return {
        avant,
        apres: getConversations().some((c) => c.id === "evgrp_evt_rst_2"),
        ls: ls.includes("evgrp_evt_rst_2"),
        idb: (Array.isArray(idb) ? idb : []).some((c) => c && c.id === "evgrp_evt_rst_2"),
        tombe: (localStorage.getItem("passio_conv_deleted_v1") || "").includes("conv:evgrp_evt_rst_2"),
        activite: (state.userEvents || []).some((e) => e.id === "evt_rst_2"),
      };
    });
    expect(r.avant, "témoin : la discussion était dans la messagerie").toBe(true);
    expect(r.activite).toBe(false);
    expect(r.apres, "la discussion quitte la messagerie").toBe(false);
    expect(r.ls).toBe(false);
    expect(r.idb).toBe(false);
    expect(r.tombe, "pierre tombale : la fusion ne la fera pas revenir").toBe(true);
  });
});
