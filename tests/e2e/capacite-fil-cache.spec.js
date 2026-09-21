const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Le navigateur exécute les chargeurs et la pagination du produit. Ce serveur
// miniature expose des pages brutes (dont des lignes cachées), des changements
// concurrents et des refus ; aucun compte ni média distant n'est créé.
async function preparer(page, n = 55) {
  await bootOnboarded(page);
  await page.evaluate((total) => {
    stopFeedRefreshLoop();
    _clearProfileCache();
    _feedPagination = null;
    window._feedRenderLimit = 20;
    window._feedExtraPosts = [];
    state.supabasePosts = [];
    window.__lectures = [];
    window.__erreurProfil = false;
    window.__lignes = Array.from({ length: total }, (_, i) => ({
      id: "capacite_" + String(total - i).padStart(3, "0"),
      author_id: "auteur_capacite", passion_id: "photo", mood: "creation",
      content: "Publication " + i, created_at: "2026-09-20T12:00:00", media_url: null,
      profiles: { username: "Auteur", emoji: "📷", color: "#123456", avatar_url: null, is_private: i < 5 },
    }));
    window.__profil = { id: "auteur_commentaire", username: "Camille", emoji: "📷", color: "#123456",
      avatar_url: null, passion_id: "photo", passions: [], bio: "Une bio" };
    // ⚠️ Le banc ne dépend PAS de l'état du projet distant (2026-09-21) :
    // `fil_compteurs` appliquée sur staging, le vrai `supa.rpc` répondait
    // et le fil ne lisait plus `post_likes` — trois cas « hydratation
    // périmée » attendaient une lecture qui ne venait plus (3 × 45 s en CI).
    // Le RPC est simulé : absent par défaut (chemin d'avant, ce que ces cas
    // mesurent), présent pour le cas `compte_pendant_rpc`.
    sessionStorage.removeItem("passio_fil_compteurs_absente");
    window.__rpcPresent = false;
    supa.rpc = function (fn, args) {
      const req = { table: "rpc/" + fn, ids: (args && args._post_ids) || [] };
      const res = window.__rpcPresent
        ? { data: req.ids.map((id) => ({ post_id: id, likes: 0, aime: false, commentaires: 0, apercus: [], reactions: [] })), error: null }
        : { data: null, error: { code: "PGRST202", message: "Could not find the function public.fil_compteurs (banc)" } };
      return { then: (ok, ko) => { window.__lectures.push(req); return Promise.resolve(window.__retenirReponse ? window.__retenirReponse(req, res) : res).then(ok, ko); } };
    };
    supa.from = function (table) {
      const req = { table, orders: [] };
      const q = {
        select: (cols) => { req.cols = cols; return q; },
        eq: (col, value) => { req.eq = [col, value]; return q; },
        in: (col, values) => { req.ids = values.slice(); return q; },
        order: (col) => { req.orders.push(col); return q; },
        limit: (value) => { req.limit = value; return q; },
        range: (from, to) => { req.range = [from, to]; return q; },
        or: (filter) => { req.or = filter; return q; },
        then: (ok, ko) => {
          window.__lectures.push(req);
          const rendre = (res) => Promise.resolve(window.__retenirReponse ? window.__retenirReponse(req, res) : res).then(ok, ko);
          if (table === "profiles") {
            return rendre(window.__erreurProfil
              ? { data: null, error: { message: "permission denied" } }
              : { data: req.ids.includes(window.__profil.id) ? [{ ...window.__profil }] : [], error: null });
          }
          if (table !== "posts") return rendre({ data: [], error: null });
          let rows = window.__lignes.slice();
          if (req.eq) rows = rows.filter((row) => row[req.eq[0]] === req.eq[1]);
          rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
          if (req.or) {
            const match = /^created_at\.lt\.("[^"]+"),and\(created_at\.eq\."[^"]+",id\.lt\.("[^"]+")\)$/.exec(req.or);
            if (!match) throw new Error("Curseur PostgREST mal formé : " + req.or);
            const date = JSON.parse(match[1]), id = JSON.parse(match[2]);
            rows = rows.filter((row) => row.created_at < date || (row.created_at === date && row.id < id));
          }
          rows = rows.slice(req.range[0], req.range[1] + 1);
          req.rows = rows.length;
          return rendre({ data: rows, error: null });
        },
      };
      return q;
    };
  }, n);
}

test("premier lot réseau de 20 lignes ; le profil visité conserve sa page de 60", async ({ page }) => {
  await preparer(page, 80);
  const r = await page.evaluate(async () => {
    const posts = await supaLoadPosts();
    const curseur = JSON.stringify(_feedPagination);
    await supaLoadPosts(0, "auteur_capacite");
    return { affichables: posts.length, curseurConserve: curseur === JSON.stringify(_feedPagination),
      requetes: __lectures.filter((q) => q.table === "posts") };
  });
  expect(r.affichables).toBe(15);
  expect(r.requetes.map((q) => q.range)).toEqual([[0, 19], [0, 59]]);
  expect(r.requetes[0].orders).toEqual(["created_at", "id"]);
  expect(r.curseurConserve).toBe(true);
});

test("pagination sans trou après filtre privé et insertion temps réel, même en double clic", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    __lignes.unshift({ ...__lignes[5], id: "capacite_nouveau", created_at: "2026-09-20T13:00:00" });
    feedAddRealtimePost({ id: "capacite_nouveau", authorId: "auteur_capacite", passion: "photo", text: "En direct" });
    await Promise.all([loadMoreFeedPosts(), loadMoreFeedPosts()]);
    await loadMoreFeedPosts();
    const pagesAvantRefresh = __lectures.filter((q) => q.table === "posts").length;
    return { ids: state.supabasePosts.map((p) => p.id), more: window._feedServerMayHaveMore,
      pagesAvantRefresh, pages: __lectures.filter((q) => q.table === "posts") };
  });
  expect(r.ids.length).toBe(51); // 55 - 5 privés + 1 reçu en direct
  expect(new Set(r.ids).size).toBe(51);
  expect(r.ids).toContain("capacite_001");
  expect(r.pagesAvantRefresh).toBe(3);
  expect(r.pages[1].or).toContain('id.lt."capacite_036"');
  expect(r.more).toBe(false);
});

