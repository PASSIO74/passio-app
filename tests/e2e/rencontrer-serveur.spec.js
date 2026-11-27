// Rencontrer — la part CLIENT des fermetures côté serveur (2026-11-27,
// `migrations/migration_rencontrer_serveur_2026-11-27.sql`).
// Faux serveur PostgREST multi-comptes, vrai SDK, vrais handlers. AUCUNE
// écriture réelle.
//
// La base refuse désormais deux écritures directes qu'elle acceptait :
//   · POINTER (`checked_in_at`) sans participation VALIDÉE — `pointage_non_valide`
//     (simulation C4 du village : une ligne « je ne peux pas » se pointait) ;
//   · NOTER (`rating`, `feedback`) avant la fin ou sans y avoir participé —
//     `note_avant_fin`, `note_sans_participation` (simulation A6).
// Le client d'avant tombait sur « réessaie » : un nouvel essai ne change rien
// à ces refus, et la personne ne savait ni pourquoi ni quoi faire.
//   ①  pointage refusé pour participation non validée : le motif, et rien de pointé
//   ②  note refusée avant la fin : le motif, et la note n'est pas gardée
//   ③  note refusée sans participation : le motif, et la note n'est pas gardée
//   ④  témoin : un refus SANS motif connu garde le message « réessaie »
// Contre-épreuve : ①②③ ROUGES sur le code d'avant (8091), ④ vert des deux côtés.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000051";
const B = "bbbbbbbb-0000-4000-8000-000000000052";
const iso = (ms) => new Date(ms).toISOString().replace("Z", "");

function activite(srv, id, opts) {
  srv.t.events.push(Object.assign({ id, author_id: ORGA, organizer_id: ORGA, title: "Activité " + id, passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: null, date_at: iso(Date.now() + 2 * 86400000), status: "active", co_organizers: [], visibilite: "publique",
    created_at: iso(Date.now() - 86400000), lat: 45.9, lng: 6.12 }, opts));
}
const ligne = (ev, u, rsvp, extra) => Object.assign({ event_id: ev, user_id: u, rsvp, created_at: new Date(Date.now() - 3600000).toISOString() }, extra || {});
const refus = (message) => ({ table: "event_attendees", methode: "PATCH", status: 400, fois: 1, body: { code: "P0001", message, details: null, hint: null } });

async function ouvrir(browser, srv) {
  const ctx = await browser.newContext();
  const o = await ouvrirCompte(ctx, srv, B, { nom: "bob_srv" });
  await o.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 30000 });
  return { ctx, page: o.page };
}
// Le VRAI chemin de lecture, puis les activités du serveur seules en mémoire.
async function charger(page, rsvps) {
  await page.evaluate(async (rsvps) => {
    const evs = await supaLoadEvents();
    state.seed.events = evs;
    state.userEvents = [];
    Object.entries(rsvps || {}).forEach(([id, r]) => _setMyRsvpLocal(id, r));
    saveState();
  }, rsvps || {});
}
async function noter(page, id) {
  return page.evaluate(async (id) => {
    window.__toasts = [];
    window._ratingDraft = 4;
    await submitEventFeedback(id);
    return { toasts: window.__toasts.map((x) => x.msg), gardee: !!((state.user.eventRatings || {})[id]) };
  }, id);
}

