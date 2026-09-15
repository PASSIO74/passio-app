// AUTH-06 — une file de messages préparée sous un compte partait sous le suivant.
//
// LE DÉFAUT. La file hors-ligne des messages (`passio_outbox_v1`) ne portait
// aucun propriétaire : une entrée est `{ convId, msgId, content, essais }`, et
// `_sendTextToSupa` reconstruit l'auteur avec `MY_UID` AU MOMENT DE L'ENVOI.
// Or deux comptes se succèdent sur le même appareil (déconnexion puis connexion
// d'un autre, retour OAuth, `onAuthStateChange`). Un texte préparé par A, resté
// en file (hors-ligne, panne serveur), était donc rejoué au démarrage ou au
// retour du réseau avec `from_id = B` — et `content` porte encore le persona de
// A. Si A et B partagent une conversation (leur 1:1, un groupe commun), le
// serveur l'ACCEPTE : B « envoie » le texte de A, sous son propre nom.
//
// Et la clé n'était pas dans `ACCOUNT_SCOPED_KEYS` : la déconnexion purgeait les
// conversations (localStorage + IndexedDB) mais laissait la file — donc le texte
// d'un message privé de A — lisible par le compte suivant.
//
// La file des COMMENTAIRES (`passio_cmt_outbox_v1`) avait le même défaut ; celle
// des SUPPRESSIONS (`passio_post_delete_outbox_v1`) portait déjà le compte et
// filtrait au rejeu — c'est ce patron qui est repris.
//
// Aucune requête ne part : `window.supa.from` est MUTÉ (jamais remplacé — en CI
// le vrai SDK se charge avec des getters de prototype). ① ③ ⑤ ⑥ sont éprouvés
// par RÉINJECTION : ils rougissent sur le code d'avant.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_A = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_B = "88881111-2222-4333-8444-555566667777";

