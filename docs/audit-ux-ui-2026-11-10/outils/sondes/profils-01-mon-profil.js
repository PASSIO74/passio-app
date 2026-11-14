// Repérage : mon profil (compte connecté, faux serveur) — structure, commandes, mesures.
const base = require("../jeu/base");
const vus = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const ecran = document.querySelector("#screen-profiles");
  const cmds = Array.from(ecran.querySelectorAll("button, [role='button'], a[href], [onclick], input, [role='tab']")).filter(vis).map((e) => { const r = e.getBoundingClientRect(); return nom(e) + " <" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + "> " + Math.round(r.width) + "×" + Math.round(r.height) + " @" + Math.round(r.y); });
  const blocs = Array.from(ecran.children).filter(vis).map((e) => (e.id || e.className || e.tagName) + " h=" + Math.round(e.getBoundingClientRect().height));
  return { cmds, blocs, texte: ecran.innerText.slice(0, 1500) };
};
module.exports = async ({ page, photo }) => {
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(1500);
  const a = await page.evaluate(vus);
  await photo("1-haut");
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 500; });
  await page.waitForTimeout(500);
  await photo("2-bas");
  return a;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) };
