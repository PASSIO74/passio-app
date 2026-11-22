#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// VILLAGE 100 — lanceur de la simulation HYBRIDE (tests/e2e/village-100-hybride.spec.js) :
// 4 personnages dans de vrais navigateurs + 96 figurants pilotés par l'API.
//
// Mêmes gardes que `npm run village` (scripts/village.mjs), plus une :
//   ① le jeton personnel de la CLI (`~/.supabase/access-token`, ou
//      SUPABASE_ACCESS_TOKEN) demande à l'API de gestion les clés du STAGING,
//      et de lui seul (référence figée `STAGING_REF`) ;
//   ② les variables de la cible ne vivent que dans l'environnement du SEUL
//      processus Playwright — rien n'est écrit sur disque, aucune clé imprimée ;
//   ③ refusé en CI : 100 comptes réels et ~100 sockets, ce n'est pas un
//      contrôle de déploiement ;
//   ④ une séance précédente interrompue AVANT sa purge (poste en veille,
//      Ctrl+C, plantage) a laissé `test-results/village100/manifest.json` sans
//      `purge: true` : ses comptes sont purgés PAR IDENTIFIANT avant de
//      recommencer — jamais par motif, une autre suite peut tourner à côté.
//
//   npm run village:100                 # 4 navigateurs invisibles
//   npm run village:100 -- --headed     # regarder les 4 fenêtres
//
// Rapport : test-results/village100/rapport.md (+ rapport.json, captures/).
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { STAGING_REF } from "./lib/village100.mjs";
import { purgerParIdentifiants } from "./lib/village100-figurants.mjs";

if (process.env.GITHUB_ACTIONS || process.env.CI) {
  console.error("[village100] refusé en CI : simulation de poste, 100 comptes réels sur le staging.");
  process.exit(2);
}

const patPath = resolve(homedir(), ".supabase", "access-token");
const pat = (process.env.SUPABASE_ACCESS_TOKEN || (existsSync(patPath) ? readFileSync(patPath, "utf8") : "")).trim();
if (!pat) {
  console.error("[village100] jeton personnel Supabase introuvable (`supabase login`, ou SUPABASE_ACCESS_TOKEN).");
  process.exit(2);
}
const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${pat}` } });
if (!r.ok) {
  console.error(`[village100] clés du staging illisibles : HTTP ${r.status} (le projet est-il en pause ?)`);
  process.exit(2);
}
const cles = await r.json();
const anon = (cles.find((k) => k.name === "anon") || {}).api_key;
const service = (cles.find((k) => k.name === "service_role") || {}).api_key;
if (!anon || !service) {
  console.error("[village100] l'API de gestion n'a pas rendu les clés anon/service_role du staging.");
  process.exit(2);
}
const url = `https://${STAGING_REF}.supabase.co`;

// ④ Le reliquat d'une séance interrompue.
const manifestPath = resolve("test-results", "village100", "manifest.json");
if (existsSync(manifestPath)) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    const ids = [...(m.yeux || []), ...(m.figurants || [])];
    if (m.cible === STAGING_REF && !m.purge && ids.length) {
      console.log(`[village100] séance ${m.campagne} non purgée : ${ids.length} comptes à retirer d'abord…`);
      const p = await purgerParIdentifiants({ url, service, ids, log: (x) => console.log("[village100] " + x) });
      if (p.erreurs.length) { console.error("[village100] purge du reliquat incomplète : " + p.erreurs.slice(0, 3).join(" ; ")); process.exit(2); }
      writeFileSync(manifestPath, JSON.stringify({ ...m, purge: true }, null, 2));
    }
  } catch (e) {
    console.error("[village100] manifeste illisible : " + e.message);
    process.exit(2);
  }
}

const env = {
  ...process.env,
  PASSIO_SUPABASE_URL: url,
  PASSIO_SUPABASE_ANON: anon,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: service,
  PASSIO_E2E_VILLAGE100: "1",
  // Un port à lui (voir scripts/village.mjs) : `playwright.config.js` réutilise
  // un serveur déjà ouvert — celui d'un autre dossier de travail, peut-être.
  PASSIO_PORT: process.env.PASSIO_PORT || "8098",
};
console.log(`[village100] cible : staging ${STAGING_REF} — 4 navigateurs + 96 figurants API, purgés en fin de séance.`);

const res = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/village-100-hybride.spec.js", "--project=prod", "--workers=1", "--retries=0", ...process.argv.slice(2)],
  { stdio: "inherit", env, shell: process.platform === "win32" }
);
console.log("\n[village100] rapport : test-results/village100/rapport.md");
process.exit(res.status === null ? 1 : res.status);
