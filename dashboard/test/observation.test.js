// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION — le canari, le SSE sans navigateur, la persistance.
//
// Défauts mesurés (2026-09-18) : le canari en échec BATTAIT entre LIVE (90 s
// après chaque envoi tant que lastSuccessAt < 30 min) et UNAVAILABLE, sans
// compteur ; `sse.clients === 0` rendait l'observation DEGRADED dès que
// Benjamin fermait l'onglet (porte de release FAIL la nuit) ; aucun module
// n'agrégeait `JsonDb.health()`.
//
// Mutations éprouvées : `CANARY_MISSED_UNAVAILABLE = 1` rougit « un manqué =
// DEGRADED » ; ne plus compter le canari en retard rougit « en retard compte » ;
// retirer `missedCount = 0` à l'observation rougit « le succès réarme » ;
// remettre DEGRADED sans client rougit « IDLE » ; ranger IDLE au rang de DEGRADED dans pireEtat (ORDER.IDLE = 1 sans filtre)
// rougit « n'entre pas dans l'état global » ; retirer `_instances.add` rougit
// « storageHealth ».
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isSyntheticCanary, observeSyntheticCanary, noterCanariManque, etatCanari, etatSse, etatPersistence, pireEtat, observationCoreState, _test, _setCanaryForTests, _getCanaryForTests } from "../server/observation.js";
import { JsonDb, storageHealth } from "../server/jsondb.js";
import { config } from "../server/config.js";

