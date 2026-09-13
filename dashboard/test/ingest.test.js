// ═══════════════════════════════════════════════════════════════════════════
// INGESTION — le point de passage unique, et le plus coûteux à casser.
//
// Tout ce que le centre de pilotage sait de la production entre par
// `ingestOne` : l'historique du boot, le realtime, et le polling de secours.
// Une erreur ici n'affiche pas un panneau faux — elle rend le pilotage AVEUGLE,
// et un pilotage aveugle ressemble exactement à une application sans problème.
// C'est le pire mode de panne du produit, et il n'était couvert par rien.
//
// Quatre invariants sont figés ici :
//   1. le canari synthétique ne pollue JAMAIS les données produit ;
//   2. …mais il fait quand même avancer la marque d'eau du polling — SANS jamais
//      toucher celle qui sert à afficher la fraîcheur ;
//   3. la déduplication par `event_id` tient (realtime + polling voient le même
//      événement deux fois — par construction, pas par accident) ;
//   4. une ligne malformée ne fait pas tomber l'ingestion.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestOne, ingestState, canonIso } from "../server/ingest.js";
import { store } from "../server/store.js";
import { isSyntheticCanary } from "../server/observation.js";
import { normalize } from "../server/store.js";

let n = 0;
const uniq = (p) => `${p}_${Date.now().toString(36)}_${n++}`;

function ligne(extra = {}) {
  return {
    event_id: uniq("ev"),
    type: "action",
    action: "like",
    env: "production",
    user_id: uniq("u"),
    session_id: uniq("s"),
    received_at: new Date().toISOString(),
    ...extra,
  };
}

function canari(extra = {}) {
  return ligne({
    type: "lifecycle",
    action: "sentinel_observation_canary",
    meta: { synthetic: true },
    ...extra,
  });
}

test("un événement normal entre dans le store et devient visible", () => {
  const avant = store.events.length;
  const row = ligne({ action: "publish_post" });
  ingestOne(row);
  assert.equal(store.events.length, avant + 1);
  assert.equal(store.events.at(-1).event_id, row.event_id);
});

test("le canari synthétique n'entre JAMAIS dans les données produit", () => {
  const avant = store.events.length;
  ingestOne(canari());
  assert.equal(store.events.length, avant,
    "le canari est un événement de service : compté dans les KPI, les bugs ou " +
    "les appareils, il fabriquerait un utilisateur fantôme actif en permanence.");
  // …et il est bien RECONNU comme tel : sans cette reconnaissance, l'exclusion
  // ci-dessus tiendrait pour une autre raison (par ex. un filtre d'environnement)
  // et ce test passerait sans rien prouver.
  assert.equal(isSyntheticCanary(normalize(canari())), true);
  // L'état de santé publié par `observationSnapshot()` n'est PAS asservi ici :
  // sans Supabase configuré il rend NOT_CONFIGURED quoi qu'il arrive. Ce que ce
  // fichier prouve, c'est l'isolement du canari, pas la mesure de bout en bout.
});

test("le canari fait quand même avancer la marque d'eau du polling", () => {
  // Contre-intuitif mais essentiel : le polling de secours redemande tout ce qui
  // est postérieur à `lastSeenIso`. Si le canari — inséré toutes les 15 min — ne
  // la faisait pas avancer, chaque cycle le re-lirait indéfiniment.
  const futur = new Date(Date.now() + 5_000).toISOString();
  ingestOne(canari({ received_at: futur }));
  assert.equal(ingestState().lastSeenIso, canonIso(futur), "forme canonique : 6 décimales, Z");
});

test("la marque d'eau ne RECULE jamais sur un événement plus ancien", () => {
  const haut = new Date(Date.now() + 60_000).toISOString();
  ingestOne(ligne({ received_at: haut }));
  assert.equal(ingestState().lastSeenIso, canonIso(haut));
  ingestOne(ligne({ received_at: new Date(Date.now() - 3600_000).toISOString() }));
  assert.equal(ingestState().lastSeenIso, canonIso(haut),
    "un événement en retard ferait redemander une heure de données à chaque cycle");
});

