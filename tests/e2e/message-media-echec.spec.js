// MÉDIA EN MESSAGE — l'échec d'écriture doit être VU, et le média récupérable.
//
// Invariant maison : le SDK Supabase ne lève pas sur un refus RLS, il renvoie
// `{ error }`. Une écriture dont personne n'expose le verdict reste « réussie »
// à l'écran et disparaît au rechargement.
//
// `sendMessageToSupabase` (app-09) — le chemin des photos, vidéos, GIF, VOCAUX,
// documents et positions — lisait bien `res.error`, mais n'en faisait qu'un
// `_diag` et un événement de télémétrie. À l'écran, le média restait envoyé ; au
// rechargement, il n'existait plus. Un vocal perdu ne se refait pas.
//
// Ce n'était pas un oubli isolé : le chemin TEXTE et le TRANSFERT traitent déjà
// ce cas (statut « failed » + `_outboxAdd` + « ⚠️ réessayer »). Le média est le
// survivant — même famille que le défaut corrigé sur `_forwardTo`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page);
  await page.waitForFunction(
    () => typeof sendMessageToSupabase === "function" && typeof _outboxLoad === "function"
       && typeof getConversations === "function" && typeof _setMsgStatus === "function",
    null, { timeout: 20000 },
  );
}

// Une conversation qui contient DÉJÀ le message média local (c'est l'ordre réel :
// l'app pose la bulle, puis tente l'écriture), et un `supa` armé pour répondre.
async function preparer(page, reponse) {
  await page.evaluate((rep) => {
    conversationsState = [{
      id: "conv_media", userId: "u_b", messages: [
        { id: "m_media", from: "me", at: Date.now(), text: "[AUDIO] Message vocal (3s)", status: "sending" },
      ],
    }];
    saveConversationsNow();
    MY_UID = "u_moi"; window.MY_UID = "u_moi";
    window.__inserts = [];
    // ⚠️ LE STUB RETIENT LA TABLE — même défaut, et même correctif, que
    // `transfert-message.spec.js` (2026-09-03). Il remplace le `supa` GLOBAL et
    // `from()` ignorait son argument : le compte incluait les insertions de
    // TOUTES les tables. En CI le réseau existe, la télémétrie et les
    // notifications partent vraiment, et une écriture étrangère tombant dans la
    // fenêtre de 400 ms faussait le verdict — de façon intermittente, au gré du
    // DÉCOUPAGE DES SHARDS, et jamais reproductible en isolation.
    // `sendMessageToSupabase` (app-09) écrit dans `conv_messages` : on ne compte
    // que celle-là.
    supa = { from: function (table) { return {
      insert: function (row) { window.__inserts.push({ table: table, row: row }); return Promise.resolve(rep); },
    }; } };
    try { localStorage.removeItem("passio_msg_outbox_v1"); } catch (e) {}
  }, reponse);
}

const etat = (page) => page.evaluate(() => ({
  statut: (getConversations().find((c) => c.id === "conv_media").messages[0] || {}).status,
  outbox: _outboxLoad().map((x) => x.msgId),
  inserts: (window.__inserts || []).filter(function (i) { return i.table === "conv_messages"; }).length,
  // ⚠️ L'INVARIANT EST LE REPLI, PAS LE COMPTE (2026-09-03). `toBe(2)` voulait
  // dire « la première tentative porte `from_id`, la seconde ne le porte pas » —
  // mais il l'exprimait par un NOMBRE, donc il interdisait aussi le renvoi de la
  // file (`setTimeout(_flushOutbox, 1500)` armé par `supaInit`, qui rejoue quand
  // le réseau existe : en CI, jamais hors ligne). On observe désormais les DEUX
  // FORMES, ce qu'aucun renvoi ne peut fausser.
  avecFromId: (window.__inserts || []).some(function (i) { return i.table === "conv_messages" && i.row && i.row.from_id; }),
  sansFromId: (window.__inserts || []).some(function (i) { return i.table === "conv_messages" && i.row && !i.row.from_id; }),
  // Diagnostic : si une autre table s'invite, le message d'échec la nomme au
  // lieu de laisser chercher.
  tables: (window.__inserts || []).map(function (i) { return i.table; }),
}));

