const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// P1 DE SÉCURITÉ/CAPACITÉ CÔTÉ CLIENT — revérification du 2026-11-20
//
// Vrai code du produit, serveur miniature dans la page : aucune donnée
// distante, aucune écriture. Ce que ce banc prouve :
//   · D14-01, le fil : un échec de `fil_compteurs` ne déclenche plus le repli
//     coûteux (post_likes sans limite + commentaires + réactions) ; le filet
//     du fil compte ce tour comme un ÉCHEC et recule ;
//   · D14-01, les cartes : les compteurs à l'écran partent en UN appel groupé
//     `fil_compteurs` (plus de HEAD par carte) ; un échec recule, et le retour
//     au premier plan ne remet PAS ce recul à zéro ;
//   · D10-01 (préparation) : une diffusion de message `tronque: true` est relue
//     par identifiant, jamais peinte tronquée ; l'ancien format passe tel quel ;
//   · B06-N1 : une ligne invalide ne vide plus la liste des conversations.
// ═══════════════════════════════════════════════════════════════════════════

const MOI = "812aee2b-214f-4949-931e-842599b6d68b";
const AUTRE = "a09a84a8-b188-45bb-93f4-82648a2973f3";

async function demarrer(page) {
  await bootOnboarded(page);
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate((moi) => {
    stopFeedRefreshLoop();
    stopPostLikeRefresh();
    localStorage.setItem(IRL_DIGEST_KEY, _isoWeekKey());
    MY_UID = moi; window.MY_UID = moi;
    window._supaReal = true;
    window._rechargementImminent = false;
    window.requireAuthentication = () => true;
    window.supaTrack = async () => null;
    window.supaInsertNotif = async () => null;
    sessionStorage.removeItem("passio_fil_compteurs_absente");
    _filCompteursEchecs = 0; _filCompteursProchainEssai = 0;
    window.__lectures = [];
    window.__rpc = [];
    // Constructeur de requête générique : chaque méthode chaîne, `then` rend
    // `window.__repondre(req)` (par défaut, une liste vide).
    window.__repondre = () => ({ data: [], error: null });
    supa.from = function (table) {
      const req = { table, filtres: [] };
      const q = new Proxy({}, {
        get(_t, nom) {
          if (nom === "then") {
            return (ok, ko) => {
              __lectures.push(req);
              let res;
              try { res = __repondre(req); } catch (e) { return Promise.reject(e).then(ok, ko); }
              if (req.unique && res && Array.isArray(res.data)) res = { ...res, data: res.data[0] || null };
              return Promise.resolve(res).then(ok, ko);
            };
          }
          return (...args) => {
            if (nom === "select") { req.cols = args[0]; req.options = args[1]; }
            else if (nom === "maybeSingle" || nom === "single") req.unique = true;
            else req.filtres.push([nom].concat(args));
            return q;
          };
        },
      });
      return q;
    };
  }, MOI);
}

// ── D14-01 : le fil ─────────────────────────────────────────────────────────
test("fil : fil_compteurs en échec → aucun repli coûteux, et le filet compte un échec puis recule", async ({ page }) => {
  await demarrer(page);
  const r = await page.evaluate(async () => {
    Math.random = () => 0.5;
    const lignes = Array.from({ length: 5 }, (_, i) => ({
      id: "f_" + i, author_id: "auteur_f", passion_id: "photo", mood: "all", content: "P" + i,
      created_at: "2026-11-20T10:0" + i + ":00", media_url: null,
      profiles: { username: "Auteur", emoji: "📷", color: "#123456", avatar_url: null, is_private: false },
    }));
    __repondre = (req) => req.table === "posts" ? { data: lignes, error: null } : { data: [], error: null };
    let mode = "ok";
    supa.rpc = (fn, args) => {
      __rpc.push(fn);
      if (fn !== "fil_compteurs") return Promise.resolve({ data: null, error: null });
      if (mode === "sature") return Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
      return Promise.resolve({ data: args._post_ids.map((id) => ({ post_id: id, likes: 40, aime: false, commentaires: 3, apercus: [], reactions: [] })), error: null });
    };
    state.supabasePosts = await supaLoadPosts();
    const sain = state.supabasePosts.find((p) => p.id === "f_0").likes;
    mode = "sature"; __lectures.length = 0;
    goTo("feed");
    startFeedRefreshLoop();
    _feedFiletEchecs = 0;
    await _feedRefreshTour();
    const tables = __lectures.map((q) => q.table);
    const out = { sain, tables, echecsFilet: _feedFiletEchecs, likes: state.supabasePosts.find((p) => p.id === "f_0").likes,
      total: state.supabasePosts.find((p) => p.id === "f_0").commentsTotal };
    stopFeedRefreshLoop();
    return out;
  });
  expect(r.sain).toBe(40);
  // Avant le correctif : ["posts", "post_likes", "post_comments", "comment_interactions"].
  expect(r.tables).toEqual(["posts"]);
  expect(r.likes).toBe(40);   // compteur affiché conservé, jamais remis à 0
  expect(r.total).toBe(3);
  expect(r.echecsFilet).toBe(1); // le filet recule (`reculSurErreur`)
});

