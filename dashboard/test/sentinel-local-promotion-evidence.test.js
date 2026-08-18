import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLocalPromotionEvidence } from "../server/sentinel-local-promotion-evidence.js";

const NOW = Date.parse("2026-08-18T18:00:00Z");

function guardian(over = {}) {
  return {
    decision: "NO_GO",
    observedAt: NOW - 30_000,
    gates: [
      { key: "authorization", state: "PASS", pass: true },
      { key: "observation", state: "PASS", pass: true },
      { key: "critical_journeys", state: "PASS", pass: true },
      { key: "anomalies", state: "PASS", pass: true },
      { key: "release_chain", state: "FAIL", pass: false },
      { key: "critical_incidents", state: "FAIL", pass: false },
    ],
    ...over,
  };
}

function input(over = {}) {
  return {
    guardian: guardian(),
    incidents: [{ id: "inc_causal", status: "open", severity: "high" }],
    incidentsComplete: true,
    diagnosis: { id: "diag_1", meta: { incidentId: "inc_causal" } },
    repair: { diagnosisId: "diag_1", causalIncidentId: "inc_causal" },
    now: NOW,
    ...over,
  };
}

test("GO_LOCAL exige preuve fraîche, incidents exhaustifs et causalité exacte", () => {
  const r = evaluateLocalPromotionEvidence(input());
  assert.equal(r.decision, "GO_LOCAL");
  assert.deepEqual(r.blockers, []);
  assert.equal(r.policy.productionDeploy, false);
  assert.equal(r.policy.runtimeActivated, false);
});

test("snapshot Guardian périmé bloque même si les gates locales sont PASS", () => {
  const r = evaluateLocalPromotionEvidence(input({
    guardian: guardian({ observedAt: NOW - 10 * 60_000 }),
  }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("guardian_snapshot_stale"));
});

test("timestamp Guardian absent ou futur bloque fail-closed", () => {
  const missing = evaluateLocalPromotionEvidence(input({ guardian: guardian({ observedAt: null }) }));
  assert.ok(missing.blockers.includes("guardian_timestamp_missing"));

  const future = evaluateLocalPromotionEvidence(input({ guardian: guardian({ observedAt: NOW + 1_000 }) }));
  assert.ok(future.blockers.includes("guardian_timestamp_future"));
});

test("diagnostic sans incident causal exact bloque", () => {
  const r = evaluateLocalPromotionEvidence(input({ diagnosis: { id: "diag_1", meta: {} } }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("diagnosis_causal_incident_missing"));
  assert.ok(r.blockers.includes("causal_incident_missing"));
});

test("réparation liée à un autre diagnostic ou incident bloque", () => {
  const r = evaluateLocalPromotionEvidence(input({
    repair: { diagnosisId: "diag_other", causalIncidentId: "inc_other" },
  }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("repair_diagnosis_mismatch"));
  assert.ok(r.blockers.includes("repair_causal_incident_mismatch"));
});

test("un incident high non causal reste bloquant", () => {
  const r = evaluateLocalPromotionEvidence(input({
    incidents: [
      { id: "inc_causal", status: "open", severity: "high" },
      { id: "inc_other", status: "open", severity: "critical" },
    ],
  }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("unrelated_critical_incidents"));
});

test("ensemble d'incidents non exhaustif reste HOLD", () => {
  const r = evaluateLocalPromotionEvidence(input({ incidentsComplete: false }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("incident_set_incomplete"));
});
