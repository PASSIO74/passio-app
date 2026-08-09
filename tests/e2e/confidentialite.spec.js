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

      // A passe son compte en PRIVÉ via le VRAI chemin (état + supaUpsertProfile) :
      // un simple UPDATE serait réécrit par l'upsert différé de supaInit (qui relit
      // l'état local, isPrivate=false par défaut). On vérifie ensuite que ça a pris.
      await A.evaluate(async () => {
        state.user.general = state.user.general || {};
        state.user.general.isPrivate = true;
        await supaUpsertProfile();
      });
      const isPriv = await A.evaluate(async () => {
        const start = Date.now();
        while (Date.now() - start < 8000) {
          const { data } = await supa.from("profiles").select("is_private").eq("id", MY_UID).maybeSingle();
          if (data && data.is_private === true) return true;
          await supaUpsertProfile();
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
});
