import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLocalPromotionGate } from "../server/sentinel-local-promotion-gate.js";

function guardian(overrides = {}) {
  const gates = [
    { key: "authorization", pass: true, state: "PASS" },
    { key: "observation", pass: true, state: "PASS" },
    { key: "critical_journeys", pass: true, state: "PASS" },
    { key: "release_chain", pass: false, state: "FAIL" },
    { key: "critical_incidents", pass: false, state: "FAIL" },
    { key: "anomalies", pass: true, state: "PASS" },
  ];
  for (const [key, patch] of Object.entries(overrides.gates || {})) {
    const g = gates.find((x) => x.key === key);
    if (g) Object.assign(g, patch);
  }
  return { decision: overrides.decision || "NO_GO", gates };
}

const incident = (id, severity = "high", status = "open") => ({ id, severity, status });
const complete = (extra = {}) => ({ incidentsComplete: true, ...extra });

test("local gate may ignore release chain and the one exact causal incident only", () => {
  const r = evaluateLocalPromotionGate(complete({
    guardian: guardian(),
    incidents: [incident("inc_causal")],
    causalIncidentId: "inc_causal",
  }));
  assert.equal(r.decision, "GO_LOCAL");
  assert.deepEqual(r.blockers, []);
  assert.equal(r.evidence.incidentsComplete, true);
  assert.equal(r.policy.productionDeploy, false);
  assert.equal(r.policy.runtimeActivated, false);
  assert.equal(r.policy.fullProductionGuardianDecision, "NO_GO");
});

test("an incomplete incident set always blocks even when it only contains the causal incident", () => {
  const r = evaluateLocalPromotionGate({
    guardian: guardian(),
    incidents: [incident("inc_causal")],
    causalIncidentId: "inc_causal",
  });
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("incident_set_incomplete"));
  assert.equal(r.evidence.incidentsComplete, false);
});

test("an unrelated high or critical incident always blocks local promotion", () => {
  const r = evaluateLocalPromotionGate(complete({
    guardian: guardian(),
    incidents: [incident("inc_causal"), incident("inc_other", "critical")],
    causalIncidentId: "inc_causal",
  }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("unrelated_critical_incidents"));
  assert.deepEqual(r.unrelatedCriticalIncidentIds, ["inc_other"]);
});

test("causal incident identity is mandatory and must point to an open high/critical incident", () => {
  const missing = evaluateLocalPromotionGate(complete({ guardian: guardian(), incidents: [incident("inc_a")] }));
  assert.equal(missing.decision, "HOLD");
  assert.ok(missing.blockers.includes("causal_incident_missing"));

  const wrong = evaluateLocalPromotionGate(complete({
    guardian: guardian(),
    incidents: [incident("inc_a")],
    causalIncidentId: "inc_other",
  }));
  assert.equal(wrong.decision, "HOLD");
  assert.ok(wrong.blockers.includes("causal_incident_not_open_critical"));
});

test("UNKNOWN/STALE/FAIL on any required safety gate blocks local promotion", () => {
  for (const [key, state] of [
    ["authorization", "STALE"],
    ["observation", "UNKNOWN"],
    ["critical_journeys", "FAIL"],
    ["anomalies", "UNKNOWN"],
  ]) {
    const g = guardian({ gates: { [key]: { pass: false, state } } });
    const r = evaluateLocalPromotionGate(complete({
      guardian: g,
      incidents: [incident("inc_causal")],
      causalIncidentId: "inc_causal",
    }));
    assert.equal(r.decision, "HOLD", `${key} ${state} must block`);
    assert.ok(r.blockers.some((b) => b.startsWith(`gate:${key}:`)));
  }
});

test("a missing required Guardian gate blocks instead of being treated as pass", () => {
  const g = guardian();
  g.gates = g.gates.filter((x) => x.key !== "authorization");
  const r = evaluateLocalPromotionGate(complete({
    guardian: g,
    incidents: [incident("inc_causal")],
    causalIncidentId: "inc_causal",
  }));
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.includes("missing_gate:authorization"));
});
