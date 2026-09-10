// Notification d'un message privé — la cloche doit sonner AUSSI quand
// l'application était fermée.
//
// LE DÉFAUT (rapporté le 2026-09-09, mesuré en production). Envoyer un message
// n'écrivait AUCUNE ligne `notifications` : la seule notification existante
// était fabriquée LOCALEMENT par le destinataire, dans `_handleIncomingConvMessage`,
// donc uniquement si son application était ouverte à l'instant exact de l'envoi.
// Application fermée = aucune cloche, aucun push, et au retour la liste des
// conversations rechargée du serveur remettait `unread: 0`. Le message était là,
// rien ne le disait. La table de production ne portait aucune ligne
// `kind = 'message'` alors que `_notifEmoji` (✉️) et `openNotifTarget`
// (→ `openConversation`) la connaissent depuis toujours.
//
// Ce que cette suite exige : une notification par message envoyé, UNE SEULE
// (l'identifiant déterministe empêche le doublon local + serveur), pas dix pour
// une rafale, une cible qui ouvre la conversation, et une pastille de non-lus
// recalculée depuis `conv_reads` au rechargement.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Faux client Supabase : chaînable, mémorise les écritures. Aucune requête ne
// part — cette suite ne touche JAMAIS la base de production.
//
// ⚠️ ON MUTE LES MEMBRES DE `window.supa`, ON NE REMPLACE PAS `window.supa` :
// le `supa` lexical d'app-08 (`let supa`) et `window.supa` désignent le MÊME
// objet, mais une réassignation de `window.supa` ne changerait rien pour le code
// de l'app — piège déjà payé par `creation-passion.spec.js`.
//
// ⚠️ ET ON POSE CES MEMBRES PAR `defineProperty`, JAMAIS PAR UNE AFFECTATION.
// Divergence d'environnement mesurée le 2026-09-09 (verte en local, ROUGE en
// CI, trois essais de suite) : ici le SDK vient d'un CDN que le bac coupe, donc
// `supa` est le stub noop, un objet littéral où tout s'écrit ; en CI le runner a
// Internet, le VRAI client se charge, et `functions` y est un GETTER de
// prototype — une affectation y échoue EN SILENCE (code non strict), le vrai
// `invoke` partait, et `__push` restait vide. Une propriété PROPRE masque le
// getter dans les deux mondes. Même famille que « un test vert en local et
// rouge en CI est presque toujours une divergence d'environnement ».
const FAUX_SUPA = `
window.__inserts = [];
window.__push = [];
window.__reponses = {};
window._supaReal = true;
function _poser(nom, valeur) {
  Object.defineProperty(window.supa, nom, { value: valeur, configurable: true, writable: true });
}
_poser("from", function (table) {
  var q = {
    select: function () { return q; },
    eq: function () { return q; },
    neq: function () { return q; },
    in: function () { return q; },
    order: function () { return q; },
    limit: function () { return q; },
    maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
    insert: function (row) { window.__inserts.push({ table: table, row: row }); return Promise.resolve({ error: null }); },
    upsert: function () { return Promise.resolve({ error: null }); },
    then: function (r) { return Promise.resolve(window.__reponses[table] || { data: [], error: null }).then(r); },
  };
  return q;
});
_poser("functions", { invoke: function (n, o) { window.__push.push(o && o.body); return Promise.resolve({ data: null }); } });
`;

