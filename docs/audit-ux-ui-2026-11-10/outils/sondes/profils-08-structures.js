// Structure HTML des surfaces à maquetter (en-tête « Mes passions », modale passion,
// signalement, fenêtre de limite) — pour écrire des sélecteurs de maquette justes.
const jeu = require("../jeu/profils");
const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
const html = (sel) => (page) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.outerHTML.replace(/\s+/g, " ").replace(/<svg.*?<\/svg>/g, "<svg/>").slice(0, 2500) : "absent " + s; }, sel);
module.exports = async ({ page, photo, GENS }) => {
  const out = {};
  try {
    await page.evaluate(() => goTo("profiles"));
    await jeu.absolutiser(page);
    await page.waitForTimeout(1500);
    out.v6b = await html("#v6bModifier")(page);
    out.stats = await html("#mainProfileCard .main-profile-stats")(page);
    await page.evaluate(() => openPassionManager()); await page.waitForTimeout(800);
    out.entete = await page.evaluate(() => { const p = document.getElementById("passionManager"); return p ? Array.from(p.children).slice(0, 4).map((c) => c.outerHTML.replace(/\s+/g, " ").replace(/<svg.*?<\/svg>/g, "<svg/>").slice(0, 900)) : "absent"; });
    out.carte = await html("#passionManager .v8-passion-card")(page);
    await page.evaluate(() => openEditPassionProfile("pp_0")); await page.waitForTimeout(700);
    out.modalePassion = await html("#modalContent")(page);
    await page.evaluate(() => closeModal()); await page.waitForTimeout(300);
    await page.evaluate((u) => openUserProfile(u), GENS.malik.id); await page.waitForTimeout(2000);
    await page.locator("#modalContent .profile-dots-btn").click(); await page.waitForTimeout(300);
    await page.locator("#profileDotsMenu >> text=Signaler").click(); await page.waitForTimeout(900);
    out.signaler = await html("#modalContent")(page);
    await photo("signaler");
    await page.evaluate(() => closeModal()); await page.waitForTimeout(300);
    await page.evaluate(() => goTo("profiles")); await page.waitForTimeout(400);
    out.toastCss = await page.evaluate(() => { const s = Array.from(document.styleSheets).flatMap((x) => { try { return Array.from(x.cssRules); } catch (e) { return []; } }).filter((r) => r.selectorText && /^\.toast(-stack)?$/.test(r.selectorText)).map((r) => r.cssText.slice(0, 300)); return s; });
  } catch (e) { out.erreur = String(e.message).slice(0, 300); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(M, { passions: 3 }), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
