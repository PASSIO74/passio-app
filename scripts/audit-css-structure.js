#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// audit-css-structure — styles.css tient-il debout ?
// ----------------------------------------------------------------------------
// POURQUOI CE SCRIPT EXISTE. Le 2026-09-03, la résolution d'un conflit de fusion
// a fait perdre UNE accolade fermante : celle du `@media (pointer: coarse)`.
// Conséquence — tout le CSS qui suivait (les blocs de `main`, UI-8 et UI-4A5)
// s'est retrouvé AVALÉ dans la media query, donc inactif hors tactile. Aucune
// erreur, aucun avertissement : le fichier reste « valide » pour le navigateur,
// qui se contente d'ignorer ce qu'il ne peut pas rattacher.
//
// Ce que ça a coûté : sept suites e2e au rouge, et une heure et demie de suite
// complète pour l'apprendre. Le déséquilibre, lui, se voit en 30 ms.
//
// Ce script ne juge PAS le style : il vérifie que le fichier a une STRUCTURE.
// Trois contrôles, chacun correspondant à un défaut réellement vécu.
// ════════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const FICHIER = path.join(__dirname, "..", "styles.css");
const brut = fs.readFileSync(FICHIER);
const texte = brut.toString("utf8");
const erreurs = [];

// ── ① Accolades équilibrées, et profondeur qui retombe à zéro ───────────────
// On ignore ce qui est DANS un commentaire ou une chaîne : `content: "{"` est
// légitime, et les commentaires du projet sont longs et bavards.
let profondeur = 0, ligne = 1, ligneDerniereOuverture = 0;
let dansCommentaire = false, dansChaine = null;
const pile = [];
for (let i = 0; i < texte.length; i++) {
  const c = texte[i], suiv = texte[i + 1];
  if (c === "\n") { ligne++; continue; }
  if (dansCommentaire) { if (c === "*" && suiv === "/") { dansCommentaire = false; i++; } continue; }
  if (dansChaine) {
    if (c === "\\") { i++; continue; }
    if (c === dansChaine) dansChaine = null;
    continue;
  }
  if (c === "/" && suiv === "*") { dansCommentaire = true; i++; continue; }
  if (c === '"' || c === "'") { dansChaine = c; continue; }
  if (c === "{") { profondeur++; pile.push(ligne); ligneDerniereOuverture = ligne; }
  else if (c === "}") {
    profondeur--;
    pile.pop();
    if (profondeur < 0) {
      erreurs.push(`ligne ${ligne} : accolade fermante en trop (profondeur négative).`);
      profondeur = 0;
    }
  }
}
if (profondeur > 0) {
  // ⚠️ La ligne du `{` orphelin N'EST PAS fiable : les `}` qui suivent dépilent
  // en cascade et referment le mauvais bloc. Le repère utile — celui qui a
  // permis de trouver le défaut du 2026-09-03 — c'est la DERNIÈRE ligne où la
  // profondeur valait encore zéro : le déséquilibre commence juste après.
  let d = 0, derniereLigneZero = 0, n = 0;
  for (const l of texte.split(/\r?\n/)) {
    n++;
    d += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (d === 0) derniereLigneZero = n;
  }
  erreurs.push(
    `${profondeur} bloc(s) jamais refermé(s).\n` +
    `   Dernière ligne à profondeur 0 : ${derniereLigneZero} — le déséquilibre commence juste après.\n` +
    `   Tout le CSS qui suit est avalé par ce bloc et devient inactif, SANS erreur de parse.`
  );
}

// ── ② Aucun marqueur de conflit resté dans le fichier ───────────────────────
// ⚠️ On teste des marqueurs EN DÉBUT DE LIGNE : les séparateurs décoratifs du
// projet (`/* ===== ÉCRAN ===== */`) contiennent des suites de « = » et ne
// doivent pas déclencher de faux positif.
texte.split(/\r?\n/).forEach((l, i) => {
  if (/^(<{7}|={7}$|>{7})/.test(l)) erreurs.push(`ligne ${i + 1} : marqueur de conflit resté en place — « ${l.slice(0, 40)} »`);
});

// ── ③ styles.css est en CRLF, et doit le rester ─────────────────────────────
// Une réécriture en mode texte le convertirait en LF et produirait un diff de
// plus de 10 000 lignes, qui noierait la modification réelle (règle CLAUDE.md).
const crlf = (texte.match(/\r\n/g) || []).length;
const lfNus = (texte.match(/\n/g) || []).length - crlf;
if (crlf === 0) erreurs.push("le fichier n'est plus en CRLF (aucun \\r\\n) — il a été réécrit en mode texte.");
else if (lfNus > 80) erreurs.push(`${lfNus} fin(s) de ligne LF nue(s) pour ${crlf} CRLF : le fichier est en train d'être converti.`);

// ── Rapport ─────────────────────────────────────────────────────────────────
if (erreurs.length) {
  console.error("\n❌ styles.css — structure cassée :\n");
  erreurs.forEach((e) => console.error("   " + e));
  console.error("");
  process.exit(1);
}
console.log(`OK — styles.css structurellement sain (${crlf} lignes CRLF, accolades équilibrées, aucun marqueur de conflit).`);
