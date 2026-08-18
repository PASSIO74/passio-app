import test from "node:test";
import assert from "node:assert/strict";
import { makeAutopilotRepairer } from "../server/sentinel-autopilot-bootstrap.js";

test("autopilot is never invoked for an unverified repair", async () => {
  let promoted = 0;
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({ attempted: true, ok: false, raison: "tests failed" }),
    promote: async () => { promoted++; return { status: "PROMOTED_LOCAL" }; },
  });
  const out = await wrapped({ id: "d1", key: "k1" }, async () => ({}));
  assert.equal(out.ok, false);
  assert.equal(promoted, 0);
});

test("a verified repair is offered to autopilot exactly once with diagnosis context", async () => {
  const calls = [];
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({ attempted: true, ok: true, branch: "sentinelle/x", sha: "abc", files: ["js/x.js"], changedLines: 2 }),
    promote: async (repair) => { calls.push(repair); return { status: "HOLD", blockers: ["mutations_disabled"] }; },
  });
  const out = await wrapped({ id: "d2", key: "trace@rev", title: "bug" }, async () => ({}));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].diagnosisId, "d2");
  assert.equal(calls[0].key, "trace@rev");
  assert.equal(out.autopilot.status, "HOLD");
  assert.equal(out.ok, true);
});

test("an autopilot exception never destroys a verified repair", async () => {
  const wrapped = makeAutopilotRepairer({
    repair: async () => ({ attempted: true, ok: true, branch: "sentinelle/x", sha: "abc" }),
    promote: async () => { throw new Error("boom"); },
  });
  const out = await wrapped({ id: "d3" }, async () => ({}));
  assert.equal(out.ok, true);
  assert.equal(out.autopilot.status, "ERROR");
  assert.ok(out.autopilot.blockers.includes("autopilot_exception"));
});
