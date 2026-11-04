// ══════════════════════════════════════════════════════════════════════════
// CRÉER UN COMPTE DEPUIS LE FIL  (2026-10-23, revu le 2026-11-04)
//
// Retour d'essais de Benjamin : « il manque sur la première page la possibilité
// de créer un compte ». La porte est la carte de bienvenue, dans ses deux états :
//   ① passions déjà choisies : « Créer mon compte » y est l'action PRINCIPALE ;
//   ① bis nouveau venu : un LIEN « Créer un compte », sous l'action principale.
// ⚠️ 2026-11-04 : le bouton de la barre du haut (`#topbarSignup`) est RETIRÉ à
// la demande de Benjamin (« il y est déjà une fois dans le fil »), ce que ① bis
// rend vrai aussi pour un nouveau venu : sans ce lien, plus rien ne menait à
// l'inscription à l'arrivée, sans geste préalable.
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

  // Le geste complet, jamais la seule présence : le lien doit OUVRIR l'inscription.
  test("① bis nouveau venu : un lien ouvre l'inscription, sans bouton de plus sur la carte", async ({ page }) => {
    await bootVisiteur(page);
    const lien = page.locator("#frWelcome .fr-welcome-signup");
    await expect(lien).toBeVisible({ timeout: 15000 });
    await expect(lien).toHaveText("Créer un compte");
    await expect(page.locator("#frWelcome .btn")).toHaveCount(1);
    const h = await lien.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
    await lien.click();
    await formulaireInscriptionOuvert(page);
  });

  test("① ter la barre du haut ne porte plus de bouton d'inscription", async ({ page }) => {
    await bootVisiteur(page);
    await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".app-topbar").getByRole("button", { name: "Créer un compte" })).toHaveCount(0);
    await expect(page.locator("#topbarSignup")).toHaveCount(0);
  });

  // Les deux liens de la carte partagent une rangée qui passe à la ligne : à
  // 320 px ils s'empilent, ils ne se coupent pas. Les deux états de la carte.
  const ETATS_LIENS = [
    { nom: "nouveau venu", prefs: null, attendu: ["Créer un compte", "J'ai déjà un compte"] },
    { nom: "passions choisies", prefs: PREFS_CHOISIES, attendu: ["Modifier mes passions", "Me connecter"] },
  ];
  for (const etat of ETATS_LIENS) {
    for (const largeur of [320, 390]) {
      test(`① quater ${etat.nom}, à ${largeur} px : les liens de la carte tiennent, sur une ligne chacun`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: 760 });
        await bootVisiteur(page, etat.prefs ? { prefs: etat.prefs } : {});
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
        expect(liens.map((l) => l.texte)).toEqual(etat.attendu);
        for (const l of liens) {
          expect(l.hauteur).toBeGreaterThanOrEqual(43.5);
          expect(l.dedans).toBe(true);
          expect(l.lignes).toBe(1);
        }
      });
    }
  }

  // Le nom et la puce Beta tiennent de nouveau dans la barre du visiteur : ils
  // ne cédaient leur place, sous 440 px, qu'à la pastille retirée.
  for (const largeur of [320, 360, 390, 430]) {
    test(`② à ${largeur} px, le nom et la puce Beta se voient sans se chevaucher`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 760 });
      await bootVisiteur(page);
      const nom = page.locator(".app-topbar .brand-name");
      const puce = page.locator(".app-topbar .beta-chip");
      await expect(nom).toBeVisible({ timeout: 15000 });
      await expect(puce).toBeVisible();
      const a = await nom.boundingBox();
      const b = await puce.boundingBox();
      expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
      const droite = await page.locator(".app-topbar .topbar-right").evaluate((el) => el.getBoundingClientRect().right);
      expect(droite).toBeLessThanOrEqual(largeur);
    });
  }

  test("③ un compte existant ne voit aucune porte d'inscription", async ({ page }) => {
    await bootOnboarded(page, { console: [], network: [] });
    await expect(page.locator("#topbarSignup")).toHaveCount(0);
    await expect(page.locator("#frWelcome")).toHaveCount(0);
  });
});
