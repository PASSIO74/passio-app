import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadiness } from "../server/readiness.js";

const ov = (over = {}) => ({ health: { errors5m: 0 }, totals: { apiSuccessRate: 100 }, ...over });

test("tout vert → score maximal, 5 facteurs pondérés", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }, { status: "reussi" }],
    bugs: [],
  });
  assert.equal(r.factors.length, 5);
  assert.equal(r.score, 100);
});

test("checklist vide → pas de NaN (couverture = 0)", () => {
  const r = computeReadiness({ overview: ov(), checklist: [], bugs: [] });
  const cov = r.factors.find((f) => f.label.startsWith("Couverture"));
  assert.equal(cov.score, 0);
  assert.ok(Number.isFinite(r.score), "score fini, jamais NaN");
});

test("bugs critiques ouverts font chuter le facteur (ignore/corrigé exclus)", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }],
    bugs: [
      { severity: "critical", status: "nouveau" },
      { severity: "critical", status: "corrige" }, // exclu
      { severity: "error", status: "nouveau" },     // pas critique
    ],
  });
  const crit = r.factors.find((f) => f.label.startsWith("Bugs critiques"));
  assert.equal(crit.score, 66, "100 - 1*34");
});

test("erreurs récentes et dispo API pondèrent le score", () => {
  const r = computeReadiness({
    overview: ov({ health: { errors5m: 2 }, totals: { apiSuccessRate: 80 } }),
    checklist: [{ status: "reussi" }, { status: "echoue" }],
    bugs: [],
  });
  const stab = r.factors.find((f) => f.label.startsWith("Stabilité"));
  const api = r.factors.find((f) => f.label.startsWith("Disponibilité"));
  const tests = r.factors.find((f) => f.label.startsWith("Réussite"));
  assert.equal(stab.score, 70, "100 - 2*15");
  assert.equal(api.score, 80);
  assert.equal(tests.score, 50, "1 réussi / 2 testés");
  assert.ok(r.score > 0 && r.score < 100);
});

test("entrées manquantes tolérées (overview partiel)", () => {
  const r = computeReadiness({ overview: {}, checklist: undefined, bugs: undefined });
  assert.ok(Number.isFinite(r.score));
});