test("une nouvelle tête ne perd ni la queue déjà lue ni les posts entre deux pages", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    await loadMoreFeedPosts();
    const dejaLus = state.supabasePosts.map(p => p.id);
    const nouveaux = Array.from({ length: 35 }, (_, i) => ({ ...__lignes[5],
      id: "nouveau_" + String(i).padStart(3, "0"), created_at: "2026-09-21T12:00:00" }));
    __lignes.unshift(...nouveaux);
    const tete = await supaLoadPosts();
    state.supabasePosts = tete.concat(window._feedExtraPosts);
    const preserves = dejaLus.every(id => state.supabasePosts.some(p => p.id === id));
    for (let i = 0; i < 10 && window._feedServerMayHaveMore; i++) await loadMoreFeedPosts();
    const avant = JSON.stringify(_feedPagination);
    await supaLoadPosts(); // tête désormais inchangée : aucun retour au début
    return { preserves, ids: state.supabasePosts.map(p => p.id), stable: avant === JSON.stringify(_feedPagination),
      more: window._feedServerMayHaveMore };
  });
  expect(r.preserves).toBe(true);
  expect(r.ids.length).toBe(85); // 50 visibles au départ, puis 35 nouveaux
  expect(new Set(r.ids).size).toBe(85);
  expect(r.stable).toBe(true);
  expect(r.more).toBe(false);
});

test("une page entièrement filtrée laisse accéder aux publications suivantes", async ({ page }) => {
  await preparer(page, 25);
  const r = await page.evaluate(async () => {
    __lignes.forEach((p, i) => { p.profiles = { ...p.profiles, is_private: i < 20 }; });
    const debut = await supaLoadPosts();
    state.supabasePosts = debut;
    await loadMoreFeedPosts();
    return { debut: debut.length, ids: state.supabasePosts.map((p) => p.id), more: window._feedServerMayHaveMore };
  });
  expect(r.debut).toBe(0);
  expect(r.ids).toEqual(["capacite_005", "capacite_004", "capacite_003", "capacite_002", "capacite_001"]);
  expect(r.more).toBe(false);
});

