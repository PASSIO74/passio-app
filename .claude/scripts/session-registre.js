#!/usr/bin/env node
/**
 * Registre des sessions Claude Code concurrentes — PASSIO.
 *
 * Pourquoi ce script existe
 * -------------------------
 * Plusieurs sessions Claude Code travaillent souvent en parallèle sur CE MÊME
 * dossier. Elles partagent des ressources qui n'ont aucune notion de « session » :
 *
 *   1. L'INDEX GIT (`.git/index`). Le hook PostToolUse fait `git add <fichier>` à
 *      chaque édition. Deux sessions remplissent donc le MÊME index, et un
 *      `git commit` sans pathspec emporte le travail en cours de l'autre.
 *      (Vécu le 2026-07-21 : trois commits ont mélangé des travaux CDV et IRL.)
 *   2. LE PORT 8080. `playwright.config.js` a `reuseExistingServer: true` : si une
 *      autre session tient déjà un http-server, les tests de celle-ci mesurent
 *      LES OCTETS DE L'AUTRE — vert ou rouge sur le mauvais code, sans un mot.
 *   3. LA PROD SUPABASE. `tests/e2e/global-teardown.js` purge TOUS les comptes
 *      `%@passio-e2e.test` : la fin de suite d'une session supprime les comptes
 *      d'une suite encore en cours ailleurs.
 *   4. LES FICHIERS DE CONTEXTE `.passio/` et la mémoire : dernier écrivain gagne.
 *
 * Ce registre rend ces collisions VISIBLES avant qu'elles ne coûtent un commit
 * mélangé, et fournit un commit borné au périmètre déclaré.
 *
 * Il est purement local (`.claude/sessions/` est ignoré par git) et n'écrit
 * jamais dans le dépôt : la seule commande mutante est `commiter`, explicite.
 *
 * Usage :
 *   node .claude/scripts/session-registre.js etat
 *   node .claude/scripts/session-registre.js ouvrir --sujet "..." --fichiers "js/app-04.js,styles.css"
 *   node .claude/scripts/session-registre.js fichiers js/app-05.js
 *   node .claude/scripts/session-registre.js port 8081
 *   node .claude/scripts/session-registre.js commiter -m "feat(x): ..."   (ou -F message.txt)
 *   node .claude/scripts/session-registre.js fermer
 */
"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const DIR = path.join(REPO, ".claude", "sessions");
const REGISTRE = path.join(DIR, "registre.json");

const MOI = process.env.CLAUDE_CODE_SESSION_ID || `pid-${process.pid}`;
const MON_PID = Number(process.env.CLAUDE_PID || 0) || null;
/** Une entrée sans signe de vie depuis ce délai est considérée abandonnée. */
const PEREMPTION_MS = 12 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ outils */

function git(args, opts) {
  return execFileSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  }).trim();
}

