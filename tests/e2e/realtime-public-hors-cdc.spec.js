// ═══════════════════════════════════════════════════════════════════════════
// 📴 LE CONTENU PUBLIC HORS DE LA RÉPLICATION CDC (2026-11-09)
//
// MESURÉ en production le 2026-11-09 (canal ①, `pg_stat_statements`) : la boucle
// `realtime.list_changes` — le relevé du WAL que le serveur Realtime refait toutes
// les 100 ms dès qu'UN client tient une liaison CDC — pesait 60,3 % du temps de
// calcul cumulé de la base (7,5 M d'appels), et chaque changement d'une table
// publiée coûtait en plus un tour de `realtime.apply_rls` PAR ABONNÉ.
//
// CE QUE CETTE SUITE EXIGE DU CLIENT (aucune requête ne part : `supa.channel`,
// `supa.from` et `supa.rpc` sont simulés) :
//   ① plus AUCUNE liaison CDC (la publication est vide depuis la migration) :
//     `realtime:db` n'est plus créé, ni ses cinq liaisons de TRANSITION d'entre
//     les deux PR — et jamais plus de profils, de publications, de « j'aime »
//     ni de lives ;
//   ② le sujet `user:<moi>` reçoit les accusés de lecture et, pour MES
//     publications, commentaires et interactions — sous des noms d'événement
//     distincts de « INSERT » ;
//   ③ une discussion À L'ÉCRAN rejoint son sujet privé `fil:<id>` ; un exemple, un
//     visiteur, un socket au repos n'en rejoignent aucun ;
//   ④ la livraison : un commentaire poussé sur le sujet s'affiche, une ligne d'un
//     AUTRE fil n'est pas appliquée ; ⑤ la même ligne par deux chemins ne compte
//     qu'une fois ; ⑥ un retrait porte la ligne ENTIÈRE et s'applique sans lecture ;
//   ⑦ un accusé de lecture met le ✓✓ à jour, jamais le mien ni une charge vide ;
//   ⑧ un refus de policy n'est pas une panne (aucune relecture) ; une panne fait
//     relire à 5 s, puis de moins en moins, jusqu'au retour du sujet ;
//   ⑨ le rattrapage après l'abonnement : seulement si la dernière lecture le précède ;
//   ⑩ la cadence de repli, PURE ; ⑪ un sujet survit 20 s à la fermeture — la
//     fraîcheur du cache d'ouverture —, puis part ;
//   ⑫ le socket qui s'endort emporte les sujets sans faire croire à une panne, et le
//     réveil les rejoint et relit les discussions réelles à l'écran ;
//   ⑬ le filet du fil est le seul chemin de quiconque regarde le fil ; ⑭ celui des
//     lives relit tout de suite au retour, sans jamais doubler sa chaîne ;
//   ⑮ à la SOURCE : aucun gestionnaire n'interroge `profiles`, la coalescence des
//     lives et le tri des profils sont partis avec leurs liaisons ;
//   ⑯ la soupape v1 lit ses messages sur `user:<moi>` (son canal global est parti
//     avec la publication), v2 non ; ⑰ à ㉓ : un cas par correction de la
//     relecture adversariale du lot.
// Fiche : `docs/journal/capacite-perf-realtime.md`, « 📴 ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
// ⚠️ Le nom de la liaison CDC n'est jamais écrit en toutes lettres ici : la gate
// `audit:realtime` lit le texte des suites et prendrait une assertion pour une
// souscription (son piège du fantôme).
const CDC = "postgres" + "_changes";

const MOI = "812aee2b-214f-4949-931e-842599b6d68b";
const ALICE = "3a1f6c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const ZOE = "9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a6f";
const P = "post_hors_cdc";
const P2 = "post_hors_cdc_2";

