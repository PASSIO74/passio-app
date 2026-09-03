#!/usr/bin/env node
/**
 * test-prod.js — les 7 suites à comptes RÉELS, et le rappel de purge.
 *
 * POURQUOI CE FICHIER EXISTE. `playwright test --project=prod` crée cinq vrais
 * comptes en production (authz-critical ×2, blocage-acces ×2,
 * user-state-horodatage ×1) et n'en supprime AUCUN : `global-teardown` exige le
 * marqueur `PASSIO_E2E_PROD`, que seul un job de CI détenant le verrou
 * `passio-e2e-prod` a le droit de poser. Cinq comptes abandonnés par lancement,
 * qui pèsent aussi sur le quota d'inscriptions horaire du projet Supabase — la
 * cause de l'incident du 2026-08-30.
 *
 * POURQUOI ON NE PURGE PAS AUTOMATIQUEMENT ICI, et c'est délibéré. La purge
 * supprime les comptes PAR MOTIF (`%@passio-e2e.test`) : lancée depuis un poste
 * pendant qu'une CI tourne, elle effacerait les comptes de la suite d'en face en
 * plein vol — l'incident du 2026-09-01. Le nettoyage reste donc un geste
 * explicite, mais il ne doit plus être un geste OUBLIÉ : d'où ce rappel, imprimé
 * que la suite passe ou échoue.
 */
const { spawnSync } = require("child_process");

const r = spawnSync(
  "npx",
  ["playwright", "test", "--project=prod", ...process.argv.slice(2)],
  { stdio: "inherit", shell: process.platform === "win32" }
);

console.log(
  "\n──────────────────────────────────────────────────────────────────────\n" +
  "⚠️  Ces suites viennent de créer de VRAIS comptes en PRODUCTION.\n" +
  "    Elles ne les suppriment pas : le nettoyage est un geste explicite.\n\n" +
  "    Purger :  npm run purge:e2e\n\n" +
  "    ⚠️ NE PAS purger si une CI tourne (elle efface par motif, donc aussi\n" +
  "       les comptes de la suite d'en face). Voir /passio-multi-session.\n" +
  "──────────────────────────────────────────────────────────────────────"
);

process.exit(r.status === null ? 1 : r.status);
