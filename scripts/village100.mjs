#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// VILLAGE 100 — lanceur de la simulation HYBRIDE (tests/e2e/village-100-hybride.spec.js) :
// 4 personnages dans de vrais navigateurs + 96 figurants pilotés par l'API.
//
// Mêmes gardes que `npm run village` (scripts/village.mjs, durci en 3d0be866) :
//   ① le jeton personnel de la CLI ne sert qu'à lire les clés du STAGING (référence
//      figée) ; il n'est PAS transmis à l'enfant (ADR-012), pas plus que
//      PASSIO_E2E_MULTI / PASSIO_E2E_PROD (purge par motif au teardown) ;
//   ② port LIBRE demandé au système (`reuseExistingServer` prendrait le serveur
//      d'un autre dossier) ;
//   ③ refusé en CI.
// Et trois de plus, propres aux 100 comptes `@passio-capacite.test` — domaine
// que PERSONNE d'autre ne purge (docs/BANC_CAPACITE_REALISTE_2026-09-20.md) :
//   ④ un VERROU de séance (`.passio/tmp/village100/verrou.json`, pid vivant) : un
//      second lancement purgerait les comptes EN VOL du premier ;
//   ⑤ le MANIFESTE (`.passio/tmp/village100/manifest.json`, hors de
//      `test-results/` que Playwright vide) porte l'adresse exacte de chaque
//      compte, écrite AVANT sa création ; un reliquat non purgé est purgé au
//      démarrage — par adresse exacte de SA campagne, relu en 404 — et le
//      lancement s'arrête si un compte reste ou si une adresse n'est pas de la
//      séance (manifeste édité ou copié) ;
//   ⑥ après la séance, filet : un manifeste resté « non purgé » est purgé ici.
//
//   npm run village:100                 # 4 navigateurs invisibles
//   npm run village:100 -- --headed     # regarder les 4 fenêtres
//
// Rapport : test-results/village100/rapport.md (+ rapport.json, captures/).
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { STAGING_REF, verrouLibre, refDeLaCle } from "./lib/village100.mjs";
import { Manifeste, purgerSeance, purgeComplete } from "./lib/village100-figurants.mjs";

if (process.env.GITHUB_ACTIONS || process.env.CI) {
  console.error("[village100] refusé en CI : simulation de poste, 100 comptes réels sur le staging.");
  process.exit(2);
}

const DOSSIER = resolve(".passio", "tmp", "village100");
const VERROU = resolve(DOSSIER, "verrou.json");
const MANIFESTE = resolve(DOSSIER, "manifest.json");
const estVivant = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

// ④ Le verrou, AVANT tout réseau.
let verrou = null;
try { verrou = existsSync(VERROU) ? JSON.parse(readFileSync(VERROU, "utf8")) : null; } catch (e) { verrou = null; }
if (!verrouLibre(verrou, estVivant)) {
  console.error(`[village100] une séance tourne déjà sur ce poste (pid ${verrou.pid}, depuis ${verrou.debut}) : refusé.`);
  process.exit(2);
}
mkdirSync(DOSSIER, { recursive: true });
writeFileSync(VERROU, JSON.stringify({ pid: process.pid, debut: new Date().toISOString() }));
const liberer = () => { try { rmSync(VERROU, { force: true }); } catch (e) {} };
const sortir = (code) => { liberer(); process.exit(code); };

const patPath = resolve(homedir(), ".supabase", "access-token");
const pat = (process.env.SUPABASE_ACCESS_TOKEN || (existsSync(patPath) ? readFileSync(patPath, "utf8") : "")).trim();
if (!pat) { console.error("[village100] jeton personnel Supabase introuvable (`supabase login`, ou SUPABASE_ACCESS_TOKEN)."); sortir(2); }
const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${pat}` } });
if (!r.ok) { console.error(`[village100] clés du staging illisibles : HTTP ${r.status} (le projet est-il en pause ?)`); sortir(2); }
const cles = await r.json().catch(() => null);
if (!Array.isArray(cles)) { console.error("[village100] réponse inattendue de l'API de gestion (pas une liste de clés)."); sortir(2); }
const anon = (cles.find((k) => k.name === "anon") || {}).api_key;
const service = (cles.find((k) => k.name === "service_role") || {}).api_key;
if (!anon || !service || refDeLaCle(service) !== STAGING_REF) { console.error("[village100] clés anon/service_role du staging absentes, ou clé de service d'un autre projet."); sortir(2); }
const url = `https://${STAGING_REF}.supabase.co`;

async function purgerReliquat(moment) {
  let m;
  try { m = Manifeste.lire(MANIFESTE); } catch (e) { console.error(`[village100] manifeste illisible (${e.message}) : rien n'est purgé, à examiner à la main.`); return false; }
  if (!m || m.purge || !m.comptes.length) return true;
  console.log(`[village100] ${moment} : séance ${m.campagne} non purgée, ${m.comptes.length} adresse(s) à retirer…`);
  const p = await purgerSeance({ url, service, manifeste: m, log: (x) => console.log("[village100] " + x) });
  if (!purgeComplete(p)) {
    console.error(`[village100] purge INCOMPLÈTE — refus : ${p.refus.slice(0, 3).join(" ; ") || "aucun"} · restants : ${p.restants.slice(0, 3).join(" ; ") || "aucun"} · erreurs : ${p.erreurs.slice(0, 3).join(" ; ") || "aucune"}`);
    return false;
  }
  writeFileSync(MANIFESTE, JSON.stringify({ ...m, purge: true }, null, 2));
  return true;
}
// ⑤ Le reliquat d'une séance interrompue.
if (!(await purgerReliquat("avant la séance"))) sortir(2);

// ② Un port libre.
const port = process.env.PASSIO_PORT || await new Promise((ok, ko) => {
  const srv = createServer();
  srv.once("error", ko);
  srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => ok(String(p))); });
});

// ① L'enfant ne reçoit que ce dont il se sert.
const { SUPABASE_ACCESS_TOKEN: _pat, PASSIO_E2E_MULTI: _multi, PASSIO_E2E_PROD: _prod, ...envParent } = process.env;
const env = {
  ...envParent,
  PASSIO_SUPABASE_URL: url,
  PASSIO_SUPABASE_ANON: anon,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: service,
  PASSIO_E2E_VILLAGE100: "1",
  PASSIO_STAGING_REF: STAGING_REF,
  PASSIO_VILLAGE100_MANIFESTE: MANIFESTE,
  PASSIO_PORT: port,
};
console.log(`[village100] cible : staging ${STAGING_REF} — 4 navigateurs + 96 figurants API, purgés en fin de séance.`);
const res = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/village-100-hybride.spec.js", "--project=prod", "--workers=1", "--retries=0", ...process.argv.slice(2)],
  { stdio: "inherit", env, shell: process.platform === "win32" }
);
console.log("\n[village100] rapport : test-results/village100/rapport.md");
// ⑥ Le filet : la spec purge elle-même ; si elle n'a pas pu (plantage, Ctrl+C), ici.
const filet = await purgerReliquat("après la séance");
liberer();
process.exit(res.status === null ? 1 : (res.status || (filet ? 0 : 1)));
