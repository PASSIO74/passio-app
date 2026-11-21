// « Mes passions » : carte, menu « ⋯ », modifier, archiver (confirmation), archives, aide,
// ajouter (sélecteur + recherche), créer une passion personnalisée.
const jeu = require("../jeu/profils");
const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
const decrire = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || e.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 50);
  const menu = document.getElementById("profileDotsMenu");
  const mod = document.querySelector("#modalBackdrop.active #modalContent");
  const racine = menu || mod || document.querySelector(".screen.active");
  return {
    ou: menu ? "menu" : mod ? "modale" : "ecran",
    cmds: Array.from(racine.querySelectorAll("button, [role='button'], a[href], [onclick], input, textarea, .modal-close")).filter(vis).slice(0, 30).map((e) => { const r = e.getBoundingClientRect(); return nom(e) + " <" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "> " + Math.round(r.width) + "×" + Math.round(r.height); }),
    texte: (racine.innerText || "").slice(0, 800),
  };
};
module.exports = async ({ page, photo }) => {
  const out = {};
  const etape = async (nom, fn) => { try { await fn(); out[nom] = await page.evaluate(decrire); await photo(nom); } catch (e) { out[nom] = "ERREUR " + String(e.message).slice(0, 300); } };
  await page.evaluate(() => goTo("profiles"));
  await jeu.absolutiser(page);
  await page.waitForTimeout(1500);
  await etape("1-menu-crayon", async () => { await page.locator("#v6bModifier").click(); await page.waitForTimeout(400); });
  await etape("2-page", async () => { await page.locator("#profileDotsMenu >> text=Gérer mes passions").click(); await page.waitForTimeout(900); });
  await etape("3-aide", async () => { await page.locator("#aidePassionManager").click(); await page.waitForTimeout(700); });
  await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
  await etape("4-menu-carte", async () => { await page.locator("#passionManager .profile-dots-btn").first().click(); await page.waitForTimeout(400); });
  await etape("5-modifier", async () => { await page.locator("#profileDotsMenu >> text=Modifier cette passion").click(); await page.waitForTimeout(800); });
  await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
  await etape("6-archiver-confirm", async () => { await page.locator("#passionManager .profile-dots-btn").nth(2).click(); await page.waitForTimeout(300); await page.locator("#profileDotsMenu >> text=Archiver cette passion").click(); await page.waitForTimeout(700); });
  await etape("7-archivee", async () => { const b = page.locator("#modalContent button:has-text('Archiver')").last(); await b.click(); await page.waitForTimeout(1200); });
  await etape("8-archives-ouvertes", async () => { const t = page.locator("#passionArchiveBox button, #passionArchiveBox [onclick]").first(); await t.click(); await page.waitForTimeout(600); await page.evaluate(() => { document.getElementById("appMain").scrollTop = 400; }); await page.waitForTimeout(300); });
  await etape("9-ajouter", async () => { await page.evaluate(() => { document.getElementById("appMain").scrollTop = 0; }); await page.locator("#nouveauProfilLien").click(); await page.waitForTimeout(1200); });
  await etape("10-recherche", async () => { const i = page.locator("#modalContent input[type='search'], #modalContent input[type='text']").first(); await i.fill("céramique raku"); await page.waitForTimeout(1200); });
  await etape("11-recherche-vide", async () => { const i = page.locator("#modalContent input[type='search'], #modalContent input[type='text']").first(); await i.fill("zzqxw"); await page.waitForTimeout(1200); });
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(M, { passions: 3 }), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
