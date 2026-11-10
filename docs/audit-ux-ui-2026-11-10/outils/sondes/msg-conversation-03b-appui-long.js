// Sonde 03b — que se passe-t-il exactement pendant un appui long sur une bulle ?
// Journal des événements (touchstart, contextmenu, click, ouverture/fermeture de la feuille).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, banc, GENS }) => {
  const out = { essais: [] };
  try {
    await jeu.routes(page);
    await jeu.entrer(page, GENS.lea.nom);
    await page.evaluate(() => {
      window.__j = []; const t0 = performance.now();
      const note = (n, x) => window.__j.push(Math.round(performance.now() - t0) + " " + n + (x ? " " + x : ""));
      ["touchstart", "touchmove", "touchend", "touchcancel", "contextmenu", "click", "pointercancel"].forEach((ev) => document.addEventListener(ev, (e) => note(ev, (e.target.id || e.target.className || e.target.tagName).toString().slice(0, 40)), true));
      const om = window.openModal, cm = window.closeModal;
      window.openModal = function () { note("openModal"); return om.apply(this, arguments); };
      window.closeModal = function () { note("closeModal"); return cm.apply(this, arguments); };
      const bd = document.getElementById("modalBackdrop");
      new MutationObserver(() => note("backdrop.class", bd.className)).observe(bd, { attributes: true, attributeFilter: ["class"] });
    });
    for (const ms of [520, 650, 900, 1400]) {
      await page.evaluate(() => { window.__j.push("—— essai"); });
      await banc.appuiLong(page, jeu.bulle("m_lea_21"), ms);
      await page.waitForTimeout(700);
      const ouvert = await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active"));
      out.essais.push({ dureeAppui: ms, feuilleOuverteApres: ouvert });
      await page.evaluate(() => { try { closeModal(); } catch (e) {} });
      await page.waitForTimeout(500);
    }
    out.journal = await page.evaluate(() => window.__j);
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
