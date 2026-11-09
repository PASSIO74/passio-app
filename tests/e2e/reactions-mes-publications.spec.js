// ═══════════════════════════════════════════════════════════════════════════
// RV-39 — LES RÉACTIONS D'AUTRUI SUR MES PUBLICATIONS SUIVENT LE SERVEUR
// (registre de l'audit du 2026-11-02, trouvé par la contre-revue du lot R37 ;
// lot du 2026-11-05)
//
// LE DÉFAUT : la pastille de réactions d'une publication lit
// `findPostAnywhere(id).reactions` (`_postReactItems`, app-04). Pour une
// publication À MOI, `findPostAnywhere` rend la copie `state.userPosts`, que le
// serveur ne mettait jamais à jour : `supaLoadPosts` (app-08) n'y recopiait que
// `commentsTotal`. Les réactions d'autrui relues par `fil_compteurs`
// n'apparaissaient donc JAMAIS sur l'appareil qui a publié ; seules celles reçues
// en direct, ou persistées, s'y affichaient.
//
// CE QUE CETTE SUITE EXIGE (la vraie lecture du fil, le vrai filet, la vraie
// liaison temps réel — `user:<moi>` depuis le 2026-11-09, `_creerCanalDb`
// avant ; seul le « serveur » est simulé, et
// rien n'est écrit) :
//   ① la réaction d'un autre compte rendue par `fil_compteurs` apparaît sur la
//     pastille de ma publication, repeinte EN PLACE sur une carte déjà à l'écran ;
//     son INSERT arrivé après la lecture ne la double pas ;
//   ② au tour du FILET (le vrai `startFeedRefreshLoop`), ma réaction optimiste
//     reste, ma ligne encore en base (retrait pas encore parti) ne revient pas,
//     et un second tour ne change plus rien (même tableau, aucune repeinte) ;
//   ③ le `ci` d'une réaction persistée est GARDÉ (même objet), la copie serveur
//     l'apprend, et son retrait en direct se voit sans aucune lecture (R37) ;
//   ④ une réaction d'autrui retirée pendant que le socket dormait part au tour
//     suivant ; celle reçue en direct PENDANT la lecture reste, puis prend son
//     identifiant au tour d'après, sans doublon ;
//   ⑤ une lecture qui n'a pas LU les réactions ne retire rien (publication
//     absente de la réponse, `fil_compteurs` puis repli en échec, réponse du
//     repli à la borne) ; et le repli, quand il lit, recopie avec l'identifiant,
//     qu'une entrée locale sans `ci` apprend (même objet) ;
//   ⑥ (contre-revue) un compte BLOQUÉ ne compte pas sur la pastille, même revenu
//     par la lecture ; et l'ordre des réactions suit leur instant ;
//   ⑦ (contre-revue) un retrait reçu PENDANT la lecture ne revient pas, qu'il soit
//     résolu par l'index ou par la recherche à l'écran ;
//   ⑧ (contre-revue) une lecture plus VIEILLE arrivée après une plus fraîche (le
//     profil et la tête du fil croisés) ne défait rien.
// Éprouvée par RÉINJECTION (2026-11-05, puis 2026-11-06 sur la version finale,
// après la contre-revue) — chaque mutation rougit au moins le cas qui la vise :
// sans la recopie, ① à ⑥ et ⑧ (⑦ éprouve les pierres tombales des deux copies,
// recopie ou non) ; sans l'instantané « avant », ④ ; mes lignes du serveur au lieu
// de mes entrées locales, ② ⑥ ; sans reporter le `ci` local, ③ ⑤ ; sans
// `reactionsLues`, ⑤ ; sans la repeinte en place, ① ② ④ ⑧ ; sans la signature,
// ② ; sans apprendre le `ci` à une entrée locale, ⑤ ; sans écarter un compte
// bloqué, ⑥ ; sans le tri, ⑥ ; sans les pierres tombales par clé, ⑦ ; sans le
// numéro de lecture, ⑧ ; sans retrouver par la ligne l'entrée d'un INSERT
// tardif, ①.
// Fiche : `docs/journal/capacite-perf-realtime.md`, « 🪞 RV-39 ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "812aee2b-214f-4949-931e-842599b6d68b";
const ALICE = "3a1f6c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const ZOE = "9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a6f";
const BOB = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
const P = "post_rv39";

