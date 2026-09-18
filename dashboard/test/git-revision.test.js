// Verrous de git-revision.js : la révision se lit dans un dépôt principal ET dans
// un worktree (où `.git` est un FICHIER `gitdir:` et les références vivent dans
// le dépôt commun). Aucun processus git n'est lancé : on fabrique les fichiers.
//
// Mutations éprouvées (chacune rougit le test nommé) :
//  • traiter `.git` fichier comme un dossier (retirer la branche isDirectory) → ② et ③ ;
//  • ignorer `commondir` (chercher la ref dans le seul gitDir) → ③ ;
//  • ne pas lire packed-refs → ④ ;
//  • rendre une chaîne quelconque au lieu de "" quand on ne sait pas → ⑤.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lireRevision, revisionCourte, resoudreGitDir } from "../server/git-revision.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const SHA2 = "fedcba9876543210fedcba9876543210fedcba98";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "passio-gitrev-")); }
function ecrire(p, contenu) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, contenu); }

test("① dépôt principal : .git dossier, HEAD sur une branche, ref lisible", () => {
  const repo = tmp();
  ecrire(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
  ecrire(path.join(repo, ".git", "refs", "heads", "main"), SHA + "\n");
  assert.deepEqual(lireRevision(repo), { branch: "main", sha: SHA });
  assert.equal(revisionCourte(repo), SHA.slice(0, 8));
  assert.equal(revisionCourte(repo, 12), SHA.slice(0, 12));
});

test("② worktree : .git est un FICHIER gitdir: et HEAD vit dans le gitdir désigné", () => {
  const principal = tmp();
  const wt = tmp();
  const gitDir = path.join(principal, ".git", "worktrees", "wt1");
  ecrire(path.join(wt, ".git"), `gitdir: ${gitDir}\n`);
  ecrire(path.join(gitDir, "HEAD"), "ref: refs/heads/claude/lot\n");
  ecrire(path.join(gitDir, "commondir"), "../..\n");
  ecrire(path.join(principal, ".git", "refs", "heads", "claude", "lot"), SHA2 + "\n");
  assert.equal(resoudreGitDir(wt), gitDir);
  assert.deepEqual(lireRevision(wt), { branch: "claude/lot", sha: SHA2 });
});

test("③ worktree : la ref est cherchée dans le dépôt COMMUN (commondir), pas dans le gitdir du worktree", () => {
  const principal = tmp();
  const wt = tmp();
  const gitDir = path.join(principal, ".git", "worktrees", "wt2");
  ecrire(path.join(wt, ".git"), `gitdir: ${gitDir}\n`);
  ecrire(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
  ecrire(path.join(gitDir, "commondir"), path.join(principal, ".git") + "\n");   // forme absolue
  ecrire(path.join(principal, ".git", "refs", "heads", "main"), SHA + "\n");
  assert.equal(lireRevision(wt).sha, SHA);
});

test("④ référence empaquetée (packed-refs) : lue dans le dépôt commun", () => {
  const repo = tmp();
  ecrire(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
  ecrire(path.join(repo, ".git", "packed-refs"), `# pack-refs with: peeled fully-peeled sorted\n${SHA2} refs/heads/main\n${SHA} refs/tags/v1\n`);
  assert.deepEqual(lireRevision(repo), { branch: "main", sha: SHA2 });
});

test("⑤ ne SAIT pas → \"\" et null, jamais une révision inventée ; HEAD détachée → sha nu", () => {
  const vide = tmp();
  assert.deepEqual(lireRevision(vide), { branch: null, sha: null });
  assert.equal(revisionCourte(vide), "");
  const detache = tmp();
  ecrire(path.join(detache, ".git", "HEAD"), SHA + "\n");
  assert.deepEqual(lireRevision(detache), { branch: "detached", sha: SHA });
  const corrompu = tmp();
  ecrire(path.join(corrompu, ".git", "HEAD"), "ref: refs/heads/x\n");
  ecrire(path.join(corrompu, ".git", "refs", "heads", "x"), "pas-un-sha\n");
  assert.equal(lireRevision(corrompu).sha, null);
  assert.equal(revisionCourte(corrompu), "");
});
