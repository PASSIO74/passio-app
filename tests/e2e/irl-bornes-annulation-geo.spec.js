// IRL-11 / IRL-13 / ROB-05 — bornes revalidées, annulation qui prévient tout le
// monde et attend le serveur, géolocalisation refusée qui se dit.
//
// LES DÉFAUTS (contre-revue Astra, chantier 8) :
//   IRL-11 — prix -5 et capacité -3 acceptés par `submitEvent` (le `min` du
//            champ n'est pas une garde) : « Gratuit » affiché, activité
//            « complète » dès sa création ; l'édition acceptait une date passée ;
//   IRL-13 — `toggleCancelEvent` ne prévenait que `attendees` : « peut-être »
//            et liste d'attente apprenaient l'annulation sur place ; et
//            l'annulation était affichée AVANT le verdict serveur ;
//   ROB-05 — géolocalisation refusée : repli silencieux sur Paris, titré
//            « Paris » comme si c'était la position de la personne.
// ① ② ③ ⑤ ⑥ RÉINJECTION (rouges sur le code d'avant) ; ④ garde le nominal.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.__notifs = [];
    window.toast = (t) => window.__toasts.push(String(t));
    window.confirm = () => true;
    window.supaInsertNotif = async (to, kind, ref, txt) => { window.__notifs.push(kind + ":" + to); };
    window.__cancel = true; window.supaCancelEvent = async () => window.__cancel;
    window.supaPublishEvent = async () => true; window.supaUpdateEvent = async () => true; window.supaJoinEvent = async () => true;
    window.requireAdmission = async () => true;
    state.userEvents = [{ id: "ev_moi", title: "Rando du dimanche", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() + 3 * 86400000, time: "10:00", desc: "", organizerId: MY_UID, status: "active",
      attendees: [MY_UID, "u_a"], maybes: ["u_b", "u_a"], waitlist: ["u_c"], checkedIn: [] }];
    renderIRL();
  });
}
const champs = (page, v) => page.evaluate((v) => {
  openCreateEvent(v.editId || undefined);
  const g = (id) => document.getElementById(id);
  g("evTitle").value = v.title || "Sortie test"; g("evCity").value = "Paris"; g("evDate").value = v.date; g("evTime").value = "10:00";
  if (v.price !== undefined) g("evPrice").value = String(v.price);
  if (v.max !== undefined) g("evMax").value = String(v.max);
  window.__toasts = [];
}, v);
const jourPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test.describe("IRL-11 — bornes revalidées au point d'écriture", () => {
  test("① prix négatif refusé, capacité négative refusée, rien n'est créé", async ({ page }) => {
    await banc(page);
    await champs(page, { date: jourPlus(3), price: -5 });
    const r1 = await page.evaluate(async () => { const n = state.userEvents.length; await submitEvent(); return { cree: state.userEvents.length - n, toasts: window.__toasts.slice() }; });
    // RÉINJECTION : sur le code d'avant, l'activité est créée avec price -5.
    expect(r1.cree).toBe(0);
    expect(r1.toasts.some((t) => /prix/i.test(t))).toBe(true);
    await champs(page, { date: jourPlus(3), price: 0, max: -3 });
    const r2 = await page.evaluate(async () => { const n = state.userEvents.length; await submitEvent(); return { cree: state.userEvents.length - n, toasts: window.__toasts.slice() }; });
    expect(r2.cree).toBe(0);
    expect(r2.toasts.some((t) => /places/i.test(t))).toBe(true);
  });

  test("② l'édition ne déplace pas une activité dans le passé", async ({ page }) => {
    await banc(page);
    await champs(page, { editId: "ev_moi", date: jourPlus(-10), title: "Rando du dimanche" });
    const r = await page.evaluate(async () => { await submitEvent("ev_moi"); const ev = _findCanonicalEvent("ev_moi"); return { date: ev.date, toasts: window.__toasts.slice() }; });
    // RÉINJECTION : sur le code d'avant, la date passée est enregistrée.
    expect(r.date).toBeGreaterThan(Date.now());
    expect(r.toasts.some((t) => /déjà passée/.test(t))).toBe(true);
  });

  test("④ nominal : une activité valide se crée, une activité passée se retouche sans changer sa date", async ({ page }) => {
    await banc(page);
    await champs(page, { date: jourPlus(5), price: 12.5, max: 8 });
    const r = await page.evaluate(async () => { const n = state.userEvents.length; await submitEvent(); const ev = state.userEvents[0]; return { cree: state.userEvents.length - n, price: ev.price, max: ev.maxAttendees }; });
    expect(r.cree).toBe(1); expect(r.price).toBe(12.5); expect(r.max).toBe(8);
    // Activité déjà passée : on corrige le titre, même date → accepté.
    const r2 = await page.evaluate(async () => {
      const ev = _findCanonicalEvent("ev_moi"); ev.date = Date.now() - 5 * 86400000; ev.time = "10:00"; saveState();
      openCreateEvent("ev_moi");
      document.getElementById("evTitle").value = "Rando corrigée"; window.__toasts = [];
      await submitEvent("ev_moi");
      return { titre: _findCanonicalEvent("ev_moi").title, toasts: window.__toasts.slice() };
    });
    expect(r2.titre).toBe("Rando corrigée");
    expect(r2.toasts.some((t) => /déjà passée/.test(t))).toBe(false);
  });
});

test.describe("IRL-13 — annuler prévient les trois listes, après le verdict", () => {
  test("③ inscrits, « peut-être » et liste d'attente prévenus une fois, jamais moi", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => { await toggleCancelEvent("ev_moi"); return { statut: _findCanonicalEvent("ev_moi").status, notifs: window.__notifs.slice() }; });
    expect(r.statut).toBe("cancelled");
    // RÉINJECTION : sur le code d'avant, seul u_a (attendees) est prévenu.
    expect(r.notifs.map((n) => n.split(":")[1]).sort()).toEqual(["u_a", "u_b", "u_c"]);
    expect(r.notifs.every((n) => /^event_cancelled:/.test(n))).toBe(true);
  });

  test("⑤ refus serveur : l'activité reste active, personne n'est prévenu, l'échec est dit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => { window.__cancel = false; await toggleCancelEvent("ev_moi"); return { statut: _findCanonicalEvent("ev_moi").status, notifs: window.__notifs.slice(), toasts: window.__toasts.slice() }; });
    // RÉINJECTION : sur le code d'avant, status = "cancelled" malgré le refus.
    expect(r.statut).toBe("active");
    expect(r.notifs).toEqual([]);
    expect(r.toasts.some((t) => /non enregistré/.test(t))).toBe(true);
    expect(r.toasts.some((t) => /^Événement annulé/.test(t))).toBe(false);
  });
});

test.describe("ROB-05 — la géolocalisation refusée se dit", () => {
  test("⑥ refus : « Paris (par défaut) », toast une seule fois, et la ville reste choisissable", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      irlUserLocation = null; irlUserLocationError = false; irlSelectedCity = null; window._geoRefusDit = false; window.__toasts = [];
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok, ko) => ko({ code: 1, message: "User denied Geolocation" }) } });
      requestUserLocation();
      await new Promise((res) => setTimeout(res, 100));
      const t1 = window.__toasts.slice();
      irlUserLocation = null; requestUserLocation(); await new Promise((res) => setTimeout(res, 100));
      return { titre: document.getElementById("irlUserCityName").textContent, label: _irlReferenceLabel(), t1, t2: window.__toasts.length, erreur: irlUserLocationError };
    });
    // RÉINJECTION : sur le code d'avant, le titre dit « Paris » et aucun toast ne part.
    expect(r.erreur).toBe(true);
    expect(r.titre).toBe("Paris (par défaut)");
    expect(r.label).toBe("Paris (par défaut)");
    expect(r.t1.filter((t) => /Localisation indisponible/.test(t)).length).toBe(1);
    expect(r.t2).toBe(1);
    // La sortie existe : choisir une ville remplace le repli.
    expect(await page.evaluate(() => { irlSelectedCity = { name: "Lyon", lat: 45.76, lng: 4.83 }; updateIrlCityTitle(); return _irlReferenceLabel(); })).toBe("Lyon");
  });
});
