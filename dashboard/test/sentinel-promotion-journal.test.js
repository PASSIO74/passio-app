import test from "node:test";
import assert from "node:assert/strict";
import { recordPromotionTransaction, promotionJournalSnapshot } from "../server/sentinel-promotion-journal.js";

test("journal keeps minimal causal transaction evidence", () => {
  const entry = recordPromotionTransaction({
    incidentId: "inc_exact",
    diagnosisId: "diag_exact",
    repairBranch: "sentinelle/fix-x",
    repairSha: "abcdef1234567",
    beforeSha: "1111111111111111111111111111111111111111",
    afterSha: "2222222222222222222222222222222222222222",
    status: "PROMOTED_LOCAL",
    ok: true,
    attempted: true,
    suites: [{ suite: "authz", ok: true, detail: "must-not-persist" }],
    guardianObservedAt: "2026-08-18T18:00:00.000Z",
    guardianAgeMs: 1200,
    durationMs: 42,
    token: "secret-lock-token",
  });

  assert.equal(entry.incidentId, "inc_exact");
  assert.equal(entry.diagnosisId, "diag_exact");
  assert.deepEqual(entry.suites, [{ suite: "authz", ok: true }]);
  assert.equal("token" in entry, false);
  assert.equal("detail" in entry.suites[0], false);
});

test("journal exposes rollback without production authority", () => {
  recordPromotionTransaction({
    incidentId: "inc_rb",
    diagnosisId: "diag_rb",
    status: "ROLLED_BACK",
    attempted: true,
    ok: false,
    rolledBack: true,
    reason: "verification_failed:smoke",
    suites: [{ suite: "smoke", ok: false }],
  });
  const snapshot = promotionJournalSnapshot(10);
  assert.equal(snapshot.productionDeploy, false);
  assert.equal(snapshot.runtimeActivation, false);
  assert.equal(snapshot.latest.rolledBack, true);
  assert.equal(snapshot.latest.reason, "verification_failed:smoke");
  assert.ok(snapshot.retentionLimit >= 20 && snapshot.retentionLimit <= 1000);
});
