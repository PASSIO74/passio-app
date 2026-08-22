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

export function promotionJournalDocumentHealth(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { available: false, reason: "journal_invalid_schema" };
  }
  if (!Array.isArray(stored.entries)) {
    return { available: false, reason: "journal_invalid_schema" };
  }
  return { available: true, reason: null };
}

function journalHealth() {
  const load = db.health();
  if (load.available !== true) return { available: false, reason: "journal_unavailable" };
  return promotionJournalDocumentHealth(db.get());
}

// Whitelist the persisted/read schema in one place. This is intentionally also used
// on READ so rows produced by an older prototype cannot re-expose removed fields.
export function sanitizePromotionEntry(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    at: text(source.at, 64),
    incidentId: text(source.incidentId, 160),
    diagnosisId: text(source.diagnosisId, 160),
    repairBranch: text(source.repairBranch, 240),
    repairSha: text(source.repairSha, 64),
    beforeSha: text(source.beforeSha, 64),
    afterSha: text(source.afterSha, 64),
    status: text(source.status, 80),
    ok: source.ok === true,
    attempted: source.attempted === true,
    rolledBack: source.rolledBack === true,
    reason: text(source.reason, 240),
    suites: (Array.isArray(source.suites) ? source.suites : []).slice(0, 20).map((suite) => ({
      suite: text(suite?.suite, 100),
      ok: suite?.ok === true,
    })),
    guardianObservedAt: text(source.guardianObservedAt, 64),
    guardianAgeMs: finite(source.guardianAgeMs),
    durationMs: finite(source.durationMs),
  };
}

export function recordPromotionTransaction(input = {}) {
  const health = journalHealth();
  if (health.available !== true) {
    const error = new Error(health.reason);
    error.code = "SENTINEL_PROMOTION_JOURNAL_UNAVAILABLE";
    throw error;
  }

  const entry = sanitizePromotionEntry({
    ...input,
    at: new Date().toISOString(),
  });

  db.update((data) => {
    data.entries.unshift(entry);
    if (data.entries.length > KEEP) data.entries.length = KEEP;
  });
  return entry;
}

export function promotionJournalSnapshot(limit = 50) {
  const health = journalHealth();
  if (health.available !== true) {
    return {
      available: false,
      reason: health.reason,
      productionDeploy: false,
      runtimeActivation: false,
      retentionLimit: KEEP,
      count: 0,
      latest: null,
      entries: [],
    };
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const stored = db.get();
  const entries = stored.entries.slice(0, safeLimit).map((entry) => sanitizePromotionEntry(entry));
  return {
    available: true,
    reason: null,
    productionDeploy: false,
    runtimeActivation: false,
    retentionLimit: KEEP,
    count: entries.length,
    latest: entries[0] || null,
    entries,
  };
}
