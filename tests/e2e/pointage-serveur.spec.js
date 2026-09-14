// IRL-12 — le pointage a une valeur : code secret servi par le serveur, verdict
// serveur pour le code, pas de pointage sans preuve.
//
// LE DÉFAUT (contre-revue Astra, chantier 8) : code d'accueil = hachage de
// l'id PUBLIC (calculable par quiconque), aucune fenêtre serveur, pointage
// possible sans inscription (rsvp forcé à going), et sans GPS le client
// pointait quand même. La base tient désormais le secret, la fenêtre et
// l'inscription (`migration_pointage_serveur_2026-09-14.sql`, banc SQL). Côté
// client, cette suite exige : ① l'organisateur affiche le secret SERVEUR, pas
// le code dérivé (RÉINJECTION) ; ② le code saisi est tranché par le serveur —
// verdicts rendus avec leurs mots, « ok » marque le pointage (RÉINJECTION) ;
// ③ sans position GPS, on ne pointe pas : le code est proposé (RÉINJECTION) ;
// ④ chemin GPS : un refus serveur annule le pointage local (RÉINJECTION) ;
// ⑤ activité de démonstration : le code dérivé reste le chemin local.
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
    window.__secret = "K7PQ2M"; window.__verdict = "ok"; window.__rpc = [];
    window.supaEventCheckinSecret = async () => window.__secret;
    window.supaPointerParCode = async (id, code) => { window.__rpc.push(code); return window.__verdict; };
    window.__checkin = true; window.supaCheckInEvent = async () => window.__checkin;
    window._announceNewBadges = () => {};
    state.seed.events = [{ id: "ev_r", title: "Rando réelle", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() - 10 * 60000, time: "10:00", desc: "", attendees: [MY_UID], maybes: [], waitlist: [], checkedIn: [],
      organizerId: MY_UID, status: "active", fromSupabase: true },
    { id: "ev_demo", title: "Démo", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() - 10 * 60000, time: "10:00", desc: "", attendees: [MY_UID], maybes: [], waitlist: [], checkedIn: [],
      organizerId: "u_orga", status: "active", fromSupabase: false }];
    state.user.checkedInEvents = []; state.user.eventRsvp = { ev_r: "going", ev_demo: "going" };
    renderIRL();
  });
}
const pointe = (page, id) => page.evaluate((id) => (state.user.checkedInEvents || []).includes(id), id);

test.describe("IRL-12 — pointage tenu par le serveur", () => {
  test("① l'organisateur affiche le secret serveur, jamais le code dérivé", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      openEventCheckinQr("ev_r");
      await new Promise((res) => setTimeout(res, 150));
      const ev = _findCanonicalEvent("ev_r") || allEvents().find((e) => e.id === "ev_r");
      return { affiche: (document.querySelector(".checkin-code") || {}).textContent, derive: _eventCheckinCode(ev), lien: _eventCheckinUrl(ev, window._checkinCodeAffiche) };
    });
    // RÉINJECTION : sur le code d'avant, le code affiché est le code dérivé de l'id public.
    expect(r.affiche).toBe("K7PQ2M");
    expect(r.affiche).not.toBe(r.derive);
    expect(r.lien).toMatch(/#irl-checkin-ev_r-K7PQ2M$/);
  });

  test("② le code saisi est tranché par le serveur : refus dits, « ok » pointe", async ({ page }) => {
    await banc(page);
    const essai = (verdict, code) => page.evaluate(async ([verdict, code]) => {
      window.__verdict = verdict; window.__toasts = [];
      openCheckinCodeEntry("ev_r");
      document.getElementById("checkinCodeInput").value = code;
      await submitCheckinCode("ev_r"); await new Promise((res) => setTimeout(res, 50));
      return { rpc: window.__rpc.slice(-1)[0], toasts: window.__toasts.slice() };
    }, [verdict, code]);
    // RÉINJECTION : sur le code d'avant, le code est comparé LOCALEMENT au code dérivé — la RPC n'est jamais appelée.
    let r = await essai("code_incorrect", "ZZZZZZ");
    expect(r.rpc).toBe("ZZZZZZ");
    expect(r.toasts.some((t) => /Code incorrect/.test(t))).toBe(true);
    expect(await pointe(page, "ev_r")).toBe(false);
    r = await essai("non_inscrit", "K7PQ2M");
    expect(r.toasts.some((t) => /Inscris-toi/.test(t))).toBe(true);
    r = await essai("hors_fenetre", "K7PQ2M");
    expect(r.toasts.some((t) => /1 h avant/.test(t))).toBe(true);
    r = await essai("ok", "K7PQ2M");
    expect(r.toasts.some((t) => /Arrivée confirmée/.test(t))).toBe(true);
    expect(await pointe(page, "ev_r")).toBe(true);
  });

  test("③ sans position GPS, on ne pointe pas : le code d'accueil est proposé", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok, ko) => ko({ code: 1, message: "denied" }) } });
      window.__toasts = [];
      checkInEvent("ev_r"); await new Promise((res) => setTimeout(res, 100));
      return { toasts: window.__toasts.slice(), saisie: !!document.getElementById("checkinCodeInput") };
    });
    // RÉINJECTION : sur le code d'avant, GPS refusé → pointé quand même (« on fait confiance »).
    expect(await pointe(page, "ev_r")).toBe(false);
    expect(r.toasts.some((t) => /Position indisponible/.test(t))).toBe(true);
    expect(r.saisie).toBe(true);
  });

  test("④ chemin GPS : un refus serveur (hors fenêtre) annule le pointage local", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 48.85, longitude: 2.35 } }) } });
      window.__checkin = false; window._irlRefusMotif = null; window.__toasts = [];
      window.supaCheckInEvent = async () => { window._irlRefusMotif = "hors_fenetre"; return false; };
      checkInEvent("ev_r"); await new Promise((res) => setTimeout(res, 150));
      return { toasts: window.__toasts.slice() };
    });
    // RÉINJECTION : sur le code d'avant, le verdict de supaCheckInEvent n'est pas lu → pointé localement.
    expect(await pointe(page, "ev_r")).toBe(false);
    expect(r.toasts.some((t) => /1 h avant/.test(t))).toBe(true);
    expect(r.toasts.some((t) => /Arrivée confirmée/.test(t))).toBe(false);
  });

  test("⑤ activité de démonstration : code dérivé, chemin local, rien au serveur", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const ev = allEvents().find((e) => e.id === "ev_demo");
      window.__rpc = []; window.__toasts = [];
      openCheckinCodeEntry("ev_demo");
      document.getElementById("checkinCodeInput").value = _eventCheckinCode(ev);
      await submitCheckinCode("ev_demo"); await new Promise((res) => setTimeout(res, 50));
      return { rpc: window.__rpc.length, toasts: window.__toasts.slice() };
    });
    expect(r.rpc).toBe(0);
    expect(await pointe(page, "ev_demo")).toBe(true);
    expect(r.toasts.some((t) => /Arrivée confirmée/.test(t))).toBe(true);
  });
});