// La réaction d'Alice, telle que la base la porte (REST écrit `…+00:00`).
const LIGNE_ALICE = { id: "ci_A", comment_id: P, post_id: P, user_id: ALICE, kind: "emoji", payload: "😍", created_at: "2026-11-05T09:00:05.654321+00:00" };
const T_ALICE = Date.parse("2026-11-05T09:00:05.654Z");

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

    // ── Ma publication : la copie LOCALE gardée à la publication, que
    // `findPostAnywhere` préfère à la copie serveur ──
    const copie = {
      id: o.P, authorId: o.moi, authorName: "Moi", authorEmoji: "✨", authorColor: "#8b5cf6", authorAvatar: null,
      passion: "photo", mood: "all", type: "text", text: "Ma publication RV-39", image: null, video: null, audio: null,
      createdAt: Date.parse("2026-11-05T08:00:00Z"), likes: 0, liked: false, comments: [],
    };
    if (o.locales) copie.reactions = o.locales;
    state.userPosts = [copie].concat((state.userPosts || []).filter((p) => p && p.id !== o.P));

    // ── Le « serveur » : une table, des lectures journalisées ──
    window.__lectures = [];
    window.__interactions = o.serveur;
    window.__posts = [{
      id: o.P, author_id: o.moi, passion_id: "photo", mood: "all", content: "Ma publication RV-39", created_at: "2026-11-05T08:00:00", media_url: null,
      profiles: { username: "Moi", emoji: "✨", color: "#8b5cf6", avatar_url: null, is_private: false },
    }];
    window.__profils = [
      { id: o.alice, username: "Alice", emoji: "📷", color: "#123456", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      { id: o.zoe, username: "Zoé", emoji: "🎸", color: "#654321", avatar_url: null, passion_id: "musique", passions: [], bio: "" },
      { id: o.bob, username: "Bob", emoji: "🎉", color: "#246810", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
    ];
    // Réglages par cas : `fil_compteurs` ok | erreur | absente, publications
    // absentes de sa réponse, délais de ses réponses (une file, un par appel),
    // et la lecture `comment_interactions` du repli ok | erreur | borne.
    window.__rpcMode = "ok";
    window.__rpcSans = [];
    window.__rpcDelais = [];
    window.__ciMode = "ok";
    // `fil_compteurs` rend les réactions SANS identifiant : c'est le fait de production.
    // L'instantané est pris À LA REQUÊTE, comme une vraie lecture.
    supa.rpc = (fn, args) => {
      __lectures.push({ table: "rpc:" + fn });
      if (fn !== "fil_compteurs") return Promise.resolve({ data: null, error: null });
      if (__rpcMode === "erreur") return Promise.resolve({ data: null, error: { code: "PGRST301", message: "JWT expired" } });
      if (__rpcMode === "absente") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.fil_compteurs(_post_ids) in the schema cache" } });
      const reponse = { data: (args._post_ids || []).filter((id) => !__rpcSans.includes(id)).map((id) => ({
        post_id: id, likes: 0, aime: false, commentaires: 0, apercus: [],
        reactions: __interactions.filter((i) => i.comment_id === id && (i.kind === "emoji" || i.kind === "gif") && i.payload != null)
          .sort((a, b) => supaTs(a.created_at) - supaTs(b.created_at))   // `order by i.created_at`
          .map((i) => ({ user_id: i.user_id, kind: i.kind, payload: i.payload, created_at: i.created_at })),
      })), error: null };
      // Un geste PENDANT la lecture : il arrive après l'instantané, avant la réponse.
      const delai = __rpcDelais.length ? __rpcDelais.shift() : 0;
      if (typeof window.__pendantLecture === "function") {
        const f = window.__pendantLecture; window.__pendantLecture = null;
        return new Promise((ok) => { setTimeout(f, 10); setTimeout(() => ok(reponse), Math.max(150, delai)); });
      }
      if (delai) return new Promise((ok) => setTimeout(() => ok(reponse), delai));
      return Promise.resolve(reponse);
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
          if (table === "comment_interactions") {
            if (__ciMode === "erreur") return rendre({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
            let rows = __interactions.filter((i) => (req.ins.comment_id || []).includes(i.comment_id));
            if (req.ins.kind) rows = rows.filter((i) => req.ins.kind.includes(i.kind));
            // À la borne : plus de lignes que la limite demandée, toutes d'une
            // AUTRE publication — la réponse tronquée ne dit rien de la mienne.
            if (__ciMode === "borne") {
              rows = Array.from({ length: 1000 }, (_, k) => ({ id: "ci_masse_" + k, comment_id: "post_ailleurs", post_id: "post_ailleurs",
                user_id: "u_masse_" + k, kind: "emoji", payload: "👍", created_at: "2026-11-05T08:00:00+00:00" }));
            }
            if (req.limit) rows = rows.slice(0, req.limit);   // PostgREST honore `limit`
            const cols = String(req.cols || "").split(",").map((s) => s.trim()).filter(Boolean);
            return rendre({ data: rows.map((i) => Object.fromEntries(cols.map((c) => [c, i[c]]))), error: null });
          }
          return rendre({ data: [], error: null });
        },
      };
      return q;
    };

    // ── Le SDK temps réel simulé, qui RETIENT chaque liaison ──
    Object.defineProperty(window.supa, "channel", { configurable: true, writable: true, value: function (topic) {
      const ch = { topic, liaisons: [], on(type, filtre, cb) { ch.liaisons.push({ type, filtre, cb }); return ch; },
        subscribe() { return ch; }, unsubscribe: async () => "ok" };
      return ch;
    } });
    // 📴 (2026-11-09) : plus de `realtime:db` ni de `postgres_changes`. Les MÊMES
    // gestionnaires reçoivent leurs lignes par `user:<moi>` (`_subscribeUserTopic`)
    // — c'est la vraie liaison que ce banc exerce désormais. Les scénarios gardent
    // leurs charges au format d'avant (`new` / `old`) : l'adaptateur en tire la
    // ligne poussée. Un retrait y vaut la ligne entière ; `{ id }` seul (la charge
    // de l'ancien CDC, R37) y reste accepté et retrouvé dans l'index.
    window.__canaux = [];
    const _canalBrut = window.supa.channel;
    Object.defineProperty(window.supa, "channel", { configurable: true, writable: true, value: function (topic, opts) {
      const ch = _canalBrut.call(this, topic, opts); window.__canaux.push(ch); return ch;
    } });
    window._userTopicChan = null;
    _subscribeUserTopic();
    window.__canalUser = window.__canaux.find((c) => c.topic === "user:" + MY_UID);
    if (!window.__canalUser) throw new Error("user:<moi> n'a pas été rejoint");
    window.__liaison = (tbl, evenement) => {
      const nom = tbl === "conv_reads" ? "conv_reads:UPSERT" : tbl + ":" + evenement;
      const l = window.__canalUser.liaisons.find((x) => x.type === "broadcast" && x.filtre.event === nom);
      if (!l) throw new Error("aucune liaison " + nom + " sur user:<moi>");
      return (p) => {
        const operation = (p && p.eventType) || evenement;
        return l.cb({ payload: { table: tbl, operation, record: operation === "DELETE" ? (p && p.old) : (p && p.new) } });
      };
    };
    // La charge EXACTE d'un DELETE sous RLS : la clé primaire, rien d'autre.
    window.__supprimer = (id) => {
      window.__interactions = __interactions.filter((i) => i.id !== id);
      __liaison("comment_interactions", "DELETE")({ schema: "public", table: "comment_interactions", eventType: "DELETE",
        commit_timestamp: "2026-11-05T10:00:00Z", errors: null, new: {}, old: { id } });
    };
    window.__lecturesCi = () => __lectures.filter((x) => x.table === "comment_interactions");
    window.__lecturesFil = () => __lectures.filter((x) => x.table === "rpc:fil_compteurs").length;
    window.__maCopie = () => state.userPosts.find((p) => p && p.id === o.P);
    window.__copieServeur = () => (state.supabasePosts || []).find((p) => p && p.id === o.P);
    window.__reactions = (p) => ((p && p.reactions) || []).map((x) => ({ auteur: x.authorId, texte: x.text, ci: x.ci || null }));
    // La pastille de LA carte posée par le test (le fil peut en peindre une autre).
    window.__pastille = (pid) => {
      const h = document.querySelector('[data-rv39-carte] [data-postchip="' + CSS.escape(pid) + '"]');
      return h ? h.textContent.trim() : null;
    };
    window.__pastilleMienne = (pid) => !!document.querySelector('[data-rv39-carte] [data-postchip="' + CSS.escape(pid) + '"] .cmt-react-chip.mine');
    window.__poserCarte = (pid) => {
      document.querySelectorAll("[data-rv39-carte]").forEach((n) => n.remove());
      const carte = document.createElement("div");
      carte.setAttribute("data-rv39-carte", "1");
      carte.innerHTML = renderPostHTML(findPostAnywhere(pid));
      document.body.appendChild(carte);
    };
    // Les repeintes de pastille, comptées (la recopie appelle `updatePostReactionsUI`).
    window.__repeintes = [];
    const repeindre = window.updatePostReactionsUI;
    window.updatePostReactionsUI = function (pid) { __repeintes.push(pid); return repeindre.apply(this, arguments); };
  }, { moi: MOI, alice: ALICE, zoe: ZOE, bob: BOB, P, serveur: opts.serveur || [LIGNE_ALICE], locales: opts.locales || null });
}

