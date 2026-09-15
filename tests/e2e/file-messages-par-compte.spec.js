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
        // ASTRA-21 : une réponse RETENUE. Le banc la relâche quand il veut, ce
        // qui est le seul moyen de mesurer ce qui se passe PENDANT le vol.
        if (window.__retenir) {
          return new Promise(function (resoudre, rejeter) {
            window.__relacher = function (rep) { resoudre(rep || window.__reponse || { error: null }); };
            // ASTRA-43 : le REJET (panne réseau) est une autre continuation que la résolution.
            window.__rejeter = function (err) { rejeter(err || new Error("Failed to fetch")); };
          });
        }
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

  // ══════════════════════════════════════════════════════════════════════════
  // ASTRA-21 (quatrième contre-revue, 15/09/2026) — LE DÉFAUT QUI RESTAIT.
  //
  // Le correctif AUTH-06 protège la file AU REPOS : une entrée porte son compte
  // et le rejeu la jette si ce n'est pas le compte courant. Mais il ne protège
  // PAS la file EN VOL. `_sendTextToSupa` part sous A ; sa réponse revient plus
  // tard ; `_outboxAdd` prenait alors `_fileProprietaire()` — c'est-à-dire le
  // compte COURANT, devenu B. Le texte de A rentrait en file sous le nom de B,
  // et le vidage suivant l'envoyait avec `from_id = B`.
  //
  // Purger la file ne sauvait rien : la réponse tardive la REPEUPLAIT après la
  // purge. Et la réparation 403 rappelait `_sendTextToSupa`, qui relisait
  // `MY_UID` — donc insérait le texte de A sous B, sans passer par la file.
  // ══════════════════════════════════════════════════════════════════════════

  test("⑦ ASTRA-21 — une réponse tardive ne remet PAS le texte de A en file sous B", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_ab", "msg_tardif", "texte privé de A");
      window.__retenir = true;
      _sendTextToSupa("conv_ab", "msg_tardif", _withSenderMeta("texte privé de A"));
      await window.__attendre(30);
      // Le compte change PENDANT le vol, puis la file est purgée.
      window.__devenir("88881111-2222-4333-8444-555566667777");
      localStorage.removeItem("passio_outbox_v1");
      // La réponse de l'envoi de A arrive MAINTENANT : panne transitoire.
      window.__relacher({ status: 503, error: { message: "service unavailable" } });
      await window.__attendre(80);
      const file = window.__file();
      window.__envois = [];
      window.__retenir = false;
      window.__reponse = { error: null };
      _flushOutbox();
      await window.__attendre(80);
      return { file: file, envoisApresFlush: window.__envois.filter((e) => e.table === "conv_messages") };
    });
    // AVANT : file = [{ msgId: 'msg_tardif', owner: B }] → flush → INSERT from_id B.
    expect(res.file, "une réponse tardive ne repeuple pas une file purgée").toEqual([]);
    expect(res.envoisApresFlush, "le texte de A ne repart jamais sous B").toEqual([]);
  });

  test("⑦ bis ASTRA-21 — si la file n'est PAS purgée, l'entrée reste la propriété de A", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_ab", "msg_tardif2", "texte privé de A");
      window.__retenir = true;
      _sendTextToSupa("conv_ab", "msg_tardif2", _withSenderMeta("texte privé de A"));
      await window.__attendre(30);
      window.__devenir("88881111-2222-4333-8444-555566667777");
      window.__relacher({ status: 503, error: { message: "service unavailable" } });
      await window.__attendre(80);
      return { file: window.__file() };
    });
    // Remise en file OU rien — mais JAMAIS sous B. C'est l'owner qui est mesuré.
    for (const e of res.file) {
      expect(e.owner, "une entrée remise en file garde l'auteur d'origine").not.toBe("88881111-2222-4333-8444-555566667777");
      expect(e.owner).toBe(UID_A);
    }
  });

  test("⑧ ASTRA-21 — la réparation 403 n'envoie jamais le texte de A sous B", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_403", "msg_403", "texte privé de A");
      // La réparation d'appartenance réussit : le chemin rappelle _sendTextToSupa.
      window._reparerAppartenanceConv = function () { return Promise.resolve(true); };
      window._convReparationTentee = {};
      window.__retenir = true;
      _sendTextToSupa("conv_403", "msg_403", _withSenderMeta("texte privé de A"));
      await window.__attendre(30);
      window.__devenir("88881111-2222-4333-8444-555566667777");
      window.__envois = [];
      window.__retenir = false;
      window.__reponse = { error: null };
      window.__relacher({ status: 403, error: { code: "42501", message: "row-level security" } });
      await window.__attendre(120);
      return { envois: window.__envois.filter((e) => e.table === "conv_messages"), file: window.__file() };
    });
    // AVANT : la récursion relisait MY_UID → INSERT { from_id: B, content: texte de A }.
    expect(res.envois, "la réparation ne réémet pas sous le compte suivant").toEqual([]);
    for (const e of res.file) expect(e.owner).not.toBe("88881111-2222-4333-8444-555566667777");
  });

  // ⚠️ CE CAS DIT CE QUE LE DURCISSEMENT COÛTE, ET CE QU'IL NE COÛTE PAS.
  // Quand la réponse revient sous B, l'entrée n'est PAS remise en file — et ce
  // n'est pas un oubli : garder le texte d'un message privé de A dans une file
  // que B peut lire est très exactement la fuite qu'AUTH-06 a fermée. Le
  // renvoi AUTOMATIQUE est donc abandonné dans ce cas précis ; le TEXTE, lui,
  // ne l'est pas — il reste à l'écran en échec, avec son « réessayer », et
  // `_retryMsg` le reconstruit depuis `m.de`, l'auteur inscrit à l'écriture.
  // « On abandonne l'automatisme, pas le texte. »
  test("⑨ ASTRA-21 — A → B → A : rien n'est perdu, et A renvoie lui-même sous A", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_ab", "msg_aba", "texte privé de A");
      // `de` est posé par le chemin d'écriture réel ; le banc pose la conv à la
      // main, donc on reproduit ce que `sendMessage` inscrit.
      (function () {
        var convs = getConversations();
        var c = convs.find(function (x) { return x.id === "conv_ab"; });
        var m = c.messages.find(function (x) { return x.id === "msg_aba"; });
        m.de = MY_UID; m.mine = true; m.from = "me";
        saveConversations();
      })();
      window.__retenir = true;
      _sendTextToSupa("conv_ab", "msg_aba", _withSenderMeta("texte privé de A"));
      await window.__attendre(30);
      window.__devenir("88881111-2222-4333-8444-555566667777");
      window.__relacher({ status: 503, error: { message: "service unavailable" } });
      await window.__attendre(60);
      // Pendant que B est là : la file ne porte RIEN du texte de A.
      const fileSousB = window.__file();
      const statutSousB = (function () {
        var c = getConversations().find(function (x) { return x.id === "conv_ab"; });
        return (c.messages.find(function (x) { return x.id === "msg_aba"; }) || {}).status;
      })();
      // A revient et renvoie lui-même.
      window.__devenir("3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31");
      window.__envois = [];
      window.__retenir = false;
      window.__reponse = { error: null };
      _retryMsg("conv_ab", "msg_aba");
      await window.__attendre(80);
      return { fileSousB, statutSousB, envois: window.__envois.filter((e) => e.table === "conv_messages") };
    });
    expect(res.fileSousB, "le texte privé de A ne reste pas en file pendant que B est connecté").toEqual([]);
    expect(res.statutSousB, "le message reste à l'écran, en échec — donc renvoyable").toBe("failed");
    expect(res.envois.length, "au retour de A, « réessayer » renvoie le message").toBeGreaterThan(0);
    for (const e of res.envois) expect(e.row.from_id, "et il part sous A").toBe(UID_A);
  });

  test("⑩ ASTRA-21 — un envoi n'insère jamais sous un compte autre que celui qui l'a écrit", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_ab", "msg_bascule", "texte privé de A");
      window.__envois = [];
      // La bascule a lieu AVANT que l'envoi ne parte : l'auteur capturé (A)
      // n'est plus le compte courant, l'INSERT ne doit pas avoir lieu.
      const auteurAvant = MY_UID;
      window.__devenir("88881111-2222-4333-8444-555566667777");
      _sendTextToSupa("conv_ab", "msg_bascule", _withSenderMeta("texte privé de A"), auteurAvant);
      await window.__attendre(80);
      return { envois: window.__envois.filter((e) => e.table === "conv_messages"), file: window.__file() };
    });
    expect(res.envois, "un auteur capturé qui n'est plus le compte courant n'écrit rien").toEqual([]);
    for (const e of res.file) expect(e.owner).toBe(UID_A);
  });

  // ═══ ASTRA-43 (cinquième contre-revue, 2026-09-15) : le REJET tardif après purge ═══
  test("⑪ ASTRA-43 — REPRODUCTION : envoi suspendu, purge, génération incrémentée, identité retirée, puis REJET → le texte ne ressuscite pas", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_ab", "msg_rejet", "texte privé de A");
      window.__retenir = true;
      _sendTextToSupa("conv_ab", "msg_rejet", _withSenderMeta("texte privé de A"));
      await window.__attendre(30);
      // La purge : file vidée, génération incrémentée, identité retirée (déconnexion).
      localStorage.removeItem("passio_outbox_v1");
      _outboxInvaliderEnVol();
      window.__devenir(null);
      // La requête est REJETÉE (panne réseau) — c'est le `catch`, pas la résolution.
      window.__rejeter(new Error("Failed to fetch"));
      await window.__attendre(80);
      return { file: window.__file(), statut: (getConversations().find((c) => c.id === "conv_ab").messages[0] || {}).status };
    });
    // AVANT : file = [{ msgId: 'msg_rejet', owner: A }] — la résurrection après purge (portée exacte : pas un envoi sous B).
    expect(res.file, "un rejet tardif ne repeuple pas une file purgée").toEqual([]);
    expect(res.statut).toBe("failed");
  });

  test("⑫ ASTRA-43 — la même invalidation vaut pour la RÉSOLUTION en erreur transitoire, et un rejet SANS purge remet bien en file", async ({ page }) => {
    await banc(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_ab", "msg_a", "texte privé de A");
      window.__retenir = true;
      _sendTextToSupa("conv_ab", "msg_a", _withSenderMeta("texte privé de A"));
      await window.__attendre(30);
      // Sans purge : le rejet remet en file, sous A.
      window.__rejeter(new Error("Failed to fetch"));
      await window.__attendre(80);
      const sansPurge = window.__file();
      // Avec purge, résolution transitoire (503) : rien ne revient.
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_ab", "msg_b", "texte privé de A");
      window.__retenir = true;
      _sendTextToSupa("conv_ab", "msg_b", _withSenderMeta("texte privé de A"));
      await window.__attendre(30);
      localStorage.removeItem("passio_outbox_v1");
      _outboxInvaliderEnVol();
      window.__relacher({ status: 503, error: { message: "service unavailable" } });
      await window.__attendre(80);
      return { sansPurge: sansPurge, avecPurge: window.__file() };
    });
    expect(res.sansPurge.map((e) => [e.msgId, e.owner])).toEqual([["msg_a", "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31"]]);
    expect(res.avecPurge).toEqual([]);
  });
});
