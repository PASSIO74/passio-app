// ═══════════════════════════════════════════════════════════════════════════
// R37 — LE RETRAIT D'UNE INTERACTION D'UN AUTRE COMPTE SE VOIT EN DIRECT
// (audit 2026-11-02, registre RV-30 ; lot du 2026-11-05)
//
// LE DÉFAUT : le gestionnaire DELETE de `comment_interactions` (`_creerCanalDb`,
// app-08) passait `payload.old` à `_applyCommentInteractionEvent`, qui sort sur
// `!r.comment_id`. Or `realtime.apply_rls` réduit l'ancienne ligne d'un DELETE à
// la clé primaire quand la RLS est active : `payload.old` vaut `{ id }`, avant R25
// comme après. Un like, un emoji, un GIF ou une réaction de publication retirés
// par un autre compte restaient donc affichés jusqu'à la réouverture de la
// discussion. Et seule la branche « like » savait retirer quoi que ce soit.
//
// CE QUE CETTE SUITE EXIGE DU VRAI CÂBLAGE (la liaison posée par `_creerCanalDb`,
// nourrie de la charge EXACTE du serveur) :
//   ① une discussion lue (`supaLoadCommentInteractions`, `id` compris) : le
//     retrait d'un like, d'un emoji, d'un GIF et d'une réponse se voit, ZÉRO
//     requête, et seulement la ligne visée (le like d'un tiers reste) ;
//   ② une réaction de publication rendue par `fil_compteurs` SANS identifiant :
//     un DELETE inconnu déclenche UNE lecture des identifiants, bornée aux
//     publications à l'écran, et la réaction retirée disparaît ; ensuite plus
//     aucune lecture, même après un nouveau tour du filet ;
//   ③ une réaction REÇUE en direct puis retirée : zéro requête, et la clé
//     naturelle traverse les deux formats d'horodatage (temps réel ↔ REST) ;
//   ④ un DELETE que rien à l'écran ne concerne ne coûte AUCUNE requête, même
//     avec des exemples du fil à l'écran ; ⑤ page masquée : rien ne part, le
//     rendez-vous attend le retour ;
//   ⑥ RV-31 : un DELETE de `conv_reads` n'est pas un accusé de lecture ;
//   ⑦ le contrat de lecture (`id`, `post_id`) et la borne de l'index ;
//   ⑧ une réaction PERSISTÉE par une session précédente (elle porte son
//     identifiant, l'index en mémoire ne l'a jamais vue) part quand même.
// Éprouvée par RÉINJECTION (2026-11-05) : l'ancien gestionnaire rougit ①→⑤ ;
// sans la garde RV-31, ⑥ ; sans `id`/`post_id` à la lecture, ① et ⑦ ; sans
// l'exclusion des exemples, ④ ; sans le report d'une page masquée, ⑤ ; sans la
// clé naturelle au tour du filet, ② et ③ ; sans la recherche à l'écran, ⑧.
// Aucune requête ne part : `supa.channel`, `supa.from` et `supa.rpc` sont simulés.
// Fiche : `docs/journal/capacite-perf-realtime.md`, « 🧹 R37 ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "812aee2b-214f-4949-931e-842599b6d68b";
const ALICE = "3a1f6c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const ZOE = "9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a6f";
const P = "post_r37";
const C = "c_r37";
const GIF = "https://media.tenor.com/r37/essai.gif";

