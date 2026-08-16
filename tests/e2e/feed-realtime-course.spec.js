// ═══════════════════════════════════════════════════════════════════════════
// FIL — un post reçu en temps réel ne doit pas être effacé par une requête
// partie AVANT lui.
//
// Scénario multi-appareil n° 1 de l'analyse croisée (« ordonnancement
// fetch/realtime »), le plus classique des deux :
//
//   T1  le rafraîchissement périodique interroge le serveur
//   T2  un autre compte publie ; le post arrive par le canal temps réel
//   T3  la réponse de T1 revient — SANS le post, il n'existait pas encore
//   T4  `state.supabasePosts = posts.concat(extra)` écrase le tableau
//
// Le post s'affichait puis s'effaçait, jusqu'au cycle de rafraîchissement
// suivant. Auto-réparant, donc jamais signalé comme perte — mais visible, et
// exactement le genre de scintillement qui fait douter de l'application.
//
// `_feedExtraPosts` existe précisément pour survivre à cet écrasement (il
// protégeait déjà les pages de pagination). Le handler temps réel ne
// l'alimentait pas.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("Fil — course entre requête en vol et temps réel", () => {
  test("un post arrivé en temps réel survit à la réponse d'une requête plus ancienne", async ({ page }) => {
    test.setTimeout(90000);
    await bootOnboarded(page);
    await page.waitForFunction(
      () => typeof state !== "undefined" && !!state && typeof renderFeed === "function",
      null, { timeout: 20000 },
    );

    const r = await page.evaluate(() => {
      // État de départ : deux posts déjà connus, tableau de garde vide.
      state.supabasePosts = [
        { id: "p_ancien_1", authorId: "u_x", passion: "photo", text: "un" },
        { id: "p_ancien_2", authorId: "u_y", passion: "photo", text: "deux" },
      ];
      window._feedExtraPosts = [];

      // T2 — arrivée temps réel, par la VRAIE fonction du handler. Recopier sa
      // logique ici rendrait ce test creux : il passerait même si le correctif
      // était retiré du code de production.
      const nouveau = { id: "p_temps_reel", authorId: "u_z", passion: "photo", text: "arrivé en direct", fromSupabase: true };
      const ajoute = feedAddRealtimePost(nouveau);
      const reAjout = feedAddRealtimePost(nouveau);   // idempotence

      // T3/T4 — la réponse de la requête partie AVANT revient et écrase, avec
      // exactement le code de startFeedRefreshLoop.
      const instantaneServeur = [
        { id: "p_ancien_1", authorId: "u_x", passion: "photo", text: "un" },
        { id: "p_ancien_2", authorId: "u_y", passion: "photo", text: "deux" },
      ];
      const extra = (window._feedExtraPosts || []).filter((p) => !instantaneServeur.some((x) => x.id === p.id));
      state.supabasePosts = instantaneServeur.concat(extra);

      return {
        ids: state.supabasePosts.map((p) => p.id),
        survit: state.supabasePosts.some((p) => p.id === "p_temps_reel"),
        doublons: state.supabasePosts.length !== new Set(state.supabasePosts.map((p) => p.id)).size,
        ajoute, reAjout,
      };
    });

    expect(r.ajoute, "le post doit être accepté à la première réception").toBe(true);
    expect(r.reAjout, "une seconde réception du même post doit être ignorée").toBe(false);
    expect(r.survit, `post temps réel effacé par la requête en vol — ids restants : ${JSON.stringify(r.ids)}`).toBe(true);
    expect(r.doublons, "le tableau de garde ne doit pas introduire de doublon").toBe(false);
  });

  test("une fois l'instantané serveur à jour, le post n'est pas dupliqué", async ({ page }) => {
    // La contre-épreuve : `_feedExtraPosts` conserve le post indéfiniment. Si le
    // filtrage par id ne jouait pas, chaque rafraîchissement l'ajouterait une
    // fois de plus — on remplacerait un scintillement par une accumulation.
    test.setTimeout(90000);
    await bootOnboarded(page);
    await page.waitForFunction(() => typeof state !== "undefined" && !!state, null, { timeout: 20000 });

    const r = await page.evaluate(() => {
      window._feedExtraPosts = [{ id: "p_temps_reel", authorId: "u_z", passion: "photo", text: "arrivé en direct" }];
      // Trois cycles successifs, l'instantané contenant DÉSORMAIS le post.
      const instantane = [
        { id: "p_ancien_1", authorId: "u_x", passion: "photo", text: "un" },
        { id: "p_temps_reel", authorId: "u_z", passion: "photo", text: "arrivé en direct" },
      ];
      for (let i = 0; i < 3; i++) {
        const extra = (window._feedExtraPosts || []).filter((p) => !instantane.some((x) => x.id === p.id));
        state.supabasePosts = instantane.concat(extra);
      }
      const ids = state.supabasePosts.map((p) => p.id);
      return { ids, occurrences: ids.filter((x) => x === "p_temps_reel").length };
    });

    expect(r.occurrences, `post présent ${r.occurrences} fois — ids : ${JSON.stringify(r.ids)}`).toBe(1);
  });
});
