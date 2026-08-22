import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadiness } from "../server/readiness.js";

const ov = (over = {}) => ({ health: { errors5m: 0 }, totals: { apiSuccessRate: 100 }, ...over });
const authzOk = { pass: 9, total: 9, verifieLe: "il y a 4 min" };
const observationLive = { state: "LIVE", parts: { dbRead: { state: "LIVE" }, sse: { state: "LIVE" }, canary: { state: "LIVE" } } };
const releaseLive = { state: "LIVE", detail: "chaîne complète" };
const ready = (args) => computeReadiness({ observation: observationLive, release: releaseLive, ...args });

test("tout vert et tout mesuré → VERT", () => {
  const r = ready({ overview: ov(), checklist: [{ status: "reussi" }, { status: "reussi" }], bugs: [], authz: authzOk });
  assert.equal(r.statut, "vert");
  assert.equal(r.cause, null);
  assert.ok(r.confiance < 100, "performance reste non instrumentée");
});

test("UN SEUL bug critique ouvert suffit à rougir", () => {
  const r = ready({ overview: ov(), checklist: [{ status: "reussi" }], bugs: [{ severity: "critical", status: "nouveau" }], authz: authzOk });
  assert.equal(r.statut, "rouge");
  assert.ok(r.score <= 40);
  assert.equal(r.cause.cle, "bugs_critiques");
});

test("bugs corrigés ou ignorés ne comptent pas", () => {
  const r = ready({ overview: ov(), checklist: [{ status: "reussi" }], bugs: [
    { severity: "critical", status: "corrige" },
    { severity: "critical", status: "ignore" },
    { severity: "error", status: "nouveau" },
  ], authz: authzOk });
  assert.equal(r.statut, "vert");
});

test("un canari d'autorisation en échec rougit immédiatement", () => {
  const r = ready({ overview: ov(), checklist: [{ status: "reussi" }], bugs: [], authz: { pass: 8, total: 9 } });
  assert.equal(r.statut, "rouge");
  assert.equal(r.cause.cle, "autorisation");
});

test("autorisation non instrumentée = INCONNU", () => {
  const r = ready({ overview: ov(), checklist: [{ status: "reussi" }], bugs: [], authz: null });
  const a = r.domaines.find((d) => d.cle === "autorisation");
  assert.equal(a.etat, "inconnu");
  assert.notEqual(r.statut, "vert");
});

test("observation indisponible rougit même si le produit semble calme", () => {
  const r = computeReadiness({
    overview: ov(), checklist: [{ status: "reussi" }], bugs: [], authz: authzOk, release: releaseLive,
    observation: { state: "UNAVAILABLE", parts: { dbRead: { state: "UNAVAILABLE" }, sse: { state: "LIVE" }, canary: { state: "UNAVAILABLE" } } },
  });
  assert.equal(r.statut, "rouge");
  assert.equal(r.cause.cle, "observation");
});

test("observation non configurée reste INCONNU, jamais vert", () => {
  const r = computeReadiness({
    overview: ov(), checklist: [{ status: "reussi" }], bugs: [], authz: authzOk, release: releaseLive,
    observation: { state: "NOT_CONFIGURED", parts: { dbRead: { state: "NOT_CONFIGURED" } } },
  });
  assert.equal(r.statut, "inconnu");
});

test("un parcours critique en échec rougit", () => {
  const r = ready({ overview: ov(), checklist: [{ status: "reussi" }, { status: "echoue" }], bugs: [], authz: authzOk });
  assert.equal(r.statut, "rouge");
  assert.equal(r.cause.cle, "parcours_critiques");
});

test("dispo API dégradée ambre, effondrée rouge", () => {
  const ambre = ready({ overview: ov({ totals: { apiSuccessRate: 97 } }), checklist: [{ status: "reussi" }], bugs: [], authz: authzOk });
  assert.equal(ambre.statut, "ambre");
  const rouge = ready({ overview: ov({ totals: { apiSuccessRate: 80 } }), checklist: [{ status: "reussi" }], bugs: [], authz: authzOk });
  assert.equal(rouge.statut, "rouge");
});

test("le score ne contredit JAMAIS le statut", () => {
  for (const bugs of [[], [{ severity: "critical", status: "nouveau" }]]) {
    const r = ready({ overview: ov(), checklist: [{ status: "reussi" }], bugs, authz: authzOk });
    const plafond = { rouge: 40, ambre: 75, inconnu: 85, vert: 100 }[r.statut];
    assert.ok(r.score <= plafond);
  }
});
