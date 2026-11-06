// ═══════════════════════════════════════════════════════════════════════════
// VERROU — RV-38 : A ÉPINGLE UN COMMENTAIRE DE SA PUBLICATION, B LE VOIT APRÈS
// RECHARGEMENT — ENTRE DEUX VRAIS COMPTES, SUR LE STAGING (audit 2026-11-02)
//
// POURQUOI CETTE SUITE. Aucune épingle n'avait jamais atteint la base :
// `ci_kind_check` refusait « pin » (23514) et le client avalait le refus. Seul un
// vrai serveur dit si l'épingle passe, et seul un AUTRE compte, après
// rechargement, dit si elle est partagée.
//
// LA SONDE décide de ce qu'on peut exiger : une épingle sur un commentaire INCONNU
// rend 23514 sans la migration (`ci_kind_check`), 42501 avec (la garde
// `trg_ci_epingle_garde`) — et rien ne s'écrit, dans un cas comme dans l'autre.
//   · migration ABSENTE : A épingle par le vrai chemin (`togglePinComment`) ; le
//     refus du vrai serveur est DIT et DÉFAIT chez A, aucune ligne n'est écrite —
//     puis la suite se déclare sautée, en le disant : le partage reste à prouver ;
//   · migration PRÉSENTE : A épingle ; B, après RECHARGEMENT, voit l'épingle en
//     tête de la discussion ; B ne peut pas épingler chez A (42501, l'indice de
//     la garde) ; A retire, et B, rechargé, ne la voit plus.
//
// ⚠️ ELLE ÉCRIT : opt-in `PASSIO_E2E_MULTI`, et elle REFUSE tout autre projet que
// le staging, côté banc ET côté page. La production n'a jamais de compte de cette
// suite. Fiche : docs/journal/serveur-securite-base.md, « 📌 RV-38 ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { cibleSupabase } = require("./cible-supabase");
const { configAdmin } = require("./compte-e2e");
const { signupUser } = require("./qa-helper");

const STAGING = "fcksxofaelcdmmifnwjo";
const INDICE = "épingle : réservée au propriétaire du fil, sur un commentaire de ce fil";