async function preparer(page, opts = {}) {
  await bootOnboarded(page);
  // Le démarrage d'abord : ses lectures différées ne doivent pas tomber dans le journal.
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate((o) => {
    try { stopFeedRefreshLoop(); } catch (e) {}
    try { stopPostLikeRefresh(); } catch (e) {}
    try { _clearProfileCache(); } catch (e) {}
    window._cmtThreadLoadedAt = {};
    try { _feedPagination = null; } catch (e) {}
    window._feedExtraPosts = [];
    state.supabasePosts = [];
    state.user.blocked = [];
    MY_UID = o.moi; window.MY_UID = MY_UID;
    window._supaReal = true;
    window.requireAuthentication = () => true;
    window.supaInsertNotif = async () => null;
    window.supaTrack = async () => null;
    sessionStorage.removeItem("passio_fil_compteurs_absente");

    // ── Le « serveur » : une table, des lectures journalisées ──
    window.__lectures = [];
    window.__interactions = [
      { id: "ci_like_A", comment_id: o.C, post_id: o.P, user_id: o.alice, kind: "like", payload: null, created_at: "2026-11-05T09:00:00.100000+00:00" },
      { id: "ci_like_Z", comment_id: o.C, post_id: o.P, user_id: o.zoe, kind: "like", payload: null, created_at: "2026-11-05T09:00:01.100000+00:00" },
      { id: "ci_emoji_A", comment_id: o.C, post_id: o.P, user_id: o.alice, kind: "emoji", payload: "🔥", created_at: "2026-11-05T09:00:02.123456+00:00" },
      { id: "ci_gif_A", comment_id: o.C, post_id: o.P, user_id: o.alice, kind: "gif", payload: o.gif, created_at: "2026-11-05T09:00:03.000000+00:00" },
      { id: "ci_reply_A", comment_id: o.C, post_id: o.P, user_id: o.alice, kind: "reply", payload: "Réponse d'Alice", created_at: "2026-11-05T09:00:04.000000+00:00" },
    ].concat(o.reactionsPost === false ? [] : [
      { id: "ci_post_A", comment_id: o.P, post_id: o.P, user_id: o.alice, kind: "emoji", payload: "😍", created_at: "2026-11-05T09:00:05.654321+00:00" },
      { id: "ci_post_Z", comment_id: o.P, post_id: o.P, user_id: o.zoe, kind: "emoji", payload: "🎸", created_at: "2026-11-05T09:00:06.000000+00:00" },
    ]);
    window.__posts = [{
      id: o.P, author_id: o.alice, passion_id: "photo", mood: "all", content: "Publication R37", created_at: "2026-11-05T08:00:00", media_url: null,
      profiles: { username: "Alice", emoji: "📷", color: "#123456", avatar_url: null, is_private: false },
    }];
    window.__commentaires = [{ id: o.C, post_id: o.P, author_id: o.alice, content: "Commentaire d'Alice", created_at: "2026-11-05T08:30:00" }];
    window.__profils = [
      { id: o.alice, username: "Alice", emoji: "📷", color: "#123456", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      { id: o.zoe, username: "Zoé", emoji: "🎸", color: "#654321", avatar_url: null, passion_id: "musique", passions: [], bio: "" },
    ];
    // `fil_compteurs` rend les réactions SANS identifiant : c'est le fait de production.
    supa.rpc = (fn, args) => {
      __lectures.push({ table: "rpc:" + fn });
      if (fn !== "fil_compteurs") return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: (args._post_ids || []).map((id) => {
        const cs = __commentaires.filter((c) => c.post_id === id);
        return {
          post_id: id, likes: 0, aime: false, commentaires: cs.length,
          apercus: cs.slice(0, 2).map((c) => ({ id: c.id, author_id: c.author_id, content: c.content, created_at: c.created_at })),
          reactions: __interactions.filter((i) => i.comment_id === id && (i.kind === "emoji" || i.kind === "gif") && i.payload != null)
            .map((i) => ({ user_id: i.user_id, kind: i.kind, payload: i.payload, created_at: i.created_at })),
        };
      }), error: null });
    };
    supa.from = function (table) {
      const req = { table, ins: {}, orders: [] };
      const q = {
        select: (cols) => { req.cols = cols; return q; },
        eq: (col, v) => { req.eq = [col, v]; return q; },
        in: (col, vs) => { req.ins[col] = vs.slice(); return q; },
        order: (col) => { req.orders.push(col); return q; },
        limit: (n) => { req.limit = n; return q; },
        range: (a, b) => { req.range = [a, b]; return q; },
        or: (f) => { req.or = f; return q; },
        then: (ok, ko) => {
          __lectures.push(req);
          const rendre = (res) => Promise.resolve(res).then(ok, ko);
          if (table === "profiles") return rendre({ data: __profils.filter((p) => (req.ins.id || []).includes(p.id)), error: null });
          if (table === "posts") return rendre({ data: __posts.slice(req.range ? req.range[0] : 0, req.range ? req.range[1] + 1 : undefined), error: null });
          if (table === "post_comments") return rendre({ data: __commentaires.filter((c) => !req.eq || c.post_id === req.eq[1]), error: null });
          if (table === "comment_interactions") {
            let rows = __interactions.filter((i) => (req.ins.comment_id || []).includes(i.comment_id));
            if (req.ins.kind) rows = rows.filter((i) => req.ins.kind.includes(i.kind));
            // La forme d'une ligne REST : les seules colonnes demandées.
            const cols = String(req.cols || "").split(",").map((s) => s.trim()).filter(Boolean);
            rows = rows.map((i) => Object.fromEntries(cols.map((c) => [c, i[c]])));
            return rendre({ data: rows, error: null });
          }
          return rendre({ data: [], error: null });
        },
      };
      return q;
    };

    // ── Le SDK temps réel simulé, qui RETIENT chaque liaison ──
    window.__canaux = [];
    Object.defineProperty(window.supa, "channel", { configurable: true, writable: true, value: function (topic) {
      const ch = { topic, liaisons: [], on(type, filtre, cb) { ch.liaisons.push({ type, filtre, cb }); return ch; },
        subscribe() { return ch; }, unsubscribe: async () => "ok" };
      window.__canaux.push(ch);
      return ch;
    } });
    window.__canalDb = _creerCanalDb(true);
    window.__liaison = (table, evenement) => {
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === table && x.filtre.event === evenement);
      if (!l) throw new Error("aucune liaison " + evenement + " sur " + table);
      return l.cb;
    };
    // La charge EXACTE d'un DELETE sous RLS : la clé primaire, rien d'autre.
    window.__supprimer = (id) => {
      window.__interactions = __interactions.filter((i) => i.id !== id);
      __liaison("comment_interactions", "DELETE")({ schema: "public", table: "comment_interactions", eventType: "DELETE",
        commit_timestamp: "2026-11-05T10:00:00Z", errors: null, new: {}, old: { id } });
    };
    window.__lecturesCi = () => __lectures.filter((q) => q.table === "comment_interactions");
    window.__pastille = (pid) => Array.from(document.querySelectorAll('[data-postchip="' + pid + '"]')).map((h) => h.textContent.trim());
    window.__poserCarte = (pid) => {
      document.querySelectorAll("[data-r37-carte]").forEach((n) => n.remove());
      const carte = document.createElement("div");
      carte.setAttribute("data-r37-carte", "1");
      carte.innerHTML = renderPostHTML(findPostAnywhere(pid));
      document.body.appendChild(carte);
    };
  }, { moi: MOI, alice: ALICE, zoe: ZOE, P, C, gif: GIF, reactionsPost: opts.reactionsPost });
}

