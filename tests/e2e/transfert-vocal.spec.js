// TRANSFÉRER UN VOCAL — il arrive en VOCAL, jamais en message vide (2026-11-07).
//
// Le défaut. `_forwardTo` (app-04) reconstruit l'enveloppe du message selon son
// type : photo ou vidéo, GIF, document, position — et sinon, du TEXTE. Un vocal
// porte `voiceData` (+ `voiceDuration`), qu'aucune branche ne lisait : il tombait
// dans la branche texte, `localMsg.text = m.text || ""`.
//   · Mon vocal tout juste enregistré (`m.text === ""`) partait en message VIDE,
//     et la bulle locale de la cible était vide, elle aussi.
//   · Un vocal REÇU partait en texte « [AUDIO] Message vocal (7s) » — après que
//     son objet avait été copié dans le dossier de la cible, pour rien.
//   · Un fichier audio joint (`voiceData` + `isFile`) partait vide de même.
// Le menu du message (`_openMsgActions`) propose « Transférer » pour tout message,
// vocal compris : le geste était offert, et il produisait un message vide.
//
// Ce banc fait tourner le VRAI client Supabase contre un réseau tenu par
// `page.route`, même montage que piece-jointe-depot-echec.spec.js : on mesure le
// corps des POST vers `conv_messages`, les dépôts et les copies dans `attachments`.
// ⚠️ Les routes sont posées APRÈS `bootOnboarded`, et c'est voulu : Playwright lit
// les routes dans l'ordre INVERSE, et la route des médias de l'isolation laisse
// partir les écritures vers le réseau (`route.continue()`). Toute écriture que ce
// banc ne mesure pas est absorbée ici (201), jamais envoyée à la production.
//
// Réinjection (docs/journal/social-messagerie.md, fiche « TRANSFÉRER UN VOCAL ») :
// le code d'avant rougit ① ② ③ ⑥ ⑦ ⑧ — même une fois la copie locale téléversée
// (#751), le vocal partait vide. ④ (copie refusée), ⑤ (dépôt refusé) et ⑨ (garde
// ASTRA-21) y étaient tenus par les lots voisins et restent ici en non-régression ;
// sur le code plus ancien encore (603ebdb), ⑤ et ⑨ rougissent aussi.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_AUTRE = "8d1e2f3a-4b5c-4d6e-8f70-112233445566";
const CONV = "conv_vocal_src";
const CIBLE = "conv_vocal_cible";
const SUPA = "https://njkiyoklssvefstljemx.supabase.co";
// Un vocal REÇU, déposé par un iPhone (`_sendVoiceMessage` : conteneur audio/mp4,
// extension m4a), tel que sa ligne `conv_messages` le décrit.
const CHEMIN_RECU = "attachments/" + CONV + "/1787000000000_k3j4h5g6f_voice.m4a";
const URL_RECU = SUPA + "/storage/v1/object/public/attachments/" + CHEMIN_RECU;
const CONTENU_RECU = { type: "audio", filename: "Message vocal (7s)", fileType: "audio/mp4", url: URL_RECU, text: "[AUDIO] Message vocal (7s)" };
// Les copies LOCALES, telles que `startVoiceRecord` / le sélecteur de fichier les
// produisent : Android enregistre en webm/opus (le mime porte ses codecs), iPhone
// en audio/mp4.
const VOCAL_WEBM = "data:audio/webm;codecs=opus;base64," + Buffer.from("vocal-webm-de-banc-".repeat(8)).toString("base64");
const VOCAL_MP4 = "data:audio/mp4;base64," + Buffer.from("vocal-mp4-de-banc-".repeat(8)).toString("base64");
const MP3 = "data:audio/mpeg;base64," + Buffer.from("ID3-chanson-de-banc-".repeat(8)).toString("base64");

const REFUS_403 = JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });

