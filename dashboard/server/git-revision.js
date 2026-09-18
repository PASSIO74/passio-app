// ═══════════════════════════════════════════════════════════════════════════
// RÉVISION DU DÉPÔT, LUE À MÊME `.git` — sans lancer un seul processus.
//
// Trois modules (sentinel.js pour la clé de cooldown, release-recorder.js pour
// l'instantané de release, incident-packets.js pour la clé de regroupement)
// lisaient chacun `.git/HEAD` à la main. Tous trois supposaient que `.git` est
// un DOSSIER. Ce n'est vrai que pour le dépôt principal : dans un WORKTREE
// (`git worktree add`, la pratique des sessions parallèles PASSIO-wt/*), `.git`
// est un FICHIER d'une ligne — `gitdir: <chemin>` — et les références vivent
// dans le dépôt commun (`<gitdir>/commondir`). Résultat mesuré le 2026-09-18 :
// deux tests du pilotage rouges dans un worktree, et une révision vide, donc
// une clé de cooldown nue — « même cause pendant 6 h » sans distinguer deux
// commits.
//
// Ce module est la seule lecture. Il rend `""` quand il ne SAIT pas (pas un
// dépôt, fichier illisible) : un appelant ne doit jamais prendre une révision
// inventée pour une preuve.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

/** Dossier git effectif (dossier `.git`, ou cible d'un fichier `gitdir:`). */
export function resoudreGitDir(repoPath) {
  const dotGit = path.join(repoPath, ".git");
  let st;
  try { st = fs.statSync(dotGit); } catch { return null; }
  if (st.isDirectory()) return dotGit;
  // Worktree : `.git` est un fichier « gitdir: <chemin absolu ou relatif> ».
  try {
    const ligne = fs.readFileSync(dotGit, "utf8").split("\n").find((l) => l.startsWith("gitdir:"));
    if (!ligne) return null;
    const cible = ligne.slice("gitdir:".length).trim();
    return path.isAbsolute(cible) ? cible : path.resolve(repoPath, cible);
  } catch { return null; }
}

/** Dossier commun des références (le dépôt principal) — `commondir` d'un worktree, sinon gitDir lui-même. */
export function resoudreCommonDir(gitDir) {
  try {
    const commun = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
    if (!commun) return gitDir;
    return path.isAbsolute(commun) ? commun : path.resolve(gitDir, commun);
  } catch { return gitDir; }
}

function lireRef(dossier, ref) {
  try { return fs.readFileSync(path.join(dossier, ref), "utf8").trim() || null; } catch { return null; }
}

function lirePacked(dossier, ref) {
  try {
    const packed = fs.readFileSync(path.join(dossier, "packed-refs"), "utf8");
    const ligne = packed.split("\n").find((l) => l.endsWith(" " + ref));
    return ligne ? ligne.split(" ")[0] : null;
  } catch { return null; }
}

/**
 * Révision courante du dépôt.
 * @returns {{ branch: string|null, sha: string|null }} — `sha` complet (40 hex) ou null ;
 *   `branch` = nom court, "detached" si HEAD détachée, null si illisible.
 */
export function lireRevision(repoPath) {
  const gitDir = resoudreGitDir(repoPath);
  if (!gitDir) return { branch: null, sha: null };
  let head;
  try { head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim(); } catch { return { branch: null, sha: null }; }
  if (!head.startsWith("ref:")) return { branch: "detached", sha: /^[0-9a-f]{40}$/i.test(head) ? head : null };
  const ref = head.slice(4).trim();
  const commun = resoudreCommonDir(gitDir);
  // Ordre : la référence peut vivre dans le gitDir du worktree (HEAD de
  // branches propres à ce worktree n'existe pas, mais on reste tolérant), puis
  // dans le dépôt commun, puis empaquetée dans le dépôt commun.
  const sha = lireRef(gitDir, ref) || lireRef(commun, ref) || lirePacked(commun, ref) || lirePacked(gitDir, ref);
  return { branch: ref.replace(/^refs\/heads\//, ""), sha: sha && /^[0-9a-f]{40}$/i.test(sha) ? sha : null };
}

/** Révision courte (n caractères) ou "" si inconnue — la forme attendue par les clés de cooldown. */
export function revisionCourte(repoPath, n = 8) {
  const { sha } = lireRevision(repoPath);
  return sha ? sha.slice(0, n) : "";
}
