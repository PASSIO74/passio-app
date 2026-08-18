// SENTINEL PROMOTION JOURNAL — bounded operational evidence for local promotions.
// This module is observation-only: it never authorizes a mutation or production deploy.
import { JsonDb } from "./jsondb.js";

const db = new JsonDb("sentinel-promotion-journal", { entries: [] });

function clampKeep(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 200;
  return Math.max(20, Math.min(Math.trunc(n), 1000));
}

const KEEP = clampKeep(process.env.DASH_AUTOPILOT_JOURNAL_KEEP);

function text(value, max) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, max);
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

export function recordPromotionTransaction(input = {}) {
  const entry = {
    at: new Date().toISOString(),
    incidentId: text(input.incidentId, 160),
    diagnosisId: text(input.diagnosisId, 160),
    repairBranch: text(input.repairBranch, 240),
    repairSha: text(input.repairSha, 64),
    beforeSha: text(input.beforeSha, 64),
    afterSha: text(input.afterSha, 64),
    status: text(input.status, 80),
    ok: input.ok === true,
    attempted: input.attempted === true,
    rolledBack: input.rolledBack === true,
    reason: text(input.reason, 240),
    suites: (Array.isArray(input.suites) ? input.suites : []).slice(0, 20).map((suite) => ({
      suite: text(suite?.suite, 100),
      ok: suite?.ok === true,
    })),
    guardianObservedAt: text(input.guardianObservedAt, 64),
    guardianAgeMs: finite(input.guardianAgeMs),
    durationMs: finite(input.durationMs),
  };

  db.update((data) => {
    data.entries = Array.isArray(data.entries) ? data.entries : [];
    data.entries.unshift(entry);
    if (data.entries.length > KEEP) data.entries.length = KEEP;
  });
  return entry;
}

export function promotionJournalSnapshot(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const entries = (db.get().entries || []).slice(0, safeLimit);
  return {
    productionDeploy: false,
    runtimeActivation: false,
    retentionLimit: KEEP,
    count: entries.length,
    latest: entries[0] || null,
    entries,
  };
}
