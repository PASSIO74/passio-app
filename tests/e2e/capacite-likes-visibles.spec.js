const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Vrai rendu/réveil du produit, horloge navigateur et serveur HEAD contrôlé.
// Aucune donnée distante ni écriture réelle : les barrières retiennent les
// réponses pour reproduire les courses qu'un test de fonctions pures manquerait.
async function preparer(page, count = 1, initialRandom = 0) {
  await bootOnboarded(page);
  await page.clock.install();
  await page.evaluate(({ n, initialRandom }) => {
    stopFeedRefreshLoop();
    stopPostLikeRefresh();
    _postLikeRefreshNextAt = 0;
    _postLikeRefreshPhaseIdentity = null;
    _postLikeRefreshEntries.clear();
    // Rendre les courses existantes déterministes ; les nouveaux cas ci-dessous
    // exercent explicitement le milieu et la borne haute du déphasage initial.
    Math.random = () => initialRandom;
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b";
    window.MY_UID = MY_UID;
    state.user.likedPosts = [];
    state.user.blocked = [];
    window._supaReal = true;
    window._rechargementImminent = false;
    window.requireAuthentication = () => true;
    window.supaTrack = async () => null;
    window.supaInsertNotif = async () => null;
    window.__headReads = [];
    window.__counts = {};
    window.__hold = null;
    window.__writeResolvers = [];
    window.__writes = [];
    window.supaSetPostLike = (id, want) => {
      window.__writes.push({ id, want });
      return new Promise(resolve => window.__writeResolvers.push(resolve));
    };
    state.supabasePosts = Array.from({ length: n }, (_, i) => ({
      id: "visible_like_" + i, authorId: "auteur_visible", passion: "musique", mood: "all",
      text: "Publication " + i, likes: 4, liked: false, comments: [], fromSupabase: true,
      createdAt: Date.now(), type: "text",
    }));
    state.supabasePosts.forEach(p => { __counts[p.id] = 7; });
    const stage = document.createElement("div");
    stage.id = "likes-test-stage";
    stage.style.cssText = "position:fixed;inset:90px 20px 90px;overflow:auto;z-index:250000;background:white;";
    document.body.appendChild(stage);
    const style = document.createElement("style");
    style.textContent = "#likes-test-stage .post {height:100px!important;min-height:100px!important;overflow:hidden;content-visibility:visible!important;contain-intrinsic-size:none!important;margin:0!important;animation:none!important;} #likes-test-stage .post-header{display:none} #likes-test-stage .post-body{padding:2px}";
    document.head.appendChild(style);
    stage.innerHTML = state.supabasePosts.map(renderPostHTML).join("");
    supa.from = function (table) {
      const req = { table };
      const q = {
        select: (cols, options) => { req.cols = cols; req.options = options; return q; },
        eq: (col, value) => { req.col = col; req.id = value; return q; },
        abortSignal: (signal) => { req.signal = signal; return q; },
        then: (yes, no) => {
          if (table !== "post_likes" || !req.options || !req.options.head) return Promise.resolve({ data: [], error: null }).then(yes, no);
          __headReads.push({ table, cols: req.cols, options: req.options, col: req.col, id: req.id, at: Date.now() });
          const result = { data: null, count: __counts[req.id], error: null };
          return Promise.resolve(__hold ? __hold(req, result) : result).then(yes, no);
        },
      };
      return q;
    };
    startPostLikeRefresh();
  }, { n: count, initialRandom });
}

async function passer(page, ms = 17000) {
  await page.clock.fastForward(ms);
  await page.evaluate(() => Promise.resolve());
}
async function lectures(page) { return page.evaluate(() => __headReads); }

