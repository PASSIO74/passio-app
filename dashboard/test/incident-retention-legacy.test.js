import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const TMP = path.join(process.cwd(), "test", ".tmp-data-incident-retention-legacy");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, "incident-packets.json"), JSON.stringify({ items: [] }, null, 2));
process.env.DASH_DATA_DIR = TMP;

const { recordIncident, incidentRetentionSnapshot } = await import("../server/incident-packets.js");

test("legacy registry without retention metadata never becomes trusted implicitly", () => {
  recordIncident({
    id: "al_legacy_probe",
    ts: Date.now(),
    key: "legacy-probe",
    level: "warn",
    title: "legacy probe",
    message: "legacy probe",
    meta: {},
  });
  const proof = incidentRetentionSnapshot();
  assert.equal(proof.historyTrusted, false);
  assert.equal(proof.legacyUnproven, true);
  assert.equal(proof.complete, false);
  assert.equal(proof.reason, "historical_completeness_unproven");
});
