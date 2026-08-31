#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   GÉNÉRATEUR DE LA MIGRATION DU CATALOGUE — lot TAXO-1
   ──────────────────────────────────────────────────────────────────────────
   `js/passion-catalog.js` est LA source. Ce script en dérive le miroir SQL,
   `migrations/migration_passion_taxonomy.sql`. `npm run valider:catalogue`
   régénère en mémoire et compare : les deux fichiers ne peuvent pas diverger
   sans faire rougir la CI.

   Usage :
     node scripts/generer-migration-catalogue.js            # écrit le fichier
     node scripts/generer-migration-catalogue.js --stdout   # imprime seulement
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const CIBLE = path.join(RACINE, "migrations", "migration_passion_taxonomy.sql");

// Littéral SQL. Les libellés sont du contenu de PROJET, pas d'utilisateur, mais
// une apostrophe non doublée casserait la migration entière : on ne fait
// confiance à rien qui parte dans une requête.
function q(v) {
  if (v === null || v === undefined) return "null";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function qJson(arr) {
  return q(JSON.stringify(arr || [])) + "::jsonb";
}

function generer() {
  const cat = require(path.join(RACINE, "js", "passion-catalog.js"));
  const L = [];
  const p = (s) => L.push(s);

  p("-- ═══════════════════════════════════════════════════════════════════════════");
  p("-- CATALOGUE HIÉRARCHIQUE DES PASSIONS — univers · passions · spécialités");
  p("-- Lot TAXO-1. Kill switch applicatif : `passion_taxonomy_v1`.");
  p("--");
  p("-- ⚠️ FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.");
  p("--    Source : js/passion-catalog.js");
  p("--    Régénérer : node scripts/generer-migration-catalogue.js");
  p("--    Vérifier  : npm run valider:catalogue  (échoue si les deux divergent)");
  p("--");
  p("-- PROPRIÉTÉS DE CETTE MIGRATION");
  p("--   · ADDITIVE     — elle ne supprime ni ne renomme aucune colonne, aucune");
  p("--                    ligne, aucune contrainte existante. `profiles.passions`,");
  p("--                    `posts.passion_id` et les cinq clés étrangères posées le");
  p("--                    2026-08-15 restent en place et gardent leur sens.");
  p("--   · IDEMPOTENTE  — `create ... if not exists`, `add column if not exists`,");
  p("--                    `insert ... on conflict do update`, `drop policy if exists`.");
  p("--                    La rejouer n'a aucun effet observable.");
  p("--   · RÉVERSIBLE   — le bloc de retour arrière en fin de fichier rend l'état");
  p("--                    d'avant sans toucher aux données de contenu.");
  p("--");
  p("-- ⚠️ LES 19 IDENTIFIANTS CANONIQUES NE BOUGENT PAS. Les `insert` sur");
  p("--    `public.passions` sont des upserts : `musique`, `photo`, `voyage`,");
  p("--    `cuisine`, `sport`, `litterature`, `cinema`, `tech`, `art`, `jardinage`,");
  p("--    `metier`, `jeuxvideo`, `yoga`, `mode`, `danse`, `podcast`, `moto`,");
  p("--    `animaux`, `actu` conservent leur `id`, leur libellé, leur emoji et leur");
  p("--    couleur ; seuls `universe_id`, `synonyms`, `popular` et `sort_order`");
  p("--    (nouveaux) sont renseignés. Aucune publication existante ne change de");
  p("--    classement.");
  p("--");
  p("-- ⚠️ AUCUN CONTENU N'EST MODIFIÉ. `specialty_id` naît `null` partout : une");
  p("--    publication, une story ou une activité d'avant ce lot reste parfaitement");
  p("--    valide et reste visible sous sa passion principale.");
  p("-- ═══════════════════════════════════════════════════════════════════════════");
  p("");
  p("begin;");
  p("");

  // ── 1. Univers ────────────────────────────────────────────────────────────
  p("-- ── 1. Les univers ─────────────────────────────────────────────────────────");
  p("-- Niveau de NAVIGATION seulement. Aucune colonne de contenu ne le référence :");
  p("-- il n'apparaît ni dans une identité, ni sur une carte, ni sur une publication.");
  p("create table if not exists public.passion_universes (");
  p("  id         text primary key,");
  p("  emoji      text not null,");
  p("  label      text not null,");
  p("  sort_order int  not null default 0,");
  p("  is_active  boolean not null default true");
  p(");");
  p("");
  p("insert into public.passion_universes (id, emoji, label, sort_order, is_active) values");
  p(cat.universes.map(u =>
    `  (${q(u.id)}, ${q(u.emoji)}, ${q(u.label)}, ${u.sort_order}, ${u.is_active})`).join(",\n"));
  p("on conflict (id) do update set");
  p("  emoji = excluded.emoji, label = excluded.label,");
  p("  sort_order = excluded.sort_order, is_active = excluded.is_active;");
  p("");

  // ── 2. passions étendue ───────────────────────────────────────────────────
  p("-- ── 2. `passions` reste le référentiel des passions PRINCIPALES ────────────");
  p("-- La table existe déjà (migration_passions_referentiel, appliquée le");
  p("-- 2026-08-15) et porte les cinq clés étrangères de contenu. On l'ÉTEND ;");
  p("-- on ne la remplace pas.");
  p("alter table public.passions add column if not exists universe_id text;");
  p("alter table public.passions add column if not exists synonyms    jsonb not null default '[]'::jsonb;");
  p("alter table public.passions add column if not exists popular     boolean not null default false;");
  p("alter table public.passions add column if not exists is_active   boolean not null default true;");
  p("");
  p("alter table public.passions drop constraint if exists passions_universe_fk;");
  p("alter table public.passions add  constraint passions_universe_fk");
  p("  foreign key (universe_id) references public.passion_universes(id) not valid;");
  p("");
  p("insert into public.passions (id, emoji, label, color, sort_order, universe_id, synonyms, popular, is_active) values");
  p(cat.passions.map(x =>
    `  (${q(x.id)}, ${q(x.emoji)}, ${q(x.label)}, ${q(x.color)}, ${x.sort_order}, ${q(x.universe_id)}, ${qJson(x.synonyms)}, ${x.popular}, ${x.is_active})`
  ).join(",\n"));
  p("on conflict (id) do update set");
  p("  emoji = excluded.emoji, label = excluded.label, color = excluded.color,");
  p("  sort_order = excluded.sort_order, universe_id = excluded.universe_id,");
  p("  synonyms = excluded.synonyms, popular = excluded.popular, is_active = excluded.is_active;");
  p("");
  p("alter table public.passions validate constraint passions_universe_fk;");
  p("");

  // ── 3. spécialités ────────────────────────────────────────────────────────
  p("-- ── 3. Les spécialités ─────────────────────────────────────────────────────");
  p("-- ⚠️ UNE SPÉCIALITÉ APPARTIENT À UNE SEULE PASSION. C'est `passion_id` qui le");
  p("-- dit, et la contrainte unique `(id, passion_id)` juste dessous est ce qui");
  p("-- permet aux tables de contenu de le VÉRIFIER — pas une validation en");
  p("-- JavaScript, qu'un client modifié contournerait en une ligne.");
  p("create table if not exists public.passion_specialties (");
  p("  id         text primary key,");
  p("  passion_id text not null references public.passions(id),");
  p("  label      text not null,");
  p("  synonyms   jsonb not null default '[]'::jsonb,");
  p("  sort_order int  not null default 0,");
  p("  is_active  boolean not null default true");
  p(");");
  p("");
  p("-- La cible des clés étrangères COMPOSITES des tables de contenu.");
  p("alter table public.passion_specialties");
  p("  drop constraint if exists passion_specialties_id_passion_key;");
  p("alter table public.passion_specialties");
  p("  add  constraint passion_specialties_id_passion_key unique (id, passion_id);");
  p("");
  p("create index if not exists idx_passion_specialties_passion");
  p("  on public.passion_specialties (passion_id);");
  p("create index if not exists idx_passion_specialties_actif");
  p("  on public.passion_specialties (passion_id, sort_order) where is_active;");
  p("");

  // Lots de 200 pour rester lisible et ne pas produire un seul insert géant.
  const lots = [];
  for (let i = 0; i < cat.specialties.length; i += 200) lots.push(cat.specialties.slice(i, i + 200));
  lots.forEach((lot, k) => {
    p(`-- spécialités ${k * 200 + 1} à ${k * 200 + lot.length} (sur ${cat.specialties.length})`);
    p("insert into public.passion_specialties (id, passion_id, label, synonyms, sort_order, is_active) values");
    p(lot.map(s =>
      `  (${q(s.id)}, ${q(s.passion_id)}, ${q(s.label)}, ${qJson(s.synonyms)}, ${s.sort_order}, ${s.is_active})`
    ).join(",\n"));
    p("on conflict (id) do update set");
    p("  passion_id = excluded.passion_id, label = excluded.label, synonyms = excluded.synonyms,");
    p("  sort_order = excluded.sort_order, is_active = excluded.is_active;");
    p("");
  });

  // ── 4. sélections utilisateur ─────────────────────────────────────────────
  p("-- ── 4. Les sélections de l'utilisateur ─────────────────────────────────────");
  p("-- ⚠️ CE N'EST PAS UN PROFIL PAR PASSION (ADR-010 §7). Aucune identité, aucun");
  p("-- pseudo, aucun abonné : deux tables de liaison, rien d'autre. Le pseudo,");
  p("-- l'avatar, la bio et les abonnés restent sur l'unique ligne `profiles`.");
  p("--");
  p("-- `profiles.passions` (jsonb) n'est NI supprimée NI remplacée : elle reste la");
  p("-- vitrine publique et la sauvegarde relue au démarrage d'un appareil neuf. Ces");
  p("-- tables la doublent le temps de la transition ; laquelle des deux fait");
  p("-- autorité sera tranché par un lot ultérieur, une fois le catalogue validé.");
  p("create table if not exists public.user_passions (");
  p("  user_id    text not null,");
  p("  passion_id text not null references public.passions(id),");
  p("  sort_order int  not null default 0,");
  p("  archived   boolean not null default false,");
  p("  created_at timestamptz not null default now(),");
  p("  primary key (user_id, passion_id)");
  p(");");
  p("create index if not exists idx_user_passions_user on public.user_passions (user_id);");
  p("create index if not exists idx_user_passions_passion on public.user_passions (passion_id);");
  p("");
  p("create table if not exists public.user_passion_specialties (");
  p("  user_id      text not null,");
  p("  specialty_id text not null,");
  p("  passion_id   text not null,");
  p("  created_at   timestamptz not null default now(),");
  p("  primary key (user_id, specialty_id),");
  p("  -- La spécialité ET sa passion, ensemble : impossible d'enregistrer");
  p("  -- « Enduro » sous « Cuisine ».");
  p("  constraint user_passion_specialties_paire_fk");
  p("    foreign key (specialty_id, passion_id)");
  p("    references public.passion_specialties (id, passion_id)");
  p(");");
  p("create index if not exists idx_user_pspec_user on public.user_passion_specialties (user_id);");
  p("create index if not exists idx_user_pspec_specialty on public.user_passion_specialties (specialty_id);");
  p("create index if not exists idx_user_pspec_passion on public.user_passion_specialties (passion_id);");
  p("");

  // ── 5. specialty_id sur le contenu ────────────────────────────────────────
  p("-- ── 5. Classement facultatif du contenu ────────────────────────────────────");
  p("-- ⚠️ LA COHÉRENCE EST VÉRIFIÉE PAR LA BASE, PAS PAR LE CLIENT. La clé");
  p("-- étrangère porte sur le COUPLE `(specialty_id, passion_id)` : une");
  p("-- publication classée « Moto » ne peut pas porter la spécialité");
  p("-- « moto-enduro » d'une autre passion, ni « cuisine-patisserie ».");
  p("--");
  p("-- ⚠️ ET LA CONTRAINTE `check` EST INDISPENSABLE. En `match simple` — le");
  p("-- défaut — une clé étrangère composite dont UNE colonne est nulle est");
  p("-- considérée satisfaite SANS VÉRIFICATION. Une ligne portant");
  p("-- `specialty_id = 'moto-enduro'` et `passion_id = null` passerait donc la");
  p("-- clé étrangère : le `check` est la seule chose qui l'interdit.");
  ["posts", "stories", "events"].forEach(t => {
    p(`alter table public.${t} add column if not exists specialty_id text;`);
    p(`alter table public.${t} drop constraint if exists ${t}_specialty_fk;`);
    p(`alter table public.${t} add  constraint ${t}_specialty_fk`);
    p(`  foreign key (specialty_id, passion_id)`);
    p(`  references public.passion_specialties (id, passion_id) not valid;`);
    p(`alter table public.${t} validate constraint ${t}_specialty_fk;`);
    p(`alter table public.${t} drop constraint if exists ${t}_specialty_needs_passion;`);
    p(`alter table public.${t} add  constraint ${t}_specialty_needs_passion`);
    p(`  check (specialty_id is null or passion_id is not null) not valid;`);
    p(`alter table public.${t} validate constraint ${t}_specialty_needs_passion;`);
    p(`create index if not exists idx_${t}_specialty on public.${t} (specialty_id) where specialty_id is not null;`);
    p("");
  });

  // ── 6. RLS ────────────────────────────────────────────────────────────────
  p("-- ── 6. Row Level Security ──────────────────────────────────────────────────");
  p("-- LE CATALOGUE : lisible par l'application, écrit par PERSONNE.");
  p("-- Aucune policy insert/update/delete n'est créée. Avec la RLS active et");
  p("-- aucune policy d'écriture, `anon` et `authenticated` sont refusés — c'est");
  p("-- ce qui empêche un client, même authentifié, de fabriquer une passion ou");
  p("-- une spécialité, et donc de contourner la liste blanche.");
  ["passion_universes", "passion_specialties"].forEach(t => {
    p(`alter table public.${t} enable row level security;`);
    p(`drop policy if exists ${t}_select_all on public.${t};`);
    p(`create policy ${t}_select_all on public.${t} for select using (true);`);
  });
  p("");
  p("-- `passions` a déjà `passions_select_all` (2026-08-15) ; on la repose pour");
  p("-- que cette migration soit auto-portante si elle est rejouée sur une base neuve.");
  p("alter table public.passions enable row level security;");
  p("drop policy if exists passions_select_all on public.passions;");
  p("create policy passions_select_all on public.passions for select using (true);");
  p("");
  p("-- LES SÉLECTIONS : chacun n'écrit que les siennes.");
  p("-- ⚠️ `auth.uid()::text` — la convention du dépôt : les colonnes");
  p("-- d'identifiant sont en `text`, pas en `uuid`. Comparer un `uuid` à un");
  p("-- `text` sans cast échoue à l'exécution, pas à la création de la policy.");
  p("--");
  p("-- ⚠️ `(select auth.uid())` et non `auth.uid()` : la forme non enveloppée est");
  p("-- réévaluée PAR LIGNE (initplan), ce que les migrations");
  p("-- `migration_rls_initplan_*` du dépôt ont déjà corrigé ailleurs.");
  ["user_passions", "user_passion_specialties"].forEach(t => {
    p(`alter table public.${t} enable row level security;`);
    ["select", "insert", "update", "delete"].forEach(act => {
      p(`drop policy if exists ${t}_${act}_own on public.${t};`);
      const cond = `user_id = (select auth.uid())::text`;
      if (act === "insert") p(`create policy ${t}_${act}_own on public.${t} for insert with check (${cond});`);
      else if (act === "update") p(`create policy ${t}_${act}_own on public.${t} for update using (${cond}) with check (${cond});`);
      else p(`create policy ${t}_${act}_own on public.${t} for ${act} using (${cond});`);
    });
    p("");
  });
  p("-- ⚠️ LA LECTURE EST VOLONTAIREMENT LIMITÉE À SOI. Les sélections d'un TIERS");
  p("-- ne passent pas par ces tables : elles restent servies par la vitrine");
  p("-- `profiles.passions`, déjà soumise aux règles de visibilité du profil");
  p("-- (compte privé, blocage). Ouvrir `user_passions` en lecture publique");
  p("-- court-circuiterait ces règles — un compte privé y verrait ses centres");
  p("-- d'intérêt exposés. À rouvrir seulement avec une policy qui rejoue la");
  p("-- visibilité de `profiles`, jamais avec `using (true)`.");
  p("");
  p("commit;");
  p("");
  p("-- ═══════════════════════════════════════════════════════════════════════════");
  p("-- EXPOSITION AU DATA API (à vérifier après application)");
  p("--   select tablename, rowsecurity from pg_tables");
  p("--    where schemaname='public'");
  p("--      and tablename in ('passion_universes','passion_specialties',");
  p("--                        'user_passions','user_passion_specialties');");
  p("--   -> rowsecurity doit valoir true sur les quatre.");
  p("--");
  p("--   select tablename, policyname, cmd from pg_policies");
  p("--    where schemaname='public' and tablename like 'passion%'");
  p("--       or tablename like 'user_passion%' order by tablename, cmd;");
  p("--   -> catalogue : SELECT seulement. Sélections : 4 policies, toutes");
  p("--      ancrées sur auth.uid().");
  p("--");
  p("-- RETOUR ARRIÈRE COMPLET (aucune donnée de contenu perdue : `specialty_id`");
  p("-- vaut `null` partout tant que le lot n'a pas tourné en production)");
  p("--   begin;");
  ["posts", "stories", "events"].forEach(t => {
    p(`--     alter table public.${t} drop constraint if exists ${t}_specialty_fk;`);
    p(`--     alter table public.${t} drop constraint if exists ${t}_specialty_needs_passion;`);
    p(`--     drop index if exists public.idx_${t}_specialty;`);
    p(`--     alter table public.${t} drop column if exists specialty_id;`);
  });
  p("--     drop table if exists public.user_passion_specialties;");
  p("--     drop table if exists public.user_passions;");
  p("--     drop table if exists public.passion_specialties;");
  p("--     alter table public.passions drop constraint if exists passions_universe_fk;");
  p("--     alter table public.passions drop column if exists universe_id;");
  p("--     alter table public.passions drop column if exists synonyms;");
  p("--     alter table public.passions drop column if exists popular;");
  p("--     alter table public.passions drop column if exists is_active;");
  p("--     delete from public.passions where id not in (");
  p("--       " + cat.canoniques.map(q).join(", "));
  p("--     );   -- refusé par la clé étrangère si une publication en référence une");
  p("--     drop table if exists public.passion_universes;");
  p("--   commit;");
  p("-- ⚠️ Le `delete` ci-dessus ne rend PAS leur `sort_order` d'origine aux 19");
  p("--    canoniques : rejouer `migrations/migration_passions_referentiel.sql`");
  p("--    le fait, et c'est le seul geste restant.");
  p("-- ═══════════════════════════════════════════════════════════════════════════");

  return L.join("\n") + "\n";
}

module.exports = { generer, CIBLE };

if (require.main === module) {
  const sql = generer();
  if (process.argv.includes("--stdout")) { process.stdout.write(sql); }
  else {
    fs.writeFileSync(CIBLE, sql, "utf8");
    console.log("✓ " + path.relative(RACINE, CIBLE) + " — " + sql.split("\n").length + " lignes");
  }
}