test("une ancienne page en vol ne remplace pas le curseur d'une tête rafraîchie", async ({ page }) => {
  await preparer(page, 80);
  const r = await page.evaluate(async () => {
    __lignes.forEach(p => { p.profiles.is_private = false; });
    state.supabasePosts = await supaLoadPosts();
    let signaler, liberer, retenir = true;
    const commencee = new Promise(resolve => { signaler = resolve; });
    window.__retenirReponse = (req, res) => {
      if (retenir && req.table === "posts" && req.or) {
        retenir = false;
        signaler();
        return new Promise(resolve => { liberer = () => resolve(res); });
      }
      return res;
    };
    const anciennePage = loadMoreFeedPosts();
    await commencee;
    __lignes.unshift(...Array.from({ length: 30 }, (_, i) => ({ ...__lignes[0],
      id: "nouveau_" + String(i).padStart(3, "0"), created_at: "2026-09-21T12:00:00" })));
    const tete = await supaLoadPosts();
    state.supabasePosts = tete.concat(window._feedExtraPosts);
    const frontiere = _feedPagination.cursor.id;
    liberer();
    await anciennePage;
    const frontiereApresAncienne = _feedPagination.cursor.id;
    for (let i = 0; i < 10 && window._feedServerMayHaveMore; i++) await loadMoreFeedPosts();
    return { frontiere, frontiereApresAncienne, ids: state.supabasePosts.map(p => p.id) };
  });
  expect(r.frontiereApresAncienne).toBe(r.frontiere);
  expect(r.ids).toHaveLength(110);
  expect(new Set(r.ids).size).toBe(110);
});

for (const course of ["compte_pendant_likes", "purge_pendant_likes", "generation_pendant_profils", "compte_pendant_rpc"]) {
  test("une hydratation devenue périmée ne publie ni posts ni profils : " + course, async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async (scenario) => {
      if (scenario === "compte_pendant_rpc") window.__rpcPresent = true;
      let signaler, liberer;
      const commencee = new Promise(resolve => { signaler = resolve; });
      window.__retenirReponse = (req, res) => {
        if (req.table === "post_comments") res = { data: [{ id: "commentaire_retarde", post_id: "capacite_050",
          author_id: __profil.id, content: "Commentaire", created_at: "2026-09-20T12:00:00" }], error: null };
        const table = scenario === "generation_pendant_profils" ? "profiles" : (scenario === "compte_pendant_rpc" ? "rpc/fil_compteurs" : "post_likes");
        if (req.table === table) {
          signaler();
          return new Promise(resolve => { liberer = () => resolve(res); });
        }
        return res;
      };
      const lecture = supaLoadPosts(0, null, { generation: _feedRefreshGeneration });
      await commencee;
      if (scenario === "compte_pendant_likes" || scenario === "compte_pendant_rpc") MY_UID = "autre_compte";
      if (scenario === "generation_pendant_profils") stopFeedRefreshLoop();
      else _clearProfileCache();
      _feedPagination = null;
      window._feedExtraPosts = [];
      liberer();
      const resultat = await lecture;
      return { resultat, tailleCache: _profileCache.size, pagination: _feedPagination };
    }, course);
    expect(r).toEqual({ resultat: [], tailleCache: 0, pagination: null });
  });
}

test("profils : requête initiale unique, cache borné, modification reçue et données partielles", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    await _resolveProfilesByIds([__profil.id, __profil.id]);
    await _resolveProfilesByIds([__profil.id]);
    const appelsApresCache = __lectures.filter((q) => q.table === "profiles").length;
    cacheRemoteProfile({ ...__profil, username: "Nouveau nom" }); // chemin du handler profiles UPDATE
    cacheRemoteProfile({ id: __profil.id, username: "Nouveau nom" }); // embed partiel
    const frais = await _resolveProfilesByIds([__profil.id]);
    _profileCache.get(__profil.id).resolvedAt -= 121000;
    __profil.username = "Après expiration";
    const expire = await _resolveProfilesByIds([__profil.id]);
    return { appelsApresCache, nom: frais[__profil.id].username, bio: frais[__profil.id].bio,
      nomExpire: expire[__profil.id].username, appels: __lectures.filter((q) => q.table === "profiles").length };
  });
  expect(r).toEqual({ appelsApresCache: 1, nom: "Nouveau nom", bio: "Une bio", nomExpire: "Après expiration", appels: 2 });
});

