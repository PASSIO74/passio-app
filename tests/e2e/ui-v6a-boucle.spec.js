// UI-6A — l'inbox Messages ne doit pas se repeindre en boucle.
//
// LE DÉFAUT HISTORIQUE, mesuré. Le module observe `#screen-messages` en
// `childList` + `subtree`. `decorerCartes()` avait sa signature
// (`data-v6a-psn`) et n'écrivait qu'au changement — mais `majMoi()`, la ligne
// d'identité, vidait et reconstruisait ses deux `<span>` À CHAQUE passage.
// Chaque écriture produisait une mutation, que l'observateur voyait, qui
// rappelait `planifier()`, qui rappelait `majMoi()`. Tant que l'écran Messages
// restait ouvert, la boucle tournait.
//
// ⚠️ 2026-08-31 : la ligne d'identité (« Audit QA · Musique ») a été RETIRÉE sur
// demande de Benjamin, et `majMoi()` avec elle — on n'écrit jamais « depuis » un
// autre compte dans PASSIO, la rappeler en tête de l'inbox n'informait personne.
// Ce fichier garde donc sa raison d'être, sur la seule surface qui subsiste :
// la tête entière ne doit pas se réécrire toute seule, et l'inbox doit rester
// décorée. La mesure porte sur les mutations RÉELLES du DOM — compter les
// appels de fonction n'aurait rien prouvé, c'est l'écriture qui entretient la
// boucle.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("UI-6A — pas de boucle de repeinte", () => {
  test("écran Messages ouvert : la tête cesse d'être réécrite", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("messages"));

    // Prémisse : le module a bien décoré, sinon on mesurerait le silence d'un
    // module absent — un vert qui ne prouverait rien.
    await expect(page.locator("#v6aHead")).toHaveCount(1);
    await page.waitForTimeout(400); // laisser la première décoration se poser

    const mutations = await page.evaluate(() => new Promise((resolve) => {
      const cible = document.getElementById("v6aHead");
      let n = 0;
      const obs = new MutationObserver((recs) => { n += recs.length; });
      obs.observe(cible, { childList: true, subtree: true, characterData: true });
      setTimeout(() => { obs.disconnect(); resolve(n); }, 1500);
    }));

    expect(mutations, "aucune réécriture spontanée pendant 1,5 s").toBe(0);
  });

  test("plus de ligne d'identité en tête de l'inbox", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("messages"));
    await expect(page.locator("#v6aHead")).toHaveCount(1);
    // Ni le nœud, ni son texte : « Audit QA » ne doit plus apparaître dans la
    // tête. Le titre « Messages » et la recherche, eux, restent.
    await expect(page.locator("#v6aMoi")).toHaveCount(0);
    const texte = await page.locator("#v6aHead").innerText();
    expect(texte).not.toContain("Audit QA");
    await expect(page.locator("#v6aHead .v6a-title")).toHaveText("Messages");
  });

  test("l'inbox reste décorée : la tête et les Passio des cartes sont là", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("messages"));
    await expect(page.locator("#v6aHead")).toHaveCount(1);
    await expect(page.locator("[data-v6a-plus]")).toHaveCount(1);
    expect(await page.locator(".v6a-psn").count()).toBeGreaterThan(0);
  });
});
