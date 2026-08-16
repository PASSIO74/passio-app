// Tests de la RÉPARATION AUTOMATIQUE.
//
// Ce qui est protégé ici est simple à énoncer : un correctif écrit par un modèle,
// en réaction à des données d'observation potentiellement hostiles, appliqué sans
// personne devant l'écran. Les garde-fous ne sont pas décoratifs :
//  • il ne doit JAMAIS pouvoir modifier les tests (sinon il rend le vert tout seul) ;
//  • ni la CI, les migrations, la configuration, le dashboard lui-même ;
//  • ni créer/supprimer/renommer des fichiers ;
//  • ni dépasser une taille où « réparation » devient « refonte ».
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const TMP = path.join(process.cwd(), "test", ".tmp-data-repair");
process.env.DASH_DATA_DIR = TMP;
fs.rmSync(TMP, { recursive: true, force: true });

const { extractPatch, validatePatch, buildPatchPrompt, readRepoFile, REPAIR } = await import("../server/repair.js");

/** Fabrique un diff unifié minimal et valide. */
function diff(file = "js/app-04.js", lignes = 2) {
  const corps = Array.from({ length: lignes }, (_, i) => `-  const a${i} = 1;\n+  const a${i} = 2;`).join("\n");
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -10,4 +10,4 @@\n${corps}\n`;
}

// ─── Extraction ──────────────────────────────────────────────────────────────

test("extrait le diff d'un bloc clôturé", () => {
  const p = extractPatch("Voici le correctif :\n```diff\n" + diff() + "```\nVoilà.");
  assert.ok(p.startsWith("diff --git a/js/app-04.js"));
  assert.ok(!p.includes("Voilà"));
});

test("extrait un diff brut sans bloc, et ne renvoie rien s'il n'y en a pas", () => {
  assert.ok(extractPatch("blabla\n" + diff()).startsWith("diff --git"));
  assert.equal(extractPatch("Je ne vois pas de correctif évident."), null);
  assert.equal(extractPatch(null), null);
});

// ─── Périmètre des fichiers : le cœur du sujet ───────────────────────────────

test("REFUSE de modifier les tests — un correctif ne se rend pas vert lui-même", () => {
  const v = validatePatch(diff("tests/e2e/smoke.spec.js"));
  assert.equal(v.ok, false);
  assert.match(v.raison, /hors périmètre/);
});

test("REFUSE la CI, les migrations, la configuration et le dashboard", () => {
  for (const f of [
    ".github/workflows/deploy.yml", "migrations/0001.sql", "package.json",
    "scripts/build.js", "dashboard/server/sentinel.js", ".claude/settings.json",
  ]) {
    const v = validatePatch(diff(f));
    assert.equal(v.ok, false, `${f} devrait être refusé`);
  }
});

test("ACCEPTE le code applicatif", () => {
  for (const f of ["js/app-04.js", "js/telemetry.js", "styles.css", "index.html", "sw.js"]) {
    assert.equal(validatePatch(diff(f)).ok, true, `${f} devrait être accepté`);
  }
});

test("REFUSE toute sortie du dépôt par le chemin", () => {
  assert.equal(validatePatch(diff("../../etc/passwd.js")).ok, false);
  assert.equal(validatePatch(diff("/etc/shadow.js")).ok, false);
  assert.equal(validatePatch(diff("js/../../secret.js")).ok, false);
});

// ─── Forme et taille ─────────────────────────────────────────────────────────

test("REFUSE création, suppression et renommage de fichier", () => {
  const base = diff();
  for (const marqueur of ["new file mode 100644", "deleted file mode 100644", "rename from js/x.js", "old mode 100644"]) {
    const v = validatePatch(base.replace("--- a/", marqueur + "\n--- a/"));
    assert.equal(v.ok, false, `« ${marqueur} » devrait être refusé`);
  }
});

test("REFUSE un correctif trop gros : ce n'est plus une réparation", () => {
  const v = validatePatch(diff("js/app-04.js", REPAIR.maxChangedLines));
  assert.equal(v.ok, false);
  assert.match(v.raison, /lignes modifiées/);
});

test("REFUSE de toucher trop de fichiers à la fois", () => {
  const gros = Array.from({ length: REPAIR.maxFiles + 1 }, (_, i) => diff(`js/app-0${i + 1}.js`, 1)).join("");
  const v = validatePatch(gros);
  assert.equal(v.ok, false);
  assert.match(v.raison, /fichiers touchés/);
});

test("REFUSE le vide et l'illisible", () => {
  assert.equal(validatePatch(null).ok, false);
  assert.equal(validatePatch("").ok, false);
  assert.equal(validatePatch("diff --git mais rien de valide").ok, false);
});

test("compte correctement fichiers et lignes d'un patch valide", () => {
  const v = validatePatch(diff("js/app-04.js", 3));
  assert.equal(v.ok, true);
  assert.deepEqual(v.files, ["js/app-04.js"]);
  assert.equal(v.lines, 6);   // 3 suppressions + 3 ajouts
});

// ─── Lecture confinée (le serveur fournit les fichiers, pas le modèle) ───────

test("readRepoFile reste dans le dépôt", () => {
  assert.ok(readRepoFile("package.json"), "un fichier du dépôt doit être lisible");
  assert.equal(readRepoFile("../../../Windows/System32/drivers/etc/hosts"), null);
  assert.equal(readRepoFile("../../AppData/Local/Temp/quelconque.txt"), null);
});

// ─── Prompt de correctif ─────────────────────────────────────────────────────

test("le prompt interdit explicitement de toucher aux tests et autorise le refus", () => {
  const p = buildPatchPrompt({ analysis: "Cause : le garde manque." }, [{ rel: "js/app-04.js", content: "const a = 1;" }]);
  assert.match(p, /Ne touche JAMAIS aux tests/);
  assert.match(p, /PAS DE CORRECTIF SÛR/);
  assert.match(p, /diff unifié/);
  assert.ok(p.includes("const a = 1;"), "le contenu du fichier doit être fourni par le serveur");
});

test.after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
