import test from "node:test";
import assert from "node:assert/strict";
import { evaluateIncidentInventory } from "../server/sentinel-incident-inventory.js";

const incident = (id, severity = "high", status = "open") => ({ id, severity, status });
const retention = (over = {}) => ({
  complete: true,
  historyTrusted: true,
  criticalOverflow: false,
  stored: 1,
  reason: null,
  ...over,
});

test("incident inventory is incomplete when retention proof is missing/untrusted", () => {
  const r = evaluateIncidentInventory([incident("inc_a")], {
    retention: retention({ complete: false, historyTrusted: false, reason: "historical_completeness_unproven" }),
  });
  assert.equal(r.complete, false);
  assert.ok(r.blockers.includes("historical_completeness_unproven"));
});

test("a trusted registry still HOLDs if not all stored incidents were read", () => {
  const r = evaluateIncidentInventory([incident("inc_a")], {
    retention: retention({ stored: 2 }),
  });
  assert.equal(r.complete, false);
  assert.ok(r.blockers.includes("inventory_read_incomplete"));
});

test("critical retention overflow makes the inventory incomplete", () => {
  const r = evaluateIncidentInventory([incident("inc_a")], {
    retention: retention({ complete: false, criticalOverflow: true, reason: "critical_retention_overflow" }),
  });
  assert.equal(r.complete, false);
  assert.ok(r.blockers.includes("critical_retention_overflow"));
});

test("trusted retention plus a full read can be complete", () => {
  const items = [
    incident("inc_causal", "critical"),
    incident("inc_closed", "high", "closed"),
  ];
  const r = evaluateIncidentInventory(items, { retention: retention({ stored: items.length }) });
  assert.equal(r.complete, true);
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.openCriticalIds, ["inc_causal"]);
});

test("openCritical includes only open high/critical incidents", () => {
  const items = [
    incident("a", "high"),
    incident("b", "critical"),
    incident("c", "warn"),
    incident("d", "high", "closed"),
  ];
  const r = evaluateIncidentInventory(items, { retention: retention({ stored: items.length }) });
  assert.deepEqual(r.openCriticalIds, ["a", "b"]);
});
