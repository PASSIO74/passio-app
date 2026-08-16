// ═══════════════════════════════════════════════════════════════════════════
// COUVERTURE FONCTIONNELLE — rapport.
//
// Dénominateur : `couverture-interactions.js` (fonctions atteignables par un
// geste utilisateur). Numérateur : `.passio/couverture/observe.json`, produit
// en faisant tourner la suite derrière `scripts/serve-couverture.js`.
//
//   PASSIO_COUVERTURE=1 npx playwright test      → mesure
//   node scripts/couverture-rapport.js           → rapport
//
// Ce que le chiffre veut dire, exactement : « part des interactions dont la
// fonction s'exécute au moins une fois pendant la suite ». C'est la définition
// la PLUS GÉNÉREUSE possible — un appel interne compte autant qu'un clic. Le
// taux réel de vérification par assertion est nécessairement plus bas. Aucun
// seuil n'est imposé ici : un seuil choisi après coup pour être franchi est un
// chiffre décoratif.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { extraire } = require("./couverture-interactions.js");

const MESURE = path.join(__dirname, "..", ".passio", "couverture", "observe.json");

const r = extraire();
let obs;
try {
  obs = JSON.parse(fs.readFileSync(MESURE, "utf8"));
} catch {
  console.log("Couverture fonctionnelle : NON MESURÉE");
  console.log(`Dénominateur connu : ${r.interactions.length} interactions.`);
  console.log("Lancer : PASSIO_COUVERTURE=1 npx playwright test");
  process.exit(0);
}

const vues = new Set(obs.vues || []);
const couvertes = r.interactions.filter((n) => vues.has(n));
const nues = r.interactions.filter((n) => !vues.has(n));

// Le dénominateur a pu bouger depuis la mesure (code modifié). Le taire
// donnerait un taux calculé sur deux bases différentes.
const perimes = [...vues].filter((n) => !r.interactions.includes(n));

console.log("═══ Couverture fonctionnelle ═══");
console.log(`Mesurée le          : ${obs.genere_le || "?"}`);
console.log(`Interactions        : ${r.interactions.length}  (${r.handlers} handlers inline, ${r.fichiers.length} fichiers)`);
console.log(`Exécutées ≥ 1 fois  : ${couvertes.length}`);
console.log(`Taux                : ${(100 * couvertes.length / r.interactions.length).toFixed(1)} %`);
if (perimes.length) console.log(`⚠ ${perimes.length} nom(s) mesuré(s) absent(s) du code actuel : mesure à refaire.`);
if (obs.total && obs.total !== r.interactions.length) {
  console.log(`⚠ dénominateur au moment de la mesure : ${obs.total} — aujourd'hui ${r.interactions.length}.`);
}

if (process.argv.includes("--liste")) {
  console.log(`\n─── Non exercées (${nues.length}) ───`);
  for (const n of nues) console.log("  " + n);
}
