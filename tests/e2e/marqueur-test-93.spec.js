// Marqueur de test TEMPORAIRE — issue #93.
// Prouve que « 21/08/2026 » s'affiche EN ROUGE près de l'en-tête du Fil, sur le
// viewport iPhone de la config (390×844), sans masquer le contenu du fil.
//
// POUR RETIRER LE TEST TEMPORAIRE : supprimer ce fichier ET le bloc
// MARQUEUR-TEST-93 dans index.html (#screen-feed). Rien d'autre.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const TEXTE = "21/08/2026";

// Rouge attendu : #dc2626 — lisible sur le fond clair du Fil (le thème PASSIO
// n'a pas de mode sombre), là où #ef4444 passait sous le seuil AA.
// On lit la couleur CALCULÉE : une classe absente ou une règle écrasée se voit
// ici, alors qu'une assertion sur l'attribut style se contenterait du markup.
const ROUGE = "rgb(220, 38, 38)";

test("le marqueur 21/08/2026 est affiché en rouge sur le Fil", async ({ page }) => {
  await bootOnboarded(page);

  const marqueur = page.locator("#marqueurTest93");
  await expect(marqueur).toBeVisible();
  await expect(marqueur).toHaveText(TEXTE);
  await expect(marqueur).toHaveCSS("color", ROUGE);
});

test("le marqueur est près de l'en-tête et ne masque pas le fil", async ({ page }) => {
  await bootOnboarded(page);

  const marqueur = page.locator("#marqueurTest93");
  const boite = await marqueur.boundingBox();
  expect(boite, "le marqueur doit avoir une boîte de rendu").not.toBeNull();

  // Près de l'en-tête : dans le premier tiers de la hauteur du viewport iPhone,
  // et à l'intérieur de la largeur de l'écran (pas de débordement horizontal).
  const viewport = page.viewportSize();
  expect(boite.y).toBeLessThan(viewport.height / 3);
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(viewport.width);

  // Ne masque rien : le marqueur est dans le flux (pas de position fixed/absolute)
  // et la bande de stories du fil reste rendue sous lui.
  const position = await marqueur.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe("static");

  const strip = await page.locator("#profileStrip").boundingBox();
  if (strip) expect(strip.y).toBeGreaterThanOrEqual(boite.y + boite.height - 1);
});

test("le marqueur n'apparaît que sur le Fil", async ({ page }) => {
  await bootOnboarded(page);

  await expect(page.locator("#marqueurTest93")).toBeVisible();
  await page.evaluate(() => goTo("irl"));
  await expect(page.locator("#marqueurTest93")).toBeHidden();
  await page.evaluate(() => goTo("feed"));
  await expect(page.locator("#marqueurTest93")).toBeVisible();
});
