import test from "node:test";
import assert from "node:assert/strict";
import { recordRepairOutcome, recordRepairRecurrence, learningDecision } from "../server/sentinel-learning.js";
import { autopilotDecision } from "../server/sentinel-autopilot.js";

test("learning quarantines a repair pattern after repeated failures", () => {
  const repair = { key: "autopilot-fail-" + Date.now(), files: ["js/example.js"], branch: "sentinelle/test", sha: "abc", ok: true, changedLines: 2 };
  recordRepairOutcome({ ...repair, ok: false, reason: "test failed" });
  const p = recordRepairOutcome({ ...repair, ok: false, reason: "test failed again" });
  assert.equal(p.quarantined, true);
  assert.equal(p.failures, 2);
  assert.equal(learningDecision(repair).allowAutoPromotion, false);
});

test("post-promotion recurrences quarantine without falsifying repair attempts", () => {
  const repair = { key: "autopilot-recur-" + Date.now(), files: ["js/example.js"], branch: "sentinelle/test", sha: "abc", ok: true, changedLines: 2 };
  recordRepairOutcome({ ...repair, ok: true, reason: "verified local promotion" });
  const before = learningDecision(repair).pattern;
  assert.equal(before.attempts, 1);
  assert.equal(before.failures, 0);

  recordRepairRecurrence({ ...repair, reason: "same signal returned" });
  const p = recordRepairRecurrence({ ...repair, reason: "same signal returned again" });
  assert.equal(p.quarantined, true);
  assert.equal(p.recurrences, 2);
  assert.equal(p.attempts, 1);
  assert.equal(p.failures, 0);
  assert.equal(p.verifiedSuccesses, 1);
  assert.equal(learningDecision(repair).allowAutoPromotion, false);
});

test("autopilot is fail-closed when guardian is NO_GO by default", () => {
  const repair = { key: "x", files: ["js/example.js"], branch: "sentinelle/test", sha: "abc", ok: true, changedLines: 2 };
  const d = autopilotDecision(repair, { decision: "NO_GO" }, { allowAutoPromotion: true }, { enabled: true, useLocalGate: false });
  assert.equal(d.decision, "HOLD");
  assert.ok(d.blockers.includes("release_guardian_no_go"));
  assert.equal(d.policy.localGateV2, false);
});

test("local gate v2 can promote only when explicitly enabled and GO_LOCAL", () => {
  const repair = {
    key: "x-local", files: ["js/example.js"], branch: "sentinelle/test", sha: "abc",
    ok: true, changedLines: 2, incidentId: "inc_causal",
  };
  const localGateDecision = {
    decision: "GO_LOCAL",
    blockers: [],
    policy: { runtimeActivated: false, productionDeploy: false },
  };
  const d = autopilotDecision(
    repair,
    { decision: "NO_GO" },
    { allowAutoPromotion: true },
    { enabled: true, useLocalGate: true, localGateDecision },
  );
  assert.equal(d.decision, "PROMOTE_LOCAL");
  assert.deepEqual(d.blockers, []);
  assert.equal(d.guardianDecision, "NO_GO");
  assert.equal(d.policy.localGateV2, true);
  assert.equal(d.policy.productionDeploy, false);
});

test("local gate v2 HOLD blocks even when full Guardian is GO", () => {
  const repair = { key: "x-hold", files: ["js/example.js"], branch: "sentinelle/test", sha: "abc", ok: true, changedLines: 2 };
  const d = autopilotDecision(
    repair,
    { decision: "GO" },
    { allowAutoPromotion: true },
    {
      enabled: true,
      useLocalGate: true,
      localGateDecision: { decision: "HOLD", blockers: ["incident_set_incomplete"] },
    },
  );
  assert.equal(d.decision, "HOLD");
  assert.ok(d.blockers.includes("local_gate:incident_set_incomplete"));
});

test("autopilot disabled remains a blocker even with GO_LOCAL", () => {
  const repair = { key: "x-disabled", files: ["js/example.js"], branch: "sentinelle/test", sha: "abc", ok: true, changedLines: 2 };
  const d = autopilotDecision(
    repair,
    { decision: "NO_GO" },
    { allowAutoPromotion: true },
    { enabled: false, useLocalGate: true, localGateDecision: { decision: "GO_LOCAL", blockers: [] } },
  );
  assert.equal(d.decision, "HOLD");
  assert.ok(d.blockers.includes("autopilot_disabled"));
});

test("autopilot never enables production deployment", () => {
  const d = autopilotDecision({}, { decision: "GO" }, { allowAutoPromotion: true }, { enabled: true, useLocalGate: false });
  assert.equal(d.policy.productionDeploy, false);
});
