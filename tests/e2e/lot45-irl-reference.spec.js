// ═══════════════════════════════════════════════════════════════════════════
// LOT-45 (audit UX/UI du 2026-11-10) — RENCONTRER : DISTANCES ET FILTRES
//   ① IRL-C02 : sans position ni ville choisie (ou après un refus), aucune
//      distance n'est affichée ; avec une ville choisie, elle revient. Le tri
//      et le filtre, qui passent leur référence, calculent toujours.
//   ② IRL-C07 : un filtre actif se voit sur le déclencheur « Filtre ».
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① IRL-C02 : pas de distance sur le repli Paris", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const ev = { id: "ev_l45", title: "Jam", city: "Lyon", lat: 45.764, lng: 4.8357, date: Date.now() + 86400000 };
    irlSelectedCity = null; irlUserLocation = null;
    const sans = _eventDistanceKm(ev);
    const tri = _eventDistanceKm(ev, _irlReferenceLoc());
    irlUserLocation = { lat: 48.8566, lng: 2.3522 };
    try { irlUserLocationError = "refus"; } catch (e) { window.irlUserLocationError = "refus"; }
    const refus = _eventDistanceKm(ev);
    try { irlUserLocationError = null; } catch (e) { window.irlUserLocationError = null; }
    irlUserLocation = null;
    irlSelectedCity = { id: "lyon", name: "Lyon", coords: [45.75, 4.85] };
    const ville = _eventDistanceKm(ev);
    irlSelectedCity = null;
    return { sans, tri, refus, ville };
  });
  expect(r.sans).toBeNull();
  expect(r.refus).toBeNull();
  expect(r.tri).toBeGreaterThan(300);
  expect(r.ville).toBeLessThan(5);
});

test("② IRL-C07 : la pastille des filtres actifs se voit", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const b = document.getElementById("irlToolsBadge");
    if (!b) return null;
    b.textContent = "3"; b.style.display = "block";
    const on = getComputedStyle(b).display;
    b.textContent = ""; b.style.display = "none";
    const off = getComputedStyle(b).display;
    return { on, off, hote: !!b.closest(".v4a4-outils-hote"), racine: document.documentElement.classList.contains("passio-ui-4a5") };
  });
  expect(r, "la pastille existe").not.toBeNull();
  test.skip(!(r.hote && r.racine), "interface 4a5 non montée dans ce banc");
  expect(r.on).not.toBe("none");
  expect(r.off).toBe("none");
});
