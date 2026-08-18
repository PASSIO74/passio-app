import test from "node:test";
import assert from "node:assert/strict";
import { recordPromotionTransaction } from "../server/sentinel-promotion-journal.js";
import { promotionStatusView } from "../server/sentinel-promotion-view.js";

test("promotion view expose état causal, preuves et politique read-only", () => {
  recordPromotionTransaction({
    incidentId: "inc_view", diagnosisId: "diag_view", status: "ROLLED_BACK",
    beforeSha: "1111111111111111111111111111111111111111",
    afterSha: "2222222222222222222222222222222222222222",
    rolledBack: true, reason: "verification_failed:smoke",
    guardianAgeMs: 1400,
    suites: [{ suite: "authz", ok: true }, { suite: "smoke", ok: false }],
  });
  const v = promotionStatusView(5);
  assert.equal(v.state, "ROLLED_BACK");
  assert.equal(v.incidentId, "inc_view");
  assert.equal(v.diagnosisId, "diag_view");
  assert.equal(v.rolledBack, true);
  assert.equal(v.suites[1].ok, false);
  assert.equal(v.policy.readOnly, true);
  assert.equal(v.policy.productionDeploy, false);
  assert.equal(v.policy.runtimeActivation, false);
});