test("RV-38 : A épingle un commentaire de sa publication, B le voit après rechargement", async ({ browser }, testInfo) => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "crée de vrais comptes : opt-in PASSIO_E2E_MULTI, sur le staging seulement");
  test.setTimeout(260000);

  const cfg = configAdmin();
  const cible = cibleSupabase();
  if (!cible || !cible.url.includes(STAGING) || !cfg || !cfg.url.includes(STAGING)) {
    throw new Error("la cible de cette suite n'est pas le staging : elle n'écrit rien");
  }

  const t0 = Date.now();
  const noter = (m) => console.log(`[RV-38 ${((Date.now() - t0) / 1000) | 0} s] ${m}`);
  const contextes = [];
  const uids = [];
  const aNettoyer = { post: null, commentaire: null };
  const entetes = { apikey: cfg.cle, Authorization: "Bearer " + cfg.cle };
  // Les épingles du fil, lues par la clé de service (la vérité de la base, hors RLS).
  const epinglesEnBase = async (pid) => {
    const r = await fetch(cfg.url + "/rest/v1/comment_interactions?select=comment_id,user_id,payload&kind=eq.pin&post_id=eq." + encodeURIComponent(pid) + "&order=created_at.asc", { headers: entetes });
    if (!r.ok) throw new Error("lecture des épingles : HTTP " + r.status);
    return r.json();
  };

  const ouvrir = async (nom) => {
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    contextes.push(ctx);
    const page = await ctx.newPage();
    const uidCompte = await signupUser(page, nom);
    uids.push(uidCompte);
    const vise = await page.evaluate(() => (typeof SUPABASE_URL === "string" ? SUPABASE_URL : null));
    if (!vise || !vise.includes(STAGING)) throw new Error("la page ne vise pas le staging : " + vise);
    return { page, uid: uidCompte };
  };
  // Ouvre la discussion de P chez un compte : la publication relue par le vrai
  // chemin (`supaLoadPosts`), puis `openComments` (commentaires + interactions).
  const ouvrirDiscussion = async (compte, pid, cid, auteur) => {
    await compte.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 45000 });
    await compte.page.evaluate(() => { try { stopFeedRefreshLoop(); } catch (e) {} try { stopPostLikeRefresh(); } catch (e) {} });
    let trouvee = false;
    for (let essai = 0; essai < 12 && !trouvee; essai++) {
      trouvee = await compte.page.evaluate(async ([p, a]) => {
        const posts = await supaLoadPosts(0, a);
        const post = (posts || []).find((x) => x.id === p);
        if (!post) return false;
        state.supabasePosts = [post].concat((state.supabasePosts || []).filter((x) => x.id !== p));
        return true;
      }, [pid, auteur]);
      if (!trouvee) await compte.page.waitForTimeout(1500);
    }
    expect(trouvee, "la publication de A est lue").toBe(true);
    await compte.page.evaluate(async (p) => { window._cmtThreadLoadedAt = {}; await openComments(p); }, pid);
    await expect(compte.page.locator(`#commentsBox .comment[data-commentid="${cid}"]`)).toHaveCount(1, { timeout: 20000 });
  };
  const etatDiscussion = (compte, pid, cid) => compte.page.evaluate(([p, c]) => {
    const post = findPostAnywhere(p);
    const n = ((post && post.comments) || []).find((x) => x.id === c) || {};
    const doms = Array.from(document.querySelectorAll("#commentsBox .comment[data-commentid]"));
    return {
      // La vérité du FIL (celle du rendu), pas le drapeau d'un objet qu'une page reconstruit.
      epingle: _estEpingle(p, n),
      enTete: doms.length ? doms[0].getAttribute("data-commentid") === c : false,
      badge: !!document.querySelector('#commentsBox .comment[data-commentid="' + c + '"] .cmt-pinned-badge'),
    };
  }, [pid, cid]);
  const epinglerChezA = (A, pid, cid) => A.page.evaluate(async ([p, c]) => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (t) { window.__toasts.push(String(t)); return vrai.apply(this, arguments); };
    try { await togglePinComment(p, c); } finally { window.toast = vrai; }
    const n = findPostAnywhere(p).comments.find((x) => x.id === c) || {};
    // Les seuls toasts de l'épingle : une notification qui arrive au même moment
    // (un autre run partage le staging) ne doit pas faire rougir le cas.
    return { epingle: _estEpingle(p, n), toasts: window.__toasts.filter((t) => /pingl/i.test(t)) };
  }, [pid, cid]);

  try {
    const A = await ouvrir("Essai Ana");
    const B = await ouvrir("Essai Basile");

    // A est PUBLIQUE (un compte neuf est privé par défaut) : B doit lire sa publication.
    const publication = await A.page.evaluate(async () => {
      state.user.general = state.user.general || {};
      state.user.general.isPrivate = false; state.user.general.privacyChoisi = true;
      saveState();
      await supaUpsertProfile();
      const pub = await supa.from("profiles").update({ is_private: false }).eq("id", MY_UID).select("id");
      if (pub.error || !(pub.data || []).length) return { erreur: "profil public : " + ((pub.error && pub.error.message) || "0 ligne") };
      const pid = "post_" + uid();
      const p = await supa.from("posts").insert([{ id: pid, author_id: MY_UID, passion_id: "musique", mood: "all",
        content: "Publication RV-38 [test auto]", media_url: null, created_at: new Date().toISOString() }]);
      if (p.error) return { erreur: "publication : " + p.error.code + " " + p.error.message };
      return { postId: pid };
    });
    expect(publication.erreur, "A publie").toBeUndefined();
    const P = publication.postId;
    aNettoyer.post = P;
    // B commente la publication de A (le cas réel : on épingle le commentaire d'un autre).
    const commentaire = await B.page.evaluate(async (pid) => {
      const cid = "c_" + uid();
      const c = await supa.from("post_comments").insert({ id: cid, post_id: pid, author_id: MY_UID,
        content: "Commentaire de B, à épingler [test auto]", created_at: new Date().toISOString() });
      return c.error ? { erreur: c.error.code + " " + c.error.message } : { commentId: cid };
    }, P);
    expect(commentaire.erreur, "B commente").toBeUndefined();
    const C = commentaire.commentId;
    aNettoyer.commentaire = C;
    noter("A=" + A.uid + " B=" + B.uid + " publication " + P + " commentaire " + C);

    // ── La SONDE : une épingle sur un commentaire inconnu ne s'écrit jamais ──
    const sonde = await A.page.evaluate(async (pid) => {
      const r = await supa.from("comment_interactions").insert({ id: "ci_" + uid(), comment_id: "c_sonde_rv38_" + uid(), post_id: pid,
        user_id: MY_UID, kind: "pin", payload: "1", created_at: new Date().toISOString() });
      return r.error ? { code: r.error.code, indice: r.error.hint || "" } : { code: "ok" };
    }, P);
    if (sonde.code !== "23514" && sonde.code !== "42501") throw new Error("sonde inattendue : " + JSON.stringify(sonde));
    const migrationPresente = sonde.code === "42501";
    noter("migration RV-38 sur le staging : " + (migrationPresente ? "PRÉSENTE (la garde refuse l'inconnu)" : "ABSENTE (ci_kind_check refuse « pin »)"));
    if (migrationPresente) expect(sonde.indice, "le refus porte l'indice de la garde").toBe(INDICE);

    await ouvrirDiscussion(A, P, C, A.uid);

    if (!migrationPresente) {
      await test.step("migration absente : le refus du vrai serveur est DIT et DÉFAIT chez A", async () => {
        const r = await epinglerChezA(A, P, C);
        expect(r, "l'épingle refusée ne reste pas à l'écran, et c'est dit").toEqual({
          epingle: false, toasts: ["L'épingle n'est pas encore disponible : rien n'a été enregistré"],
        });
        expect(await epinglesEnBase(P), "rien n'est écrit").toEqual([]);
      });
      test.skip(true, "RV-38 : migration absente du staging — refus dit et défait, mesuré ; le partage (B voit l'épingle) se prouve après application de migration_epingle_commentaire_2026-11-05.sql");
      return;
    }

    await test.step("A épingle le commentaire de B : accepté, écrit, à l'écran", async () => {
      const r = await epinglerChezA(A, P, C);
      expect(r).toEqual({ epingle: true, toasts: ["Commentaire épinglé"] });
      expect(await epinglesEnBase(P)).toEqual([{ comment_id: C, user_id: A.uid, payload: "1" }]);
      expect(await etatDiscussion(A, P, C)).toEqual({ epingle: true, enTete: true, badge: true });
    });

    await test.step("B, après RECHARGEMENT, voit l'épingle en tête de la discussion", async () => {
      await B.page.reload();
      await ouvrirDiscussion(B, P, C, A.uid);
      await expect.poll(() => etatDiscussion(B, P, C), { timeout: 20000, message: "B voit l'épingle de A" })
        .toEqual({ epingle: true, enTete: true, badge: true });
      await expect(B.page.locator(`#commentsBox .comment[data-commentid="${C}"] .cmt-pinned-badge`)).toHaveText("Épinglé");
    });

    await test.step("B ne peut pas épingler chez A : la garde refuse (42501), rien ne s'écrit", async () => {
      const r = await B.page.evaluate(async ([pid, cid]) => {
        const x = await supa.from("comment_interactions").insert({ id: "ci_" + uid(), comment_id: cid, post_id: pid,
          user_id: MY_UID, kind: "pin", payload: "0", created_at: new Date().toISOString() });
        return x.error ? { code: x.error.code, indice: x.error.hint || "" } : { code: "ok" };
      }, [P, C]);
      expect(r).toEqual({ code: "42501", indice: INDICE });
      expect(await epinglesEnBase(P), "toujours la seule épingle de A").toEqual([{ comment_id: C, user_id: A.uid, payload: "1" }]);
    });

    await test.step("A retire l'épingle : B, rechargé, ne la voit plus", async () => {
      const r = await epinglerChezA(A, P, C);
      expect(r).toEqual({ epingle: false, toasts: ["Épingle retirée"] });
      await B.page.reload();
      await ouvrirDiscussion(B, P, C, A.uid);
      await expect.poll(() => etatDiscussion(B, P, C), { timeout: 20000 }).toMatchObject({ epingle: false, badge: false });
    });
  } finally {
    // Nettoyage ciblé : mes lignes et mes comptes. Le teardown de la CI purge par motif,
    // mais une exécution locale n'a pas de teardown (il effacerait les comptes d'un autre run).
    const supprimer = (chemin) => fetch(cfg.url + "/rest/v1/" + chemin, { method: "DELETE", headers: { ...entetes, Prefer: "return=minimal" } }).catch(() => null);
    if (uids.length) {
      const liste = uids.join(",");
      await supprimer(`comment_interactions?user_id=in.(${liste})`);
      if (aNettoyer.commentaire) await supprimer(`post_comments?id=eq.${aNettoyer.commentaire}`);
      if (aNettoyer.post) await supprimer(`posts?id=eq.${aNettoyer.post}`);
      await supprimer(`notifications?user_id=in.(${liste})`);
      await supprimer(`notifications?from_id=in.(${liste})`);
      await supprimer(`profiles?id=in.(${liste})`);
      for (const u of uids) await fetch(cfg.url + "/auth/v1/admin/users/" + u, { method: "DELETE", headers: entetes }).catch(() => null);
    }
    for (const ctx of contextes) await ctx.close().catch(() => {});
  }
});
