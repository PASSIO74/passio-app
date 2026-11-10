#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// L'EMPREINTE QUE LA PAGE DÉCLARE EST CELLE DES OCTETS QUI PARTENT (2026-11-10)
//
//   node scripts/verifier-integrite-app.js [dist]
//
// Depuis le 2026-11-10, chacun des 9 scripts du bloc app porte l'empreinte
// `integrity` (sha384) de ses octets (scripts/build.js, étapes 1 et 1 bis) : un
// script d'une autre version resté en cache après un retour arrière est refusé,
// puis redemandé au réseau. Le revers : une empreinte qui ne correspond pas au
// fichier SERVI, et le navigateur refuse le script — toute la production s'arrête
// sur son premier script, pour tout le monde, sans une erreur côté serveur.
// La feuille de style aussi, le même jour (étapes 2 et 2 bis) : une empreinte fausse
// la ferait refuser à chaque ouverture — sa reprise retomberait sur une feuille SANS
// empreinte, au prix d'une page sans styles le temps de la redemande, et de la
// protection que l'empreinte apporte.
//
// Ce contrôle relit la page TELLE QU'ELLE PARTIRA (le déploiement l'appelle après
// la minification de la page, html-minifier-terser) et les fichiers de dist/app/ et
// dist/styles.css, et refuse au moindre écart : moins de 9 paires (adresse,
// empreinte), une adresse du bloc sans empreinte, un fichier absent ou de trop, une
// empreinte fausse ; pas exactement UN <link> vers `styles.css?v=`, ce <link> sans
// empreinte, une empreinte qui n'est pas celle de dist/styles.css, ou une page qui n'a
// pas la reprise de la feuille AVANT ce <link>.
// Appelé aussi par scripts/servir-dist.js (la passe « Gates artefact » de la CI,
// et `PASSIO_CIBLE=dist` au poste).
// Verrou : tests/unit/integrite-app.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ATTENDUS = 9;
const sri = (octets) => "sha384-" + crypto.createHash("sha384").update(octets).digest("base64");

