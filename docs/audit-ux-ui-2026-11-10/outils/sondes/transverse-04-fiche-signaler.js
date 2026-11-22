// Sonde transverse 04 : où est « Signaler » sur la fiche d'activité ? (visible, masqué, recouvert)
const base = require("../jeu/base");
const jeu = require("../jeu/transverse");
module.exports = async ({ page, photo }) => {
  try {
    await page.waitForTimeout(1500);
    await page.evaluate((id) => openEventDetails(id), jeu.EV_ID);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => Array.from(document.querySelectorAll("button,[role=button],a")).filter((b) => /Signaler/.test(b.textContent)).map((b) => {
      const rr = b.getBoundingClientRect(); const cs = getComputedStyle(b);
      let p = b; const anc = []; while (p && anc.length < 4) { anc.push((p.id ? "#" + p.id : "") + "." + String(p.className || "").split(" ")[0]); p = p.parentElement; }
      return { t: b.textContent.trim(), onclick: (b.getAttribute("onclick") || "").slice(0, 60), vis: !!b.offsetParent, rect: [rr.x, rr.y, rr.width, rr.height].map(Math.round), anc };
    }));
    const sel = await page.evaluate(() => { const b = Array.from(document.querySelectorAll("button")).filter((x) => x.offsetParent && /Signaler/.test(x.textContent)).pop(); if (!b) return null; b.scrollIntoView({ block: "center" }); const rr = b.getBoundingClientRect(); const sur = document.elementFromPoint(rr.x + rr.width / 2, rr.y + rr.height / 2); return { t: b.textContent.trim(), rect: [rr.x, rr.y, rr.width, rr.height].map(Math.round), sur: sur && (sur === b || b.contains(sur)) ? "lui-même" : (sur && (sur.id || sur.className)) }; });
    await photo("signaler");
    // tout en bas de la fiche : le dernier bouton est-il recouvert par le pied collant ?
    const bas = await page.evaluate(() => { const sc = Array.from(document.querySelectorAll("*")).filter((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.offsetParent).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; if (sc) sc.scrollTop = sc.scrollHeight; const b = Array.from(document.querySelectorAll("button")).filter((x) => x.offsetParent && /Signaler/.test(x.textContent)).pop(); if (!b) return null; const rr = b.getBoundingClientRect(); const sur = document.elementFromPoint(rr.x + rr.width / 2, rr.y + rr.height / 2); return { defileur: sc && (sc.id || sc.className), rect: [rr.x, rr.y, rr.width, rr.height].map(Math.round), sur: sur && (sur === b || b.contains(sur)) ? "lui-même" : (sur && (sur.id || String(sur.className).slice(0, 40))) }; });
    await page.waitForTimeout(300);
    await photo("bas");
    return { r, sel, bas };
  } catch (e) { return { erreur: String(e.stack || e).slice(0, 500) }; }
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.activite(s, c); } };
