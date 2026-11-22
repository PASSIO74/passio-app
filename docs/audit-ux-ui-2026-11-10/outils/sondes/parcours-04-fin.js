// Parcours cœur, repérage de la fin : envoyer un message → retour → fil → « Voir l'activité »
// → fiche → s'inscrire → ce qui est proposé ensuite.
const jeu = require("../jeu/parcours");
const decrire = () => {
  const vus = (sel, racine) => Array.from((racine || document).querySelectorAll(sel)).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; });
  const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || e.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 52);
  const mb = document.getElementById("modalBackdrop");
  const modaleOuverte = mb && getComputedStyle(mb).display !== "none" && mb.getBoundingClientRect().height > 0;
  const conv = document.querySelector("#conv-fullpage.active");
  const feuille = Array.from(document.querySelectorAll("[class*='sheet'], [class*='rsvp']")).find((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.height > 80 && c.display !== "none" && c.visibility !== "hidden" && (c.position === "fixed" || c.position === "absolute") && r.top < innerHeight; });
  const racine = conv || (modaleOuverte ? document.getElementById("modalContent") : document.querySelector(".screen.active"));
  return {
    ou: conv ? "conversation" : (modaleOuverte ? "modale" : (document.querySelector(".screen.active") || {}).id), hash: location.hash,
    defilementFil: (document.getElementById("appMain") || {}).scrollTop,
    feuille: feuille ? (feuille.id || feuille.className) + " :: " + (feuille.innerText || "").replace(/\s+/g, " ").slice(0, 220) : null,
    commandes: vus("button, [role='button'], a[href], [onclick], input, textarea", racine).slice(0, 34).map((e) => nom(e) + " <" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/)[0] : "") + ">"),
    toasts: (window.__toasts || []).slice(-4).map((t) => t.msg),
  };
};
module.exports = async ({ page, photo, serveur }) => {
  const out = {};
  await page.waitForTimeout(1500);
  await page.locator("#feedList .post-author").first().click(); await page.waitForTimeout(1200);
  await page.locator("#modalContent button", { hasText: /^Message$/ }).first().click(); await page.waitForTimeout(1600);
  await page.locator("#convFpInput").fill("Salut Tom ! Je viendrais bien samedi, il reste de la place ?");
  await page.locator("#convFpSendBtn").click(); await page.waitForTimeout(1800);
  out.apresEnvoi = await page.evaluate(decrire);
  out.messagesEnBase = serveur.t.conv_messages.length;
  await photo("5-message-envoye");
  await page.locator(".conv-fp-back").first().click(); await page.waitForTimeout(1200);
  out.apresRetour = await page.evaluate(decrire);
  await photo("6-apres-retour");
  // Retour au fil par la barre basse (geste réel).
  await page.getByRole("button", { name: /Découvrir/ }).first().click().catch(async () => { await page.evaluate(() => goTo("feed")); });
  await page.waitForTimeout(1500);
  out.retourFil = await page.evaluate(decrire);
  const porte = page.locator("#feedList").getByText("Voir l'activité").first();
  out.porteVisible = await porte.count();
  if (out.porteVisible) {
    await porte.click(); await page.waitForTimeout(1800);
    out.fiche = await page.evaluate(decrire);
    await photo("7-fiche");
    const viens = page.locator("#modalContent button, #modalContent [role='button'], #eventDetailCta button, .v4b-cta button").filter({ hasText: /Je viens|Participer|Rejoindre|inscri/i }).first();
    out.boutonInscription = await viens.count();
    if (out.boutonInscription) {
      await viens.click(); await page.waitForTimeout(1800);
      out.apresInscription = await page.evaluate(decrire);
      out.inscritsEnBase = serveur.t.event_attendees.filter((a) => a.event_id === "ev_parcours_boeuf").map((a) => a.user_id.slice(-4) + ":" + a.rsvp);
      await photo("8-inscription");
    }
  }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
