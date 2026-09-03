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
    // ⚠️ LE STUB RETIENT LA TABLE, ET C'EST INDISPENSABLE (2026-09-03).
    // Il l'ignorait : `from()` ne regardait pas son argument, donc `__inserts`
    // comptait les insertions de TOUTES les tables — ce test remplace le `supa`
    // GLOBAL, pas un client local. Tant que le shard ne réveillait rien d'autre
    // dans la fenêtre de 300 ms, le compte tombait juste par chance.
    //
    // Mesuré sur `main` le 2026-09-03 (run 2431, shard 5/6, rouge aux TROIS
    // essais donc pas un flake) : « Expected 1, Received 2 ». En CI le réseau
    // existe, la télémétrie part vraiment — le shard voisin `tel-preauth` le
    // montre dans le même log — et une seconde insertion tombait dans la
    // fenêtre. Le verdict dépendait donc du DÉCOUPAGE DES SHARDS, que la fusion
    // de deux PR venait de changer : vert sur la PR, rouge sur main, à code
    // identique. En isolation le fichier passe toujours, ce qui rendait le
    // défaut invisible à qui relance le seul spec.
    //
    // On compte désormais ce que ce test PRÉTEND mesurer : les insertions du
    // chemin de transfert, c'est-à-dire `conv_messages` (app-04, `_forwardTo`).
    supa = { from: function (table) { return {
      insert: function (row) {
        window.__inserts.push({ table: table, row: row });
        return Promise.resolve(rep);   // { error: … } ou { error: null }
      },
    }; } };
    // Les insertions du chemin de transfert, et elles seules.
    window.__insertsConv = function () {
      return (window.__inserts || []).filter(function (i) { return i.table === "conv_messages"; });
    };
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
        inserts: window.__insertsConv().length,
        // Diagnostic : si une autre table s'invite, le message d'échec le dira
        // au lieu de laisser chercher.
        tables: (window.__inserts || []).map(function (i) { return i.table; }),
        statut: msg && msg.status,
        enFile: (_outboxLoad() || []).some((x) => x.msgId === (msg && msg.id)),
      };
    });

    expect(r.inserts, "l'insertion du transfert a bien été tentée — tables vues : " + JSON.stringify(r.tables)).toBe(1);
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
