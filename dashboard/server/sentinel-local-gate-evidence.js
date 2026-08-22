// SENTINEL LOCAL GATE EVIDENCE — adaptateur READ-ONLY entre preuves live et policy pure.
//
// Cette couche ne déclenche AUCUNE promotion. Elle assemble Guardian courant,
// inventaire d'incidents prouvé et preuve causale déjà scellée par le bootstrap.
// Elle n'importe jamais `sentinel.js`, ce qui évite un cycle ESM avec Autopilot.
import { releaseGuardianSnapshot } from "./release-guardian.js";
import { incidentInventorySnapshot } from "./sentinel-incident-inventory.js";
import { evaluateLocalPromotionEvidence } from "./sentinel-local-promotion-evidence.js";

export function evaluateLocalGateEvidence(repair = {}, {
  guardian = null,
  inventory = null,
  now = Date.now(),
  maxGuardianAgeMs = undefined,
} = {}) {
  const g = guardian || releaseGuardianSnapshot();
  const inv = inventory || incidentInventorySnapshot();
  const diagnosisEvidence = repair?.diagnosisEvidence || null;

  const decision = evaluateLocalPromotionEvidence({
    guardian: g,
    incidents: inv?.incidents || [],
    incidentsComplete: inv?.complete === true,
    diagnosisEvidence,
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
      sealedDiagnosisEvidence: Boolean(diagnosisEvidence),
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
