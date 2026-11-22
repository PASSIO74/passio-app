// Sonde irl-fiche 06 : un toast de validation émis sous la modale « Créer une activité » est-il visible ?
const jeu = require("../jeu/irl-fiche");
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: ".toast{animation:none!important}" });
  await page.evaluate(() => openCreateEvent());
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#modalContent .btn.primary")).filter((x) => x.offsetParent && /Publier/.test(x.textContent)).pop(); b.click(); });
  await page.waitForTimeout(700);
  await photo("validation");
  return page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("#toastStack .toast")).pop();
    if (!t) return "aucun toast";
    t.style.pointerEvents = "auto"; document.getElementById("toastStack").style.pointerEvents = "auto";
    const r = t.getBoundingClientRect();
    const sur = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { texte: t.textContent, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], sur: sur ? (sur.id || sur.className || sur.tagName) : null, zModale: getComputedStyle(document.getElementById("modalBackdrop")).zIndex, zPile: getComputedStyle(document.getElementById("toastStack")).zIndex, focus: document.activeElement && document.activeElement.id };
  });
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };
