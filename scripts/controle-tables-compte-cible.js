#!/usr/bin/env node
"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// CONTRÔLE EN LECTURE SEULE : LES TABLES DE COMPTE DE LA CIBLE SONT-ELLES
// TOUTES PURGÉES, EXPORTÉES OU DISPENSÉES ? (ASTRA-63, 2026-09-16)
//
// La gate `audit-tables-compte.js` lit le DÉPÔT. Celle-ci lit la BASE : le
// catalogue réel du schéma `public` (colonnes nommées comme un identifiant de
// compte, ou liées par clé étrangère à `auth.users`), comparé à `TABLES_COMPTE`
// et aux exceptions écrites. C'est le contrôle « sur la cible » du dossier de
// livraison — il ne mute rien.
//
//   node scripts/controle-tables-compte-cible.js --sql
//       imprime la requête à exécuter EN LECTURE SEULE (connecteur
//       `execute_sql` du projet en lecture seule, ou l'éditeur SQL) ;
//   node scripts/controle-tables-compte-cible.js --json <fichier.json>
//       compare le résultat (tableau de lignes { table, colonne, type, source })
//       et rend le verdict — code 1 s'il reste un oubli ;
//   node scripts/controle-tables-compte-cible.js --psql "<conninfo>"
//       exécute la requête avec `psql` (base jetable, banc) puis compare.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { SQL_CATALOGUE, comparerCatalogue, lireTablesCompte } = require("./lib/tables-compte-catalogue.js");

const RACINE = path.join(__dirname, "..");
const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

if (args.includes("--sql")) { process.stdout.write(SQL_CATALOGUE + "\n"); process.exit(0); }

let lignes;
if (val("--json")) {
  lignes = JSON.parse(fs.readFileSync(val("--json"), "utf8"));
  // L'API de gestion et `execute_sql` rendent parfois { rows: [...] } ou [{ json_agg: [...] }].
  if (lignes && !Array.isArray(lignes) && Array.isArray(lignes.rows)) lignes = lignes.rows;
  if (Array.isArray(lignes) && lignes.length === 1 && lignes[0] && Array.isArray(lignes[0].json_agg)) lignes = lignes[0].json_agg;
} else if (val("--psql")) {
  const out = execFileSync("psql", [val("--psql"), "-tA", "-v", "ON_ERROR_STOP=1", "-c", "select coalesce(jsonb_agg(x), '[]'::jsonb) from (" + SQL_CATALOGUE.replace(/;\s*$/, "") + ") x"], { encoding: "utf8" });
  lignes = JSON.parse(out.trim() || "[]");
} else {
  console.error("usage : --sql | --json <fichier> | --psql \"<conninfo>\"");
  process.exit(2);
}

const r = comparerCatalogue(lignes, { connues: lireTablesCompte(RACINE) });
console.log(`catalogue de la cible : ${r.total} colonne(s) d'identifiant de compte dans public — ${r.couverts.length} purgée(s)/exportée(s), ${r.dispenses.length} dispensée(s) avec raison, ${r.oublis.length} OUBLI(S)`);
for (const o of r.oublis) console.error(`❌ ${o.cle} (${o.type || "?"}, ${o.source}) : NI dans TABLES_COMPTE NI dans les exceptions — la purge de compte ne la vide pas.`);
if (r.exceptionsHorsCatalogue.length) console.log(`ℹ exception(s) sans colonne correspondante dans la cible : ${r.exceptionsHorsCatalogue.join(", ")}`);
if (r.oublis.length) process.exit(1);
console.log("✅ toutes les colonnes d'identifiant de compte de la cible sont purgées, exportées, ou dispensées avec leur raison.");
