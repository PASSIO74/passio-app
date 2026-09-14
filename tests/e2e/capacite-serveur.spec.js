// IRL-05 — la capacité est tenue par le serveur, et le client dit sa raison.
//
// LE DÉFAUT (contre-revue Astra, chantier 8) : `event_attendees` n'avait ni
// borne de capacité, ni garde de statut, ni CHECK sur `rsvp` — deux
// inscriptions concurrentes passaient au-delà de `max_attendees`. La base le
// tient désormais (`migration_capacite_activite_2026-09-14.sql`, éprouvée par
// son banc SQL : complet / annulée / passée refusés, deux sessions
// sérialisées). Ce que cette suite exige côté CLIENT : un refus motivé par le
// serveur est rendu avec sa raison et la sortie (① ② RÉINJECTION : le code
// d'avant annulait bien l'optimiste — ROB-02 — mais disait « non enregistrée »
// pour tout) ; un refus sans motif garde le message générique (③).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
    window.supaEnsureProfileExists = async () => true;
    ["supaJoinEvent", "supaLoadMyRsvps", "supaCreateEventConversation", "supaJoinEventConversation", "supaInsertNotif", "supaFirstWaitlisted"].forEach((fn) => { window[fn] = async () => null; });
    window.requireAdmission = async () => true;
    window.__refus = null; // message d'erreur que le serveur rend à l'UPDATE et à l'INSERT
    Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: () => {
      const rep = () => Promise.resolve(window.__refus ? { data: null, error: { code: "P0001", message: window.__refus } } : { data: [{ event_id: "ev1" }], error: null });
      const b = { eq: () => b, select: () => rep(), then: (a, c) => rep().then(a, c) };
      return { update: () => b, insert: () => b, delete: () => b, select: () => b };
    } });
    state.seed.events = [{ id: "ev1", title: "Rando", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() + 3 * 86400000, time: "10:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [],
      organizerId: "someone_else", status: "active", fromSupabase: true, maxAttendees: 2 }];
    state.user.eventRsvp = {}; state.user.joinedEvents = [];
    renderIRL();
  });
}
const essai = (page, refus) => page.evaluate(async (refus) => {
  window.__refus = refus; window.__toasts = [];
  await setEventRsvp("ev1", "going");
  return { rsvp: myRsvp("ev1") || null, toasts: window.__toasts.slice(), motif: window._irlRefusMotif || null };
}, refus);

test.describe("IRL-05 — le refus du serveur est rendu avec sa raison", () => {
  test("① activité complète : l'optimiste est annulé et la liste d'attente est nommée", async ({ page }) => {
    await banc(page);
    const r = await essai(page, "activite_complete");
    expect(r.rsvp).toBeNull();
    // RÉINJECTION : sur le code d'avant, le toast dit « non enregistrée — réessaie ».
    expect(r.toasts.some((t) => /Activité complète/.test(t) && /liste d'attente/.test(t))).toBe(true);
    expect(r.toasts.some((t) => /non enregistrée/.test(t))).toBe(false);
  });

  test("② activité annulée / passée : dites comme telles", async ({ page }) => {
    await banc(page);
    const a = await essai(page, "activite_annulee");
    expect(a.rsvp).toBeNull();
    expect(a.toasts.some((t) => /a été annulée/.test(t))).toBe(true);
    const p = await essai(page, "activite_passee");
    expect(p.toasts.some((t) => /déjà passée/.test(t))).toBe(true);
  });

  test("③ refus sans motif serveur : message générique, optimiste annulé ; succès : inscrit", async ({ page }) => {
    await banc(page);
    const r = await essai(page, "permission denied for table event_attendees");
    expect(r.rsvp).toBeNull();
    expect(r.motif).toBeNull();
    expect(r.toasts.some((t) => /non enregistrée/.test(t))).toBe(true);
    const ok = await essai(page, null);
    expect(ok.rsvp).toBe("going");
  });
});
