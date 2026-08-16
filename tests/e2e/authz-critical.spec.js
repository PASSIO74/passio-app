// ═══════════════════════════════════════════════════════════════════════════
// AUTHZ-CRITICAL — noyau d'invariants d'autorisation, NON SKIPPABLE en CI.
//
// Pourquoi ce fichier existe (incident CI-GATE-001, 2026-08-15) : la CI validait
// chaque déploiement en production avec une suite qui n'exerçait NI la séparation
// entre comptes, NI la confidentialité, NI le realtime cross-compte. Les seules
// specs qui le faisaient (multi-comptes, confidentialite, qa-campaign) sont
// opt-in par variable d'environnement, absente du workflow : elles étaient les
// 12 tests « skipped ». Un changement de policy dangereux pouvait donc partir
// directement en prod sans aucune preuve.
//
// Ce noyau est le filet minimal : COURT (une poignée d'assertions), DÉTERMINISTE
// (aucune attente de realtime, aucun timing), et surtout IMPOSSIBLE À SKIPPER.
// Il ne remplace pas multi-comptes.spec.js — il garantit qu'on ne déploie jamais
// une régression d'autorisation.
//
// ⚠️ Il écrit en base RÉELLE : 2 comptes e2e + 1 post, nettoyés en fin de test.
// Aucun secret CI n'est requis : l'inscription utilise la clé anon, déjà publique
// côté client par conception Supabase.
//
// Règle de contenu : on n'assère ICI que des invariants qui TIENNENT aujourd'hui.
// Un invariant souhaité mais non encore satisfait (ex. usurpation par author_name,
// cf. F4) rejoint ce fichier EN MÊME TEMPS que son correctif — sinon on bloque
// tous les déploiements avec un rouge connu, ce qui pousse à désactiver le gate.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

test.describe("AUTHZ-CRITICAL — séparation entre comptes", () => {
  test("un compte ne peut ni lire, ni écrire, ni altérer ce qui appartient à un autre", async ({ page }) => {
    test.setTimeout(120000);
    const log = (m) => console.log(`[authz] ${m}`);

    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html");
    await page.waitForFunction(
      () => typeof supa !== "undefined" && !!supa && !!window.PASSIO_SUPABASE,
      null, { timeout: 30000 },
    );

    // ── Deux comptes réels. signUp bascule la session : on capture le jeton
    //    de A AVANT de créer B, sinon on ne dispose plus que de celui de B.
    const mkAccount = async (tag) => {
      const out = await page.evaluate(async (t) => {
        const email = `e2e_authz_${t}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@passio-e2e.test`;
        const { data, error } = await supa.auth.signUp({ email, password: "Passio-e2e-12345!" });
        if (error || !data || !data.session) return { error: (error && error.message) || "pas de session" };
        return { uid: data.session.user.id, token: data.session.access_token };
      }, tag);
      expect(out.error, `compte ${tag} créé`).toBeUndefined();
      return out;
    };

    const A = await mkAccount("a");
    const B = await mkAccount("b");
    expect(A.uid).not.toBe(B.uid);
    log(`A=${A.uid} B=${B.uid}`);

    // ── Appel REST brut : c'est la vraie frontière. Passer par l'UI testerait
    //    la politesse du client, pas la RLS. Un attaquant, lui, appelle ceci.
    const rest = (token, path, init = {}) =>
      page.evaluate(async ([tok, p, i]) => {
        const cfg = window.PASSIO_SUPABASE;
        const res = await fetch(cfg.url + "/rest/v1/" + p, {
          ...i,
          headers: {
            apikey: cfg.anon,
            ...(tok ? { Authorization: "Bearer " + tok } : {}),
            "Content-Type": "application/json",
            Prefer: "return=representation",
            ...(i.headers || {}),
          },
        });
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        return { status: res.status, body };
      }, [token, path, init]);

    const postId = `post_authz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      // ── Chaque compte a besoin de son profil : posts.author_id RÉFÉRENCE
      //    profiles(id). Sans profil, publier renvoie 409 (violation de clé
      //    étrangère) — un garde d'intégrité utile, découvert en écrivant ce test.
      for (const [tag, acc] of [["A", A], ["B", B]]) {
        const p = await rest(acc.token, "profiles", {
          method: "POST",
          body: JSON.stringify({ id: acc.uid, username: `e2e_authz_${tag.toLowerCase()}` }),
        });
        expect(p.status, `profil ${tag} créé`).toBeLessThan(300);
      }
      log("profils A et B créés");

      // ── 0. B ne peut PAS se fabriquer un profil portant l'identité de A ────
      //    C'est l'attaque « choisir le côté acteur de la relation » : si elle
      //    passait, tout le reste des vérifications d'appartenance s'effondre.
      const stolenProfile = await rest(B.token, "profiles", {
        method: "POST",
        body: JSON.stringify({ id: A.uid, username: "usurpateur" }),
      });
      expect(stolenProfile.status, "B crée un profil sous l'id de A → doit être refusé")
        .toBeGreaterThanOrEqual(400);
      log(`profil usurpé refusé (HTTP ${stolenProfile.status})`);

      // ── A publie un post qui lui appartient ────────────────────────────────
      const created = await rest(A.token, "posts", {
        method: "POST",
        body: JSON.stringify({ id: postId, author_id: A.uid, content: "authz canary" }),
      });
      expect(created.status, "A publie son propre post").toBeLessThan(300);
      log("post de A créé");

      // ── 1. B ne peut PAS écrire en se faisant passer pour A ────────────────
      const forged = await rest(B.token, "posts", {
        method: "POST",
        body: JSON.stringify({ id: `${postId}_forged`, author_id: A.uid, content: "usurpation" }),
      });
      expect(forged.status, "B écrit sous l'identité de A → doit être refusé").toBeGreaterThanOrEqual(400);
      log(`usurpation d'auteur refusée (HTTP ${forged.status})`);

      // ── 2. B ne peut PAS modifier le post de A ─────────────────────────────
      //    ⚠️ Un UPDATE refusé par la RLS ne lève PAS : il touche 0 ligne et
      //    renvoie 200. C'est exactement le piège maison « écriture qui échoue
      //    en silence » : on assère donc sur le NOMBRE DE LIGNES, pas le statut.
      const patched = await rest(B.token, `posts?id=eq.${postId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: "altéré par B" }),
      });
      expect(Array.isArray(patched.body) ? patched.body.length : 0,
        "B modifie le post de A → doit toucher 0 ligne").toBe(0);
      log("modification cross-compte : 0 ligne touchée");

      // ── 3. B ne peut PAS supprimer le post de A ────────────────────────────
      const deleted = await rest(B.token, `posts?id=eq.${postId}`, { method: "DELETE" });
      expect(Array.isArray(deleted.body) ? deleted.body.length : 0,
        "B supprime le post de A → doit toucher 0 ligne").toBe(0);
      log("suppression cross-compte : 0 ligne touchée");

      // ── 4. Le post de A a réellement survécu ───────────────────────────────
      const still = await rest(A.token, `posts?id=eq.${postId}&select=id,content`);
      expect(Array.isArray(still.body) && still.body.length, "le post de A existe toujours").toBe(1);
      expect(still.body[0].content, "le contenu de A est intact").toBe("authz canary");
      log("intégrité du post de A confirmée");

      // ── 5. B ne voit pas les notifications de A ────────────────────────────
      //    (notifications est scellée sur user_id = auth.uid())
      const notifs = await rest(B.token, `notifications?user_id=eq.${A.uid}&select=id`);
      expect(Array.isArray(notifs.body) ? notifs.body.length : 0,
        "B lit les notifications de A → doit être vide").toBe(0);
      log("notifications d'autrui : invisibles");

      // ── 6. Les messages privés ne sont pas lisibles hors conversation ──────
      //    Non-régression de la fuite critique corrigée le 2026-08-09, où
      //    conv_messages avait un SELECT `USING true` : tout compte authentifié
      //    lisait TOUS les DM de tout le monde.
      const dms = await rest(B.token, "conv_messages?select=id&limit=5");
      expect(Array.isArray(dms.body) ? dms.body.length : 0,
        "B lit des messages privés dont il n'est pas membre → doit être vide").toBe(0);
      log("messages privés d'autrui : invisibles");

      // ── 7. La télémétrie n'est lisible par personne (insert-own, aucun select)
      const tel = await rest(B.token, "telemetry_events?select=event_id&limit=1");
      expect(Array.isArray(tel.body) ? tel.body.length : 0,
        "la télémétrie ne doit être lisible par aucun client").toBe(0);
      log("télémétrie : non lisible côté client");

      // ── 8. B ne peut pas AFFICHER l'identité d'un autre (F4) ───────────────
      //    Les policies ne contraignent que l'identifiant : `author_name`,
      //    `author_photo` et `author_emoji` étaient du texte libre, jamais
      //    recoupé avec `profiles`, et rendus tels quels. Un compte pouvait donc
      //    publier sous SON author_id avec le NOM et la PHOTO d'un tiers. Ce
      //    n'est pas une XSS — l'échappement tient — c'est une usurpation.
      //    Le trigger `identite_affichage_canonique` (BEFORE INSERT OR UPDATE)
      //    réécrit ces champs depuis la source canonique. On le prouve ici.
      const liveId = `vl_authz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const usurpe = await rest(B.token, "video_lives", {
        method: "POST",
        body: JSON.stringify({
          id: liveId, author_id: B.uid, status: "live",
          started_at: new Date().toISOString(), last_seen: new Date().toISOString(),
          author_name: "e2e_authz_a", author_photo: "https://exemple.test/victime.jpg",
        }),
      });
      expect(usurpe.status, "B crée un live").toBeLessThan(300);
      const ligne = Array.isArray(usurpe.body) ? usurpe.body[0] : usurpe.body;
      expect(ligne.author_name, "le nom proposé par le client doit être RÉÉCRIT depuis profiles")
        .toBe("e2e_authz_b");
      expect(ligne.author_photo, "la photo proposée par le client doit être écrasée")
        .not.toBe("https://exemple.test/victime.jpg");
      log("usurpation d'identité d'affichage neutralisée à l'INSERT");

      // Et l'UPDATE ne doit pas rouvrir la porte : fermer l'INSERT seul
      // laisserait la séquence « créer correctement, puis renommer vers la
      // victime ».
      const renomme = await rest(B.token, `video_lives?id=eq.${liveId}`, {
        method: "PATCH",
        body: JSON.stringify({ author_name: "e2e_authz_a" }),
      });
      const apres = Array.isArray(renomme.body) ? renomme.body[0] : renomme.body;
      expect(apres && apres.author_name, "le nom doit être RÉÉCRIT aussi à l'UPDATE")
        .toBe("e2e_authz_b");
      log("usurpation neutralisée à l'UPDATE aussi");
      await rest(B.token, `video_lives?id=eq.${liveId}`, { method: "DELETE" }).catch(() => {});

      // ── 9. B ne peut pas fabriquer une notification AU NOM de A ────────────
      //    La table était scellée en lecture (`user_id = auth.uid()`) mais son
      //    INSERT valait `true`, en double : n'importe qui pouvait déposer une
      //    notification vers n'importe qui, au nom de n'importe qui, avec un
      //    contenu et un lien arbitraires. Pas une fuite — on ne lit toujours
      //    pas les notifications d'autrui — mais une usurpation dans le seul
      //    canal où l'utilisateur fait confiance à ce qu'il voit.
      //
      //    La contrainte portait sur le mauvais côté : une notification est
      //    cross-compte PAR NATURE (A aime le post de B → A écrit la ligne dont
      //    B est le destinataire), donc `user_id` ne pouvait pas être contraint.
      //    C'est l'AUTEUR qu'il fallait contraindre.
      const notifForgee = await rest(B.token, "notifications", {
        method: "POST",
        body: JSON.stringify({
          id: `n_forge_${Date.now()}`, user_id: A.uid, kind: "like",
          from_id: A.uid, content: "message fabriqué", seen: false,
          created_at: new Date().toISOString(),
        }),
      });
      expect(notifForgee.status, "B signe une notification du nom de A → doit être refusé")
        .toBeGreaterThanOrEqual(400);
      log(`notification usurpée refusée (HTTP ${notifForgee.status})`);

      // Contre-épreuve : notifier autrui reste possible SOUS SA PROPRE identité.
      // Sans elle, une policy qui casserait toutes les notifications passerait
      // ce test pour de mauvaises raisons.
      //    ⚠️ `return=minimal` et non `representation` : avec une représentation,
      //    PostgREST fait `INSERT … RETURNING`, et ce RETURNING retombe sous la
      //    policy SELECT (`user_id = auth.uid()`). B insérant POUR A ne peut pas
      //    relire la ligne, donc la requête entière échoue en 403 — alors que
      //    l'insertion elle-même est parfaitement légitime. L'app ne demande
      //    aucune représentation ici (`supaInsertNotif` fait un `.insert()` nu).
      const notifId = `n_ok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const notifLegitime = await rest(B.token, "notifications", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: notifId, user_id: A.uid, kind: "like",
          from_id: B.uid, content: "B a aimé", seen: false,
          created_at: new Date().toISOString(),
        }),
      });
      expect(notifLegitime.status, "CONTRE-ÉPREUVE : B notifie A sous sa propre identité → doit passer")
        .toBeLessThan(300);
      // Et le destinataire, LUI, la voit bien : c'est la preuve que la ligne existe.
      const recue = await rest(A.token, `notifications?id=eq.${notifId}&select=id,from_id`);
      expect(Array.isArray(recue.body) && recue.body.length, "A reçoit la notification").toBe(1);
      expect(recue.body[0].from_id, "et elle porte bien l'identité de B").toBe(B.uid);
      log("notification légitime acceptée et reçue par A");
      await rest(A.token, `notifications?id=eq.${notifId}`, { method: "DELETE" }).catch(() => {});

      // ── 10. Sans jeton, aucune donnée privée ───────────────────────────────
      const anon = await rest(null, "conv_messages?select=id&limit=1");
      expect(Array.isArray(anon.body) ? anon.body.length : 0,
        "un client sans session lit des messages privés → doit être vide").toBe(0);
      log("client anonyme : aucune donnée privée");
    } finally {
      // ── Nettoyage : A retire son propre post. Les comptes e2e sont purgés
      //    par `npm run purge:e2e` (suppression service_role).
      await rest(A.token, `posts?id=eq.${postId}`, { method: "DELETE" }).catch(() => {});
      await rest(A.token, `profiles?id=eq.${A.uid}`, { method: "DELETE" }).catch(() => {});
      await rest(B.token, `profiles?id=eq.${B.uid}`, { method: "DELETE" }).catch(() => {});
      log("nettoyage effectué");
    }
  });
});
