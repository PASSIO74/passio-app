#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// VILLAGE — lanceur de la simulation à 10 comptes (tests/e2e/village-10-comptes.spec.js).
//
// POURQUOI UN LANCEUR. La suite écrit en base avec la clé de service : elle ne
// doit viser QUE le staging. Plutôt que de demander trois variables à recopier
// (et un jour de se tromper de projet), ce lanceur :
//   ① lit le jeton personnel de la CLI (`~/.supabase/access-token`, ou
//      SUPABASE_ACCESS_TOKEN) et demande à l'API de gestion les clés du
//      STAGING, et de lui seul (référence figée, `STAGING_REF`) ;
//   ② pose les quatre variables de la cible (`docs/STAGING.md`) dans
//      l'environnement du SEUL processus Playwright — rien n'est écrit sur
//      disque, aucune clé n'est imprimée ;
//   ③ refuse la CI : la suite ouvre dix navigateurs, ce n'est pas un contrôle
//      de déploiement.
//
//   npm run village                 # 10 navigateurs invisibles
//   npm run village -- --headed     # regarder les 10 fenêtres en direct
//
// Le rapport : test-results/village/rapport.md (+ rapport.json).
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { STAGING_REF } from "./lib/charge-realiste.mjs";

if (process.env.GITHUB_ACTIONS || process.env.CI) {
  console.error("[village] refusé en CI : simulation de poste, dix navigateurs.");
  process.exit(2);
}

const patPath = resolve(homedir(), ".supabase", "access-token");
const pat = (process.env.SUPABASE_ACCESS_TOKEN || (existsSync(patPath) ? readFileSync(patPath, "utf8") : "")).trim();
if (!pat) {
  console.error("[village] jeton personnel Supabase introuvable (`supabase login`, ou SUPABASE_ACCESS_TOKEN).");
  process.exit(2);
}

const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${pat}` },
});
if (!r.ok) {
  console.error(`[village] clés du staging illisibles : HTTP ${r.status} (le projet est-il en pause ?)`);
  process.exit(2);
}
const cles = await r.json();
const anon = (cles.find((k) => k.name === "anon") || {}).api_key;
const service = (cles.find((k) => k.name === "service_role") || {}).api_key;
if (!anon || !service) {
  console.error("[village] l'API de gestion n'a pas rendu les clés anon/service_role du staging.");
  process.exit(2);
}

const url = `https://${STAGING_REF}.supabase.co`;
const env = {
  ...process.env,
  PASSIO_SUPABASE_URL: url,
  PASSIO_SUPABASE_ANON: anon,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: service,
  PASSIO_E2E_VILLAGE: "1",
  // Un port à lui : `playwright.config.js` RÉUTILISE un serveur déjà ouvert sur
  // 8080 — celui d'un autre dossier de travail, peut-être d'une autre branche.
  // Le village testerait alors un autre code que le sien, sans le dire.
  PASSIO_PORT: process.env.PASSIO_PORT || "8097",
};
console.log(`[village] cible : staging ${STAGING_REF} — 10 comptes jetables, purgés en fin de séance.`);

const res = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/village-10-comptes.spec.js", "--project=prod", "--workers=1", "--retries=0", ...process.argv.slice(2)],
  { stdio: "inherit", env, shell: process.platform === "win32" }
);

console.log("\n[village] rapport : test-results/village/rapport.md");
process.exit(res.status === null ? 1 : res.status);
