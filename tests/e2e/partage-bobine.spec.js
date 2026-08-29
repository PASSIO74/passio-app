// ============================================================================
// PARTAGE D'UNE BOBINE DANS LE FIL (2026-08-29)
// ----------------------------------------------------------------------------
// `shareReelInFeed` (app-05) fabriquait un post SANS `createdAt`. Trois
// conséquences d'un seul champ manquant :
//
//   ① il n'atteignait JAMAIS Supabase. `supaPublishPostWithRetry` (app-08) fait
//      `new Date(post.createdAt).toISOString()` : sur `undefined`, cela lève un
//      RangeError — avalé par le `catch` de la boucle de réessai, qui renvoie
//      `false` sans un mot. Le partage disparaissait au rechargement.
//   ② la carte n'affichait AUCUNE heure (`fmtTime(undefined)` → "").
//   ③ elle tombait tout en bas du fil (tri sur `createdAt || 0` → époque 0).
//
// Sa jumelle `sharePostInFeed` (app-03) portait déjà le champ : les deux
// fonctions, presque identiques, avaient divergé sur ce seul point.
//
// Second défaut, dans les DEUX fonctions : le texte était échappé À LA SOURCE
// (`escapeHtml(txt)`) alors qu'il l'est déjà à l'affichage — une apostrophe
// s'affichait `&#39;`, et la valeur corrompue partait dans `posts.content`.
//
// ⚠️ `supa` est un `let` de portée script : `window.supa = …` ne rebinde PAS la
// référence qu'utilise app-08. Le seul point d'injection est `_initRealSupa()`,
// qui lit le SDK global `supabase` — c'est par là que ce fichier installe un
// client factice, sans jamais toucher la production.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const TEXTE_BOBINE = "Café d'Or & Cie";

async function preparerBobine(page) {
  await page.evaluate((txt) => {
    window.__inserts = [];
    window.supabase = {
      createClient: () => ({
        from: (table) => ({
          insert: (rows) => ({
            select: async () => { window.__inserts.push({ table, rows }); return { data: rows, error: null }; },
            then: (r) => r({ data: rows, error: null }),
          }),
          upsert: async () => ({ error: null }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    // La vraie fonction de publication, conservée par app-helper avant sa
    // neutralisation : c'est elle qu'on veut exercer, contre le client factice.
    window.supaPublishPostWithRetry = window.__vraiSupaPublishPost;

    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_bob");
    state.seed.users.push({ id: "u_bob", name: "Bob", profileEmoji: "🎬", avatar: "#8b5cf6" });
    state.seed.posts = [{
      id: "reel_partage", userId: "u_bob", isReel: true, type: "video",
      passion: "cuisine", text: txt, mood: "all", createdAt: Date.now() - 3600000,
      likes: 0, comments: [],
    }];
    state.userPosts = [];
    saveState();
  }, TEXTE_BOBINE);
}

test.describe("partage d'une bobine dans le Fil", () => {
  test("le post partagé est daté, et il atteint Supabase", async ({ page }) => {
    await bootOnboarded(page);
    await preparerBobine(page);

    await page.evaluate(() => shareReelInFeed("reel_partage"));
    await page.waitForTimeout(1200);

    const r = await page.evaluate(() => {
      const p = (state.userPosts || []).find((x) => x.sharedReel === "reel_partage");
      const inserts = window.__inserts.filter((i) => i.table === "posts");
      return {
        cree: !!p,
        createdAt: p ? p.createdAt : null,
        dateValide: p ? Number.isFinite(new Date(p.createdAt).getTime()) : false,
        heureAffichee: p ? fmtTime(p.createdAt) : null,
        insertions: inserts.length,
        createdAtEnvoye: inserts.length ? (inserts[0].rows[0] || {}).created_at : null,
      };
    });

    expect(r.cree, "le post de partage doit exister localement").toBe(true);
    // ① le champ que lit supaPublishPostWithRetry
    expect(r.dateValide, "createdAt doit être une date valide").toBe(true);
    // ② la carte porte une heure
    expect(r.heureAffichee).not.toBe("");
    // ③ la publication a bien atteint la table `posts`
    expect(r.insertions, "un INSERT dans `posts` doit avoir eu lieu").toBeGreaterThan(0);
    expect(typeof r.createdAtEnvoye).toBe("string");
  });

  test("le texte du partage n'est pas échappé deux fois", async ({ page }) => {
    await bootOnboarded(page);
    await preparerBobine(page);

    await page.evaluate(() => shareReelInFeed("reel_partage"));
    await page.waitForTimeout(1200);

    const r = await page.evaluate(() => {
      const p = (state.userPosts || []).find((x) => x.sharedReel === "reel_partage");
      return { texte: p ? p.text : null };
    });

    // La valeur STOCKÉE — celle qui part dans `posts.content` — est du texte brut.
    expect(r.texte).toContain("Café d'Or & Cie");
    expect(r.texte).not.toMatch(/&(amp|#39|quot|lt|gt);/);

    // Et à l'écran, l'apostrophe est bien une apostrophe.
    await page.evaluate(() => { goTo("feed"); renderFeed(); });
    await page.waitForTimeout(600);
    const affiche = await page.evaluate(() => {
      const cartes = [...document.querySelectorAll("#feedList .post")];
      const c = cartes.find((el) => (el.textContent || "").includes("A partagé une bobine"));
      return c ? c.textContent : null;
    });
    expect(affiche, "la carte de partage doit être dans le fil").not.toBe(null);
    expect(affiche).toContain("Café d'Or & Cie");
  });

  test("le partage d'un POST ordinaire n'est pas échappé deux fois non plus", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      state.seed.posts = [{
        id: "post_ordinaire", userId: "u_lea", type: "text", passion: "cuisine",
        text: "Café d'Or & Cie", authorName: "Léa d'Ys", mood: "all",
        createdAt: Date.now() - 3600000, likes: 0, comments: [],
      }];
      state.userPosts = [];
      saveState();
    });

    await page.evaluate(() => sharePostInFeed("post_ordinaire"));
    await page.waitForTimeout(1200);

    const texte = await page.evaluate(() => {
      const p = (state.userPosts || []).find((x) => x.sharedReel === "post_ordinaire");
      return p ? p.text : null;
    });
    expect(texte).toContain("Café d'Or & Cie");
    expect(texte).toContain("Léa d'Ys");
    expect(texte).not.toMatch(/&(amp|#39|quot|lt|gt);/);
  });
});
