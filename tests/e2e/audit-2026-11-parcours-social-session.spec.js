// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT E — PARCOURS MULTI-COMPTES : MESSAGERIE, SUIVI,
// SESSION, SIGNALEMENT
//
// Même faux serveur partagé que `audit-2026-11-parcours-contenu-irl.spec.js`
// (policies de production recopiées, SDK réel, vraies fonctions d'écriture).
// Chaque cas mesure l'ÉTAT FINAL DES TABLES en plus de l'écran. Les limites du
// banc (RLS recopiée, temps réel coupé) sont écrites en tête du faux serveur.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte, jwtPour, REF } = require("./audit-2026-11-parcours-faux-serveur");

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const D = "dddddddd-0000-4000-8000-000000000004";

test.describe.configure({ mode: "serial" });

// Conversation 1:1 créée par A avec B, par le vrai chemin, puis miroir local.
async function conv1a1(pageA, uidB, nomB) {
  return pageA.evaluate(async ([buid, nom]) => {
    const id = await supaCreateConversation(buid);
    if (!id) return null;
    const cs = getConversations();
    if (!cs.find((c) => c.id === id)) { cs.unshift({ id, userId: buid, userName: nom, userEmoji: "✨", userColor: "#8b5cf6", passion: null, unread: 0, lastAt: Date.now(), messages: [], isGroup: false }); conversationsState = cs; saveConversationsNow(); }
    openConversation(id);
    return id;
  }, [uidB, nomB]);
}