async function preparer(page, opts = {}) {
  await bootOnboarded(page);
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate((o) => {
    try { stopFeedRefreshLoop(); } catch (e) {}
    try { stopPostLikeRefresh(); } catch (e) {}
    MY_UID = o.visiteur ? "u_visiteur_42" : o.moi; window.MY_UID = MY_UID;
    window._supaReal = true;
    window._supaSubscribed = true;
    window._userTopicChan = null;
    window._rtRepos.endormi = false;
    window._cmtThreadLoadedAt = {};
    window.requireAuthentication = () => true;
    window.supaInsertNotif = async () => null;
    window.__recus = [];
    window.tel = Object.assign(window.tel || {}, { recv: (genre) => window.__recus.push(genre), action: () => {}, flowStart: () => null });
    // ── Le « serveur » : toute lecture est journalisée, aucune ne part ──
    window.__lectures = [];
    const vide = () => {
      const q = new Proxy(function () {}, {
        get: (t, k) => (k === "then" ? (ok, ko) => Promise.resolve({ data: [], error: null }).then(ok, ko) : () => q),
        apply: () => q,
      });
      return q;
    };
    supa.from = function (table) { window.__lectures.push(table); return vide(); };
    supa.rpc = function (fn) { window.__lectures.push("rpc:" + fn); return Promise.resolve({ data: [], error: null }); };
    // ── Le SDK temps réel simulé, qui RETIENT chaque canal ──
    window.__canaux = [];
    Object.defineProperty(window.supa, "channel", { configurable: true, writable: true, value: function (topic, cfg) {
      const ch = { topic, cfg, liaisons: [], rendu: false, statut: null,
        on(type, filtre, cb) { ch.liaisons.push({ type, filtre, cb }); return ch; },
        subscribe(cb) { ch.statut = cb || null; return ch; }, unsubscribe: async () => "ok", send: async () => "ok" };
      window.__canaux.push(ch);
      return ch;
    } });
    Object.defineProperty(window.supa, "removeChannel", { configurable: true, writable: true, value: async (ch) => { if (ch) ch.rendu = true; return "ok"; } });
    Object.defineProperty(window.supa, "removeAllChannels", { configurable: true, writable: true, value: async () => { window.__canaux.forEach((c) => { c.rendu = true; }); return []; } });
    Object.defineProperty(window.supa, "realtime", { configurable: true, writable: true, value: { disconnect: () => {}, connect: () => {} } });
    window.__canal = (prefixe) => window.__canaux.filter((c) => c.topic.indexOf(prefixe) === 0);
    window.__diffuser = (ch, evenement, record) => {
      const l = ch.liaisons.find((x) => x.type === "broadcast" && x.filtre.event === evenement);
      if (!l) throw new Error("aucune liaison " + evenement + " sur " + ch.topic);
      const [table, operation] = evenement.split(":");
      return l.cb({ type: "broadcast", event: evenement, payload: { table, operation, record } });
    };
    // ── Deux publications RÉELLES d'Alice ──
    const pub = (id) => ({ id, authorId: o.alice, authorName: "Alice", authorEmoji: "📷", authorColor: "#123456", passion: "photo", mood: "all",
      type: "text", text: "Publication réelle", createdAt: Date.now() - 3600000, likes: 0, liked: false, comments: [], fromSupabase: true });
    state.supabasePosts = [pub(o.P), pub(o.P2)];
    cacheRemoteProfile({ id: o.alice, username: "Alice", emoji: "📷", color: "#123456", avatar_url: null });
    cacheRemoteProfile({ id: o.zoe, username: "Zoé", emoji: "🎸", color: "#654321", avatar_url: null });
  }, { moi: MOI, alice: ALICE, zoe: ZOE, P, P2, visiteur: !!opts.visiteur });
}

const commentaire = (id, postId, texte, auteur = ALICE) => ({ id, post_id: postId, author_id: auteur, content: texte, created_at: "2026-11-09T10:00:00+00:00" });

// Fige l'horloge 50 ms devant la page. `clock.install()` laisse le temps couler :
// sous charge (deux ouvriers, une suite entière), plus de 50 ms peuvent passer
// entre la lecture de `Date.now()` et `pauseAt`, qui refuse alors une date
// passée (« Cannot fast-forward to the past » — vu sur `capacite-likes-visibles`
// le 2026-11-09). On relit l'heure et on réessaie, sans élargir la marge : une
// marge plus large ferait partir les minuteries dues dans l'intervalle.
async function figer(page) {
  for (let essai = 0; ; essai++) {
    const cible = await page.evaluate(() => Date.now() + 50);
    try { await page.clock.pauseAt(new Date(cible)); return; } catch (e) {
      if (essai >= 4 || !/past/i.test(String(e && e.message))) throw e;
    }
  }
}

test("① plus aucune liaison CDC : `realtime:db` n'est plus créé (la publication est vide)", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate((cdc) => {
    window._supaSubscribed = false; window._userTopicChan = null;
    window.appelsDisponibles = () => false; window._pushAbonnementTente = true;
    window._rtRepos.arme = true;
    supaSubscribe();
    return { db: __canal("realtime:db").length, user: __canal("user:").length,
      cdc: __canal("").flatMap((c) => c.liaisons).filter((l) => l.type === cdc).length,
      fabrique: typeof window._creerCanalDb };
  }, CDC);
  expect(r, "user:<moi> seul ; ni realtime:db, ni liaison CDC, ni sa fabrique").toEqual({ db: 0, user: 1, cdc: 0, fabrique: "undefined" });
});

