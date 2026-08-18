// SENTINEL INCIDENT INVENTORY — preuve fail-closed de l'ensemble d'incidents.
//
// La policy locale (#12) ne doit jamais recevoir `incidentsComplete:true` sur la
// seule foi d'un tableau partiel. La complétude vient du registre de rétention
// lui-même ET d'une lecture de tous les éléments que ce registre dit stocker.
import { listIncidentPackets, incidentRetentionSnapshot } from "./incident-packets.js";

function isCriticalOpen(incident) {
  return incident && incident.status !== "closed"
    && (incident.severity === "critical" || incident.severity === "high");
}

export function evaluateIncidentInventory(items = [], { retention = null } = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const proof = retention || {
    complete: false,
    historyTrusted: false,
    criticalOverflow: false,
    stored: safeItems.length,
    reason: "retention_proof_missing",
  };
  const openCritical = safeItems.filter(isCriticalOpen);
  const blockers = [];
  const stored = Number.isFinite(Number(proof.stored)) ? Number(proof.stored) : null;

  if (proof.complete !== true) blockers.push(proof.reason || "retention_proof_incomplete");
  if (stored === null) blockers.push("retention_stored_count_unknown");
  else if (safeItems.length < stored) blockers.push("inventory_read_incomplete");

  return {
    complete: blockers.length === 0,
    blockers,
    count: safeItems.length,
    expectedStored: stored,
    retention: proof,
    incidents: safeItems,
    openCritical,
    openCriticalIds: openCritical.map((i) => i.id),
    policy: {
      failClosed: true,
      completenessDerivedFromRetentionProof: true,
      allStoredItemsMustBeRead: true,
    },
  };
}

export function incidentInventorySnapshot() {
  const retention = incidentRetentionSnapshot();
  // Le registre peut dépasser KEEP pour préserver des high/critical ouverts ; on
  // lit donc exactement tout ce qu'il affirme encore stocker, pas une fenêtre 200.
  const items = listIncidentPackets(Math.max(0, retention.stored || 0));
  return evaluateIncidentInventory(items, { retention });
}
