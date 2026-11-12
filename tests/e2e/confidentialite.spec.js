// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENTIALITÉ — non-régression des correctifs RLS du 2026-08-09.
//
// Prouve, avec 3 vrais comptes, que :
//   1) un TIERS (non-membre) ne peut PAS lire les messages privés de deux autres
//      (fuite « conv_messages SELECT true » fermée) — ET qu'un MEMBRE lit toujours ;
//   2) les stories d'un compte PRIVÉ ne sont PAS visibles d'un non-abonné (alignées
//      sur les posts) — ET qu'un abonné les voit.
//
// « Il est aussi grave de recevoir une donnée qu'on ne devrait pas voir que de ne
// pas recevoir une donnée qu'on devrait voir. » → on teste les DEUX sens.
//
// ⚠️ ÉCRIT EN BASE RÉELLE (prod). OPT-IN : PASSIO_E2E_MULTI=1.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { signupUser, wireHttpDiag } = require("./qa-helper");

const PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

test.describe("Confidentialité cross-compte (RLS)", () => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "opt-in : PASSIO_E2E_MULTI=1 (écrit en base réelle)");

  test("messages privés : un tiers ne peut pas les lire, un membre oui", async ({ browser }) => {
    test.setTimeout(240000);
    const log = (m) => console.log(`[conf-dm] ${m}`);
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
    const A = await ctxA.newPage(), B = await ctxB.newPage(), C = await ctxC.newPage();
    wireHttpDiag(log, [{ who: "A", page: A }, { who: "B", page: B }, { who: "C", page: C }]);
    let convId = null;
    try {
      const [uidA, uidB, uidC] = await Promise.all([
        signupUser(A, "Conf Alice"), signupUser(B, "Conf Bob"), signupUser(C, "Conf Carol"),
      ]);
      expect(uidA && uidB && uidC).toBeTruthy();

      // A ↔ B : conversation + message via le vrai chemin d'envoi.
      convId = await A.evaluate(async (buid) => {
        const id = await supaCreateConversation(buid);
        if (!id) return null;
        const cs = getConversations();
        if (!cs.find((c) => c.id === id)) { cs.unshift({ id, userId: buid, userName: "Bob", userEmoji: "✨", userColor: "#8b5cf6", passion: null, unread: 0, lastAt: Date.now(), messages: [], isGroup: false }); conversationsState = cs; saveConversationsNow(); }
        openConversation(id);
        return id;
      }, uidB);
      expect(convId, "conversation créée").toBeTruthy();
      const secret = "SECRET privé " + Date.now().toString(36);
      await A.fill("#convFpInput", secret);
      await A.evaluate((id) => sendMessageFp(id), convId);

      // ── Le MEMBRE (B) reçoit bien (on ne doit pas avoir sur-restreint) ──
      await B.waitForFunction(([id, s]) => {
        const c = getConversations().find((x) => x.id === id);
        return !!(c && (c.messages || []).some((m) => (m.text || "") === s));
      }, [convId, secret], { timeout: 30000 });
      log("✅ le membre B a bien reçu le message");

      // ── Le TIERS (C) ne doit RIEN pouvoir lire, même en requête brute ──
      const leak = await C.evaluate(async ([id, s]) => {
        const byConv = await supa.from("conv_messages").select("id,content").eq("conv_id", id);
        const scan = await supa.from("conv_messages").select("content").ilike("content", "%" + s + "%");
        const members = await supa.from("conv_members").select("user_id").eq("conv_id", id);
        const conv = await supa.from("conversations").select("id").eq("id", id);
        return {
          byConv: (byConv.data || []).length,
          scanHit: (scan.data || []).length,
          members: (members.data || []).length,
          conv: (conv.data || []).length,
        };
      }, [convId, secret]);
      log("tiers C voit: " + JSON.stringify(leak));
      expect(leak.byConv, "C ne lit AUCUN message de la conv").toBe(0);
      expect(leak.scanHit, "le message secret n'apparaît nulle part pour C").toBe(0);
      expect(leak.members, "C ne voit pas la liste des membres").toBe(0);
      expect(leak.conv, "C ne voit pas la conversation").toBe(0);
      log("✅ fuite conv_messages FERMÉE : un tiers ne lit rien");

      // Nettoyage
      await A.evaluate(async (id) => { try { await supa.from("conv_messages").delete().eq("conv_id", id); } catch (e) {} try { await supa.from("conv_members").delete().eq("conv_id", id); } catch (e) {} try { await supa.from("conversations").delete().eq("id", id); } catch (e) {} });
      for (const p of [A, B, C]) await p.evaluate(async () => { try { await supa.from("conv_messages").delete().eq("from_id", MY_UID); } catch (e) {} try { await supa.from("conv_members").delete().eq("user_id", MY_UID); } catch (e) {} try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {} try { await supa.auth.signOut(); } catch (e) {} });
    } finally { await ctxA.close(); await ctxB.close(); await ctxC.close(); }
  });

  test("stories d'un compte privé : invisibles au non-abonné, visibles à l'abonné", async ({ browser }) => {
    test.setTimeout(240000);
    const log = (m) => console.log(`[conf-story] ${m}`);
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
    const A = await ctxA.newPage(), B = await ctxB.newPage(), C = await ctxC.newPage();
    wireHttpDiag(log, [{ who: "A", page: A }, { who: "B", page: B }, { who: "C", page: C }]);
    let storyId = null;
    try {
      const [uidA, uidB, uidC] = await Promise.all([
        signupUser(A, "Priv Alice"), signupUser(B, "Priv Bob"), signupUser(C, "Priv Carol"),
      ]);
      expect(uidA && uidB && uidC).toBeTruthy();

      // A passe son compte en PRIVÉ, comme le fait la case du profil : choix PROUVÉ
      // (`privacyChoisi`), puis écriture de `is_private` par `supaSavePublicProfile`.
      // ⚠️ Depuis le 12/11 (STAB-04), un compte neuf naît PUBLIC : ce test passait
      // auparavant parce que la ligne minimale naissait déjà privée, et
      // `supaUpsertProfile` ne fait que CRÉER une ligne absente — il n'a jamais
      // écrit le choix. On vérifie ensuite que ça a pris.
      await A.evaluate(async () => {
        state.user.general = state.user.general || {};
        state.user.general.isPrivate = true; state.user.general.privacyChoisi = true;
        saveState();
        await supaSavePublicProfile({ is_private: true });
      });
      const isPriv = await A.evaluate(async () => {
        const start = Date.now();
        while (Date.now() - start < 8000) {
          const { data } = await supa.from("profiles").select("is_private").eq("id", MY_UID).maybeSingle();
          if (data && data.is_private === true) return true;
          await supa.from("profiles").update({ is_private: true }).eq("id", MY_UID);
          await new Promise((r) => setTimeout(r, 700));
        }
        return false;
      });
      expect(isPriv, "compte A bien marqué privé en base").toBe(true);
      storyId = await A.evaluate(async (px) => {
        const id = "story_" + uid();
        await supaPublishStory({ id, authorId: MY_UID, authorName: "Priv Alice", authorEmoji: "✨", authorColor: "#8b5cf6", text: "Story privée", content: "Story privée", media: px, mediaType: "photo", overlays: [], emoji: "✨", passion: null, createdAt: Date.now() });
        return id;
      }, PX);
      expect(storyId).toBeTruthy();

      // B suit A. supaFollowUser est fire-and-forget → on ATTEND que la ligne
      // follows soit réellement écrite (sinon la policy story ne peut pas la voir).
      await B.evaluate((aid) => supaFollowUser(aid), uidA);
      await B.evaluate(async (aid) => {
        const start = Date.now();
        while (Date.now() - start < 12000) {
          const { data } = await supa.from("follows").select("follower_id").eq("follower_id", MY_UID).eq("following_id", aid);
          if (data && data.length) return true;
          await new Promise((r) => setTimeout(r, 700));
        }
        return false;
      }, uidA);

      // ⚠️ MÊME PRÉMISSE PÉRIMÉE QUE `blocage-acces` : depuis la migration
      // d'ouverture (production, 2026-09-12), s'abonner à un compte privé écrit
      // `pending`, et la policy des stories exige `accepted`. Un abonné en
      // attente ne voit RIEN — c'est le comportement voulu. A doit accepter,
      // et c'est bien A qui émet l'UPDATE : `follows_accepter` ne l'ouvre qu'à
      // la CIBLE, et seulement vers `accepted`.
      const accepte = await A.evaluate(async (buid) => {
        const { data, error } = await supa.from("follows")
          .update({ status: "accepted" })
          .eq("follower_id", buid).eq("following_id", MY_UID)
          .select("status");
        // ⚠️ On LIT `{ error }` ET le nombre de lignes : le SDK ne lève pas sur
        // un refus RLS, et un UPDATE qui touche 0 ligne « réussit » en silence.
        if (error) return "erreur:" + error.message;
        return (data && data[0] && data[0].status) || "aucune ligne";
      }, uidB);
      expect(accepte, "A accepte la demande d'abonnement de B").toBe("accepted");

      // Abonné : poll (la propagation RLS peut traîner d'un instant).
      let seenByFollower = 0;
      { const start = Date.now();
        while (Date.now() - start < 12000) {
          seenByFollower = await B.evaluate(async (sid) => { const { data } = await supa.from("stories").select("id").eq("id", sid); return (data || []).length; }, storyId);
          if (seenByFollower) break;
          await B.waitForTimeout(700);
        } }
      const seenByStranger = await C.evaluate(async (sid) => {
        const { data } = await supa.from("stories").select("id").eq("id", sid);
        return (data || []).length;
      }, storyId);
      log(`abonné voit=${seenByFollower} · étranger voit=${seenByStranger}`);
      expect(seenByStranger, "le NON-abonné ne voit PAS la story du compte privé").toBe(0);
      expect(seenByFollower, "l'abonné voit la story du compte privé").toBe(1);
      log("✅ stories de compte privé protégées côté serveur");

      // Nettoyage
      await A.evaluate(async (sid) => { try { await supa.from("stories").delete().eq("id", sid); } catch (e) {} });
      for (const p of [A, B, C]) await p.evaluate(async () => { try { await supa.from("follows").delete().eq("follower_id", MY_UID); } catch (e) {} try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {} try { await supa.auth.signOut(); } catch (e) {} });
    } finally { await ctxA.close(); await ctxB.close(); await ctxC.close(); }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // AUDIT 2026-11-02 (agent E) — L'ESPACE D'UNE CONVERSATION, VU D'UN TIERS
  //
  // Trois propriétés, les deux sens à chaque fois :
  //   ① `conv_reads` : un TIERS ne peut pas déposer d'accusé de lecture dans la
  //      conversation d'autrui (C-01 : `reads_upsert` n'exige que `user_id = me`,
  //      sans appartenance — la migration
  //      `migration_audit_2026-11-02_oracles_et_privileges.sql` referme la
  //      porte) ; et le MEMBRE, lui, dépose toujours le sien ;
  //   ② un membre qui QUITTE un groupe ne relit ni les messages ni la liste
  //      des membres (DELETE conv_members par soi-même) ;
  //   ③ `event_attendees` : la liste nominative d'un événement où l'on n'est
  //      PAS inscrit (C-04 : policy SELECT `true` pour tout compte connecté).
  //
  // ⚠️ ③ EST CONDITIONNEL (décision C-04 tranchée le 2026-11-03,
  // `migrations/migration_participants_visibilite_2026-11-03.sql`) : la cible
  // est SONDÉE (RPC `participants_compte`). Migration absente → le cas reste un
  // « échec attendu » (`test.fail()`), CI verte ; migration présente → verrou
  // ordinaire, qui exige aussi le NOMBRE public et les colonnes de retour
  // fermées. Même mécanique que B-02 (multi-comptes).
  // ① est un verrou ordinaire : la cible de
  // la CI (staging) refuse déjà le tiers ; la production le refusera après la
  // migration du 2026-11-02. ② passe aujourd'hui et doit continuer de passer.
  // ═════════════════════════════════════════════════════════════════════════
  test("AUDIT E — accusé de lecture d'un tiers (C-01) : refusé pour le non-membre, accepté pour le membre", async ({ browser }) => {
    test.setTimeout(240000);
    // ⚠️ Mesuré en CI le 2026-11-02 (run 41546466427) : la CIBLE de ce job est le
    // STAGING, et il REFUSE déjà l'accusé d'un tiers (HTTP 403, 42501) — alors que
    // le catalogue de la PRODUCTION (`pg_policies`, canal ①) porte encore
    // `reads_upsert` sans appartenance (C-01). Staging et production divergent
    // sur cette policy : le cas est donc un verrou ORDINAIRE (vert sur la cible
    // de la CI) et il reste rouge contre la production tant que
    // `migrations/migration_audit_2026-11-02_oracles_et_privileges.sql` n'y
    // est pas appliquée — ce qui est exactement ce qu'il doit dire.
    const log = (m) => console.log(`[conf-reads] ${m}`);
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
    const A = await ctxA.newPage(), B = await ctxB.newPage(), C = await ctxC.newPage();
    wireHttpDiag(log, [{ who: "A", page: A }, { who: "B", page: B }, { who: "C", page: C }]);
    let convId = null;
    try {
      const [uidA, uidB, uidC] = await Promise.all([signupUser(A, "Reads Alice"), signupUser(B, "Reads Bob"), signupUser(C, "Reads Carol")]);
      expect(uidA && uidB && uidC).toBeTruthy();
      convId = await A.evaluate(async (buid) => supaCreateConversation(buid), uidB);
      expect(convId, "conversation A↔B créée").toBeTruthy();

      // Le MEMBRE dépose le sien (contre-épreuve : la table n'est pas fermée à tous).
      const membre = await B.evaluate(async (id) => { const r = await supa.from("conv_reads").upsert({ conv_id: id, user_id: MY_UID, last_read_at: new Date().toISOString() }, { onConflict: "conv_id,user_id" }).select("conv_id"); return { status: r.status, n: (r.data || []).length, err: r.error && r.error.code }; }, convId);
      expect(membre.status, "CONTRE-ÉPREUVE : le membre B dépose son accusé").toBeLessThan(300);

      // Le TIERS tente le même geste : le contrat attendu est un refus.
      const tiers = await C.evaluate(async (id) => { const r = await supa.from("conv_reads").upsert({ conv_id: id, user_id: MY_UID, last_read_at: new Date().toISOString() }, { onConflict: "conv_id,user_id" }); return { status: r.status, err: r.error && r.error.code }; }, convId);
      log("tiers C upsert conv_reads → HTTP " + tiers.status + " " + (tiers.err || ""));
      expect(tiers.status, "un non-membre ne dépose PAS d'accusé de lecture dans la conversation d'autrui").toBeGreaterThanOrEqual(400);
      // Et les membres ne voient aucun accusé d'un inconnu.
      const vus = await A.evaluate(async (id) => { const r = await supa.from("conv_reads").select("user_id").eq("conv_id", id); return (r.data || []).map((x) => x.user_id); }, convId);
      expect(vus, "A ne voit aucun accusé de C").not.toContain(uidC);
    } finally {
      try { await C.evaluate(async (id) => { try { await supa.from("conv_reads").delete().eq("conv_id", id).eq("user_id", MY_UID); } catch (e) {} }, convId); } catch (e) {}
      try { await A.evaluate(async (id) => { try { await supa.from("conv_reads").delete().eq("conv_id", id); } catch (e) {} try { await supa.from("conv_members").delete().eq("conv_id", id); } catch (e) {} try { await supa.from("conversations").delete().eq("id", id); } catch (e) {} }, convId); } catch (e) {}
      for (const p of [A, B, C]) { try { await p.evaluate(async () => { try { await supa.from("conv_members").delete().eq("user_id", MY_UID); } catch (e) {} try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {} try { await supa.auth.signOut(); } catch (e) {} }); } catch (e) {} }
      await ctxA.close(); await ctxB.close(); await ctxC.close();
    }
  });

  test("AUDIT E — un membre qui quitte un groupe ne relit plus rien ; un non-membre ne lit rien par identifiant", async ({ browser }) => {
    test.setTimeout(240000);
    const log = (m) => console.log(`[conf-groupe] ${m}`);
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
    const A = await ctxA.newPage(), B = await ctxB.newPage(), C = await ctxC.newPage();
    wireHttpDiag(log, [{ who: "A", page: A }, { who: "B", page: B }, { who: "C", page: C }]);
    let grpId = null;
    try {
      const [uidA, uidB, uidC] = await Promise.all([signupUser(A, "Grp Alice"), signupUser(B, "Grp Bob"), signupUser(C, "Grp Carol")]);
      expect(uidA && uidB && uidC).toBeTruthy();
      grpId = await A.evaluate(async (buid) => supaCreateGroup("Groupe audit E", [buid], null), uidB);
      expect(grpId, "groupe A+B créé").toBeTruthy();
      const msgId = "msg_" + Date.now().toString(36);
      const envoi = await A.evaluate(async ([id, mid]) => { const r = await supa.from("conv_messages").insert({ id: mid, conv_id: id, from_id: MY_UID, content: "secret du groupe", created_at: new Date().toISOString() }); return r.status; }, [grpId, msgId]);
      expect(envoi, "A écrit dans le groupe").toBeLessThan(300);

      // PRÉCONDITION : B, membre, lit.
      const avant = await B.evaluate(async (id) => { const r = await supa.from("conv_messages").select("id").eq("conv_id", id); return (r.data || []).length; }, grpId);
      expect(avant, "PRÉCONDITION : le membre B lit le message").toBe(1);

      // B quitte (DELETE sur SA ligne conv_members — le geste de `leaveGroup`).
      const sortie = await B.evaluate(async (id) => { const r = await supa.from("conv_members").delete().eq("conv_id", id).eq("user_id", MY_UID).select("user_id"); return (r.data || []).length; }, grpId);
      expect(sortie, "B a retiré sa propre ligne").toBe(1);
      const apres = await B.evaluate(async (id) => { const m = await supa.from("conv_messages").select("id").eq("conv_id", id); const mb = await supa.from("conv_members").select("user_id").eq("conv_id", id); return { msgs: (m.data || []).length, membres: (mb.data || []).length }; }, grpId);
      expect(apres.msgs, "B parti ne relit plus les messages").toBe(0);
      expect(apres.membres, "ni la liste des membres").toBe(0);

      // C, jamais membre, par identifiant : rien, et pas d'écriture non plus.
      const tiers = await C.evaluate(async (id) => {
        const m = await supa.from("conv_messages").select("id,content").eq("conv_id", id);
        const w = await supa.from("conv_messages").insert({ id: "msg_intrus_" + Date.now(), conv_id: id, from_id: MY_UID, content: "intrus", created_at: new Date().toISOString() });
        const j = await supa.from("conv_members").insert({ conv_id: id, user_id: MY_UID });
        return { msgs: (m.data || []).length, insert: w.status, join: j.status };
      }, grpId);
      expect(tiers.msgs, "C ne lit rien").toBe(0);
      expect(tiers.insert, "C ne peut pas écrire").toBeGreaterThanOrEqual(400);
      expect(tiers.join, "C ne peut pas s'ajouter lui-même au groupe").toBeGreaterThanOrEqual(400);
      log("✅ groupe : sortie et tiers étanches");
    } finally {
      try { await A.evaluate(async (id) => { try { await supa.from("conv_messages").delete().eq("conv_id", id); } catch (e) {} try { await supa.from("conv_members").delete().eq("conv_id", id); } catch (e) {} try { await supa.from("conversations").delete().eq("id", id); } catch (e) {} }, grpId); } catch (e) {}
      for (const p of [A, B, C]) { try { await p.evaluate(async () => { try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {} try { await supa.auth.signOut(); } catch (e) {} }); } catch (e) {} }
      await ctxA.close(); await ctxB.close(); await ctxC.close();
    }
  });

  test("AUDIT E — participants d'un événement où l'on n'est pas inscrit (C-04) : invisibles au tiers, visibles à l'organisateur", async ({ browser }) => {
    test.setTimeout(240000);
    const log = (m) => console.log(`[conf-attendees] ${m}`);
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
    const A = await ctxA.newPage(), B = await ctxB.newPage(), C = await ctxC.newPage();
    wireHttpDiag(log, [{ who: "A", page: A }, { who: "B", page: B }, { who: "C", page: C }]);
    let eventId = null;
    try {
      const [uidA, uidB, uidC] = await Promise.all([signupUser(A, "Att Alice"), signupUser(B, "Att Bob"), signupUser(C, "Att Carol")]);
      expect(uidA && uidB && uidC).toBeTruthy();

      // La migration de visibilité (C-04) est-elle appliquée sur la CIBLE ? La
      // production la reçoit en premier, le staging peut-être jamais. Sondée
      // SOUS UN COMPTE : la RPC n'est pas ouverte à `anon`, une sonde anonyme
      // lirait un refus de droit (42501) comme une présence. Tableau vide :
      // aucune activité visée, rien n'est lu. Absente (PGRST202) → le cas reste
      // un « échec ATTENDU » qui épingle le contrat ; présente → verrou ordinaire.
      const sonde = await C.evaluate(async () => {
        const r = await supa.rpc("participants_compte", { p_event_ids: [] });
        return { status: r.status, code: (r.error && String(r.error.code || "?")) || null };
      });
      log("RPC participants_compte sur la cible : " + JSON.stringify(sonde));
      expect(sonde.code === null || sonde.code === "PGRST202", "sonde lisible : présente, ou absente en PGRST202 — " + JSON.stringify(sonde)).toBe(true);
      const migree = sonde.code === null;
      test.fail(!migree, "C-04 : sans migrations/migration_participants_visibilite_2026-11-03.sql, `event_attendees` se lit `USING (true)` — tout compte connecté lit qui va à quelle rencontre");

      eventId = await A.evaluate(async () => { const id = "evt_" + uid(); const ok = await supaPublishEvent({ id, title: "Liste des présents", passion: "musique", city: "Paris", emoji: "🎸", date: Date.now() + 86400000 }); return ok ? id : null; });
      expect(eventId).toBeTruthy();
      const rsvpB = await B.evaluate(async (eid) => supaSetEventRsvp(eid, "going"), eventId);
      expect(rsvpB, "B s'inscrit").toBe(true);
      // CONTRE-ÉPREUVE : l'organisateur voit sa liste (colonnes restées lisibles seulement).
      const orga = await A.evaluate(async (eid) => { const r = await supa.from("event_attendees").select("user_id,rsvp,checked_in_at").eq("event_id", eid); return { status: r.status, lignes: r.data || [] }; }, eventId);
      expect(orga.status, "l'organisateur lit sa liste sans refus").toBeLessThan(300);
      expect(orga.lignes.map((x) => x.user_id), "CONTRE-ÉPREUVE : l'organisateur lit la liste nominative").toContain(uidB);
      // Le TIERS, connecté mais ni inscrit ni organisateur : le contrat attendu est « rien ».
      // ⚠️ `user_id,rsvp` SEULEMENT : une colonne retirée dans la projection
      // (`feedback`, `rating`) ferait refuser la requête ENTIÈRE (42501) après la
      // migration — le tiers « ne verrait rien » pour une autre raison que la
      // policy, un faux vert. La lecture doit être ACCEPTÉE et filtrée.
      const tiers = await C.evaluate(async (eid) => { const r = await supa.from("event_attendees").select("user_id,rsvp").eq("event_id", eid); return { status: r.status, code: r.error && String(r.error.code || ""), ids: (r.data || []).map((x) => x.user_id) }; }, eventId);
      log("tiers C lit " + tiers.ids.length + " participant(s) d'un événement où il n'est pas inscrit (HTTP " + tiers.status + ")");
      expect(tiers.status, "la lecture du tiers est acceptée (filtrée par la policy, pas refusée)").toBeLessThan(300);
      expect(tiers.ids, "un compte sans lien avec l'événement ne lit pas qui y va").not.toContain(uidB);

      // ── Migration appliquée : ce qui reste ouvert, et ce qui est fermé ──────
      // ① Le NOMBRE reste public parmi les connectés (preuve sociale, places
      // restantes) : le tiers le lit par la RPC, au compte près — attendu
      // recalculé depuis la liste de l'organisateur, même règle que la RPC.
      const attendu = {
        event_id: eventId,
        going: orga.lignes.filter((x) => !["maybe", "waitlist", "declined"].includes(x.rsvp || "going")).length,
        maybe: orga.lignes.filter((x) => x.rsvp === "maybe").length,
        waitlist: orga.lignes.filter((x) => x.rsvp === "waitlist").length,
        checked_in: orga.lignes.filter((x) => x.checked_in_at).length,
      };
      expect(attendu.going, "prémisse : B compte parmi les venants").toBeGreaterThanOrEqual(1);
      const compte = await C.evaluate(async (eid) => { const r = await supa.rpc("participants_compte", { p_event_ids: [eid] }); return { err: r.error ? String(r.error.code) + " " + r.error.message : null, lignes: r.data || [] }; }, eventId);
      expect(compte.err, "le tiers appelle participants_compte").toBeNull();
      expect(compte.lignes, "…et lit le NOMBRE exact, sans aucun nom").toEqual([attendu]);
      // ② Les retours d'expérience ne se lisent plus en direct : refus de COLONNE.
      for (const col of ["feedback", "rating", "rated_at"]) {
        const r = await C.evaluate(async ([eid, c]) => { const x = await supa.from("event_attendees").select(c).eq("event_id", eid); return { status: x.status, code: x.error ? String(x.error.code || "") : null }; }, [eventId, col]);
        expect(r.code, "colonne `" + col + "` illisible pour le tiers (42501) — HTTP " + r.status).toBe("42501");
      }
      // ③ B, inscrit, lit toujours SA ligne.
      const propre = await B.evaluate(async (eid) => { const r = await supa.from("event_attendees").select("user_id,rsvp").eq("event_id", eid).eq("user_id", MY_UID); return { status: r.status, lignes: r.data || [] }; }, eventId);
      expect(propre.status).toBeLessThan(300);
      expect(propre.lignes, "B lit sa propre inscription").toEqual([{ user_id: uidB, rsvp: "going" }]);
      log("✅ C-04 : liste par lien, nombre public, retours fermés");
    } finally {
      for (const p of [B]) { try { await p.evaluate(async (eid) => { try { await supa.from("event_attendees").delete().eq("event_id", eid).eq("user_id", MY_UID); } catch (e) {} }, eventId); } catch (e) {} }
      try { await A.evaluate(async (eid) => { try { await supa.from("events").delete().eq("id", eid); } catch (e) {} }, eventId); } catch (e) {}
      for (const p of [A, B, C]) { try { await p.evaluate(async () => { try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {} try { await supa.auth.signOut(); } catch (e) {} }); } catch (e) {} }
      await ctxA.close(); await ctxB.close(); await ctxC.close();
    }
  });
});
