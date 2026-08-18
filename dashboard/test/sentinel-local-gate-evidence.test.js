import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLocalGateEvidence } from "../server/sentinel-local-gate-evidence.js";

const NOW = Date.parse("2026-08-18T18:02:00.000Z");

function guardian(generatedAt = "2026-08-18T18:00:00.000Z") {
  return {
    generatedAt,
    decision: "NO_GO",
    gates: [
      { key: "authorization", pass: true, state: "PASS" },
      { key: "observation", pass: true, state: "PASS" },
      { key: "critical_journeys", pass: true, state: "PASS" },
      { key: "release_chain", pass: false, state: "FAIL" },
      { key: "critical_incidents", pass: false, state: "FAIL" },
      { key: "anomalies", pass: true, state: "PASS" },
    ],
  };
}

const incident = (id, severity = "high", status = "open") => ({ id, severity, status });
const repair = (over = {}) => ({
  ok: true,
  branch: "sentinelle/fix-1",
  sha: "abc123def456",
  incidentId: "inc_causal",
  incidentClusterKey: "cluster@rev",
  diagnosisId: "d1",
  ...over,
});
const diagnosis = (over = {}) => ({ id: "d1", meta: { incidentId: "inc_causal" }, ...over });
const inventory = (over = {}) => ({
  complete: true,
  blockers: [],
  count: 1,
  expectedStored: 1,
  incidents: [incident("inc_causal")],
  ...over,
});

function evaluate(rep = repair(), over = {}) {
  return evaluateLocalGateEvidence(rep, {
    guardian: guardian(),
    inventory: inventory(),
    diagnosis: diagnosis(),
    now: NOW,
    ...over,
  });
}

test("read-only adapter HOLDs when incident inventory is incomplete", () => {
  const r = evaluate(repair(), {
    inventory: inventory({ complete: false, blockers: ["historical_completeness_unproven"] }),
  });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("incident_set_incomplete"));
  assert.equal(r.evidence.inventoryComplete, false);
  assert.equal(r.policy.adapterReadOnly, true);
  assert.equal(r.policy.runtimeActivated, false);
  assert.equal(r.policy.productionDeploy, false);
});

test("read-only adapter HOLDs on any unrelated high/critical incident", () => {
  const r = evaluate(repair(), {
    inventory: inventory({
      count: 2,
      expectedStored: 2,
      incidents: [incident("inc_causal"), incident("inc_other", "critical")],
    }),
  });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("unrelated_critical_incidents"));
  assert.deepEqual(r.localGate.unrelatedCriticalIncidentIds, ["inc_other"]);
});

test("read-only adapter HOLDs when canonical diagnosis is absent", () => {
  const r = evaluateLocalGateEvidence(repair(), {
    guardian: guardian(), inventory: inventory(), diagnosis: null, now: NOW,
  });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("diagnosis_identity_missing"));
  assert.ok(r.blockers.includes("diagnosis_causal_incident_missing"));
  assert.equal(r.evidence.canonicalDiagnosisFound, false);
});

test("read-only adapter HOLDs when repair causal incident mismatches canonical diagnosis", () => {
  const r = evaluate(repair({ incidentId: "inc_other" }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("repair_causal_incident_mismatch"));
});

test("read-only adapter HOLDs when repair diagnosis identity mismatches canonical diagnosis", () => {
  const r = evaluate(repair({ diagnosisId: "d_other" }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("repair_diagnosis_mismatch"));
});

test("read-only adapter HOLDs on stale Guardian snapshot", () => {
  const r = evaluate(repair(), { guardian: guardian("2026-08-18T17:50:00.000Z") });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("guardian_snapshot_stale"));
});

test("read-only adapter HOLDs on future Guardian timestamp", () => {
  const r = evaluate(repair(), { guardian: guardian("2026-08-18T18:03:00.000Z") });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("guardian_timestamp_future"));
});

test("GO_LOCAL requires fresh Guardian, canonical causal diagnosis and complete incident evidence", () => {
  const r = evaluate();
  assert.equal(r.decision, "GO_LOCAL");
  assert.deepEqual(r.blockers, []);
  assert.equal(r.evidence.guardianDecision, "NO_GO");
  assert.equal(r.evidence.causalIncidentId, "inc_causal");
  assert.equal(r.evidence.repairIncidentId, "inc_causal");
  assert.equal(r.evidence.canonicalDiagnosisFound, true);
  assert.equal(r.policy.fullProductionGuardianDecision, "NO_GO");
  assert.equal(r.policy.adapterReadOnly, true);
  assert.equal(r.policy.runtimeActivated, false);
  assert.equal(r.policy.productionDeploy, false);
});
