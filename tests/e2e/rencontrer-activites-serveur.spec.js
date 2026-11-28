// Rencontrer — la part CLIENT de `migrations/migration_rencontrer_activites_2026-11-28.sql`.
// Faux serveur PostgREST multi-comptes, vrai SDK, vrais handlers. AUCUNE
// écriture réelle.
//
// Le banc commun garde la clause « suivi mutuel » de l'ancienne policy de
// lecture des participants : ici, elle est celle de la PRODUCTION
// (`event_attendees_select_lien` : sa ligne, l'organisation, ou un participant
// VALIDÉ — rien pour un membre non inscrit), et les deux RPC neuves sont imitées.
//
//   n° 198  « X et Y y vont » était éteint pour qui n'est pas inscrit : la liste
//           des participants ne lui revient plus. La carte ET la fiche le disent
//           désormais à partir de `amis_qui_y_vont` (①), au pluriel juste (②),
//           et rien ne casse quand la base n'a pas la RPC (③, témoin).
//   n° 212  La base borne la redemande après un refus (une seule, 24 h après ;
//           aucune après deux). Le client d'avant disait « réessaie » à un refus
//           qu'aucun essai ne lèvera (④), et proposait « Redemander à
//           participer » quand ce n'était plus possible (⑤) ; la porte reste là
//           quand redemander est permis ou inconnu (⑥, témoin).
// Contre-épreuve : ①②④⑤ ROUGES sur le code d'avant, ③⑥ verts des deux côtés.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000071";
const B = "bbbbbbbb-0000-4000-8000-000000000072";
const CHLOE = "cccccccc-0000-4000-8000-000000000073";
const TOM = "dddddddd-0000-4000-8000-000000000074";
const LEA = "eeeeeeee-0000-4000-8000-000000000075";
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");
const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
function sujet(req) {
  try {
    const tok = String(req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "");
    return JSON.parse(Buffer.from(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).sub || null;
  } catch (e) { return null; }
}

// Le banc commun, avec la policy de lecture et les RPC de la production d'après migration.
class Banc extends FauxServeur {
  constructor() {
    super();
    this.participantsParLien = true;
    this.accords = new Set();          // rencontres_prive.accords : « event|user »
    this.refusEnCours = new Set();     // mon_refus_demande_sortie
    this.redemande = {};               // « event|user » → réponse de etat_redemande_sortie
    this.rpcAmis = true;
    this.rpcEtat = true;
    this.appels = { amis: 0, etat: 0 };
  }
  valide(ev, u) { return this.accords.has(ev + "|" + u); }
  suit(a, b) { return this.t.follows.some((f) => f.follower_id === a && f.following_id === b && f.status === "accepted"); }
  // `event_attendees_select_lien` de PRODUCTION : la clause « suivi mutuel » est partie le 16/11.
  selectOk(table, r, me, role) {
    if (table !== "event_attendees") return super.selectOk(table, r, me, role);
    if (role !== "authenticated") return false;
    const vient = this.t.event_attendees.some((a) => a.event_id === r.event_id && a.user_id === me && a.rsvp === "going") && this.valide(r.event_id, me);
    return r.user_id === me || this.organiseActivite(r.event_id, me)
      || (r.rsvp === "going" && vient && !this.isBlockedWith(me, r.user_id));
  }
  // Miroir de `amis_qui_y_vont` (banc SQL : tests/sql/migration-rencontrer-activites.test.sh).
  amis(evId, me) {
    const ev = this.t.events.find((e) => e.id === evId);
    if (!me || !ev || ev.status !== "active") return { total: 0, amis: [] };
    const l = this.t.event_attendees
      .filter((a) => a.event_id === evId && a.rsvp === "going" && a.user_id !== me
        && (this.valide(evId, a.user_id) || a.user_id === ev.author_id || a.user_id === ev.organizer_id)
        && this.suit(me, a.user_id) && this.suit(a.user_id, me) && !this.isBlockedWith(me, a.user_id))
      .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
    return { total: l.length, amis: l.slice(0, 3).map((a) => { const p = this.prof(a.user_id) || {}; return { id: a.user_id, username: p.username, emoji: p.emoji, color: p.color, avatar_url: p.avatar_url || null }; }) };
  }
  async traiter(req) {
    const url = new URL(req.url());
    if (req.method() === "POST" && /\/rest\/v1\/rpc\/(amis_qui_y_vont|etat_redemande_sortie|mon_refus_demande_sortie)$/.test(url.pathname)) {
      const nom = url.pathname.split("/").pop();
      let corps = {}; try { corps = JSON.parse(req.postData() || "{}"); } catch (e) {}
      const me = sujet(req);
      if (nom === "mon_refus_demande_sortie") return json(200, this.refusEnCours.has(corps.p_event_id + "|" + me));
      if (nom === "amis_qui_y_vont" && this.rpcAmis) { this.appels.amis++; return json(200, this.amis(corps.p_event_id, me)); }
      if (nom === "etat_redemande_sortie" && this.rpcEtat) {
        this.appels.etat++;
        return json(200, this.redemande[corps.p_event_id + "|" + me] || { refus: 0, motif: null, possible_le: null });
      }
    }
    return super.traiter(req);
  }
}

function serveur() {
  const srv = new Banc();
  srv.compte(ORGA, "orga_act"); srv.compte(B, "bob_act"); srv.compte(CHLOE, "chloe_act"); srv.compte(TOM, "tom_act"); srv.compte(LEA, "lea_act");
  return srv;
}
function activite(srv, id, opts) {
  srv.t.events.push(Object.assign({ id, author_id: ORGA, organizer_id: ORGA, title: "Activité " + id, passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: null, date_at: iso(Date.now() + 2 * 86400000), status: "active", co_organizers: [], visibilite: "publique",
    created_at: iso(Date.now() - 86400000), lat: 45.9, lng: 6.12 }, opts));
}
const ligne = (ev, u, rsvp, h) => ({ event_id: ev, user_id: u, rsvp, created_at: new Date(Date.now() - (h || 1) * 3600000).toISOString() });
const mutuel = (srv, a, b) => { srv.t.follows.push({ follower_id: a, following_id: b, status: "accepted" }, { follower_id: b, following_id: a, status: "accepted" }); };

async function ouvrir(browser, srv) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, B, { nom: "bob_act" });
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  return { ctx, page: o.page, errors: o.errors };
}
// Le VRAI chemin de lecture, puis l'écran Rencontrer ; mes abonnements posés.
async function afficher(page, suivis) {
  await page.evaluate(async (suivis) => {
    state.seed.events = await supaLoadEvents();
    state.userEvents = [];
    state.user.following = suivis;
    saveState();
    goTo("irl"); renderIRL();
  }, suivis);
}
const preuveCarte = (page, id) => page.locator('#eventList .event-card[data-evid="' + id + '"] > .event-social-proof');
const preuveFiche = (page) => page.locator("#eventDetailContent .event-social-proof");

test.describe("Rencontrer — activités : amis qui y vont, redemande bornée", () => {
  test.setTimeout(120000);

  test("① n° 198 — non inscrite, je vois sur la carte ET la fiche l'amie validée qui y va", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_am_1", { title: "Concert au lac" });
    srv.t.event_attendees.push(ligne("evt_am_1", ORGA, "going", 5), ligne("evt_am_1", CHLOE, "going", 3), ligne("evt_am_1", TOM, "going", 2));
    srv.accords.add("evt_am_1|" + CHLOE); srv.accords.add("evt_am_1|" + TOM);
    mutuel(srv, B, CHLOE);
    srv.t.follows.push({ follower_id: B, following_id: TOM, status: "accepted" });   // sens unique : jamais nommé
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await afficher(page, [CHLOE, TOM]);
      const lu = await page.evaluate(() => (allEvents().find((e) => e.id === "evt_am_1") || {}).attendees || []);
      expect(lu, "témoin : la policy de production ne me rend pas les lignes des autres").not.toContain(CHLOE);
      await expect(preuveCarte(page, "evt_am_1"), "la carte nomme l'amie").toContainText("chloe_act y va", { timeout: 15000 });
      await expect(preuveCarte(page, "evt_am_1")).not.toContainText("tom_act");
      await page.evaluate(() => openEventDetails("evt_am_1"));
      await expect(preuveFiche(page), "la fiche aussi").toContainText("chloe_act y va", { timeout: 15000 });
    } finally { await ctx.close(); }
  });

  test("② n° 198 — trois amis : « X et 2 ami·es y vont », trois avatars au plus", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_am_2", { title: "Randonnée" });
    srv.t.event_attendees.push(ligne("evt_am_2", ORGA, "going", 9), ligne("evt_am_2", LEA, "going", 6), ligne("evt_am_2", CHLOE, "going", 5), ligne("evt_am_2", TOM, "going", 4));
    ["evt_am_2|" + LEA, "evt_am_2|" + CHLOE, "evt_am_2|" + TOM].forEach((k) => srv.accords.add(k));
    mutuel(srv, B, LEA); mutuel(srv, B, CHLOE); mutuel(srv, B, TOM);
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await afficher(page, [LEA, CHLOE, TOM]);
      await expect(preuveCarte(page, "evt_am_2")).toContainText("lea_act et 2 ami·es y vont", { timeout: 15000 });
      expect(await preuveCarte(page, "evt_am_2").locator(".avatar").count()).toBeLessThanOrEqual(3);
    } finally { await ctx.close(); }
  });

  test("③ témoin n° 198 — base sans la RPC : aucun bandeau, aucune erreur, un seul essai", async ({ browser }) => {
    const srv = serveur();
    srv.rpcAmis = false;
    activite(srv, "evt_am_3");
    srv.t.event_attendees.push(ligne("evt_am_3", ORGA, "going", 5), ligne("evt_am_3", CHLOE, "going", 3));
    srv.accords.add("evt_am_3|" + CHLOE);
    mutuel(srv, B, CHLOE);
    const { ctx, page, errors } = await ouvrir(browser, srv);
    try {
      await afficher(page, [CHLOE]);
      await page.waitForTimeout(800);
      await page.evaluate(() => { renderIRL(); openEventDetails("evt_am_3"); });
      await page.waitForTimeout(800);
      await expect(preuveCarte(page, "evt_am_3")).toHaveCount(0);
      await expect(preuveFiche(page)).toHaveCount(0);
      expect(srv.journal.filter((j) => j.rpc && j.table === "amis_qui_y_vont").length, "PGRST202 : on n'y revient pas").toBeLessThanOrEqual(1);
      expect(errors.js, "aucune erreur JS").toEqual([]);
    } finally { await ctx.close(); }
  });

  test("④ n° 212 — redemande refusée par la base (épuisée) : le motif est dit, le pied ne la propose plus", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rd_4", { title: "Atelier fermé" });
    srv.t.event_attendees.push(ligne("evt_rd_4", ORGA, "going", 5));
    srv.redemande["evt_rd_4|" + B] = { refus: 2, motif: "redemande_epuisee", possible_le: null };
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await afficher(page, []);
      await page.evaluate(() => openEventDetails("evt_rd_4"));
      const pied = page.locator("#eventDetailCta");
      await expect(pied.locator("[data-v4b-rsvp-go]"), "témoin : une participation retirée ne dit pas encore le refus").toBeVisible({ timeout: 15000 });
      srv.pannes.push({ table: "event_attendees", methode: "POST", status: 400, fois: 1, body: { code: "P0001", message: "redemande_epuisee", details: null, hint: "Une seule redemande après un refus de l'organisation, 24 h après ; aucune après deux." } });
      await page.evaluate(() => { window.__toasts = []; });
      await pied.locator("[data-v4b-rsvp-go]").click();
      await expect.poll(() => page.evaluate(() => window.__toasts.map((x) => x.msg).join(" | ")), { timeout: 15000 }).toContain("tu ne peux plus demander à participer");
      expect(await page.evaluate(() => window.__toasts.map((x) => x.msg).join(" | "))).not.toContain("réessaie");
      expect(await page.evaluate(() => myRsvp("evt_rd_4")), "l'optimiste est annulé").toBeFalsy();
      await expect(pied.locator("[data-v4b-rsvp-redemande-fermee]")).toHaveAttribute("data-v4b-rsvp-redemande-fermee", "redemande_epuisee", { timeout: 15000 });
      await expect(pied.locator("[data-v4b-rsvp-go]")).toHaveCount(0);
      await expect(pied.locator("[data-v4b-rsvp-redemander]")).toHaveCount(0);
    } finally { await ctx.close(); }
  });

  test("⑤ n° 212 — refus de moins de 24 h : le pied dit à partir de quand, sans bouton", async ({ browser }) => {
    const srv = serveur();
    activite(srv, "evt_rd_5", { title: "Atelier refusé" });
    srv.t.event_attendees.push(ligne("evt_rd_5", ORGA, "going", 5));
    srv.refusEnCours.add("evt_rd_5|" + B);
    srv.redemande["evt_rd_5|" + B] = { refus: 1, motif: "redemande_trop_tot", possible_le: new Date(Date.now() + 20 * 3600000).toISOString().replace("Z", "+00:00") };
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await afficher(page, []);
      await page.evaluate(() => openEventDetails("evt_rd_5"));
      const pied = page.locator("#eventDetailCta");
      await expect(pied.locator("[data-v4b-rsvp-refus]")).toHaveText("Demande non acceptée", { timeout: 15000 });
      await expect(pied.locator("[data-v4b-rsvp-redemande-fermee]")).toContainText("Tu pourras redemander une fois à partir du", { timeout: 15000 });
      await expect(pied.locator("[data-v4b-rsvp-redemander]"), "plus de bouton quand ce n'est pas possible").toHaveCount(0);
      await expect(page.locator("[data-refus-demande]")).toContainText("Tu pourras redemander une fois");
    } finally { await ctx.close(); }
  });

  test("⑥ témoin n° 212 — redemande permise, ou base sans la RPC : la porte reste", async ({ browser }) => {
    for (const absente of [false, true]) {
      const srv = serveur();
      srv.rpcEtat = !absente;
      activite(srv, "evt_rd_6", { title: "Atelier" });
      srv.t.event_attendees.push(ligne("evt_rd_6", ORGA, "going", 5));
      srv.refusEnCours.add("evt_rd_6|" + B);
      const { ctx, page } = await ouvrir(browser, srv);
      try {
        await afficher(page, []);
        await page.evaluate(() => openEventDetails("evt_rd_6"));
        const pied = page.locator("#eventDetailCta");
        await expect(pied.locator("[data-v4b-rsvp-refus]"), absente ? "RPC absente" : "permise").toHaveText("Demande non acceptée", { timeout: 15000 });
        await expect(pied.locator("[data-v4b-rsvp-redemander]")).toBeVisible();
        await expect(pied.locator("[data-v4b-rsvp-redemande-fermee]")).toHaveCount(0);
      } finally { await ctx.close(); }
    }
  });
});
