// ═══════════════════════════════════════════════════════════════════════════
// INGESTION — connecte le magasin d'événements Supabase au store temps réel.
//   1. Charge l'historique récent (amorçage du flux).
//   2. Lit la suite par POLLING incrémental (service_role, toutes les POLL_MS).
//      ⚠️ C'est le chemin NOMINAL depuis le 2026-09-20, plus un filet : le canal
//      `postgres_changes` a été retiré parce que `telemetry_events` portait à
//      elle seule 91,4 % des changements que la base réplique, pour ce seul
//      abonné. Détail et retour arrière plus bas, au point 2 du démarrage.
// Chaque nouvel événement est normalisé, ajouté au store et diffusé en SSE.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";
import { config, supabaseReady } from "./config.js";
import { store, normalize } from "./store.js";
import { broadcast } from "./sse.js";
import { onEvent as alertsOnEvent } from "./alerts.js";
import { onEvent as interactionsOnEvent } from "./interactions.js";
import { onEvent as tracesOnEvent, sealExisting as tracesSealExisting } from "./traces.js";
import { isSyntheticCanary, observeSyntheticCanary, startObservation } from "./observation.js";
import { startReleaseRecorder } from "./release-recorder.js";

let interactionsDirty = false;
let tracesDirty = false;

let admin = null;
// ⚠️ DEUX marques d'eau, et il faut les deux — elles répondent à deux questions
// différentes que ce fichier confondait jusqu'au 2026-08-30.
//   • `lastSeenIso` : « à partir d'où reprendre le polling ». Le canari synthétique
//     DOIT la faire avancer, sinon chaque tour de polling relit les mêmes lignes.
//     Elle est semée une heure en arrière pour amorcer le premier tour.
//   • `lastRealSeenIso` : « quand un vrai signal est-il arrivé pour la dernière
//     fois ». Elle n'est JAMAIS semée et n'avance que sur un événement produit.
// L'en-tête du pilotage affichait la première sous le libellé « Fraîcheur —
// dernier signal » : il annonçait « il y a 5 min » (le canari, toutes les 15 min)
// alors que le dernier signal réel datait d'une heure. Un voyant qui a l'air
// vivant pendant que plus rien n'arrive est exactement la panne que ce pilotage
// est censé rendre visible.
let lastSeenIso = canonIso(new Date(Date.now() - 60 * 60_000).toISOString());
let lastRealSeenIso = null;
/** Cadence du polling d'ingestion. CHEMIN NOMINAL depuis le retrait du canal
 *  temps réel (2026-09-20) : 1,0 ms par lecture mesuré, 5 s suffisent à une
 *  console de supervision. Ne pas resserrer « pour compenser » : ce serait
 *  ajouter du coût pour une latence que personne ne perçoit. */
export const POLL_MS = 5000;

let realtimeOk = false;
let lastRealtimeStatus = null;
let realtimeLastError = "";

export function getAdmin() { return admin; }

// Injection d'un client Supabase FACTICE — tests uniquement. `accounts`,
// `signups`, `dbwatch` et `testusers` passent tous par `getAdmin()` : sans ce
// point d'entrée, aucun d'eux n'est atteignable par un test, et c'est
// `testusers.remove` — qui supprime des comptes avec la clé service_role — qui
// en pâtissait le plus. Ne JAMAIS l'appeler depuis le code de production :
// `startIngest` reste le seul chemin qui installe un vrai client.
export function _setAdminForTests(client) { admin = client; }
export function ingestState() {
  // `pollingOk` : le repli a réussi une lecture dans les 30 dernières secondes.
  // Sans lui, « Secours (polling 5 s) » s'affichait même quand plus rien n'était
  // ingéré depuis des heures (revue du 2026-09-13).
  const pollingOk = Boolean(poll.lastOkAt && Date.now() - poll.lastOkAt < 30_000);
  return {
    supabaseReady, realtimeOk, realtimeStatus: lastRealtimeStatus, realtimeLastError,
    // ⚠️ LE DISCRIMINANT QUI ÉVITE UNE ALARME PERMANENTE. Depuis le retrait du
    // canal (2026-09-20), `realtimeStatus` reste `null` — et `observation-alerts`
    // ne déclencherait donc pas, par le simple fait que `null` est falsy. Mais
    // un verrou qui tient PAR ACCIDENT finit par le dire : le jour où quelqu'un
    // initialise ce champ à `"IDLE"` pour faire joli, l'alerte « Realtime
    // décroché » se rallume pour toujours. On déclare donc l'intention.
    realtimeUtilise: false,
    polling: { ...poll, ok: pollingOk },
    // Une source vivante = polling qui lit (le realtime ne sert plus).
    ingestAlive: realtimeOk || pollingOk,
    lastSeenIso, lastRealSeenIso, buffered: store.events.length,
  };
}

