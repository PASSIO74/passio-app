// ═══════════════════════════════════════════════════════════════════════════
// AUCUN TEST N'ÉCRIT DANS dashboard/data — le verrou du préchargement global.
//
// `npm test` précharge `test/isoler-data.js` (`--import`) dans chaque
// processus de test : DASH_DATA_DIR pointe alors sur un dossier temporaire
// AVANT que config.js ne soit lu. Ce fichier prouve que le préchargement est
// bien en place et que la configuration résolue ne vise pas les données
// réelles du poste.
//
// Mutation : retirer `--import ./test/isoler-data.js` du script `test` de
// package.json rougit « dataDir hors de dashboard/data » (config.dataDir
// retombe sur dashboard/data). Mutation 2 : dans isoler-data.js, remplacer le
// mkdtemp par `path.join(ROOT, "data")` rougit le même test.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_REEL = path.resolve(RACINE, "data");

const { config } = await import("../server/config.js");

test("le préchargement d'isolation est actif dans ce processus", () => {
  assert.ok(globalThis.__passioIsolationTests, "isoler-data.js n'a pas été préchargé : lancer les tests via `npm test`");
  assert.ok(process.env.DASH_DATA_DIR, "DASH_DATA_DIR doit être posé avant tout import applicatif");
});

test("dataDir hors de dashboard/data : les JsonDb des tests n'écrivent jamais les données réelles", () => {
  const dir = path.resolve(config.dataDir);
  assert.notEqual(dir, DATA_REEL, "config.dataDir vise les données réelles du poste");
  assert.ok(!dir.startsWith(DATA_REEL + path.sep), "config.dataDir est un sous-dossier des données réelles");
  assert.ok(fs.existsSync(dir), "le dossier temporaire existe (jsondb.js le crée à l'import)");
});

test("le script `npm test` porte bien le préchargement (package.json)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RACINE, "package.json"), "utf8"));
  assert.match(pkg.scripts.test, /--import \.\/test\/isoler-data\.js/,
    "sans --import, seuls les 12 fichiers qui posent leur propre TMP sont isolés");
});

test("les minuteurs réseau sont coupés et la lecture GitHub désactivée pendant les tests", () => {
  assert.equal(process.env.DASH_CHAINE_WATCH_MIN, "0");
  assert.equal(process.env.DASH_OBS_ALERTS_MIN, "0");
  assert.equal(process.env.DASH_GITHUB_READ, "off");
  assert.equal(process.env.DASH_NOTIFY_GITHUB, "false");
});
