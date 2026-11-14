// Recherche — première visite sans compte : la loupe est-elle là ? l'écran, la
// recherche, « Suivre » et « + Créer profil » depuis la fiche d'une passion.
module.exports = async ({ page, photo }) => {
  const out = {};
  const ecran = () => page.evaluate(() => ({ ecran: (document.querySelector(".screen.active") || {}).id, modale: (document.querySelector("#modalBackdrop.active #modalContent") || { innerText: "" }).innerText.replace(/\n+/g, " | ").slice(0, 300), landing: !!document.querySelector("#landing") && getComputedStyle(document.querySelector("#landing")).display !== "none" }));
  try {
    out.depart = await ecran();
    await photo("00-depart");
    out.loupe = await page.evaluate(() => Array.from(document.querySelectorAll(".topbar-right > *")).map((e) => (e.getAttribute("aria-label") || "") + " " + getComputedStyle(e).display));
    await page.evaluate(() => goTo("explore")); await page.waitForTimeout(2000);
    out.explore = await page.evaluate(() => ({ actif: document.querySelector(".screen.active").id, tend: document.getElementById("trendingGrid").innerText.replace(/\n/g, " | "), cpt: document.getElementById("explorePassionsCount").textContent, crea: document.getElementById("suggestedCreators").innerText.replace(/\n/g, " | ").slice(0, 300) }));
    await photo("01-explore");
    const i = page.locator("#explorerSearch"); await i.fill("guitare"); await i.dispatchEvent("input"); await page.waitForTimeout(1500);
    out.resultats = await page.evaluate(() => document.getElementById("exploreSearchResults").innerText.replace(/\n+/g, " | ").slice(0, 400));
    await photo("02-resultats");
    await page.locator("#exploreSearchResults >> text=Guitare électrique").first().click(); await page.waitForTimeout(1500);
    out.fiche = await ecran(); await photo("03-fiche");
    const suivre = page.locator("#pexCreators button").first();
    if (await suivre.count()) { await suivre.click(); await page.waitForTimeout(1200); out.apresSuivre = await ecran(); await photo("04-suivre"); }
    await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
    await page.evaluate(() => openPassionExplorer("musique-guitare-electrique")); await page.waitForTimeout(1200);
    const cp = page.locator("#modalContent button:has-text('Créer profil')").first();
    if (await cp.count()) { await cp.click(); await page.waitForTimeout(1500); out.apresCreerProfil = await ecran(); await photo("05-creer-profil"); }
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "visiteur" };
