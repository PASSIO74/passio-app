#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// LA RETENUE DU DÉPLOIEMENT DES EDGE FUNCTIONS (ASTRA-64, sixième contre-revue
// Astra, 2026-09-16) — « fusion → migration → déploiement » n'était garanti par
// rien : le push sur `main` déclenchait `edge-functions.yml` aussitôt, et seule
// la durée des tests laissait, par hasard, le temps d'appliquer une migration.
//
// ICI : AVANT `supabase functions deploy`, on LIT la cible (catalogue, en
// lecture seule : `set transaction read only`) et on vérifie que chaque objet
// SQL qu'une fonction EXIGE (`.passio/deploiement/prerequis-fonctions.json`)
// existe. Un prérequis `obligatoire` absent → code 1 → le job s'arrête AVANT le
// déploiement : la fonction en service reste celle d'avant, la migration est
// nommée. Un prérequis facultatif absent est DIT (résumé), pas bloquant : la
// fonction se dégrade honnêtement (repli d'export, mentions silencieuses).
//
//   node scripts/verifier-prerequis-fonctions.mjs --fonctions "delete-account export-account" \
//        [--projet <ref>]            # via l'API de gestion (SUPABASE_ACCESS_TOKEN) — la CI
//        [--psql "<conninfo>"]       # via psql — les bancs
//        [--json <resultat.json>]    # à partir d'un résultat déjà lu (connecteur en lecture seule)
//        [--sql]                     # imprime la requête, n'exécute rien
//
// Ce que ça ne fait PAS : appliquer quoi que ce soit (ADR-012 : aucun DDL depuis
// la CI — la transaction est `read only`, un ordre d'écriture y ÉCHOUERAIT).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const racine = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const MANIFESTE = process.env.PASSIO_PREREQUIS ? resolve(process.env.PASSIO_PREREQUIS) : resolve(racine, ".passio", "deploiement", "prerequis-fonctions.json");

function echec(msg) { console.error("❌ " + msg); process.exit(2); }
function litteral(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

/** Décompose "function:public.f(a,b)" etc. en { genre, schema, nom, args, colonne, motif }. */
export function lireObjet(spec) {
  let m;
  if ((m = /^function:([a-z_]+)\.([a-z_0-9]+)\(([^)]*)\)$/.exec(spec))) return { genre: "function", schema: m[1], nom: m[2], args: m[3].split(",").map((x) => x.trim()).filter(Boolean) };
  if ((m = /^column:([a-z_]+)\.([a-z_0-9]+)\.([a-z_0-9]+)$/.exec(spec))) return { genre: "column", schema: m[1], nom: m[2], colonne: m[3] };
  if ((m = /^table:([a-z_]+)\.([a-z_0-9]+)$/.exec(spec))) return { genre: "table", schema: m[1], nom: m[2] };
  if ((m = /^source:([a-z_]+)\.([a-z_0-9]+)~(.+)$/.exec(spec))) return { genre: "source", schema: m[1], nom: m[2], motif: m[3] };
  throw new Error("prérequis illisible : " + spec);
}

/** Une requête EN LECTURE SEULE qui rend, pour chaque spec, { spec, present }. */
export function sqlPrerequis(specs) {
  const parts = specs.map((spec) => {
    const o = lireObjet(spec);
    let cond;
    if (o.genre === "function") {
      // La signature par les types d'arguments, sans les noms : `pg_get_function_identity_arguments`
      // rend « p_uid text, p_jeton uuid » ; on compare les TYPES dans l'ordre.
      cond = `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = ${litteral(o.schema)} and p.proname = ${litteral(o.nom)}
                  and array_to_string(array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t), ',') = ${litteral(o.args.join(","))})`;
    } else if (o.genre === "column") {
      cond = `exists (select 1 from information_schema.columns where table_schema = ${litteral(o.schema)} and table_name = ${litteral(o.nom)} and column_name = ${litteral(o.colonne)})`;
    } else if (o.genre === "table") {
      cond = `exists (select 1 from information_schema.tables where table_schema = ${litteral(o.schema)} and table_name = ${litteral(o.nom)} and table_type = 'BASE TABLE')`;
    } else {
      cond = `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = ${litteral(o.schema)} and p.proname = ${litteral(o.nom)} and position(${litteral(o.motif)} in p.prosrc) > 0)`;
    }
    return `select ${litteral(spec)} as spec, (${cond}) as present`;
  });
  return "set transaction read only;\n" + parts.join("\nunion all\n") + ";";
}

/** Normalise les types tels que format_type les rend (« text[] », « integer », « bigint »). */
function normaliserSpecs(specs) { return specs; }

function chargerManifeste() {
  if (!existsSync(MANIFESTE)) echec("manifeste des prérequis introuvable : " + MANIFESTE);
  const j = JSON.parse(readFileSync(MANIFESTE, "utf8"));
  if (!j || typeof j.fonctions !== "object") echec("manifeste sans `fonctions`");
  return j.fonctions;
}

