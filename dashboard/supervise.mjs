// ═══════════════════════════════════════════════════════════════════════════
// SUPERVISEUR — garde le centre de pilotage ET le worker IA local vivants.
//
// Deux processus locaux, tous deux relancés s'ils meurent :
//   1. server/start.js  → centre de pilotage + sentinelle (start.js, PAS index.js :
//      c'est lui qui installe l'enveloppe Autopilot AVANT le démarrage du serveur)
//   2. aiworker.mjs     → orchestration Claude Code standard + Codex via GitHub
//
// Le worker IA ne reçoit aucune connexion entrante : il surveille seulement les
// branches `ai/request/*` du dépôt GitHub et produit des branches `ai/result/*`.
// Cela permet à ChatGPT de donner une tâche depuis GitHub sans Passio Bridge ni
// worker Claude isolé. Claude et Codex sont ceux de la session Windows standard.
//
//   node supervise.mjs           lancement direct (fenêtre visible)
//   Sentinelle-Demarrage.vbs     lancement silencieux au démarrage de session
//
// Arrêt : Arreter-Pilotage.cmd (ou la fenêtre, si elle est visible).
// ═══════════════════════════════════════════════════════════════════════════
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envCli } from "./scripts/connecter-claude.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(ROOT, "data", "supervise.log");
const PIDFILE = path.join(ROOT, "data", "supervise.pid");

// Environnement COMMUN aux deux enfants (2026-09-13). Deux corrections :
//   • `DASH_CLAUDE_CONFIG_DIR` (dossier d'identifiants isolé du `claude` du
//     pilotage) n'était appliqué que par le serveur (claudecli.js lit .env) ;
//     le worker IA lance aussi `claude` mais ne lit pas .env — il sondait donc
//     `~/.claude`, se déclarait « non connecté » et refusait ses tâches pendant
//     que le serveur, lui, était connecté. Le superviseur pose CLAUDE_CONFIG_DIR
//     une fois pour tous ses enfants : une seule connexion, un seul dossier.
//   • Les variables d'une session Claude Code PARENTE (le pilotage lancé depuis
//     un terminal de Claude Code : CLAUDECODE, CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH…)
//     ne sont pas transmises : un `claude` enfant qui les hérite se croit piloté
//     par un hôte et attend son authentification. Même logique que childEnv().
// Lu UNE fois au démarrage : Activer-Autopilote.cmd et Connecter-Claude.cmd
// redémarrent le pilotage après avoir touché .env, comme avant.
function envEnfants() {
  let texteEnv = "";
  try { texteEnv = fs.readFileSync(path.join(ROOT, ".env"), "utf8"); } catch {}
  return envCli(texteEnv, process.env);
}
const ENV_ENFANTS = envEnfants();

try { fs.mkdirSync(path.join(ROOT, "data"), { recursive: true }); } catch {}

// ── Instance unique (revue du 2026-09-13) ─────────────────────────────────────
// Installer-Demarrage-Auto.cmd « installe et lance tout de suite » sans regarder
// si un superviseur tourne déjà : deux superviseurs, deux serveurs qui se
// disputent le port 4610 (EADDRINUSE en boucle, relances toutes les 60 s). Si le
// PID du fichier est vivant ET porte bien `supervise.mjs` de CE dossier dans sa
// ligne de commande (un PID est recyclé après un plantage sans nettoyage), on
// s'efface. La ligne de commande passe par PowerShell (wmic n'existe plus sur
// Windows 11 24H2) ; si elle est illisible, on se fie à la seule vie du PID.
function autreInstanceVivante() {
  let pid = 0;
  try { pid = Number(fs.readFileSync(PIDFILE, "utf8").trim()); } catch { return null; }
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return null;
  try { process.kill(pid, 0); } catch { return null; } // pas vivant
  if (process.platform === "win32") {
    try {
      const r = spawnSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
      const cmd = (r.stdout || "").trim();
      const norm = (x) => x.toLowerCase().replace(/\//g, "\\");
      // Dans le doute (ligne lisible mais autre programme, ou autre dossier), on
      // DÉMARRE : deux superviseurs valent mieux qu'aucun.
      if (cmd && !(cmd.includes("supervise.mjs") && norm(cmd).includes(norm(ROOT)))) return null;
    } catch {}
  }
  return pid;
}
const autre = autreInstanceVivante();
if (autre) {
  process.stdout.write(`[superviseur] déjà en route (pid ${autre}) — cette instance s'efface. Pour redémarrer : Arreter-Pilotage.cmd puis Sentinelle-Demarrage.vbs.\n`);
  process.exit(0);
}

// Un disque plein ne doit pas empêcher le superviseur de NAÎTRE : sans PID écrit
// il reste supervisable à la main (Arreter-Pilotage.cmd tue aussi les
// superviseurs par leur ligne de commande). On réessaie l'écriture toutes les
// 5 min tant qu'elle manque : dès que la place revient, le fichier existe.
function ecrirePid() {
  try { fs.writeFileSync(PIDFILE, String(process.pid)); return true; }
  catch (e) { process.stdout.write(`[superviseur] pid non écrit (${e.code || e.message}) — nouvel essai dans 5 min\n`); return false; }
}
if (!ecrirePid()) {
  const t = setInterval(() => { if (ecrirePid()) clearInterval(t); }, 5 * 60_000);
  t.unref?.();
}

function log(msg) {
  const ligne = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2_000_000) {
      const garde = fs.readFileSync(LOG, "utf8").slice(-500_000);
      fs.writeFileSync(LOG, garde);
    }
    fs.appendFileSync(LOG, ligne);
  } catch {}
  process.stdout.write(ligne);
}

