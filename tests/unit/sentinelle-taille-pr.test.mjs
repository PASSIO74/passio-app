// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-34 — la borne de taille de la Sentinelle, contournée par la pagination.
//
// ⚠️ CE TEST EXTRAIT LE SNIPPET RÉEL DE `.github/workflows/deploy.yml` (entre
// `ASTRA-34:DEBUT` et `ASTRA-34:FIN`) et L'EXÉCUTE, avec un FAUX `gh` posé sur
// le PATH. Il ne mesure donc pas une copie du raisonnement : il mesure les
// lignes qui tournent en CI. Un test qui aurait réimplémenté le calcul serait
// resté vert le jour où le workflow diverge — la faute de famille que le dépôt
// appelle « la fonction morte qui double la fonction vivante ».
//
// Chaque cas REPRODUIT d'abord la forme d'AVANT (l'agrégat PAR PAGE) et EXIGE
// que la forme corrigée en diverge.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKFLOW = ".github/workflows/deploy.yml";

function snippet() {
  const y = readFileSync(WORKFLOW, "utf8");
  const d = y.indexOf("# ASTRA-34:DEBUT");
  const f = y.indexOf("# ASTRA-34:FIN");
  assert.ok(d > 0 && f > d, "les marqueurs ASTRA-34 doivent exister dans " + WORKFLOW);
  // On retire l'indentation du bloc YAML et la ligne de marqueur de tête.
  return y.slice(y.indexOf("\n", d) + 1, f).split("\n").map((l) => l.replace(/^ {12}/, "")).join("\n");
}

const CODE = (n, a, d) => ({ filename: "js/app-0" + n + ".js", additions: a, deletions: d });
const VERROU = (n) => ({ filename: "tests/e2e/v" + n + ".spec.js", additions: 20, deletions: 0 });

// ⚠️ ASTRA-53 (cinquième contre-revue, 15/09/2026) — LE FAUX `gh` NE CALCULE
// PLUS RIEN LUI-MÊME. La version d'avant additionnait `additions + deletions`
// en JavaScript et ignorait l'expression `--jq` reçue : remplacer le calcul
// réel du workflow par `0` laissait 7/7 verts. Désormais le faux `gh` :
//   · LIT ses arguments comme le vrai (`api`, `--paginate`, le chemin, `--jq <expr>`)
//     et REFUSE toute forme qu'il ne reconnaît pas ;
//   · exécute l'EXPRESSION REÇUE avec un vrai `jq`, PAGE PAR PAGE, et concatène
//     les sorties — c'est la mécanique de `gh api --paginate --jq` (gh embarque
//     gojq, compatible jq 1.6+ pour ces expressions ; `jq` est présent sur
//     les runners Ubuntu, et `JQ_BIN` permet d'en désigner un ailleurs).
// Ce que le test mesure est donc l'expression du workflow, pas une copie.
const JQ = process.env.JQ_BIN || "jq";
function jqDisponible() { try { execFileSync(JQ, ["--version"], { stdio: "ignore" }); return true; } catch (e) { return false; } }
function executer(pages) {
  const dir = mkdtempSync(join(tmpdir(), "astra34-"));
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "pages.json"), JSON.stringify(pages));
  writeFileSync(join(dir, "faux-gh.mjs"), [
    'import { readFileSync } from "node:fs";',
    'import { execFileSync } from "node:child_process";',
    'const args = process.argv.slice(2);',
    '// La forme EXACTE employée par le workflow : gh api --paginate <chemin> --jq <expr>',
    'if (args[0] !== "api" || args[1] !== "--paginate" || !/^repos\\/[^/]+\\/[^/]+\\/pulls\\/\\d+\\/files$/.test(args[2]) || args[3] !== "--jq" || typeof args[4] !== "string" || args.length !== 5) {',
    '  process.stderr.write("faux gh : forme d\\x27appel non reconnue : " + JSON.stringify(args) + "\\n"); process.exit(2);',
    '}',
    'const expr = args[4];',
    'const pages = JSON.parse(readFileSync(process.env.PAGES, "utf8"));',
    'let sortie = "";',
    'for (const p of pages) {',
    '  // Une page = une réponse JSON ; le filtre est appliqué à CHAQUE page, et',
    '  // les sorties (`-r`, comme gh) sont concaténées.',
    '  sortie += execFileSync(process.env.JQ_BIN || "jq", ["-r", expr], { input: JSON.stringify(p), encoding: "utf8" });',
    '}',
    'process.stdout.write(sortie);',
  ].join("\n"));
  writeFileSync(join(dir, "bin", "gh"), '#!/usr/bin/env bash\nexec node "' + join(dir, "faux-gh.mjs") + '" "$@"\n', { mode: 0o755 });
  chmodSync(join(dir, "bin", "gh"), 0o755);
  const script = [
    "set -euo pipefail",
    'GITHUB_REPOSITORY=o/r; pr=1',
    snippet(),
    'echo "$nb_fichiers $nb_lignes"',
  ].join("\n");
  const out = execFileSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, PATH: join(dir, "bin") + ":" + process.env.PATH, PAGES: join(dir, "pages.json"), JQ_BIN: JQ },
  });
  const [nbFichiers, nbLignes] = out.trim().split(/\s+/).map(Number);
  return { nbFichiers, nbLignes };
}

