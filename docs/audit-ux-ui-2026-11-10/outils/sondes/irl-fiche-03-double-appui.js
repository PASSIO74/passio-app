// Sonde irl-fiche 03 : deux appuis rapprochés au même endroit sur « Je participe ».
// Le lien « Retirer ma participation » prend-il la place du bouton ? État serveur vs écran.
const jeu = require("../jeu/irl-fiche");
module.exports = async ({ page, serveur, photo, MOI }) => {
  await page.waitForTimeout(2500);
  await page.evaluate(() => openEventDetails("ev_if_payante"));
  await page.waitForTimeout(1400);
  const b = await page.locator("[data-v4b-rsvp-go]").boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(350);
  const sousLeDoigt = await page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return e ? (e.className + " | " + (e.textContent || "").trim().slice(0, 40)) : null; }, [x, y]);
  await photo("apres-premier-appui");
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(3000);
  const ecran = await page.evaluate(() => ({ cta: document.getElementById("eventDetailCta").innerText, toasts: (window.__toasts || []).map((t) => t.msg) }));
  const serveurApres = serveur.t.event_attendees.filter((a) => a.event_id === "ev_if_payante" && a.user_id === MOI.id).map((a) => a.rsvp);
  const req = (serveur.journal || []).filter ? (serveur.journal || []).filter((j) => j.table === "event_attendees" && j.m !== "GET").map((j) => j.m + " " + j.url.slice(0, 80)) : null;
  return { bouton: { x: Math.round(x), y: Math.round(y), h: Math.round(b.height) }, sousLeDoigt, ecran, serveurApres, req };
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };
