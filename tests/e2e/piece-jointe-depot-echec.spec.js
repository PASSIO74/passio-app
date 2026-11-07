// PIÈCE JOINTE — UN DÉPÔT STORAGE EN ÉCHEC N'EST NI SILENCIEUX, NI PERDU (2026-11-07).
//
// Le défaut. `_processAttach` (photo, vidéo, document, audio) et `_sendVoiceMessage`
// (vocal), sur un dépôt Storage en échec — refus OU coupure —, appelaient
// `sendMessageToSupabase(…, dataUrl, …)`. La garde de cette dernière retirait le
// base64, puis insérait « 📎 … (non synchronisé) » et marquait le message ENVOYÉ :
// le destinataire ne recevait qu'une étiquette, la relecture du fil remplaçait
// ensuite la copie locale de l'auteur par elle, et une coupure partait en file sous
// cette forme — le média n'était jamais rattrapé. Rien n'en remontait au pilotage.
// Et le TRANSFERT de mon propre média tout juste envoyé insérait sa copie locale,
// une data URL, TELLE QUELLE dans `conv_messages`.
//
// Ce banc fait tourner le VRAI client Supabase contre un réseau tenu par
// `page.route` : ce qui est mesuré, ce sont les requêtes réellement émises — le
// corps des POST vers `conv_messages`, les chemins déposés dans `attachments`.
// ⚠️ Les routes sont posées APRÈS `bootOnboarded`, et c'est voulu : Playwright lit
// les routes dans l'ordre INVERSE, et la route des médias de l'isolation laisse
// partir les écritures vers le réseau (`route.continue()`). Toute écriture que ce
// banc ne mesure pas est absorbée ici (201), jamais envoyée à la production.
//
// Réinjection (voir docs/journal/social-messagerie.md, fiche du 2026-11-07) : le
// code d'avant rougit ①–⑨ ; chaque morceau du correctif retiré seul rougit le cas
// qui le porte.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_AUTRE = "8d1e2f3a-4b5c-4d6e-8f70-112233445566";
const CONV = "conv_pj_banc";
const CIBLE = "conv_pj_cible";
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const VOCAL = "data:audio/webm;base64," + Buffer.from("vocal-de-banc-0123456789".repeat(8)).toString("base64");

// Le réseau Supabase du banc. `mode(m)` règle la réponse du PROCHAIN dépôt :
// « ok », « coupure » (la requête n'aboutit jamais : `Failed to fetch`), « refus »
// (403 de la policy), « deja_la » (400 + statusCode 409, l'objet existe), « pendre »
// (aucune réponse). `insertion(m)` : « ok » ou « pendre » pour `conv_messages`.
async function reseau(page) {
  const etat = { mode: "ok", insertion: "ok" };
  const journal = { depots: [], copies: [], messages: [] };
  await page.route(/supabase\.co\//, async (route) => {
    const req = route.request();
    const url = req.url();
    const methode = req.method();
    if (methode === "POST" && /\/storage\/v1\/object\/copy/.test(url)) {
      let corps = {};
      try { corps = JSON.parse(req.postData() || "{}"); } catch (e) {}
      journal.copies.push(corps);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "attachments/" + (corps.destinationKey || "") }) });
    }
    if (methode === "POST" && /\/storage\/v1\/object\/attachments\//.test(url)) {
      const chemin = decodeURIComponent(url.split("/storage/v1/object/attachments/")[1].split("?")[0]);
      const mode = etat.mode;
      journal.depots.push({ chemin, mode });
      // « pendre » : le dépôt ne répond jamais ; la navigation suivante emporte la requête.
      if (mode === "pendre") return;
      if (mode === "coupure") return route.abort("internetdisconnected");
      if (mode === "refus") {
        return route.fulfill({ status: 403, contentType: "application/json",
          body: JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }) });
      }
      if (mode === "deja_la") {
        return route.fulfill({ status: 400, contentType: "application/json",
          body: JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "attachments/" + chemin, Id: "banc" }) });
    }
    if (/\/rest\/v1\/conv_messages/.test(url)) {
      if (methode === "POST") {
        journal.messages.push(req.postData() || "");
        if (etat.insertion === "pendre") return;
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    // Toute autre ÉCRITURE (télémétrie, accusés de lecture, notification…) : absorbée.
    if (methode !== "GET") return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    return route.fallback();
  });
  return { journal, mode: (m) => { etat.mode = m; }, insertion: (m) => { etat.insertion = m; } };
}