// La forme d'AVANT : `--jq` rendait UN AGRÉGAT par page, d'où une ligne par page.
function bashAvant(pages) {
  const parPage = pages.map((p) => {
    const code = p.filter((f) => !/^tests\/e2e\/.*\.spec\.js$/.test(f.filename));
    return code.length + " " + code.reduce((s, f) => s + f.additions + f.deletions, 0);
  });
  const taille = parPage.join("\n");
  const mots = taille.split(/\s+/);
  return { nbFichiers: Number(mots[0]), nbLignes: Number(mots[mots.length - 1]) };
}

test("① le contournement d'Astra : 2 fichiers / 120 lignes passaient pour « 0 ligne »", () => {
  const pages = [[CODE(1, 60, 0), CODE(2, 60, 0), ...Array.from({ length: 28 }, (_, i) => VERROU(i))], [VERROU(99)]];
  const avant = bashAvant(pages);
  assert.deepEqual(avant, { nbFichiers: 2, nbLignes: 0 }, "reproduction : le Bash lisait 2 fichiers et 0 ligne");
  assert.ok(!(avant.nbFichiers > 2 || avant.nbLignes > 60), "reproduction : la PR était ACCEPTÉE");
  const apres = executer(pages);
  assert.deepEqual(apres, { nbFichiers: 2, nbLignes: 120 }, "le snippet réel agrège toutes les pages");
  assert.ok(apres.nbLignes > 60, "et la PR est désormais REFUSÉE");
});

test("② du code réparti ENTRE les pages n'est plus perdu", () => {
  const pages = [[CODE(1, 10, 0)], [CODE(2, 10, 0)], [CODE(3, 10, 0)]];
  assert.deepEqual(bashAvant(pages), { nbFichiers: 1, nbLignes: 10 }, "reproduction : une seule page comptée");
  assert.deepEqual(executer(pages), { nbFichiers: 3, nbLignes: 30 });
});

test("③ une page vide ne remet pas les compteurs à zéro", () => {
  const pages = [[CODE(1, 100, 0)], []];
  assert.equal(bashAvant(pages).nbLignes, 0, "reproduction : la page vide écrasait le compte");
  assert.deepEqual(executer(pages), { nbFichiers: 1, nbLignes: 100 });
});

test("④ une seule page se comporte comme avant — aucune régression", () => {
  const pages = [[CODE(1, 30, 10), VERROU(1)]];
  assert.deepEqual(executer(pages), bashAvant(pages));
  assert.deepEqual(executer(pages), { nbFichiers: 1, nbLignes: 40 });
});

test("⑤ les verrous e2e ne comptent NI en fichiers NI en lignes ; une PR vide de code est à zéro", () => {
  assert.deepEqual(executer([[VERROU(1), VERROU(2)], [VERROU(3)]]), { nbFichiers: 0, nbLignes: 0 });
  assert.deepEqual(executer([[{ filename: "tests/unit/x.test.mjs", additions: 5, deletions: 0 }]]), { nbFichiers: 1, nbLignes: 5 });
});

test("⑥ le workflow ne contient plus l'agrégat PAR PAGE, et le périmètre garde sa forme sûre", () => {
  const y = readFileSync(WORKFLOW, "utf8");
  // ⚠️ ON MESURE LA LIGNE EXÉCUTABLE, PAS UNE MENTION. La première rédaction
  // cherchait l'agrégat dans TOUT le fichier et se piégeait sur le commentaire
  // qui cite la forme d'avant — deuxième fois de la journée après la ligne de
  // verdict d'ASTRA-22. Un « ne doit pas contenir » doit viser du code.
  const lignesExec = y.split("\n").filter((l) => !/^\s*#/.test(l));
  const ligneTaille = lignesExec.find((l) => l.includes("par_fichier=\"$(gh api"));
  assert.ok(ligneTaille, "la ligne de mesure doit exister");
  assert.doesNotMatch(ligneTaille, /length|map\(/, "la mesure ne doit plus demander d'agrégat à jq (il serait PAR PAGE)");
  assert.match(ligneTaille, /\.\[\] \| select/, "elle doit émettre une ligne par fichier");
  // `files` (périmètre) émet DÉJÀ une ligne par fichier : c'est pourquoi lui
  // n'a jamais été trompé. Le verrou l'exige, pour qu'il ne dérive pas.
  assert.match(y, /files="\$\(gh api --paginate .*--jq '\.\[\]\.filename'\)"/, "le périmètre doit rester en une ligne par fichier");
});

test("⑦ un échec de l'API ne compte pas zéro — il refuse", () => {
  const dir = mkdtempSync(join(tmpdir(), "astra34-ko-"));
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "gh"), "#!/usr/bin/env bash\necho 'API error' >&2\nexit 1\n", { mode: 0o755 });
  chmodSync(join(dir, "bin", "gh"), 0o755);
  const script = ["set -euo pipefail", "GITHUB_REPOSITORY=o/r; pr=1", snippet(), 'echo "$nb_fichiers $nb_lignes"'].join("\n");
  let code = 0, sortie = "";
  try { sortie = execFileSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, PATH: join(dir, "bin") + ":" + process.env.PATH }, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { code = e.status; sortie = String(e.stdout || "") + String(e.stderr || ""); }
  assert.notEqual(code, 0, "une API illisible doit faire échouer la garde");
  assert.match(sortie, /non mesurable/i, "et le dire en clair");
  assert.doesNotMatch(sortie, /^0 0$/m, "jamais « 0 0 » — une borne qui compte zéro est une autorisation");
});
