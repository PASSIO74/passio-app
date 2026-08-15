import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadiness } from "../server/readiness.js";

const ov = (over = {}) => ({ health: { errors5m: 0 }, totals: { apiSuccessRate: 100 }, ...over });
const authzOk = { pass: 9, total: 9, verifieLe: "il y a 4 min" };

test("tout vert et tout mesuré → VERT, confiance maximale", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }, { status: "reussi" }],
    bugs: [],
    authz: authzOk,
  });
  assert.equal(r.statut, "vert");
  assert.equal(r.cause, null);
  // La performance n'est pas instrumentée : la confiance ne peut pas être 100 %.
  assert.ok(r.confiance < 100, "confiance bornée par les domaines non mesurés");
});

test("UN SEUL bug critique ouvert suffit à rougir — c'est tout l'objet de la réécriture", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }],
    bugs: [{ severity: "critical", status: "nouveau" }],
    authz: authzOk,
  });
  assert.equal(r.statut, "rouge");
  // L'ancienne moyenne pondérée affichait encore 75/100 avec TROIS bugs critiques.
  assert.ok(r.score <= 40, `score plafonné par le statut rouge (reçu ${r.score})`);
  assert.equal(r.cause.cle, "bugs_critiques");
});

test("bugs corrigés ou ignorés ne comptent pas", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }],
    bugs: [
      { severity: "critical", status: "corrige" },
      { severity: "critical", status: "ignore" },
      { severity: "error", status: "nouveau" },   // pas critique
    ],
    authz: authzOk,
  });
  assert.equal(r.statut, "vert");
});

test("un canari d'autorisation en échec rougit immédiatement, quel que soit le reste", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }],
    bugs: [],
    authz: { pass: 8, total: 9 },
  });
  assert.equal(r.statut, "rouge", "8/9 canaris n'est pas 89 %, c'est ROUGE");
  assert.equal(r.cause.cle, "autorisation");
});

test("autorisation non instrumentée = INCONNU, jamais vert par défaut", () => {
  const r = computeReadiness({ overview: ov(), checklist: [{ status: "reussi" }], bugs: [], authz: null });
  const a = r.domaines.find((d) => d.cle === "autorisation");
  assert.equal(a.etat, "inconnu");
  assert.match(a.detail, /NON INSTRUMENTÉ/);
  assert.notEqual(r.statut, "vert", "un domaine critique inconnu ne peut pas donner un vert franc");
});

test("aucune donnée du tout → statut INCONNU et confiance très basse, pas un faux vert", () => {
  const r = computeReadiness({ overview: { health: {}, totals: {} }, checklist: [], bugs: [] });
  assert.equal(r.statut, "inconnu");
  assert.ok(r.confiance <= 40, `confiance basse attendue (reçu ${r.confiance})`);
  assert.ok(Number.isFinite(r.score), "score fini, jamais NaN");
});

test("la performance ne peut jamais rougir la santé globale", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }],
    bugs: [],
    authz: authzOk,
  });
  const perf = r.domaines.find((d) => d.cle === "performance");
  assert.equal(perf.critique, false);
  assert.notEqual(r.statut, "rouge");
});

test("un parcours critique en échec rougit", () => {
  const r = computeReadiness({
    overview: ov(),
    checklist: [{ status: "reussi" }, { status: "echoue" }],
    bugs: [],
    authz: authzOk,
  });
  assert.equal(r.statut, "rouge");
  assert.equal(r.cause.cle, "parcours_critiques");
});

test("dispo API dégradée ambre, effondrée rouge", () => {
  const ambre = computeReadiness({
    overview: ov({ totals: { apiSuccessRate: 97 } }),
    checklist: [{ status: "reussi" }], bugs: [], authz: authzOk,
  });
  assert.equal(ambre.statut, "ambre");

  const rouge = computeReadiness({
    overview: ov({ totals: { apiSuccessRate: 80 } }),
    checklist: [{ status: "reussi" }], bugs: [], authz: authzOk,
  });
  assert.equal(rouge.statut, "rouge");
});

test("le score ne contredit JAMAIS le statut", () => {
  for (const bugs of [[], [{ severity: "critical", status: "nouveau" }]]) {
    const r = computeReadiness({ overview: ov(), checklist: [{ status: "reussi" }], bugs, authz: authzOk });
    const plafond = { rouge: 40, ambre: 75, inconnu: 85, vert: 100 }[r.statut];
    assert.ok(r.score <= plafond, `${r.statut} → score ${r.score} doit rester ≤ ${plafond}`);
  }
});
