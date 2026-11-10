// Sonde irl-fiche 05 : un toast émis pendant que la fiche est ouverte est-il visible ?
const jeu = require("../jeu/irl-fiche");
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(2500);
  await page.evaluate(() => openEventDetails("ev_if_avenir"));
  await page.waitForTimeout(1200);
  await page.evaluate(() => toast("Message de test du banc"));
  await page.waitForTimeout(400);
  await photo("toast");
  return page.evaluate(() => {
    const t = Array.from(document.querySelectorAll(".toast")).pop();
    if (!t) return "aucun .toast";
    const r = t.getBoundingClientRect();
    const sur = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const z = (el) => { const o = []; while (el && el !== document.body) { const cs = getComputedStyle(el); if (cs.zIndex !== "auto") o.push((el.id || el.className || el.tagName) + ":" + cs.zIndex + ":" + cs.position); el = el.parentElement; } return o; };
    return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], parent: t.parentElement.id || t.parentElement.className, zToast: z(t), sur: sur ? (sur.id || sur.className) : null, zFiche: getComputedStyle(document.getElementById("eventDetailPage")).zIndex, opacite: getComputedStyle(t).opacity };
  });
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };
