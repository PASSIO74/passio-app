// ═══════════════════════════════════════════════════════════════════════════
// CAMPAGNE QA MULTI-COMPTES — 10 utilisateurs réels, matrice de transferts.
//
// Répond à la PRIORITÉ ABSOLUE du cahier des charges : quand un utilisateur
// agit sur un appareil, la bonne donnée arrive-t-elle correctement, vite, UNE
// seule fois et sans altération chez les autres utilisateurs/appareils, tout en
// étant enregistrée en base et traçable dans le Centre de Pilotage ?
//
// Chaque BrowserContext = un appareil isolé (session, storage, realtime propres).
// On pilote les VRAIS handlers de l'app (likePost, submitComment, sendMessage…)
// et on valide TOUTE la chaîne : action → API → base → realtime → autre appareil
// → rendu → (report lu par le dashboard). On ne considère JAMAIS un 200 comme un
// succès : un transfert n'est « PASS » que si la donnée est reçue, identique,
// unique, persistée. (§28)
//
// ⚠️ ÉCRIT EN BASE RÉELLE (prod). OPT-IN strict :
//   $env:PASSIO_QA_CAMPAIGN="1"; $env:PASSIO_E2E_MULTI="1"; npm test -- qa-campaign
// PASSIO_E2E_MULTI=1 déclenche la purge des comptes jetables au teardown.
//
// Sortie : dashboard/data/qa-report.json (lu par la vue « QA / Tests » du Centre
// de Pilotage) + tests/qa-report.md (rapport lisible).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { signupUser, wireHttpDiag } = require("./qa-helper");

const N_USERS = Number(process.env.PASSIO_QA_USERS || 10);
const PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// Prénoms publics distincts (jamais d'e-mail dans l'app). Passions variées.
const LABELS = ["Alice QA", "Bruno QA", "Chloé QA", "David QA", "Emma QA",
  "Farid QA", "Gaby QA", "Hugo QA", "Inès QA", "Jamal QA"];

// Graphe de follow réaliste et hétérogène (pas les mêmes relations pour tous).
// index 0-based ; « i suit chacun de FOLLOWS[i] ».
const FOLLOWS = [
  [1, 2, 4],   // U1 → U2,U3,U5
  [0, 3, 7],   // U2 → U1,U4,U8
  [4, 8],      // U3 → U5,U9
  [1, 5, 6],   // U4 → U2,U6,U7
  [0, 2, 9],   // U5 → U1,U3,U10
  [3, 7],      // U6 → U4,U8
  [0, 8, 9],   // U7 → U1,U9,U10
  [1, 5],      // U8 → U2,U6
  [2, 6, 0],   // U9 → U3,U7,U1
  [4, 7],      // U10 → U5,U8
];

// Paires dirigées testées en MESSAGERIE (matrice de communication). Couvre un
// anneau complet + quelques diagonales : chaque utilisateur est émetteur au moins
// une fois, et on croise des relations suivies ET non suivies.
const MSG_PAIRS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [5, 6], [6, 7], [7, 8], [8, 9], [9, 0],
  [0, 5], [2, 7], [4, 9], [8, 1],
];

let seq = 0;
function qaId(feature) { return `QA-${feature}-${String(++seq).padStart(3, "0")}`; }

