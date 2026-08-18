import test from "node:test";
import assert from "node:assert/strict";
import { evaluateIncidentInventory } from "../server/sentinel-incident-inventory.js";

const incident = (id, severity = "high", status = "open") => ({ id, severity, status });

test("incident inventory is incomplete when historical completeness is not proven", () => {
  const r = evaluateIncidentInventory([incident("inc_a")], { limit: 200 });
  assert.equal(r.complete, false);
  assert.ok(r.blockers.includes("historical_completeness_unproven"));
});

test("incident inventory is incomplete when retention window is saturated", () => {
  const items = Array.from({ length: 3 }, (_, i) => incident(`inc_${i}`, i === 0 ? "critical" : "warn"));
  const r = evaluateIncidentInventory(items, { limit: 3, historicalCompleteness: true });
  assert.equal(r.complete, false);
  assert.ok(r.blockers.includes("retention_window_saturated"));
});

test("only explicit historical proof plus a non-saturated window can be complete", () => {
  const r = evaluateIncidentInventory([
    incident("inc_causal", "critical"),
    incident("inc_closed", "high", "closed"),
  ], { limit: 200, historicalCompleteness: true });
  assert.equal(r.complete, true);
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.openCriticalIds, ["inc_causal"]);
});

test("openCritical includes only open high/critical incidents", () => {
  const r = evaluateIncidentInventory([
    incident("a", "high"),
    incident("b", "critical"),
    incident("c", "warn"),
    incident("d", "high", "closed"),
  ], { limit: 200, historicalCompleteness: true });
  assert.deepEqual(r.openCriticalIds, ["a", "b"]);
});
