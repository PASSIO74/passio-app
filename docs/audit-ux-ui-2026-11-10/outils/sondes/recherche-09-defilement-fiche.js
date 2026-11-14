// Recherche — une fiche défilée, fermée, puis une autre fiche ouverte : où s'ouvre-t-elle ?
const jeu = require("../jeu/recherche");
const banc = require("../banc");
module.exports = async ({ page, photo }) => {
  const out = {};
  const lire = () => page.evaluate(() => { const r = {}; for (const s of ["#modalContent", "#modalBackdrop", ".modal", "#appMain"]) { const e = document.querySelector(s); if (e) r[s] = Math.round(e.scrollTop); } r.titre = (document.querySelector("#modalContent .modal-title") || {}).textContent; const a = document.activeElement; r.focus = a ? a.tagName + "." + a.className + " " + (a.innerText || "").slice(0, 30) : null; return r; });
  try {
    await page.locator(".topbar-right > *").first().click(); await page.waitForTimeout(1800);
    await page.locator("#trendingGrid .trending-tile").first().click(); await page.waitForTimeout(1500);
    await page.evaluate(() => { const m = document.querySelector("#modalContent"); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(400);
    out.defile = await lire();
    await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
    out.ferme = await lire();
    const i = page.locator("#explorerSearch"); await i.click(); await i.fill("escalade"); await i.dispatchEvent("input"); await page.waitForTimeout(1500);
    await page.locator("#exploreSearchResults >> text=Escalade").first().click();
    for (const ms of [100, 600, 1500]) { await page.waitForTimeout(ms); out["ouvre" + ms] = await lire(); }
    await photo("fiche");
    // variante : fermeture par la croix (vrai geste)
    await page.locator("#modalContent .modal-close, #modalBackdrop .modal-close").first().click().catch((e) => { out.croix = String(e.message).slice(0, 100); });
    await page.waitForTimeout(400);
    await page.locator("#trendingGrid .trending-tile").nth(1).click(); await page.waitForTimeout(1500);
    out.tuile = await lire();
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(banc.onboardedState), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
