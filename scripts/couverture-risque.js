// ═══════════════════════════════════════════════════════════════════════════
// COUVERTURE PAR LE RISQUE — « 15,2 % » ne dit pas quoi tester ensuite.
//
// Un taux global met sur le même plan un bouton qui bascule un panneau et une
// fonction qui écrit dans la base de production. Ce script sépare les deux :
// parmi les interactions NON exercées par la suite, lesquelles touchent
// réellement aux données ?
//
// Méthode, et ses limites — annoncées plutôt que découvertes :
//   • on lit le CORPS de chaque fonction d'interaction et on y cherche une
//     écriture directe (`supa.from(...).insert/update/upsert/delete`, appel à
//     un helper `supa*` connu, envoi de fichier au Storage) ;
//   • l'analyse est DIRECTE, pas transitive : une fonction qui délègue l'écriture
//     à une autre n'est pas comptée. Le classement est donc une borne
//     INFÉRIEURE du risque, jamais une liste exhaustive.
//
//   node scripts/couverture-risque.js
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { extraire } = require("./couverture-interactions.js");

const RACINE = path.join(__dirname, "..");
const MESURE = path.join(RACINE, ".passio", "couverture", "observe.json");

// Écriture en base ou dans le Storage, sous les formes réellement employées ici.
const ECRITURE = [
  /supa\s*\.\s*from\([^)]*\)\s*\.\s*(insert|update|upsert|delete)/,
  /supa\s*\.\s*storage\s*\.\s*from\([^)]*\)\s*\.\s*(upload|remove|move|copy)/,
  /\bsupaInsert\w*\s*\(/, /\bsupaUpdate\w*\s*\(/, /\bsupaDelete\w*\s*\(/,
  /\bsupaPublish\w*\s*\(/, /\bsupaSet\w*\s*\(/, /\bsupaSync\w*\s*\(/,
  /\bsupaSend\w*\s*\(/, /\bsupaBlock\w*\s*\(/, /\bsupaToggle\w*\s*\(/,
];
// Suppression : le sous-ensemble où une régression DÉTRUIT au lieu de rater.
const SUPPRESSION = [
  /supa\s*\.\s*from\([^)]*\)\s*\.\s*delete/,
  /supa\s*\.\s*storage\s*\.\s*from\([^)]*\)\s*\.\s*remove/,
  /\bsupaDelete\w*\s*\(/,
];

/** Corps approximatif d'une fonction : de sa déclaration à l'accolade fermante de même niveau. */
function corpsDe(src, nom) {
  const re = new RegExp("^\\s*(?:async\\s+)?function\\s+" + nom.replace(/[$]/g, "\\$") + "\\s*\\(", "m");
  const m = re.exec(src);
  if (!m) return null;
  let i = src.indexOf("{", m.index);
  if (i === -1) return null;
  let profondeur = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "{") profondeur++;
    else if (c === "}") { profondeur--; if (profondeur === 0) return src.slice(i, j + 1); }
  }
  return src.slice(i);
}

const r = extraire();
let vues = new Set();
let mesureLe = null;
try {
  const o = JSON.parse(fs.readFileSync(MESURE, "utf8"));
  vues = new Set(o.vues || []);
  mesureLe = o.genere_le;
} catch {
  console.log("Aucune mesure de couverture — lancer d'abord : npm run couverture:mesure");
  process.exit(0);
}

const sources = fs.readdirSync(path.join(RACINE, "js"))
  .filter((f) => /^app-\d/.test(f))
  .map((f) => fs.readFileSync(path.join(RACINE, "js", f), "utf8"))
  .join("\n") + fs.readFileSync(path.join(RACINE, "index.html"), "utf8");

const nues = r.interactions.filter((n) => !vues.has(n) && !n.includes("."));
const ecrivent = [], suppriment = [], introuvables = [];
for (const nom of nues) {
  const corps = corpsDe(sources, nom);
  if (corps === null) { introuvables.push(nom); continue; }
  if (SUPPRESSION.some((re) => re.test(corps))) suppriment.push(nom);
  else if (ECRITURE.some((re) => re.test(corps))) ecrivent.push(nom);
}

console.log("═══ Couverture par le risque ═══");
console.log(`Mesure du       : ${mesureLe || "?"}`);
console.log(`Interactions    : ${r.interactions.length}  ·  non exercées : ${nues.length}`);
console.log(`\n🔴 Non exercées qui SUPPRIMENT en base ou dans le Storage : ${suppriment.length}`);
for (const n of suppriment) console.log("   " + n);
console.log(`\n🟠 Non exercées qui ÉCRIVENT en base : ${ecrivent.length}`);
for (const n of ecrivent) console.log("   " + n);
console.log(`\n· corps introuvable (déclaration non standard) : ${introuvables.length}`);
console.log(`\nLe reste — ${nues.length - suppriment.length - ecrivent.length - introuvables.length} interactions —`);
console.log("n'écrit rien DIRECTEMENT. Analyse non transitive : borne inférieure, pas inventaire.");
