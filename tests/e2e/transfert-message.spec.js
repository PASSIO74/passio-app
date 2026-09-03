// ═══════════════════════════════════════════════════════════════════════════
// TRANSFERT DE MESSAGE — l'échec d'écriture doit être VU.
//
// Invariant maison : le SDK Supabase ne lève pas sur un refus RLS, il renvoie
// `{ error }`. Une écriture dont personne ne lit le retour reste « réussie » à
// l'écran et disparaît au rechargement.
//
// `_forwardTo` avalait les deux callbacks : `.then(function(){}, function(){})`.
// Un transfert dont l'insertion échouait restait affiché comme envoyé, sans
// statut d'échec ni mise en file de renvoi.
//
// Ce n'était pas un oubli isolé : le chemin d'envoi PRINCIPAL, vingt lignes plus
// bas dans le même fichier, traite déjà ce cas correctement (statut « failed » +
// outbox + renvoi manuel). Le transfert n'avait jamais reçu ce traitement —
// quatrième « survivant d'un correctif incomplet » trouvé le 2026-08-16.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page);
  await page.waitForFunction(
    () => typeof _forwardTo === "function" && typeof _outboxLoad === "function"
       && typeof getConversations === "function",
    null, { timeout: 20000 },
  );
}

// Prépare une conversation source (avec un message) et une cible, puis arme
// `supa` pour que l'insertion réponde ce qu'on veut.
async function preparer(page, reponse) {
  return page.evaluate((rep) => {
    conversationsState = [
      { id: "conv_src", userId: "u_a", messages: [{ id: "m_src", from: "them", at: Date.now(), text: "à transférer" }] },
      { id: "conv_cible", userId: "u_b", messages: [] },
    ];
    saveConversationsNow();
    window._forwardSrc = { convId: "conv_src", msgId: "m_src" };
    MY_UID = "u_moi"; window.MY_UID = "u_moi";
    window.__inserts = [];
    supa = { from: function () { return {
      insert: function (row) {
        window.__inserts.push(row);
        return Promise.resolve(rep);   // { error: … } ou { error: null }
      },
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
    return true;
  }, reponse);
}

test.describe("Transfert de message — verdict de l'écriture", () => {
  test("une insertion refusée marque le message en échec et le met en file de renvoi", async ({ page }) => {
    test.setTimeout(90000);
    await boot(page);
    await preparer(page, { error: { message: "RLS", code: "42501" } });

    const r = await page.evaluate(async () => {
      _forwardTo("conv_cible");
      await new Promise((r) => setTimeout(r, 300));   // laisser la promesse se résoudre
      const cible = (getConversations() || []).find((c) => c.id === "conv_cible");
      const msg = (cible && cible.messages || [])[0];
      return {
        inserts: window.__inserts.length,
        statut: msg && msg.status,
        enFile: (_outboxLoad() || []).some((x) => x.msgId === (msg && msg.id)),
      };
    });

    // ⚠️ L'ISOLATION EST VÉRIFIÉE, PAS SEULEMENT POSÉE — et APRÈS la mesure, car
    // `_flushOutbox` repasse les messages en « sending » avant de les renvoyer :
    // le déclencher avant fausserait l'assertion de statut. C'est ce que fait la
    // CI à 1,5 s (`supaInit` → `setTimeout(_flushOutbox, 1500)`), et sans la
    // neutralisation de `preparer()` le compteur passait à 2.
    const apresRenvoi = await page.evaluate(async () => {
      window._supaReal = true;
      try { _flushOutbox(); } catch (e) {}
      await new Promise((r) => setTimeout(r, 250));
      return window.__inserts.length;
    });
    expect(apresRenvoi, "le renvoi automatique ne doit plus polluer le compteur").toBe(r.inserts);

    expect(r.inserts, "l'insertion a bien été tentée").toBe(1);
    expect(r.statut, "un transfert refusé doit être marqué en échec").toBe("failed");
    expect(r.enFile, "et mis en file de renvoi, sinon il est perdu en silence").toBe(true);
  });

  test("une insertion acceptée marque le message envoyé et ne laisse rien en file", async ({ page }) => {
    // La contre-épreuve : un correctif qui marquerait TOUT en échec passerait le
    // test précédent tout en cassant le transfert normal.
    test.setTimeout(90000);
    await boot(page);
    await preparer(page, { error: null });

    const r = await page.evaluate(async () => {
      _forwardTo("conv_cible");
      await new Promise((r) => setTimeout(r, 300));
      const cible = (getConversations() || []).find((c) => c.id === "conv_cible");
      const msg = (cible && cible.messages || [])[0];
      return {
        statut: msg && msg.status,
        enFile: (_outboxLoad() || []).some((x) => x.msgId === (msg && msg.id)),
        texte: msg && msg.text,
      };
    });

    expect(r.statut, "un transfert accepté doit être marqué envoyé").toBe("sent");
    expect(r.enFile, "et ne rien laisser en file de renvoi").toBe(false);
    expect(r.texte, "le contenu transféré est bien celui du message source").toBe("à transférer");
  });
});
