// SENTINEL INCIDENT INVENTORY — preuve fail-closed de l'ensemble d'incidents.
//
// La policy locale (#12) ne doit jamais recevoir `incidentsComplete:true` sur la
// seule foi d'un tableau partiel. Le stockage Incident Packet historique est
// borné à 200 entrées ; cette couche refuse donc d'inventer l'exhaustivité.
//
// IMPORTANT : ce module ne modifie ni la rétention, ni Autopilot, ni le Guardian.
import { listIncidentPackets } from "./incident-packets.js";

const INVENTORY_LIMIT = Number(process.env.DASH_INCIDENT_KEEP || 200);

function isCriticalOpen(incident) {
  return incident && incident.status !== "closed"
    && (incident.severity === "critical" || incident.severity === "high");
}

export function evaluateIncidentInventory(items = [], { limit = INVENTORY_LIMIT, historicalCompleteness = false } = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const saturated = safeItems.length >= limit;
  const openCritical = safeItems.filter(isCriticalOpen);
  const blockers = [];

  if (!historicalCompleteness) blockers.push("historical_completeness_unproven");
  if (saturated) blockers.push("retention_window_saturated");

  return {
    complete: blockers.length === 0,
    blockers,
    limit,
    count: safeItems.length,
    saturated,
    historicalCompleteness: historicalCompleteness === true,
    incidents: safeItems,
    openCritical,
    openCriticalIds: openCritical.map((i) => i.id),
    policy: {
      failClosed: true,
      noCompletenessFromTruncatedWindow: true,
    },
  };
}

export function incidentInventorySnapshot({ historicalCompleteness = false } = {}) {
  const items = listIncidentPackets(INVENTORY_LIMIT);
  return evaluateIncidentInventory(items, { limit: INVENTORY_LIMIT, historicalCompleteness });
}
