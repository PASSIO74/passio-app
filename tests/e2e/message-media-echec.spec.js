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
    supa = { from: function () { return {
      insert: function (row) { window.__inserts.push(row); return Promise.resolve(rep); },
    }; } };
    try { localStorage.removeItem("passio_msg_outbox_v1"); } catch (e) {}
  }, reponse);
}

// ⚠️ LA SONDE COMPTE TOUTES LES INSERTIONS, PAS SEULEMENT CELLES DU MÉDIA :
// `preparer()` remplace `supa` EN ENTIER, donc n'importe quel autre chemin de
// l'application qui ferait `supa.from(X).insert(Y)` pendant la fenêtre de mesure
// gonfle le compteur. On rend donc les lignes elles-mêmes : un écart doit dire
// QUI a inséré, sinon le rouge envoie chercher au mauvais endroit — et en CI,
// où le vrai client Supabase existe (il n'existe pas en local), c'est
// exactement ce qui s'est produit le 2026-09-02.
const etat = (page) => page.evaluate(() => ({
  statut: (getConversations().find((c) => c.id === "conv_media").messages[0] || {}).status,
  outbox: _outboxLoad().map((x) => x.msgId),
  inserts: window.__inserts.length,
  lignes: window.__inserts.map(function (r) {
    try { return JSON.stringify(r).slice(0, 160); } catch (e) { return String(r); }
  }),
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
    // Deux tentatives : avec from_id, puis le repli sans from_id.
    expect(r.inserts, "insertions observées : " + JSON.stringify(r.lignes)).toBe(2);
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
    expect(r.inserts, "insertions observées : " + JSON.stringify(r.lignes)).toBe(1);
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
      supa = { from: function () { return {
        insert: function (row) {
          window.__inserts.push(row);
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
    expect(r.inserts, "insertions observées : " + JSON.stringify(r.lignes)).toBe(2);
    expect(r.statut).toBe("sent");
    expect(r.outbox).not.toContain("m_media");
  });
});