// Les paires du chargeur, dans l'ordre : `["app/<nom>.js?v=<h>", "sha384-…"]`.
// Guillemets simples ou doubles (le minifieur de la page choisit), espaces facultatifs.
function lirePaires(html) {
  const motif = /\[\s*(["'])(app\/(app-0\d[\w-]*\.js)\?v=[0-9a-f]+)\1\s*,\s*(["'])(sha384-[A-Za-z0-9+/]+={0,2})\4\s*\]/g;
  return [...String(html || "").matchAll(motif)].map((m) => ({ adresse: m[2], nom: m[3], integrite: m[5] }));
}

// Toutes les adresses du bloc que la page cite, comme la barrière des migrations
// les lit (scripts/lib/barriere-migration.js, `urlsBundlesServis`).
function lireAdresses(html) {
  return [...String(html || "").matchAll(/["'](app\/app-0\d[\w-]*\.js\?v=[0-9a-f]+)["']/g)].map((m) => m[1]);
}

// Les <link> vers la feuille de style versionnée, et leur empreinte (null si absente).
// Attributs dans n'importe quel ordre, guillemets doubles, simples ou absents : la page
// est relue après html-minifier-terser.
function lireFeuilles(html) {
  const attribut = (balise, nom) => {
    const m = new RegExp("\\s" + nom + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))", "i").exec(balise);
    return m ? (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]) : null;
  };
  return [...String(html || "").matchAll(/<link\b[^>]*>/gi)]
    .map((m) => ({ adresse: attribut(m[0], "href"), integrite: attribut(m[0], "integrity") }))
    .filter((f) => f.adresse && /^styles\.css\?v=[0-9a-f]+$/.test(f.adresse));
}

function controler(dossier) {
  const problemes = [];
  const page = path.join(dossier, "index.html");
  if (!fs.existsSync(page)) return { paires: [], feuilles: [], problemes: [page + " introuvable"] };
  const html = fs.readFileSync(page, "utf8");
  const paires = lirePaires(html);
  const adresses = lireAdresses(html);
  if (paires.length !== ATTENDUS) problemes.push(`la page déclare ${paires.length} paire(s) (adresse, empreinte), ${ATTENDUS} attendues`);
  const appariees = new Set(paires.map((p) => p.adresse));
  for (const a of adresses) if (!appariees.has(a)) problemes.push(`${a} : cité par la page sans empreinte`);
  const dossierApp = path.join(dossier, "app");
  const fichiers = fs.existsSync(dossierApp) ? fs.readdirSync(dossierApp).filter((f) => f.endsWith(".js")).sort() : [];
  const noms = paires.map((p) => p.nom).sort();
  if (fichiers.join("\n") !== noms.join("\n")) problemes.push(`dist/app/ contient [${fichiers.join(", ")}], la page cite [${noms.join(", ")}]`);
  for (const p of paires) {
    const f = path.join(dossierApp, p.nom);
    if (!fs.existsSync(f)) continue; // déjà dit ci-dessus
    const servie = sri(fs.readFileSync(f));
    if (servie !== p.integrite) problemes.push(`${p.adresse} : la page déclare ${p.integrite}, le fichier servi est ${servie}`);
  }
  // La feuille de style : UN <link>, avec l'empreinte de dist/styles.css.
  const feuilles = lireFeuilles(html);
  if (feuilles.length !== 1) problemes.push(`la page cite ${feuilles.length} feuille(s) de style versionnée(s) (<link href="styles.css?v=…">), 1 attendue`);
  const feuille = path.join(dossier, "styles.css");
  for (const f of feuilles) {
    if (!f.integrite) { problemes.push(`${f.adresse} : citée par la page sans empreinte`); continue; }
    if (!fs.existsSync(feuille)) { problemes.push(`${f.adresse} : ${feuille} introuvable`); continue; }
    const servie = sri(fs.readFileSync(feuille));
    if (servie !== f.integrite) problemes.push(`${f.adresse} : la page déclare ${f.integrite}, le fichier servi est ${servie}`);
  }
  // Et sa reprise, posée AVANT le <link> : sans elle, le moindre refus laisserait la page
  // sans styles. Marqueur : l'expression `^styles\.css\?v=` de la reprise, qui survit à la
  // minification de la page — une écoute de `error` ne suffit pas, telemetry.js et
  // platform.js en posent plus haut dans le <head>.
  if (feuilles.length === 1 && feuilles[0].integrite) {
    const reprise = html.indexOf("^styles\\.css\\?v=");
    const lien = html.search(/<link\b[^>]*\shref\s*=\s*["']?styles\.css\?v=/i);
    if (reprise < 0 || reprise > lien) problemes.push(`${feuilles[0].adresse} : sa reprise (scripts/build.js, étape 2) manque AVANT son <link> — un refus laisserait la page sans styles`);
  }
  return { paires, feuilles, problemes };
}

module.exports = { lirePaires, lireAdresses, lireFeuilles, controler, sri };

if (require.main === module) {
  const dossier = path.resolve(process.argv[2] || "dist");
  const { paires, feuilles, problemes } = controler(dossier);
  if (problemes.length) {
    for (const p of problemes) console.log("::error title=Intégrité des scripts app et de la feuille de style::" + p);
    console.error(`REFUS — ${problemes.length} écart(s) entre l'empreinte que la page déclare et les octets de ${dossier} : le navigateur refuserait ces fichiers.`);
    process.exit(1);
  }
  for (const p of paires) console.log(`  ✓ ${p.adresse}  ${fs.statSync(path.join(dossier, "app", p.nom)).size} octets  ${p.integrite.slice(0, 19)}…`);
  for (const f of feuilles) console.log(`  ✓ ${f.adresse}  ${fs.statSync(path.join(dossier, "styles.css")).size} octets  ${f.integrite.slice(0, 19)}…`);
  console.log(`Intégrité OK — ${paires.length} scripts et ${feuilles.length} feuille de style, chaque empreinte est celle du fichier servi.`);
}
