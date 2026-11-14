// Sonde transverse 06 : la modale commune (focus, Échap, nom accessible) et le panneau
// Paramètres (fermeture au dehors, Échap, retour système).
const base = require("../jeu/base");
module.exports = async ({ page }) => {
  const out = {};
  try {
    await page.waitForTimeout(1500);
    // Modale : focus à l'ouverture, parcours au clavier, nom accessible
    await page.locator(".topbar-bell[onclick*='openNotifications']").first().click();
    await page.waitForTimeout(800);
    out.modaleOuverture = await page.evaluate(() => { const m = document.getElementById("modalContent"); const a = document.activeElement; return { focusDansModale: m.contains(a), focus: a && (a.id || a.tagName + "." + a.className), ariaLabelledby: m.getAttribute("aria-labelledby"), ariaLabel: m.getAttribute("aria-label"), role: m.getAttribute("role") }; });
    const sorties = [];
    for (let i = 0; i < 25; i++) { await page.keyboard.press("Tab"); sorties.push(await page.evaluate(() => document.getElementById("modalContent").contains(document.activeElement))); }
    out.tabulationsHorsModale = sorties.filter((x) => !x).length + " / 25";
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    out.echapFermeModale = await page.evaluate(() => !document.getElementById("modalBackdrop").classList.contains("active"));
    out.focusApresFermeture = await page.evaluate(() => { const a = document.activeElement; return a && (a.id || a.className || a.tagName); });
    // Panneau Paramètres
    await page.locator(".hamburger[onclick*='toggleDevPanel']").first().click(); await page.waitForTimeout(400);
    out.panneauFocus = await page.evaluate(() => { const a = document.activeElement; return { dansPanneau: document.getElementById("devPanel").contains(a), expanded: document.querySelector(".hamburger[onclick*='toggleDevPanel']").getAttribute("aria-expanded") }; });
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    out.echapFermePanneau = await page.evaluate(() => !document.getElementById("devPanel").classList.contains("active"));
    if (!out.echapFermePanneau) { await page.mouse.click(60, 600); await page.waitForTimeout(300); out.toucherDehorsFerme = await page.evaluate(() => !document.getElementById("devPanel").classList.contains("active")); }
    if (out.toucherDehorsFerme === false) {
      await page.goBack().catch(() => {}); await page.waitForTimeout(600);
      out.retourFerme = await page.evaluate(() => !document.getElementById("devPanel").classList.contains("active"));
      out.ecranApresRetour = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
    }
    out.sectionsAria = await page.evaluate(() => Array.from(document.querySelectorAll("#devPanel .settings-section")).map((s) => ({ role: s.getAttribute("role"), tab: s.getAttribute("tabindex"), expanded: s.getAttribute("aria-expanded") })).slice(0, 2));
  } catch (e) { out.erreur = String(e.stack || e).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => base.peupler(s, c) };