test("② `user:<moi>` reçoit accusés de lecture, commentaires et interactions de MES publications — sous des noms distincts", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(() => {
    _subscribeUserTopic();
    const ch = __canal("user:")[0];
    return { topic: ch.topic, prive: ch.cfg.config.private, evenements: ch.liaisons.map((l) => l.filtre.event) };
  });
  expect(r.topic).toBe("user:" + MOI);
  expect(r.prive).toBe(true);
  expect(r.evenements).toEqual(["INSERT", "conv_members:INSERT", "notifications:INSERT", "conv_reads:UPSERT",
    "post_comments:INSERT", "comment_interactions:INSERT", "comment_interactions:DELETE"]);
});

test("③ une discussion À L'ÉCRAN rejoint `fil:<id>` ; un exemple, un socket au repos n'en rejoignent aucun", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate((p) => {
    openComments(p);
    const fils = __canal("fil:").map((c) => ({ topic: c.topic, prive: c.cfg.config.private, evenements: c.liaisons.map((l) => l.filtre.event) }));
    closeModal();
    const exemple = state.seed.posts[0].id;
    openComments(exemple);
    const pourExemple = __canal("fil:" + exemple).length;
    closeModal();
    window._rtRepos.endormi = true;
    openComments(p + "_2");
    const auRepos = __canal("fil:" + p + "_2").length;
    return { fils, pourExemple, auRepos };
  }, P);
  expect(r.fils).toEqual([{ topic: "fil:" + P, prive: true,
    evenements: ["post_comments:INSERT", "comment_interactions:INSERT", "comment_interactions:DELETE", "event_comments:INSERT"] }]);
  expect(r.pourExemple, "un exemple n'a aucune ligne en base : rien à écouter").toBe(0);
  expect(r.auRepos, "socket au repos : le réveil rejoindra").toBe(0);
});

test("③ bis un visiteur n'ouvre aucun sujet de discussion", async ({ page }) => {
  await preparer(page, { visiteur: true });
  const n = await page.evaluate((p) => { openComments(p); return __canal("fil:").length; }, P);
  expect(n).toBe(0);
});

test("④ un commentaire poussé sur le sujet s'affiche ; une ligne d'un AUTRE fil n'est pas appliquée", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async ([p, p2, c1, c2]) => {
    openComments(p);
    await new Promise((res) => setTimeout(res, 50));            // la lecture d'ouverture (simulée) se termine
    const ch = __canal("fil:" + p)[0];
    await __diffuser(ch, "post_comments:INSERT", c1);
    await __diffuser(ch, "post_comments:INSERT", c2);           // ligne d'un autre fil, sur CE sujet
    return {
      boite: document.getElementById("commentsBox").textContent,
      titre: document.querySelector(".modal-title").textContent,
      autre: (findPostAnywhere(p2).comments || []).length,
    };
  }, [P, P2, commentaire("c_hc_1", P, "Bonjour depuis le sujet"), commentaire("c_hc_x", P2, "Pas pour ce fil")]);
  expect(r.boite).toContain("Bonjour depuis le sujet");
  expect(r.titre).toContain("(1)");
  expect(r.boite).not.toContain("Pas pour ce fil");
  expect(r.autre, "la charge est liée au sujet").toBe(0);
});

test("⑤ la même ligne par `fil:` ET par `user:` ne compte qu'une fois", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async ([p, c]) => {
    _subscribeUserTopic();
    openComments(p);
    await new Promise((res) => setTimeout(res, 50));
    await __diffuser(__canal("fil:" + p)[0], "post_comments:INSERT", c);
    await __diffuser(__canal("user:")[0], "post_comments:INSERT", c);
    const post = findPostAnywhere(p);
    return { n: post.comments.filter((x) => x.id === c.id).length, recus: __recus.filter((g) => g === "comment").length };
  }, [P, commentaire("c_hc_double", P, "Une seule fois")]);
  expect(r).toEqual({ n: 1, recus: 1 });
});

