// ═══════════════════════════════════════════════════════════════════════════
// UN COMPTE BLOQUÉ NE COMPTE PAS SUR LA PASTILLE D'UN COMMENTAIRE
// (résidu de RV-39, fermé le 2026-11-06)
//
// LE DÉFAUT : depuis RV-39, la pastille d'une PUBLICATION écarte les comptes
// bloqués (`_postReactItems`). Celle d'un COMMENTAIRE ou d'une réponse, non :
// `_cmtReactions` (app-04) gardait toutes les `emoji_reaction` de
// `comment.replies`. Le temps réel ignorait déjà l'AJOUT d'un compte bloqué
// (`_applyCommentInteractionEvent`), mais la lecture de la discussion
// (`hydrateCommentInteractions` → `supaLoadCommentInteractions`, app-08) ramène
// ses réactions — la RLS laisse un compte bloqué lire et réagir sur une
// publication publique —, alors que ses commentaires, eux, sont masqués dans la
// discussion (`_renderCommentsList`).
//
// CE QUE CETTE SUITE EXIGE (la vraie lecture de la discussion, la vraie liaison
// temps réel de `_creerCanalDb`, les vrais `blockUser` / `unblockUser` ; seul le
// « serveur » est simulé, rien n'est écrit) :
//   ① la pastille d'un commentaire et la liste de ses réacteurs ne comptent ni
//     ne nomment un compte bloqué relu par la lecture ; un compte non bloqué
//     reste compté, y compris quand sa réaction arrive en direct (patch EN
//     PLACE) ; un déblocage le rend sans relecture (filtre à l'AFFICHAGE) ;
//   ② même règle pour la pastille d'une RÉPONSE et la liste de ses réacteurs ;
//   ③ le tri « Pertinents » ne compte pas ses réactions ;
//   ④ le panneau des commentaires d'une bobine, qui liste les réactions emoji et
//     les compte dans « N réponses », ne les liste ni ne les compte ;
//   ⑤ l'aperçu des commentaires d'une carte du fil, qui compte aussi les
//     réactions emoji dans « ▼ N réponses », ne les compte pas ; et la règle ne
//     touche ni une réponse texte ni un GIF, partout où ils sont comptés ;
//   ⑥ bloquer ou débloquer un compte qui n'est qu'un RÉACTEUR repeint le fil :
//     la pastille de la publication et l'aperçu des commentaires suivent.
// ⚠️ Ce que la suite n'exige PAS, délibérément : que la réponse texte ou le GIF
// d'un compte BLOQUÉ reste visible. C'est un défaut consigné hors lot (fiche),
// pas un comportement à protéger.
// Éprouvée par RÉINJECTION (2026-11-06) : `_cmtReactions` sans le filtre rougit
// ① ② ③ ; le panneau des bobines sans le filtre, ④ ; l'aperçu du fil sans le
// filtre, ⑤ ⑥ ; la signature du fil sans la liste de blocage, ⑥ ; le prédicat
// commun (`_reactionEmojiComptee`) sans `isBlocked`, ① à ⑥ — et le cas ⑥ de
// `reactions-mes-publications.spec.js`, qui lit le même prédicat ; la garde
// temps réel retirée, ① ; une relecture à chaque repeinte, ①.
// Fiche : `docs/journal/capacite-perf-realtime.md`, « 🚫 UN COMPTE BLOQUÉ NE
// COMPTE PAS NON PLUS SUR LA PASTILLE D'UN COMMENTAIRE ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "812aee2b-214f-4949-931e-842599b6d68b";
const ALICE = "3a1f6c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const ZOE = "9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a6f";
const BOB = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
const CARL = "7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918";
const MAL = "0f0e0d0c-0b0a-4909-8807-060504030201";    // bloqué
const MAL2 = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";   // bloqué lui aussi
const P = "post_cmt_bloque";
const C1 = "c_alice";   // le commentaire d'Alice, le plus récent
const C2 = "c_zoe";     // celui de Zoé, plus ancien
// La réponse d'Alice : `supaLoadCommentInteractions` lui donne l'identifiant
// `srep_<created_at>`, et c'est sous cet identifiant que l'on réagit à une réponse.
const T_REP = "2026-11-05T09:00:05.000000+00:00";
const REP = "srep_" + T_REP;
const GIF = "https://media.tenor.com/bloque/essai.gif";

