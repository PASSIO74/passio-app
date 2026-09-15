// ASTRA-07 — le vérificateur de sauvegarde ne prend plus un fichier VIDE pour
// les lignes que le manifeste annonce (scripts/sauvegarde-donnees.js --verifier).
//
// `if (contenu && lignes.length !== info.exporte)` sautait la comparaison
// quand le fichier était vide — précisément le cas où l'archive n'a pas ce que
// le manifeste promet. Le vérificateur est ce que le workflow de sauvegarde
// exécute chaque nuit après déchiffrement : un vert à tort y vaut une archive
// qu'on croit restaurable. On lance le script lui-même (celui que la CI lance),
// sur des dossiers fabriqués.
//   ① fichier vide, manifeste à 3 lignes → 1 anomalie, sortie 1 (RÉINJECTION)
//   ② fichier conforme → 0 anomalie, sortie 0
//   ③ fichier vide, manifeste à 0 ligne → conforme (un vide annoncé est un vide)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(RACINE, "scripts", "sauvegarde-donnees.js");

function archive(lignesFichier, exporte) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "passio-sauvegarde-"));
  fs.writeFileSync(path.join(d, "manifeste.json"), JSON.stringify({
    tables: { profiles: { attendu: exporte, exporte, tri: "id", octets: 0 } }, ecarts: [], medias: null, comptes: null,
  }));
  fs.writeFileSync(path.join(d, "profiles.ndjson"), lignesFichier.map((l) => JSON.stringify(l)).join("\n") + (lignesFichier.length ? "\n" : ""));
  return d;
}
function verifier(d) {
  const r = spawnSync(process.execPath, [SCRIPT, "--verifier", d], { encoding: "utf8" });
  return { code: r.status, sortie: (r.stdout || "") + (r.stderr || "") };
}

test("① fichier vide alors que le manifeste annonce 3 lignes : anomalie, sortie 1", () => {
  const r = verifier(archive([], 3));
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /profiles : 0 lignes, manifeste 3/);
});

test("② fichier conforme : aucune anomalie, sortie 0", () => {
  const r = verifier(archive([{ id: "a" }, { id: "b" }, { id: "c" }], 3));
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /conformes au manifeste/);
});

test("③ un vide ANNONCÉ est conforme", () => {
  const r = verifier(archive([], 0));
  assert.equal(r.code, 0, r.sortie);
});

// NET-07 / TCI-15 (2026-09-15) : le schéma voyage avec les données.
test("④ schema.sql absent : dit (⚠), pas une anomalie — l'archive reste restaurable sur une base qui a la structure", () => {
  const r = verifier(archive([{ id: "a" }], 1));
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /SANS le schéma/);
});

test("⑤ schema.sql présent mais vide ou étranger (page d'erreur) : anomalie, sortie 1 — un DDL de PASSIO a des dizaines de tables et de policies", () => {
  const d = archive([{ id: "a" }], 1);
  fs.writeFileSync(path.join(d, "schema.sql"), "<html>Unauthorized</html>");
  const r = verifier(d);
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /schema\.sql : 0 create table, 0 create policy/);
});

test("⑥ schema.sql qui est un DDL : compté, conforme", () => {
  const d = archive([{ id: "a" }], 1);
  const ddl = Array.from({ length: 25 }, (_, i) => `create table public.t${i} (id text);\ncreate policy p${i} on public.t${i} for select using (true);`).join("\n");
  fs.writeFileSync(path.join(d, "schema.sql"), ddl);
  const r = verifier(d);
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /schema\.sql : 25 tables, 25 policies/);
});
