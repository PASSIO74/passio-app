import test from "node:test";
import assert from "node:assert/strict";
import { recordRepairOutcome, learningDecision } from "../server/sentinel-learning.js";
import { autopilotDecision } from "../server/sentinel-autopilot.js";

test("learning quarantines a repair pattern after repeated failures", () => {
  const repair = { key: "autopilot-test-" + Date.now(), files: ["js/example.js"], branch: "sentinelle/test", sha: "abc", ok: true, changedLines: 2 };
  recordRepairOutcome({ ...repair, ok: false, reason: "test failed" });
  const p = recordRepairOutcome({ ...repair, ok: false, reason: "recurrence", recurrence: true });
  assert.equal(p.quarantined, true);
  assert.equal(learningDecision(repair).allowAutoPromotion, false);
});

test("autopilot is fail-closed when guardian is NO_GO", () => {
  const repair = { key: "x", files: ["js/example.js"], branch: "sentinelle/test", sha: "abc", ok: true, changedLines: 2 };
  const d = autopilotDecision(repair, { decision: "NO_GO" }, { allowAutoPromotion: true });
  assert.equal(d.decision, "HOLD");
  assert.ok(d.blockers.includes("release_guardian_no_go"));
});

test("autopilot never enables production deployment", () => {
  const d = autopilotDecision({}, { decision: "GO" }, { allowAutoPromotion: true });
  assert.equal(d.policy.productionDeploy, false);
});