test("le canari ne fait PAS avancer la FRAÎCHEUR affichée", () => {
  // Deux marques d'eau, deux questions — et les confondre a produit un vrai
  // défaut, observé en production le 2026-08-30 : l'en-tête annonçait « dernier
  // signal il y a 5 min » (la période du canari) pendant que le dernier signal
  // réel datait d'une heure et cinq minutes. Un pilotage aveugle qui a l'air
  // vivant est plus dangereux qu'un pilotage manifestement muet : c'est
  // exactement la panne que cet écran est censé rendre visible.
  const avant = ingestState().lastRealSeenIso;
  const futur = new Date(Date.now() + 120_000).toISOString();
  ingestOne(canari({ received_at: futur }));
  assert.equal(ingestState().lastSeenIso, canonIso(futur),
    "celle du polling doit avancer — sinon le canari est relu à chaque cycle");
  assert.equal(ingestState().lastRealSeenIso, avant,
    "le canari est un événement de service : il ne prouve AUCUN trafic réel");
});

test("un événement RÉEL fait avancer les DEUX marques d'eau", () => {
  // Le pendant du test précédent : sans lui, on pourrait figer `lastRealSeenIso`
  // à null et les deux assertions ci-dessus passeraient sans rien prouver.
  const futur = new Date(Date.now() + 180_000).toISOString();
  ingestOne(ligne({ received_at: futur }));
  const st = ingestState();
  assert.equal(st.lastSeenIso, canonIso(futur));
  assert.equal(st.lastRealSeenIso, futur);
});

test("déduplication : le realtime et le polling livrent le même événement", () => {
  const row = ligne();
  const avant = store.events.length;
  ingestOne(row);              // arrivée par le realtime
  ingestOne({ ...row });       // la même, rattrapée par le polling 5 s plus tard
  assert.equal(store.events.length, avant + 1,
    "sans dédup, chaque like compterait double dans tous les compteurs");
});

test("une ligne malformée n'interrompt pas l'ingestion", () => {
  // Les consommateurs en aval (alertes, interactions, traçage) sont appelés dans
  // des `try` : ce test vérifie le contrat, pas la politesse. Une exception qui
  // remonterait ici tuerait l'abonnement realtime pour de bon.
  const avant = store.events.length;
  assert.doesNotThrow(() => ingestOne({
    event_id: uniq("bad"), env: "production",
    type: "error", action: null, meta: null,
    received_at: "pas-une-date", message: "x".repeat(5000),
    duration_ms: "beaucoup", http_status: {},
  }));
  assert.equal(store.events.length, avant + 1, "l'événement doit être conservé malgré sa forme");
});

test("les événements hors production sont écartés (runs e2e, dev local)", () => {
  const avant = store.events.length;
  ingestOne(ligne({ env: "development" }));
  assert.equal(store.events.length, avant,
    "un run e2e crée des milliers de faux appareils : ils ne doivent jamais " +
    "atteindre les compteurs de testeurs réels.");
});

// ── Le canal Realtime du pilotage est PRIVÉ (2026-09-12) ────────────────────
// Le projet Supabase n'accepte plus que des canaux privés (« Allow public
// access » OFF, geste ③ de l'ouverture publique). Le verrou du dépôt ne
// couvrait que les `supa.channel(` de l'app : ce canal-ci, en `admin.channel(`,
// est resté public et a été refusé toutes les 14 s pendant neuf heures
// (« PrivateOnly: This project only allows private channels »), le pilotage
// vivant sur le seul polling de secours. Mutation : retirer `private: true`
// rougit ce test — et mesuré sur le vrai projet : public → CHANNEL_ERROR,
// privé → SUBSCRIBED en 0,9 s avec service_role.
test("le canal Realtime du pilotage est ouvert en private: true, et son nom n'a pas bougé", async () => {
  const { REALTIME_TOPIC, REALTIME_CHANNEL_OPTS } = await import("../server/ingest.js");
  assert.equal(REALTIME_TOPIC, "dash:telemetry");
  assert.equal(REALTIME_CHANNEL_OPTS?.config?.private, true,
    "sans private: true, le projet refuse le canal et le pilotage ne vit plus que du polling");
});