test("phase initiale fixe : scroll, visibilité et stop/start ne la retirent ni ne la repoussent", async ({ page }) => {
  await preparer(page, 3, 0.5);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const debut = await page.evaluate(() => ({ due: _postLikeRefreshNextAt, delay: _postLikeRefreshStats.initialDelayMs }));
  expect(debut.delay).toBe(7500);
  await passer(page, 2000);
  await page.evaluate(() => {
    Math.random = () => { throw new Error("la phase ne doit pas être retirée"); };
    for (let i = 0; i < 12; i++) document.dispatchEvent(new Event("scroll"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    stopPostLikeRefresh(); startPostLikeRefresh();
  });
  expect(await page.evaluate(() => _postLikeRefreshNextAt)).toBe(debut.due);
  await passer(page, await page.evaluate(due => due - Date.now() - 1, debut.due));
  expect(await lectures(page)).toHaveLength(0);
  await page.evaluate(() => { Math.random = () => 0; });
  await passer(page, 1);
  expect(await lectures(page)).toHaveLength(3);
  await passer(page, 14999);
  expect(await lectures(page)).toHaveLength(3);
  await passer(page, 1);
  expect(await lectures(page)).toHaveLength(6);
});

test("phase initiale haute de14999ms, premier compteur et clic local immédiat", async ({ page }) => {
  await preparer(page, 1, 0.99999);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  expect(await page.evaluate(() => _postLikeRefreshStats.initialDelayMs)).toBe(14999);
  await page.locator('#likes-test-stage [data-action="like"]').click();
  await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText("❤️ 5");
  await page.evaluate(() => __writeResolvers.shift()({ ok: true }));
  expect(await lectures(page)).toHaveLength(0);
  await passer(page, await page.evaluate(() => _postLikeRefreshNextAt - Date.now() - 1));
  expect(await lectures(page)).toHaveLength(0);
  await passer(page, 1);
  expect(await lectures(page)).toHaveLength(1);
  await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText("❤️ 7");
});

test("aucune phase anonyme ou cachée ; connexion visible et nouveau compte ont chacun leur échéance", async ({ page }) => {
  await preparer(page, 1, 0.5);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.evaluate(() => {
    stopPostLikeRefresh(); _postLikeRefreshPhaseIdentity = null; _postLikeRefreshNextAt = 0;
    MY_UID = "u_visiteur_phase";
    window.__tirages = 0; Math.random = () => { __tirages++; return 0.5; };
    startPostLikeRefresh();
  });
  await passer(page, 20000);
  expect(await page.evaluate(() => __tirages)).toBe(0);
  expect(await lectures(page)).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b"; startPostLikeRefresh();
  });
  await passer(page, 20000);
  expect(await page.evaluate(() => __tirages)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => ({ draws: __tirages, delay: _postLikeRefreshNextAt - Date.now() }))).toEqual({ draws: 1, delay: 7500 });
  await passer(page, 5000);
  await page.evaluate(() => { MY_UID = "a09a84a8-b188-45bb-93f4-82648a2973f3"; startPostLikeRefresh(); });
  expect(await page.evaluate(() => ({ draws: __tirages, delay: _postLikeRefreshNextAt - Date.now() }))).toEqual({ draws: 2, delay: 7500 });
  // Visiter l'ancien timer à SA date, puis la nouvelle échéance : un seul
  // grand saut le déplacerait artificiellement juste avant cette dernière.
  await passer(page, await page.evaluate(() => _postLikeRefreshDueAt - Date.now()));
  expect(await lectures(page)).toHaveLength(0);
  await passer(page, await page.evaluate(() => _postLikeRefreshNextAt - Date.now() - 1));
  expect(await lectures(page)).toHaveLength(0);
  await passer(page, 1);
  expect(await lectures(page)).toHaveLength(1);
});