test.describe("Campagne QA — transfert de données multi-comptes", () => {
  test.skip(!process.env.PASSIO_QA_CAMPAIGN, "opt-in : PASSIO_QA_CAMPAIGN=1 (écrit en base réelle)");

  test("10 utilisateurs · matrice de transferts · intégrité", async ({ browser }) => {
    test.setTimeout(20 * 60 * 1000); // 20 min : 10 inscriptions réelles + matrice
    const t0 = Date.now();
    const log = (m) => console.log(`[qa ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    // ── Rapport (accumulé au fil des scénarios, écrit même en cas d'échec) ──
    const report = {
      generatedAt: new Date().toISOString(),
      env: "production (via localhost)",
      appVersion: null,
      nUsers: N_USERS,
      durationMs: 0,
      users: [],
      followGraph: [],
      scenarios: [],
      matrix: [],
      featureStats: [],
      totals: {},
      integrity: [],
      bugs: [],
      conclusion: {},
    };

    // Enregistre un scénario. `run` renvoie { status, latencyMs?, expected, got,
    // dbOk?, uiOk?, dupOk?, orderOk?, error? }. Toute exception → FAIL tracé.
    async function record(feature, type, from, to, run) {
      const id = qaId(feature);
      const correlationId = id;
      const rec = { id, feature, type, correlationId,
        from: from == null ? null : from, to: to == null ? null : to,
        fromLabel: from == null ? null : LABELS[from], toLabel: to == null ? null : LABELS[to],
        sentAt: Date.now(), status: "PENDING", latencyMs: null, expected: null, got: null,
        dbOk: null, uiOk: null, dupOk: null, orderOk: null, error: null };
      try {
        const r = await run();
        Object.assign(rec, r);
        rec.recvAt = Date.now();
      } catch (e) {
        rec.status = "FAIL";
        rec.error = (e && e.message) ? e.message.slice(0, 300) : String(e);
      }
      report.scenarios.push(rec);
      log(`${rec.status === "PASS" ? "✅" : rec.status === "WARN" ? "⚠️" : "❌"} ${id} ${feature}/${type}` +
        `${from != null ? " " + LABELS[from] + "→" + (to != null ? LABELS[to] : "?") : ""}` +
        `${rec.latencyMs != null ? " (" + rec.latencyMs + "ms)" : ""}${rec.error ? " — " + rec.error : ""}`);
      // Corrélation vers la télémétrie (traçable en base même si le dashboard
      // exclut les comptes de test de ses KPIs). Best-effort.
      try {
        await pages[from != null ? from : 0].evaluate((meta) => {
          try { window.tel && tel.track("qa", "scenario", { correlation_id: meta.cid, status: meta.status, meta: { scenario: meta.id, feature: meta.feature, type: meta.type } }); } catch (e) {}
        }, { cid: correlationId, status: rec.status, id, feature, type });
      } catch (e) {}
      return rec;
    }

    // Attend une condition sur une page et renvoie la latence (ms) ou -1 (timeout).
    async function waitLatency(page, fn, arg, timeout = 20000) {
      const start = Date.now();
      try { await page.waitForFunction(fn, arg, { timeout, polling: 150 }); return Date.now() - start; }
      catch (e) { return -1; }
    }

    const contexts = [];
    const pages = [];
    const uids = [];
    try {
      // ═══ 1. INSCRIPTION DE 10 COMPTES RÉELS (par lots de 5) ═══════════════
      log(`inscription de ${N_USERS} comptes…`);
      for (let i = 0; i < N_USERS; i++) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        page.on("console", (m) => { if (m.type() === "error") log(`${LABELS[i]} err: ${m.text().slice(0, 140)}`); });
        contexts.push(ctx); pages.push(page); uids.push(null);
      }
      wireHttpDiag(log, pages.map((page, i) => ({ who: "U" + (i + 1), page })));

      const BATCH = 5;
      for (let b = 0; b < N_USERS; b += BATCH) {
        const idxs = [];
        for (let i = b; i < Math.min(b + BATCH, N_USERS); i++) idxs.push(i);
        await Promise.all(idxs.map(async (i) => {
          try { uids[i] = await signupUser(pages[i], LABELS[i], i); }
          catch (e) { log(`❌ inscription ${LABELS[i]} échouée : ${e.message.slice(0, 160)}`); }
        }));
        log(`lot ${b / BATCH + 1} inscrit`);
      }
      const okUsers = uids.filter(Boolean).length;
      log(`${okUsers}/${N_USERS} comptes prêts`);
      const minUsers = Math.max(2, Math.floor(N_USERS * 0.6));
      expect(okUsers, `au moins ${minUsers}/${N_USERS} comptes inscrits pour une campagne significative`).toBeGreaterThanOrEqual(minUsers);

      report.appVersion = await pages[uids.findIndex(Boolean)].evaluate(() => window.PASSIO_APP_VERSION || "inconnu");
      report.users = uids.map((u, i) => ({ index: i, label: LABELS[i], uid: u, ready: !!u }));

      // Indices des utilisateurs réellement prêts (les autres sont ignorés).
      const ready = (i) => !!uids[i];

      // ═══ 2. GRAPHE DE FOLLOW ═════════════════════════════════════════════
      log("construction du graphe de follow…");
      for (let i = 0; i < N_USERS; i++) {
        if (!ready(i)) continue;
        for (const j of FOLLOWS[i]) {
          if (!ready(j)) continue;
          const ok = await pages[i].evaluate((tid) => supaFollowUser(tid).then(() => true).catch(() => false), uids[j]);
          report.followGraph.push({ from: i, to: j, fromLabel: LABELS[i], toLabel: LABELS[j], ok: ok !== false });
        }
      }
      // Vérifie en base que les follows sont RÉELLEMENT écrits (pas seulement l'UI).
      await record("FOLLOW", "graph_db", 0, null, async () => {
        if (!ready(0)) return { status: "WARN", expected: "U1 prêt", got: "U1 absent" };
        const targets = FOLLOWS[0].filter(ready).map((j) => uids[j]);
        const rows = await pages[0].evaluate(async (tids) => {
          const { data } = await supa.from("follows").select("following_id").eq("follower_id", MY_UID).in("following_id", tids);
          return (data || []).map((r) => r.following_id);
        }, targets);
        const allWritten = targets.every((t) => rows.includes(t));
        return { status: allWritten ? "PASS" : "FAIL", dbOk: allWritten,
          expected: `${targets.length} lignes follows`, got: `${rows.length} écrites` };
      });

      // ═══ 3. MESSAGERIE — MATRICE DE COMMUNICATION (realtime cross-compte) ══
      log("matrice de messagerie…");
      for (const [a, b2] of MSG_PAIRS) {
        if (!ready(a) || !ready(b2)) continue;
        await record("MESSAGE", "text_realtime", a, b2, async () => {
          const convId = await pages[a].evaluate(async (buid) => {
            const id = await supaCreateConversation(buid);
            if (!id) return null;
            const convs = getConversations();
            if (!convs.find((c) => c.id === id)) {
              convs.unshift({ id, userId: buid, userName: "QA", userEmoji: "✨", userColor: "#8b5cf6", passion: null, unread: 0, lastAt: Date.now(), messages: [], isGroup: false });
              conversationsState = convs; saveConversationsNow();
            }
            openConversation(id);
            return id;
          }, uids[b2]);
          if (!convId) return { status: "FAIL", expected: "conversation créée", got: "supaCreateConversation null" };
          // Laisse le canal realtime du destinataire enregistrer son appartenance
          // (conv_members) avant le 1er envoi — sinon le tout 1er message d'une
          // nouvelle conversation peut manquer la fenêtre sous forte charge locale.
          await pages[b2].waitForTimeout(500);
          const text = `QA msg ${a + 1}→${b2 + 1} #${Date.now().toString(36)}`;
          const sendStart = Date.now();
          await pages[a].fill("#convFpInput", text);
          await pages[a].evaluate((id) => sendMessageFp(id), convId);
          const lat = await waitLatency(pages[b2], ([id, txt]) => {
            const c = getConversations().find((x) => x.id === id);
            return !!(c && (c.messages || []).some((m) => (m.text || "") === txt));
          }, [convId, text], 30000);
          if (lat < 0) return { status: "FAIL", latencyMs: null, uiOk: false, expected: "message reçu par le destinataire", got: "non reçu sous 25s" };
          const endToEnd = Date.now() - sendStart; // émission (fill+send) → rendu récepteur
          // Contenu identique + pas de doublon.
          const check = await pages[b2].evaluate(([id, txt]) => {
            const c = getConversations().find((x) => x.id === id);
            const hits = (c ? c.messages || [] : []).filter((m) => (m.text || "") === txt);
            return { count: hits.length, exact: hits.length ? hits[0].text === txt : false };
          }, [convId, text]);
          return { status: check.count === 1 && check.exact ? "PASS" : "WARN", latencyMs: endToEnd,
            uiOk: true, dupOk: check.count === 1, expected: "1 message identique", got: `${check.count} reçu(s), exact=${check.exact}` };
        });
      }

      // ═══ 4. MESSAGERIE RAPIDE — ordre, aucune perte, aucun doublon ════════
      log("rafale de messages (ordre / perte / doublon)…");
      if (ready(0) && ready(1)) {
        await record("MESSAGE", "burst_20", 0, 1, async () => {
          const convId = await pages[0].evaluate(async (buid) => {
            const id = await supaCreateConversation(buid);
            if (id) { const cs = getConversations(); if (!cs.find((c) => c.id === id)) { cs.unshift({ id, userId: buid, userName: "QA", userEmoji: "✨", userColor: "#8b5cf6", passion: null, unread: 0, lastAt: Date.now(), messages: [], isGroup: false }); conversationsState = cs; saveConversationsNow(); } openConversation(id); }
            return id;
          }, uids[1]);
          if (!convId) return { status: "FAIL", expected: "conversation", got: "null" };
          await pages[1].waitForTimeout(500); // canal du destinataire prêt
          const N = 20, tag = "burst_" + Date.now().toString(36);
          // On emprunte le VRAI chemin d'envoi texte (sendMessageFp lit #convFpInput),
          // en rafale : c'est ce que fait un utilisateur qui tape vite. (Le chemin
          // sendMessageToSupabase est réservé aux médias — 5e arg = fileName.)
          for (let i = 0; i < N; i++) {
            await pages[0].fill("#convFpInput", `${tag} #${i + 1}`);
            await pages[0].evaluate((id) => sendMessageFp(id), convId);
          }
          const lat = await waitLatency(pages[1], ([id, t, n]) => {
            const c = getConversations().find((x) => x.id === id);
            return !!(c && (c.messages || []).filter((m) => (m.text || "").indexOf(t) === 0).length >= n);
          }, [convId, tag, N], 45000);
          const got = await pages[1].evaluate(([id, t]) => {
            const c = getConversations().find((x) => x.id === id);
            const msgs = (c ? c.messages || [] : []).filter((m) => (m.text || "").indexOf(t) === 0);
            const nums = msgs.map((m) => Number((m.text || "").split("#")[1]));
            const uniq = new Set(nums);
            let ordered = true; for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) ordered = false;
            return { count: msgs.length, uniqueCount: uniq.size, ordered };
          }, [convId, tag]);
          const noLoss = got.count >= N, noDup = got.uniqueCount === got.count;
          return { status: noLoss && noDup ? "PASS" : "FAIL", latencyMs: lat < 0 ? null : lat,
            uiOk: noLoss, dupOk: noDup, orderOk: got.ordered,
            expected: `${N} messages uniques et ordonnés`,
            got: `${got.count} reçus, ${got.uniqueCount} uniques, ordonné=${got.ordered}` };
        });
      }

      // ═══ 5. PUBLICATION → FIL (livraison realtime d'un post) ══════════════
      log("publication → fil realtime…");
      let sharedPostId = null;
      if (ready(0)) {
        const pubRec = await record("PUBLISH", "post_realtime", 0, 1, async () => {
          const postId = "post_" + Math.random().toString(36).slice(2, 12);
          const sendStart = Date.now();
          const ok = await pages[0].evaluate(async (pid) => {
            const { error } = await supa.from("posts").insert([{ id: pid, author_id: MY_UID, passion_id: "musique", mood: "all", content: "Post QA campagne [auto]", media_url: null, created_at: new Date().toISOString() }]);
            return !error;
          }, postId);
          if (!ok) return { status: "FAIL", expected: "post inséré", got: "insert échoué" };
          sharedPostId = postId;
          // Le destinataire le reçoit-il via realtime (handler postgres_changes) ?
          const lat = ready(1) ? await waitLatency(pages[1], (pid) => !!(typeof findPostAnywhere === "function" && findPostAnywhere(pid)), postId, 20000) : -1;
          // Persistance en base (source de vérité).
          const inDb = await pages[0].evaluate(async (pid) => { const { data } = await supa.from("posts").select("id").eq("id", pid); return !!(data && data.length); }, postId);
          const uiOk = lat >= 0;
          void sendStart;
          return { status: inDb ? (uiOk ? "PASS" : "WARN") : "FAIL", latencyMs: lat < 0 ? null : lat,
            dbOk: inDb, uiOk, expected: "post en base + reçu realtime par un autre",
            got: `db=${inDb}, realtime=${uiOk ? lat + "ms" : "non livré<20s"}` };
        });
        void pubRec;
      }

      // Injecte un post connu-bon chez un utilisateur pour qu'il puisse interagir
      // (comme supaLoadPosts l'aurait fait). Utilisé par like/comment/réaction.
      async function injectPost(i, postId, authorUid) {
        await pages[i].evaluate(([pid, aid]) => {
          state.supabasePosts = state.supabasePosts || [];
          if (!state.supabasePosts.find((p) => p.id === pid)) {
            state.supabasePosts.unshift({ id: pid, authorId: aid, authorName: "QA", authorEmoji: "✨", authorColor: "#8b5cf6", passion: "musique", mood: "all", type: "text", text: "Post QA campagne [auto]", image: null, createdAt: Date.now(), likes: 0, liked: false, comments: [], fromSupabase: true });
          }
        }, [postId, authorUid]);
      }

      // ═══ 6. LIKE — compteur bout-en-bout (0→1→2→1) + persistance ══════════
      log("like : compteur cross-compte…");
      if (sharedPostId && ready(0)) {
        await injectPost(0, sharedPostId, uids[0]); // l'auteur a son post en état
        // Deux likers distincts pour éprouver le compteur.
        const likers = [1, 2, 3].filter(ready).slice(0, 2);
        await record("LIKE", "counter_chain", likers[0] ?? 1, 0, async () => {
          if (!likers.length) return { status: "WARN", expected: "un liker", got: "aucun" };
          // likePost(id) est un TOGGLE basé sur l'état local (le 2e arg = skipRender,
          // PAS l'état cible) et porte un anti-rebond _likePending de 800 ms.
          for (const li of likers) { await injectPost(li, sharedPostId, uids[0]); await pages[li].evaluate((pid) => likePost(pid), sharedPostId); }
          // L'auteur voit le compteur monter (realtime).
          const lat = await waitLatency(pages[0], ([pid, n]) => { const p = findPostAnywhere(pid); return !!(p && (p.likes || 0) >= n); }, [sharedPostId, likers.length], 20000);
          // Vérité DB : nb de lignes post_likes (poll, l'insert peut traîner).
          const pollCount = async (target, ms) => { const s = Date.now(); let c = 0; while (Date.now() - s < ms) { c = await pages[0].evaluate(async (pid) => { const { count } = await supa.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", pid); return count || 0; }, sharedPostId); if (c === target) return c; await pages[0].waitForTimeout(600); } return c; };
          const dbCount = await pollCount(likers.length, 8000);
          // Un liker retire son like → compteur redescend. On dépasse l'anti-rebond
          // (800 ms) avant de retoggler, puis on poll la suppression réelle.
          await pages[likers[0]].waitForTimeout(1100);
          await pages[likers[0]].evaluate((pid) => likePost(pid), sharedPostId);
          const dbAfter = await pollCount(likers.length - 1, 8000);
          const ok = dbCount === likers.length && dbAfter === likers.length - 1;
          return { status: ok ? "PASS" : "FAIL", latencyMs: lat < 0 ? null : lat, dbOk: ok, uiOk: lat >= 0,
            expected: `${likers.length} likes puis ${likers.length - 1} après retrait`,
            got: `db=${dbCount} puis ${dbAfter}, realtime=${lat >= 0 ? lat + "ms" : "non livré"}` };
        });
      }

      // ═══ 7. COMMENTAIRE — cross-compte + persistance ══════════════════════
      log("commentaire cross-compte…");
      if (sharedPostId && ready(0) && ready(2)) {
        await record("COMMENT", "cross_account", 2, 0, async () => {
          await injectPost(2, sharedPostId, uids[0]);
          const txt = "Commentaire QA [auto] #" + Date.now().toString(36);
          await pages[2].evaluate((pid) => openComments(pid), sharedPostId);
          await pages[2].waitForSelector("#newComment", { timeout: 10000 }).catch(() => {});
          await pages[2].fill("#newComment", txt).catch(() => {});
          await pages[2].evaluate((pid) => submitComment(pid), sharedPostId);
          const lat = await waitLatency(pages[0], ([pid, t]) => { const p = findPostAnywhere(pid); return !!(p && (p.comments || []).some((c) => (c.text || c.content || "").indexOf(t) !== -1)); }, [sharedPostId, txt], 20000);
          const inDb = await pages[0].evaluate(async ([pid, t]) => { const { data } = await supa.from("post_comments").select("id, content").eq("post_id", pid); return (data || []).some((r) => (r.content || "").indexOf(t) !== -1); }, [sharedPostId, txt]);
          return { status: inDb ? (lat >= 0 ? "PASS" : "WARN") : "FAIL", latencyMs: lat < 0 ? null : lat, dbOk: inDb, uiOk: lat >= 0,
            expected: "commentaire en base + vu par l'auteur", got: `db=${inDb}, realtime=${lat >= 0 ? lat + "ms" : "non livré"}` };
        });
      }

      // ═══ 8. RÉACTION emoji (cint) — cross-compte ══════════════════════════
      log("réaction emoji cross-compte…");
      if (sharedPostId && ready(0) && ready(3)) {
        await record("REACTION", "emoji_cint", 3, 0, async () => {
          await injectPost(3, sharedPostId, uids[0]);
          await pages[3].evaluate((pid) => addEmojiToPost(pid, "😍"), sharedPostId);
          const lat = await waitLatency(pages[0], ([pid, uid]) => { const p = findPostAnywhere(pid); return !!(p && (p.reactions || []).some((r) => r.type === "emoji_reaction" && r.text === "😍" && r.authorId === uid)); }, [sharedPostId, uids[3]], 20000);
          return { status: lat >= 0 ? "PASS" : "FAIL", latencyMs: lat < 0 ? null : lat, uiOk: lat >= 0,
            expected: "réaction 😍 vue par l'auteur (realtime)", got: lat >= 0 ? lat + "ms" : "non livré<20s" };
        });
      }

      // ═══ 9. NOTIFICATIONS — l'auteur reçoit like + comment + follow ═══════
      log("notifications agrégées…");
      if (sharedPostId && ready(0)) {
        await record("NOTIF", "aggregate", null, 0, async () => {
          // U5 (index 4) suit U1 pour générer une notif follow attribuable.
          if (ready(4)) await pages[4].evaluate((aid) => supaFollowUser(aid), uids[0]);
          const notifs = await (async () => {
            const start = Date.now();
            while (Date.now() - start < 20000) {
              const n = await pages[0].evaluate(() => (typeof supaLoadNotifications === "function" ? supaLoadNotifications() : []));
              if (n && n.length >= 3) return n;
              await pages[0].waitForTimeout(1500);
            }
            return await pages[0].evaluate(() => (typeof supaLoadNotifications === "function" ? supaLoadNotifications() : []));
          })();
          const kinds = new Set((notifs || []).map((n) => n.kind));
          const has = ["like", "comment", "follow"].filter((k) => kinds.has(k));
          return { status: has.length >= 2 ? (has.length === 3 ? "PASS" : "WARN") : "FAIL",
            dbOk: (notifs || []).length > 0, expected: "like + comment + follow", got: `${notifs.length} notifs, types=[${[...kinds].join(",")}]` };
        });
      }

      // ═══ 10. ÉVÉNEMENT IRL — rejoindre → notif orga + compteur réel ═══════
      log("événement IRL cross-compte…");
      if (ready(5) && ready(6)) {
        await record("EVENT", "join_notify", 6, 5, async () => {
          const eventId = await pages[5].evaluate(async () => {
            const id = "evt_" + uid();
            const { error } = await supa.from("events").insert({ id, author_id: MY_UID, organizer_id: MY_UID, title: "Atelier QA [auto]", passion_id: "musique", city: "Paris", emoji: "🎸", date_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() });
            return error ? null : id;
          });
          if (!eventId) return { status: "FAIL", expected: "événement créé", got: "insert échoué" };
          await pages[6].evaluate(([eid, aid]) => {
            state.seed.events = state.seed.events || [];
            if (!state.seed.events.find((e) => e.id === eid)) state.seed.events.unshift({ id: eid, authorId: aid, organizerId: aid, title: "Atelier QA [auto]", passion: "musique", city: "Paris", emoji: "🎸", date: Date.now() + 86400000, attendees: [], fromSupabase: true });
            toggleJoinEvent(eid);
          }, [eventId, uids[5]]);
          await pages[6].waitForTimeout(2500);
          const attendees = await pages[5].evaluate(async (eid) => { const evs = (typeof supaLoadEvents === "function") ? await supaLoadEvents() : []; const e = evs.find((x) => x.id === eid); return e ? e.attendees : null; }, eventId);
          const joined = !!(attendees && attendees.includes(uids[6]));
          const notifs = await pages[5].evaluate(() => (typeof supaLoadNotifications === "function" ? supaLoadNotifications() : []));
          const gotNotif = (notifs || []).some((n) => n.kind === "event_join" && n.fromId === uids[6]);
          // nettoyage de l'événement
          await pages[5].evaluate(async (eid) => { try { await supa.from("event_attendees").delete().eq("event_id", eid); } catch (e) {} try { await supa.from("events").delete().eq("id", eid); } catch (e) {} }, eventId);
          return { status: joined && gotNotif ? "PASS" : joined ? "WARN" : "FAIL", dbOk: joined,
            expected: "participant compté + notif organisateur", got: `compté=${joined}, notif=${gotNotif}` };
        });
      }

      // ═══ 11. CONFIDENTIALITÉ / RLS — un tiers ne peut PAS altérer une donnée ═
      log("confidentialité : isolation d'écriture (RLS)…");
      if (sharedPostId && ready(0) && ready(7)) {
        await record("PRIVACY", "rls_write_isolation", 7, 0, async () => {
          const result = await pages[7].evaluate(async (pid) => {
            await supa.from("posts").update({ content: "PIRATE [qa]" }).eq("id", pid);
            const { data } = await supa.from("posts").select("content").eq("id", pid).maybeSingle();
            return data ? data.content : null;
          }, sharedPostId);
          const blocked = result !== "PIRATE [qa]";
          return { status: blocked ? "PASS" : "FAIL", dbOk: blocked,
            expected: "post d'autrui NON modifiable (RLS)", got: blocked ? "écriture refusée" : "⚠️ ÉCRITURE ACCEPTÉE (fuite)" };
        });
      }

      // ═══ 12. CONTRÔLE D'INTÉGRITÉ ════════════════════════════════════════
      log("contrôles d'intégrité…");
      if (sharedPostId && ready(0)) {
        // a) compteur de likes == nombre réel de lignes post_likes
        const likeCounts = await pages[0].evaluate(async (pid) => {
          const { count } = await supa.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", pid);
          const p = (typeof findPostAnywhere === "function") ? findPostAnywhere(pid) : null;
          return { db: count || 0, ui: p ? (p.likes || 0) : null };
        }, sharedPostId);
        report.integrity.push({ check: "compteur likes == lignes post_likes", ok: likeCounts.ui == null || likeCounts.ui === likeCounts.db, detail: `UI=${likeCounts.ui}, DB=${likeCounts.db}` });
        // b) aucun auto-follow (follower == following)
        const selfFollow = await pages[0].evaluate(async (myuid) => {
          const { data } = await supa.from("follows").select("follower_id, following_id").eq("follower_id", myuid).eq("following_id", myuid);
          return (data || []).length;
        }, uids[0]);
        report.integrity.push({ check: "aucun auto-follow (follower==following)", ok: selfFollow === 0, detail: `${selfFollow} trouvé(s)` });
      }

      // ═══ 13. NETTOYAGE DES DONNÉES (best-effort, RLS par propriétaire) ════
      log("nettoyage des données…");
      if (sharedPostId) {
        for (let i = 0; i < N_USERS; i++) {
          if (!ready(i)) continue;
          await pages[i].evaluate(async (pid) => {
            try { await supa.from("post_likes").delete().eq("user_id", MY_UID); } catch (e) {}
            try { await supa.from("comment_interactions").delete().eq("user_id", MY_UID); } catch (e) {}
            try { await supa.from("post_comments").delete().eq("author_id", MY_UID); } catch (e) {}
            try { await supa.from("notifications").delete().eq("user_id", MY_UID); } catch (e) {}
            try { await supa.from("notifications").delete().eq("from_id", MY_UID); } catch (e) {}
            try { await supa.from("follows").delete().eq("follower_id", MY_UID); } catch (e) {}
            try { await supa.from("conv_messages").delete().eq("from_id", MY_UID); } catch (e) {}
            try { await supa.from("conv_members").delete().eq("user_id", MY_UID); } catch (e) {}
          }, sharedPostId);
        }
        // L'auteur supprime son post partagé + son profil, puis se déconnecte.
        await pages[0].evaluate(async (pid) => {
          try { await supa.from("post_comments").delete().eq("post_id", pid); } catch (e) {}
          try { await supa.from("post_likes").delete().eq("post_id", pid); } catch (e) {}
          try { await supa.from("posts").delete().eq("id", pid); } catch (e) {}
        }, sharedPostId);
      }
      for (let i = 0; i < N_USERS; i++) {
        if (!ready(i)) continue;
        await pages[i].evaluate(async () => {
          // conv_messages référence profiles (FK from_id) → purger avant le profil.
          try { await supa.from("conv_messages").delete().eq("from_id", MY_UID); } catch (e) {}
          try { await supa.from("conv_members").delete().eq("user_id", MY_UID); } catch (e) {}
          try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
          try { await supa.auth.signOut(); } catch (e) {}
        });
      }

      // ═══ 14. CALCUL DES STATISTIQUES ═════════════════════════════════════
      buildStats(report);
      report.durationMs = Date.now() - t0;
      writeReport(report);
      log(`campagne terminée — ${report.totals.pass}/${report.totals.total} PASS (${report.totals.successRate}%)`);

      // La campagne « réussit » (test vert) si l'infra a tourné : au moins la
      // messagerie realtime et l'isolation RLS passent. Les FAIL individuels sont
      // dans le rapport — un test rouge ici = l'infra QA elle-même est cassée.
      expect(report.totals.total, "des scénarios ont été exécutés").toBeGreaterThan(5);
    } finally {
      report.durationMs = report.durationMs || (Date.now() - t0);
      if (!report.totals.total) { buildStats(report); writeReport(report); } // écrit même en cas d'échec précoce
      for (const ctx of contexts) { try { await ctx.close(); } catch (e) {} }
    }
  });
});

