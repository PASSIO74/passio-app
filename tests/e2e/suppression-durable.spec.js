// ═══════════════════════════════════════════════════════════════════════════
// SUPPRESSION DURABLE D'UNE PUBLICATION
//
// Défaut signalé le 2026-09-01, après un essai réel : « j'ai publié mon
// contenu et tout l'ancien contenu que j'avais supprimé est ressorti dans le
// fil ». Trois causes se cumulaient, aucune visible depuis l'écran :
//
//   ① `deletePost` ne retirait la publication que de `userPosts` et de
//      `seed.posts`. Ni `supabasePosts` (la copie SERVEUR du même post), ni
//      `window._feedExtraPosts` (le tampon anti-écrasement du rafraîchissement)
//      n'étaient touchés — et `startFeedRefreshLoop` réinjecte indéfiniment
//      toute entrée d'`extra` que le serveur ne renvoie plus.
//   ② la suppression serveur partait en `.then(()=>{}).catch(()=>{})` : ni
//      erreur lue, ni lignes comptées, ni garde `window._supaReal`. Envoyée au
//      stub noop (SDK pas encore chargé, réseau coupé) elle rendait
//      `{ data: [], error: null }` — un faux succès, et personne ne réessayait.
//   ③ `publishPost` recopiait ENSUITE toute la page serveur dans
//      `state.seed.posts` : d'où la réapparition EN BLOC, pile au moment de la
//      publication.
//
// Chaque cas ci-dessous vise UNE de ces causes, plus les voies de retour
// (temps réel, blob de synchronisation périmé, rechargement).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Attend que l'application soit réellement là : `state` vaut `null` (pas
// `undefined`) jusqu'à `state = loadState()` dans boot().
async function attendreApp(page) {
  await page.waitForFunction(
    () => typeof state !== "undefined" && !!state
      && typeof deletePost === "function" && typeof allFeedPosts === "function",
    null, { timeout: 20000 },
  );
}

