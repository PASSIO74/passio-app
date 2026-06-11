#!/usr/bin/env node
// Audit de couverture CSS — backlog perf #8.
// Charge l'app (serveur local sur 8080), navigue tous les écrans et mesure
// quelle part de styles.css est réellement utilisée (API Coverage de Chromium).
//
// Usage : npm run serve (dans un autre terminal) puis `node scripts/css-coverage.js`
// (ou laisser le script profiter d'un serveur déjà lancé par npm test).
const { chromium } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("../tests/e2e/gate-helper");

const SCREENS = ["feed", "profiles", "studio", "explore", "irl", "wallet", "messages", "cdv"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);

  await page.coverage.startCSSCoverage();
  await page.goto("http://127.0.0.1:8080/index.html");
  await page.waitForTimeout(3000);

  // Entrer dans l'app sans créer de compte (mode local seed)
  try {
    await page.evaluate(() => {
      const btn = document.querySelector('[onclick*="exitLandingAsAuth"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => { if (typeof onbSkipAuth === "function") onbSkipAuth(); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const y = document.getElementById("birthYear");
      if (y) { y.value = "1995"; onbValidateAge(); }
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const n = document.getElementById("userName");
      if (n) { n.value = "Audit CSS"; onbValidateName(); }
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const tile = document.querySelector("#passionGrid .passion-tile[data-passion]");
      if (tile) tile.click();
      if (typeof onbFinish === "function") onbFinish();
    });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.warn("Onboarding partiel :", e.message);
  }

  // Visiter chaque écran + ouvrir quelques surfaces (modals, conversation)
  for (const s of SCREENS) {
    try {
      await page.evaluate((scr) => { if (typeof goTo === "function") goTo(scr); }, s);
      await page.waitForTimeout(1200);
    } catch (e) { /* écran absent : continuer */ }
  }
  try {
    await page.evaluate(() => { if (typeof openPrivacyPolicy === "function") openPrivacyPolicy(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof closeModal === "function") closeModal(); });
  } catch (e) {}

  const coverage = await page.coverage.stopCSSCoverage();
  await browser.close();

  let report = [];
  for (const entry of coverage) {
    const total = entry.text ? entry.text.length : 0;
    if (!total) continue;
    const used = entry.ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
    const name = (entry.url || "inline").split("/").pop() || "inline";
    report.push({ name, total, used, pct: Math.round((used / total) * 1000) / 10 });
  }
  report.sort((a, b) => b.total - a.total);

  console.log("\n=== Couverture CSS (après visite des " + SCREENS.length + " écrans) ===");
  for (const r of report) {
    console.log(
      r.name.padEnd(28) +
      String((r.total / 1024).toFixed(1) + " Ko").padStart(10) +
      String((r.used / 1024).toFixed(1) + " Ko utilisés").padStart(20) +
      String(r.pct + " %").padStart(9)
    );
  }
  const main = report.find((r) => r.name.indexOf("styles.css") !== -1);
  if (main) {
    console.log("\nstyles.css : " + main.pct + " % utilisé sur ce parcours.");
    console.log("Note : la couverture sous-estime (états hover/erreur/modals non visités).");
  }
})();