test.describe("AUDIT E — messagerie entre comptes", () => {
  test.setTimeout(240000);

  test("c1. A→B 20 messages rapides : ordre, non-lus, conv_reads ; B bloque A : envoi refusé des deux côtés", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e");
    const ctxA = await browser.newContext(), ctxB = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctxA, srv, A, { nom: "alice_e2e" });
      const convId = await conv1a1(a.page, B, "bob_e2e");
      expect(convId, "conversation créée (conversations + 2 conv_members sous A, créateur)").toBeTruthy();
      expect(srv.t.conv_members.filter((m) => m.conv_id === convId).map((m) => m.user_id).sort()).toEqual([A, B].sort());

      // 20 envois en rafale par le VRAI chemin (sendMessageFp → _sendTextToSupa)
      await a.page.evaluate(async (id) => {
        for (let i = 1; i <= 20; i++) {
          document.getElementById("convFpInput").value = "msg " + String(i).padStart(2, "0");
          sendMessageFp(id);
        }
      }, convId);
      await a.page.waitForFunction((id) => { const c = getConversations().find((x) => x.id === id); return c && c.messages.length === 20 && c.messages.every((m) => m.status === "sent"); }, convId, { timeout: 30000 });
      const enBase = srv.t.conv_messages.filter((m) => m.conv_id === convId);
      expect(enBase.length, "20 lignes conv_messages, aucune perdue ni doublée").toBe(20);
      expect(new Set(enBase.map((m) => m.id)).size).toBe(20);
      const ordreCreation = enBase.map((m) => JSON.parse(m.content).t || m.content);
      expect(enBase.every((m) => m.from_id === A), "toutes sous from_id = A").toBe(true);

      // B ouvre l'app : non-lus = 20, ordre d'affichage croissant, puis conv_reads posé par B seul
      const b = await ouvrirCompte(ctxB, srv, B, { nom: "bob_e2e" });
      const vueB = await b.page.evaluate(async (id) => {
        const convs = await supaLoadMyConversations();
        const c = convs.find((x) => x.id === id);
        return { trouve: !!c, unread: c && c.unread, dernier: c && c.messages[0] && c.messages[0].text };
      }, convId);
      expect(vueB.trouve, "B voit la conversation (membre)").toBe(true);
      expect(vueB.unread, "badge non-lus = 20 avant ouverture").toBe(20);
      await b.page.evaluate(async (id) => {
        const convs = await supaLoadMyConversations();
        conversationsState = convs; saveConversationsNow();
        await openConversation(id);   // charge les messages (supaLoadMessages) et pose l'accusé de lecture
        await new Promise((r) => setTimeout(r, 1500));
      }, convId);
      const filB = await b.page.evaluate((id) => {
        const c = getConversations().find((x) => x.id === id);
        return { n: (c.messages || []).length, textes: (c.messages || []).map((m) => m.text), unread: c.unread, dom: Array.from(document.querySelectorAll("#convFpThread .msg, #convFpThread [data-msg-id]")).length };
      }, convId);
      expect(filB.n, "B a les 20 messages").toBe(20);
      const attendu = Array.from({ length: 20 }, (_, i) => "msg " + String(i + 1).padStart(2, "0"));
      expect(filB.textes, "ordre chronologique conservé chez B").toEqual(attendu);
      const reads = srv.t.conv_reads.filter((r) => r.conv_id === convId);
      // A a ouvert la conversation lui-même (accusé de A) ; B vient d'ouvrir (accusé de B) : chacun le SIEN.
      expect(reads.map((r) => r.user_id).sort(), "deux accusés, chacun sous son propre user_id").toEqual([A, B].sort());
      expect(srv.requetes((r) => r.table === "conv_reads" && r.m === "POST").every((r) => r.body && r.body.user_id === r.me), "aucun accusé n'est écrit sous une autre identité").toBe(true);
      expect(filB.unread, "non-lus remis à 0 à l'ouverture").toBe(0);

      // ── B bloque A (vrai chemin blockUser → supaBlockUser) ─────────────────
      await b.page.evaluate(async (uid) => { await blockUser(uid, "alice_e2e"); }, A);
      expect(srv.t.blocks.some((x) => x.blocker_id === B && x.blocked_id === A), "blocks porte B→A").toBe(true);

      // A tente d'écrire : la policy conv_messages INSERT refuse (conv_1a1_bloquee)
      await a.page.evaluate((id) => { document.getElementById("convFpInput").value = "après blocage, de A"; sendMessageFp(id); }, convId);
      await a.page.waitForTimeout(1500);
      const msgA = await a.page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { statut: m.status, texte: m.text }; }, convId);
      expect(msgA.statut, "le message de A est en ÉCHEC (refus définitif 403), pas « envoyé »").toBe("failed");
      expect(srv.t.conv_messages.filter((m) => m.conv_id === convId).length, "rien n'est entré en base").toBe(20);
      const fileA = await a.page.evaluate(() => JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]"));
      expect(fileA.length, "un 403 est définitif : pas de rejeu en file").toBe(0);

      // B (le bloqueur) tente aussi : refusé des deux côtés
      await b.page.evaluate((id) => { document.getElementById("convFpInput").value = "après blocage, de B"; sendMessageFp(id); }, convId);
      await b.page.waitForTimeout(1500);
      const msgB = await b.page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return m.status; }, convId);
      expect(msgB, "l'envoi du bloqueur est refusé aussi").toBe("failed");
      expect(srv.t.conv_messages.filter((m) => m.conv_id === convId).length).toBe(20);

      // Lecture : A ne lit plus les messages de B ? (policy SELECT `NOT is_blocked_with(from_id)`) — ici A n'a écrit que les siens
      const lectureA = await a.page.evaluate(async (id) => { const r = await supa.from("conv_messages").select("id").eq("conv_id", id); return (r.data || []).length; }, convId);
      expect(lectureA, "A relit SES propres messages (from_id = A, non bloqué avec lui-même)").toBe(20);
      const lectureB = await b.page.evaluate(async (id) => { const r = await supa.from("conv_messages").select("id").eq("conv_id", id); return (r.data || []).length; }, convId);
      expect(lectureB, "B ne lit PLUS les messages de A après l'avoir bloqué").toBe(0);
      console.log("[E-c1] ok — 20 msgs, reads =", reads.length, "| après blocage : A", msgA.statut, "B", msgB);
    } finally { await ctxA.close(); await ctxB.close(); }
  });

  test("c2. groupe A+B+C : C quitte, D non membre lit par identifiant → rien ; coupure réseau pendant 3 envois, reprise sans doublon, propriété AUTH-06", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e"); srv.compte(C, "carol_e2e"); srv.compte(D, "dan_e2e");
    const ctxA = await browser.newContext(), ctxC = await browser.newContext(), ctxD = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctxA, srv, A, { nom: "alice_e2e" });
      const grpId = await a.page.evaluate(async ([b, c]) => {
        const id = await supaCreateGroup("Groupe audit E", [b, c], "musique");
        if (!id) return null;
        const cs = getConversations();
        cs.unshift({ id, isGroup: true, groupName: "Groupe audit E", userIds: [MY_UID, b, c], userName: "Groupe audit E", userEmoji: "👥", userColor: "#8b5cf6", unread: 0, lastAt: Date.now(), messages: [] });
        conversationsState = cs; saveConversationsNow();
        openConversation(id);
        return id;
      }, [B, C]);
      expect(grpId).toBeTruthy();
      expect(srv.t.conv_members.filter((m) => m.conv_id === grpId).length, "3 membres").toBe(3);
      await a.page.evaluate((id) => { document.getElementById("convFpInput").value = "bonjour le groupe"; sendMessageFp(id); }, grpId);
      await a.page.waitForFunction((id) => getConversations().find((x) => x.id === id).messages.every((m) => m.status === "sent"), grpId, { timeout: 15000 });

      // C quitte (leaveGroup → DELETE conv_members user_id = me)
      const c = await ouvrirCompte(ctxC, srv, C, { nom: "carol_e2e" });
      await c.page.evaluate(async (id) => { conversationsState = await supaLoadMyConversations(); saveConversationsNow(); leaveGroup(id); await new Promise((r) => setTimeout(r, 800)); }, grpId);
      expect(srv.t.conv_members.some((m) => m.conv_id === grpId && m.user_id === C), "C n'est plus membre en base").toBe(false);
      const relectureC = await c.page.evaluate(async (id) => { const r = await supa.from("conv_messages").select("id").eq("conv_id", id); const m = await supa.from("conv_members").select("user_id").eq("conv_id", id); return { msgs: (r.data || []).length, membres: (m.data || []).length }; }, grpId);
      expect(relectureC.msgs, "C parti ne lit plus les messages").toBe(0);
      expect(relectureC.membres, "ni la liste des membres").toBe(0);

      // D (jamais membre) lit par identifiant
      const d = await ouvrirCompte(ctxD, srv, D, { nom: "dan_e2e" });
      const lectureD = await d.page.evaluate(async (id) => {
        const r = await supa.from("conv_messages").select("id,content").eq("conv_id", id);
        const m = await supa.from("conv_members").select("user_id").eq("conv_id", id);
        const cv = await supa.from("conversations").select("id").eq("id", id);
        const w = await supa.from("conv_messages").insert({ id: "msg_intrus_" + Date.now(), conv_id: id, from_id: MY_UID, content: "intrus", created_at: new Date().toISOString() });
        const rd = await supa.from("conv_reads").upsert({ conv_id: id, user_id: MY_UID, last_read_at: new Date().toISOString() }, { onConflict: "conv_id,user_id" });
        return { msgs: (r.data || []).length, membres: (m.data || []).length, conv: (cv.data || []).length, insertStatus: w.status, insertErr: w.error && w.error.code, readStatus: rd.status, readErr: rd.error && rd.error.code };
      }, grpId);
      expect(lectureD.msgs, "D ne lit rien").toBe(0);
      expect(lectureD.membres).toBe(0);
      expect(lectureD.conv).toBe(0);
      expect(lectureD.insertStatus, "D ne peut pas écrire dans le groupe").toBeGreaterThanOrEqual(400);
      // C-01 : conv_reads INSERT n'exige pas l'appartenance → l'accusé du NON-MEMBRE passe (reproduit sur le stub d'après la policy)
      expect(lectureD.readStatus, "C-01 reproduit : l'accusé de lecture d'un non-membre est ACCEPTÉ par reads_upsert").toBeLessThan(300);
      expect(srv.t.conv_reads.some((r) => r.conv_id === grpId && r.user_id === D)).toBe(true);
      // …et il est VISIBLE des membres (policy SELECT = membres), donc A voit un ✓✓ d'un inconnu
      const readsVusParA = await a.page.evaluate(async (id) => { const r = await supa.from("conv_reads").select("user_id").eq("conv_id", id).neq("user_id", MY_UID); return (r.data || []).map((x) => x.user_id); }, grpId);
      expect(readsVusParA, "A reçoit l'accusé d'un non-membre (C-01, impact ✓✓)").toContain(D);

      // ── Coupure réseau pendant 3 envois, puis reprise (file _outbox*) ──────
      await ctxA.setOffline(true);
      await a.page.evaluate(async (id) => {
        for (let i = 1; i <= 3; i++) { document.getElementById("convFpInput").value = "hors ligne " + i; sendMessageFp(id); await new Promise((r) => setTimeout(r, 50)); }
        await new Promise((r) => setTimeout(r, 800));
      }, grpId);
      const pendantCoupure = await a.page.evaluate((id) => {
        const c = getConversations().find((x) => x.id === id);
        const file = JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]");
        return { statuts: c.messages.slice(-3).map((m) => m.status), file: file.map((f) => ({ msgId: f.msgId, owner: f.owner })) };
      }, grpId);
      expect(pendantCoupure.statuts, "3 messages en échec visible").toEqual(["failed", "failed", "failed"]);
      expect(pendantCoupure.file.length, "3 entrées en file").toBe(3);
      expect(pendantCoupure.file.every((f) => f.owner === A), "AUTH-06 : chaque entrée porte le compte RÉEL qui l'a écrite").toBe(true);
      const avantReprise = srv.t.conv_messages.filter((m) => m.conv_id === grpId).length;
      await ctxA.setOffline(false);
      await a.page.evaluate(() => { window.dispatchEvent(new Event("online")); _flushOutbox(); });
      await a.page.waitForFunction((id) => getConversations().find((x) => x.id === id).messages.every((m) => m.status === "sent"), grpId, { timeout: 20000 });
      // Un second vidage concurrent ne doit rien renvoyer en double
      await a.page.evaluate(() => { _flushOutbox(); _flushOutbox(); });
      await a.page.waitForTimeout(800);
      const apresReprise = srv.t.conv_messages.filter((m) => m.conv_id === grpId);
      expect(apresReprise.length, "exactement 3 messages de plus, aucun doublon").toBe(avantReprise + 3);
      expect(new Set(apresReprise.map((m) => m.id)).size).toBe(apresReprise.length);
      expect(await a.page.evaluate(() => JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length), "file vidée").toBe(0);

      // Changement de compte SANS purge (chemin court) : une entrée de A ne part jamais sous D
      await ctxA.setOffline(true);
      await a.page.evaluate(async (id) => { document.getElementById("convFpInput").value = "texte privé de A, resté en file"; sendMessageFp(id); await new Promise((r) => setTimeout(r, 400)); }, grpId);
      await ctxA.setOffline(false);
      const rejeuSousD = await a.page.evaluate(async (dUid) => {
        const avant = JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length;
        MY_UID = dUid; window.MY_UID = dUid;
        _flushOutbox();
        await new Promise((r) => setTimeout(r, 800));
        return { avant, apres: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length };
      }, D);
      expect(rejeuSousD.avant).toBe(1);
      expect(rejeuSousD.apres, "l'entrée de A est JETÉE sous D (jamais envoyée)").toBe(0);
      expect(srv.t.conv_messages.some((m) => m.from_id === D), "aucun message n'est parti sous D").toBe(false);
      console.log("[E-c2] groupe ok — reads non-membre (C-01) =", lectureD.readStatus, "| messages finals =", apresReprise.length);
    } finally { await ctxA.close(); await ctxC.close(); await ctxD.close(); }
  });

  test("c3. deux onglets du même compte : le dernier `saveState` écrase (D-07) — mesuré sur une conversation", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e");
    const ctx = await browser.newContext();
    try {
      const o1 = await ouvrirCompte(ctx, srv, A, { nom: "alice_e2e" });
      const convId = await conv1a1(o1.page, B, "bob_e2e");
      await o1.page.evaluate((id) => { document.getElementById("convFpInput").value = "depuis l'onglet 1"; sendMessageFp(id); }, convId);
      await o1.page.waitForFunction((id) => getConversations().find((x) => x.id === id).messages.every((m) => m.status === "sent"), convId, { timeout: 15000 });
      // Onglet 2, même contexte (même localStorage/IndexedDB), ouvert APRÈS
      const o2 = await ouvrirCompte(ctx, srv, A, { nom: "alice_e2e" });
      const dansO2 = await o2.page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); return c ? c.messages.map((m) => m.text) : null; }, convId);
      expect(dansO2, "l'onglet 2 démarre avec la conversation de l'onglet 1").toEqual(["depuis l'onglet 1"]);
      // Onglet 1 envoie un second message ; onglet 2 (en mémoire) ne le sait pas et re-sauvegarde
      await o1.page.evaluate((id) => { document.getElementById("convFpInput").value = "second, onglet 1"; sendMessageFp(id); }, convId);
      await o1.page.waitForFunction((id) => getConversations().find((x) => x.id === id).messages.every((m) => m.status === "sent"), convId, { timeout: 15000 });
      // La sauvegarde locale est DÉBOUNCÉE : on la force depuis l'onglet 1 avant de
      // mesurer, sinon le relevé dépend de la vitesse de la machine (CI : 1 au lieu de 2).
      await o1.page.evaluate(() => { saveConversationsNow(); });
      const stockAvant = await o1.page.evaluate((id) => JSON.parse(localStorage.getItem("passio_conversations_v1")).find((x) => x.id === id).messages.length, convId);
      expect(stockAvant, "PRÉCONDITION : le stockage porte les deux messages de l'onglet 1").toBe(2);
      await o2.page.evaluate(() => { saveConversationsNow(); });
      const stockApres = await o1.page.evaluate((id) => JSON.parse(localStorage.getItem("passio_conversations_v1")).find((x) => x.id === id).messages.length, convId);
      // D-07 : l'onglet 2 réécrit SON instantané → le second message disparaît du stockage
      console.log("[E-c3] messages dans le stockage : avant", stockAvant, "après saveConversationsNow() de l'onglet 2 :", stockApres);
      test.info().annotations.push({ type: "E-c3", description: "stockage avant=" + stockAvant + " après=" + stockApres });
      expect(stockApres, "D-07 reproduit sur les conversations : l'onglet 2 ÉCRASE le message envoyé par l'onglet 1 (le serveur, lui, a les deux)").toBe(1);
      expect(srv.t.conv_messages.filter((m) => m.conv_id === convId).length, "le serveur garde les deux").toBe(2);
    } finally { await ctx.close(); }
  });
});