test("⑥ un retrait porte la ligne ENTIÈRE : il s'applique sans aucune lecture, même hors de l'index", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async ([p, alice, zoe]) => {
    const post = findPostAnywhere(p);
    window._cmtThreadLoadedAt[p] = Date.now();                   // discussion fraîche : pas de lecture d'ouverture
    post.comments = [{ id: "c_cible", authorId: alice, authorName: "Alice", text: "Commentaire", content: "Commentaire", createdAt: Date.now() - 60000,
      fromSupabase: true, likes: 1, likedBy: [zoe],
      replies: [{ id: "semoji_x", ci: null, authorId: zoe, text: "🔥", type: "emoji_reaction", createdAt: supaTs("2026-11-09T09:59:00+00:00") }] }];
    openComments(p);
    await new Promise((res) => setTimeout(res, 50));
    const avant = __lectures.length;
    const ch = __canal("fil:" + p)[0];
    __diffuser(ch, "comment_interactions:DELETE", { id: "ci_inconnu_like", comment_id: "c_cible", post_id: p, user_id: zoe, kind: "like", payload: null, created_at: "2026-11-09T09:58:00+00:00" });
    __diffuser(ch, "comment_interactions:DELETE", { id: "ci_inconnu_emoji", comment_id: "c_cible", post_id: p, user_id: zoe, kind: "emoji", payload: "🔥", created_at: "2026-11-09T09:59:00+00:00" });
    await new Promise((res) => setTimeout(res, 700));          // au-delà du rendez-vous de 400 ms de la lecture des identifiants
    const c = findPostAnywhere(p).comments.find((x) => x.id === "c_cible");
    // ⚠️ L'application a sa propre activité de fond (événements, notifications,
    // stories…) : on ne compte que les lectures de DISCUSSION (piège ④ de R37).
    const discussion = (t) => t === "comment_interactions" || t === "post_comments" || t === "rpc:fil_compteurs";
    return { likes: c.likes, likedBy: c.likedBy, emojis: (c.replies || []).length, lectures: __lectures.slice(avant).filter(discussion) };
  }, [P, ALICE, ZOE]);
  expect(r.likes).toBe(0);
  expect(r.likedBy).toEqual([]);
  expect(r.emojis).toBe(0);
  expect(r.lectures, "la ligne entière suffit : aucune lecture des identifiants").toEqual([]);
});

test("⑦ un accusé de lecture met le ✓✓ à jour ; jamais le mien, jamais une charge sans conversation", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(([alice, moi]) => {
    conversationsState = deduplicateConversations([{ id: "conv_hc", isGroup: false, userId: alice, userName: "Alice", messages: [], lastAt: Date.now(), unread: 0 }].concat(getConversations()));
    _subscribeUserTopic();
    const ch = __canal("user:")[0];
    const c = () => getConversations().find((x) => x.id === "conv_hc");
    __diffuser(ch, "conv_reads:UPSERT", { conv_id: "conv_hc", user_id: moi, last_read_at: "2026-11-09T10:00:00+00:00" });
    const apresMoi = c()._otherReadAt || 0;
    __diffuser(ch, "conv_reads:UPSERT", { user_id: alice, last_read_at: "2026-11-09T10:00:00+00:00" });
    const apresVide = c()._otherReadAt || 0;
    __diffuser(ch, "conv_reads:UPSERT", { conv_id: "conv_hc", user_id: alice, last_read_at: "2026-11-09T10:00:00+00:00" });
    return { apresMoi, apresVide, lu: c()._otherReadAt, vrai: !!c()._otherRead, attendu: supaTs("2026-11-09T10:00:00+00:00") };
  }, [ALICE, MOI]);
  expect(r.apresMoi, "mon propre accusé n'est pas celui de l'autre").toBe(0);
  expect(r.apresVide, "sans conversation, ce n'est pas un accusé (RV-31)").toBe(0);
  expect(r.lu).toBe(r.attendu);
  expect(r.vrai).toBe(true);
});

test("⑧ un refus de policy n'est pas une panne ; une panne relit à 5 s puis de moins en moins, jusqu'au retour du sujet", async ({ page }) => {
  await preparer(page);
  await figer(page);
  const passer = async (ms) => { await page.clock.fastForward(ms); await page.evaluate(() => Promise.resolve()); };
  await page.evaluate(([p, p2]) => {
    window.__relues = [];
    window._relireDiscussionPublication = async (id, opts) => { window.__relues.push(id + (opts && opts.epingle === false ? "" : "+epingle")); return true; };
    openComments(p);
    const ch = __canal("fil:" + p)[0];
    ch.statut("CHANNEL_ERROR", new Error("Unauthorized: You do not have permissions to read from this Channel topic: fil:" + p));
    window.__refuse = { rendu: ch.rendu, etat: window._filsRt.get(p).etat };
    closeModal();
    openComments(p2);
    __canal("fil:" + p2)[0].statut("TIMED_OUT");
  }, [P, P2]);
  expect(await page.evaluate(() => window.__refuse)).toEqual({ rendu: true, etat: "refuse" });
  await passer(4900);
  expect(await page.evaluate(() => window.__relues.slice()), "rien avant 5 s").toEqual([]);
  await passer(200);
  expect(await page.evaluate(() => window.__relues.slice())).toEqual([P2]);
  await passer(7300);
  expect(await page.evaluate(() => window.__relues.length), "le pas recule à 7,5 s quand rien ne change").toBe(1);
  await passer(200);
  expect(await page.evaluate(() => window.__relues.slice())).toEqual([P2, P2]);
  // Le sujet revient : la relecture s'arrête ; le rattrapage relit une fois (la dernière lecture le précède).
  await page.evaluate((p2) => { window._cmtThreadLoadedAt[p2] = Date.now() - 1000; __canal("fil:" + p2)[0].statut("SUBSCRIBED"); }, P2);
  await passer(1600);
  expect(await page.evaluate(() => window.__relues.slice())).toEqual([P2, P2, P2]);
  await passer(60000);
  expect(await page.evaluate(() => window.__relues.length), "plus aucune relecture une fois le sujet suivi").toBe(3);
  expect(await page.evaluate((p) => window.__relues.filter((x) => x.indexOf(p + "_2") < 0 && x.indexOf(p) === 0).length, P), "le fil refusé n'a jamais été relu").toBe(0);
});

test("⑨ le rattrapage après l'abonnement : seulement si la dernière lecture le précède", async ({ page }) => {
  await preparer(page);
  await figer(page);
  await page.evaluate((p) => {
    window.__relues = [];
    window._relireDiscussionPublication = async (id) => { window.__relues.push(id); return true; };
    openComments(p);
    __canal("fil:" + p)[0].statut("SUBSCRIBED");
    // La lecture d'ouverture finit APRÈS l'abonnement : elle voit déjà ce qu'il couvre.
    window._cmtThreadLoadedAt[p] = Date.now() + 1;
  }, P);
  await page.clock.fastForward(2000);
  expect(await page.evaluate(() => window.__relues.length), "aucun rattrapage : la lecture a fini après l'abonnement").toBe(0);
});

test("⑩ la cadence de repli est PURE : 5 s vif, ×1,5 au calme, plafond 30 s ; une valeur absurde ne donne jamais NaN", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(() => {
    const suite = []; let pas = 0;
    for (let i = 0; i < 7; i++) { pas = discussionRelectureProchainPas(pas, i === 0); suite.push(pas); }
    return { suite, vif: discussionRelectureProchainPas(30000, true), absurdes: [NaN, -1, "x"].map((v) => discussionRelectureProchainPas(v, false)) };
  });
  expect(r.suite).toEqual([5000, 7500, 11250, 16875, 25313, 30000, 30000]);
  expect(r.vif).toBe(5000);
  expect(r.absurdes).toEqual([7500, 7500, 7500]);
});

test("⑪ un sujet survit 20 s à la fermeture — la fraîcheur du cache d'ouverture —, puis part ; rouvrir le reprend", async ({ page }) => {
  await preparer(page);
  await figer(page);
  const etat = () => page.evaluate((p) => ({ canaux: __canal("fil:" + p).length, rendus: __canal("fil:" + p).filter((c) => c.rendu).length, tenu: window._filsRt.has(p) }), P);
  // ⚠️ `runFor`, PAS `fastForward` : ce dernier ne déclenche chaque minuterie
  // qu'UNE fois sur l'intervalle, et la veille passe toutes les 3 s.
  await page.evaluate((p) => { openComments(p); closeModal(); }, P);
  await page.clock.runFor(15000);
  expect(await etat(), "dans la grâce : toujours tenu").toEqual({ canaux: 1, rendus: 0, tenu: true });
  await page.evaluate((p) => openComments(p), P);
  expect(await etat(), "rouvrir dans la grâce reprend le même sujet").toEqual({ canaux: 1, rendus: 0, tenu: true });
  await page.evaluate(() => closeModal());
  await page.clock.runFor(30000);
  expect(await etat(), "après la grâce : rendu").toEqual({ canaux: 1, rendus: 1, tenu: false });
});

test("⑫ le socket qui s'endort emporte les sujets sans faire croire à une panne ; le réveil les rejoint et relit le réel à l'écran", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async (p) => {
    window.__relues = [];
    window._relireDiscussionPublication = async (id, opts) => { window.__relues.push(id + (opts && opts.epingle === false ? "" : "+epingle")); return true; };
    window._rafraichirConversationsServeur = async () => {};
    window._rattraperConversationOuverte = async () => {};
    window.supaLoadNotifications = async () => [];
    window.supaRefreshVideoLives = async () => false;
    window.feedFiletReveiller = () => {};
    openComments(p);
    const ancien = __canal("fil:" + p)[0];
    const pannesAvant = window._filRtStats.pannes;
    _rtEndormir("masque");
    ancien.statut("CLOSED");                                       // la fermeture qui suit removeAllChannels
    const apresSommeil = { tenus: window._filsRt.size, pannes: window._filRtStats.pannes - pannesAvant };
    _rtReveiller("geste");
    await new Promise((res) => setTimeout(res, 50));
    return { apresSommeil, rejoints: __canal("fil:" + p).length, relues: window.__relues.slice() };
  }, P);
  expect(r.apresSommeil).toEqual({ tenus: 0, pannes: 0 });
  expect(r.rejoints, "le réveil rejoint le sujet de la discussion à l'écran").toBe(2);
  expect(r.relues, "et la relit, épingle comprise").toEqual([P + "+epingle"]);
});

