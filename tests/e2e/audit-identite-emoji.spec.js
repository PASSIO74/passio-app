// Suite « audit identité / isolation / emoji » — 2026-08-12.
//
// Verrouille les conclusions de l'audit demandé par Benjamin :
//   1. ISOLATION INTER-COMPTES : à la déconnexion, les caches LIÉS AU COMPTE
//      (conversations privées en localStorage ET en IndexedDB, config, historique IA,
//      brouillon) sont purgés — sinon le compte suivant connecté dans le même
//      navigateur héritait des données du précédent (fuite de messages privés).
//   2. INTÉGRITÉ EMOJI dans une RÉPONSE à un commentaire : un emoji saisi via le
//      panneau du composeur de réponse est stocké tel quel dans le modèle ET rendu
//      tel quel dans le HTML du fil (aucune suppression / mutation Unicode).
//   3. TRONCATURE UNICODE-SÛRE : la borne serveur (payload ≤ 500) ne coupe jamais
//      une paire de substitution en plein emoji (demi-surrogate orphelin = « ￿ »).
//
// Aucune écriture Supabase : les fonctions de sync sont neutralisées après boot.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    // Doit répondre { ok:true } : un like non confirmé côté serveur est annulé.
    window.supaSetPostLike = async () => ({ ok: true, error: null });
    ["supaAddComment", "supaCommentInteract", "supaInsertNotif",
      "supaUpsertProfile", "supaTrack", "supaSaveUserState"].forEach((fn) => { window[fn] = async () => null; });
  });
  await page.waitForFunction(
    () => typeof _commentBodyHtml === "function" && typeof _submitReply === "function"
      && typeof _cmtInsertAtCursor === "function" && typeof _renderCommentsList === "function"
      && typeof purgeAccountScopedData === "function" && typeof _truncU16Safe === "function"
      && typeof state !== "undefined" && !!state,
    null, { timeout: 20000 });
}

