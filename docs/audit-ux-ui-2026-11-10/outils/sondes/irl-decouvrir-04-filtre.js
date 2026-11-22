// Sonde irl-decouvrir 04 — compte (lot first-run actif comme en prod), vue Filtre : gestes et compteurs.
const jeu = require("../jeu/irl-decouvrir");
module.exports = async (ctx) => { const R0 = {}; try { return await corps(ctx, R0); } catch (e) { R0.erreur = String(e && e.message || e).slice(0, 400); return R0; } };
async function corps({ page, photo }, R) {
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(6000);
  const cartes = await page.evaluate(() => [...document.querySelectorAll("#eventList .event-card")].map((c) => ((c.querySelector(".v4a2") || c).innerText || "").replace(/\s+/g, " ").slice(0, 150)));
  await photo("liste");
  const pied = () => page.evaluate(() => ({ pied: (document.getElementById("v4a5Pied") || {}).innerText, badge: (document.getElementById("irlToolsBadge") || {}).textContent, n: window._irlResultCount, filtres: _irlActiveFilterCount() }));
  R.cartes = cartes;
  await page.locator("#v4a3Vue button", { hasText: "Filtre" }).first().click();
  await page.waitForTimeout(1200);
  R.ouverture = await pied();
  // fin de la vue Filtre
  await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 99999));
  await page.waitForTimeout(500);
  await photo("filtre-bas");
  R.geometrie = await page.evaluate(() => {
    const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { y: Math.round(r.y), h: Math.round(r.height), bas: Math.round(r.bottom) }; };
    return { pied: b("#v4a5Pied"), done: b("#v4a5Done"), reset: b("#v4a5Reset"), raccourcis: b("[data-irlfilter='joined']"), nav: b(".bottom-nav, #bottomNav, nav"), vh: innerHeight,
      resetTxt: (document.getElementById("v4a5Reset") || {}).textContent };
  });
  await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 0));
  // Distance 5 km sans position
  await page.locator("#v4a5Panneau button", { hasText: "5 km" }).first().click();
  await page.waitForTimeout(800);
  R.dist5 = await pied();
  await photo("dist5");
  // Aujourd'hui + Soir
  await page.locator("#v4a5Panneau button", { hasText: "Aujourd'hui" }).first().click();
  await page.locator("#v4a5Panneau button", { hasText: "Soir" }).first().click();
  await page.waitForTimeout(800);
  R.combi = await pied();
  // Afficher N résultats
  await page.locator("#v4a5Done").click();
  await page.waitForTimeout(1000);
  await photo("apres-afficher");
  R.apresAfficher = await page.evaluate(() => ({ vue: document.documentElement.getAttribute("data-v4a5-vue"), liste: [...document.querySelectorAll("#eventList .event-card")].length, vide: (document.querySelector("#eventList .empty") || {}).innerText, tete: (document.getElementById("v4a0Head") || {}).innerText }));
  return R;
}
module.exports.demarrage = { mode: "compte", stockage: { passio_first_run_experience_v1: "1" }, peupler: (srv, ctx) => jeu.peupler(srv, ctx, { volume: "normal" }) };
