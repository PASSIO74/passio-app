// Sonde transverse 05 : quel conteneur défile sur la fiche d'activité, et comment dégager le pied ?
const base = require("../jeu/base");
const jeu = require("../jeu/transverse");
module.exports = async ({ page }) => {
  try {
    await page.waitForTimeout(1500);
    await page.evaluate((id) => openEventDetails(id), jeu.EV_ID);
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      const b = document.querySelector("button[onclick*='reportEvent']");
      const chaine = []; let p = b; while (p && chaine.length < 9) { const cs = getComputedStyle(p); chaine.push({ el: p.tagName + (p.id ? "#" + p.id : "") + "." + String(p.className).split(" ").slice(0, 2).join("."), pos: cs.position, ov: cs.overflowY, h: p.clientHeight, sh: p.scrollHeight, pb: cs.paddingBottom, disp: cs.display }); p = p.parentElement; }
      const cta = document.getElementById("eventDetailCta"); const cc = getComputedStyle(cta); const rc = cta.getBoundingClientRect();
      return { chaine, cta: { pos: cc.position, z: cc.zIndex, top: Math.round(rc.top), h: Math.round(rc.height), parent: cta.parentElement.id || cta.parentElement.className } };
    });
  } catch (e) { return String(e.stack || e).slice(0, 400); }
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.activite(s, c); } };
