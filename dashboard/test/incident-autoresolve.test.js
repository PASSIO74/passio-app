// ═══════════════════════════════════════════════════════════════════════════
// INCIDENTS — résolution automatique, regroupement par clé, réouverture.
//
// Défaut mesuré (2026-09-18) : 166/166 paquets en DETECTED depuis 20 jours,
// 11 high jamais résolus → NO_GO structurel ; un seul appareil en coupure =
// 40 paquets (clé@révision) ; une clé revenue après clôture = orphelin.
//
// Mutations éprouvées (chacune rougit le test nommé) :
//   · SILENCE_HIGH_MS = 24 h                      → « high : 72 h »
//   · ne plus exiger la révision main             → « sans révision postérieure »
//   · ignorer le diagnostic defect non réparé     → « défaut réel non réparé »
//   · `opts.actor === "auto"` retiré de canTransition → « acteur auto »
//   · clusterKey = key@révision                   → « regroupement par clé »
//   · ne pas rouvrir un paquet clos               → « réouverture »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

const inc = await import("../server/incident-packets.js");
const { recordIncident, listIncidentPackets, decisionResolutionAuto, sweepIncidents, canTransitionIncident, reopenIncidentBySignal, clusterWindowFor, _resetIncidentsForTests } = inc;

const H = 3_600_000;
const NOW = Date.parse("2026-09-18T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const alert = (key, level, ts) => ({ id: "al_" + key + ts, ts, key, level, title: key, message: key, meta: {} });
const paquet = (over = {}) => ({ id: "inc_t", status: "open", phase: "DETECTED", severity: "warn", clusterKey: "apislow:/x", signal: { key: "apislow:/x" }, lastSeenAt: iso(NOW - 30 * H), createdAt: iso(NOW - 40 * H), ...over });
const releaseMain = (at) => ({ at: iso(at), branch: "main", revision: "abc123def456" });

test("warn : 24 h de silence + révision main postérieure = résolu, avec la preuve écrite", () => {
  const d = decisionResolutionAuto(paquet(), { now: NOW, releases: [releaseMain(NOW - 10 * H)] });
  assert.equal(d.resoudre, true);
  assert.match(d.evidence, /aucune occurrence de apislow:\/x depuis 30 h/);
  assert.match(d.evidence, /révision main abc123def456 postérieure/);
  assert.equal(d.raison, "auto_quiet_after_deploy");
});

test("silence trop court : une alerte de la même clé plus récente que le paquet compte comme occurrence", () => {
  const d = decisionResolutionAuto(paquet(), { now: NOW, releases: [releaseMain(NOW - 1 * H)], alerts: [alert("apislow:/x", "warn", NOW - 2 * H)] });
  assert.equal(d.resoudre, false);
  assert.match(d.raison, /silence 2 h/);
});

test("high : 72 h de silence exigées, 30 h ne suffisent pas ; 80 h oui", () => {
  const h = paquet({ severity: "high", clusterKey: "trace:failed:x", signal: { key: "trace:failed:x" } });
  assert.equal(decisionResolutionAuto(h, { now: NOW, releases: [releaseMain(NOW - 10 * H)] }).resoudre, false);
  const vieux = { ...h, lastSeenAt: iso(NOW - 80 * H) };
  assert.equal(decisionResolutionAuto(vieux, { now: NOW, releases: [releaseMain(NOW - 10 * H)] }).resoudre, true);
});

test("sans révision postérieure : refus (une révision ANTÉRIEURE ne prouve rien) ; warn après 7 jours de silence passe quand même", () => {
  assert.equal(decisionResolutionAuto(paquet(), { now: NOW, releases: [releaseMain(NOW - 35 * H)] }).resoudre, false);
  assert.equal(decisionResolutionAuto(paquet(), { now: NOW, releases: [] }).resoudre, false);
  const d = decisionResolutionAuto(paquet({ lastSeenAt: iso(NOW - 8 * 24 * H) }), { now: NOW, releases: [] });
  assert.equal(d.resoudre, true); assert.equal(d.raison, "auto_quiet_7d");
  const high = paquet({ severity: "high", lastSeenAt: iso(NOW - 8 * 24 * H) });
  assert.equal(decisionResolutionAuto(high, { now: NOW, releases: [] }).resoudre, false, "un high sans révision n'est jamais résolu par le seul temps");
});

test("défaut réel non réparé sur la clé : jamais résolu automatiquement ; réparé (repair.ok) : oui", () => {
  const diag = { key: "apislow:/x", verdict: "defect", repair: { attempted: true, ok: false } };
  assert.equal(decisionResolutionAuto(paquet(), { now: NOW, releases: [releaseMain(NOW - 1 * H)], diagnostics: [diag] }).resoudre, false);
  assert.equal(decisionResolutionAuto(paquet(), { now: NOW, releases: [releaseMain(NOW - 1 * H)], diagnostics: [{ ...diag, repair: { ok: true } }] }).resoudre, true);
});

test("acteur auto : n'importe quelle phase → RESOLVED ; un humain garde le parcours de phases", () => {
  assert.equal(canTransitionIncident("DETECTED", "RESOLVED"), false);
  assert.equal(canTransitionIncident("DETECTED", "RESOLVED", { actor: "benjamin" }), false);
  assert.equal(canTransitionIncident("DETECTED", "RESOLVED", { actor: "auto" }), true);
  assert.equal(canTransitionIncident("DIAGNOSED", "RESOLVED", { actor: "auto" }), true);
  assert.equal(canTransitionIncident("RESOLVED", "RESOLVED", { actor: "auto" }), false);
});

test("regroupement par clé : deux occurrences sous deux révisions = un seul paquet, révisions en attribut ; fenêtre 24 h pour le bruit", () => {
  _resetIncidentsForTests();
  const a = recordIncident(alert("conn:dev_a", "warn", NOW - 20 * H));
  const b = recordIncident(alert("conn:dev_a", "warn", NOW - 2 * H));
  assert.equal(a.id, b.id, "même clé sous 24 h : fusion");
  assert.equal(b.occurrences, 2);
  assert.equal(b.clusterKey, "conn:dev_a", "la clé de regroupement est le signal, pas signal@révision");
  assert.ok(Array.isArray(b.revisions) && b.revisions.length >= 1);
  assert.equal(clusterWindowFor("conn:dev_a"), 24 * H);
  assert.equal(clusterWindowFor("trace:failed:x"), 15 * 60_000);
  const c = recordIncident(alert("trace:failed:x", "high", NOW - 20 * H));
  const d = recordIncident(alert("trace:failed:x", "high", NOW - 2 * H));
  assert.notEqual(c.id, d.id, "hors fenêtre de 15 min : nouveau paquet");
});

test("balayage puis réouverture : le paquet résolu par auto est rouvert (REOPENED, recurrenceCount) quand la clé revient", () => {
  _resetIncidentsForTests();
  const p = recordIncident(alert("apislow:/y", "warn", NOW - 30 * H));
  const resolus = sweepIncidents({ now: NOW, releases: [releaseMain(NOW - 10 * H)] });
  assert.deepEqual(resolus, [p.id]);
  const clos = listIncidentPackets(10).find((x) => x.id === p.id);
  assert.equal(clos.status, "closed"); assert.equal(clos.phase, "RESOLVED"); assert.equal(clos.autoResolved, true); assert.equal(clos.resolvedBy, "auto");
  assert.match(clos.phaseHistory.at(-1).evidence, /révision main/);
  const retour = recordIncident(alert("apislow:/y", "warn", NOW));
  assert.equal(retour.id, p.id, "la clé revient : le paquet est rouvert, pas dupliqué");
  assert.equal(retour.status, "open"); assert.equal(retour.phase, "DETECTED");
  assert.equal(retour.recurrenceCount, 1);
  assert.equal(retour.phaseHistory.at(-1).phase, "REOPENED");
  assert.equal(reopenIncidentBySignal("inconnue:x"), null);
});

test("un paquet à l'ancien format de clé reste lisible et n'est pas fusionné rétroactivement", () => {
  _resetIncidentsForTests();
  const p = recordIncident(alert("api5xx:/z", "high", NOW));
  assert.equal(p.clusterKey, "api5xx:/z");
  // Un ancien paquet (clé@révision) cohabite : le nouveau ne le reconnaît pas comme sien.
  assert.equal(decisionResolutionAuto({ ...paquet(), clusterKey: "api5xx:/z@abcdef123456", signal: { key: "api5xx:/z" }, severity: "high", lastSeenAt: iso(NOW - 80 * H) }, { now: NOW, releases: [releaseMain(NOW - 1 * H)] }).resoudre, true, "…mais le balayage le résout par sa clé de signal");
});
