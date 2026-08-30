// ═══════════════════════════════════════════════════════════════════════════
// INGESTION — connecte le magasin d'événements Supabase au store temps réel.
//   1. Charge l'historique récent (amorçage du flux).
//   2. S'abonne au realtime (postgres_changes INSERT) en service_role.
//   3. Filet de sécurité : polling incrémental si le realtime décroche.
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
let lastSeenIso = new Date(Date.now() - 60 * 60_000).toISOString();
let realtimeOk = false;

export function getAdmin() { return admin; }
export function ingestState() { return { supabaseReady, realtimeOk, lastSeenIso, buffered: store.events.length }; }

// Exportée pour les tests : c'est le point de passage UNIQUE de tout événement
// entrant (historique, realtime, polling de secours). Une erreur ici aveugle le
// pilotage entier, silencieusement — d'où `test/ingest.test.js`.
export function ingestOne(row) {
  const ev = normalize(row);
  // Le canari prouve la chaîne publique → DB → dashboard mais ne doit JAMAIS
  // polluer utilisateurs, sessions, KPI, bugs, alertes ou traces produit.
  if (isSyntheticCanary(ev)) {
    observeSyntheticCanary(ev);
    if (ev.ts) { const iso = new Date(ev.ts).toISOString(); if (iso > lastSeenIso) lastSeenIso = iso; }
    return;
  }
  const isNew = store.add(ev);
  if (!isNew) return;
  if (ev.ts) { const iso = new Date(ev.ts).toISOString(); if (iso > lastSeenIso) lastSeenIso = iso; }
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
      if (isSyntheticCanary(ev)) { observeSyntheticCanary(ev); return; }
      store.add(ev);
      // Rejoue aussi l'historique dans le traçage : sinon l'onglet « Traçage des
      // actions » repart vide à chaque redémarrage du serveur.
      try { tracesOnEvent(ev); } catch (e) { /* ignore */ }
      const iso = new Date(ev.ts).toISOString();
      if (iso > lastSeenIso) lastSeenIso = iso;
    });
    // …mais on scelle ces flux : un redémarrage ne doit PAS refaire sonner
    // toutes les alertes des dernières heures.
    const sealed = tracesSealExisting();
    console.log(`[ingest] ${(data || []).length} événements historiques chargés (${sealed} action(s) tracée(s), sans ré-alerte).`);
  } catch (e) {
    console.error("[ingest] chargement historique échoué:", e.message,
      "\n→ La table telemetry_events existe-t-elle ? Applique migrations/migration_telemetry.sql.");
  }

  // 2) Realtime.
  admin.channel("dash:telemetry")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_events" }, (payload) => {
      try { ingestOne(payload.new); } catch (e) { /* ignore */ }
    })
    .subscribe((status) => {
      realtimeOk = status === "SUBSCRIBED";
      console.log("[ingest] realtime:", status);
    });

  // 3) Polling de secours (toutes les 5 s) : rattrape ce que le realtime a raté.
  setInterval(pollIncrement, 5000).unref();

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

async function pollIncrement() {
  if (!admin) return;
  try {
    const { data, error } = await admin
      .from("telemetry_events")
      .select("*")
      .gt("received_at", lastSeenIso)
      .order("received_at", { ascending: true })
      .limit(500);
    if (error) return;
    (data || []).forEach(ingestOne);
  } catch (e) { /* réseau : on réessaiera au prochain tick */ }
}