test("l'état exposé à l'écran porte le statut Realtime et le MOTIF du dernier refus", () => {
  const s = ingestState();
  assert.ok("realtimeStatus" in s, "sans le statut, « Secours » ne dit pas pourquoi");
  assert.ok("realtimeLastError" in s, "neuf heures de CHANNEL_ERROR n'ont jamais dit « PrivateOnly »");
});

// ── Marque d'eau : microsecondes, lignes rejetées, canari relu (2026-09-13) ──
// Trois défauts mesurés par la revue contradictoire : (1) la marque tronquée à
// la milliseconde relisait la dernière ligne (microsecondes > .000) à chaque
// tour de 5 s et réécrivait observation.json toute la nuit ; (2) une page de
// 500 lignes REJETÉES (env≠production) ne la faisait pas avancer → figée ;
// (3) un canari relu était ré-observé. Mutations : `canonIso` rendant 3 décimales
// rougit « microsecondes » ; avancer la marque APRÈS le rejet rougit « rejetée ».
test("canonIso : PostgREST (+00:00, 1 à 6 décimales) et le semis (Z, 3 décimales) donnent la même forme comparable", () => {
  assert.equal(canonIso("2026-09-12T19:50:13.26+00:00"), "2026-09-12T19:50:13.260000Z");
  assert.equal(canonIso("2026-09-12T19:50:13.260123+00:00"), "2026-09-12T19:50:13.260123Z");
  assert.equal(canonIso("2026-09-12T19:50:13.260Z"), "2026-09-12T19:50:13.260000Z");
  assert.equal(canonIso("2026-09-12T19:50:13Z"), "2026-09-12T19:50:13.000000Z");
  assert.ok(canonIso("2026-09-12T19:50:13.260123+00:00") > canonIso("2026-09-12T19:50:13.260Z"), "la microseconde compte : sinon la ligne est relue à chaque tour");
  assert.equal(canonIso("2026-09-12T21:50:13.5+02:00"), "2026-09-12T19:50:13.500000Z", "hors UTC : repli millisecondes");
  assert.equal(canonIso("pas-une-date"), null);
});

test("une ligne REJETÉE (env≠production) fait quand même avancer la marque de reprise", () => {
  const futur = new Date(Date.now() + 240_000).toISOString();
  const avantReal = ingestState().lastRealSeenIso;
  ingestOne(ligne({ env: "development", received_at: futur }));
  assert.equal(ingestState().lastSeenIso, canonIso(futur), "sinon une page de 500 lignes e2e fige le polling pour de bon");
  assert.equal(ingestState().lastRealSeenIso, avantReal, "mais la fraîcheur réelle ne bouge pas : rien d'accepté");
});

test("la marque garde les MICROSECONDES de la ligne lue", () => {
  const base = new Date(Date.now() + 300_000).toISOString().replace("Z", "");
  ingestOne(ligne({ received_at: base + "123+00:00" }));
  assert.equal(ingestState().lastSeenIso, base + "123Z");
});

test("un canari relu (recouvrement du polling) n'est observé qu'une fois", async () => {
  const { observationSnapshot } = await import("../server/observation.js");
  const futur = new Date(Date.now() + 360_000).toISOString();
  const row = canari({ received_at: futur });
  ingestOne(row);
  const apres1 = JSON.stringify(observationSnapshot().canary || {});
  ingestOne(row);
  const apres2 = JSON.stringify(observationSnapshot().canary || {});
  assert.equal(apres2, apres1, "une seconde lecture de la même ligne ne réécrit pas l'observation");
});

test("l'état expose le polling mesuré et un verdict « source vivante »", () => {
  const s = ingestState();
  assert.ok(s.polling && "ok" in s.polling && "failStreak" in s.polling && "lastError" in s.polling);
  assert.equal(typeof s.ingestAlive, "boolean");
});