function gitSilencieux(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

/** Chemin normalisé, relatif à la racine du dépôt, séparateurs POSIX. */
function normaliser(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  return path.relative(REPO, abs).split(path.sep).join("/");
}

function lire() {
  try {
    const brut = JSON.parse(fs.readFileSync(REGISTRE, "utf8"));
    return Array.isArray(brut.sessions) ? brut : { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

function ecrire(reg) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(REGISTRE, JSON.stringify(reg, null, 2) + "\n", "utf8");
}

/** Le processus tourne-t-il encore ? (EPERM = existe mais hors de portée) */
function pidVivant(pid) {
  if (!pid) return null; // inconnu : on ne conclut pas
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** Retire les entrées mortes ; renvoie le registre nettoyé. */
function purger(reg) {
  const maintenant = Date.now();
  reg.sessions = reg.sessions.filter((s) => {
    if (s.id === MOI) return true;
    if (pidVivant(s.pid) === false) return false;
    return maintenant - new Date(s.vuA || s.ouverteA || 0).getTime() < PEREMPTION_MS;
  });
  return reg;
}

function moi(reg) {
  return reg.sessions.find((s) => s.id === MOI) || null;
}

/**
 * Quelqu'un écoute-t-il sur ce port ?
 *
 * ⚠️ Surtout PAS un `listen()` d'essai : sous Windows, libuv pose SO_REUSEADDR,
 * si bien qu'un second bind sur un port DÉJÀ occupé réussit (mesuré le
 * 2026-08-16 : le port 4610 servait un 200 pendant que `listen` le déclarait
 * libre). La seule preuve fiable est une connexion réelle.
 */
function portOccupe(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const fin = (r) => {
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(600);
    sock.once("connect", () => fin(true));
    sock.once("timeout", () => fin(false));
    sock.once("error", () => fin(false));
    sock.connect(port, "127.0.0.1");
  });
}

function arg(nom, defaut = null) {
  const i = process.argv.indexOf(nom);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

/* ---------------------------------------------------------------- commandes */

function ouvrir() {
  const reg = purger(lire());
  const sujet = arg("--sujet") || arg("-s") || "(sujet non déclaré)";
  const fichiers = (arg("--fichiers") || arg("-f") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(normaliser);

  const existante = moi(reg);
  const entree = existante || { id: MOI, ouverteA: new Date().toISOString() };
  entree.sujet = sujet;
  entree.fichiers = Array.from(new Set([...(entree.fichiers || []), ...fichiers]));
  entree.pid = MON_PID;
  entree.cwd = process.cwd();
  entree.branche = gitSilencieux(["rev-parse", "--abbrev-ref", "HEAD"]) || "?";
  entree.worktree = gitSilencieux(["rev-parse", "--show-toplevel"]) || REPO;
  entree.ports = entree.ports || [];
  entree.vuA = new Date().toISOString();
  if (!existante) reg.sessions.push(entree);
  ecrire(reg);

  console.log(`Session enregistrée : ${sujet}`);
  console.log(`  périmètre : ${entree.fichiers.length ? entree.fichiers.join(", ") : "(aucun fichier déclaré)"}`);
  return etat();
}

function fichiers() {
  const reg = purger(lire());
  const entree = moi(reg);
  if (!entree) {
    console.error("Session non enregistrée — lance d'abord `ouvrir --sujet \"...\"`.");
    process.exitCode = 1;
    return;
  }
  const ajouts = process.argv.slice(3).filter((a) => !a.startsWith("-")).map(normaliser);
  entree.fichiers = Array.from(new Set([...(entree.fichiers || []), ...ajouts]));
  entree.vuA = new Date().toISOString();
  ecrire(reg);
  console.log(`Périmètre : ${entree.fichiers.join(", ")}`);
}

function port() {
  const reg = purger(lire());
  const entree = moi(reg);
  if (!entree) {
    console.error("Session non enregistrée — lance d'abord `ouvrir --sujet \"...\"`.");
    process.exitCode = 1;
    return;
  }
  const p = Number(process.argv[3]);
  if (!p) {
    console.error("Usage : port <numéro>");
    process.exitCode = 1;
    return;
  }
  entree.ports = Array.from(new Set([...(entree.ports || []), p]));
  entree.vuA = new Date().toISOString();
  ecrire(reg);
  console.log(`Ports réservés par cette session : ${entree.ports.join(", ")}`);
}

function fermer() {
  const reg = purger(lire());
  reg.sessions = reg.sessions.filter((s) => s.id !== MOI);
  ecrire(reg);
  console.log("Session retirée du registre.");
}

async function etat() {
  const reg = purger(lire());
  ecrire(reg);

  const autres = reg.sessions.filter((s) => s.id !== MOI);
  const mien = moi(reg);
  const alertes = [];

  console.log("\n=== Sessions Claude Code sur ce dépôt ===");
  if (mien) {
    console.log(`* moi   ${mien.sujet}`);
    console.log(`        branche ${mien.branche} · ${mien.worktree}`);
    console.log(`        périmètre : ${(mien.fichiers || []).join(", ") || "(non déclaré)"}`);
  } else {
    console.log("* moi   (non enregistrée — `ouvrir --sujet \"...\"` recommandé)");
  }
  if (!autres.length) console.log("  aucune autre session active connue.");
  for (const s of autres) {
    console.log(`  autre  ${s.sujet}   [${s.id.slice(0, 8)}, pid ${s.pid || "?"}]`);
    console.log(`         branche ${s.branche} · ${s.worktree}`);
    console.log(`         périmètre : ${(s.fichiers || []).join(", ") || "(non déclaré)"}`);
  }

  // 1. Chevauchement de périmètre déclaré.
  const miens = new Set((mien && mien.fichiers) || []);
  for (const s of autres) {
    const croise = (s.fichiers || []).filter((f) => miens.has(f));
    if (croise.length) {
      alertes.push(`Périmètre partagé avec « ${s.sujet} » : ${croise.join(", ")} — se répartir les fichiers ou passer en worktree.`);
    }
  }

  // 2. Index git : le vrai vecteur de mélange.
  const indexes = gitSilencieux(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  const revendiques = new Set(autres.flatMap((s) => s.fichiers || []));
  const etrangers = indexes.filter((f) => revendiques.has(f) || (miens.size && !miens.has(f)));
  if (indexes.length) {
    console.log(`\nIndex git partagé : ${indexes.length} fichier(s) indexé(s).`);
    if (etrangers.length) {
      alertes.push(
        `L'index contient ${etrangers.length} fichier(s) HORS de ton périmètre (${etrangers.slice(0, 6).join(", ")}${etrangers.length > 6 ? "…" : ""}) — ` +
          "ne JAMAIS committer sans pathspec : `session-registre.js commiter -m \"…\"`."
      );
    }
  }

  // 3. Ports partagés (8080 : reuseExistingServer=true → tests sur le mauvais code).
  for (const p of [8080, 4610]) {
    if (await portOccupe(p)) {
      const proprio = reg.sessions.find((s) => (s.ports || []).includes(p));
      const qui = !proprio ? "un processus non enregistré" : proprio.id === MOI ? "cette session" : `« ${proprio.sujet} »`;
      if (!proprio || proprio.id !== MOI) {
        alertes.push(
          p === 8080
            ? `Port 8080 occupé par ${qui}. Playwright a reuseExistingServer:true → tes tests mesureraient CE serveur-là, pas ton code. Servir ailleurs (\`http-server -p 8090\`) ou attendre.`
            : `Port 4610 occupé par ${qui} (centre de pilotage). Ne pas en lancer un second : ils écriraient dans le même dashboard/data/.`
        );
      }
    }
  }

  // 4. Worktrees ouverts.
  const wt = gitSilencieux(["worktree", "list"]).split("\n").filter(Boolean);
  if (wt.length > 1) {
    console.log(`\nWorktrees : ${wt.length}`);
    wt.forEach((l) => console.log(`  ${l}`));
  }

  console.log("");
  if (!alertes.length) {
    console.log("✅ Aucun risque de mélange détecté.");
  } else {
    console.log(`⚠️  ${alertes.length} risque(s) de mélange :`);
    alertes.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  }
  console.log("");
  return alertes.length;
}

/**
 * Commit borné au périmètre déclaré.
 *
 * `git commit -- <chemins>` ignore l'index pour les autres fichiers : le travail
 * de l'autre session reste indexé mais N'ENTRE PAS dans le commit. C'est la
 * seule forme sûre tant que deux sessions partagent un worktree.
 */
function commiter() {
  const reg = purger(lire());
  const entree = moi(reg);
  const cibles = (entree && entree.fichiers) || [];
  if (!cibles.length) {
    console.error("Aucun périmètre déclaré : `ouvrir --sujet \"...\" --fichiers \"a,b\"` d'abord.");
    console.error("Un commit sans pathspec emporterait le travail des autres sessions.");
    process.exitCode = 1;
    return;
  }
  const message = arg("-m");
  const fichierMsg = arg("-F");
  if (!message && !fichierMsg) {
    console.error("Usage : commiter -m \"message\"   ou   commiter -F chemin/message.txt");
    process.exitCode = 1;
    return;
  }
  const args = ["commit"];
  if (fichierMsg) args.push("-F", fichierMsg);
  else args.push("-m", message);
  args.push("--", ...cibles);

  try {
    console.log(execFileSync("git", args, { cwd: REPO, encoding: "utf8" }));
    console.log(`Commit borné à : ${cibles.join(", ")}`);
  } catch (e) {
    console.error((e.stdout || "") + (e.stderr || e.message));
    process.exitCode = 1;
  }
}

/* -------------------------------------------------------------------- main */

const commande = process.argv[2] || "etat";
(async () => {
  switch (commande) {
    case "ouvrir": await ouvrir(); break;
    case "fichiers": fichiers(); break;
    case "port": port(); break;
    case "fermer": fermer(); break;
    case "commiter": commiter(); break;
    case "etat":
    default: await etat(); break;
  }
})();