const etatCommentaire = (page) => page.evaluate((c) => {
  const p = findPostAnywhere("post_r37");
  const n = (p.comments || []).find((x) => x.id === c);
  const boite = document.getElementById("commentsBox");
  const dom = boite && boite.querySelector('.comment[data-commentid="' + c + '"]');
  return {
    likes: n.likes, likedBy: (n.likedBy || []).slice().sort(),
    emojis: (n.replies || []).filter((r) => r.type === "emoji_reaction").map((r) => r.text),
    gifs: (n.replies || []).filter((r) => r.type === "gif_reaction").length,
    reponses: (n.replies || []).filter((r) => !r.type).map((r) => r.text),
    boutonLike: dom ? dom.querySelector('[data-cmtlike="' + c + '"]').textContent.trim() : null,
    pastille: dom ? dom.querySelector('[data-cmtchip="' + c + '"]').textContent.trim() : null,
    gifAffiche: dom ? !!dom.querySelector('img[alt="GIF"]') : null,
    reponseAffichee: dom ? dom.textContent.indexOf("Réponse d'Alice") !== -1 : null,
  };
}, C);

test.describe("R37 — un retrait d'interaction se voit en direct", () => {
  test("① discussion lue : like, emoji, GIF et réponse retirés par un autre compte disparaissent, sans relire la discussion", async ({ page }) => {
    await preparer(page);
    await page.evaluate(async () => {
      state.supabasePosts = await supaLoadPosts();
      window._cmtThreadLoadedAt = {};
      await openComments("post_r37");
    });
    await expect(page.locator('#commentsBox .comment[data-commentid="c_r37"]')).toHaveCount(1);
    const avant = await etatCommentaire(page);
    expect(avant).toEqual({
      likes: 2, likedBy: [ALICE, ZOE].sort(), emojis: ["🔥"], gifs: 1, reponses: ["Réponse d'Alice"],
      boutonLike: "🤍 2", pastille: "🔥 1", gifAffiche: true, reponseAffichee: true,
    });

    await page.evaluate(() => { __lectures.length = 0; });
    await page.evaluate(() => __supprimer("ci_like_A"));
    let r = await etatCommentaire(page);
    expect(r.likes, "le like d'Alice est retiré").toBe(1);
    expect(r.likedBy, "celui de Zoé reste").toEqual([ZOE]);
    expect(r.boutonLike, "le bouton, à l'écran").toBe("🤍 1");

    await page.evaluate(() => __supprimer("ci_emoji_A"));
    r = await etatCommentaire(page);
    expect(r.emojis).toEqual([]);
    expect(r.pastille, "la pastille disparaît").toBe("");

    await page.evaluate(() => __supprimer("ci_gif_A"));
    await expect.poll(async () => (await etatCommentaire(page)).gifAffiche, { message: "le GIF quitte la liste des réponses" }).toBe(false);

    await page.evaluate(() => __supprimer("ci_reply_A"));
    await expect.poll(async () => (await etatCommentaire(page)).reponseAffichee, { message: "la réponse quitte la liste" }).toBe(false);

    r = await etatCommentaire(page);
    expect(r).toMatchObject({ likes: 1, likedBy: [ZOE], emojis: [], gifs: 0, reponses: [] });
    // ⚠️ Pas « aucune requête du tout » : l'application a sa propre activité de
    // fond (événements, notifications, abonnements…), sans rapport avec le cas.
    // Ce qui est prouvé, c'est que la DISCUSSION n'est pas relue.
    const bilan = await page.evaluate(() => ({
      interactions: __lecturesCi().length,
      commentaires: __lectures.filter((q) => q.table === "post_comments").length,
      stats: Object.assign({}, window._ciStats),
    }));
    expect(bilan.interactions, "AUCUNE relecture de comment_interactions : l'index suffit").toBe(0);
    expect(bilan.commentaires, "ni des commentaires").toBe(0);
    expect(bilan.stats.retraitsAppliques).toBe(4);
    expect(bilan.stats.inconnues).toBe(0);
  });

  test("② réaction de publication venue de fil_compteurs (sans id) : UNE lecture des identifiants, la réaction part, puis plus rien", async ({ page }) => {
    await preparer(page);
    await page.evaluate(async () => { state.supabasePosts = await supaLoadPosts(); __poserCarte("post_r37"); });
    let r = await page.evaluate(() => ({
      ci: findPostAnywhere("post_r37").reactions.map((x) => x.ci || null),
      pastille: __pastille("post_r37"),
    }));
    expect(r.ci, "fil_compteurs ne rend pas l'identifiant").toEqual([null, null]);
    expect(r.pastille[0]).toMatch(/2$/);

    await page.evaluate(() => { __lectures.length = 0; __supprimer("ci_post_A"); });
    await expect.poll(() => page.evaluate(() => __pastille("post_r37")[0]), { message: "la réaction d'Alice part de la pastille" }).toMatch(/^🎸 1$/);
    r = await page.evaluate(() => ({
      lectures: __lecturesCi().map((q) => ({ comment_id: q.ins.comment_id, kind: q.ins.kind, cols: q.cols, limit: q.limit })),
      reactions: findPostAnywhere("post_r37").reactions.map((x) => ({ auteur: x.authorId, texte: x.text, ci: x.ci })),
      stats: Object.assign({}, window._ciStats),
    }));
    expect(r.lectures, "une seule lecture, bornée à la publication à l'écran et aux réactions").toEqual([
      { comment_id: ["post_r37"], kind: ["emoji", "gif"], cols: "id,comment_id,post_id,user_id,kind,payload,created_at", limit: 1000 },
    ]);
    expect(r.reactions).toEqual([{ auteur: ZOE, texte: "🎸", ci: "ci_post_Z" }]);
    expect(r.stats.verifications).toBe(1);

    // Un autre DELETE inconnu : la réaction restante a désormais son identifiant.
    await page.evaluate(() => __liaison("comment_interactions", "DELETE")({ eventType: "DELETE", new: {}, old: { id: "ci_ailleurs_1" } }));
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => __lecturesCi().length), "plus aucune lecture : tout ce qui est à l'écran est connu").toBe(1);

    // Un nouveau tour du filet rend les réactions SANS id : la clé naturelle le retrouve.
    r = await page.evaluate(async () => {
      state.supabasePosts = await supaLoadPosts(); __poserCarte("post_r37");
      __liaison("comment_interactions", "DELETE")({ eventType: "DELETE", new: {}, old: { id: "ci_ailleurs_2" } });
      await new Promise((ok) => setTimeout(ok, 800));
      return { ci: findPostAnywhere("post_r37").reactions.map((x) => x.ci), lectures: __lecturesCi().length };
    });
    expect(r.ci).toEqual(["ci_post_Z"]);
    expect(r.lectures, "le filet ne fait pas renaître la lecture").toBe(1);
  });

  test("③ réaction reçue en direct puis retirée : zéro requête, à travers les deux formats d'horodatage", async ({ page }) => {
    await preparer(page, { reactionsPost: false });
    await page.evaluate(async () => { state.supabasePosts = await supaLoadPosts(); __poserCarte("post_r37"); });
    // L'INSERT tel que supabase-js le rend : horodatage au format du temps réel (`+00`).
    await page.evaluate(([alice]) => {
      const ligne = { id: "ci_direct_A", comment_id: "post_r37", post_id: "post_r37", user_id: alice, kind: "emoji", payload: "🎉" };
      __interactions.push(Object.assign({ created_at: "2026-11-05T10:00:00.123456+00:00" }, ligne));
      __liaison("comment_interactions", "INSERT")({ eventType: "INSERT", old: {}, new: Object.assign({ created_at: "2026-11-05T10:00:00.123456+00" }, ligne) });
    }, [ALICE]);
    expect(await page.evaluate(() => __pastille("post_r37")[0])).toBe("🎉 1");
    // Le filet relit la publication : REST écrit `+00:00`, et l'identifiant suit.
    const ci = await page.evaluate(async () => {
      state.supabasePosts = await supaLoadPosts(); __poserCarte("post_r37");
      return findPostAnywhere("post_r37").reactions.map((x) => x.ci);
    });
    expect(ci, "la clé naturelle traverse `+00` et `+00:00`").toEqual(["ci_direct_A"]);

    await page.evaluate(() => { __lectures.length = 0; __supprimer("ci_direct_A"); });
    expect(await page.evaluate(() => __pastille("post_r37")[0]), "retirée aussitôt").toBe("");
    await page.waitForTimeout(800);
    const bilan = await page.evaluate(() => ({ lectures: __lecturesCi().length, reactions: findPostAnywhere("post_r37").reactions.length }));
    expect(bilan).toEqual({ lectures: 0, reactions: 0 });
  });

  test("④ un DELETE qui ne concerne rien à l'écran ne coûte aucune requête, exemples du fil compris", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => {
      // Un exemple du fil à l'écran, avec une réaction d'un compte de démonstration :
      // il n'a pas de ligne en base, il ne doit JAMAIS faire lire quoi que ce soit.
      const ex = (state.seed.posts || [])[0];
      ex.reactions = [{ id: "semoji_demo", authorId: "u_demo", text: "😍", type: "emoji_reaction", createdAt: Date.now() }];
      const carte = document.createElement("div"); carte.innerHTML = renderPostHTML(ex); document.body.appendChild(carte);
      __lectures.length = 0;
      __liaison("comment_interactions", "DELETE")({ eventType: "DELETE", new: {}, old: { id: "ci_ailleurs" } });
      // Une charge sans clé (identité changée un jour) : rien ne lève.
      __liaison("comment_interactions", "DELETE")({ eventType: "DELETE", new: {}, old: {} });
    });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ lectures: __lecturesCi().length, stats: Object.assign({}, window._ciStats) }));
    expect(r.lectures, "aucune lecture de comment_interactions").toBe(0);
    expect(r.stats.inconnues).toBe(2);
    expect(r.stats.verifications).toBe(0);
  });

  test("⑤ page masquée : la lecture des identifiants attend le retour à l'écran", async ({ page }) => {
    await preparer(page);
    await page.evaluate(async () => { state.supabasePosts = await supaLoadPosts(); __poserCarte("post_r37"); });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      __lectures.length = 0;
      __supprimer("ci_post_A");
    });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => __lecturesCi().length), "rien ne part d'une page masquée").toBe(0);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => page.evaluate(() => __pastille("post_r37")[0]), { message: "rattrapé au retour" }).toBe("🎸 1");
    expect(await page.evaluate(() => __lecturesCi().length)).toBe(1);
  });

  test("⑥ RV-31 : un DELETE de conv_reads n'est pas un accusé de lecture", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(([alice]) => {
      // Une conversation 1:1 SANS correspondant : `undefined === undefined` la
      // rattachait à la charge vide d'un DELETE.
      const orpheline = { id: "conv_orpheline", isGroup: false, userName: "?", messages: [], unread: 0, lastAt: Date.now() };
      const dm = { id: "conv_dm", isGroup: false, userId: alice, userName: "Alice", messages: [], unread: 0, lastAt: Date.now() };
      conversationsState = [orpheline, dm];
      const cb = __liaison("conv_reads", "*");
      cb({ eventType: "DELETE", new: {}, old: {} });
      const apresDelete = { orpheline: !!orpheline._otherRead, dm: !!dm._otherRead };
      // Le témoin : un vrai accusé de lecture passe toujours.
      cb({ eventType: "UPDATE", old: {}, new: { conv_id: "conv_dm", user_id: alice, last_read_at: "2026-11-05T10:00:00.000000+00:00" } });
      return { apresDelete, dmLu: !!dm._otherRead, orphelineLue: !!orpheline._otherRead };
    }, [ALICE]);
    expect(r.apresDelete).toEqual({ orpheline: false, dm: false });
    expect(r.dmLu, "témoin : l'UPDATE est appliqué").toBe(true);
    expect(r.orphelineLue).toBe(false);
  });

  test("⑧ réaction persistée par une session précédente : elle porte son identifiant, l'index ne la connaît pas, elle part quand même, sans lecture", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async ([alice]) => {
      // Ma publication, dans `userPosts` (que `findPostAnywhere` préfère), avec la
      // réaction d'Alice reçue en direct lors d'une session PRÉCÉDENTE : l'entrée
      // persistée porte son identifiant, l'index (en mémoire) ne l'a jamais vu.
      state.userPosts = state.userPosts || [];
      state.userPosts.unshift({ id: "post_mien_r37", authorId: MY_UID, authorName: "Moi", authorEmoji: "✨", authorColor: "#8b5cf6",
        authorAvatar: null, passion: "photo", mood: "all", type: "text", text: "Ma publication", image: null, video: null, audio: null,
        createdAt: Date.now() - 3600000, likes: 0, liked: false, comments: [], fromSupabase: true,
        reactions: [{ id: "semoji_x_" + alice, ci: "ci_persiste", authorId: alice, text: "🙌", type: "emoji_reaction", createdAt: Date.now() - 1000 }] });
      __poserCarte("post_mien_r37");
      const avant = __pastille("post_mien_r37")[0];
      const connue = _ciIndex.has("ci_persiste");
      __lectures.length = 0;
      __liaison("comment_interactions", "DELETE")({ eventType: "DELETE", new: {}, old: { id: "ci_persiste" } });
      await new Promise((ok) => setTimeout(ok, 800));
      return { avant, connue, apres: __pastille("post_mien_r37")[0], reactions: findPostAnywhere("post_mien_r37").reactions.length, lectures: __lecturesCi().length };
    }, [ALICE]);
    expect(r.avant).toBe("🙌 1");
    expect(r.connue, "prémisse : l'index ne la connaît pas").toBe(false);
    expect(r).toMatchObject({ apres: "", reactions: 0, lectures: 0 });
  });

  test("⑦ contrat : la lecture d'une discussion demande `id` et `post_id`, et l'index reste borné", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      await supaLoadCommentInteractions(["c_r37"]);
      const cols = __lecturesCi().map((q) => q.cols);
      for (let i = 0; i < CI_INDEX_MAX + 25; i++) {
        _ciIndexer({ id: "ci_borne_" + i, comment_id: "c_x", post_id: "p_x", user_id: "u", kind: "like", payload: null, created_at: "2026-11-05T10:00:00+00:00" });
      }
      return { cols, taille: _ciIndex.size, max: CI_INDEX_MAX, premierGarde: _ciIndex.has("ci_borne_0"), dernierGarde: _ciIndex.has("ci_borne_" + (CI_INDEX_MAX + 24)) };
    });
    expect(r.cols[0].split(",")).toEqual(expect.arrayContaining(["id", "post_id", "comment_id", "user_id", "kind", "payload", "created_at"]));
    expect(r.taille).toBe(r.max);
    expect(r.premierGarde, "le plus ancien est évincé").toBe(false);
    expect(r.dernierGarde).toBe(true);
  });
});
