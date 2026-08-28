// En-tête rétractable du fil — la bascule ne doit pas osciller.
//
// Le défaut, mesuré le 2026-08-28 : replier l'en-tête RACCOURCIT le contenu
// au-dessus du fil (max-height des trois blocs passe à 0 en 260 ms), ce qui
// déplace `scrollTop`. L'ancrage de défilement de Chrome compense
// imparfaitement, et le mouvement résiduel franchit le seuil OPPOSÉ — ce qui
// déplie, ce qui rallonge, ce qui replie. Sur une machine rapide la transition
// se termine avant l'événement suivant et l'oscillation s'éteint ; sur une
// machine lente, elle ne s'éteint jamais.
//
// Conséquence utilisateur : sur un téléphone un peu ancien, l'en-tête du fil
// clignote pendant le défilement. Conséquence pour le projet : le clic sur un
// bouton du fil était refusé par Playwright sur un élément qui ne tenait jamais
// en place — c'est ce qui faisait rougir `main` au hasard.
//
// ⚠️ Ce test ne prouve RIEN sans le ralentissement processeur : sur la machine
// calme d'un développeur, le défaut ne se produit pas. Il passe donc par CDP,
// et il vérifie d'abord que le ralentissement est bien en place — sans quoi il
// serait vert pour la mauvaise raison, exactement le piège qu'il doit fermer.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("l'en-tête rétractable ne clignote pas, même sur une machine lente", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });

  // Le fil de démonstration défile déjà largement — mesuré : 6442 px de contenu
  // pour 714 px de fenêtre. Inutile de fabriquer des posts : on observe le fil
  // que voit un vrai utilisateur, et une prémisse le vérifie plutôt que de le
  // supposer.
  const hauteur = await page.evaluate(() => {
    const m = document.querySelector(".app-main");
    return { defilable: m.scrollHeight - m.clientHeight, cartes: document.getElementById("feedList").children.length };
  });
  expect(hauteur.defilable, "le fil doit pouvoir défiler au-delà du seuil de repli (140 px)")
    .toBeGreaterThan(400);
  expect(hauteur.cartes).toBeGreaterThan(0);

  // Compter chaque changement d'état de la classe, à la source.
  await page.evaluate(() => {
    window.__bascules = 0;
    const main = document.querySelector(".app-main");
    window.__obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName === "class") window.__bascules++;
      }
    });
    window.__obs.observe(main, { attributes: true, attributeFilter: ["class"] });
  });

  // Le ralentissement, sans lequel ce test ne prouve rien.
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 35 });

  // Prémisse : le ralentissement est RÉELLEMENT actif. Une boucle de calcul qui
  // prendrait quelques millisecondes sur une machine libre doit ici en prendre
  // beaucoup plus ; sinon le vert de ce test ne voudrait rien dire.
  const duree = await page.evaluate(() => {
    const t0 = performance.now();
    let x = 0;
    for (let i = 0; i < 3e6; i++) x += Math.sqrt(i);
    return performance.now() - t0;
  });
  expect(duree, "le ralentissement processeur doit être effectif, sinon ce test est vert pour rien")
    .toBeGreaterThan(80);

  // Un seul geste de défilement vers le bas, franchissant le seuil de repli.
  await page.evaluate(() => {
    const main = document.querySelector(".app-main");
    main.scrollTop = 400;
    main.dispatchEvent(new Event("scroll"));
  });

  // On laisse le temps à une éventuelle oscillation de se manifester : c'est
  // une ABSENCE que l'on mesure, elle a besoin d'une fenêtre d'observation.
  await page.waitForTimeout(4000);

  const bascules = await page.evaluate(() => window.__bascules);
  // Un seul geste de défilement = au plus un repli. Avant le correctif, cette
  // même fenêtre en comptait une dizaine.
  expect(bascules, `l'en-tête a changé d'état ${bascules} fois pour un seul geste de défilement`)
    .toBeLessThanOrEqual(2);

  // Et l'en-tête a bien fait son travail : il est replié.
  expect(await page.evaluate(() =>
    document.querySelector(".app-main").classList.contains("chrome-collapsed"))).toBe(true);

  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("remonter déplie l'en-tête — le correctif n'a rien figé", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaLoadPosts = async () => []; });
  await page.waitForFunction(() => {
    const m = document.querySelector(".app-main");
    return m && m.scrollHeight - m.clientHeight > 400;
  });

  const main = () => page.evaluate(() =>
    document.querySelector(".app-main").classList.contains("chrome-collapsed"));

  await page.evaluate(() => {
    const m = document.querySelector(".app-main");
    m.scrollTop = 400; m.dispatchEvent(new Event("scroll"));
  });
  await page.waitForFunction(() =>
    document.querySelector(".app-main").classList.contains("chrome-collapsed"));
  expect(await main()).toBe(true);

  // ⚠️ On remonte RELATIVEMENT à la position courante, pas vers une valeur
  // absolue. Replier fait tomber `scrollTop` de 400 à ~154 tout seul : viser
  // 200 serait en réalité descendre. C'est le piège qui a fait échouer la
  // première version de ce test, et c'est la même dérive que le correctif
  // neutralise côté produit.
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const m = document.querySelector(".app-main");
    m.scrollTop = Math.max(0, m.scrollTop - 120);
    m.dispatchEvent(new Event("scroll"));
  });
  await page.waitForFunction(() =>
    !document.querySelector(".app-main").classList.contains("chrome-collapsed"));
  expect(await main()).toBe(false);
});