const NOW = Date.parse("2026-09-18T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const opts = { configure: true, everyMs: 15 * 60_000, deadlineMs: 90_000 };

test("le canari Sentinel est reconnu sans dépendre d'un utilisateur", () => {
  const ev = { type: "lifecycle", action: _test.CANARY_ACTION, user_id: null, meta: { synthetic: true } };
  assert.equal(isSyntheticCanary(ev), true);
});

test("un événement produit ordinaire n'est jamais confondu avec le canari", () => {
  assert.equal(isSyntheticCanary({ type: "lifecycle", action: _test.CANARY_ACTION, meta: {} }), false);
  assert.equal(isSyntheticCanary({ type: "action", action: _test.CANARY_ACTION, meta: { synthetic: true } }), false);
});

test("canari : succès récent sans manqué = LIVE ; un manqué = DEGRADED ; deux = UNAVAILABLE ; non configuré = NOT_CONFIGURED", () => {
  assert.equal(etatCanari({ lastSuccessAt: iso(NOW - 5 * 60_000), missedCount: 0 }, NOW, opts).state, "LIVE");
  const un = etatCanari({ lastSuccessAt: iso(NOW - 5 * 60_000), missedCount: 1 }, NOW, opts);
  assert.equal(un.state, "DEGRADED", "un manqué = DEGRADED, plus jamais LIVE tant qu'un succès n'a pas réarmé");
  assert.match(un.detail, /non observé/);
  const deux = etatCanari({ lastSuccessAt: iso(NOW - 5 * 60_000), missedCount: 2, sentAt: iso(NOW - 60_000) }, NOW, opts);
  assert.equal(deux.state, "UNAVAILABLE");
  assert.match(deux.detail, /2 canaris/);
  assert.equal(etatCanari({ configured: false }, NOW, opts).state, "NOT_CONFIGURED");
  assert.equal(etatCanari({ lastSuccessAt: iso(NOW - 5 * 60_000) }, NOW, { ...opts, configure: false }).state, "NOT_CONFIGURED");
});

test("canari : un envoi en retard sur sa deadline compte comme manqué provisoire — plus de battement LIVE/UNAVAILABLE", () => {
  const enRetard = { lastSuccessAt: iso(NOW - 5 * 60_000), missedCount: 0, pendingId: "can_x", deadlineAt: iso(NOW - 1000) };
  assert.equal(etatCanari(enRetard, NOW, opts).state, "DEGRADED", "en retard compte : un manqué provisoire");
  assert.equal(etatCanari({ ...enRetard, missedCount: 1 }, NOW, opts).state, "UNAVAILABLE", "un manqué compté + un en retard = deux");
  const dansLesTemps = { ...enRetard, deadlineAt: iso(NOW + 60_000) };
  assert.equal(etatCanari(dansLesTemps, NOW, opts).state, "LIVE", "en attente mais dans les temps, avec un succès récent : LIVE");
});

test("noterCanariManque incrémente et vide le pendant ; l'observation du canari attendu réarme à zéro", () => {
  const c = noterCanariManque({ pendingId: "can_a", deadlineAt: "x", missedCount: 1 });
  assert.equal(c.missedCount, 2); assert.equal(c.pendingId, null); assert.equal(c.deadlineAt, null);
  assert.equal(noterCanariManque(null).missedCount, 1);
  // Le succès réarme (registre du module, isolé par le préchargement).
  _setCanaryForTests({ pendingId: "can_ok", sentAt: iso(Date.now() - 1000), deadlineAt: iso(Date.now() + 90_000), missedCount: 3 });
  observeSyntheticCanary({ type: "lifecycle", action: _test.CANARY_ACTION, meta: { synthetic: true }, correlation_id: "can_autre" });
  assert.equal(_getCanaryForTests().missedCount, 3, "un canari inattendu ne réarme rien");
  observeSyntheticCanary({ type: "lifecycle", action: _test.CANARY_ACTION, meta: { synthetic: true }, correlation_id: "can_ok" });
  const c2 = _getCanaryForTests();
  assert.equal(c2.missedCount, 0, "le succès réarme");
  assert.equal(c2.pendingId, null);
  assert.ok(c2.lastSuccessAt);
});

test("SSE : sans client = IDLE, jamais DEGRADED ; avec client et heartbeat frais = LIVE ; vieux = UNAVAILABLE", () => {
  assert.equal(etatSse({ clients: 0 }, NOW).state, "IDLE");
  assert.equal(etatSse(null, NOW).state, "IDLE");
  assert.equal(etatSse({ clients: 2, lastSentAt: iso(NOW - 10_000) }, NOW).state, "LIVE");
  assert.equal(etatSse({ clients: 2, lastSentAt: iso(NOW - 200_000) }, NOW).state, "UNAVAILABLE");
});

test("IDLE n'entre pas dans l'état global ; le cœur (DB + canari) ignore SSE et persistance", () => {
  const parts = { dbRead: { state: "LIVE" }, canary: { state: "LIVE" }, sse: { state: "IDLE" }, persistence: { state: "LIVE" } };
  assert.equal(pireEtat(parts), "LIVE", "personne devant l'écran n'est pas une dégradation");
  assert.equal(pireEtat({ ...parts, persistence: { state: "UNAVAILABLE" } }), "UNAVAILABLE");
  assert.equal(observationCoreState({ parts: { ...parts, persistence: { state: "UNAVAILABLE" }, sse: { state: "UNAVAILABLE" } } }), "LIVE");
  assert.equal(observationCoreState({ parts: { ...parts, canary: { state: "DEGRADED" } } }), "DEGRADED");
});

test("storageHealth agrège les JsonDb : un fichier qui ne s'écrit plus rend la part persistance UNAVAILABLE, nommée", () => {
  const name = `obs-storage-${process.pid}-${Date.now()}`;
  const file = path.join(config.dataDir, name + ".json");
  const db = new JsonDb(name, { n: 0 });
  assert.equal(etatPersistence(storageHealth()).state, "LIVE");
  fs.rmSync(file, { force: true });
  fs.mkdirSync(file, { recursive: true });   // un DOSSIER à la place du fichier : renameSync échoue
  try {
    db.update((d) => { d.n = 1; });
    const sh = storageHealth();
    assert.equal(sh.available, false);
    assert.ok(sh.failing.some((f) => f.name === name && /^write_failed/.test(f.reason)));
    const p = etatPersistence(sh);
    assert.equal(p.state, "UNAVAILABLE");
    assert.match(p.detail, new RegExp(name));
  } finally {
    fs.rmSync(file, { recursive: true, force: true });
  }
  db.update((d) => { d.n = 2; });
  assert.equal(etatPersistence(storageHealth()).state, "LIVE", "le succès suivant réarme");
  fs.rmSync(file, { force: true });
});