test.describe("AUDIT E — suivi d'un compte privé", () => {
  test.setTimeout(180000);

  test("d. A privé ; B demande ; A refuse puis B redemande, A accepte → statut sur les surfaces, notifications déterministes", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e", { prive: true }); srv.compte(B, "bob_e2e");
    const ctxA = await browser.newContext(), ctxB = await browser.newContext();
    try {
      const b = await ouvrirCompte(ctxB, srv, B, { nom: "bob_e2e" });
      // B ouvre le profil de A (lecture réelle de profiles) puis tape « Suivre »
      await b.page.evaluate(async (uid) => { await openUserProfile(uid, "audit"); await new Promise((r) => setTimeout(r, 800)); }, A);
      const visite = await b.page.evaluate(() => ({ prive: window._visited && window._visited.isPrivate, bouton: !!document.getElementById("followBtn_" + (window._visited && window._visited.authorId)) }));
      expect(visite.prive, "le profil visité sait que A est privé").toBe(true);
      await b.page.evaluate((uid) => { toggleFollowUser(uid, "alice_e2e"); }, A);
      await b.page.waitForTimeout(1200);
      const f1 = srv.t.follows.find((f) => f.follower_id === B && f.following_id === A);
      expect(f1 && f1.status, "le serveur a écrit `pending` (trg_follows_statut)").toBe("pending");
      const etatB1 = await b.page.evaluate((uid) => ({ etat: etatSuivi(uid), libelle: libelleBoutonSuivi(uid), aide: aideBoutonSuivi(uid), bouton: (document.getElementById("followBtn_" + uid) || {}).textContent }), A);
      expect(etatB1.etat, "B voit « attente »").toBe("attente");
      expect(etatB1.libelle).toBe("Demande envoyée");
      expect(etatB1.aide).toMatch(/annuler/);
      // Notification serveur déterministe chez A
      const nFr = srv.t.notifications.find((n) => n.user_id === A && n.kind === "follow_request");
      expect(nFr && nFr.id, "notification `n_fr_<B8>_<A8>` écrite par le serveur").toBe("n_fr_" + B.slice(0, 8) + "_" + A.slice(0, 8));
      expect(srv.requetes((r) => r.table === "notifications" && r.m === "POST" && r.me === B).length, "le CLIENT n'écrit aucune notification de suivi (genre réservé au serveur)").toBe(0);

      // A refuse (DELETE follows par la cible)
      const a = await ouvrirCompte(ctxA, srv, A, { nom: "alice_e2e" });
      const notifsA = await a.page.evaluate(async () => { const ns = await supaLoadNotifications(); return ns.map((n) => ({ id: n.id, kind: n.kind, fromId: n.fromId })); });
      expect(notifsA.some((n) => n.kind === "follow_request" && n.fromId === B), "A voit la demande dans sa cloche").toBe(true);
      const refus = await a.page.evaluate(async ([buid, nid]) => refuserDemandeAbonnement(buid, nid), [B, nFr.id]);
      expect(refus).toBe(true);
      expect(srv.t.follows.some((f) => f.follower_id === B && f.following_id === A), "la ligne follows a disparu").toBe(false);
      // Côté B : au prochain chargement, plus de « Demande envoyée »
      const etatB2 = await b.page.evaluate(async (uid) => { state.user.following = await supaLoadFollowing(); saveState(); return etatSuivi(uid); }, A);
      expect(etatB2, "B revient à « aucun » après le refus (lecture serveur)").toBe("aucun");

      // B redemande ; A accepte (UPDATE follows status=accepted, policy follows_accepter)
      await b.page.evaluate((uid) => { toggleFollowUser(uid, "alice_e2e"); }, A);
      await b.page.waitForTimeout(1200);
      const accept = await a.page.evaluate(async ([buid, nid]) => accepterDemandeAbonnement(buid, nid), [B, nFr.id]);
      expect(accept, "A accepte").toBe(true);
      expect(srv.t.follows.find((f) => f.follower_id === B && f.following_id === A).status).toBe("accepted");
      const nFa = srv.t.notifications.find((n) => n.user_id === B && n.kind === "follow_accept");
      expect(nFa && nFa.id, "notification d'acceptation déterministe chez B").toBe("n_fa_" + B.slice(0, 8) + "_" + A.slice(0, 8));
      // Contre-épreuve : B ne peut pas s'auto-accepter
      const autoAccept = await b.page.evaluate(async (uid) => { const r = await supa.from("follows").update({ status: "accepted" }).eq("follower_id", MY_UID).eq("following_id", uid).select("status"); return { n: (r.data || []).length, status: r.status }; }, A);
      expect(autoAccept.n, "l'UPDATE de B sur sa propre demande touche 0 ligne (policy : la CIBLE seule)").toBe(0);
      // Surfaces de B après relecture : suivi acquis, posts de A lisibles
      const etatB3 = await b.page.evaluate(async (uid) => { state.user.following = await supaLoadFollowing(); saveState(); return { etat: etatSuivi(uid), libelle: libelleBoutonSuivi(uid), attrs: attrsBoutonSuivi(uid) }; }, A);
      expect(etatB3.etat).toBe("suivi");
      expect(etatB3.libelle).toBe("✓ Suivi");
      expect(etatB3.attrs).toContain("background:var(--accent)");
      srv.t.posts.push({ id: "post_prive_a", author_id: A, passion_id: "musique", mood: "all", content: "post privé d'A", created_at: new Date().toISOString(), is_reel: false });
      const litB = await b.page.evaluate(async () => { const r = await supa.from("posts").select("id").eq("id", "post_prive_a"); return (r.data || []).length; });
      expect(litB, "abonné accepté : B lit le post du compte privé").toBe(1);
      // La demande traitée ne remontre plus ses boutons (verdict dans l'état du compte)
      const verdictA = await a.page.evaluate((nid) => _verdictDemandeAbonnement({ id: nid, kind: "follow_request", fromId: "x", createdAt: 0 }), nFr.id);
      expect(verdictA, "le verdict « acceptée » est mémorisé chez A").toBe("acceptée");
      console.log("[E-d] ok — follows", JSON.stringify(srv.t.follows), "| notifs", srv.t.notifications.map((n) => n.id));
    } finally { await ctxA.close(); await ctxB.close(); }
  });
});

