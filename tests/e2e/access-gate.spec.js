// Tests E2E de l'Access Gate (verrouillage par code d'accès pré-lancement).
// Vérifie : blocage total, rejet d'un mauvais code, déverrouillage, persistance session.
const { test, expect } = require("@playwright/test");
const { GATE_CODE, GATE_KEY, GATE_TOKEN } = require("./gate-helper");

test("au premier lancement, l'écran de code bloque toute l'app", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  // L'app est masquée tant que le code n'est pas saisi
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(page.locator("#landing")).toBeHidden();
});

test("un mauvais code est rejeté avec un message d'erreur", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  await page.locator("#pgDots").click();
  await page.keyboard.type("0000");
  await expect(page.locator("#pgErr")).toHaveClass(/show/);
  await expect(page.locator(".app-shell")).toBeHidden();
  // Aucun jeton posé
  const token = await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY);
  expect(token).toBeNull();
});

test("le bon code déverrouille l'app et pose le jeton de session", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pgDots").click();
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  const token = await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY);
  expect(token).toBe(GATE_TOKEN);
});

test("un jeton falsifié ne déverrouille pas l'app", async ({ page }) => {
  await page.addInitScript((k) => sessionStorage.setItem(k, "jeton-bidon"), GATE_KEY);
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
});

test("une fois déverrouillé, le rechargement dans le même onglet ne redemande pas le code", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pgDots").click();
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(page.locator("#passioGate")).toHaveCount(0);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
});

test("les deep links / URL internes sont aussi protégés", async ({ page }) => {
  await page.goto("/index.html#messages");
  await expect(page.locator("#passioGate")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
});
