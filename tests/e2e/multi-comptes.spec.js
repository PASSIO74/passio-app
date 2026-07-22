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
      // ⚠️ Depuis le 2026-07-07 : un GIF est posté comme un COMMENTAIRE (texte =
      // URL, rendu en image), JAMAIS comme une réaction de la pastille. Seuls les
      // emojis comptent dans les réactions. Le test suit ce comportement.
      const GIF_URL = "https://media.tenor.com/e2e-test/passio.gif";
      await pageB.evaluate(([pid, gif]) => { addEmojiToPost(pid, "😍"); addGifToPost(pid, gif); }, [postId, GIF_URL]);
      log("B a réagi 😍 + posté un GIF (commentaire) sur le post");

      // ── A voit la réaction 😍 (comment_interactions) ET le commentaire GIF
      //    (post_comments) SANS recharger — les deux via le canal realtime:db ──
      await pageA.waitForFunction(
        ([pid, buid, gif]) => {
          const p = findPostAnywhere(pid);
          const rx = (p && p.reactions) || [];
          const cs = (p && p.comments) || [];
          return rx.some((x) => x.type === "emoji_reaction" && x.text === "😍" && x.authorId === buid)
              && cs.some((c) => c.authorId === buid && ((c.text || c.content || "").indexOf(gif) !== -1));
        },
        [postId, uidB, GIF_URL], { timeout: 20000 }
      );
      // Pastille : 1 seule réaction comptée (l'emoji — le GIF est un commentaire).
      const chipA = await pageA.evaluate((pid) => _postReactChipHtml(pid), postId);
      expect(chipA, "pastille de réactions rendue chez A").toContain("cmt-react-chip");
      expect(chipA, "pastille : 1 réaction emoji comptée chez A").toContain("<b>1</b>");
      log("✅ realtime OK : A voit la réaction 😍 + le commentaire GIF sans recharger");

      // ── Persistance : un fil (re)chargé depuis Supabase porte la réaction
      //    (supaLoadPosts mappe comment_interactions où comment_id === post_id)
      //    et le commentaire GIF (post_comments) ──
      const loadedPost = await loadFindWithRetry(pageA, "supaLoadPosts", postId, 20000);
      expect(loadedPost, "post rechargé depuis Supabase").toBeTruthy();
      const loadedRx = loadedPost.reactions || [];
      expect(loadedRx.some((x) => x.type === "emoji_reaction" && x.text === "😍" && x.authorId === uidB),
        "réaction 😍 persistée et chargée par supaLoadPosts").toBe(true);
      expect((loadedPost.comments || []).some((c) => c.authorId === uidB && ((c.text || c.content || "").indexOf(GIF_URL) !== -1)),
        "commentaire GIF persisté et chargé par supaLoadPosts").toBe(true);
      log("✅ réaction + commentaire GIF persistés (chargés par supaLoadPosts)");

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

  // IRL v2 (2026-07-21) : RSVP 3 états, liste d'attente et co-organisateurs
  // reposent sur DEUX policies RLS ajoutées le même jour — event_attendees
  // UPDATE (« Maj de sa propre participation ») et events UPDATE (« Update
  // organisateurs », auteur OU co-organisateur). Une policy manquante ne lève
  // AUCUNE erreur : l'UPDATE touche 0 ligne en silence, exactement le piège qui
  // avait bloqué la correction d'étape CDV. Seul un test à 2 vrais comptes le voit.
  test("RSVP, liste d'attente et co-organisateur → cross-compte réel", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[irlv2 ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

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
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy();
      log("A=" + uidA + " B=" + uidB);

      // ── A publie un événement d'UNE seule place (pour tester la file) ──
      eventId = await pageA.evaluate(async () => {
        const id = "evt_" + uid();
        const ok = await supaPublishEvent({
          id, title: "Atelier complet", passion: "musique", city: "Paris",
          emoji: "🎸", date: Date.now() + 86400000, maxAttendees: 1,
        });
        if (!ok) return null;
        await supaJoinEvent(id); // l'organisateur occupe l'unique place
        return id;
      });
      expect(eventId, "événement de A publié").toBeTruthy();
      log("événement publié (1 place, prise par A): " + eventId);

      // ── B le charge et tente de venir : doit basculer en liste d'attente ──
      await pageB.evaluate(([eid, aid]) => {
        state.seed.events = state.seed.events || [];
        state.seed.events.unshift({
          id: eid, authorId: aid, organizerId: aid, title: "Atelier complet",
          passion: "musique", city: "Paris", emoji: "🎸", maxAttendees: 1,
          date: Date.now() + 86400000, attendees: [aid], maybes: [], waitlist: [],
          coOrganizers: [], fromSupabase: true,
        });
      }, [eventId, uidA]);
      await pageB.evaluate((eid) => setEventRsvp(eid, "going"), eventId);
      await pageB.waitForTimeout(2500);

      const rsvpB = await pageB.evaluate((eid) => myRsvp(eid), eventId);
      expect(rsvpB, "B bascule en liste d'attente sur un événement complet").toBe("waitlist");
      log("B est en liste d'attente");

      // ── La ligne serveur porte bien rsvp='waitlist' (policy INSERT + colonne) ──
      const rowB = await pageB.evaluate(async (eid) => {
        const { data } = await supa.from("event_attendees")
          .select("rsvp").eq("event_id", eid).eq("user_id", MY_UID).maybeSingle();
        return data;
      }, eventId);
      expect(rowB && rowB.rsvp, "rsvp persisté côté serveur").toBe("waitlist");

      // ── B change d'avis en « peut-être » : c'est un UPDATE, donc la policy
      //    « Maj de sa propre participation ». Sans elle : 0 ligne, en silence.
      await pageB.evaluate((eid) => setEventRsvp(eid, "maybe"), eventId);
      await pageB.waitForTimeout(2000);
      const rowB2 = await pageB.evaluate(async (eid) => {
        const { data } = await supa.from("event_attendees")
          .select("rsvp").eq("event_id", eid).eq("user_id", MY_UID).maybeSingle();
        return data;
      }, eventId);
      expect(rowB2 && rowB2.rsvp, "changement de RSVP persisté (policy UPDATE)").toBe("maybe");
      log("B est passé en « peut-être » — policy UPDATE event_attendees OK");

      // ── A voit B parmi les « peut-être », et PAS dans les inscrits fermes ──
      const seenByA = await pageA.evaluate(async (eid) => {
        const evs = await supaLoadEvents();
        const e = evs.find((x) => x.id === eid);
        return e ? { attendees: e.attendees, maybes: e.maybes, waitlist: e.waitlist } : null;
      }, eventId);
      log("vu par A: " + JSON.stringify(seenByA));
      expect(seenByA, "événement rechargé par A").toBeTruthy();
      expect(seenByA.maybes, "B compté comme « peut-être »").toContain(uidB);
      expect(seenByA.attendees, "B n'occupe PAS une place").not.toContain(uidB);

      // ── A nomme B co-organisateur (UPDATE events par l'auteur) ──
      const promoted = await pageA.evaluate(async ([eid, bid]) => {
        const ev = { id: eid, title: "Atelier complet", passion: "musique", city: "Paris",
          emoji: "🎸", date: Date.now() + 86400000, maxAttendees: 1, coOrganizers: [bid] };
        return await supaUpdateEvent(ev);
      }, [eventId, uidB]);
      expect(promoted, "A nomme B co-organisateur").toBe(true);
      log("B est co-organisateur");

      // ── B modifie l'événement : c'est LE cas que la nouvelle policy autorise
      //    (auteur OU co-organisateur). Avec l'ancienne, l'UPDATE passait à 0 ligne.
      const editedByCo = await pageB.evaluate(async (eid) => {
        const ev = { id: eid, title: "Titre corrigé par le co-orga", passion: "musique",
          city: "Paris", emoji: "🎸", date: Date.now() + 86400000, maxAttendees: 1 };
        // supaUpdateEvent filtre sur author_id = moi : le co-organisateur doit
        // écrire directement (c'est la policy qui l'autorise, pas la colonne).
        const { error } = await supa.from("events").update({ title: ev.title }).eq("id", eid);
        if (error) return "ERREUR: " + error.message;
        const { data } = await supa.from("events").select("title").eq("id", eid).maybeSingle();
        return data ? data.title : null;
      }, eventId);
      expect(editedByCo, "un co-organisateur peut modifier l'événement").toBe("Titre corrigé par le co-orga");
      log("✅ co-organisateur : édition autorisée (policy « Update organisateurs »)");

      // ── Contre-épreuve : B ne doit PAS pouvoir modifier le RSVP de A ──
      const stolen = await pageB.evaluate(async ([eid, aid]) => {
        await supa.from("event_attendees").update({ rsvp: "declined" })
          .eq("event_id", eid).eq("user_id", aid);
        const { data } = await supa.from("event_attendees")
          .select("rsvp").eq("event_id", eid).eq("user_id", aid).maybeSingle();
        return data ? data.rsvp : null;
      }, [eventId, uidA]);
      expect(stolen, "B ne peut PAS changer le RSVP de A").toBe("going");
      log("✅ isolation des RSVP confirmée");

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

  // ═══════════════════════════════════════════════════════════════════════════
  // CDV v2 — ce test est la SEULE preuve possible des règles RLS ajoutées le
  // 2026-07-21. Tout le reste de la suite CDV tourne avec Supabase neutralisé :
  // les policies suivantes n'ont jamais été exercées avec une vraie session.
  //   · cdv_live_collaborators : INSERT gardé par un EXISTS sur cdv_lives
  //   · cdv_live_steps         : policy UPDATE (elle n'existait pas du tout)
  //   · cdv_live_steps.lat/lng : colonnes ajoutées, aller-retour à vérifier
  //   · post_collaborators + can_edit_post : co-écriture d'un carnet
  // Précédent : un live « fantôme » (jamais publié côté serveur) était invisible
  // en local et n'a été trouvé que par une exécution à deux comptes.
  // ═══════════════════════════════════════════════════════════════════════════
  test("CDV v2 : co-voyageur, édition d'étape, coordonnées et carnet co-écrit", async ({ browser }) => {
    test.setTimeout(240000);
    const t0 = Date.now();
    const log = (m) => console.log(`[cdv2 ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (m) => { if (m.type() === "error") log("A err: " + m.text().slice(0, 160)); });
    pageB.on("console", (m) => { if (m.type() === "error") log("B err: " + m.text().slice(0, 160)); });

    let liveId = null, vlogId = null;
    try {
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy(); expect(uidA).not.toBe(uidB);
      log("A=" + uidA + " B=" + uidB);

      // ── 1. A démarre un voyage et publie une étape GÉOLOCALISÉE ──
      liveId = await pageA.evaluate(async () => {
        const id = "live_" + uid();
        await supaPublishCdvLive({ id, authorId: "me", destination: "CDV v2 auto",
          description: "e2e", duration: "weekend", visibility: "public", status: "live" });
        await supaAddCdvLiveStep(id, { id: "ls_" + uid(), city: "Lisbonne", emoji: "📍",
          content: "étape A", photos: [], rating: 4, budget: "€€", lat: 38.7223, lng: -9.1393 });
        return id;
      });
      expect(liveId, "live de A publié").toBeTruthy();

      // Les colonnes lat/lng doivent revenir du serveur (migration_cdv_v2).
      const aLive = await loadFindWithRetry(pageA, "supaLoadCdvLives", liveId, 20000);
      expect(aLive, "A recharge son live").toBeTruthy();
      expect(aLive.steps.length, "1 étape").toBe(1);
      expect(aLive.steps[0].lat, "latitude persistée en base").toBeCloseTo(38.7223, 3);
      expect(aLive.steps[0].lng, "longitude persistée en base").toBeCloseTo(-9.1393, 3);
      log("✅ coordonnées d'étape persistées (colonnes lat/lng)");

      // ── 2. A modifie SON étape : la policy UPDATE n'existait pas avant ──
      const stepId = aLive.steps[0].id;
      const edited = await pageA.evaluate(async ([lid, sid]) => {
        await supaUpdateCdvLiveStep(lid, { id: sid, city: "Lisbonne (corrigé)", emoji: "📍",
          content: "étape A corrigée", photos: [], rating: 5, budget: "€€€", lat: 38.7, lng: -9.1 });
        const { data } = await supa.from("cdv_live_steps").select("city, rating").eq("id", sid).maybeSingle();
        return data;
      }, [liveId, stepId]);
      expect(edited, "étape relue").toBeTruthy();
      expect(edited.city, "correction d'étape écrite en base").toBe("Lisbonne (corrigé)");
      expect(edited.rating).toBe(5);
      log("✅ édition d'étape autorisée (policy cdv_steps_update_own)");

      // ── 3. Contre-épreuve : B (non invité) ne doit PAS pouvoir la modifier ──
      const hijack = await pageB.evaluate(async (sid) => {
        await supa.from("cdv_live_steps").update({ city: "PIRATE" }).eq("id", sid);
        const { data } = await supa.from("cdv_live_steps").select("city").eq("id", sid).maybeSingle();
        return data ? data.city : null;
      }, stepId);
      expect(hijack, "B ne peut pas modifier l'étape de A").toBe("Lisbonne (corrigé)");
      log("✅ isolation des étapes confirmée");

      // ── 4. A invite B comme co-voyageur (policy avec EXISTS sur cdv_lives) ──
      const invited = await pageA.evaluate(async ([lid, bid]) => {
        const ok = await supaAddCdvCollaborator(lid, bid);
        const { data } = await supa.from("cdv_live_collaborators").select("user_id").eq("live_id", lid);
        return { ok, rows: (data || []).map((r) => r.user_id) };
      }, [liveId, uidB]);
      expect(invited.ok, "invitation acceptée par la RLS").toBe(true);
      expect(invited.rows, "B enregistré comme co-voyageur").toContain(uidB);
      log("✅ co-voyageur inscrit en base");

      // ── 5. B publie SA propre étape sur le voyage de A ──
      const bStep = await pageB.evaluate(async (lid) => {
        const sid = "ls_" + uid();
        await supaAddCdvLiveStep(lid, { id: sid, city: "Porto", emoji: "🍽",
          content: "étape du co-voyageur", photos: [], rating: 4, budget: "€", lat: 41.15, lng: -8.62 });
        const { data } = await supa.from("cdv_live_steps").select("id, author_id, city").eq("id", sid).maybeSingle();
        return data;
      }, liveId);
      expect(bStep, "étape de B écrite").toBeTruthy();
      expect(bStep.author_id, "l'étape est signée par B").toBe(uidB);
      expect(bStep.city).toBe("Porto");
      log("✅ un co-voyageur publie sur le voyage d'un autre");

      // Le voyage de A contient bien les deux étapes, des deux auteurs.
      const merged = await loadFindWithRetry(pageA, "supaLoadCdvLives", liveId, 20000);
      expect(merged.steps.length, "2 étapes, 2 auteurs").toBe(2);
      expect(merged.collaborators, "co-voyageur renvoyé par le loader").toContain(uidB);

      // ── 6. B ne doit PAS pouvoir supprimer l'étape de A ──
      const delAttempt = await pageB.evaluate(async (sid) => {
        await supa.from("cdv_live_steps").delete().eq("id", sid);
        const { data } = await supa.from("cdv_live_steps").select("id").eq("id", sid).maybeSingle();
        return !!data;
      }, stepId);
      expect(delAttempt, "l'étape de A survit à la tentative de B").toBe(true);
      log("✅ un co-voyageur ne peut pas effacer les étapes des autres");

      // ── 7. CARNET CO-ÉCRIT : A publie, invite B, B modifie ──
      vlogId = await pageA.evaluate(async () => {
        const id = "p_" + uid();
        const post = { id, authorId: MY_UID, type: "vlog", text: "Carnet co-écrit [test auto]",
          destination: "Carnet co-écrit", dateStart: null, dateEnd: null, cover: null,
          budget: "500", transport: "train", lodging: "auberge", season: "été",
          tip: "conseil", createdAt: Date.now(), passion: null, mood: "chill",
          steps: [{ place: "Cusco", text: "arrivée", tip: "", photo: null, lat: -13.53, lng: -71.97 }] };
        const ok = await supaPublishPostWithRetry(post);
        return ok ? id : null;
      });
      expect(vlogId, "carnet de A publié").toBeTruthy();

      const collabOk = await pageA.evaluate(async ([pid, bid]) => {
        return await supaAddCarnetCollaborator(pid, bid);
      }, [vlogId, uidB]);
      expect(collabOk, "B invité comme co-auteur du carnet").toBe(true);

      // B modifie le carnet de A : c'est can_edit_post() qui l'autorise.
      const coEdit = await pageB.evaluate(async (pid) => {
        const { error } = await supa.from("posts").update({ content: "réécrit par le co-auteur" }).eq("id", pid);
        if (error) return "ERREUR: " + error.message;
        const { data } = await supa.from("posts").select("content, author_id").eq("id", pid).maybeSingle();
        return data;
      }, vlogId);
      expect(typeof coEdit, "pas d'erreur RLS à l'écriture du co-auteur").toBe("object");
      expect(coEdit.content, "le co-auteur a bien écrit").toBe("réécrit par le co-auteur");
      expect(coEdit.author_id, "la propriété du carnet n'a pas changé").toBe(uidA);
      log("✅ carnet co-écrit (policy can_edit_post)");

      // ── 8. Le trigger doit empêcher B de s'approprier le carnet ──
      const steal = await pageB.evaluate(async ([pid, bid]) => {
        await supa.from("posts").update({ author_id: bid }).eq("id", pid);
        const { data } = await supa.from("posts").select("author_id").eq("id", pid).maybeSingle();
        return data ? data.author_id : null;
      }, [vlogId, uidB]);
      expect(steal, "author_id reste celui de A (trigger posts_freeze_author)").toBe(uidA);
      log("✅ propriété du carnet immuable");

      // ── 9. Un ÉTRANGER au carnet ne doit pas pouvoir l'écrire ──
      const strangerEdit = await pageB.evaluate(async (pid) => {
        // B se retire lui-même de la co-écriture, puis retente.
        await supa.from("post_collaborators").delete().eq("post_id", pid).eq("user_id", MY_UID);
        await supa.from("posts").update({ content: "PIRATE" }).eq("id", pid);
        const { data } = await supa.from("posts").select("content").eq("id", pid).maybeSingle();
        return data ? data.content : null;
      }, vlogId);
      expect(strangerEdit, "sans invitation, plus d'écriture possible").toBe("réécrit par le co-auteur");
      log("✅ retrait d'un co-auteur : droit d'écriture révoqué");

      // ── Nettoyage ──
      await pageA.evaluate(async ([lid, pid]) => {
        try { await supa.from("cdv_live_collaborators").delete().eq("live_id", lid); } catch (e) {}
        try { await supa.from("cdv_live_steps").delete().eq("live_id", lid); } catch (e) {}
        try { await supa.from("cdv_lives").delete().eq("id", lid); } catch (e) {}
        try { await supa.from("post_collaborators").delete().eq("post_id", pid); } catch (e) {}
        try { await supa.from("posts").delete().eq("id", pid); } catch (e) {}
      }, [liveId, vlogId]);
      log("nettoyage effectué");
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // Interactions réparées le 2026-07-22 : like d'un COMMENTAIRE et like/réaction
  // d'un ÉVÉNEMENT. Les tests locaux (interactions.spec.js) prouvent le rendu ;
  // eux seuls ne peuvent PAS prouver que l'écriture passe la RLS ni que l'autre
  // compte la voit — c'est l'objet de ce test. Il couvre aussi la règle « UNE
  // réaction emoji par personne » côté SERVEUR (remplacement = delete + insert) :
  // en local elle n'est vérifiée que sur l'agrégat en mémoire.
  test("like d'un commentaire et like/réaction d'un événement → cross-compte réel", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[inter ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (msg) => { if (msg.type() === "error") log("A console.error: " + msg.text().slice(0, 200)); });
    pageB.on("console", (msg) => { if (msg.type() === "error") log("B console.error: " + msg.text().slice(0, 200)); });
    wireHttpDiag(log, pageA, pageB);

    let postId = null, eventId = null;
    try {
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA).toBeTruthy(); expect(uidB).toBeTruthy(); expect(uidA).not.toBe(uidB);
      log("A=" + uidA + " B=" + uidB);

      // ── 1. A publie un post ET y laisse un commentaire ──────────────────────
      postId = await pageA.evaluate(async () => {
        const id = "post_" + uid();
        const { error } = await supa.from("posts").insert([{
          id, author_id: MY_UID, passion_id: "musique", mood: "all",
          content: "Post de Alice [test interactions auto]", media_url: null,
          created_at: new Date().toISOString(),
        }]);
        return error ? null : id;
      });
      expect(postId, "post de A inséré").toBeTruthy();

      const commentId = await pageA.evaluate(async (pid) => {
        const cid = "c_" + uid();
        const ok = await supaAddComment(pid, "Commentaire d'Alice [test auto]", cid);
        return ok ? cid : null;
      }, postId);
      expect(commentId, "commentaire d'A inséré").toBeTruthy();
      log("post + commentaire d'A: " + postId + " / " + commentId);

      // ── 2. B like le COMMENTAIRE d'A via le vrai handler ────────────────────
      // likeComment → supaCommentInteract(kind:"like"). Si la RLS refusait
      // l'insert, l'UI locale de B afficherait quand même ❤️ (optimiste) : seul
      // un second compte peut révéler que rien n'a été écrit.
      await pageB.evaluate(([pid, aid, cid]) => {
        state.supabasePosts = state.supabasePosts || [];
        state.supabasePosts.unshift({
          id: pid, authorId: aid, authorName: "Test Alice", authorEmoji: "✨",
          authorColor: "#8b5cf6", passion: "musique", mood: "all", type: "text",
          text: "Post de Alice [test interactions auto]", image: null,
          createdAt: Date.now(), likes: 0, liked: false, fromSupabase: true,
          comments: [{ id: cid, authorId: aid, authorName: "Test Alice", text: "Commentaire d'Alice [test auto]", createdAt: Date.now(), fromSupabase: true, likes: 0, likedBy: [], replies: [] }],
        });
      }, [postId, uidA, commentId]);

      await pageB.evaluate(([pid, cid]) => likeComment(pid, cid, null), [postId, commentId]);
      log("B a liké le commentaire d'A");

      // A recharge les interactions : le like doit être EN BASE et attribué à B.
      // supaLoadCommentInteractions renvoie un AGRÉGAT par commentaire
      // ({ likes, likedBy[], replies[] }), pas les lignes brutes.
      const cmtAgg = await (async () => {
        const start = Date.now();
        while (Date.now() - start < 20000) {
          const d = await pageA.evaluate(async (cid) => {
            const m = await supaLoadCommentInteractions([cid]);
            return (m && m[cid]) ? m[cid] : null;
          }, commentId);
          if (d && d.likes) return d;
          await pageA.waitForTimeout(1500);
        }
        return null;
      })();
      expect(cmtAgg, "interactions du commentaire lisibles par A").toBeTruthy();
      expect(cmtAgg.likes, "le like de commentaire est écrit en base (RLS OK)").toBeGreaterThanOrEqual(1);
      expect(cmtAgg.likedBy, "le like est attribué à B").toContain(uidB);
      log("✅ like de commentaire visible par A (likes=" + cmtAgg.likes + ")");

      // Et A le voit remonter dans SON modèle via l'hydratation normale.
      const hydrated = await pageA.evaluate(async ([pid, aid, cid]) => {
        const post = {
          id: pid, authorId: aid, fromSupabase: true,
          comments: [{ id: cid, authorId: aid, text: "Commentaire d'Alice [test auto]", createdAt: Date.now(), likes: 0, likedBy: [], replies: [] }],
        };
        await hydrateCommentInteractions(post);
        return post.comments[0].likes || 0;
      }, [postId, uidA, commentId]);
      expect(hydrated, "hydrateCommentInteractions remonte le like de B chez A").toBeGreaterThanOrEqual(1);
      log("✅ compteur de like du commentaire hydraté chez A: " + hydrated);

      // ── 3. A crée un événement, B le like puis y réagit ─────────────────────
      // Insert direct (même schéma que le test « rejoindre l'événement d'un
      // autre ») : supaPublishEvent applique des règles de formulaire qui ne nous
      // intéressent pas ici — on veut seulement une ligne events valide à liker.
      eventId = await pageA.evaluate(async () => {
        const id = "evt_" + uid();
        const { error } = await supa.from("events").insert({
          id, author_id: MY_UID, organizer_id: MY_UID, title: "Event Alice [test auto]",
          passion_id: "musique", city: "Annecy", emoji: "🎸",
          date_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date().toISOString(),
        });
        return error ? null : id;
      });
      expect(eventId, "événement d'A publié").toBeTruthy();
      log("événement d'A: " + eventId);

      // B like l'événement (toggleEventLike → supaToggleEventLike/event_reactions).
      await pageB.evaluate((eid) => toggleEventLike(eid, null), eventId);
      // Puis B réagit 🔥, PUIS remplace par 🎉 : côté serveur il ne doit rester
      // qu'UNE réaction non-❤️ de B (l'ancienne doit avoir été supprimée).
      await pageB.evaluate((eid) => _setEventReaction(eid, "🔥"), eventId);
      await pageB.waitForTimeout(800);
      await pageB.evaluate((eid) => _setEventReaction(eid, "🎉"), eventId);
      await pageB.waitForTimeout(1500);
      log("B a liké + réagi 🔥 puis 🎉 sur l'événement d'A");

      // A relit les réactions depuis Supabase.
      const evAgg = await (async () => {
        const start = Date.now();
        while (Date.now() - start < 20000) {
          const d = await pageA.evaluate(async (eid) => {
            const r = await supaLoadEventReactions([eid]);
            return (r && r[eid]) ? r[eid] : null;
          }, eventId);
          if (d && d.likes) return d;
          await pageA.waitForTimeout(1500);
        }
        return null;
      })();
      expect(evAgg, "réactions de l'événement lisibles par A").toBeTruthy();
      expect(evAgg.likes, "le ❤️ de B est compté chez A").toBeGreaterThanOrEqual(1);
      log("✅ like d'événement cross-compte: " + JSON.stringify(evAgg.emojiCounts || {}));

      // Détail par utilisateur : B ne doit avoir QUE ❤️ (le like) + 🎉, jamais 🔥.
      const detail = await pageA.evaluate(async (eid) => await supaLoadEventReactionDetail(eid), eventId);
      const fromB = (detail || []).filter((r) => r.userId === uidB).map((r) => r.emoji).sort();
      expect(fromB, "B n'a laissé qu'une réaction emoji, la dernière (🎉)").toEqual(expect.arrayContaining(["🎉"]));
      expect(fromB.includes("🔥"), "la réaction 🔥 remplacée a bien été SUPPRIMÉE en base").toBe(false);
      log("✅ règle « 1 réaction par personne » vérifiée en base: " + JSON.stringify(fromB));

      // ── 4. Nettoyage ───────────────────────────────────────────────────────
      // B d'abord (ses lignes référencent le post/l'événement d'A), puis A.
      // ⚠️ ORDRE : A porte ICI un post ET un événement. Les helpers existants
      // (cleanupEvent / cleanupNotifs) terminent chacun par la suppression du
      // profil + signOut — enchaîner les deux laissait le post d'A orphelin (la
      // 2e passe s'exécutait déconnectée, donc bloquée par la RLS) et le DELETE
      // du profil échouait en 409 (FK posts_author_id_fkey). On fait donc UNE
      // seule passe, tout supprimer avant le profil.
      await pageB.evaluate(async (eid) => {
        try { await supa.from("event_reactions").delete().eq("user_id", MY_UID); } catch (e) {}
        try { await supa.from("comment_interactions").delete().eq("user_id", MY_UID); } catch (e) {}
        try { await supa.from("event_attendees").delete().eq("user_id", MY_UID); } catch (e) {}
        try { await supa.from("notifications").delete().eq("from_id", MY_UID); } catch (e) {}
        try { await supa.from("notifications").delete().eq("user_id", MY_UID); } catch (e) {}
        try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
        try { await supa.auth.signOut(); } catch (e) {}
      }, eventId);
      await pageA.evaluate(async ([pid, eid]) => {
        try { await supa.from("notifications").delete().eq("user_id", MY_UID); } catch (e) {}
        try { await supa.from("notifications").delete().eq("from_id", MY_UID); } catch (e) {}
        try { await supa.from("comment_interactions").delete().eq("comment_id", pid); } catch (e) {}
        try { await supa.from("comment_interactions").delete().eq("user_id", MY_UID); } catch (e) {}
        try { await supa.from("event_reactions").delete().eq("event_id", eid); } catch (e) {}
        try { await supa.from("event_attendees").delete().eq("event_id", eid); } catch (e) {}
        try { await supa.from("events").delete().eq("id", eid); } catch (e) {}
        try { await supa.from("post_comments").delete().eq("post_id", pid); } catch (e) {}
        try { await supa.from("post_likes").delete().eq("post_id", pid); } catch (e) {}
        try { await supa.from("posts").delete().eq("id", pid); } catch (e) {}
        try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
        try { await supa.auth.signOut(); } catch (e) {}
      }, [postId, eventId]);
      log("nettoyage effectué");
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
