// SENTINEL LOCAL GATE EVIDENCE — adaptateur READ-ONLY entre preuves live et policy pure.
//
// Cette couche ne déclenche AUCUNE promotion. Elle assemble : Guardian courant,
// inventaire d'incidents prouvé, diagnostic persistant canonique et réparation
// vérifiée, puis délègue à la policy de fraîcheur/causalité.
import { releaseGuardianSnapshot } from "./release-guardian.js";
import { incidentInventorySnapshot } from "./sentinel-incident-inventory.js";
import { getDiagnosis } from "./sentinel.js";
import { evaluateLocalPromotionEvidence } from "./sentinel-local-promotion-evidence.js";

export function evaluateLocalGateEvidence(repair = {}, {
  guardian = null,
  inventory = null,
  diagnosis = undefined,
  now = Date.now(),
  maxGuardianAgeMs = undefined,
} = {}) {
  const g = guardian || releaseGuardianSnapshot();
  const inv = inventory || incidentInventorySnapshot();
  const canonicalDiagnosis = diagnosis === undefined
    ? (repair?.diagnosisId ? getDiagnosis(repair.diagnosisId) : null)
    : diagnosis;

  const decision = evaluateLocalPromotionEvidence({
    guardian: g,
    incidents: inv?.incidents || [],
    incidentsComplete: inv?.complete === true,
    diagnosis: canonicalDiagnosis,
    repair,
    now,
    ...(maxGuardianAgeMs === undefined ? {} : { maxGuardianAgeMs }),
  });

  return {
    ...decision,
    evidence: {
      guardianGeneratedAt: g?.generatedAt || null,
      guardianDecision: g?.decision || "UNKNOWN",
      inventoryComplete: inv?.complete === true,
      inventoryBlockers: inv?.blockers || [],
      inventoryCount: Number(inv?.count || 0),
      inventoryExpectedStored: inv?.expectedStored ?? null,
      causalIncidentId: decision?.causalIncidentId || null,
      repairIncidentId: repair?.incidentId || null,
      incidentClusterKey: repair?.incidentClusterKey || null,
      diagnosisId: repair?.diagnosisId || null,
      canonicalDiagnosisFound: Boolean(canonicalDiagnosis),
      repairBranch: repair?.branch || null,
      repairSha: repair?.sha || null,
    },
    policy: {
      ...decision.policy,
      adapterReadOnly: true,
      runtimeActivated: false,
      productionDeploy: false,
    },
  };
}

export function localGateEvidenceSnapshot(repair = {}) {
  return evaluateLocalGateEvidence(repair);
}
