#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — Audit de CLAUDE.md : court, et son journal indexé (2026-10-05).
 *
 * CLAUDE.md est rechargé dans CHAQUE session de Claude Code. Ramené de 110 Ko à
 * 18 Ko le 2026-08-07, il était remonté à 410 000 caractères le 2026-10-04 —
 * une fiche datée par lot, ajoutée à la fin — alors que Claude Code alerte dès
 * 40 000 : chaque session payait ~100 000 jetons de récit avant la première
 * ligne de travail. Le récit vit désormais dans docs/journal/ ; ce banc empêche
 * la dérive de revenir, mécaniquement, plutôt que par une consigne qu'on oublie.
 *
 * Trois règles :
 *   ① CLAUDE.md ≤ 40 000 caractères (longueur JavaScript, donc un emoji compte
 *     deux : la mesure la plus stricte des deux) ;
 *   ② tout chemin docs/journal/… ou docs/lots-ui/INDEX.md cité par CLAUDE.md
 *     existe — un renvoi mort renvoie la session vers rien ;
 *   ③ tout fichier de docs/journal/ (hors README) est cité par CLAUDE.md — un
 *     domaine que l'index ne nomme pas n'est lu par personne.
 *
 * `verifier()` est PURE (éprouvée par tests/unit/audit-claude-md.test.mjs, qui
 * fait aussi tourner ce banc sur le dépôt réel : c'est ce test, lancé par la CI
 * avec tous les tests unitaires, qui tient la règle en CI).
 * ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const LIMITE = 40000;
const RENVOI_RE = /docs\/(?:journal\/[A-Za-z0-9._-]+\.md|lots-ui\/INDEX\.md)/g;

/**
 * @param {{ claude: string, journal: string[], existe: (chemin: string) => boolean }} e
 *   `journal` : noms des fichiers .md de docs/journal/ (hors README.md).
 * @returns {string[]} les fautes, vide si tout est en ordre.
 */
function verifier({ claude, journal, existe }) {
  const fautes = [];
  const texte = String(claude || "");
  if (texte.length > LIMITE) {
    fautes.push(`CLAUDE.md fait ${texte.length} caractères (plafond ${LIMITE}) : une fiche de lot va dans docs/journal/<domaine>.md, jamais dans CLAUDE.md.`);
  }
  const cites = new Set(texte.match(RENVOI_RE) || []);
  for (const c of cites) if (!existe(c)) fautes.push(`CLAUDE.md renvoie vers ${c}, qui n'existe pas.`);
  for (const f of journal || []) {
    if (!cites.has("docs/journal/" + f)) fautes.push(`docs/journal/${f} n'est cité nulle part dans CLAUDE.md (section « Journal par domaine »).`);
  }
  return fautes;
}

function main() {
  const racine = path.join(__dirname, "..");
  const claude = fs.readFileSync(path.join(racine, "CLAUDE.md"), "utf8");
  const dossier = path.join(racine, "docs", "journal");
  const journal = fs.existsSync(dossier)
    ? fs.readdirSync(dossier).filter((f) => f.endsWith(".md") && f !== "README.md").sort()
    : [];
  const fautes = verifier({ claude, journal, existe: (c) => fs.existsSync(path.join(racine, c)) });
  console.log(`CLAUDE.md : ${claude.length} / ${LIMITE} caractères · journal : ${journal.length} fichier(s)`);
  if (fautes.length) {
    console.error("❌ CLAUDE.md :");
    for (const f of fautes) console.error("   · " + f);
    process.exit(1);
  }
  console.log("OK — CLAUDE.md court, journal indexé.");
}

if (require.main === module) main();
module.exports = { verifier, LIMITE };
