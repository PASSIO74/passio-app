// ═══════════════════════════════════════════════════════════════════════════
// SYNC-CLOCK-011 — l'horloge du client ne fait plus autorité sur `user_state`.
//
// LE DÉFAUT (2026-08-16)
// `user_state` porte l'état personnel synchronisé entre appareils. Le client y
// écrivait lui-même `updated_at` (`new Date().toISOString()`), et c'est cette
// valeur qui arbitrait la fusion au démarrage : `if (serverTs > localTs)`.
//
//   - appareil A, horloge en avance d'1 h, écrit T+1h ;
//   - B restaure, mémorise T+1h, puis écrit son état réel à T ;
//   - la garde monotone locale rejette T < T+1h : le drapeau « état sale » de B
//     ne retombe jamais → réémission perpétuelle ;
//   - A rouvre, voit T < T+1h, NE RESTAURE PAS les changements de B et les
//     écrase. Un appareil à l'horloge rapide gagne définitivement.
//
// Aucune dérive positive n'existait en production ce jour-là : le défaut était
// RÉEL et NON DÉCLENCHÉ. Il attendait un utilisateur au téléphone mal réglé.
//
// CE QUE CE SPEC GARDE
// La frontière est en BASE (trigger `trg_user_state_horodatage`), pas dans le
// client — parce que ce dépôt déploie à chaque push sans staging : un onglet
// ouvert peut faire tourner la version précédente pendant des heures, et le
// beacon de fermeture écrit par un POST REST brut, hors du SDK. Deux
// producteurs, une seule frontière défendable.
//
// Le test attaque donc la base DIRECTEMENT, en REST brut, exactement comme le
// ferait un client périmé ou malveillant. Passer par l'interface testerait la
// politesse du client, pas la garantie.
//
// A/B mesuré à l'application (2026-08-16) :
//   trigger désactivé → 3 653 jours d'avance acceptés
//   trigger actif     → 0
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

test.describe("SYNC-CLOCK-011 — horodatage serveur de user_state", () => {
  test("une date envoyée par le client est ignorée ; une écriture légitime passe", async ({ page }) => {
    test.setTimeout(120000);

    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.goto("/index.html");
    await page.waitForFunction(
      () => typeof supa !== "undefined" && !!supa && !!window.PASSIO_SUPABASE,
      null, { timeout: 30000 },
    );

    const compte = await page.evaluate(async () => {
      const email = `e2e_clock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@passio-e2e.test`;
      const { data, error } = await supa.auth.signUp({ email, password: "Passio-e2e-12345!" });
      if (error || !data || !data.session) return { error: (error && error.message) || "pas de session" };
      return { uid: data.session.user.id, token: data.session.access_token };
    });
    expect(compte.error, "compte e2e créé").toBeUndefined();

    // Upsert REST brut, en revendiquant une date à +10 ans — ce que faisait
    // structurellement un appareil dont l'horloge avance.
    const ecrire = (updatedAt) =>
      page.evaluate(async ([tok, uid, ts]) => {
        const cfg = window.PASSIO_SUPABASE;
        const corps = { user_id: uid, data: { marqueur: "clock-011" } };
        if (ts) corps.updated_at = ts;
        const res = await fetch(cfg.url + "/rest/v1/user_state?on_conflict=user_id", {
          method: "POST",
          headers: {
            apikey: cfg.anon, Authorization: "Bearer " + tok,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify(corps),
        });
        const j = await res.json().catch(() => null);
        return { statut: res.status, ligne: Array.isArray(j) ? j[0] : j };
      }, [compte.token, compte.uid, updatedAt]);

    const futur = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString();
    const revendique = await ecrire(futur);

    expect(revendique.statut, "l'écriture est acceptée (on ne casse pas le client)").toBeLessThan(300);
    expect(revendique.ligne, "la base renvoie la ligne écrite").toBeTruthy();

    // ── L'invariant ────────────────────────────────────────────────────────
    // La date retenue est celle de la BASE, pas celle revendiquée. On mesure
    // l'écart réel plutôt que de comparer des chaînes : c'est la propriété qui
    // compte, et elle reste vraie quel que soit le format rendu.
    const deriveJours = (new Date(revendique.ligne.updated_at) - Date.now()) / 86400000;
    expect(
      Math.abs(deriveJours),
      `updated_at retenu : ${revendique.ligne.updated_at} — revendiqué : ${futur} (écart ${deriveJours.toFixed(1)} j)`,
    ).toBeLessThan(1);

    // ── Contre-épreuve ─────────────────────────────────────────────────────
    // Sans elle, un « correctif » qui refuserait TOUTE écriture sur user_state
    // passerait l'assertion précédente en beauté — et casserait la synchro.
    const legitime = await ecrire(null);
    expect(legitime.statut, "une écriture sans updated_at reste acceptée").toBeLessThan(300);
    expect(legitime.ligne && legitime.ligne.data && legitime.ligne.data.marqueur,
      "la donnée est bien enregistrée").toBe("clock-011");
    expect(new Date(legitime.ligne.updated_at).getTime(),
      "et elle est horodatée par la base").toBeGreaterThan(Date.now() - 120000);

    // ── L'écriture reste cloisonnée au propriétaire ────────────────────────
    // Le trigger touche à l'horodatage, pas aux droits : on vérifie qu'il n'a
    // rien ouvert au passage.
    const chezAutrui = await page.evaluate(async ([tok]) => {
      const cfg = window.PASSIO_SUPABASE;
      const res = await fetch(cfg.url + "/rest/v1/user_state?on_conflict=user_id", {
        method: "POST",
        headers: {
          apikey: cfg.anon, Authorization: "Bearer " + tok,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000", data: { intrusion: true } }),
      });
      return res.status;
    }, [compte.token]);
    expect(chezAutrui, "écrire l'état d'un autre compte reste refusé").toBeGreaterThanOrEqual(400);

    // ── Nettoyage ──────────────────────────────────────────────────────────
    await page.evaluate(async ([tok, uid]) => {
      const cfg = window.PASSIO_SUPABASE;
      await fetch(cfg.url + "/rest/v1/user_state?user_id=eq." + uid, {
        method: "DELETE",
        headers: { apikey: cfg.anon, Authorization: "Bearer " + tok },
      });
    }, [compte.token, compte.uid]);
  });
});