test("⑫ bis le réveil ne relit JAMAIS la discussion d'un exemple", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    window.__relues = [];
    window._relireDiscussionPublication = async (id) => { window.__relues.push(id); return true; };
    window._rafraichirConversationsServeur = async () => {};
    window._rattraperConversationOuverte = async () => {};
    window.supaLoadNotifications = async () => [];
    const exemple = state.seed.posts[0];
    openComments(exemple.id);
    // On mesure le RÉVEIL seul : la lecture d'ouverture d'abord (elle a son
    // propre comportement sur un exemple, hors de ce lot).
    await new Promise((res) => setTimeout(res, 50));
    const avant = (exemple.comments || []).length;
    _rtEndormir("masque");
    _rtReveiller("geste");
    await new Promise((res) => setTimeout(res, 50));
    return { relues: window.__relues.slice(), garde: (exemple.comments || []).length === avant };
  });
  expect(r).toEqual({ relues: [], garde: true });
});

test("⑬ le filet du fil est le seul chemin de QUICONQUE regarde le fil — compte compris —, et de personne ailleurs", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(() => {
    goTo("feed");
    const surLeFil = filetEstLeSeulChemin();
    goTo("messages");
    const ailleurs = filetEstLeSeulChemin();
    return { surLeFil, ailleurs };
  });
  expect(r).toEqual({ surLeFil: true, ailleurs: false });
});

test("⑭ le filet des lives relit tout de suite au retour, et un tour EN VOL ne double jamais sa chaîne", async ({ page }) => {
  await preparer(page);
  await figer(page);
  await page.evaluate(() => {
    window.__vlive = 0; window.__vliveEnVol = null;
    window.supaRefreshVideoLives = () => { window.__vlive++; return new Promise((res) => { window.__vliveEnVol = res; }); };
    vliveFiletReveiller(true);
  });
  await page.clock.fastForward(10);
  expect(await page.evaluate(() => window.__vlive), "le réveil immédiat relit").toBe(1);
  await page.evaluate(() => { vliveFiletReveiller(true); vliveFiletReveiller(true); });
  await page.clock.fastForward(10);
  expect(await page.evaluate(() => window.__vlive), "un tour en vol : aucun second tour").toBe(1);
  await page.evaluate(() => { window.__vliveEnVol(false); });
  await page.evaluate(() => Promise.resolve());
  await page.clock.fastForward(61000);
  expect(await page.evaluate(() => window.__vlive), "une seule chaîne : un tour par pas").toBe(2);
});

test("⑮ à la SOURCE : aucun gestionnaire n'interroge `profiles` ; la coalescence des lives et le tri des profils sont partis", () => {
  const app08 = lire("js/app-08-ui-modals-tour.js");
  const corps = (entete) => { const i = app08.indexOf(entete); expect(i, entete).toBeGreaterThan(0); return app08.slice(i, app08.indexOf("\n}\n", i)); };
  for (const f of ["function _creerCanalFil(", "function _subscribeUserTopic(", "async function _rtCommentaireRecu(", "function _rtInteractionAjoutee(", "function _rtLectureRecue("]) {
    expect(corps(f), f + " n'interroge pas `profiles` : la ligne est poussée, la lecture coûterait N requêtes").not.toMatch(/from\(["']profiles["']\)/);
  }
  expect(corps("async function _rtCommentaireRecu("), "le profil de l'auteur passe par l'autorité unique").toContain("_profilAuteur(");
  expect(app08, "le tri des profils connus est parti avec la liaison").not.toContain("function profilConnuLocalement(");
  const app05 = lire("js/app-05-config-profil.js");
  expect(app05, "la coalescence des événements de lives est partie avec la liaison").not.toContain("function vliveRefreshCoalesce(");
  expect(app05).not.toContain("function vliveEvenementSansEffet(");
});

// ── La contre-revue du lot (audit-passio, 2026-11-09) : un cas par correction ──

test("⑯ la soupape v1 lit ses messages sur user:<moi> (son canal global est parti) ; v2 non, il les lit sur conv:<id>", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(() => {
    const essai = (v3, v2) => {
      window._supaSubscribed = false; window._userTopicChan = null; window._privateConvChans = {};
      window.appelsDisponibles = () => false; window._pushAbonnementTente = true;
      window._rtRepos.arme = true;
      window.PASSIO_REALTIME_V3 = v3; window.PASSIO_REALTIME_V2 = v2;
      const avant = __canal("user:").length;
      supaSubscribe();
      const user = __canal("user:").slice(avant)[0];
      return !!(user && user.liaisons.some((l) => l.type === "broadcast" && l.filtre.event === "INSERT"));
    };
    const out = { v1: essai(false, false), v2: essai(false, true), v3: essai(true, false) };
    window.PASSIO_REALTIME_V3 = true; window.PASSIO_REALTIME_V2 = false;
    return out;
  });
  expect(r, "les messages sur user:<moi> : v1 et v3 oui, v2 non (il les doublerait)").toEqual({ v1: true, v2: false, v3: true });
});

test("⑰ une lecture d'activité en ÉCHEC garde la discussion, et la relecture le sait (cadence vive)", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const ev = { id: "ev_hors_cdc", title: "Sortie", passion: "photo", date: Date.now() + 86400000, organizerId: "auteur_ev", authorId: "auteur_ev", attendees: [] };
    state.userEvents = [ev].concat(state.userEvents || []);
    openEventDetails(ev.id);
    await new Promise((res) => setTimeout(res, 100));             // la lecture d'ouverture d'abord
    window._eventCommentsCache = window._eventCommentsCache || {};
    window._eventCommentsCache[ev.id] = [{ id: "ec_connu", authorId: "auteur_ev", author: "Org", authorName: "Org", text: "Déjà là", at: Date.now() - 60000, createdAt: Date.now() - 60000, replies: [], likes: 0, likedBy: [] }];
    window._eventCommentsLuA = {};
    window.supaLoadEventComments = async () => null;           // la coupure
    const verdict = await _loadEventComments(ev.id, { epingle: false });
    const garde = (window._eventCommentsCache[ev.id] || []).map((c) => c.id);
    let rejet = null;
    try { await _filRelire(ev.id); } catch (e) { rejet = e.message; }
    return { verdict, garde, rejet, date: (window._eventCommentsLuA || {})[ev.id] || 0 };
  });
  expect(r.verdict, "l'appelant sait que la lecture a échoué").toBe(false);
  expect(r.garde, "rien n'est effacé").toEqual(["ec_connu"]);
  expect(r.rejet, "la relecture de repli voit une panne, pas un calme").toMatch(/illisibles/);
  expect(r.date, "une lecture en échec n'est pas datée").toBe(0);
});

