const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// FIL : compteurs exacts, mon like, deux aperçus — en UNE lecture (2026-09-21)
//
// Le navigateur exécute les chargeurs du produit (`supaLoadPosts`,
// `supaLoadComments`, la modale de discussion) contre un serveur miniature
// qui journalise chaque lecture. Aucun compte, aucune donnée distante.
// Ce que ce banc prouve :
//   · une page de fil = UNE lecture `fil_compteurs` (POST, les 20 identifiants
//     en corps), plus aucune liste de likes/commentaires/réactions ;
//   · la carte affiche le compte EXACT (7) alors que deux aperçus sont chargés ;
//   · fonction absente (PGRST202) : repli sur les lectures d'avant, mémorisé
//     pour la session — un seul essai, jamais un par page ;
//   · erreur passagère : les lectures d'avant pour CETTE page (des compteurs
//     justes valent quatre lectures de plus), trois échecs consécutifs → plus
//     d'essai de la session, rien de mémorisé ;
//   · la discussion se charge par pages de 30, les plus récents d'abord, avec
//     un curseur `(created_at, id)` et un bouton « précédents · N restants » ;
//   · mes commentaires EN ATTENTE (`_pending`), un commentaire reçu en direct
//     et une suppression tiennent le compte juste sans recharger le fil ;
//   · contre-revue (critique de complétude) : une liste persistée par l'ancien
//     client (sans drapeau) ne double pas le total, une RÉPONSE confirmée
//     n'entre pas dans le total de premier niveau, un GIF depuis la carte
//     passe par la file et se confirme, une suppression atteint toutes les
//     copies, un commentaire supprimé en base ne revient pas à la réouverture.
// ═══════════════════════════════════════════════════════════════════════════