test("la passion d'un post ne remplace pas la passion du profil en cache", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    __profil.id = "auteur_capacite";
    __profil.passion_id = "musique";
    await _resolveProfilesByIds([__profil.id]);
    await supaLoadPosts(); // les publications sont classées dans la passion photo
    const profil = (await _resolveProfilesByIds([__profil.id]))[__profil.id];
    return { passion: profil.passion_id, appels: __lectures.filter(q => q.table === "profiles").length };
  });
  expect(r).toEqual({ passion: "musique", appels: 1 });
});

test("un refus de profil ne remplit pas le cache, un nouveau compte doit relire", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    __erreurProfil = true;
    const refus = await _resolveProfilesByIds([__profil.id]);
    __erreurProfil = false;
    await _resolveProfilesByIds([__profil.id]);
    MY_UID = "compte_suivant";
    await _resolveProfilesByIds([__profil.id]);
    return { refus, appels: __lectures.filter((q) => q.table === "profiles").length };
  });
  expect(r.refus).toEqual({});
  expect(r.appels).toBe(3);
});

test("une réponse de profil lancée avant la purge ne repeuple pas le cache", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    let liberer;
    supa.from = () => {
      const q = { select: () => q, in: () => new Promise((resolve) => { liberer = resolve; }) };
      return q;
    };
    const lecture = _resolveProfilesByIds([__profil.id]);
    _clearProfileCache();
    liberer({ data: [__profil], error: null });
    const resultat = await lecture;
    return { resultat, taille: _profileCache.size };
  });
  expect(r).toEqual({ resultat: {}, taille: 0 });
});

test("le filet ne lit pas hors du fil et le retour recharge immédiatement une seule fois", async ({ page }) => {
  await preparer(page);
  await page.evaluate(async () => {
    window.__toursFil = 0;
    window._supaReal = true;
    window.supaLoadPosts = async () => { window.__toursFil++; return []; };
    goTo("feed");
    startFeedRefreshLoop();
    await _feedRefreshTour();
    goTo("messages");
    await _feedRefreshTour();
  });
  expect(await page.evaluate(() => window.__toursFil)).toBe(1);
  await page.evaluate(() => { goTo("feed"); feedFiletReveiller(true); });
  await expect.poll(() => page.evaluate(() => window.__toursFil)).toBe(2);
  await page.evaluate(() => stopFeedRefreshLoop());
});

test("aucune requête du filet sous onglet masqué ou rechargement annoncé", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    let appels = 0;
    window.supaLoadPosts = async () => { appels++; return []; };
    goTo("feed");
    startFeedRefreshLoop();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    await _feedRefreshTour();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    window._rechargementImminent = true;
    await _feedRefreshTour();
    stopFeedRefreshLoop();
    return appels;
  });
  expect(r).toBe(0);
});

test("stop/start pendant une lecture lente réarme le nouveau cycle après la réponse ancienne", async ({ page }) => {
  await preparer(page);
  await page.evaluate(async () => {
    window.__toursApresReprise = 0;
    window._supaReal = true;
    window.supaLoadPosts = () => {
      window.__toursApresReprise++;
      if (window.__toursApresReprise === 1) return new Promise(resolve => { window.__finAncienneLecture = resolve; });
      return Promise.resolve([]);
    };
    goTo("feed");
    startFeedRefreshLoop();
    const ancien = _feedRefreshTour();
    stopFeedRefreshLoop();
    startFeedRefreshLoop();
    await _feedRefreshTour(); // rendez-vous du nouveau cycle, ancien encore en vol
    window.__finAncienneLecture([]);
    await ancien;
  });
  await expect.poll(() => page.evaluate(() => window.__toursApresReprise)).toBe(2);
  await page.evaluate(() => stopFeedRefreshLoop());
});
