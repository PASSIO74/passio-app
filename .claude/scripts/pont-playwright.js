#!/usr/bin/env node
/**
 * Pont de révision Playwright — hook SessionStart.
 *
 * Les environnements distants (Claude Code on the web) embarquent une révision
 * de navigateurs FIGÉE dans l'image, alors que package-lock.json peut verrouiller
 * une version de Playwright qui en attend une AUTRE. Le décalage ne se voit pas
 * au démarrage : il éclate à la première suite e2e, avec un message qui invite à
 * lancer « npx playwright install » — interdit ici (pas de réseau sortant vers le
 * CDN, et l'image est en lecture pour ce qui compte).
 *
 * Ce script relie la révision ATTENDUE à la révision PRÉSENTE par des liens
 * symboliques, sans rien télécharger et sans toucher au dépôt. Il gère aussi le
 * renommage du binaire headless (headless_shell -> chrome-headless-shell) et
 * celui de son dossier (chrome-linux -> chrome-headless-shell-linux64).
 *
 * Idempotent, silencieux quand il n'y a rien à faire, et ne fait JAMAIS échouer
 * la session : un pont impossible est signalé, il n'interrompt pas.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const RACINE =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.join(os.homedir(), ".cache", "ms-playwright");

// Familles de navigateurs et emplacement du binaire, ancien nommage compris.
const FAMILLES = [
  {
    nom: "chromium",
    prefixe: "chromium-",
    cibles: [["chrome-linux", "chrome"]],
  },
  {
    nom: "chromium-headless-shell",
    prefixe: "chromium_headless_shell-",
    cibles: [
      ["chrome-headless-shell-linux64", "chrome-headless-shell"], // >= 1200
      ["chrome-linux", "headless_shell"],                          // ancien
    ],
  },
];

function log(msg) {
  if (!process.argv.includes("--quiet")) console.log(`[pont-playwright] ${msg}`);
}

/** Révisions attendues, lues chez le playwright-core RÉELLEMENT résolu. */
function revisionsAttendues() {
  try {
    const coreDir = path.dirname(
      require.resolve("playwright-core/package.json", { paths: [process.cwd()] })
    );
    const { browsers } = require(path.join(coreDir, "browsers.json"));
    const out = {};
    for (const b of browsers) out[b.name] = String(b.revision);
    return out;
  } catch {
    return null;
  }
}

/** Premier chemin de binaire existant pour une révision donnée. */
function binaireDe(famille, rev) {
  for (const [dossier, fichier] of famille.cibles) {
    const p = path.join(RACINE, famille.prefixe + rev, dossier, fichier);
    if (fs.existsSync(p)) return { chemin: p, dossier, fichier };
  }
  return null;
}

/** Révisions présentes sur le disque pour cette famille, décroissant. */
function revisionsPresentes(famille) {
  let entrees = [];
  try {
    entrees = fs.readdirSync(RACINE);
  } catch {
    return [];
  }
  return entrees
    .filter((e) => e.startsWith(famille.prefixe))
    .map((e) => e.slice(famille.prefixe.length))
    .filter((r) => /^\d+$/.test(r))
    .sort((a, b) => Number(b) - Number(a));
}

function lier(src, dst) {
  if (fs.existsSync(dst)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.symlinkSync(src, dst);
}

function ponter(famille, attendue, source) {
  const src = binaireDe(famille, source);
  if (!src) return false;
  const [dossierCible, fichierCible] = famille.cibles[0];
  const dstDir = path.join(RACINE, famille.prefixe + attendue, dossierCible);
  const srcDir = path.dirname(src.chemin);

  // Chaque ressource voisine (.pak, icudtl.dat, .so) doit rester à côté du binaire.
  fs.mkdirSync(dstDir, { recursive: true });
  for (const e of fs.readdirSync(srcDir)) lier(path.join(srcDir, e), path.join(dstDir, e));
  lier(src.chemin, path.join(dstDir, fichierCible)); // renommage éventuel
  fs.writeFileSync(path.join(RACINE, famille.prefixe + attendue, "INSTALLATION_COMPLETE"), "");
  return true;
}

function main() {
  const attendues = revisionsAttendues();
  if (!attendues) return; // Playwright absent : rien à ponter.

  const faits = [];
  for (const famille of FAMILLES) {
    const attendue = attendues[famille.nom];
    if (!attendue) continue;
    if (binaireDe(famille, attendue)) continue; // déjà bon

    const candidates = revisionsPresentes(famille).filter((r) => r !== attendue);
    const source = candidates.find((r) => binaireDe(famille, r));
    if (!source) {
      log(`⚠ ${famille.nom} attend ${attendue}, aucune révision utilisable sur le disque.`);
      continue;
    }
    if (ponter(famille, attendue, source)) faits.push(`${famille.nom} ${source}→${attendue}`);
  }

  if (faits.length) log(`pont posé : ${faits.join(", ")}`);
}

try {
  main();
} catch (e) {
  log(`⚠ pont impossible (${e && e.message}) — les suites e2e peuvent échouer.`);
}
process.exit(0); // ne bloque jamais le démarrage de la session
