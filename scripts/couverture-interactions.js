// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIONS — extrait la liste des fonctions atteignables par un geste
// utilisateur, c'est-à-dire appelées depuis un handler inline du markup.
//
// C'est le DÉNOMINATEUR de la couverture fonctionnelle. Il est produit par un
// script, pas compté à la main : un dénominateur qu'on ne sait pas recalculer
// n'est pas une mesure, c'est un souvenir.
//
// Règle (identique à celle de PASSIO_FUNCTIONAL_MAP.md) : on retient le nom de
// la fonction appelée dans un attribut on*. `onclick="likePost('x')"` compte
// pour `likePost`. Les expressions sans appel (`onclick="this.remove()"`) et
// les méthodes d'objet (`x.y()`) ne sont pas des fonctions globales de l'app :
// elles sont exclues et listées à part, pour que l'écart soit visible.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");

// Attributs événementiels retenus. Même liste que la carte fonctionnelle.
const ATTRS = ["onclick", "onchange", "oninput", "onsubmit", "onkeyup", "onkeydown"];

// Un appel de fonction dans un handler, sous les trois formes réellement
// employées dans ce dépôt :
//   likePost(…)                → likePost
//   window._onEmojiSearch(…)   → _onEmojiSearch   (le préfixe window. est du bruit)
//   ContextualTools.open(…)    → ContextualTools.open (namespace applicatif réel)
// Le préfixe optionnel est capturé pour pouvoir distinguer ces cas ; sans lui,
// `document.getElementById(…)` passerait pour l'interaction « getElementById ».
const APPEL = /(^|[^.\w$])(?:(window|[A-Z][\w$]*)\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\(/g;

// Objets natifs ou du DOM : un appel sur eux n'est pas une interaction de l'app.
const OBJETS_NON_APP = new Set([
  "Math", "Date", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "Promise", "RegExp", "Intl", "Set", "Map", "URL", "Notification",
]);

// Mots-clés, natifs, et helpers transverses. `$`/`$$` sont des raccourcis de
// querySelector (app-02) : ils apparaissent dans des dizaines de handlers sans
// jamais être l'action déclenchée. Les compter gonflerait le dénominateur d'une
// unité et le numérateur systématiquement — un point de couverture gratuit.
const NON_APP = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "function",
  "new", "delete", "void", "in", "of", "do", "else", "try",
  "alert", "confirm", "prompt", "setTimeout", "setInterval", "parseInt",
  "parseFloat", "Number", "String", "Boolean", "Array", "Object", "JSON",
  "Math", "Date", "RegExp", "Promise", "encodeURIComponent", "decodeURIComponent",
  "$", "$$",
]);

/** Extrait les valeurs de tous les attributs on* d'un fichier HTML. */
function handlersDe(html) {
  const out = [];
  for (const attr of ATTRS) {
    // Attribut avec valeur entre guillemets doubles ou simples.
    const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "gi");
    let m;
    while ((m = re.exec(html))) out.push({ attr, code: m[1] !== undefined ? m[1] : m[2] });
  }
  return out;
}

/** Noms de fonctions appelées dans un fragment de code de handler. */
function appelsDe(code) {
  const noms = [];
  APPEL.lastIndex = 0;
  let m;
  while ((m = APPEL.exec(code))) {
    const objet = m[2];      // préfixe éventuel (window, ContextualTools, Math…)
    const nom = m[3];
    if (objet && OBJETS_NON_APP.has(objet)) continue;
    if (NON_APP.has(nom)) continue;
    // `window.f()` désigne la même fonction globale que `f()` : on normalise,
    // sinon la même interaction compterait deux fois selon son écriture.
    noms.push(objet && objet !== "window" ? `${objet}.${nom}` : nom);
  }
  return noms;
}

/**
 * @returns {{interactions:string[], parAttribut:Object, fichiers:string[],
 *            handlers:number, ecartes:string[]}}
 */
function extraire() {
  // Le markup vit dans index.html ; les gabarits générés (template literals)
  // vivent dans les app-*.js et portent EXACTEMENT les mêmes handlers inline.
  // Ignorer les seconds ferait un dénominateur faux par construction.
  const fichiers = ["index.html", ...fs.readdirSync(path.join(RACINE, "js"))
    .filter((f) => /^app-\d+.*\.js$/.test(f))
    .map((f) => path.join("js", f))];

  const interactions = new Set();
  const ecartes = new Set();
  const parAttribut = {};
  let handlers = 0;

  for (const rel of fichiers) {
    const src = fs.readFileSync(path.join(RACINE, rel), "utf8");
    for (const h of handlersDe(src)) {
      handlers++;
      parAttribut[h.attr] = (parAttribut[h.attr] || 0) + 1;
      const noms = appelsDe(h.code);
      if (!noms.length) ecartes.add(h.code.slice(0, 60));
      for (const n of noms) interactions.add(n);
    }
  }

  return {
    interactions: [...interactions].sort(),
    parAttribut,
    fichiers,
    handlers,
    ecartes: [...ecartes],
  };
}

module.exports = { extraire };

if (require.main === module) {
  const r = extraire();
  const json = process.argv.includes("--json");
  if (json) {
    process.stdout.write(JSON.stringify({ interactions: r.interactions }, null, 1));
  } else {
    console.log(`Fichiers analysés   : ${r.fichiers.length}`);
    console.log(`Handlers inline     : ${r.handlers}`);
    console.log(`Par attribut        : ${JSON.stringify(r.parAttribut)}`);
    console.log(`Interactions        : ${r.interactions.length}`);
    console.log(`Handlers sans appel : ${r.ecartes.length}`);
  }
}