const FAUX_SUPA = `
window.__envois = [];
window._supaReal = true;
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    return {
      insert: function (row) {
        window.__envois.push({ table: table, row: row });
        return Promise.resolve(window.__reponse || { error: null });
      },
    };
  },
});
window.__poserConv = function (convId, msgId, texte) {
  var convs = getConversations();
  convs.push({ id: convId, userId: "${UID_B}", userName: "Léane", messages: [{ id: msgId, text: texte, mine: true }] });
  saveConversations();
};
// Le changement de compte SANS purge : le chemin le plus court (onAuthStateChange,
// retour OAuth) — celui où seule la file elle-même peut se défendre.
window.__devenir = function (uid) { MY_UID = uid; window.MY_UID = uid; };
window.__file = function () { return JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]"); };
window.__attendre = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_A);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
  expect(await page.evaluate(() => MY_UID), "prémisse : le banc démarre sous A").toBe(UID_A);
}

// Un message de A qui reste en file : échec TRANSITOIRE (500), donc remis en file.
async function laisserEnFileSousA(page, convId, msgId) {
  await page.evaluate(async ([convId, msgId]) => {
    localStorage.removeItem("passio_outbox_v1");
    window.__poserConv(convId, msgId, "texte privé de A");
    window.__reponse = { status: 500, error: { message: "internal error" } };
    _sendTextToSupa(convId, msgId, _withSenderMeta("texte privé de A"));
    await window.__attendre(60);
    window.__envois = [];
    window.__reponse = { error: null };
  }, [convId, msgId]);
  const file = await page.evaluate(() => window.__file());
  expect(file, "prémisse : le message de A est en file").toHaveLength(1);
  expect(file[0].msgId).toBe(msgId);
}

test.describe("AUTH-06 — la file des messages appartient à un compte", () => {
  test("① rejeu sous B : le message de A ne part PAS, et sort de la file", async ({ page }) => {
    await banc(page);
    await laisserEnFileSousA(page, "conv_ab", "msg_a1");
    const res = await page.evaluate(async () => {
      window.__devenir("88881111-2222-4333-8444-555566667777");
      _flushOutbox();
      await window.__attendre(80);
      return { envois: window.__envois, file: window.__file() };
    });
    // RÉINJECTION : sur le code d'avant, un insert part avec from_id = B.
    expect(res.envois.filter((e) => e.table === "conv_messages"), "aucun envoi sous B").toEqual([]);
    expect(res.file, "l'entrée de A ne reste pas chez B").toEqual([]);
  });

  test("② rejeu sous A : le message part, avec from_id = A, et sort de la file", async ({ page }) => {
    await banc(page);
    await laisserEnFileSousA(page, "conv_ab", "msg_a2");
    const res = await page.evaluate(async () => {
      _flushOutbox();
      await window.__attendre(80);
      return { envois: window.__envois, file: window.__file() };
    });
    const envois = res.envois.filter((e) => e.table === "conv_messages");
    expect(envois).toHaveLength(1);
    expect(envois[0].row.id).toBe("msg_a2");
    expect(envois[0].row.from_id).toBe(UID_A);
    expect(res.file).toEqual([]);
  });

  test("③ la déconnexion purge la file des messages ET celle des commentaires", async ({ page }) => {
    await banc(page);
    await laisserEnFileSousA(page, "conv_ab", "msg_a3");
    const cles = await page.evaluate(async () => {
      localStorage.setItem("passio_cmt_outbox_v1", JSON.stringify([{ opId: "ob_x", type: "post_comment", threadId: "p1", nodeId: "c1", text: "brouillon", tries: 0 }]));
      await purgeAccountScopedData();
      return { messages: localStorage.getItem("passio_outbox_v1"), commentaires: localStorage.getItem("passio_cmt_outbox_v1") };
    });
    // RÉINJECTION : sur le code d'avant, les deux clés survivent à la purge.
    expect(cles.messages, "passio_outbox_v1 purgée").toBeNull();
    expect(cles.commentaires, "passio_cmt_outbox_v1 purgée").toBeNull();
  });

  test("④ « réessayer » sous B sur une entrée de A : rien ne part, l'entrée sort", async ({ page }) => {
    await banc(page);
    await laisserEnFileSousA(page, "conv_ab", "msg_a4");
    const res = await page.evaluate(async () => {
      window.__devenir("88881111-2222-4333-8444-555566667777");
      _retryMsg("conv_ab", "msg_a4");
      await window.__attendre(80);
      var c = getConversations().find(function (x) { return x.id === "conv_ab"; });
      var m = c && c.messages.find(function (x) { return x.id === "msg_a4"; });
      return { envois: window.__envois, file: window.__file(), statut: m && m.status };
    });
    expect(res.envois.filter((e) => e.table === "conv_messages")).toEqual([]);
    expect(res.file).toEqual([]);
    expect(res.statut, "le message reste visible, en échec — rien n'est perdu à l'écran").toBe("failed");
  });

  // ⑤ RÉVISÉ le 2026-09-15 (contre-revue Astra, AUTH-06 PARTIEL) : la version
  // du 14/09 ADOPTAIT une entrée sans propriétaire dès que son message était
  // dans les conversations de l'appareil — cache que le chemin court du
  // changement de compte (`onAuthStateChange`) ne purge pas : le texte de A
  // partait sous B. Une entrée sans propriétaire ne prouve rien : elle sort,
  // son message reste à l'écran en échec, rien ne part.
  test("⑤ une entrée d'AVANT le 14/09 (sans propriétaire) n'est JAMAIS rejouée ni adoptée — même si son message est ici", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_legacy", "msg_ici", "ancien message");
      localStorage.setItem("passio_outbox_v1", JSON.stringify([
        { convId: "conv_legacy", msgId: "msg_ici", content: "ancien message", at: Date.now(), essais: 0 },
        { convId: "conv_disparue", msgId: "msg_ailleurs", content: "orphelin", at: Date.now(), essais: 0 },
      ]));
      // Le cas d'Astra : B a pris la main sur l'appareil sans purge du cache.
      window.__devenir("88881111-2222-4333-8444-555566667777");
      _flushOutbox();
      await window.__attendre(80);
      var c = getConversations().find(function (x) { return x.id === "conv_legacy"; });
      var m = c && c.messages.find(function (x) { return x.id === "msg_ici"; });
      return { envois: window.__envois, file: window.__file(), statut: m && m.status };
    });
    // RÉINJECTION : sur le code du 14/09, msg_ici est ADOPTÉ et envoyé avec from_id = B.
    expect(res.envois.filter((e) => e.table === "conv_messages")).toEqual([]);
    expect(res.file).toEqual([]);
    expect(res.statut, "le texte reste visible, en échec").toBe("failed");
  });

  test("⑧ renvoi manuel reconstruit depuis le texte : seulement par le compte qui l'a ÉCRIT (`de`)", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      var convs = getConversations();
      // Un message écrit par A (il porte `de`), un message d'une ancienne version (sans `de`).
      convs.push({ id: "conv_r", userId: "88881111-2222-4333-8444-555566667777", userName: "Léane", messages: [
        { id: "msg_de_a", text: "écrit par A", mine: true, status: "failed", de: MY_UID },
        { id: "msg_ancien", text: "ancienne version", mine: true, status: "failed" },
      ] });
      saveConversations();
      window.__toasts = []; window.toast = function (t) { window.__toasts.push(String(t)); };
      // Sous A : le sien part, l'ancien ne part pas.
      _retryMsg("conv_r", "msg_de_a"); await window.__attendre(60);
      _retryMsg("conv_r", "msg_ancien"); await window.__attendre(60);
      var sousA = window.__envois.filter(function (e) { return e.table === "conv_messages"; }).map(function (e) { return e.row.id; });
      window.__envois = [];
      // Sous B, sans purge : le message de A ne se reconstruit pas.
      window.__devenir("88881111-2222-4333-8444-555566667777");
      _retryMsg("conv_r", "msg_de_a"); await window.__attendre(60);
      var sousB = window.__envois.filter(function (e) { return e.table === "conv_messages"; }).map(function (e) { return e.row.id; });
      return { sousA, sousB, toasts: window.__toasts.slice() };
    });
    expect(res.sousA).toEqual(["msg_de_a"]);
    // RÉINJECTION : sur le code du 14/09, sousA = ["msg_de_a", "msg_ancien"] et sousB = ["msg_de_a"] (from_id = B).
    expect(res.sousB).toEqual([]);
    expect(res.toasts.some((t) => /autre compte ou une ancienne version/.test(t))).toBe(true);
  });

  test("⑥ la file des commentaires : un brouillon de A n'est pas publié par B", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_cmt_outbox_v1");
      window.__cmts = [];
      window.supaAddComment = async function (postId, text, id) { window.__cmts.push({ postId: postId, text: text, id: id, auteur: MY_UID }); return true; };
      // Backend « pas prêt » le temps de mettre en file sous A, pour que
      // `_enqueueCommentSync` n'envoie pas tout de suite.
      window._supaReal = false;
      _enqueueCommentSync({ type: "post_comment", threadId: "p1", nodeId: "c_a", commentId: "c_a", text: "commentaire de A" });
      var enFile = JSON.parse(localStorage.getItem("passio_cmt_outbox_v1") || "[]");
      window.__devenir("88881111-2222-4333-8444-555566667777");
      window._supaReal = true;
      await _cmtObFlush();
      return { enFile: enFile, publies: window.__cmts, reste: JSON.parse(localStorage.getItem("passio_cmt_outbox_v1") || "[]") };
    });
    expect(res.enFile, "prémisse : le commentaire de A est en file").toHaveLength(1);
    expect(res.enFile[0].uid, "l'entrée porte son compte").toBe(UID_A);
    // RÉINJECTION : sur le code d'avant, le commentaire part avec auteur = B.
    expect(res.publies, "rien publié sous B").toEqual([]);
    expect(res.reste, "le brouillon de A ne reste pas chez B").toEqual([]);
  });

  test("⑦ la file des commentaires sous le MÊME compte part normalement", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_cmt_outbox_v1");
      window.__cmts = [];
      window.supaAddComment = async function (postId, text, id) { window.__cmts.push({ postId: postId, text: text, id: id, auteur: MY_UID }); return true; };
      window._supaReal = false;
      _enqueueCommentSync({ type: "post_comment", threadId: "p1", nodeId: "c_a", commentId: "c_a", text: "commentaire de A" });
      window._supaReal = true;
      await _cmtObFlush();
      return { publies: window.__cmts, reste: JSON.parse(localStorage.getItem("passio_cmt_outbox_v1") || "[]") };
    });
    expect(res.publies).toHaveLength(1);
    expect(res.publies[0].auteur).toBe(UID_A);
    expect(res.reste).toEqual([]);
  });
});