// Un compte RÉEL (uuid) : depuis AUTH-06, une entrée de file sans propriétaire
// n'est ni rejouée ni adoptée. Posé APRÈS le démarrage, comme message-media-echec :
// le démarrage d'un compte lirait et pousserait son état.
async function banc(page) {
  await bootOnboarded(page);
  // ⚠️ Rien que des fonctions qui existaient AVANT le correctif : sur le code
  // d'avant, le banc doit rougir sur le COMPORTEMENT, jamais sur une attente.
  await page.waitForFunction(
    () => typeof handleAttachFile === "function" && typeof openConversation === "function"
       && typeof _flushOutbox === "function" && typeof sendMessageToSupabase === "function",
    null, { timeout: 20000 },
  );
  const r = await reseau(page);
  const supaReel = await page.evaluate(({ uid, conv, cible }) => {
    MY_UID = uid; window.MY_UID = uid;
    try { localStorage.removeItem("passio_pj_outbox_v1"); localStorage.removeItem("passio_outbox_v1"); } catch (e) {}
    window.__toasts = [];
    const vraiToast = window.toast;
    window.toast = function (t) { window.__toasts.push(String(t)); try { return vraiToast && vraiToast.apply(this, arguments); } catch (e) {} };
    window.__erreurs = [];
    if (window.tel) {
      const vraiErr = tel.error;
      tel.error = function (e, ctx) {
        window.__erreurs.push({ action: ctx && ctx.action, severity: ctx && ctx.severity, meta: (ctx && ctx.meta) || {}, message: String((e && e.message) || "") });
        try { return vraiErr.apply(this, arguments); } catch (_) {}
      };
    }
    const convs = getConversations();
    convs.length = 0;
    convs.push({ id: conv, isGroup: false, userId: "u_lea_banc", userName: "Léa", userEmoji: "🌿", userColor: "#22c55e", unread: 0, lastAt: Date.now(), messages: [] });
    convs.push({ id: cible, isGroup: false, userId: "u_tom_banc", userName: "Tom", userEmoji: "🎸", userColor: "#7c3aed", unread: 0, lastAt: Date.now() - 1000, messages: [] });
    saveConversationsNow();
    return !!window._supaReal;
  }, { uid: UID_MOI, conv: CONV, cible: CIBLE });
  // Sans le vrai client, chaque dépôt serait une « coupure » : le banc ne mesurerait rien.
  expect(supaReel, "le banc exige le vrai client Supabase (window._supaReal)").toBe(true);
  await page.evaluate((c) => openConversation(c), CONV);
  await page.waitForFunction((c) => {
    const fp = document.getElementById("conv-fullpage");
    return fp && fp.getAttribute("data-conv-id") === c && fp.classList.contains("active");
  }, CONV, { timeout: 10000 });
  return r;
}

// Le dernier message que J'AI posé dans la conversation (celui du dépôt).
const dernier = (page, conv = CONV) => page.evaluate((c) => {
  const m = (getConversations().find((x) => x.id === c).messages || []).filter((x) => x.from === "me").pop();
  return m ? { id: m.id, statut: m.status || null, pj: m.pj || null, vocal: !!m.voiceData, doc: !!m.docData, img: !!m.img } : null;
}, conv);
const statutDe = (page, id) => page.evaluate((i) => {
  for (const c of getConversations()) { const m = (c.messages || []).find((x) => x.id === i); if (m) return m.status || null; }
  return null;
}, id);
const filePj = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("passio_pj_outbox_v1") || "[]"));
const lire = (page) => page.evaluate(() => ({ toasts: window.__toasts.slice(), erreurs: window.__erreurs.slice() }));
const aucuneDataUrl = (corps) => corps.every((b) => !/data:/i.test(b));

