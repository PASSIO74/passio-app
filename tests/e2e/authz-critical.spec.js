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
// ⚠️ Depuis l'activation de « Confirm email » (2026-08-30), la clé anon NE SUFFIT
// PLUS : `signUp` ne rend plus de session, donc plus de jeton à opposer aux
// policies. Les comptes sont créés pré-confirmés par tests/e2e/compte-e2e.js, qui
// demande le secret SUPABASE_SERVICE_ROLE_KEY (déjà passé par les workflows).
// Sans lui ce gate échoue en NOMMANT la cause : il ne doit jamais se mettre en
// veille silencieuse — un gate d'autorisation vert pour cause de skip serait
// exactement l'incident CI-GATE-001 à nouveau.
//
// Règle de contenu : on n'assère ICI que des invariants qui TIENNENT aujourd'hui.
// Un invariant souhaité mais non encore satisfait (ex. usurpation par author_name,
// cf. F4) rejoint ce fichier EN MÊME TEMPS que son correctif — sinon on bloque
// tous les déploiements avec un rouge connu, ce qui pousse à désactiver le gate.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { viserCibleSupabase } = require("./cible-supabase");   // SUP-04 : PASSIO_SUPABASE_URL/ANON → staging
const { creerCompteE2E } = require("./compte-e2e");

