// ANOMALY ENGINE — détection robuste sans IA, sans faux score de précision.
// Compare une fenêtre courante de 5 min aux 4 fenêtres précédentes via médiane
// + MAD. Si l'historique ne couvre pas suffisamment la période, état INSUFFICIENT.
import { store } from "./store.js";

const WINDOW_MS = Number(process.env.DASH_ANOMALY_WINDOW_MIN || 5) * 60_000;
const BASE_WINDOWS = 4;

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mad(xs, med) { return median(xs.map((x) => Math.abs(x - med))); }

const METRICS = {
  errors: (e) => e.type === "error" || e.severity === "critical" || e.severity === "error",
  api_failures: (e) => e.type === "api" && e.status === "error",
  slow_api: (e) => e.type === "api" && Number(e.duration_ms) > 4000,
  connectivity: (e) => e.type === "connectivity" && e.severity !== "info",
  version_skew: (e) => e.type === "release" && e.action === "version_skew",
};

export function evaluateSeries(current, baseline) {
  const med = median(baseline);
  const dispersion = mad(baseline, med);
  // Plancher absolu : 1 événement isolé après une baseline à zéro n'est pas une
  // anomalie opératoire. Le seuil augmente avec la variabilité historique.
  const threshold = Math.max(3, Math.ceil(med + Math.max(3, 4 * dispersion)));
  const anomalous = current > threshold;
  const confidence = anomalous
    ? (baseline.every((x) => x <= med + Math.max(1, dispersion)) && current >= threshold * 2 ? "high" : "medium")
    : "high";
  return { current, baseline, median: med, mad: dispersion, threshold, anomalous, confidence };
}

// Une ingestion à jour il y a plus longtemps que ça ne prouve plus qu'une
// fenêtre vide est un vrai zéro (même seuil que `pollingOk` d'ingest.js).
const INGEST_FRESH_MS = 30_000;

/** Depuis quand le magasin est-il COMPLET ? `store.coverage` est posé par
 *  l'ingestion : `completeSince` (historique lu jusqu'au début de la table, ou
 *  jusqu'à sa plus vieille ligne) et `caughtUpAt` (dernier polling rattrapé).
 *  Sans ingestion fraîche : null — on retombe sur l'âge du plus vieil événement.
 *  Avant (2026-11-01) : seul ce repli existait, et avec un trafic faible aucune
 *  fenêtre de 25 min ne contenait d'événement assez vieux — le gate restait
 *  UNKNOWN pour toujours, alors que quatre fenêtres vides sous une ingestion
 *  vivante sont une baseline mesurée à zéro. */
function completeSince(now, events, coverage) {
  if (!coverage || coverage.completeSince == null || coverage.caughtUpAt == null) return null;
  if (now - coverage.caughtUpAt > INGEST_FRESH_MS) return null;
  // Tampon plein : tout ce qui précède le plus vieil événement gardé a été évincé.
  const evince = coverage.bufferMax && events.length >= coverage.bufferMax && Number.isFinite(events[0]?.ts) ? events[0].ts : -Infinity;
  return Math.max(coverage.completeSince, evince);
}

export function anomalySnapshot(now = Date.now(), events = store.events, coverage = store.coverage) {
  const rows = (events || []).filter((e) => e && Number.isFinite(e.ts) && e.ts <= now && now - e.ts < WINDOW_MS * (BASE_WINDOWS + 1));
  const oldest = rows.reduce((m, e) => Math.min(m, e.ts), Infinity);
  const depuis = completeSince(now, events || [], coverage);
  const coverageMs = depuis != null ? Math.max(0, now - depuis) : Number.isFinite(oldest) ? now - oldest : 0;
  if (coverageMs < WINDOW_MS * BASE_WINDOWS) {
    return {
      state: "INSUFFICIENT",
      windowMinutes: Math.round(WINDOW_MS / 60000),
      coverageMinutes: Math.round(coverageMs / 60000),
      anomalies: [],
      metrics: {},
      detail: "historique insuffisant pour comparer honnêtement la fenêtre courante",
    };
  }

  const metrics = {};
  const anomalies = [];
  for (const [key, predicate] of Object.entries(METRICS)) {
    const counts = [];
    for (let w = 0; w <= BASE_WINDOWS; w++) {
      const from = now - WINDOW_MS * (w + 1);
      const to = now - WINDOW_MS * w;
      counts.push(rows.filter((e) => e.ts >= from && e.ts < to && predicate(e)).length);
    }
    const result = evaluateSeries(counts[0], counts.slice(1));
    metrics[key] = result;
    if (result.anomalous) anomalies.push({ key, ...result });
  }

  return {
    state: anomalies.length ? "ANOMALY" : "BASELINE",
    windowMinutes: Math.round(WINDOW_MS / 60000),
    coverageMinutes: Math.round(coverageMs / 60000),
    anomalies,
    metrics,
    detail: anomalies.length ? `${anomalies.length} anomalie(s) au-dessus de la baseline robuste` : "aucune rupture significative par rapport aux 4 fenêtres précédentes",
  };
}
