// ═══════════════════════════════════════════════════════════════════════════
// GIT — le module qui peut réellement abîmer le dépôt de travail.
//
// Il porte deux frontières, et aucune n'était couverte :
//
//   A. LE CHEMIN LU. `readSnippet` reçoit un chemin de fichier extrait d'une
//      STACK TRACE de navigateur — donc écrit par une source hostile — et lit
//      le disque avec. Le garde anti-traversée a déjà dû être corrigé une fois :
//      un test de préfixe nu laissait passer un dossier VOISIN (`…/PASSIO-autre`
//      commence bien par `…/PASSIO`). Rien ne le figeait.
//
//   B. LA MUTATION. `createBranch`, `applyPatch` et `revert` changent de branche
//      et écrivent dans le dépôt. C'est exactement le geste qui, le 2026-07-21,
//      a mélangé deux travaux en cours. Trois verrous les gardent : mutations
//      autorisées, hors production, nom de branche valide et non protégé.
//
// ⚠️ MÉTHODE, à ne pas défaire : ce fichier n'exécute JAMAIS une mutation qui
// aboutirait. Les appels testés sont tous rejetés AVANT la première commande
// git — nom invalide, branche protégée, patch vide, mutations coupées. Le
// dernier test relit HEAD et le compare à sa valeur de départ : si quelqu'un
// écrit ici un cas « passant », il le saura. Les trois verrous eux-mêmes sont
// éprouvés dans des PROCESSUS ENFANTS, parce que `config.js` lit l'environnement
// une seule fois, au chargement.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ⚠️ `import` est HISSÉ : un `process.env.X = …` écrit au-dessus des imports
// s'exécute APRÈS eux, donc après que `config.js` a lu l'environnement. La
// première version de ce fichier posait le drapeau en tête et obtenait quand
// même des refus 403 — les mutations restaient coupées, et les tests de
// validation de NOM ne testaient rien. D'où l'import DYNAMIQUE ci-dessous, seul
// moyen d'ordonner « poser l'environnement, puis charger le module ».
process.env.DASH_ALLOW_MUTATIONS = "true";
process.env.DASH_ENV = "development";
const { config } = await import("../server/config.js");
const { readSnippet, createBranch, applyPatch, status } = await import("../server/git.js");

assert.equal(config.allowMutations, true,
  "les verrous de nom ne sont atteignables que mutations autorisées");

const HEAD_AU_DEPART = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"],
  { cwd: config.repoPath, encoding: "utf8" }).trim();

