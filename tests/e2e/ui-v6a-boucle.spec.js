// UI-6A — l'inbox Messages ne doit pas se repeindre en boucle.
//
// LE DÉFAUT, mesuré. Le module observe `#screen-messages` en `childList` +
// `subtree`. `decorerCartes()` avait sa signature (`data-v6a-psn`) et n'écrivait
// qu'au changement — mais `majMoi()`, la ligne d'identité, vidait et
// reconstruisait ses deux `<span>` À CHAQUE passage. Chaque écriture produisait
// une mutation, que l'observateur voyait, qui rappelait `planifier()`, qui
// rappelait `majMoi()`. Tant que l'écran Messages restait ouvert, la boucle
// tournait — travail continu du processeur, batterie, et un `setTimeout(0)`
// en permanence dans la file.
//
// Ce test compte les mutations RÉELLES de l'hôte après stabilisation. Compter
// les appels de fonction n'aurait rien prouvé : c'est l'écriture DOM qui
// entretient la boucle.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("UI-6A — pas de boucle de repeinte", () => {
  test("écran Messages ouvert : la ligne d'identité cesse d'être réécrite", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("messages"));

    // Prémisse : le module a bien décoré, sinon on mesurerait le silence d'un
    // module absent — un vert qui ne prouverait rien.
    await expect(page.locator("#v6aMoi")).toHaveCount(1);
    await page.waitForTimeout(400); // laisser la première décoration se poser

    const mutations = await page.evaluate(() => new Promise((resolve) => {
      const cible = document.getElementById("v6aMoi");
      let n = 0;
      const obs = new MutationObserver((recs) => { n += recs.length; });
      obs.observe(cible, { childList: true, subtree: true, characterData: true });
      setTimeout(() => { obs.disconnect(); resolve(n); }, 1500);
    }));

    expect(mutations, "aucune réécriture spontanée pendant 1,5 s").toBe(0);
  });

  test("un changement réel de pseudo repeint la ligne — la signature ne fige rien", async ({ page }) => {
    // Le correctif ne doit pas transformer « ne pas boucler » en « ne plus
    // jamais se mettre à jour ».
    await bootOnboarded(page);
    await page.evaluate(() => goTo("messages"));
    await expect(page.locator("#v6aMoi .v6a-moi-nom")).toHaveCount(1);

    const avant = await page.locator("#v6aMoi .v6a-moi-nom").innerText();
    await page.evaluate(() => {
      state.user.general.username = "Nouveau pseudo";
      // Une mutation quelconque de l'écran réveille l'observateur, comme le
      // ferait un rendu de renderMessages().
      document.getElementById("screen-messages").appendChild(document.createElement("i"));
    });
    await expect(page.locator("#v6aMoi .v6a-moi-nom")).toHaveText("Nouveau pseudo");
    expect(avant).not.toBe("Nouveau pseudo");
  });

  test("l'inbox reste décorée : la ligne d'identité et les Passio sont là", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("messages"));
    await expect(page.locator("#v6aHead")).toHaveCount(1);
    await expect(page.locator("#v6aMoi")).toBeVisible();
  });
});