test.describe("Notification d'un message privé", () => {
  test("① envoyer un message écrit une notification `message` au destinataire, avec la conversation pour cible", async ({ page }) => {
    await bootOnboarded(page);
    const res = await page.evaluate(async (fake) => {
      eval(fake);
      window.__reponses["conv_members"] = { data: [{ user_id: MY_UID }, { user_id: "u_leane" }], error: null };
      await _notifierMessage("conv_1", "msg_abc");
      return window.__inserts.filter((i) => i.table === "notifications").map((i) => i.row);
    }, FAUX_SUPA);
    expect(res).toHaveLength(1);
    expect(res[0].user_id).toBe("u_leane");
    expect(res[0].kind).toBe("message");
    // La CIBLE : sans `ref_id`, toucher la notification n'ouvre rien.
    expect(res[0].ref_id).toBe("conv_1");
    expect(res[0].seen).toBe(false);
    // Le contenu du message ne voyage pas dans la notification (elle transite
    // aussi par le push).
    expect(res[0].content).not.toContain("msg_abc");
  });

  test("① bis — le push part avec la notification (l'appli fermée n'a que lui)", async ({ page }) => {
    await bootOnboarded(page);
    const push = await page.evaluate(async (fake) => {
      eval(fake);
      window.__reponses["conv_members"] = { data: [{ user_id: MY_UID }, { user_id: "u_leane" }], error: null };
      await _notifierMessage("conv_1", "msg_abc");
      return window.__push;
    }, FAUX_SUPA);
    expect(push).toHaveLength(1);
    expect(push[0]).toMatchObject({ toUserId: "u_leane", type: "notif", kind: "message" });
  });

  // ⚠️ RÉINJECTION DE LA DIVERGENCE D'ENVIRONNEMENT (2026-09-09). Ici le SDK
  // vient d'un CDN que le bac coupe : `supa` est le stub noop, un objet littéral
  // où `functions` s'écrit sans résistance. En CI le runner a Internet, le VRAI
  // client se charge, et `functions` y est un GETTER de prototype — une simple
  // affectation y échoue EN SILENCE. Ce cas reproduit cette forme-là AVANT de
  // poser le faux client : sans `defineProperty`, il repasse au rouge.
  test("① ter — le faux client s'impose même quand `functions` est un getter de prototype", async ({ page }) => {
    await bootOnboarded(page);
    const push = await page.evaluate(async (fake) => {
      var vraiInvoke = { invoke: function () { return Promise.resolve({ data: null }); } };
      var proto = Object.create(Object.getPrototypeOf(window.supa) || Object.prototype);
      Object.defineProperty(proto, "functions", { get: function () { return vraiInvoke; }, configurable: true });
      delete window.supa.functions;
      Object.setPrototypeOf(window.supa, proto);
      eval(fake);
      window.__reponses["conv_members"] = { data: [{ user_id: MY_UID }, { user_id: "u_leane" }], error: null };
      await _notifierMessage("conv_1", "msg_abc");
      return window.__push;
    }, FAUX_SUPA);
    expect(push).toHaveLength(1);
  });

  test("② une rafale de messages n'allume le téléphone qu'une fois", async ({ page }) => {
    await bootOnboarded(page);
    const n = await page.evaluate(async (fake) => {
      eval(fake);
      window.__reponses["conv_members"] = { data: [{ user_id: MY_UID }, { user_id: "u_leane" }], error: null };
      for (var i = 0; i < 5; i++) await _notifierMessage("conv_1", "msg_" + i);
      return window.__inserts.filter((x) => x.table === "notifications").length;
    }, FAUX_SUPA);
    expect(n).toBe(1);
  });

  test("② bis — un message reçu rouvre la fenêtre : la relance suivante sonne", async ({ page }) => {
    await bootOnboarded(page);
    const n = await page.evaluate(async (fake) => {
      eval(fake);
      window.__reponses["conv_members"] = { data: [{ user_id: MY_UID }, { user_id: "u_leane" }], error: null };
      await _notifierMessage("conv_1", "msg_0");
      // L'autre répond → `_handleIncomingConvMessage` remet la fenêtre à zéro.
      delete window._msgNotifDerniere["conv_1"];
      await _notifierMessage("conv_1", "msg_1");
      return window.__inserts.filter((x) => x.table === "notifications").length;
    }, FAUX_SUPA);
    expect(n).toBe(2);
  });

  test("③ un groupe reçoit une notification PAR membre, avec des identifiants distincts", async ({ page }) => {
    await bootOnboarded(page);
    const rows = await page.evaluate(async (fake) => {
      eval(fake);
      window.__reponses["conv_members"] = { data: [{ user_id: MY_UID }, { user_id: "u_a" }, { user_id: "u_b" }], error: null };
      await _notifierMessage("grp_1", "msg_z");
      return window.__inserts.filter((x) => x.table === "notifications").map((x) => x.row);
    }, FAUX_SUPA);
    expect(rows).toHaveLength(2);
    // Un identifiant unique par message aurait fait refuser la deuxième ligne
    // par la clé primaire — en silence.
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  test("④ la cloche n'affiche pas DEUX fois le même message (identifiant déterministe)", async ({ page }) => {
    await bootOnboarded(page);
    const n = await page.evaluate(() => {
      state.notifications = [];
      var id = _idNotifMessage("msg_abc", MY_UID);
      // La face locale (réception temps réel) et la face serveur (temps réel de
      // `notifications`) portent le même identifiant.
      pushNotification("<b>Léane</b> t'a envoyé un message", "✉️", "u_leane", { id: id, kind: "message", refId: "conv_1" });
      pushNotification("<b>Léane</b> t'a envoyé un message", "✉️", "u_leane", { id: id, kind: "message", refId: "conv_1" });
      return state.notifications.filter((x) => x.kind === "message").length;
    });
    expect(n).toBe(1);
  });

  test("④ bis — RÉINJECTION : sans identifiant partagé, le doublon revient", async ({ page }) => {
    await bootOnboarded(page);
    const n = await page.evaluate(() => {
      state.notifications = [];
      pushNotification("m", "✉️", "u_leane");
      pushNotification("m", "✉️", "u_leane");
      return state.notifications.length;
    });
    expect(n).toBe(2); // le défaut d'origine, tel quel
  });

  test("⑤ l'identifiant dépend du destinataire, et des deux côtés il est le même", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => ({
      a: _idNotifMessage("msg_1", "u_leane"),
      b: _idNotifMessage("msg_1", "u_leane"),
      c: _idNotifMessage("msg_1", "u_autre_compte"),
    }));
    expect(r.a).toBe(r.b);
    expect(r.a).not.toBe(r.c);
  });

  test("⑥ toucher la notification ouvre la conversation", async ({ page }) => {
    await bootOnboarded(page);
    const ouvert = await page.evaluate(() => {
      var vu = null;
      window.openConversation = function (id) { vu = id; };
      openNotifTarget({ kind: "message", refId: "conv_42", fromId: "u_leane" });
      return vu;
    });
    expect(ouvert).toBe("conv_42");
  });

  test("⑦ au rechargement, les messages reçus hors ligne restent NON LUS", async ({ page }) => {
    await bootOnboarded(page);
    const convs = await page.evaluate(async (fake) => {
      eval(fake);
      var t = new Date().toISOString();
      window.__reponses["conv_members"] = { data: [{ conv_id: "c1", user_id: MY_UID }, { conv_id: "c1", user_id: "u_leane" }], error: null };
      window.__reponses["conversations"] = { data: [{ id: "c1", is_group: false, created_by: "u_leane" }], error: null };
      window.__reponses["conv_messages"] = { data: [
        { id: "m2", conv_id: "c1", from_id: "u_leane", content: "coucou", created_at: t },
        { id: "m1", conv_id: "c1", from_id: "u_leane", content: "salut", created_at: t },
        { id: "m0", conv_id: "c1", from_id: MY_UID, content: "à moi", created_at: t },
      ], error: null };
      // Aucune ligne conv_reads : conversation jamais ouverte.
      window.__reponses["conv_reads"] = { data: [], error: null };
      return await supaLoadMyConversations();
    }, FAUX_SUPA);
    expect(convs).toHaveLength(1);
    // Deux messages de l'autre, aucun des miens : `unread: 0` en dur était le défaut.
    expect(convs[0].unread).toBe(2);
  });

  test("⑦ bis — ce qui est déjà lu ne compte pas, et un message de CONTRÔLE non plus", async ({ page }) => {
    await bootOnboarded(page);
    const convs = await page.evaluate(async (fake) => {
      eval(fake);
      var vieux = new Date(Date.now() - 3600e3).toISOString();
      var neuf = new Date().toISOString();
      window.__reponses["conv_members"] = { data: [{ conv_id: "c1", user_id: MY_UID }, { conv_id: "c1", user_id: "u_leane" }], error: null };
      window.__reponses["conversations"] = { data: [{ id: "c1", is_group: false, created_by: "u_leane" }], error: null };
      window.__reponses["conv_messages"] = { data: [
        { id: "m2", conv_id: "c1", from_id: "u_leane", content: '{"type":"react","target":"m1"}', created_at: neuf },
        { id: "m1", conv_id: "c1", from_id: "u_leane", content: "lu depuis longtemps", created_at: vieux },
      ], error: null };
      window.__reponses["conv_reads"] = { data: [{ conv_id: "c1", last_read_at: new Date(Date.now() - 60e3).toISOString() }], error: null };
      return await supaLoadMyConversations();
    }, FAUX_SUPA);
    expect(convs[0].unread).toBe(0);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ⑧ LE CÂBLAGE — le cas qui manquait, et sans lequel les sept autres ne
  // prouvaient RIEN (2026-09-10).
  //
  // Les cas ci-dessus appellent tous `_notifierMessage(...)` À LA MAIN. Ils
  // mesurent donc la fonction, jamais son branchement. Or le branchement était
  // FAUX : le seul appel vivait dans `supaSendMessage`, une écriture MORTE sans
  // aucun appelant dans le dépôt. Le correctif du 2026-09-09 était écrit, vert
  // et documenté, sur un chemin que personne n'emprunte — et la production le
  // disait : ZÉRO ligne `notifications` de type `message`, y compris pour le
  // message envoyé après son déploiement.
  //
  // ⚠️ On mesure donc À LA SOURCE, comme le fait `nom-utilisateur-inscription`
  // ⑦ : les deux vraies voies d'envoi doivent PORTER l'appel, et la fonction
  // morte ne doit pas revenir l'absorber. C'est le seul contrôle qu'un
  // remaniement de la messagerie ne peut pas rendre vert par accident.
  test("⑧ — les deux vraies voies d'envoi notifient, et la fonction morte n'est pas revenue", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => ({
      texte: String(window._sendTextToSupa || ""),
      media: String(window.sendMessageToSupabase || ""),
      morte: typeof window.supaSendMessage,
      notif: typeof window._notifierMessage,
    }));

    // Les deux voies existent bien (sinon le contrôle serait vert sur du vide).
    expect(r.texte.length).toBeGreaterThan(200);
    expect(r.media.length).toBeGreaterThan(200);
    expect(r.notif).toBe("function");

    // Et chacune appelle la notification.
    expect(r.texte).toContain("_notifierMessage");
    expect(r.media).toContain("_notifierMessage");

    // ⚠️ La fonction morte ne doit pas réapparaître : c'est elle qui a donné au
    // correctif un endroit plausible où se poser, et aux tests un endroit
    // plausible où être verts.
    expect(r.morte).toBe("undefined");
  });

});
