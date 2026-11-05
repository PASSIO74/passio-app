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
// liaison temps réel de `_creerCanalDb` ; seul le « serveur » est simulé, et
// rien n'est écrit) :
//   ① la réaction d'un autre compte rendue par `fil_compteurs` apparaît sur la
//     pastille de ma publication, repeinte EN PLACE sur une carte déjà à l'écran ;
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
//     repli à la borne) ; et le repli, quand il lit, recopie avec l'identifiant.
// Éprouvée par RÉINJECTION (2026-11-05) : sans la recopie, ① ② ③ ④ ⑤ rougissent ;
// sans l'instantané « avant » (tout ce qui manque au serveur retiré), ④ ; en
// recopiant aussi mes lignes du serveur (au lieu de garder mes entrées locales),
// ② ; sans reporter le `ci` local (lignes serveur clonées telles quelles), ③ ;
// sans `reactionsLues` (toute réponse prise pour une liste complète), ⑤ ; sans
// la repeinte en place, ① ② ④ ; sans la comparaison de signature (toujours
// écrire), ②. Chaque autre cas reste vert sous chacune de ces mutations.
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
    // absentes de sa réponse, et la lecture `comment_interactions` du repli
    // ok | erreur | borne (une réponse de 1 000 lignes, `max-rows`).
    window.__rpcMode = "ok";
    window.__rpcSans = [];
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
          .map((i) => ({ user_id: i.user_id, kind: i.kind, payload: i.payload, created_at: i.created_at })),
      })), error: null };
      // Un geste PENDANT la lecture : il arrive après l'instantané, avant la réponse.
      if (typeof window.__pendantLecture === "function") {
        const f = window.__pendantLecture; window.__pendantLecture = null;
        return new Promise((ok) => { setTimeout(f, 10); setTimeout(() => ok(reponse), 150); });
      }
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
            // À la borne : 1 000 lignes, toutes d'une AUTRE publication — la
            // réponse ne dit rien de la mienne.
            if (__ciMode === "borne") {
              rows = Array.from({ length: 1000 }, (_, k) => ({ id: "ci_masse_" + k, comment_id: "post_ailleurs", post_id: "post_ailleurs",
                user_id: "u_masse_" + k, kind: "emoji", payload: "👍", created_at: "2026-11-05T08:00:00+00:00" }));
            }
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
    window.__canalDb = _creerCanalDb(true);
    window.__liaison = (tbl, evenement) => {
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === tbl && x.filtre.event === evenement);
      if (!l) throw new Error("aucune liaison " + evenement + " sur " + tbl);
      return l.cb;
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
      await new Promise((ok) => setTimeout(ok, 800));
      return { apresLecture, pastille: __pastille("post_rv39"), lectures: __lecturesCi().length,
        miennes: __maCopie().reactions.length, serveur: __copieServeur().reactions.length };
    });
    expect(r.apresLecture.memeObjet, "l'entrée locale est gardée, pas remplacée").toBe(true);
    expect(r.apresLecture.miennes).toEqual([{ auteur: ALICE, texte: "😍", ci: "ci_A" }]);
    expect(r.apresLecture.serveur, "la copie serveur apprend l'identifiant que fil_compteurs ne rend pas").toEqual([{ auteur: ALICE, texte: "😍", ci: "ci_A" }]);
    expect(r.apresLecture.indexee, "prémisse : l'index ne la connaît pas").toBe(false);
    expect(r.apresLecture.pastille).toBe("😍 1");
    expect(r, "retirée des deux copies, sans relire").toMatchObject({ pastille: "", lectures: 0, miennes: 0, serveur: 0 });
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
      locales: [{ id: "semoji_zoe", authorId: ZOE, text: "🎸", type: "emoji_reaction", createdAt: Date.parse("2026-11-05T08:59:00Z") }],
    });
    const r = await page.evaluate(async () => {
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
      return out;
    });
    expect(r.absente, "publication absente de la réponse : rien n'est prouvé").toEqual({ lus: 1, reactions: ["🎸"] });
    expect(r.echec, "lecture en échec : une liste vide n'est pas une absence").toEqual({ lus: 1, reactions: ["🎸"] });
    expect(r.borne, "réponse à la borne : elle ne prouve aucune absence").toEqual({ lus: 1, reactions: ["🎸"] });
    expect(r.repli, "le repli a lu : Zoé part, Alice arrive avec son identifiant").toEqual({ lus: 1, reactions: ["😍:ci_A"] });
    expect(r.cheminsLus, "prémisse : le repli a bien interrogé comment_interactions, trois fois au moins").toBeGreaterThanOrEqual(3);
  });
});
