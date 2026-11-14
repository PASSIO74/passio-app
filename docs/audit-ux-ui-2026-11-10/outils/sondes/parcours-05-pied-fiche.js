// Structure du pied de la fiche d'activité après inscription (pour poser la maquette au bon endroit).
const jeu = require("../jeu/parcours");
module.exports = async ({ page }) => {
  await page.waitForTimeout(1500);
  await page.evaluate(() => openEventDetails("ev_parcours_boeuf"));
  await page.waitForTimeout(1500);
  await page.getByText("Je participe", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const lien = Array.from(document.querySelectorAll("*")).find((e) => /Retirer ma participation/.test(e.textContent || "") && !Array.from(e.children).some((c) => /Retirer ma participation/.test(c.textContent || "")));
    if (!lien) return "lien introuvable";
    const chaine = [];
    for (let n = lien; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); chaine.push(n.tagName + (n.id ? "#" + n.id : "") + "." + String(n.className).split(" ").slice(0, 2).join(".") + " [" + cs.position + " " + cs.display + "]"); }
    return chaine;
  });
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
