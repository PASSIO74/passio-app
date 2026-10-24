// ══════════════════════════════════════════════════════════════════════════
// CRÉER UN COMPTE SE VOIT DÈS L'ARRIVÉE  (2026-10-23)
//
// Retour d'essais de Benjamin avec d'autres personnes : « il manque sur la
// première page la possibilité de créer un compte ». Le visiteur entre dans le
// fil (première visite), et l'inscription ne s'offrait qu'au détour d'une
// action engageante (like, commentaire…). Deux portes la rendent visible :
//   ① un bouton « Créer mon compte » dans la carte de bienvenue,
//   ② un bouton « Créer un compte » dans la barre du haut, qui reste là une
//      fois la carte fermée — et qu'un compte existant ne voit JAMAIS.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { bootVisiteur } = require("./first-run-helper");

async function formulaireInscriptionOuvert(page) {
  await page.waitForTimeout(400);
  await expect(page.locator("#onboarding.active")).toHaveCount(1);
  await expect(page.locator('.onb-step.active[data-onb-step="splash"]')).toHaveCount(1);
  await expect(page.locator("#authTabSignup.active")).toHaveCount(1);
  await expect(page.locator("#frBackToExplore")).toBeVisible();
}

test.describe("Créer un compte depuis la première page", () => {
  test("① la carte de bienvenue propose de créer un compte", async ({ page }) => {
    await bootVisiteur(page);
    const bouton = page.locator("#frWelcome .fr-welcome-signup");
    await expect(bouton).toBeVisible();
    await expect(bouton).toHaveText("Créer mon compte");
    const h = await bouton.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
    await bouton.click();
    await formulaireInscriptionOuvert(page);
  });

  test("② la barre du haut garde la porte, carte de bienvenue fermée", async ({ page }) => {
    await bootVisiteur(page);
    await page.locator("#frWelcome .fr-welcome-close").click();
    await expect(page.locator("#frWelcome")).toHaveCount(0);
    const bouton = page.locator("#topbarSignup");
    await expect(bouton).toBeVisible();
    // Il tient dans la barre, sans pousser l'écran hors du cadre.
    const r = await bouton.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { droite: b.right, largeurVue: window.innerWidth };
    });
    expect(r.droite).toBeLessThanOrEqual(r.largeurVue);
  });

  for (const largeur of [320, 360, 390, 430]) {
    test(`② bis à ${largeur} px, le bouton ne chevauche rien dans la barre`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 760 });
      await bootVisiteur(page);
      const chevauche = await page.evaluate(() => {
        const btn = document.getElementById("topbarSignup").getBoundingClientRect();
        const autres = [...document.querySelectorAll(".app-topbar .topbar-left *, .app-topbar .topbar-right > *")]
          .filter((el) => el.id !== "topbarSignup" && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
          .map((el) => ({ el: el.className || el.tagName, r: el.getBoundingClientRect() }))
          .filter((o) => o.r.width > 0 && o.r.height > 0);
        return autres.filter((o) => o.r.left < btn.right - 1 && o.r.right > btn.left + 1 && o.r.top < btn.bottom && o.r.bottom > btn.top).map((o) => String(o.el));
      });
      expect(chevauche).toEqual([]);
    });
  }

  test("② ter le bouton de la barre ouvre l'inscription", async ({ page }) => {
    await bootVisiteur(page);
    const bouton = page.locator("#topbarSignup");
    // La cible tactile est bien le bouton, à son centre.
    const cible = await bouton.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const x = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!x && (x === el || el.contains(x));
    });
    expect(cible).toBe(true);
    await bouton.click();
    await formulaireInscriptionOuvert(page);
  });

  test("③ un compte existant ne voit jamais le bouton d'inscription", async ({ page }) => {
    await bootOnboarded(page, { console: [], network: [] });
    await expect(page.locator("#topbarSignup")).toBeHidden();
    await expect(page.locator("#frWelcome")).toHaveCount(0);
  });
});
