// Profil visité : Léa (public, suivie, me suit) par un vrai geste depuis « Abonnés »,
// puis Tom (me suit, non suivi), Sacha (privé, demande en attente), nom long, Nora (sans publication).
const jeu = require("../jeu/profils");
const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
const decrire = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 50);
  const menu = document.getElementById("profileDotsMenu");
  const racine = menu || document.querySelector("#modalContent") || document.querySelector(".screen.active");
  return {
    cmds: Array.from(racine.querySelectorAll("button, [role='button'], a[href], [onclick], .modal-close")).filter(vis).slice(0, 30).map((e) => { const r = e.getBoundingClientRect(); return nom(e) + " <" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "> " + Math.round(r.width) + "×" + Math.round(r.height) + " @" + Math.round(r.x) + "," + Math.round(r.y); }),
    texte: (racine.innerText || "").slice(0, 700),
  };
};
module.exports = async ({ page, photo, GENS }) => {
  const out = {};
  try {
    await page.evaluate(() => goTo("profiles"));
    await jeu.absolutiser(page);
    await page.waitForTimeout(2000);
    await page.locator(".main-profile-stat:visible").first().click();
    await page.waitForTimeout(1200);
    await page.locator("#peopleListBody >> text=Léa Fontaine").click();
    await page.waitForTimeout(2500);
    out.lea = await page.evaluate(decrire);
    await photo("1-lea");
    await page.locator("#modalContent .profile-dots-btn").click();
    await page.waitForTimeout(500);
    out.leaMenu = await page.evaluate(decrire);
    await photo("2-lea-menu");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // défiler la modale
    await page.evaluate(() => { const m = document.querySelector(".modal"); if (m) m.scrollTop = 600; });
    await page.waitForTimeout(400);
    await photo("3-lea-bas");
    // Retour : où suis-je ?
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(600);
    out.apresFermeture = await page.evaluate(() => ({ ecran: (document.querySelector(".screen.active") || {}).id, modale: !!document.querySelector("#modalBackdrop.active") }));
    for (const [cle, uid] of [["tom", GENS.tom.id], ["prive", GENS.prive.id], ["long", GENS.long.id], ["nora", jeu.NORA.id]]) {
      await page.evaluate((u) => openUserProfile(u), uid);
      await page.waitForTimeout(2200);
      out[cle] = await page.evaluate(decrire);
      await photo("4-" + cle);
      await page.evaluate(() => closeModal());
      await page.waitForTimeout(500);
    }
  } catch (e) { out.erreur = String(e.message).slice(0, 500); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(M, { passions: 3 }), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
