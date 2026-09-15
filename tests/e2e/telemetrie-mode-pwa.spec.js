// DEV-05 (2026-09-15) — la télémétrie dit si l'application tourne INSTALLÉE
// (standalone) ou dans le navigateur, et `window.PassioPlatform` existe.
//
// L'audit cherchait `window.PassioPlatform` (absent) et notait que le champ
// `platform` ne pouvait pas distinguer une PWA — il ne le pouvait pas parce que
// personne ne mesurait le MODE. `meta.mode` (`pwa` | `web`) est calculé par
// telemetry.js lui-même, sans dépendre de platform.js ni du cache du service
// worker. ① navigateur → `web` sur chaque événement envoyé (RÉINJECTION : sur le
// code d'avant, `meta.mode` est absent) ; ② standalone simulé → `pwa` ;
// ③ `PassioPlatform` est là, figé, avec ses clés.
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");

async function envoisTelemetrie(page, standalone) {
  const lignes = [];
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.url().includes("/rest/v1/telemetry_events")) return;
    try { lignes.push(...JSON.parse(req.postData() || "[]")); } catch (e) {}
  });
  await poserGateSansPremiereVisite(page);
  if (standalone) {
    await page.addInitScript(() => {
      const vrai = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : vrai(q));
    });
  }
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  await page.waitForTimeout(8000);   // premier flush de la file
  return lignes;
}

test("① navigateur : chaque événement envoyé porte meta.mode = web", async ({ page }) => {
  const lignes = await envoisTelemetrie(page, false);
  expect(lignes.length, "au moins un événement est parti").toBeGreaterThan(0);
  for (const l of lignes) expect(l.meta && l.meta.mode, l.type + "/" + l.action).toBe("web");
});

test("② application installée (standalone) : meta.mode = pwa", async ({ page }) => {
  const lignes = await envoisTelemetrie(page, true);
  expect(lignes.length).toBeGreaterThan(0);
  for (const l of lignes) expect(l.meta && l.meta.mode).toBe("pwa");
});

test("③ window.PassioPlatform existe, figé, et dit standalone / installée / système", async ({ page }) => {
  await poserGateSansPremiereVisite(page);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  const p = await page.evaluate(() => {
    const P = window.PassioPlatform;
    let fige = false; try { P.standalone = "x"; } catch (e) { fige = true; }
    return { present: !!P, cles: Object.keys(P || {}).sort(), standalone: P && P.standalone, installee: P && typeof P.installee === "function" ? P.installee() : null, fige: fige || (P && P.standalone !== "x") };
  });
  expect(p.present).toBe(true);
  expect(p.cles).toEqual(["android", "deploiementPassio", "installee", "ios", "mac", "standalone", "supportePWA", "windows"]);
  expect(p.standalone).toBe(false);
  expect(p.installee).toBe(false);
  expect(p.fige, "l'instantané ne se réécrit pas").toBe(true);
});