// Exportée pour les tests : c'est le point de passage UNIQUE de tout événement
// entrant (historique, polling — et le realtime, du temps où il existait).
// Une erreur ici aveugle le
// pilotage entier, silencieusement — d'où `test/ingest.test.js`.
/**
 * Marque d'eau CANONIQUE à la microseconde (revue contradictoire du 2026-09-13).
 * PostgREST rend `received_at` en `…+00:00` avec 1 à 6 décimales ; l'ancienne
 * marque était `new Date(ts).toISOString()` — tronquée à la MILLISECONDE. Le
 * `gt("received_at", marque)` du polling relisait donc la dernière ligne (ses
 * microsecondes > .000) à CHAQUE tour de 5 s : la dédup du store l'absorbait,
 * mais le canari, lui, était ré-observé et `observation.json` réécrit toutes les
 * 5 s, toute la nuit, sur un disque plein. Forme canonique : 6 décimales, `Z` —
 * comparable en chaîne, acceptée par PostgREST. Hors UTC ou illisible : repli
 * millisecondes + "000".
 */
export function canonIso(raw) {
  const s = String(raw || "");
  const m = s.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|\+00:00)?$/);
  if (m && (m[3] || !/[+-]\d\d:\d\d$/.test(s))) return `${m[1]}.${(m[2] || "").padEnd(6, "0")}Z`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().replace("Z", "000Z");
}
/** Fait avancer la marque de reprise du polling — toute ligne LUE la fait avancer. */
function avancerMarque(raw) {
  const c = canonIso(raw);
  if (c && c > lastSeenIso) lastSeenIso = c;
}
// Canaris déjà observés : le recouvrement du polling (cf. pollIncrement) et le
// realtime livrent parfois la même ligne deux fois ; l'observation ne doit être
// écrite qu'une fois par canari.
const canarisVus = new Set();

export function ingestOne(row) {
  const ev = normalize(row);
  // ⚠️ La marque du polling avance sur TOUTE ligne lue — acceptée, rejetée
  // (env≠production, compte @passio-e2e.test) ou déjà vue. Avant, elle
  // n'avançait que sur une ligne acceptée : une page de 500 lignes rejetées la
  // FIGEAIT, et tout ce qui suivait restait invisible tant que le realtime était
  // mort (revue contradictoire du 2026-09-13).
  avancerMarque(row && row.received_at ? row.received_at : ev.ts ? new Date(ev.ts).toISOString() : null);
  // Le canari prouve la chaîne publique → DB → dashboard mais ne doit JAMAIS
  // polluer utilisateurs, sessions, KPI, bugs, alertes ou traces produit.
  if (isSyntheticCanary(ev)) {
    const id = ev.event_id || ev.correlation_id || ev.id || null;
    if (id && canarisVus.has(id)) return;
    if (id) { canarisVus.add(id); if (canarisVus.size > 200) canarisVus.delete(canarisVus.values().next().value); }
    observeSyntheticCanary(ev);
    return;
  }
  const isNew = store.add(ev);
  if (!isNew) return;
  if (ev.ts) {
    // `lastRealSeenIso` n'avance que sur un VRAI événement accepté (cf. en-tête).
    const iso = new Date(ev.ts).toISOString();
    if (!lastRealSeenIso || iso > lastRealSeenIso) lastRealSeenIso = iso;
  }
  broadcast("event", ev);
  try { alertsOnEvent(ev); } catch (e) { /* ignore */ }
  // Vérification cross-device des interactions : signal coalescé (le client
  // rappelle /api/interactions), pour ne pas rediffuser l'instantané à chaque like.
  try { if (interactionsOnEvent(ev)) interactionsDirty = true; } catch (e) { /* ignore */ }
  // Traçage bout-en-bout : chaîne de validation par action (même logique de
  // signal coalescé — le client rappelle /api/traces à réception).
  try { if (tracesOnEvent(ev)) tracesDirty = true; } catch (e) { /* ignore */ }
}

