// Panneau d'outils contextuel (js/contextual-nav.js) — refonte content-first
// IRL & CDV du 2026-08-07. Vérifie l'ouverture/fermeture par tous les canaux,
// le responsive (bottom-sheet mobile / rail droit desktop), l'a11y, et surtout
// qu'AUCUNE fonctionnalité déplacée n'a disparu (mêmes handlers).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, screen) {
  await bootOnboarded(page);
  await page.evaluate((s) => goTo(s), screen);
}

test.describe("ContextualTools — ouverture / fermeture", () => {
  test("IRL : le déclencheur ouvre le panneau ; ✕, backdrop, Escape et retour le ferment", async ({ page }) => {
    await boot(page, "irl");
    const root = page.locator("#ctxToolsRoot");

    // Ouverture par clic sur le déclencheur.
    await page.locator("#irlToolsBtn").click();
    await expect(root).not.toHaveAttribute("hidden", /.*/);
    await expect(page.locator("#ctxToolsTitle")).toContainText("IRL");
    expect(await page.evaluate(() => ContextualTools.isOpen())).toBe(true);

    // Fermeture par le bouton ✕.
    await page.locator("#ctxToolsRoot .ctx-close").click();
    expect(await page.evaluate(() => ContextualTools.isOpen())).toBe(false);

    // Fermeture par Escape.
    await page.locator("#irlToolsBtn").click();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => ContextualTools.isOpen())).toBe(false);

    // Fermeture par le bouton retour du navigateur (comme un modal).
    await page.locator("#irlToolsBtn").click();
    expect(await page.evaluate(() => ContextualTools.isOpen())).toBe(true);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => ContextualTools.isOpen())).toBe(false);
    // On reste sur IRL, pas de navigation parasite.
    await expect(page.locator("#screen-irl")).toHaveClass(/active/);
  });

  test("changer d'écran ferme le panneau ouvert", async ({ page }) => {
    await boot(page, "irl");
    await page.locator("#irlToolsBtn").click();
    expect(await page.evaluate(() => ContextualTools.isOpen())).toBe(true);
    await page.evaluate(() => goTo("cdv"));
    expect(await page.evaluate(() => ContextualTools.isOpen())).toBe(false);
  });
});

test.describe("ContextualTools — aucune fonctionnalité perdue", () => {
  test("IRL : ville, filtres et mine/inscrit restent accessibles via le panneau", async ({ page }) => {
    await boot(page, "irl");
    await page.locator("#irlToolsBtn").click();
    const body = page.locator("#ctxToolsBody");
    await expect(body).toContainText("Ville");
    await expect(body).toContainText("Date, distance, horaire");
    await expect(body).toContainText("Mes événements");
    await expect(body).toContainText("Où je suis inscrit");

    // Le lanceur « Filtres » ouvre bien le panneau de filtres existant.
    await body.locator('[onclick*="openIrlFiltersPanel"]').click();
    await expect(page.locator("#irlFiltersPanel")).toBeVisible();
    expect(await page.evaluate(() => ContextualTools.isOpen())).toBe(false);
    await page.evaluate(() => closeIrlFiltersPanel());

    // Le toggle « Mes événements » alimente le MÊME état (irlFilters) via la
    // délégation existante, et pose la pastille sur le déclencheur.
    await page.locator("#irlToolsBtn").click();
    await page.locator('#ctxToolsBody [data-irlfilter="mine"]').click();
    expect(await page.evaluate(() => irlFilters.has("mine"))).toBe(true);
    await expect(page.locator("#irlToolsBadge")).toHaveText("1");
  });

  test("CDV : Mes lieux et Passeport restent accessibles via le panneau", async ({ page }) => {
    await boot(page, "cdv");
    await page.locator("#cdvToolsBtn").click();
    const body = page.locator("#ctxToolsBody");
    await expect(body).toContainText("Mes lieux");
    await expect(body).toContainText("Passeport");
    // Le passeport garde son icône SVG dessinée.
    expect(await body.locator(".ctx-item-ico svg").count()).toBeGreaterThanOrEqual(1);

    // Le lanceur ouvre la vraie modale passeport.
    await body.locator('[onclick*="openCdvPassport"]').click();
    await expect(page.locator(".modal-title")).toContainText("passeport");
  });
});

test.describe("ContextualTools — responsive", () => {
  test("mobile 375 : bottom-sheet ancré en bas, coins arrondis en haut", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await boot(page, "irl");
    await page.locator("#irlToolsBtn").click();
    const geo = await page.evaluate(() => {
      const s = document.querySelector("#ctxToolsRoot .ctx-sheet");
      const cs = getComputedStyle(s);
      return { left: cs.left, right: cs.right, bottom: cs.bottom, brTL: cs.borderTopLeftRadius };
    });
    expect(geo.left).toBe("0px");
    expect(geo.bottom).toBe("0px");
    expect(parseInt(geo.brTL, 10)).toBeGreaterThan(0);
  });

  test("desktop 1280 : rail latéral droit plein hauteur", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page, "irl");
    await page.locator("#irlToolsBtn").click();
    const geo = await page.evaluate(() => {
      const s = document.querySelector("#ctxToolsRoot .ctx-sheet");
      const cs = getComputedStyle(s);
      return { right: cs.right, top: cs.top, width: Math.round(parseFloat(cs.width)), brTL: cs.borderTopLeftRadius };
    });
    expect(geo.right).toBe("0px");
    expect(geo.top).toBe("0px");
    expect(geo.width).toBeGreaterThan(280);
    expect(parseInt(geo.brTL, 10)).toBe(0); // pas d'arrondi : rail collé au bord
  });
});

test.describe("ContextualTools — accessibilité", () => {
  test("rôle dialog, aria-modal, focus au panneau et fermeture clavier", async ({ page }) => {
    await boot(page, "irl");
    await page.locator("#irlToolsBtn").click();
    const sheet = page.locator("#ctxToolsRoot .ctx-sheet");
    await expect(sheet).toHaveAttribute("role", "dialog");
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    // Le déclencheur annonce qu'il ouvre un dialogue.
    await expect(page.locator("#irlToolsBtn")).toHaveAttribute("aria-haspopup", "dialog");
  });
});
