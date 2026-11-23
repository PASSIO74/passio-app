#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// BANC DU JEU DE COMPTES PERSISTANTS — depuis le poste, sur le STAGING (D16-01).
//
// La CI ne prouve le jeu persistant qu'une fois la gouvernance passée (le job
// « Suites production » en dépend). Ce lanceur le prouve AVANT, depuis le
// poste : il lance les suites à comptes réels qui n'exigent pas
// `PASSIO_E2E_MULTI`, DEUX FOIS, et lit le bilan de chaque passage.
// Attendu : le premier passage amorce le couloir `poste` (≤ quelques comptes),
// le second n'en crée AUCUN.
//
// ⚠️ Sans `PASSIO_E2E_MULTI` ni `PASSIO_E2E_PROD` : le teardown ne lance AUCUNE
// purge par motif. Une suite d'une autre branche qui tourne au même moment sur
// le staging ne perd donc rien. Les clés viennent de l'API de gestion (jeton
// `supabase login`), comme `npm run village`, et ne sont jamais affichées.
//
//   node scripts/banc-comptes-persistants.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { STAGING_REF } from "./lib/charge-realiste.mjs";

const require = createRequire(import.meta.url);
if (process.env.GITHUB_ACTIONS || process.env.CI) { console.error("[banc] refusé en CI : la CI a son propre passage."); process.exit(2); }

const patPath = resolve(homedir(), ".supabase", "access-token");
const pat = (process.env.SUPABASE_ACCESS_TOKEN || (existsSync(patPath) ? readFileSync(patPath, "utf8") : "")).trim();
if (!pat) { console.error("[banc] jeton personnel Supabase introuvable (`supabase login`)."); process.exit(2); }
const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${pat}` } });
if (!r.ok) { console.error(`[banc] clés du staging illisibles : HTTP ${r.status}`); process.exit(2); }
const cles = await r.json().catch(() => null);
const anon = Array.isArray(cles) && (cles.find((k) => k.name === "anon") || {}).api_key;
const service = Array.isArray(cles) && (cles.find((k) => k.name === "service_role") || {}).api_key;
if (!anon || !service) { console.error("[banc] clés anon/service_role du staging absentes."); process.exit(2); }

const SUITES = ["authz-critical", "blocage-acces", "irl-trust-safety-reel", "user-state-horodatage"].map((s) => `tests/e2e/${s}.spec.js`);
const { SUPABASE_ACCESS_TOKEN: _p, PASSIO_E2E_MULTI: _m, PASSIO_E2E_PROD: _d, PASSIO_E2E_COMPTES_JETABLES: _j, ...envParent } = process.env;
const url = `https://${STAGING_REF}.supabase.co`;
const env = { ...envParent, PASSIO_SUPABASE_URL: url, PASSIO_SUPABASE_ANON: anon, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service,
  PASSIO_PORT: process.env.PASSIO_PORT || "8094" };

const jeu = require("../tests/e2e/comptes-persistants.js");
const cfg = { url, cle: service };
const avant = (await jeu.comptesDuJeu(cfg)).length;
console.log(`[banc] staging ${STAGING_REF} — comptes du jeu avant : ${avant}`);

let code = 0;
for (const n of [1, 2]) {
  const res = spawnSync("npx", ["playwright", "test", ...SUITES, "--project=prod", "--retries=0", "--reporter=line"],
    { stdio: "inherit", env, shell: process.platform === "win32" });
  const apres = (await jeu.comptesDuJeu(cfg)).length;
  console.log(`[banc] passage ${n} : code ${res.status} ; comptes du jeu : ${apres}`);
  if (res.status !== 0) code = res.status || 1;
}
process.exit(code);