async function preparer(page, opts = {}) {
  await bootOnboarded(page);
  // La chaîne de démarrage doit avoir FINI ses lectures avant qu'on pose les
  // journaux : sinon un `supaLoadPosts` de boot tardif entrait dans `__lectures`
  // et remplaçait `state.supabasePosts` sous les cas (contre-revue).
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate((opts) => {
    stopFeedRefreshLoop();
    stopPostLikeRefresh();
    _clearProfileCache();
    window._cmtThreadLoadedAt = {};
    _feedPagination = null;
    window._feedExtraPosts = [];
    state.supabasePosts = [];
    state.user.likedPosts = [];
    state.user.blocked = [];
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b";
    window.MY_UID = MY_UID;
    window._supaReal = true;
    window.requireAuthentication = () => true;
    window.supaInsertNotif = async () => null;
    window.supaTrack = async () => null;
    sessionStorage.removeItem("passio_fil_compteurs_absente");
    window.__lectures = [];
    window.__rpc = [];
    window.__rpcMode = opts.rpcMode || "ok";
    window.__lignes = Array.from({ length: opts.nbPosts || 20 }, (_, i) => ({
      id: "fil_" + String(i).padStart(2, "0"), author_id: "auteur_fil", passion_id: "photo", mood: "all",
      content: "Publication " + i, created_at: "2026-09-21T10:" + String(59 - i).padStart(2, "0") + ":00", media_url: null,
      profiles: { username: "Auteur", emoji: "📷", color: "#123456", avatar_url: null, is_private: false },
    }));
    // 45 commentaires sur fil_00 (du plus ancien au plus récent), 1 sur fil_01.
    window.__commentaires = Array.from({ length: 45 }, (_, i) => ({
      id: "c_" + String(i).padStart(3, "0"), post_id: "fil_00", author_id: i % 2 ? "camille" : "dominique",
      content: "Commentaire " + i, created_at: "2026-09-21T11:" + String(Math.floor(i / 60)).padStart(2, "0") + ":" + String(i % 60).padStart(2, "0"),
    })).concat([{ id: "c_seul", post_id: "fil_01", author_id: "camille", content: "Seul", created_at: "2026-09-21T12:00:00" }]);
    window.__likes = { fil_00: 12, fil_01: 0 };
    window.__profils = [
      { id: "camille", username: "Camille", emoji: "📷", color: "#123456", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      { id: "dominique", username: "Dominique", emoji: "🎸", color: "#654321", avatar_url: null, passion_id: "musique", passions: [], bio: "" },
    ];
    function reponseRpc(ids) {
      return ids.map((id) => {
        const cs = __commentaires.filter((c) => c.post_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
        return {
          post_id: id, likes: __likes[id] || 0, aime: id === "fil_00", commentaires: cs.length,
          apercus: cs.slice(0, 2).map((c) => ({ id: c.id, author_id: c.author_id, content: c.content, created_at: c.created_at })),
          reactions: id === "fil_00" ? [{ user_id: "camille", kind: "emoji", payload: "😍", created_at: "2026-09-21T12:00:00+00:00" }] : [],
        };
      });
    }
    supa.rpc = (fn, args, options) => {
      if (options && (options.get || options.head)) throw new Error("fil_compteurs doit partir en POST : un identifiant peut porter une virgule ou une accolade");
      __rpc.push({ fn, args });
      if (fn !== "fil_compteurs") return Promise.resolve({ data: null, error: null });
      if (__rpcMode === "absente") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.fil_compteurs(_post_ids) in the schema cache" } });
      if (__rpcMode === "erreur") return Promise.resolve({ data: null, error: { code: "PGRST301", message: "JWT expired" } });
      if (__rpcMode === "reseau") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve({ data: reponseRpc(args._post_ids), error: null });
    };
    supa.from = function (table) {
      const req = { table, orders: [] };
      const q = {
        select: (cols, options) => { req.cols = cols; req.options = options; return q; },
        eq: (col, value) => { req.eq = [col, value]; return q; },
        in: (col, values) => { req.ids = values.slice(); return q; },
        order: (col, o) => { req.orders.push(col); return q; },
        limit: (value) => { req.limit = value; return q; },
        range: (from, to) => { req.range = [from, to]; return q; },
        or: (filter) => { req.or = filter; return q; },
        then: (ok, ko) => {
          __lectures.push(req);
          const rendre = (res) => Promise.resolve(res).then(ok, ko);
          if (table === "profiles") return rendre({ data: __profils.filter((p) => (req.ids || []).includes(p.id)), error: null });
          if (table === "posts") {
            let rows = __lignes.slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
            rows = rows.slice(req.range[0], req.range[1] + 1);
            return rendre({ data: rows, error: null });
          }
          if (table === "post_comments" && req.eq) {
            let rows = __commentaires.filter((c) => c.post_id === req.eq[1]);
            if (req.or) {
              const m = /^created_at\.lt\.("[^"]+"),and\(created_at\.eq\."[^"]+",id\.lt\.("[^"]+")\)$/.exec(req.or);
              if (!m) throw new Error("Curseur de commentaires mal formé : " + req.or);
              const date = JSON.parse(m[1]), id = JSON.parse(m[2]);
              rows = rows.filter((c) => c.created_at < date || (c.created_at === date && c.id < id));
            }
            rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
            if (req.limit) rows = rows.slice(0, req.limit);
            req.rows = rows.length;
            return rendre({ data: rows, error: null });
          }
          if (table === "post_comments") return rendre({ data: __commentaires.filter((c) => (req.ids || []).includes(c.post_id)).slice(0, req.limit || 200), error: null });
          if (table === "post_likes") return rendre({ data: [].concat(...(req.ids || []).map((id) => Array.from({ length: __likes[id] || 0 }, (_, i) => ({ post_id: id, user_id: i === 0 && id === "fil_00" ? MY_UID : "u" + i })))), error: null });
          return rendre({ data: [], error: null });
        },
      };
      return q;
    };
  }, opts);
}

const lectures = (page, table) => page.evaluate((t) => __lectures.filter((q) => !t || q.table === t).map((q) => ({ table: q.table, ids: q.ids && q.ids.length, eq: q.eq, or: q.or, limit: q.limit, orders: q.orders, rows: q.rows })), table);

test("une page de fil = une lecture groupée, aucune liste de likes/commentaires/réactions", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const posts = await supaLoadPosts();
    state.supabasePosts = posts;
    const p0 = posts.find((p) => p.id === "fil_00"), p1 = posts.find((p) => p.id === "fil_01");
    const carte = document.createElement("div"); carte.innerHTML = renderPostHTML(p0);
    return {
      n: posts.length, rpc: __rpc.map((r) => ({ fn: r.fn, n: r.args._post_ids.length, premier: r.args._post_ids[0] })),
      tables: __lectures.map((q) => q.table),
      p0: { likes: p0.likes, liked: p0.liked, total: p0.commentsTotal, apercus: p0.comments.map((c) => c.id), auteurs: p0.comments.map((c) => c.authorName), reactions: p0.reactions.map((x) => x.text), affiche: nbCommentairesPost(p0) },
      p1: { likes: p1.likes, liked: p1.liked, total: p1.commentsTotal, apercus: p1.comments.length, affiche: nbCommentairesPost(p1) },
      compteurCarte: carte.querySelector('[data-cmtcount="fil_00"]').textContent.trim(),
      likeCarte: carte.querySelector('[data-action="like"]').textContent.trim(),
    };
  });
  expect(r.n).toBe(20);
  expect(r.rpc).toEqual([{ fn: "fil_compteurs", n: 20, premier: "fil_00" }]);
  expect(r.tables).toEqual(["posts", "profiles"]); // les profils des auteurs d'aperçus, en une requête, comme avant
  expect(r.p0).toEqual({ likes: 12, liked: true, total: 45, apercus: ["c_044", "c_043"], auteurs: ["Dominique", "Camille"], reactions: ["😍"], affiche: 45 });
  expect(r.p1).toEqual({ likes: 0, liked: false, total: 1, apercus: 1, affiche: 1 });
  expect(r.compteurCarte).toBe("💬 45");
  // Le cœur de la carte suit `state.user.likedPosts` (état du compte), pas
  // `post.liked` : c'est le compte qui est mesuré ici.
  expect(r.likeCarte).toMatch(/ 12$/);
});

test("fonction absente (PGRST202) : repli sur les lectures d'avant, mémorisé pour la session", async ({ page }) => {
  await preparer(page, { rpcMode: "absente" });
  const r = await page.evaluate(async () => {
    const a = await supaLoadPosts();
    const rpcApres1 = __rpc.length, lecturesApres1 = __lectures.map((q) => q.table);
    __lectures.length = 0;
    const b = await supaLoadPosts();
    const p0 = b.find((p) => p.id === "fil_00");
    return { rpcApres1, lecturesApres1, rpcApres2: __rpc.length, lectures2: __lectures.map((q) => q.table),
      memo: sessionStorage.getItem("passio_fil_compteurs_absente"),
      p0: { likes: p0.likes, liked: p0.liked, total: p0.commentsTotal, nb: p0.comments.length, affiche: nbCommentairesPost(p0) } };
  });
  expect(r.rpcApres1).toBe(1);
  expect(r.lecturesApres1).toEqual(["posts", "post_likes", "post_comments", "comment_interactions", "profiles"]);
  expect(r.rpcApres2).toBe(1); // pas de second essai dans la session
  expect(r.lectures2).toEqual(["posts", "post_likes", "post_comments", "comment_interactions"]); // profils en cache
  expect(r.memo).toBeTruthy();
  // Chemin d'avant : la liste entière, et le compte est sa longueur.
  expect(r.p0).toEqual({ likes: 12, liked: true, total: undefined, nb: 45, affiche: 45 });
});

