// ÉCHANTILLONNAGE PONDÉRÉ (2026-09-19) — la moitié PILOTAGE du correctif.
//
// `telemetry.js` ne garde plus qu'une lecture réussie sur dix (`api` http 200) et
// qu'une mesure `perf` sur dix : la table pesait 43 % de la base pour dix comptes.
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