// ─── Bac à sable pour les processus enfants ──────────────────────────────────
// ⚠️ INCIDENT VÉCU EN ÉCRIVANT CE FICHIER, à ne jamais reproduire. Les tests des
// verrous d'environnement appellent `createBranch("correctif/x")` avec un nom
// VALIDE : seul le verrou les arrête. En éprouvant la suite par mutation — le
// verrou neutralisé exprès — l'enfant a donc exécuté un vrai `git checkout -b`
// dans le DÉPÔT DE TRAVAIL, qui s'est retrouvé sur une autre branche. C'est
// exactement l'incident du 2026-07-21. Le filet de fin de fichier l'a signalé,
// mais après coup : un test ne doit pas pouvoir atteindre le vrai dépôt, même
// avec tous ses gardes cassés. Les enfants travaillent donc sur un dépôt jetable.
const BAC = fs.mkdtempSync(path.join(os.tmpdir(), "passio-git-test-"));
for (const args of [["init", "-q", "-b", "bac"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) {
  execFileSync("git", args, { cwd: BAC, stdio: "ignore" });
}
fs.writeFileSync(path.join(BAC, "index.html"), "<!doctype html>\n");
execFileSync("git", ["add", "-A"], { cwd: BAC, stdio: "ignore" });
execFileSync("git", ["commit", "-qm", "bac"], { cwd: BAC, stdio: "ignore" });
process.on("exit", () => { try { fs.rmSync(BAC, { recursive: true, force: true }); } catch {} });

/** Exécute un bout de code dans un processus neuf, sur le dépôt JETABLE. */
function dansUnEnfant(env, code) {
  try {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: path.resolve("."), encoding: "utf8",
      env: { ...process.env, PASSIO_REPO_PATH: BAC, ...env },
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: String(e.stdout || "").trim(), err: String(e.stderr || "").trim() };
  }
}

// ─── A. Lecture de fichier depuis une source hostile ─────────────────────────
test("readSnippet lit un fichier réel du dépôt", () => {
  const cible = fs.readdirSync(path.join(config.repoPath, "js")).find((f) => f.endsWith(".js"));
  assert.ok(cible, "aucun fichier js/ pour l'essai");
  const s = readSnippet(`js/${cible}`, 5, 2);
  assert.ok(s && Array.isArray(s.lines) && s.lines.length > 0);
  assert.equal(s.file, `js/${cible}`);
  assert.ok(s.lines.some((l) => l.hot), "la ligne visée doit être marquée");
});

test("readSnippet refuse toute sortie du dépôt", () => {
  for (const chemin of [
    "../../../etc/passwd",
    "../../.ssh/id_rsa",
    "js/../../../etc/hosts",
    "/etc/passwd",
    "../AppData/Roaming/secrets.json",
  ]) {
    assert.equal(readSnippet(chemin, 1), null, `chemin accepté à tort : ${chemin}`);
  }
});

test("readSnippet refuse le dossier VOISIN — le défaut du préfixe nu", () => {
  // ⚠️ Ce test doit créer un vrai fichier hors du dépôt, et c'est délibéré :
  // `readSnippet` rend `null` pour tout fichier ABSENT, donc un chemin voisin
  // inexistant serait refusé même par un garde cassé — le test passerait sans
  // rien prouver. Le fichier est créé sous un nom portant le PID et supprimé
  // dans le `finally`, y compris si l'assertion échoue.
  const racine = path.resolve(config.repoPath);
  const voisin = `${racine}-voisin-test-${process.pid}`;
  const fichier = path.join(voisin, "vole.js");
  try {
    fs.mkdirSync(voisin, { recursive: true });
    fs.writeFileSync(fichier, "const secret = 1;\n".repeat(5));
    // `path.resolve` de ce chemin commence bien par la racine du dépôt : c'est
    // exactement ce qu'un `startsWith(root)` sans séparateur laissait passer.
    assert.ok(fichier.startsWith(racine), "le cas testé n'est plus le bon");
    assert.equal(readSnippet(`../${path.basename(voisin)}/vole.js`, 2), null,
      "un dossier voisin du dépôt a été lu — le garde est revenu au préfixe nu");
  } finally {
    fs.rmSync(voisin, { recursive: true, force: true });
  }
});

test("readSnippet nettoie la forme du chemin (slashs de tête, query)", () => {
  const cible = fs.readdirSync(path.join(config.repoPath, "js")).find((f) => f.endsWith(".js"));
  // Une stack trace donne souvent « /js/app.js?v=3 » : les deux doivent viser le
  // même fichier, sans que le « ../ » puisse revenir par la query.
  assert.ok(readSnippet(`/js/${cible}?v=42`, 3));
  assert.equal(readSnippet("/../../etc/passwd?x=1", 1), null);
});

test("readSnippet rend null sur un fichier absent, jamais une exception", () => {
  assert.equal(readSnippet("js/ce-fichier-nexiste-pas-9f3a.js", 10), null);
  assert.equal(readSnippet("", 1), null);
  assert.equal(readSnippet(null, 1), null);
});

// ─── B. Mutations : les trois verrous ────────────────────────────────────────
test("une branche protégée est refusée (jamais de travail direct sur main)", async () => {
  for (const nom of ["main", "master", "prod", "production"]) {
    await assert.rejects(() => createBranch(nom, "test"), (e) => {
      assert.equal(e.code, 400);
      return true;
    }, `branche protégée acceptée : ${nom}`);
  }
});

test("un nom de branche hostile est refusé avant toute commande git", async () => {
  for (const nom of [
    "", " ", "a b", "br;rm -rf /", "br$(whoami)", "br`id`", "br&&echo",
    "br|cat", "br\nmain", "x".repeat(81), "--upload-pack=evil",
  ]) {
    await assert.rejects(() => createBranch(nom, "test"), (e) => e.code === 400,
      `nom accepté à tort : ${JSON.stringify(nom)}`);
  }
});

test("applyPatch : branche invalide et patch vide/énorme sont refusés", async () => {
  await assert.rejects(() => applyPatch({ branch: "main", patch: "diff" }, "t"), (e) => e.code === 400);
  await assert.rejects(() => applyPatch({ branch: "correctif/ok", patch: "" }, "t"), (e) => e.code === 400);
  await assert.rejects(() => applyPatch({ branch: "correctif/ok", patch: null }, "t"), (e) => e.code === 400);
  await assert.rejects(
    () => applyPatch({ branch: "correctif/ok", patch: "x".repeat(500_001) }, "t"), (e) => e.code === 400);
});

test("mutations coupées par défaut : sans DASH_ALLOW_MUTATIONS, tout est refusé", () => {
  const r = dansUnEnfant({ DASH_ALLOW_MUTATIONS: "", DASH_ENV: "development" }, `
    const { createBranch, applyPatch, revert } = await import("./server/git.js");
    for (const [nom, appel] of [
      ["createBranch", () => createBranch("correctif/x", "t")],
      ["applyPatch", () => applyPatch({ branch: "correctif/x", patch: "diff --git a b" }, "t")],
      ["revert", () => revert("index.html", "t")],
    ]) {
      try { await appel(); console.log("PASSE:" + nom); }
      catch (e) { if (e.code !== 403) console.log("MAUVAIS_CODE:" + nom + ":" + e.code); }
    }
    console.log("FIN");
  `);
  assert.ok(r.ok, "l'enfant a échoué : " + (r.err || ""));
  assert.equal(r.out, "FIN", "une mutation est passée alors qu'elles sont coupées : " + r.out);
});

test("en production, l'autorisation explicite ne suffit pas", () => {
  // `allowMutations` exige les DEUX : le drapeau ET un environnement non-prod.
  // C'est la seule barrière entre le pilotage et le dépôt d'une prod.
  const r = dansUnEnfant({ DASH_ALLOW_MUTATIONS: "true", DASH_ENV: "production" }, `
    const { config } = await import("./server/config.js");
    const { createBranch } = await import("./server/git.js");
    if (config.allowMutations) console.log("MUTATIONS_AUTORISEES_EN_PROD");
    try { await createBranch("correctif/x", "t"); console.log("PASSE"); }
    catch (e) { if (e.code !== 403) console.log("MAUVAIS_CODE:" + e.code); }
    console.log("FIN");
  `);
  assert.ok(r.ok, "l'enfant a échoué : " + (r.err || ""));
  assert.equal(r.out, "FIN", r.out);
});

// ─── Filet ───────────────────────────────────────────────────────────────────
test("aucun test de ce fichier n'a touché le dépôt", async () => {
  const apres = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: config.repoPath, encoding: "utf8" }).trim();
  assert.equal(apres, HEAD_AU_DEPART,
    "un test a changé de branche — relis la méthode en tête de fichier.");
  const st = await status();
  assert.equal(st.branch, HEAD_AU_DEPART);
  // …et le dépôt jetable n'a pas bougé non plus tant que les verrous tiennent.
  const bac = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: BAC, encoding: "utf8" }).trim();
  assert.equal(bac, "bac", "un enfant a muté le bac à sable : un verrou ne tient plus");
});
