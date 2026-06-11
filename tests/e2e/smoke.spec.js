// Tests smoke PASSIO — vérifient que l'app démarre et que les flux critiques s'affichent.
// Aucune écriture en base : on ne crée ni compte ni post.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  // Déverrouille l'Access Gate pour tester l'app elle-même
  // (le gate a sa propre suite : access-gate.spec.js)
  await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
});

test("la page charge avec le bon titre", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/PASSIO/i);
});

test("la landing s'affiche (logo, badge beta, CTA)", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.getByText("Beta privée")).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter" }).first()).toBeVisible();
});

test("le bouton Se connecter ouvre le formulaire d'authentification", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Se connecter" }).first().click();
  await expect(page.locator("#authEmail")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#authPassword")).toBeVisible();
});

test("aucune erreur JavaScript fatale au démarrage", async ({ page }) => {
  await page.goto("/index.html");
  await page.waitForTimeout(4000);
  const fatal = pageErrors.filter(
    (m) => !/Failed to fetch|NetworkError|load failed/i.test(m)
  );
  expect(fatal, "Erreurs JS détectées: " + fatal.join(" | ")).toHaveLength(0);
});

test("le manifest PWA et le service worker sont servis", async ({ page, request }) => {
  const manifest = await request.get("/manifest.json");
  expect(manifest.ok()).toBeTruthy();
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
});
