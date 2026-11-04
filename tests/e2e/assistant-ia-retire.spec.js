// ══════════════════════════════════════════════════════════════════════════
// ASSISTANT IA RETIRÉ DE L'EXPLORER — 2026-11-02
//
// Demande de Benjamin : « supprime l'assistant IA de l'app pour l'instant ».
// L'onglet « Assistant IA » et son panneau `#exPanel_ai` sont retirés du
// balisage ; le code JS (switchExploreTab, sendAIQuery, renderAiHistory) reste
// en place et se tait faute de nœuds. Ce verrou garantit :
//   ① que l'écran Rechercher ne montre plus ni onglet ni panneau IA ;
//   ② que la recherche classique reste visible et utilisable ;
//   ③ qu'aucun appel à l'Edge Function `ask-ai` ne part en ouvrant l'écran,
//      et qu'un ancien appel résiduel (switchExploreTab('ai')) ne lève rien.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("Assistant IA retiré de l'Explorer", () => {
  test("① ② ③ ni onglet ni panneau IA, la recherche reste, aucun appel ask-ai", async ({ page }) => {
    const appelsIA = [];
    page.on("request", (r) => { if (/functions\/v1\/ask-ai/.test(r.url())) appelsIA.push(r.url()); });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(String(e)));

    await bootOnboarded(page);
    await page.evaluate(() => goTo("explore"));
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-explore");
      return el && el.classList.contains("active");
    }, null, { timeout: 10000 });

    // ① plus aucun nœud de l'assistant
    await expect(page.locator("#exTab_ai")).toHaveCount(0);
    await expect(page.locator("#exPanel_ai")).toHaveCount(0);
    await expect(page.locator("#aiInput")).toHaveCount(0);
    await expect(page.locator("#screen-explore")).not.toContainText("Assistant IA");

    // ② la recherche classique est là et visible
    await expect(page.locator("#exPanel_search")).toBeVisible();
    await expect(page.locator("#explorerSearch")).toBeVisible();

    // ③ un appel résiduel ne casse rien
    await page.evaluate(() => {
      if (typeof switchExploreTab === "function") switchExploreTab("ai");
      if (typeof renderAiHistory === "function") renderAiHistory();
    });
    await expect(page.locator("#exPanel_search")).toBeVisible();
    expect(appelsIA).toEqual([]);
    expect(erreurs).toEqual([]);
  });
});