test("fil : la fonction ABSENTE (PGRST202) garde le chemin d'avant — seul cas où il sert", async ({ page }) => {
  await demarrer(page);
  const r = await page.evaluate(async () => {
    __repondre = (req) => req.table === "posts"
      ? { data: [{ id: "f_a", author_id: "auteur_f", passion_id: "photo", mood: "all", content: "A", created_at: "2026-11-20T10:00:00", media_url: null, profiles: { username: "A", emoji: "📷", color: "#123456", avatar_url: null, is_private: false } }], error: null }
      : { data: [], error: null };
    supa.rpc = () => Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await supaLoadPosts();
    return __lectures.map((q) => q.table).slice(0, 4);
  });
  expect(r).toEqual(["posts", "post_likes", "post_comments", "comment_interactions"]);
});

// ── D14-01 : les compteurs des cartes ───────────────────────────────────────
async function cartes(page, n) {
  await page.evaluate(() => { stopFeedRefreshLoop(); stopPostLikeRefresh(); });
  await page.clock.install();
  await page.evaluate((n) => {
    stopFeedRefreshLoop();
    stopPostLikeRefresh();
    _postLikeRefreshNextAt = 0;
    _postLikeRefreshPhaseIdentity = null;
    _postLikeRefreshEntries.clear();
    _postLikeRefreshPas = POST_LIKE_REFRESH_MS;
    _postLikeRefreshEchecs = 0;
    Math.random = () => 0.5;
    window.delestageFacteur = () => 1;
    state.user.likedPosts = [];
    state.user.blocked = [];
    window.__counts = {};
    window.__erreur = false;
    window.__heads = 0;
    state.supabasePosts = Array.from({ length: n }, (_, i) => ({
      id: "carte_" + i, authorId: "auteur_carte", passion: "musique", mood: "all",
      text: "Carte " + i, likes: 4, liked: false, comments: [], fromSupabase: true, createdAt: Date.now(), type: "text",
    }));
    state.supabasePosts.forEach((p) => { __counts[p.id] = 9; });
    const stage = document.createElement("div");
    stage.id = "cartes-stage";
    stage.style.cssText = "position:fixed;inset:90px 20px 90px;overflow:auto;z-index:250000;background:white;";
    document.body.appendChild(stage);
    const style = document.createElement("style");
    style.textContent = "#cartes-stage .post {height:100px!important;min-height:100px!important;overflow:hidden;content-visibility:visible!important;contain-intrinsic-size:none!important;margin:0!important;animation:none!important;} #cartes-stage .post-header{display:none} #cartes-stage .post-body{padding:2px}";
    document.head.appendChild(style);
    stage.innerHTML = state.supabasePosts.map(renderPostHTML).join("");
    __repondre = (req) => {
      if (req.table === "post_likes" && req.options && req.options.head) { __heads++; return { data: null, count: 1, error: null }; }
      return { data: [], error: null };
    };
    supa.rpc = (fn, args) => {
      __rpc.push({ fn, ids: (args && args._post_ids || []).slice(), at: Date.now() });
      const rendre = (res) => ({ abortSignal: () => Promise.resolve(res), then: (ok, ko) => Promise.resolve(res).then(ok, ko) });
      if (fn !== "fil_compteurs") return rendre({ data: null, error: null });
      if (__erreur) return rendre({ data: null, error: { code: "57014", message: "statement timeout" } });
      return rendre({ data: args._post_ids.map((id) => ({ post_id: id, likes: __counts[id], aime: true, commentaires: 0, apercus: [], reactions: [] })), error: null });
    };
    startPostLikeRefresh();
  }, n);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 50)));
}
async function passer(page, ms) { await page.clock.fastForward(ms); await page.evaluate(() => Promise.resolve()); }

