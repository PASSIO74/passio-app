// ═══════════════════════════════════════════════════════════════════════════
// CE QUI T'ATTEND — verrous du WRAPPER `attente()` : cache 60 s et diffusion
// SSE « attente » seulement quand la liste de clés change.
//
// D1-TM-07 : seule la fonction pure `attenteSnapshot` était éprouvée ; le
// cahier D1.6 spécifie pourtant un cache de 60 s (l'Accueil rejoue toutes les
// 10 s) et un événement SSE à la bascule — sans test, retirer le cache ou
// diffuser à chaque tour restait vert. Les sources et la diffusion sont
// injectées (`_setDepsForTests`) : ni sentinel.js ni GitHub ne sont chargés.
//
// Mutations éprouvées (chacune rougit le test nommé) :
//   · retirer `if (!force && _memo.valeur && now - _memo.t < MEMO_MS) return`  → « cache 60 s »
//   · MEMO_MS = 10 s                                                           → « cache 60 s »
//   · diffuser à chaque calcul (retirer `_memo.cles !== cles`)                → « un événement à la bascule »
//   · ne jamais diffuser                                                        → « un événement à la bascule »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

const mod = await import("../server/attente.js");
const { attente, _resetAttenteForTests, _setDepsForTests } = mod;

const H = 3_600_000;
const T0 = Date.parse("2026-09-18T12:00:00Z");

function banc(alertesInitiales = []) {
  let lectures = 0;
  const diffusions = [];
  const etat = { alerts: alertesInitiales };
  _resetAttenteForTests();
  _setDepsForTests({
    lireSources: async () => { lectures++; return { alerts: etat.alerts, disk: { checked: true, low: false } }; },
    diffuser: async (ev, payload) => { diffusions.push([ev, payload]); },
  });
  return { etat, diffusions, lectures: () => lectures };
}

test("cache 60 s : deux appels sous la minute rendent le même instantané sans relire ; après 60 s, ou en force, on relit", async () => {
  const b = banc([{ id: "a1", level: "high", acknowledged: false, title: "a", ts: T0 - H }]);
  const s1 = await attente({ now: T0 });
  const s2 = await attente({ now: T0 + 30_000 });
  assert.equal(s1.generatedAt, T0);
  assert.equal(s2.generatedAt, s1.generatedAt, "sous 60 s : l'instantané est celui du cache");
  assert.equal(b.lectures(), 1, "une seule lecture des sources");
  const s3 = await attente({ now: T0 + 61_000 });
  assert.equal(s3.generatedAt, T0 + 61_000, "après 60 s : recalcul");
  assert.equal(b.lectures(), 2);
  const s4 = await attente({ now: T0 + 62_000, force: true });
  assert.equal(s4.generatedAt, T0 + 62_000, "force : recalcul même sous la minute");
  assert.equal(b.lectures(), 3);
  _resetAttenteForTests();
});

test("un événement à la bascule : le SSE « attente » part une fois quand la liste de clés change, jamais quand elle est stable", async () => {
  const b = banc([{ id: "a1", level: "high", acknowledged: false, title: "a", ts: T0 - H }]);
  await attente({ now: T0 });
  assert.deepEqual(b.diffusions, [], "premier calcul : rien à comparer, pas d'événement");
  await attente({ now: T0 + 61_000 });
  assert.deepEqual(b.diffusions, [], "même liste de clés : silence");
  b.etat.alerts = [...b.etat.alerts, { id: "a2", level: "critical", acknowledged: false, title: "b", ts: T0 }];
  const s = await attente({ now: T0 + 122_000 });
  assert.equal(s.count, 2);
  assert.deepEqual(b.diffusions, [["attente", { n: 2 }]], "la liste a changé : un événement, avec le comptage seulement");
  await attente({ now: T0 + 183_000 });
  assert.equal(b.diffusions.length, 1, "stable à nouveau : pas de second événement");
  b.etat.alerts = [];
  await attente({ now: T0 + 244_000 });
  assert.deepEqual(b.diffusions.at(-1), ["attente", { n: 0 }], "retour à vide : c'est aussi une bascule");
  _resetAttenteForTests();
});