test.describe("Média en message — verdict de l'écriture", () => {
  test("une insertion refusée marque le média en échec et le met en file de renvoi", async ({ page }) => {
    test.setTimeout(90000);
    await boot(page);
    await preparer(page, { error: { message: "RLS", code: "42501" } });

    await page.evaluate(async () => {
      sendMessageToSupabase("m_media", "conv_media", "https://exemple.test/a.webm", "audio/webm", "vocal.webm", "audio");
      await new Promise((r) => setTimeout(r, 400));
    });

    const r = await etat(page);
    // Deux tentatives : avec from_id, puis le repli sans from_id — observées par
    // leur FORME, que le renvoi de la file ne peut pas fausser.
    expect(r.avecFromId, "la première tentative (avec from_id) n'a pas eu lieu").toBe(true);
    expect(r.sansFromId, "le repli sans from_id n'a pas eu lieu").toBe(true);
    expect(r.statut, "le média doit être marqué en échec").toBe("failed");
    expect(r.outbox, "et mis en file de renvoi").toContain("m_media");
  });

  test("une insertion acceptée marque le média envoyé et ne laisse rien en file", async ({ page }) => {
    test.setTimeout(90000);
    await boot(page);
    await preparer(page, { error: null });

    await page.evaluate(async () => {
      sendMessageToSupabase("m_media", "conv_media", "https://exemple.test/a.jpg", "image/jpeg", "photo.jpg", "media");
      await new Promise((r) => setTimeout(r, 400));
    });

    const r = await etat(page);
    expect(r.inserts, "l'insertion n'a pas eu lieu — tables vues : " + JSON.stringify(r.tables))
      .toBeGreaterThanOrEqual(1);
    expect(r.statut).toBe("sent");
    expect(r.outbox).not.toContain("m_media");
  });

  test("le repli sans from_id compte comme un succès, pas comme un échec", async ({ page }) => {
    // La RLS v2 exige from_id ; le repli existe pour les bases plus anciennes.
    // S'il réussit, le message est envoyé — le marquer en échec ferait réémettre
    // un média déjà en base.
    test.setTimeout(90000);
    await boot(page);
    await page.evaluate(() => {
      conversationsState = [{ id: "conv_media", userId: "u_b", messages: [
        { id: "m_media", from: "me", at: Date.now(), text: "[MEDIA] photo", status: "sending" }] }];
      saveConversationsNow();
      MY_UID = "u_moi"; window.MY_UID = "u_moi";
      window.__inserts = [];
      // Même correctif que ci-dessus : la table est retenue, et seule
      // `conv_messages` est comptée.
      supa = { from: function (table) { return {
        insert: function (row) {
          window.__inserts.push({ table: table, row: row });
          // Première tentative (avec from_id) refusée, repli accepté.
          return Promise.resolve(row.from_id ? { error: { message: "colonne inconnue" } } : { error: null });
        },
      }; } };
      try { localStorage.removeItem("passio_msg_outbox_v1"); } catch (e) {}
    });

    await page.evaluate(async () => {
      sendMessageToSupabase("m_media", "conv_media", "https://exemple.test/a.jpg", "image/jpeg", "photo.jpg", "media");
      await new Promise((r) => setTimeout(r, 400));
    });

    const r = await etat(page);
    expect(r.avecFromId, "la première tentative (avec from_id) n'a pas eu lieu").toBe(true);
    expect(r.sansFromId, "le repli sans from_id n'a pas eu lieu").toBe(true);
    expect(r.statut).toBe("sent");
    expect(r.outbox).not.toContain("m_media");
  });
});
