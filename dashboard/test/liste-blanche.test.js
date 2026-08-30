// ═══════════════════════════════════════════════════════════════════════════
// LISTES BLANCHES — le trou que la chaîne de prototypes ouvre dans une garde.
//
// `TABLE[cle]` ne lit pas que la table : il remonte la chaîne de prototypes.
// `TABLE["constructor"]`, `"toString"`, `"valueOf"`, `"hasOwnProperty"` et
// `"__proto__"` rendent tous quelque chose de VRAI sur une table qui ne les
// déclare pas. Une garde écrite `if (!TABLE[cle]) return refus;` a donc cinq
// clés qui passent, et rien à la lecture ne le laisse deviner.
//
// Ce fichier vérifie le correctif là où la clé vient de l'EXTÉRIEUR — pas la
// fonction seule, mais les deux appelants réels :
//   • `tests.runSuite(id)` — id envoyé dans le corps de la requête ;
//   • `interactions.onEvent(ev)` — `ev.action` vient de la télémétrie, donc du
//     navigateur de n'importe quel compte.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { entree } from "../server/liste-blanche.js";
import { runSuite, TEST_SUITES } from "../server/tests.js";
import * as interactions from "../server/interactions.js";
import * as traces from "../server/traces.js";

const HERITEES = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"];

test("le défaut existe bien : l'accès direct rend une valeur pour ces clés", () => {
  // On fige la RAISON du correctif, pas seulement son effet. Si un jour ce test
  // échoue, c'est que le moteur a changé — et il faudra relire la garde.
  const trouvees = HERITEES.filter((k) => TEST_SUITES[k] !== undefined);
  assert.ok(trouvees.length >= 4,
    "l'accès direct devrait remonter la chaîne de prototypes : " + trouvees.join(", "));
});

test("entree() ne rend QUE des propriétés propres", () => {
  for (const k of HERITEES) assert.equal(entree(TEST_SUITES, k), undefined, `clé héritée acceptée : ${k}`);
  assert.equal(entree(TEST_SUITES, "smoke")?.cmd, "npm", "une vraie entrée doit passer");
  // Formes hostiles : rien ne doit lever.
  assert.equal(entree(TEST_SUITES, ""), undefined);
  assert.equal(entree(TEST_SUITES, null), undefined);
  assert.equal(entree(TEST_SUITES, 0), undefined);
  assert.equal(entree(TEST_SUITES, {}), undefined);
  assert.equal(entree(null, "smoke"), undefined);
});

test("runSuite refuse une clé héritée — et la refuse PROPREMENT", async () => {
  for (const k of HERITEES) {
    await assert.rejects(async () => runSuite(k, "benjamin"), (e) => {
      // 400 « hors liste blanche », jamais un 500 venu d'un `undefined.join()`
      // trois lignes plus bas : la différence entre une garde et un accident.
      assert.equal(e.code, 400, `mauvais code pour « ${k} » : ${e.code} — ${e.message}`);
      assert.match(e.message, /liste blanche/);
      return true;
    }, `clé héritée acceptée par runSuite : ${k}`);
  }
});

test("une action de télémétrie inventée n'entre pas dans le journal des interactions", () => {
  // Le cas qui compte : `ev.action` est écrit par le navigateur. Avec l'accès
  // direct, « constructor » était traité comme une émission connue — un
  // enregistrement fantôme entrait dans le tampon circulaire, en chassait un
  // vrai, et déclenchait une re-lecture du panneau. Ni compté ni affiché : le
  // genre de bruit qu'on ne voit pas en regardant l'écran.
  for (const k of HERITEES) {
    assert.equal(
      interactions.onEvent({ type: "action", action: k, event_id: "faux_" + k, ts: Date.now(), meta: {} }),
      false, `action héritée acceptée à l'émission : ${k}`);
    assert.equal(
      interactions.onEvent({ type: "rt_recv", action: k, event_id: "faux2_" + k, ts: Date.now(), meta: {} }),
      false, `action héritée acceptée à la réception : ${k}`);
  }
  // Contre-test : une action RÉELLE passe toujours.
  assert.equal(
    interactions.onEvent({ type: "action", action: "like_post", event_id: "vrai_1", ts: Date.now(),
      meta: { postId: "p1" }, device_id: "d1" }),
    true, "une action connue doit continuer d'entrer");
});

test("idem pour le traçage : une action inventée n'apparie aucun flux", () => {
  for (const k of HERITEES) {
    assert.equal(
      traces.onEvent({ type: "rt_recv", action: k, event_id: "t_" + k, ts: Date.now(), meta: { convId: "c1" } }),
      false, `action héritée acceptée par le traçage : ${k}`);
  }
});
