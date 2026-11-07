// Le gate des workflows voit ce qu'il prétend voir : chaque défaut réinjecté rougit, le dépôt reste vert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { auditerWorkflow, auditerCanalAgent, auditerDepot } = require("../../scripts/audit-workflows.js");

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