test("⑱ le panneau de commentaires des Bobines est une discussion à l'écran ; une activité créée dans la session aussi, pas un exemple", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate((p) => {
    window.currentReelCommentPostId = p;
    let panneau = document.getElementById("reelCommentsPanel");
    if (!panneau) { panneau = document.createElement("div"); panneau.id = "reelCommentsPanel"; document.body.appendChild(panneau); }
    panneau.classList.add("open");
    _filsRtReconcilier();
    const bobine = __canal("fil:" + p).length;
    panneau.classList.remove("open"); window.currentReelCommentPostId = null;
    state.userEvents = [{ id: "ev_session", title: "Neuve", attendees: [] }, { id: "e3", title: "Exemple", attendees: [] }].concat(state.userEvents || []);
    return { bobine, sessionReelle: _filEstReel("ev_session"), exemple: _filEstReel("e3") };
  }, P);
  expect(r.bobine, "le panneau des Bobines rejoint son sujet").toBe(1);
  expect(r.sessionReelle, "une activité créée dans la session (sans fromSupabase) a un sujet").toBe(true);
  expect(r.exemple, "une activité d'exemple (e<n>) n'en a pas").toBe(false);
});

test("⑲ le socket qui s'endort se coupe AVANT de rendre ses canaux (sinon chaque départ attend 10 s puis coupe le socket rouvert)", async ({ page }) => {
  await preparer(page);
  const ordre = await page.evaluate(() => {
    const vu = [];
    Object.defineProperty(window.supa, "realtime", { configurable: true, writable: true, value: { disconnect: () => vu.push("disconnect"), connect: () => {} } });
    Object.defineProperty(window.supa, "removeAllChannels", { configurable: true, writable: true, value: async () => { vu.push("removeAllChannels"); return []; } });
    _rtEndormir("masque");
    return vu;
  });
  expect(ordre).toEqual(["disconnect", "removeAllChannels"]);
});

test("⑳ un canal du même sujet encore en partance : on attend son départ ; une adhésion sans réponse 15 s devient une panne relue", async ({ page }) => {
  await preparer(page);
  await figer(page);
  await page.evaluate((p) => {
    window.__relues = [];
    window._relireDiscussionPublication = async (id) => { window.__relues.push(id); return true; };
    // Le SDK rend l'instance existante d'un sujet tant qu'elle est dans getChannels().
    window.__partant = { topic: "realtime:fil:" + p };
    Object.defineProperty(window.supa, "getChannels", { configurable: true, writable: true, value: () => (window.__partant ? [window.__partant] : []) });
    openComments(p);
  }, P);
  expect(await page.evaluate((p) => ({ etat: window._filsRt.get(p).etat, canaux: __canal("fil:" + p).length }), P),
    "pas d'adhésion sur une instance mourante").toEqual({ etat: "attente", canaux: 0 });
  await page.evaluate(() => { window.__partant = null; });
  await page.clock.runFor(3100);
  expect(await page.evaluate((p) => ({ etat: window._filsRt.get(p).etat, canaux: __canal("fil:" + p).length }), P),
    "parti, la veille rejoint").toEqual({ etat: "rejoint", canaux: 1 });
  await page.clock.runFor(19000);                                     // la veille passe toutes les 3 s : au-delà de 15 s
  expect(await page.evaluate((p) => window._filsRt.get(p).etat, P), "sans réponse 15 s : une panne").toBe("panne");
  await page.clock.runFor(6000);
  expect(await page.evaluate(() => window.__relues.length), "et la discussion se relit").toBeGreaterThanOrEqual(1);
});

