import test from "node:test";
import assert from "node:assert/strict";
import { promotionUiModel } from "../public/js/sentinel-promotion-status.js";

const safe = {
  state: "PROMOTED_LOCAL",
  incidentId: "inc_1",
  diagnosisId: "diag_1",
  beforeSha: "a".repeat(40),
  afterSha: "b".repeat(40),
  guardianAgeMs: 1200,
  suites: [{ suite: "authz", ok: true }],
  lock: { locked: false },
  policy: { readOnly: true, productionDeploy: false, runtimeActivation: false },
};

test("absence de preuve devient UNAVAILABLE, jamais vert", () => {
  const m = promotionUiModel(null);
  assert.equal(m.state, "UNAVAILABLE");
  assert.equal(m.mutationAllowed, false);
  assert.equal(m.productionDeploy, false);
});

test("contrat read-only incomplet devient UNKNOWN", () => {
  const m = promotionUiModel({ ...safe, policy: { readOnly: true } });
  assert.equal(m.state, "UNKNOWN");
  assert.equal(m.mutationAllowed, false);
});

test("état inconnu reste UNKNOWN", () => {
  const m = promotionUiModel({ ...safe, state: "MAGIC_GREEN" });
  assert.equal(m.state, "UNKNOWN");
  assert.notEqual(m.tone, "ok");
});

test("PROMOTED_LOCAL n'accorde aucune autorité de mutation ou production", () => {
  const m = promotionUiModel(safe);
  assert.equal(m.state, "PROMOTED_LOCAL");
  assert.equal(m.tone, "ok");
  assert.equal(m.mutationAllowed, false);
  assert.equal(m.productionDeploy, false);
  assert.equal(m.incidentId, "inc_1");
});

test("rollback reste explicitement visible", () => {
  const m = promotionUiModel({ ...safe, state: "ROLLED_BACK", rolledBack: true, reason: "verification_failed:smoke" });
  assert.equal(m.state, "ROLLED_BACK");
  assert.equal(m.rolledBack, true);
  assert.match(m.detail, /verification_failed/);
});
