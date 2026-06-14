// Missions 1c + 5 — tour complet des écrans : zéro erreur JS, écran actif,
// navigation rapide, bottom-nav cohérente. Entre dans l'app via un état
// local onboardé (helper partagé, CI-safe : pas de compte réel créé).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SCREENS = ["feed", "profiles", "studio", "explore", "irl", "wallet", "messages", "cdv"];
const NAV_LABELS = ["Fil", "Bobines", "Explorer", "Messages", "IRL", "CDV"];

test("tour des 8 écrans : zéro erreur JS, chaque écran devient actif", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  const timings = {};
  for (const s of SCREENS) {
    const t0 = Date.now();
    await page.evaluate((scr) => goTo(scr), s);
    await page.waitForFunction((scr) => {
      const el = document.getElementById("screen-" + scr);
      return el && el.classList.contains("active");
    }, s, { timeout: 5000 });
    timings[s] = Date.now() - t0;
    await page.waitForTimeout(350); // laisse les rendus async (cartes, listes) s'exécuter
  }
  console.log("Timings navigation (ms):", JSON.stringify(timings));
  if (errors.network.length) console.log("(info) erreurs réseau ignorées:", errors.network.length);

  expect(errors.js, "exceptions JS pendant le tour").toEqual([]);
  expect(errors.console, "console.error applicatifs pendant le tour").toEqual([]);
  for (const s of SCREENS) {
    expect(timings[s], `navigation vers ${s} < 1500 ms`).toBeLessThan(1500);
  }
});

test("bottom-nav : libellés, clics réels et écran attendu", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  // Libellés attendus présents dans la nav
  for (const label of NAV_LABELS) {
    await expect(page.locator(".nav-item", { hasText: label }).first(), `nav « ${label} »`).toBeVisible();
  }

  // Clic réel sur chaque item de la nav.
  // Cas particulier : « Bobines » (data-screen=bobines) ouvre l'overlay #reelsViewer
  // via openReels(), ce n'est pas un #screen-<nom> (comportement voulu de l'app).
  const items = await page.$$eval(".nav-item[data-screen]", els => els.map(e => e.getAttribute("data-screen")));
  for (const s of items) {
    await page.click(`.nav-item[data-screen="${s}"]`);
    if (s === "bobines") {
      await page.waitForFunction(() => {
        const v = document.getElementById("reelsViewer");
        return v && v.classList.contains("open");
      }, null, { timeout: 5000 });
      await page.evaluate(() => { if (typeof closeReels === "function") closeReels(); });
    } else {
      await page.waitForFunction((scr) => {
        const el = document.getElementById("screen-" + scr);
        return el && el.classList.contains("active");
      }, s, { timeout: 5000 });
    }
  }
  expect(errors.js, "exceptions JS pendant les clics nav").toEqual([]);
});
