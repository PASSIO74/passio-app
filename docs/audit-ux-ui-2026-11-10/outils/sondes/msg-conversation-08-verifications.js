// Sonde 08 — vérifications ciblées restées en suspens :
// GIF / position en panne serveur, dépôt de photo en panne, position refusée, vidéo
// (clic droit), citation d'une photo et d'un vocal, IRL refusé par le serveur, brouillon /
// fond / épinglage après rechargement, bandeau hors ligne (elementFromPoint), grille
// d'emojis « page construite », largeur du champ à 360 et 320 px, message de 5 200 caractères.
"use strict";
const path = require("path");
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
const MEDIAS = path.join(__dirname, "..", "medias");
module.exports = async ({ page, context, serveur, photo, banc, GENS, MOI }) => {
  const out = {};
  const pas = async (nom, fn) => { try { out[nom] = await fn(); } catch (e) { out[nom] = { ERREUR: String(e && e.message).split("\n")[0] }; } };
  let irlReponse = "false";
  await page.route("**/audit-vocal.wav*", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: jeu.wav(3) }));
  await page.route(/\/rest\/v1\/rpc\/irl_interaction_allowed/, (r) => r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } }) : r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: irlReponse }));
  const img = (n) => "http://127.0.0.1:" + new URL(page.url()).port + "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
  await page.route(/api\.klipy\.com/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ results: ["photo-carre.jpg", "photo-paysage.jpg"].map((n) => ({ media_formats: { tinygif: { url: img(n) } } })) }) }));
  const dernier = () => page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; const w = document.querySelector('.conv-bubble-wrap[data-mid="' + CSS.escape(m.id) + '"]'); return { type: m.gif ? "gif" : m.img ? "img" : m.location ? "position" : /^📍/.test(m.text || "") ? "position-texte" : "texte", statut: m.status || null, ligneHeure: w ? (w.querySelector(".conv-bubble-time") || {}).innerText : null, toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length, filePj: JSON.parse(localStorage.getItem("passio_pj_outbox_v1") || "[]").length }; }, jeu.IDS.ines);

  // ① IRL refusé par le serveur : bouton d'en-tête absent ? entrée du menu présente ?
  await jeu.entrer(page, GENS.ines.nom);
  await page.waitForTimeout(700);
  await pas("irlRefuse", async () => {
    const tete = await page.evaluate(() => !!document.querySelector("#convFpHead [data-irl-proposal-action]"));
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    const menu = await page.evaluate(() => { const i = document.getElementById("v6cProposerIrl"); return i ? { present: !i.hidden, texte: i.innerText.trim() } : null; });
    await photo("irl-refuse-menu");
    await page.locator("#v6cProposerIrl").tap(); await page.waitForTimeout(1200);
    const apres = await page.evaluate(() => ({ conversationOuverte: document.getElementById("conv-fullpage").classList.contains("active"), modale: document.getElementById("modalBackdrop").classList.contains("active"), titre: ((document.querySelector("#modalContent h2, #modalContent h3, #modalContent .modal-title") || {}).textContent || "").trim().slice(0, 60), evTitle: (document.getElementById("evTitle") || {}).value, ecran: (document.querySelector(".screen.active") || {}).id }));
    await photo("irl-formulaire");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    return { boutonEnTete: tete, entreeMenu: menu, apresToucher: apres };
  });
  await page.waitForTimeout(400);

  // ② Largeur du champ selon l'écran (même page, fenêtre redimensionnée)
  await jeu.entrer(page, GENS.ines.nom);
  await pas("champSelonLargeur", async () => {
    const res = {}; const v0 = page.viewportSize();
    for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(350);
      res["l" + w] = await page.evaluate(() => { const i = document.getElementById("convFpInput"); const cs = getComputedStyle(i); const f = document.getElementById("convFpThread"); return { champ: Math.round(i.getBoundingClientRect().width), utile: Math.round(i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), hauteurFil: Math.round(f.getBoundingClientRect().height), debordement: document.documentElement.scrollWidth > innerWidth }; });
    }
    await page.setViewportSize(v0); await page.waitForTimeout(300);
    return res;
  });

  // ③ Message de 5 200 caractères
  await pas("tropLong", async () => {
    await page.locator("#convFpInput").fill("a".repeat(5200));
    await page.locator("#convFpSendBtn").click(); await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ toast: (window.__toasts || []).map((t) => t.msg).slice(-1)[0], resteDansLeChamp: document.getElementById("convFpInput").value.length }));
    await photo("trop-long");
    await page.locator("#convFpInput").fill("");
    return r;
  });

  // ④ GIF pendant une panne serveur (les deux tentatives : avec puis sans from_id)
  await pas("gifEnPanne", async () => {
    serveur.pannes.push({ table: "conv_messages", methode: "POST", status: 500, body: { message: "panne du banc" }, fois: 2 });
    await page.locator('.conv-toolbar button[aria-label="Ajouter un GIF"]').tap(); await page.waitForTimeout(900);
    await page.locator("#gif-panel-msg img").first().tap(); await page.waitForTimeout(1500);
    const enBase = serveur.t.conv_messages.filter((m) => m.conv_id === jeu.IDS.ines && /"type":"gif"/.test(m.content)).length;
    return { ...(await dernier()), enBase };
  });
  // ⑤ Position pendant une panne serveur
  await pas("positionEnPanne", async () => {
    await context.grantPermissions(["geolocation"]); await context.setGeolocation({ latitude: 45.7485, longitude: 4.8467 });
    serveur.pannes.push({ table: "conv_messages", methode: "POST", status: 500, body: { message: "panne du banc" }, fois: 2 });
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    await page.locator("#convAttachMenu .attach-item", { hasText: "Localisation" }).tap(); await page.waitForTimeout(1800);
    const enBase = serveur.t.conv_messages.filter((m) => m.conv_id === jeu.IDS.ines && /"type":"location"/.test(m.content)).length;
    await jeu.filPret(page); await jeu.enBas(page);
    await photo("gif-position-en-panne");
    return { ...(await dernier()), enBase };
  });
  // ⑥ Position refusée
  await pas("positionRefusee", async () => {
    await page.evaluate(() => { navigator.geolocation.getCurrentPosition = function (ok, ko) { setTimeout(() => ko && ko({ code: 1, message: "User denied Geolocation" }), 50); }; });
    const n0 = serveur.t.conv_messages.length;
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    await page.locator("#convAttachMenu .attach-item", { hasText: "Localisation" }).tap(); await page.waitForTimeout(700);
    return { toasts: await page.evaluate(() => (window.__toasts || []).map((t) => t.msg).slice(-2)), envoye: serveur.t.conv_messages.length - n0, menuOuvert: await page.evaluate(() => document.getElementById("convAttachMenu").classList.contains("open")) };
  });
  await page.touchscreen.tap(200, 200); await page.waitForTimeout(300);
  // ⑦ Photo pendant une panne du stockage
  await pas("photoStockageEnPanne", async () => {
    await page.route(/\/storage\/v1\/object\/attachments\//, (r) => r.request().method() === "POST" ? r.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ statusCode: "500", error: "Internal", message: "panne du banc" }) }) : r.fallback());
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    const [fc] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.locator("#convAttachMenu .attach-item", { hasText: "Photo" }).tap()]);
    await fc.setFiles(path.join(MEDIAS, "photo-carre.jpg")); await page.waitForTimeout(2000);
    await jeu.filPret(page); await jeu.enBas(page);
    await photo("photo-depot-en-panne");
    const r = await dernier();
    await page.unroute(/\/storage\/v1\/object\/attachments\//);
    const lien = page.locator('#convFpThread [data-msgst] span[onclick]').last();
    if (await lien.count()) { await lien.tap(); await page.waitForTimeout(1800); }
    return { pendantLaPanne: r, apresReessai: await dernier() };
  });

  // ⑧ Hors ligne : qui reçoit le toucher au centre du bouton Retour ?
  await pas("bandeauHorsLigne", async () => {
    await context.setOffline(true); await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const b = document.querySelector("#convFpHead .conv-fp-back").getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); const nom = document.querySelector("#convFpHead .conv-fp-name").getBoundingClientRect(); const e2 = document.elementFromPoint(nom.left + 20, nom.top + nom.height / 2); const menu = document.querySelector('#convFpHead button[title="Paramètres"]').getBoundingClientRect(); const e3 = document.elementFromPoint(menu.left + menu.width / 2, menu.top + menu.height / 2); const d = (x) => x ? (x.id || x.className || x.tagName).toString().slice(0, 40) + " | " + (x.innerText || "").slice(0, 40) : null; const ban = e ? e.closest("[id]") : null; const br = ban ? ban.getBoundingClientRect() : null; return { auCentreDuRetour: d(e), surLeNom: d(e2), surLeMenu: d(e3), bandeau: ban ? { id: ban.id, h: Math.round(br.height), z: getComputedStyle(ban).zIndex, pos: getComputedStyle(ban).position } : null }; });
    await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.waitForTimeout(700);
    return r;
  });

  // ⑨ Grille d'emojis : état de la page construite (remplissage d'app-09 rejoué)
  await pas("emojiPageConstruite", async () => {
    const brut = await page.evaluate(() => ({ cellules: document.querySelectorAll("#emojiGrid > div").length, casse: [...document.querySelectorAll("#emojiGrid > div")].filter((d) => /[\uD800-\uDFFF]/.test(d.textContent) && d.textContent.length === 1).length }));
    await page.evaluate(() => _populateEmojiGrid());
    await page.locator("#btnEmoji").tap(); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const g = document.getElementById("emojiGrid"); const c = [...g.children]; const b = c[0].getBoundingClientRect(); return { cellules: c.length, colonnes: getComputedStyle(g).gridTemplateColumns.split(" ").length, cellule: { w: Math.round(b.width), h: Math.round(b.height), fs: getComputedStyle(c[0]).fontSize }, classe: c[0].className }; });
    await photo("emoji-page-construite");
    // un emoji de la grille par défaut : le panneau reste-t-il ouvert ?
    await page.locator("#emojiGrid > div").nth(3).tap(); await page.waitForTimeout(300);
    r.apresChoix = await page.evaluate(() => ({ panneauOuvert: document.getElementById("convEmojiPanel").classList.contains("open"), champ: document.getElementById("convFpInput").value }));
    await page.evaluate(() => { document.getElementById("convEmojiPanel").classList.remove("open"); document.getElementById("convFpInput").value = ""; });
    return { brut, ...r };
  });
  await page.evaluate(() => closeConversation()); await page.waitForTimeout(400);

  // ⑩ Léa : clic droit sur la vidéo ; répondre à une photo, à un vocal
  await jeu.entrer(page, GENS.lea.nom);
  await pas("videoClicDroit", async () => {
    await page.locator(jeu.bulle("m_lea_19")).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await page.locator(jeu.bulle("m_lea_19") + " video").click({ button: "right", position: { x: 100, y: 40 } }); await page.waitForTimeout(500);
    const feuille = await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active"));
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    // appui long sur la ligne de l'heure, sous la vidéo
    const ok = await jeu.ouvrirMenu(page, banc, null, '.conv-bubble-wrap[data-mid="m_lea_19"] .conv-bubble-time');
    const h = await page.evaluate(() => { const t = document.querySelector('.conv-bubble-wrap[data-mid="m_lea_19"] .conv-bubble-time').getBoundingClientRect(); return { w: Math.round(t.width), h: Math.round(t.height) }; });
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    return { feuilleParClicDroit: feuille, feuilleParAppuiSurLHeure: ok, ligneHeure: h };
  });
  for (const [cle, id] of [["citationPhoto", "m_lea_05"], ["citationVocal", "m_lea_10"], ["citationDocument", "m_lea_12"], ["citationPosition", "m_lea_20"]]) {
    await pas(cle, async () => {
      await page.waitForTimeout(300);
      const ouvert = await jeu.ouvrirMenu(page, banc, id);
      if (!ouvert) return { feuille: false };
      const items = await page.evaluate(() => [...document.querySelectorAll("#modalContent .csetting-item")].map((e) => e.innerText.replace(/\s+/g, " ").trim()));
      await page.locator("#modalContent .csetting-item", { hasText: "Répondre" }).click(); await page.waitForTimeout(400);
      const barre = await page.evaluate(() => (document.getElementById("convReplyBar") || {}).innerText);
      if (cle === "citationPhoto") await photo("citation-photo");
      await page.evaluate(() => _cancelReply());
      return { items, barre: barre ? barre.replace(/\s+/g, " ") : null };
    });
  }
  await pas("copiePhoto", async () => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    const ouvert = await jeu.ouvrirMenu(page, banc, "m_lea_05"); if (!ouvert) return { feuille: false };
    await page.locator("#modalContent .csetting-item", { hasText: "Copier" }).click(); await page.waitForTimeout(300);
    return { pressePapiers: await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message)) };
  });
  // Mesures du gabarit ordinateur (même page, fenêtre élargie)
  await pas("grandEcran", async () => {
    const v0 = page.viewportSize(); const res = {};
    for (const [w, h] of [[768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400);
      res["l" + w] = await page.evaluate(() => { const fp = document.getElementById("conv-fullpage").getBoundingClientRect(); const bs = [...document.querySelectorAll("#convFpThread .conv-bubble")].map((b) => b.getBoundingClientRect().width); const i = document.getElementById("convFpInput").getBoundingClientRect(); const them = document.querySelector("#convFpThread .conv-bubble-wrap.them").getBoundingClientRect(); const me = document.querySelector("#convFpThread .conv-bubble-wrap.me").getBoundingClientRect(); return { panneau: { x: Math.round(fp.x), w: Math.round(fp.width) }, bulleMax: Math.round(Math.max.apply(null, bs)), champ: Math.round(i.width), bordGaucheRecu: Math.round(them.left), bordDroitEnvoye: Math.round(me.right) }; });
    }
    await page.setViewportSize(v0); await page.waitForTimeout(300);
    return res;
  });
  await page.evaluate(() => closeConversation()); await page.waitForTimeout(400);

  // ⑪ Rechargement : brouillon, fond, épinglage (champs locaux) sur une conversation connue du serveur
  await pas("rechargement", async () => {
    await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); c.draft = "brouillon"; c.bg = "#0a0a0f"; c.pinned = true; c._muted = true; c.archived = false; saveConversationsNow(); }, jeu.IDS.lea);
    const avant = await page.evaluate((id) => { const c = JSON.parse(localStorage.getItem("passio_conversations_v1")).find((x) => x.id === id); return { draft: c.draft, bg: c.bg, pinned: c.pinned, muted: c._muted }; }, jeu.IDS.lea);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 20000 });
    await page.waitForTimeout(4000);
    const apres = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); return c ? { draft: c.draft || null, bg: c.bg || null, pinned: !!c.pinned, muted: !!c._muted } : null; }, jeu.IDS.lea);
    return { avant, apres };
  });
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