test.describe("Audit identité / isolation / emoji (2026-08-12)", () => {
  test("emoji dans une réponse : saisi → stocké → rendu, sans mutation", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const post = state.seed.posts[0];
      post.comments = post.comments || [];
      const cid = "c_audit_reply";
      if (!post.comments.find((c) => c.id === cid)) {
        post.comments.unshift({ id: cid, authorId: "someone_else", authorName: "Alice",
          authorEmoji: "🎨", text: "Joli !", createdAt: Date.now(), fromSupabase: false });
      }
      // Reproduit exactement le composeur de réponse (replyToComment → input#reply-input-<cid>).
      const wrap = document.createElement("div");
      wrap.className = "comment-reply-input";
      wrap.innerHTML = '<input id="reply-input-' + cid + '" value="">';
      document.body.appendChild(wrap);
      const inp = document.getElementById("reply-input-" + cid);
      // Insertion via la VRAIE fonction du panneau emoji.
      _cmtInsertAtCursor(inp, "😍");
      _cmtInsertAtCursor(inp, "🔥");
      inp.value = "Excellent " + inp.value;
      // Soumission via la VRAIE fonction.
      _submitReply(post.id + "|" + cid);
      const comment = post.comments.find((c) => c.id === cid);
      const stored = comment.replies && comment.replies[0] ? comment.replies[0].text : null;
      const html = _renderCommentsList(post.comments, post.id);
      return { stored, htmlHasEmoji: html.indexOf("😍") > -1 && html.indexOf("🔥") > -1,
        bodyOnlyEmoji: _commentBodyHtml("😂👏") };
    });
    expect(r.stored).toBe("Excellent 😍🔥");           // stocké exactement
    expect(r.htmlHasEmoji).toBe(true);                  // rendu exactement
    expect(r.bodyOnlyEmoji).toBe("😂👏");               // réponse 100 % emoji préservée
  });

  test("troncature Unicode-sûre : jamais de demi-emoji orphelin à la borne", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const withEmoji = "a".repeat(499) + "😍";         // 501 unités UTF-16
      const raw = withEmoji.slice(0, 500);              // ancien comportement : coupe l'emoji
      const safe = _truncU16Safe(withEmoji, 500);
      const rawLast = raw.charCodeAt(raw.length - 1);
      const safeLast = safe.charCodeAt(safe.length - 1);
      return {
        rawIsOrphan: rawLast >= 0xD800 && rawLast <= 0xDBFF,      // true = corrompu
        safeIsClean: !(safeLast >= 0xD800 && safeLast <= 0xDBFF), // true = sain
        shortPreserved: _truncU16Safe("Excellent 😍🔥", 500),
        fittingKept: _truncU16Safe("b".repeat(498) + "😍", 500).endsWith("😍"),
      };
    });
    expect(r.rawIsOrphan).toBe(true);        // le bug existait bien
    expect(r.safeIsClean).toBe(true);        // le correctif l'élimine
    expect(r.shortPreserved).toBe("Excellent 😍🔥");
    expect(r.fittingKept).toBe(true);
  });

  test("isolation inter-comptes : la déconnexion purge conversations (localStorage + IndexedDB)", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      // Simule des données du COMPTE A dans les deux stores de conversations.
      const fake = [{ id: "conv_A", messages: [{ id: "m1", text: "message privé de A" }] }];
      localStorage.setItem("passio_conversations_v1", JSON.stringify(fake));
      localStorage.setItem("passio_config", JSON.stringify({ secret: "profil A" }));
      if (typeof idbConvSave === "function") await idbConvSave(fake);
      const beforeLs = !!localStorage.getItem("passio_conversations_v1");
      const beforeIdb = typeof idbConvLoad === "function" ? ((await idbConvLoad()) || []).length : -1;
      // Purge (le cœur de doLogout, sans le reload).
      await purgeAccountScopedData();
      const afterLs = localStorage.getItem("passio_conversations_v1");
      const afterCfg = localStorage.getItem("passio_config");
      const afterIdb = typeof idbConvLoad === "function" ? ((await idbConvLoad()) || []).length : -1;
      return { beforeLs, beforeIdb, afterLs, afterCfg, afterIdb };
    });
    expect(r.beforeLs).toBe(true);       // les données de A étaient bien présentes
    expect(r.beforeIdb).toBeGreaterThan(0);
    expect(r.afterLs).toBeNull();        // conversations localStorage purgées
    expect(r.afterCfg).toBeNull();       // config de profil purgée
    expect(r.afterIdb).toBe(0);          // conversations IndexedDB purgées → pas de fuite vers B
  });

  test("isolation inter-comptes : AUCUNE clé de compte ne survit, y compris celles ajoutées plus tard", async ({ page }) => {
    // Le test précédent vérifie deux clés nommées. Celui-ci vérifie l'INVARIANT :
    // après une déconnexion, il ne doit rester dans localStorage que des clés
    // appartenant à l'APPAREIL — jamais au compte.
    //
    // La différence compte. Un test qui nomme ses clés ne voit pas arriver la
    // prochaine : le jour où une fonctionnalité écrit `passio_ma_nouveauté` avec
    // du contenu de compte et oublie de l'inscrire dans ACCOUNT_SCOPED_KEYS, il
    // reste vert pendant que la donnée fuit vers le compte suivant. Celui-ci
    // échoue tant que la nouvelle clé n'a pas été classée.
    //
    // Cas le plus sensible couvert ici : les files d'état en attente
    // (`passio_pending_user_state*`), suffixées par compte — donc impossibles à
    // lister en dur — et qui contiennent le blob d'état COMPLET (profils,
    // notifications, likes). Le code les purge ; rien ne le vérifiait.
    await boot(page);
    const r = await page.evaluate(async () => {
      // Clés APPAREIL, légitimement conservées (cf. le commentaire d'ACCOUNT_SCOPED_KEYS) :
      // identité machine, consentement, drapeaux de test, contrôle parental.
      const DEVICE = [
        "passio_device_id", "passio_telemetry", "passio_logo_variant", "passio_debug",
        "passio_parental_code", "passio_limit_sec", "dash_adv_open",
      ];
      const estAppareil = (k) => DEVICE.includes(k)
        || k.indexOf("passio_pwa") === 0 || k.indexOf("passio_realtime_") === 0
        || k.indexOf("passio_gate") === 0;

      // On sème du contenu de compte dans TOUTES les clés déclarées, plus une
      // file d'état en attente suffixée (le cas que la liste ne peut pas nommer).
      (window.ACCOUNT_SCOPED_KEYS || []).forEach((k) => localStorage.setItem(k, '{"secret":"donnée de A"}'));
      localStorage.setItem("passio_pending_user_state_u_compteA", '{"data":{"user":{"secret":"A"}}}');
      localStorage.setItem("passio_pending_user_state_u_compteB", '{"data":{"user":{"secret":"A2"}}}');
      // Et une clé appareil, qui doit SURVIVRE.
      localStorage.setItem("passio_device_id", "dev-xyz");

      await purgeAccountScopedData();

      const restantes = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("passio") === 0 && !estAppareil(k)) restantes.push(k);
      }
      return { restantes, deviceSurvit: localStorage.getItem("passio_device_id") };
    });

    expect(r.restantes, `clés de compte survivant à la déconnexion : ${JSON.stringify(r.restantes)}`).toEqual([]);
    // Et la purge ne doit pas emporter ce qui appartient à l'appareil : effacer
    // le contrôle parental offrirait à un enfant un contournement en un clic.
    expect(r.deviceSurvit, "les clés d'appareil doivent survivre à la déconnexion").toBe("dev-xyz");
  });
});