test("HEAD exact, compteur supérieur à1000, retrait à zéro et état aimé conservé", async ({ page }) => {
  await preparer(page);
  expect(await page.evaluate(() => ({ visibles: _postLikeVisibleIds(), running: _postLikeRefreshRunning }))).toEqual({ visibles: ["visible_like_0"], running: true });
  await page.evaluate(() => {
    state.user.likedPosts = ["visible_like_0"];
    state.supabasePosts[0].liked = true;
    __counts.visible_like_0 = 1234;
  });
  await passer(page, 350);
  expect(await lectures(page)).toEqual([expect.objectContaining({ table: "post_likes", cols: "post_id", col: "post_id", id: "visible_like_0", options: { count: "exact", head: true } })]);
  await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText("❤️ 1234");
  await page.evaluate(() => { __counts.visible_like_0 = 0; });
  await passer(page);
  await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText("❤️ 0");
  expect(await page.evaluate(() => state.user.likedPosts)).toEqual(["visible_like_0"]);
});

test("visiteur : zéro HEAD ; connexion réveille, déconnexion écarte la réponse en vol", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => { MY_UID = "u_visiteur_capacite"; window.MY_UID = MY_UID; });
  await passer(page);
  expect(await lectures(page)).toHaveLength(0);
  await page.evaluate(() => {
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b"; window.MY_UID = MY_UID;
    __hold = () => new Promise(resolve => { window.__resolveHead = resolve; });
    startPostLikeRefresh(); // même réveil que supaInit après connexion
  });
  await passer(page, 350);
  expect(await lectures(page)).toHaveLength(1);
  await page.evaluate(() => {
    MY_UID = "u_visiteur_capacite"; window.MY_UID = MY_UID;
    __resolveHead({ count: 90, error: null }); __hold = null;
  });
  await passer(page);
  expect(await lectures(page)).toHaveLength(1);
  expect(await page.evaluate(() => state.supabasePosts[0].likes)).toBe(4);
});

test("NULL, refus, NaN et négatif ne deviennent jamais zéro", async ({ page }) => {
  await preparer(page);
  for (const kind of ["null", "error", "nan", "negative"]) {
    await page.evaluate((k) => {
      __hold = () => ({ count: k === "null" ? null : k === "nan" ? NaN : k === "negative" ? -1 : 0, error: k === "error" ? { message: "denied" } : null });
    }, kind);
    await passer(page);
    expect(await page.evaluate(() => state.supabasePosts[0].likes)).toBe(4);
  }
  expect((await lectures(page)).length).toBeGreaterThanOrEqual(4);
});

test("trois lectures par créneau, rotation, pas de rafale sur scroll et zéro hors viewport", async ({ page }) => {
  await preparer(page, 12);
  await passer(page, 350);
  expect((await lectures(page)).map(r => r.id)).toEqual(["visible_like_0", "visible_like_1", "visible_like_2"]);
  await page.evaluate(() => { for (let i = 0; i < 12; i++) document.dispatchEvent(new Event("scroll")); });
  await passer(page, 1000);
  expect((await lectures(page)).length).toBe(3);
  await passer(page);
  expect((await lectures(page)).slice(3, 6).map(r => r.id)).toEqual(["visible_like_3", "visible_like_4", "visible_like_5"]);
  expect((await lectures(page)).some(r => r.id === "visible_like_11")).toBe(false);
  await page.evaluate(() => { document.getElementById("likes-test-stage").scrollTop = 1000; });
  await passer(page);
  expect((await lectures(page)).slice(-3).every(r => Number(r.id.split("_").pop()) >= 5)).toBe(true);
  await passer(page);
  expect((await lectures(page)).slice(-3).some(r => r.id === "visible_like_11")).toBe(true);
  expect(await page.evaluate(() => document.getElementById("likes-test-stage").scrollTop)).toBeGreaterThan(0);
});