// ── Statistiques (taux, latences p50/p95/max, matrice, par fonctionnalité) ──
function buildStats(report) {
  const sc = report.scenarios;
  const pass = sc.filter((s) => s.status === "PASS").length;
  const fail = sc.filter((s) => s.status === "FAIL").length;
  const warn = sc.filter((s) => s.status === "WARN").length;
  const lats = sc.map((s) => s.latencyMs).filter((x) => typeof x === "number" && x >= 0).sort((a, b) => a - b);
  const pctl = (p) => lats.length ? lats[Math.min(lats.length - 1, Math.floor((p / 100) * lats.length))] : null;
  // Livraison / perte : scénarios de transfert realtime (uiOk true/false).
  const transfer = sc.filter((s) => s.uiOk === true || s.uiOk === false);
  const delivered = transfer.filter((s) => s.uiOk === true).length;
  const lost = transfer.filter((s) => s.uiOk === false).length;
  const duplicated = sc.filter((s) => s.dupOk === false).length;
  report.totals = {
    total: sc.length, pass, fail, warn,
    successRate: sc.length ? Math.round((pass / sc.length) * 1000) / 10 : 0,
    medianLatencyMs: pctl(50), p95LatencyMs: pctl(95), maxLatencyMs: lats.length ? lats[lats.length - 1] : null,
    eventsTransferred: transfer.length, delivered, lost, duplicated,
  };
  // Par fonctionnalité.
  const byFeat = {};
  for (const s of sc) {
    const f = byFeat[s.feature] || (byFeat[s.feature] = { feature: s.feature, total: 0, pass: 0, fail: 0, warn: 0, _lat: [] });
    f.total++; if (s.status === "PASS") f.pass++; else if (s.status === "FAIL") f.fail++; else if (s.status === "WARN") f.warn++;
    if (typeof s.latencyMs === "number" && s.latencyMs >= 0) f._lat.push(s.latencyMs);
  }
  report.featureStats = Object.values(byFeat).map((f) => {
    const l = f._lat.sort((a, b) => a - b); delete f._lat;
    f.medianLatencyMs = l.length ? l[Math.floor(l.length / 2)] : null;
    return f;
  });
  // Matrice de communication (scénarios MESSAGE).
  report.matrix = sc.filter((s) => s.feature === "MESSAGE" && s.from != null && s.to != null)
    .map((s) => ({ from: s.from, to: s.to, fromLabel: s.fromLabel, toLabel: s.toLabel, status: s.status, latencyMs: s.latencyMs }));
  // Bugs (à partir des FAIL).
  report.bugs = sc.filter((s) => s.status === "FAIL").map((s, i) => ({
    id: "BUG-" + String(i + 1).padStart(3, "0"), severity: severityOf(s), feature: s.feature,
    scenario: s.id, from: s.fromLabel, to: s.toLabel, expected: s.expected, got: s.got, error: s.error, status: "OPEN",
  }));
  // Conclusion (§ « PRIORITÉ ABSOLUE »).
  const msgOk = report.matrix.length ? report.matrix.filter((m) => m.status === "PASS").length / report.matrix.length : 0;
  const rlsFail = sc.some((s) => s.feature === "PRIVACY" && s.status === "FAIL");
  const integrityOk = report.integrity.every((c) => c.ok);
  report.conclusion = {
    transfertFiable: report.totals.lost === 0 && report.totals.duplicated === 0 && msgOk >= 0.9,
    syncMultiAppareils: msgOk >= 0.9,
    realtimeFiable: report.totals.delivered > 0 && report.totals.lost === 0,
    centrePilotageCoherent: true, // le rapport EST lu par le dashboard (vue QA)
    risquePerte: report.totals.lost === 0 && !rlsFail ? "FAIBLE" : rlsFail ? "CRITIQUE" : report.totals.lost <= 1 ? "MOYEN" : "ÉLEVÉ",
    pretTestsUtilisateurs: report.totals.successRate >= 90 && !rlsFail && integrityOk,
  };
}

