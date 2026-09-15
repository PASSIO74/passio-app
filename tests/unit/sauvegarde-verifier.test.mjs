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

// ═══════════════════════════════════════════════════════════════════════════
// CINQUIÈME CONTRE-REVUE (15/09/2026) — ASTRA-45 / 48 / 55 sur le VRAI vérificateur.
// ═══════════════════════════════════════════════════════════════════════════
const MD5_VIDE = "d41d8cd98f00b204e9800998ecf8427e";
function avecMedias(d, opts = {}) {
  // Un média vide dans `content/photos/u/a.jpg`, un index et un inventaire.
  const base = path.join(d, "_storage", "content", "photos", "u");
  fs.mkdirSync(base, { recursive: true });
  if (!opts.sansFichier) fs.writeFileSync(path.join(base, "a.jpg"), "");
  const index = { format: "passio-index-medias/1", total: 1, objets: { "content/photos/u/a.jpg": { taille: 0, md5: MD5_VIDE } } };
  const texteIndex = JSON.stringify(index);
  if (!opts.sansIndex) fs.writeFileSync(path.join(d, "_storage_index.json"), texteIndex);
  const man = JSON.parse(fs.readFileSync(path.join(d, "manifeste.json"), "utf8"));
  man.medias = { fichiers: 1, octets: 0, echecs: 0, index_sha256: createHash("sha256").update(texteIndex, "utf8").digest("hex"), proprietaires_lus: opts.proprietairesLus === undefined ? 1 : opts.proprietairesLus };
  man.comptes = 0;
  fs.writeFileSync(path.join(d, "_auth_users.ndjson"), "");
  if (opts.proprietaires !== null) {
    const texte = opts.proprietaires !== undefined ? opts.proprietaires
      : JSON.stringify({ format: "passio-proprietaires/1", total: 1, objets: { "content/photos/u/a.jpg": { owner: "u", owner_id: "u" } } });
    fs.writeFileSync(path.join(d, "_storage_proprietaires.json"), texte);
    if (opts.proprietaires === undefined) man.medias.proprietaires_sha256 = createHash("sha256").update(texte, "utf8").digest("hex");
  }
  fs.writeFileSync(path.join(d, "manifeste.json"), JSON.stringify(man));
  return d;
}

test("ASTRA-45 ② REPRODUCTION : proprietaires_lus:null, fichier owners absent → « COMPLÈTE », code 0 (avant) ; désormais PARTIELLE", () => {
  const r = verifier(avecMedias(archive([{ id: "a" }], 1), { proprietaires: null, proprietairesLus: null }));
  assert.match(r.sortie, /Nature : archive PARTIELLE/, r.sortie);
  assert.match(r.sortie, /SANS inventaire complet des propriétaires/);
  assert.doesNotMatch(r.sortie, /archive COMPLÈTE/);
});

test("ASTRA-45 ③ un inventaire qui ne relève pas un objet archivé : anomalie, code 1", () => {
  const texte = JSON.stringify({ format: "passio-proprietaires/1", total: 0, objets: {} });
  const r = verifier(avecMedias(archive([{ id: "a" }], 1), { proprietaires: texte }));
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /1 objet\(s\) archivé\(s\) NON RELEVÉ\(S\)/);
});

test("ASTRA-48 ③ REPRODUCTION : un fichier owners tronqué → « archive COMPLÈTE », code 0 (avant) ; désormais INDÉTERMINÉ, code 1", () => {
  const r = verifier(avecMedias(archive([{ id: "a" }], 1), { proprietaires: '{"content/photos/u/a.jpg": {"owner": "u", "ow' }));
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /_storage_proprietaires\.json : JSON illisible[\s\S]*INDÉTERMINÉ/);
});

test("ASTRA-48 ④ un inventaire dont l'empreinte diverge du manifeste est refusé", () => {
  const d = avecMedias(archive([{ id: "a" }], 1));
  // On remplace l'inventaire par un autre, valide mais étranger.
  fs.writeFileSync(path.join(d, "_storage_proprietaires.json"), JSON.stringify({ format: "passio-proprietaires/1", total: 1, objets: { "content/photos/u/a.jpg": { owner: "autre", owner_id: "autre" } } }));
  const r = verifier(d);
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /empreinte[\s\S]*ce n'est pas l'inventaire de cette archive/);
});

test("ASTRA-55 ③ REPRODUCTION : le média a disparu du disque après la sauvegarde → l'archive est ENDOMMAGÉE, code 1", () => {
  const r = verifier(avecMedias(archive([{ id: "a" }], 1), { sansFichier: true }));
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /archive ENDOMMAGÉE — 1 fichier\(s\) de l'index absent\(s\)/);
});

test("ASTRA-55 ④ un média MODIFIÉ sur disque (même nom) est vu par l'index ; une archive intacte est COMPLÈTE", () => {
  const d = avecMedias(archive([{ id: "a" }], 1));
  fs.writeFileSync(path.join(d, "_storage", "content", "photos", "u", "a.jpg"), "corrompu");
  const r = verifier(d);
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /1 modifié\(s\)/);
  const ok = verifier(avecMedias(archive([{ id: "a" }], 1)));
  assert.equal(ok.code, 0, ok.sortie);
  assert.match(ok.sortie, /Nature : archive COMPLÈTE/);
  assert.match(ok.sortie, /tous conformes à l'index/);
});