test.describe("AUTHZ-CRITICAL — séparation entre comptes", () => {
  test("un compte ne peut ni lire, ni écrire, ni altérer ce qui appartient à un autre", async ({ page }) => {
    test.setTimeout(120000);
    const log = (m) => console.log(`[authz] ${m}`);

    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await viserCibleSupabase(page);   // sans cible : rien (production)
    await page.goto("/index.html");
    await page.waitForFunction(
      () => typeof supa !== "undefined" && !!supa && !!window.PASSIO_SUPABASE,
      null, { timeout: 30000 },
    );


    // ── Deux comptes réels, créés PRÉ-CONFIRMÉS (compte-e2e.js) : « Confirm
    //    email » est activé depuis le 2026-08-30, donc signUp ne rend plus de
    //    session — ce test, barrière RLS du déploiement, expirait sinon.
    //    La création bascule la session de la page : on capture le jeton de A
    //    AVANT de créer B, sinon on ne dispose plus que de celui de B.
    const A = await creerCompteE2E(page, "authz_a");
    const B = await creerCompteE2E(page, "authz_b");
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
        // ⚠️ UPSERT, pas un POST simple. Depuis que `supaUpsertProfile` ne
        // s'interrompt plus quand aucune passion n'est résoluble (hotfix du
        // 2026-08-30), l'application CRÉE elle-même la ligne `profiles` au
        // moment où `creerCompteE2E` ouvre la session dans la page. Un POST
        // simple tombait alors sur un 409 (conflit de clé) et faisait échouer la
        // mise en place — alors que l'état voulu était déjà atteint.
        const p = await rest(acc.token, "profiles", {
          method: "POST",
          headers: { Prefer: "return=representation,resolution=merge-duplicates" },
          body: JSON.stringify({ id: acc.uid, username: `e2e_authz_${tag.toLowerCase()}` }),
        });
        expect(p.status, `profil ${tag} en place`).toBeLessThan(300);
      }
      log("profils A et B en place");

      // ── 0. B ne peut PAS se fabriquer un profil portant l'identité de A ────
      //    C'est l'attaque « choisir le côté acteur de la relation » : si elle
      //    passait, tout le reste des vérifications d'appartenance s'effondre.
      const stolenProfile = await rest(B.token, "profiles", {
        method: "POST",
        body: JSON.stringify({ id: A.uid, username: "usurpateur" }),
      });
      expect(stolenProfile.status, "B crée un profil sous l'id de A → doit être refusé")
        .toBeGreaterThanOrEqual(400);
      // ⚠️ LE STATUT NE SUFFIT PLUS À PROUVER QUOI QUE CE SOIT. Maintenant que la
      // ligne de A peut PRÉEXISTER (cf. l'upsert ci-dessus), ce POST renvoie 409
      // — un conflit de clé primaire — quelle que soit la RLS. L'assertion
      // ci-dessus passerait donc même si la RLS était grande ouverte : c'est
      // exactement le « faux verrou » que le dépôt documente, ici sur la barrière
      // de séparation des comptes.
      // On assère donc sur le RÉSULTAT : le profil de A lui appartient toujours
      // et porte toujours SON pseudo. Cette vérification tient quel que soit le
      // code d'état, et quel que soit l'ordre de création des lignes.
      const profilA = await rest(A.token, `profiles?id=eq.${A.uid}&select=id,username`, { method: "GET" });
      const ligneA = Array.isArray(profilA.body) ? profilA.body[0] : null;
      expect(ligneA, "le profil de A est lisible par A").toBeTruthy();
      expect(ligneA.username, "B n'a pas récrit le pseudo de A").not.toBe("usurpateur");
      log(`profil usurpé refusé (HTTP ${stolenProfile.status}) — pseudo de A intact : ${ligneA.username}`);

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
      //    ⚠️ SRV-02 (13/11) : la base exige le FAIT derrière un `like`
      //    (`trg_notifications_preuve`). B aime donc VRAIMENT la publication de A
      //    d'abord, et la notification la désigne — comme le fait l'app.
      const jaime = await rest(B.token, "post_likes", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ post_id: postId, user_id: B.uid }),
      });
      expect(jaime.status, "B aime la publication de A (le fait de la notification)").toBeLessThan(300);
      const notifId = `n_ok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const notifLegitime = await rest(B.token, "notifications", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: notifId, user_id: A.uid, kind: "like", ref_id: postId,
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
      await rest(B.token, `post_likes?post_id=eq.${postId}&user_id=eq.${B.uid}`, { method: "DELETE" }).catch(() => {});

      // ── 10. Sans jeton, aucune donnée privée ───────────────────────────────
      const anon = await rest(null, "conv_messages?select=id&limit=1");
      expect(Array.isArray(anon.body) ? anon.body.length : 0,
        "un client sans session lit des messages privés → doit être vide").toBe(0);
      log("client anonyme : aucune donnée privée");

      // ── 11. Storage : l'écriture est cloisonnée par dossier ────────────────
      //    Ajouté le 2026-08-17, LE JOUR où la migration correspondante a été
      //    appliquée en production (jamais avant : un rouge connu dans le gate
      //    finit par faire désactiver le gate).
      //
      //    Type MIME `image/png` et non `text/plain` : si une liste de types
      //    autorisés est posée un jour, un test en `text/plain` serait refusé
      //    pour le TYPE et resterait vert alors même que le cloisonnement de
      //    CHEMIN serait cassé. On isole une propriété à la fois.
      const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4"
        + "2mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const stor = (token, chemin, init = {}) =>
        page.evaluate(async ([tok, p, i, b64]) => {
          const cfg = window.PASSIO_SUPABASE;
          const corps = i.json ? JSON.stringify(i.json)
            : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const res = await fetch(cfg.url + "/storage/v1/" + p, {
            method: i.method || "POST",
            headers: {
              apikey: cfg.anon,
              ...(tok ? { Authorization: "Bearer " + tok } : {}),
              "Content-Type": i.json ? "application/json" : "image/png",
              ...(i.headers || {}),
            },
            body: corps,
          });
          return res.status;
        }, [token, chemin, init, PNG_1x1]);

      const sien = `photos/${B.uid}/authz_${Date.now()}.png`;

      // CONTRE-ÉPREUVE D'ABORD — c'est le vrai risque de cette policy. Un envoi
      // légitime refusé ne se voit PAS à l'écran : le code retombe en base64 et
      // recopie le média EN BASE (défaut SYNC-B64-005). Un test qui ne vérifie
      // que les refus resterait vert avec le Storage entièrement cassé.
      expect(await stor(B.token, `object/content/${sien}`),
        "B dépose dans SON dossier → doit passer").toBeLessThan(300);

      expect(await stor(B.token, `object/content/photos/${A.uid}/vole.png`),
        "B écrit chez A → refusé").toBeGreaterThanOrEqual(400);

      // `move` et `copy` ne passent PAS par l'INSERT — renommer est un UPDATE
      // de la colonne `name`. Une policy d'INSERT seule ne fermait donc rien
      // (mesuré en production le 2026-08-17 : HTTP 200 avant correctif).
      expect(await stor(B.token, "object/move", { json: { bucketId: "content",
        sourceKey: sien, destinationKey: `photos/${A.uid}/deplace.png` } }),
        "B DÉPLACE son fichier chez A → refusé").toBeGreaterThanOrEqual(400);

      expect(await stor(B.token, "object/copy", { json: { bucketId: "content",
        sourceKey: sien, destinationKey: `photos/${A.uid}/copie.png` } }),
        "B COPIE son fichier chez A → refusé").toBeGreaterThanOrEqual(400);

      // Le serveur normalise `../` AVANT d'enregistrer : la RLS doit donc voir
      // le nom normalisé, celui du dossier de la victime.
      expect(await stor(B.token, `object/content/photos/${B.uid}/../${A.uid}/trav.png`),
        "B via un chemin fabriqué → refusé").toBeGreaterThanOrEqual(400);

      // `attachments` est rangé par conversation, pas par uid : le cloisonnement
      // y passe par l'appartenance à la conversation.
      expect(await stor(B.token, `object/attachments/attachments/conv_absente_${Date.now()}/x.png`),
        "B dépose dans une conversation dont il n'est pas membre → refusé").toBeGreaterThanOrEqual(400);

      log("storage : écriture cloisonnée (dépôt, move, copy, chemin fabriqué, conv)");
      await stor(B.token, `object/content/${sien}`, { method: "DELETE" }).catch(() => {});

      // ── 12. Les relations SOCIALES ne se forgent pas pour autrui ───────────
      //    (audit 2026-11-02, agent E). Trois écritures que l'application tente
      //    ou qu'un attaquant tenterait, toutes en « ligne d'autrui » :
      //    · B s'auto-accepte comme abonné d'A : `follows_accepter` n'ouvre
      //      l'UPDATE qu'à la CIBLE (A) → 0 ligne ; sinon « compte privé » ne
      //      protège plus rien ;
      //    · B s'ajoute lui-même à une conversation d'A dont il n'est pas
      //      membre : « Ecriture propre » n'admet que le créateur ou un inscrit
      //      à l'événement lié → refus ;
      //    · B change le RSVP d'A sur un événement (et donc la promotion depuis
      //      la liste d'attente, B-02 : c'est le MÊME UPDATE) → 0 ligne.
      //    ⚠️ Comme pour le post (2.), un UPDATE refusé ne LÈVE pas : on compte
      //    les lignes, et on relit l'état depuis le propriétaire.
      const upsert = { Prefer: "return=representation,resolution=merge-duplicates" };
      await rest(A.token, "profiles", { method: "POST", headers: upsert, body: JSON.stringify({ id: A.uid, username: "e2e_authz_a", is_private: true }) });
      const demande = await rest(B.token, "follows", { method: "POST", body: JSON.stringify({ follower_id: B.uid, following_id: A.uid }) });
      expect(demande.status, "B demande à suivre A (compte privé)").toBeLessThan(300);
      const autoAccept = await rest(B.token, `follows?follower_id=eq.${B.uid}&following_id=eq.${A.uid}`, { method: "PATCH", body: JSON.stringify({ status: "accepted" }) });
      expect(Array.isArray(autoAccept.body) ? autoAccept.body.length : 0, "B s'auto-accepte comme abonné d'A → doit toucher 0 ligne").toBe(0);
      const relation = await rest(A.token, `follows?follower_id=eq.${B.uid}&following_id=eq.${A.uid}&select=status`);
      expect(Array.isArray(relation.body) && relation.body[0] && relation.body[0].status, "la demande reste `pending` côté A").toBe("pending");
      log("auto-acceptation d'un suivi : 0 ligne, demande toujours en attente");

      const convId = `conv_authz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const conv = await rest(A.token, "conversations", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: convId, is_group: false, created_by: A.uid }) });
      expect(conv.status, "A crée une conversation").toBeLessThan(300);
      expect((await rest(A.token, "conv_members", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ conv_id: convId, user_id: A.uid }) })).status, "A en est membre").toBeLessThan(300);
      const intrusion = await rest(B.token, "conv_members", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ conv_id: convId, user_id: B.uid }) });
      expect(intrusion.status, "B s'ajoute à la conversation d'A sans y être invité → doit être refusé").toBeGreaterThanOrEqual(400);
      const membres = await rest(A.token, `conv_members?conv_id=eq.${convId}&select=user_id`);
      expect((Array.isArray(membres.body) ? membres.body : []).map((m) => m.user_id), "la conversation n'a qu'un membre : A").toEqual([A.uid]);
      log("intrusion dans une conversation : refusée");

      const evId = `evt_authz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const ev = await rest(A.token, "events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: evId, author_id: A.uid, organizer_id: A.uid, title: "authz", passion_id: "musique", city: "Paris", date_at: new Date(Date.now() + 86400000).toISOString(), max_attendees: 2 }) });
      // ⚠️ L'INSERT d'`events` exige `adult_access_allowed()` : un compte e2e neuf
      // n'a pas déclaré sa majorité. Si la règle refuse ici (403), le cas 12c est
      // SAUTÉ en le disant — on ne confond pas « admission » et « RLS d'autrui ».
      if (ev.status < 300) {
        const rsvpA = await rest(A.token, "event_attendees", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ event_id: evId, user_id: A.uid, rsvp: "waitlist" }) });
        if (rsvpA.status < 300) {
          // `select=event_id` : sans lui, `return=representation` part en `RETURNING *`. Depuis
          // C-04 (SELECT par colonnes : `rating`, `feedback`, `rated_at` retirés au rôle), le
          // privilège de colonne refuserait la requête (42501) AVANT la policy UPDATE, et
          // « 0 ligne » passerait même avec une policy ouverte (RV-40). Le statut 2xx prouve
          // que c'est bien la POLICY qui a filtré la ligne d'A.
          const promo = await rest(B.token, `event_attendees?event_id=eq.${evId}&user_id=eq.${A.uid}&select=event_id`, { method: "PATCH", body: JSON.stringify({ rsvp: "going" }) });
          expect(promo.status, "le PATCH de B passe la porte de PostgREST (ni refus de droit ni erreur) : c'est la policy qui doit filtrer").toBeLessThan(300);
          expect(Array.isArray(promo.body) ? promo.body.length : 0, "B change le RSVP d'A (= promotion cross-compte, B-02) → doit toucher 0 ligne").toBe(0);
          const relu = await rest(A.token, `event_attendees?event_id=eq.${evId}&user_id=eq.${A.uid}&select=rsvp`);
          expect(Array.isArray(relu.body) && relu.body[0] && relu.body[0].rsvp, "le RSVP d'A est intact").toBe("waitlist");
          log("RSVP d'autrui : 0 ligne touchée (la liste d'attente n'a donc pas de sortie côté client — B-02)");
        } else log(`12c sauté : RSVP d'A refusé (HTTP ${rsvpA.status}, admission 18+ non déclarée pour un compte e2e)`);
      } else log(`12c sauté : création d'événement refusée (HTTP ${ev.status}, admission 18+ non déclarée pour un compte e2e)`);
      // `return=minimal` : en `return=representation` sans `select=`, ce DELETE part en
      // `RETURNING *`, refusé (42501) depuis C-04 (RV-40) ; la cascade d'`events` nettoyait
      // à sa place, sans que personne le voie.
      await rest(A.token, `event_attendees?event_id=eq.${evId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
      await rest(A.token, `events?id=eq.${evId}`, { method: "DELETE" }).catch(() => {});
      await rest(A.token, `conv_members?conv_id=eq.${convId}`, { method: "DELETE" }).catch(() => {});
      await rest(A.token, `conversations?id=eq.${convId}`, { method: "DELETE" }).catch(() => {});
      await rest(B.token, `follows?follower_id=eq.${B.uid}`, { method: "DELETE" }).catch(() => {});
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
