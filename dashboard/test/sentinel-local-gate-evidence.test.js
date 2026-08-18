import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLocalGateEvidence } from "../server/sentinel-local-gate-evidence.js";

function guardian() {
  return {
    generatedAt: "2026-08-18T18:00:00.000Z",
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

test("read-only adapter HOLDs when incident inventory is incomplete", () => {
  const r = evaluateLocalGateEvidence(repair(), {
    guardian: guardian(),
    inventory: {
      complete: false,
      blockers: ["historical_completeness_unproven"],
      count: 1,
      expectedStored: 1,
      incidents: [incident("inc_causal")],
    },
  });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("incident_set_incomplete"));
  assert.equal(r.evidence.inventoryComplete, false);
  assert.equal(r.policy.adapterReadOnly, true);
  assert.equal(r.policy.runtimeActivated, false);
  assert.equal(r.policy.productionDeploy, false);
});

test("read-only adapter HOLDs on any unrelated high/critical incident", () => {
  const r = evaluateLocalGateEvidence(repair(), {
    guardian: guardian(),
    inventory: {
      complete: true,
      blockers: [],
      count: 2,
      expectedStored: 2,
      incidents: [incident("inc_causal"), incident("inc_other", "critical")],
    },
  });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("unrelated_critical_incidents"));
  assert.deepEqual(r.unrelatedCriticalIncidentIds, ["inc_other"]);
});

test("read-only adapter HOLDs when causal identity is missing", () => {
  const r = evaluateLocalGateEvidence(repair({ incidentId: null }), {
    guardian: guardian(),
    inventory: {
      complete: true,
      blockers: [],
      count: 1,
      expectedStored: 1,
      incidents: [incident("inc_causal")],
    },
  });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("causal_incident_missing"));
});

test("GO_LOCAL is possible only for exact causal incident with complete evidence, while production Guardian stays NO_GO", () => {
  const r = evaluateLocalGateEvidence(repair(), {
    guardian: guardian(),
    inventory: {
      complete: true,
      blockers: [],
      count: 1,
      expectedStored: 1,
      incidents: [incident("inc_causal")],
    },
  });
  assert.equal(r.decision, "GO_LOCAL");
  assert.deepEqual(r.blockers, []);
  assert.equal(r.evidence.guardianDecision, "NO_GO");
  assert.equal(r.evidence.causalIncidentId, "inc_causal");
  assert.equal(r.policy.fullProductionGuardianDecision, "NO_GO");
  assert.equal(r.policy.adapterReadOnly, true);
  assert.equal(r.policy.runtimeActivated, false);
  assert.equal(r.policy.productionDeploy, false);
});
