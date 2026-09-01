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
const { GATE_TOKEN, GATE_KEY, GATE_CODE, CLE_PREMIERE_VISITE, poserGateSansPremiereVisite } = require("./gate-helper");

test.describe("build prod (dist) — app.js externalisé derrière le gate", () => {
  // ⚠️ La coupure de la « première visite » vaut pour les TROIS cas, pas
  // seulement celui qui pose un jeton. Le cas « saisie du code » n'a aucun
  // script d'injection — il tape le code au clavier — et c'est justement lui qui
  // attend la landing : sans coupure, l'artefact de production le mène
  // directement dans le Fil, parcours actif par défaut depuis le 2026-09-01.
  // Poser la coupure par suite plutôt que par cas évite qu'un futur test ajouté
  // ici hérite du même piège en silence.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((cle) => localStorage.setItem(cle, "0"), CLE_PREMIERE_VISITE);
  });

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
    await poserGateSansPremiereVisite(page);
    await page.goto("/dist/index.html");
    await page.waitForFunction(() => typeof boot === "function", null, { timeout: 20000 });
    await page.waitForSelector("#landing.active", { timeout: 20000 });
  });
});
