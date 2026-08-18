// SENTINEL LEARNING — mémoire opérationnelle déterministe des réparations.
// Apprend des résultats sans modifier silencieusement les gates de sécurité.
import { JsonDb } from "./jsondb.js";

const db = new JsonDb("sentinel-learning", { patterns: {}, outcomes: [] });
const KEEP = Number(process.env.DASH_SENTINEL_LEARNING_KEEP || 500);
const MAX_FAILS_BEFORE_QUARANTINE = Number(process.env.DASH_SENTINEL_QUARANTINE_FAILS || 2);

export function repairPatternKey(input = {}) {
  if (input.patternKey) return String(input.patternKey).slice(0, 421);
  const signal = input.key || input.signal?.key || input.title || "unknown";
  const files = (input.files || input.repair?.files || []).slice().sort().join(",");
  return String(signal).slice(0, 180) + "|" + files.slice(0, 240);
}

function freshPattern(key) {
  return {
    key,
    attempts: 0,
    verifiedSuccesses: 0,
    failures: 0,
    recurrences: 0,
    quarantined: false,
    lastOutcomeAt: null,
    lastFailureReason: null,
    lastRecurrenceAt: null,
    lastRecurrenceReason: null,
  };
}

function applyQuarantine(pattern) {
  pattern.quarantined = pattern.failures >= MAX_FAILS_BEFORE_QUARANTINE
    || pattern.recurrences >= MAX_FAILS_BEFORE_QUARANTINE;
  return pattern;
}

export function recordRepairOutcome(input = {}) {
  const key = repairPatternKey(input);
  const ok = Boolean(input.ok);
  const now = new Date().toISOString();
  let pattern;
  db.update((d) => {
    pattern = d.patterns[key] || freshPattern(key);
    pattern.attempts++;
    if (ok) pattern.verifiedSuccesses++;
    else {
      pattern.failures++;
      pattern.lastFailureReason = String(input.reason || input.raison || "unknown").slice(0, 500);
    }
    if (input.recurrence) {
      pattern.recurrences++;
      pattern.lastRecurrenceAt = now;
      pattern.lastRecurrenceReason = String(input.reason || input.raison || "same_signal_returned").slice(0, 500);
    }
    applyQuarantine(pattern);
    pattern.lastOutcomeAt = now;
    d.patterns[key] = pattern;
    d.outcomes.unshift({
      at: now,
      type: "repair_outcome",
      key,
      ok,
      recurrence: Boolean(input.recurrence),
      branch: input.branch || null,
      sha: input.sha || null,
      files: (input.files || []).slice(0, 8),
      reason: String(input.reason || input.raison || "").slice(0, 500),
    });
    if (d.outcomes.length > KEEP) d.outcomes.length = KEEP;
  });
  return pattern;
}

// Une récidive est un fait post-promotion, pas une nouvelle tentative de repair.
// Elle ne doit donc incrémenter ni attempts, ni successes, ni failures.
export function recordRepairRecurrence(input = {}) {
  const key = repairPatternKey(input);
  const now = new Date().toISOString();
  let pattern;
  db.update((d) => {
    pattern = d.patterns[key] || freshPattern(key);
    pattern.recurrences++;
    pattern.lastRecurrenceAt = now;
    pattern.lastRecurrenceReason = String(input.reason || "same_signal_returned_after_promotion").slice(0, 500);
    pattern.lastOutcomeAt = now;
    applyQuarantine(pattern);
    d.patterns[key] = pattern;
    d.outcomes.unshift({
      at: now,
      type: "recurrence",
      key,
      ok: false,
      recurrence: true,
      signalKey: input.signalKey || null,
      alertId: input.alertId || null,
      branch: input.branch || null,
      sha: input.sha || null,
      files: [],
      reason: pattern.lastRecurrenceReason,
      quarantined: pattern.quarantined,
    });
    if (d.outcomes.length > KEEP) d.outcomes.length = KEEP;
  });
  return pattern;
}

export function learningDecision(input = {}) {
  const key = repairPatternKey(input);
  const p = db.get().patterns[key] || null;
  if (!p) return { key, allowAutoPromotion: true, confidence: "new", reason: "aucun historique défavorable" };
  if (p.quarantined) return { key, allowAutoPromotion: false, confidence: "high", reason: "pattern en quarantaine après échecs/récidives", pattern: p };
  if (p.failures > p.verifiedSuccesses) return { key, allowAutoPromotion: false, confidence: "medium", reason: "historique de réparation défavorable", pattern: p };
  return { key, allowAutoPromotion: true, confidence: p.verifiedSuccesses >= 2 ? "high" : "medium", reason: "historique compatible avec une promotion contrôlée", pattern: p };
}

export function learningSnapshot() {
  const d = db.get();
  const patterns = Object.values(d.patterns || {});
  return {
    patterns: patterns.length,
    quarantined: patterns.filter((p) => p.quarantined).length,
    recurrencePatterns: patterns.filter((p) => p.recurrences > 0).length,
    recent: (d.outcomes || []).slice(0, 50),
  };
}