function lireJeton() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const p = resolve(homedir(), ".supabase", "access-token");
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
}

async function lireLignes(sql) {
  if (val("--json")) {
    let l = JSON.parse(readFileSync(val("--json"), "utf8"));
    if (l && !Array.isArray(l) && Array.isArray(l.rows)) l = l.rows;
    return l;
  }
  if (val("--psql")) {
    // `set transaction read only` doit être dans la même transaction que le SELECT : -1 (single transaction).
    const out = execFileSync("psql", [val("--psql"), "-tA", "-1", "-v", "ON_ERROR_STOP=1", "-c", "set transaction read only; select coalesce(jsonb_agg(x), '[]'::jsonb) from (" + sql.replace(/^set transaction read only;\n/, "").replace(/;\s*$/, "") + ") x"], { encoding: "utf8" });
    // psql imprime le tag « SET » de la première instruction : on ne garde que le JSON.
    const json = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith("[")) || "[]";
    return JSON.parse(json);
  }
  const ref = val("--projet") || process.env.SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref)) echec("cible : --projet <ref> (20 lettres) ou SUPABASE_PROJECT_REF, ou --psql / --json.");
  const jeton = lireJeton();
  if (!jeton) echec("aucun jeton (SUPABASE_ACCESS_TOKEN) pour lire la cible " + ref + ".");
  // L'API de gestion exécute le texte tel quel dans une transaction : `set transaction read only` y vaut.
  const r = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", { method: "POST", headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json" }, body: JSON.stringify({ query: "begin;\n" + sql + "\ncommit;" }) });
  const t = await r.text();
  if (!r.ok) echec("lecture de la cible " + ref + " : API " + r.status + " " + t.slice(0, 200) + " — NON VÉRIFIABLE, le déploiement est retenu.");
  try { const j = JSON.parse(t); return Array.isArray(j) ? j : (j.rows || []); } catch (e) { echec("réponse illisible de l'API : " + t.slice(0, 120)); }
}

const fonctionsDemandees = (val("--fonctions") || "").split(/[\s,]+/).filter(Boolean);
const manifeste = chargerManifeste();
const noms = fonctionsDemandees.length ? fonctionsDemandees : Object.keys(manifeste);
for (const f of noms) if (!manifeste[f]) echec("fonction inconnue du manifeste des prérequis : " + f + " — la déclarer dans " + MANIFESTE + " (même sans prérequis) avant de la déployer.");
const specs = [...new Set(noms.flatMap((f) => manifeste[f].objets || []))];
const sql = sqlPrerequis(normaliserSpecs(specs));
if (args.includes("--sql")) { process.stdout.write(sql + "\n"); process.exit(0); }

const lignes = await lireLignes(sql);
if (!Array.isArray(lignes)) echec("résultat illisible : NON VÉRIFIABLE, le déploiement est retenu.");
const present = new Map(lignes.map((l) => [String(l.spec), l.present === true || l.present === "t" || l.present === "true"]));
for (const s of specs) if (!present.has(s)) echec("la cible n'a pas répondu pour « " + s + " » : NON VÉRIFIABLE, le déploiement est retenu.");

let bloquant = false;
const resume = [];
for (const f of noms) {
  const d = manifeste[f];
  const manquants = (d.objets || []).filter((s) => !present.get(s));
  const etat = manquants.length === 0 ? "prérequis présents" : (d.obligatoire ? "RETENUE" : "dégradée (facultatif absent)");
  resume.push({ fonction: f, etat, manquants, migration: d.migration || null, sans: d.sans || null });
  if (manquants.length && d.obligatoire) bloquant = true;
}
for (const r of resume) {
  const icone = r.etat === "RETENUE" ? "❌" : r.manquants.length ? "⚠️" : "✅";
  console.log(`${icone} ${r.fonction} : ${r.etat}${r.manquants.length ? " — manque : " + r.manquants.join(", ") : ""}`);
  if (r.manquants.length) { if (r.migration) console.log(`   migration à appliquer d'abord : ${r.migration} (npm run migration:appliquer -- ${r.migration})`); if (r.sans) console.log(`   sans elle : ${r.sans}`); }
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import("node:fs");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Prérequis SQL des Edge Functions (lecture seule de la cible)\n\n" + resume.map((r) => `- ${r.etat === "RETENUE" ? "❌" : r.manquants.length ? "⚠️" : "✅"} **${r.fonction}** : ${r.etat}${r.manquants.length ? " — manque : `" + r.manquants.join("`, `") + "`" : ""}`).join("\n") + "\n\n");
}
if (bloquant) { console.error("\n❌ déploiement RETENU : une fonction exige une migration que la cible n'a pas. Appliquer la migration (canal ③, avec preuve de revue), puis relancer le workflow."); process.exit(1); }
console.log("\n✅ aucun prérequis obligatoire ne manque : le déploiement peut partir.");
