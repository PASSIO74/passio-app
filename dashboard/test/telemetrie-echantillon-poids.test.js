// ÉCHANTILLONNAGE PONDÉRÉ (2026-09-19) — la moitié PILOTAGE du correctif.
//
// `telemetry.js` ne garde plus qu'une lecture réussie sur dix (`api` http 200) —
// et RIEN D'AUTRE : la table pesait 43 % de la base pour dix comptes. (Le premier
// jet échantillonnait aussi `perf` ; c'était une erreur de fond, arrêtée par
// `perf-ios.spec.js` ⑧ : 38 % des lignes `perf` sont des `ios_stat_*`, donc DÉJÀ
// des agrégats, et `page_load`/`ios_context` sont un recensement — on ne résume
// pas un résumé, on le perd. `ECH_PERF = 1`.)
// Les ÉCHECS, eux, sont gardés entiers (un 401 est un `api`, donc hors
// `CRITICAL_TYPE`). Sans pondération, le pilotage verrait donc dix fois trop
// d'erreurs pour un succès, et `health()` basculerait en « Critique » sur une
// production saine. Ce banc mesure exactement ça.
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, normalize, poidsEvenement } from "../server/store.js";

// ⚠️ PAS D'ISOLATION ICI, ET C'EST DIT PLUTÔT QUE SIMULÉ. La première rédaction
// appelait `store.reset?.()` — méthode qui N'EXISTE PAS : la ligne ressemblait à
// une remise à zéro et n'en était pas une (relevé par `audit-passio`). Les cas
// ci-dessous ne lisent que des événements qu'ils fabriquent eux-mêmes, ou
// calculent à la main sur leur propre tableau ; le seul qui interroge le store
// (④) borne sa lecture à SA fenêtre. Un jour où ce ne sera plus vrai, il faudra
// une vraie isolation, pas un appel optionnel qui ne fait rien.

let n = 0;
function ev(over = {}) {
  n++;
  const t = new Date().toISOString();
  return normalize({
    event_id: "ep" + n + "_" + Math.random(), received_at: t, client_ts: t,
    type: "api", action: "GET rest/v1/posts", endpoint: "rest/v1/posts",
    status: "ok", severity: "info", http_status: 200, duration_ms: 80,
    user_id: "u_ep", session_id: "s_ep", device_id: "d_ep",
    platform: "android", browser: "chrome", app_version: "dev", env: "production",
    ...over,
  });
}

test("① `poidsEvenement` : absent = 1, 10 = 10 — l'historique d'avant le 19/09 compte pour lui-même", () => {
  assert.equal(poidsEvenement({ meta: {} }), 1, "meta vide → poids 1");
  assert.equal(poidsEvenement({}), 1, "pas de meta → poids 1");
  assert.equal(poidsEvenement(null), 1, "objet absent → poids 1");
  assert.equal(poidsEvenement({ meta: { ech: 10 } }), 10);
});

test("② une valeur absurde venue du client ne décide JAMAIS d'un multiplicateur", () => {
  for (const mauvais of [0, -5, "beaucoup", NaN, Infinity, 100000, null, {}, []]) {
    assert.equal(poidsEvenement({ meta: { ech: mauvais } }), 1, `ech=${JSON.stringify(mauvais)} doit retomber à 1`);
  }
});

test("③ LE DÉFAUT QUE LE LOT AURAIT CRÉÉ : 1 succès pondéré 10 + 1 échec = 10 %, jamais 50 %", () => {
  const evts = [
    ev({ meta: { mode: "prod", ech: 10 } }),                                  // 9 autres succès non envoyés
    ev({ status: "error", severity: "error", http_status: 401, meta: { mode: "prod" } }),
  ];
  const brut = evts.filter((e) => e.status === "error").length / evts.length;
  const pondere =
    evts.reduce((a, e) => a + (e.status === "error" ? poidsEvenement(e) : 0), 0) /
    evts.reduce((a, e) => a + poidsEvenement(e), 0);

  assert.equal(brut, 0.5, "sans poids, le taux d'erreur brut serait de 50 %");
  assert.ok(Math.abs(pondere - 1 / 11) < 1e-9, `pondéré ≈ 9 %, obtenu ${pondere}`);
  // 50 % franchit le seuil « Critique » (40 %) de health() ; 9 % ne franchit
  // même pas « Légèrement dégradé » (5 %)… si, tout juste — mais pas « Dégradé ».
  assert.ok(brut > 0.4, "le brut aurait fait basculer le bandeau en Critique");
  assert.ok(pondere < 0.15, "le pondéré reste sous le seuil Dégradé");
});

