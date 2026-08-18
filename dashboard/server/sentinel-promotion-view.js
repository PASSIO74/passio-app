// SENTINEL PROMOTION VIEW — projection lecture seule pour API/UI.
// Ne déclenche aucune décision, mutation git ou activation runtime.
import { promotionJournalSnapshot } from "./sentinel-promotion-journal.js";
import { autopilotLockSnapshot } from "./sentinel-autopilot-lock.js";

export function promotionStatusView(limit = 20) {
  const journal = promotionJournalSnapshot(limit);
  const latest = journal.latest;
  return {
    state: latest?.status || "NO_ATTEMPT",
    reason: latest?.reason || null,
    incidentId: latest?.incidentId || null,
    diagnosisId: latest?.diagnosisId || null,
    beforeSha: latest?.beforeSha || null,
    afterSha: latest?.afterSha || null,
    rolledBack: latest?.rolledBack === true,
    guardianAgeMs: latest?.guardianAgeMs ?? null,
    suites: latest?.suites || [],
    lock: autopilotLockSnapshot(),
    history: journal.entries,
    policy: {
      productionDeploy: false,
      runtimeActivation: false,
      readOnly: true,
    },
  };
}
