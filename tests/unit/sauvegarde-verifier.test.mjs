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
//
// ⚠️ ASTRA-32 (quatrième contre-revue, 15/09/2026) — LE CAS ④ ENCODAIT LE
// DÉFAUT. Il EXIGEAIT qu'une archive sans `schema.sql` sorte en code 0 (« dit
// ⚠, pas une anomalie »), alors que le registre annonçait par ailleurs le DDL
// « exigé par le vérificateur ». Une archive sans DDL ne permet pas de repartir
// d'une base vide : la dire conforme, c'est promettre une reprise qu'on n'a pas.
// Le cas est RÉÉCRIT — ce n'est pas assouplir une propriété attendue, c'est
// retirer d'un test une attente qui contredisait le contrat.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(RACINE, "scripts", "sauvegarde-donnees.js");

const DDL = Array.from({ length: 25 }, (_, i) => `create table public.t${i} (id text);\ncreate policy p${i} on public.t${i} for select using (true);`).join("\n");

// ⚠️ `archive()` pose un `schema.sql` VALIDE par défaut : depuis ASTRA-32 une
// archive sans DDL est une anomalie, et les cas qui portent sur le COMPTE DE
// LIGNES mesureraient sinon la complétude au lieu de leur propre sujet. Les cas
// qui veulent une archive SANS DDL le demandent explicitement (`sansSchema`).
function archive(lignesFichier, exporte, extra, sansSchema) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "passio-sauvegarde-"));
  if (!sansSchema) fs.writeFileSync(path.join(d, "schema.sql"), DDL);
  fs.writeFileSync(path.join(d, "manifeste.json"), JSON.stringify({
    tables: { profiles: { attendu: exporte, exporte, tri: "id", octets: 0 } }, ecarts: [], medias: null, comptes: null,
    ...(extra || {}),
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

// NET-07 / TCI-15 / ASTRA-32 : le schéma voyage avec les données, ou l'archive
// n'est pas complète — et elle doit le DIRE, pas sortir « conforme ».
test("④ schema.sql absent : ANOMALIE, sortie 1 — l'archive n'est pas complète", () => {
  const r = verifier(archive([{ id: "a" }], 1, null, true));
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /PAS complète/);
  assert.match(r.sortie, /archive PARTIELLE/);
});

test("④ bis --partielle accepte SCIEMMENT une archive sans DDL, et continue de la nommer partielle", () => {
  const d = archive([{ id: "a" }], 1, null, true);
  const r = spawnSync(process.execPath, [SCRIPT, "--verifier", d, "--partielle"], { encoding: "utf8" });
  const sortie = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 0, sortie);
  assert.match(sortie, /ACCEPTÉE par --partielle/);
  assert.match(sortie, /archive PARTIELLE/, "accepter n'est pas requalifier");
});

test("⑤ schema.sql présent mais vide ou étranger (page d'erreur) : anomalie, sortie 1 — un DDL de PASSIO a des dizaines de tables et de policies", () => {
  const d = archive([{ id: "a" }], 1);
  fs.writeFileSync(path.join(d, "schema.sql"), "<html>Unauthorized</html>");
  const r = verifier(d);
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /0 create table, 0 create policy/);
});

test("⑥ schema.sql qui est un DDL : conforme", () => {
  const d = archive([{ id: "a" }], 1);
  fs.writeFileSync(path.join(d, "schema.sql"), DDL);
  const r = verifier(d);
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /DDL de PASSIO/);
});

// ⚠️ ASTRA-32, second volet : un DDL PRÉSENT mais qui n'est pas celui de CETTE
// archive (tronqué, remplacé, copié d'une autre sauvegarde) est pire qu'un DDL
// absent — on croirait pouvoir repartir, et on repartirait sur autre chose.
test("⑦ un DDL dont l'empreinte ne correspond pas au manifeste : anomalie, sortie 1", () => {
  const d = archive([{ id: "a" }], 1, { schema_sha256: "0".repeat(64) });
  fs.writeFileSync(path.join(d, "schema.sql"), DDL);
  const r = verifier(d);
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /empreinte .* ≠ 0{10}/);
});

test("⑧ le DDL attendu par le manifeste, présent à l'identique : conforme", () => {
  const empreinte = createHash("sha256").update(DDL.replace(/\r\n/g, "\n"), "utf8").digest("hex");
  const d = archive([{ id: "a" }], 1, { schema_sha256: empreinte });
  fs.writeFileSync(path.join(d, "schema.sql"), DDL);
  const r = verifier(d);
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /empreinte conforme au manifeste/);
});

// ⚠️ ASTRA-30 : une archive qui porte des comptes SUSPENDUS doit le dire — une
// reprise silencieuse qui libère un compte exclu est le pire des deux mondes.
test("⑨ une archive avec un compte suspendu le SIGNALE", () => {
  const d = archive([{ id: "a" }], 1, { comptes: 1 });
  fs.writeFileSync(path.join(d, "schema.sql"), DDL);
  fs.writeFileSync(path.join(d, "_auth_users.ndjson"), JSON.stringify({ id: "u1", email: "a@b.c", banned_until: "2099-01-01T00:00:00Z" }) + "\n");
  const r = verifier(d);
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /1 compte\(s\) SUSPENDU\(S\)/);
});
