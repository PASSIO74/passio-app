// Audit du 2026-11-06, E-13 : MapLibre 4.7.1 écrit l'attribution d'un style tiers dans innerHTML, sans filtre.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const code = fs.readFileSync("js/map-loader.js", "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

test("le contrôle d'attribution de la bibliothèque n'est jamais instancié", () => {
  assert.doesNotMatch(code, /new ml\.AttributionControl/);
  assert.match(code, /attributionControl: false/, "ni le contrôle implicite créé par la bibliothèque");
});

test("l'obligation ODbL reste tenue, par un texte constant", () => {
  assert.match(code, /openstreetmap\.org\/copyright/);
  assert.match(code, /d\.innerHTML = ATTRIBUTION;/);
});

test("le libellé de lieu d'un popup est échappé", () => {
  const src = fs.readFileSync("js/app-07-ia-explore-irl.js", "utf8");
  assert.match(src, /\$\{escapeHtml\(locLabel\)\}/);
  assert.doesNotMatch(src, />\$\{locLabel\}</);
});
