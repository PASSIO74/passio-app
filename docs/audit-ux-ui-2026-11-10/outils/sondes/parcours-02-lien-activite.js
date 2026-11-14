// La publication reliée à une activité (posts.event_id) montre-t-elle sa porte « Voir l'activité » ?
// On regarde l'état à plusieurs instants après le démarrage, sans rien forcer, puis après un repeint.
const jeu = require("../jeu/parcours");
const lire = () => {
  const carte = document.querySelector('#feedList [data-post-id="pa_tom_boeuf"]') || Array.from(document.querySelectorAll("#feedList .post-card, #feedList article, #feedList > div")).find((c) => /Bœuf acoustique/.test(c.textContent || ""));
  const ev = (state.seed.events || []).find((e) => e && e.id === "ev_parcours_boeuf");
  const post = (typeof findPostAnywhere === "function") ? findPostAnywhere("pa_tom_boeuf") : null;
  return {
    evenementCharge: !!ev, nbEvenements: (state.seed.events || []).length,
    postEventId: post ? (post.eventId || post.event_id || null) : "post introuvable",
    carteTrouvee: !!carte,
    porte: carte ? Array.from(carte.querySelectorAll("button, a, [onclick], [role='button']")).map((b) => (b.innerText || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).filter((t) => /activit|Voir|Trouver|Rejoindre|viens/i.test(t)) : null,
  };
};
module.exports = async ({ page, serveur }) => {
  const out = {};
  out.t0 = await page.evaluate(lire);
  await page.waitForTimeout(3000);
  out.t3s = await page.evaluate(lire);
  await page.waitForTimeout(6000);
  out.t9s = await page.evaluate(lire);
  out.requetesEvents = serveur.requetes((r) => r.table === "events").map((r) => r.m + " " + r.url.slice(0, 140));
  // Aller sur Rencontrer puis revenir : geste réel d'un utilisateur.
  await page.evaluate(() => goTo("irl")); await page.waitForTimeout(1500);
  out.irl = await page.evaluate(() => ({ cartes: Array.from(document.querySelectorAll("#eventList .event-card")).slice(0, 4).map((c) => (c.innerText || "").replace(/\s+/g, " ").slice(0, 90)) }));
  await page.evaluate(() => goTo("feed")); await page.waitForTimeout(1500);
  out.apresAllerRetour = await page.evaluate(lire);
  await page.evaluate(() => { if (typeof renderFeed === "function") renderFeed(); }); await page.waitForTimeout(800);
  out.apresRepeintForce = await page.evaluate(lire);
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
