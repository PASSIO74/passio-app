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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("../../scripts/audit-tables-compte.js");
const { TABLES_COMPTE } = require("../../supabase/functions/_shared/purge-compte.js");
const { tablesExport, EXCLUS_EXPORT } = require("../../supabase/functions/_shared/export-compte.js");

const paires = new Set(TABLES_COMPTE.map(([t, c]) => t + "." + c));

// La fonction d'AVANT (a5e8c717), telle quelle, pour REPRODUIRE ce qu'elle ne voyait pas.
function A_AVANT_tablesDeclarees(sql, fichier) {
  const out = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const nom = m[1];
    let i = m.index + m[0].length, profondeur = 1;
    for (; i < sql.length && profondeur > 0; i++) { if (sql[i] === "(") profondeur++; else if (sql[i] === ")") profondeur--; }
    const corps = sql.slice(m.index + m[0].length, i - 1);
    const colonnes = corps.split(",").map((l) => (l.trim().split(/\s+/)[0] || "").replace(/"/g, "").toLowerCase()).filter((c) => A.COLONNES_COMPTE.test(c));
    if (colonnes.length) out.push({ table: nom, colonnes: [...new Set(colonnes)], fichier });
  }
  return out;
}

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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "astra54-"));
  const f = path.join(d, "migration_fictive.sql");
  fs.writeFileSync(f, "create table if not exists public.appels_futurs (\n  id text primary key,\n  user_id text not null,\n  created_at timestamptz\n);");
  const { tables: declarees } = A.tablesDeclarees([f]);
  assert.equal(declarees.length, 1);
  assert.deepEqual(declarees[0].colonnes, ["user_id"]);
  assert.equal(declarees[0].fichier, "migration_fictive.sql");
  assert.ok(!paires.has("appels_futurs.user_id"), "prémisse : elle n'est pas dans la liste");
  assert.ok(!A.EXCEPTIONS["appels_futurs.user_id"], "prémisse : ni dans les exceptions");
  const seraitUnOubli = !paires.has("appels_futurs.user_id") && !A.EXCEPTIONS["appels_futurs.user_id"];
  assert.equal(seraitUnOubli, true);
});

// ── ASTRA-54 (cinquième contre-revue, 15/09/2026) : le schéma RÉSULTANT, pas des mots ──
function migrations(...contenus) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "astra54-"));
  return contenus.map((c, i) => { const f = path.join(d, `m${i}.sql`); fs.writeFileSync(f, c); return f; });
}
const couples = (r) => r.tables.flatMap((t) => t.colonnes.map((c) => t.table + "." + c)).sort();

test("ASTRA-54 ① REPRODUCTION : `create table x (id)` PUIS `alter table x add user_id` — invisible avant, vu maintenant", () => {
  const anc = A_AVANT_tablesDeclarees("create table public.x (id text primary key);\nalter table public.x add column user_id text;", "m.sql");
  assert.deepEqual(anc, [], "reproduction : la gate d'avant ne voyait pas la colonne ajoutée");
  const r = A.tablesDeclarees(migrations("create table public.x (id text primary key);\nalter table public.x add column user_id text;"));
  assert.deepEqual(couples(r), ["x.user_id"]);
  // …même si l'ALTER est dans un AUTRE fichier, plus tard.
  const r2 = A.tablesDeclarees(migrations("create table public.y (id text primary key);", "alter table if exists only public.y add if not exists author_id uuid references auth.users(id);"));
  assert.deepEqual(couples(r2), ["y.author_id"]);
});

test("ASTRA-54 ② REPRODUCTION : le schéma entre guillemets (`\"public\".x`) échappait — plus maintenant ; tout comme le nom sans schéma", () => {
  const anc = A_AVANT_tablesDeclarees('create table "public"."z" (user_id text);', "m.sql");
  assert.deepEqual(anc, [], "reproduction : `\"public\".z` échappait");
  assert.deepEqual(couples(A.tablesDeclarees(migrations('create table "public"."z" (user_id text);'))), ["z.user_id"]);
  assert.deepEqual(couples(A.tablesDeclarees(migrations("CREATE TABLE IF NOT EXISTS w (\n  \"user_id\" TEXT,\n  primary key (user_id)\n);"))), ["w.user_id"]);
  assert.deepEqual(couples(A.tablesDeclarees(migrations("create table autre.v (user_id text);"))), [], "un autre schéma n'est pas `public`");
});

