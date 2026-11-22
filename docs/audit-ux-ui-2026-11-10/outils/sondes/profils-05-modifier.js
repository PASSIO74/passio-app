// Modale « Modifier le profil » : champs, pseudo vide / réservé / déjà pris, bio longue,
// enregistrement réussi, enregistrement REFUSÉ par le serveur (panne programmée).
const jeu = require("../jeu/profils");
const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
module.exports = async ({ page, photo, serveur }) => {
  const out = {};
  const ouvrir = async () => { await page.locator("#v6bModifier").click(); await page.waitForTimeout(300); await page.locator("#profileDotsMenu >> text=Modifier le profil").click(); await page.waitForTimeout(800); };
  const lire = () => page.evaluate(() => ({ toasts: (window.__toasts || []).map((t) => t.msg).slice(-3), nom: (document.getElementById("mainProfileUsername") || {}).textContent, modale: !!document.querySelector("#modalBackdrop.active"), serveur: null }));
  try {
    await page.evaluate(() => goTo("profiles"));
    await jeu.absolutiser(page);
    await page.waitForTimeout(1500);
    await ouvrir();
    out.champs = await page.evaluate(() => Array.from(document.querySelectorAll("#modalContent input, #modalContent textarea, #modalContent button, #modalContent label > span:first-child, #modalContent .field > span")).map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + " «" + (e.getAttribute("placeholder") || e.innerText || "").replace(/\s+/g, " ").slice(0, 40) + "» " + Math.round(r.width) + "×" + Math.round(r.height) + " fs=" + cs.fontSize + " type=" + (e.type || ""); }));
    out.hauteurModale = await page.evaluate(() => { const m = document.querySelector("#modalContent"); return m ? m.scrollHeight : 0; });
    await photo("1-modale");
    await page.evaluate(() => { const m = document.querySelector(".modal"); if (m) m.scrollTop = 2000; });
    await page.waitForTimeout(300);
    await photo("2-modale-bas");
    // pseudo vide
    await page.locator("#editUsername").fill("");
    await page.locator("#modalContent button:has-text('Sauvegarder')").click();
    await page.waitForTimeout(1500);
    out.pseudoVide = await lire();
    out.pseudoVideServeur = (serveur.prof("a0d17000-0000-4000-8000-00000000a001") || {}).username;
    await photo("3-apres-pseudo-vide");
    // pseudo déjà pris
    await page.evaluate(() => closeModal()); await page.waitForTimeout(300);
    await ouvrir();
    await page.locator("#editUsername").fill("Léa Fontaine");
    await page.locator("#modalContent button:has-text('Sauvegarder')").click();
    await page.waitForTimeout(1500);
    out.pseudoPris = await lire();
    await photo("4-pseudo-pris");
    // pseudo réservé
    await page.locator("#editUsername").fill("Admin");
    await page.locator("#modalContent button:has-text('Sauvegarder')").click();
    await page.waitForTimeout(1500);
    out.pseudoReserve = await lire();
    out.pseudoReserveServeur = (serveur.prof("a0d17000-0000-4000-8000-00000000a001") || {}).username;
    // panne serveur : l'écriture du profil est refusée
    await page.evaluate(() => closeModal()); await page.waitForTimeout(300);
    await ouvrir();
    await page.locator("#editUsername").fill("Camille A.");
    await page.locator("#editIsPrivate").check();
    serveur.pannes.push({ table: "profiles", methode: "PATCH", status: 500, body: { message: "panne simulée" } });
    await page.locator("#modalContent button:has-text('Sauvegarder')").click();
    await page.waitForTimeout(2000);
    out.panne = await lire();
    out.panneServeur = { username: (serveur.prof("a0d17000-0000-4000-8000-00000000a001") || {}).username, is_private: (serveur.prof("a0d17000-0000-4000-8000-00000000a001") || {}).is_private };
    out.panneLocal = await page.evaluate(() => ({ isPrivate: state.user.general.isPrivate, username: state.user.general.username }));
    await photo("5-apres-panne");
    out.journalProfiles = serveur.journal.filter((j) => j.table === "profiles" && j.m !== "GET").map((j) => j.m + " " + JSON.stringify(j.body || "").slice(0, 120) + " → " + (j.reponse || j.status || ""));
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(M, { passions: 3 }), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
