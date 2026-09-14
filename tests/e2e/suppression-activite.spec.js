// IRL-06 — supprimer une activité : le verdict du serveur est lu, les inscrits
// sont prévenus.
//
// LE DÉFAUT (contre-revue Astra, chantier 8). `deleteEventConfirm` (app-07)
// affichait « Événement supprimé » quel que soit le retour de `supaDeleteEvent`
// (qui rendait déjà `false` sur refus ou zéro ligne) : un refus laissait
// l'activité en base, retirée de cet écran seulement ; et personne n'était
// prévenu — les inscrits se déplaçaient pour rien. (Les participations
// orphelines côté base relèvent de la migration
// `migration_evenements_cascade_2026-09-14.sql`, éprouvée par son banc SQL.)
// Ce que cette suite exige : un refus laisse l'activité à l'écran et le dit
// (① RÉINJECTION) ; une suppression acceptée prévient inscrits, « peut-être »
// et liste d'attente, chacun une fois, jamais soi-même (② RÉINJECTION) ; sans
// compte réel, la suppression reste locale et le dit (③).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page, avecCompte) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (avecCompte) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.__notifs = [];
    window.toast = (t) => window.__toasts.push(String(t));
    window.confirm = () => true;
    window.__delete = true;
    window.supaDeleteEvent = async () => window.__delete;
    window.supaInsertNotif = async (to, kind, ref, txt) => { window.__notifs.push(kind + ":" + to + ":" + txt); };
    state.userEvents = [{ id: "ev_moi", title: "Rando du dimanche", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() + 3 * 86400000, time: "10:00", desc: "", organizerId: MY_UID, status: "active",
      attendees: [MY_UID, "u_a", "u_b"], maybes: ["u_c", "u_a"], waitlist: ["u_d"], checkedIn: [] }];
    renderIRL();
  });
}
const existe = (page) => page.evaluate(() => (state.userEvents || []).some((e) => e.id === "ev_moi"));

test.describe("IRL-06 — supprimer une activité", () => {
  test("① refus serveur : l'activité reste, rien n'est annoncé, personne n'est prévenu", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(async () => { window.__delete = false; await deleteEventConfirm("ev_moi"); });
    // RÉINJECTION : sur le code d'avant, l'activité est retirée et « Événement supprimé » affiché.
    expect(await existe(page)).toBe(true);
    const r = await page.evaluate(() => ({ toasts: window.__toasts.slice(), notifs: window.__notifs.slice() }));
    expect(r.toasts.some((t) => /^Événement supprimé/.test(t))).toBe(false);
    expect(r.toasts.some((t) => /non enregistrée/.test(t))).toBe(true);
    expect(r.notifs).toEqual([]);
  });

  test("② suppression acceptée : inscrits, « peut-être » et liste d'attente prévenus une fois, jamais moi", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(async () => { await deleteEventConfirm("ev_moi"); });
    expect(await existe(page)).toBe(false);
    const r = await page.evaluate(() => ({ toasts: window.__toasts.slice(), notifs: window.__notifs.slice() }));
    expect(r.toasts.some((t) => /^Événement supprimé$/.test(t))).toBe(true);
    // RÉINJECTION : sur le code d'avant, aucune notification.
    const destinataires = r.notifs.map((n) => n.split(":")[1]).sort();
    expect(destinataires).toEqual(["u_a", "u_b", "u_c", "u_d"]);
    expect(r.notifs.every((n) => /^event_cancelled:/.test(n) && /Rando du dimanche/.test(n) && /supprimé/.test(n))).toBe(true);
  });

  test("③ sans compte réel : suppression locale, dite comme telle, sans appel serveur", async ({ page }) => {
    await banc(page, false);
    const r = await page.evaluate(async () => {
      window.__appels = 0; window.supaDeleteEvent = async () => { window.__appels++; return false; };
      await deleteEventConfirm("ev_moi");
      return { appels: window.__appels, toasts: window.__toasts.slice(), reste: (state.userEvents || []).some((e) => e.id === "ev_moi") };
    });
    expect(r.appels).toBe(0);
    expect(r.reste).toBe(false);
    expect(r.toasts.some((t) => /sur cet appareil/.test(t))).toBe(true);
  });
});
