// Réactions de message — filtrer la clé À L'ENTRÉE, pas seulement à l'affichage.
//
// La CLÉ d'une réaction vient d'un autre compte : `conv_messages.content` est
// une colonne libre, et tout compte membre de la conversation y insère ce qu'il
// veut. L'échappement à l'affichage (posé le 2026-08-29) empêche l'exécution —
// mais la valeur hostile entrait quand même dans `state`, partait dans
// localStorage ET IndexedDB par `saveConversations`, et revenait à chaque
// démarrage. C'est la remarque qu'a faite la vérification adversariale de
// l'audit, et elle avait raison : une charge neutralisée mais persistée reste
// une charge, prête pour le prochain rendu qui oublierait d'échapper.
//
// Deux points d'écriture, tous deux couverts ici : le temps réel
// (`_applyReactionEvent`, app-04) et le REJEU au chargement (app-08).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const HOSTILE = '<img src=x onerror="window.__pwn()">';

test.describe("Clé de réaction — filtre d'entrée", () => {
  test("le validateur accepte les vrais emojis, y compris composés, et rejette le balisage", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((h) => ({
      // Des emojis réels, dont un composé (ZWJ) et un avec modificateur de teinte.
      coeur: _reactionKeySure("❤️"),
      pouce: _reactionKeySure("👍🏽"),
      famille: _reactionKeySure("👨‍👩‍👧"),
      // Ce qui n'a rien à faire dans un emoji.
      balise: _reactionKeySure(h),
      guillemet: _reactionKeySure('a" onmouseover="x'),
      trop_long: _reactionKeySure("👍".repeat(20)),
      vide: _reactionKeySure(""),
      nul: _reactionKeySure(null),
    }), HOSTILE);

    expect(r.coeur).toBe("❤️");
    expect(r.pouce).toBe("👍🏽");
    expect(r.famille, "un emoji composé ne doit pas être rejeté").toBe("👨‍👩‍👧");
    expect(r.balise).toBe("");
    expect(r.guillemet).toBe("");
    expect(r.trop_long).toBe("");
    expect(r.vide).toBe("");
    expect(r.nul).toBe("");
  });

  test("temps réel : une clé hostile n'entre pas dans l'état, une vraie y entre", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((h) => {
      const conv = { id: "c1", messages: [{ id: "m1", from: "them", at: Date.now(), text: "salut" }] };
      _applyReactionEvent(conv, { type: "react", target: "m1", emoji: h, op: "add" });
      const apresHostile = Object.keys(conv.messages[0].reactions || {});
      _applyReactionEvent(conv, { type: "react", target: "m1", emoji: "🔥", op: "add" });
      const apresVraie = Object.keys(conv.messages[0].reactions || {});
      return { apresHostile, apresVraie };
    }, HOSTILE);

    expect(r.apresHostile, "la charge ne doit pas devenir une clé").toEqual([]);
    expect(r.apresVraie, "une vraie réaction fonctionne toujours").toEqual(["🔥"]);
  });

  test("le retrait d'une réaction hostile ne crée pas la clé au passage", async ({ page }) => {
    // `op: "remove"` écrivait `reactions[emoji] = (…||1)-1` : sur une clé
    // inconnue, cela CRÉAIT la clé à 0 avant de la supprimer. Une charge
    // pouvait donc entrer par le chemin du retrait.
    await bootOnboarded(page);
    const cles = await page.evaluate((h) => {
      const conv = { id: "c1", messages: [{ id: "m1", from: "them", at: Date.now(), text: "salut" }] };
      _applyReactionEvent(conv, { type: "react", target: "m1", emoji: h, op: "remove" });
      return Object.keys(conv.messages[0].reactions || {});
    }, HOSTILE);
    expect(cles).toEqual([]);
  });

  test("rien n'est persisté : la conversation sauvegardée ne porte aucune clé hostile", async ({ page }) => {
    await bootOnboarded(page);
    const stocke = await page.evaluate((h) => {
      conversationsState = [{ id: "c_persist", userId: "u_b", messages: [
        { id: "m1", from: "them", at: Date.now(), text: "salut" }] }];
      _applyReactionEvent(conversationsState[0], { type: "react", target: "m1", emoji: h, op: "add" });
      saveConversationsNow();
      return localStorage.getItem("passio_conversations_v1") || "";
    }, HOSTILE);

    expect(stocke).not.toContain("onerror");
    expect(stocke).not.toContain("<img");
  });
});
