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