let stopping = false;
const procs = new Map();

function lancer(nom, fichier, extraEnv = {}) {
  const etat = procs.get(nom) || { echecs: 0, demarreLe: 0, child: null };
  if (stopping) return;
  etat.demarreLe = Date.now();
  etat.child = spawn(process.execPath, [path.join(ROOT, fichier)], {
    cwd: ROOT,
    windowsHide: true,
    env: { ...ENV_ENFANTS, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.set(nom, etat);
  log(`${nom} démarré (pid ${etat.child.pid})`);

  const relayer = (flux) => (c) => {
    const t = c.toString().trimEnd();
    if (!t) return;
    // 8 premières + 12 dernières lignes (revue du 2026-09-13) : la sortie fatale
    // de Node met 4 lignes de contexte avant `Error: ENOSPC`, puis la pile — les
    // « 6 dernières » gardaient `at writeFileSync` et perdaient l'appelant
    // (jsondb.js:31 et QUI l'appelait), la preuve qu'on cherche justement.
    const lignes = t.split("\n");
    const gardees = lignes.length <= 20 ? lignes : [...lignes.slice(0, 8), `… (${lignes.length - 20} ligne(s) omise(s))`, ...lignes.slice(-12)];
    log(`${nom}/${flux}: ` + gardees.join(" | "));
  };
  etat.child.stdout.on("data", relayer("out"));
  etat.child.stderr.on("data", relayer("err"));

  etat.child.on("exit", (code, signal) => {
    etat.child = null;
    if (stopping) return;
    const vecu = Date.now() - etat.demarreLe;
    if (vecu > 60_000) etat.echecs = 0; else etat.echecs++;
    etat.total = (etat.total || 0) + 1;
    const paliers = [2000, 5000, 15_000, 30_000, 60_000];
    const attente = paliers[Math.min(etat.echecs, paliers.length - 1)];
    log(`${nom} arrêté (code ${code ?? signal}, après ${Math.round(vecu / 1000)} s) — relance n°${etat.total} dans ${attente / 1000} s${etat.total >= 5 ? " ⚠ relances répétées : regarder le disque et les dernières lignes ci-dessus" : ""}`);
    // Les compteurs sont TRANSMIS à l'enfant (nouvel objet à chaque relance,
    // revue du 2026-09-13) : le serveur les expose sur la page Sources — un
    // pilotage relancé 22 fois en dix jours ne doit plus le cacher.
    setTimeout(() => lancer(nom, fichier, { ...extraEnv, DASH_SUPERVISE_RESTARTS: String(etat.total), DASH_SUPERVISE_LAST_EXIT: String(code ?? signal), DASH_SUPERVISE_LAST_EXIT_AT: new Date().toISOString() }), attente);
  });
}

function arreter(motif) {
  if (stopping) return;
  stopping = true;
  log(`arrêt du superviseur (${motif})`);
  for (const etat of procs.values()) {
    if (etat.child) { try { etat.child.kill(); } catch {} }
  }
  try { fs.unlinkSync(PIDFILE); } catch {}
  setTimeout(() => process.exit(0), 400);
}

process.on("SIGINT", () => arreter("SIGINT"));
process.on("SIGTERM", () => arreter("SIGTERM"));

log(`superviseur en route — pilotage + worker Claude/Codex maintenus actifs · identifiants Claude ${ENV_ENFANTS.CLAUDE_CONFIG_DIR ? `ISOLÉS dans ${ENV_ENFANTS.CLAUDE_CONFIG_DIR}` : "partagés (~/.claude)"}`);
lancer("serveur", path.join("server", "start.js"), { DASH_SUPERVISED: "1" });
lancer("ai-worker", "aiworker.mjs", { PASSIO_AI_SUPERVISED: "1" });
