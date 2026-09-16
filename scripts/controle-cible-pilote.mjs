#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CONTRÔLES EN LECTURE SEULE DE LA CIBLE — le kit du pilote (dossier de
// livraison §6, 2026-09-16). « Corrigé / testé » ne dit rien de la cible : ce
// script MESURE ce qui est servi et ce qui est appliqué, sans rien écrire.
//
//   node scripts/controle-cible-pilote.mjs --public [--attendu <sha>]
//       lit ce qui est PUBLIC : `release.json` du site (commit servi) et
//       l'en-tête `X-Passio-Revision` des quatre Edge Functions (OPTIONS).
//       Avec --attendu, compare au SHA candidat et sort 1 sur écart.
//   node scripts/controle-cible-pilote.mjs --sql
//       imprime les requêtes EN LECTURE SEULE à exécuter sur la base (connecteur
//       `execute_sql` du projet en lecture seule, ou l'éditeur SQL) : journal
//       des migrations, prérequis des fonctions, catalogue des tables de
//       compte, RLS et droits des tables de compte, marqueur de suppression.
//   node scripts/controle-cible-pilote.mjs --json <dossier>
//       compare les résultats enregistrés (`journal.json`, `prerequis.json`,
//       `catalogue.json`, `rls.json`) à ce que le candidat attend ; sort 1 sur
//       écart. Les fichiers sont ceux rendus par les requêtes de --sql.
//
// Ce que ce kit NE fait pas : une suppression authentifiée de bout en bout
// (§5 du dossier : compte jetable, 200 + garantie, relectures à zéro). Une
// fumée OPTIONS 200 / POST anonyme 401 ne la remplace pas.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const racine = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SITE = process.env.PASSIO_SITE || "https://passio-app.netlify.app";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://njkiyoklssvefstljemx.supabase.co";
const FONCTIONS = ["delete-account", "export-account", "notify-call", "ask-ai"];
const MIGRATIONS_CANDIDAT = [
  "migrations/migration_barriere_suppression_2026-09-15.sql",
  "migrations/migration_objets_stockage_compte_2026-09-15.sql",
  "migrations/migration_proprietaires_objets_stockage_2026-09-15.sql",
  "migrations/migration_export_instantane_2026-09-15.sql",
  "migrations/migration_notifications_serveur_2026-09-15.sql",
];

let ecarts = 0;
const ok = (m) => console.log("  ✅ " + m);
const ko = (m) => { ecarts++; console.log("  ❌ " + m); };
const info = (m) => console.log("  ℹ " + m);

async function publicLecture() {
  const attendu = val("--attendu");
  console.log("── SITE : " + SITE + "/release.json");
  try {
    const r = await fetch(SITE + "/release.json", { cache: "no-store" });
    const j = await r.json();
    info(`commit servi = ${j.commit || "null"} · buildId ${j.buildId}`);
    if (attendu) (j.commit === attendu ? ok : ko)("le site sert le SHA attendu " + attendu.slice(0, 12));
  } catch (e) { ko("release.json illisible : " + e.message); }
  console.log("── EDGE FUNCTIONS : X-Passio-Revision (OPTIONS)");
  for (const f of FONCTIONS) {
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/" + f, { method: "OPTIONS" });
      const rev = r.headers.get("x-passio-revision");
      info(`${f} : HTTP ${r.status} · révision ${rev || "ABSENTE (version antérieure au candidat : non vérifiable)"}`);
      if (attendu) (rev === attendu ? ok : ko)(`${f} sert le SHA attendu`);
    } catch (e) { ko(f + " injoignable : " + e.message); }
  }
}

function empreinte(sql) { return createHash("sha256").update(String(sql).replace(/\r\n/g, "\n"), "utf8").digest("hex"); }

