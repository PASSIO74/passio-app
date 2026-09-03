// Non-régression : un post malformé (champ attendu en tableau mais reçu sous une
// autre forme, ex. `comments` objet au lieu d'array — cf. le cas déjà connu des
// réactions de bobines) ne doit PAS faire planter tout le rendu du fil.
// Avant le fix du 2026-08-07 (_renderPostHTMLSafe), un TypeError levé par
// renderPostHTML() remontait jusqu'à renderFeed() et laissait #feedList VIDE,
// y compris pour les posts valides du lot (TypeError: Cannot read properties of
// undefined (reading 'map')).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("Fil — post malformé n'efface pas tout le fil", () => {
  test("un post malformé est sauté, les posts valides restent affichés", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    const now = Date.now();
    await page.evaluate((now) => {
      state.user.profiles = [{ id: "p1", passion: "musique", name: "Moi" }];
      _activeFeedPassions = new Set(["musique"]);
      selectedMoods = new Set(["creation"]);
      // ⚠️ ISOLER LE FIXTURE (2026-09-02). `renderFeed` ne peint que
      // `sortedPosts.slice(0, 20)` : tant que le socle de démonstration
      // concourait, les trois publications ci-dessous disputaient leur place aux
      // publications de « musique » — et le jour où le socle en a gagné cinq,
      // fraîches et très aimées, `valid2` est sorti du lot peint. Le test est
      // devenu rouge sans qu'aucun comportement ne change, exactement le piège
      // documenté par la fiche 06 : « un test qui laisse une requête de
      // production remplir son état ne mesure pas ce qu'il croit ».
      // Les QUATRE tableaux, parce que `_feedExtraPosts` survit aux écrasements.
      state.seed.posts = []; state.supabasePosts = []; window._feedExtraPosts = [];
      state.userPosts = [
        {
          id: "valid1", createdAt: now, passion: "musique", mood: "creation",
          authorId: "me", text: "Post valide", comments: [], likes: 0,
        },
        {
          // `comments` n'est pas un tableau -> (p.comments || []).slice(...) plante
          // dans renderPostHTML. _renderPostHTMLSafe doit intercepter et sauter
          // cette seule carte au lieu de vider tout #feedList.
          id: "broken1", createdAt: now - 1000, passion: "musique", mood: "creation",
          authorId: "me", text: "Post casse", comments: { not: "an array" }, likes: 0,
        },
        {
          id: "valid2", createdAt: now - 2000, passion: "musique", mood: "creation",
          authorId: "me", text: "Autre post valide", comments: [], likes: 0,
        },
      ];
      renderFeed();
    }, now);

    const list = page.locator("#feedList");
    await expect(list.locator('.post[data-postid="valid1"]')).toBeVisible();
    await expect(list.locator('.post[data-postid="valid2"]')).toBeVisible();
    await expect(list.locator('.post[data-postid="broken1"]')).toHaveCount(0);

    // Aucune exception JS non catchée ne doit avoir remonte jusqu'a la page.
    expect(errors.js).toEqual([]);
  });
});