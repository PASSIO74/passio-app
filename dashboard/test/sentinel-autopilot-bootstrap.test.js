import test from "node:test";
import assert from "node:assert/strict";
import { makeAutopilotRepairer } from "../server/sentinel-autopilot-bootstrap.js";

test("autopilot is never invoked for an unverified repair", async () => {
  let promoted = 0;
  let armed = 0;
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({ attempted: true, ok: false, raison: "tests failed" }),
    promote: async () => { promoted++; return { status: "PROMOTED_LOCAL" }; },
    armRecurrence: () => { armed++; },
  });
  const out = await wrapped({ id: "d1", key: "k1" }, async () => ({}));
  assert.equal(out.ok, false);
  assert.equal(promoted, 0);
  assert.equal(armed, 0);
});

test("a verified repair is offered to autopilot exactly once with sealed diagnosis and causal context", async () => {
  const calls = [];
  let armed = 0;
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({ attempted: true, ok: true, branch: "sentinelle/x", sha: "abc", files: ["js/x.js"], changedLines: 2 }),
    promote: async (repair) => { calls.push(repair); return { status: "HOLD", blockers: ["mutations_disabled"] }; },
    armRecurrence: () => { armed++; },
  });
  const out = await wrapped({
    id: "d2",
    ts: 123456,
    key: "trace@rev",
    title: "bug",
    meta: { incidentId: "inc_causal", incidentClusterKey: "trace@rev" },
  }, async () => ({}));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].diagnosisId, "d2");
  assert.equal(calls[0].key, "trace@rev");
  assert.equal(calls[0].incidentId, "inc_causal");
  assert.equal(calls[0].incidentClusterKey, "trace@rev");
  assert.deepEqual(calls[0].diagnosisEvidence, {
    id: "d2", incidentId: "inc_causal", incidentClusterKey: "trace@rev", diagnosisTs: 123456,
  });
  assert.equal(Object.isFrozen(calls[0].diagnosisEvidence), true);
  assert.equal(out.autopilot.status, "HOLD");
  assert.equal(out.ok, true);
  assert.equal(armed, 0);
});

test("repair-provided causal context is preserved as fallback but is not canonical diagnosis evidence", async () => {
  const calls = [];
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({
      attempted: true, ok: true, branch: "sentinelle/x", sha: "abc",
      incidentId: "inc_from_repair", incidentClusterKey: "cluster_from_repair",
    }),
    promote: async (repair) => { calls.push(repair); return { status: "HOLD" }; },
  });
  await wrapped({ id: "d5" }, async () => ({}));
  assert.equal(calls[0].incidentId, "inc_from_repair");
  assert.equal(calls[0].incidentClusterKey, "cluster_from_repair");
  assert.equal(calls[0].diagnosisEvidence.incidentId, null);
});

test("a verified local promotion arms recurrence monitoring exactly once", async () => {
  const arms = [];
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({ attempted: true, ok: true, branch: "sentinelle/x", sha: "abc", files: ["js/x.js"] }),
    promote: async () => ({ status: "PROMOTED_LOCAL", afterSha: "def" }),
    armRecurrence: (payload) => { arms.push(payload); },
  });
  const out = await wrapped({ id: "d4", key: "api5xx:/messages", title: "API", meta: { incidentId: "inc_api" } }, async () => ({}));
  assert.equal(out.autopilot.status, "PROMOTED_LOCAL");
  assert.equal(arms.length, 1);
  assert.equal(arms[0].repair.key, "api5xx:/messages");
  assert.equal(arms[0].repair.incidentId, "inc_api");
  assert.equal(arms[0].repair.diagnosisEvidence.incidentId, "inc_api");
  assert.equal(arms[0].autopilot.afterSha, "def");
});

test("an autopilot exception never destroys a verified repair", async () => {
  let armed = 0;
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({ attempted: true, ok: true, branch: "sentinelle/x", sha: "abc" }),
    promote: async () => { throw new Error("boom"); },
    armRecurrence: () => { armed++; },
  });
  const out = await wrapped({ id: "d3" }, async () => ({}));
  assert.equal(out.ok, true);
  assert.equal(out.autopilot.status, "ERROR");
  assert.ok(out.autopilot.blockers.includes("autopilot_exception"));
  assert.equal(armed, 0);
});