function sqlLectureSeule() {
  const prerequis = execFileSync(process.execPath, [join(racine, "scripts", "verifier-prerequis-fonctions.mjs"), "--sql"], { encoding: "utf8" }).replace(/^set transaction read only;\n/, "");
  const catalogue = execFileSync(process.execPath, [join(racine, "scripts", "controle-tables-compte-cible.js"), "--sql"], { encoding: "utf8" });
  const attendues = MIGRATIONS_CANDIDAT.map((m) => `  -- ${m} → empreinte candidat ${existsSync(join(racine, m)) ? empreinte(readFileSync(join(racine, m), "utf8")) : "(fichier absent)"}`).join("\n");
  return [
    "-- ═══ 1. JOURNAL DES MIGRATIONS (ce que l'outil a appliqué, avec l'empreinte du contenu) ═══",
    "-- Les empreintes attendues par le candidat :",
    attendues,
    "select fichier, empreinte, cible, statut, applique_le from public.migrations_appliquees order by applique_le;",
    "",
    "-- ═══ 2. PRÉREQUIS DES FONCTIONS (présence des objets, signatures, textes) ═══",
    prerequis.trim(),
    "",
    "-- ═══ 3. CATALOGUE DES TABLES DE COMPTE (à comparer à TABLES_COMPTE ∪ exceptions) ═══",
    catalogue.trim(),
    "",
    "-- ═══ 4. RLS ET DROITS EFFECTIFS ═══",
    "select c.relname as table_, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forcee",
    "  from pg_class c join pg_namespace n on n.oid = c.relnamespace",
    " where n.nspname = 'public' and c.relkind = 'r' order by 1;",
    "select grantee, privilege_type from information_schema.role_table_grants",
    " where table_schema = 'public' and table_name = 'comptes_en_suppression' order by 1, 2;",
    "-- attendu : aucun droit pour anon/authenticated ; service_role : SELECT seulement.",
    "select count(*) filter (where tgname = 'zz_barriere_suppression') as triggers_barriere from pg_trigger where not tgisinternal;",
    "-- attendu : une ligne par table de TABLES_COMPTE présente sur la cible.",
    "",
    "-- ═══ 5. MARQUEURS DE SUPPRESSION (état, sans identifiant de compte affiché) ═══",
    "select statut, tentative_vivante, count(*) from public.comptes_en_suppression group by 1, 2 order by 1, 2;",
  ].join("\n") + "\n";
}

function lireJson(dossier, nom) {
  const p = join(dossier, nom);
  if (!existsSync(p)) return null;
  let j = JSON.parse(readFileSync(p, "utf8"));
  if (j && !Array.isArray(j) && Array.isArray(j.rows)) j = j.rows;
  return j;
}

function comparer(dossier) {
  console.log("── 1. JOURNAL DES MIGRATIONS");
  const journal = lireJson(dossier, "journal.json");
  if (!journal) ko("journal.json absent : le journal n'a pas été lu (non mesuré)");
  else {
    for (const m of MIGRATIONS_CANDIDAT) {
      const emp = existsSync(join(racine, m)) ? empreinte(readFileSync(join(racine, m), "utf8")) : null;
      const lignes = journal.filter((l) => l.fichier === m);
      if (!lignes.length) ko(`${m} : AUCUNE application journalisée`);
      else if (emp && lignes.some((l) => l.empreinte === emp)) ok(`${m} : appliquée avec l'empreinte du candidat`);
      else ko(`${m} : appliquée (${lignes.length}) mais avec une AUTRE empreinte (${lignes.map((l) => String(l.empreinte).slice(0, 12)).join(", ")}) — contenu différent du candidat`);
    }
  }
  console.log("── 2. PRÉREQUIS DES FONCTIONS");
  const pre = lireJson(dossier, "prerequis.json");
  if (!pre) ko("prerequis.json absent (non mesuré)");
  else for (const l of pre) (l.present === true || l.present === "t" ? ok : ko)(l.spec);
  console.log("── 3. CATALOGUE DES TABLES DE COMPTE");
  const cat = lireJson(dossier, "catalogue.json");
  if (!cat) ko("catalogue.json absent (non mesuré)");
  else {
    const { comparerCatalogue, lireTablesCompte } = require("./lib/tables-compte-catalogue.js");
    const r = comparerCatalogue(cat, { connues: lireTablesCompte(racine) });
    info(`${r.total} colonne(s) ; ${r.couverts.length} couverte(s), ${r.dispenses.length} dispensée(s)`);
    for (const o of r.oublis) ko(`${o.cle} (${o.type}, ${o.source}) : NI purgée NI dispensée`);
    if (!r.oublis.length) ok("toutes les colonnes d'identifiant de compte de la cible sont couvertes");
  }
  console.log("── 4. RLS");
  const rls = lireJson(dossier, "rls.json");
  if (!rls) ko("rls.json absent (non mesuré)");
  else { const sans = rls.filter((l) => l.rls === false || l.rls === "f"); (sans.length ? ko : ok)(sans.length ? "tables SANS RLS : " + sans.map((l) => l.table_).join(", ") : "RLS active sur toutes les tables de public"); }
}

if (args.includes("--public")) await publicLecture();
else if (args.includes("--sql")) process.stdout.write(sqlLectureSeule());
else if (val("--json")) comparer(resolve(val("--json")));
else { console.error("usage : --public [--attendu <sha>] | --sql | --json <dossier>"); process.exit(2); }
if (ecarts) { console.log(`\n❌ ${ecarts} écart(s) : la cible n'est pas dans l'état du candidat.`); process.exit(1); }
if (!args.includes("--sql")) console.log("\n✅ aucun écart sur ce qui a été mesuré (ce qui n'a pas été lu est dit « non mesuré »).");
