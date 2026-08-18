import test from "node:test";
import assert from "node:assert/strict";
import { runPromotionTransaction } from "../server/sentinel-autopilot-executor.js";

function opsFactory({ failSuite = null, dirty = false, branch = "main" } = {}) {
  const calls = [];
  let head = "1111111111111111111111111111111111111111";
  const before = head;
  return {
    calls,
    before,
    async status() { calls.push("status"); return { code: 0, out: dirty ? " M js/x.js\n" : "" }; },
    async branch() { calls.push("branch"); return { code: 0, out: branch + "\n" }; },
    async head() { calls.push("head"); return { code: 0, out: head + "\n" }; },
    async merge(name) { calls.push("merge:" + name); head = "2222222222222222222222222222222222222222"; return { code: 0, out: "ok" }; },
    async abortMerge() { calls.push("abort"); return { code: 0, out: "" }; },
    async resetHard(sha) { calls.push("reset:" + sha); head = sha; return { code: 0, out: "" }; },
    async verify(suite) { calls.push("verify:" + suite); return { code: suite === failSuite ? 1 : 0, output: suite === failSuite ? "red" : "green" }; },
  };
}

const repair = { branch: "sentinelle/2026-08-18-demo", sha: "abcdef1", ok: true, files: ["js/app.js"], changedLines: 2 };

test("promotion advances HEAD only after every proof is green", async () => {
  const ops = opsFactory();
  const r = await runPromotionTransaction(repair, { ops, suites: ["authz", "smoke"] });
  assert.equal(r.ok, true);
  assert.equal(r.rolledBack, false);
  assert.notEqual(r.afterSha, r.beforeSha);
  assert.deepEqual(r.suites.map((x) => [x.suite, x.ok]), [["authz", true], ["smoke", true]]);
  assert.equal(ops.calls.some((x) => x.startsWith("reset:")), false);
});

test("first red proof rolls back exactly to pre-promotion SHA", async () => {
  const ops = opsFactory({ failSuite: "handlers" });
  const r = await runPromotionTransaction(repair, { ops, suites: ["authz", "handlers", "smoke"] });
  assert.equal(r.ok, false);
  assert.equal(r.rolledBack, true);
  assert.equal(r.reason, "verification_failed:handlers");
  assert.ok(ops.calls.includes("reset:" + ops.before));
  assert.equal(ops.calls.includes("verify:smoke"), false, "stop verification after first failure");
});

test("dirty working tree blocks promotion before merge", async () => {
  const ops = opsFactory({ dirty: true });
  const r = await runPromotionTransaction(repair, { ops, suites: ["authz"] });
  assert.equal(r.attempted, false);
  assert.equal(r.reason, "working_tree_dirty");
  assert.equal(ops.calls.some((x) => x.startsWith("merge:")), false);
});

test("wrong target branch blocks promotion before merge", async () => {
  const ops = opsFactory({ branch: "feature/work" });
  const r = await runPromotionTransaction(repair, { ops, suites: ["authz"] });
  assert.equal(r.attempted, false);
  assert.equal(r.reason, "wrong_target_branch");
  assert.equal(ops.calls.some((x) => x.startsWith("merge:")), false);
});

test("arbitrary branch names are rejected", async () => {
  const ops = opsFactory();
  const r = await runPromotionTransaction({ ...repair, branch: "feature/not-sentinel" }, { ops, suites: ["authz"] });
  assert.equal(r.attempted, false);
  assert.equal(r.reason, "repair_branch_invalid");
});