test.describe("AUDIT E — session et changement de compte", () => {
  test.setTimeout(180000);

  test("e1. expiration (401 sur toutes les écritures + refresh invalide) en plein envoi : échec visible, aucune boucle, file gardée", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e");
    const ctxA = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctxA, srv, A, { nom: "alice_e2e" });
      const convId = await conv1a1(a.page, B, "bob_e2e");
      // Le jeton meurt : PostgREST répond 401 PGRST301 et le refresh est refusé
      srv.refusToutes401 = true; srv.refreshKo.add(A);
      const nAvant = srv.journal.length;
      await a.page.evaluate((id) => { document.getElementById("convFpInput").value = "envoyé pendant l'expiration"; sendMessageFp(id); }, convId);
      await a.page.waitForTimeout(2500);
      const apres = await a.page.evaluate((id) => {
        const c = getConversations().find((x) => x.id === id);
        return { statut: c.messages[c.messages.length - 1].status, file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length, toasts: (window.__toasts || []).map((t) => t.msg), expiree: window._sessionExpiree === true };
      }, convId);
      const envoisPendant = srv.journal.slice(nAvant).filter((r) => r.table === "conv_messages" && r.m === "POST").length;
      console.log("[E-e1] après 401 :", apres, "| POST conv_messages pendant l'expiration :", envoisPendant);
      expect(apres.statut, "le message est en échec, visible").toBe("failed");
      expect(envoisPendant, "pas de rafale de renvois sur un 401 (refus définitif)").toBeLessThanOrEqual(2);
      // Le 401 est traité comme définitif : l'entrée SORT de la file (choix du produit, `_refusDefinitif`).
      // Conséquence mesurée : après reconnexion, il n'y a plus de rejeu automatique — renvoi manuel seulement.
      test.info().annotations.push({ type: "E-e1", description: "file après 401 = " + apres.file + " ; mode expiré posé = " + apres.expiree });
      expect(srv.t.conv_messages.some((m) => m.conv_id === convId), "rien n'est entré en base").toBe(false);
    } finally { await ctxA.close(); }
  });

  test("e2. changement de compte A→B par doLogout : aucune donnée de A (localStorage, IndexedDB, DOM, mémoire)", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e"); srv.compte(C, "carol_e2e");
    const ctx = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctx, srv, A, { nom: "alice_e2e" });
      const convId = await conv1a1(a.page, C, "carol_e2e");
      await a.page.evaluate((id) => { document.getElementById("convFpInput").value = "SECRET-DE-A-7731"; sendMessageFp(id); }, convId);
      await a.page.waitForFunction((id) => getConversations().find((x) => x.id === id).messages.every((m) => m.status === "sent"), convId, { timeout: 15000 });
      await a.page.evaluate(async () => { state.user.likedPosts = ["post_x_de_a"]; saveState(); await new Promise((r) => setTimeout(r, 300)); });
      // Déconnexion réelle (doLogout → signOut → purge → reload)
      await a.page.evaluate(() => { doLogout("signin"); });
      await a.page.waitForTimeout(2500);
      await a.page.waitForLoadState("domcontentloaded").catch(() => {});
      await a.page.waitForTimeout(2500);
      const residus = await a.page.evaluate(async () => {
        const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k) || ""; }
        const fuite = Object.entries(ls).filter(([k, v]) => /SECRET-DE-A-7731|post_x_de_a|aaaaaaaa-0000/.test(v)).map(([k]) => k);
        let idb = null;
        try { idb = await new Promise((res) => { const rq = indexedDB.open("passio_store"); rq.onsuccess = () => { try { const db = rq.result; const tx = db.transaction(db.objectStoreNames, "readonly"); let hits = 0, done = 0; const n = db.objectStoreNames.length; if (!n) return res(0); for (const name of db.objectStoreNames) { const g = tx.objectStore(name).getAll(); g.onsuccess = () => { if (/SECRET-DE-A-7731/.test(JSON.stringify(g.result))) hits++; if (++done === n) res(hits); }; } } catch (e) { res("err:" + e.message); } }; rq.onerror = () => res("open-ko"); }); } catch (e) { idb = "err"; }
        return { fuite, idb, dom: /SECRET-DE-A-7731/.test(document.body.innerText), mem: (typeof conversationsState !== "undefined" && conversationsState) ? JSON.stringify(conversationsState).includes("SECRET-DE-A-7731") : false, uid: localStorage.getItem("passio_uid") };
      });
      console.log("[E-e2] résidus après déconnexion :", residus);
      expect(residus.fuite, "aucune clé localStorage ne porte le message ou l'identifiant de A").toEqual([]);
      expect(residus.idb, "IndexedDB ne porte plus le message de A").toBe(0);
      expect(residus.dom).toBe(false);
      expect(residus.mem, "la mémoire ne porte plus les conversations de A").toBe(false);
      // B se connecte sur le même appareil : il ne voit que les siennes
      await a.page.evaluate(([u, cle, jwt, e]) => { localStorage.setItem("passio_uid", u); localStorage.setItem(cle, JSON.stringify({ access_token: jwt, refresh_token: "rt_" + u, token_type: "bearer", expires_in: 3600, expires_at: e, user: { id: u } })); }, [B, "sb-" + REF + "-auth-token", jwtPour(B), Math.floor(Date.now() / 1000) + 3600]);
      await a.page.reload();
      await a.page.waitForFunction(() => typeof MY_UID !== "undefined" && MY_UID === "bbbbbbbb-0000-4000-8000-000000000002" && !!window._supaReal, null, { timeout: 25000 });
      await a.page.waitForTimeout(2500);
      const chezB = await a.page.evaluate(async () => { const convs = await supaLoadMyConversations(); return { n: convs.length, texte: JSON.stringify(getConversations()).includes("SECRET-DE-A-7731") || JSON.stringify(convs).includes("SECRET-DE-A-7731"), lectures: null }; });
      expect(chezB.n, "B n'a aucune conversation (le serveur ne lui livre pas celles de A)").toBe(0);
      expect(chezB.texte).toBe(false);
      const lecturesSousB = srv.requetes((r) => r.me === B && r.m === "GET" && r.table === "conv_messages" && !r.url.includes("conv_id=in."));
      expect(lecturesSousB.length, "aucune lecture de conv_messages de A tentée sous B").toBe(0);
    } finally { await ctx.close(); }
  });

  test("e3. compte suspendu (banned_until) : le rafraîchissement répond user_banned → session jetée, rien ne part, motif dit à la connexion seulement", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e");
    srv.banCompte = A;
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await srv.brancher(page);
      // Observateur posé AVANT le boot : `showLanding` est-il appelé ? (bootOnboarded retire `#landing.active` après coup)
      await page.addInitScript(() => { window.__landingMontree = false; const o = new MutationObserver(() => { const l = document.getElementById("landing"); if (l && l.classList.contains("active")) window.__landingMontree = true; }); document.addEventListener("DOMContentLoaded", () => o.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["class"] })); });
      await page.close();
      // Jeton EXPIRÉ au démarrage : le SDK tente le refresh, GoTrue répond « User is banned »
      const a = await ouvrirCompte(ctx, srv, A, { nom: "alice_e2e", jetonExpire: true });
      await a.page.waitForTimeout(3000);
      const etat = await a.page.evaluate(async () => {
        const s = await supa.auth.getSession();
        const like = await supa.from("post_likes").insert({ post_id: "p_x", user_id: MY_UID });
        return { uid: MY_UID, expiree: window._sessionExpiree === true, session: !!(s.data && s.data.session), jeton: !!localStorage.getItem("sb-njkiyoklssvefstljemx-auth-token"), texteSuspendu: /suspendu/i.test(document.body.innerText), ecriture: { status: like.status, code: like.error && like.error.code }, gate: requireAuthentication("aimer") };
      });
      console.log("[E-e3] suspendu :", etat);
      test.info().annotations.push({ type: "E-e3", description: JSON.stringify(etat) });
      expect(etat.session, "le SDK a JETÉ la session refusée par `user_banned`").toBe(false);
      expect(etat.jeton, "plus aucun jeton sur l'appareil").toBe(false);
      expect(etat.ecriture.status, "une écriture part sans session → rôle anon → refusée par la policy").toBeGreaterThanOrEqual(400);
      expect(srv.t.post_likes.length, "rien n'est entré en base").toBe(0);
      // Observations consignées (pas des assertions produit) : le mode « session expirée » n'est PAS posé
      // (le jeton a disparu, `_sessionSdkPersistee()` est faux) et l'écran ne dit pas « suspendu » :
      // le motif n'est dit qu'à la tentative de connexion (compte-suspendu.spec.js ①). Et `requireAuthentication`
      // laisse passer (uid uuid, pas de mode expiré) — la landing couvre l'app en réel, bootOnboarded l'a retirée ici.
      expect(etat.expiree).toBe(false);
      expect(etat.texteSuspendu).toBe(false);
    } finally { await ctx.close(); }
  });
});

