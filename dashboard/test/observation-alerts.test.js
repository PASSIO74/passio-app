// ═══════════════════════════════════════════════════════════════════════════
// ALERTES D'OBSERVATION — verrous des deux fonctions pures `evaluer` et
// `transitions`, et du tour injectable.
//
// Défaut mesuré (2026-09-18) : observation.js ne signalait RIEN ; dbRead,
// canari, realtime, polling, ingestion et silence réel ne se voyaient qu'en
// ouvrant l'écran. Mutations éprouvées (chacune rougit le test nommé) :
//   · retirer la condition de grâce du realtime
//     (`mauvais: Boolean(decroche)`)                    → « realtime »
//   · REALTIME_GRACE_MS = 0 (ou 1 min)                  → « realtime : 4 min 59 s »
//   · `streak >= 1` pour le polling                     → « polling »
//   · évaluer le silence la nuit                        → « silence tenu la nuit »
//   · compter le silence en heures d'horloge (retirer
//     `Math.max(vu, debutHeuresActivesParis(now))`)     → « silence en heures actives »
//   · émettre à chaque tour et non à la bascule         → « une bascule = une alerte »
//   · oublier l'info de retour                          → « retour en info »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

const oa = await import("../server/observation-alerts.js");
// ⚠️ L'ÉTAT RÉEL, pas un fixture : c'est tout l'objet du cas ⑪ ci-dessous.
const { ingestState } = await import("../server/ingest.js");
const { evaluer, transitions, observationAlertsTick, _setStateForTests, heureParis, enHeuresActives, debutHeuresActivesParis } = oa;

// 2026-09-18 est un vendredi ; 12:00Z = 14:00 à Paris (heure d'été), 02:00Z = 04:00.
const JOUR = Date.parse("2026-09-18T12:00:00Z");
const NUIT = Date.parse("2026-09-18T02:00:00Z");
const H = 3_600_000;
const obsOk = () => ({ parts: { dbRead: { state: "LIVE" }, canary: { state: "LIVE" }, sse: { state: "IDLE" }, persistence: { state: "LIVE" } } });
// ⚠️ Ce fixture porte encore `realtimeOk`/`realtimeStatus` : le produit ne les
// émet PLUS (canal retiré le 2026-09-20), mais la logique de grâce de
// `evaluer` doit rester gardée au cas où un canal reviendrait. C'est
// précisément pourquoi il ne peut pas servir à prouver que l'alerte est
// éteinte aujourd'hui — d'où le cas ⑪, qui passe `ingestState()` tel quel.
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
  // D1-TM-06 : la grâce est bien de 5 min — 4 min 59 s = rien, 5 min 01 s = warn.
  const tAvant = evaluer({ obs: obsOk(), ingest: ingOk({ realtimeOk: false, realtimeStatus: "CHANNEL_ERROR", realtimeLastError: "PrivateOnly" }), now: JOUR + 4 * 60_000 + 59_000, prev: t0 });
  assert.equal(tAvant.etats.realtime.mauvais, false, "realtime : 4 min 59 s de décrochage, encore dans la grâce");
  const tApres = evaluer({ obs: obsOk(), ingest: ingOk({ realtimeOk: false, realtimeStatus: "CHANNEL_ERROR", realtimeLastError: "PrivateOnly" }), now: JOUR + 5 * 60_000 + 1000, prev: tAvant });
  assert.equal(tApres.etats.realtime.mauvais, true, "realtime : 5 min 01 s, la grâce est écoulée");
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

