// ══════════════════════════════════════════════════════════════════════════
// CRÉER UN COMPTE SE VOIT DÈS L'ARRIVÉE  (2026-10-23)
//
// Retour d'essais de Benjamin avec d'autres personnes : « il manque sur la
// première page la possibilité de créer un compte ». Le visiteur entre dans le
// fil (première visite), et l'inscription ne s'offrait qu'au détour d'une
// action engageante (like, commentaire…). Deux portes la rendent visible :
//   ① la carte de bienvenue, quand des passions sont déjà choisies : « Créer
//      mon compte » y est alors l'action PRINCIPALE, celle que son message
//      annonce (« Crée ton compte pour les garder ») ;
//   ② un bouton « Créer un compte » dans la barre du haut, visible dès
//      l'arrivée et une fois la carte fermée — et qu'un compte existant ne
//      voit JAMAIS.
// ⚠️ 2026-11-03 : pour un NOUVEAU venu, la carte ne double plus la barre. Elle
// alignait quatre actions à poids presque égal ; son seul bouton y est
// désormais « Choisir mes passions » (first-run.spec.js), et ① bis exige que
// la porte de la barre soit visible EN MÊME TEMPS que la carte.
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

// Un visiteur qui a déjà choisi ses passions, sans compte.
const PREFS_CHOISIES = { v: 1, passions: ["moto"], specialites: [], intents: [], tour: {}, bienvenue: "vue", retour: null, migre: false, debut: 1 };

test.describe("Créer un compte depuis la première page", () => {
  test("① passions choisies : créer le compte est l'action principale de la carte", async ({ page }) => {
    await bootVisiteur(page, { prefs: PREFS_CHOISIES });
    const bouton = page.locator("#frWelcome .fr-welcome-cta");
    await expect(bouton).toBeVisible({ timeout: 15000 });
    await expect(bouton).toHaveText("Créer mon compte");
    await expect(page.locator("#frWelcome .btn")).toHaveCount(1);
    const h = await bouton.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
    await bouton.click();
    await formulaireInscriptionOuvert(page);
  });

  test("① bis nouveau venu : la carte ne double pas la barre, dont la porte se voit AVEC elle", async ({ page }) => {
    await bootVisiteur(page);
    await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#frWelcome [onclick*="allerInscription"]')).toHaveCount(0);
    await expect(page.locator("#topbarSignup")).toBeVisible();
    await expect(page.locator("#topbarSignup")).toBeInViewport();
  });

  // Les deux liens de la carte « passions choisies » partagent une rangée qui
  // passe à la ligne : à 320 px ils s'empilent, ils ne se coupent pas.
  for (const largeur of [320, 390]) {
    test(`① ter à ${largeur} px, les liens de la carte tiennent, sur une ligne chacun`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 760 });
      await bootVisiteur(page, { prefs: PREFS_CHOISIES });
      await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
      const liens = await page.locator("#frWelcome .fr-welcome-lien").evaluateAll((els) => els.map((el) => {
        const b = el.getBoundingClientRect();
        const carte = document.getElementById("frWelcome").getBoundingClientRect();
        const ligne = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
        const r = document.createRange();
        r.selectNodeContents(el);
        return {
          texte: el.textContent,
          hauteur: b.height,
          dedans: b.left >= carte.left - 0.5 && b.right <= carte.right + 0.5,
          lignes: Math.round(r.getBoundingClientRect().height / ligne),
        };
      }));
      expect(liens.map((l) => l.texte)).toEqual(["Modifier mes passions", "Me connecter"]);
      for (const l of liens) {
        expect(l.hauteur).toBeGreaterThanOrEqual(43.5);
        expect(l.dedans).toBe(true);
        expect(l.lignes).toBe(1);
      }
    });
  }

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