for (const mode of ["erreur", "reseau"]) {
  test("erreur passagère (" + mode + ") : lectures d'avant pour cette page, compteurs justes, la page suivante réessaie", async ({ page }) => {
    await preparer(page, { rpcMode: mode });
    const r = await page.evaluate(async () => {
      const a = await supaLoadPosts();
      const p0 = a.find((p) => p.id === "fil_00");
      const tables1 = __lectures.map((q) => q.table);
      __rpcMode = "ok"; __lectures.length = 0;
      const b = await supaLoadPosts();
      const q0 = b.find((p) => p.id === "fil_00");
      return { n: a.length, tables1, rpc: __rpc.length, memo: sessionStorage.getItem("passio_fil_compteurs_absente"),
        avant: { likes: p0.likes, total: p0.commentsTotal, nb: p0.comments.length }, apres: { likes: q0.likes, total: q0.commentsTotal, tables: __lectures.map((q) => q.table) } };
    });
    expect(r.n).toBe(20);
    expect(r.tables1).toEqual(["posts", "post_likes", "post_comments", "comment_interactions", "profiles"]);
    expect(r.rpc).toBe(2);
    expect(r.memo).toBeNull();
    expect(r.avant).toEqual({ likes: 12, total: undefined, nb: 45 });
    expect(r.apres).toEqual({ likes: 12, total: 45, tables: ["posts"] });
  });
}

test("sans SDK réel, le chemin d'avant est pris sans appel RPC", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    window._supaReal = false;
    await supaLoadPosts();
    return { rpc: __rpc.length, tables: __lectures.map((q) => q.table) };
  });
  expect(r.rpc).toBe(0);
  expect(r.tables).toEqual(["posts", "post_likes", "post_comments", "comment_interactions", "profiles"]);
});

test("la discussion se charge par pages de 30, les plus récents d'abord, puis « précédents » avec un curseur", async ({ page }) => {
  await preparer(page);
  await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    window._cmtThreadLoadedAt = {};
    __lectures.length = 0;
    await openComments("fil_00");
  });
  await expect(page.locator("#commentsBox .comment")).toHaveCount(30);
  let r = await page.evaluate(() => {
    const p = findPostAnywhere("fil_00");
    const ids = Array.from(document.querySelectorAll("#commentsBox .comment")).map((n) => n.getAttribute("data-commentid"));
    return { charges: p.comments.length, premier: ids[0], dernier: ids[ids.length - 1], suite: p._commentsSuite, total: p.commentsTotal,
      titre: document.querySelector(".modal-title").textContent, bouton: (document.querySelector("#commentsBox [data-cmtsuite]") || {}).textContent };
  });
  expect(r.charges).toBe(30);
  expect(r.premier).toBe("c_044");
  expect(r.dernier).toBe("c_015");
  expect(r.suite).toEqual({ created_at: "2026-09-21T11:00:15", id: "c_015" });
  expect(r.total).toBe(45);
  expect(r.titre).toBe("Discussion (45)");
  expect(r.bouton).toContain("15 restants");
  const page1 = await lectures(page, "post_comments");
  // `limite + 1` demandées (31), 30 gardées : la 31ᵉ prouve qu'il reste une page.
  expect(page1).toEqual([expect.objectContaining({ eq: ["post_id", "fil_00"], limit: 31, orders: ["created_at", "id"], rows: 31, or: undefined })]);

  await page.locator("#commentsBox [data-cmtsuite]").click();
  await expect(page.locator("#commentsBox .comment")).toHaveCount(45);
  r = await page.evaluate(() => {
    const p = findPostAnywhere("fil_00");
    const ids = Array.from(document.querySelectorAll("#commentsBox .comment")).map((n) => n.getAttribute("data-commentid"));
    return { charges: p.comments.length, dernier: ids[ids.length - 1], suite: p._commentsSuite, total: p.commentsTotal, doublons: new Set(ids).size,
      bouton: !!document.querySelector("#commentsBox [data-cmtsuite]"), affiche: nbCommentairesPost(p) };
  });
  expect(r).toEqual({ charges: 45, dernier: "c_000", suite: null, total: 45, doublons: 45, bouton: false, affiche: 45 });
  const page2 = (await lectures(page, "post_comments"))[1];
  expect(page2.or).toBe('created_at.lt."2026-09-21T11:00:15",and(created_at.eq."2026-09-21T11:00:15",id.lt."c_015")');
  expect(page2.rows).toBe(15);
});

test("une page incomplète est la liste entière : aucun bouton, et le total se recale", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const p = findPostAnywhere("fil_01");
    p.commentsTotal = 9; // un total périmé (commentaires supprimés entre-temps par d'autres)
    window._cmtThreadLoadedAt = {};
    await openComments("fil_01");
    return { charges: p.comments.length, suite: p._commentsSuite, total: p.commentsTotal, affiche: nbCommentairesPost(p),
      bouton: !!document.querySelector("#commentsBox [data-cmtsuite]") };
  });
  expect(r).toEqual({ charges: 1, suite: null, total: 1, affiche: 1, bouton: false });
});

