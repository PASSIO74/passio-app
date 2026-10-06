// WebKit dans la CI (2026-10-06) — le moteur de Safari, celui de TOUS les
// navigateurs de l'iPhone. Le projet `webkit-iphone` (playwright.config.js,
// opt-in `PASSIO_WEBKIT=1`) et le job « Suites WebKit (iPhone) »
// (.github/workflows/deploy.yml) sont lus TELS QU'ILS SONT — le workflow par le
// lecteur YAML du dépôt, la configuration par `require` sous les deux valeurs
// de la variable.
// MUTATIONS : sortir le job de `smoke` ou de `deploy` (③ : un rouge WebKit
// laisserait partir la production) ; installer Chromium au lieu de WebKit, ou
// oublier la variable (②) ; rendre le projet inconditionnel (① : `npx
// playwright test` exigerait un WebKit que le poste n'a pas) ; nommer une suite
// absente ou une suite qui écrit en base (④).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { parse } from "./lib/yaml-mini.mjs";

const require = createRequire(import.meta.url);
const CHEMIN_CONFIG = require.resolve("../../playwright.config.js");

function config(webkit) {
  const avant = process.env.PASSIO_WEBKIT;
  if (webkit) process.env.PASSIO_WEBKIT = "1"; else delete process.env.PASSIO_WEBKIT;
  delete require.cache[CHEMIN_CONFIG];
  try { return require(CHEMIN_CONFIG); }
  finally {
    if (avant === undefined) delete process.env.PASSIO_WEBKIT; else process.env.PASSIO_WEBKIT = avant;
    delete require.cache[CHEMIN_CONFIG];
  }
}
const workflow = () => parse(fs.readFileSync(".github/workflows/deploy.yml", "utf8"));

test("① sans PASSIO_WEBKIT, les projets sont EXACTEMENT prod et local ; avec, webkit-iphone s'ajoute", () => {
  assert.deepEqual(config(false).projects.map((p) => p.name), ["prod", "local"]);
  const c = config(true);
  assert.deepEqual(c.projects.map((p) => p.name), ["prod", "local", "webkit-iphone"]);
  const w = c.projects.find((p) => p.name === "webkit-iphone");
  assert.equal(w.use.browserName, "webkit");
  assert.equal(w.use.isMobile, true);
  assert.equal(w.use.hasTouch, true);
  assert.match(w.use.userAgent, /iPhone/);
  assert.deepEqual(w.use.viewport, { width: 390, height: 844 }, "même surface utile que Chromium : seul le moteur change");
  assert.deepEqual(w.use.launchOptions, {}, "PASSIO_CHROMIUM ne s'applique jamais à WebKit");
});

test("② le job installe WebKit, pose la variable et lance le seul projet webkit-iphone", () => {
  const j = workflow().jobs["test-webkit"];
  assert.ok(j, "job test-webkit absent de deploy.yml");
  assert.equal(j.name, "Suites WebKit (iPhone)");
  const runs = j.steps.map((s) => String(s.run || "")).join("\n");
  assert.match(runs, /npx playwright install --with-deps webkit/);
  assert.doesNotMatch(runs, /install --with-deps chromium/);
  const lancer = j.steps.find((s) => /playwright test/.test(String(s.run || "")));
  assert.equal(lancer.run.trim(), "npx playwright test --project=webkit-iphone");
  assert.equal(lancer.env && lancer.env.PASSIO_WEBKIT, "1");
  assert.ok(!/secrets\./.test(JSON.stringify(j)), "aucun secret : comme test-local");
});

test("③ BLOQUANT : le job entre dans smoke (avec son verdict lu) et dans deploy", () => {
  const w = workflow();
  assert.ok(w.jobs.smoke.needs.includes("test-webkit"));
  assert.ok(w.jobs.deploy.needs.includes("test-webkit"));
  const agreger = w.jobs.smoke.steps[0];
  assert.equal(agreger.env.R_WEBKIT, "${{ needs.test-webkit.result }}");
  assert.match(agreger.run, /for r in [^\n]*"\$\{R_WEBKIT\}"/, "le verdict WebKit est dans la boucle qui rougit");
});

test("④ chaque suite WebKit existe, n'écrit pas en base, et la liste est sans doublon", () => {
  const src = fs.readFileSync(CHEMIN_CONFIG, "utf8");
  const bloc = /const SUITES_WEBKIT = \[([\s\S]*?)\];/.exec(src);
  assert.ok(bloc, "SUITES_WEBKIT introuvable");
  const suites = [...bloc[1].matchAll(/"([^"]+\.spec\.js)"/g)].map((m) => m[1]);
  const prod = [.../const SUITES_PROD = \[([\s\S]*?)\];/.exec(src)[1].matchAll(/"([^"]+\.spec\.js)"/g)].map((m) => m[1]);
  assert.ok(suites.length >= 5);
  assert.equal(new Set(suites).size, suites.length);
  for (const f of suites) {
    assert.ok(fs.existsSync("tests/e2e/" + f), f + " n'existe pas");
    assert.ok(!prod.includes(f), f + " écrit en base (SUITES_PROD) : jamais sur WebKit");
  }
  const w = config(true).projects.find((p) => p.name === "webkit-iphone");
  assert.deepEqual(w.testMatch, suites.map((f) => "**/" + f));
});