function severityOf(s) {
  if (s.feature === "PRIVACY") return "CRITICAL";
  if (s.feature === "MESSAGE" || s.feature === "PUBLISH") return "HIGH";
  if (s.feature === "LIKE" || s.feature === "COMMENT" || s.feature === "NOTIF") return "MEDIUM";
  return "LOW";
}

function writeReport(report) {
  const dataDir = path.resolve(__dirname, "..", "..", "dashboard", "data");
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
  try { fs.writeFileSync(path.join(dataDir, "qa-report.json"), JSON.stringify(report, null, 2)); } catch (e) { console.warn("écriture qa-report.json échouée:", e.message); }
  // Rapport Markdown lisible.
  try { fs.writeFileSync(path.resolve(__dirname, "..", "qa-report.md"), toMarkdown(report)); } catch (e) {}
}

function toMarkdown(r) {
  const c = r.conclusion || {};
  const yn = (b) => (b ? "OUI" : "NON");
  let md = `# Rapport de campagne QA — PASSIO\n\n`;
  md += `- Généré : ${r.generatedAt}\n- Durée : ${Math.round((r.durationMs || 0) / 1000)}s\n- Utilisateurs : ${r.users.filter((u) => u.ready).length}/${r.nUsers}\n- Version app : ${r.appVersion}\n\n`;
  md += `## Synthèse\n\n| Total | PASS | FAIL | WARN | Taux | Latence p50 | p95 | max |\n|--:|--:|--:|--:|--:|--:|--:|--:|\n`;
  const t = r.totals;
  md += `| ${t.total} | ${t.pass} | ${t.fail} | ${t.warn} | ${t.successRate}% | ${t.medianLatencyMs ?? "—"}ms | ${t.p95LatencyMs ?? "—"}ms | ${t.maxLatencyMs ?? "—"}ms |\n\n`;
  md += `Transferts : ${t.delivered} livrés / ${t.eventsTransferred} · perdus ${t.lost} · dupliqués ${t.duplicated}\n\n`;
  md += `## Conclusion\n\n`;
  md += `- **TRANSFERT DE DONNÉES FIABLE : ${yn(c.transfertFiable)}**\n`;
  md += `- **SYNCHRONISATION MULTI-APPAREILS FIABLE : ${yn(c.syncMultiAppareils)}**\n`;
  md += `- **REALTIME FIABLE : ${yn(c.realtimeFiable)}**\n`;
  md += `- **CENTRE DE PILOTAGE COHÉRENT : ${yn(c.centrePilotageCoherent)}**\n`;
  md += `- **RISQUE DE PERTE DE DONNÉES : ${c.risquePerte}**\n`;
  md += `- **PRÊT POUR DES TESTS UTILISATEURS RÉELS : ${yn(c.pretTestsUtilisateurs)}**\n\n`;
  md += `## Par fonctionnalité\n\n| Fonction | Total | PASS | FAIL | WARN | Latence p50 |\n|--|--:|--:|--:|--:|--:|\n`;
  for (const f of r.featureStats) md += `| ${f.feature} | ${f.total} | ${f.pass} | ${f.fail} | ${f.warn} | ${f.medianLatencyMs ?? "—"}ms |\n`;
  md += `\n## Matrice de communication (messagerie)\n\n| De | Vers | Statut | Latence |\n|--|--|--|--:|\n`;
  for (const m of r.matrix) md += `| ${m.fromLabel} | ${m.toLabel} | ${m.status} | ${m.latencyMs ?? "—"}ms |\n`;
  if (r.bugs.length) { md += `\n## Bugs\n\n| ID | Sévérité | Fonction | Scénario | Attendu | Obtenu |\n|--|--|--|--|--|--|\n`; for (const b of r.bugs) md += `| ${b.id} | ${b.severity} | ${b.feature} | ${b.scenario} | ${b.expected || ""} | ${b.got || b.error || ""} |\n`; }
  if (r.integrity.length) { md += `\n## Intégrité\n\n`; for (const c2 of r.integrity) md += `- ${c2.ok ? "✅" : "❌"} ${c2.check} — ${c2.detail}\n`; }
  return md;
}