test("le compte tient sans recharger : commentaire local, commentaire reçu en direct, suppression", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const p = findPostAnywhere("fil_01");
    const out = { depart: nbCommentairesPost(p) };
    // 1. Mon commentaire, pas encore en base : compte tout de suite.
    p.comments.unshift({ id: "c_local", authorId: MY_UID, text: "Moi", content: "Moi", createdAt: Date.now(), _pending: true });
    out.local = nbCommentairesPost(p);
    // 2. Un commentaire d'un autre, reçu par le canal temps réel.
    const bindings = [];
    supa.channel = () => { const ch = { on(type, cfg, cb) { bindings.push({ cfg, cb }); return ch; }, subscribe() { return ch; } }; return ch; };
    _creerCanalDb(true);
    const b = bindings.find((x) => x.cfg.table === "post_comments" && x.cfg.event === "INSERT");
    await b.cb({ new: { id: "c_direct", post_id: "fil_01", author_id: "dominique", content: "En direct", created_at: "2026-09-21T13:00:00" } });
    out.direct = { total: p.commentsTotal, affiche: nbCommentairesPost(p), tete: p.comments[0].id };
    // Le même événement rejoué ne compte pas deux fois.
    await b.cb({ new: { id: "c_direct", post_id: "fil_01", author_id: "dominique", content: "En direct", created_at: "2026-09-21T13:00:00" } });
    out.rejeu = nbCommentairesPost(p);
    // 3. Suppression d'un commentaire serveur, puis d'un local.
    window.supaLoadComments = async () => [];
    deleteCommentEntry("fil_01", "c_direct", true);
    out.apresSuppressionServeur = { total: p.commentsTotal, affiche: nbCommentairesPost(p) };
    deleteCommentEntry("fil_01", "c_local", true);
    out.apresSuppressionLocale = { total: p.commentsTotal, affiche: nbCommentairesPost(p) };
    // 4. Les réponses chargées comptent, comme avant.
    p.comments[0].replies = [{ id: "r1", text: "réponse" }, { id: "e1", type: "emoji_reaction", text: "😍" }];
    out.avecReponses = nbCommentairesPost(p);
    return out;
  });
  expect(r.depart).toBe(1);
  expect(r.local).toBe(2);
  expect(r.direct).toEqual({ total: 2, affiche: 3, tete: "c_direct" });
  expect(r.rejeu).toBe(3);
  expect(r.apresSuppressionServeur).toEqual({ total: 1, affiche: 2 });
  expect(r.apresSuppressionLocale).toEqual({ total: 1, affiche: 1 });
  expect(r.avecReponses).toBe(2);
});

test("nbCommentairesPost : sans total, la liste ; avec total, le plus grand des deux plus les locaux et les réponses", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const s = (c) => Object.assign({ fromSupabase: true }, c);
    return [
      nbCommentairesPost({ comments: [] }),
      nbCommentairesPost({ comments: [s({ id: 1 }), s({ id: 2, replies: [{ id: "r" }, { id: "e", type: "emoji_reaction" }] })] }),
      nbCommentairesPost({ commentsTotal: 7, comments: [s({ id: 1 }), s({ id: 2 })] }),
      nbCommentairesPost({ commentsTotal: 7, comments: [s({ id: 1 }), { id: "local", _pending: true }] }),
      nbCommentairesPost({ commentsTotal: 7, comments: [s({ id: 1 }), { id: "echec", _failed: true }] }),
      nbCommentairesPost({ commentsTotal: 7, comments: [s({ id: 1 }), { id: "persiste_sans_drapeau" }] }), // liste de l'ancien client : jamais par-dessus le total
      nbCommentairesPost({ commentsTotal: 1, comments: [s({ id: 1 }), s({ id: 2 }), s({ id: 3 })] }),
      nbCommentairesPost({ commentsTotal: 7, comments: [s({ id: 1, replies: [{ id: "r" }] })] }),
      nbCommentairesPost({ commentsTotal: -3, comments: [s({ id: 1 })] }),
      nbCommentairesPost({ commentsTotal: "7", comments: [s({ id: 1 })] }),
      nbCommentairesPost(null),
    ];
  });
  expect(r).toEqual([0, 3, 7, 8, 8, 7, 3, 8, 1, 1, 0]);
});

test("les signatures de rendu du fil citent l'autorité du compte, pas la longueur des aperçus", async () => {
  // Mesuré à la SOURCE : un rendu dont la signature ne bougerait qu'avec la
  // longueur de `comments` (deux aperçus, constante) ignorerait un nouveau total.
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "..", "js", "app-02-state-utils.js"), "utf8");
  // Hors définition : les quatre LECTEURS (deux signatures, carte, ranking).
  const occurrences = src.split("nbCommentairesPost(p)").length - 1 - src.split("function nbCommentairesPost(p)").length + 1;
  expect(occurrences).toBeGreaterThanOrEqual(4);
  for (const fn of ["_feedWindowCardSig", "feedPostScore"]) {
    const debut = src.indexOf("function " + fn);
    const corps = src.slice(debut, src.indexOf("\nfunction ", debut + 1));
    expect(corps, fn + " doit citer l'autorité").toContain("nbCommentairesPost(p)");
    // Le repli `: (p.comments || []).length` (autorité absente) est toléré ; pas un usage à froid.
    const sansRepli = corps.split("? nbCommentairesPost(p) : (p.comments || []).length").join("");
    expect(sansRepli, fn + " ne doit pas compter la liste").not.toMatch(/\(p\.comments \|\| \[\]\)\.length/);
  }
  // Le filet du fil (app-08) décide de repeindre sur SA signature : elle aussi.
  const src8 = fs.readFileSync(require("path").join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");
  const sig = src8.slice(src8.indexOf("function _feedPostsSig"), src8.indexOf("function _feedPostsSig") + 700);
  expect(sig).toContain("nbCommentairesPost(p)");
  expect(sig).not.toContain("(p.comments || []).length)");
});

