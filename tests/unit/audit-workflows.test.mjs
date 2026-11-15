// Le gate des workflows voit ce qu'il prétend voir : chaque défaut réinjecté rougit, le dépôt reste vert. Ce qu'il
// ne lit pas, il le dit : SES LIMITES, en tête de scripts/audit-workflows.js (relectures adverses des 14 et 15/11).
// Les réinjections dans le code de la gate se rejouent par `node scripts/reinjections-audit-workflows.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { auditerWorkflow, auditerCanalAgent, auditerDepot, auditerFichiersDetournants, COMMANDES_NPM, CLASSE_NPM } = require("../../scripts/audit-workflows.js");

const defauts = (t) => auditerWorkflow("x.yml", t);
/** Un script `run: |` qui contient ces lignes de shell (la 1re ligne de shell est la ligne 2 du texte). */
const enRun = (...shell) => ["      - run: |", ...shell.join("\n").split("\n").map((l) => (l ? "          " + l : ""))].join("\n") + "\n";
const refuse = (cmd, motif) => defauts(enRun(cmd)).some((x) => motif.test(x));
const admis = (cmd) => defauts(enRun(cmd));
/** Un workflow complet : ces lignes sont les étapes du job `x` (la première est la ligne 6). */
const enJob = (...etapes) => ["on: push", "jobs:", "  x:", "    runs-on: ubuntu-latest", "    steps:", ...etapes].join("\n") + "\n";
const RELANCE = "nick-fields/retry@ce71cc2ab81d554ebbe88c79ab5975992d79ba08";
const NBSP = String.fromCharCode(0xa0);

/** Un dossier temporaire, effacé à la fin du test qui l'a demandé. */
function bacTemporaire(t, prefixe) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefixe));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test("① le dépôt passe le gate", () => {
  assert.deepEqual(auditerDepot().defauts, []);
});

test("② outils non figés et actions flottantes sont refusés", () => {
  assert.match(defauts("      - run: npx --yes terser a.js")[0], /npx --yes/);
  assert.match(defauts("      - run: npm install --no-save @playwright/test")[0], /no-save/);
  assert.match(defauts("          version: latest")[0], /latest/);
  assert.match(defauts("          version: 'latest'")[0], /latest/, "entre guillemets aussi (relecture du 14/11)");
  assert.match(defauts('          version: "latest"')[0], /latest/);
  assert.match(defauts("      - uses: actions/checkout@v5")[0], /non épinglée/);
  assert.match(defauts("      - { uses: actions/checkout@v5 }")[0], /non épinglée/, "dans un mapping en ligne aussi");
  assert.deepEqual(defauts("      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5"), []);
  assert.deepEqual(defauts("      - uses: ./.github/actions/claude-auth-guard"), []);
  assert.deepEqual(defauts("# npx --yes dans un commentaire YAML"), []);
  // Un commentaire DANS un script : le texte d'avant ne passait plus par le lexeur (relecture du delta).
  assert.deepEqual(admis("# npx --yes dans un commentaire de shell"), []);
});

