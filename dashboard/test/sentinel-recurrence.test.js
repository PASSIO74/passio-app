import test from "node:test";
import assert from "node:assert/strict";
import {
  armRecurrenceWatch,
  observeAlertForRecurrence,
  recurrenceSnapshot,
  _resetRecurrenceForTests,
} from "../server/sentinel-recurrence.js";

test("only PROMOTED_LOCAL repairs arm recurrence monitoring", () => {
  _resetRecurrenceForTests();
  assert.equal(armRecurrenceWatch({ repair: { key: "k" }, autopilot: { status: "HOLD" }, now: 1000 }), null);
  assert.equal(recurrenceSnapshot().active, 0);
  const armed = armRecurrenceWatch({
    repair: { key: "k", branch: "sentinelle/x", sha: "abc", files: ["js/x.js"] },
    autopilot: { status: "PROMOTED_LOCAL", afterSha: "def" },
    now: 1000,
  });
  assert.equal(armed.signalKey, "k");
  assert.equal(recurrenceSnapshot().active, 1);
});

test("alerts older than the promotion are never counted as recurrence", () => {
  _resetRecurrenceForTests();
  armRecurrenceWatch({ repair: { key: "same", files: ["js/x.js"] }, autopilot: { status: "PROMOTED_LOCAL" }, now: 2000 });
  let recorded = 0;
  const out = observeAlertForRecurrence({ key: "same", ts: 1999, id: "old" }, { now: 2100, record: () => { recorded++; return {}; } });
  assert.equal(out, null);
  assert.equal(recorded, 0);
  assert.equal(recurrenceSnapshot().active, 1);
});

test("same signal after promotion records recurrence once and disarms watch", () => {
  _resetRecurrenceForTests();
  armRecurrenceWatch({ repair: { key: "api5xx:/x", branch: "sentinelle/x", sha: "abc", files: ["js/x.js"] }, autopilot: { status: "PROMOTED_LOCAL" }, now: 3000 });
  const calls = [];
  const first = observeAlertForRecurrence({ key: "api5xx:/x", ts: 3001, id: "a1" }, {
    now: 3001,
    record: (input) => { calls.push(input); return { recurrences: 2, quarantined: true }; },
  });
  assert.equal(first.quarantined, true);
  assert.equal(first.recurrences, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signalKey, "api5xx:/x");
  assert.equal(recurrenceSnapshot().active, 0);

  const second = observeAlertForRecurrence({ key: "api5xx:/x", ts: 3002, id: "a2" }, {
    now: 3002,
    record: () => { calls.push("again"); return {}; },
  });
  assert.equal(second, null);
  assert.equal(calls.length, 1);
});

test("different signal cannot poison another repair pattern", () => {
  _resetRecurrenceForTests();
  armRecurrenceWatch({ repair: { key: "signal-A", files: ["js/a.js"] }, autopilot: { status: "PROMOTED_LOCAL" }, now: 4000 });
  let recorded = false;
  const out = observeAlertForRecurrence({ key: "signal-B", ts: 4001 }, { now: 4001, record: () => { recorded = true; return {}; } });
  assert.equal(out, null);
  assert.equal(recorded, false);
  assert.equal(recurrenceSnapshot().active, 1);
});
