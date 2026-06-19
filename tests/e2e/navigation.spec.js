// Missions 1c + 5 — tour complet des écrans : zéro erreur JS, écran actif,
// navigation rapide, bottom-nav cohérente. Entre dans l'app via un état
// local onboardé (helper partagé, CI-safe : pas de compte réel créé).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SCREENS = ["feed", "profiles", "studio", "explore", "irl", "wallet", "messages", "cdv"];
// Barre du bas à 5 onglets (règle des 5) depuis le 2026-06-19 : Messages est
// passé dans le topbar (à côté des notifs) et Explorer dans le ➕ Créer.
const NAV_LABELS = ["Fil", "Bobines", "IRL", "CDV"];

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

  // Libellés attendus présents dans la nav (5 onglets : 4 labels + le ➕ central)
  for (const label of NAV_LABELS) {
    await expect(page.locator(".nav-item", { hasText: label }).first(), `nav « ${label} »`).toBeVisible();
  }
  // Barre du bas = exactement 5 onglets
  expect(await page.locator("#appNav .nav-item").count(), "5 onglets dans la barre").toBe(5);
  // Messages relogé dans le topbar (icône à côté des notifs)
  await page.click(".topbar-right .topbar-bell:first-child");
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-messages");
    return el && el.classList.contains("active");
  }, null, { timeout: 5000 });
  // Explorer relogé dans le ➕ Créer (bouton en tête du studio)
  await page.evaluate(() => goTo("studio"));
  await expect(page.locator(".studio-explore-btn"), "bouton Explorer dans le studio").toBeVisible();
  await page.click(".studio-explore-btn");
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-explore");
    return el && el.classList.contains("active");
  }, null, { timeout: 5000 });

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