test("le filet du fil repeint quand le total change, et ne ramène pas une discussion ouverte à deux lignes", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const sigAvant = _feedPostsSig(state.supabasePosts);
    // Discussion ouverte : 30 chargés, curseur posé.
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    const p = findPostAnywhere("fil_00");
    const charges = p.comments.length, suite = p._commentsSuite;
    // Un 46ᵉ commentaire arrive en base ; le filet recharge le fil.
    __commentaires.push({ id: "c_045", post_id: "fil_00", author_id: "camille", content: "Nouveau", created_at: "2026-09-21T11:00:45" });
    const posts = await supaLoadPosts();
    state.supabasePosts = posts;
    const q = findPostAnywhere("fil_00");
    return { sigChange: _feedPostsSig(posts) !== sigAvant, charges, suite,
      apres: { total: q.commentsTotal, charges: q.comments.length, tete: q.comments[0].id, auteur: q.comments[0].authorName, suite: q._commentsSuite, affiche: nbCommentairesPost(q) } };
  });
  expect(r.sigChange).toBe(true);
  // Le total SEUL fait bouger la signature (mêmes aperçus, même tête) ; la tête seule aussi.
  const seul = await page.evaluate(() => {
    const p = findPostAnywhere("fil_00");
    const a = _feedPostsSig([p]); p.commentsTotal--; const b = _feedPostsSig([p]); p.commentsTotal++;
    const c = _feedPostsSig([p]); const tete = p.comments[0]; p.comments.unshift({ id: "c_tete", fromSupabase: true, createdAt: Date.now() }); const d = _feedPostsSig([p]); p.comments.shift();
    return { totalSeul: a !== b, revenu: a === c, teteSeule: c !== d };
  });
  expect(seul).toEqual({ totalSeul: true, revenu: true, teteSeule: true });
  expect(r.charges).toBe(30);
  expect(r.suite).toEqual({ created_at: "2026-09-21T11:00:15", id: "c_015" });
  expect(r.apres).toEqual({ total: 46, charges: 31, tete: "c_045", auteur: "Camille", suite: { created_at: "2026-09-21T11:00:15", id: "c_015" }, affiche: 46 });
});

test("chemin d'avant (fonction absente) : ouvrir une discussion de 45 ne fait pas tomber le compte à 30", async ({ page }) => {
  await preparer(page, { rpcMode: "absente" });
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const p = findPostAnywhere("fil_00");
    const avant = nbCommentairesPost(p);
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    return { avant, charges: p.comments.length, total: p.commentsTotal, affiche: nbCommentairesPost(p),
      titre: document.querySelector(".modal-title").textContent, bouton: (document.querySelector("#commentsBox [data-cmtsuite]") || {}).textContent };
  });
  expect(r.avant).toBe(45);
  expect(r.charges).toBe(30);
  expect(r.total).toBe(45);
  expect(r.affiche).toBe(45);
  expect(r.titre).toBe("Discussion (45)");
  expect(r.bouton).toContain("15 restants");
});

test("la dernière page recale un total périmé à la hausse", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const p = findPostAnywhere("fil_00");
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    // Cinq commentaires supprimés par d'autres entre-temps (aucun DELETE écouté).
    window.__commentaires = __commentaires.filter((c) => !/^c_00[0-4]$/.test(c.id));
    await _chargerCommentairesPrecedents("fil_00");
    return { charges: p.comments.length, total: p.commentsTotal, affiche: nbCommentairesPost(p), bouton: !!document.querySelector("#commentsBox [data-cmtsuite]") };
  });
  expect(r).toEqual({ charges: 40, total: 40, affiche: 40, bouton: false });
});

test("une page en erreur ne laisse pas le squelette : les aperçus restent, le bouton aussi", async ({ page }) => {
  await preparer(page);
  // D'abord une publication SANS aperçu : le squelette est posé à l'ouverture,
  // et c'est la branche d'erreur qui doit le remplacer par l'état vide.
  const vide = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const original = supa.from;
    supa.from = (table) => table === "post_comments"
      ? { select() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; }, limit() { return this; }, then(ok) { return Promise.resolve({ data: null, error: { message: "permission denied" } }).then(ok); } }
      : original(table);
    window._cmtThreadLoadedAt = {};
    await openComments("fil_05");
    const box = document.getElementById("commentsBox");
    const out = { squelette: !!box.querySelector(".cmt-skel-wrap"), vide: !!box.querySelector(".empty"), lignes: box.querySelectorAll(".comment").length };
    supa.from = original; closeModal();
    return out;
  });
  expect(vide).toEqual({ squelette: false, vide: true, lignes: 0 });
  const r = await page.evaluate(async () => {
    const p = findPostAnywhere("fil_01");
    const original = supa.from;
    const enPanne = (table) => table === "post_comments"
      ? { select() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; }, limit() { return this; }, then(ok) { return Promise.resolve({ data: null, error: { message: "permission denied" } }).then(ok); } }
      : original(table);
    supa.from = enPanne;
    window._cmtThreadLoadedAt = {};
    await openComments("fil_01");
    const box = document.getElementById("commentsBox");
    const out = { squelette: !!box.querySelector(".cmt-skel-wrap"), lignes: box.querySelectorAll(".comment").length, affiche: nbCommentairesPost(p) };
    // Une page « précédents » en erreur garde le curseur et la liste.
    supa.from = original;
    const q = findPostAnywhere("fil_00");
    await openComments("fil_00");
    supa.from = enPanne;
    await _chargerCommentairesPrecedents("fil_00");
    out.suiteGardee = !!q._commentsSuite; out.chargesGardes = q.comments.length;
    out.boutonGarde = !!document.querySelector("#commentsBox [data-cmtsuite]");
    supa.from = original;
    return out;
  });
  expect(r).toEqual({ squelette: false, lignes: 1, affiche: 1, suiteGardee: true, chargesGardes: 30, boutonGarde: true });
});

test("trois erreurs consécutives de la fonction : plus d'essai de la session, lectures d'avant, rien de mémorisé", async ({ page }) => {
  await preparer(page, { rpcMode: "erreur" });
  const r = await page.evaluate(async () => {
    await supaLoadPosts(); await supaLoadPosts(); await supaLoadPosts(); // 3 échecs, chacun replié
    __lectures.length = 0;
    const c = await supaLoadPosts(); // 4ᵉ page : plus d'essai
    const p = c.find((x) => x.id === "fil_00");
    const tables4 = __lectures.map((q) => q.table);
    __rpcMode = "ok"; __lectures.length = 0;
    await supaLoadPosts(); // même une fonction revenue n'est plus tentée dans cette session
    return { rpc: __rpc.length, tables4, memo: sessionStorage.getItem("passio_fil_compteurs_absente"),
      likes: p.likes, nb: p.comments.length, tables5: __lectures.map((x) => x.table) };
  });
  expect(r.rpc).toBe(3);
  expect(r.tables4).toEqual(["posts", "post_likes", "post_comments", "comment_interactions"]);
  expect(r.memo).toBeNull();
  expect(r.likes).toBe(12);
  expect(r.nb).toBe(45);
  expect(r.tables5).toEqual(["posts", "post_likes", "post_comments", "comment_interactions"]);
});