test.describe("RV-39 — les réactions d'autrui sur mes publications suivent le serveur", () => {
  test("① la réaction d'un autre compte, rendue par fil_compteurs, apparaît sur la pastille de ma publication, repeinte en place", async ({ page }) => {
    await preparer(page);
    const avant = await page.evaluate(() => {
      __poserCarte("post_rv39");
      return { pastille: __pastille("post_rv39"), copieLocale: findPostAnywhere("post_rv39") === __maCopie() };
    });
    expect(avant.copieLocale, "prémisse : la pastille lit MA copie (userPosts), pas la copie serveur").toBe(true);
    expect(avant.pastille).toBe("");

    // La lecture du fil, et rien d'autre : la carte n'est PAS repeinte par le test.
    const r = await page.evaluate(async () => {
      const lus = await supaLoadPosts();
      return {
        lus: lus.length,
        pastille: __pastille("post_rv39"),
        reactions: __reactions(__maCopie()),
        copieLocale: findPostAnywhere("post_rv39") === __maCopie(),
      };
    });
    expect(r.lus).toBe(1);
    expect(r.pastille, "la carte déjà à l'écran montre la réaction d'Alice").toBe("😍 1");
    expect(r.reactions).toEqual([{ auteur: ALICE, texte: "😍", ci: null }]);
    expect(r.copieLocale).toBe(true);

    // L'INSERT de cette même ligne arrive APRÈS la lecture (temps réel en retard,
    // format `… +00`) : c'est la même réaction, pas une seconde.
    const tardif = await page.evaluate(([alice]) => {
      __liaison("comment_interactions", "INSERT")({ eventType: "INSERT", old: {}, new: { id: "ci_A", comment_id: "post_rv39", post_id: "post_rv39",
        user_id: alice, kind: "emoji", payload: "😍", created_at: "2026-11-05 09:00:05.654321+00" } });
      return { reactions: __reactions(__maCopie()), pastille: __pastille("post_rv39") };
    }, [ALICE]);
    expect(tardif.reactions, "aucun doublon, et l'entrée apprend son identifiant").toEqual([{ auteur: ALICE, texte: "😍", ci: "ci_A" }]);
    expect(tardif.pastille).toBe("😍 1");
  });

  test("② au tour du filet : ma réaction optimiste reste, ma ligne en cours de retrait ne revient pas, et un second tour ne change plus rien", async ({ page }) => {
    await preparer(page, {
      // La base porte encore MON 👍 : je l'ai retiré ici, l'effacement n'est pas encore parti.
      serveur: [LIGNE_ALICE, { id: "ci_M", comment_id: P, post_id: P, user_id: MOI, kind: "emoji", payload: "👍", created_at: "2026-11-05T09:00:00.000000+00:00" }],
      // Mon 🙂, posé à l'instant : pas encore en base, pas d'identifiant.
      locales: [{ id: "emoji_local", authorId: MOI, text: "🙂", type: "emoji_reaction", createdAt: Date.parse("2026-11-05T09:30:00Z") }],
    });
    await page.evaluate(() => { __poserCarte("post_rv39"); __lectures.length = 0; startFeedRefreshLoop(); feedFiletReveiller(true); });
    await expect.poll(() => page.evaluate(() => __lecturesFil()), { message: "le filet a relu le fil" }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => _feedRefreshInFlight), { message: "et son tour est fini" }).toBe(false);
    let r = await page.evaluate(() => ({
      reactions: __reactions(__maCopie()),
      pastille: __pastille("post_rv39"),
      mienne: __pastilleMienne("post_rv39"),
      serveurAussi: !!__copieServeur(),
    }));
    expect(r.serveurAussi, "prémisse : le tour a posé la copie serveur").toBe(true);
    expect(r.reactions, "Alice (du serveur), puis mon 🙂 ; mon 👍 encore en base ne revient pas").toEqual([
      { auteur: ALICE, texte: "😍", ci: null },
      { auteur: MOI, texte: "🙂", ci: null },
    ]);
    expect(r.pastille, "la carte déjà à l'écran, repeinte en place").toBe("😍 2");
    expect(r.mienne, "la pastille sait que j'ai réagi").toBe(true);

    // Second tour, rien n'a changé en base : rien ne doit changer ici non plus.
    await page.evaluate(() => { window.__tableau = __maCopie().reactions; __repeintes.length = 0; feedFiletReveiller(true); });
    await expect.poll(() => page.evaluate(() => __lecturesFil())).toBeGreaterThanOrEqual(2);
    await expect.poll(() => page.evaluate(() => _feedRefreshInFlight)).toBe(false);
    r = await page.evaluate(() => ({
      memeTableau: __maCopie().reactions === window.__tableau,
      repeintes: __repeintes.filter((x) => x === "post_rv39").length,
      reactions: __reactions(__maCopie()).map((x) => x.texte),
    }));
    try { await page.evaluate(() => stopFeedRefreshLoop()); } catch (e) {}
    expect(r.memeTableau, "un état déjà juste n'est pas réécrit (ni sauvegarde, ni synchronisation)").toBe(true);
    expect(r.repeintes, "ni repeint").toBe(0);
    expect(r.reactions).toEqual(["😍", "🙂"]);
  });

  test("③ le ci d'une réaction persistée est gardé, la copie serveur l'apprend, et son retrait en direct se voit sans aucune lecture", async ({ page }) => {
    await preparer(page, {
      // Reçue en direct lors d'une session PRÉCÉDENTE : l'entrée persistée porte
      // son identifiant ; l'index (en mémoire) ne l'a jamais vue.
      locales: [{ id: "semoji_veille_" + ALICE, ci: "ci_A", authorId: ALICE, text: "😍", type: "emoji_reaction", createdAt: T_ALICE }],
    });
    const r = await page.evaluate(async () => {
      const entree = __maCopie().reactions[0];
      state.supabasePosts = await supaLoadPosts();
      __poserCarte("post_rv39");
      const apresLecture = {
        memeObjet: __maCopie().reactions[0] === entree,
        miennes: __reactions(__maCopie()),
        serveur: __reactions(__copieServeur()),
        indexee: _ciIndex.has("ci_A"),
        pastille: __pastille("post_rv39"),
      };
      __lectures.length = 0;
      __interactions = __interactions.filter((i) => i.id !== "ci_A");
      __liaison("comment_interactions", "DELETE")({ eventType: "DELETE", new: {}, old: { id: "ci_A" } });
      return apresLecture;
    });
    // Le retrait se voit (balayage de l'écran, ~100 ms) ; puis on laisse passer
    // le rendez-vous de la lecture des identifiants (400 ms) : il ne doit RIEN lire.
    await expect.poll(() => page.evaluate(() => __pastille("post_rv39")), { message: "le retrait en direct se voit" }).toBe("");
    await page.waitForTimeout(700);
    const apres = await page.evaluate(() => ({ pastille: __pastille("post_rv39"), lectures: __lecturesCi().length,
      miennes: __maCopie().reactions.length, serveur: __copieServeur().reactions.length }));
    expect(r.memeObjet, "l'entrée locale est gardée, pas remplacée").toBe(true);
    expect(r.miennes).toEqual([{ auteur: ALICE, texte: "😍", ci: "ci_A" }]);
    expect(r.serveur, "la copie serveur apprend l'identifiant que fil_compteurs ne rend pas").toEqual([{ auteur: ALICE, texte: "😍", ci: "ci_A" }]);
    expect(r.indexee, "prémisse : l'index ne la connaît pas").toBe(false);
    expect(r.pastille).toBe("😍 1");
    expect(apres, "retirée des deux copies, sans relire").toEqual({ pastille: "", lectures: 0, miennes: 0, serveur: 0 });
  });

  test("④ une réaction d'autrui retirée pendant que le socket dormait part ; celle reçue en direct PENDANT la lecture reste, puis prend son identifiant", async ({ page }) => {
    await preparer(page, {
      // Zoé a retiré son 🎸 pendant que le socket dormait : plus en base.
      locales: [{ id: "semoji_zoe", authorId: ZOE, text: "🎸", type: "emoji_reaction", createdAt: Date.parse("2026-11-05T08:59:00Z") }],
    });
    const r = await page.evaluate(async ([bob]) => {
      __poserCarte("post_rv39");
      const avant = __pastille("post_rv39");
      // Bob réagit PENDANT la lecture : l'instantané de la réponse ne le porte pas.
      // L'INSERT tel que supabase-js le rend (espace et décalage court).
      window.__pendantLecture = () => {
        const ligne = { id: "ci_B", comment_id: "post_rv39", post_id: "post_rv39", user_id: bob, kind: "emoji", payload: "🎉" };
        __interactions.push(Object.assign({ created_at: "2026-11-05T10:00:00.123456+00:00" }, ligne));
        __liaison("comment_interactions", "INSERT")({ eventType: "INSERT", old: {}, new: Object.assign({ created_at: "2026-11-05 10:00:00.123456+00" }, ligne) });
      };
      state.supabasePosts = await supaLoadPosts();
      const premier = { reactions: __reactions(__maCopie()), pastille: __pastille("post_rv39") };
      // Le tour suivant : la base porte maintenant Bob, au format REST.
      state.supabasePosts = await supaLoadPosts();
      return { avant, premier, second: __reactions(__maCopie()), serveur: __reactions(__copieServeur()) };
    }, [BOB]);
    expect(r.avant).toBe("🎸 1");
    expect(r.premier.reactions, "Zoé partie ; Alice lue ; Bob, reçu pendant la lecture, gardé").toEqual([
      { auteur: ALICE, texte: "😍", ci: null },
      { auteur: BOB, texte: "🎉", ci: "ci_B" },
    ]);
    expect(r.premier.pastille).toBe("😍 2");
    expect(r.second, "le tour suivant le relit : la même entrée, sans doublon").toEqual([
      { auteur: ALICE, texte: "😍", ci: null },
      { auteur: BOB, texte: "🎉", ci: "ci_B" },
    ]);
    expect(r.serveur, "et la copie serveur apprend l'identifiant de Bob").toEqual([
      { auteur: ALICE, texte: "😍", ci: null },
      { auteur: BOB, texte: "🎉", ci: "ci_B" },
    ]);
  });

  test("⑤ une lecture qui n'a pas lu les réactions ne retire rien ; le repli, quand il lit, recopie avec l'identifiant", async ({ page }) => {
    await preparer(page, {
      // Une réaction de Zoé que le serveur n'a plus : seule une VRAIE lecture peut la retirer.
      // Et celle d'Alice, déjà là mais SANS identifiant (posée par une lecture de `fil_compteurs`).
      locales: [
        { id: "semoji_zoe", authorId: ZOE, text: "🎸", type: "emoji_reaction", createdAt: Date.parse("2026-11-05T08:59:00Z") },
        { id: "semoji_alice_fil", authorId: ALICE, text: "😍", type: "emoji_reaction", createdAt: T_ALICE },
      ],
    });
    const r = await page.evaluate(async () => {
      const alice = __maCopie().reactions[1];
      const etat = async () => {
        const lus = await supaLoadPosts();
        return { lus: lus.length, reactions: __reactions(__maCopie()).map((x) => x.texte + (x.ci ? ":" + x.ci : "")) };
      };
      const out = {};
      // Ma publication absente de la réponse de fil_compteurs.
      __rpcSans = ["post_rv39"];
      out.absente = await etat();
      // fil_compteurs en échec, puis la lecture des réactions du repli en échec.
      __rpcSans = []; __rpcMode = "erreur"; __ciMode = "erreur";
      out.echec = await etat();
      // fil_compteurs absente du projet ; le repli répond à la borne (max-rows).
      __rpcMode = "absente"; __ciMode = "borne";
      out.borne = await etat();
      // Le repli lit, cette fois : les lignes portent leur identifiant.
      __ciMode = "ok";
      out.repli = await etat();
      out.cheminsLus = __lectures.filter((q) => q.table === "comment_interactions").length;
      out.limites = __lectures.filter((q) => q.table === "comment_interactions").map((q) => q.limit);
      out.memeAlice = __maCopie().reactions[0] === alice;
      return out;
    });
    expect(r.absente, "publication absente de la réponse : rien n'est prouvé").toEqual({ lus: 1, reactions: ["🎸", "😍"] });
    expect(r.echec, "lecture en échec : une liste vide n'est pas une absence").toEqual({ lus: 1, reactions: ["🎸", "😍"] });
    expect(r.borne, "réponse à la borne : elle ne prouve aucune absence").toEqual({ lus: 1, reactions: ["🎸", "😍"] });
    expect(r.repli, "le repli a lu : Zoé part, Alice apprend son identifiant").toEqual({ lus: 1, reactions: ["😍:ci_A"] });
    expect(r.memeAlice, "la même entrée, qui a appris son `ci`").toBe(true);
    expect(new Set(r.limites), "le repli demande une limite explicite, sous max-rows").toEqual(new Set([500]));
    expect(r.cheminsLus, "prémisse : le repli a bien interrogé comment_interactions, trois fois au moins").toBeGreaterThanOrEqual(3);
  });
  test("⑥ un compte bloqué ne compte pas sur la pastille, même revenu par la lecture ; l'ordre suit l'instant", async ({ page }) => {
    const MAL = "0f0e0d0c-0b0a-4909-8807-060504030201";
    await preparer(page, {
      serveur: [LIGNE_ALICE, { id: "ci_MAL", comment_id: P, post_id: P, user_id: MAL, kind: "emoji", payload: "🤬", created_at: "2026-11-05T09:00:03.000000+00:00" }],
      // Mon 🙂, posé AVANT les deux autres.
      locales: [{ id: "emoji_mien", authorId: MOI, text: "🙂", type: "emoji_reaction", createdAt: Date.parse("2026-11-05T09:00:01Z") }],
    });
    const r = await page.evaluate(async ([mal]) => {
      state.user.blocked = [mal];
      // Le temps réel l'écarte déjà (« un compte bloqué n'AJOUTE rien ») ; la lecture, non.
      __liaison("comment_interactions", "INSERT")({ eventType: "INSERT", old: {}, new: { id: "ci_MAL2", comment_id: "post_rv39", post_id: "post_rv39",
        user_id: mal, kind: "emoji", payload: "👎", created_at: "2026-11-05 09:00:04+00" } });
      state.supabasePosts = await supaLoadPosts();
      __poserCarte("post_rv39");
      return {
        ordre: __reactions(__maCopie()).map((x) => x.texte),
        reacteurs: _postReactItems("post_rv39").map((x) => x.text),
        pastille: __pastille("post_rv39"),
      };
    }, [MAL]);
    expect(r.ordre, "ma copie suit le serveur, dans l'ordre des instants (le compte bloqué y entre, comme dans la copie serveur)").toEqual(["🙂", "🤬", "😍"]);
    expect(r.reacteurs, "mais il ne compte pas, ni sur la pastille ni dans la liste des réacteurs").toEqual(["🙂", "😍"]);
    expect(r.pastille, "« 🙂 » en tête : la plus ancienne des deux réactions à égalité").toBe("🙂 2");
  });

  test("⑦ un retrait reçu PENDANT la lecture ne revient pas, résolu par l'index comme par la recherche à l'écran", async ({ page }) => {
    await preparer(page);
    // Par l'INDEX : la réaction d'Alice est arrivée en direct (indexée, posée avec son
    // identifiant), puis Alice la retire pendant qu'une lecture du fil est en vol.
    const parIndex = await page.evaluate(async ([alice]) => {
      __poserCarte("post_rv39");
      __liaison("comment_interactions", "INSERT")({ eventType: "INSERT", old: {}, new: { id: "ci_A", comment_id: "post_rv39", post_id: "post_rv39",
        user_id: alice, kind: "emoji", payload: "😍", created_at: "2026-11-05 09:00:05.654321+00" } });
      const avant = { pastille: __pastille("post_rv39"), indexee: _ciIndex.has("ci_A") };
      window.__pendantLecture = () => __supprimer("ci_A");   // après l'instantané de la réponse
      state.supabasePosts = await supaLoadPosts();
      return { avant, miennes: __reactions(__maCopie()), serveur: __reactions(__copieServeur()), pastille: __pastille("post_rv39") };
    }, [ALICE]);
    expect(parIndex.avant).toEqual({ pastille: "😍 1", indexee: true });
    expect(parIndex, "l'instantané la portait encore : elle ne revient ni sur ma copie ni sur la copie serveur")
      .toMatchObject({ miennes: [], serveur: [], pastille: "" });

    // Par la RECHERCHE À L'ÉCRAN : une réaction persistée (elle porte son identifiant,
    // l'index ne la connaît pas), retirée pendant une lecture plus lente que le balayage.
    const parEcran = await page.evaluate(async ([alice, t]) => {
      window.__interactions = [{ id: "ci_P", comment_id: "post_rv39", post_id: "post_rv39", user_id: alice, kind: "emoji", payload: "🌻",
        created_at: "2026-11-05T09:10:00.000000+00:00" }];
      __maCopie().reactions = [{ id: "semoji_veille", ci: "ci_P", authorId: alice, text: "🌻", type: "emoji_reaction", createdAt: t }];
      __poserCarte("post_rv39");
      const avant = { pastille: __pastille("post_rv39"), indexee: _ciIndex.has("ci_P") };
      __rpcDelais = [400];
      window.__pendantLecture = () => __supprimer("ci_P");
      state.supabasePosts = await supaLoadPosts();
      return { avant, miennes: __reactions(__maCopie()), serveur: __reactions(__copieServeur()), pastille: __pastille("post_rv39") };
    }, [ALICE, Date.parse("2026-11-05T09:10:00Z")]);
    expect(parEcran.avant).toEqual({ pastille: "🌻 1", indexee: false });
    expect(parEcran).toMatchObject({ miennes: [], serveur: [], pastille: "" });
  });

  test("⑧ une lecture plus VIEILLE arrivée après une plus fraîche ne défait rien (profil et tête du fil croisés)", async ({ page }) => {
    await preparer(page, {
      serveur: [LIGNE_ALICE, { id: "ci_Z", comment_id: P, post_id: P, user_id: ZOE, kind: "emoji", payload: "🎸", created_at: "2026-11-05T08:59:00.000000+00:00" }],
      locales: [{ id: "semoji_zoe", authorId: ZOE, text: "🎸", type: "emoji_reaction", createdAt: Date.parse("2026-11-05T08:59:00Z") }],
    });
    const r = await page.evaluate(async () => {
      __poserCarte("post_rv39");
      // A : la lecture du PROFIL (non séquencée par la tête du fil), lente.
      __rpcDelais = [600, 0];
      const a = supaLoadPosts(0, MY_UID);
      await new Promise((ok) => setTimeout(ok, 60));   // son instantané est pris
      // Zoé retire sa réaction pendant que le socket dormait : aucun DELETE reçu.
      window.__interactions = __interactions.filter((i) => i.id !== "ci_Z");
      // B : la tête du fil, instantané plus frais, réponse immédiate.
      state.supabasePosts = await supaLoadPosts();
      const apresB = __reactions(__maCopie()).map((x) => x.texte);
      await a;
      return { apresB, apresA: __reactions(__maCopie()).map((x) => x.texte), pastille: __pastille("post_rv39"), lectures: __lecturesFil() };
    });
    expect(r.lectures, "prémisse : deux lectures du fil").toBe(2);
    expect(r.apresB, "la plus fraîche retire Zoé").toEqual(["😍"]);
    expect(r.apresA, "la plus vieille, arrivée après, ne la ramène pas").toEqual(["😍"]);
    expect(r.pastille).toBe("😍 1");
  });
});
