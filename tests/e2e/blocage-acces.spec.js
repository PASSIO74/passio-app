// ═══════════════════════════════════════════════════════════════════════════
// BLOQUER DOIT RETIRER L'ACCÈS, pas seulement masquer.
//
// Trouvé le 2026-08-16. `blockUser` supprimait bien MON abonnement vers la
// personne bloquée, mais pas le SIEN vers moi. Or la visibilité d'un compte
// privé est décidée CÔTÉ SERVEUR par `post_is_visible`, sur exactement ceci :
//
//     exists (select 1 from follows f
//             where f.follower_id = auth.uid() and f.following_id = p.author_id)
//
// Un compte privé qui bloquait un abonné continuait donc de lui montrer tous
// ses posts — c'est-à-dire précisément ce que bloquer est censé empêcher, et
// dans le seul scénario où ça compte vraiment.
//
// Ce n'était pas un manque de la base : `follows` porte depuis toujours une
// policy DELETE `following_id = auth.uid()`, faite pour retirer un abonné. Le
// client ne s'en servait pas.
//
// ⚠️ Ce spec appelle la VRAIE fonction `supaBlockUser` — il ne rejoue pas le
// correctif. Un test qui recopie ce qu'il vérifie ne garde rien.
//
// Écrit en base réelle : 2 comptes, 1 profil chacun, 1 post, 1 follow, 1 block.
// Nettoyé en fin de test ; les comptes le sont par `npm run purge:e2e`.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { creerCompteE2E } = require("./compte-e2e");

test.describe("Blocage — retrait d'accès effectif", () => {
  test("bloquer un abonné lui retire l'accès à un compte privé", async ({ page }) => {
    test.setTimeout(120000);
    const log = (m) => console.log(`[blocage] ${m}`);

    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html");
    await page.waitForFunction(
      () => typeof supa !== "undefined" && !!supa && !!window.PASSIO_SUPABASE
         && typeof supaBlockUser === "function",
      null, { timeout: 30000 },
    );

    const rest = (token, path, init = {}) =>
      page.evaluate(async ([tok, p, i]) => {
        const cfg = window.PASSIO_SUPABASE;
        const res = await fetch(cfg.url + "/rest/v1/" + p, {
          ...i,
          headers: {
            apikey: cfg.anon, Authorization: "Bearer " + tok,
            "Content-Type": "application/json", Prefer: "return=representation",
            ...(i.headers || {}),
          },
        });
        let body = null; try { body = await res.json(); } catch (e) {}
        return { status: res.status, body };
      }, [token, path, init]);

    // ⚠️ B d'abord : la création de compte (compte-e2e.js, pré-confirmée depuis
    // l'activation de « Confirm email ») bascule la session de la page. En
    // créant A en DERNIER, la page tourne sous A — indispensable pour appeler
    // la vraie `supaBlockUser`, qui agit au nom de la session courante.
    const B = await creerCompteE2E(page, "bloc_b");
    const A = await creerCompteE2E(page, "bloc_a");
    const postId = `post_bloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    log(`A=${A.uid} (session de la page) B=${B.uid}`);

    try {
      await rest(A.token, "profiles", { method: "POST", body: JSON.stringify({ id: A.uid, username: "e2e_bloc_a", is_private: true }) });
      await rest(B.token, "profiles", { method: "POST", body: JSON.stringify({ id: B.uid, username: "e2e_bloc_b" }) });

      // B s'abonne à A, puis A publie.
      const suivi = await rest(B.token, "follows", { method: "POST", body: JSON.stringify({ follower_id: B.uid, following_id: A.uid }) });
      expect(suivi.status, "B s'abonne à A").toBeLessThan(300);
      const pub = await rest(A.token, "posts", { method: "POST", body: JSON.stringify({ id: postId, author_id: A.uid, content: "post privé de A" }) });
      expect(pub.status, "A publie").toBeLessThan(300);

      // ── Précondition : sans elle, le test ne prouverait rien ──────────────
      // Si B ne voyait DÉJÀ pas le post, l'assertion finale passerait pour de
      // mauvaises raisons et le spec serait creux.
      const avant = await rest(B.token, `posts?id=eq.${postId}&select=id`);
      expect(Array.isArray(avant.body) && avant.body.length,
        "PRÉCONDITION : abonné à un compte privé, B doit voir le post").toBe(1);
      log("précondition vérifiée : B, abonné, voit le post privé de A");

      // ── L'action, par la VRAIE fonction de production ─────────────────────
      await page.evaluate(async ([a, b]) => {
        MY_UID = a; window.MY_UID = a;          // la page tourne sous A
        await supaBlockUser(b);
      }, [A.uid, B.uid]);
      log("A a bloqué B via supaBlockUser()");

      // ── Le résultat qui compte ────────────────────────────────────────────
      const apres = await rest(B.token, `posts?id=eq.${postId}&select=id`);
      expect(Array.isArray(apres.body) ? apres.body.length : -1,
        "après blocage, B ne doit PLUS voir le post privé de A").toBe(0);
      log("accès retiré : B ne voit plus le post");

      // Et l'abonnement lui-même a bien disparu — c'est le mécanisme, pas un effet de bord.
      const rel = await rest(A.token, `follows?follower_id=eq.${B.uid}&following_id=eq.${A.uid}&select=follower_id`);
      expect(Array.isArray(rel.body) ? rel.body.length : -1,
        "l'abonnement de B vers A doit avoir été supprimé").toBe(0);
      log("abonnement supprimé");
    } finally {
      await rest(A.token, `posts?id=eq.${postId}`, { method: "DELETE" }).catch(() => {});
      await rest(A.token, `blocks?blocker_id=eq.${A.uid}`, { method: "DELETE" }).catch(() => {});
      await rest(A.token, `profiles?id=eq.${A.uid}`, { method: "DELETE" }).catch(() => {});
      await rest(B.token, `profiles?id=eq.${B.uid}`, { method: "DELETE" }).catch(() => {});
      log("nettoyage effectué");
    }
  });
});