test("la clé de mémorisation est l'identifiant de build, jamais « [object Object] »", async ({ page }) => {
  await preparer(page, { rpcMode: "absente" });
  const r = await page.evaluate(async () => {
    window.PASSIO_RELEASE = { schema: 1, buildId: "abcdef1234", commit: "0123456789abcdef0123456789abcdef01234567" };
    await supaLoadPosts();
    const cle = sessionStorage.getItem("passio_fil_compteurs_absente");
    // Nouvelle release : la mémorisation ne vaut plus, la fonction est réessayée.
    window.PASSIO_RELEASE = { schema: 1, buildId: "ffffff9999", commit: "ffffffffffffffffffffffffffffffffffffffff" };
    __rpcMode = "ok";
    const n = __rpc.length;
    await supaLoadPosts();
    return { cle, reessai: __rpc.length - n };
  });
  expect(r.cle).not.toContain("object");
  expect(r.cle).toMatch(/^[0-9a-f]{8}@[0-9]+$/); // release + horodatage (réessai après une heure)
  expect(r.reessai).toBe(1);
});

test("le panneau de commentaires des Bobines charge une page serveur et propose la suite", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const p = findPostAnywhere("fil_00");
    window._cmtThreadLoadedAt = {};
    if (!document.getElementById("reelCommentsPanel")) return { absent: true };
    openReelComments("fil_00");
    await new Promise((r) => setTimeout(r, 400));
    const liste = document.getElementById("reelCommentsList");
    const out = { items: liste.querySelectorAll(".reel-comment-item").length, charges: p.comments.length,
      bouton: (liste.querySelector("[data-cmtsuite]") || {}).textContent || "" };
    // Un commentaire arrivé en direct pendant ce temps figure DÉJÀ dans la
    // liste et sera aussi dans la page « précédents » : aucun doublon.
    p.comments.push({ id: "c_010", authorId: "camille", text: "Commentaire 10", content: "Commentaire 10", createdAt: supaTs("2026-09-21T11:00:10"), fromSupabase: true });
    liste.querySelector("[data-cmtsuite]").click();
    await new Promise((r) => setTimeout(r, 400));
    const ids = Array.from(liste.querySelectorAll(".reel-comment-item")).length;
    out.apres = { items: ids, charges: p.comments.length, doublons: new Set(p.comments.map(c => c.id)).size, bouton: !!liste.querySelector("[data-cmtsuite]") };
    return out;
  });
  expect(r.absent).toBeUndefined();
  expect(r.items).toBe(30);
  expect(r.charges).toBe(30);
  expect(r.bouton).toContain("15 restants");
  expect(r.apres).toEqual({ items: 45, charges: 45, doublons: 45, bouton: false });
});

test("mon commentaire confirmé devient serveur et entre dans le total : jamais compté deux fois après le filet", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const p = findPostAnywhere("fil_01");
    window._cmtThreadLoadedAt = {};
    await openComments("fil_01");
    const out = { depart: nbCommentairesPost(p) };
    // J'envoie un commentaire : local, compté tout de suite.
    p.comments.unshift({ id: "c_moi", authorId: MY_UID, text: "Moi", content: "Moi", createdAt: Date.now(), _pending: true });
    out.local = nbCommentairesPost(p);
    // La file confirme l'écriture : le nœud devient serveur, le total avance.
    _cmtObSetStatus("fil_01", "c_moi", true);
    out.confirme = { affiche: nbCommentairesPost(p), total: p.commentsTotal, serveur: !!p.comments.find(c => c.id === "c_moi").fromSupabase };
    // Le serveur compte désormais ma ligne ; le filet recharge le fil.
    __commentaires.push({ id: "c_moi", post_id: "fil_01", author_id: MY_UID, content: "Moi", created_at: "2026-09-21T12:30:00" });
    state.supabasePosts = await supaLoadPosts();
    const q = findPostAnywhere("fil_01");
    out.apresFilet = { affiche: nbCommentairesPost(q), total: q.commentsTotal };
    // Réouverture après 20 s : la page serveur porte ma ligne ; le titre ne recule pas.
    window._cmtThreadLoadedAt = {};
    await openComments("fil_01");
    out.reouverture = { affiche: nbCommentairesPost(findPostAnywhere("fil_01")), titre: document.querySelector(".modal-title").textContent };
    return out;
  });
  expect(r.depart).toBe(1);
  expect(r.local).toBe(2);
  expect(r.confirme).toEqual({ affiche: 2, total: 2, serveur: true });
  expect(r.apresFilet).toEqual({ affiche: 2, total: 2 });
  expect(r.reouverture).toEqual({ affiche: 2, titre: "Discussion (2)" });
});

test("réouvrir après 20 s ne jette pas les pages déjà chargées, et un total multiple de 30 n'affiche pas de bouton vide", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    await _chargerCommentairesPrecedents("fil_00"); // 45 chargés, curseur nul
    const p = findPostAnywhere("fil_00");
    const avant = { charges: p.comments.length, suite: p._commentsSuite };
    window._cmtThreadLoadedAt = {}; // cache expiré
    await openComments("fil_00");
    const q = findPostAnywhere("fil_00");
    const apres = { charges: q.comments.length, doublons: new Set(q.comments.map(c => c.id)).size, suite: q._commentsSuite, affiche: nbCommentairesPost(q), bouton: !!document.querySelector("#commentsBox [data-cmtsuite]") };
    // Exactement 30 commentaires (fil_02) : aucun bouton, aucune lecture à vide.
    for (let i = 0; i < 30; i++) __commentaires.push({ id: "t_" + String(i).padStart(2, "0"), post_id: "fil_02", author_id: "camille", content: "T" + i, created_at: "2026-09-21T13:00:" + String(i).padStart(2, "0") });
    state.supabasePosts = await supaLoadPosts();
    window._cmtThreadLoadedAt = {};
    await openComments("fil_02");
    const t = findPostAnywhere("fil_02");
    return { avant, apres, trente: { charges: t.comments.length, suite: t._commentsSuite, bouton: !!document.querySelector("#commentsBox [data-cmtsuite]"), affiche: nbCommentairesPost(t) } };
  });
  expect(r.avant).toEqual({ charges: 45, suite: null });
  expect(r.apres).toEqual({ charges: 45, doublons: 45, suite: null, affiche: 45, bouton: false });
  expect(r.trente).toEqual({ charges: 30, suite: null, bouton: false, affiche: 30 });
});

test("ma propre publication : le total exact atteint la copie userPosts, et la discussion ne se recale pas à la page", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.userPosts = [{ id: "fil_00", authorId: MY_UID, text: "À moi", comments: [], likes: 0, createdAt: Date.now(), type: "text" }];
    state.supabasePosts = await supaLoadPosts();
    const mien = findPostAnywhere("fil_00");
    const out = { copieUserPosts: mien === state.userPosts[0], total: mien.commentsTotal, affiche: nbCommentairesPost(mien) };
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    out.ouverture = { titre: document.querySelector(".modal-title").textContent, bouton: (document.querySelector("#commentsBox [data-cmtsuite]") || {}).textContent || "" };
    // La carte du fil (copie supabasePosts) et la copie userPosts disent la même chose.
    const carte = state.supabasePosts.find(p => p.id === "fil_00");
    out.coherence = { carte: nbCommentairesPost(carte), mien: nbCommentairesPost(findPostAnywhere("fil_00")), pagesCarte: carte.comments.length };
    state.userPosts = [];
    return out;
  });
  expect(r.copieUserPosts).toBe(true);
  expect(r.total).toBe(45); expect(r.affiche).toBe(45);
  expect(r.ouverture.titre).toBe("Discussion (45)"); expect(r.ouverture.bouton).toContain("15 restants");
  expect(r.coherence).toEqual({ carte: 45, mien: 45, pagesCarte: 30 });
});

test("la mémorisation « fonction absente » expire après une heure", async ({ page }) => {
  await preparer(page, { rpcMode: "absente" });
  const r = await page.evaluate(async () => {
    await supaLoadPosts();
    const memo = sessionStorage.getItem("passio_fil_compteurs_absente");
    const n1 = __rpc.length;
    await supaLoadPosts(); // mémorisé : pas d'essai
    const n2 = __rpc.length;
    // Une heure plus tard, la fonction a pu être appliquée : on réessaie.
    const [release, depuis] = memo.split("@");
    sessionStorage.setItem("passio_fil_compteurs_absente", release + "@" + (Number(depuis) - 3600001));
    __rpcMode = "ok";
    const c = await supaLoadPosts();
    return { forme: /@\d+$/.test(memo), n1, n2, n3: __rpc.length, total: c.find(p => p.id === "fil_00").commentsTotal };
  });
  expect(r.forme).toBe(true);
  expect(r.n1).toBe(1); expect(r.n2).toBe(1); expect(r.n3).toBe(2);
  expect(r.total).toBe(45);
});

test("ma publication : la liste persistée par l'ancien client (sans drapeau) ne double pas le total exact", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    // Neuf lignes sans `fromSupabase` ni `_pending` : ce que l'ancien client
    // laissait dans `userPosts` après une discussion ouverte ou mes propres commentaires.
    const persistees = Array.from({ length: 9 }, (_, i) => ({ id: "c_" + String(36 + i).padStart(3, "0"), authorId: "camille", text: "ancien " + i, createdAt: 1000 + i }));
    state.userPosts = [{ id: "fil_00", authorId: MY_UID, text: "À moi", comments: persistees, likes: 0, createdAt: Date.now(), type: "text" }];
    state.supabasePosts = await supaLoadPosts();
    const mien = findPostAnywhere("fil_00");
    const out = { total: mien.commentsTotal, affiche: nbCommentairesPost(mien), carte: nbCommentairesPost(state.supabasePosts.find(p => p.id === "fil_00")) };
    // Ouverture : la page serveur remplace la liste persistée (mêmes ids → dédoublonnés), rien en double.
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    const q = findPostAnywhere("fil_00");
    out.ouverture = { charges: q.comments.length, doublons: new Set(q.comments.map(c => c.id)).size, affiche: nbCommentairesPost(q), titre: document.querySelector(".modal-title").textContent };
    // Le rendu de MON profil et de la carte disent 45, pas 54.
    out.html = (renderPostHTML(mien).match(/💬\s*(\d+)/) || [])[1];
    state.userPosts = [];
    return out;
  });
  expect(r.total).toBe(45);
  expect(r.affiche).toBe(45); expect(r.carte).toBe(45); expect(r.html).toBe("45");
  expect(r.ouverture).toEqual({ charges: 30, doublons: 30, affiche: 45, titre: "Discussion (45)" });
});

