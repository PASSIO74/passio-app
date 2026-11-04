// Verrou de la requête du générateur de DDL (scripts/schema-executable.js) —
// vérification finale de R25, 2026-11-04.
//
// Dans .github/workflows/sauvegarde.yml, l'étape « Archiver le schéma »
// précède Vérifier, Chiffrer et Déposer. Un seul 429 (« ThrottlerException »,
// l'API de gestion plafonne vers 60 appels par minute) ou un seul 5xx faisait
// échouer le générateur, donc sauter le dépôt : la nuit perdait son archive,
// données comprises. Ses 20 requêtes sont des SELECT de catalogue, qu'on peut
// rejouer sans effet : deux reprises sur un 429, une sur un 5xx ou une panne
// réseau. Tout autre refus lève aussitôt : un 401 n'est pas passager.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { requete, PAUSES } = require("../../scripts/schema-executable.js");

/** Un faux fetch qui rend, dans l'ordre, les réponses demandées (un nombre = statut, une Error = panne). */
function scenario(...reponses) {
  const appels = [];
  const fetchFn = async (url, init) => {
    appels.push({ url, corps: JSON.parse(init.body) });
    const r = reponses[Math.min(appels.length - 1, reponses.length - 1)];
    if (r instanceof Error) throw r;
    return new Response(r === 200 ? JSON.stringify([{ ok: 1 }]) : `refus ${r}`, { status: r });
  };
  return { appels, fetchFn };
}
function options(s) {
  const pauses = [];
  return { pauses, opts: { fetchFn: s.fetchFn, attendre: async (ms) => { pauses.push(ms); }, journal: () => {} } };
}

test("① un 200 : une seule requête, aucune pause, le SQL envoyé tel quel", async () => {
  const s = scenario(200); const o = options(s);
  assert.deepEqual(await requete("sbp_x", "select 1", o.opts), [{ ok: 1 }]);
  assert.equal(s.appels.length, 1);
  assert.equal(s.appels[0].corps.query, "select 1");
  assert.match(s.appels[0].url, /\/database\/query$/);
  assert.deepEqual(o.pauses, []);
});

test("② un 429 puis un 200 : la fenêtre suivante est attendue, la requête aboutit (RÉINJECTION : le premier 429 coûtait l'archive)", async () => {
  const s = scenario(429, 200); const o = options(s);
  assert.deepEqual(await requete("sbp_x", "select 1", o.opts), [{ ok: 1 }]);
  assert.equal(s.appels.length, 2);
  assert.deepEqual(o.pauses, [PAUSES.trop]);
  assert.equal(PAUSES.trop, 61000, "la fenêtre du plafond, comme restaurer-donnees.js");
});

test("③ trois 429 de suite : deux reprises, puis l'erreur, qui garde le statut", async () => {
  const s = scenario(429, 429, 429, 200); const o = options(s);
  await assert.rejects(requete("sbp_x", "select 1", o.opts), /HTTP 429/);
  assert.equal(s.appels.length, 3);
  assert.deepEqual(o.pauses, [PAUSES.trop, PAUSES.trop]);
});

test("④ un 5xx passager : une reprise ; deux 5xx de suite : l'erreur", async () => {
  const s1 = scenario(503, 200); const o1 = options(s1);
  assert.deepEqual(await requete("sbp_x", "select 1", o1.opts), [{ ok: 1 }]);
  assert.deepEqual(o1.pauses, [PAUSES.panne]);
  const s2 = scenario(502, 500, 200); const o2 = options(s2);
  await assert.rejects(requete("sbp_x", "select 1", o2.opts), /HTTP 500/);
  assert.equal(s2.appels.length, 2);
});

test("⑤ une panne réseau : une reprise, puis la panne est rendue telle quelle", async () => {
  const s1 = scenario(new Error("ECONNRESET"), 200); const o1 = options(s1);
  assert.deepEqual(await requete("sbp_x", "select 1", o1.opts), [{ ok: 1 }]);
  const s2 = scenario(new Error("ECONNRESET"), new Error("ETIMEDOUT")); const o2 = options(s2);
  await assert.rejects(requete("sbp_x", "select 1", o2.opts), /ETIMEDOUT/);
  assert.equal(s2.appels.length, 2);
});

test("⑥ un refus qui n'est pas passager (401, 403, 400) lève AUSSITÔT, sans pause", async () => {
  for (const statut of [400, 401, 403, 404]) {
    const s = scenario(statut, 200); const o = options(s);
    await assert.rejects(requete("sbp_x", "select 1", o.opts), new RegExp(`HTTP ${statut}`));
    assert.equal(s.appels.length, 1, `HTTP ${statut} : une seule requête`);
    assert.deepEqual(o.pauses, []);
  }
});

test("⑦ les reprises sont comptées à part : un 429 puis un 5xx puis un 200 aboutit", async () => {
  const s = scenario(429, 503, 200); const o = options(s);
  assert.deepEqual(await requete("sbp_x", "select 1", o.opts), [{ ok: 1 }]);
  assert.deepEqual(o.pauses, [PAUSES.trop, PAUSES.panne]);
});
