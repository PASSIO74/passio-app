// ============================================================================
// COMMENTAIRES DEPUIS LE LECTEUR DE BOBINES (2026-08-29)
// ----------------------------------------------------------------------------
// Deux défauts distincts dans le même panneau (app-05) :
//
// ① `submitReelComment` n'écrivait QUE dans l'état local, puis `saveState()`.
//    Ni `post_comments`, ni `comment_interactions` : l'auteur de la bobine ne
//    voyait jamais le commentaire, et son auteur lui-même le perdait au premier
//    rechargement qui rejoue les posts du serveur. Le MÊME texte posté depuis la
//    discussion du Fil (`submitComment`, app-04) partait, lui — d'où un défaut
//    invisible à qui teste par le Fil.
//
// ② `loadReelComments` datait chaque commentaire par `c.timestamp`, un champ
//    qu'AUCUN chemin de création ne pose (ni app-04, ni app-05, ni la relecture
//    Supabase, qui écrivent tous `createdAt`). Le repli « Maintenant » était donc
//    universel : un commentaire de six mois s'affichait « Maintenant ».
//
// ⚠️ `supa` est un `let` de portée script — `window.supa = …` ne rebinde rien.
// L'injection passe par `_initRealSupa()`, qui lit le SDK global `supabase`.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function preparerBobine(page, commentaires) {
  await page.evaluate((cmts) => {
    window.__inserts = [];
    window.supabase = {
      createClient: () => ({
        from: (table) => ({
          insert: (rows) => {
            window.__inserts.push({ table, rows });
            const res = { data: Array.isArray(rows) ? rows : [rows], error: null };
            return { select: async () => res, then: (r) => r(res) };
          },
          upsert: async () => ({ error: null }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    // app-helper neutralise les écritures Supabase pour garder la prod propre.
    // Ici le client est FACTICE : on rétablit les vrais chemins d'écriture, qui
    // sont précisément ce que ce fichier doit exercer.
    window.supaAddComment = window.__vraiSupa.addComment;
    window.supaInsertNotif = window.__vraiSupa.insertNotif;

    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_bob");
    state.seed.users.push({ id: "u_bob", name: "Bob", profileEmoji: "🎬", avatar: "#8b5cf6" });
    state.seed.posts = [{
      id: "reel_cmt", userId: "u_bob", authorId: "u_bob", isReel: true, type: "video",
      passion: "cuisine", text: "Ma bobine", mood: "all", fromSupabase: true,
      createdAt: Date.now() - 3600000, likes: 0, comments: cmts,
    }];
    state.userPosts = [];
    saveState();
    openReelComments("reel_cmt");
  }, commentaires);
  await page.waitForTimeout(400);
}

test.describe("commentaires d'une bobine", () => {
  test("un commentaire posté part vers Supabase", async ({ page }) => {
    await bootOnboarded(page);
    await preparerBobine(page, []);

    await page.evaluate(() => {
      const i = document.getElementById("reelCommentInput");
      i.value = "Superbe prise de vue";
      submitReelComment();
    });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(() => {
      const p = findPostAnywhere("reel_cmt");
      const cmts = window.__inserts.filter((x) => x.table === "post_comments");
      return {
        local: (p.comments || []).length,
        envoyes: cmts.length,
        contenu: cmts.length ? (cmts[0].rows.content || (cmts[0].rows[0] || {}).content) : null,
      };
    });

    expect(r.local, "le commentaire existe localement").toBe(1);
    expect(r.envoyes, "un INSERT dans post_comments doit avoir eu lieu").toBeGreaterThan(0);
    expect(r.contenu).toBe("Superbe prise de vue");
  });

  test("une réponse à un commentaire part elle aussi", async ({ page }) => {
    await bootOnboarded(page);
    await preparerBobine(page, [{
      id: "c_parent", authorId: "u_bob", authorName: "Bob", text: "Bien joué",
      createdAt: Date.now() - 7200000, likes: 0, likedBy: [], replies: [],
    }]);

    await page.evaluate(() => {
      window.replyingToCommentIdx = 0;
      const i = document.getElementById("reelCommentInput");
      i.value = "Merci !";
      submitReelComment();
    });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(() => {
      const p = findPostAnywhere("reel_cmt");
      const cint = window.__inserts.filter((x) => x.table === "comment_interactions");
      return {
        reponsesLocales: ((p.comments[0] || {}).replies || []).length,
        envoyees: cint.length,
        kind: cint.length ? (cint[0].rows.kind || (cint[0].rows[0] || {}).kind) : null,
      };
    });

    expect(r.reponsesLocales).toBe(1);
    expect(r.envoyees, "un INSERT dans comment_interactions doit avoir eu lieu").toBeGreaterThan(0);
    expect(r.kind).toBe("reply");
  });

  test("un commentaire ancien n'est plus daté « Maintenant »", async ({ page }) => {
    await bootOnboarded(page);
    await preparerBobine(page, [{
      id: "c_vieux", authorId: "u_bob", authorName: "Bob", text: "Commentaire d'il y a trois jours",
      createdAt: Date.now() - 3 * 86400000, likes: 0, likedBy: [], replies: [],
    }]);

    const badge = await page.evaluate(() => {
      const el = document.querySelector("#reelCommentsList .reel-comment-badge");
      return el ? el.textContent.trim() : null;
    });

    expect(badge, "le commentaire doit être rendu").not.toBe(null);
    expect(badge).not.toBe("Maintenant");
    expect(badge).toBe("3 j"); // même formatage que partout ailleurs (fmtTime)
  });

  test("un commentaire à l'instant reste daté « à l'instant »", async ({ page }) => {
    await bootOnboarded(page);
    await preparerBobine(page, [{
      id: "c_neuf", authorId: "u_bob", authorName: "Bob", text: "Tout juste posté",
      createdAt: Date.now() - 2000, likes: 0, likedBy: [], replies: [],
    }]);

    const badge = await page.evaluate(() => {
      const el = document.querySelector("#reelCommentsList .reel-comment-badge");
      return el ? el.textContent.trim() : null;
    });
    expect(badge).toBe("à l'instant");
  });
});
