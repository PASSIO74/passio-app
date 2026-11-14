// Sonde irl-decouvrir 05 — position accordée (Lyon, émulée) : la demande part-elle à l'ouverture ?
const jeu = require("../jeu/irl-decouvrir");
module.exports = async ({ page }) => {
  const R = {};
  await page.evaluate(() => {
    window.__geo = 0; const g = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function (a, b, c) { window.__geo++; return g(a, b, c); };
  });
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(6000);
  R.apresOuverture = await page.evaluate(() => ({ appels: window.__geo, loc: irlUserLocation, actif: document.getElementById("screen-irl").classList.contains("active"), ou: [...document.querySelectorAll("#eventList .v4a2-ou")].slice(0, 3).map((e) => e.textContent) }));
  R.direct = await page.evaluate(() => new Promise((ok) => navigator.geolocation.getCurrentPosition((p) => ok([p.coords.latitude, p.coords.longitude]), (e) => ok("erreur " + e.code), { timeout: 4000 })));
  // « Utiliser ma position » du sélecteur de ville
  await page.evaluate(() => { if (typeof useMyPositionForIrl === "function") useMyPositionForIrl(); });
  await page.waitForTimeout(4000);
  R.apresBouton = await page.evaluate(() => ({ appels: window.__geo, loc: irlUserLocation, ou: [...document.querySelectorAll("#eventList .v4a2-ou")].slice(0, 3).map((e) => e.textContent), lieu: typeof _irlReferenceLabel === "function" ? _irlReferenceLabel() : null }));
  return R;
};
module.exports.demarrage = { mode: "compte", stockage: { passio_first_run_experience_v1: "1" }, contexte: { permissions: ["geolocation"], geolocation: { latitude: 45.7485, longitude: 4.8467 } }, peupler: (srv, ctx) => jeu.peupler(srv, ctx, { volume: "normal" }) };
