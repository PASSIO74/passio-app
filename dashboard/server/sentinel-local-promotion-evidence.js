// SENTINEL LOCAL PROMOTION EVIDENCE — fraîcheur + liaison causale canonique.
//
// Couche pure et NON mutante. Elle exige un Guardian récent, un diagnostic
// persistant canonique et une identité incident identique dans repair + diagnostic
// avant de déléguer à la policy locale fail-closed.
import { evaluateLocalPromotionGate } from "./sentinel-local-promotion-gate.js";

const DEFAULT_MAX_GUARDIAN_AGE_MS = Number(process.env.DASH_AUTOPILOT_GUARDIAN_MAX_AGE_MS || 5 * 60_000);

function finiteTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function diagnosisIncidentId(diagnosis = {}) {
  return diagnosis?.meta?.incidentId || diagnosis?.incidentId || null;
}

export function evaluateLocalPromotionEvidence({
  guardian = null,
  incidents = [],
  incidentsComplete = false,
  diagnosis = null,
  repair = null,
  now = Date.now(),
  maxGuardianAgeMs = DEFAULT_MAX_GUARDIAN_AGE_MS,
} = {}) {
  const blockers = [];
  const observedAt = finiteTimestamp(guardian?.generatedAt ?? guardian?.observedAt ?? guardian?.at);
  const ageMs = observedAt === null ? null : now - observedAt;

  if (observedAt === null) blockers.push("guardian_timestamp_missing");
  else if (observedAt > now) blockers.push("guardian_timestamp_future");
  else if (ageMs > maxGuardianAgeMs) blockers.push("guardian_snapshot_stale");

  const canonicalIncidentId = diagnosisIncidentId(diagnosis || {});
  if (!diagnosis?.id) blockers.push("diagnosis_identity_missing");
  if (!canonicalIncidentId) blockers.push("diagnosis_causal_incident_missing");

  if (!repair?.diagnosisId) blockers.push("repair_diagnosis_identity_missing");
  else if (diagnosis?.id && repair.diagnosisId !== diagnosis.id) blockers.push("repair_diagnosis_mismatch");

  // Champ canonique de la chaîne #15 : repair.incidentId.
  if (!repair?.incidentId) blockers.push("repair_causal_incident_missing");
  else if (canonicalIncidentId && repair.incidentId !== canonicalIncidentId) blockers.push("repair_causal_incident_mismatch");

  const localGate = evaluateLocalPromotionGate({
    guardian,
    incidents,
    incidentsComplete,
    causalIncidentId: canonicalIncidentId,
  });
  blockers.push(...localGate.blockers);

  return {
    decision: blockers.length ? "HOLD" : "GO_LOCAL",
    blockers: [...new Set(blockers)],
    causalIncidentId: canonicalIncidentId,
    diagnosisId: diagnosis?.id || null,
    guardianObservedAt: observedAt,
    guardianAgeMs: ageMs,
    maxGuardianAgeMs,
    localGate,
    policy: {
      productionDeploy: false,
      runtimeActivated: false,
      requiresFreshGuardian: true,
      requiresCanonicalDiagnosis: true,
      requiresCompleteIncidentSet: true,
      requiresExactCausalIdentity: true,
    },
  };
}
