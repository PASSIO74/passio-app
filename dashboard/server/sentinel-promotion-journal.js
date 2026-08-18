// SENTINEL PROMOTION JOURNAL — mémoire opérationnelle bornée, lecture seule côté UI.
// Aucune décision et aucune mutation git ici : ce module conserve uniquement les
// preuves d'une tentative de promotion locale pour rendre rollback/récidive auditables.
import { JsonDb } from "./jsondb.js";

const db = new JsonDb("sentinel-promotion-journal", { entries: [] });
const KEEP = Number(process.env.DASH_AUTOPILOT_JOURNAL_KEEP || 200);

function text(v, max = 500) {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, max);
}

export function recordPromotionTransaction(input = {}) {
  const entry = {
    at: new Date().toISOString(),
    incidentId: text(input.incidentId || input.causalIncidentId, 160),
    diagnosisId: text(input.diagnosisId, 160),
    repairBranch: text(input.repairBranch || input.branch, 240),
    repairSha: text(input.repairSha || input.sha, 64),
    beforeSha: text(input.beforeSha, 64),
    afterSha: text(input.afterSha, 64),
    status: text(input.status || (input.ok ? "PROMOTED_LOCAL" : "REJECTED"), 80),
    ok: input.ok === true,
    rolledBack: input.rolledBack === true,
    reason: text(input.reason, 500),
    suites: (input.suites || []).slice(0, 20).map((s) => ({
      suite: text(s.suite, 100), ok: s.ok === true, detail: text(s.detail, 800),
    })),
    guardianObservedAt: input.guardianObservedAt || null,
    guardianAgeMs: Number.isFinite(input.guardianAgeMs) ? input.guardianAgeMs : null,
  };
  db.update((d) => {
    d.entries = d.entries || [];
    d.entries.unshift(entry);
    if (d.entries.length > KEEP) d.entries.length = KEEP;
  });
  return entry;
}

export function promotionJournalSnapshot(limit = 50) {
  const entries = (db.get().entries || []).slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));
  return {
    productionDeploy: false,
    runtimeActivation: false,
    count: entries.length,
    latest: entries[0] || null,
    entries,
  };
}
