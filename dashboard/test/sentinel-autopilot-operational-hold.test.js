import test from "node:test";
import assert from "node:assert/strict";
import { classifyPromotionTransaction } from "../server/sentinel-autopilot-executor.js";

test("operational hold is not classified as a repair failure", () => {
  const result = classifyPromotionTransaction({
    attempted: false,
    ok: false,
    rolledBack: false,
    reason: "promotion_already_in_progress",
  });

  assert.equal(result.status, "HOLD_OPERATIONAL");
  assert.equal(result.recordsLearning, false);
  assert.equal(result.auditEvent, "sentinel_autopilot_held");
});

test("a real attempted verification failure still feeds learning", () => {
  const result = classifyPromotionTransaction({
    attempted: true,
    ok: false,
    rolledBack: true,
    reason: "verification_failed:smoke",
  });

  assert.equal(result.status, "ROLLED_BACK");
  assert.equal(result.recordsLearning, true);
  assert.equal(result.auditEvent, "sentinel_autopilot_rejected");
});

test("a verified promotion remains a learning success", () => {
  const result = classifyPromotionTransaction({ attempted: true, ok: true, rolledBack: false });
  assert.equal(result.status, "PROMOTED_LOCAL");
  assert.equal(result.recordsLearning, true);
  assert.equal(result.auditEvent, "sentinel_autopilot_promoted");
});