async function preparer(page) {
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
    // Les deux comptes bloqués, comme `blockUser` les inscrit.
    state.user.blocked = [o.mal, o.mal2];
    MY_UID = o.moi; window.MY_UID = MY_UID;
    window._supaReal = true;
    window.requireAuthentication = () => true;
    window.supaInsertNotif = async () => null;
    window.supaTrack = async () => null;
    sessionStorage.removeItem("passio_fil_compteurs_absente");

    // ── Le « serveur » : des tables, des lectures journalisées ──
    window.__lectures = [];
    // Dans l'ordre de `created_at` : c'est l'ordre que demande la lecture.
    window.__interactions = [
      // Sur la PUBLICATION : un compte bloqué, puis Zoé.
      { id: "ci_mal_p", comment_id: o.P, post_id: o.P, user_id: o.mal, kind: "emoji", payload: "🤬", created_at: "2026-11-05T08:50:00.000000+00:00" },
      { id: "ci_zoe_p", comment_id: o.P, post_id: o.P, user_id: o.zoe, kind: "emoji", payload: "🎸", created_at: "2026-11-05T08:51:00.000000+00:00" },
      // Sur le commentaire d'Alice : deux comptes BLOQUÉS et Zoé réagissent ; Zoé
      // répond d'un GIF, Alice d'un texte.
      { id: "ci_mal_c1", comment_id: o.C1, post_id: o.P, user_id: o.mal, kind: "emoji", payload: "🤬", created_at: "2026-11-05T09:00:01.000000+00:00" },
      { id: "ci_mal2_c1", comment_id: o.C1, post_id: o.P, user_id: o.mal2, kind: "emoji", payload: "😡", created_at: "2026-11-05T09:00:02.000000+00:00" },
      { id: "ci_zoe_c1", comment_id: o.C1, post_id: o.P, user_id: o.zoe, kind: "emoji", payload: "🔥", created_at: "2026-11-05T09:00:03.000000+00:00" },
      { id: "ci_gif_z", comment_id: o.C1, post_id: o.P, user_id: o.zoe, kind: "gif", payload: o.gif, created_at: "2026-11-05T09:00:04.000000+00:00" },
      { id: "ci_rep_a", comment_id: o.C1, post_id: o.P, user_id: o.alice, kind: "reply", payload: "Merci à vous !", created_at: o.tRep },
      // Sur la RÉPONSE d'Alice : un compte bloqué, puis Zoé.
      { id: "ci_mal_rep", comment_id: o.REP, post_id: o.P, user_id: o.mal, kind: "emoji", payload: "🤬", created_at: "2026-11-05T09:00:06.000000+00:00" },
      { id: "ci_zoe_rep", comment_id: o.REP, post_id: o.P, user_id: o.zoe, kind: "emoji", payload: "👏", created_at: "2026-11-05T09:00:07.000000+00:00" },
      // Sur le commentaire de Zoé : quatre j'aime de comptes non bloqués.
      { id: "ci_like_a", comment_id: o.C2, post_id: o.P, user_id: o.alice, kind: "like", payload: null, created_at: "2026-11-05T09:00:08.000000+00:00" },
      { id: "ci_like_b", comment_id: o.C2, post_id: o.P, user_id: o.bob, kind: "like", payload: null, created_at: "2026-11-05T09:00:09.000000+00:00" },
      { id: "ci_like_c", comment_id: o.C2, post_id: o.P, user_id: o.carl, kind: "like", payload: null, created_at: "2026-11-05T09:00:10.000000+00:00" },
      { id: "ci_like_m", comment_id: o.C2, post_id: o.P, user_id: o.moi, kind: "like", payload: null, created_at: "2026-11-05T09:00:11.000000+00:00" },
    ];
    window.__posts = [{
      id: o.P, author_id: o.alice, passion_id: "photo", mood: "all", content: "Publication d'Alice", created_at: "2026-11-05T08:00:00", media_url: null,
      profiles: { username: "Alice", emoji: "📷", color: "#123456", avatar_url: null, is_private: false },
    }];
    // Du plus récent au plus ancien, comme `supaLoadComments` les demande.
    window.__commentaires = [
      { id: o.C1, post_id: o.P, author_id: o.alice, content: "Commentaire d'Alice", created_at: "2026-11-05T08:40:00" },
      { id: o.C2, post_id: o.P, author_id: o.zoe, content: "Commentaire de Zoé", created_at: "2026-11-05T08:30:00" },
    ];
    window.__profils = [
      { id: o.alice, username: "Alice", emoji: "📷", color: "#123456", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      { id: o.zoe, username: "Zoé", emoji: "🎸", color: "#654321", avatar_url: null, passion_id: "musique", passions: [], bio: "" },
      { id: o.bob, username: "Bob", emoji: "🎉", color: "#246810", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      { id: o.carl, username: "Carl", emoji: "🚲", color: "#135790", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      // Les comptes bloqués ont un profil lisible : s'ils étaient comptés, ils seraient NOMMÉS.
      { id: o.mal, username: "Malotru", emoji: "👺", color: "#990000", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      { id: o.mal2, username: "Malappris", emoji: "👹", color: "#660000", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
    ];
    // `fil_compteurs` rend les réactions de la publication SANS identifiant, et
    // les deux aperçus de commentaires : c'est le fait de production.
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
            return rendre({ data: rows.map((i) => Object.fromEntries(cols.map((c) => [c, i[c]]))), error: null });
          }
          return rendre({ data: [], error: null });
        },
      };
      return q;
    };
    // Les écritures du blocage : acceptées, jamais envoyées (cas ⑥).
    window.supaBlockUser = async () => true;
    window.supaUnblockUser = async () => true;
    window.supaUnfollowUser = async () => true;

    // ── Le SDK temps réel simulé, qui RETIENT chaque liaison ──
    Object.defineProperty(window.supa, "channel", { configurable: true, writable: true, value: function (topic) {
      const ch = { topic, liaisons: [], on(type, filtre, cb) { ch.liaisons.push({ type, filtre, cb }); return ch; },
        subscribe() { return ch; }, unsubscribe: async () => "ok" };
      return ch;
    } });
    window.__canalDb = _creerCanalDb(true);
    window.__liaison = (tbl, evenement) => {
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === tbl && x.filtre.event === evenement);
      if (!l) throw new Error("aucune liaison " + evenement + " sur " + tbl);
      return l.cb;
    };
    window.__lecturesCi = () => __lectures.filter((x) => x.table === "comment_interactions").length;
    // La pastille d'un nœud (commentaire OU réponse) dans la discussion ouverte.
    window.__pastille = (id) => {
      const h = document.querySelector('#commentsBox [data-cmtchip="' + CSS.escape(id) + '"]');
      return h ? h.textContent.trim() : null;
    };
    window.__ordre = () => Array.from(document.querySelectorAll("#commentsBox .comment[data-commentid]")).map((n) => n.getAttribute("data-commentid"));
    window.__fermerReacteurs = () => { const d = document.getElementById("cmt-react-detail"); if (d) d.remove(); };
    window.__repliesDe = (id) => findPostAnywhere(o.P).comments.find((x) => x.id === id).replies || [];
    // Ce qu'une carte de la publication montre : sa pastille et « ▼ N réponses »
    // sous le commentaire d'Alice. `racine` : le fil, ou la carte posée par le test.
    window.__carte = (racine) => {
      const r = document.querySelector(racine);
      if (!r) return null;
      const chip = r.querySelector('[data-postchip="' + CSS.escape(o.P) + '"]');
      const cmt = r.querySelector('.comment[data-commentid="' + CSS.escape(o.C1) + '"]');
      const compte = cmt && cmt.querySelector(".comment-reply-count");
      return { pastille: chip ? chip.textContent.trim() : null, reponses: compte ? compte.textContent.trim() : null };
    };
  }, { moi: MOI, alice: ALICE, zoe: ZOE, bob: BOB, carl: CARL, mal: MAL, mal2: MAL2, P, C1, C2, REP, tRep: T_REP, gif: GIF });
}

