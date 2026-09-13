// Verrous de la surveillance du disque — la cause n°1 des « déconnexions » de
// Claude Code du 2026-09-12 (disque C: à 100 %, 22 plantages ENOSPC) : le
// pilotage mesurait tout sauf le sol sur lequel il tenait. Mutations éprouvées :
// supprimer l'hystérésis (rougit « oscille »), signaler à chaque tour (rougit
// « une seule fois »), rabattre l'état sur une mesure impossible (rougit
// « mesure impossible »).
import test from "node:test";
import assert from "node:assert/strict";

const disque = await import("../server/disque.js");

const mesureA = (gb) => async () => ({ freeGb: gb, totalGb: 262 });
const vierge = () => disque._setDiskStateForTests({ checked: false, ok: null, freeGb: null, low: false, since: null, error: null });

test("sous le seuil : une alerte warn, une seule fois, avec le chiffre et le mot ENOSPC", async () => {
  vierge();
  const vues = [];
  await disque.diskWatchTick({ mesure: mesureA(2.5), notify: (a) => vues.push(a), now: 1000 });
  assert.equal(vues.length, 1);
  assert.equal(vues[0].level, "warn", "warn : la sentinelle n'analyse que critical/high, un disque plein ne se patche pas");
  assert.match(vues[0].message, /2\.5 Go/);
  assert.match(vues[0].message, /ENOSPC/);
  const s = disque.diskState();
  assert.equal(s.low, true);
  assert.equal(s.since, 1000);
  // Toujours bas au tour suivant : rien de neuf, et `since` ne bouge pas.
  await disque.diskWatchTick({ mesure: mesureA(2.4), notify: (a) => vues.push(a), now: 2000 });
  assert.equal(vues.length, 1, "pas une alerte toutes les 5 minutes");
  assert.equal(disque.diskState().since, 1000);
});

test("au démarrage, un disque sain ne dit rien ; le retour au-dessus du seuil est signalé en info", async () => {
  vierge();
  const vues = [];
  await disque.diskWatchTick({ mesure: mesureA(80), notify: (a) => vues.push(a), now: 1000 });
  assert.equal(vues.length, 0, "sain au démarrage : pas d'alerte « tout va bien »");
  assert.equal(disque.diskState().ok, true);
  await disque.diskWatchTick({ mesure: mesureA(3), notify: (a) => vues.push(a), now: 2000 });
  assert.equal(vues.length, 1);
  await disque.diskWatchTick({ mesure: mesureA(40), notify: (a) => vues.push(a), now: 3000 });
  assert.equal(vues.length, 2, "le retour est signalé : sinon on ne sait jamais si libérer a suffi");
  assert.equal(vues[1].level, "info");
  assert.equal(disque.diskState().low, false);
  assert.equal(disque.diskState().since, 3000);
});

test("un disque qui oscille autour du seuil ne remplit pas le flux (hystérésis)", async () => {
  vierge();
  const vues = [];
  const seuil = disque.diskState().thresholdGb;
  await disque.diskWatchTick({ mesure: mesureA(seuil - 0.5), notify: (a) => vues.push(a), now: 1 });
  assert.equal(vues.length, 1);
  // Juste au-dessus du seuil, mais sous seuil + marge : toujours « bas ».
  await disque.diskWatchTick({ mesure: mesureA(seuil + 0.5), notify: (a) => vues.push(a), now: 2 });
  assert.equal(vues.length, 1, "revenir d'un demi-Go au-dessus n'est pas « de la place à nouveau »");
  assert.equal(disque.diskState().low, true);
  await disque.diskWatchTick({ mesure: mesureA(seuil - 0.5), notify: (a) => vues.push(a), now: 3 });
  assert.equal(vues.length, 1);
});

test("une mesure impossible garde l'état connu et note l'erreur — ni « plein » ni « sain »", async () => {
  vierge();
  const vues = [];
  await disque.diskWatchTick({ mesure: mesureA(80), notify: (a) => vues.push(a), now: 1 });
  await disque.diskWatchTick({ mesure: async () => { throw new Error("EPERM statfs"); }, notify: (a) => vues.push(a), now: 2 });
  const s = disque.diskState();
  assert.equal(s.ok, true, "l'état connu est gardé");
  assert.equal(s.low, false);
  assert.match(s.error, /EPERM/);
  assert.equal(vues.length, 0);
});

test("la vraie mesure rend des gigaoctets plausibles pour data/", async () => {
  const m = await disque.mesurer();
  assert.ok(m.totalGb > 1 && m.freeGb >= 0 && m.freeGb <= m.totalGb, JSON.stringify(m));
});

test("startDiskWatch est idempotent et ne retient pas le processus", () => {
  // Sans tour immédiat : la vraie mesure d'un poste au disque bas écrirait une
  // alerte dans data/ pendant les tests.
  const a = disque.startDiskWatch(600000, { immediate: false });
  const b = disque.startDiskWatch(600000, { immediate: false });
  assert.equal(a, b);
  disque.stopDiskWatch();
});
