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

let admin = null;
let lastSeenIso = new Date(Date.now() - 60 * 60_000).toISOString();
let realtimeOk = false;

export function getAdmin() { return admin; }
export function ingestState() { return { supabaseReady, realtimeOk, lastSeenIso, buffered: store.events.length }; }

function ingestOne(row) {
  const ev = normalize(row);
  const isNew = store.add(ev);
  if (!isNew) return;
  if (ev.ts) { const iso = new Date(ev.ts).toISOString(); if (iso > lastSeenIso) lastSeenIso = iso; }
  broadcast("event", ev);
  try { alertsOnEvent(ev); } catch (e) { /* ignore */ }
}

export async function startIngest() {
  if (!supabaseReady) {
    console.warn("[ingest] Supabase non configuré (SUPABASE_SERVICE_ROLE_KEY manquante). " +
      "Le dashboard démarre en mode LOCAL : instrumentez Passio et renseignez .env pour les données réelles.");
    return;
  }
  admin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });

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
      store.add(ev);
      const iso = new Date(ev.ts).toISOString();
      if (iso > lastSeenIso) lastSeenIso = iso;
    });
    console.log(`[ingest] ${(data || []).length} événements historiques chargés.`);
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