test("④ `health()` sur la MÊME chronologie ne dit pas « Critique »", () => {
  // 10 lectures gardées (poids 10 chacune = 100 réelles) + 2 échecs réels.
  for (let i = 0; i < 10; i++) store.add(ev({ meta: { mode: "prod", ech: 10 } }));
  for (let i = 0; i < 2; i++) store.add(ev({ status: "error", severity: "error", http_status: 401, meta: { mode: "prod" } }));
  const h = store.health();
  // 2 / 102 ≈ 2 %. Sans poids : 2 / 12 ≈ 17 % → « Dégradé » fabriqué de toutes pièces.
  assert.ok(h.apiErrorRate <= 5, `taux attendu ~2 %, obtenu ${h.apiErrorRate} %`);
  assert.notEqual(h.level, "critical");
  assert.notEqual(h.level, "degraded");
});

test("⑤ les ÉCRITURES ne sont jamais échantillonnées : un 201 n'a pas de poids, il compte pour un", () => {
  // Contrat côté client (`tauxEchantillon`) : seul le 200 est échantillonné.
  // Ici on vérifie le corollaire côté pilotage — une ligne 201 sans `ech` vaut 1,
  // donc les compteurs d'activité (publications, messages, commentaires) restent
  // exacts. C'est la raison pour laquelle le lot n'échantillonne pas les 2xx en bloc.
  const publication = ev({ http_status: 201, endpoint: "rest/v1/posts", meta: { mode: "prod" } });
  assert.equal(poidsEvenement(publication), 1);
});

test("⑥ `timeseries()` pondère la LATENCE, pas seulement le compte — sinon la courbe ment sous le tableau", () => {
  // ⚠️ CE CAS EXISTE PARCE QUE LA PONDÉRATION S'ÉTAIT ARRÊTÉE À MI-CHEMIN UNE
  // SECONDE FOIS (contre-revue adversariale du 2026-09-19). `b.api` était pondéré,
  // `b.latencySum`/`b.latencyN` ne l'étaient pas, et le commentaire posé au-dessus
  // le justifiait par « une moyenne sur un échantillon est déjà la bonne
  // estimation » — affirmation que le MÊME commit réfutait 160 lignes plus bas,
  // dans `apiPerf` : l'échantillon n'est pas uniforme (seuls les 200 sont tirés),
  // donc la population survivante penche vers les échecs, qui sont lents.
  // Et c'est la moitié la plus VISIBLE qui mentait : `#perfChart` trace cette
  // série, juste au-dessus du tableau `perfRows`, lui pondéré — deux chiffres
  // contradictoires sur un même écran.
  const s2 = new (Object.getPrototypeOf(store).constructor)();
  // 1 lecture rapide GARDÉE qui en représente 10 (80 ms) + 1 échec lent entier (2000 ms).
  s2.add(ev({ duration_ms: 80, meta: { mode: "prod", ech: 10 } }));
  s2.add(ev({ duration_ms: 2000, status: "error", severity: "error", http_status: 500, meta: { mode: "prod" } }));
  const b = s2.timeseries(5).filter((x) => x.api > 0);
  assert.equal(b.length, 1, "les deux lignes tombent dans le même bucket");
  // Pondérée : (80×10 + 2000×1) / 11 ≈ 255 ms — la réalité.
  // Non pondérée : (80 + 2000) / 2 = 1040 ms, soit QUATRE FOIS trop.
  assert.ok(b[0].latency < 400, `latence pondérée attendue ~255 ms, obtenue ${b[0].latency} ms`);
  assert.equal(b[0].api, 11, "le compte d'appels reste pondéré");
  // `api ⊆ events` par construction : un bucket qui rendrait `api > events` est
  // un état impossible, et c'est ce que l'ancien `b.events++` produisait.
  assert.ok(b[0].events >= b[0].api, `events (${b[0].events}) ne peut pas être sous api (${b[0].api})`);
});