// Le réseau Supabase du banc. `regler(cle, valeur)` : `depot` et `copie` (« ok » ou
// « refus », 403 de la policy du seau), `insertion` (« ok » ou « refus », 42501).
async function reseau(page) {
  const etat = { depot: "ok", copie: "ok", insertion: "ok" };
  const journal = { depots: [], copies: [], messages: [] };
  await page.route(/supabase\.co\//, async (route) => {
    const req = route.request();
    const url = req.url();
    const methode = req.method();
    if (methode === "POST" && /\/storage\/v1\/object\/copy/.test(url)) {
      let corps = {};
      try { corps = JSON.parse(req.postData() || "{}"); } catch (e) {}
      journal.copies.push(corps);
      // « retenir » : la copie ne répond qu'au signal du banc (`relacher()`), puis réussit.
      if (etat.copie === "retenir") await new Promise((ok) => { etat.relacher = ok; });
      if (etat.copie === "refus") return route.fulfill({ status: 403, contentType: "application/json", body: REFUS_403 });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "attachments/" + (corps.destinationKey || "") }) });
    }
    if (methode === "POST" && /\/storage\/v1\/object\/attachments\//.test(url)) {
      const chemin = decodeURIComponent(url.split("/storage/v1/object/attachments/")[1].split("?")[0]);
      // Le type sous lequel l'objet est déposé : c'est lui que Storage servira à la
      // lecture (un mp4 servi en webm ne se lit pas sur iPhone).
      const entete = req.headers()["content-type"] || "";
      let corps = "";
      try { corps = (req.postDataBuffer() || Buffer.alloc(0)).toString("latin1"); } catch (e) {}
      const type = /multipart/i.test(entete) ? ((/content-type:\s*([^\r\n;]+)/i.exec(corps) || [])[1] || "") : entete;
      journal.depots.push({ chemin, type: type.trim().toLowerCase() });
      if (etat.depot === "refus") return route.fulfill({ status: 403, contentType: "application/json", body: REFUS_403 });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "attachments/" + chemin, Id: "banc" }) });
    }
    if (/\/rest\/v1\/conv_messages/.test(url)) {
      if (methode === "POST") {
        journal.messages.push(req.postData() || "");
        if (etat.insertion === "refus") {
          return route.fulfill({ status: 403, contentType: "application/json",
            body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy for table \"conv_messages\"" }) });
        }
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    // Toute autre ÉCRITURE (télémétrie, accusés de lecture, notification…) : absorbée.
    if (methode !== "GET") return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    return route.fallback();
  });
  return { journal, regler: (cle, valeur) => { etat[cle] = valeur; }, relacher: () => { if (etat.relacher) etat.relacher(); } };
}

// Un compte RÉEL (uuid) : depuis AUTH-06, la file de renvoi exige son propriétaire.
// Posé APRÈS le démarrage, comme piece-jointe-depot-echec : le démarrage d'un compte
// lirait et pousserait son état.
async function banc(page) {
  await bootOnboarded(page);
  // Rien que des fonctions qui existaient AVANT le correctif : sur le code d'avant,
  // le banc doit rougir sur le COMPORTEMENT, jamais sur une attente qui expire.
  await page.waitForFunction(
    () => typeof _forwardTo === "function" && typeof openConversation === "function"
       && typeof applyMsgContentData === "function" && typeof _sendVoiceMessage === "function"
       && typeof _outboxLoad === "function",
    null, { timeout: 20000 },
  );
  const r = await reseau(page);
  // Le vrai client ET la fin de la chaîne de démarrage sont attendus, jamais
  // supposés : un client pas encore construit ferait rougir le banc au hasard,
  // et un démarrage encore en cours (conversations relues, file rejouée) passerait
  // sur les conversations que le banc pose.
  await page.waitForFunction(() => window._supaReal === true && window._supaInitTerminee === true, null, { timeout: 40000 }).catch(() => {});
  const supaReel = await page.evaluate(({ uid, conv, cible }) => {
    MY_UID = uid; window.MY_UID = uid;
    try { localStorage.removeItem("passio_pj_outbox_v1"); localStorage.removeItem("passio_outbox_v1"); } catch (e) {}
    window.__toasts = [];
    const vraiToast = window.toast;
    window.toast = function (t) { window.__toasts.push(String(t)); try { return vraiToast && vraiToast.apply(this, arguments); } catch (e) {} };
    const convs = getConversations();
    convs.length = 0;
    convs.push({ id: conv, isGroup: false, userId: "u_lea_vocal", userName: "Léa", userEmoji: "🌿", userColor: "#22c55e", unread: 0, lastAt: Date.now(), messages: [] });
    convs.push({ id: cible, isGroup: false, userId: "u_tom_vocal", userName: "Tom", userEmoji: "🎸", userColor: "#7c3aed", unread: 0, lastAt: Date.now() - 1000, messages: [] });
    saveConversationsNow();
    return !!window._supaReal;
  }, { uid: UID_MOI, conv: CONV, cible: CIBLE });
  // Sans le vrai client, aucune copie ni aucun dépôt ne partirait : le banc ne mesurerait rien.
  expect(supaReel, "le banc exige le vrai client Supabase (window._supaReal)").toBe(true);
  await ouvrir(page, CONV);
  return r;
}

