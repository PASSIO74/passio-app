// Recherche — état de l'écran « Rechercher » à l'ouverture (compte, socle commun).
const base = require("../jeu/base");
module.exports = async ({ page, photo }) => {
  const out = {};
  try {
    out.avant = await page.evaluate(() => ({
      pret: window.PassioPassions ? { actif: PassioPassions.actif(), pret: PassioPassions.pret() } : null,
      posts: [].concat(state.userPosts || [], state.supabasePosts || []).map((p) => p.id + ":" + p.passion),
    }));
    out.topbar = await page.evaluate(() => Array.from(document.querySelectorAll(".topbar-right > *")).map((e) => (e.getAttribute("aria-label") || e.title || e.className) + " onclick=" + (e.getAttribute("onclick") || "")));
    await page.locator(".topbar-right > *").first().click().catch((e) => { out.clic = String(e.message).slice(0, 200); });
    await page.waitForTimeout(300);
    out.t300 = await page.evaluate(() => ({ ecran: document.querySelector(".screen.active").id, tend: document.getElementById("trendingGrid").innerText.replace(/\n/g, " | "), cpt: document.getElementById("explorePassionsCount").textContent, pret: PassioPassions.pret() }));
    await photo("t300");
    await page.waitForTimeout(3000);
    out.t3300 = await page.evaluate(() => ({ tend: document.getElementById("trendingGrid").innerText.replace(/\n/g, " | "), cpt: document.getElementById("explorePassionsCount").textContent, pret: PassioPassions.pret(), horsLigne: PassioPassions.horsLigne(), grille: document.getElementById("allPassions").innerText.replace(/\n/g, " | ").slice(0, 700), createurs: document.getElementById("suggestedCreators").innerText.replace(/\n/g, " | ").slice(0, 700) }));
    out.libelles = await page.evaluate(() => { const c = {}; [].concat(state.userPosts || [], state.supabasePosts || []).forEach((p) => { c[p.passion] = passionById(p.passion).label; }); return c; });
    out.hauteurEcran = await page.evaluate(() => document.getElementById("appMain").scrollHeight);
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) };
