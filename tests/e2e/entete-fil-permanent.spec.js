// En-tête du fil — passions, moods et stories restent affichés en permanence.
//
// Ce que ce fichier remplace : `entete-fil-oscillation.spec.js`, qui prouvait
// que l'en-tête rétractable ne clignotait pas. Le repli au défilement a été
// RETIRÉ le 2026-08-29 (cf. la fin de `js/app-09-boot-pwa.js`) : une fois
// replié, il ne se rouvrait plus en remontant — le garde anti-oscillation
// n'était relâché que par deux événements de défilement consécutifs à la même
// position, condition qu'un geste tactile ne remplit jamais à la fin d'un
// mouvement. Défaut vécu et signalé : « je descends puis je remonte, les
// profils et les moods ne s'affichent plus ».
//
// Ce fichier garde donc les deux gestes de l'ancien test (descendre, puis
// remonter) et les mêmes moyens d'observation — ralentissement processeur
// compris, sans lequel un défaut de ce genre reste invisible sur une machine au
// repos — mais il vérifie la propriété qui a été DÉCIDÉE : les trois blocs
// gardent une hauteur non nulle du début à la fin, et aucune classe de repli
// n'est posée nulle part.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Les trois blocs de l'en-tête du fil, mesurés à la boîte réelle (le repli
// passait par `max-height: 0`, qui laisse l'élément dans le DOM : un test
// `toBeVisible` seul aurait pu rester vert sur un bloc écrasé à 0 px).
const MESURE = () => {
  const h = (id) => {
    const el = document.getElementById(id);
    return el ? Math.round(el.getBoundingClientRect().height) : -1;
  };
  // ⚠️ La rangée des moods AFFICHÉE est `#feedIntentSelector` (Tous · Explorer ·
  // Apprendre · Idées · Rencontrer, lot UI-7) ; l'historique `#moodSelector`
  // porte la même classe `.mood-selector` mais reste `hidden`. Mesurer l'id
  // historique donnerait 0 et ferait échouer ce test pour la mauvaise raison —
  // c'est la CLASSE que le repli visait, et c'est elle qu'on observe.
  const moods = Array.from(
    document.querySelectorAll("#screen-feed .mood-selector")
  ).filter((el) => !el.hidden);
  return {
    passions: h("profileStrip"),
    moods: moods.length
      ? Math.round(moods.reduce((m, el) => Math.max(m, el.getBoundingClientRect().height), 0))
      : -1,
    stories: h("storiesRowFeed"),
    replie: document.querySelector(".app-main").classList.contains("chrome-collapsed"),
    y: document.querySelector(".app-main").scrollTop,
  };
};

async function filDefilable(page) {
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
  // Prémisse : le fil de démonstration défile réellement au-delà de l'ancien
  // seuil de repli (140 px). Sans elle, les gestes ci-dessous ne prouveraient
  // rien — ils ne bougeraient pas.
  await page.waitForFunction(() => {
    const m = document.querySelector(".app-main");
    return m && m.scrollHeight - m.clientHeight > 400;
  });
}

async function defiler(page, delta) {
  await page.evaluate((d) => {
    const m = document.querySelector(".app-main");
    m.scrollTop = Math.max(0, m.scrollTop + d);
    m.dispatchEvent(new Event("scroll"));
  }, delta);
  // Laisser passer d'éventuelles trames de transition avant de mesurer.
  await page.waitForTimeout(600);
}

test("descendre puis remonter laisse les passions, les moods et les stories affichés", async ({ page }) => {
  await filDefilable(page);

  const avant = await page.evaluate(MESURE);
  expect(avant.passions, "les passions doivent être visibles au repos").toBeGreaterThan(10);
  expect(avant.moods, "les moods doivent être visibles au repos").toBeGreaterThan(10);
  expect(avant.stories, "les stories doivent être visibles au repos").toBeGreaterThan(10);

  await defiler(page, 400);
  const bas = await page.evaluate(MESURE);
  expect(bas.y, "le geste doit avoir réellement fait défiler le fil").toBeGreaterThan(140);
  expect(bas.replie, "plus aucune classe de repli n'est posée").toBe(false);
  expect(bas.passions).toBeGreaterThan(10);
  expect(bas.moods).toBeGreaterThan(10);
  expect(bas.stories).toBeGreaterThan(10);

  // Le geste du défaut signalé : on remonte.
  await defiler(page, -200);
  const remonte = await page.evaluate(MESURE);
  expect(remonte.replie).toBe(false);
  expect(remonte.passions, "les passions doivent être là en remontant").toBeGreaterThan(10);
  expect(remonte.moods, "les moods doivent être là en remontant").toBeGreaterThan(10);
  expect(remonte.stories, "les stories doivent être là en remontant").toBeGreaterThan(10);

  // Et retour tout en haut : rien n'a été perdu en route.
  await defiler(page, -1000);
  const haut = await page.evaluate(MESURE);
  expect(haut.passions).toBeGreaterThan(10);
  expect(haut.moods).toBeGreaterThan(10);
  expect(haut.stories).toBeGreaterThan(10);
});

test("aucune classe ni transition de repli, même sur une machine lente", async ({ page }) => {
  await filDefilable(page);

  // Compter tout changement de classe sur `.app-main` : c'est la surface par
  // laquelle le repli agissait, et la seule à surveiller.
  await page.evaluate(() => {
    window.__bascules = 0;
    window.__obs = new MutationObserver((muts) => {
      for (const m of muts) if (m.attributeName === "class") window.__bascules++;
    });
    window.__obs.observe(document.querySelector(".app-main"), {
      attributes: true, attributeFilter: ["class"],
    });
  });

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 35 });

  // Prémisse : le ralentissement est RÉELLEMENT actif, sinon ce test serait
  // vert pour la mauvaise raison.
  const duree = await page.evaluate(() => {
    const t0 = performance.now();
    let x = 0;
    for (let i = 0; i < 3e6; i++) x += Math.sqrt(i);
    return performance.now() - t0;
  });
  expect(duree, "le ralentissement processeur doit être effectif").toBeGreaterThan(80);

  await page.evaluate(() => {
    const m = document.querySelector(".app-main");
    m.scrollTop = 400;
    m.dispatchEvent(new Event("scroll"));
  });
  // Une ABSENCE se mesure sur une fenêtre d'observation.
  await page.waitForTimeout(4000);

  expect(await page.evaluate(() => window.__bascules),
    "plus rien ne doit toucher aux classes de `.app-main` pendant le défilement").toBe(0);

  const etat = await page.evaluate(MESURE);
  expect(etat.replie).toBe(false);
  expect(etat.passions).toBeGreaterThan(10);
  expect(etat.moods).toBeGreaterThan(10);
  expect(etat.stories).toBeGreaterThan(10);

  // Aucune transition de hauteur ne doit plus tourner au-dessus de `#feedList` :
  // c'est ce mouvement sub-pixel qui faisait refuser des clics à Playwright.
  const transitions = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      "#screen-feed .profile-strip, #screen-feed .mood-selector, #screen-feed .stories-row, #screen-feed .v7-strip-more"
    )).map((el) => getComputedStyle(el).transitionProperty)
      .filter((p) => p.includes("max-height")).length);
  expect(transitions, "plus aucune transition de max-height sur l'en-tête du fil").toBe(0);

  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});
