// Sonde — porte de partage d'une PUBLICATION (carte du fil), mode compte.
// Ce qu'elle établit : où est le bouton, sa taille, ce qui s'ouvre, les deux
// branches de « Partager en dehors » (presse-papiers refusé / accordé / feuille
// native simulée), le double appui sur « Partager dans mon feed ».
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");

module.exports = async ({ page, context, serveur, photo, banc }) => {
  const out = {};
  out.uid = await page.evaluate(() => ({ uid: typeof MY_UID !== "undefined" ? MY_UID : null, reel: !!window._supaReal, share: typeof navigator.share, clip: !!(navigator.clipboard && navigator.clipboard.writeText) }));
  out.posts = await page.evaluate(() => Array.from(document.querySelectorAll("#screen-feed .post[data-postid]")).slice(0, 8).map((p) => p.getAttribute("data-postid")));
  const carte = page.locator('#screen-feed .post[data-postid="pa_lea_1"]').first();
  await carte.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  out.bouton = await carte.locator('.post-action[aria-label="Partager"]').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, html: el.outerHTML.slice(0, 200), role: el.getAttribute("role"), tabindex: el.getAttribute("tabindex"), tag: el.tagName };
  });
  out.actions = await carte.locator(".post-actions > *").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { cls: el.className, label: el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; }));
  await photo("a-carte");
  await carte.locator('.post-action[aria-label="Partager"]').first().click();
  await page.waitForTimeout(500);
  out.feuille = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    const b = document.getElementById("modalBackdrop");
    return {
      ouverte: b.classList.contains("active"), texte: c.innerText, hash: location.hash,
      boutons: Array.from(c.querySelectorAll("button, .modal-close")).map((x) => { const r = x.getBoundingClientRect(); return { t: x.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height), cls: x.className }; }),
      poignee: !!c.querySelector(".modal-handle"), fermer: !!c.querySelector(".modal-close"),
      role: c.getAttribute("role") || b.getAttribute("role"), ariaModal: c.getAttribute("aria-modal") || b.getAttribute("aria-modal"), labelledby: c.getAttribute("aria-labelledby"),
      focus: document.activeElement ? document.activeElement.tagName + "#" + document.activeElement.id : null,
    };
  });
  await photo("b-feuille");

  // « Partager en dehors », presse-papiers REFUSÉ (aucune permission accordée au contexte).
  await page.locator("#_shareOutBtn").click();
  await page.waitForTimeout(700);
  out.dehorsRefuse = await page.evaluate(() => ({ toasts: (window.__toasts || []).slice(-3), modaleEncoreOuverte: document.getElementById("modalBackdrop").classList.contains("active"), toastDom: Array.from(document.querySelectorAll("#toastStack .toast")).map((t) => { const r = t.getBoundingClientRect(); return { txt: t.innerText, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; }) }));
  await photo("c-dehors-refuse");

  // Presse-papiers ACCORDÉ.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.waitForTimeout(3600);
  await page.locator("#_shareOutBtn").click();
  await page.waitForTimeout(700);
  out.dehorsCopie = await page.evaluate(async () => ({ toasts: (window.__toasts || []).slice(-2), presse: await navigator.clipboard.readText().catch((e) => "ERR " + e.message), modaleEncoreOuverte: document.getElementById("modalBackdrop").classList.contains("active") }));
  await photo("d-dehors-copie");

  // Feuille native SIMULÉE (navigator.share présent) : ce qui serait transmis.
  await page.evaluate(() => { window.__partages = []; navigator.share = (d) => { window.__partages.push(d); return Promise.resolve(); }; });
  await page.locator("#_shareOutBtn").click();
  await page.waitForTimeout(400);
  out.natif = await page.evaluate(() => ({ partages: window.__partages, toasts: (window.__toasts || []).slice(-1), modaleEncoreOuverte: document.getElementById("modalBackdrop").classList.contains("active") }));
  // Annulation de la feuille native (AbortError) puis refus (NotAllowedError).
  await page.evaluate(() => { navigator.share = () => Promise.reject(Object.assign(new Error("Share canceled"), { name: "AbortError" })); window.__toasts.length = 0; });
  await page.locator("#_shareOutBtn").click();
  await page.waitForTimeout(400);
  out.natifAnnule = await page.evaluate(() => ({ toasts: window.__toasts.slice(), modaleEncoreOuverte: document.getElementById("modalBackdrop").classList.contains("active") }));
  await page.evaluate(() => { navigator.share = () => Promise.reject(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })); window.__toasts.length = 0; });
  await page.locator("#_shareOutBtn").click();
  await page.waitForTimeout(600);
  out.natifRefuse = await page.evaluate(() => ({ toasts: window.__toasts.slice() }));

  // Fermeture : fond, Échap, retour arrière.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  out.echap = await page.evaluate(() => ({ ouverte: document.getElementById("modalBackdrop").classList.contains("active"), hash: location.hash }));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
