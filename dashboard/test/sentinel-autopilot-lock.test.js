import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireAutopilotLock,
  releaseAutopilotLock,
  autopilotLockSnapshot,
  _resetAutopilotLockForTests,
} from "../server/sentinel-autopilot-lock.js";

test.beforeEach(() => _resetAutopilotLockForTests());

test("one promotion owns the lock and concurrent callers see no owner token", () => {
  const first = acquireAutopilotLock({ incidentId: "inc_a", diagnosisId: "diag_a", branch: "sentinelle/a" });
  assert.equal(first.ok, true);
  assert.ok(first.token);

  const second = acquireAutopilotLock({ incidentId: "inc_b", diagnosisId: "diag_b", branch: "sentinelle/b" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "promotion_already_in_progress");
  assert.equal(second.active.incidentId, "inc_a");
  assert.equal(Object.hasOwn(second.active, "token"), false);

  const snapshot = autopilotLockSnapshot();
  assert.equal(snapshot.locked, true);
  assert.equal(snapshot.incidentId, "inc_a");
  assert.equal(Object.hasOwn(snapshot, "token"), false);
});

test("only the owner token can release the lock", () => {
  const first = acquireAutopilotLock({ incidentId: "inc_a" });
  assert.equal(releaseAutopilotLock("wrong").reason, "promotion_lock_token_mismatch");
  assert.equal(autopilotLockSnapshot().locked, true);
  const released = releaseAutopilotLock(first.token);
  assert.equal(released.ok, true);
  assert.equal(Object.hasOwn(released.released, "token"), false);
  assert.equal(autopilotLockSnapshot().locked, false);
});

test("release without a held lock fails closed", () => {
  assert.deepEqual(releaseAutopilotLock("x"), { ok: false, reason: "promotion_lock_not_held" });
});
