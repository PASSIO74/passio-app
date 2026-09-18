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

// ─── D1-TM-01 : les deux assouplissements de D1 (cœur DB + canari, incidents
// < 72 h) alimentent l'autopilote (sentinel-autopilot.js lit `decision`) et
// n'avaient aucun verrou. Mutations éprouvées (chacune rougit le test nommé) :
//   · `pass: coeurObservation(observation) === "LIVE"` → `observation !== null` → « cœur : DB UNAVAILABLE »
//   · `now - vu < INCIDENT_STALE_MS` → `>=`                                     → « incident daté »
//   · `if (observation.core) return observation.core;` retiré                  → « observation.core prime »
const NOW_G = Date.parse("2026-09-18T12:00:00Z");
const H_G = 3_600_000;

test("porte observation — cœur : DB UNAVAILABLE bloque même si le SSE est LIVE, avec le détail « DB + canari »", () => {
  const observation = { state: "UNAVAILABLE", parts: { dbRead: { state: "UNAVAILABLE" }, canary: { state: "LIVE" }, sse: { state: "LIVE" } } };
  const r = evaluateReleaseGates(healthyInput({ observation }), { now: NOW_G });
  assert.equal(r.decision, "NO_GO");
  assert.ok(r.blockers.includes("observation"));
  const gate = r.gates.find((g) => g.key === "observation");
  assert.equal(gate.state, "FAIL");
  assert.match(gate.detail, /UNAVAILABLE \(DB \+ canari\)/);
});

test("porte observation — cœur : DB + canari LIVE passent même si le SSE (aucun navigateur) et la persistance sont UNAVAILABLE", () => {
  const observation = { state: "UNAVAILABLE", parts: { dbRead: { state: "LIVE" }, canary: { state: "LIVE" }, sse: { state: "UNAVAILABLE" }, persistence: { state: "UNAVAILABLE" } } };
  const r = evaluateReleaseGates(healthyInput({ observation }), { now: NOW_G });
  const gate = r.gates.find((g) => g.key === "observation");
  assert.equal(gate.pass, true, "un GO n'exige pas un humain devant l'écran");
  assert.equal(gate.state, "PASS");
  assert.equal(r.decision, "GO");
});

test("porte observation — observation.core prime sur state et sur les parts", () => {
  const coreMal = { state: "LIVE", core: "UNAVAILABLE", parts: { dbRead: { state: "LIVE" }, canary: { state: "LIVE" } } };
  assert.equal(evaluateReleaseGates(healthyInput({ observation: coreMal }), { now: NOW_G }).gates.find((g) => g.key === "observation").pass, false);
  const coreBien = { state: "DEGRADED", core: "LIVE", parts: { dbRead: { state: "UNAVAILABLE" }, canary: { state: "LIVE" } } };
  assert.equal(evaluateReleaseGates(healthyInput({ observation: coreBien }), { now: NOW_G }).gates.find((g) => g.key === "observation").pass, true);
});

test("porte incidents — incident daté : high vu il y a 1 h bloque ; vu il y a 80 h est périmé (GO) ; sans date, bloque", () => {
  const iso = (ms) => new Date(ms).toISOString();
  const recent = evaluateReleaseGates(healthyInput({ incidents: [{ id: "i1", status: "open", severity: "high", lastSeenAt: iso(NOW_G - 1 * H_G) }] }), { now: NOW_G });
  assert.equal(recent.decision, "NO_GO");
  assert.ok(recent.blockers.includes("critical_incidents"));
  const perime = evaluateReleaseGates(healthyInput({ incidents: [{ id: "i2", status: "open", severity: "high", lastSeenAt: iso(NOW_G - 80 * H_G) }] }), { now: NOW_G });
  assert.equal(perime.decision, "GO", "un high muet depuis plus de 72 h ne fait plus un NO_GO structurel");
  assert.equal(perime.gates.find((g) => g.key === "critical_incidents").state, "PASS");
  const limite = evaluateReleaseGates(healthyInput({ incidents: [{ id: "i3", status: "open", severity: "critical", createdAt: iso(NOW_G - 71 * H_G) }] }), { now: NOW_G });
  assert.equal(limite.decision, "NO_GO", "71 h : encore récent (createdAt fait foi sans lastSeenAt)");
  const sansDate = evaluateReleaseGates(healthyInput({ incidents: [{ id: "i4", status: "open", severity: "high" }] }), { now: NOW_G });
  assert.equal(sansDate.decision, "NO_GO", "sans date, on ne fabrique pas un vert");
  const clos = evaluateReleaseGates(healthyInput({ incidents: [{ id: "i5", status: "closed", severity: "critical", lastSeenAt: iso(NOW_G - 1 * H_G) }] }), { now: NOW_G });
  assert.equal(clos.decision, "GO", "un incident clos ne bloque pas");
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
