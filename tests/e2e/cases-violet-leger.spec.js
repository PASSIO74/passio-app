// Les « carrés violets » de la feuille « Créer » et du panneau Filtres de
// Rencontrer sont des LAVIS, pas des aplats — demande de Benjamin du
// 2026-09-01, après essai réel : « les grands carrés violets sont agressifs, je
// trouve ; mets plutôt des carrés violet très léger et tu écris en violet
// foncé » puis « pour les onglets violets, mets les mêmes sur le filtre dans
// Rencontrer ».
//
// Ce que cette suite prouve, et rien d'autre :
//   ① la feuille « Créer » : fond CLAIR, écriture VIOLET FONCÉ, contraste AA ;
//   ② le panneau Filtres de Rencontrer : la même formule, cases et bulles ;
//   ③ l'état coché reste distinguable — c'est ce que l'ancienne grammaire
//      (opacité 0,55) faisait, et qu'un simple éclaircissement du fond aurait
//      pu emporter en silence.
//
// ⚠️ Aucune valeur hexadécimale n'est exigée : ce sont des SEUILS (luminance du
// fond, teinte violette du texte, rapport de contraste). Une retouche de la
// charte reste donc libre, seule la règle « clair dessous, violet foncé
// dessus » est verrouillée.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Mesure faite DANS la page : on lit les couleurs calculées, jamais la feuille
// de style — c'est ce qui est réellement peint qui compte.
// ⚠️ Cette fonction part s'exécuter dans le navigateur : elle ne doit RIEN
// emprunter à la portée du fichier de test (Playwright n'en sérialise que la
// source, jamais sa fermeture) — d'où les trois helpers définis à l'intérieur.
function sonde(el) {
  const canal = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2]);
  const lire = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  // Le fond d'un nœud peut être transparent : on remonte jusqu'au premier
  // ancêtre OPAQUE, exactement comme le ferait l'œil.
  const fond = (n) => {
    for (let c = n; c; c = c.parentElement) {
      const b = getComputedStyle(c).backgroundColor;
      const v = lire(b);
      const a = (b.match(/[\d.]+/g) || [])[3];
      if (v.length === 3 && (a === undefined || Number(a) === 1)) return v;
    }
    return [255, 255, 255];
  };
  const f = fond(el);
  const t = lire(getComputedStyle(el).color);
  const lf = lum(f), lt = lum(t);
  return {
    fond: f,
    texte: t,
    lumFond: lf,
    contraste: (Math.max(lf, lt) + 0.05) / (Math.min(lf, lt) + 0.05),
  };
}

// Un « lavis violet à écriture violet foncé » se reconnaît à trois choses, et
// c'est tout ce que l'on exige.
function verifierLavis(m, quoi) {
  expect(m.lumFond, `${quoi} : le fond doit être CLAIR, pas un aplat violet`).toBeGreaterThan(0.6);
  expect(m.texte[2], `${quoi} : l'écriture doit être violette (bleu dominant)`)
    .toBeGreaterThan(m.texte[1] + 40);
  expect(m.texte[0], `${quoi} : l'écriture doit être FONCÉE, pas blanche`).toBeLessThan(160);
  expect(m.contraste, `${quoi} : contraste AA`).toBeGreaterThanOrEqual(4.5);
}

async function boot(page, errors) {
  await bootOnboarded(page, errors || null, 1, {});
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
}

test.describe("Cases violet léger — Créer et Filtres parlent la même langue", () => {
  test("feuille « Créer » : lavis violet, écriture violet foncé", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, errors);

    await page.click('#appNavV2 [data-v2-action="create"]');
    await expect(page.locator("#v2CreateSheet")).toBeVisible();

    const item = page.locator('#v2CreateSheet [data-v2-create="post"]');
    verifierLavis(await item.evaluate(sonde), "ligne « Publication »");
    verifierLavis(
      await item.locator(".v2-sheet-item-title").evaluate(sonde),
      "titre « Publication »",
    );
    // Le sous-titre demandé le même jour : petit, et lisible sur le lavis.
    const hint = item.locator(".v2-sheet-item-hint");
    await expect(hint).toHaveText("Photo / vidéo");
    const mh = await hint.evaluate(sonde);
    expect(mh.contraste, "sous-titre « Photo / vidéo » : contraste AA").toBeGreaterThanOrEqual(4.5);
    expect(await hint.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      "le sous-titre doit être écrit PETIT").toBeLessThan(14);

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("panneau Filtres de Rencontrer : la même formule, état coché distinguable", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, errors);
    await page.evaluate(() => goTo("irl"));
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-irl");
      return el && el.classList.contains("active");
    });
    await page.waitForTimeout(400);
    await page.locator("#irlToolsBtn").click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-v4a5-vue") === "filtres",
      null, { timeout: 8000 },
    );
    await page.waitForTimeout(300);

    // Les trois familles de cases du panneau : intentions, items d'outils,
    // bulles de passion. Elles ont été unifiées le 2026-08-31 ; elles restent
    // unifiées, au lavis cette fois.
    for (const [sel, quoi] of [
      [".v4a5-intents .v4a0-chip", "intention"],
      ["#v4a5Outils .ctx-item", "item d'outils"],
      ["#v4a5Passions .msg-tile", "bulle de passion"],
    ]) {
      const n = page.locator(sel).first();
      expect(await page.locator(sel).count(), `aucune ${quoi} rendue`).toBeGreaterThan(0);
      verifierLavis(await n.evaluate(sonde), quoi);
    }

    // ⚠️ L'état ne doit pas reposer sur la seule densité du lavis : une case
    // cochée change de fond ET affiche sa coche. C'est ce que l'opacité 0,55
    // assurait avant — l'éclaircissement ne doit pas l'avoir emporté.
    // ⚠️ On bascule « Cette semaine », jamais la première chip : celle-ci est
    // « Tous », le NEUTRE, déjà sélectionné au repos — la taper n'aurait rien
    // changé et le test aurait cru l'état invisible. « Ma ville » est écartée
    // pour l'autre raison : sans ville choisie, elle ouvre un sélecteur au lieu
    // de se cocher.
    const chip = page.locator('.v4a5-intents [data-v4a0-intent="semaine"]');
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    const avant = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    verifierLavis(await chip.evaluate(sonde), "intention décochée");

    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(300);
    const apres = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(apres, "cocher une case doit se VOIR").not.toBe(avant);
    // La coche ✓ porte l'état une seconde fois : il ne tient jamais à la seule
    // couleur.
    await expect(chip.locator(".v4a0-chip-mark")).toBeVisible();
    // Et cochée, elle reste lisible.
    verifierLavis(await chip.evaluate(sonde), "intention cochée");

    expect(errors.js, "exceptions JS").toEqual([]);
  });
});
