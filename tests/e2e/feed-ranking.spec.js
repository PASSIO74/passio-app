// Suite « classement du fil par pertinence » (rankFeedPosts, ajouté le 2026-08-04).
//
// Le fil est DÉJÀ filtré en amont (passions sélectionnées + suivis) ; rankFeedPosts
// ne réordonne QUE ce set. On teste la fonction pure directement dans la page (elle
// est globale), en pilotant les signaux d'état (mes passions / mes suivis) et en
// craftant des posts déterministes — pas de dépendance au seed ni à Supabase.
//
// Invariants vérifiés :
//   · à fraîcheur égale, un post de MA passion et/ou d'un auteur SUIVI remonte ;
//   · la fraîcheur reste dominante (un post récent hors-affinité bat un très vieux
//     post affinitaire) ;
//   · le classement ne PERD ni n'AJOUTE aucun post (même ensemble d'ids) ;
//   · la soupape localStorage.passio_feed_rank="0" rétablit le tri chronologique ;
//   · l'ordre est STABLE entre deux appels rapprochés (bucket 5 min → pas de
//     repaint parasite du guard _feedDomSig) ;
//   · MA publication toute neuve passe devant tout le reste, et le bonus
//     s'éteint passé la fenêtre (2026-09-02).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Prépare l'état : je pratique la passion "music" et je suis l'auteur "followed".
async function setupSignals(page) {
  await page.evaluate(() => {
    state.user.profiles = [{ id: "p1", passion: "music", name: "Moi" }];
    state.user.following = ["followed"];
  });
}

// Ordre des ids retournés par rankFeedPosts pour un lot de posts.
function rankIds(page, posts) {
  return page.evaluate((ps) => rankFeedPosts(ps).map((p) => p.id), posts);
}

