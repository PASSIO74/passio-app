import test from "node:test";
import assert from "node:assert/strict";
import { runPromotionTransaction } from "../server/sentinel-autopilot-executor.js";
import { autopilotLockSnapshot, _resetAutopilotLockForTests } from "../server/sentinel-autopilot-lock.js";

test.beforeEach(() => _resetAutopilotLockForTests());

function ops({ dirty = false, statusGate = null } = {}) {
  let head = "1111111111111111111111111111111111111111";
  const calls = [];
  return {
    calls,
    async status() {
      calls.push("status");
      if (statusGate) await statusGate;
      return { code: 0, out: dirty ? " M js/x.js\n" : "" };
    },
    async branch() { calls.push("branch"); return { code: 0, out: "main\n" }; },
    async head() { calls.push("head"); return { code: 0, out: head + "\n" }; },
    async merge(name) { calls.push("merge:" + name); head = "2222222222222222222222222222222222222222"; return { code: 0, out: "ok" }; },
    async abortMerge() { calls.push("abort"); return { code: 0, out: "" }; },
    async resetHard(sha) { calls.push("reset:" + sha); head = sha; return { code: 0, out: "" }; },
    async verify(suite) { calls.push("verify:" + suite); return { code: 0, output: "green" }; },
  };
}

const repair = (branch, incidentId) => ({
  branch,
  incidentId,
  diagnosisId: "diag_" + incidentId,
  sha: "abcdef1",
  ok: true,
  files: ["js/app.js"],
  changedLines: 2,
});

test("a concurrent promotion is refused before its first git operation", async () => {
  let releaseStatus;
  const gate = new Promise((resolve) => { releaseStatus = resolve; });
  const firstOps = ops({ statusGate: gate });
  const secondOps = ops();

  const firstPromise = runPromotionTransaction(repair("sentinelle/a", "inc_a"), { ops: firstOps, suites: [] });
  assert.equal(autopilotLockSnapshot().locked, true);

  const second = await runPromotionTransaction(repair("sentinelle/b", "inc_b"), { ops: secondOps, suites: [] });
  assert.equal(second.attempted, false);
  assert.equal(second.reason, "promotion_already_in_progress");
  assert.equal(second.activePromotion.incidentId, "inc_a");
  assert.deepEqual(secondOps.calls, [], "second promotion must not touch git");

  releaseStatus();
  const first = await firstPromise;
  assert.equal(first.ok, true);
  assert.equal(autopilotLockSnapshot().locked, false);
});

test("early rejection releases the lock for the next transaction", async () => {
  const dirtyOps = ops({ dirty: true });
  const rejected = await runPromotionTransaction(repair("sentinelle/dirty", "inc_dirty"), { ops: dirtyOps, suites: [] });
  assert.equal(rejected.attempted, false);
  assert.equal(rejected.reason, "working_tree_dirty");
  assert.equal(autopilotLockSnapshot().locked, false);

  const cleanOps = ops();
  const next = await runPromotionTransaction(repair("sentinelle/next", "inc_next"), { ops: cleanOps, suites: [] });
  assert.equal(next.ok, true);
  assert.ok(cleanOps.calls.some((x) => x.startsWith("merge:")));
  assert.equal(autopilotLockSnapshot().locked, false);
});
