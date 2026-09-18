#!/usr/bin/env node
// Lance TOUS les tests unitaires (tests/unit/*.test.mjs) avec `node --test`.
//
// ⚠️ POURQUOI UN LANCEUR, ET PAS `node --test tests/unit/` (2026-09-18).
// La forme RÉPERTOIRE n'est plus acceptée par Node 24 (« Cannot find module
// …\tests\unit ») : sur le poste de Benjamin (v24.16) `npm run test:unit`
// tombait avant d'avoir exécuté un seul test, alors que la CI (Node 22) passait.
// Et un motif glob dans le script npm ne serait développé que par un shell
// POSIX — sous Windows, npm passe par cmd.exe, qui rend le motif tel quel.
// On liste donc les fichiers ICI, en Node, et on les passe un par un : même
// résultat sur Node 20, 22 et 24, sous Windows comme sous Linux.
//
// Les fichiers sont ceux que `npm run verif` nomme un à un, plus tout nouveau
// `*.test.mjs` déposé dans le dossier — un test oublié dans `verif` reste au
// moins exécuté par ce lanceur.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossier = path.join(racine, "tests", "unit");
const fichiers = readdirSync(dossier)
  .filter((f) => /\.test\.(mjs|js|cjs)$/.test(f))
  .sort()
  .map((f) => path.join("tests", "unit", f));

if (!fichiers.length) {
  console.error("ECHEC — aucun test unitaire trouvé dans tests/unit/");
  process.exit(2);
}

const r = spawnSync(process.execPath, ["--test", ...fichiers, ...process.argv.slice(2)], {
  cwd: racine,
  stdio: "inherit",
});
process.exit(r.status == null ? 1 : r.status);
