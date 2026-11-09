#!/usr/bin/env node
// Audit statique des COLLISIONS de globals — re-exécutable à volonté (npm run audit:globals).
// Tous les js/* sont des scripts classiques partageant window : une `function X`
// (ou `var X`) déclarée DEUX fois est silencieusement écrasée par la dernière
// chargée (hoisting). Ça a déjà mordu 3 fois : _pickMention (messagerie vs
// commentaires), _outboxLoad/_outboxSave (messages vs commentaires, renommés
// _cmtOb*), et supaUploadMedia (2 signatures différentes dans app-08 → l'upload
// des photos de profil-passion renvoyait la chaîne "photo" en guise d'URL).
// Détection : déclarations TOP-LEVEL (colonne 0) de `function X` / `var X` —
// les fonctions imbriquées (indentées) sont scopées, donc inoffensives.
// Sortie : liste des noms déclarés 2+ fois (hors allowlist) ; exit 1 si trouvé.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const files = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f);

// Doublons HISTORIQUES assumés (dernière définition chargée = celle documentée
// dans CLAUDE.md ; les corriger = refactor à part). NE RIEN AJOUTER ICI sans
// avoir vérifié que TOUS les appelants attendent la définition qui gagne.
const ALLOW = new Set([
  "$", // app-01 (getElementById) écrasé par app-02 (querySelector) — CLAUDE.md documente app-02
]);

const decls = new Map(); // name → [{file, line}]
const fonctions = new Map(); // name → [{file, line}] — les seules `function X` de premier niveau
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const fn = lines[i].match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (fn) {
      if (!fonctions.has(fn[1])) fonctions.set(fn[1], []);
      fonctions.get(fn[1]).push({ file: f, line: i + 1 });
    }
    const m = fn
      || lines[i].match(/^var\s+([A-Za-z_$][\w$]*)\s*[=;,]/)
      // ⚠️ `let`/`const` DE PREMIER NIVEAU ÉTAIENT HORS DU FILET, et leur mode
      // d'échec est PIRE que celui de `function`. Les scripts classiques
      // partagent l'environnement lexical global : une `function` redéclarée est
      // écrasée en silence (déjà couvert), mais un `let`/`const` redéclaré lève
      // un `SyntaxError` qui TUE LE SCRIPT ENTIER — donc tout un app-*.js.
      // Trou relevé par l'audit du 2026-09-10 : les 11 déclarations du moteur de
      // reprise réseau bénéficiaient d'un vert que la gate ne couvrait pas.
      || lines[i].match(/^(?:let|const)\s+([A-Za-z_$][\w$]*)\s*[=;]/);
    if (!m) continue;
    const name = m[1];
    if (!decls.has(name)) decls.set(name, []);
    decls.get(name).push({ file: f, line: i + 1 });
  }
}

let bad = 0;
for (const [name, sites] of [...decls.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (sites.length < 2 || ALLOW.has(name)) continue;
  bad++;
  console.log(`✗ ${name} déclaré ${sites.length}× (la DERNIÈRE gagne par hoisting) :`);
  for (const s of sites) console.log(`    ${s.file}:${s.line}`);
}
// ⚠️ UNE AFFECTATION `window.X = …` FACE À UNE `function X` D'UN AUTRE FICHIER
// (2026-11-09). Le monolithe `app.js` hissait TOUTES ses déclarations en tête :
// l'affectation gagnait toujours, quel que soit l'ordre des fichiers. Depuis que le
// bloc app sort en 9 scripts (comme en développement), la `function X` d'un fichier
// chargé APRÈS l'affectation la redéfinit à son chargement : la gagnante dépend de
// l'ordre de chargement. C'est ainsi que la production aurait changé de
// `passioCompressImage` sans un signal (WebP 1600 px → JPEG 1280 px : app-06
// l'affectait, app-09 la déclarait) — trouvé en relecture de la PR #801, invisible
// au filet ci-dessus, qui ne compare que des déclarations entre elles. Une seule
// définition par nom.
// Portée : les fichiers DU BLOC APP (les 9 app-0*, et emoji-misc.js et
// passion-context.js qui ferment le 9ᵉ script), seuls à avoir changé de forme. Les
// enveloppes posées à l'exécution par un script HORS du bloc (telemetry.js sur
// `goTo`, identity-transition.js sur `doLogout`, ui-v4a* sur `renderIRL`…) sont
// voulues, et leur ordre face au bloc n'a pas changé. Un ré-export du même nom
// (`window._sendGif = _sendGif;`) ne définit rien de neuf. Commentaires écartés.
const DU_BLOC = (f) => /^js\/(app-0\d[\w-]*|emoji-misc|passion-context)\.js$/.test(f);
for (const f of files.filter(DU_BLOC)) {
  const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;
    for (const m of lines[i].matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) {
      if (new RegExp("^\\s*" + m[1].replace(/\$/g, "\\$") + "\\s*;").test(lines[i].slice(m.index + m[0].length))) continue;
      const ailleurs = (fonctions.get(m[1]) || []).filter((s) => s.file !== f && DU_BLOC(s.file));
      if (!ailleurs.length || ALLOW.has(m[1])) continue;
      bad++;
      console.log(`✗ ${m[1]} affecté (window.${m[1]} = …) dans ${f}:${i + 1} ET déclaré \`function ${m[1]}\` ailleurs — la gagnante dépend de l'ordre de chargement :`);
      for (const s of ailleurs) console.log(`    ${s.file}:${s.line}`);
    }
  }
}

if (bad) {
  console.log(`\n${bad} collision(s) de globals — renomme ou supprime la définition morte.`);
  process.exit(1);
}
console.log(`OK — aucune collision de global top-level (${decls.size} déclarations uniques scannées, ${files.length} fichiers).`);