test("cartes : un appel groupé fil_compteurs pour trois cartes, aucun HEAD, et mon état aimé reste local", async ({ page }) => {
  await demarrer(page);
  await cartes(page, 3);
  await passer(page, await page.evaluate(() => _postLikeRefreshNextAt - Date.now() + 1));
  const r = await page.evaluate(() => ({
    rpc: __rpc.filter((x) => x.fn === "fil_compteurs").map((x) => x.ids.slice().sort()),
    heads: __heads,
    likes: state.supabasePosts.map((p) => p.likes),
    aime: state.user.likedPosts.length,
  }));
  // Avant le correctif : 3 HEAD `count=exact` (contrôle par ligne de `post_likes`) et aucun appel groupé.
  expect(r.rpc).toEqual([["carte_0", "carte_1", "carte_2"]]);
  expect(r.heads).toBe(0);
  expect(r.likes).toEqual([9, 9, 9]);
  expect(r.aime).toBe(0); // `aime` de la réponse n'est jamais recopié
});

test("cartes : un échec recule, et le retour au premier plan ne remet PAS le recul à zéro", async ({ page }) => {
  await demarrer(page);
  await cartes(page, 1);
  await passer(page, await page.evaluate(() => _postLikeRefreshNextAt - Date.now() + 1));
  await page.evaluate(() => { __erreur = true; });
  await passer(page, await page.evaluate(() => _postLikeRefreshNextAt - Date.now() + 1));
  const apresEchec = await page.evaluate(() => ({ echecs: _postLikeRefreshEchecs, dans: _postLikeRefreshNextAt - Date.now(), likes: state.supabasePosts[0].likes }));
  expect(apresEchec.echecs).toBe(1);
  expect(apresEchec.dans).toBeGreaterThanOrEqual(29000); // 15 s × 2, gigue au milieu
  expect(apresEchec.likes).toBe(9);                       // une erreur ne devient jamais un zéro
  const appels = await page.evaluate(() => __rpc.length);
  // Passer en arrière-plan puis revenir, et le réseau qui « revient » :
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });
  const apresRetour = await page.evaluate(() => ({ echecs: _postLikeRefreshEchecs, dans: _postLikeRefreshNextAt - Date.now() }));
  // Avant le correctif : echecs remis à 0 et rendez-vous ramené à ≤ 16,5 s.
  expect(apresRetour.echecs).toBe(1);
  expect(apresRetour.dans).toBeGreaterThanOrEqual(29000);
  await passer(page, 16500);
  expect(await page.evaluate(() => __rpc.length)).toBe(appels); // rien n'est reparti avant la fin du recul
  // Une lecture réussie, elle, remet le compte à zéro.
  await page.evaluate(() => { __erreur = false; __counts.carte_0 = 11; });
  await passer(page, await page.evaluate(() => _postLikeRefreshNextAt - Date.now() + 1));
  expect(await page.evaluate(() => ({ echecs: _postLikeRefreshEchecs, likes: state.supabasePosts[0].likes }))).toEqual({ echecs: 0, likes: 11 });
});

// ── D10-01 (préparation) : diffusion tronquée ───────────────────────────────
async function conversationDeGroupe(page) {
  await page.evaluate(({ autre }) => {
    window._openedConvId = null;
    _profileCache.set(autre, { username: "Camille", emoji: "📷", color: "#123456", photoUrl: null });
    conversationsState = [{ id: "g_tr", isGroup: true, groupName: "Groupe", userId: "", userIds: [MY_UID, autre], userName: "Groupe",
      userEmoji: "✨", userColor: "#8b5cf6", lastAt: Date.now() - 60000, unread: 0, messages: [], fromSupabase: true }];
    saveConversations();
    window.__complet = "x".repeat(20000);
    __repondre = (req) => {
      if (req.table !== "conv_messages") return { data: [], error: null };
      const id = (req.filtres.find((f) => f[0] === "eq" && f[1] === "id") || [])[2];
      if (window.__relectureEnPanne) return { data: null, error: { message: "fetch failed" } };
      if (id === "m_tr") return { data: [{ id: "m_tr", conv_id: "g_tr", from_id: autre, content: __complet, created_at: "2026-11-20T10:00:00" }], error: null };
      if (id === "m_ailleurs") return { data: [{ id: "m_ailleurs", conv_id: "autre_conv", from_id: autre, content: "ailleurs", created_at: "2026-11-20T10:00:00" }], error: null };
      return { data: [], error: null };
    };
  }, { autre: AUTRE });
}
const messagesDe = (page) => page.evaluate(() => (getConversations().find((c) => c.id === "g_tr") || { messages: [] }).messages.map((m) => ({ id: m.id, n: String(m.text || "").length })));

