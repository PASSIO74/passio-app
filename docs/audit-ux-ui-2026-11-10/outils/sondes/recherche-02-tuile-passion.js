// Recherche — d'où vient la tuile « ✨ Passion · 1 post » de la capture SOC-003 ?
// Rejoue le balayage du socle (feed → irl → explore, 1,4 s chacun) et inspecte.
const base = require("../jeu/base");
module.exports = async ({ page, photo }) => {
  const out = {};
  try {
    for (const e of ["feed", "irl", "explore"]) { await page.evaluate((x) => goTo(x), e); await page.waitForTimeout(1400); }
    out.tend = await page.evaluate(() => document.getElementById("trendingGrid").innerText.replace(/\n/g, " | "));
    out.posts = await page.evaluate(() => {
      const c = {}; const vus = {};
      [].concat(state.userPosts || [], state.supabasePosts || []).forEach((p) => {
        if (!p || !p.passion) return; if (p.id != null) { if (vus[p.id]) return; vus[p.id] = 1; }
        c[p.passion] = (c[p.passion] || []); c[p.passion].push(p.id + (p.eventId ? " ev=" + p.eventId : "") + (p.isIrlEvent ? " irl" : ""));
      });
      return Object.keys(c).map((k) => ({ passion: k, libelle: passionById(k).label, posts: c[k] }));
    });
    await photo("tendances");
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) };
