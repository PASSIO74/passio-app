// Tests E2E de l'Access Gate (verrouillage par code d'accès pré-lancement).
// Vérifie : blocage total, rejet d'un mauvais code, déverrouillage, persistance session.
const { test, expect } = require("@playwright/test");
const { GATE_CODE, GATE_KEY, GATE_TOKEN, CLE_PREMIERE_VISITE } = require("./gate-helper");

// ⚠️ Cette suite teste le GATE, pas ce qu'il y a derrière — mais deux de ses cas
// vérifient qu'après le bon code on arrive bien sur la landing. Depuis le
// 2026-09-01 le parcours « première visite » est ACTIF par défaut : un appareil
// vierge entre alors directement dans le Fil, et ces deux cas mesuraient le
// nouveau parcours en croyant mesurer l'ancien. On pose donc la coupure au boot
// et on garde TOUTES les assertions — convention déjà appliquée aux mises en
// ligne d'UI-3A et des lots UI-4. Les cas qui portent sur le gate lui-même ne
// sont pas affectés : la coupure vit dans `localStorage`, le jeton du gate dans
// `sessionStorage`, les deux ne se croisent pas.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((cle) => localStorage.setItem(cle, "0"), CLE_PREMIERE_VISITE);
});

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
  await page.locator("#pgInput").click();
  await page.keyboard.type("0000");
  await expect(page.locator("#pgErr")).toHaveClass(/show/);
  await expect(page.locator(".app-shell")).toBeHidden();
  // Aucun jeton posé
  const token = await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY);
  expect(token).toBeNull();
});

test("le bon code déverrouille l'app et pose le jeton de session", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pgInput").click();
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
  await page.locator("#pgInput").click();
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
