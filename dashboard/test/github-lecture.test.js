// ═══════════════════════════════════════════════════════════════════════════
// LECTURE GITHUB — le client commun : cache par URL, ETag, budget sans jeton,
// coupure en test.
//
// Défaut mesuré (2026-09-18) : exploitation.js lisait l'API anonyme (60/h par
// IP) sans ETag ni budget ; un 403 devenait « unknown » en silence. Ajouter la
// chaîne autonome (~9 appels par tour) aurait vidé le quota.
//
// Mutations éprouvées (chacune rougit le test nommé) :
//   · ne plus servir le cache sous 10 min                → « cache »
//   · oublier If-None-Match / traiter 304 comme erreur   → « ETag »
//   · compter les 304 dans le budget                     → « ETag »
//   · budget sans plafond                                → « budget »
//   · lire le réseau malgré DASH_GITHUB_READ=off         → « coupure »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

const gl = await import("../server/github-lecture.js");
const { lireGithub, quotaGithub, budgetRestant, _viderCacheGithubPourTests } = gl;

const NOW = Date.parse("2026-09-18T12:00:00Z");
function serveur({ etag = "W/\"abc\"", remaining = "55" } = {}) {
  const appels = [];
  const fetchImpl = async (url, opts) => {
    appels.push({ url, headers: (opts && opts.headers) || {} });
    const ifNone = appels.at(-1).headers["If-None-Match"];
    if (ifNone && ifNone === etag) return { ok: false, status: 304, headers: { get: (n) => (n === "x-ratelimit-remaining" ? remaining : null) }, json: async () => { throw new Error("pas de corps"); } };
    return { ok: true, status: 200, headers: { get: (n) => (n === "etag" ? etag : n === "x-ratelimit-remaining" ? remaining : null) }, json: async () => ({ n: appels.length }) };
  };
  return { appels, fetchImpl };
}

test("cache : la même URL sous 10 min ne refait pas de requête ; après, elle est revalidée", async () => {
  _viderCacheGithubPourTests();
  const s = serveur();
  const r1 = await lireGithub("/issues?state=open", { fetchImpl: s.fetchImpl, now: NOW });
  const r2 = await lireGithub("/issues?state=open", { fetchImpl: s.fetchImpl, now: NOW + 5 * 60_000 });
  assert.equal(s.appels.length, 1, "cache");
  assert.equal(r1.deCache, false); assert.equal(r2.deCache, true);
  assert.deepEqual(r2.data, r1.data);
  await lireGithub("/issues?state=open", { fetchImpl: s.fetchImpl, now: NOW + 11 * 60_000 });
  assert.equal(s.appels.length, 2, "après 10 min, on revalide");
});

test("ETag : la revalidation envoie If-None-Match, un 304 rend la donnée en cache et ne coûte rien au budget", async () => {
  _viderCacheGithubPourTests();
  const s = serveur();
  await lireGithub("/pulls", { fetchImpl: s.fetchImpl, now: NOW });
  const r = await lireGithub("/pulls", { fetchImpl: s.fetchImpl, now: NOW + 11 * 60_000 });
  assert.equal(s.appels[1].headers["If-None-Match"], "W/\"abc\"");
  assert.equal(r.revalide, true);
  assert.deepEqual(r.data, { n: 1 }, "la donnée est celle du cache, un 304 n'a pas de corps");
  assert.equal(quotaGithub(NOW + 11 * 60_000).comptees1h, 1, "le 304 n'est pas compté");
  assert.equal(quotaGithub().remaining, 55, "X-RateLimit-Remaining est lu");
});

test("budget : sans jeton, au plus 40 requêtes comptées par heure ; au-delà, cache périmé ou erreur nommée « budget » — jamais un faux vert", async () => {
  _viderCacheGithubPourTests();
  let n = 0;
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ i: ++n }) });
  for (let i = 0; i < 40; i++) await lireGithub("/u/" + i, { fetchImpl, now: NOW + i });
  assert.equal(budgetRestant(NOW + 100), 0);
  const refus = await lireGithub("/u/nouveau", { fetchImpl, now: NOW + 200 });
  assert.match(refus.erreur, /budget/);
  assert.equal(n, 40, "aucune requête au-delà du budget");
  const perime = await lireGithub("/u/0", { fetchImpl, now: NOW + 20 * 60_000, force: true });
  assert.equal(perime.perime, true, "l'URL déjà lue est servie depuis le cache, marquée périmée");
  assert.deepEqual(perime.data, { i: 1 });
  const plusTard = await lireGithub("/u/nouveau", { fetchImpl, now: NOW + 61 * 60_000 });
  assert.equal(plusTard.erreur, undefined, "l'heure glissante libère le budget");
});

test("une réponse non-2xx ou une exception réseau devient une erreur nommée, mise en cache 5 min, sans exception", async () => {
  _viderCacheGithubPourTests();
  let n = 0;
  const f403 = async () => { n++; return { ok: false, status: 403, headers: { get: () => "0" }, json: async () => ({}) }; };
  const r = await lireGithub("/x", { fetchImpl: f403, now: NOW });
  assert.equal(r.erreur, "HTTP 403");
  await lireGithub("/x", { fetchImpl: f403, now: NOW + 60_000 });
  assert.equal(n, 1, "l'erreur est en cache : on ne martèle pas GitHub");
  const casse = async () => { throw new Error("fetch failed"); };
  const r2 = await lireGithub("/y", { fetchImpl: casse, now: NOW });
  assert.match(r2.erreur, /fetch failed/);
  assert.equal(quotaGithub().lastError, "fetch failed");
});

test("coupure : DASH_GITHUB_READ=off (préchargement des tests) refuse le réseau réel, mais un fetchImpl injecté reste possible", async () => {
  _viderCacheGithubPourTests();
  assert.equal(process.env.DASH_GITHUB_READ, "off");
  const r = await lireGithub("/z", { now: NOW });
  assert.match(r.erreur, /désactivée/);
  assert.equal(quotaGithub().actif, false);
});
