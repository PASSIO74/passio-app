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
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
      || lines[i].match(/^var\s+([A-Za-z_$][\w$]*)\s*[=;,]/);
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

if (bad) {
  console.log(`\n${bad} collision(s) de globals — renomme ou supprime la définition morte.`);
  process.exit(1);
}
console.log(`OK — aucune collision de global top-level (${decls.size} déclarations uniques scannées, ${files.length} fichiers).`);
