// Build de PROD (dist/) : depuis le 2026-07-03, le bloc app (~1,1 Mo de JS) est
// externalisé hors de la page et injecté SEULEMENT après le gate (TBT) — en 9
// scripts dist/app/ depuis le 2026-11-09 (un dist/app.js avant). Ce spec
// vérifie les 3 chemins critiques de cette architecture sur le vrai artefact :
//   1. page verrouillée → gate peint, AUCUN JS applicatif exécuté ;
//   2. saisie du code → scripts app/ injectés → landing ;
//   3. session déjà déverrouillée (jeton) → boot direct.
// Le build (~1 s) est refait à chaque run → protège aussi scripts/build.js.
const { execSync } = require("child_process");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY, GATE_CODE, CLE_PREMIERE_VISITE, poserGateSansPremiereVisite } = require("./gate-helper");
const { projetSupabaseVide } = require("./app-helper");

test.describe("build prod (dist) — scripts app/ externalisés derrière le gate", () => {
  // ⚠️ La coupure de la « première visite » vaut pour les TROIS cas, pas
  // seulement celui qui pose un jeton. Le cas « saisie du code » n'a aucun
  // script d'injection — il tape le code au clavier — et c'est justement lui qui
  // attend la landing : sans coupure, l'artefact de production le mène
  // directement dans le Fil, parcours actif par défaut depuis le 2026-09-01.
  // Poser la coupure par suite plutôt que par cas évite qu'un futur test ajouté
  // ici hérite du même piège en silence.
  // ⚠️ Le rideau est LEVÉ par défaut depuis l'ouverture publique du 2026-09-11 :
  // cette suite mesure l'architecture « bloc app derrière le gate », elle ARME donc
  // le gate elle-même (`passio_gate_actif = "1"`), comme access-gate.spec.js.
  test.beforeEach(async ({ page }) => {
    // L'artefact démarre l'application entière derrière le gate : au projet
    // Supabase VIDE du banc, jamais à la production (2026-11-09).
    await projetSupabaseVide(page);
    await page.addInitScript((cle) => {
      localStorage.setItem(cle, "0");
      localStorage.setItem("passio_gate_actif", "1");
    }, CLE_PREMIERE_VISITE);
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

  test("saisie du code → scripts app/ injectés → landing", async ({ page }) => {
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
  // ⚖️ LCEN art. 1-1 : les mentions légales doivent se lire SANS code — donc
  // sans le bloc app, qui n'est injecté qu'après. Mesuré sur l'ARTEFACT, parce que
  // c'est le build qui décide de ce qui vit en tête de page et de ce qui est
  // repoussé derrière le gate.
  test("page verrouillée : les mentions légales se lisent SANS le bloc app (LCEN)", async ({ page }) => {
    await page.goto("/dist/index.html");
    await page.waitForSelector("#passioGate .pg-title", { timeout: 15000 });
    await page.getByRole("button", { name: "Mentions légales", exact: true }).click();
    await expect(page.locator("#pgLegalPanel")).toBeVisible();
    const texte = await page.locator("#pgLegalBody").innerText();
    expect(texte).toContain("Netlify, Inc.");
    expect(texte).toContain("passioadmin@gmail.com");
    expect(texte).not.toContain("Texte indisponible");
    // …et toujours aucun JS applicatif : les textes viennent de la tête de page.
    expect(await page.evaluate(() => typeof boot)).toBe("undefined");
  });

  // La télémétrie se déclare sous la version du contrat de release — plus le
  // « 2026.08.0 » figé depuis août, qui rendait « ancien client » et « défaut
  // vivant » indiscernables au pilotage (2026-09-16). telemetry.js vit en tête
  // de page (avant le gate), donc la mesure ne demande aucun déverrouillage.
  test("télémétrie : app_version = le commit du contrat de release, sinon l'empreinte de build", async ({ page }) => {
    await page.goto("/dist/index.html");
    await page.waitForSelector("#passioGate .pg-title", { timeout: 15000 });
    const r = await page.evaluate(() => ({
      release: window.PASSIO_RELEASE || null,
      version: window.tel && window.tel.version,
    }));
    expect(r.release, "le contrat de release est posé avant telemetry.js").not.toBeNull();
    expect(r.version).not.toBe("2026.08.0");
    expect(r.version).not.toBe("dev");
    const attendu = (typeof r.release.commit === "string" && /^[0-9a-f]{7,40}$/i.test(r.release.commit))
      ? r.release.commit.slice(0, 8) : "b" + String(r.release.buildId).slice(0, 8);
    expect(r.version).toBe(attendu);
  });
});
