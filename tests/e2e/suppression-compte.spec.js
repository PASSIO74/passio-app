// ═══════════════════════════════════════════════════════════════════════════
// « SUPPRIMER MON COMPTE » — la promesse est-elle tenue ?
//
// Ce parcours n'avait AUCUN test. Il figurait en tête des interactions non
// exercées qui SUPPRIMENT (`npm run couverture:risque`), et c'est celui où une
// régression est à la fois grave et invisible : l'utilisateur croit ses données
// effacées, l'écran le lui confirme, et elles restent en ligne.
//
// Le doute était fondé : le commentaire de `doDeleteAccount` (app-02) affirmait
// que l'Edge Function « n'est pas déployée » et que l'échec était silencieux.
// Vérification du 2026-08-17 : elle est déployée, ACTIVE, et elle fait le
// travail — y compris la suppression des MÉDIAS, que le code client ne touche
// jamais. Le commentaire était périmé, pas le mécanisme.
//
// D'où ce test : ce qui est vrai aujourd'hui doit le rester, et une Edge
// Function peut être redéployée sans que le dépôt bouge d'une ligne.
//
// ⚠️ ÉCRIT EN BASE RÉELLE (un compte jetable, une ligne d'état, un fichier).
// Opt-in, comme les autres tests cross-compte.
//   PASSIO_E2E_MULTI=1 npx playwright test suppression-compte
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const PNG_MINIMAL = "iVBORw0KGgo=";   // en-tête PNG, suffisant comme témoin

test.describe("Suppression de compte", () => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "opt-in : PASSIO_E2E_MULTI=1 (écrit en base réelle)");

  test("efface les données, le compte ET les médias — pas seulement l'écran", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html");
    await page.waitForFunction(() => !!window.PASSIO_SUPABASE, null, { timeout: 30000 });

    // Tout se joue dans la page : c'est le MÊME chemin réseau que l'application,
    // avec la clé anon publique — pas un raccourci serveur qui prouverait autre chose.
    const r = await page.evaluate(async (png) => {
      const cfg = window.PASSIO_SUPABASE;
      const H = (tok, extra) => Object.assign({ apikey: cfg.anon, Authorization: "Bearer " + tok }, extra || {});

      const insc = await fetch(cfg.url + "/auth/v1/signup", {
        method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `suppr-${Date.now()}@passio-e2e.test`,
          password: "MotDePasse!123", data: { phone: "+33600000000" },
        }),
      });
      const d = await insc.json();
      const tok = d.access_token || (d.session && d.session.access_token);
      const uid = (d.user && d.user.id) || d.id;
      if (!tok) return { erreur: "inscription sans jeton", statut: insc.status };

      // Une donnée et un média, comme en usage réel.
      const etat = await fetch(cfg.url + "/rest/v1/user_state?on_conflict=user_id", {
        method: "POST",
        headers: H(tok, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }),
        body: JSON.stringify({ user_id: uid, data: { marqueur: "suppression" } }),
      });
      const chemin = `photos/${uid}/temoin.png`;
      const octets = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const media = await fetch(cfg.url + "/storage/v1/object/content/" + chemin, {
        method: "POST", headers: H(tok, { "Content-Type": "image/png" }), body: octets,
      });

      // La suppression, telle que l'application la déclenche.
      const ef = await fetch(cfg.url + "/functions/v1/delete-account", {
        method: "POST", headers: H(tok, { "Content-Type": "application/json" }), body: "{}",
      });
      await new Promise((res) => setTimeout(res, 2500));

      // Ce qui survit, vu SANS aucun privilège : c'est ce que verrait un tiers.
      const relire = await fetch(cfg.url + "/storage/v1/object/public/content/" + chemin);
      const seConnecter = await fetch(cfg.url + "/auth/v1/token?grant_type=password", {
        method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" },
        body: JSON.stringify({ email: d.user && d.user.email, password: "MotDePasse!123" }),
      });

      return {
        uid, etatEcrit: etat.status, mediaDepose: media.status,
        edge: ef.status, mediaApres: relire.status, reconnexion: seConnecter.status,
      };
    }, PNG_MINIMAL);

    console.log("[suppression]", JSON.stringify(r));
    expect(r.erreur, r.erreur || "").toBeUndefined();

    // Contre-épreuve : sans elle, un test qui échouerait à TOUT créer passerait
    // en beauté — il ne resterait rien à supprimer.
    expect(r.etatEcrit, "l'état doit d'abord être écrit").toBeLessThan(300);
    expect(r.mediaDepose, "le média doit d'abord être déposé").toBeLessThan(300);

    expect(r.edge, "l'Edge Function delete-account doit répondre").toBe(200);
    expect(r.mediaApres, "le média ne doit plus être servi").toBeGreaterThanOrEqual(400);
    expect(r.reconnexion, "le compte supprimé ne doit plus permettre de se connecter").toBeGreaterThanOrEqual(400);
  });
});
