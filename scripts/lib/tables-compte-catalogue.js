"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// LES TABLES DE COMPTE, LUES DANS LE CATALOGUE D'UNE BASE CONSTRUITE
// (ASTRA-63, sixième contre-revue Astra, 2026-09-16).
//
// LE DÉFAUT : `audit-tables-compte.js` lit le DÉPÔT (les fichiers SQL). Un
// `create table` porté par un bloc `do $$…$$`, une table TYPÉE (`create table
// … of <type>`), une table DÉPLACÉE (`alter table … set schema public`) lui
// échappaient EN SILENCE : pas de couple à couvrir, gate verte. Depuis, le
// lecteur statique (`schema-resultant.js`) BORNE ses syntaxes et ROUGIT sur
// celles-ci — mais il ne peut pas dire ce qu'elles produisent. Seul le
// CATALOGUE de la base construite le sait.
//
// ICI : une requête EN LECTURE SEULE sur `information_schema` / `pg_catalog`
// (`SQL_CATALOGUE`) qui rend chaque colonne du schéma `public` portant un
// identifiant de compte — par son NOM (`COLONNES_COMPTE`, la même liste que la
// gate statique) OU par une CLÉ ÉTRANGÈRE vers `auth.users` quel que soit son
// nom — et une comparaison PURE (`comparerCatalogue`) avec `TABLES_COMPTE`
// (purge-compte.js) et les EXCEPTIONS écrites. Un couple présent dans la base
// et absent des deux listes est un OUBLI : la gate rougit en le nommant.
//
// Où ça tourne : (1) `tests/sql/tables-compte-catalogue.test.sh` — un
// PostgreSQL jetable où les trois formes fuyantes sont construites, puis LUES ;
// (2) `scripts/controle-tables-compte-cible.js` — le même contrôle sur la
// CIBLE (production, staging), en lecture seule, à partir du résultat de
// `SQL_CATALOGUE` (connecteur `execute_sql` en lecture seule, ou psql).
// ═══════════════════════════════════════════════════════════════════════════
const { COLONNES_COMPTE, EXCEPTIONS } = require("../audit-tables-compte.js");

/** La requête, EN LECTURE SEULE. Rend des lignes { "table", colonne, type, source }. */
const SQL_CATALOGUE = `
select c.table_name as "table", c.column_name as colonne, c.data_type as type, 'nom' as source
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
 where c.table_schema = 'public'
   and c.column_name ~ '${COLONNES_COMPTE.source}'
union
select cl.relname, a.attname, format_type(a.atttypid, a.atttypmod), 'fk_auth_users'
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
 where con.contype = 'f'
   and n.nspname = 'public'
   and con.confrelid = to_regclass('auth.users')
 order by 1, 2;
`.trim();

/**
 * Compare les lignes du catalogue à ce que le dépôt sait purger/exporter.
 * `lignes` : [{ table, colonne, type, source }] ; `connues` : Set "table.colonne"
 * (TABLES_COMPTE) ; `exceptions` : { "table.colonne": raison }.
 * Rend { couverts, dispenses, oublis: [{cle, type, source}], exceptionsHorsCatalogue }.
 */
function comparerCatalogue(lignes, { connues, exceptions = EXCEPTIONS } = {}) {
  if (!Array.isArray(lignes)) throw new Error("catalogue illisible : un tableau de lignes est attendu (jamais « zéro colonne »)");
  const vues = new Map();
  for (const l of lignes) {
    if (!l || typeof l.table !== "string" || typeof l.colonne !== "string") throw new Error("ligne de catalogue invalide : " + JSON.stringify(l).slice(0, 80));
    const cle = l.table + "." + l.colonne;
    const v = vues.get(cle) || { cle, type: l.type || null, sources: new Set() };
    v.sources.add(l.source || "?");
    vues.set(cle, v);
  }
  const couverts = [], dispenses = [], oublis = [];
  for (const v of vues.values()) {
    if (connues && connues.has(v.cle)) couverts.push(v.cle);
    else if (exceptions && Object.prototype.hasOwnProperty.call(exceptions, v.cle)) dispenses.push(v.cle);
    else oublis.push({ cle: v.cle, type: v.type, source: [...v.sources].sort().join("+") });
  }
  const exceptionsHorsCatalogue = Object.keys(exceptions || {}).filter((c) => !vues.has(c));
  return { couverts: couverts.sort(), dispenses: dispenses.sort(), oublis: oublis.sort((a, b) => a.cle.localeCompare(b.cle)), exceptionsHorsCatalogue, total: vues.size };
}

/** `TABLES_COMPTE` lue dans purge-compte.js (le fichier que Deno importe), en Set "table.colonne". */
function lireTablesCompte(racine) {
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(racine, "supabase", "functions", "_shared", "purge-compte.js"), "utf8");
  const bloc = src.slice(src.indexOf("export const TABLES_COMPTE"), src.indexOf("];", src.indexOf("export const TABLES_COMPTE")));
  const paires = new Set();
  const re = /\[\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"\s*\]/g;
  let m;
  while ((m = re.exec(bloc))) paires.add(m[1] + "." + m[2]);
  return paires;
}

module.exports = { SQL_CATALOGUE, comparerCatalogue, lireTablesCompte };
