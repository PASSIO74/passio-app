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
    // ⚠️ LE RENVOI AUTOMATIQUE N'EST PAS LE SUJET DE CE TEST, ET IL FAUSSAIT SON
    // COMPTEUR. `supaInit()` planifie `setTimeout(_flushOutbox, 1500)`
    // (app-08) : 1,5 s après le démarrage, la file d'attente est vidée et
    // `_sendTextToSupa` RÉINSÈRE le message que ce test vient de mettre en
    // échec. En local le défaut est invisible — `_supaReal` y vaut faux, donc
    // `_sendTextToSupa` sort sans insérer — mais en CI, où le vrai client
    // existe, l'insertion part et le compteur dérive de +1. Rouge sur `main`
    // au run 2437 (transfert), et sur la PR #251 (média) après fusion.
    //
    // Le PRODUIT a raison : un message en échec doit être rejoué, et le renvoi
    // réutilise le MÊME identifiant, donc la clé primaire interdit tout
    // doublon. C'est le test qui mesurait son chemin PLUS un minuteur qu'il ne
    // possède pas — même maladie que #249, #252 et #255, sur une autre
    // frontière. On neutralise donc le renvoi : `_sendTextToSupa` est une
    // `function` de haut niveau, donc une propriété de `window`, et
    // `_flushOutbox` l'appelle par ce nom.
    window._sendTextToSupa = function () {};
  }, reponse);
}

const etat = (page) => page.evaluate(() => ({
  statut: (getConversations().find((c) => c.id === "conv_media").messages[0] || {}).status,
  outbox: _outboxLoad().map((x) => x.msgId),
  inserts: window.__inserts.length,
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
    // ⚠️ L'ISOLATION EST VÉRIFIÉE, PAS SEULEMENT POSÉE — et APRÈS la mesure, car
    // `_flushOutbox` repasse les messages en « sending » avant de les renvoyer :
    // le déclencher avant fausserait l'assertion de statut. C'est ce que fait la
    // CI à 1,5 s (`supaInit` → `setTimeout(_flushOutbox, 1500)`), et sans la
    // neutralisation posée dans `preparer()` le compteur passait à 3.
    const apresRenvoi = await page.evaluate(async () => {
      window._supaReal = true;
      try { _flushOutbox(); } catch (e) {}
      await new Promise((r) => setTimeout(r, 250));
      return window.__inserts.length;
    });
    expect(apresRenvoi, "le renvoi automatique ne doit plus polluer le compteur").toBe(r.inserts);

    // Deux tentatives : avec from_id, puis le repli sans from_id.
    expect(r.inserts).toBe(2);
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
    expect(r.inserts).toBe(1);
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
    expect(r.inserts).toBe(2);
    expect(r.statut).toBe("sent");
    expect(r.outbox).not.toContain("m_media");
  });
});
