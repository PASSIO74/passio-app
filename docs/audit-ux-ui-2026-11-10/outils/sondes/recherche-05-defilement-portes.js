// Recherche — position de défilement d'une fiche à l'autre, « Passions proches »,
// tuile « ✨ Passion » (identifiant inconnu), porte depuis le profil visité
// (« ← Retour au profil »), porte depuis la feuille « Trouver une expérience ».
const jeu = require("../jeu/recherche");
const banc = require("../banc");
module.exports = async ({ page, photo }) => {
  const out = {};
  const pos = () => page.evaluate(() => { const m = document.querySelector("#modalContent"); return { ouvert: !!document.querySelector("#modalBackdrop.active"), scrollTop: m ? Math.round(m.scrollTop) : null, titre: m ? (m.querySelector(".modal-title") || {}).textContent : null, retour: !!(m && m.querySelector(".passion-explorer-retour")) }; });
  try {
    await page.evaluate(() => goTo("explore")); await page.waitForTimeout(1800);
    out.tendances = await page.evaluate(() => document.getElementById("trendingGrid").innerText.replace(/\n/g, " | "));
    await photo("01-tuile-inconnue");
    // fiche Escalade défilée, puis « Passions proches » → Escalade de bloc
    await page.evaluate(() => openPassionExplorer("sport-escalade")); await page.waitForTimeout(1500);
    await page.evaluate(() => { const m = document.querySelector("#modalContent"); const p = m.querySelector("#pexLiees"); m.scrollTop = p.offsetTop - 40; }); await page.waitForTimeout(400);
    out.avantProche = await pos();
    await page.locator("#pexLiees .pill").first().click(); await page.waitForTimeout(1500);
    out.apresProche = await pos();
    await photo("02-apres-passion-proche");
    // fermer puis rouvrir une autre fiche depuis l'écran
    await page.evaluate(() => { document.querySelector("#modalContent").scrollTop = 900; }); await page.waitForTimeout(200);
    await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
    await page.locator("#trendingGrid .trending-tile").nth(1).click(); await page.waitForTimeout(1500);
    out.rouverture = await pos();
    await photo("03-rouverture");
    await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
    // tuile inconnue
    const inc = page.locator("#trendingGrid .trending-tile:has-text('Passion')").first();
    if (await inc.count()) { await inc.click(); await page.waitForTimeout(1500); out.ficheInconnue = await page.evaluate(() => document.querySelector("#modalContent").innerText.replace(/\n+/g, " | ").slice(0, 400)); await photo("04-fiche-inconnue"); await page.evaluate(() => closeModal()); await page.waitForTimeout(400); }
    // depuis un profil visité : pastille de passion → fiche → retour
    await page.evaluate(() => openUserProfile("a0d17000-0000-4000-8000-00000000c003")); await page.waitForTimeout(1800);
    out.profilPastilles = await page.evaluate(() => Array.from(document.querySelectorAll("#modalContent [onclick*='openPassionExplorer']")).map((e) => e.innerText.replace(/\n/g, " ") + " → " + e.getAttribute("onclick").slice(0, 90)));
    const pas = page.locator("#modalContent [onclick*='openPassionExplorer']").first();
    if (await pas.count()) {
      await pas.click(); await page.waitForTimeout(1500); out.depuisProfil = await pos(); await photo("05-depuis-profil");
      await page.locator(".passion-explorer-retour .link").click(); await page.waitForTimeout(1500);
      out.retourProfil = await page.evaluate(() => (document.querySelector("#modalContent").innerText || "").slice(0, 80).replace(/\n/g, " | "));
    }
    await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
    // feuille « Trouver une expérience » depuis le fil
    await page.evaluate(() => goTo("feed")); await page.waitForTimeout(2000);
    const cta = page.locator("[data-v3-tempt]").first();
    out.ctaFil = await cta.count();
    if (out.ctaFil) {
      out.ctaTexte = await cta.innerText();
      await cta.scrollIntoViewIfNeeded(); await cta.click(); await page.waitForTimeout(900);
      out.feuille = await page.evaluate(() => document.getElementById("v3PassioSheet").innerText.replace(/\n+/g, " | "));
      await photo("06-feuille");
      await page.locator("[data-v3-choice='people']").click(); await page.waitForTimeout(1500);
      out.depuisFeuille = await pos();
      await photo("07-fiche-depuis-feuille");
    }
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(banc.onboardedState), peupler: (srv, ctx) => jeu.peupler(srv, ctx, { passionInconnue: true }) };