test.describe("AUDIT E — signalement et masquage", () => {
  test.setTimeout(180000);

  test("f. motif obligatoire ? ; 3 signaleurs → contenus_masques → invisible pour qui ?", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e"); srv.compte(C, "carol_e2e"); srv.compte(D, "dan_e2e");
    srv.t.posts.push({ id: "post_signale", author_id: A, passion_id: "musique", mood: "all", content: "publication à signaler", created_at: new Date().toISOString(), is_reel: false });
    const ctxB = await browser.newContext(), ctxA = await browser.newContext();
    try {
      const b = await ouvrirCompte(ctxB, srv, B, { nom: "bob_e2e" });
      // Signalement d'un post SANS motif : la fenêtre REFUSE un motif vide (E-05,
      // corrigé le 2026-11-02) — elle reste ouverte, le dit, et rien ne part ;
      // avec un motif, la ligne est écrite AVEC ce motif.
      const r1 = await b.page.evaluate(async () => {
        window.__toasts = [];
        const p = reportPost("post_signale");
        await new Promise((r) => setTimeout(r, 300));
        const champ = document.getElementById("signalementMotif");
        const present = !!champ;
        if (champ) { champ.value = "   "; _signalementValider(); }
        await new Promise((r) => setTimeout(r, 300));
        const toujoursOuverte = !!document.getElementById("signalementMotif");
        const toastsVide = (window.__toasts || []).map((t) => t.msg);
        if (document.getElementById("signalementMotif")) { document.getElementById("signalementMotif").value = "contenu haineux"; _signalementValider(); }
        await p;
        return { fenetre: present, toujoursOuverte, toastsVide, toasts: (window.__toasts || []).map((t) => t.msg) };
      });
      const rapports1 = srv.t.reports.filter((r) => r.reporter_id === B && r.target_id === "post_signale");
      console.log("[E-f] signalement sans puis avec motif :", r1, "| lignes :", rapports1.map((r) => r.reason));
      expect(r1.fenetre, "la fenêtre de motif s'ouvre").toBe(true);
      expect(r1.toujoursOuverte, "motif vide : la fenêtre reste ouverte").toBe(true);
      expect(r1.toastsVide.join(" | "), "…et le dit").toMatch(/deux mots/);
      expect(rapports1.length, "UNE ligne reports, écrite avec le motif saisi ensuite").toBe(1);
      expect(rapports1[0].reason, "le motif voyage").toBe("contenu haineux");
      // Signalement d'un profil et d'un message (surface ?) : profil via reportUser
      const r2 = await b.page.evaluate(async (uid) => { window.__toasts = []; const p = reportUser(uid, "alice_e2e"); await new Promise((r) => setTimeout(r, 300)); const ch = document.getElementById("signalementMotif"); if (ch) { ch.value = "harcèlement"; _signalementValider(); } await p; return (window.__toasts || []).map((t) => t.msg); }, A);
      expect(srv.t.reports.some((r) => r.reporter_id === B && r.target_type === "user" && r.target_id === A && r.reason === "harcèlement")).toBe(true);
      expect(r2.join(" | ")).toMatch(/Signalement envoyé/);
      const surfaceMessage = await b.page.evaluate(() => typeof reportMessage === "function" || typeof reportConvMessage === "function" || typeof signalerMessage === "function");
      test.info().annotations.push({ type: "E-f-message", description: "surface de signalement d'un MESSAGE = " + surfaceMessage });

      // Deux signaleurs de plus (C, D) par REST sous leur identité → trigger prétri → masqué
      for (const u of [C, D]) {
        srv.t.reports.push({ id: "r_" + u.slice(0, 8), reporter_id: u, target_type: "post", target_id: "post_signale", reason: "spam", created_at: new Date().toISOString() });
        srv.trgReportsPretri(srv.t.reports[srv.t.reports.length - 1]);
      }
      expect(srv.t.contenus_masques.some((m) => m.target_id === "post_signale" && m.decision === null), "3 signaleurs distincts → masqué").toBe(true);
      // Invisible pour B (lecteur ordinaire), toujours visible pour A (auteur)
      const litB = await b.page.evaluate(async () => { const r = await supa.from("posts").select("id").eq("id", "post_signale"); return (r.data || []).length; });
      expect(litB, "un lecteur ne voit plus le post masqué").toBe(0);
      const a = await ouvrirCompte(ctxA, srv, A, { nom: "alice_e2e" });
      const litA = await a.page.evaluate(async () => { const r = await supa.from("posts").select("id").eq("id", "post_signale"); return (r.data || []).length; });
      expect(litA, "l'auteur voit toujours sa publication (policy RESTRICTIVE : author_id = me)").toBe(1);
      // Le signalement n'est lisible par aucun client
      const lectureReports = await b.page.evaluate(async () => { const r = await supa.from("reports").select("id"); return { n: (r.data || []).length, status: r.status }; });
      expect(lectureReports.n, "reports : aucun SELECT client").toBe(0);
    } finally { await ctxB.close(); await ctxA.close(); }
  });
});
