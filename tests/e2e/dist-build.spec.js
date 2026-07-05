// Build de PROD (dist/) : depuis le 2026-07-03, le bloc app (~1,1 Mo de JS) est
// externalisé dans dist/app.js et injecté SEULEMENT après le gate (TBT). Ce spec
// vérifie les 3 chemins critiques de cette architecture sur le vrai artefact :
//   1. page verrouillée → gate peint, AUCUN JS applicatif exécuté ;
//   2. saisie du code → app.js injecté → landing ;
//   3. session déjà déverrouillée (jeton) → boot direct.
// Le build (~1 s) est refait à chaque run → protège aussi scripts/build.js.
const { execSync } = require("child_process");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY, GATE_CODE } = require("./gate-helper");

test.describe("build prod (dist) — app.js externalisé derrière le gate", () => {
  test.beforeAll(() => {
    execSync("node scripts/build.js dist/index.html", { cwd: path.resolve(__dirname, "..", ".."), timeout: 60000 });
  });

  test("page verrouillée : gate peint, aucun JS applicatif exécuté", async ({ page }) => {
    await page.goto("/dist/index.html");
    await page.waitForSelector("#passioGate .pg-title", { timeout: 15000 });
    expect(await page.evaluate(() => typeof boot), "boot ne doit pas exister avant le déverrouillage").toBe("undefined");
    expect(await page.evaluate(() => typeof renderFeed), "renderFeed ne doit pas exister avant le déverrouillage").toBe("undefined");
  });

  test("saisie du code → app.js injecté → landing", async ({ page }) => {
    await page.goto("/dist/index.html");
    await page.waitForSelector("#pgInput", { state: "attached", timeout: 15000 });
    await page.locator("#pgInput").fill(GATE_CODE);
    await page.waitForFunction(() => typeof boot === "function", null, { timeout: 20000 });
    await page.waitForSelector("#landing.active", { timeout: 20000 });
  });

  test("session déjà déverrouillée (jeton) : boot direct sans étape gate", async ({ page }) => {
    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.goto("/dist/index.html");
    await page.waitForFunction(() => typeof boot === "function", null, { timeout: 20000 });
    await page.waitForSelector("#landing.active", { timeout: 20000 });
  });
});