// ⚠️ Les attentes ne lisent que ce qui existait AVANT le correctif (la bulle, la
// requête de dépôt) : le verdict se mesure ensuite, par `expect.poll`, et le code
// d'avant rougit sur un ÉCART lisible (« sent » au lieu de « failed »), jamais sur
// une attente qui expire faute d'un champ neuf.
async function joindreDocument(page, r, nom = "note.pdf") {
  const avant = r.journal.depots.length;
  await page.setInputFiles("#attachDocFile", { name: nom, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 banc " + nom) });
  await page.waitForFunction((n) => {
    const c = getConversations().find((x) => x.id === "conv_pj_banc");
    return c && (c.messages || []).some((m) => m.from === "me" && m.docData && m.fileName === n);
  }, nom, { timeout: 10000 });
  await expect.poll(() => r.journal.depots.length, { timeout: 10000 }).toBeGreaterThan(avant);
  return dernier(page);
}
const statutSera = (page, id, attendu) => expect.poll(() => statutDe(page, id), { timeout: 10000, message: "statut du message " + id }).toBe(attendu);

test.describe("Pièce jointe — le dépôt Storage a un verdict, une file et un « réessayer »", () => {
  test("① dépôt REFUSÉ : rien ne part vers conv_messages, le message dit son échec, le pilotage le sait", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("refus");
    const m = await joindreDocument(page, r);
    expect(m.statut, "« envoi… » dès la bulle, jamais envoyé d'office").not.toBe("sent");
    await statutSera(page, m.id, "failed");
    await page.waitForTimeout(300);

    expect(r.journal.depots).toHaveLength(1);
    // AVANT : la garde insérait « 📎 note.pdf (non synchronisé) » et le disait envoyé.
    expect(r.journal.messages, "un dépôt refusé n'insère RIEN — ni base64, ni étiquette").toEqual([]);
    // L'échec est À L'ÉCRAN, sur le message : « réessayer » sous la bulle, et un toast.
    await expect(page.locator(`#convFpThread [data-msgst="${m.id}"]`)).toContainText("réessayer");
    const { toasts, erreurs } = await lire(page);
    expect(toasts.some((t) => /Pièce jointe non envoyée/.test(t)), "toasts : " + JSON.stringify(toasts)).toBe(true);
    // Le pilotage : une ERREUR (refus réel), code fermé, sans nom de fichier.
    const e = erreurs.find((x) => x.action === "piece_jointe_depot");
    expect(e, "erreurs : " + JSON.stringify(erreurs)).toBeTruthy();
    expect(e.severity).toBe("error");
    expect(e.meta).toMatchObject({ rc: "refus", http: 403, kind: "doc", voie: "premier", essai: 1 });
    expect(JSON.stringify(e)).not.toContain("note.pdf");
    // Un refus ne se rejoue pas tout seul.
    expect(await filePj(page)).toEqual([]);
  });

  test("② après un refus, « réessayer » redépose depuis la copie locale, au MÊME chemin, et le message part", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("refus");
    const m = await joindreDocument(page, r);
    await expect(page.locator(`#convFpThread [data-msgst="${m.id}"]`)).toContainText("réessayer", { timeout: 10000 });

    r.mode("ok");
    await page.locator(`#convFpThread [data-msgst="${m.id}"] span`).click();
    await statutSera(page, m.id, "sent");

    expect(r.journal.depots.map((d) => d.mode)).toEqual(["refus", "ok"]);
    expect(r.journal.depots[1].chemin, "un renvoi ne fabrique pas un second objet").toBe(r.journal.depots[0].chemin);
    expect(r.journal.messages).toHaveLength(1);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const ligne = JSON.parse(r.journal.messages[0]);
    expect(ligne.id).toBe(m.id);
    expect(ligne.from_id).toBe(UID_MOI);
    const contenu = JSON.parse(ligne.content);
    expect(contenu.type).toBe("doc");
    expect(contenu.filename).toBe("note.pdf");
    expect(contenu.url).toContain("/storage/v1/object/public/attachments/" + r.journal.depots[0].chemin);
    expect(contenu.expired).toBeUndefined();
  });

  test("③ COUPURE : en file sous le compte réel, puis rejouée au retour du réseau — même chemin, aucune data URL", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("coupure");
    const m = await joindreDocument(page, r, "rapport.pdf");
    await statutSera(page, m.id, "failed");
    await page.waitForTimeout(300);

    // AVANT : l'étiquette partait en base (ou en file sous cette forme) et le média était perdu.
    expect(r.journal.messages, "rien n'est inséré pendant la coupure").toEqual([]);
    const file = await filePj(page);
    expect(file.map((x) => [x.msgId, x.owner, x.convId])).toEqual([[m.id, UID_MOI, CONV]]);
    await expect(page.locator(`#convFpThread [data-msgst="${m.id}"]`)).toContainText("réessayer");
    const avant = await lire(page);
    expect(avant.toasts.some((t) => /Pas de réseau/.test(t)), "toasts : " + JSON.stringify(avant.toasts)).toBe(true);
    const e = avant.erreurs.find((x) => x.action === "piece_jointe_depot");
    expect(e, "erreurs : " + JSON.stringify(avant.erreurs)).toBeTruthy();
    expect(e.severity, "une coupure est un avertissement : l'appareil, pas notre code").toBe("warn");
    expect(e.meta.rc).toBe("reseau");

    // Le réseau revient : le navigateur émet `online`, la file repart d'elle-même.
    r.mode("ok");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await statutSera(page, m.id, "sent");

    const chemins = [...new Set(r.journal.depots.map((d) => d.chemin))];
    expect(chemins, "tous les essais visent le même objet").toHaveLength(1);
    expect(r.journal.depots[r.journal.depots.length - 1].mode).toBe("ok");
    expect(r.journal.messages).toHaveLength(1);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const contenu = JSON.parse(JSON.parse(r.journal.messages[0]).content);
    expect(contenu.url).toContain("/attachments/" + chemins[0]);
    expect(await filePj(page)).toEqual([]);
  });

  test("④ réponse perdue : au renvoi, l'objet déjà là (409) prouve le dépôt — le message part sans second objet", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("coupure");
    const m = await joindreDocument(page, r);
    await statutSera(page, m.id, "failed");

    r.mode("deja_la");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await statutSera(page, m.id, "sent");
    expect(r.journal.depots.map((d) => d.mode)).toEqual(["coupure", "deja_la"]);
    expect(r.journal.messages).toHaveLength(1);
    expect(JSON.parse(JSON.parse(r.journal.messages[0]).content).url).toContain("/attachments/" + r.journal.depots[0].chemin);
  });

  test("⑤ un 409 au PREMIER essai n'est pas « déjà déposé » : ce chemin n'a jamais été tenté par ce message", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("deja_la");
    const m = await joindreDocument(page, r);
    await statutSera(page, m.id, "failed");
    await page.waitForTimeout(300);
    expect(r.journal.messages).toEqual([]);
  });

  test("⑥ VOCAL : même pipeline — coupure en file, rejouée, jamais en base64", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("coupure");
    await page.evaluate((v) => _sendVoiceMessage(v, 3), VOCAL);
    await expect.poll(() => r.journal.depots.length, { timeout: 10000 }).toBe(1);
    const m = await dernier(page);
    expect(m.vocal).toBe(true);
    await statutSera(page, m.id, "failed");
    await page.waitForTimeout(300);
    expect(r.journal.messages, "AVANT : le vocal partait avec sa data URL retirée, annoncé envoyé").toEqual([]);
    expect((await filePj(page)).map((x) => x.msgId)).toEqual([m.id]);

    r.mode("ok");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await statutSera(page, m.id, "sent");
    expect(r.journal.messages).toHaveLength(1);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const contenu = JSON.parse(JSON.parse(r.journal.messages[0]).content);
    expect(contenu).toMatchObject({ type: "audio", filename: "Message vocal (3s)", fileType: "audio/webm" });
    expect(contenu.url).toMatch(/\/attachments\/attachments\/conv_pj_banc\/\d+_[a-z0-9]+_voice\.webm$/);
  });

  test("⑦ une entrée d'un AUTRE compte n'est pas rejouée (AUTH-06) : elle sort de la file, rien ne part", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("coupure");
    const m = await joindreDocument(page, r);
    await expect.poll(() => filePj(page).then((f) => f.length), { timeout: 10000, message: "la coupure met le dépôt en file" }).toBe(1);
    const avant = r.journal.depots.length;
    r.mode("ok");
    await page.evaluate((autre) => {
      const f = JSON.parse(localStorage.getItem("passio_pj_outbox_v1") || "[]");
      f.forEach((x) => { x.owner = autre; });
      localStorage.setItem("passio_pj_outbox_v1", JSON.stringify(f));
      window.dispatchEvent(new Event("online"));
    }, UID_AUTRE);
    await page.waitForTimeout(800);
    expect(r.journal.depots.length, "aucun dépôt rejoué pour un autre compte").toBe(avant);
    expect(r.journal.messages).toEqual([]);
    expect(await filePj(page)).toEqual([]);
    expect(await statutDe(page, m.id)).toBe("failed");
  });

  test("⑧ TRANSFERT d'une copie locale : déposée dans le dossier de la cible, jamais insérée en data URL", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    await page.evaluate(({ conv, png }) => {
      // Ma photo telle qu'elle vit sur l'appareil entre son envoi et la relecture du
      // fil : une data URL, sans trace de son dépôt (message d'avant ce lot).
      getConversations().find((c) => c.id === conv).messages.push({ id: "m_local", from: "me", img: png, text: "", at: Date.now() });
      saveConversationsNow();
    }, { conv: CONV, png: PNG_1PX });
    await page.evaluate(async ({ conv, cible }) => { window._forwardSrc = { convId: conv, msgId: "m_local" }; await _forwardTo(cible); }, { conv: CONV, cible: CIBLE });
    await page.waitForFunction(() => window.__toasts.some((t) => /Transféré|Transfert impossible/.test(t)), null, { timeout: 10000 });
    await page.waitForTimeout(300);

    expect(r.journal.depots).toHaveLength(1);
    expect(r.journal.depots[0].chemin).toMatch(/^attachments\/conv_pj_cible\/\d+_[a-z0-9]+_transfert\.png$/);
    // AVANT : `content.url` était la data URL, insérée telle quelle.
    expect(r.journal.messages).toHaveLength(1);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const ligne = JSON.parse(r.journal.messages[0]);
    expect(ligne.conv_id).toBe(CIBLE);
    expect(JSON.parse(ligne.content).url).toContain("/attachments/" + r.journal.depots[0].chemin);
  });

  test("⑨ TRANSFERT dont le dépôt échoue : refusé et dit — aucune insertion", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("refus");
    await page.evaluate(({ conv, png }) => {
      getConversations().find((c) => c.id === conv).messages.push({ id: "m_local", from: "me", img: png, text: "", at: Date.now() });
      saveConversationsNow();
    }, { conv: CONV, png: PNG_1PX });
    await page.evaluate(async ({ conv, cible }) => { window._forwardSrc = { convId: conv, msgId: "m_local" }; await _forwardTo(cible); }, { conv: CONV, cible: CIBLE });
    await page.waitForTimeout(300);
    expect(r.journal.messages).toEqual([]);
    const { toasts } = await lire(page);
    expect(toasts.some((t) => /Transfert impossible/.test(t)), "toasts : " + JSON.stringify(toasts)).toBe(true);
    expect(toasts.some((t) => /^Transféré$/.test(t))).toBe(false);
    expect(await page.evaluate((c) => getConversations().find((x) => x.id === c).messages.length, CIBLE)).toBe(0);
  });

  test("⑩ TRANSFERT d'un média dont le dépôt est connu : l'objet est COPIÉ, rien n'est redéposé", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    r.mode("ok");
    const m = await joindreDocument(page, r, "plan.pdf");
    await statutSera(page, m.id, "sent");
    const chemin = r.journal.depots[0].chemin;
    await page.evaluate(async ({ conv, cible, id }) => { window._forwardSrc = { convId: conv, msgId: id }; await _forwardTo(cible); }, { conv: CONV, cible: CIBLE, id: m.id });
    await page.waitForFunction(() => window.__toasts.some((t) => /^Transféré$/.test(t)), null, { timeout: 10000 });
    expect(r.journal.depots, "aucun second dépôt").toHaveLength(1);
    expect(r.journal.copies).toHaveLength(1);
    expect(r.journal.copies[0].sourceKey).toBe(chemin);
    expect(r.journal.copies[0].destinationKey).toMatch(/^attachments\/conv_pj_cible\//);
    expect(r.journal.messages).toHaveLength(2);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const contenu = JSON.parse(JSON.parse(r.journal.messages[1]).content);
    expect(contenu.type).toBe("doc");
    expect(contenu.url).toContain("/attachments/" + r.journal.copies[0].destinationKey);
  });

  // Ce que l'appareil garde quand l'application est TUÉE en plein dépôt : la bulle
  // « envoi… », sa copie locale et son `pj`, aucune entrée de file — aucun
  // gestionnaire n'a tourné. (Un simple rechargement, lui, laisse le navigateur
  // régler la requête coupée : c'est ⑫ bis, et c'est la file qui la reprend.)
  const BULLE_TUEE = {
    id: "m_tuee", from: "me", text: "", status: "sending", de: UID_MOI,
    docData: "data:application/pdf;base64," + Buffer.from("%PDF-1.4 tuee").toString("base64"),
    fileName: "tuee.pdf", fileSize: "1 KB", fileType: "PDF",
    pj: { kind: "doc", nom: "tuee.pdf", type: "application/pdf", chemin: "attachments/conv_pj_banc/1700000000000_abcdefghi_tuee.pdf", cache: "31536000", tentatives: 1 },
  };
  async function rouvrirAvecBulleTuee(page) {
    await page.evaluate(({ conv, bulle, uid }) => {
      getConversations().find((c) => c.id === conv).messages.push(Object.assign({}, bulle, { at: Date.now() - 60000 }));
      saveConversationsNow();
      // La même personne rouvre l'application sur le même appareil.
      localStorage.setItem("passio_uid", uid);
    }, { conv: CONV, bulle: BULLE_TUEE, uid: UID_MOI });
    await page.reload();
    await page.waitForFunction((c) => typeof getConversations === "function" && getConversations().some((x) => x.id === c), CONV, { timeout: 20000 });
  }

  test("⑫ application TUÉE en plein dépôt : à la réouverture, la bulle « envoi… » repart seule, au même chemin", async ({ page }) => {
    test.setTimeout(120000);
    const r = await banc(page);
    r.mode("ok");
    await rouvrirAvecBulleTuee(page);
    // AVANT : la bulle restait « envoi… » (🕓) pour toujours, sans « réessayer ».
    await expect.poll(() => statutDe(page, "m_tuee"), { timeout: 25000, message: "la bulle interrompue repart au démarrage" }).toBe("sent");
    expect(r.journal.depots.map((d) => [d.chemin, d.mode])).toEqual([[BULLE_TUEE.pj.chemin, "ok"]]);
    expect(r.journal.messages).toHaveLength(1);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    const ligne = JSON.parse(r.journal.messages[0]);
    expect(ligne.id).toBe("m_tuee");
    expect(JSON.parse(ligne.content).url).toContain("/attachments/" + BULLE_TUEE.pj.chemin);
  });

  test("⑫ bis RECHARGÉE en plein dépôt : la requête coupée part en file, et repart au démarrage", async ({ page }) => {
    test.setTimeout(120000);
    const r = await banc(page);
    r.mode("pendre");
    const m = await joindreDocument(page, r, "coupe.pdf");
    // AVANT : aucune bulle n'avait de statut — elle passait pour envoyée, et ne partait jamais.
    expect(await statutDe(page, m.id), "le dépôt n'a pas répondu : « envoi… »").toBe("sending");
    r.mode("ok");
    await page.evaluate((u) => { localStorage.setItem("passio_uid", u); saveConversationsNow(); }, UID_MOI);
    await page.reload();
    await page.waitForFunction((c) => typeof getConversations === "function" && getConversations().some((x) => x.id === c), CONV, { timeout: 20000 });
    await expect.poll(() => statutDe(page, m.id), { timeout: 25000, message: "la bulle coupée repart au démarrage" }).toBe("sent");
    expect(r.journal.depots.map((d) => d.mode)).toEqual(["pendre", "ok"]);
    expect(r.journal.depots[1].chemin).toBe(r.journal.depots[0].chemin);
    expect(r.journal.messages).toHaveLength(1);
    expect(aucuneDataUrl(r.journal.messages)).toBe(true);
    expect(JSON.parse(r.journal.messages[0]).id).toBe(m.id);
  });

  test("⑬ une bulle « envoi… » de CETTE page n'est jamais reprise : son insertion peut être en vol", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    // Le dépôt aboutit, l'INSERTION est en vol : la bulle dit encore « envoi… », et
    // plus aucun dépôt ne la protège (le garde-fou « en vol » ne couvre que le dépôt).
    r.mode("ok");
    r.insertion("pendre");
    const m = await joindreDocument(page, r);
    await expect.poll(() => r.journal.messages.length, { timeout: 10000 }).toBe(1);
    expect(await statutDe(page, m.id)).toBe("sending");
    // Comme un démarrage hors ligne : le premier vidage n'avait rien pu reprendre,
    // c'est CE retour du réseau qui fait la reprise — elle doit épargner cette bulle.
    await page.evaluate(() => { window._pjInterrompusRepris = false; window.dispatchEvent(new Event("online")); });
    await page.waitForTimeout(800);
    expect(r.journal.messages, "le retour du réseau ne double pas une insertion en vol").toHaveLength(1);
    expect(r.journal.depots).toHaveLength(1);
  });

  test("⑭ la reprise est UNIQUE par page : une bulle reprise dont l'insertion est en vol n'est pas réinsérée", async ({ page }) => {
    test.setTimeout(120000);
    const r = await banc(page);
    r.mode("ok");
    r.insertion("pendre");
    await rouvrirAvecBulleTuee(page);
    await expect.poll(() => r.journal.messages.length, { timeout: 25000, message: "la bulle reprise s'insère" }).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(800);
    // Sans la borne, la reprise relirait « envoi… » et renverrait la ligne : 23505, puis
    // « échec » sur un message déjà livré (ROB-06).
    expect(r.journal.messages, "une seule insertion").toHaveLength(1);
    expect(r.journal.depots).toHaveLength(1);
  });

  test("⑪ le filet de sendMessageToSupabase : une data URL n'est JAMAIS insérée, même en étiquette", async ({ page }) => {
    test.setTimeout(90000);
    const r = await banc(page);
    await page.evaluate(({ conv, png }) => {
      getConversations().find((c) => c.id === conv).messages.push({ id: "m_filet", from: "me", img: png, text: "", at: Date.now(), status: "sending" });
      saveConversationsNow();
      sendMessageToSupabase("m_filet", conv, png, "image/png", "photo.png", "media");
    }, { conv: CONV, png: PNG_1PX });
    await page.waitForTimeout(500);
    // AVANT : 1 insertion « 📎 photo.png (non synchronisé) », message marqué envoyé.
    expect(r.journal.messages).toEqual([]);
    expect(await statutDe(page, "m_filet")).toBe("failed");
    const { erreurs } = await lire(page);
    expect(erreurs.some((x) => x.action === "piece_jointe_data_url" && x.severity === "error"), "erreurs : " + JSON.stringify(erreurs)).toBe(true);
  });
});
