// ═══════════════════════════════════════════════════════════════════════════
// ALERTES D'OBSERVATION — verrous des deux fonctions pures `evaluer` et
// `transitions`, et du tour injectable.
//
// Défaut mesuré (2026-09-18) : observation.js ne signalait RIEN ; dbRead,
// canari, realtime, polling, ingestion et silence réel ne se voyaient qu'en
// ouvrant l'écran. Mutations éprouvées (chacune rougit le test nommé) :
//   · ne plus exiger 5 min de realtime décroché        → « realtime »
//   · `streak >= 1` pour le polling                     → « polling »
//   · évaluer le silence la nuit                        → « silence tenu la nuit »
//   · émettre à chaque tour et non à la bascule         → « une bascule = une alerte »
//   · oublier l'info de retour                          → « retour en info »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

const oa = await import("../server/observation-alerts.js");
const { evaluer, transitions, observationAlertsTick, _setStateForTests, heureParis, enHeuresActives } = oa;

// 2026-09-18 est un vendredi ; 12:00Z = 14:00 à Paris (heure d'été), 02:00Z = 04:00.
const JOUR = Date.parse("2026-09-18T12:00:00Z");
const NUIT = Date.parse("2026-09-18T02:00:00Z");
const H = 3_600_000;
const obsOk = () => ({ parts: { dbRead: { state: "LIVE" }, canary: { state: "LIVE" }, sse: { state: "IDLE" }, persistence: { state: "LIVE" } } });
const ingOk = (over = {}) => ({ supabaseReady: true, realtimeOk: true, realtimeStatus: "SUBSCRIBED", polling: { failStreak: 0, ok: true }, ingestAlive: true, lastRealSeenIso: new Date(JOUR - H).toISOString(), ...over });

test("heure de Paris et heures actives : 14 h = active, 04 h = nuit", () => {
  assert.equal(heureParis(JOUR), 14);
  assert.equal(enHeuresActives(JOUR), true);
  assert.equal(enHeuresActives(NUIT), false);
});

test("tout va bien : aucun état mauvais, et l'IDLE du SSE n'existe pas pour ce module", () => {
  const e = evaluer({ obs: obsOk(), ingest: ingOk(), now: JOUR });
  assert.ok(Object.values(e.etats).every((x) => x.mauvais === false), JSON.stringify(e.etats));
  assert.deepEqual(transitions(null, e), []);
});

test("dbRead / canari / persistance UNAVAILABLE → high (storage:write en kind infra)", () => {
  const obs = { parts: { dbRead: { state: "UNAVAILABLE", detail: "timeout" }, canary: { state: "UNAVAILABLE", detail: "2 manqués" }, sse: { state: "IDLE" }, persistence: { state: "UNAVAILABLE", detail: "alerts (write_failed:ENOSPC)" } } };
  const e = evaluer({ obs, ingest: ingOk(), now: JOUR });
  const al = transitions(null, e);
  const par = Object.fromEntries(al.map((a) => [a.key, a]));
  assert.equal(par["obs:dbread"].level, "high");
  assert.equal(par["obs:canary"].level, "high");
  assert.equal(par["storage:write"].level, "high");
  assert.equal(par["storage:write"].meta.kind, "infra");
  assert.match(par["obs:dbread"].message, /timeout/);
  assert.equal(al.every((a) => a.cooldownMs === 0), true, "une bascule est déjà unique : pas de cooldown qui avalerait le retour");
});

test("realtime : décroché depuis moins de 5 min = rien ; au-delà = warn ; réabonné = retour", () => {
  const t0 = evaluer({ obs: obsOk(), ingest: ingOk({ realtimeOk: false, realtimeStatus: "CHANNEL_ERROR", realtimeLastError: "PrivateOnly" }), now: JOUR });
  assert.equal(t0.etats.realtime.mauvais, false, "premier constat : on laisse 5 min");
  assert.equal(t0.realtimeBadSince, JOUR, "…mais on note depuis quand");
  const t1 = evaluer({ obs: obsOk(), ingest: ingOk({ realtimeOk: false, realtimeStatus: "CHANNEL_ERROR", realtimeLastError: "PrivateOnly" }), now: JOUR + 6 * 60_000, prev: t0 });
  assert.equal(t1.etats.realtime.mauvais, true);
  assert.match(t1.etats.realtime.detail, /CHANNEL_ERROR/);
  const al = transitions(t0, t1);
  assert.equal(al.length, 1); assert.equal(al[0].key, "obs:realtime"); assert.equal(al[0].level, "warn");
  const t2 = evaluer({ obs: obsOk(), ingest: ingOk(), now: JOUR + 7 * 60_000, prev: t1 });
  assert.equal(t2.realtimeBadSince, null);
  assert.equal(transitions(t1, t2)[0].level, "info");
});

