"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL DES MIGRATIONS APPLIQUÉES — NET-07 / TCI-15 (contre-revue Astra,
// 2026-09-15 : « ordre complet et journal des migrations non démontrés »)
//
// Chaque migration envoyée par `scripts/appliquer-migration.mjs` laisse une
// ligne dans `public.migrations_appliquees` du projet visé : le fichier, son
// empreinte SHA-256, la date, le verdict imprimé. C'est la SEULE mémoire de
// « ce qui a été appliqué, et dans quel ordre » qui vive AVEC la base — le
// dépôt ne la connaît pas (une migration collée à la main ne passe pas par lui,
// et une base restaurée depuis une archive doit pouvoir dire d'où elle part).
// La table n'a aucun droit client. Fonctions pures, verrouillées par
// `tests/unit/journal-migrations.test.mjs` ; le script les exécute par l'API.
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require("node:crypto");

const TABLE = "public.migrations_appliquees";

function empreinte(sql) {
  // Empreinte du CONTENU normalisé (fins de ligne) : un même fichier relu en
  // CRLF sur un poste Windows et en LF en CI donne la même empreinte.
  return crypto.createHash("sha256").update(String(sql).replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

// Le DDL de la table, rejouable, sans droit client — envoyé AVANT chaque
// insertion : la première migration journalisée crée le journal.
function sqlCreation() {
  return [
    `create table if not exists ${TABLE} (`,
    `  id bigint generated always as identity primary key,`,
    `  fichier text not null,`,
    `  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),`,
    `  verdict jsonb,`,
    `  applique_le timestamptz not null default now(),`,
    `  outil text not null default 'appliquer-migration.mjs'`,
    `);`,
    `alter table ${TABLE} enable row level security;`,
    `revoke all on ${TABLE} from anon, authenticated;`,
    `create index if not exists migrations_appliquees_fichier_idx on ${TABLE} (fichier, applique_le desc);`,
  ].join("\n");
}

function litteral(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }

// L'insertion : fichier relatif au dépôt, empreinte, verdict (les lignes
// rendues par la migration, bornées à 50). Une même migration rejouée laisse
// une ligne de plus — le rejeu est un fait, pas un doublon à cacher.
function sqlInsertion({ fichier, sql, verdict }) {
  const f = String(fichier || "").replace(/\\/g, "/");
  if (!/^migrations\/[A-Za-z0-9_.-]+\.sql$/.test(f)) throw new Error("fichier de migration attendu sous migrations/ : " + f);
  const v = Array.isArray(verdict) ? verdict.slice(0, 50) : [];
  return `insert into ${TABLE} (fichier, empreinte, verdict) values (${litteral(f)}, ${litteral(empreinte(sql))}, ${litteral(JSON.stringify(v))}::jsonb) returning id, applique_le;`;
}

// La lecture : le journal du plus récent au plus ancien.
function sqlLecture(limite) {
  const n = Number.isInteger(limite) && limite > 0 && limite <= 500 ? limite : 50;
  return `select id, fichier, left(empreinte, 12) as empreinte, applique_le, outil from ${TABLE} order by applique_le desc, id desc limit ${n};`;
}

module.exports = { TABLE, empreinte, sqlCreation, sqlInsertion, sqlLecture };
