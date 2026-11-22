// Extrait le HTML RÉEL d'éléments de l'application (pour bâtir un prototype fidèle).
// Usage : PASSIO_EXTRAIRE="sel1||sel2" PASSIO_ECRAN=feed node …/sonde.js …/sondes/_extraire-html.js --mode demo
// Écrit un fichier par sélecteur dans le dossier temporaire des sondes et imprime
// les classes de <html> et de <body> (à recopier sur la page du prototype).
const fs = require("fs");
const os = require("os");
const path = require("path");
module.exports = async ({ page }) => {
  const ecran = process.env.PASSIO_ECRAN || "feed";
  await page.evaluate((e) => goTo(e), ecran);
  await page.waitForTimeout(1200);
  const sels = (process.env.PASSIO_EXTRAIRE || ".app-topbar||.app-nav").split("||");
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes", "html");
  fs.mkdirSync(dossier, { recursive: true });
  const out = { html: await page.evaluate(() => document.documentElement.className), body: await page.evaluate(() => document.body.className), fichiers: [] };
  for (const s of sels) {
    const h = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.outerHTML : null; }, s);
    const f = path.join(dossier, s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") + ".html");
    if (h) { fs.writeFileSync(f, h); out.fichiers.push({ sel: s, fichier: f, octets: h.length }); } else out.fichiers.push({ sel: s, absent: true });
  }
  return out;
};
module.exports.demarrage = { mode: "demo" };
