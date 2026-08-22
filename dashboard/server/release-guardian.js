// RELEASE GUARDIAN — GO / NO_GO fondé uniquement sur des preuves observables.
// Aucun agent IA n'est requis pour cette décision. Un manque de preuve critique
// ne devient jamais implicitement vert : il bloque jusqu'à instrumentation.
import { store } from "./store.js";
import * as checklist from "./checklist.js";
import * as tests from "./tests.js";
import { computeReadiness } from "./readiness.js";
import { observationSnapshot } from "./observation.js";
import { releaseHealth } from "./release-recorder.js";
import { listIncidentPackets } from "./incident-packets.js";
import { anomalySnapshot } from "./anomaly-engine.js";

const AUTHZ_MAX_AGE_MIN = Number(process.env.DASH_GUARDIAN_AUTHZ_MAX_AGE_MIN || 30);

export function evaluateReleaseGates(input) {
  const authz = input.authz || null;
  const observation = input.observation || null;
  const release = input.release || null;
  const readiness = input.readiness || null;
  const incidents = input.incidents || [];
  const anomalies = input.anomalies || null;
  const domains = readiness?.domaines || [];
  const journey = domains.find((d) => d.cle === "parcours_critiques");
  const criticalOpen = incidents.filter((i) => i.status !== "closed" && (i.severity === "critical" || i.severity === "high"));

  const gates = [
    {
      key: "authorization",
      required: true,
      pass: Boolean(authz && authz.total > 0 && authz.pass === authz.total && authz.ageMinutes <= AUTHZ_MAX_AGE_MIN && authz.code === 0),
      state: !authz ? "UNKNOWN" : authz.pass !== authz.total || authz.code !== 0 ? "FAIL" : authz.ageMinutes > AUTHZ_MAX_AGE_MIN ? "STALE" : "PASS",
      detail: !authz ? "AUTHZ-CRITICAL jamais exécuté dans cette session" : `${authz.pass}/${authz.total} · âge ${authz.ageMinutes} min · code ${authz.code}`,
    },
    {
      key: "observation",
      required: true,
      pass: observation?.state === "LIVE",
      state: observation?.state === "LIVE" ? "PASS" : observation ? "FAIL" : "UNKNOWN",
      detail: observation ? observation.state : "aucune preuve DB/SSE/canari",
    },
    {
      key: "critical_journeys",
      required: true,
      pass: journey?.etat === "vert",
      state: !journey || journey.etat === "inconnu" ? "UNKNOWN" : journey.etat === "vert" ? "PASS" : "FAIL",
      detail: journey?.detail || "parcours critiques non mesurés",
    },
    {
      key: "release_chain",
      required: true,
      pass: release?.state === "LIVE",
      state: release?.state === "LIVE" ? "PASS" : release?.state === "DEGRADED" ? "FAIL" : "UNKNOWN",
      detail: release?.detail || "commit → deploy → app → DB non prouvé",
    },
    {
      key: "critical_incidents",
      required: true,
      pass: criticalOpen.length === 0,
      state: criticalOpen.length ? "FAIL" : "PASS",
      detail: criticalOpen.length ? `${criticalOpen.length} incident(s) critical/high encore ouverts` : "aucun incident critical/high ouvert",
    },
    {
      key: "anomalies",
      required: true,
      pass: anomalies?.state === "BASELINE",
      state: anomalies?.state === "ANOMALY" ? "FAIL" : anomalies?.state === "BASELINE" ? "PASS" : "UNKNOWN",
      detail: anomalies?.detail || "baseline non mesurée",
    },
  ];

  const blockers = gates.filter((g) => g.required && !g.pass);
  const unknown = blockers.filter((g) => g.state === "UNKNOWN" || g.state === "STALE").length;
  return {
    decision: blockers.length === 0 ? "GO" : "NO_GO",
    confidence: blockers.length === 0 ? "high" : unknown ? "partial" : "high",
    rule: "tous les gates critiques doivent être PASS ; UNKNOWN/STALE bloque",
    gates,
    blockers: blockers.map((g) => g.key),
  };
}

export function releaseGuardianSnapshot() {
  const authz = tests.authzSnapshot();
  const observation = observationSnapshot();
  const release = releaseHealth();
  const readiness = computeReadiness({
    overview: store.overview(),
    checklist: checklist.listChecklist(),
    bugs: store.bugList(),
    authz,
    observation,
    release,
  });
  const incidents = listIncidentPackets(200);
  const anomalies = anomalySnapshot();
  return {
    generatedAt: new Date().toISOString(),
    ...evaluateReleaseGates({ authz, observation, release, readiness, incidents, anomalies }),
    evidence: { authz, observation, release, readiness: { statut: readiness.statut, confiance: readiness.confiance }, anomalies },
  };
}