test("silence en heures actives : un dernier signal à 23:30 ne sonne pas à 09:05 ; 13:05 sans signal depuis 09:00 sonne", () => {
  // D1-C2 : compté en heures d'horloge, obs:silence partait chaque matin à
  // 09:00 (9,6 h depuis la veille au soir) → issue [POSTE] + e-mail quotidien.
  const MATIN = Date.parse("2026-09-18T07:05:00Z");   // 09:05 à Paris (CEST)
  const VEILLE_SOIR = Date.parse("2026-09-17T21:30:00Z"); // 23:30 à Paris
  assert.equal(debutHeuresActivesParis(MATIN), Date.parse("2026-09-18T07:00:00Z"), "09:00 Paris = 07:00Z en été");
  assert.equal(debutHeuresActivesParis(Date.parse("2026-01-15T14:00:00Z")), Date.parse("2026-01-15T08:00:00Z"), "09:00 Paris = 08:00Z en hiver");
  const m = evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: new Date(VEILLE_SOIR).toISOString() }), now: MATIN });
  assert.equal(m.etats.silence.mauvais, false, "9,6 h d'horloge mais 5 min d'heures actives : pas une panne");
  assert.match(m.etats.silence.detail, /0\.1 h en heures actives/);
  const MIDI = Date.parse("2026-09-18T11:05:00Z"); // 13:05 à Paris : 4 h 05 d'heures actives sans signal
  const s = evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: new Date(VEILLE_SOIR).toISOString() }), now: MIDI });
  assert.equal(s.etats.silence.mauvais, true, "4 h 05 en heures actives > seuil 4 h");
  const s2 = evaluer({ obs: obsOk(), ingest: ingOk({ lastRealSeenIso: new Date(Date.parse("2026-09-18T08:00:00Z")).toISOString() }), now: MIDI });
  assert.equal(s2.etats.silence.mauvais, false, "un signal à 10:00 Paris : 3 h 05 de silence actif seulement");
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

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ LE CÂBLAGE — l'ÉTAT RÉEL passé à l'ÉVALUATEUR RÉEL (2026-09-20)
//
// Défaut mesuré par `audit-passio` sur ce lot : `realtimeUtilise: false` était
// vérifié d'un côté (`ingest.test.js` lit le champ) et lu de l'autre
// (`observation-alerts.js`), mais AUCUN test ne reliait les deux — le fixture
// `ingOk` ci-dessus n'a jamais porté ce champ. Retirer la garde de
// `observation-alerts.js` laissait donc **577/577 verts**, c'est-à-dire
// exactement ce que ce lot prétend éviter : « un verrou qui tient par accident
// finit par le dire ». C'est la faute `_notifierMessage`, rejouée côté pilotage.
// ═══════════════════════════════════════════════════════════════════════════
test("⑪ câblage : l'état RÉEL du pilotage ne peut plus déclencher « Realtime décroché »", () => {
  const reel = ingestState();
  assert.equal(reel.realtimeUtilise, false, "prémisse : le produit déclare ne plus utiliser le temps réel");

  // Même bien après la grâce de 5 min, et même si quelqu'un venait poser un
  // statut d'affichage hostile dans l'état : la garde tient sur le DRAPEAU seul.
  const base = { ...reel, supabaseReady: true, polling: { failStreak: 0, ok: true }, ingestAlive: true,
    lastRealSeenIso: new Date(JOUR - H).toISOString() };
  for (const hostile of [{}, { realtimeStatus: "CHANNEL_ERROR", realtimeLastError: "PrivateOnly" }, { realtimeStatus: "IDLE" }]) {
    const t0 = evaluer({ obs: obsOk(), ingest: { ...base, ...hostile }, now: JOUR });
    const t1 = evaluer({ obs: obsOk(), ingest: { ...base, ...hostile }, now: JOUR + 6 * 60_000, prev: t0 });
    assert.equal(t1.etats.realtime.mauvais, false,
      `« Realtime décroché » s'est rallumée avec ${JSON.stringify(hostile)} : la garde ne tient pas sur realtimeUtilise`);
    assert.equal(transitions(t0, t1).filter((a) => a.key === "obs:realtime").length, 0,
      "une alerte obs:realtime a été émise alors que le canal n'existe plus");
  }
});