test("㉑ la relecture garde un commentaire arrivé PENDANT sa lecture, et ses interactions si l'hydratation échoue", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async ([p, alice, zoe]) => {
    const post = findPostAnywhere(p);
    const t0 = Date.now() - 120000;
    post.comments = [{ id: "c_page", authorId: alice, authorName: "Alice", text: "Dans la page", content: "Dans la page", createdAt: t0, fromSupabase: true, likes: 2, likedBy: [zoe, alice], replies: [] }];
    let liberer;
    window.supaLoadComments = () => new Promise((res) => { liberer = () => { const page = [{ id: "c_page", authorId: alice, authorName: "Alice", content: "Dans la page", text: "Dans la page", createdAt: t0, fromSupabase: true }]; page.suite = null; res(page); }; });
    window.supaLoadCommentInteractions = async () => null;       // l'hydratation échoue
    const lecture = _relireDiscussionPublication(p, { epingle: false });
    // Pendant la lecture, un commentaire arrive par le sujet.
    post.comments.unshift({ id: "c_direct", authorId: zoe, authorName: "Zoé", text: "Arrivé en direct", content: "Arrivé en direct", createdAt: Date.now(), fromSupabase: true });
    await new Promise((res) => setTimeout(res, 10));
    liberer();
    await lecture;
    const apres = findPostAnywhere(p).comments;
    const lu = apres.find((c) => c.id === "c_page");
    return { ids: apres.map((c) => c.id), likes: lu.likes, likedBy: lu.likedBy };
  }, [P, ALICE, ZOE]);
  expect(r.ids, "le commentaire arrivé pendant la lecture reste").toEqual(["c_direct", "c_page"]);
  expect(r.likes, "les interactions connues ne tombent pas à 0 sur une hydratation en échec").toBe(2);
  expect(r.likedBy.length).toBe(2);
});

test("㉒ une seule chaîne de relecture par armement : arrêtée puis réarmée pendant une lecture en vol, l'ancienne ne se réarme pas", async ({ page }) => {
  await preparer(page);
  await figer(page);
  await page.evaluate((p) => {
    window.__relues = 0; window.__liberer = [];
    window._relireDiscussionPublication = () => { window.__relues++; return new Promise((res) => window.__liberer.push(res)); };
    openComments(p);
    __canal("fil:" + p)[0].statut("TIMED_OUT");
  }, P);
  await page.clock.fastForward(5100);                                 // premier tour : lecture EN VOL
  expect(await page.evaluate(() => window.__relues)).toBe(1);
  await page.evaluate((p) => {
    const e = window._filsRt.get(p);
    _filRelectureArreter(e);                                          // arrêt…
    _filRelectureArmer(p);                                            // …et réarmement pendant le vol
    window.__liberer.splice(0).forEach((f) => f(true));               // la vieille lecture répond
  }, P);
  await page.evaluate(() => Promise.resolve());
  await page.clock.fastForward(5100);
  expect(await page.evaluate(() => window.__relues), "la nouvelle chaîne seule a relu").toBe(2);
  await page.evaluate(() => window.__liberer.splice(0).forEach((f) => f(true)));
  await page.evaluate(() => Promise.resolve());
  await page.clock.fastForward(7600);
  expect(await page.evaluate(() => window.__relues), "un tour par pas, pas deux").toBe(3);
});

test("㉓ au retour au premier plan, les lives ne sont relus QUE si le fil est à l'écran", async ({ page }) => {
  await preparer(page);
  await figer(page);
  await page.evaluate(() => {
    window.__vlive = 0;
    window.supaRefreshVideoLives = () => { window.__vlive++; return Promise.resolve(false); };
    goTo("messages");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(10);
  const ailleurs = await page.evaluate(() => window.__vlive);
  await page.evaluate(() => { goTo("feed"); });
  await page.clock.fastForward(10);
  const auRetourAuFil = await page.evaluate(() => window.__vlive);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.clock.fastForward(10);
  expect({ ailleurs, auRetourAuFil, surLeFil: await page.evaluate(() => window.__vlive) })
    .toEqual({ ailleurs: 0, auRetourAuFil: 1, surLeFil: 2 });
});
