// ══════════════════════════════════════════════════════════════════════════
// UNE PANNE N'EST PAS UNE COMMUNAUTÉ VIDE (2026-11-09)
// ──────────────────────────────────────────────────────────────────────────
// Reproduit en coupant `*.supabase.co` : `navigator.onLine` reste vrai (aucun
// bandeau hors ligne), `supaLoadPosts` rendait `[]` comme pour une table vide,
// et le séparateur du fil annonçait « Pas encore de publication de ta
// communauté par ici » + « Publier la première ». Ce que cette suite prouve :
//   ① le DÉMARRAGE avec Supabase injoignable : le séparateur dit la panne, offre
//      « Réessayer », et ne dit jamais « Pas encore de publication » ;
//      « Réessayer » relance UNE lecture, et la vraie publication s'affiche ;
//   ② une réponse du SERVEUR, même un refus, prouve que le réseau répond : la
//      panne s'efface (`estEchecReseau` est le seul juge) ; ② bis une table
//      vide aussi — la communauté est alors VRAIMENT vide ;
//   ③ une page réelle déjà en mémoire dit vrai sur la communauté : pas de panne
//      annoncée.
// Autorités : `noterLectureTeteFil` / `filCommunauteInjoignable` /
// `reessayerFilCommunaute` / `poserSeparateurExemples` (app-02),
// `supaLoadPosts` (app-08). Fiche : docs/journal/passions-fil.md.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, projetSupabaseVide } = require("./app-helper");

const COUPURE = /https?:\/\/[^/]*\.supabase\.co\//;
const LECTURE_POSTS = /\/rest\/v1\/posts\?/;
const REEL = "5d0c1f7e-0000-4000-8000-00000000fa11";
const AUTEUR = "a1a1a1a1-0000-4000-8000-00000000fa11";

// ⚠️ L'ORDRE EST LE BANC. Le projet vide du CONTEXTE d'abord : quand la coupure
// tombera, plus rien ne part vers la production. Puis la coupure, au niveau de la
// PAGE (prioritaire), AVANT la navigation : c'est la lecture du DÉMARRAGE qu'on
// mesure — une route posée après lui ne la verrait jamais. D'où
// `sansIsolationDesDonnees` : la route `posts → []` de l'isolation par défaut,
// posée après la nôtre, servirait la lecture au lieu de la couper.
async function demarrerSansSupabase(page) {
  await projetSupabaseVide(page);
  await page.route(COUPURE, (route) => route.abort());
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
}

const separateur = (page) => page.locator("#feedList > .feed-exemples-sep");

async function attendrePanne(page) {
  // supabase-js réessaie trois fois une lecture coupée avant d'abandonner.
  await expect(separateur(page)).toHaveAttribute("data-genre", "panne", { timeout: 30000 });
}

function ligneReelle(passion) {
  return [{
    id: REEL, author_id: AUTEUR, passion_id: passion, mood: "all", content: "REEL_RETROUVE",
    media_url: null, created_at: new Date(Date.now() - 3600000).toISOString(), is_reel: false,
    overlays: null, vlog: null, shared_from_post_id: null, shared_data: null, event_id: null,
    profiles: { username: "Réelle", emoji: "🎵", color: "#7c3aed", avatar_url: null, is_private: false },
  }];
}

test("① Supabase injoignable au démarrage : le séparateur dit la panne, « Réessayer » relance la lecture", async ({ page }) => {
  await demarrerSansSupabase(page);
  const vu = await page.evaluate(() => ({ enLigne: navigator.onLine, reels: (state.supabasePosts || []).length }));
  expect(vu, "prémisse : le navigateur se croit en ligne, rien de réel en mémoire").toEqual({ enLigne: true, reels: 0 });
  await attendrePanne(page);
  const sep = separateur(page);
  await expect(sep).toContainText("Impossible de charger les publications de ta communauté pour l'instant.");
  await expect(sep).not.toContainText("Pas encore de publication");
  await expect(page.locator("#feedList")).not.toContainText("Pas encore de publication");
  await expect(sep.locator(".feed-exemples-sep-cta", { hasText: "Publier la première" })).toHaveCount(0);
  const reessayer = sep.locator(".feed-exemples-sep-cta", { hasText: "Réessayer" });
  await expect(reessayer).toBeVisible();

  // Le réseau revient (le projet vide du contexte répond au reste) et la table
  // porte une vraie publication de la passion du fil.
  const passion = await page.evaluate(() => Array.from(_activeFeedPassions)[0] || "musique");
  let lectures = 0;
  await page.unroute(COUPURE);
  await page.route(LECTURE_POSTS, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    lectures++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ligneReelle(passion)) });
  });
  await reessayer.click();
  await expect(page.locator(`#feedList > .post[data-postid="${REEL}"]`)).toContainText("REEL_RETROUVE");
  expect(lectures, "« Réessayer » a relancé la lecture du fil").toBeGreaterThan(0);
  await expect(separateur(page)).toHaveAttribute("data-genre", "apres-reel");
});

test("② une réponse du serveur, même un refus, efface la panne : le réseau répond", async ({ page }) => {
  await demarrerSansSupabase(page);
  await attendrePanne(page);
  await page.unroute(COUPURE);
  // 42501 : un refus de PostgREST — une réponse, donc pas une panne réseau.
  await page.route(LECTURE_POSTS, (route) => route.fulfill({
    status: 401, contentType: "application/json",
    body: JSON.stringify({ code: "42501", details: null, hint: null, message: "permission denied for table posts" }),
  }));
  await separateur(page).locator(".feed-exemples-sep-cta", { hasText: "Réessayer" }).click();
  await expect(separateur(page)).toHaveAttribute("data-genre", "seul");
  await expect(separateur(page)).toContainText("Pas encore de publication");
});

test("② bis le réseau revient sur une table vide : la panne s'efface, la communauté est vraiment vide", async ({ page }) => {
  await demarrerSansSupabase(page);
  await attendrePanne(page);
  await page.unroute(COUPURE);
  let lectures = 0;
  await page.route(LECTURE_POSTS, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    lectures++;
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await separateur(page).locator(".feed-exemples-sep-cta", { hasText: "Réessayer" }).click();
  await expect(separateur(page)).toHaveAttribute("data-genre", "seul");
  expect(lectures).toBeGreaterThan(0);
});

test("③ une page réelle déjà en mémoire dit vrai sur la communauté : pas de panne annoncée", async ({ page }) => {
  await demarrerSansSupabase(page);
  await attendrePanne(page);
  // Une vraie publication déjà lue, d'une passion hors du fil : elle n'est pas
  // peinte (le séparateur ouvre toujours le fil), mais la communauté a été lue.
  await page.evaluate(([id, auteur]) => {
    const hors = PASSIONS.map((p) => p.id).find((p) => !_activeFeedPassions.has(p));
    state.supabasePosts = [{ id, authorId: auteur, authorName: "Réelle", passion: hors, mood: "all", type: "text",
      text: "REEL_HORS_FIL", createdAt: Date.now() - 3600000, likes: 0, comments: [], fromSupabase: true }];
    window._feedDomSig = null; renderFeed();
  }, [REEL, AUTEUR]);
  await expect(page.locator("#feedList")).not.toContainText("REEL_HORS_FIL");
  await expect(separateur(page)).toHaveAttribute("data-genre", "seul");
});
