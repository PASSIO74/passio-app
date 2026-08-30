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
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(ROOT, "data", "supervise.log");
const PIDFILE = path.join(ROOT, "data", "supervise.pid");

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(PIDFILE, String(process.pid));

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
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.set(nom, etat);
  log(`${nom} démarré (pid ${etat.child.pid})`);

  const relayer = (flux) => (c) => {
    const t = c.toString().trimEnd();
    if (t) log(`${nom}/${flux}: ` + t.split("\n").slice(-6).join(" | "));
  };
  etat.child.stdout.on("data", relayer("out"));
  etat.child.stderr.on("data", relayer("err"));

  etat.child.on("exit", (code, signal) => {
    etat.child = null;
    if (stopping) return;
    const vecu = Date.now() - etat.demarreLe;
    if (vecu > 60_000) etat.echecs = 0; else etat.echecs++;
    const paliers = [2000, 5000, 15_000, 30_000, 60_000];
    const attente = paliers[Math.min(etat.echecs, paliers.length - 1)];
    log(`${nom} arrêté (code ${code ?? signal}, après ${Math.round(vecu / 1000)} s) — relance dans ${attente / 1000} s`);
    setTimeout(() => lancer(nom, fichier, extraEnv), attente);
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

log("superviseur en route — pilotage + worker Claude/Codex maintenus actifs");
lancer("serveur", path.join("server", "start.js"), { DASH_SUPERVISED: "1" });
lancer("ai-worker", "aiworker.mjs", { PASSIO_AI_SUPERVISED: "1" });
