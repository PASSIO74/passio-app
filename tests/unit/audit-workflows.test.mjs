// Le gate des workflows voit ce qu'il prétend voir : chaque défaut réinjecté rougit, le dépôt reste vert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { auditerWorkflow, auditerCanalAgent, auditerDepot, auditerFichiersNpm } = require("../../scripts/audit-workflows.js");

const defauts = (t) => auditerWorkflow("x.yml", t);

test("① le dépôt passe le gate", () => {
  assert.deepEqual(auditerDepot().defauts, []);
});

test("② outils non figés et actions flottantes sont refusés", () => {
  assert.match(defauts("      - run: npx --yes terser a.js")[0], /npx --yes/);
  assert.match(defauts("      - run: npm install --no-save @playwright/test")[0], /no-save/);
  assert.match(defauts("          version: latest")[0], /latest/);
  assert.match(defauts("      - uses: actions/checkout@v5")[0], /non épinglée/);
  assert.deepEqual(defauts("      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5"), []);
  assert.deepEqual(defauts("      - uses: ./.github/actions/claude-auth-guard"), []);
  assert.deepEqual(defauts("# npx --yes dans un commentaire"), []);
});

test("② bis toute installation hors lockfile est refusée : la CI installe par `npm ci` (2026-11-14)", () => {
  const refuses = [
    // Les deux formes qui tournaient le 2026-11-14 (deploy.yml ×2, controle-realtime.yml).
    '          npm install --prefix "$RUNNER_NETLIFY" --no-audit --no-fund netlify-cli@27.1.2',
    "        run: npm install --no-audit --no-fund --ignore-scripts --no-package-lock @supabase/supabase-js@2.58.0",
    // Options AVANT la sous-commande, alias de npm, installer-puis-tester, sans paquet nommé.
    '          npm --prefix "$D" install netlify-cli',
    "      - run: npm i -g netlify-cli",
    "      - run: npm add left-pad",
    "      - run: npm isntall left-pad",
    "      - run: npm install",
    "      - run: npm it",
    "      - run: npm install-test",
    "          npm ci --ignore-scripts && npm install left-pad",
    "          V=$(npm install left-pad)",
    "          if npm install left-pad; then exit 0; fi",
    // Ce qui réécrit l'arbre hors du lockfile relu, ou lance la dernière version d'un générateur.
    "      - run: npm update",
    "      - run: npm up left-pad",
    "      - run: npm dedupe",
    "      - run: npm audit fix --force",
    "      - run: npm create vite@latest app",
    "      - run: npm init vite",
  ];
  for (const l of refuses) assert.ok(defauts(l).some((x) => /installe hors lockfile|ignore le lockfile|réécrit l'arbre/.test(x)), l);
  // Une seule fois par commande : `--no-save` garde son propre message.
  assert.equal(defauts("      - run: npm install --no-save @playwright/test").length, 1);
  // Une commande continuée par « \ » se lit en entier, et se situe à sa première ligne.
  const continuee = ["        run: |", '          npm --prefix "$D" \\', "            install netlify-cli@27.1.2", ""].join("\n");
  assert.ok(defauts(continuee).some((x) => /^x\.yml:2 : `npm install`/.test(x)), JSON.stringify(defauts(continuee)));
  const admis = [
    '          npm ci --prefix "$RUNNER_NETLIFY" --ignore-scripts --no-audit --no-fund',
    "      - run: npm ci --ignore-scripts",
    "      - run: npm cit --ignore-scripts",
    "      - run: npm install-ci-test --ignore-scripts",
    "      - run: npm run install-hooks",
    "      - run: npm run i",
    "      - run: npm audit --audit-level=high --prefix dashboard",
    "          npm ci --ignore-scripts --prefix /tmp/install",
    "# npm install dans un commentaire",
    "          npm ci --ignore-scripts  # et non npm install",
  ];
  for (const l of admis) assert.deepEqual(defauts(l), [], l);
});

test("② ter `npm ci` sans `--ignore-scripts` est refusé : aucun script d'installation de tiers sur un runner (2026-11-14)", () => {
  const refuses = [
    // Les deux formes qui tournaient le 2026-11-14 (deploy.yml, tests du pilotage ; sentinelle-distante.yml).
    "          npm ci",
    "        run: npm ci",
    "      - run: npm ci --ignore-scripts=false",
    "      - run: npm clean-install",
    "      - run: npm --prefix dashboard ci",
    "      - run: npm cit",
    // La lecture est par COMMANDE : le second `npm ci` de la ligne est jugé pour lui-même.
    "          npm ci --ignore-scripts && npm ci --prefix outils && npm test",
    ["        run: |", "          npm ci \\", "            --prefix outils", ""].join("\n"),
  ];
  for (const l of refuses) assert.ok(defauts(l).some((x) => /sans `--ignore-scripts`/.test(x)), l);
  assert.deepEqual(defauts(["        run: |", "          npm ci \\", "            --ignore-scripts", ""].join("\n")), []);
  assert.deepEqual(defauts("      - run: npm run ci-locale"), []);
});

test("② quater `npx` et `npm exec` qui téléchargent sont refusés ; ceux du lockfile passent (2026-11-14)", () => {
  const refuses = [
    "      - run: npx --yes terser a.js",
    "      - run: npx -y netlify-cli deploy",
    "      - run: npx netlify-cli@27.1.2 deploy",
    "      - run: npx @netlify/build@36.4.7",
    "      - run: npx -p netlify-cli netlify deploy",
    "      - run: npx --package=netlify-cli netlify deploy",
    "      - run: npm exec --yes netlify-cli -- deploy",
    "      - run: npm x -y netlify-cli",
    "      - run: npm exec netlify-cli@27.1.2 -- deploy",
  ];
  for (const l of refuses) assert.ok(defauts(l).length > 0, l);
  const admis = [
    // Les formes qui tournent : l'outil vient du lockfile installé juste avant.
    "      - run: npx playwright test --project=prod",
    "            if timeout --kill-after=30s 10m npx playwright install --with-deps chromium; then exit 0; fi",
    "      - run: npx --no playwright test",
    "      - run: npx @playwright/test --version",
    "      - run: npm exec -- playwright test",
  ];
  for (const l of admis) assert.deepEqual(defauts(l), [], l);
});

test("② quinquies aucun fichier ne détourne `npm ci` : ni npm-shrinkwrap.json, ni .npmrc (2026-11-14)", () => {
  const vus = auditerFichiersNpm(["package.json", "npm-shrinkwrap.json", "dashboard/.npmrc", ".npmrc", "a/b/NPM-SHRINKWRAP.json", "package-lock.json", ".npmrc.exemple", "docs/npmrc.md"]);
  assert.deepEqual(vus.map((d) => d.split(" : ")[0]), ["npm-shrinkwrap.json", "dashboard/.npmrc", ".npmrc", "a/b/NPM-SHRINKWRAP.json"]);
});

test("② sexies les actions composites passent par les mêmes règles, et un fichier npm du dépôt le rougit", () => {
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), "audit-workflows-"));
  fs.mkdirSync(path.join(bac, "workflows"));
  fs.mkdirSync(path.join(bac, "actions", "outil"), { recursive: true });
  fs.writeFileSync(path.join(bac, "workflows", "a.yml"), "jobs:\n  x:\n    steps:\n      - run: npm ci --ignore-scripts\n");
  fs.writeFileSync(path.join(bac, "actions", "outil", "action.yml"), "runs:\n  using: composite\n  steps:\n    - run: npm install left-pad\n      shell: bash\n");
  fs.writeFileSync(path.join(bac, ".npmrc"), "registry=https://registre.example.com/\n");
  const { defauts: d, composites } = auditerDepot(path.join(bac, "workflows"), { actions: path.join(bac, "actions"), racine: bac });
  assert.deepEqual(composites, ["outil/action.yml"]);
  assert.ok(d.some((x) => /^actions\/outil\/action\.yml:4 : `npm install`/.test(x)), JSON.stringify(d));
  assert.ok(d.some((x) => /^\.npmrc : /.test(x)), JSON.stringify(d));
  assert.ok(!d.some((x) => /^a\.yml/.test(x)), JSON.stringify(d));
});

test("③ une interpolation d'événement dans un run: est refusée, pas dans un env:", () => {
  const run = '      - name: x\n        run: |\n          F="${{ github.event.inputs.fonction }}"\n';
  assert.match(defauts(run)[0], /interpolé dans un run/);
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
