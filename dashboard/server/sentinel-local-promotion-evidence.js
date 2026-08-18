// SENTINEL LOCAL PROMOTION EVIDENCE — fail-closed freshness + causal binding.
//
// Cette couche reste pure et NON activée. Elle prépare le futur câblage runtime
// en exigeant que la policy locale soit évaluée à partir d'un snapshot Guardian
// récent, d'un ensemble d'incidents explicitement exhaustif et d'une identité
// causale exacte portée par le diagnostic de la réparation.
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

function causalIdentity(diagnosis = {}) {
  return diagnosis?.meta?.incidentId || diagnosis?.incidentId || null;
}

export function evaluateLocalPromotionEvidence({
  guardian = null,
  guardianObservedAt = null,
  incidents = [],
  incidentsComplete = false,
  diagnosis = null,
  repair = null,
  now = Date.now(),
  maxGuardianAgeMs = DEFAULT_MAX_GUARDIAN_AGE_MS,
} = {}) {
  const blockers = [];
  const observedAt = finiteTimestamp(guardianObservedAt ?? guardian?.observedAt ?? guardian?.at ?? guardian?.generatedAt);
  const ageMs = observedAt === null ? null : Math.max(0, now - observedAt);

  if (observedAt === null) blockers.push("guardian_timestamp_missing");
  else if (observedAt > now) blockers.push("guardian_timestamp_future");
  else if (ageMs > maxGuardianAgeMs) blockers.push("guardian_snapshot_stale");

  const incidentId = causalIdentity(diagnosis || {});
  if (!diagnosis?.id) blockers.push("diagnosis_identity_missing");
  if (!incidentId) blockers.push("diagnosis_causal_incident_missing");

  if (repair?.diagnosisId && diagnosis?.id && repair.diagnosisId !== diagnosis.id) {
    blockers.push("repair_diagnosis_mismatch");
  }
  if (repair?.causalIncidentId && incidentId && repair.causalIncidentId !== incidentId) {
    blockers.push("repair_causal_incident_mismatch");
  }

  const localGate = evaluateLocalPromotionGate({
    guardian,
    incidents,
    incidentsComplete,
    causalIncidentId: incidentId,
  });
  blockers.push(...localGate.blockers);

  return {
    decision: blockers.length ? "HOLD" : "GO_LOCAL",
    blockers: [...new Set(blockers)],
    causalIncidentId: incidentId,
    diagnosisId: diagnosis?.id || null,
    guardianObservedAt: observedAt,
    guardianAgeMs: ageMs,
    maxGuardianAgeMs,
    localGate,
    policy: {
      productionDeploy: false,
      runtimeActivated: false,
      requiresFreshGuardian: true,
      requiresCompleteIncidentSet: true,
      requiresExactCausalIdentity: true,
    },
  };
}
