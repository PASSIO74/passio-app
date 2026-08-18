import test from "node:test";
import assert from "node:assert/strict";
import { recordPromotionTransaction, promotionJournalSnapshot } from "../server/sentinel-promotion-journal.js";

test("journal conserve la chaîne causale et les preuves de transaction", () => {
  const e = recordPromotionTransaction({
    incidentId: "inc_exact",
    diagnosisId: "diag_exact",
    branch: "sentinelle/fix-x",
    sha: "abcdef1234567",
    beforeSha: "1111111111111111111111111111111111111111",
    afterSha: "2222222222222222222222222222222222222222",
    status: "PROMOTED_LOCAL",
    ok: true,
    suites: [{ suite: "authz", ok: true }, { suite: "smoke", ok: true }],
    guardianObservedAt: "2026-08-18T18:00:00.000Z",
    guardianAgeMs: 1200,
  });
  assert.equal(e.incidentId, "inc_exact");
  assert.equal(e.diagnosisId, "diag_exact");
  assert.equal(e.beforeSha.startsWith("1111"), true);
  assert.equal(e.afterSha.startsWith("2222"), true);
  assert.deepEqual(e.suites.map((s) => s.ok), [true, true]);
});

test("journal rend rollback et raison visibles sans autoriser production", () => {
  recordPromotionTransaction({
    incidentId: "inc_rb", diagnosisId: "diag_rb", status: "ROLLED_BACK",
    ok: false, rolledBack: true, reason: "verification_failed:smoke",
    suites: [{ suite: "smoke", ok: false, detail: "red" }],
  });
  const s = promotionJournalSnapshot(10);
  assert.equal(s.productionDeploy, false);
  assert.equal(s.runtimeActivation, false);
  assert.equal(s.latest.rolledBack, true);
  assert.equal(s.latest.reason, "verification_failed:smoke");
});