test("ASTRA-54 ③ rename column, rename table, drop column, drop table : l'état FINAL fait foi", () => {
  assert.deepEqual(couples(A.tablesDeclarees(migrations("create table public.a (owner text);", "alter table public.a rename column owner to user_id;"))), ["a.user_id"]);
  assert.deepEqual(couples(A.tablesDeclarees(migrations("create table public.a (user_id text);", "alter table public.a rename to b;"))), ["b.user_id"]);
  assert.deepEqual(couples(A.tablesDeclarees(migrations("create table public.a (user_id text, author_id text);", "alter table public.a drop column author_id;"))), ["a.user_id"]);
  assert.deepEqual(couples(A.tablesDeclarees(migrations("create table public.a (user_id text);", "drop table if exists public.a cascade;"))), []);
  // Une contrainte de table n'est pas une colonne ; un commentaire ou une chaîne portant « user_id » non plus.
  assert.deepEqual(couples(A.tablesDeclarees(migrations("create table public.c (id text, constraint c_pk primary key (id), foreign key (id) references public.p(user_id));\n-- alter table public.c add user_id text;\ninsert into public.c values ('alter table public.c add user_id text;');"))), []);
});

test("ASTRA-54 ④ une table aux colonnes NON déterminables (as select, like, inherits) est nommée et fait rougir", () => {
  const r = A.tablesDeclarees(migrations("create table public.copie as select * from public.posts;", "create table public.clone (like public.posts);"));
  assert.equal(r.indeterminees.length, 2, JSON.stringify(r.indeterminees));
  assert.ok(r.indeterminees.every((x) => /^public\./.test(x.table)));
  // Un `do $$ … execute format('alter table …') $$` est nommé comme dynamique.
  const d = A.tablesDeclarees(migrations("do $$ begin execute format('alter table public.%I add column user_id text', 'x'); end $$;"));
  assert.equal(d.dynamiques.length, 1);
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

test("⑧ `alter publication … drop table` n'est PAS du DDL de table — sinon la gate refuse une migration innocente", () => {
  // ⚠️ FAUX POSITIF MESURÉ LE 2026-09-20. La gate refusait
  // `migration_realtime_telemetry_2026-09-20.sql` — qui ne touche AUCUNE
  // table, elle retire seulement `telemetry_events` de la publication de
  // réplication logique — parce que son motif brut attrapait `drop table`
  // dans le `execute` du bloc. Elle réclamait alors « un identifiant de
  // compte » sur une table qu'elle n'avait jamais lue.
  // **Un faux positif sur une gate de sécurité coûte plus qu'un trou** : il
  // pousse à réécrire la migration pour lui plaire, ou à l'inscrire au socle —
  // deux façons de désarmer la gate en croyant la respecter.
  const pub = A.tablesDeclarees(migrations(
    "do $$ begin execute 'alter publication supabase_realtime drop table public.telemetry_events'; end $$;",
  ));
  assert.equal(pub.dynamiques.length, 0, "une publication n'est pas une table");
  assert.equal(pub.indeterminees.length, 0, "rien d'indéterminé : aucune colonne n'a bougé");

  // ⚠️ ET LA GARDE RESTE ENTIÈRE SUR LE VRAI DDL : on n'a pas élargi une
  // exception, on a retiré une forme qui n'a jamais été du DDL de table.
  const vrai = A.tablesDeclarees(migrations(
    "do $$ begin execute 'drop table public.telemetry_events'; end $$;",
  ));
  assert.equal(vrai.dynamiques.length, 1, "un vrai `drop table` doit toujours être signalé");
});
