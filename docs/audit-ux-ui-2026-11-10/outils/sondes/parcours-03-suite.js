// Parcours cœur, repérage de la suite : (a) la porte « Voir l'activité » finit-elle par
// paraître sans geste (jusqu'à 75 s) ? (b) profil → Suivre → Message → envoi → retour.
const jeu = require("../jeu/parcours");
const porte = () => {
  const carte = Array.from(document.querySelectorAll("#feedList .post-card, #feedList article, #feedList > div")).find((c) => /Bœuf acoustique/.test(c.textContent || ""));
  return carte ? Array.from(carte.querySelectorAll("button, a, [onclick], [role='button']")).map((b) => (b.innerText || "").replace(/\s+/g, " ").trim()).filter((t) => /activit/i.test(t)) : null;
};
const decrire = () => {
  const vus = (sel, racine) => Array.from((racine || document).querySelectorAll(sel)).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; });
  const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || e.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 46);
  const mb = document.getElementById("modalBackdrop");
  const modaleOuverte = mb && getComputedStyle(mb).display !== "none" && mb.getBoundingClientRect().height > 0;
  const conv = document.querySelector("#conv-fullpage.active");
  const racine = conv || (modaleOuverte ? document.getElementById("modalContent") : document.querySelector(".screen.active"));
  return {
    ou: conv ? "conversation" : (modaleOuverte ? "modale" : (document.querySelector(".screen.active") || {}).id),
    hash: location.hash,
    commandes: vus("button, [role='button'], a[href], [onclick], input, textarea", racine).slice(0, 30).map((e) => nom(e) + " <" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/)[0] : "") + ">"),
    toasts: (window.__toasts || []).slice(-3).map((t) => t.msg),
  };
};
module.exports = async ({ page, photo, serveur }) => {
  const out = { porteDansLeTemps: {} };
  for (const s of [5, 20, 40, 60, 75]) {
    await page.waitForTimeout((s - (out._dernier || 0)) * 1000); out._dernier = s;
    out.porteDansLeTemps[s + " s"] = await page.evaluate(porte);
  }
  delete out._dernier;
  // (b) profil de l'auteur
  await page.locator("#feedList .post-author").first().click();
  await page.waitForTimeout(1400);
  // Suivre
  const suivre = page.locator("#modalContent button", { hasText: /^Suivre$/ }).first();
  await suivre.click(); await page.waitForTimeout(1200);
  out.apresSuivre = await page.evaluate(decrire);
  out.followsEnBase = serveur.t.follows.filter((f) => /a001$/.test(f.follower_id) && /e005$/.test(f.following_id)).map((f) => f.status);
  await photo("3-suivi");
  // Message
  await page.locator("#modalContent button", { hasText: /^Message$/ }).first().click();
  await page.waitForTimeout(1800);
  out.apresMessage = await page.evaluate(decrire);
  await photo("4-conversation");
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
