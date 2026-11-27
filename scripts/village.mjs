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
//   npm run village:rencontrer      # la séance « Rencontrer » (2026-11-27) : demande et
//                                   # validation, file d'attente, activité privée, pointage,
//                                   # écritures directes — tests/e2e/village-rencontrer.spec.js
//
// Le rapport : test-results/village/rapport.md (+ rapport.json) ; pour la séance
// « Rencontrer » : test-results/village-rencontrer/rapport.md.
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { STAGING_REF } from "./lib/charge-realiste.mjs";

if (process.env.GITHUB_ACTIONS || process.env.CI) {
  console.error("[village] refusé en CI : simulation de poste, dix navigateurs.");
  process.exit(2);
}

// Les séances. Elles prennent les MÊMES dix personnages (couloir « village » du
// jeu persistant) : le bail du couloir interdit de les lancer en même temps.
const SEANCES = {
  village: { suite: "tests/e2e/village-10-comptes.spec.js", drapeau: "PASSIO_E2E_VILLAGE", rapport: "test-results/village/rapport.md" },
  rencontrer: { suite: "tests/e2e/village-rencontrer.spec.js", drapeau: "PASSIO_E2E_VILLAGE_RENCONTRER", rapport: "test-results/village-rencontrer/rapport.md" },
};
const argSuite = process.argv.slice(2).find((a) => a.startsWith("--suite="));
const nomSeance = argSuite ? argSuite.slice("--suite=".length) : "village";
const SEANCE = SEANCES[nomSeance];
if (!SEANCE) {
  console.error(`[village] séance inconnue « ${nomSeance} » (connues : ${Object.keys(SEANCES).join(", ")}).`);
  process.exit(2);
}
const argsPlaywright = process.argv.slice(2).filter((a) => !a.startsWith("--suite="));

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
const cles = await r.json().catch(() => null);
if (!Array.isArray(cles)) {
  console.error("[village] réponse inattendue de l'API de gestion (pas une liste de clés).");
  process.exit(2);
}
const anon = (cles.find((k) => k.name === "anon") || {}).api_key;
const service = (cles.find((k) => k.name === "service_role") || {}).api_key;
if (!anon || !service) {
  console.error("[village] l'API de gestion n'a pas rendu les clés anon/service_role du staging.");
  process.exit(2);
}

// Un port LIBRE, demandé au système : `playwright.config.js` RÉUTILISE un
// serveur déjà ouvert sur son port (`reuseExistingServer`) — celui d'un autre
// dossier de travail, d'une autre branche, ou d'un autre village. Le village
// testerait alors un autre code que le sien, sans le dire.
const port = process.env.PASSIO_PORT || await new Promise((ok, ko) => {
  const srv = createServer();
  srv.once("error", ko);
  srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => ok(String(p))); });
});

// L'enfant ne reçoit que ce dont il se sert (ADR-012 : un secret n'est porté que
// par l'étape qui l'utilise) :
//   · SUPABASE_ACCESS_TOKEN — le jeton personnel, qui ouvre TOUT le compte,
//     production comprise : il a servi à lire les clés, il s'arrête ici ;
//   · PASSIO_E2E_MULTI / PASSIO_E2E_PROD — oubliés dans le shell, ils feraient
//     lancer par le teardown global une purge PAR MOTIF des comptes de test du
//     staging, y compris ceux d'une autre suite en vol.
const { SUPABASE_ACCESS_TOKEN: _pat, PASSIO_E2E_MULTI: _multi, PASSIO_E2E_PROD: _prod, ...envParent } = process.env;
const url = `https://${STAGING_REF}.supabase.co`;
const env = {
  ...envParent,
  PASSIO_SUPABASE_URL: url,
  PASSIO_SUPABASE_ANON: anon,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: service,
  [SEANCE.drapeau]: "1",
  PASSIO_STAGING_REF: STAGING_REF,
  PASSIO_PORT: port,
};
console.log(`[village] séance « ${nomSeance} » — cible : staging ${STAGING_REF} — 10 comptes du jeu persistant (couloir « village »), contenus purgés en fin de séance.`);

const res = spawnSync(
  "npx",
  ["playwright", "test", SEANCE.suite, "--project=prod", "--workers=1", "--retries=0", ...argsPlaywright],
  { stdio: "inherit", env, shell: process.platform === "win32" }
);

console.log("\n[village] rapport : " + SEANCE.rapport);
if (res.status !== 0) {
  console.log("[village] séance en échec ou interrompue. Les dix personnages sont des comptes du JEU PERSISTANT\n" +
    "          (e2e_village_0_<i>@fixe.passio-e2e.test) : jamais supprimés ; leurs contenus restés en base\n" +
    "          sont purgés par la séance suivante, qui les reprend. Leur bail expire 40 min après l'acquisition.");
}
process.exit(res.status === null ? 1 : res.status);
