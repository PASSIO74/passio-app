// Sonde irl-fiche 07 : extrait le HTML réel de la carte « Rencontrer » du fil et de la fiche
// d'activité (base du prototype « Rejoindre une activité »). Écrit dans le dossier temporaire.
const fs = require("fs"), os = require("os"), path = require("path");
const jeu = require("../jeu/irl-fiche");
module.exports = async ({ page }) => {
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes", "html");
  fs.mkdirSync(dossier, { recursive: true });
  await page.waitForTimeout(2500);
  await page.evaluate(() => goTo("profiles")); await page.waitForTimeout(600);
  await page.evaluate(() => goTo("feed")); await page.waitForTimeout(2200);
  const carte = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("#feedList .v3-tempt")).find((x) => /Voir l'activité/.test(x.textContent));
    const art = t ? t.closest("article, .post, .v3-carte, [data-post-id]") : null;
    return { carte: art ? art.outerHTML : null, porte: t ? t.outerHTML : null };
  });
  fs.writeFileSync(path.join(dossier, "irl-carte-fil.html"), (carte.carte || "") + "\n\n<!-- porte -->\n" + (carte.porte || ""));
  await page.evaluate(() => openEventDetails("ev_if_avenir")); await page.waitForTimeout(1500);
  const fiche = await page.evaluate(() => document.getElementById("eventDetailPage").outerHTML);
  fs.writeFileSync(path.join(dossier, "irl-fiche.html"), fiche);
  return { carte: (carte.carte || "").length, porte: (carte.porte || "").length, fiche: fiche.length, dossier, html: await page.evaluate(() => document.documentElement.className) };
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };
