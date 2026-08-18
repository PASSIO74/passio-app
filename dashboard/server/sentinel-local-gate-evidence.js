// SENTINEL LOCAL GATE EVIDENCE — adaptateur READ-ONLY entre preuves live et policy pure.
//
// Cette couche ne déclenche AUCUNE promotion. Elle assemble seulement :
// - Release Guardian courant ;
// - inventaire d'incidents prouvé ;
// - identité causale portée par la réparation vérifiée ;
// puis appelle evaluateLocalPromotionGate() (#12).
import { releaseGuardianSnapshot } from "./release-guardian.js";
import { incidentInventorySnapshot } from "./sentinel-incident-inventory.js";
import { evaluateLocalPromotionGate } from "./sentinel-local-promotion-gate.js";

export function evaluateLocalGateEvidence(repair = {}, {
  guardian = null,
  inventory = null,
} = {}) {
  const g = guardian || releaseGuardianSnapshot();
  const inv = inventory || incidentInventorySnapshot();
  const causalIncidentId = repair?.incidentId || null;

  const decision = evaluateLocalPromotionGate({
    guardian: g,
    incidents: inv?.incidents || [],
    incidentsComplete: inv?.complete === true,
    causalIncidentId,
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
      causalIncidentId,
      incidentClusterKey: repair?.incidentClusterKey || null,
      diagnosisId: repair?.diagnosisId || null,
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