async function ouvrir(page, conv) {
  await page.evaluate((c) => openConversation(c), conv);
  await page.waitForFunction((c) => {
    const fp = document.getElementById("conv-fullpage");
    return fp && fp.getAttribute("data-conv-id") === c && fp.classList.contains("active");
  }, conv, { timeout: 10000 });
}

// Un message de la conversation source, posé tel que l'appareil le garde.
const poser = (page, message) => page.evaluate(({ conv, m }) => {
  getConversations().find((c) => c.id === conv).messages.push(Object.assign({ at: Date.now() - 5000 }, m));
  saveConversationsNow();
}, { conv: CONV, m: message });

// Le vocal REÇU tel que le fil le reconstruit (`supaLoadMessages`, app-08) : le
// texte est `content.text`, puis `applyMsgContentData` décode le média.
const poserVocalRecu = (page) => page.evaluate(({ conv, contenu, autre }) => {
  const m = { id: "m_vocal_recu", from: autre, fromName: "Léa", text: contenu.text, at: Date.now() - 5000 };
  applyMsgContentData(m, JSON.stringify(contenu));
  getConversations().find((c) => c.id === conv).messages.push(m);
  saveConversationsNow();
}, { conv: CONV, contenu: CONTENU_RECU, autre: UID_AUTRE });

const transferer = (page, msgId) => page.evaluate(async ({ conv, cible, id }) => {
  window._forwardSrc = { convId: conv, msgId: id };
  await _forwardTo(cible);
}, { conv: CONV, cible: CIBLE, id: msgId });

// Le corps d'un POST `conv_messages` : la ligne, et son `content` décodé (un texte
// brut est rendu sous la forme { type: "(texte brut)" } pour un écart lisible).
function ligneDe(corps) {
  const ligne = JSON.parse(corps);
  let contenu;
  try { contenu = JSON.parse(ligne.content); } catch (e) { contenu = { type: "(texte brut)", text: ligne.content }; }
  return { ligne, contenu };
}
// Ce que le DESTINATAIRE en lit : même décodage que `supaLoadMessages`.
const luParLeDestinataire = (page, raw) => page.evaluate((r) => {
  let d = null;
  try { d = JSON.parse(r); } catch (e) {}
  const m = { id: "m_lu", from: "u_dest", text: d && d.text ? d.text : r, at: Date.now() };
  applyMsgContentData(m, r);
  return { vocal: m.voiceData || null, duree: m.voiceDuration === undefined ? null : m.voiceDuration, fichier: m.fileUrl || null };
}, raw);
const messagesDeLaCible = (page) => page.evaluate((c) => (getConversations().find((x) => x.id === c).messages || [])
  .map((m) => ({ id: m.id, text: m.text === undefined ? null : m.text, vocal: m.voiceData || null, duree: m.voiceDuration === undefined ? null : m.voiceDuration, fichier: m.fileUrl || null, nom: m.fileName || null })), CIBLE);
const toasts = (page) => page.evaluate(() => window.__toasts.slice());
const aucuneDataUrl = (corps) => corps.every((b) => !/data:/i.test(b));
const transfereDit = (page) => page.waitForFunction(() => window.__toasts.some((t) => /^Transféré$/.test(t)), null, { timeout: 10000 });

// Un transfert REFUSÉ : rien n'est inséré, rien n'apparaît dans la cible, et c'est dit.
async function refuse(page, r, motif) {
  await page.waitForTimeout(400);
  expect(r.journal.messages, "aucune ligne conv_messages").toEqual([]);
  const t = await toasts(page);
  expect(t.some((x) => motif.test(x)), "toasts : " + JSON.stringify(t)).toBe(true);
  expect(t.some((x) => /^Transféré$/.test(x)), "jamais « Transféré » sur un refus").toBe(false);
  expect(await messagesDeLaCible(page)).toEqual([]);
}

