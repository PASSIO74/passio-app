// Sur l'écran Messages, le panneau de conversation FERMÉ (#conv-fullpage) est-il posé, invisible,
// au-dessus de la page ? Si oui, intercepte-t-il les touchers (barre basse, liste) ?
const base = require("../jeu/base");
module.exports = async ({ page }) => {
  await page.evaluate(() => goTo("messages"));
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const fp = document.getElementById("conv-fullpage");
    const cs = fp ? getComputedStyle(fp) : null;
    const r = fp ? fp.getBoundingClientRect() : null;
    const points = [];
    for (const [nom, x, y] of [["barre basse · Découvrir", 39, innerHeight - 30], ["barre basse · Profil", innerWidth - 39, innerHeight - 30], ["liste · 1re conversation", innerWidth / 2, 260], ["bas de la liste", innerWidth / 2, innerHeight - 110]]) {
      const el = document.elementFromPoint(x, y);
      points.push({ nom, element: el ? el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + String(el.className).split(" ")[0] : null, dansPanneauFerme: !!(fp && el && fp.contains(el)) });
    }
    return {
      panneau: fp ? { classes: fp.className, opacite: cs.opacity, visibilite: cs.visibility, pointerEvents: cs.pointerEvents, transform: cs.transform, zIndex: cs.zIndex, boite: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } } : null,
      points,
    };
  });
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) };