test("onglet masqué, hors ligne, navigation et écran recouvert : aucune lecture puis reprise", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await passer(page, 18000);
  expect(await lectures(page)).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await passer(page, 350);
  expect(await lectures(page)).toHaveLength(1);
  await page.evaluate(() => {
    const cover = document.createElement("div"); cover.id = "likes-cover";
    cover.style.cssText = "position:fixed;inset:0;background:white;z-index:300000";
    document.body.appendChild(cover);
  });
  await passer(page);
  expect(await lectures(page)).toHaveLength(1);
  await page.evaluate(() => {
    document.getElementById("likes-cover").remove();
    document.getElementById("likes-test-stage").style.display = "none";
    goTo("messages");
  });
  await passer(page);
  expect(await lectures(page)).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    document.getElementById("likes-test-stage").style.display = "block";
  });
  await passer(page);
  expect(await lectures(page)).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.dispatchEvent(new Event("online"));
  });
  await passer(page, 350);
  expect(await lectures(page)).toHaveLength(2);
});

for (const disposition of ["pending", "success", "failure"]) {
  test("un HEAD antérieur ne remplace pas le clic local : " + disposition, async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { __hold = () => new Promise(resolve => { window.__resolveHead = resolve; }); });
    await passer(page, 350);
    await page.locator('#likes-test-stage [data-action="like"]').click();
    await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText("❤️ 5");
    if (disposition !== "pending") await page.evaluate((ok) => __writeResolvers.shift()({ ok }), disposition === "success");
    await page.evaluate(() => { __resolveHead({ count: 1, error: null }); __hold = null; });
    await page.evaluate(() => Promise.resolve());
    await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText(disposition === "failure" ? "🤍 4" : "❤️ 5");
    if (disposition === "pending") {
      await passer(page);
      expect(await lectures(page)).toHaveLength(1); // bien plus que le verrou UI de800ms
      await page.evaluate(() => __writeResolvers.shift()({ ok: true }));
    }
  });
}

test("like puis unlike après800ms : écritures ordonnées, HEAD attend le dernier règlement", async ({ page }) => {
  await preparer(page);
  await page.locator('#likes-test-stage [data-action="like"]').click();
  await passer(page, 1000);
  await page.locator('#likes-test-stage [data-action="like"]').click();
  expect(await page.evaluate(() => __writes.map(w => w.want))).toEqual([true]);
  await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText("🤍 4");
  await page.evaluate(() => __writeResolvers.shift()({ ok: true }));
  await page.evaluate(() => Promise.resolve());
  expect(await page.evaluate(() => __writes.map(w => w.want))).toEqual([true, false]);
  await passer(page);
  expect(await lectures(page)).toHaveLength(0);
  await page.evaluate(() => __writeResolvers.shift()({ ok: true }));
  await passer(page, 350);
  await expect(page.locator('#likes-test-stage [data-action="like"]')).toHaveText("🤍 7");
});

for (const change of ["compte", "purge", "suppression", "blocage", "masque"]) {
  test("une réponse en vol ne réécrit pas après " + change, async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { __hold = () => new Promise(resolve => { window.__resolveHead = resolve; }); });
    await passer(page, 350);
    await page.evaluate((mode) => {
      if (mode === "compte") MY_UID = "a09a84a8-b188-45bb-93f4-82648a2973f3";
      if (mode === "purge") _clearProfileCache();
      if (mode === "suppression") marquerPostSupprime("visible_like_0");
      if (mode === "blocage") state.user.blocked.push("auteur_visible");
      if (mode === "masque") document.getElementById("likes-test-stage").style.display = "none";
      __resolveHead({ count: 90, error: null });
    }, change);
    await page.evaluate(() => Promise.resolve());
    expect(await page.evaluate(() => state.supabasePosts[0].likes)).toBe(4);
  });
}

test("une requête lente reste seule et son abandon rend le prochain créneau disponible", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => {
    __hold = req => new Promise((resolve, reject) => { req.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); });
  });
  await passer(page, 350);
  await passer(page, 7000);
  expect(await lectures(page)).toHaveLength(1);
  await page.evaluate(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new Event("resize")); });
  await passer(page, 1500);
  expect(await lectures(page)).toHaveLength(1);
  await page.evaluate(() => { __hold = null; });
  await passer(page, 8500);
  expect(await lectures(page)).toHaveLength(2);
  expect(await page.evaluate(() => state.supabasePosts[0].likes)).toBe(7);
});

test("détail, profil et Bobines : copies durables, compteur visible et déduplication", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => {
    const post = state.supabasePosts[0];
    window._feedExtraPosts = [{ ...post }];
    window._visited = { authorId: post.authorId, posts: [{ ...post }], locked: false, passionSel: new Set(), tabSel: new Set() };
    reelsState.items = [{ ...post, isReel: true }];
    const stage = document.getElementById("likes-test-stage");
    stage.innerHTML = '<div id="visitedContent"></div>';
    _renderVisitedContent();
    stage.insertAdjacentHTML("beforeend", renderReelHTML(reelsState.items[0], 0));
  });
  await passer(page, 350);
  expect(await lectures(page)).toHaveLength(1);
  expect(await page.evaluate(() => [state.supabasePosts[0].likes, _feedExtraPosts[0].likes, _visited.posts[0].likes, reelsState.items[0].likes])).toEqual([7, 7, 7, 7]);
  await expect(page.locator('#likes-test-stage [data-reellike] .reel-action-label')).toHaveText("7");
  await page.evaluate(() => { _renderVisitedContent(); });
  await expect(page.locator('#visitedContent [data-action="like"]')).toHaveText("🤍 7");
  await page.evaluate(() => {
    document.getElementById("likes-test-stage").style.display = "none";
    window.supaLoadComments = async () => [];
    openPost("visible_like_0");
    __counts.visible_like_0 = 12;
  });
  await passer(page);
  await expect(page.locator('#postDetailContent .post-actions .post-action').first()).toHaveText("🤍 12");
  expect((await lectures(page)).length).toBe(2);
});

test("profil verrouillé et grille sans compteur ne produisent aucune lecture", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => {
    const post = state.supabasePosts[0];
    window._visited = { posts: [{ ...post }], locked: true };
    document.getElementById("likes-test-stage").innerHTML = '<div id="visitedContent">' + renderPostHTML(post) + '</div>';
  });
  await passer(page, 350);
  expect(await lectures(page)).toHaveLength(0);
  await page.evaluate(() => { document.getElementById("likes-test-stage").innerHTML = '<div class="profile-media-item" data-postid="visible_like_0">Miniature</div>'; });
  await passer(page);
  expect(await lectures(page)).toHaveLength(0);
});

// Deux chemins de chargement du fil depuis le 2026-09-21 : la lecture groupée
// `fil_compteurs` (RPC) et, tant que la fonction n'est pas en base, les listes
// d'avant. La course est la même dans les deux : une réponse partie AVANT un
// HEAD ou un clic ne doit pas les écraser en revenant après.
for (const chemin of ["listes", "rpc"]) for (const newValue of ["head", "clic"]) {
  test("une ancienne lecture complète du fil (" + chemin + ") conserve le compteur plus récent : " + newValue, async ({ page }) => {
    await preparer(page);
    // Horloge FIGÉE : sans cela le premier HEAD (dû à 200 ms réels) pouvait
    // partir entre la pose des stubs et le clic, et le cas « clic » attendait
    // 4 + 1 sur un compteur déjà passé à 7 (contre-revue).
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 50)));
    await page.evaluate((chemin) => {
      const original = supa.from;
      sessionStorage.removeItem("passio_fil_compteurs_absente");
      supa.rpc = (fn, args) => {
        if (fn !== "fil_compteurs") return Promise.resolve({ data: null, error: null });
        if (chemin === "listes") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.fil_compteurs" } });
        return new Promise(resolve => { window.__resolveBulk = (res) => resolve(res.data
          ? { data: res.data.map(l => ({ post_id: l.post_id, likes: 1, aime: false, commentaires: 0, apercus: [], reactions: [] })), error: null }
          : res); });
      };
      supa.from = table => {
        let options;
        const q = {
          select(cols, opts) { options = opts; return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, range() { return q; }, limit() { return q; },
          then(yes, no) {
            if (table === "post_likes" && options && options.head) return original(table).select("post_id", options).eq("post_id", "visible_like_0").then(yes, no);
            if (table === "posts") return Promise.resolve({ data: [{ id: "visible_like_0", author_id: "auteur_visible", content: "Avant", created_at: "2026-09-20T12:00:00Z", profiles: { username: "Auteur" } }], error: null }).then(yes, no);
            if (table === "post_likes") return new Promise(resolve => { window.__resolveBulk = resolve; }).then(yes, no);
            return Promise.resolve({ data: [], error: null }).then(yes, no);
          },
        };
        return q;
      };
      window.__bulkResult = supaLoadPosts();
    }, chemin);
    if (newValue === "head") await passer(page, 350);
    else await page.locator('#likes-test-stage [data-action="like"]').click();
    const result = await page.evaluate(async () => {
      __resolveBulk({ data: [{ post_id: "visible_like_0", user_id: "ancien" }], error: null });
      const posts = await __bulkResult;
      return { likes: posts[0].likes, liked: posts[0].liked };
    });
    expect(result).toEqual(newValue === "head" ? { likes: 7, liked: false } : { likes: 5, liked: true });
  });
}

test("stop/start pendant HEAD : ancienne réponse écartée et nouveau cycle vivant", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => { __hold = () => new Promise(resolve => { window.__resolveHead = resolve; }); });
  await passer(page, 350);
  await page.evaluate(() => {
    stopPostLikeRefresh(); startPostLikeRefresh();
    __resolveHead({ count: 90, error: null }); __hold = null;
  });
  await page.evaluate(() => Promise.resolve());
  expect(await page.evaluate(() => state.supabasePosts[0].likes)).toBe(4);
  await passer(page);
  expect(await page.evaluate(() => state.supabasePosts[0].likes)).toBe(7);
});

test("dix bindings CDC : messages privés, notifications et posts continuent de répondre", async ({ page }) => {
  await preparer(page);
  const result = await page.evaluate(async () => {
    stopPostLikeRefresh();
    const bindings = [], broadcasts = [];
    supa.channel = topic => {
      const channel = { on(type, config, callback) { (type === "postgres_changes" ? bindings : broadcasts).push({ topic, config, callback }); return channel; }, subscribe() { return channel; } };
      return channel;
    };
    window.PASSIO_REALTIME_V3 = true;
    window._userTopicChan = null;
    const received = [];
    window._handleIncomingConvMessage = row => received.push(row.id);
    window.mergeSupaNotifs = rows => received.push(rows[0].id);
    window._profilAuteur = async () => ({ username: "Visible" });
    _subscribeUserTopic();
    _creerCanalDb(true);
    broadcasts.find(b => b.topic === "user:" + MY_UID).callback({ payload: { id: "message-prive", conv_id: "conversation" } });
    bindings.find(b => b.config.table === "notifications").callback({ new: { id: "notification-privee", user_id: MY_UID, kind: "like", created_at: "2026-09-20T12:00:00Z" } });
    await bindings.find(b => b.config.table === "posts").callback({ new: { id: "post-recu", author_id: "autre", content: "Nouveau", created_at: "2026-09-20T12:00:00Z" } });
    return { count: bindings.length, likes: bindings.filter(b => b.config.table === "post_likes").length,
      received, postPresent: !!findPostAnywhere("post-recu"),
      userFilter: bindings.find(b => b.config.table === "notifications").config.filter };
  });
  expect(result).toEqual({ count: 10, likes: 0, received: ["message-prive", "notification-privee"], postPresent: true,
    userFilter: "user_id=eq.812aee2b-214f-4949-931e-842599b6d68b" });
});
