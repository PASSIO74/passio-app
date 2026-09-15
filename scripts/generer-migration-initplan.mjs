#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRER LA MIGRATION « auth.uid() → (select auth.uid()) » (PERF-03, 2026-09-14)
//
//   node scripts/generer-migration-initplan.mjs > migrations/migration_rls_initplan_<date>.sql
//
// Le linter Supabase (`auth_rls_initplan`) signale 71 policies qui appellent
// `auth.uid()` NU : PostgreSQL le réévalue à CHAQUE ligne. Enveloppé dans un
// sous-select, il est calculé une fois par requête (InitPlan). Réécrire 71
// policies à la main serait la garantie d'une faute ; ce script LIT chaque
// policy telle qu'elle est en production (`pg_policies`, via l'API de gestion,
// même lecture que l'éditeur SQL), applique la SEULE transformation
// mécanique — `auth.uid()` hors d'un sous-select devient `(select auth.uid())`
// — et émet `drop policy` + `create policy` à l'identique pour tout le reste
// (commande, rôles, permissive, USING, WITH CHECK). Rien d'autre ne change.
//
// ⚠️ La sémantique est strictement conservée : `(select auth.uid())` rend la
// même valeur que `auth.uid()` dans le même contexte. La transformation est
// verrouillée en unitaire (`tests/unit/initplan-reecriture.test.mjs`) ; la
// migration l'est par l'advisor (0 finding après application) et par les
// suites à comptes réels de la CI (`authz-critical`).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const JALON = ""; // marque temporaire d'un sous-select déjà en place

export function reecrire(expr) {
  if (!expr) return expr;
  // `( SELECT auth.uid() AS uid)` (déjà réécrit) et `(select auth.uid())` sont
  // préservés ; tout `auth.uid()` NU est enveloppé.
  return expr.replace(/\(\s*select\s+auth\.uid\(\)(\s+as\s+uid)?\s*\)/gi, JALON)
    .replace(/auth\.uid\(\)/g, "(select auth.uid())")
    .split(JALON).join("(select auth.uid())");
}

export function policyEnSql(p) {
  // `roles` arrive en texte PostgreSQL (`{authenticated,anon}`) par l'API de gestion.
  const liste = Array.isArray(p.roles) ? p.roles : String(p.roles || "{public}").replace(/^{|}$/g, "").split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
  const roles = liste.map((r) => r === "public" ? "public" : `"${r}"`).join(", ") || "public";
  const permissive = String(p.permissive || "PERMISSIVE").toUpperCase() === "PERMISSIVE" ? "permissive" : "restrictive";
  const using = p.qual ? `\n  using (${reecrire(p.qual)})` : "";
  const check = p.with_check ? `\n  with check (${reecrire(p.with_check)})` : "";
  return `drop policy if exists "${p.policyname}" on public."${p.tablename}";\n`
    + `create policy "${p.policyname}" on public."${p.tablename}"\n  as ${permissive} for ${String(p.cmd).toLowerCase()} to ${roles}${using}${check};`;
}

// Une policy est concernée si, après réécriture, quelque chose a changé.
export function concernee(p) {
  const nu = (e) => /auth\.uid\(\)/.test(String(e || "").replace(/\(\s*select\s+auth\.uid\(\)(\s+as\s+uid)?\s*\)/gi, ""));
  return nu(p.qual) || nu(p.with_check);
}

async function lirePolicies() {
  const cheminJeton = resolve(homedir(), ".supabase", "access-token");
  const jeton = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(cheminJeton) ? readFileSync(cheminJeton, "utf8").trim() : null);
  const ref = process.env.SUPABASE_PROJECT_REF || readFileSync(resolve("supabase", ".temp", "project-ref"), "utf8").trim();
  if (!jeton) throw new Error("jeton CLI absent");
  const query = "select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename, policyname";
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error("API " + r.status + " " + (await r.text()).slice(0, 200));
  return await r.json();
}

const VERDICT = "select 'policies avec auth.uid() nu' as controle, count(*)::text as valeur from pg_policies where schemaname = 'public' and (regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\\(\\s*(SELECT|select)\\s+auth\\.uid\\(\\)( AS uid)?\\s*\\)', '', 'g') ~ 'auth\\.uid\\(\\)');";

if (process.argv[1] && /generer-migration-initplan\.mjs$/.test(process.argv[1])) {
  const toutes = await lirePolicies();
  const cibles = toutes.filter(concernee);
  const date = new Date().toISOString().slice(0, 10);
  const out = [];
  out.push("-- ═══════════════════════════════════════════════════════════════════════════");
  out.push(`-- RLS — auth.uid() calculé une fois par requête, pas par ligne (PERF-03, ${date})`);
  out.push("--");
  out.push("-- GÉNÉRÉ par scripts/generer-migration-initplan.mjs depuis les policies de");
  out.push(`-- production : ${cibles.length} policies réécrites, à l'identique sauf`);
  out.push("-- `auth.uid()` → `(select auth.uid())`. Une transaction, rejouable, verdict");
  out.push("-- en fin (policies qui appellent encore auth.uid() nu : attendu 0).");
  out.push("-- Vérification après application : get_advisors(performance) — auth_rls_initplan");
  out.push("-- = 0 — et les suites à comptes réels de la CI (authz-critical), qui exercent");
  out.push("-- ces policies. Ne pas retoucher à la main : régénérer.");
  out.push("-- ═══════════════════════════════════════════════════════════════════════════");
  out.push("begin;");
  for (const p of cibles) { out.push(""); out.push(`-- ${p.tablename} · ${p.policyname} (${p.cmd})`); out.push(policyEnSql(p)); }
  out.push("");
  out.push(VERDICT);
  out.push("commit;");
  process.stdout.write(out.join("\n") + "\n");
}
