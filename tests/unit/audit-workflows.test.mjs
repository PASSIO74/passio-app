// Le gate des workflows voit ce qu'il prétend voir : chaque défaut réinjecté rougit, le dépôt reste vert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { auditerWorkflow, auditerCanalAgent, auditerDepot, auditerFichiersDetournants } = require("../../scripts/audit-workflows.js");

const defauts = (t) => auditerWorkflow("x.yml", t);
/** Un script `run: |` qui contient ces lignes de shell (la 1re ligne de shell est la ligne 2 du texte). */
const enRun = (...shell) => ["      - run: |", ...shell.join("\n").split("\n").map((l) => "          " + l)].join("\n") + "\n";
const refuse = (cmd, motif) => defauts(enRun(cmd)).some((x) => motif.test(x));
const admis = (cmd) => defauts(enRun(cmd));

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
  assert.deepEqual(defauts("      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5"), []);
  assert.deepEqual(defauts("      - uses: ./.github/actions/claude-auth-guard"), []);
  assert.deepEqual(defauts("# npx --yes dans un commentaire"), []);
});

test("② bis toute installation npm hors lockfile est refusée : la CI installe par `npm ci` (2026-11-14)", () => {
  const refuses = [
    // Les deux formes qui tournaient le 2026-11-14 (deploy.yml ×2, controle-realtime.yml).
    'npm install --prefix "$RUNNER_NETLIFY" --no-audit --no-fund netlify-cli@27.1.2',
    "npm install --no-audit --no-fund --ignore-scripts --no-package-lock @supabase/supabase-js@2.58.0",
    // Options AVANT la sous-commande — leurs valeurs comprises, même quand elles portent un nom de commande.
    'npm --prefix "$D" install netlify-cli',
    "npm --loglevel info install left-pad",
    "npm --prefix docs install left-pad",
    "npm -C outils install left-pad",
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
    "if npm install left-pad; then exit 0; fi",
    'echo "étape #1"; npm install left-pad',
  ];
  for (const l of refuses) assert.ok(refuse(l, /installe hors lockfile|ignore le lockfile|réécrit l'arbre/), l);
  // Une seule fois par commande : `--no-save` garde son propre message.
  assert.equal(defauts("      - run: npm install --no-save @playwright/test").length, 1);
  // Une commande continuée par « \ » se lit en entier, et se situe à sa première ligne.
  const continuee = enRun('npm --prefix "$D" \\', "  install netlify-cli@27.1.2");
  assert.ok(defauts(continuee).some((x) => /^x\.yml:2 : `npm install`/.test(x)), JSON.stringify(defauts(continuee)));
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
  ];
  for (const l of tolere) assert.deepEqual(admis(l), [], l);
});

test("② ter `npm ci` et `npm rebuild` sans `--ignore-scripts` EFFECTIF sont refusés (2026-11-14)", () => {
  const refuses = [
    // Les deux formes qui tournaient le 2026-11-14 (deploy.yml, tests du pilotage ; sentinelle-distante.yml).
    "npm ci",
    "npm ci --ignore-scripts=false",
    "npm ci --ignore-scripts false",
    "npm ci --ignore-scripts --no-ignore-scripts",
    "npm ci --ignore-scripts --ignore-scripts=false",
    "npm clean-install",
    "npm install-cl",
    "npm --prefix dashboard ci",
    "npm --loglevel info ci",
    "npm cit",
    "npm rebuild",
    "npm rb",
    "npm ci --ignore-scripts && npm rebuild",
    // La lecture est par COMMANDE : le second `npm ci` de la ligne est jugé pour lui-même.
    "npm ci --ignore-scripts && npm ci --prefix outils && npm test",
  ];
  for (const l of refuses) assert.ok(refuse(l, /sans `--ignore-scripts`/), l);
  assert.ok(defauts(enRun("npm ci \\", "  --prefix outils")).some((x) => /sans `--ignore-scripts`/.test(x)));
  assert.deepEqual(defauts(enRun("npm ci \\", "  --ignore-scripts")), []);
  assert.deepEqual(admis("npm ci --ignore-scripts=1"), []);
  assert.deepEqual(admis("NPM_CONFIG_IGNORE_SCRIPTS=true npm ci"), []);
  assert.deepEqual(admis("npm_config_ignore_scripts=true npm ci"), []);
  assert.deepEqual(admis("npm run ci-locale"), []);
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
  ];
  for (const l of refuses) assert.ok(admis(l).length > 0, l);
  const tolere = [
    // Les formes qui tournent : l'outil vient du lockfile installé juste avant.
    "npx playwright test --project=prod",
    "if timeout --kill-after=30s 10m npx playwright install --with-deps chromium; then exit 0; fi",
    "npx --no playwright test",
    "npx @playwright/test --version",
    "npx ./outils/script.js",
    "npm exec -- playwright test",
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

test("② sexies les actions composites passent par les mêmes règles, et un fichier npm du dépôt le rougit (repli sans git)", (t) => {
  const bac = bacTemporaire(t, "audit-workflows-");
  fs.mkdirSync(path.join(bac, "workflows"));
  fs.mkdirSync(path.join(bac, "actions", "outil"), { recursive: true });
  fs.mkdirSync(path.join(bac, "outils", "local"), { recursive: true });
  fs.writeFileSync(path.join(bac, "workflows", "a.yml"), "jobs:\n  x:\n    steps:\n      - uses: ./outils/local\n      - run: npm ci --ignore-scripts\n");
  fs.writeFileSync(path.join(bac, "actions", "outil", "action.yml"), "runs:\n  using: composite\n  steps:\n    - run: npm install left-pad\n      shell: bash\n");
  fs.writeFileSync(path.join(bac, "outils", "local", "action.yml"), "runs:\n  using: composite\n  steps:\n    - run: npx netlify-cli@27.1.2 deploy\n      shell: bash\n");
  fs.writeFileSync(path.join(bac, ".npmrc"), "registry=https://registre.example.com/\n");
  const { defauts: d, composites } = auditerDepot(path.join(bac, "workflows"), { actions: path.join(bac, "actions"), racine: bac });
  assert.deepEqual(composites, ["actions/outil/action.yml", "outils/local/action.yml"]);
  assert.ok(d.some((x) => /^actions\/outil\/action\.yml:4 : `npm install`/.test(x)), JSON.stringify(d));
  assert.ok(d.some((x) => /^outils\/local\/action\.yml:4 : `npx netlify-cli@27\.1\.2`/.test(x)), "une action citée par `uses: ./…` est lue aussi");
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

test("② septies seul le shell des scripts `run:` est lu — un nom d'étape n'est pas une commande (2026-11-14)", () => {
  assert.deepEqual(defauts("      - name: npm install des dépendances\n        run: npm ci --ignore-scripts\n"), []);
  assert.deepEqual(defauts("      - name: npm ci (pilotage)\n        run: npm ci --ignore-scripts\n"), []);
  // Une valeur sur une ligne, simple ou entre guillemets, est un script.
  assert.ok(defauts("      - run: npm install left-pad\n").some((x) => /^x\.yml:1 : `npm install`/.test(x)));
  assert.ok(defauts("        run: 'npm install left-pad'\n").some((x) => /`npm install`/.test(x)));
  // Un scalaire replié réunit ses lignes : `npm` puis `install left-pad` est UNE commande.
  assert.ok(defauts("      - run: >\n          npm\n          install left-pad\n").some((x) => /`npm install`/.test(x)));
  assert.deepEqual(defauts("      - run: >\n          npm ci\n          --ignore-scripts\n"), []);
  // La clé sœur qui suit un bloc n'en fait pas partie.
  assert.deepEqual(defauts("      - run: |\n          npm ci --ignore-scripts\n        shell: bash\n        env:\n          NOTE: npm install\n"), []);
});

test("③ une interpolation d'événement dans un run: est refusée, pas dans un env:", () => {
  const run = '      - name: x\n        run: |\n          F="${{ github.event.inputs.fonction }}"\n';
  assert.match(defauts(run)[0], /interpolé dans un run/);
  const ligne = '      - name: x\n        run: echo "${{ github.event.issue.title }}"\n';
  assert.match(defauts(ligne)[0], /x\.yml:2 : `github\.event\.issue\.title` interpolé dans un run/, "un run: d'une ligne aussi (relecture du 14/11)");
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
