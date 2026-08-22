import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const TMP = path.join(process.cwd(), "test", ".tmp-data-sentinel-causal-trace");
process.env.DASH_DATA_DIR = TMP;
fs.rmSync(TMP, { recursive: true, force: true });

const alerts = await import("../server/alerts.js");
const sentinel = await import("../server/sentinel.js");

sentinel._setAvailability(() => true);
sentinel._settings.minGapMs = 0;

async function settle(ms = 800) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = sentinel.sentinelState();
    if (!st.running && !st.queued && !st.repairing) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Sentinel did not settle in time");
}

test("alert emission exposes one deterministic causal incident identity to subscribers", () => {
  const rec = alerts.raiseManual({
    level: "high",
    title: "Causal trace probe " + Date.now(),
    message: "probe",
  });

  assert.ok(rec.incidentId, "alert must expose its Incident Packet id");
  assert.equal(rec.meta.incidentId, rec.incidentId);
  assert.equal(rec.meta.incidentClusterKey, rec.incident.clusterKey);
});

test("Sentinel persists causal incident identity and gives it unchanged to the repairer", async () => {
  sentinel._reset();
  sentinel._setAnalyzer(async () => ({
    analysis: "## En clair\nDéfaut reproduit.\n## Verdict\nDÉFAUT RÉEL\n",
    via: "test",
  }));

  let repairedRecord = null;
  sentinel._setRepairer(async (record) => {
    repairedRecord = record;
    return { attempted: true, ok: false, raison: "test spy" };
  });

  const incidentId = "inc_exact_causal_123";
  const clusterKey = "trace:failed:send@abcdef123456";
  sentinel.consider({
    id: "al_causal_123",
    ts: Date.now(),
    level: "critical",
    title: "Causal incident",
    message: "send failed",
    key: "causal:" + Date.now(),
    meta: { incidentId, incidentClusterKey: clusterKey },
  });

  await settle();

  const diagnosis = sentinel.listDiagnoses()[0];
  assert.ok(diagnosis);
  assert.equal(diagnosis.meta.incidentId, incidentId);
  assert.equal(diagnosis.meta.incidentClusterKey, clusterKey);
  assert.ok(repairedRecord, "verified defect must reach the repairer spy");
  assert.equal(repairedRecord.meta.incidentId, incidentId);
  assert.equal(repairedRecord.meta.incidentClusterKey, clusterKey);
});
