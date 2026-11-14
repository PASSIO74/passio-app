// Recherche — hors ligne AVANT la première ouverture (référentiel jamais chargé) :
// grille, compteur, recherche d'une passion fine et d'une personne, puis reconnexion.
const jeu = require("../jeu/recherche");
const banc = require("../banc");
module.exports = async ({ page, context, photo }) => {
  const out = {};
  const lire = () => page.evaluate(() => ({ pret: PassioPassions.pret(), horsLigne: PassioPassions.horsLigne(), cpt: document.getElementById("explorePassionsCount").textContent, grille: document.getElementById("allPassions").children.length, tend: document.getElementById("trendingGrid").innerText.replace(/\n/g, " | "), res: document.getElementById("exploreSearchResults").innerText.replace(/\n+/g, " | ").slice(0, 300), bandeau: (document.querySelector(".offline-banner, #offlineBanner, [data-offline]") || { innerText: "" }).innerText }));
  try {
    out.avant = await page.evaluate(() => PassioPassions.pret());
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.evaluate(() => goTo("explore")); await page.waitForTimeout(2500);
    out.ouverture = await lire(); await photo("01-ouverture");
    const i = page.locator("#explorerSearch");
    await i.fill("escalade"); await i.dispatchEvent("input"); await page.waitForTimeout(2500);
    out.escalade = await lire(); await photo("02-escalade");
    await i.fill("malik"); await i.dispatchEvent("input"); await page.waitForTimeout(2500);
    out.malik = await lire(); await photo("03-malik");
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(1500);
    await i.fill("escalade"); await i.dispatchEvent("input"); await page.waitForTimeout(2500);
    out.reconnexion = await lire(); await photo("04-reconnexion");
    await page.evaluate(() => goTo("feed")); await page.waitForTimeout(500); await page.evaluate(() => goTo("explore")); await page.waitForTimeout(2500);
    out.reouverture = await lire();
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(banc.onboardedState), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