// Diffuse un signal « interactions à rafraîchir » au plus une fois par seconde.
setInterval(() => {
  if (!interactionsDirty) return;
  interactionsDirty = false;
  broadcast("interaction", { t: Date.now() });
}, 1000).unref();

// Signal « traces à rafraîchir » (coalescé, ≤ 1×/s).
setInterval(() => {
  if (!tracesDirty) return;
  tracesDirty = false;
  broadcast("trace", { t: Date.now() });
}, 1000).unref();

export async function startIngest() {
  // Ces deux sous-systèmes sont autonomes et ne dépendent pas de Claude.
  // Ils démarrent même si Supabase est absent afin d'exposer explicitement
  // NOT_CONFIGURED plutôt qu'un faux vert silencieux.
  startReleaseRecorder();
  startObservation().catch((e) => console.error("[observation] démarrage échoué:", e.message));

  if (!supabaseReady) {
    console.warn("[ingest] Supabase non configuré (SUPABASE_SERVICE_ROLE_KEY manquante). " +
      "Le dashboard démarre en mode LOCAL : instrumentez Passio et renseignez .env pour les données réelles.");
    return;
  }
  admin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  // 0) Comptes de test à EXCLURE (faux profils @passio-e2e.test) — avant tout ingest.
  await loadTestUids();
  setInterval(loadTestUids, 10 * 60_000).unref();   // rafraîchit toutes les 10 min

  // 1) Historique récent (les 1000 derniers événements).
  try {
    const { data, error } = await admin
      .from("telemetry_events")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    (data || []).reverse().forEach((row) => {
      const ev = normalize(row);
      // La marque de reprise avance sur toute ligne lue, au brut (microsecondes).
      avancerMarque(row.received_at);
      if (isSyntheticCanary(ev)) {
        const id = ev.event_id || ev.correlation_id || ev.id || null;
        if (id) canarisVus.add(id);
        observeSyntheticCanary(ev);
        return;
      }
      const accepte = store.add(ev);
      // Rejoue aussi l'historique dans le traçage : sinon l'onglet « Traçage des
      // actions » repart vide à chaque redémarrage du serveur.
      try { tracesOnEvent(ev); } catch (e) { /* ignore */ }
      if (accepte && ev.ts) {
        const iso = new Date(ev.ts).toISOString();
        if (!lastRealSeenIso || iso > lastRealSeenIso) lastRealSeenIso = iso;
      }
    });
    // …mais on scelle ces flux : un redémarrage ne doit PAS refaire sonner
    // toutes les alertes des dernières heures.
    const sealed = tracesSealExisting();
    console.log(`[ingest] ${(data || []).length} événements historiques chargés (${sealed} action(s) tracée(s), sans ré-alerte).`);
  } catch (e) {
    console.error("[ingest] chargement historique échoué:", e.message,
      "\n→ La table telemetry_events existe-t-elle ? Applique migrations/migration_telemetry.sql.");
  }

  // 2) LE TEMPS RÉEL A ÉTÉ RETIRÉ — 91 % DU TRAVAIL DE RÉPLICATION DE LA BASE
  //    VENAIT DE CE SEUL ABONNEMENT (2026-09-20).
  //
  // Mesuré (canal ① d'ADR-012, `pg_stat_user_tables`, cumul 129 jours) :
  // `telemetry_events` produit **481 554 changements** sur les **526 756** que
  // les douze tables publiées produisent en tout, soit **91,4 %**. Or le
  // décodage WAL de Realtime est le PREMIER poste de CPU de la base (68,9 % à
  // lui seul), et son coût est proportionnel au nombre de changements publiés.
  // L'unique abonné de cette table était CE fichier : un client, sur le poste
  // de l'éditeur. Neuf dixièmes du travail temps réel de la production
  // servaient donc un seul tableau de bord.
  //
  // ⚠️ ON NE DÉGRADE PAS EN SILENCE, ON CHANGE DE MÉCANISME. La migration du
  // 2026-09-19 avait raison d'écrire que retirer cette table « aurait éteint le
  // tableau de bord en direct, SANS une erreur » — il serait retombé sur son
  // polling de secours, donc le symptôme aurait été « c'est un peu en retard »,
  // jamais « c'est cassé ». Ce raisonnement tient toujours : c'est pourquoi le
  // polling cesse d'être un SECOURS pour devenir le chemin NOMINAL, et que
  // l'alerte « Realtime décroché » est désarmée explicitement plus bas — une
  // alarme qui crierait pour toujours sur un canal fermé exprès cesserait d'être
  // lue, et emporterait les vraies avec elle.
  //
  // ⚠️ LA CADENCE NE CHANGE PAS (5 s), ET C'EST DÉLIBÉRÉ. La tentation était de
  // la resserrer pour « compenser » ; mais ce polling est déjà mesuré à 1,0 ms
  // par lecture et 5 s suffisent très largement à une console de supervision.
  // Accélérer aurait ajouté du coût pour une latence que personne ne perçoit.
  //
  // ⚠️ LE CANARI N'EST PAS CONCERNÉ : il est observé par `ingestOne`, point de
  // passage UNIQUE de tout événement entrant (historique, realtime, polling).
  // Il vivait donc déjà sans le canal, et sa fenêtre est de 15 minutes.
  //
  // RETOUR ARRIÈRE : republier la table
  // (`alter publication supabase_realtime add table public.telemetry_events;`)
  // puis restaurer le canal retiré ici — voir l'historique git et
  // `migrations/migration_realtime_telemetry_2026-09-20.sql`.
  // ⚠️ Le nom de la fonction de création n'est PAS écrit ici : plusieurs verrous
  // cherchent ce jeton dans ce fichier pour vérifier qu'aucun canal public ne
  // revient, et un commentaire qui le cite les fait rougir sur eux-mêmes. Ils
  // retirent désormais les commentaires d'abord — mais ne pas le réécrire ici
  // évite de dépendre de ce nettoyage.

  // 3) Polling — CHEMIN NOMINAL depuis le 2026-09-20 (toutes les 5 s).
  setInterval(pollIncrement, POLL_MS).unref();

  // 4) Résolution des pseudos (profiles.username) : au boot puis toutes les 30 s.
  resolveNames();
  setInterval(resolveNames, 30_000).unref();
}

