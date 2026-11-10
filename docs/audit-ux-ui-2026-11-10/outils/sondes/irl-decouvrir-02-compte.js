// Sonde irl-decouvrir 02 — compte connecté, jeu « normal », position NON accordée.
const jeu = require("../jeu/irl-decouvrir");
module.exports = async ({ page, photo }) => {
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(7000);
  await photo("haut");
  const r = await page.evaluate(() => ({
    toasts: (window.__toasts || []).map((t) => t.msg),
    userLoc: typeof irlUserLocation !== "undefined" ? irlUserLocation : "?",
    err: typeof irlUserLocationError !== "undefined" ? irlUserLocationError : "?",
    seedIds: (state.seed.events || []).map((e) => e.id).slice(0, 60),
    cartes: [...document.querySelectorAll("#eventList .event-card")].map((c) => ((c.querySelector(".v4a2") || c).innerText || "").replace(/\s+/g, " ").slice(0, 170)),
    vide: (document.querySelector("#eventList .empty") || {}).innerText,
  }));
  await page.evaluate(() => document.getElementById("appMain").scrollTo(0, 1400));
  await page.waitForTimeout(600);
  await photo("bas");
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx, { volume: "normal" }) };
