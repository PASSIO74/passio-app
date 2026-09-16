"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// LIRE LA PREUVE DE REVUE SUR GITHUB (ASTRA-51) — les deux lectures dont
// `verifierPreuveRevue` (barriere-migration.js) a besoin, par `gh api` :
//   · les revues d'une PR : GET repos/{o}/{r}/pulls/{n}/reviews
//   · le contenu d'un fichier à un commit : GET repos/{o}/{r}/contents/{p}?ref={sha}
// Rien d'autre n'est lu, rien n'est écrit. `PASSIO_GH_BIN` désigne un autre
// binaire (le test unitaire y pose un faux `gh` qui sert des fixtures) ;
// `PASSIO_DEPOT` force le dépôt (sinon : le remote `origin`).
// Une lecture qui échoue rend `null`, jamais une liste vide : l'appelant
// traduit `null` en « NON VÉRIFIABLE », ce qui refuse.
// ═══════════════════════════════════════════════════════════════════════════
const { execFileSync } = require("node:child_process");

/**
 * ASTRA-61 : le fournisseur de la preuve est-il RÉEL ? Réel = le `gh` du PATH
 * et le dépôt lu sur `origin`. Tout override de test (`PASSIO_GH_BIN`,
 * `PASSIO_DEPOT`) est un fournisseur FICTIF : il sert les bancs, il ne
 * certifie rien — barriere-migration.js le refuse sur une cible protégée.
 */
function fournisseur() {
  const motifs = [];
  if (process.env.PASSIO_GH_BIN) motifs.push("PASSIO_GH_BIN=" + process.env.PASSIO_GH_BIN);
  if (process.env.PASSIO_DEPOT) motifs.push("PASSIO_DEPOT=" + process.env.PASSIO_DEPOT);
  return { reel: motifs.length === 0, motifs };
}

/** La liste des relecteurs autorisés (`.passio/migrations/relecteurs-autorises.json`), ou null si illisible. */
function lireRelecteursAutorises(racine) {
  const fs = require("node:fs"), path = require("node:path");
  const p = process.env.PASSIO_RELECTEURS ? path.resolve(process.env.PASSIO_RELECTEURS) : path.join(racine, ".passio", "migrations", "relecteurs-autorises.json");
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const l = Array.isArray(j) ? j : j && Array.isArray(j.relecteurs) ? j.relecteurs : null;
    return l && l.every((x) => typeof x === "string" && x) ? l : null;
  } catch (e) { return null; }
}

function depot(cwd) {
  if (process.env.PASSIO_DEPOT) return process.env.PASSIO_DEPOT;
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const m = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(url);
    if (m) return m[1] + "/" + m[2];
  } catch (e) { /* pas de remote : on le dira */ }
  return null;
}

function ghApi(chemin, cwd) {
  const bin = process.env.PASSIO_GH_BIN || "gh";
  // Un faux `gh` en JavaScript (`.mjs`/`.js`) est lancé par node : portable (Windows compris).
  const [exe, prefixe] = /[.]m?js$/.test(bin) ? [process.execPath, [bin]] : [bin, []];
  try {
    const out = execFileSync(exe, [...prefixe, "api", chemin], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GH_NO_UPDATE_NOTIFIER: "1", GH_PROMPT_DISABLED: "1" } });
    return JSON.parse(out);
  } catch (e) { if (process.env.PASSIO_DEBUG) console.error("gh api", chemin, ":", String(e.stderr || e.message).slice(0, 300)); return null; }
}

/** Les revues de la PR, ou null si illisibles. */
function lireRevues(pr, cwd) {
  const d = depot(cwd); if (!d) return null;
  const n = String(pr).replace(/^#/, "");
  const r = ghApi("repos/" + d + "/pulls/" + n + "/reviews?per_page=100", cwd);
  return Array.isArray(r) ? r : null;
}

/** L'auteur (login) de la PR, ou null. */
function lireAuteurPr(pr, cwd) {
  const d = depot(cwd); if (!d) return null;
  const r = ghApi("repos/" + d + "/pulls/" + String(pr).replace(/^#/, ""), cwd);
  return r && r.user && r.user.login ? r.user.login : null;
}

/** Le contenu d'un fichier à un commit, ou null. */
function lireContenuAuCommit(fichier, sha, cwd) {
  const d = depot(cwd); if (!d) return null;
  const r = ghApi("repos/" + d + "/contents/" + fichier + "?ref=" + sha, cwd);
  if (!r || typeof r.content !== "string") return null;
  try { return Buffer.from(r.content.replace(/\n/g, ""), "base64").toString("utf8"); } catch (e) { return null; }
}

module.exports = { depot, fournisseur, lireRelecteursAutorises, lireRevues, lireAuteurPr, lireContenuAuCommit };
