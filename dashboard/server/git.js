// ═══════════════════════════════════════════════════════════════════════════
// GIT — lecture du dépôt Passio + opérations de correction SÉCURISÉES.
// Lecture libre (statut, branches, journal, diff). Les MUTATIONS (créer une
// branche, appliquer un patch) exigent : DASH_ALLOW_MUTATIONS=true, hors prod,
// confirmation explicite, jamais sur `main`, jamais de push. Tout est audité.
// ═══════════════════════════════════════════════════════════════════════════
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "./config.js";
import { audit } from "./audit.js";

const exec = promisify(execFile);
const PROTECTED = new Set(["main", "master", "prod", "production"]);

function git(args, opts = {}) {
  return exec("git", args, { cwd: config.repoPath, maxBuffer: 8 * 1024 * 1024, ...opts });
}
function validBranch(name) { return /^[\w./-]{1,80}$/.test(name) && !PROTECTED.has(name); }

export async function status() {
  const [{ stdout: branch }, { stdout: porcelain }, { stdout: ahead }] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "HEAD"]),
    git(["status", "--porcelain"]),
    git(["rev-list", "--count", "--left-right", "@{upstream}...HEAD"]).catch(() => ({ stdout: "0\t0" })),
  ]);
  const files = porcelain.trim().split("\n").filter(Boolean).map((l) => ({ state: l.slice(0, 2).trim(), file: l.slice(3) }));
  const [behind, aheadN] = ahead.trim().split(/\s+/);
  return { branch: branch.trim(), files, ahead: Number(aheadN || 0), behind: Number(behind || 0), repo: config.repoPath };
}

export async function branches() {
  const { stdout } = await git(["branch", "--sort=-committerdate", "--format=%(refname:short)|%(committerdate:relative)"]);
  return stdout.trim().split("\n").filter(Boolean).map((l) => { const [name, date] = l.split("|"); return { name, date, protected: PROTECTED.has(name) }; });
}

export async function log(n = 20) {
  const { stdout } = await git(["log", `-${n}`, "--pretty=%h|%an|%ar|%s"]);
  return stdout.trim().split("\n").filter(Boolean).map((l) => { const [hash, author, date, ...s] = l.split("|"); return { hash, author, date, subject: s.join("|") }; });
}

/**
 * Commits récents avec date ABSOLUE et fichiers touchés — matière première de
 * la corrélation « un incident est-il apparu juste après un changement ? ».
 * (`log()` renvoie des dates relatives, inexploitables pour comparer à un ts.)
 */
export async function commitsSince(sinceMs, max = 40) {
  const iso = new Date(sinceMs).toISOString();
  const { stdout } = await git([
    "log", `-${max}`, `--since=${iso}`, "--name-only",
    "--pretty=format:%x00%H|%h|%an|%aI|%s",
  ]);
  // Séparateur d'enregistrement = %x00 : un sujet de commit peut contenir
  // n'importe quoi (y compris des lignes vides), un séparateur texte serait fragile.
  return stdout.split("\0").map((block) => block.trim()).filter(Boolean).map((block) => {
    const [head, ...rest] = block.split("\n");
    const [full, hash, author, dateIso, ...subj] = head.split("|");
    return {
      full, hash, author, subject: subj.join("|"),
      at: new Date(dateIso).getTime(),
      files: rest.map((f) => f.trim()).filter(Boolean),
    };
  }).filter((c) => Number.isFinite(c.at));
}

export async function diff(file) {
  const args = ["diff", "--no-color"]; if (file) args.push("--", file);
  const { stdout } = await git(args);
  return stdout;
}

/** Recherche les commits récents touchant un fichier (aide au diagnostic de bug). */
export async function blameFile(file, n = 5) {
  if (!file) return [];
  try {
    const { stdout } = await git(["log", `-${n}`, "--pretty=%h|%an|%ar|%s", "--", file]);
    return stdout.trim().split("\n").filter(Boolean).map((l) => { const [hash, author, date, ...s] = l.split("|"); return { hash, author, date, subject: s.join("|") }; });
  } catch { return []; }
}

/** Extrait un fragment de code autour d'une ligne (pour la fiche de bug). */
export function readSnippet(file, line, radius = 12) {
  try {
    const clean = file.replace(/^\/+/, "").split("?")[0];
    const abs = path.resolve(config.repoPath, clean);
    // Anti path-traversal. Le chemin vient d'une STACK TRACE de navigateur, donc
    // d'une source hostile, et `extractCodeRef` accepte « . » et « / » : « ../ »
    // peut arriver jusqu'ici. Le test de préfixe nu était insuffisant — il laissait
    // passer un dossier VOISIN (…/PASSIO-autre/x.js commence bien par …/PASSIO).
    // Il faut le séparateur, et l'égalité stricte pour la racine elle-même.
    const root = path.resolve(config.repoPath);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    if (!fs.existsSync(abs)) return null;
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    const from = Math.max(1, (line || 1) - radius);
    const to = Math.min(lines.length, (line || 1) + radius);
    const slice = [];
    for (let i = from; i <= to; i++) slice.push({ n: i, code: lines[i - 1], hot: i === line });
    return { file: clean, from, to, lines: slice };
  } catch { return null; }
}

// ─── Mutations (sécurisées) ──────────────────────────────────────────────────
function guardMutation(actor) {
  if (!config.allowMutations) { const e = new Error("Mutations désactivées (DASH_ALLOW_MUTATIONS=false ou production)."); e.code = 403; throw e; }
}

export async function createBranch(name, actor) {
  guardMutation(actor);
  if (!validBranch(name)) { const e = new Error("Nom de branche invalide ou protégé."); e.code = 400; throw e; }
  await git(["checkout", "-b", name]);
  audit("git_create_branch", { name }, actor);
  return { created: name };
}

/** Applique un patch (format `git diff`) sur une NOUVELLE branche dédiée. */
export async function applyPatch({ branch, patch }, actor) {
  guardMutation(actor);
  if (!validBranch(branch)) { const e = new Error("Branche cible invalide/protégée."); e.code = 400; throw e; }
  if (!patch || patch.length > 500_000) { const e = new Error("Patch vide ou trop volumineux."); e.code = 400; throw e; }
  const cur = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  if (PROTECTED.has(cur)) {
    // ne jamais appliquer directement sur une branche protégée : on branche d'abord
    await git(["checkout", "-b", branch]);
  } else if (cur !== branch) {
    await git(["checkout", "-b", branch]).catch(() => git(["checkout", branch]));
  }
  const tmp = path.join(os.tmpdir(), `passio-patch-${Date.now()}.diff`);
  fs.writeFileSync(tmp, patch);
  try {
    await git(["apply", "--check", tmp]);         // vérifie avant d'appliquer
    await git(["apply", tmp]);
    audit("git_apply_patch", { branch, size: patch.length }, actor);
    return { applied: true, branch };
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

export async function revert(file, actor) {
  guardMutation(actor);
  await git(["checkout", "--", file]);
  audit("git_revert_file", { file }, actor);
  return { reverted: file };
}
