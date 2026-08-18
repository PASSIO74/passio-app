import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSeries } from "../server/anomaly-engine.js";
import { evaluateReleaseGates } from "../server/release-guardian.js";
import { canTransitionIncident } from "../server/incident-packets.js";
import { noteSseHeartbeat, acknowledgeSseHeartbeat, observationSnapshot } from "../server/observation.js";

function healthyInput(over = {}) {
  return {
    authz: { pass: 12, total: 12, ageMinutes: 2, code: 0 },
    observation: { state: "LIVE" },
    release: { state: "LIVE", detail: "preuves complètes" },
    readiness: { domaines: [{ cle: "parcours_critiques", etat: "vert", detail: "0 échec" }] },
    incidents: [],
    anomalies: { state: "BASELINE", detail: "aucune anomalie" },
    ...over,
  };
}

test("Release Guardian rend GO uniquement quand tous les gates critiques passent", () => {
  const r = evaluateReleaseGates(healthyInput());
  assert.equal(r.decision, "GO");
  assert.equal(r.blockers.length, 0);
  assert.ok(r.gates.every((g) => g.pass));
});

test("AUTHZ périmé bloque : une ancienne preuve verte n'est pas un GO", () => {
  const r = evaluateReleaseGates(healthyInput({ authz: { pass: 12, total: 12, ageMinutes: 90, code: 0 } }));
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.blockers.includes("authorization"));
  assert.equal(r.gates.find((g) => g.key === "authorization").state, "STALE");
});

test("baseline anomalie insuffisante bloque au lieu de fabriquer un vert", () => {
  const r = evaluateReleaseGates(healthyInput({ anomalies: { state: "INSUFFICIENT", detail: "historique court" } }));
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.blockers.includes("anomalies"));
});

test("un incident high ouvert bloque une release", () => {
  const r = evaluateReleaseGates(healthyInput({ incidents: [{ id: "inc_x", status: "open", severity: "high" }] }));
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.blockers.includes("critical_incidents"));
});

test("machine d'état incident : transitions adjacentes seulement", () => {
  assert.equal(canTransitionIncident("DETECTED", "CONFIRMED"), true);
  assert.equal(canTransitionIncident("CONFIRMED", "CORRELATED"), true);
  assert.equal(canTransitionIncident("DETECTED", "RESOLVED"), false);
  assert.equal(canTransitionIncident("VERIFIED", "RESOLVED"), true);
  assert.equal(canTransitionIncident("RESOLVED", "DETECTED"), false);
});

test("anomaly engine utilise la baseline robuste et ignore un bruit faible", () => {
  const normal = evaluateSeries(2, [1, 2, 1, 2]);
  assert.equal(normal.anomalous, false);
  const spike = evaluateSeries(15, [1, 1, 2, 1]);
  assert.equal(spike.anomalous, true);
  assert.ok(spike.threshold < spike.current);
});

test("ACK SSE navigateur est distinct du write serveur", () => {
  const id = "hb_test_" + Date.now();
  noteSseHeartbeat({ id, clients: 1 });
  const before = observationSnapshot().parts.sse;
  acknowledgeSseHeartbeat(id);
  const after = observationSnapshot().parts.sse;
  assert.equal(before.clients, 1);
  assert.equal(after.state, "LIVE");
  assert.ok(after.at, "date d'ACK navigateur enregistrée");
});
