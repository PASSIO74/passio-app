// ═══════════════════════════════════════════════════════════════════════════
// ISOLATION GLOBALE DES TESTS — préchargé par `npm test` (`--import`) dans
// CHAQUE processus de fichier de test, avant tout import applicatif.
//
// Pourquoi. Seuls 12 fichiers sur 64 posaient DASH_DATA_DIR avant d'importer
// le serveur ; tous les autres instanciaient leurs JsonDb sur le VRAI
// `dashboard/data/` du poste. Mesuré le 2026-09-18 : un `npm test` lancé
// pendant que le pilotage tourne écrivait `data/observation.json` (canari du
// test d'ingestion), entrait en collision `EPERM` avec le serveur vivant
// (renameSync sur un fichier qu'il réécrit toutes les 25 s) et avait déposé
// 18 motifs de test dans `data/sentinel-learning.json`. Un test qui touche
// les données réelles n'est pas idempotent, donc inutilisable comme preuve par
// un automate.
//
// Ce que ce fichier pose, et seulement si le test ne l'a pas déjà fait :
//   · DASH_DATA_DIR → un dossier temporaire jetable, effacé à la sortie ;
//   · DASH_ENV=development, identifiants et secret longs (fait taire
//     l'avertissement « identifiants par défaut » répété à chaque fichier) ;
//   · les minuteurs qui feraient du réseau à zéro (chaîne GitHub, alertes
//     d'observation, balayage des incidents) et la lecture GitHub coupée :
//     aucun test ne doit appeler api.github.com ni lancer `gh`.
// Les fichiers qui posent leur propre TMP restent prioritaires : ils
// réassignent la variable avant leur propre `await import`.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const env = process.env;
if (!env.DASH_DATA_DIR) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passio-test-data-"));
  env.DASH_DATA_DIR = tmp;
  process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });
}
env.DASH_ENV ||= "development";
env.DASH_ADMIN_PASSWORD ||= "mot-de-passe-de-test-suffisamment-long";
env.DASH_SESSION_SECRET ||= "secret-de-test-suffisamment-long-pour-hmac-0123456789";
// Le nom d'utilisateur par défaut reste « admin » (des tests l'utilisent) : on
// tait l'avertissement résiduel plutôt que de changer un identifiant.
env.DASH_SILENCE_SECRETS ||= "1";
env.DASH_CHAINE_WATCH_MIN ||= "0";
env.DASH_OBS_ALERTS_MIN ||= "0";
env.DASH_INCIDENT_SWEEP_MIN ||= "0";
env.DASH_ALERTS_AUTOACK_MIN ||= "0";
env.DASH_GITHUB_READ ||= "off";
env.DASH_NOTIFY_GITHUB ||= "false";
env.DASH_NOTIFY_WEBHOOK ||= "";
env.DASH_SENTINEL_RELAIS_GITHUB ||= "false";
// Marque lisible par le test-sentinelle `isolation-data.test.js`.
globalThis.__passioIsolationTests = { dataDir: env.DASH_DATA_DIR };
