// SENTINEL LOCAL PROMOTION GATE — policy pure, NON activée.
//
// Objectif: distinguer la sécurité d'une promotion LOCALE réversible de la
// décision de release production. Le Release Guardian complet reste inchangé et
// continue de bloquer production tant que TOUS ses gates ne sont pas PASS.
//
// Cette fonction n'effectue aucune mutation et n'est pas branchée dans Autopilot.
// Elle formalise seulement les preuves minimales nécessaires pour une future
// décision locale, afin de pouvoir la relire/tester indépendamment avant usage.

const REQUIRED_GUARDIAN_GATES = ["authorization", "observation", "critical_journeys", "anomalies"];

function gateByKey(guardian, key) {
  return (guardian?.gates || []).find((g) => g.key === key) || null;
}

function isCriticalOpen(incident) {
  return incident && incident.status !== "closed"
    && (incident.severity === "critical" || incident.severity === "high");
}

export function evaluateLocalPromotionGate({ guardian = null, incidents = [], causalIncidentId = null } = {}) {
  const blockers = [];
  const evidence = {};

  for (const key of REQUIRED_GUARDIAN_GATES) {
    const gate = gateByKey(guardian, key);
    evidence[key] = gate ? { state: gate.state, pass: gate.pass === true, detail: gate.detail || null } : null;
    if (!gate) blockers.push(`missing_gate:${key}`);
    else if (gate.pass !== true) blockers.push(`gate:${key}:${gate.state || "UNKNOWN"}`);
  }

  const openCritical = (incidents || []).filter(isCriticalOpen);
  const causal = causalIncidentId
    ? openCritical.find((i) => i.id === causalIncidentId) || null
    : null;

  if (!causalIncidentId) blockers.push("causal_incident_missing");
  else if (!causal) blockers.push("causal_incident_not_open_critical");

  const unrelatedCritical = causalIncidentId
    ? openCritical.filter((i) => i.id !== causalIncidentId)
    : openCritical;
  if (unrelatedCritical.length) blockers.push("unrelated_critical_incidents");

  const releaseChain = gateByKey(guardian, "release_chain");
  const productionCriticalGate = gateByKey(guardian, "critical_incidents");

  return {
    decision: blockers.length ? "HOLD" : "GO_LOCAL",
    blockers,
    causalIncidentId: causal?.id || causalIncidentId || null,
    unrelatedCriticalIncidentIds: unrelatedCritical.map((i) => i.id),
    evidence,
    policy: {
      productionDeploy: false,
      runtimeActivated: false,
      ignoredForLocalOnly: ["release_chain", "critical_incidents:causal_only"],
      releaseChainState: releaseChain?.state || "UNKNOWN",
      productionCriticalIncidentState: productionCriticalGate?.state || "UNKNOWN",
      fullProductionGuardianDecision: guardian?.decision || "UNKNOWN",
    },
  };
}