// Résout les pseudos réels (profiles.username) des utilisateurs observés,
// pour afficher un NOM plutôt qu'un identifiant dans le tableau de bord.
async function resolveNames() {
  if (!admin) return;
  const uids = store.unresolvedUids().slice(0, 100);
  if (!uids.length) return;
  try {
    const { data } = await admin.from("profiles").select("id,username").in("id", uids);
    const map = {};
    (data || []).forEach((r) => { if (r.username) map[r.id] = r.username; });
    if (Object.keys(map).length) store.setResolvedNames(map);
  } catch (e) { /* non bloquant */ }
}

// Charge les uids des comptes de test (e-mail @passio-e2e.test) à exclure.
async function loadTestUids() {
  if (!admin) return;
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const ids = (data?.users || []).filter((u) => /@passio-e2e\.test$/i.test(u.email || "")).map((u) => u.id);
    store.setTestUids(ids);
    if (ids.length) console.log(`[ingest] ${ids.length} comptes de test exclus.`);
  } catch (e) { /* non bloquant */ }
}

// Le repli « polling » est MESURÉ (revue du 2026-09-13) : ses erreurs étaient
// avalées et l'écran affichait « Secours » et « EN DIRECT » même quand plus rien
// n'était ingéré. supabase-js rend les pannes réseau dans `{ error }` — le
// `catch` n'est qu'une ceinture.
const poll = { lastAt: null, lastOkAt: null, lastError: null, failStreak: 0, lastRows: 0 };
// Recouvrement de 2 s : `received_at = now()` est pris au DÉBUT de la transaction
// et l'ordre de validation peut différer — une ligne validée en retard, sous la
// marque, n'était jamais rattrapée par `gt(marque)`. La dédup (event_id, canaris)
// absorbe les relectures.
const RECOUVREMENT_MS = 2000;
async function pollIncrement() {
  if (!admin) return;
  const now = Date.now();
  poll.lastAt = now;
  try {
    const borne = canonIso(new Date(Math.max(0, Date.parse(lastSeenIso) - RECOUVREMENT_MS)).toISOString());
    const { data, error } = await admin
      .from("telemetry_events")
      .select("*")
      .gt("received_at", borne)
      .order("received_at", { ascending: true })
      .limit(500);
    if (error) { poll.failStreak++; poll.lastError = error.message || String(error); return; }
    poll.failStreak = 0; poll.lastError = null; poll.lastOkAt = Date.now(); poll.lastRows = (data || []).length;
    (data || []).forEach(ingestOne);
  } catch (e) { poll.failStreak++; poll.lastError = e && e.message ? e.message : String(e); }
}
