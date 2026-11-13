// CE QUI PART EN PRODUCTION EST CE QUI A ÉTÉ TESTÉ (STAB-10, audit de stabilisation
// du 2026-11-10, corrigé le 2026-11-12).
//
// Le défaut : le job « Déploiement production » passait seul la page à
// html-minifier-terser, APRÈS tous les jobs de test ; la passe « Gates artefact »
// jouait ses suites sur une page brute. La page servie n'était éprouvée par rien.
// La correction, et ce que ce banc verrouille :
//   ① la page est minifiée par le build (scripts/build.js, étape 6 ter — éprouvée
//     dans tests/unit/integrite-app.test.mjs ⑥ ⑦) : plus AUCUNE minification dans le
//     job de déploiement ;
//   ② la passe « Gates artefact » construit avec PASSIO_MINIFIER_APP=1, joue la fumée
//     sur ces octets, PUIS publie l'empreinte de l'arbre dist/ qu'elle a servi ;
//   ③ le déploiement recalcule l'empreinte de SON dist/ et refuse d'envoyer si elle
//     diffère — après le dernier contrôle, avant l'envoi ;
//   ④ scripts/empreinte-dist.js : même arbre → même empreinte ; un octet, un nom, un
//     fichier de plus → une autre ; `--attendue` absente ou fausse → code 1.
// Mutations vues rouges le 2026-11-12 : remettre l'étape « Minify index.html » dans le
// déploiement → ① ; retirer l'étape « Artefact identique » → ③ ; retirer le chemin
// relatif de l'empreinte → ④.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const SCRIPT = path.join(RACINE, "scripts", "empreinte-dist.js");
const { empreinte } = require(SCRIPT);
const WORKFLOW = fs.readFileSync(path.join(RACINE, ".github", "workflows", "deploy.yml"), "utf8").replace(/\r\n/g, "\n");

// Le bloc d'un job : de `  <nom>:` (indentation 2) au job suivant.
function job(nom) {
  const lignes = WORKFLOW.split("\n");
  const debut = lignes.indexOf("  " + nom + ":");
  assert.ok(debut >= 0, "job " + nom + " introuvable dans deploy.yml");
  let fin = debut + 1;
  while (fin < lignes.length && !/^  [A-Za-z0-9_-]+:\s*$/.test(lignes[fin])) fin++;
  return lignes.slice(debut, fin).join("\n");
}
// Les lignes exécutées ou déclarées, sans les commentaires (qui citent l'ancienne étape).
const sansCommentaires = (bloc) => bloc.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("① le déploiement ne minifie plus rien lui-même : la page vient du build", () => {
  const deploy = sansCommentaires(job("deploy"));
  assert.doesNotMatch(deploy, /html-minifier-terser/, "aucune minification de page dans le job de déploiement");
  assert.doesNotMatch(deploy, /terser|cleancss|clean-css/, "aucun minifieur appelé après le build");
  assert.match(deploy, /PASSIO_MINIFIER_APP: "1"\n\s+run: \|\n\s+node scripts\/build\.js dist\/index\.html/, "le build minifie (drapeau posé)");
});

test("② la passe « Gates artefact » éprouve la page minifiée, puis publie l'empreinte de ce qu'elle a servi", () => {
  const gates = sansCommentaires(job("gates-artefact"));
  assert.match(gates, /outputs:\n\s+empreinte: \$\{\{ steps\.empreinte\.outputs\.empreinte \}\}/);
  assert.match(gates, /PASSIO_CIBLE: dist/);
  assert.match(gates, /PASSIO_MINIFIER_APP: "1"/);
  assert.match(gates, /COMMIT_REF: \$\{\{ github\.sha \}\}/, "même COMMIT_REF qu'au déploiement : release.json identique");
  const suites = gates.indexOf("npx playwright test ");
  assert.ok(suites > 0);
  assert.match(gates.slice(suites).split("\n")[0], /tests\/e2e\/smoke\.spec\.js/, "la fumée tourne sur la page minifiée");
  const etape = gates.indexOf("id: empreinte");
  assert.ok(etape > suites, "l'empreinte est prise APRÈS les suites, sur l'arbre qu'elles ont servi");
  assert.match(gates.slice(etape), /node scripts\/empreinte-dist\.js dist\)"\n\s+echo "empreinte=\$\{h\}" >> "\$GITHUB_OUTPUT"/);
});

