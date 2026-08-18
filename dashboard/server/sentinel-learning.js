// SENTINEL LEARNING — mémoire opérationnelle déterministe des réparations.
// Apprend des résultats sans modifier silencieusement les gates de sécurité.
import { JsonDb } from "./jsondb.js";

const db = new JsonDb("sentinel-learning", { patterns: {}, outcomes: [] });
const KEEP = Number(process.env.DASH_SENTINEL_LEARNING_KEEP || 500);
const MAX_FAILS_BEFORE_QUARANTINE = Number(process.env.DASH_SENTINEL_QUARANTINE_FAILS || 2);

function keyOf(input = {}) {
  const signal = input.key || input.signal?.key || input.title || "unknown";
  const files = (input.files || input.repair?.files || []).slice().sort().join(",");
  return String(signal).slice(0, 180) + "|" + files.slice(0, 240);
}

export function recordRepairOutcome(input = {}) {
  const key = keyOf(input);
  const ok = Boolean(input.ok);
  const now = new Date().toISOString();
  let pattern;
  db.update((d) => {
    pattern = d.patterns[key] || {
      key,
      attempts: 0,
      verifiedSuccesses: 0,
      failures: 0,
      recurrences: 0,
      quarantined: false,
      lastOutcomeAt: null,
      lastFailureReason: null,
    };
    pattern.attempts++;
    if (ok) pattern.verifiedSuccesses++;
    else {
      pattern.failures++;
      pattern.lastFailureReason = String(input.reason || input.raison || "unknown").slice(0, 500);
    }
    if (input.recurrence) pattern.recurrences++;
    pattern.quarantined = pattern.failures >= MAX_FAILS_BEFORE_QUARANTINE || pattern.recurrences >= MAX_FAILS_BEFORE_QUARANTINE;
    pattern.lastOutcomeAt = now;
    d.patterns[key] = pattern;
    d.outcomes.unshift({
      at: now,
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

export function learningDecision(input = {}) {
  const key = keyOf(input);
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
    recent: (d.outcomes || []).slice(0, 50),
  };
}
