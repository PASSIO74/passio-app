// ══════════════════════════════════════════════════════════════════════════
// LA PUBLICATION D'UN COMPTE SUIVI NE SE NOIE PAS DANS LA DÉMO (2026-10-23)
// ──────────────────────────────────────────────────────────────────────────
// Rapport de Benjamin après un essai à trois comptes : « Jerem a fait un post
// mais il n'apparaît pas dans mon feed ». Mesuré en production : le post était
// REÇU (temps réel), présent dans `allFeedPosts`, « Suivis » coché, quatre
// envies cochées — et classé 19e sur 40, derrière le contenu de démonstration
// toujours frais. Le compte lecteur ne le trouvait que sur le profil de Jerem.
// Garantie : `FEED_SUIVI_BONUS` (app-02, `feedPostScore`).
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const JEREM = "9f35913c-936a-4a55-a0b8-9907db46d67c";

async function poser(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((J) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    state.supabasePosts = [];
    state.userPosts = [];
    window._feedExtraPosts = [];
    // L'état exact du compte lecteur : un exemple de démo suivi, Jerem suivi,
    // « Suivis » coché et les quatre envies cochées.
    state.user.following = ["u_lea", J];
    state.feedFollowingOn = true;
    state.feedIntents = ["discover", "learn", "create", "meet"];
  }, JEREM);
}

function posterJerem(page, ageHeures) {
  return page.evaluate(([J, h]) => {
    feedAddRealtimePost({
      id: "post_jerem", authorId: J, authorName: "Jerem", passion: "outdoor-via-ferrata",
      mood: "creation", type: "text", text: "VIA_FERRATA_JEREM",
      createdAt: Date.now() - h * 3600000, likes: 0, liked: false, comments: [], fromSupabase: true,
    });
    window._feedDomSig = null;
    renderFeed();
  }, [JEREM, ageHeures]);
}

test("① la publication fraîche d'un compte suivi est peinte, devant la démo", async ({ page }) => {
  await poser(page);
  await posterJerem(page, 0.15);
  await expect(page.locator("#feedList")).toContainText("VIA_FERRATA_JEREM");
  const rang = await page.evaluate(() => {
    var lot = allFeedPosts();
    return rankFeedPostsForIntents(lot, feedIntentsSelected()).findIndex(function (p) { return p.id === "post_jerem"; });
  });
  expect(rang).toBe(0);
});

test("② à 47 h, elle passe encore devant tout le contenu de démonstration", async ({ page }) => {
  await poser(page);
  await posterJerem(page, 47);
  const r = await page.evaluate(() => {
    var classe = rankFeedPostsForIntents(allFeedPosts(), feedIntentsSelected());
    var rang = classe.findIndex(function (p) { return p.id === "post_jerem"; });
    var demoDevant = classe.slice(0, rang).filter(function (p) { return p._source === "seed"; }).length;
    return { rang: rang, demoDevant: demoDevant };
  });
  expect(r.rang).toBeGreaterThanOrEqual(0);
  expect(r.demoDevant).toBe(0);
});

test("③ la démo suivie (« Léa ») ne reçoit jamais la garantie", async ({ page }) => {
  await poser(page);
  const r = await page.evaluate(() => {
    var lea = allFeedPosts().find(function (p) { return p.authorId === "u_lea"; });
    var b = Math.floor(Date.now() / 300000);
    var vide = new Set();
    return {
      suivie: feedPostScore(Object.assign({}, lea, { createdAt: Date.now() }), b, vide, new Set(["u_lea"]), vide),
      nonSuivie: feedPostScore(Object.assign({}, lea, { createdAt: Date.now() }), b, vide, vide, vide),
    };
  });
  // Seule l'affinité « auteur suivi » (0,35) sépare les deux : aucun bonus.
  expect(r.suivie - r.nonSuivie).toBeCloseTo(0.35, 5);
});

test("④ au-delà de 48 h, la garantie s'éteint", async ({ page }) => {
  await poser(page);
  const r = await page.evaluate((J) => {
    var b = Math.floor(Date.now() / 300000);
    var vide = new Set(), suivis = new Set([J]);
    var p = { id: "x", authorId: J, _source: "supabase", createdAt: Date.now() - 49 * 3600000, likes: 0, comments: [] };
    return feedPostScore(p, b, vide, suivis, vide) - feedPostScore(p, b, vide, vide, vide);
  }, JEREM);
  expect(r).toBeCloseTo(0.35, 5);
});

test("⑤ ma propre publication fraîche reste devant celle d'un compte suivi", async ({ page }) => {
  await poser(page);
  await posterJerem(page, 0);
  const premier = await page.evaluate(() => {
    var t = Date.now();
    state.userPosts = [{ id: "post_moi", authorId: (typeof MY_UID !== "undefined" && MY_UID) || "moi", passion: "musique",
      mood: "creation", type: "text", text: "MOI", createdAt: t - 600000, likes: 0, comments: [] }];
    return rankFeedPostsForIntents(allFeedPosts(), feedIntentsSelected())[0].id;
  });
  expect(premier).toBe("post_moi");
});
