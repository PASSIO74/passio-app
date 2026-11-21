// Sonde 02 — tête de l'écran, menu « + », « Nouveau message » (recherche de personnes).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, banc, GENS, serveur }) => {
  const out = {};
  await page.evaluate(() => goTo("messages"));
  await jeu.attendreListe(page, 3);
  await page.waitForTimeout(500);
  out.geometrie = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, fs: cs.fontSize, fw: cs.fontWeight, col: cs.color, bg: cs.backgroundColor }; };
    return {
      titre: r(".v6a-title"), plus: r(".v6a-plus"), champ: r("#convGlobalSearch"), archRow: r("#archivedToggleRow"), filtres: r("#msgFilterRow"), lus: r("#msgReadFilterRow"),
      liste: r("#messageList"), carte1: r("#messageList .msg-card"), badge: r(".msg-badge"), avatar: r(".msg-avatar"), nom: r(".msg-name"), heure: r(".msg-time"), apercu: r(".msg-preview"), apercuNonLu: r(".msg-preview.unread-preview"),
      navBadge: r(".nav-msg-badge"), nomLu: (function () { const c = [...document.querySelectorAll(".msg-card:not(.unread) .msg-name")][0]; return c ? getComputedStyle(c).fontWeight : null; })(),
      ariaNav: [...document.querySelectorAll('#appNavV2 [data-v2-key="messages"], #appNav [data-screen="messages"]')].map((e) => e.getAttribute("aria-label")),
      ariaCarte1: (document.querySelector("#messageList .msg-card") || {}).getAttribute ? document.querySelector("#messageList .msg-card").getAttribute("aria-label") : null,
    };
  });
  // Menu « + » par un vrai toucher
  await page.locator(".v6a-plus").tap();
  await page.waitForTimeout(250);
  await photo("menu-plus");
  out.menu = await page.evaluate(() => { const m = document.getElementById("v6aMenu"); if (!m) return null; const b = m.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, items: [...m.querySelectorAll("button")].map((i) => ({ t: i.textContent, h: i.getBoundingClientRect().height, fs: getComputedStyle(i).fontSize })) }; });
  await page.locator("#v6aMenu .v6a-menu-item").first().tap();
  await page.waitForTimeout(500);
  await photo("nouveau-message-ouvert");
  out.modale = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    const inp = document.getElementById("_nmSearch");
    const lignes = [...document.querySelectorAll("#_nmResults ._nm-row")].map((l) => ({ nom: l.getAttribute("data-name"), uid: l.getAttribute("data-uid"), h: Math.round(l.getBoundingClientRect().height) }));
    const close = c.querySelector(".modal-close");
    return {
      focus: document.activeElement === inp, fsChamp: getComputedStyle(inp).fontSize, placeholder: inp.placeholder, type: inp.type, inputmode: inp.getAttribute("inputmode"), enterkeyhint: inp.getAttribute("enterkeyhint"), ariaLabel: inp.getAttribute("aria-label"),
      lignes, role: c.getAttribute("role"), ariaModal: c.getAttribute("aria-modal"), ariaLabelModale: c.getAttribute("aria-label") || c.getAttribute("aria-labelledby"),
      close: close ? { w: close.getBoundingClientRect().width, h: close.getBoundingClientRect().height, tag: close.tagName, role: close.getAttribute("role") } : null,
      hautModale: Math.round(c.getBoundingClientRect().top), basModale: Math.round(c.getBoundingClientRect().bottom), vh: innerHeight,
    };
  });
  // Recherche : une personne connue du serveur
  await page.locator("#_nmSearch").fill("tom");
  await page.waitForTimeout(900);
  await photo("recherche-tom");
  out.rechercheTom = await page.evaluate(() => [...document.querySelectorAll("#_nmResults ._nm-row")].map((l) => l.getAttribute("data-name") + "|" + l.getAttribute("data-uid")));
  // Recherche : compte privé
  await page.locator("#_nmSearch").fill("sacha");
  await page.waitForTimeout(900);
  out.recherchePrive = await page.evaluate(() => [...document.querySelectorAll("#_nmResults ._nm-row")].map((l) => l.getAttribute("data-name") + "|" + l.getAttribute("data-uid")));
  await photo("recherche-prive");
  // Recherche : introuvable
  await page.locator("#_nmSearch").fill("zzzz");
  await page.waitForTimeout(900);
  await photo("recherche-introuvable");
  out.introuvable = await page.evaluate(() => document.getElementById("_nmResults").innerText);
  // Recherche par bio (« luthière ») : supaSearchUsers cherche aussi dans la bio
  await page.locator("#_nmSearch").fill("argentique");
  await page.waitForTimeout(900);
  out.rechercheBio = await page.evaluate(() => document.getElementById("_nmResults").innerText);
  await photo("recherche-bio");
  // Clavier simulé sur la recherche vide
  await page.locator("#_nmSearch").fill("");
  await page.waitForTimeout(300);
  const rendre = await banc.simulerClavier(page, 300);
  await photo("clavier");
  out.clavier = await page.evaluate(() => { const c = document.getElementById("modalContent").getBoundingClientRect(); const i = document.getElementById("_nmSearch").getBoundingClientRect(); return { modaleTop: c.top, modaleBas: c.bottom, champTop: i.top, champBas: i.bottom, vh: innerHeight }; });
  await rendre();
  // Choisir une personne jamais contactée (Inès a déjà un fil ; on prend « Tom »…) → on choisit une personne sans fil : Isaline (pas en base) → on cherche « Hugo » absent ; on prend donc le compte privé.
  await page.locator("#_nmSearch").fill("sacha");
  await page.waitForTimeout(900);
  await page.locator("#_nmResults ._nm-row").first().tap();
  await page.waitForTimeout(1500);
  await photo("apres-choix");
  out.apresChoix = await page.evaluate(() => ({ conv: document.getElementById("conv-fullpage").classList.contains("active"), convId: document.getElementById("conv-fullpage").getAttribute("data-conv-id"), nom: (document.querySelector(".conv-fp-name") || {}).textContent, toasts: (window.__toasts || []).map((t) => t.msg) }));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
