// ═══════════════════════════════════════════════════════════════════════════
// SUPERVISEUR — garde le centre de pilotage (et donc la sentinelle) VIVANT.
//
// Un centre de pilotage qu'il faut relancer à la main ne surveille rien : la
// panne qu'on rate est justement celle qui survient quand personne ne regarde.
// Ce processus lance le serveur et le relance s'il meurt, avec un recul
// progressif pour ne pas boucler à l'infini sur une erreur de démarrage.
//
// Il ne fait QUE ça : pas de mise à jour automatique, pas de git, pas de réseau.
// Un superviseur qui prend des initiatives est un superviseur qu'on n'ose plus
// laisser tourner.
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
    // Journal borné : ce processus vit des semaines, il ne doit pas remplir le disque.
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2_000_000) {
      const garde = fs.readFileSync(LOG, "utf8").slice(-500_000);
      fs.writeFileSync(LOG, garde);
    }
    fs.appendFileSync(LOG, ligne);
  } catch {}
  process.stdout.write(ligne);
}

let child = null;
let stopping = false;
let echecs = 0;              // échecs CONSÉCUTIFS et rapides
let demarreLe = 0;

function delaiAvantRelance() {
  // 2 s, 5 s, 15 s, 30 s, puis 60 s au plus. Un plantage immédiat et répété
  // (port occupé, .env cassé) ne doit pas tourner en boucle serrée.
  const paliers = [2000, 5000, 15_000, 30_000, 60_000];
  return paliers[Math.min(echecs, paliers.length - 1)];
}

function demarrer() {
  if (stopping) return;
  demarreLe = Date.now();
  child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, DASH_SUPERVISED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  log(`serveur démarré (pid ${child.pid})`);

  const relayer = (flux) => (c) => {
    const t = c.toString().trimEnd();
    if (t) log(flux + ": " + t.split("\n").slice(-6).join(" | "));
  };
  child.stdout.on("data", relayer("out"));
  child.stderr.on("data", relayer("err"));

  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    const vecu = Date.now() - demarreLe;
    // Un serveur qui a tenu plus d'une minute n'est pas « en échec de
    // démarrage » : on repart franchement au lieu d'accumuler le recul.
    if (vecu > 60_000) echecs = 0; else echecs++;
    const attente = delaiAvantRelance();
    log(`serveur arrêté (code ${code ?? signal}, après ${Math.round(vecu / 1000)} s) — relance dans ${attente / 1000} s`);
    setTimeout(demarrer, attente);
  });
}

function arreter(motif) {
  if (stopping) return;
  stopping = true;
  log(`arrêt du superviseur (${motif})`);
  if (child) { try { child.kill(); } catch {} }
  try { fs.unlinkSync(PIDFILE); } catch {}
  setTimeout(() => process.exit(0), 400);
}

process.on("SIGINT", () => arreter("SIGINT"));
process.on("SIGTERM", () => arreter("SIGTERM"));

log("superviseur en route — le centre de pilotage sera maintenu actif");
demarrer();
