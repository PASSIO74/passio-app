// Sonde 04 — menu « + », panneau emoji/GIF, sélecteur GIF, envoi d'une photo / d'un
// document / d'un fichier audio (vrais <input type=file>), localisation, visionneuse.
"use strict";
const path = require("path");
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
const MEDIAS = path.join(__dirname, "..", "medias");
module.exports = async ({ page, context, serveur, photo, banc, GENS }) => {
  const out = {};
  try {
    await jeu.routes(page, { irl: true });
    // GIF : KLIPY est refusé par le banc → réponse locale (SIMULÉ) pour voir le sélecteur rempli.
    const img = (n) => "http://127.0.0.1:" + new URL(page.url()).port + "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
    await page.route(/api\.klipy\.com/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ results: ["photo-carre.jpg", "photo-paysage.jpg", "photo-portrait.jpg", "photo-atelier.jpg", "couverture.jpg", "photo-haute.jpg", "photo-panorama.jpg", "couverture-evenement.jpg"].map((n) => ({ media_formats: { tinygif: { url: img(n) } } })) }) }));
    await jeu.entrer(page, GENS.ines.nom);
    const boite = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), z: cs.zIndex, pos: cs.position, display: cs.display }; }, sel);

    // ① Menu « + »
    await page.locator("#btnAttach").tap();
    await page.waitForTimeout(400);
    out.menuPlus = await page.evaluate(() => { const m = document.getElementById("convAttachMenu"); const b = m.getBoundingClientRect(); return { ouvert: m.classList.contains("open"), boite: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, items: [...m.querySelectorAll(".attach-item")].filter((e) => !e.hidden).map((e) => { const r = e.getBoundingClientRect(); return { texte: e.innerText.trim(), h: Math.round(r.height), role: e.getAttribute("role"), tabindex: e.getAttribute("tabindex") }; }), btnActif: document.getElementById("btnAttach").classList.contains("active"), ariaExpanded: document.getElementById("btnAttach").getAttribute("aria-expanded") }; });
    await photo("menu-plus");
    // Fermeture par toucher à côté
    await page.touchscreen.tap(300, 300);
    await page.waitForTimeout(300);
    out.menuPlusFermeDehors = !(await page.evaluate(() => document.getElementById("convAttachMenu").classList.contains("open")));

    // ② Panneau emoji
    await page.locator("#btnEmoji").tap();
    await page.waitForTimeout(500);
    out.emoji = await page.evaluate(() => {
      const p = document.getElementById("convEmojiPanel"); const b = p.getBoundingClientRect();
      const tb = document.querySelector("#conv-fullpage .conv-toolbar").getBoundingClientRect();
      const cells = [...document.querySelectorAll("#emojiGrid > div")]; const c0 = cells[0] ? cells[0].getBoundingClientRect() : null;
      const onglets = [...document.querySelectorAll("#emojiTopBar button")].map((x) => ({ t: x.innerText, h: Math.round(x.getBoundingClientRect().height), fond: getComputedStyle(x).backgroundColor, coul: getComputedStyle(x).color }));
      const send = document.getElementById("convFpSendBtn").getBoundingClientRect();
      const top = document.elementFromPoint(send.x + send.width / 2, send.y + send.height / 2);
      return { ouvert: p.classList.contains("open"), boite: { y: Math.round(b.y), bas: Math.round(b.bottom), h: Math.round(b.height) }, barre: { y: Math.round(tb.y), bas: Math.round(tb.bottom) }, recouvreBarre: b.bottom > tb.y + 1, nbEmojis: cells.length, cellule: c0 ? { w: Math.round(c0.width), h: Math.round(c0.height), fs: getComputedStyle(cells[0]).fontSize } : null, onglets, categories: document.getElementById("emojiCategoriesBar").children.length, hauteurCategories: Math.round(document.getElementById("emojiCategoriesBar").getBoundingClientRect().height), envoiAtteignable: !!top && (top.id === "convFpSendBtn" || !!top.closest("#convFpSendBtn")), filRecouvert: Math.round(b.height) };
    });
    await photo("emoji");
    // Recherche d'emoji
    await page.locator("#emojiSearchInput").fill("guitare");
    await page.waitForTimeout(300);
    out.emojiRecherche = await page.evaluate(() => ({ resultats: document.querySelectorAll("#emojiGrid > div").length, premier: (document.querySelector("#emojiGrid > div") || {}).textContent }));
    await photo("emoji-recherche");
    await page.locator("#emojiGrid > div").first().tap();
    await page.waitForTimeout(300);
    out.emojiInsere = await page.evaluate(() => ({ champ: document.getElementById("convFpInput").value, panneauOuvert: document.getElementById("convEmojiPanel").classList.contains("open"), focus: document.activeElement.id }));
    // Onglet GIF du panneau
    await page.locator("#btnEmoji").tap(); await page.waitForTimeout(300);
    await page.locator("#emojiTopBar button", { hasText: "GIF" }).tap();
    await page.waitForTimeout(900);
    out.gifOnglet = await page.evaluate(() => ({ nb: document.querySelectorAll("#gifGrid > div").length, ph: document.getElementById("gifSearchInput").placeholder, ongletActifFond: getComputedStyle(document.querySelectorAll("#emojiTopBar button")[1]).backgroundColor }));
    await photo("emoji-onglet-gif");
    await page.touchscreen.tap(200, 200); await page.waitForTimeout(300);
    await page.locator("#convFpInput").fill("");

    // ③ Bouton GIF (second sélecteur)
    await page.locator('.conv-toolbar button[aria-label="Ajouter un GIF"]').tap();
    await page.waitForTimeout(900);
    out.gifPanneau = await page.evaluate(() => { const p = document.getElementById("gif-panel-msg"); if (!p) return null; const b = p.getBoundingClientRect(); return { boite: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, ph: p.querySelector("input").placeholder, nb: p.querySelectorAll("img").length, z: getComputedStyle(p).zIndex, colonnes: getComputedStyle(p.querySelector("div")).gridTemplateColumns }; });
    await photo("gif-panneau");
    const nAvantGif = serveur.t.conv_messages.length;
    await page.locator("#gif-panel-msg img").first().tap();
    await page.waitForTimeout(900);
    out.gifEnvoye = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { gif: !!m.gif, statut: m.status || null, confirmation: false }; }, jeu.IDS.ines);
    out.gifEnBase = serveur.t.conv_messages.length - nAvantGif;
    await jeu.filPret(page); await jeu.enBas(page);
    await photo("gif-envoye");

    // ④ Photo par le VRAI sélecteur de fichier
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    const [fc] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Photo" }).tap()]);
    out.selecteurPhoto = { accept: await page.locator("#attachImageFile").getAttribute("accept"), multiple: await page.locator("#attachImageFile").getAttribute("multiple"), capture: await page.locator("#attachImageFile").getAttribute("capture") };
    await fc.setFiles(path.join(MEDIAS, "photo-paysage.jpg"));
    await page.waitForTimeout(300);
    out.photoPendant = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { img: !!m.img, statut: m.status, apercuAvantEnvoi: !!document.querySelector("#attachPreview, .attach-preview, #modalBackdrop.active") }; }, jeu.IDS.ines);
    await photo("photo-envoi");
    await page.waitForTimeout(1500);
    out.photoApres = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { statut: m.status, pjUrl: !!(m.pj && m.pj.url), toasts: (window.__toasts || []).map((t) => t.msg).slice(-2) }; }, jeu.IDS.ines);
    await jeu.filPret(page); await jeu.enBas(page);
    await photo("photo-envoyee");

    // ⑤ Document
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    const [fd] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Document" }).tap()]);
    await fd.setFiles({ name: "Feuille-de-route-developpement-argentique-novembre.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictif audit") });
    await page.waitForTimeout(1500);
    // ⑥ Fichier audio
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    const [fa] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Fichier audio" }).tap()]);
    await fa.setFiles({ name: "repetition-jeudi.wav", mimeType: "audio/wav", buffer: jeu.wav(2) });
    await page.waitForTimeout(1500);
    await jeu.filPret(page); await jeu.enBas(page);
    out.docAudio = await page.evaluate((id) => {
      const c = getConversations().find((x) => x.id === id); const ms = c.messages.slice(-2);
      const lus = (mid) => { const w = document.querySelector('.conv-bubble-wrap[data-mid="' + mid + '"]'); if (!w) return null; const t = w.querySelector(".conv-bubble"); const noeuds = [...t.querySelectorAll("div,span,button")].filter((e) => e.children.length === 0 && e.textContent.trim()); return noeuds.map((e) => ({ t: e.textContent.trim().slice(0, 30), coul: getComputedStyle(e).color })); };
      return ms.map((m) => ({ id: m.id, statut: m.status, doc: !!m.docData, audio: !!m.voiceData, isFile: !!m.isFile, rendu: lus(m.id) }));
    }, jeu.IDS.ines);
    await photo("doc-audio-envoyes");

    // ⑦ Localisation — permission accordée (géoloc fictive)
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 45.7485, longitude: 4.8467 });
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    const nAvantLoc = serveur.t.conv_messages.length;
    await page.locator("#convAttachMenu .attach-item", { hasText: "Localisation" }).tap();
    await page.waitForTimeout(1500);
    out.localisation = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; const w = document.querySelector('.conv-bubble-wrap[data-mid="' + m.id + '"] .conv-bubble'); return { texte: m.text, statut: m.status || null, rendu: w ? w.innerText : null, lien: w && w.querySelector("a") ? w.querySelector("a").href : null, confirmationAvantEnvoi: false, toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), menuReferme: !document.getElementById("convAttachMenu").classList.contains("open") }; }, jeu.IDS.ines);
    out.localisationEnBase = serveur.t.conv_messages.length - nAvantLoc;
    await jeu.enBas(page);
    await photo("localisation-envoyee");

    // ⑧ Visionneuse plein écran (toucher une photo)
    await page.locator("#convFpThread img[onclick]").last().scrollIntoViewIfNeeded();
    await page.locator("#convFpThread img[onclick]").last().tap();
    await page.waitForTimeout(500);
    out.visionneuse = await page.evaluate(() => { const v = document.getElementById("fullImgViewer"); if (!v) return null; const bs = [...v.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); return { nom: b.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height) }; }); return { z: getComputedStyle(v).zIndex, boutons: bs, aide: v.innerText.trim(), role: v.getAttribute("role"), hash: location.hash }; });
    await photo("visionneuse");
    await page.goBack().catch(() => {});
    await page.waitForTimeout(600);
    out.retourDepuisVisionneuse = await page.evaluate(() => ({ visionneuseEncoreLa: !!document.getElementById("fullImgViewer"), conversationOuverte: document.getElementById("conv-fullpage").classList.contains("active"), ecran: (document.querySelector(".screen.active") || {}).id }));
    await photo("apres-retour");
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