test.describe("Transférer un vocal — il arrive en vocal, jamais en message vide", () => {
  test("① un vocal REÇU est COPIÉ dans le dossier de la cible et arrive en vocal : « Message vocal (7s) », conteneur réel, bulle lisible", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    await poserVocalRecu(page);
    await transferer(page, "m_vocal_recu");
    await transfereDit(page);
    await expect.poll(() => r.journal.messages.length, { timeout: 10000 }).toBe(1);

    expect(r.journal.depots, "un objet déjà dans le seau se copie, il ne se redépose pas").toEqual([]);
    expect(r.journal.copies).toHaveLength(1);
    expect(r.journal.copies[0].sourceKey).toBe(CHEMIN_RECU);
    expect(r.journal.copies[0].destinationKey).toMatch(/^attachments\/conv_vocal_cible\/\d+_1787000000000_k3j4h5g6f_voice\.m4a$/);

    const { ligne, contenu } = ligneDe(r.journal.messages[0]);
    expect(ligne.conv_id).toBe(CIBLE);
    // AVANT : { type: "text", text: "[AUDIO] Message vocal (7s)" } — l'objet copié pour rien.
    expect(contenu).toMatchObject({ type: "audio", filename: "Message vocal (7s)", fileType: "audio/mp4" });
    expect(contenu.url).toContain("/attachments/" + r.journal.copies[0].destinationKey);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);

    // Le destinataire le reconnaît comme un VOCAL (au nom « Message vocal »), avec sa durée.
    expect(await luParLeDestinataire(page, ligne.content)).toEqual({ vocal: contenu.url, duree: 7, fichier: null });

    // La bulle de la cible, chez moi : un vocal sur la COPIE (jamais l'objet de la
    // source, que le destinataire ne peut pas lire), et peint avec son lecteur.
    const cible = await messagesDeLaCible(page);
    expect(cible).toHaveLength(1);
    expect(cible[0]).toMatchObject({ vocal: contenu.url, duree: 7 });
    expect(cible[0].text || "", "aucun texte « [AUDIO] … » dans la bulle").toBe("");
    await ouvrir(page, CIBLE);
    await expect(page.locator('#convFpThread [id^="pb_aud_"]'), "le lecteur de vocal est peint dans la cible").toHaveCount(1);
  });

  test("② mon vocal tout juste ENVOYÉ (iPhone) : l'objet déjà déposé est COPIÉ — jamais redéposé, jamais la data URL — en audio/mp4", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    await page.evaluate((v) => _sendVoiceMessage(v, 4), VOCAL_MP4);
    await expect.poll(() => r.journal.messages.length, { timeout: 10000, message: "le vocal est déposé puis inséré" }).toBe(1);
    expect(r.journal.depots).toHaveLength(1);
    const id = await page.evaluate((c) => getConversations().find((x) => x.id === c).messages.filter((m) => m.from === "me").pop().id, CONV);
    // Sur l'appareil, la copie reste une data URL jusqu'à la relecture du fil.
    expect(await page.evaluate(({ c, i }) => /^data:audio\/mp4/.test(getConversations().find((x) => x.id === c).messages.find((m) => m.id === i).voiceData), { c: CONV, i: id })).toBe(true);

    await transferer(page, id);
    await transfereDit(page);
    await expect.poll(() => r.journal.messages.length, { timeout: 10000 }).toBe(2);

    // AVANT : aucune copie, et un message vide inséré.
    expect(r.journal.copies).toHaveLength(1);
    expect(r.journal.copies[0].sourceKey).toBe(r.journal.depots[0].chemin);
    expect(r.journal.copies[0].destinationKey).toMatch(/^attachments\/conv_vocal_cible\/\d+_\d+_[a-z0-9]+_voice\.m4a$/);
    expect(r.journal.depots, "aucun second dépôt").toHaveLength(1);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const { ligne, contenu } = ligneDe(r.journal.messages[1]);
    expect(ligne.conv_id).toBe(CIBLE);
    expect(contenu).toMatchObject({ type: "audio", filename: "Message vocal (4s)", fileType: "audio/mp4" });
    expect(contenu.url).toContain("/attachments/" + r.journal.copies[0].destinationKey);
    expect(await luParLeDestinataire(page, ligne.content)).toEqual({ vocal: contenu.url, duree: 4, fichier: null });
    expect((await messagesDeLaCible(page))[0]).toMatchObject({ vocal: contenu.url, duree: 4 });
  });

  test("③ mon vocal dont le dépôt n'a PAS abouti : la copie locale est DÉPOSÉE dans le dossier de la cible, sous son conteneur", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    // Ce que l'appareil garde d'un vocal dont le dépôt a été refusé : la copie
    // locale, son `pj` sans URL, « échec ».
    await poser(page, {
      id: "m_vocal_local", from: "me", text: "", voiceData: VOCAL_WEBM, voiceDuration: 3, status: "failed", de: UID_MOI,
      pj: { kind: "audio", nom: "Message vocal (3s)", type: "audio/webm", chemin: "attachments/" + CONV + "/1787000000001_abcdefghi_voice.webm", cache: "3600", tentatives: 1 },
    });
    await transferer(page, "m_vocal_local");
    await transfereDit(page);
    await expect.poll(() => r.journal.messages.length, { timeout: 10000 }).toBe(1);

    // AVANT : rien de déposé, un message vide inséré.
    expect(r.journal.depots).toHaveLength(1);
    expect(r.journal.depots[0].chemin).toMatch(/^attachments\/conv_vocal_cible\/\d+_[a-z0-9]+_transfert\.webm$/);
    expect(r.journal.depots[0].type, "déposé sous son conteneur réel").toBe("audio/webm");
    expect(r.journal.copies).toEqual([]);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const { ligne, contenu } = ligneDe(r.journal.messages[0]);
    expect(contenu).toMatchObject({ type: "audio", filename: "Message vocal (3s)", fileType: "audio/webm" });
    expect(contenu.url).toContain("/attachments/" + r.journal.depots[0].chemin);
    expect(await luParLeDestinataire(page, ligne.content)).toEqual({ vocal: contenu.url, duree: 3, fichier: null });
    // Le vocal d'origine n'est pas touché : toujours sa copie locale, toujours en échec.
    expect(await page.evaluate((c) => { const m = getConversations().find((x) => x.id === c).messages.find((x) => x.id === "m_vocal_local"); return { local: /^data:/.test(m.voiceData), statut: m.status }; }, CONV))
      .toEqual({ local: true, statut: "failed" });
  });

  test("④ vocal reçu dont la COPIE est refusée : transfert refusé et dit — aucune insertion, rien dans la cible", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.regler("copie", "refus");
    await poserVocalRecu(page);
    await transferer(page, "m_vocal_recu");
    expect(r.journal.copies).toHaveLength(1);
    await refuse(page, r, /Transfert impossible/);
  });

  test("⑤ vocal local dont le DÉPÔT est refusé : transfert refusé et dit — jamais un message vide à la place", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.regler("depot", "refus");
    await poser(page, { id: "m_vocal_local", from: "me", text: "", voiceData: VOCAL_WEBM, voiceDuration: 3 });
    await transferer(page, "m_vocal_local");
    // AVANT : aucun dépôt tenté, et un message VIDE inséré dans la cible.
    await refuse(page, r, /Transfert impossible/);
    expect(r.journal.depots).toHaveLength(1);
  });

  test("⑥ insertion refusée : la file de renvoi garde l'enveloppe du VOCAL — le renvoi n'est jamais un message vide", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.regler("insertion", "refus");
    await poserVocalRecu(page);
    await transferer(page, "m_vocal_recu");
    await expect.poll(() => r.journal.messages.length, { timeout: 10000 }).toBe(1);
    const id = (await messagesDeLaCible(page))[0].id;
    // L'entrée est lue d'un seul geste, dès qu'elle existe : un rejeu de la file
    // peut la réécrire ensuite, jamais avec un autre contenu.
    const enFile = await (await page.waitForFunction((i) => _outboxLoad().find((x) => x.msgId === i) || null, id, { timeout: 10000 })).jsonValue();
    expect(enFile.owner).toBe(UID_MOI);
    // AVANT : la file portait « [AUDIO] Message vocal (7s) » en texte — c'est lui qui repartait.
    expect(JSON.parse(enFile.content)).toMatchObject({ type: "audio", filename: "Message vocal (7s)", fileType: "audio/mp4" });
    expect(enFile.content).toBe(JSON.parse(r.journal.messages[0]).content);
    // Sondé, pas lu une fois : un rejeu de la file (minuteur du démarrage) peut
    // repasser le message en « envoi… » avant de le rendre à l'échec.
    await expect.poll(() => page.evaluate(({ c, i }) => getConversations().find((x) => x.id === c).messages.find((m) => m.id === i).status, { c: CIBLE, i: id }), { timeout: 10000 }).toBe("failed");
  });

  test("⑦ un FICHIER audio joint (pas un vocal) se transfère en fichier téléchargeable — ni vocal, ni message vide", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    // `_processAttach` (kind « audio ») : la copie locale vit dans `voiceData`, avec
    // `isFile` et le nom du fichier.
    await poser(page, { id: "m_audio_fichier", from: "me", text: "", voiceData: MP3, voiceDuration: 0, isFile: true, fileName: "chanson.mp3" });
    await transferer(page, "m_audio_fichier");
    await transfereDit(page);
    await expect.poll(() => r.journal.messages.length, { timeout: 10000 }).toBe(1);

    expect(r.journal.depots).toHaveLength(1);
    expect(r.journal.depots[0].chemin).toMatch(/^attachments\/conv_vocal_cible\/\d+_[a-z0-9]+_transfert\.mpeg$/);
    expect(r.journal.depots[0].type).toBe("audio/mpeg");
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const { ligne, contenu } = ligneDe(r.journal.messages[0]);
    expect(contenu).toMatchObject({ type: "doc", filename: "chanson.mp3" });
    expect(contenu.url).toContain("/attachments/" + r.journal.depots[0].chemin);
    expect(await luParLeDestinataire(page, ligne.content), "jamais avalé par le lecteur de vocaux").toEqual({ vocal: null, duree: null, fichier: contenu.url });
    expect((await messagesDeLaCible(page))[0]).toMatchObject({ vocal: null, fichier: contenu.url, nom: "chanson.mp3" });
  });

  test("⑧ un message sans rien à transférer est refusé et dit — jamais un message vide", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    await poser(page, { id: "m_rien", from: UID_AUTRE, fromName: "Léa", text: "" });
    await transferer(page, "m_rien");
    await refuse(page, r, /ne peut pas être transféré/);
    expect(r.journal.depots).toEqual([]);
    expect(r.journal.copies).toEqual([]);
  });

  test("⑨ le compte change PENDANT la copie : transfert annulé — rien ne part sous l'autre compte, rien dans sa file (ASTRA-21)", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.regler("copie", "retenir");
    await poserVocalRecu(page);
    await page.evaluate(({ conv, cible }) => {
      window._forwardSrc = { convId: conv, msgId: "m_vocal_recu" };
      window.__transfert = _forwardTo(cible);
    }, { conv: CONV, cible: CIBLE });
    await expect.poll(() => r.journal.copies.length, { timeout: 10000, message: "la copie est en vol" }).toBe(1);
    // Un autre compte prend l'appareil pendant la copie : la purge de la
    // déconnexion (génération de la file avancée, identité effacée), puis
    // l'identité du compte suivant.
    await page.evaluate(async (autre) => { await purgeAccountScopedData(); MY_UID = autre; window.MY_UID = autre; }, UID_AUTRE);
    r.relacher();
    await page.evaluate(() => window.__transfert);
    await page.waitForTimeout(400);
    // AVANT : l'auteur était relu APRÈS la copie — la ligne partait sous `from_id`
    // du compte suivant, avec le message écrit par le précédent.
    expect(r.journal.messages, "rien ne part sous l'autre compte").toEqual([]);
    expect(await page.evaluate(() => _outboxLoad()), "rien dans la file de l'autre compte").toEqual([]);
    // L'annulation est muette (une trace `transfert_perime`) : la page se recharge
    // juste après la purge. Jamais « Transféré » sur un transfert qui n'a pas eu lieu.
    expect((await toasts(page)).some((x) => /^Transféré$/.test(x))).toBe(false);
    expect(await page.evaluate((c) => (getConversations().find((x) => x.id === c) || { messages: [] }).messages.length, CIBLE), "aucune bulle dans la cible").toBe(0);
  });
});
