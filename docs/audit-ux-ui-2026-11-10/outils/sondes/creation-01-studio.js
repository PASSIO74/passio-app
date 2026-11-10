// Sonde CRÉATION ① — feuille « Créer », Studio, photo ajoutée puis retirée,
// tentative de publication d'un texte seul ensuite.
"use strict";
const path = require("path");
const jeu = require("../jeu/creation");
const MEDIAS = path.join(__dirname, "..", "medias");

module.exports = async ({ page, photo }) => {
  const r = {};
  const boite = async (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const c = getComputedStyle(e); return { w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, x: Math.round(b.x), y: Math.round(b.y), vis: c.display !== "none" && c.visibility !== "hidden" && b.height > 0, txt: (e.innerText || e.value || "").slice(0, 120) }; }, sel);
  await page.locator('#appNavV2 [data-v2-action="create"]').click();
  await page.waitForTimeout(500);
  r.cta = await boite('#appNavV2 [data-v2-action="create"]');
  r.feuille = await page.evaluate(() => Array.from(document.querySelectorAll("#v2SheetList .v2-sheet-item")).map((b) => { const r = b.getBoundingClientRect(); return { cle: b.getAttribute("data-v2-create"), txt: b.innerText.replace(/\n/g, " / "), w: Math.round(r.width), h: Math.round(r.height) }; }));
  r.fermer = await boite(".v2-sheet-close");
  await photo("feuille");
  await page.locator('[data-v2-create="post"]').click();
  await page.waitForTimeout(700);
  await photo("studio");
  r.studio = await page.evaluate(() => {
    const ec = document.getElementById("screen-studio");
    const out = [];
    ec.querySelectorAll("*").forEach((e) => {
      const b = e.getBoundingClientRect(); const c = getComputedStyle(e);
      if (b.height < 1 || c.display === "none" || c.visibility === "hidden") return;
      if (!/^(BUTTON|TEXTAREA|SELECT|INPUT|LABEL|SPAN|DIV)$/.test(e.tagName)) return;
      if (e.tagName === "DIV" && !e.id && !e.className) return;
      out.push({ tag: e.tagName, id: e.id || "", cl: String(e.className || "").slice(0, 40), w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y), fs: c.fontSize, t: (e.children.length ? "" : (e.innerText || e.placeholder || "")).slice(0, 60) });
    });
    return { titre: (ec.querySelector(".section-title") || {}).innerText, elements: out.slice(0, 60), studioType, studioMood, passion: document.getElementById("postPassion").value, options: Array.from(document.getElementById("postPassion").options).map((o) => o.value + ":" + o.textContent) };
  });
  // Photo
  await page.setInputFiles("#photoInput", path.join(MEDIAS, "photo-paysage.jpg"));
  await page.waitForTimeout(900);
  await photo("photo");
  r.apresPhoto = await page.evaluate(() => ({ studioType, aPhoto: !!photoDataUrl, clear: (() => { const e = document.querySelector(".photo-clear"); if (!e) return null; const b = e.getBoundingClientRect(); return { w: b.width, h: b.height, tag: e.tagName, role: e.getAttribute("role"), aria: e.getAttribute("aria-label") }; })(), img: (() => { const e = document.querySelector("#photoPreviewBox img"); if (!e) return null; const b = e.getBoundingClientRect(); return { w: b.width, h: b.height, alt: e.alt }; })() }));
  await page.locator(".photo-clear").click();
  await page.waitForTimeout(300);
  await page.locator("#postText").fill("Petit essai de texte sans photo.");
  await page.evaluate(() => { window.__toasts = []; });
  await page.locator("[data-v6-publier]").click();
  await page.waitForTimeout(700);
  r.apresRetrait = await page.evaluate(() => ({ studioType, toasts: (window.__toasts || []).map((t) => t.msg), ecran: document.querySelector(".screen.active").id, uploadVisible: getComputedStyle(document.getElementById("studioPhoto")).display }));
  await photo("retrait");
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
