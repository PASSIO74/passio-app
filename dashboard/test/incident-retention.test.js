import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const TMP = path.join(process.cwd(), "test", ".tmp-data-incident-retention");
fs.rmSync(TMP, { recursive: true, force: true });
process.env.DASH_DATA_DIR = TMP;
process.env.DASH_INCIDENT_KEEP = "3";
process.env.DASH_INCIDENT_HARD_KEEP = "5";

const incidents = await import("../server/incident-packets.js");
const { recordIncident, listIncidentPackets, incidentRetentionSnapshot } = incidents;

function alert(key, level = "warn") {
  return {
    id: `al_${key}`,
    ts: Date.now() + Math.floor(Math.random() * 1000),
    key,
    level,
    title: key,
    message: key,
    meta: {},
  };
}

test("open critical incidents survive normal retention, and hard overflow is permanently fail-closed", () => {
  const critical = recordIncident(alert("critical-old", "critical"));
  recordIncident(alert("warn-1", "warn"));
  recordIncident(alert("warn-2", "warn"));
  recordIncident(alert("warn-3", "warn"));

  let rows = listIncidentPackets(20);
  assert.equal(rows.length, 3, "normal retention should return to KEEP");
  assert.ok(rows.some((x) => x.id === critical.id), "open critical incident must survive normal pruning");
  let proof = incidentRetentionSnapshot();
  assert.equal(proof.historyTrusted, true);
  assert.equal(proof.criticalOverflow, false);
  assert.equal(proof.complete, true);

  // Fill with protected high/critical incidents. The registry may grow beyond KEEP
  // to preserve them, but once HARD_KEEP is exceeded it must mark the loss forever.
  for (let i = 0; i < 6; i++) recordIncident(alert(`critical-${i}`, "critical"));
  rows = listIncidentPackets(20);
  proof = incidentRetentionSnapshot();
  assert.equal(rows.length, 5, "hard cap must bound retained incident packets");
  assert.equal(proof.criticalOverflow, true);
  assert.ok(proof.criticalOverflowCount >= 1);
  assert.equal(proof.complete, false);
  assert.equal(proof.reason, "critical_retention_overflow");
});
