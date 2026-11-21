// Mon profil rempli (3 passions, publications de tous types, couverture, avatar) :
// onglets, filtres, compteurs et leurs listes, menu « ⋯ », crayon.
const jeu = require("../jeu/profils");
const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
const decrire = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 50);
  const modale = document.querySelector("#modalBackdrop.active #modalContent, #modalBackdrop.open #modalContent");
  const menu = document.getElementById("profileDotsMenu");
  const racine = menu || modale || document.querySelector(".screen.active");
  return {
    ou: menu ? "menu" : modale ? "modale" : (document.querySelector(".screen.active") || {}).id,
    cmds: Array.from(racine.querySelectorAll("button, [role='button'], a[href], [onclick], input, textarea, .modal-close")).filter(vis).slice(0, 45).map((e) => { const r = e.getBoundingClientRect(); return nom(e) + " <" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "> " + Math.round(r.width) + "×" + Math.round(r.height); }),
    texte: (racine.innerText || "").slice(0, 900),
  };
};
module.exports = async ({ page, photo }) => {
  const out = {};
  try {
  await page.evaluate(() => goTo("profiles"));
  await jeu.absolutiser(page);
  await page.waitForTimeout(2500);
  out.ecran = await page.evaluate(decrire);
  await photo("1-haut");
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 520; });
  await page.waitForTimeout(500);
  await photo("2-grille");
  // Filtre Photos
  await page.locator("#screen-profiles .profile-tab[data-tab='photos']").click();
  await page.waitForTimeout(400);
  out.nbCartesApresPhotos = await page.evaluate(() => document.querySelectorAll("#myPosts .post-card, #myPosts [data-post-id]").length);
  await page.waitForTimeout(500);
  out.apresPhotos = await page.evaluate(() => Array.from(document.querySelectorAll("#screen-profiles .profile-tab")).map((b) => b.innerText.trim() + ":" + b.getAttribute("aria-pressed")));
  await photo("3-photos");
  await page.locator("#screen-profiles .profile-tab[data-tab='audio']").click();
  await page.waitForTimeout(500);
  await photo("4-photos+audio");
  // remettre
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 0; });
  // compteur abonnés
  await page.locator(".main-profile-stat:visible").first().click();
  await page.waitForTimeout(1200);
  out.abonnes = await page.evaluate(decrire);
  await photo("5-abonnes");
  await page.evaluate(() => closeModal());
  await page.waitForTimeout(400);
  await page.locator(".main-profile-stat:visible").nth(1).click();
  await page.waitForTimeout(1200);
  out.passionsStat = await page.evaluate(decrire);
  await photo("6-passions-stat");
  await page.evaluate(() => { if (typeof closePassionManager === "function" && passionsPageOuverte()) closePassionManager(); closeModal(); goTo("profiles"); });
  await page.waitForTimeout(500);
  await page.locator(".main-profile-stat:visible").nth(2).click();
  await page.waitForTimeout(1000);
  out.abonnements = await page.evaluate(decrire);
  await photo("7-abonnements");
  await page.evaluate(() => closeModal());
  await page.waitForTimeout(400);
  // crayon
  await page.locator("#v6bModifier").click();
  await page.waitForTimeout(800);
  out.crayon = await page.evaluate(decrire);
  await photo("8-crayon");
  } catch (e) { out.erreur = String(e.message).slice(0, 600); }
  console.log(JSON.stringify(out, null, 1));
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(M, { passions: 3, rs: true }), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
