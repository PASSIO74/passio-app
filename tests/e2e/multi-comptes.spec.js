// Test multi-comptes PASSIO — backlog #1 : deux vrais comptes (auth anonyme
// Supabase), création de conversation, échange de messages texte + message
// vocal, vérification de la réception realtime et du lecteur vocal intégré.
//
// ⚠️ ÉCRIT EN BASE RÉELLE (2 utilisateurs anonymes, 1 conversation, ~3 messages,
// nettoyés à la fin sauf les entrées auth.users anonymes — suppression service_role
// seulement). C'est pourquoi il est OPT-IN : il ne tourne pas en CI.
//
//   PowerShell :  $env:PASSIO_E2E_MULTI = "1"; npm test -- multi-comptes
//   bash :        PASSIO_E2E_MULTI=1 npm test -- multi-comptes
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

// Mode realtime à tester : PASSIO_E2E_RT = "v2" | "v3" (sinon v1 par défaut).
// Permet de valider le realtime scalable de bout en bout :
//   PASSIO_E2E_MULTI=1 PASSIO_E2E_RT=v3 npm test -- multi-comptes
const RT_MODE = process.env.PASSIO_E2E_RT || "";

test.describe("messagerie entre 2 comptes réels", () => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "opt-in : PASSIO_E2E_MULTI=1 (écrit en base réelle)");

  test("inscription → conversation → texte + vocal dans les deux sens", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[multi ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (msg) => { if (msg.type() === "error") log("A console.error: " + msg.text().slice(0, 200)); });
    pageB.on("console", (msg) => { if (msg.type() === "error") log("B console.error: " + msg.text().slice(0, 200)); });
    wireHttpDiag(log, pageA, pageB);

    try {
      // ── 1. Inscription des deux comptes par le vrai parcours d'onboarding ──
      log("étape 1 : inscription A…");
      const uidA = await signupAnonymous(pageA, "Test Alice");
      log("A inscrit: " + uidA);
      const uidB = await signupAnonymous(pageB, "Test Bob");
      log("B inscrit: " + uidB);
      expect(uidA, "compte A créé").toBeTruthy();
      expect(uidB, "compte B créé").toBeTruthy();
      expect(uidA).not.toBe(uidB);

      // ── 2. A crée une conversation avec B et l'ouvre ──
      const convId = await pageA.evaluate(async (buid) => {
        const id = await supaCreateConversation(buid);
        if (!id) return null;
        const convs = getConversations();
        convs.unshift({ id, userId: buid, userName: "Test Bob", userEmoji: "✨", userColor: "#8b5cf6", passion: null, unread: 0, lastAt: Date.now(), messages: [], isGroup: false });
        conversationsState = convs;
        saveConversationsNow();
        openConversation(id);
        return id;
      }, uidB);
      expect(convId, "conversation créée dans Supabase").toBeTruthy();
      log("étape 2 OK : conv créée " + convId);

      // ── 3. A envoie un texte, B doit le recevoir (realtime, conv auto-créée) ──
      await pageA.fill("#convFpInput", "Bonjour de Alice [test auto]");
      await pageA.evaluate((id) => sendMessageFp(id), convId);
      log("étape 3 : message A envoyé, attente réception B…");

      await pageB.waitForFunction(
        (id) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => (m.text || "").indexOf("Bonjour de Alice") !== -1));
        },
        convId,
        { timeout: 30000 }
      );

      log("étape 3 OK : B a reçu le texte de A");

      // ── 4. B répond, A doit le recevoir ──
      await pageB.evaluate((id) => openConversation(id), convId);
      await pageB.fill("#convFpInput", "Bien reçu, réponse de Bob [test auto]");
      await pageB.evaluate((id) => sendMessageFp(id), convId);
      log("étape 4 : réponse B envoyée, attente réception A…");

      await pageA.waitForFunction(
        (id) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => (m.text || "").indexOf("réponse de Bob") !== -1));
        },
        convId,
        { timeout: 30000 }
      );

      log("étape 4 OK : A a reçu la réponse de B");

      // ── 5. A envoie un message vocal (même format que _sendVoiceMessage) ──
      // ⚠️ sendMessageToSupabase RETIRE volontairement tout payload `data:` base64
      // (hygiène DB : un vocal de 5 Mo avait gonflé conv_messages à 24 Mo). Le vrai
      // chemin vocal uploade sur Storage et envoie une URL https — c'est ce qu'on
      // simule ici pour valider la réception + le rendu du lecteur cross-compte.
      const voiceMsgId = await pageA.evaluate((id) => {
        const msgId = "msg_" + uid();
        const storageUrl = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/media/voice-test.webm";
        sendMessageToSupabase(msgId, id, storageUrl, "audio/webm", "Message vocal (3s)", "audio");
        return msgId;
      }, convId);

      // ── 6. B reçoit le vocal et le rend dans le lecteur intégré (backlog #2) ──
      await pageB.waitForFunction(
        ([id, mid]) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => m.id === mid));
        },
        [convId, voiceMsgId],
        { timeout: 30000 }
      );
      await pageB.evaluate((id) => openConversation(id), convId);
      const voiceRender = await pageB.evaluate((mid) => {
        const aid = "aud_" + mid.replace(/[^a-z0-9]/gi, "");
        const thread = document.getElementById("convFpThread");
        return {
          lecteur: !!document.getElementById("pb_" + aid),
          duree: (document.getElementById("dur_" + aid) || {}).textContent || null,
          source: !!window["_vd_" + aid],
          jsonBrut: thread ? thread.textContent.indexOf('{"type"') !== -1 : null,
          carteTelechargement: thread ? thread.innerHTML.indexOf("Télécharger") !== -1 : null,
        };
      }, voiceMsgId);
      expect(voiceRender.lecteur, "lecteur vocal intégré rendu chez B").toBe(true);
      expect(voiceRender.source, "source audio enregistrée").toBe(true);
      expect(voiceRender.duree).toBe("0:03");
      expect(voiceRender.jsonBrut, "pas de JSON brut affiché").toBe(false);
      expect(voiceRender.carteTelechargement, "pas de carte téléchargement pour un vocal").toBe(false);
      log("étapes 5-6 OK : vocal reçu et rendu dans le lecteur intégré");

      // ── 7. Nettoyage des données de test (best-effort, RLS par propriétaire) ──
      await cleanup(pageA, convId);
      await cleanup(pageB, convId);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // Notifications cross-compte : A publie un post, B like + commente + suit,
  // A doit recevoir 3 notifications (like, comment, follow). Valide le fix du
  // 2026-06-17 : (a) findPostAnywhere → B peut interagir avec un vrai post de A ;
  // (b) supaInsertNotif insère bien la notif chez A ; (c) A charge ses notifs
  // (supaLoadNotifications, garanti) ; (d) best-effort : livraison realtime.
  // Étendu le 2026-07-02 : réactions emoji/GIF portées par le POST (convention
  // comment_id === post_id dans comment_interactions) — B réagit 😍 + GIF, A voit
  // la pastille SANS recharger (realtime:comment_interactions →
  // _applyCommentInteractionEvent, app-04) et la réaction survit au rechargement
  // du fil (mappée par supaLoadPosts).
  test("interactions sur un post → l'auteur reçoit les notifications", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[notif ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (msg) => { if (msg.type() === "error") log("A console.error: " + msg.text().slice(0, 200)); });
    pageB.on("console", (msg) => { if (msg.type() === "error") log("B console.error: " + msg.text().slice(0, 200)); });
    wireHttpDiag(log, pageA, pageB);

    let postId = null;
    try {
      // ── 1. Inscription des deux comptes ──
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy(); expect(uidA).not.toBe(uidB);
      log("A=" + uidA + " B=" + uidB);

      // ── 2. A publie un vrai post dans Supabase (même schéma que supaPublishPost) ──
      postId = await pageA.evaluate(async () => {
        const id = "post_" + uid();
        const { error } = await supa.from("posts").insert([{
          id, author_id: MY_UID, passion_id: "musique", mood: "all",
          content: "Post de Alice [test notif auto]", media_url: null,
          created_at: new Date().toISOString(),
        }]);
        return error ? null : id;
      });
      expect(postId, "post de A inséré dans Supabase").toBeTruthy();
      log("post publié: " + postId);

      // ── 3. B charge le post dans son feed puis interagit (vrais handlers) ──
      // Injection dans supabasePosts = ce que fait supaLoadPosts au boot/refresh.
      await pageB.evaluate(([pid, aid]) => {
        state.supabasePosts = state.supabasePosts || [];
        if (!state.supabasePosts.find((p) => p.id === pid)) {
          state.supabasePosts.unshift({
            id: pid, authorId: aid, authorName: "Test Alice", authorEmoji: "✨",
            authorColor: "#8b5cf6", passion: "musique", mood: "all", type: "text",
            text: "Post de Alice [test notif auto]", image: null,
            createdAt: Date.now(), likes: 0, liked: false, comments: [], fromSupabase: true,
          });
        }
      }, [postId, uidA]);

      // 3a. Like (likePost → supaInsertNotif "like")
      await pageB.evaluate((pid) => likePost(pid, true), postId);
      log("B a liké");

      // 3b. Commentaire (openComments ouvre le modal — interdit avant le fix —
      //     puis submitComment → supaAddComment + supaInsertNotif "comment")
      await pageB.evaluate((pid) => openComments(pid), postId);
      await pageB.waitForSelector("#newComment", { timeout: 10000 });
      await pageB.fill("#newComment", "Super post Alice ! [test notif auto]");
      await pageB.evaluate((pid) => submitComment(pid), postId);
      log("B a commenté");

      // 3c. Follow (supaFollowUser → supaInsertNotif "follow")
      await pageB.evaluate((aid) => supaFollowUser(aid), uidA);
      log("B a suivi A");

      // La ligne follows doit RÉELLEMENT exister (le 2026-07-02, l'insert envoyait
      // un created_at inexistant en prod → 400 silencieux : la notif partait mais
      // le follow n'était jamais écrit, compteur d'abonnés toujours à 0).
      const followWritten = await pageA.evaluate(async (buid) => {
        const { data } = await supa.from("follows").select("follower_id").eq("follower_id", buid).eq("following_id", MY_UID);
        return (data || []).length;
      }, uidB);
      expect(followWritten, "ligne follows écrite en base (pas seulement la notif)").toBeGreaterThanOrEqual(1);

      // 3d. Réactions emoji + GIF portées par le POST lui-même (2026-07-02) :
      //     convention comment_id === post_id dans comment_interactions. B réagit
      //     via les VRAIS handlers (addEmojiToPost/addGifToPost → supaCommentInteract).
      //     Pré-requis côté A : le post doit être dans son état local pour que
      //     _applyCommentInteractionEvent le retrouve via findPostAnywhere (comme
      //     supaLoadPosts l'aurait mis au boot).
      await pageA.evaluate(([pid, aid]) => {
        state.supabasePosts = state.supabasePosts || [];
        if (!state.supabasePosts.find((p) => p.id === pid)) {
          state.supabasePosts.unshift({
            id: pid, authorId: aid, authorName: "Test Alice", authorEmoji: "✨",
            authorColor: "#8b5cf6", passion: "musique", mood: "all", type: "text",
            text: "Post de Alice [test notif auto]", image: null,
            createdAt: Date.now(), likes: 0, liked: false, comments: [], fromSupabase: true,
          });
        }
      }, [postId, uidA]);
      const GIF_URL = "https://media.tenor.com/e2e-test/passio.gif";
      await pageB.evaluate(([pid, gif]) => { addEmojiToPost(pid, "😍"); addGifToPost(pid, gif); }, [postId, GIF_URL]);
      log("B a réagi 😍 + GIF au post");

      // ── A voit les réactions SANS recharger (canal realtime:comment_interactions) ──
      await pageA.waitForFunction(
        ([pid, buid]) => {
          const p = findPostAnywhere(pid);
          const rx = (p && p.reactions) || [];
          return rx.some((x) => x.type === "emoji_reaction" && x.text === "😍" && x.authorId === buid)
              && rx.some((x) => x.type === "gif_reaction" && x.authorId === buid);
        },
        [postId, uidB], { timeout: 20000 }
      );
      // La pastille AGRÈGE (emoji majoritaire + total, cf. _reactionItemsChipHtml) :
      // avec 1 😍 + 1 GIF elle affiche « 😍 2 » ou « 🎬 2 » selon le tri → on
      // vérifie le rendu (chip présent) et le compteur, pas un emoji précis.
      const chipA = await pageA.evaluate((pid) => _postReactChipHtml(pid), postId);
      expect(chipA, "pastille de réactions rendue chez A").toContain("cmt-react-chip");
      expect(chipA, "pastille : 2 réactions comptées chez A").toContain("<b>2</b>");
      log("✅ realtime OK : A voit la pastille (2 réactions) sans recharger");

      // ── Persistance : un fil (re)chargé depuis Supabase porte les réactions
      //    (supaLoadPosts mappe comment_interactions où comment_id === post_id) ──
      const loadedPost = await loadFindWithRetry(pageA, "supaLoadPosts", postId, 20000);
      expect(loadedPost, "post rechargé depuis Supabase").toBeTruthy();
      const loadedRx = loadedPost.reactions || [];
      expect(loadedRx.some((x) => x.type === "emoji_reaction" && x.text === "😍" && x.authorId === uidB),
        "réaction 😍 persistée et chargée par supaLoadPosts").toBe(true);
      expect(loadedRx.some((x) => x.type === "gif_reaction" && x.authorId === uidB),
        "réaction GIF persistée et chargée par supaLoadPosts").toBe(true);
      log("✅ réactions post persistées (chargées par supaLoadPosts)");

      // supaInsertNotif est fire-and-forget : laisser les inserts atterrir.
      await pageB.waitForTimeout(2500);

      // ── 4. Best-effort : A a-t-il reçu en temps réel ? (dépend de la
      //     publication realtime de la table notifications — informatif) ──
      let rtKinds = [];
      try {
        await pageA.waitForFunction(
          () => (state.notifications || []).some((n) => n.fromSupabase),
          null, { timeout: 8000 }
        );
        rtKinds = await pageA.evaluate(() => (state.notifications || []).filter((n) => n.fromSupabase).map((n) => n.kind));
        log("realtime OK chez A: " + JSON.stringify(rtKinds));
      } catch (e) {
        log("realtime non livré sous 8s (publication notifications ?) — on valide via le chargement");
      }

      // ── 5. Garantie : A charge ses notifications depuis Supabase ──
      const notifs = await loadNotifsWithRetry(pageA, 3, 20000);
      const kinds = notifs.map((n) => n.kind).sort();
      const fromB = notifs.every((n) => n.fromId === uidB);
      log("notifs chargées par A: " + JSON.stringify(notifs.map((n) => ({ k: n.kind, f: n.fromId }))));
      expect(notifs.length, "A a au moins 3 notifications").toBeGreaterThanOrEqual(3);
      expect(kinds, "kinds attendus").toEqual(expect.arrayContaining(["like", "comment", "follow"]));
      expect(fromB, "toutes les notifs viennent de B").toBe(true);
      log("✅ notifications cross-compte validées (like + comment + follow)");

      // ── 6. Nettoyage ──
      await cleanupNotifs(pageA, postId);
      await cleanupNotifs(pageB, postId);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // Événement cross-compte : A crée un événement, B le rejoint, A doit recevoir
  // une notif "event_join" ET le compteur de participants doit refléter B.
  // Valide le fix du 2026-06-18 : supaLoadEvents charge les vrais event_attendees
  // (avant : attendees:[] → "0 inscrit"), et toggleJoinEvent notifie l'organisateur.
  test("rejoindre l'événement d'un autre → notif organisateur + participant compté", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[event ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (msg) => { if (msg.type() === "error") log("A console.error: " + msg.text().slice(0, 200)); });
    pageB.on("console", (msg) => { if (msg.type() === "error") log("B console.error: " + msg.text().slice(0, 200)); });
    wireHttpDiag(log, pageA, pageB);

    let eventId = null;
    try {
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy(); expect(uidA).not.toBe(uidB);
      log("A=" + uidA + " B=" + uidB);

      // ── A crée un vrai événement (même schéma que supaPublishEvent) ──
      eventId = await pageA.evaluate(async () => {
        const id = "evt_" + uid();
        const { error } = await supa.from("events").insert({
          id, author_id: MY_UID, organizer_id: MY_UID, title: "Atelier test auto",
          passion_id: "musique", city: "Paris", emoji: "🎸",
          date_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date().toISOString(),
        });
        return error ? null : id;
      });
      expect(eventId, "événement de A inséré").toBeTruthy();
      log("événement publié: " + eventId);

      // ── B charge l'événement dans son état puis le rejoint (vrai handler) ──
      await pageB.evaluate(([eid, aid]) => {
        state.seed.events = state.seed.events || [];
        if (!state.seed.events.find((e) => e.id === eid)) {
          state.seed.events.unshift({
            id: eid, authorId: aid, organizerId: aid, title: "Atelier test auto",
            passion: "musique", city: "Paris", emoji: "🎸",
            date: Date.now() + 86400000, attendees: [], fromSupabase: true,
          });
        }
        toggleJoinEvent(eid);
      }, [eventId, uidA]);
      log("B a rejoint l'événement");
      await pageB.waitForTimeout(2500); // laisser supaJoinEvent + supaInsertNotif atterrir

      // ── 1. A reçoit la notif event_join ──
      const notifs = await loadNotifsWithRetry(pageA, 1, 20000);
      const joinNotif = notifs.find((n) => n.kind === "event_join");
      log("notifs A: " + JSON.stringify(notifs.map((n) => n.kind)));
      expect(joinNotif, "A a une notif event_join").toBeTruthy();
      expect(joinNotif.fromId, "la notif vient de B").toBe(uidB);

      // ── 2. Le participant B est bien chargé depuis event_attendees ──
      const attendees = await pageA.evaluate(async (eid) => {
        const evs = (typeof supaLoadEvents === "function") ? await supaLoadEvents() : [];
        const e = evs.find((x) => x.id === eid);
        return e ? e.attendees : null;
      }, eventId);
      log("attendees chargés: " + JSON.stringify(attendees));
      expect(attendees, "attendees chargés depuis Supabase").toBeTruthy();
      expect(attendees, "B figure dans les participants (compteur réel)").toContain(uidB);
      log("✅ événement cross-compte validé (notif organisateur + compteur réel)");

      await cleanupEvent(pageA, eventId);
      await cleanupEvent(pageB, eventId);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // Story + Bobine façon Instagram : A publie une story (média + overlays) et une
  // bobine (is_reel), B doit les charger depuis Supabase (overlays préservés ;
  // bobine dans les Bobines, PAS dans le feed). Valide le chemin d'écriture
  // Supabase de l'éditeur média du 2026-06-19.
  test("story + bobine façon Instagram → publiées et visibles cross-compte", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[media ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (m) => { if (m.type() === "error") log("A err: " + m.text().slice(0, 160)); });
    pageB.on("console", (m) => { if (m.type() === "error") log("B err: " + m.text().slice(0, 160)); });
    wireHttpDiag(log, pageA, pageB);

    const PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    let storyId = null, reelId = null;
    try {
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy(); expect(uidA).not.toBe(uidB);

      // ── A publie une STORY (média + 2 overlays) ──
      storyId = await pageA.evaluate(async (px) => {
        const id = "story_" + uid();
        await supaPublishStory({
          id, authorId: MY_UID, authorName: "Test Alice", authorEmoji: "✨", authorColor: "#8b5cf6",
          text: "Story auto", content: "Story auto", media: px, mediaType: "photo",
          overlays: [
            { type: "text", text: "Coucou", color: "#ffffff", x: 50, y: 40, size: 26 },
            { type: "emoji", emoji: "🔥", x: 60, y: 60, size: 52 },
          ],
          emoji: "✨", passion: null, createdAt: Date.now(),
        });
        return id;
      }, PX);
      log("story publiée: " + storyId);
      const bStory = await loadFindWithRetry(pageB, "supaLoadStories", storyId, 20000);
      expect(bStory, "B charge la story de A").toBeTruthy();
      expect((bStory.overlays || []).length, "overlays de la story préservés").toBeGreaterThanOrEqual(2);
      log("B voit la story · overlays=" + (bStory.overlays || []).length + " · media=" + (bStory.media ? (bStory.media.indexOf("data:") === 0 ? "base64" : "url") : "none"));

      // ── A publie une BOBINE (is_reel + média + overlay) ──
      reelId = await pageA.evaluate(async (px) => {
        const id = "reel_" + uid();
        await supaPublishPostWithRetry({
          id, authorId: MY_UID, authorName: "Test Alice", authorEmoji: "✨", authorColor: "#8b5cf6",
          passion: "musique", mood: "creation", type: "photo", isReel: true, image: px,
          overlays: [{ type: "text", text: "Ma bobine", color: "#ffffff", x: 50, y: 30, size: 24 }],
          text: "Ma bobine", createdAt: Date.now(), likes: 0, liked: false, comments: [],
        });
        return id;
      }, PX);
      log("bobine publiée: " + reelId);
      const bReel = await loadFindWithRetry(pageB, "supaLoadPosts", reelId, 20000);
      expect(bReel, "B charge la bobine de A").toBeTruthy();
      expect(bReel.isReel, "bobine marquée is_reel chez B").toBe(true);

      // B : la bobine est dans les Bobines, PAS dans le feed
      const split = await pageB.evaluate((reel) => {
        state.supabasePosts = state.supabasePosts || [];
        if (!state.supabasePosts.find((p) => p.id === reel.id)) state.supabasePosts.unshift(reel);
        return { inReels: buildReels().some((p) => p.id === reel.id), inFeed: allFeedPosts().some((p) => p.id === reel.id) };
      }, bReel);
      log("B : bobine dans Bobines=" + split.inReels + " feed=" + split.inFeed);
      expect(split.inReels, "bobine visible dans Bobines chez B").toBe(true);
      expect(split.inFeed, "bobine ABSENTE du feed chez B").toBe(false);
      log("✅ story + bobine cross-compte validées");

      await cleanupMedia(pageA, storyId, reelId);
      await cleanupMedia(pageB, storyId, reelId);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // CDV Live cross-compte : A démarre un Live + une étape, B le charge depuis
  // Supabase, commente, réagit et le suit ; A recharge et voit le commentaire,
  // la réaction et le follower. Valide la synchro des Lives (migration_cdv_lives).
  test("CDV Live d'un autre → étape/commentaire/réaction/suivi cross-compte", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[cdv ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (m) => { if (m.type() === "error") log("A err: " + m.text().slice(0, 160)); });
    pageB.on("console", (m) => { if (m.type() === "error") log("B err: " + m.text().slice(0, 160)); });
    wireHttpDiag(log, pageA, pageB);

    let liveId = null;
    try {
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy(); expect(uidA).not.toBe(uidB);
      log("A=" + uidA + " B=" + uidB);

      // ── A démarre un Live + publie une étape AVEC une photo base64 ──
      const PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      liveId = await pageA.evaluate(async (px) => {
        const id = "live_" + uid();
        await supaPublishCdvLive({ id, authorId: "me", destination: "Tour auto", description: "e2e", duration: "weekend", visibility: "public", status: "live" });
        await supaAddCdvLiveStep(id, { id: "ls_" + uid(), city: "Lisbonne", emoji: "📍", content: "Arrivée [test auto]", photos: [px], rating: 5, budget: "€€" });
        return id;
      }, PX);
      expect(liveId, "Live de A publié").toBeTruthy();
      log("live publié: " + liveId);

      // ── B charge le Live de A depuis Supabase ──
      const bLive = await loadFindWithRetry(pageB, "supaLoadCdvLives", liveId, 20000);
      expect(bLive, "B charge le Live de A").toBeTruthy();
      expect(bLive.steps.length, "étape visible chez B").toBeGreaterThanOrEqual(1);
      expect(bLive.authorId, "auteur = A").toBe(uidA);
      // Invariant DB-hygiène : AUCUNE photo d'étape ne doit être du base64 en DB
      // (uploadée sur Storage → URL, ou sautée si l'upload échoue — jamais base64).
      const stepPhotos = bLive.steps.reduce((acc, s) => acc.concat(s.photos || []), []);
      expect(stepPhotos.every((p) => typeof p === "string" && p.indexOf("data:") !== 0), "aucune photo base64 en DB").toBe(true);
      log("B voit le live · étapes=" + bLive.steps.length + " · photos=" + JSON.stringify(stepPhotos.map((p) => (p || "").slice(0, 24))));

      // ── B commente, réagit, suit (vraies fonctions de sync) ──
      await pageB.evaluate(async (id) => {
        await supaAddCdvLiveComment(id, "Génial ce voyage ! [test auto]");
        await supaReactCdvLive(id, "🔥");
        await supaFollowCdvLive(id);
      }, liveId);
      log("B a commenté / réagi / suivi");
      await pageB.waitForTimeout(1500);

      // ── A recharge son Live et voit les interactions de B ──
      const aLive = await loadFindWithRetry(pageA, "supaLoadCdvLives", liveId, 20000);
      expect(aLive, "A recharge son Live").toBeTruthy();
      expect((aLive.comments || []).some((c) => (c.text || "").indexOf("Génial") !== -1), "commentaire de B visible chez A").toBe(true);
      expect((aLive.reactions || []).includes("🔥"), "réaction de B visible chez A").toBe(true);
      expect((aLive.followers || []).includes(uidB), "B figure dans les followers chez A").toBe(true);
      log("✅ CDV Live cross-compte validé (étape + commentaire + réaction + suivi)");

      // ── Realtime : A ajoute une 2e étape, B la reçoit SANS recharger manuellement
      //    (canal postgres_changes "realtime:cdv_lives" → _onCdvRealtime → refresh) ──
      await pageA.evaluate((id) => supaAddCdvLiveStep(id, { id: "ls_" + uid(), city: "Sintra", emoji: "📍", content: "Étape realtime [test auto]", photos: [], rating: 4, budget: "€" }), liveId);
      try {
        await pageB.waitForFunction(
          (id) => { const l = (typeof getCdvLives === "function" ? getCdvLives() : []).find((x) => x.id === id); return !!(l && (l.steps || []).length >= 2); },
          liveId, { timeout: 15000 }
        );
        log("✅ realtime OK : B a reçu la 2e étape sans recharger");
      } catch (e) {
        log("⚠️ realtime non livré sous 15s (le polling 5 s du viewer reste le filet de sécurité)");
      }

      // ── Nettoyage : A supprime son Live (cascade efface les enfants) ──
      await cleanupCdvLive(pageA, liveId);
      await cleanupCdvLive(pageB, null);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // Carnet de voyage cross-compte (2026-07-02, colonne posts.vlog jsonb) : A
  // publie un carnet complet (destination, 2 étapes dont 1 photo base64, cover),
  // B le charge via supaLoadPosts → type "vlog" réhydraté, présent dans
  // allCarnets() (écran CDV) et ouvrable dans le viewer plein écran. Invariant
  // hygiène DB : cover + photos d'étapes = URLs Storage, JAMAIS de base64.
  test("carnet de voyage d'un autre → visible dans CDV et ouvrable cross-compte", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[vlog ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (m) => { if (m.type() === "error") log("A err: " + m.text().slice(0, 160)); });
    pageB.on("console", (m) => { if (m.type() === "error") log("B err: " + m.text().slice(0, 160)); });

    const PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    let vlogId = null;
    try {
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy(); expect(uidA).not.toBe(uidB);

      // ── A publie un CARNET (vlog) complet ──
      vlogId = await pageA.evaluate(async (px) => {
        const id = "vlog_" + uid();
        await supaPublishPostWithRetry({
          id, authorId: MY_UID, authorName: "Test Alice", authorEmoji: "✨", authorColor: "#8b5cf6",
          passion: "voyage", mood: "all", type: "vlog",
          text: "Lisbonne [test auto] · carnet",
          destination: "Lisbonne [test auto]", dateStart: "2026-07-01", dateEnd: "2026-07-03",
          budget: "500€", transport: "avion", lodging: "auberge", season: "été", tip: "Réserver tôt",
          cover: px,
          steps: [
            { place: "Alfama", text: "Vieille ville", tip: "", photo: px, video: null, audio: null },
            { place: "Belém", text: "Pasteis de nata", tip: "Y aller tôt", photo: null, video: null, audio: null },
          ],
          createdAt: Date.now(), likes: 0, liked: false, comments: [],
        });
        return id;
      }, PX);
      expect(vlogId, "carnet de A publié").toBeTruthy();
      log("carnet publié: " + vlogId);

      // ── B charge le carnet depuis Supabase (type + champs réhydratés) ──
      const bVlog = await loadFindWithRetry(pageB, "supaLoadPosts", vlogId, 25000);
      expect(bVlog, "B charge le carnet de A").toBeTruthy();
      expect(bVlog.type, "type vlog réhydraté chez B").toBe("vlog");
      expect(bVlog.destination || "", "destination visible chez B").toContain("Lisbonne");
      expect((bVlog.steps || []).length, "2 étapes visibles chez B").toBe(2);
      expect((bVlog.steps || [])[1].tip, "tip d'étape préservé").toBe("Y aller tôt");
      // Invariant hygiène DB : cover + photo d'étape = URLs (jamais data:)
      const medias = [bVlog.cover].concat((bVlog.steps || []).map((s) => s.photo)).filter(Boolean);
      expect(medias.length, "au moins un média uploadé (cover ou photo)").toBeGreaterThanOrEqual(1);
      expect(medias.every((u) => typeof u === "string" && u.indexOf("data:") !== 0), "aucun média base64 en DB").toBe(true);
      log("B voit le carnet · étapes=" + bVlog.steps.length + " · médias=" + JSON.stringify(medias.map((u) => (u || "").slice(0, 28))));

      // ── B : le carnet apparaît dans l'écran CDV (allCarnets) et le viewer s'ouvre ──
      const vis = await pageB.evaluate((vp) => {
        state.supabasePosts = state.supabasePosts || [];
        // Remplace toute copie (potentiellement périmée, chargée au boot) par le
        // carnet connu-bon → check déterministe, pas de dépendance au timing.
        state.supabasePosts = state.supabasePosts.filter((p) => p.id !== vp.id);
        state.supabasePosts.unshift(vp);
        const inCdv = allCarnets().some((c) => c.id === vp.id);
        let viewerOpen = false;
        try {
          openVlogViewer(vp.id);
          const vv = document.getElementById("vlogViewer");
          viewerOpen = !!(vv && vv.getAttribute("data-current-post") === vp.id);
          if (typeof closeVlogViewer === "function") closeVlogViewer();
        } catch (e) {}
        return { inCdv, viewerOpen };
      }, bVlog);
      expect(vis.inCdv, "carnet visible dans CDV chez B").toBe(true);
      expect(vis.viewerOpen, "viewer du carnet ouvrable chez B").toBe(true);
      log("✅ carnet cross-compte validé (CDV + viewer)");

      await cleanupVlog(pageA, vlogId);
      await cleanupVlog(pageB, null);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// Parcours réel : landing → Créer un compte → inscription par e-mail/mot de passe
// (l'auth ANONYME est désactivée côté Supabase — `anonymous_provider_disabled` —
// et l'app exige un vrai compte ; « Confirm email » étant OFF, signUp renvoie une
// session immédiatement) → âge → prénom → 1 passion → Entrer sur PASSIO, puis
// reload pour que boot() refasse supaInit + supaSubscribe avec la session.
// ⚠️ Crée de vrais utilisateurs e-mail jetables dans auth.users (préfixe e2e_…@
// passio-e2e.test) — non supprimables sans service_role, comme les anciens
// comptes anonymes. C'est pourquoi le test reste OPT-IN.
async function signupAnonymous(page, name) {
  const step = (m) => console.log(`[signup ${name}] ${m}`);
  await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
  // Active le mode realtime demandé (v2/v3) AVANT le boot, pour tester le scalable.
  if (RT_MODE === "v2" || RT_MODE === "v3") {
    await page.addInitScript((mode) => { try { localStorage.setItem("passio_realtime_" + mode, "1"); } catch (e) {} }, RT_MODE);
  }
  await page.goto("/index.html");
  // ⚠️ boot() est async et se termine par showLanding() : cliquer avant la fin du boot
  // déclenche une course (showLanding() ré-écrase l'onboarding en cours). On attend
  // donc que la landing soit réellement affichée avant de démarrer le parcours.
  await page.waitForSelector("#landing.active", { timeout: 20000 });
  step("landing affichée (boot terminé)");
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  step("clic Créer un compte");
  // Inscription e-mail par l'API (équivalent de onbDoAuth en mode signup) puis
  // onbNext() pour avancer l'onboarding, comme l'ancien chemin anonyme.
  await page.waitForFunction(() => typeof supa !== "undefined" && !!supa && typeof onbNext === "function", null, { timeout: 20000 });
  const email = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@passio-e2e.test`;
  await page.evaluate(async (em) => {
    try {
      const { data, error } = await supa.auth.signUp({ email: em, password: "Passio-e2e-12345!" });
      if (data && data.session) { window.MY_UID = data.session.user.id; try { localStorage.setItem("passio_uid", window.MY_UID); } catch (e) {} }
      else if (error) console.warn("signUp e2e error:", error.message);
    } catch (e) { console.warn("signUp e2e exception:", e && e.message); }
    if (typeof onbNext === "function") onbNext();
  }, email);
  step("inscription e-mail (API) — attente MY_UID…");
  await page.waitForFunction(() => !!window.MY_UID, null, { timeout: 20000 });
  step("MY_UID obtenu");
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).click();
  step("âge validé");
  await page.locator("#userName").fill(name);
  await page.getByRole("button", { name: "Continuer" }).click();
  step("prénom validé");
  await page.locator("#passionGrid .passion-tile[data-passion]").first().click();
  await page.getByRole("button", { name: "Entrer sur PASSIO" }).click();
  step("onboarding terminé");
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => !!window.MY_UID && typeof supa !== "undefined" && !!supa, null, { timeout: 20000 });
  // Laisse le temps à supaInit/supaSubscribe de s'abonner au realtime
  await page.waitForTimeout(3000);
  // La ligne profiles est créée en DIFFÉRÉ par supaInit (~10 s après le boot), or
  // conv_members.user_id a une FK vers profiles. On force l'upsert maintenant (même
  // fonction que l'app) puis on vérifie la ligne — page.evaluate attend les promesses
  // (contrairement à waitForFunction avec un callback async, qui rend une promesse
  // toujours truthy et passait avant que la ligne existe).
  const profilOk = await page.evaluate(async () => {
    try {
      await supaUpsertProfile();
      const { data } = await supa.from("profiles").select("id").eq("id", MY_UID);
      return !!(data && data.length);
    } catch (e) { return "erreur: " + e.message; }
  });
  if (profilOk !== true) throw new Error("profil Supabase absent après upsert: " + profilOk);
  step("reboot avec session + profil Supabase OK");
  return page.evaluate(() => window.MY_UID);
}

// Diagnostic réseau : la console Chrome ne donne pas l'URL d'un « Failed to load
// resource: 400 » — on logge la requête + le corps d'erreur PostgREST de toute
// réponse Supabase ≥ 400. C'est ce diagnostic qui a trouvé le bug follow
// (insert avec created_at inexistant → 400 silencieux) le 2026-07-02.
function wireHttpDiag(log, pageA, pageB) {
  for (const [who, pg] of [["A", pageA], ["B", pageB]]) {
    pg.on("response", async (resp) => {
      if (resp.status() < 400 || resp.url().indexOf("supabase.co") === -1) return;
      let body = ""; try { body = (await resp.text()).slice(0, 300); } catch (e) {}
      log(`${who} HTTP ${resp.status()} ${resp.request().method()} ${resp.url().slice(0, 160)} → ${body}`);
    });
  }
}

async function cleanup(page, convId) {
  await page.evaluate(async (id) => {
    try { await supa.from("conv_messages").delete().eq("conv_id", id); } catch (e) {}
    try { await supa.from("conv_members").delete().eq("user_id", MY_UID); } catch (e) {}
    try { await supa.from("conversations").delete().eq("id", id); } catch (e) {}
    try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }, convId);
}

// Recharge les notifications de A depuis Supabase jusqu'à en avoir au moins
// `minCount` (les supaInsertNotif côté B sont fire-and-forget → on retente).
async function loadNotifsWithRetry(page, minCount, timeoutMs) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start < timeoutMs) {
    last = await page.evaluate(() => (typeof supaLoadNotifications === "function" ? supaLoadNotifications() : []));
    if (last && last.length >= minCount) return last;
    await page.waitForTimeout(1500);
  }
  return last || [];
}

// Nettoyage du test notifications (best-effort, RLS par propriétaire).
async function cleanupNotifs(page, postId) {
  await page.evaluate(async (pid) => {
    try { await supa.from("notifications").delete().eq("user_id", MY_UID); } catch (e) {}
    try { await supa.from("notifications").delete().eq("from_id", MY_UID); } catch (e) {}
    try { await supa.from("comment_interactions").delete().eq("user_id", MY_UID); } catch (e) {}
    try { await supa.from("post_comments").delete().eq("post_id", pid); } catch (e) {}
    try { await supa.from("post_likes").delete().eq("post_id", pid); } catch (e) {}
    try { await supa.from("follows").delete().eq("follower_id", MY_UID); } catch (e) {}
    try { await supa.from("follows").delete().eq("following_id", MY_UID); } catch (e) {}
    try { await supa.from("posts").delete().eq("id", pid); } catch (e) {}
    try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }, postId);
}

// Nettoyage du test événement (best-effort, RLS par propriétaire).
async function cleanupEvent(page, eventId) {
  await page.evaluate(async (eid) => {
    try { await supa.from("notifications").delete().eq("user_id", MY_UID); } catch (e) {}
    try { await supa.from("notifications").delete().eq("from_id", MY_UID); } catch (e) {}
    try { await supa.from("event_attendees").delete().eq("event_id", eid); } catch (e) {}
    try { await supa.from("event_attendees").delete().eq("user_id", MY_UID); } catch (e) {}
    try { await supa.from("events").delete().eq("id", eid); } catch (e) {}
    try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }, eventId);
}

// Charge un tableau via window[fnName]() et y cherche un id, avec retries (les
// écritures Supabase + Storage peuvent prendre un instant à se propager).
async function loadFindWithRetry(page, fnName, id, timeoutMs) {
  const start = Date.now();
  let found = null;
  while (Date.now() - start < timeoutMs) {
    found = await page.evaluate(async ([fn, wantId]) => {
      const arr = (typeof window[fn] === "function") ? await window[fn]() : [];
      return (arr || []).find((x) => x.id === wantId) || null;
    }, [fnName, id]);
    if (found) return found;
    await page.waitForTimeout(1500);
  }
  return found;
}

// Nettoyage du test CDV Live : A supprime le Live (le cascade efface étapes /
// commentaires / réactions / followers). liveId=null côté B = juste profil+signout.
async function cleanupCdvLive(page, liveId) {
  await page.evaluate(async (id) => {
    if (id) { try { await supa.from("cdv_lives").delete().eq("id", id); } catch (e) {} }
    try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }, liveId);
}

// Nettoyage du test carnet (best-effort, RLS par propriétaire).
// vlogId=null côté B = juste profil + signout.
async function cleanupVlog(page, vlogId) {
  await page.evaluate(async (id) => {
    if (id) {
      try { await supa.from("comment_interactions").delete().eq("post_id", id); } catch (e) {}
      try { await supa.from("post_comments").delete().eq("post_id", id); } catch (e) {}
      try { await supa.from("post_likes").delete().eq("post_id", id); } catch (e) {}
      try { await supa.from("posts").delete().eq("id", id); } catch (e) {}
    }
    try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }, vlogId);
}

// Nettoyage du test story+bobine (best-effort, RLS par propriétaire).
async function cleanupMedia(page, storyId, reelId) {
  await page.evaluate(async ([sid, rid]) => {
    try { await supa.from("stories").delete().eq("id", sid); } catch (e) {}
    try { await supa.from("post_comments").delete().eq("post_id", rid); } catch (e) {}
    try { await supa.from("post_likes").delete().eq("post_id", rid); } catch (e) {}
    try { await supa.from("posts").delete().eq("id", rid); } catch (e) {}
    try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }, [storyId, reelId]);
}