test("② bis toute installation npm hors lockfile est refusée : la CI installe par `npm ci` (2026-11-14)", () => {
  const refuses = [
    // Les deux formes qui tournaient le 2026-11-14 (deploy.yml ×2, controle-realtime.yml).
    'npm install --prefix "$RUNNER_NETLIFY" --no-audit --no-fund netlify-cli@27.1.2',
    "npm install --no-audit --no-fund --ignore-scripts --no-package-lock @supabase/supabase-js@2.58.0",
    // Alias, abréviations et camelCase, résolus comme npm les résout.
    "npm i -g netlify-cli",
    "npm add left-pad",
    "npm isntall left-pad",
    "npm install",
    "npm it",
    "npm install-test",
    "npm install-t",
    "npm installTest",
    "npm u left-pad",
    "npm upd",
    "npm update",
    "npm up left-pad",
    "npm dedupe",
    "npm ded",
    "npm audit fix --force",
    "npm audit --json fix",
    "npm create vite@latest app",
    "npm cre vite@latest app",
    "npm init vite",
    "npm ini vite",
    // Dans une autre commande : chaînée, substituée (même entre guillemets doubles), groupée, en condition.
    "npm ci --ignore-scripts && npm install left-pad",
    "npm ci --ignore-scripts & npm install left-pad",
    "V=$(npm install left-pad)",
    'echo "$(npm install left-pad)"',
    "echo `npm install left-pad`",
    "( cd outils && npm install left-pad )",
    "(npm install left-pad)",
    "diff <(npm install left-pad) x",
    "if npm install left-pad; then exit 0; fi",
    'echo "étape #1"; npm install left-pad',
    // Chaque mot `npm` d'une commande est jugé, pas le premier seulement (relecture du 15/11).
    "env -C outils npm install left-pad",
    "env -C npm npm install left-pad",
    "sudo -u npm npm install left-pad",
    "docker run --rm --name npm node:22 npm install left-pad",
    "npm explore http-server -- npm install left-pad",
    'npm explore http-server -- "npm install left-pad"',
    "npm exec -- npm install left-pad",
    "npm x -- npm i left-pad",
    // `link <paquet>` l'installe depuis le registre ; `audit fix` se lit après `--` aussi ; un paquet hors registre est préparé.
    "npm link left-pad",
    "npm ln left-pad",
    "npm audit -- fix",
    "npm audit --- fix",
    "npm audit --json -- fix",
    "npm pack github:npm/left-pad",
    "npm pack npm/left-pad",
    "npm cache add github:npm/left-pad",
    "npm diff --diff=github:npm/left-pad",
    // Une expression qui n'est qu'un texte cité : GitHub la remplace avant bash.
    "${{ 'npm' }} install left-pad",
    "npm ${{ 'install' }} left-pad",
    "${{ 'npm install left-pad' }}",
  ];
  for (const l of refuses) assert.ok(refuse(l, /installe hors lockfile|ignore le lockfile|réécrit l'arbre|hors registre est cloné/), l);
  assert.ok(refuse("npm exec npm ci", /`npm ci` sans `--ignore-scripts`/));
  // Une seule fois par commande : `--no-save` garde son propre message.
  assert.equal(defauts("      - run: npm install --no-save @playwright/test").length, 1);
  // Une commande continuée par « \ » se lit en entier, et se situe à sa première ligne ; une ligne de bloc, à la sienne.
  const continuee = enRun("npm install \\", '  --prefix "$D" netlify-cli@27.1.2');
  assert.ok(defauts(continuee).some((x) => /^x\.yml:2 : `npm install`/.test(x)), JSON.stringify(defauts(continuee)));
  assert.ok(defauts(enRun("echo début", "npm install left-pad")).some((x) => /^x\.yml:3 : `npm install`/.test(x)));
  const tolere = [
    'npm ci --prefix "$RUNNER_NETLIFY" --ignore-scripts --no-audit --no-fund',
    "npm ci --ignore-scripts",
    "npm cit --ignore-scripts",
    "npm install-ci-test --ignore-scripts",
    "npm run install-hooks",
    "npm run i",
    "npm audit --audit-level=high --prefix dashboard",
    "npm ci --ignore-scripts --prefix /tmp/install",
    "npm ci --ignore-scripts  # et non npm install",
    // `${…}` et `${{ … }}` restent dans leur mot : le drapeau qui suit compte (relecture du 14/11).
    'npm ci --prefix "${RUNNER_TEMP}/netlify-cli" --ignore-scripts --no-audit --no-fund',
    'npm ci --prefix "${{ runner.temp }}/outils" --ignore-scripts',
    'npm ci --prefix "$(pwd)/outils" --ignore-scripts',
    "{ npm ci --ignore-scripts; }",
    // Du texte entre guillemets n'est pas une commande.
    'echo "Pour réparer : npm install puis relancer le job"',
    'echo "npm a échoué, relancer in fine"',
    // Une sous-commande que npm ne connaît pas ne tourne pas ; un mot `npm` dans une phrase n'en lance pas.
    "npm pour-voir install",
    "echo npm is great",
    // Un paquet du registre n'est ni cloné ni préparé ; le dépôt lui-même non plus.
    "npm pack",
    "npm pack ./outils",
    "npm pack left-pad@1.3.0",
    "npm cache verify",
    "npm audit signatures",
  ];
  for (const l of tolere) assert.deepEqual(admis(l), [], l);
});

test("② bis (suite) une option AVANT la sous-commande est refusée : la gate ne rejoue pas l'analyseur d'options de npm (relecture du delta, 14/11)", () => {
  const formes = [
    'npm --prefix "$D" install netlify-cli',
    "npm --loglevel info install left-pad",
    "npm --prefix docs install left-pad",
    "npm -C outils install left-pad",
    "npm --prefix dashboard ci",
    "npm --loglevel info ci",
    // Celles que la lecture « comme nopt » laissait passer, et que npm 11.13 lance toutes (relecture du delta).
    "npm --color always ci",
    "npm -- install left-pad",
    "npm -- ci",
    "npm --prefix outils -- install left-pad",
    "npm -- exec netlify-cli@27.1.2 deploy",
    "npm --C outils install left-pad",
    "npm --reg https://r.example install left-pad",
    'npm --c "echo" install left-pad',
    "npm --L project install left-pad",
    "npm --enjoy-by 2026-11-01 install left-pad",
    "npm -prefix outils install left-pad",
    "npm -registry https://r.example ci",
    "npm --browser firefox install left-pad",
    "npm --yes null install left-pad",
    "npm --workspaces null install left-pad",
    "npm --ws null install left-pad",
    "npm --no-audit false install left-pad",
    "npm --no-ignore-scripts true ci",
    "npm --regis https://r.example install left-pad",
    "npm --prefi outils install left-pad",
    "npm --w docs install left-pad",
    "npm -gC outils install",
    "npm -workspace w install",
    "npm --reg https://r.example i",
    "npm --prefi outils exec netlify-cli@27.1.2",
    "npm --prefi outils update",
  ];
  for (const l of formes) assert.ok(refuse(l, /option précède la sous-commande/), l);
  // Rien que des options : aucune sous-commande ne tourne.
  for (const l of ["npm --version", "npm -v", "node --version && npm --version"]) assert.deepEqual(admis(l), [], l);
  // Une sous-commande variable n'est pas lue.
  assert.ok(refuse('npm "$CMD" left-pad', /sous-commande variable/));
  assert.ok(refuse("npm $(echo install) left-pad", /sous-commande variable/));
  assert.ok(refuse("npm {install,} left-pad", /sous-commande variable \(ou expression, ou accolades\)/));
  assert.ok(refuse("npm ${{ matrix.cmd }} left-pad", /sous-commande variable/));
});

test("② ter `npm ci` et `npm rebuild` sans `--ignore-scripts` LU AVEC CERTITUDE sont refusés (2026-11-14)", () => {
  const refuses = [
    // Les deux formes qui tournaient le 2026-11-14 (deploy.yml, tests du pilotage ; sentinelle-distante.yml).
    "npm ci",
    "npm ci --ignore-scripts=false",
    "npm ci --ignore-scripts false",
    "npm ci --ignore-scripts --no-ignore-scripts",
    "npm ci --ignore-scripts --ignore-scripts=false",
    "npm clean-install",
    "npm install-cl",
    "npm cit",
    "npm rebuild",
    "npm rb",
    "npm ci --ignore-scripts && npm rebuild",
    // La lecture est par COMMANDE : le second `npm ci` de la ligne est jugé pour lui-même.
    "npm ci --ignore-scripts && npm ci --prefix outils && npm test",
    // Toute forme qui touche le drapeau sans être `--ignore-scripts` (relecture du delta) : npm la lit, la gate non.
    "npm ci --ignore-scripts --NO-ignore-scripts",
    "npm ci --ignore-scripts --no-ignore-scr",
    "npm ci --ignore-scripts --tag --no-ignore-scripts",
    "npm ci --IGNORE-SCRIPTS",
    "npm ci --ig",
    "npm ci --ignore-scripts=1",
    // Après la fin des options, ou à portée d'une option à valeur, le drapeau n'en est plus un.
    "npm ci -- --ignore-scripts",
    "npm ci --- --ignore-scripts",
    "npm ci --prefix --ignore-scripts",
    "npm ci --browser --ignore-scripts",
    "npm ci -C --ignore-scripts",
    // Un drapeau dans un commentaire ne compte pas.
    "npm ci # --ignore-scripts",
    // Dans l'environnement, seule la valeur `true` est lue.
    "npm_config_ignore_scripts=false npm ci",
    "npm_config_ignore_scripts=1 npm ci",
    // Après `--`, le drapeau est un argument (relecture du 15/11) ; un nom d'option variable ou à accolades n'est pas lu.
    "npm ci -- x --ignore-scripts",
    "npm ci --ignore-scripts '--ignore-scripts${X?}=false'",
    "npm ci --ignore-scripts --{x,no-ignore-scripts}",
    "npm ci --ignore-scripts $'--no-ignore-scripts'",
    // Le mot visé par une redirection n'est pas un argument : `> --ignore-scripts` écrit dans un fichier.
    "npm ci > --ignore-scripts",
    "npm ci 2> --ignore-scripts",
    // `2>x` n'est pas un argument : `--prefix` prend le drapeau pour sa valeur.
    "npm ci --prefix 2>journal.txt --ignore-scripts",
    // uninstall et prune réinstallent l'arbre, edit finit par rebuild, link lance les scripts du projet lié.
    "npm uninstall left-pad",
    "npm rm left-pad",
    "npm prune --omit=dev",
    "npm edit left-pad",
    "npm link",
  ];
  for (const l of refuses) assert.ok(refuse(l, /sans `--ignore-scripts`/), l);
  assert.ok(defauts(enRun("npm ci \\", "  --prefix outils")).some((x) => /sans `--ignore-scripts`/.test(x)));
  const tolere = [
    "npm ci --ignore-scripts",
    "npm ci --ignore-scripts=true",
    "npm ci --ignore-scripts true",
    "npm ci --no-audit --ignore-scripts",
    "npm ci --prefix outils --ignore-scripts",
    "npm ci --prefix=outils --ignore-scripts",
    "NPM_CONFIG_IGNORE_SCRIPTS=true npm ci",
    "npm_config_ignore_scripts=true npm ci",
    // La ligne de commande l'emporte sur l'environnement.
    "npm_config_ignore_scripts=false npm ci --ignore-scripts",
    "npm run ci-locale",
    "npm ci --ignore-scripts 2>&1 | tee journal.txt",
    "npm ci --ignore-scripts &> journal.txt",
    "npm ci --ignore-scripts >journal.txt 2>&1",
    "npm ci --ignore-scripts < /dev/null",
    "npm prune --omit=dev --ignore-scripts",
    "npm link --ignore-scripts",
  ];
  for (const l of tolere) assert.deepEqual(admis(l), [], l);
  assert.deepEqual(defauts(enRun("npm ci \\", "  --ignore-scripts")), []);
});

test("② quater `npx` et `npm exec` qui téléchargent sont refusés ; ceux du lockfile passent (2026-11-14)", () => {
  const refuses = [
    "npx --yes terser a.js",
    "npx --yes=true netlify-cli deploy",
    "npx --yes=1 netlify-cli deploy",
    "npx -y netlify-cli deploy",
    "npx netlify-cli@27.1.2 deploy",
    "npx -- netlify-cli@27.1.2 deploy",
    "npx @netlify/build@36.4.7",
    "npx -p netlify-cli netlify deploy",
    "npx --package=netlify-cli netlify deploy",
    "npx --cache /tmp/c netlify-cli@27.1.2 deploy",
    "npx github:netlify/cli deploy",
    "npx netlify/cli deploy",
    "npx https://registry.npmjs.org/netlify-cli/-/netlify-cli-27.1.2.tgz deploy",
    "npm exec --yes netlify-cli -- deploy",
    "npm x -y netlify-cli",
    "npm exec netlify-cli@27.1.2 -- deploy",
    "npm exec -- netlify-cli@27.1.2 deploy",
    "npm x -- netlify-cli@latest deploy",
    "npm --prefix x exec -- netlify-cli@latest deploy",
    "npm exec netlify --package=netlify-cli -- deploy",
    "npm exec netlify-cli --yes -- deploy",
    "npm exe --yes netlify-cli",
    // Une option que la gate ne lit pas, devant l'outil : elle peut le prendre pour sa valeur (relecture du delta).
    "npx --reg r.example netlify-cli@27.1.2 deploy",
    "npx -dd=netlify-cli@27.1.2 deploy",
    "npx - netlify-cli@27.1.2",
    "npx --yes null netlify-cli",
    // `--no null` : nopt prend `null` pour la valeur de --no-yes, et l'installation automatique revient.
    "npx --no null netlify-cli",
    "npm exec --reg r.example netlify-cli@27.1.2",
    // npm lit les options de `npm exec` jusqu'à `--`, après l'outil aussi.
    "npm exec playwright --yes -- test",
    // Un outil variable n'est pas lu.
    'npx "$OUTIL" deploy',
    // npx prend l'outil pour la valeur de `--no`/`--no-yes` : ce qui suit va à npm (relecture du 15/11).
    "npx --no playwright test",
    "npx --no-yes playwright test",
    "npx --no playwright --yes --package=left-pad@1.3.0 playwright --version",
    // Pour `npm exec`, nopt prend `null` pour la valeur de --no-yes : l'installation automatique revient.
    "npm exec --no null netlify-cli",
    "npm exec --no-yes null netlify-cli",
  ];
  for (const l of refuses) assert.ok(admis(l).length > 0, l);
  assert.ok(refuse("npx -p netlify-cli netlify deploy", /`npx --package` installe un paquet/));
  assert.ok(refuse("npm exec --package=netlify-cli -- netlify deploy", /`npm exec --package` installe un paquet/));
  const tolere = [
    // Les formes qui tournent : l'outil vient du lockfile installé juste avant.
    "npx playwright test --project=prod",
    "if timeout --kill-after=30s 10m npx playwright install --with-deps chromium; then exit 0; fi",
    "npx --no-install playwright test",
    "npx --yes=false playwright test",
    "npx -q playwright test",
    "npx @playwright/test --version",
    "npx ./outils/script.js",
    "npm exec -- playwright test",
    // `npm exec` passe par nopt, qui lit `--no` et `--no-yes` comme des booléens.
    "npm exec --no -- playwright test",
    "npm exec --no-yes -- playwright test",
  ];
  for (const l of tolere) assert.deepEqual(admis(l), [], l);
});

test("② quinquies aucun fichier ne détourne une installation ou un envoi : ni npm-shrinkwrap.json, ni .npmrc, ni .netlify/ (2026-11-14)", () => {
  const vus = auditerFichiersDetournants([
    "package.json", "npm-shrinkwrap.json", "dashboard/.npmrc", ".npmrc", "a/b/NPM-SHRINKWRAP.json", "package-lock.json", ".npmrc.exemple", "docs/npmrc.md",
    ".netlify/edge-functions/interne.js", ".netlify/functions-internal/f.js", "netlify/edge-functions/media.js", "docs/.netlify/x.md",
  ]);
  assert.deepEqual(vus.map((d) => d.split(" : ")[0]), [
    "npm-shrinkwrap.json", "dashboard/.npmrc", ".npmrc", "a/b/NPM-SHRINKWRAP.json", ".netlify/edge-functions/interne.js", ".netlify/functions-internal/f.js",
  ]);
});

test("② sexies les actions composites passent par les mêmes règles — `uses: ./` (la racine) compris — et un fichier npm du dépôt le rougit (repli sans git)", (t) => {
  const bac = bacTemporaire(t, "audit-workflows-");
  fs.mkdirSync(path.join(bac, "workflows"));
  fs.mkdirSync(path.join(bac, "actions", "outil"), { recursive: true });
  for (const d of ["local", "enligne", "a", "b"]) fs.mkdirSync(path.join(bac, "outils", d), { recursive: true });
  fs.writeFileSync(path.join(bac, "workflows", "a.yml"), "jobs:\n  x:\n    steps:\n      - uses: ./outils/local\n      - uses: ./\n      - { uses: ./outils/enligne }\n      - uses: ./outils/a\n      - run: npm ci --ignore-scripts\n");
  fs.writeFileSync(path.join(bac, "actions", "outil", "action.yml"), "runs:\n  using: composite\n  steps:\n    - run: npm install left-pad\n      shell: bash\n");
  fs.writeFileSync(path.join(bac, "outils", "local", "action.yml"), "runs:\n  using: composite\n  steps:\n    - run: npx netlify-cli@27.1.2 deploy\n      shell: bash\n");
  // Citée seulement par un mapping en ligne, que seule la lecture YAML voit ; citée seulement par une autre action.
  fs.writeFileSync(path.join(bac, "outils", "enligne", "action.yml"), "runs:\n  using: composite\n  steps:\n    - run: npm install left-pad\n      shell: bash\n");
  fs.writeFileSync(path.join(bac, "outils", "a", "action.yml"), "runs:\n  using: composite\n  steps:\n    - uses: ./outils/b\n");
  fs.writeFileSync(path.join(bac, "outils", "b", "action.yml"), "runs:\n  using: composite\n  steps:\n    - run: npm install left-pad\n      shell: bash\n");
  fs.writeFileSync(path.join(bac, "action.yml"), "runs:\n  using: composite\n  steps:\n    - shell: bash\n      run: npm update\n");
  fs.writeFileSync(path.join(bac, ".npmrc"), "registry=https://registre.example.com/\n");
  const { defauts: d, composites } = auditerDepot(path.join(bac, "workflows"), { actions: path.join(bac, "actions"), racine: bac });
  assert.deepEqual(composites, ["action.yml", "actions/outil/action.yml", "outils/a/action.yml", "outils/b/action.yml", "outils/enligne/action.yml", "outils/local/action.yml"]);
  assert.ok(d.some((x) => /^outils\/enligne\/action\.yml:4 : `npm install`/.test(x)), JSON.stringify(d));
  assert.ok(d.some((x) => /^outils\/b\/action\.yml:4 : `npm install`/.test(x)), "une action citée par une action composite est lue aussi : " + JSON.stringify(d));
  assert.ok(d.some((x) => /^actions\/outil\/action\.yml:4 : `npm install`/.test(x)), JSON.stringify(d));
  assert.ok(d.some((x) => /^outils\/local\/action\.yml:4 : `npx netlify-cli@27\.1\.2`/.test(x)), "une action citée par `uses: ./…` est lue aussi");
  assert.ok(d.some((x) => /^action\.yml:5 : `npm update`/.test(x)), "`uses: ./` désigne l'action de la racine (relecture du delta) : " + JSON.stringify(d));
  assert.ok(d.some((x) => /^\.npmrc : /.test(x)), JSON.stringify(d));
  assert.ok(!d.some((x) => /^a\.yml/.test(x)), JSON.stringify(d));
});

test("② sexies bis dans un dépôt git, ce sont les fichiers SUIVIS qui comptent — le chemin de la CI", (t) => {
  const bac = bacTemporaire(t, "audit-workflows-git-");
  fs.mkdirSync(path.join(bac, "workflows"));
  fs.mkdirSync(path.join(bac, "dashboard"));
  fs.writeFileSync(path.join(bac, "workflows", "a.yml"), "jobs:\n  x:\n    steps:\n      - run: npm ci --ignore-scripts\n");
  fs.writeFileSync(path.join(bac, "dashboard", ".npmrc"), "ignore-scripts=false\n");
  fs.writeFileSync(path.join(bac, ".npmrc"), "registry=https://registre.example.com/\n");
  execFileSync("git", ["init", "-q"], { cwd: bac });
  execFileSync("git", ["add", "dashboard/.npmrc"], { cwd: bac });
  const { defauts: d } = auditerDepot(path.join(bac, "workflows"), { actions: path.join(bac, "actions"), racine: bac });
  assert.ok(d.some((x) => /^dashboard\/\.npmrc : /.test(x)), "un .npmrc suivi est refusé : " + JSON.stringify(d));
  assert.ok(!d.some((x) => /^\.npmrc : /.test(x)), "un .npmrc NON suivi est ignoré — la preuve que git ls-files a parlé, pas le parcours du disque");
});

test("② septies un libellé n'est pas une commande — nom du workflow, d'un job, d'une étape, `run-name`, `description` ; toute AUTRE valeur l'est, un `name:` sous `env:`, `with:` ou dans une matrice compris (relecture du 15/11)", () => {
  const libelles = [
    "name: npm install des dépendances",
    "run-name: Déploiement (npm ci) de ${{ github.sha }}",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      cache:",
    "        description: Relancer npm ci sans cache (les scripts restent coupés)",
    "jobs:",
    "  x:",
    "    name: npm ci (pilotage)",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: npm install des dépendances",
    "        run: npm ci --ignore-scripts",
  ].join("\n") + "\n";
  assert.deepEqual(defauts(libelles), []);
  const action = [
    "name: outil", "description: Installe par npm install, jamais en CI", "inputs:", "  x:", "    description: npm update interdit",
    "runs:", "  using: composite", "  steps:", "    - name: npm install puis npm update", "      shell: bash", "      run: npm ci --ignore-scripts",
  ].join("\n") + "\n";
  assert.deepEqual(defauts(action), []);
  // Un `name:` ailleurs est une valeur : `run: $name`, `${{ matrix.name }}` ou une action la lancent.
  const ailleurs = {
    "env:": enJob("      - env:", "          name: npm install left-pad", "        run: $name"),
    "with:": enJob(`      - uses: ${RELANCE}`, "        with:", "          name: npm install left-pad"),
    "matrice": ["on: push", "jobs:", "  x:", "    runs-on: ubuntu-latest", "    strategy:", "      matrix:", "        include:", "          - name: npm install left-pad", "    steps:", "      - run: ${{ matrix.name }}"].join("\n") + "\n",
    "env: du workflow": ["on: push", "env:", "  name: npm install left-pad", "jobs:", "  x:", "    runs-on: ubuntu-latest", "    steps:", "      - run: $name"].join("\n") + "\n",
  };
  for (const [ou, texte] of Object.entries(ailleurs)) assert.ok(defauts(texte).some((x) => /`npm install`/.test(x)), `${ou} ${JSON.stringify(defauts(texte))}`);
  assert.ok(defauts(ailleurs["env:"]).some((x) => /^x\.yml:7 : `npm install`/.test(x)), JSON.stringify(defauts(ailleurs["env:"])));
  // Une valeur sur une ligne, simple ou entre guillemets, est un script.
  assert.ok(defauts("      - run: npm install left-pad\n").some((x) => /^x\.yml:1 : `npm install`/.test(x)));
  assert.ok(defauts("        run: 'npm install left-pad'\n").some((x) => /`npm install`/.test(x)));
  // Un scalaire replié réunit ses lignes de même indentation : `npm` puis `install left-pad` est UNE commande.
  assert.ok(defauts("      - run: >\n          npm\n          install left-pad\n").some((x) => /`npm install`/.test(x)));
  assert.deepEqual(defauts("      - run: >\n          npm ci\n          --ignore-scripts\n"), []);
  // … mais garde à part une ligne PLUS indentée, et une ligne vide : bash lance alors `npm ci` seul (relecture du delta).
  assert.ok(defauts("      - run: >\n          npm ci\n            --ignore-scripts\n").some((x) => /sans `--ignore-scripts`/.test(x)));
  assert.ok(defauts("      - run: >-\n          npm ci --ignore-scripts\n\n          npm install left-pad\n").some((x) => /`npm install`/.test(x)));
  // … et autour d'elle, les sauts de ligne restent : la ligne de texte qui la SUIT n'est pas jointe à elle (YAML 1.2,
  // § 8.1.3) — jointe, elle serait la fin d'un commentaire.
  assert.ok(defauts("      - run: >\n          npm ci --ignore-scripts\n            # étape suivante\n          npm install left-pad\n").some((x) => /`npm install`/.test(x)));
  // La clé sœur qui suit un bloc n'en fait pas partie — elle est lue pour elle-même : une commande posée dans env:,
  // qu'un `run: $NOTE` lancerait, est refusée (relecture du delta).
  assert.deepEqual(defauts("      - run: |\n          npm ci --ignore-scripts\n        shell: bash\n        env:\n          NOTE: relire le journal\n"), []);
  const dansEnv = defauts("      - run: |\n          npm ci --ignore-scripts\n        shell: bash\n        env:\n          NOTE: npm install\n");
  assert.ok(dansEnv.some((x) => /^x\.yml:5 : `npm install`/.test(x)), JSON.stringify(dansEnv));
});

test("② octies chaque forme YAML est lue par le lecteur fermé, ou refusée (relectures adverses des 14 et 15/11)", () => {
  const formes = {
    "A : valeur à la ligne suivante": "      - run:\n          npm install left-pad\n",
    "B : scalaire simple sur deux lignes": "      - run: npm ci --ignore-scripts\n          && npm install left-pad\n",
    "C : guillemets doubles sur deux lignes": '      - run: "npm ci --ignore-scripts\n          && npm install left-pad"\n',
    "D : ancre": "      - run: &script |\n          npm install left-pad\n",
    "E : étiquette": "      - run: !!str |\n          npm install left-pad\n",
    "F1 : `run :`": "      - run : |\n          npm install left-pad\n",
    "F2 : clé entre guillemets": '      - "run": |\n          npm install left-pad\n',
    "G : mapping en ligne": "      - { run: npm install left-pad, shell: bash }\n",
    "L : mapping en ligne, nom d'abord": "      - {name: x, run: npm install left-pad}\n",
    "indicateur d'indentation explicite": "      - run: |2\n          npm install left-pad\n",
    "I : action de relance": "      - uses: nick-fields/retry@ce71cc2ab81d554ebbe88c79ab5975992d79ba08\n        with:\n          command: npm install left-pad\n",
    "J : commande dans une variable": "      - env:\n          CMD: npm install left-pad\n        run: $CMD\n",
    "K : ancre réutilisée": "    env:\n      S: &s npm install left-pad\n    steps:\n      - run: *s\n",
    "échappement entre guillemets doubles": '      - run: "echo ok\\nnpm install left-pad"\n',
    "un `run` qui n'est pas une chaîne": "      - run:\n          npm install left-pad: x\n",
    // Relecture du 15/11.
    "valeur sur plusieurs lignes hors run:": enJob(`      - uses: ${RELANCE}`, "        with:", "          command: |", '            echo "x', '            " ; npm install left-pad'),
    "virgule dans un scalaire cité d'un mapping en ligne": "      - { run: 'echo ''x'', ; npm install left-pad ;: ''z''' }\n",
    "espace insécable devant #": `      - run: echo ok${NBSP}# ; npm install left-pad\n`,
    "espace insécable collée au drapeau": `      - run: npm ci --ignore-scripts${NBSP}\n`,
    "expression qui n'est qu'un texte cité": "      - run: ${{ 'npm install left-pad' }}\n",
    "CR seul": `      - run: npm ci --ignore-scripts${String.fromCharCode(13)}      - run: npm install left-pad\n`,
    "U+2028": `      - run: npm ci --ignore-scripts${String.fromCharCode(0x2028)}      - run: npm install left-pad\n`,
  };
  for (const [nom, texte] of Object.entries(formes)) assert.ok(defauts(texte).length > 0, `${nom} : admis — ${JSON.stringify(defauts(texte))}`);
  assert.match(defauts(formes["D : ancre"])[0], /YAML que la gate ne lit pas/);
  assert.match(defauts(formes["indicateur d'indentation explicite"])[0], /YAML que la gate ne lit pas/);
  assert.match(defauts(formes["CR seul"])[0], /YAML que la gate ne lit pas \(saut de ligne que ce lecteur ne lit pas \(U\+000D\)\)/);
  assert.match(defauts(formes["U+2028"])[0], /YAML que la gate ne lit pas \(saut de ligne que ce lecteur ne lit pas \(U\+2028\)\)/);
  assert.ok(defauts(formes["virgule dans un scalaire cité d'un mapping en ligne"]).some((x) => /`npm install`/.test(x)));
  assert.ok(defauts(formes["espace insécable devant #"]).some((x) => /`npm install`/.test(x)));
  assert.ok(defauts(formes["espace insécable collée au drapeau"]).some((x) => /sans `--ignore-scripts`/.test(x)));
  // Un crochet ou une accolade entre guillemets ne sont pas une imbrication ; une apostrophe au milieu d'un scalaire
  // nu n'ouvre rien.
  assert.deepEqual(defauts(enJob('      - env: { X: "${{ inputs.y }}" }', '        run: echo "$X"')), []);
  assert.deepEqual(defauts("      - { run: echo it's, shell: bash }\n"), []);
  // `defaults: run:` est un mapping légitime (shell, working-directory).
  assert.deepEqual(defauts("defaults:\n  run:\n    shell: bash\n"), []);
});

test("② nonies commentaires, continuations, chaînes sur plusieurs lignes, here-docs, `bash -c` et `eval` (relecture du delta, 14/11)", () => {
  // Un commentaire ne se continue pas : la ligne qui suit son « \ » est une commande.
  assert.ok(refuse("npm ci --ignore-scripts # x \\\nnpm install left-pad", /installe hors lockfile/));
  assert.ok(refuse("echo un # commentaire \\\nnpm install left-pad", /installe hors lockfile/));
  assert.ok(refuse("echo a \\\n  # commentaire \\\nnpm install left-pad", /installe hors lockfile/));
  assert.deepEqual(admis("echo ok # ; npm install left-pad"), [], "ce qui suit # est un commentaire");
  // La continuation se lit comme bash la lit — ici dans le corps d'un here-doc écrit dans un fichier puis lancé : seule
  // la lecture ligne à ligne le lit (pour la lecture d'un seul tenant, le corps d'un `cat <<EOF` n'est pas du code).
  const enFichier = (...lignes) => defauts(enRun("cat > installer.sh <<'EOF'", ...lignes, "EOF", "bash installer.sh"));
  assert.ok(enFichier("npm c\\", "i").some((x) => /sans `--ignore-scripts`/.test(x)), "`npm c\\` puis `i`, c'est `npm ci`");
  assert.ok(enFichier("npm ci \\ ", "--ignore-scripts").some((x) => /sans `--ignore-scripts`/.test(x)), "un « \\ » suivi d'une espace ne continue pas la ligne : le drapeau est une autre commande");
  assert.ok(enFichier("npm ci --ignore-scripts # x \\", "npm install left-pad").some((x) => /installe hors lockfile/.test(x)), "ni un « \\ » de commentaire");
  // Un saut de ligne sépare deux commandes, à la lecture d'un seul tenant aussi (`install`, ici, est celui de coreutils).
  assert.deepEqual(admis("command -v npm\ninstall -m 755 outil /usr/local/bin/outil"), []);
  assert.ok(refuse("echo a#b; npm install left-pad", /installe hors lockfile/), "un # au milieu d'un mot n'ouvre pas de commentaire");
  // Une chaîne entre guillemets sur deux lignes : ce qui suit sa fermeture est une commande.
  assert.ok(refuse("echo 'début\n'; npm install left-pad", /installe hors lockfile/));
  // Un here-doc : son corps est lu ligne à ligne, ce qui le suit aussi — une apostrophe du corps n'avale rien.
  assert.ok(refuse("cat <<'EOF'\nc'est\nEOF\nnpm install left-pad", /installe hors lockfile/));
  assert.ok(refuse("bash <<'EOF'\nnpm install left-pad\nEOF", /installe hors lockfile/));
  // … et une apostrophe du corps ne fait pas, à la lecture d'un seul tenant, sortir du texte cité ce qui suit.
  assert.deepEqual(admis("cat <<'EOF'\nl'app\nEOF\necho 'x npm install left-pad'"), []);
  // Le script de `bash -c`, `sh -c` et d'`eval` est relu.
  for (const l of [
    'bash -c "npm install left-pad"',
    "sh -ec 'npm ci'",
    'eval "npm install left-pad"',
    'timeout 10m bash -c "npx --yes netlify-cli@27.1.2 deploy"',
    "xargs -I{} sh -c 'npm install {}'",
    "bash -o pipefail -c 'npm install left-pad'",
  ]) assert.ok(admis(l).length > 0, l);
  assert.deepEqual(admis('bash -c "npm ci --ignore-scripts"'), []);
  assert.deepEqual(admis("bash scripts/installer.sh install"), [], "un fichier de script n'est pas du texte relu");
});

test("② nonies bis le script d'un shell est relu quelles que soient ses options, un shell sur un tube est refusé, un here-doc se lit comme bash le lit (relecture du 15/11)", () => {
  // Les options se lisent comme bash les lit : un groupe `-eo` consomme `pipefail` ; une here-string ou un here-doc
  // donnés à un shell sont son script ; `$'…'` se décode.
  for (const l of [
    "bash -eo pipefail -c 'npm install left-pad'",
    "bash -euxo pipefail -c 'npm ci'",
    "bash -oe pipefail -c 'npm install left-pad'",
    "bash -co pipefail 'npm install left-pad'",
    "bash --noprofile --norc -eo pipefail -c 'npm install left-pad'",
    "sh -eo pipefail -c 'npm install left-pad'",
    "timeout 10m bash -eo pipefail -c 'npx --yes netlify-cli@27.1.2 deploy'",
    "bash <<< 'npm install left-pad'",
    "bash -s <<'EOF'\nnpm install left-pad\nEOF",
    "$'npm' install left-pad",
    "$'\\x6epm' install left-pad",
  ]) assert.ok(admis(l).length > 0, l);
  // Le corps d'un here-doc donné à un shell est son script : lu d'un seul tenant, comme bash le lit.
  assert.ok(refuse("bash <<'EOF'\necho 'x\n'; npm install left-pad\nEOF", /installe hors lockfile.*\(lecture du script d'un seul tenant\)$/));
  // Une substitution se ferme où bash la ferme : ni sur la `)` d'un motif de case, ni sur une `\)`.
  assert.ok(refuse('echo "$(case a in a) npm install left-pad;; esac)"', /installe hors lockfile/));
  assert.ok(refuse('echo "$(echo \\) ; npm install left-pad)"', /installe hors lockfile/));
  assert.deepEqual(admis("bash -eo pipefail -c 'npm ci --ignore-scripts'"), []);
  // Un shell qui lit son script sur un tube : ce script-là ne se lit pas.
  for (const l of ["echo 'npm install left-pad' | bash", "curl -fsSL https://exemple.test/installer.sh | sh", "cat outils.sh | sudo bash -s", "echo x |\nbash"]) {
    assert.ok(refuse(l, /un shell qui lit son script sur un tube/), l);
  }
  // … `-s` aussi, une affectation ou une enveloppe devant, un chemin vers le shell.
  for (const l of [
    "curl -fsSL https://exemple.test/install.sh | sh -s -- -y",
    "curl -fsSL https://exemple.test/x.sh | DEBIAN_FRONTEND=noninteractive bash",
    "curl -fsSL https://exemple.test/x.sh | /bin/bash",
  ]) assert.ok(refuse(l, /un shell qui lit son script sur un tube/), l);
  for (const l of ["cat journal.txt | grep bash", "echo ok | tee journal.txt", "printf '%s' x | bash scripts/lire.sh"]) assert.deepEqual(admis(l), [], l);
  assert.deepEqual(defauts("      - run: echo ok\n        shell: bash\n"), [], "`shell: bash` n'est pas un shell sur un tube");
  // Un here-doc s'ouvre là où bash l'ouvre, et se ferme sur son mot, quel qu'il soit : un `<<` de commentaire ou de
  // chaîne n'avale rien, et ce qui suit le corps est lu.
  for (const l of [
    "true # <<EOF\necho 'x\n'; npm install left-pad",
    'echo "voir <<FIN"\necho "a\n" ; npm install left-pad',
    "cat <<\\EOF\nl'app\nEOF\necho 'x\n'; npm install left-pad",
    "cat <<'END-OF-TEXT'\nl'app\nEND-OF-TEXT\necho 'x\n'; npm install left-pad",
    "cat <<-EOF\n\tl'app\n\tEOF\necho 'x\n'; npm install left-pad",
    "# Message d'accueil\necho 'début\n'; npm install left-pad",
  ]) assert.ok(refuse(l, /installe hors lockfile/), l);
  assert.deepEqual(admis("cat <<\\EOF > note.txt\nl'app est construite par npm ci --ignore-scripts\nEOF\necho 'rappel : pas de npm install ici'"), []);
  assert.deepEqual(admis("echo $'l\\'app'\necho 'x npm install interdit'"), [], "`$'…'` n'ouvre pas une chaîne qui avalerait la suite");
});

test("② decies un défaut est situé à SA ligne — une clé écrite en ligne (`with: { … }`) ne fait pas dériver la suite", () => {
  const sha = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";
  const texte = [
    "jobs:", "  a:", "    steps:",
    `      - uses: actions/setup-node@${sha}`, "        with: { node-version: 22 }", "      - run: npm install left-pad",
    "  b:", "    steps:",
    `      - uses: actions/setup-node@${sha}`, "        with:", "          node-version: 22", "      - run: npm update",
  ].join("\n");
  assert.deepEqual(defauts(texte).map((x) => x.split(" : ")[0]), ["x.yml:6", "x.yml:12"], "le curseur avance d'un job à l'autre");
  // Une clé sœur derrière `- run: |` n'est pas dans le bloc, même quand le bloc cite sa valeur (relecture du 15/11).
  const soeur = defauts('      - run: |\n          echo "npm install left-pad est interdit"\n        env:\n          NOTE: npm install left-pad\n');
  assert.deepEqual(soeur.map((x) => x.split(" : ")[0]), ["x.yml:4"]);
  // Un défaut que seule la lecture d'un seul tenant voit est situé à la ligne où sa commande commence.
  const tenant = defauts(enRun("echo debut", "echo 'x", "'; npm install left-pad"));
  assert.deepEqual(tenant.map((x) => x.split(" : ")[0]), ["x.yml:4"], JSON.stringify(tenant));
});

test("② undecies chaque sous-commande de npm 11.13 (COMMANDES_NPM, relevée dans lib/utils/cmd-list.js) est rangée", () => {
  assert.deepEqual(Object.keys(CLASSE_NPM).sort(), [...COMMANDES_NPM].sort());
  const classes = new Set(["hors", "scripts", "link", "exec", "explore", "audit", "spec", "neutre"]);
  for (const [commande, classe] of Object.entries(CLASSE_NPM)) assert.ok(classes.has(classe), `${commande} : ${classe}`);
  assert.equal(CLASSE_NPM.publish, "spec", "`npm publish github:…` emballe, donc prépare, sa spécification");
});

test("② duodecies troisième relecture (15/11) : ce que la nouvelle lecture avait laissé passer, et ce qu'elle refusait à tort", () => {
  const refuses = {
    // Une substitution dans un `${…}` de bash est lue : `${X:-$(cmd)}` est l'idiome d'une valeur par défaut.
    "X=${X:-$(npm install left-pad)}": /installe hors lockfile/,
    "VERSION=${VERSION:-$(npx semver@7.6.0 -i patch 1.0.0)}": /télécharge l'outil/,
    "X=${X:-`npm install left-pad`}": /installe hors lockfile/,
    ": ${X:=$(npm install left-pad)}": /installe hors lockfile/,
    'X=${X:-"$(npm install left-pad)"}': /installe hors lockfile/,
    "npm ci ${OPTS:-$(npm install left-pad)} --ignore-scripts": /installe hors lockfile/,
    "echo ${X:-<(npm install left-pad)}": /installe hors lockfile/,
    "X=${X:-$(yarn add left-pad)}": /n'installe que par npm/,
    // Une substitution se ferme où bash la ferme : le corps d'un here-doc (apostrophe comprise) est sauté, `case`
    // n'est un mot réservé qu'en position de commande, et un `<<` de `(( … ))` n'ouvre pas de here-doc.
    "gh pr create --title \"Mise à jour\" --body \"$(cat <<'EOF'\nMise à jour automatique : l'arbre est régénéré.\nEOF\n)\" && npm install left-pad": /installe hors lockfile/,
    'N="$(grep -c case notes.txt)"; npm install left-pad': /installe hors lockfile/,
    '(( FLAGS = 1 << 3 ))\necho "a\nb" ; npm install left-pad': /installe hors lockfile/,
    "X=$(echo ')' ; npm install left-pad)": /installe hors lockfile/,
    'X=$(echo ")" ; npm install left-pad)': /installe hors lockfile/,
    "X=$(echo $')' ; npm install left-pad)": /installe hors lockfile/,
    // Toute spécification qui porte un protocole (sans égard à la casse), ou `git@hôte:`, est hors registre.
    "npx sourcehut:~user/outil": /télécharge l'outil/,
    "npm exec -- sourcehut:~user/outil": /télécharge l'outil/,
    "npx GitHub:user/outil": /télécharge l'outil/,
    "npx git@github.com:user/outil": /télécharge l'outil/,
    "npm pack sourcehut:~user/outil": /hors registre est cloné/,
    "npm pack git+ssh://git@github.com/u/r.git": /hors registre est cloné/,
    "npm pack git@github.com:u/r.git": /hors registre est cloné/,
    "npm pack --json github:u/r": /hors registre est cloné/,
    "npm publish github:u/r": /hors registre est cloné/,
    // Une affectation que l'environnement ne garde pas jusqu'à npm ne compte pas.
    'npm_config_ignore_scripts=true env -i PATH="$PATH" npm ci': /sans `--ignore-scripts`/,
    "npm_config_ignore_scripts=true sudo npm ci": /sans `--ignore-scripts`/,
    "npm_config_ignore_scripts=true exec -c npm ci": /sans `--ignore-scripts`/,
    // Le `-c` de su, runuser, sg, flock et script va à `sh -c` : il est relu.
    "su runner -c 'npm install left-pad'": /installe hors lockfile/,
    'su node --command="npm install left-pad"': /installe hors lockfile/,
    'runuser node -c "npm install left-pad"': /installe hors lockfile/,
    "flock /tmp/verrou -c 'npm install left-pad'": /installe hors lockfile/,
    "sg docker -c 'npm ci'": /sans `--ignore-scripts`/,
    'script -qec "npm ci" /dev/null': /sans `--ignore-scripts`/,
    // xargs : la sous-commande ou l'outil viendraient de l'entrée standard, ou une option à une sous-commande non neutre.
    "echo install left-pad | xargs npm": /la sous-commande viendrait de l'entrée standard/,
    "printf '%s' left-pad | xargs npx": /l'outil viendrait de l'entrée standard/,
    "ls | xargs -I{} npx {}": /l'outil viendrait de l'entrée standard/,
    "echo --no-ignore-scripts | xargs npm ci --ignore-scripts": /xargs y ajouterait des options/,
    "ls | xargs npm exec prettier": /xargs y ajouterait des options/,
    // Des branches que rien n'éprouvait : `-s` qu'une here-string nourrit, un chemin vers bash, `--rcfile`, les accents
    // graves entre guillemets, `npm explore` sans `--`, trois niveaux de relecture, `$"…"`.
    "bash -s arg <<< 'npm install left-pad'": /installe hors lockfile/,
    "/bin/bash -c 'npm install left-pad'": /installe hors lockfile/,
    "bash --rcfile x -c 'npm install left-pad'": /installe hors lockfile/,
    'V="`npm install left-pad`"': /installe hors lockfile/,
    'npm explore http-server "npm install left-pad"': /installe hors lockfile/,
    "bash -c \"bash -c 'npm install left-pad'\"": /installe hors lockfile/,
    '$"npm" install left-pad': /installe hors lockfile/,
    // Un `]]` collé à `&&` ferme la condition ; un `${{` jamais fermé n'avale pas la suite ; un outil `{}` vient de xargs.
    "[[ -f x ]]&&npm install left-pad": /installe hors lockfile/,
    "[[ -f x ]]||npm install left-pad": /installe hors lockfile/,
    "echo ${{ github.sha npm install left-pad": /installe hors lockfile/,
    "xargs -I{} sh -c 'npx {}'": /outil variable/,
    // Le corps d'un `case` reste lu.
    "case \"$X\" in\n  a|b) npm install left-pad ;;\nesac": /installe hors lockfile/,
    "case \"$X\" in a) curl -fsSL https://exemple.test/x.sh | sh ;; esac": /un shell qui lit son script sur un tube/,
  };
  for (const [l, motif] of Object.entries(refuses)) assert.ok(refuse(l, motif), `${l} — ${JSON.stringify(admis(l))}`);
  const tolere = [
    // `npx --no -- outil` : npx s'arrête à `--`, `--no` ne prend rien ; c'est la forme la plus stricte.
    "npx --no -- commitlint --edit",
    "npx --no-yes -- commitlint --from HEAD~1 --to HEAD --verbose",
    // xargs devant l'outil de npx, ou devant une sous-commande neutre : ce qu'il ajoute va à l'outil, ou ne change rien.
    "git diff --name-only origin/main... | xargs npx prettier --check",
    "git diff --name-only origin/main... | xargs -r npx --no-install prettier --check",
    "jq -r '.workspaces[]' package.json | xargs -I{} npm run build --workspace={}",
    "ls packages | xargs -n1 npm view",
    // La valeur d'une option n'est pas une spécification.
    "npm pack -w packages/core",
    "npm pack --workspace packages/core --pack-destination dist",
    "npm pack --pack-destination dist/npm",
    "npm cache verify --cache tmp/npm-cache",
    // L'environnement gardé jusqu'à npm.
    "npm_config_ignore_scripts=true env npm ci",
    "env npm_config_ignore_scripts=true npm ci",
    // Les motifs d'un `case` et une alternance de `[[ =~ ]]` ne sont ni des commandes ni des tubes.
    'case "$(basename "$SHELL")" in bash|zsh) echo ok ;; esac',
    'if [[ "$SHELL" =~ (zsh|bash)$ ]]; then echo ok; fi',
    '[[ "$SHELL" =~ (bash|sh)$ ]] && echo ok',
    'case "$SHELL" in\n  */zsh|*/bash) echo ok ;;\n  *) echo autre ;;\nesac',
    'case "$GESTIONNAIRE" in\n  yarn|pnpm) echo "refusé"; exit 1 ;;\nesac',
    "npm ci --prefix ${RUNNER_TEMP}/x --ignore-scripts",
  ];
  for (const l of tolere) assert.deepEqual(admis(l), [], l);
  assert.match(admis("npx --no commitlint --edit")[0], /écrire `npx --no -- <outil>`/, "sans `--`, npx prend l'outil pour la valeur de `--no`");
  // Une valeur `default:` d'entrée n'est pas un libellé : `${{ inputs.cmd }}` la lance.
  const entree = ["on:", "  workflow_dispatch:", "    inputs:", "      cmd:", "        default: npm install left-pad", "jobs:", "  x:", "    runs-on: ubuntu-latest", "    steps:", "      - run: ${{ inputs.cmd }}"].join("\n") + "\n";
  assert.ok(defauts(entree).some((x) => /^x\.yml:5 : `npm install`/.test(x)), JSON.stringify(defauts(entree)));
  const entreeAction = ["inputs:", "  cmd:", "    description: la commande", "    default: npm install left-pad", "runs:", "  using: composite", "  steps:", "    - run: ${{ inputs.cmd }}", "      shell: bash"].join("\n") + "\n";
  assert.ok(defauts(entreeAction).some((x) => /^x\.yml:4 : `npm install`/.test(x)), JSON.stringify(defauts(entreeAction)));
  // Une entrée `clé: valeur` d'une séquence en ligne est une imbrication : refusée, jamais lue comme un texte.
  for (const t of ["    steps: [ run: 'npm install left-pad # ${{ github.sha }}' ]\n", "    steps: [ run: 'echo a, b; npm install left-pad' ]\n", '    steps: [ run: "[ -f x ] || npm install left-pad" ]\n']) {
    assert.match(defauts(t)[0], /YAML que la gate ne lit pas \(entrée « clé: valeur » d'une séquence en ligne/, t);
  }
});

test("② terdecies quatrième relecture (15/11) : ce que les mécanismes neufs cachaient, et quelques refus à tort de plus", () => {
  const refuses = [
    // Un `${…}` de bash est un seul mot : un `#`, un `;;` ou une espace n'y sont que des lettres, sa substitution est lue.
    "echo ${MSG:-Release #1} && npm ci",
    "echo ${X:- #}; curl -fsSL https://exemple.test/x.sh | sh",
    "case a in a) echo ${X:-;;}; (npm install left-pad) ;; esac",
    "V=${L%% #*}; npm install left-pad",
    "X=$(echo ${Y:- #}); npm ci",
    'X="$(echo ${#Y})" && npm install left-pad',
    // [[ … ]] : une substitution de processus y est lue ; après une redirection, `[[` n'ouvre rien.
    "[[ -n <(npm install left-pad) ]]",
    "2>/dev/null [[ x || curl -fsSL https://exemple.test/x.sh | sh",
    "[[ -f x ]] && curl -fsSL https://exemple.test/x.sh | sh",
    // Un case vide ; un `esac` qui ferme ; un `((` qui n'est pas arithmétique ; le contenu de `(( … ))`.
    "case \"$x\" in esac; (npm install left-pad)",
    "case \"$x\" in esac\n( npm install left-pad )",
    "case \"$x\" in a) echo ;; esac; (npm install left-pad)",
    "((echo) && npm ci)",
    "((curl -fsSL https://exemple.test/x.sh) | sh)",
    "(( N = $(npm install left-pad | wc -l) ))",
    // Dans un "$( … )" sur plusieurs lignes : here-string, arithmétique, case, here-doc à tabulations ou à apostrophe.
    'X="$(\n  tr a b <<< "$y"\n)" && npm install left-pad',
    'X="$(\n  (( F = 1 << 3 ))\n  echo $F\n)" && npm install left-pad',
    'X="$(case a in a) echo;; esac)" && npm install left-pad',
    'X="$(cat <<-EOF\n\tx\n\tEOF\n)" && npm install left-pad',
    "X=\"$(cat <<EOF\nl'app\nEOF\necho fin\n)\" && npm install left-pad",
    // xargs : options lues comme getopt ; un outil ou une sous-commande qui ne sont pas écrits en clair.
    "echo ci | xargs -0I% npm %",
    "xargs -0I% npx %",
    "xargs -rI@ npm @",
    "xargs -tI % npm %",
    "xargs --repl=% npm %",
    "xargs -I % npm % left-pad",
    "xargs --replace=% npm %",
    "xargs -i% npm %",
    "echo install left-pad | xargs npm -g",
    "echo left-pad@1.3.0 | xargs npx --",
    "xargs --frobnicate npm run x",
    "xargs -I outil npx outil",
    "xargs -I run npm run",
    "xargs npm pour-voir",
    'X="$(echo ${Y:- #})"; npm ci',
    'X="$(case a in a) echo ${Y:-;;} ;; esac)"; npm ci',
    // Spécifications lues comme npm-package-arg : `nom@<protocole>`.
    "npm pack @scope/outil@github:user/outil",
    "npm publish @s/o@git+https://github.com/u/o.git",
    // Trois niveaux de relecture.
    "bash -c \"sh -c 'eval npm install left-pad'\"",
  ];
  for (const l of refuses) assert.ok(admis(l).length > 0, l);
  const tolere = [
    "echo ${X:-a b} && echo ok",
    "(( i = 1 << 2 ))",
    "for (( i=0; i<3; i++ )); do echo $i; done",
    "npm pack alias@npm:left-pad@1.3.0",
    "npm pack local@file:../outil",
    // Une enveloppe qui garde l'environnement ne retire pas la variable.
    "npm_config_ignore_scripts=true timeout 10m npm ci",
    "npm_config_ignore_scripts=true nice -n 5 npm ci",
    "npm_config_ignore_scripts=true command npm ci",
  ];
  for (const l of tolere) assert.deepEqual(admis(l), [], l);
});

test("③ une interpolation d'événement dans un run: est refusée, pas dans un env:", () => {
  const run = '      - name: x\n        run: |\n          F="${{ github.event.inputs.fonction }}"\n';
  assert.match(defauts(run)[0], /interpolé dans un run/);
  const ligne = '      - name: x\n        run: echo "${{ github.event.issue.title }}"\n';
  assert.match(defauts(ligne)[0], /x\.yml:2 : `github\.event\.issue\.title` interpolé dans un run/, "un run: d'une ligne aussi (relecture du 14/11)");
  const deuxieme = '      - name: x\n        run: |\n          echo début\n          echo "${{ github.event.issue.title }}"\n';
  assert.match(defauts(deuxieme)[0], /x\.yml:4 : `github\.event\.issue\.title` interpolé dans un run/, "à la deuxième ligne d'un bloc aussi");
  const env = '      - name: x\n        env:\n          F: ${{ github.event.inputs.fonction }}\n        run: |\n          echo "$F"\n';
  assert.deepEqual(defauts(env), []);
  const numero = '      - name: x\n        run: |\n          echo "${{ github.event.number }}"\n';
  assert.deepEqual(defauts(numero), []);
});

const canalSain = [
  "      - name: Publier", "        id: publier", "        env:", "          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}", "          JETON_PERSONNEL: non",
  "        run: |", "          git clean -fdxq", '          --allowedTools "Read,Write(./**),Bash(git status)"',
].join("\n");

test("④ le canal de l'agent : ni jeton personnel, ni commandes qui écrivent un fichier", () => {
  assert.deepEqual(auditerCanalAgent(canalSain), []);
  const pat = canalSain.replace("secrets.GITHUB_TOKEN", "secrets.SENTINELLE_TOKEN");
  assert.ok(auditerCanalAgent(pat).some((d) => /jeton personnel/.test(d)));
  const oui = canalSain.replace("JETON_PERSONNEL: non", "JETON_PERSONNEL: oui");
  assert.ok(auditerCanalAgent(oui).some((d) => /auto-fusion/.test(d)));
  const log = canalSain.replace("Bash(git status)", "Bash(git status),Bash(git log:*)");
  assert.ok(auditerCanalAgent(log).some((d) => /git log/.test(d)));
  const fichier = canalSain.replace("Bash(git status)", "Bash(git commit:*)");
  assert.ok(auditerCanalAgent(fichier).some((d) => /git commit:/.test(d)), "git commit -F recopie un fichier dans un message public");
  const partout = canalSain.replace("Write(./**)", "Write,Edit(./**)");
  assert.ok(auditerCanalAgent(partout).some((d) => /Write,/.test(d)), "écrire hors du dépôt atteint les fichiers de commandes du runner");
  const sale = canalSain.replace("git clean -fdxq", "git status");
  assert.ok(auditerCanalAgent(sale).some((d) => /arbre/.test(d)));
});

test("⑤ hors npm : pnpm, yarn, bun, bunx et pnpx sont refusés — le dépôt n'installe que par npm (2026-11-14)", () => {
  for (const l of ["pnpm dlx netlify-cli@27 deploy", "pnpm add left-pad", "yarn dlx netlify-cli deploy", "bunx netlify-cli deploy", "pnpx --yes netlify-cli", "bun install"]) {
    assert.ok(refuse(l, /n'installe que par npm/), l);
  }
  assert.deepEqual(admis("ls yarn.lock pnpm-lock.yaml"), []);
});