test.describe("Rencontrer — refus du serveur sur le pointage et la note", () => {
  test.setTimeout(120000);

  test("① pointer en direct sans participation validée : le motif est dit, rien n'est pointé", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_srv"); srv.compte(B, "bob_srv");
    activite(srv, "evt_srv_1", { title: "Tout à l'heure", date_at: iso(Date.now() + 20 * 60000) });
    srv.t.event_attendees.push(ligne("evt_srv_1", ORGA, "going"), ligne("evt_srv_1", B, "going"));
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await charger(page, { evt_srv_1: "going" });
      srv.pannes.push(refus("pointage_non_valide"));
      const j0 = srv.journal.length;
      const r = await page.evaluate(async () => {
        window.__toasts = [];
        window.navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 45.9, longitude: 6.12, accuracy: 10 } });
        checkInEvent("evt_srv_1");
        for (let i = 0; i < 40 && !window.__toasts.some((x) => x.type === "warning" || x.type === "success"); i++) await new Promise((res) => setTimeout(res, 50));
        return { toasts: window.__toasts.map((x) => x.msg), pointe: (state.user.checkedInEvents || []).includes("evt_srv_1") };
      });
      expect(srv.journal.slice(j0).some((x) => x.table === "event_attendees" && x.m === "PATCH"), "l'écriture est bien partie").toBe(true);
      expect(r.pointe, "rien n'est marqué pointé").toBe(false);
      expect(r.toasts.join(" | ")).toContain("réservé aux participations validées");
      expect(r.toasts.join(" | ")).not.toContain("Arrivée confirmée");
    } finally { await ctx.close(); }
  });

  test("② noter une activité pas encore terminée : le motif est dit, la note n'est pas gardée", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_srv"); srv.compte(B, "bob_srv");
    activite(srv, "evt_srv_2", { title: "Finie ?", date_at: iso(Date.now() - 5 * 3600000), end_at: iso(Date.now() - 2 * 3600000) });
    srv.t.event_attendees.push(ligne("evt_srv_2", ORGA, "going"), ligne("evt_srv_2", B, "going"));
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await charger(page, { evt_srv_2: "going" });
      srv.pannes.push(refus("note_avant_fin"));
      const r = await noter(page, "evt_srv_2");
      expect(r.gardee, "une note refusée n'est pas gardée comme prise").toBe(false);
      expect(r.toasts.join(" | ")).toContain("une fois qu'elle sera terminée");
      expect(r.toasts.join(" | ")).not.toContain("Merci pour ton retour");
    } finally { await ctx.close(); }
  });

  test("③ noter sans y avoir participé : le motif est dit, la note n'est pas gardée", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_srv"); srv.compte(B, "bob_srv");
    activite(srv, "evt_srv_3", { title: "Passée", date_at: iso(Date.now() - 5 * 3600000), end_at: iso(Date.now() - 2 * 3600000) });
    srv.t.event_attendees.push(ligne("evt_srv_3", ORGA, "going"), ligne("evt_srv_3", B, "going"));
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await charger(page, { evt_srv_3: "going" });
      srv.pannes.push(refus("note_sans_participation"));
      const r = await noter(page, "evt_srv_3");
      expect(r.gardee).toBe(false);
      expect(r.toasts.join(" | ")).toContain("Seules les personnes venues");
    } finally { await ctx.close(); }
  });

  test("④ témoin : un refus sans motif connu garde « réessaie » (et ne reprend pas le motif d'avant)", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(ORGA, "orga_srv"); srv.compte(B, "bob_srv");
    activite(srv, "evt_srv_4", { title: "Passée aussi", date_at: iso(Date.now() - 5 * 3600000), end_at: iso(Date.now() - 2 * 3600000) });
    srv.t.event_attendees.push(ligne("evt_srv_4", ORGA, "going"), ligne("evt_srv_4", B, "going"));
    const { ctx, page } = await ouvrir(browser, srv);
    try {
      await charger(page, { evt_srv_4: "going" });
      srv.pannes.push(refus("note_avant_fin"));
      await noter(page, "evt_srv_4");
      srv.pannes.push({ table: "event_attendees", methode: "PATCH", status: 500, fois: 1, body: { code: "XX000", message: "panne", details: null, hint: null } });
      const r = await noter(page, "evt_srv_4");
      expect(r.gardee).toBe(false);
      expect(r.toasts.join(" | ")).toContain("Retour non enregistré");
      expect(r.toasts.join(" | ")).not.toContain("terminée");
    } finally { await ctx.close(); }
  });
});
