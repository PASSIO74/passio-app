// ═══════════════════════════════════════════════════════════════════════════
// SUPERVISION BASE DE DONNÉES — lecture SÉCURISÉE d'indicateurs non sensibles.
// Volumes (nombre de lignes), activité télémétrie, requêtes lentes observées.
// Jamais de contenu de ligne, jamais de secret. Aucune opération destructive.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";
import { store } from "./store.js";

// Tables dont on expose UNIQUEMENT le compte de lignes (volumétrie).
const SAFE_TABLES = [
  "profiles", "posts", "post_comments", "post_likes", "conv_messages",
  "conversations", "notifications", "events", "event_attendees",
  "telemetry_events", "client_errors", "analytics_events",
];

export async function overview() {
  const admin = getAdmin();
  if (!admin) return { configured: false };
  const counts = {};
  await Promise.all(SAFE_TABLES.map(async (t) => {
    try {
      const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
      counts[t] = error ? null : count;
    } catch { counts[t] = null; }
  }));

  // Requêtes lentes/échecs observés via télémétrie API sur la base.
  const now = Date.now();
  const dbApis = store.events.filter((e) => e.type === "api" && /rest\/v1/i.test(e.endpoint || "") && now - e.ts < 15 * 60_000);
  const slow = dbApis.filter((e) => e.duration_ms > 1500).length;
  const errs = dbApis.filter((e) => e.status === "error").length;

  return {
    configured: true,
    counts,
    activity: {
      dbCalls15m: dbApis.length,
      slowQueries: slow,
      failedQueries: errs,
      successRate: dbApis.length ? Math.round(((dbApis.length - errs) / dbApis.length) * 100) : 100,
    },
    updatedAt: now,
  };
}
