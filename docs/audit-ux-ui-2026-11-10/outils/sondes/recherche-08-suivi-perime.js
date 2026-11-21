// Recherche — « Créateurs à suivre » ouvert tôt : les boutons disent-ils l'état de
// suivi réel ? Que fait un appui sur « Suivre » affiché pour une personne déjà suivie ?
const jeu = require("../jeu/recherche");
const banc = require("../banc");
module.exports = async ({ page, serveur, photo }) => {
  const out = { t: [] };
  const lire = (lab) => page.evaluate((l) => ({ l, following: (state.user.following || []).length, boutons: Array.from(document.querySelectorAll("#suggestedCreators .list-row")).slice(0, 6).map((r) => r.querySelector(".list-row-title").textContent.slice(0, 12) + "=" + r.querySelector("button").innerText) }), lab);
  try {
    out.boot = await page.evaluate(() => (state.user.following || []).length);
    await page.locator(".topbar-right > *").first().click();
    for (const ms of [300, 1500, 4000, 8000]) { await page.waitForTimeout(ms === 300 ? 300 : ms - 300); out.t.push(await lire(ms)); }
    await photo("01-apres-8s");
    // aller-retour : l'écran repeint-il ?
    await page.evaluate(() => goTo("feed")); await page.waitForTimeout(500);
    await page.evaluate(() => goTo("explore")); await page.waitForTimeout(1500);
    out.apresRetour = await lire("retour");
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(banc.onboardedState), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
