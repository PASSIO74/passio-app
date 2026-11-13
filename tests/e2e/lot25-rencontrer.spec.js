// ═══════════════════════════════════════════════════════════════════════════
// LOT-25 (audit UX/UI du 2026-11-10) — RENCONTRER (SUITE)
//   ① IRL-C14 : les vraies activités passent avant les exemples, l'ordre
//      choisi tenant dans chaque groupe.
//   ② IRL-C03 / C04 : sans référence (ni ville, ni position — et un refus
//      n'en est pas une), une ligne propose de choisir sa ville ; le repli
//      Paris n'est jamais présenté comme « Position actuelle ».
//   ③ IRL-C05 : des choix sans résultat le disent dans le pied, avec
//      « Tout effacer ».
//   ④ IRL-C13 / C62 : « activité » dans les titres de création et de gestion.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

function activite(id, joursPlusTard, extra) {
  return Object.assign({ id, title: "Act " + id, passion: "musique", emoji: "🎸", city: "Lyon", lat: 45.76, lng: 4.83,
    date: Date.now() + joursPlusTard * 864e5, time: "18:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [],
    organizerId: "org_autre", status: "active" }, extra || {});
}

test("① IRL-C14 : réel d'abord, exemples ensuite, ordre gardé dans chaque groupe", async ({ page }) => {
  await bootOnboarded(page);
  const ids = await page.evaluate((evs) => {
    state.seed.events = evs;
    state.userEvents = [];
    irlShowPast = false; irlSort = "soon";
    return _filterIrlEvents(allEvents()).map((e) => e.id);
  }, [activite("e1", 1), activite("ev_reel_b", 3), activite("e2", 2), activite("ev_reel_a", 4)]);
  expect(ids).toEqual(["ev_reel_b", "ev_reel_a", "e1", "e2"]);
});

test("② IRL-C03 / C04 : sans référence, la porte « Choisis ta ville » ; un refus n'est pas une position", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    irlSelectedCity = null; irlUserLocation = null; irlUserLocationError = false;
    state.seed.events = [];
    renderIRL();
    const sans = !!document.getElementById("irlVilleInvite");
    irlUserLocation = { lat: 48.8566, lng: 2.3522 }; irlUserLocationError = true;
    renderIRL();
    const apresRefus = { invite: !!document.getElementById("irlVilleInvite"), lieu: irlLieuReference() };
    irlSelectedCity = { name: "Lyon", coords: [45.76, 4.83] };
    renderIRL();
    const avecVille = !!document.getElementById("irlVilleInvite");
    irlSelectedCity = null; irlUserLocation = null; irlUserLocationError = false;
    return { sans, apresRefus, avecVille };
  });
  expect(r.sans).toBe(true);
  expect(r.apresRefus.invite, "le repli Paris n'est pas une référence").toBe(true);
  expect(r.apresRefus.lieu.sub).not.toBe("Position actuelle");
  expect(r.avecVille).toBe(false);
});

test("③ IRL-C05 : choix sans résultat — le pied le dit et porte « Tout effacer »", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(async (evs) => {
    state.seed.events = evs; state.userEvents = [];
    goTo("irl");
    irlPassionFilters.clear(); irlPassionFilters.add("passion_sans_activite_l25");
    PassioUIV4A5.open();
    renderIRL();
    await new Promise((res) => setTimeout(res, 300));
  }, [activite("ev_l25_a", 1)]);
  const pied = page.locator("[data-v4a5-vide]");
  await expect(pied).toContainText("Aucune activité ne coche tous ces choix");
  await pied.getByRole("button", { name: "Tout effacer" }).click();
  await expect(page.locator("[data-v4a5-vide]")).toHaveCount(0);
  expect(await page.evaluate(() => irlPassionFilters.size)).toBe(0);
});
test("④ IRL-C13 / C62 : « activité » dans les titres", async ({ page }) => {
  await bootOnboarded(page);
  const src = await page.evaluate(() => openCreateEvent.toString() + openEventManage.toString() + toggleCancelEvent.toString());
  expect(src).not.toContain("Créer un événement IRL");
  expect(src).not.toContain("Gérer l'événement");
  expect(src).toContain("Gérer l'activité");
});
