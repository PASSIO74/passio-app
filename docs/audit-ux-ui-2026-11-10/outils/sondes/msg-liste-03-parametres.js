// Sonde 03 — en-tête d'une conversation 1:1, panneau « Paramètres », chaque action.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, banc, GENS, serveur }) => {
  const out = { dialogues: [] };
  page.on("dialog", async (d) => { out.dialogues.push({ type: d.type(), message: d.message(), defaut: d.defaultValue() }); await d.dismiss().catch(() => {}); });
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  await page.evaluate(() => goTo("messages"));
  await jeu.attendreListe(page, 3);
  await page.locator("#messageList .msg-card", { hasText: "Malik Benali" }).tap();
  await page.waitForTimeout(900);
  await photo("entete");
  out.entete = await page.evaluate(() => {
    const m = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, x: Math.round(b.x), y: Math.round(b.y), title: e.getAttribute("title"), aria: e.getAttribute("aria-label"), role: e.getAttribute("role"), tab: e.getAttribute("tabindex") }; };
    const h = document.getElementById("convFpHead");
    return {
      retour: m(h.querySelector(".conv-fp-back")), avatar: m(h.querySelector(".conv-fp-head-avatar")), info: m(h.querySelector(".conv-fp-head-info")),
      nom: h.querySelector(".conv-fp-name").textContent, sous: h.querySelector(".conv-fp-passion").textContent,
      sousStyle: (function () { const cs = getComputedStyle(h.querySelector(".conv-fp-passion")); return { fs: cs.fontSize, col: cs.color }; })(),
      actions: [...h.querySelectorAll(".conv-action-btn")].map(m), hauteur: Math.round(h.getBoundingClientRect().height),
      notifPermission: typeof Notification !== "undefined" ? Notification.permission : "absent",
    };
  });
  // Zone tactile réelle des trois points
  out.zonePoints = await page.evaluate(() => { const b = [...document.querySelectorAll("#convFpHead .conv-action-btn")].pop(); const r = b.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; let g = 0, d = 0, h = 0, bas = 0; const sur = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e === b || b.contains(e)); }; while (g < 60 && sur(cx - g - 1, cy)) g++; while (d < 60 && sur(cx + d + 1, cy)) d++; while (h < 60 && sur(cx, cy - h - 1)) h++; while (bas < 60 && sur(cx, cy + bas + 1)) bas++; return { w: g + d + 1, h: h + bas + 1 }; });
  // Trois points → panneau Paramètres
  await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
  await page.waitForTimeout(500);
  await photo("parametres-haut");
  out.panneau = await page.evaluate(() => {
    const p = document.getElementById("convSettingsPanel"), c = document.getElementById("convSettingsContent");
    return {
      ouvert: p.classList.contains("open"), role: p.getAttribute("role"), ariaModal: p.getAttribute("aria-modal"),
      hauteurContenu: c.scrollHeight, visible: c.clientHeight,
      sections: [...c.querySelectorAll(".csetting-section")].map((s) => s.textContent),
      items: [...c.querySelectorAll(".csetting-item")].map((i) => ({ icone: i.querySelector(".csetting-icon").textContent, libelle: i.querySelector(".csetting-label").textContent, couleur: getComputedStyle(i.querySelector(".csetting-label")).color, h: Math.round(i.getBoundingClientRect().height), role: i.getAttribute("role"), tab: i.getAttribute("tabindex") })),
      historique: history.length, hash: location.hash,
    };
  });
  await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
  await page.waitForTimeout(250);
  await photo("parametres-bas");
  const item = (texte) => page.locator("#convSettingsContent .csetting-item", { hasText: texte }).first();
  // Sourdine
  await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 0; });
  await item("Couper les notifications").tap();
  await page.waitForTimeout(400);
  out.sourdine = { toasts: await toasts(), libelle: await page.evaluate(() => [...document.querySelectorAll("#convSettingsContent .csetting-label")].map((l) => l.textContent)[1]), drapeau: await page.evaluate((id) => getConversations().find((c) => c.id === id)._muted, jeu.ID.malik), panneauOuvert: await page.evaluate(() => document.getElementById("convSettingsPanel").classList.contains("open")) };
  await photo("sourdine-active");
  // Accusés de lecture (réglage GLOBAL du compte, rangé dans une conversation)
  await item("Accusés de lecture").tap();
  await page.waitForTimeout(400);
  out.accuses = { toasts: (await toasts()).slice(-1), global: await page.evaluate(() => state.user.general.readReceipts) };
  await item("Accusés de lecture").tap();
  await page.waitForTimeout(300);
  // Fond de conversation
  await item("Fond de conversation").tap();
  await page.waitForTimeout(500);
  await photo("fond-selecteur");
  out.fond = await page.evaluate(() => { const c = document.getElementById("modalContent"); return { titre: (c.querySelector(".modal-title") || {}).textContent, pastilles: [...c.querySelectorAll('[onclick^="_setConvBg"]')].map((p) => ({ t: p.textContent.trim(), w: Math.round(p.getBoundingClientRect().width), h: Math.round(p.getBoundingClientRect().height) })) }; });
  await page.locator('#modalContent [onclick^="_setConvBg"]').nth(1).tap();   // « Violet »
  await page.waitForTimeout(700);
  await photo("fond-violet-applique");
  out.fondApplique = await page.evaluate(() => {
    const t = document.getElementById("convFpThread");
    const lire = (sel) => { const e = t.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { texte: e.textContent.trim().slice(0, 30), couleur: cs.color, fs: cs.fontSize }; };
    return { fond: t.style.background, date: lire(".conv-day-sep, .conv-date-sep, [class*='day']"), heure: lire(".conv-bubble-time, .conv-time, [class*='time']"), panneauOuvert: document.getElementById("convSettingsPanel").classList.contains("open"), classes: [...new Set([...t.querySelectorAll("*")].map((e) => e.className).filter((c) => typeof c === "string" && c))].slice(0, 30) };
  });
  // Remettre le fond par défaut (action réelle)
  await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
  await page.waitForTimeout(400);
  await item("Fond de conversation").tap();
  await page.waitForTimeout(400);
  await page.locator('#modalContent [onclick^="_setConvBg"]').nth(0).tap();
  await page.waitForTimeout(600);
  // Rechercher dans la conversation → prompt() natif
  await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
  await item("Rechercher dans la conversation").tap();
  await page.waitForTimeout(400);
  // Exporter
  await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
  const [telechargement] = await Promise.all([page.waitForEvent("download", { timeout: 4000 }).catch(() => null), item("Exporter la conversation").tap()]);
  await page.waitForTimeout(400);
  out.export = { fichier: telechargement ? telechargement.suggestedFilename() : null, toasts: (await toasts()).slice(-1), panneauOuvert: await page.evaluate(() => document.getElementById("convSettingsPanel").classList.contains("open")) };
  // Effacer les messages → confirm() natif (refusé ici)
  await item("Effacer les messages").tap();
  await page.waitForTimeout(300);
  // Bloquer → confirm() natif (refusé ici)
  await item("Bloquer").tap();
  await page.waitForTimeout(300);
  // Supprimer → confirm() natif (refusé ici)
  await item("Supprimer la conversation").tap();
  await page.waitForTimeout(300);
  // Signaler → fenêtre de motif
  await item("Signaler").tap();
  await page.waitForTimeout(600);
  await photo("signaler");
  out.signaler = await page.evaluate(() => { const c = document.getElementById("modalContent"); return { titre: (c.querySelector(".modal-title") || {}).textContent, sous: (c.querySelector(".modal-subtitle") || {}).textContent, boutons: [...c.querySelectorAll("button")].map((b) => b.textContent.trim()) }; });
  await page.locator("#modalContent button", { hasText: "Envoyer le signalement" }).tap();
  await page.waitForTimeout(400);
  out.signalerVide = (await toasts()).slice(-1);
  await page.locator("#modalContent button", { hasText: "Annuler" }).tap();
  await page.waitForTimeout(500);
  out.apresAnnuler = await page.evaluate(() => ({ conv: document.getElementById("conv-fullpage").classList.contains("active"), panneau: document.getElementById("convSettingsPanel").classList.contains("open") }));
  // Marquer comme non lu
  await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
  await page.waitForTimeout(400);
  await item("Marquer comme non lu").tap();
  await page.waitForTimeout(900);
  await photo("marque-non-lu");
  out.nonLu = await page.evaluate((id) => ({ conv: document.getElementById("conv-fullpage").classList.contains("active"), unread: getConversations().find((c) => c.id === id).unread, nav: (document.querySelector(".nav-msg-badge") || {}).textContent, carte: [...document.querySelectorAll("#messageList .msg-card")].filter((c) => /Malik/.test(c.textContent)).map((c) => c.classList.contains("unread")) }), jeu.ID.malik);
  out.toasts = await toasts();
  // Épingler
  await page.locator("#messageList .msg-card", { hasText: "Tom Girard" }).tap();
  await page.waitForTimeout(800);
  await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
  await page.waitForTimeout(400);
  await item("Épingler").tap();
  await page.waitForTimeout(500);
  out.epingle = await page.evaluate(() => ({ conv: document.getElementById("conv-fullpage").classList.contains("active"), panneau: document.getElementById("convSettingsPanel").classList.contains("open") }));
  await page.locator("#convFpHead .conv-fp-back").tap();
  await page.waitForTimeout(700);
  await photo("liste-avec-epingle");
  // Archiver
  await page.locator("#messageList .msg-card", { hasText: "Inès Moreau" }).tap();
  await page.waitForTimeout(800);
  await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
  await item("Archiver la conversation").tap();
  await page.waitForTimeout(900);
  await photo("liste-avec-archive");
  out.archive = await page.evaluate(() => ({ rangee: document.getElementById("archivedToggleRow").innerText, h: Math.round(document.getElementById("archivedToggleRow").getBoundingClientRect().height), nav: (document.querySelector(".nav-msg-badge") || {}).textContent, premiers: [...document.querySelectorAll("#messageList .msg-name")].slice(0, 4).map((n) => n.textContent) }));
  await page.locator("#archivedToggleRow button").tap();
  await page.waitForTimeout(500);
  await photo("vue-archivees");
  out.vueArchivees = await page.evaluate(() => ({ rangee: document.getElementById("archivedToggleRow").innerText, cartes: [...document.querySelectorAll("#messageList .msg-name")].map((n) => n.textContent), titre: (document.querySelector(".v6a-title") || {}).textContent, champ: document.getElementById("convGlobalSearch").placeholder }));
  out.toastsFin = await toasts();
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