test("⑪ bis : le chemin d'ingestion n'a plus qu'UN terme — un polling mort rend le pilotage sourd", () => {
  // Avant le retrait, `ingestAlive = realtimeOk || pollingOk` : un polling mort
  // était masqué par un realtime vivant. Le canal parti, plus rien ne masque.
  const reel = ingestState();
  assert.equal(reel.ingestAlive, reel.polling.ok,
    "ingestAlive doit valoir exactement polling.ok : un second terme le rendrait complaisant");
});

// ─── Reprise de veille : les états réseau sont tenus, pas recalculés ────────
// Mesuré trois matins de suite (19, 20, 21/09, entre 06:10 et 09:36) : « lecture
// DB trop ancienne » + « Ingestion sourde » à la seconde où le poste sort de
// veille (dbRead.at et poll.lastOkAt datent de la nuit), puis `fetch failed`
// avant que le Wi-Fi soit remonté, chacune rétablie 1 à 40 min après.
const obsReveil = () => ({ parts: { dbRead: { state: "UNAVAILABLE", detail: "lecture DB trop ancienne" }, canary: { state: "UNAVAILABLE", detail: "2 manqués" }, sse: { state: "IDLE" }, persistence: { state: "LIVE" } } });
const ingReveil = () => ingOk({ polling: { failStreak: 6, ok: false, lastError: "TypeError: fetch failed" }, ingestAlive: false });

test("reprise : un tour qui suit un trou de 8 h détecte la reprise ; un glissement de 2 min non", () => {
  const { repriseDetectee } = oa;
  assert.equal(repriseDetectee(JOUR - 8 * H, JOUR), true);
  assert.equal(repriseDetectee(JOUR - 2 * 60_000, JOUR), false, "un tick d'une minute glisse, il ne dort pas");
  assert.equal(repriseDetectee(null, JOUR), false, "premier tour : rien à comparer");
  assert.equal(repriseDetectee(JOUR - 4 * 60_000, JOUR, 3 * 60_000), true);
});

test("reprise : pendant la grâce, les quatre états réseau sont tenus à leur valeur d'avant — sains avant, sains pendant", () => {
  const prev = evaluer({ obs: obsOk(), ingest: ingOk(), now: JOUR - 8 * H });
  const e = evaluer({ obs: obsReveil(), ingest: ingReveil(), now: JOUR, prev, reprise: JOUR, graceMs: 10 * 60_000 });
  for (const nom of ["dbread", "canary", "polling", "ingest"]) {
    assert.equal(e.etats[nom].mauvais, false, `${nom} : tenu sain pendant la grâce`);
    assert.equal(e.etats[nom].tenu, true);
    assert.match(e.etats[nom].detail, /reprise de veille : état tenu encore 10 min/);
  }
  assert.equal(e.enGrace, true);
  assert.deepEqual(transitions(prev, e), [], "aucune bascule : rien ne sonne au réveil");
  // La persistance (disque local) n'est PAS tenue : elle ne dépend pas du réseau.
  const disque = { ...obsReveil(), parts: { ...obsReveil().parts, persistence: { state: "UNAVAILABLE", detail: "ENOSPC" } } };
  const e2 = evaluer({ obs: disque, ingest: ingReveil(), now: JOUR, prev, reprise: JOUR, graceMs: 10 * 60_000 });
  assert.equal(e2.etats.storage.mauvais, true, "un disque plein sonne, réveil ou pas");
});

test("reprise : une panne qui durait AVANT la veille reste signalée pendant la grâce (tenue mauvaise, pas de faux retour)", () => {
  const prev = evaluer({ obs: obsReveil(), ingest: ingReveil(), now: JOUR - 8 * H });
  assert.equal(prev.etats.dbread.mauvais, true);
  const e = evaluer({ obs: obsOk(), ingest: ingOk(), now: JOUR, prev, reprise: JOUR, graceMs: 10 * 60_000 });
  assert.equal(e.etats.dbread.mauvais, true, "tenue = tenue mauvaise aussi");
  assert.deepEqual(transitions(prev, e), [], "pas de retour `info` prématuré sur une lecture qui n'a pas encore eu lieu");
});

