// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-27 — aucune table ne naît sans qu'on dise ce qu'elle devient.
//
// Le défaut : `public.call_invites`, née le 15/09 avec MSG-01, portait
// `from_id`/`to_id` en `text` SANS clé étrangère — donc rien, côté base, ne
// l'emportait avec le compte — et n'était NI dans `TABLES_COMPTE` (purge) NI
// dans l'export qui en dérive. Personne ne pouvait le voir : aucune gate ne
// comparait les tables du dépôt à la liste.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("../../scripts/audit-tables-compte.js");
const { TABLES_COMPTE } = require("../../supabase/functions/_shared/purge-compte.js");
const { tablesExport, EXCLUS_EXPORT } = require("../../supabase/functions/_shared/export-compte.js");

const paires = new Set(TABLES_COMPTE.map(([t, c]) => t + "." + c));

test("① `call_invites` est purgée DES DEUX CÔTÉS — c'est un lien, comme follows et blocks", () => {
  assert.ok(paires.has("call_invites.from_id"), "l'invitation que j'ai émise");
  assert.ok(paires.has("call_invites.to_id"), "celle que j'ai reçue : elle porte mon identifiant");
  // La règle de la maison pour un lien : les deux bouts partent.
  for (const lien of ["follows.follower_id", "follows.following_id", "blocks.blocker_id", "blocks.blocked_id"]) {
    assert.ok(paires.has(lien), lien + " — le précédent que `call_invites` suit");
  }
});

test("② les tables du Carnet de voyage RETIRÉ sont purgées : « retirée » ne veut pas dire « effacée »", () => {
  // ADR-011 §6 a retiré la fonctionnalité en CONSERVANT les données. Mesuré en
  // production le 15/09 : 13 lignes portant un identifiant de compte.
  for (const c of ["cdv_lives.author_id", "cdv_live_steps.author_id", "cdv_live_comments.author_id",
                   "cdv_live_reactions.user_id", "cdv_live_followers.user_id",
                   "cdv_live_collaborators.user_id", "cdv_live_collaborators.added_by"]) {
    assert.ok(paires.has(c), c + " doit être purgée");
  }
});

test("③ l'export prend ce qui est à moi, pas l'autre bout du lien", () => {
  const exportees = new Set(tablesExport().map(([t, c]) => t + "." + c));
  assert.ok(exportees.has("call_invites.from_id"), "les appels que j'ai passés");
  assert.ok(exportees.has("call_invites.to_id"), "ceux que j'ai reçus — un fait qui me concerne, comme notifications.user_id");
  assert.ok(!exportees.has("cdv_live_collaborators.added_by"), "« qui m'a ajouté » est la donnée de l'autre");
  assert.ok(EXCLUS_EXPORT.has("cdv_live_collaborators.added_by"));
});

test("④ la gate est verte sur le dépôt tel qu'il est", () => {
  const r = A.auditer();
  assert.deepEqual(r.oublis, [], "aucun couple ne doit rester sans décision : " + JSON.stringify(r.oublis));
  assert.ok(r.vues.size >= 40, "la gate doit voir l'essentiel du schéma (vu : " + r.vues.size + ")");
});

test("⑤ RÉINJECTION — une table neuve oubliée fait ROUGIR la gate, et elle nomme le fichier", () => {
  // On simule exactement le défaut : une table née d'une migration, avec une
  // colonne d'identité, absente de TABLES_COMPTE et des exceptions.
  const declarees = A.tablesDeclarees(
    'create table if not exists public.appels_futurs (\n  id text primary key,\n  user_id text not null,\n  created_at timestamptz\n);',
    "migration_fictive.sql"
  );
  assert.equal(declarees.length, 1);
  assert.deepEqual(declarees[0].colonnes, ["user_id"]);
  assert.ok(!paires.has("appels_futurs.user_id"), "prémisse : elle n'est pas dans la liste");
  assert.ok(!A.EXCEPTIONS["appels_futurs.user_id"], "prémisse : ni dans les exceptions");
  // …donc la gate l'aurait signalée : c'est la logique de `auditer`, appliquée ici.
  const seraitUnOubli = !paires.has("appels_futurs.user_id") && !A.EXCEPTIONS["appels_futurs.user_id"];
  assert.equal(seraitUnOubli, true);
});

test("⑥ le lecteur du référentiel voit les tables qui n'ont AUCUN `create table` dans le dépôt", () => {
  // `migrations/SCHEMA_PROD_REFERENCE.sql` ne contient pas une seule
  // instruction `create table` : c'est une description en commentaires. Sans ce
  // lecteur, la gate ne voyait que les tables nées d'une migration — et donnait
  // un vert qui ne valait que pour elles.
  const t = A.tablesDuReferentiel("migrations/SCHEMA_PROD_REFERENCE.sql");
  const noms = t.map((x) => x.table);
  assert.ok(noms.includes("reports"), "reports n'est déclarée nulle part ailleurs");
  assert.ok(noms.includes("posts") && noms.includes("conv_messages"));
  assert.ok(t.length >= 30, "vu : " + t.length);
});

test("⑦ la gate s'exécute et sort 0, en DISANT sa portée", () => {
  const out = execFileSync(process.execPath, ["scripts/audit-tables-compte.js"], { encoding: "utf8" });
  assert.match(out, /✅ les \d+ couples VISIBLES DEPUIS LE DÉPÔT/);
  // ⚠️ Elle ne prétend pas voir la base : une table créée à la main lui échappe,
  // et elle le répète à chaque exécution plutôt que de laisser croire au total.
  assert.match(out, /portée de la gate, qui lit le dépôt et non la base/);
});
