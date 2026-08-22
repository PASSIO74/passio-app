// SENTINEL PROMOTION VIEW — projection lecture seule pour API/UI.
// Ne déclenche aucune décision, mutation git ou activation runtime.
import { promotionJournalSnapshot } from "./sentinel-promotion-journal.js";
import { autopilotLockSnapshot } from "./sentinel-autopilot-lock.js";

export function promotionStatusView(limit = 20) {
  const journal = promotionJournalSnapshot(limit);
  const latest = journal.latest;
  const journalAvailable = journal.available === true;
  return {
    available: journalAvailable,
    state: journalAvailable ? (latest?.status || "NO_ATTEMPT") : "JOURNAL_UNAVAILABLE",
    reason: journalAvailable ? (latest?.reason || null) : (journal.reason || "journal_unavailable"),
    attempted: journalAvailable && latest?.attempted === true,
    incidentId: journalAvailable ? (latest?.incidentId || null) : null,
    diagnosisId: journalAvailable ? (latest?.diagnosisId || null) : null,
    beforeSha: journalAvailable ? (latest?.beforeSha || null) : null,
    afterSha: journalAvailable ? (latest?.afterSha || null) : null,
    rolledBack: journalAvailable && latest?.rolledBack === true,
    guardianAgeMs: journalAvailable ? (latest?.guardianAgeMs ?? null) : null,
    suites: journalAvailable ? (latest?.suites || []) : [],
    lock: autopilotLockSnapshot(),
    history: journalAvailable ? journal.entries : [],
    policy: {
      productionDeploy: false,
      runtimeActivation: false,
      mutation: false,
      readOnly: true,
    },
  };
}