test("reprise : la grâce finit — à 10 min, une panne encore là sonne ; une panne partie ne sonne jamais", () => {
  const avant = evaluer({ obs: obsOk(), ingest: ingOk(), now: JOUR - 8 * H });
  const pendant = evaluer({ obs: obsReveil(), ingest: ingReveil(), now: JOUR + 5 * 60_000, prev: avant, reprise: JOUR, graceMs: 10 * 60_000 });
  assert.equal(pendant.enGrace, true);
  // Cas nominal : le réseau est revenu, tout est sain à la fin de la grâce.
  const apresOk = evaluer({ obs: obsOk(), ingest: ingOk(), now: JOUR + 10 * 60_000, prev: pendant, reprise: JOUR, graceMs: 10 * 60_000 });
  assert.equal(apresOk.enGrace, false);
  assert.deepEqual(transitions(pendant, apresOk), [], "le faux réveil n'a produit NI alerte NI retour");
  // Vraie panne née pendant la grâce : elle sonne à la fin, jamais tue.
  const apresMal = evaluer({ obs: obsReveil(), ingest: ingReveil(), now: JOUR + 10 * 60_000, prev: pendant, reprise: JOUR, graceMs: 10 * 60_000 });
  const cles = transitions(pendant, apresMal).map((a) => a.key).sort();
  assert.deepEqual(cles, ["obs:canary", "obs:dbread", "obs:ingest", "obs:polling"], "une panne réelle sonne 10 min plus tard, pas jamais");
});

test("reprise : le tour la détecte sur l'écart avec le tour précédent, la persiste, et n'émet rien au réveil", async () => {
  _setStateForTests({ etats: evaluer({ obs: obsOk(), ingest: ingOk(), now: JOUR - 8 * H }).etats, updatedAt: JOUR - 8 * H });
  const emises = [];
  const notify = (a) => emises.push(a.key);
  // Le réveil : lectures froides, réseau pas encore là.
  const t1 = await observationAlertsTick({ now: JOUR, obs: obsReveil(), ingest: ingReveil(), notify, graceMs: 10 * 60_000 });
  assert.equal(t1.next.enGrace, true);
  assert.deepEqual(emises, [], "rien ne sonne au réveil");
  assert.equal(oa.observationAlertsState().repriseA, JOUR, "la reprise est persistée");
  // Tours suivants : 1 min plus tard, encore froid — toujours rien ; 12 min plus tard, réseau revenu.
  await observationAlertsTick({ now: JOUR + 60_000, obs: obsReveil(), ingest: ingReveil(), notify, graceMs: 10 * 60_000 });
  assert.deepEqual(emises, []);
  // Le tick tourne CHAQUE minute : sauter de +1 à +12 min serait un second
  // sommeil aux yeux du détecteur (écart > 3 min), et la grâce repartirait.
  for (let m = 2; m <= 11; m++) await observationAlertsTick({ now: JOUR + m * 60_000, obs: obsOk(), ingest: ingOk(), notify, graceMs: 10 * 60_000 });
  const t3 = await observationAlertsTick({ now: JOUR + 12 * 60_000, obs: obsOk(), ingest: ingOk(), notify, graceMs: 10 * 60_000 });
  assert.equal(t3.next.enGrace, false);
  assert.deepEqual(emises, [], "un faux réveil ne laisse aucune trace : ni alerte, ni retour");
  // Sans trou (tour à tour), aucune reprise n'est datée à nouveau.
  await observationAlertsTick({ now: JOUR + 13 * 60_000, obs: obsOk(), ingest: ingOk(), notify, graceMs: 10 * 60_000 });
  assert.equal(oa.observationAlertsState().repriseA, JOUR, "la reprise d'avant reste datée, aucune nouvelle");
  _setStateForTests({ etats: null });
});
