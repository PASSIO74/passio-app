// NET-07 / TCI-15 — le journal des migrations appliquées (fonctions pures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { TABLE, empreinte, sqlCreation, sqlInsertion, sqlLecture } = require("../../scripts/lib/journal-migrations.js");

test("① l'empreinte ignore les fins de ligne (CRLF du poste = LF de la CI), et change au moindre octet", () => {
  assert.equal(empreinte("begin;\nselect 1;\ncommit;\n"), empreinte("begin;\r\nselect 1;\r\ncommit;\r\n"));
  assert.notEqual(empreinte("begin;\nselect 1;\ncommit;\n"), empreinte("begin;\nselect 2;\ncommit;\n"));
  assert.match(empreinte("x"), /^[0-9a-f]{64}$/);
});

test("② la table se crée rejouable, RLS active, aucun droit client", () => {
  const s = sqlCreation();
  assert.match(s, /create table if not exists public\.migrations_appliquees/);
  assert.match(s, /enable row level security/);
  assert.match(s, /revoke all on public\.migrations_appliquees from anon, authenticated/);
  assert.match(s, /empreinte ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.equal(TABLE, "public.migrations_appliquees");
});

test("③ l'insertion porte le fichier relatif, l'empreinte et le verdict ; les apostrophes sont doublées", () => {
  const s = sqlInsertion({ fichier: "migrations\\migration_x_2026-09-15.sql", sql: "begin;\ncommit;", verdict: [{ controle: "l'aide", valeur: "OK" }] });
  assert.match(s, /values \('migrations\/migration_x_2026-09-15\.sql', '[0-9a-f]{64}', '\[\{"controle":"l''aide","valeur":"OK"\}\]'::jsonb\)/);
  assert.match(s, /returning id, applique_le;$/);
});

test("④ un chemin hors de migrations/ ou une extension inattendue sont refusés ; le verdict est borné à 50 lignes", () => {
  assert.throws(() => sqlInsertion({ fichier: "scripts/x.sql", sql: "" }), /migrations\//);
  assert.throws(() => sqlInsertion({ fichier: "migrations/x.txt", sql: "" }), /migrations\//);
  assert.throws(() => sqlInsertion({ fichier: "migrations/../x.sql", sql: "" }), /migrations\//);
  const long = Array.from({ length: 80 }, (_, i) => ({ i }));
  const s = sqlInsertion({ fichier: "migrations/m.sql", sql: "x", verdict: long });
  assert.equal(JSON.parse(s.match(/'(\[\{.*\}\])'::jsonb/)[1]).length, 50);
});

test("⑤ la lecture est bornée (défaut 50, plafond 500) et triée du plus récent au plus ancien", () => {
  assert.match(sqlLecture(), /limit 50;$/);
  assert.match(sqlLecture(10), /limit 10;$/);
  assert.match(sqlLecture(9999), /limit 50;$/);
  assert.match(sqlLecture("abc"), /limit 50;$/);
  assert.match(sqlLecture(), /order by applique_le desc, id desc/);
});
