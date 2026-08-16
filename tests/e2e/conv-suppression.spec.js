// ═══════════════════════════════════════════════════════════════════════════
// SUPPRESSION DE CONVERSATION / MESSAGE — elle doit TENIR au redémarrage.
//
// ADR-008. Les conversations vivent dans deux stores : localStorage (écriture
// synchrone) et IndexedDB (asynchrone, best-effort, résultat jamais lu). Au
// boot, `_unionConvsById` fusionne les deux — et cette union, qui existe pour
// ne jamais perdre un message, défaisait les suppressions.
//
// Reproduit avant correctif : une conversation supprimée ET un message privé
// supprimé revenaient tous les deux après redémarrage. Sur une messagerie,
// c'est exactement ce qui détruit la confiance.
//
// Le journal de suppressions (pierres tombales) donne aux deux stores de quoi
// distinguer « jamais existé » de « supprimé ». Ce spec vérifie les deux faces :
// ce qui a été supprimé ne revient pas, et ce qui ne l'a pas été ne disparaît
// pas — la seconde compte autant, puisque l'union avait été introduite
// précisément pour empêcher des messages de se volatiliser.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page);
  await page.waitForFunction(
    () => typeof hydrateConvsFromIDB === "function" && typeof idbConvSave === "function"
       && typeof convTombAdd === "function" && typeof _unionConvsById === "function",
    null, { timeout: 20000 },
  );
  await page.evaluate(() => { try { localStorage.removeItem("passio_conv_deleted_v1"); } catch (e) {} });
}

test.describe("Suppression de conversation / message (ADR-008)", () => {
  test("une suppression non parvenue à IndexedDB ne ressuscite PAS au redémarrage", async ({ page }) => {
    test.setTimeout(90000);
    await boot(page);

    const r = await page.evaluate(async () => {
      // IndexedDB porte l'état AVANT suppression : l'écriture asynchrone n'a pas
      // abouti (onglet fermé, quota, erreur — le résultat n'est de toute façon
      // jamais lu).
      const avant = [
        { id: "conv_1", userId: "u_a", messages: [{ id: "m1", text: "message conservé" }, { id: "m2", text: "SECRET supprimé" }] },
        { id: "conv_2", userId: "u_b", messages: [{ id: "m3", text: "conversation quittée" }] },
      ];
      await idbConvSave(avant);

      // L'utilisateur supprime : le journal enregistre, localStorage suit.
      convTombAdd("msg", "m2");
      convTombAdd("conv", "conv_2");
      localStorage.setItem("passio_conversations_v1", JSON.stringify([
        { id: "conv_1", userId: "u_a", messages: [{ id: "m1", text: "message conservé" }] },
      ]));

      // Redémarrage : re-hydratation depuis les deux stores.
      conversationsState = null;
      window._idbConvHydrated = false;
      if (typeof _idbConvHydrated !== "undefined") _idbConvHydrated = false;
      await hydrateConvsFromIDB();

      const c = getConversations() || [];
      const c1 = c.find((x) => x.id === "conv_1");
      return {
        conversations: c.map((x) => x.id),
        messagesConv1: ((c1 && c1.messages) || []).map((m) => m.id),
        secretRevenu: JSON.stringify(c).indexOf("SECRET supprimé") !== -1,
      };
    });

    expect(r.secretRevenu, "un message privé supprimé ne doit JAMAIS réapparaître").toBe(false);
    expect(r.messagesConv1, "seul le message conservé subsiste").toEqual(["m1"]);
    expect(r.conversations, "la conversation quittée ne doit pas revenir").toEqual(["conv_1"]);
  });

  test("ce qui n'a PAS été supprimé continue d'être récupéré depuis IndexedDB", async ({ page }) => {
    // La contre-épreuve. L'union existe parce qu'un message écrit dans
    // localStorage mais pas dans IndexedDB disparaissait définitivement. Un
    // journal trop zélé recréerait ce bug — en pire, puisqu'il serait silencieux.
    test.setTimeout(90000);
    await boot(page);

    const r = await page.evaluate(async () => {
      await idbConvSave([
        { id: "conv_1", userId: "u_a", messages: [{ id: "m1", text: "un" }, { id: "m2", text: "présent seulement dans IDB" }] },
      ]);
      localStorage.setItem("passio_conversations_v1", JSON.stringify([
        { id: "conv_1", userId: "u_a", messages: [{ id: "m1", text: "un" }, { id: "m3", text: "présent seulement dans localStorage" }] },
      ]));
      conversationsState = null;
      window._idbConvHydrated = false;
      if (typeof _idbConvHydrated !== "undefined") _idbConvHydrated = false;
      await hydrateConvsFromIDB();
      const c1 = (getConversations() || []).find((x) => x.id === "conv_1");
      return { messages: ((c1 && c1.messages) || []).map((m) => m.id).sort() };
    });

    expect(r.messages, "aucun message non supprimé ne doit être perdu par la fusion").toEqual(["m1", "m2", "m3"]);
  });

  test("le journal est borné : TTL de 30 jours et plafond d'entrées", async ({ page }) => {
    // Sans bornes, ce journal deviendrait le prochain blob de 4,7 Mo
    // (cf. SYNC-B64-005). Au-delà du TTL, le store distant fait autorité.
    test.setTimeout(60000);
    await boot(page);

    const r = await page.evaluate(() => {
      const vieux = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const j = { "msg:ancien": vieux, "msg:recent": Date.now() };
      for (let i = 0; i < 2500; i++) j["msg:masse_" + i] = Date.now() - i * 1000;
      localStorage.setItem("passio_conv_deleted_v1", JSON.stringify(j));
      const charge = convTombLoad();
      return {
        ancienPurge: charge["msg:ancien"] === undefined,
        recentGarde: charge["msg:recent"] !== undefined,
        taille: Object.keys(charge).length,
      };
    });

    expect(r.ancienPurge, "une suppression de plus de 30 jours doit sortir du journal").toBe(true);
    expect(r.recentGarde, "une suppression récente doit être conservée").toBe(true);
    expect(r.taille, `journal borné (reçu ${r.taille} entrées)`).toBeLessThanOrEqual(2000);
  });
});