test("polling : 5 échecs de suite = rien, 6 = high ; ingestion sourde = critical ; sans Supabase, rien", () => {
  assert.equal(evaluer({ obs: obsOk(), ingest: ingOk({ polling: { failStreak: 5 } }), now: JOUR }).etats.polling.mauvais, false);
  const e = evaluer({ obs: obsOk(), ingest: ingOk({ polling: { failStreak: 6, lastError: "fetch failed" }, realtimeOk: false, ingestAlive: false }), now: JOUR });
  assert.equal(e.etats.polling.mauvais, true);
  assert.equal(e.etats.ingest.mauvais, true);
  const par = Object.fromEntries(transitions(null, e).map((a) => [a.key, a]));
  assert.equal(par["obs:polling"].level, "high");
  assert.equal(par["obs:ingest"].level, "critical");
  const local = evaluer({ obs: obsOk(), ingest: { supabaseReady: false, ingestAlive: false, polling: { failStreak: 99 } }, now: JOUR });
  assert.equal(local.etats.polling.mauvais, false, "mode local : rien à surveiller");
  assert.equal(local.etats.ingest.mauvais, false);
});

test("silence réel : 5 h sans signal le jour = warn ; jamais vu = désarmé ; tenu la nuit", () => {
  const e = evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: new Date(JOUR - 5 * H).toISOString() }), now: JOUR });
  assert.equal(e.etats.silence.mauvais, true);
  assert.match(e.etats.silence.detail, /5 h/);
  assert.equal(transitions(null, e)[0].key, "obs:silence");
  assert.equal(evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: new Date(JOUR - 3 * H).toISOString() }), now: JOUR }).etats.silence.mauvais, false, "3 h < 4 h");
  assert.equal(evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: null }), now: JOUR }).etats.silence.mauvais, false, "jamais vu : désarmé");
  // La nuit, l'état est tenu : ni nouvelle alerte, ni faux retour.
  const nuitCalme = evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: new Date(NUIT - 9 * H).toISOString() }), now: NUIT, prev: null });
  assert.equal(nuitCalme.etats.silence.mauvais, false, "9 h de silence à 4 h du matin n'est pas une panne");
  const nuitTenue = evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: new Date(NUIT - 9 * H).toISOString() }), now: NUIT, prev: e });
  assert.equal(nuitTenue.etats.silence.mauvais, true, "une alerte posée le soir n'est pas « rétablie » par la nuit");
  assert.deepEqual(transitions(e, nuitTenue), []);
});

test("une bascule = une alerte : deux évaluations identiques n'émettent rien, le retour est en info sur la même clé", async () => {
  _setStateForTests({ etats: null });
  const vues = [];
  const notify = (a) => vues.push(a);
  const obsMal = { parts: { dbRead: { state: "UNAVAILABLE", detail: "x" }, canary: { state: "LIVE" }, sse: { state: "IDLE" }, persistence: { state: "LIVE" } } };
  await observationAlertsTick({ now: JOUR, obs: obsMal, ingest: ingOk(), notify });
  await observationAlertsTick({ now: JOUR + 60_000, obs: obsMal, ingest: ingOk(), notify });
  assert.equal(vues.length, 1, "toujours mauvais au tour suivant : rien de neuf");
  assert.equal(vues[0].key, "obs:dbread"); assert.equal(vues[0].level, "high");
  await observationAlertsTick({ now: JOUR + 120_000, obs: obsOk(), ingest: ingOk(), notify });
  assert.equal(vues.length, 2);
  assert.equal(vues[1].key, "obs:dbread"); assert.equal(vues[1].level, "info");
  _setStateForTests({ etats: null });
});