test("diffusion tronquée : relue par identifiant, jamais peinte tronquée ; ancien format inchangé", async ({ page }) => {
  await demarrer(page);
  await conversationDeGroupe(page);
  const r = await page.evaluate(async (autre) => {
    // Charge v3 (`user:`) au contrat proposé : contenu tronqué + drapeau + id.
    await _handleIncomingConvMessage({ id: "m_tr", conv_id: "g_tr", from_id: autre, content: "x".repeat(500), created_at: "2026-11-20T10:00:00", tronque: true });
    const relectures = __lectures.filter((q) => q.table === "conv_messages").length;
    // Le même identifiant ne se relit pas deux fois.
    await _handleIncomingConvMessage({ id: "m_tr", conv_id: "g_tr", from_id: autre, content: "x".repeat(500), created_at: "2026-11-20T10:00:00", tronque: true });
    // Ancien format (pas de drapeau) : traité tel quel, sans relecture.
    await _handleIncomingConvMessage({ id: "m_ancien", conv_id: "g_tr", from_id: autre, content: "bonjour", created_at: "2026-11-20T10:01:00" });
    return { relectures, total: __lectures.filter((q) => q.table === "conv_messages").length };
  }, AUTRE);
  expect(r.relectures).toBe(1);
  expect(r.total).toBe(1);
  // Avant le correctif : m_tr peint avec 500 caractères (le contenu tronqué).
  expect(await messagesDe(page)).toEqual([{ id: "m_tr", n: 20000 }, { id: "m_ancien", n: 7 }]);
});

test("diffusion tronquée : la charge au niveau du canal `conv:` est liée à sa conversation, et un échec n'affiche rien", async ({ page }) => {
  await demarrer(page);
  await conversationDeGroupe(page);
  await page.clock.install();
  const r = await page.evaluate(async (autre) => {
    // Une ligne relue qui appartient à une AUTRE conversation est jetée.
    await _handleIncomingConvMessage({ id: "m_ailleurs", conv_id: "g_tr", from_id: autre, content: "a", created_at: "2026-11-20T10:00:00", tronque: true }, { diffusionMembre: true });
    // Relecture en panne : aucun contenu tronqué peint.
    window.__relectureEnPanne = true;
    const p = _handleIncomingConvMessage({ id: "m_panne", conv_id: "g_tr", from_id: autre, content: "tronq", created_at: "2026-11-20T10:00:00", tronque: true });
    return { p: !!p };
  }, AUTRE);
  expect(r.p).toBe(true);
  await page.clock.fastForward(5000);
  await page.evaluate(() => new Promise((ok) => setTimeout(ok, 0)));
  await page.clock.fastForward(1);
  expect(await messagesDe(page)).toEqual([]);
  expect(await page.evaluate(() => __lectures.filter((q) => q.table === "conv_messages").length)).toBe(3); // 1 + 2 essais
});

// ── B06-N1 : la liste des conversations ─────────────────────────────────────
test("conversations : une ligne invalide est écartée, elle ne vide plus toute la liste", async ({ page }) => {
  await demarrer(page);
  const r = await page.evaluate(async (autre) => {
    __repondre = (req) => {
      const t = req.table;
      const cols = String(req.cols || "");
      if (t === "conv_members" && cols === "conv_id") return { data: [{ conv_id: "c1" }, null, { conv_id: "c2" }, {}], error: null };
      if (t === "conversations") return { data: [{ id: "c1", is_group: false, created_at: "2026-11-20T09:00:00" }, null, { id: "c2", is_group: true, group_name: "G", created_at: "2026-11-20T09:00:00" }], error: null };
      if (t === "conv_messages") return { data: [
        null,
        { id: "m1", conv_id: "c1", from_id: autre, content: "salut", created_at: "2026-11-20T10:00:00", profiles: { username: "Camille" } },
        { id: "m2", conv_id: "c2", from_id: autre, content: { pas: "un texte" }, created_at: "2026-11-20T10:01:00" },
        { id: "m3", from_id: autre, content: "sans conversation", created_at: "2026-11-20T10:02:00" },
        "chaine",
      ], error: null };
      if (t === "conv_members") return { data: [null, { conv_id: "c1", user_id: autre, profiles: { username: "Camille" } }, { conv_id: "c2", user_id: autre, profiles: null }], error: null };
      if (t === "conv_reads") return { data: [null, { conv_id: "c1", last_read_at: "2026-11-20T08:00:00" }], error: null };
      return { data: [], error: null };
    };
    const liste = await supaLoadMyConversations();
    return liste.map((c) => ({ id: c.id, groupe: !!c.isGroup, n: c.messages.length, nonLus: c.unread })).sort((a, b) => a.id.localeCompare(b.id));
  }, AUTRE);
  // Avant le correctif : [] (la ligne nulle levait dans le regroupement des messages).
  expect(r).toEqual([{ id: "c1", groupe: false, n: 1, nonLus: 1 }, { id: "c2", groupe: true, n: 0, nonLus: 0 }]);
});
