// EXP-11 — la clé de service de la PRODUCTION n'est jamais à portée d'une PR.
//
// La gate lit le TEXTE des workflows. Ces verrous l'exercent sur des fichiers
// FABRIQUÉS (pour éprouver la règle) ET sur les workflows RÉELS du dépôt (pour
// que la règle serve à quelque chose). Le cas ⑦ RÉINJECTE le défaut mesuré.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RACINE = path.join(import.meta.dirname, "..", "..");
const { declencheParPullRequest, gouvernance, HORS_PR, CLE_PROD } = require(path.join(RACINE, "scripts/audit-cle-production.js"));

const L = (s) => s.split("\n");

test("① un workflow sans déclencheur pull_request n'est pas concerné", () => {
  assert.equal(declencheParPullRequest(L("on:\n  schedule:\n    - cron: '0 * * * *'\n")), false);
  assert.equal(declencheParPullRequest(L("on:\n  push:\n    branches:\n      - main\n  pull_request:\n")), true);
  // ⚠️ `pull_request_target` compte aussi : il s'exécute avec les secrets du
  // dépôt sur du code proposé de l'extérieur — le pire des deux mondes.
  assert.equal(declencheParPullRequest(L("on:\n  pull_request_target:\n")), true);
  // Un `pull_request` qui n'est PAS dans le bloc `on:` ne déclenche rien.
  assert.equal(declencheParPullRequest(L("on:\n  schedule:\n    - cron: '0 * * * *'\njobs:\n  x:\n    if: github.event_name == 'pull_request'\n")), false);
});

test("② une étape gardée par son propre `if:` est acceptée", () => {
  const y = L([
    "jobs:", "  a:", "    runs-on: ubuntu-latest", "    steps:",
    "      - name: garde", "        if: github.event_name == 'push'", "        env:",
    "          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}", "        run: x",
  ].join("\n"));
  const i = y.findIndex((l) => CLE_PROD.test(l));
  const { bloc, entete } = gouvernance(y, i);
  assert.ok([...bloc, ...entete].some((l) => /^\s*if:/.test(l) && HORS_PR.test(l)));
});

test("③ un `if:` au niveau du JOB couvre toutes ses étapes", () => {
  const y = L([
    "jobs:", "  a:", "    if: github.event_name != 'pull_request'", "    runs-on: ubuntu-latest", "    steps:",
    "      - name: sans if", "        env:",
    "          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}", "        run: x",
  ].join("\n"));
  const i = y.findIndex((l) => CLE_PROD.test(l));
  const { bloc, entete } = gouvernance(y, i);
  assert.ok([...bloc, ...entete].some((l) => /^\s*if:/.test(l) && HORS_PR.test(l)));
});

test("④ l'`if:` d'une AUTRE étape ne protège pas celle-ci", () => {
  const y = L([
    "jobs:", "  a:", "    runs-on: ubuntu-latest", "    steps:",
    "      - name: gardée", "        if: github.event_name == 'push'", "        run: x",
    "      - name: nue", "        env:",
    "          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}", "        run: y",
  ].join("\n"));
  const i = y.findIndex((l) => CLE_PROD.test(l));
  const { bloc, entete } = gouvernance(y, i);
  assert.equal([...bloc, ...entete].some((l) => /^\s*if:/.test(l) && HORS_PR.test(l)), false,
    "sinon une seule étape gardée blanchirait tout le job");
});

test("⑤ une condition qui ne nomme pas le déclencheur ne prouve rien", () => {
  assert.equal(HORS_PR.test("if: steps.x.outputs.ok == 'oui'"), false);
  assert.equal(HORS_PR.test("if: github.ref == 'refs/heads/main'"), false,
    "un push de branche existe aussi : le ref seul ne dit pas le déclencheur");
  assert.equal(HORS_PR.test("if: github.event_name == 'push'"), true);
  assert.equal(HORS_PR.test("if: github.event_name != 'pull_request' && steps.x.outputs.ok == 'oui'"), true);
});

test("⑥ la clé du STAGING n'est pas la clé de production", () => {
  assert.equal(CLE_PROD.test("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SERVICE_ROLE_KEY }}"), false,
    "les confondre ferait rougir le correctif SUP-04 qui a déplacé les suites vers le staging");
  assert.equal(CLE_PROD.test("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"), true);
});

test("⑦ RÉINJECTION : sur les workflows RÉELS, retirer l'`if:` fait rougir la gate", () => {
  const f = path.join(RACINE, ".github/workflows/deploy.yml");
  const avant = fs.readFileSync(f, "utf8");
  const gate = () => {
    try { execFileSync(process.execPath, [path.join(RACINE, "scripts/audit-cle-production.js")], { stdio: "pipe" }); return 0; }
    catch (e) { return e.status; }
  };
  assert.equal(gate(), 0, "le dépôt est sain avant la mutation");
  const cible = "      - name: Barrière RLS de la production (authz-critical seule)\n        if: github.event_name == 'push'\n";
  assert.ok(avant.includes(cible), "l'étape gardée est là où le verrou la cherche");
  try {
    fs.writeFileSync(f, avant.replace(cible, "      - name: Barrière RLS de la production (authz-critical seule)\n"));
    assert.equal(gate(), 1, "la gate doit REFUSER une étape qui emporte la clé de production sur une PR");
  } finally {
    fs.writeFileSync(f, avant);
  }
  assert.equal(gate(), 0, "et le dépôt est rendu intact");
});