// La vraie ouverture d'une discussion : lecture du fil, puis de la page de
// commentaires et de leurs interactions (`hydrateCommentInteractions`).
async function ouvrirDiscussion(page) {
  await page.evaluate(async (p) => {
    state.supabasePosts = await supaLoadPosts();
    window._cmtThreadLoadedAt = {};
    await openComments(p);
  }, P);
  await expect(page.locator('#commentsBox .comment[data-commentid="' + C1 + '"]')).toHaveCount(1);
}

// La liste « Réactions · N » ouverte par un VRAI clic sur la pastille.
async function reacteurs(page, id) {
  await page.locator('#commentsBox [data-cmtchip="' + id + '"] .cmt-react-chip').click();
  const pop = page.locator("#cmt-react-detail");
  await expect(pop).toBeVisible();
  const texte = (await pop.textContent()) || "";
  await page.evaluate(() => __fermerReacteurs());
  return texte;
}

test.describe("Un compte bloqué ne compte pas sur la pastille d'un commentaire", () => {
  test("① pastille et liste des réacteurs d'un commentaire : le compte bloqué relu par la lecture n'y est pas, le compte non bloqué si — aussi en direct, et un déblocage le rend sans relecture", async ({ page }) => {
    await preparer(page);
    await ouvrirDiscussion(page);

    const lu = await page.evaluate((c) => __repliesDe(c).filter((r) => r.type === "emoji_reaction").map((r) => r.text), C1);
    expect(lu, "prémisse : la lecture ramène les réactions des comptes bloqués").toEqual(["🤬", "😡", "🔥"]);
    expect(await page.evaluate((c) => __pastille(c), C1), "seule la réaction de Zoé compte (le GIF est une réponse)").toBe("🔥 1");

    const liste = await reacteurs(page, C1);
    expect(liste).toContain("Réactions · 1");
    expect(liste).toContain("Zoé");
    expect(liste, "le compte bloqué n'est pas nommé").not.toContain("Malotru");
    expect(liste).not.toContain("Malappris");

    // En DIRECT : la réaction de Bob est patchée EN PLACE ; celle d'un compte
    // bloqué n'entre même pas dans le modèle (« un compte bloqué n'AJOUTE rien »).
    const direct = await page.evaluate(([c, p, bob, mal]) => {
      const inserer = __liaison("comment_interactions", "INSERT");
      inserer({ eventType: "INSERT", old: {}, new: { id: "ci_bob_c1", comment_id: c, post_id: p, user_id: bob, kind: "emoji", payload: "👍", created_at: "2026-11-05 09:00:12+00" } });
      const apresBob = __pastille(c);
      inserer({ eventType: "INSERT", old: {}, new: { id: "ci_mal_c1_bis", comment_id: c, post_id: p, user_id: mal, kind: "emoji", payload: "👎", created_at: "2026-11-05 09:00:13+00" } });
      const lignes = __repliesDe(c).map((r) => r.ci).filter(Boolean);
      return { apresBob, apresMal: __pastille(c), bobDansLeModele: lignes.includes("ci_bob_c1"), malDansLeModele: lignes.includes("ci_mal_c1_bis") };
    }, [C1, P, BOB, MAL]);
    expect(direct.apresBob, "Zoé et Bob comptent, les deux comptes bloqués relus non").toBe("🔥 2");
    expect(direct.bobDansLeModele).toBe(true);
    expect(direct.malDansLeModele, "la garde temps réel : l'ajout d'un compte bloqué n'entre pas dans le modèle").toBe(false);
    expect(direct.apresMal).toBe("🔥 2");

    // Le filtre est à l'AFFICHAGE : débloquer rend les réactions déjà lues, sans
    // relecture. Une lecture partirait APRÈS ce code synchrone (`then` est appelé
    // dans une micro-tâche) : on laisse passer un tour avant de compter.
    const deblocage = await page.evaluate(async ([mal, mal2]) => {
      const lecturesAvant = __lecturesCi();
      state.user.blocked = [];
      _refreshCommentThreadUINow("post_cmt_bloque");
      const debloque = __pastille("c_alice");
      state.user.blocked = [mal, mal2];
      _refreshCommentThreadUINow("post_cmt_bloque");
      const rebloque = __pastille("c_alice");
      await new Promise((ok) => setTimeout(ok, 100));
      return { debloque, rebloque, relectures: __lecturesCi() - lecturesAvant };
    }, [MAL, MAL2]);
    expect(deblocage.debloque, "débloqués, leurs deux réactions comptent de nouveau").toBe("🤬 4");
    expect(deblocage.rebloque).toBe("🔥 2");
    expect(deblocage.relectures, "aucune relecture de comment_interactions").toBe(0);
  });

  test("② pastille et liste des réacteurs d'une RÉPONSE : même règle", async ({ page }) => {
    await preparer(page);
    await ouvrirDiscussion(page);
    // Les réponses sont repliées : on les déplie comme on le ferait au doigt.
    await page.locator('#commentsBox .comment[data-commentid="' + C1 + '"] .comment-reply-count').click();
    await expect(page.locator('#commentsBox [data-replyid="' + REP + '"]')).toBeVisible();

    const r = await page.evaluate((id) => {
      const rep = __repliesDe("c_alice").find((x) => x.id === id);
      return { lu: (rep.replies || []).map((x) => x.text), pastille: __pastille(id) };
    }, REP);
    expect(r.lu, "prémisse : la seconde passe de lecture ramène la réaction du compte bloqué sur la réponse").toEqual(["🤬", "👏"]);
    expect(r.pastille).toBe("👏 1");

    const liste = await reacteurs(page, REP);
    expect(liste).toContain("Réactions · 1");
    expect(liste).toContain("Zoé");
    expect(liste).not.toContain("Malotru");
  });

  test("③ le tri « Pertinents » ne compte pas les réactions d'un compte bloqué", async ({ page }) => {
    await preparer(page);
    await ouvrirDiscussion(page);
    expect(await page.evaluate(() => __ordre()), "« Récents » : Alice d'abord").toEqual([C1, C2]);

    await page.locator("#commentsBox .cmt-sort", { hasText: "Pertinents" }).click();
    // Zoé : 4 j'aime. Alice : 1 réaction comptée + 2 réponses (texte, GIF) = 3 —
    // 5 si les comptes bloqués comptaient, et elle passerait devant.
    await expect.poll(() => page.evaluate(() => __ordre())).toEqual([C2, C1]);
    const pertinence = await page.evaluate(() => {
      const p = findPostAnywhere("post_cmt_bloque");
      return p.comments.map((c) => [c.id, _cmtRelevance(c)]);
    });
    expect(Object.fromEntries(pertinence)).toEqual({ [C1]: 3, [C2]: 4 });
  });

  test("④ le panneau des commentaires d'une bobine ne liste ni ne compte la réaction d'un compte bloqué ; réponse texte et GIF restent", async ({ page }) => {
    await preparer(page);
    await page.evaluate(async (p) => {
      state.supabasePosts = await supaLoadPosts();
      window._cmtThreadLoadedAt = {};
      // Le vrai chemin du panneau : aperçus d'abord, puis la page serveur et ses interactions.
      openReelComments(p);
    }, P);
    await expect.poll(() => page.evaluate(() => {
      const p = findPostAnywhere("post_cmt_bloque");
      const c = p && (p.comments || []).find((x) => x.id === "c_alice");
      return !!(c && (c.replies || []).some((r) => r.type === "emoji_reaction") && window._cmtThreadLoadedAt["post_cmt_bloque"]);
    }), { message: "la discussion de la bobine est lue, réactions comprises" }).toBe(true);

    const panneau = await page.evaluate(() => {
      const liste = document.getElementById("reelCommentsList");
      const items = Array.from(liste.querySelectorAll(".reel-comment-item"));
      const alice = items.find((n) => n.textContent.indexOf("Commentaire d'Alice") !== -1);
      const bloc = alice && alice.nextElementSibling && alice.nextElementSibling.classList.contains("reel-comment-replies")
        ? alice.nextElementSibling : null;
      const compte = alice && alice.querySelector(".reel-comment-reply-count");
      return { compte: compte ? compte.textContent.trim() : null, reponses: bloc ? bloc.textContent : "",
        gif: !!(bloc && bloc.querySelector('img[alt="GIF"]')), tout: liste.textContent };
    });
    expect(panneau.compte, "la réaction de Zoé, son GIF et la réponse d'Alice ; pas les deux comptes bloqués").toBe("3 réponses");
    expect(panneau.reponses).toContain("Zoé");
    expect(panneau.reponses).toContain("🔥");
    expect(panneau.reponses, "la réponse texte n'est pas touchée").toContain("Merci à vous !");
    expect(panneau.gif, "le GIF n'est pas touché").toBe(true);
    expect(panneau.tout).not.toContain("Malotru");
    expect(panneau.tout).not.toContain("Malappris");
    await page.evaluate(() => closeReelComments());
  });

  test("⑤ l'aperçu des commentaires d'une carte du fil ne compte pas la réaction d'un compte bloqué ; réponse texte et GIF restent comptés, comme dans la discussion", async ({ page }) => {
    await preparer(page);
    await ouvrirDiscussion(page);

    // La discussion : « Voir N réponses » compte la réponse d'Alice et le GIF de
    // Zoé, jamais une réaction ; le GIF y est rendu en image.
    const discussion = await page.evaluate(() => {
      const cmt = document.querySelector('#commentsBox .comment[data-commentid="c_alice"]');
      return { compte: cmt.querySelector(".comment-reply-count").textContent.trim(), gif: !!cmt.querySelector('img[alt="GIF"]') };
    });
    expect(discussion).toEqual({ compte: "⌵ Voir 2 réponses", gif: true });

    // La carte de la publication, telle que le fil la peint (`renderPostHTML`).
    const carte = await page.evaluate(() => {
      closeModal();
      document.querySelectorAll("[data-cmt-bloque-carte]").forEach((n) => n.remove());
      const div = document.createElement("div");
      div.setAttribute("data-cmt-bloque-carte", "1");
      div.innerHTML = renderPostHTML(findPostAnywhere("post_cmt_bloque"));
      document.body.appendChild(div);
      return __carte("[data-cmt-bloque-carte]");
    });
    // L'aperçu compte, depuis toujours, les réactions emoji AVEC les réponses :
    // celle de Zoé, sa réponse GIF et la réponse d'Alice. Jamais les deux comptes bloqués.
    expect(carte.reponses, "5 si les deux comptes bloqués comptaient").toBe("▼ 3 réponses");
    expect(carte.pastille, "la pastille de la publication écarte aussi le compte bloqué (RV-39)").toBe("🎸 1");
  });

  test("⑥ bloquer ou débloquer un compte qui n'est qu'un réacteur repeint le fil : pastille de la publication et aperçu des commentaires suivent", async ({ page }) => {
    await preparer(page);
    await ouvrirDiscussion(page);
    const avant = await page.evaluate((alice) => {
      closeModal();
      // La publication entre dans le fil par la source « Suivis ».
      state.user.following = [alice];
      state.feedFollowingOn = true;
      renderFeed();
      return __carte("#feedList");
    }, ALICE);
    expect(avant, "prémisse : la carte est dans le fil, les comptes bloqués écartés").toEqual({ pastille: "🎸 1", reponses: "▼ 3 réponses" });

    // Les vrais gestes de modération : ils écrivent l'état puis appellent `renderFeed()`.
    const debloques = await page.evaluate(async ([mal, mal2]) => {
      await unblockUser(mal, "Malotru");
      await unblockUser(mal2, "Malappris");
      return { carte: __carte("#feedList"), bloques: state.user.blocked.slice() };
    }, [MAL, MAL2]);
    expect(debloques.bloques).toEqual([]);
    expect(debloques.carte, "débloqués : leurs réactions déjà lues reviennent sur la carte, sans relecture").toEqual({ pastille: "🤬 2", reponses: "▼ 5 réponses" });

    const rebloque = await page.evaluate(async (mal) => {
      await blockUser(mal, "Malotru");
      return __carte("#feedList");
    }, MAL);
    expect(rebloque, "rebloqué : il quitte la pastille et l'aperçu tout de suite").toEqual({ pastille: "🎸 1", reponses: "▼ 4 réponses" });
  });
});