test.describe("Suppression durable d'une publication", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await bootOnboarded(page);
    await attendreApp(page);
    // Publication qui m'appartient, posée dans les TROIS tableaux à la fois —
    // exactement l'état d'un post publié puis relu depuis le serveur. Définie
    // dans la page (et non dans le fichier de test) : `page.evaluate` s'exécute
    // dans le navigateur, où une fonction du contexte Node n'existe pas.
    await page.evaluate(() => {
      window.POSER_POST = function () {
        window._supaReal = false;              // aucune requête ne part d'ici
        const p = {
          id: "post_suppr_test", authorId: MY_UID, authorName: "Audit QA",
          passion: "musique", mood: "all", type: "text", text: "à supprimer",
          createdAt: Date.now(), likes: 0, comments: [],
        };
        state.userPosts = [Object.assign({}, p)];
        state.supabasePosts = [Object.assign({}, p, { fromSupabase: true })];
        window._feedExtraPosts = [Object.assign({}, p, { fromSupabase: true })];
        state.deletedPostIds = [];
        try { localStorage.removeItem("passio_post_delete_outbox_v1"); } catch (e) {}
        return p.id;
      };
    });
  });

  // ── Cause ① ─────────────────────────────────────────────────────────────
  test("supprimer retire la publication des QUATRE tableaux, pas seulement de userPosts", async ({ page }) => {
    const r = await page.evaluate(() => {
      const id = POSER_POST();
      deletePost(id);
      return {
        dansUserPosts: (state.userPosts || []).some((p) => p.id === id),
        dansSupabasePosts: (state.supabasePosts || []).some((p) => p.id === id),
        dansExtra: (window._feedExtraPosts || []).some((p) => p.id === id),
        dansSeed: (state.seed.posts || []).some((p) => p.id === id),
        dansFil: allFeedPosts().some((p) => p.id === id),
        pierreTombale: postSupprime(id),
      };
    });
    expect(r.dansUserPosts).toBe(false);
    expect(r.dansSupabasePosts).toBe(false);   // ← le tableau oublié par l'ancien code
    expect(r.dansExtra).toBe(false);           // ← celui qui réinjectait en boucle
    expect(r.dansSeed).toBe(false);
    expect(r.dansFil).toBe(false);
    expect(r.pierreTombale).toBe(true);
  });

  test("une page serveur qui renvoie la publication supprimée ne la fait pas revenir", async ({ page }) => {
    const r = await page.evaluate(() => {
      const id = POSER_POST();
      deletePost(id);
      // Le serveur n'a pas encore effacé la ligne (suppression en file) et la
      // renvoie dans la page suivante. C'est le cas RÉEL du défaut.
      state.supabasePosts = [{ id: id, authorId: MY_UID, passion: "musique", text: "revenu du serveur", createdAt: Date.now() }];
      state.seed.posts = (state.seed.posts || []).concat([{ id: id, authorId: MY_UID, passion: "musique", text: "revenu du serveur", createdAt: Date.now() }]);
      return { dansFil: allFeedPosts().some((p) => p.id === id) };
    });
    expect(r.dansFil).toBe(false);
  });

  test("le temps réel ne réinjecte pas une publication supprimée", async ({ page }) => {
    const r = await page.evaluate(() => {
      const id = POSER_POST();
      deletePost(id);
      const accepte = feedAddRealtimePost({ id: id, authorId: MY_UID, passion: "musique", text: "echo", createdAt: Date.now() });
      return {
        accepte: accepte,
        dansExtra: (window._feedExtraPosts || []).some((p) => p.id === id),
        dansSupabasePosts: (state.supabasePosts || []).some((p) => p.id === id),
      };
    });
    expect(r.accepte).toBe(false);
    expect(r.dansExtra).toBe(false);
    expect(r.dansSupabasePosts).toBe(false);
  });

  // ── Cause ③ ─────────────────────────────────────────────────────────────
  test("publier ne déverse plus la page serveur dans le contenu de démonstration", async ({ page }) => {
    const r = await page.evaluate(async () => {
      window._supaReal = false;
      state.deletedPostIds = [];
      const demoAvant = (state.seed.posts || []).map((p) => p.id);

      // La page que le serveur rendra après la publication : elle contient une
      // publication d'un AUTRE compte. Avant le correctif, elle atterrissait
      // dans `state.seed.posts`, en écrasant tout le contenu de démonstration.
      window.supaLoadPosts = async () => ([
        { id: "post_venu_du_serveur", authorId: "u_autre", passion: "musique", type: "text", text: "page serveur", createdAt: Date.now(), likes: 0, comments: [] },
      ]);
      window.supaPublishPostWithRetry = async () => true;

      goTo("studio");
      renderStudio();
      document.getElementById("postText").value = "un vrai essai de publication";
      const sel = document.getElementById("postPassion");
      sel.value = "musique";
      await publishPost();

      return {
        demoIntact: demoAvant.every((id) => (state.seed.posts || []).some((p) => p.id === id)),
        seedNePorteRienDuServeur: !(state.seed.posts || []).some((p) => p.id === "post_venu_du_serveur"),
        serveurDansSupabasePosts: (state.supabasePosts || []).some((p) => p.id === "post_venu_du_serveur"),
      };
    });
    expect(r.demoIntact).toBe(true);
    expect(r.seedNePorteRienDuServeur).toBe(true);
    expect(r.serveurDansSupabasePosts).toBe(true);
  });

  // ── Voies de retour ────────────────────────────────────────────────────
  test("un blob de synchronisation antérieur à la suppression ne ressuscite rien", async ({ page }) => {
    const r = await page.evaluate(() => {
      const id = POSER_POST();
      deletePost(id);
      // Blob écrit AVANT la suppression (autre appareil, ou envoi rejoué) : il
      // porte encore le post et une liste de suppressions VIDE. La recopie brute
      // de ses clés effaçait la pierre tombale — et le post revenait au
      // rafraîchissement suivant.
      _applyUserState({
        userPosts: [{ id: id, authorId: MY_UID, passion: "musique", text: "blob périmé", createdAt: Date.now() }],
        deletedPostIds: [],
        user: state.user,
      });
      return {
        pierreTombale: postSupprime(id),
        dansUserPosts: (state.userPosts || []).some((p) => p.id === id),
        dansFil: allFeedPosts().some((p) => p.id === id),
      };
    });
    expect(r.pierreTombale).toBe(true);
    expect(r.dansUserPosts).toBe(false);
    expect(r.dansFil).toBe(false);
  });

  test("la suppression survit à un rechargement complet de l'application", async ({ page }) => {
    const id = await page.evaluate(() => {
      const id = POSER_POST();
      deletePost(id);
      saveStateNow();
      return id;
    });
    await page.reload();
    await attendreApp(page);
    const r = await page.evaluate((id) => {
      // Le serveur renvoie encore la publication après le rechargement.
      state.supabasePosts = [{ id: id, authorId: MY_UID, passion: "musique", text: "encore là", createdAt: Date.now() }];
      return { pierreTombale: postSupprime(id), dansFil: allFeedPosts().some((p) => p.id === id) };
    }, id);
    expect(r.pierreTombale).toBe(true);
    expect(r.dansFil).toBe(false);
  });

  // ── Cause ② ─────────────────────────────────────────────────────────────
  test("une suppression serveur qui ne peut pas aboutir est mise en file, pas perdue", async ({ page }) => {
    const r = await page.evaluate(() => {
      const id = POSER_POST();          // pose déjà window._supaReal = false
      deletePost(id);
      let file = [];
      try { file = JSON.parse(localStorage.getItem("passio_post_delete_outbox_v1") || "[]"); } catch (e) {}
      return { enFile: file.some((o) => o.postId === id), taille: file.length };
    });
    expect(r.enFile).toBe(true);
    expect(r.taille).toBe(1);
  });

  // ── Le bouton qui donne accès à la suppression ──────────────────────────
  test("le menu d'options reste sur MA publication quand c'est la copie serveur qui s'affiche", async ({ page }) => {
    const r = await page.evaluate(() => {
      window._supaReal = false;
      const p = { id: "post_a_moi", authorId: MY_UID, passion: "musique", type: "text", text: "à moi", createdAt: Date.now(), likes: 0, comments: [] };
      state.userPosts = [Object.assign({}, p)];
      state.supabasePosts = [Object.assign({}, p, { fromSupabase: true })];
      state.deletedPostIds = [];
      // `allFeedPosts` dédoublonne seed → supabase → me : c'est la copie
      // SERVEUR qui est affichée, avec `_source === "supabase"`. L'ancien test
      // `p._source === "me"` faisait donc disparaître le « ⋯ » de mon propre post.
      const affiche = allFeedPosts().find((x) => x.id === "post_a_moi");
      return {
        sourceAffichee: affiche && affiche._source,
        mien: _estMonPost(affiche),
        pasLeContenuDeDemo: _estMonPost({ id: "p1", authorId: "u_lea", _source: "seed" }),
      };
    });
    expect(r.sourceAffichee).toBe("supabase");
    expect(r.mien).toBe(true);
    expect(r.pasLeContenuDeDemo).toBe(false);
  });
});