test("③ le déploiement refuse un dist/ qui n'est pas celui que les tests ont éprouvé", () => {
  const brut = job("deploy");
  const deploy = sansCommentaires(brut);
  assert.match(deploy, /needs: \[[^\]]*\bgates-artefact\b[^\]]*\]/, "le déploiement attend la passe « Gates artefact »");
  const controle = deploy.indexOf("node scripts/empreinte-dist.js dist --attendue \"$EMPREINTE_TESTEE\"");
  assert.ok(controle > 0, "étape « Artefact identique » absente");
  assert.match(deploy, /EMPREINTE_TESTEE: \$\{\{ needs\.gates-artefact\.outputs\.empreinte \}\}/);
  const build = deploy.indexOf("node scripts/build.js dist/index.html");
  const integrite = deploy.indexOf("node scripts/verifier-integrite-app.js dist");
  const envoi = deploy.indexOf("deploy --prod --dir");
  assert.ok(build > 0 && integrite > build && controle > integrite && envoi > controle,
    `ordre build (${build}) < intégrité (${integrite}) < empreinte (${controle}) < envoi (${envoi})`);
  // Entre le contrôle et l'envoi, aucune ligne exécutée ne cite dist/ (relecture du
  // 2026-11-12 : une liste de commandes interdites laissait passer `npx … dist`, `> dist/…`).
  const entre = deploy.slice(controle, envoi).split("\n").slice(1);
  assert.deepEqual(entre.filter((l) => /\bdist\b/.test(l)), [], "rien ne cite dist/ entre le contrôle et l'envoi");
  // L'étape ne peut ni être sautée ni laisser passer son échec.
  for (const nom of ["Artefact identique à celui que la passe « Gates artefact » a éprouvé"]) {
    const bloc = etape(brut, nom);
    assert.doesNotMatch(bloc, /continue-on-error|^\s+if:/m, nom + " : ni `continue-on-error`, ni `if:`");
  }
});

// Le bloc d'une étape (`- name: <nom>` jusqu'à l'étape suivante), commentaires retirés.
function etape(bloc, nom) {
  const lignes = sansCommentaires(bloc).split("\n");
  const debut = lignes.findIndex((l) => l.trim() === "- name: " + nom);
  assert.ok(debut >= 0, "étape introuvable : " + nom);
  let fin = debut + 1;
  while (fin < lignes.length && !/^\s+- (name|uses):/.test(lignes[fin])) fin++;
  return lignes.slice(debut, fin).join("\n");
}

test("② bis l'étape qui publie l'empreinte ne laisse pas passer son échec", () => {
  const bloc = etape(job("gates-artefact"), "Empreinte de l'artefact éprouvé");
  assert.doesNotMatch(bloc, /continue-on-error|^\s+if:/m);
  assert.match(bloc, /set -euo pipefail/);
});

test("③ bis le script d'empreinte est un fichier critique de la gouvernance", () => {
  assert.match(WORKFLOW, /\|scripts\/empreinte-dist\.js\|/);
});

function arbre(fichiers) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "passio-empreinte-"));
  for (const [r, c] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(d, r)), { recursive: true });
    fs.writeFileSync(path.join(d, r), c);
  }
  return d;
}
const BASE = { "index.html": "<html></html>", "app/app-01.js": "a()", "styles.css": "b{}" };

test("④ même arbre → même empreinte ; un octet, un nom, un fichier de plus → une autre", () => {
  const a = arbre(BASE), b = arbre(BASE);
  try {
    const h = empreinte(a).empreinte;
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(empreinte(b).empreinte, h, "deux arbres identiques, une empreinte");
    fs.appendFileSync(path.join(b, "app", "app-01.js"), " ");
    assert.notEqual(empreinte(b).empreinte, h, "un octet");
    const c = arbre({ "index.html": BASE["index.html"], "app/app-02.js": BASE["app/app-01.js"], "styles.css": BASE["styles.css"] });
    assert.notEqual(empreinte(c).empreinte, h, "même contenu sous un autre nom");
    const d = arbre({ ...BASE, "sw.js": "" });
    assert.notEqual(empreinte(d).empreinte, h, "un fichier de plus, même vide");
    for (const x of [c, d]) fs.rmSync(x, { recursive: true, force: true });
  } finally {
    for (const x of [a, b]) fs.rmSync(x, { recursive: true, force: true });
  }
});

test("④ la ligne de commande : imprime, accepte l'empreinte juste, refuse la fausse et l'absente", () => {
  const a = arbre(BASE);
  try {
    const h = execFileSync(process.execPath, [SCRIPT, a], { encoding: "utf8" }).trim();
    assert.equal(h, empreinte(a).empreinte);
    assert.equal(spawnSync(process.execPath, [SCRIPT, a, "--attendue", h]).status, 0);
    const faux = spawnSync(process.execPath, [SCRIPT, a, "--attendue", "0".repeat(64)], { encoding: "utf8" });
    assert.equal(faux.status, 1);
    assert.match(faux.stderr, /Artefact non testé/);
    assert.match(faux.stderr, /app\/app-01\.js/, "le détail nomme les fichiers");
    // La sortie de job vide (passe « Gates artefact » sautée ou muette) ne vaut pas accord.
    assert.equal(spawnSync(process.execPath, [SCRIPT, a, "--attendue", ""]).status, 1);
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
  }
});
