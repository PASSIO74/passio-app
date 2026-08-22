import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSnapshots } from "../server/control-history.js";

function snap(over = {}) {
  return {
    at: over.at || "2026-08-18T12:00:00.000Z",
    global: over.global || { state: "LIVE", confidence: 90 },
    domains: over.domains || {
      product: { state: "LIVE", detail: "ok" },
      technical: { state: "LIVE", detail: "ok" },
      security: { state: "LIVE", detail: "ok" },
    },
    product: over.product || { dau: 10, wau: 30, mau: 60, stickiness: 17, returnRate7: 42 },
    counts: over.counts || { openAlerts: 0, openIncidents: 0, p0p1: 0 },
    risks: over.risks || [],
  };
}

test("sans référence, le cockpit dit explicitement que la comparaison est impossible", () => {
  const r = compareSnapshots(snap(), null);
  assert.equal(r.comparable, false);
  assert.deepEqual(r.changes, []);
  assert.match(r.reason, /référence/i);
});

test("une dégradation technique est un changement matériel, pas une variation produit", () => {
  const before = snap();
  const now = snap({
    at: "2026-08-18T12:05:00.000Z",
    domains: {
      ...before.domains,
      technical: { state: "UNAVAILABLE", detail: "AUTHZ rouge" },
    },
  });
  const r = compareSnapshots(now, before);
  assert.equal(r.comparable, true);
  assert.ok(r.changes.some((c) => c.type === "domain_state" && c.key === "technical" && c.before === "LIVE" && c.now === "UNAVAILABLE"));
});

test("les KPI ne produisent un delta que quand deux nombres réels sont comparables", () => {
  const before = snap({ product: { dau: 10, wau: 30, mau: 60, stickiness: null, returnRate7: 42 } });
  const now = snap({ at: "2026-08-18T12:05:00.000Z", product: { dau: 12, wau: 30, mau: 60, stickiness: null, returnRate7: 40 } });
  const r = compareSnapshots(now, before);
  const dau = r.changes.find((c) => c.type === "product_metric" && c.key === "dau");
  assert.equal(dau.delta, 2);
  assert.equal(r.changes.some((c) => c.key === "stickiness"), false, "UNKNOWN ne devient jamais un faux delta");
});

test("ouverture et résolution de risque sont distinguées", () => {
  const before = snap({ risks: [{ key: "domain:release", priority: "P2", title: "Release incomplète" }] });
  const now = snap({
    at: "2026-08-18T12:05:00.000Z",
    risks: [{ key: "incident:42", priority: "P0", title: "Incident critique" }],
  });
  const r = compareSnapshots(now, before);
  assert.ok(r.changes.some((c) => c.type === "risk_opened" && c.key === "incident:42"));
  assert.ok(r.changes.some((c) => c.type === "risk_cleared" && c.key === "domain:release"));
});
