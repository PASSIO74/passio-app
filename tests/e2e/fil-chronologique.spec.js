// ══════════════════════════════════════════════════════════════════════════
// LE FIL EST CHRONOLOGIQUE : LE PLUS RÉCENT EN HAUT, TOUJOURS (2026-10-24)
// ──────────────────────────────────────────────────────────────────────────
// Demande de Benjamin : « il faut mettre toujours les posts les plus récents en
// haut du feed ». Le classement par pertinence faisait passer une publication
// ancienne mais très engagée devant une publication neuve — jusqu'à sortir
// celle-ci des 20 cartes peintes. Autorité : `trierFilChronologique` (app-02).
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function poser(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    const t = Date.now();
    state.seed.posts = [
      // Ancienne, très engagée, d'un compte suivi, dans ma passion, mood « Idées » :
      // tout ce que l'ancien barème récompensait.
      { id: "p_ancienne", authorId: "u_suivi", passion: "musique", mood: "creation", type: "text",
        text: "ANCIENNE", createdAt: t - 30 * 3600000, likes: 500,
        comments: [{ id: "c1", text: "a" }, { id: "c2", text: "b" }] },
      // Neuve, sans aucune interaction, d'un compte non suivi.
      { id: "p_neuve", authorId: "u_inconnu", passion: "musique", mood: "learn", type: "text",
        text: "NEUVE", createdAt: t - 60000, likes: 0, comments: [] },
      { id: "p_moyenne", authorId: "u_inconnu", passion: "musique", mood: "irl", type: "text",
        text: "MOYENNE", createdAt: t - 3 * 3600000, likes: 40, comments: [] },
    ];
    state.supabasePosts = [];
    state.userPosts = [];
    window._feedExtraPosts = [];
    state.user.following = ["u_suivi"];
    state.feedFollowingOn = true;
  });
}

async function ordrePeint(page) {
  await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
  await expect(page.locator("#feedList")).toContainText("ANCIENNE");
  return page.evaluate(() => Array.from(document.querySelectorAll("#feedList .post[data-postid]"))
    .map((n) => n.getAttribute("data-postid")));
}

test("① sans envie cochée : du plus récent au plus ancien", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => { state.feedIntents = []; });
  expect(await ordrePeint(page)).toEqual(["p_neuve", "p_moyenne", "p_ancienne"]);
});

test("② quatre envies cochées : elles filtrent, elles ne réordonnent pas", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => { state.feedIntents = ["discover", "learn", "create", "meet"]; });
  expect(await ordrePeint(page)).toEqual(["p_neuve", "p_moyenne", "p_ancienne"]);
});

test("③ une publication reçue en direct prend la première place", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => { state.feedIntents = []; });
  await ordrePeint(page);
  await page.evaluate(() => {
    feedAddRealtimePost({ id: "p_direct", authorId: "u_suivi", passion: "outdoor-via-ferrata", mood: "creation",
      type: "text", text: "DIRECT", createdAt: Date.now(), likes: 0, comments: [], fromSupabase: true });
  });
  const ordre = await ordrePeint(page);
  expect(ordre[0]).toBe("p_direct");
});
