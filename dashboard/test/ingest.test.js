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
import { ingestOne, ingestState } from "../server/ingest.js";
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
  assert.equal(ingestState().lastSeenIso, futur);
});

test("la marque d'eau ne RECULE jamais sur un événement plus ancien", () => {
  const haut = new Date(Date.now() + 60_000).toISOString();
  ingestOne(ligne({ received_at: haut }));
  assert.equal(ingestState().lastSeenIso, haut);
  ingestOne(ligne({ received_at: new Date(Date.now() - 3600_000).toISOString() }));
  assert.equal(ingestState().lastSeenIso, haut,
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
  assert.equal(ingestState().lastSeenIso, futur,
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
  assert.equal(st.lastSeenIso, futur);
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