test("une réponse confirmée par la file devient serveur sans entrer dans le total de premier niveau", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    window._cmtThreadLoadedAt = {};
    await openComments("fil_01");
    const p = findPostAnywhere("fil_01");
    const parent = p.comments.find(c => c.id === "c_seul");
    parent.replies = [{ id: "reply_1", authorId: MY_UID, text: "ma réponse", createdAt: Date.now(), _pending: true }];
    const avant = { affiche: nbCommentairesPost(p), total: p.commentsTotal };
    _cmtObSetStatus("fil_01", "reply_1", true);
    await new Promise(r => requestAnimationFrame(() => r())); // le rafraîchissement de la modale est différé d'une image
    return { avant, apres: { affiche: nbCommentairesPost(p), total: p.commentsTotal, serveur: parent.replies[0].fromSupabase === true, titre: document.querySelector(".modal-title").textContent } };
  });
  expect(r.avant).toEqual({ affiche: 2, total: 1 });
  expect(r.apres).toEqual({ affiche: 2, total: 1, serveur: true, titre: "Discussion (2)" });
});

test("un GIF posté depuis la carte passe par la file : en attente, puis confirmé une seule fois", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.supabasePosts = await supaLoadPosts();
    const p = findPostAnywhere("fil_01");
    window.__envoisGif = [];
    window.supaAddComment = async (postId, content, cid) => { __envoisGif.push({ postId, content, cid }); return true; };
    localStorage.removeItem("passio_comment_outbox_v1");
    const ok = _postGifComment("fil_01", "https://media.tenor.com/x/passio.gif") === false; // false = « commentaire, pas une réaction » (contrat de la fonction)
    const noeud = p.comments.find(c => c.text === "https://media.tenor.com/x/passio.gif");
    const enAttente = { ok, pending: noeud && noeud._pending === true, affiche: nbCommentairesPost(p), total: p.commentsTotal };
    // La file envoie et confirme.
    await _cmtObFlush();
    await new Promise(r => setTimeout(r, 50));
    const apres = { envois: __envoisGif.length, serveur: noeud.fromSupabase === true, pending: noeud._pending === true, affiche: nbCommentairesPost(p), total: p.commentsTotal };
    // Le serveur compte la ligne ; le filet ne la compte pas deux fois.
    __commentaires.push({ id: noeud.id, post_id: "fil_01", author_id: MY_UID, content: noeud.text, created_at: "2026-09-21T12:40:00" });
    state.supabasePosts = await supaLoadPosts();
    return { enAttente, apres, filet: nbCommentairesPost(findPostAnywhere("fil_01")) };
  });
  expect(r.enAttente).toEqual({ ok: true, pending: true, affiche: 2, total: 1 });
  expect(r.apres).toEqual({ envois: 1, serveur: true, pending: false, affiche: 2, total: 2 });
  expect(r.filet).toBe(2);
});

test("ma publication : supprimer un commentaire décrémente le total sur TOUTES les copies", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    state.userPosts = [{ id: "fil_01", authorId: MY_UID, text: "À moi", comments: [], likes: 0, createdAt: Date.now(), type: "text" }];
    state.supabasePosts = await supaLoadPosts();
    window._cmtThreadLoadedAt = {};
    await openComments("fil_01");
    window.supaLoadComments = async () => [];
    window.supaDeleteComment = async () => true;
    deleteCommentEntry("fil_01", "c_seul", true);
    const mien = findPostAnywhere("fil_01"), carte = state.supabasePosts.find(p => p.id === "fil_01");
    const out = { mien: { total: mien.commentsTotal, affiche: nbCommentairesPost(mien) }, carte: { total: carte.commentsTotal, affiche: nbCommentairesPost(carte) }, html: (renderPostHTML(carte).match(/💬\s*(\d+)/) || [])[1] };
    state.userPosts = [];
    return out;
  });
  expect(r.mien).toEqual({ total: 0, affiche: 0 });
  expect(r.carte).toEqual({ total: 0, affiche: 0 });
  expect(r.html).toBe("0");
});

test("un commentaire supprimé en base par son auteur ne revient pas à la réouverture, ni dans le total", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    // fil_03 : 5 commentaires, discussion entièrement chargée (≤ 30, curseur nul).
    for (let i = 0; i < 5; i++) __commentaires.push({ id: "d_" + i, post_id: "fil_03", author_id: "camille", content: "D" + i, created_at: "2026-09-21T14:00:0" + i });
    state.supabasePosts = await supaLoadPosts();
    window._cmtThreadLoadedAt = {};
    await openComments("fil_03");
    const avant = { charges: findPostAnywhere("fil_03").comments.length, affiche: nbCommentairesPost(findPostAnywhere("fil_03")) };
    // Camille supprime d_0 (le plus ancien) ET d_4 (le plus récent) sur son téléphone.
    window.__commentaires = __commentaires.filter(c => c.id !== "d_0" && c.id !== "d_4");
    window._cmtThreadLoadedAt = {}; // > 20 s
    await openComments("fil_03");
    const q = findPostAnywhere("fil_03");
    const apres = { charges: q.comments.length, ids: q.comments.map(c => c.id).sort(), affiche: nbCommentairesPost(q), total: q.commentsTotal, titre: document.querySelector(".modal-title").textContent };
    // Même chose sur une discussion PAGINÉE (fil_00 : 45, deux pages) : une ligne
    // de la première page supprimée en base disparaît ; les pages plus anciennes restent.
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    await _chargerCommentairesPrecedents("fil_00");
    window.__commentaires = __commentaires.filter(c => c.id !== "c_044"); // le plus récent de fil_00
    window._cmtThreadLoadedAt = {};
    await openComments("fil_00");
    const w = findPostAnywhere("fil_00");
    return { avant, apres, paginee: { charges: w.comments.length, revenu: w.comments.some(c => c.id === "c_044"), affiche: nbCommentairesPost(w), total: w.commentsTotal, suite: w._commentsSuite } };
  });
  expect(r.avant).toEqual({ charges: 5, affiche: 5 });
  expect(r.apres).toEqual({ charges: 3, ids: ["d_1", "d_2", "d_3"], affiche: 3, total: 3, titre: "Discussion (3)" });
  expect(r.paginee).toEqual({ charges: 44, revenu: false, affiche: 44, total: 44, suite: null });
});