test.describe("Fil — classement par pertinence", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // « JE VIENS DE PUBLIER » — ET JE DOIS LE VOIR (2026-09-02)
  // ──────────────────────────────────────────────────────────────────────────
  // Une publication neuve a la fraîcheur maximale et un engagement NUL, quand
  // n'importe quelle publication établie plafonne l'engagement dès ~20 j'aime.
  // Sans terme dédié, elle ne peut donc PAS mener : mesurée 25e sur 40 sur un
  // compte « musique », alors que `renderFeed` ne peint que 20 cartes. On
  // publiait, et on ne voyait rien.
  //
  // ⚠️ Ce défaut a été révélé par un enrichissement du contenu de démonstration,
  // mais il ne venait pas de lui : avant, la publication neuve sortait 20e,
  // c'est-à-dire à la toute dernière place peinte. Elle tenait à une carte près.
  // Corriger le contenu sans corriger le barème aurait rendu les tests verts en
  // laissant le produit à une publication du même défaut — le genre de vert qui
  // ne prouve rien.
  // ══════════════════════════════════════════════════════════════════════════
  test("ma publication toute neuve passe devant, même sans aucun j'aime", async ({ page }) => {
    await bootOnboarded(page);
    await setupSignals(page);
    const now = Date.now();

    const ids = await page.evaluate((maintenant) => {
      // Le concurrent le plus fort possible : frais, ma passion, auteur suivi,
      // et engagement au plafond. C'est le plafond réel du barème.
      const rival = { id: "rival", createdAt: maintenant, passion: "music",
        authorId: "followed", likes: 500, comments: [{ id: "c" }, { id: "c2" }] };
      // La mienne : fraîche, et rien d'autre.
      const mienne = { id: "mienne", createdAt: maintenant, passion: "music",
        authorId: "moi", likes: 0, comments: [] };
      // `_estMonPost` reconnaît la propriété par `state.userPosts` ou MY_UID.
      state.userPosts = [mienne];
      return rankFeedPosts([rival, mienne]).map((p) => p.id);
    }, now);

    expect(ids[0], "ma publication doit être la première carte du fil").toBe("mienne");
  });

  // Le pendant indispensable : le bonus est BORNÉ. Sans cette borne, mes vieilles
  // publications squatteraient mon fil indéfiniment — ce n'est pas un fil, c'est
  // un miroir.
  test("…mais le coup de pouce s'éteint : une vieille publication à moi ne squatte pas", async ({ page }) => {
    await bootOnboarded(page);
    await setupSignals(page);
    const now = Date.now();

    const ids = await page.evaluate((maintenant) => {
      const H = 3600000;
      const vieille = { id: "vieille_a_moi", createdAt: maintenant - 12 * H, passion: "music",
        authorId: "moi", likes: 0, comments: [] };
      const fraiche = { id: "fraiche_autrui", createdAt: maintenant, passion: "music",
        authorId: "x", likes: 0, comments: [] };
      state.userPosts = [vieille];
      return rankFeedPosts([vieille, fraiche]).map((p) => p.id);
    }, now);

    expect(ids[0], "passé la fenêtre, la fraîcheur reprend la main").toBe("fraiche_autrui");
  });

  test("à fraîcheur égale, l'affinité (passion pratiquée + auteur suivi) remonte", async ({ page }) => {
    await bootOnboarded(page);
    await setupSignals(page);
    const now = Date.now();
    const posts = [
      { id: "neutral", createdAt: now, passion: "cinema", authorId: "x" },
      { id: "mypassion", createdAt: now, passion: "music", authorId: "x" },
      { id: "followed", createdAt: now, passion: "cinema", authorId: "followed" },
      { id: "both", createdAt: now, passion: "music", authorId: "followed" },
    ];
    const ids = await rankIds(page, posts);
    // "both" (affinité 2) > "mypassion"/"followed" (affinité 1) > "neutral" (0).
    expect(ids[0]).toBe("both");
    expect(ids[3]).toBe("neutral");
    expect(ids.slice(1, 3).sort()).toEqual(["followed", "mypassion"]);
  });

  test("la fraîcheur reste dominante : un post récent neutre bat un vieux post affinitaire", async ({ page }) => {
    await bootOnboarded(page);
    await setupSignals(page);
    const now = Date.now();
    const posts = [
      // Post de MA passion + auteur suivi, mais vieux de 10 jours.
      { id: "old_affinity", createdAt: now - 10 * 24 * 3600 * 1000, passion: "music", authorId: "followed" },
      // Post neutre publié à l'instant.
      { id: "fresh_neutral", createdAt: now, passion: "cinema", authorId: "x" },
    ];
    const ids = await rankIds(page, posts);
    expect(ids[0]).toBe("fresh_neutral");
  });

  test("le classement conserve exactement le même ensemble de posts", async ({ page }) => {
    await bootOnboarded(page);
    await setupSignals(page);
    const now = Date.now();
    const posts = Array.from({ length: 15 }, (_, i) => ({
      id: "post" + i,
      createdAt: now - i * 3600 * 1000,
      passion: i % 2 ? "music" : "cinema",
      authorId: i % 3 ? "x" : "followed",
      likes: i,
      comments: [],
    }));
    const ids = await rankIds(page, posts);
    expect(ids.length).toBe(15);
    expect(ids.slice().sort()).toEqual(posts.map((p) => p.id).sort());
  });

  test("la soupape passio_feed_rank=0 rétablit le tri chronologique strict", async ({ page }) => {
    await bootOnboarded(page);
    await setupSignals(page);
    await page.evaluate(() => localStorage.setItem("passio_feed_rank", "0"));
    const now = Date.now();
    const posts = [
      { id: "old_affinity", createdAt: now - 5 * 24 * 3600 * 1000, passion: "music", authorId: "followed", likes: 999, comments: [] },
      { id: "mid", createdAt: now - 3600 * 1000, passion: "cinema", authorId: "x" },
      { id: "newest", createdAt: now, passion: "cinema", authorId: "x" },
    ];
    const ids = await rankIds(page, posts);
    expect(ids).toEqual(["newest", "mid", "old_affinity"]);
    await page.evaluate(() => localStorage.removeItem("passio_feed_rank"));
  });

  test("l'ordre est stable entre deux appels rapprochés (fenêtre du guard)", async ({ page }) => {
    await bootOnboarded(page);
    await setupSignals(page);
    const now = Date.now();
    const posts = Array.from({ length: 8 }, (_, i) => ({
      id: "p" + i,
      createdAt: now - i * 1800 * 1000,
      passion: i % 2 ? "music" : "cinema",
      authorId: i % 2 ? "followed" : "x",
      likes: (i * 7) % 5,
      comments: [],
    }));
    const first = await rankIds(page, posts);
    const second = await rankIds(page, posts);
    expect(second).toEqual(first);
  });
});
