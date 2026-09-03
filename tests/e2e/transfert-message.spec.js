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

    // ⚠️ ET LE STATUT, PAS SEULEMENT LE COMPTEUR — deuxième moitié du même
    // défaut, mesurée en CI le 2026-09-03 (run 2452, shard 3/6) : `statut`
    // valait « sending » au lieu de « failed ».
    // `_flushOutbox` (app-04:4549) fait DEUX choses par message :
    // `_setMsgStatus(..., "sending")` PUIS `_sendTextToSupa(...)`. Neutraliser
    // le second a corrigé le compteur d'insertions ; le premier, lui, continuait
    // de repasser le message en « sending » dès que le minuteur de 1,5 s tombait
    // AVANT la mesure — ce qui dépend du temps de démarrage, donc du hasard.
    //
    // ⚠️ LE MINUTEUR NE PEUT PAS ÊTRE DÉSARMÉ EN REMPLAÇANT `_flushOutbox` :
    // `supaInit` le planifie par RÉFÉRENCE (`setTimeout(_flushOutbox, 1500)`),
    // donc réassigner `window._flushOutbox` n'atteint pas la fonction déjà
    // capturée. On neutralise la seule transition qui gêne, à l'endroit où
    // `_flushOutbox` l'appelle PAR SON NOM.
    //
    // ⚠️ GELER « sending » NE FAUSSE RIEN : le chemin d'échec écrit « failed »
    // DIRECTEMENT (app-04:4217, 4518, 4521, 4526, 4529), sans transition
    // intermédiaire. L'état final mesuré reste donc celui que le produit pose.
    window.__gelerPassageEnEnvoi = true;
    var _vraiSetMsgStatus = window._setMsgStatus;
    window._setMsgStatus = function (convId, msgId, statut) {
      if (statut === "sending" && window.__gelerPassageEnEnvoi) return;
      return _vraiSetMsgStatus.apply(this, arguments);
    };
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
