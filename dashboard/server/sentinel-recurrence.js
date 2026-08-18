// SENTINEL RECURRENCE WATCH — relie une promotion locale au retour du même signal.
//
// Une promotion peut passer tous les tests et pourtant échouer en usage réel.
// Ce module arme une fenêtre bornée après PROMOTED_LOCAL. Si la même clé d'alerte
// revient ensuite, Sentinel enregistre une récidive distincte dans sa mémoire
// d'apprentissage. Aucun rollback ou déploiement n'est déclenché ici.
import { onAlert } from "./alerts.js";
import { recordRepairRecurrence, repairPatternKey } from "./sentinel-learning.js";
import { audit } from "./audit.js";
import { broadcast } from "./sse.js";

const WATCH_MS = Number(process.env.DASH_SENTINEL_RECURRENCE_MIN || 120) * 60_000;
const MAX_WATCHES = Number(process.env.DASH_SENTINEL_RECURRENCE_MAX_WATCHES || 100);
const watches = new Map(); // signalKey -> watch
let unsubscribe = null;

function clean(now = Date.now()) {
  for (const [key, w] of watches) if (w.expiresAt <= now) watches.delete(key);
  if (watches.size <= MAX_WATCHES) return;
  const ordered = [...watches.entries()].sort((a, b) => a[1].armedAt - b[1].armedAt);
  for (const [key] of ordered.slice(0, watches.size - MAX_WATCHES)) watches.delete(key);
}

export function armRecurrenceWatch({ repair, autopilot, now = Date.now() } = {}) {
  if (!repair || autopilot?.status !== "PROMOTED_LOCAL" || !repair.key) return null;
  clean(now);
  const signalKey = String(repair.key).slice(0, 180);
  const watch = {
    signalKey,
    patternKey: repairPatternKey(repair),
    branch: repair.branch || null,
    sha: repair.sha || null,
    afterSha: autopilot.afterSha || null,
    armedAt: now,
    expiresAt: now + WATCH_MS,
  };
  watches.set(signalKey, watch);
  broadcast("sentinel_recurrence", { phase: "armed", signalKey, expiresAt: watch.expiresAt });
  return { ...watch };
}

export function observeAlertForRecurrence(alert, { now = Date.now(), record = recordRepairRecurrence } = {}) {
  if (!alert?.key) return null;
  clean(now);
  const signalKey = String(alert.key).slice(0, 180);
  const watch = watches.get(signalKey);
  if (!watch) return null;
  // Ne jamais compter une alerte antérieure/égale à l'armement comme récidive.
  if (Number(alert.ts || 0) <= watch.armedAt) return null;

  watches.delete(signalKey); // une récidive réelle = un seul fait enregistré
  const pattern = record({
    patternKey: watch.patternKey,
    signalKey,
    alertId: alert.id || null,
    branch: watch.branch,
    sha: watch.sha,
    reason: "same_signal_returned_after_verified_local_promotion",
  });
  const event = {
    phase: "detected",
    signalKey,
    alertId: alert.id || null,
    patternKey: watch.patternKey,
    quarantined: Boolean(pattern?.quarantined),
    recurrences: pattern?.recurrences ?? null,
  };
  audit("sentinel_recurrence_detected", event, "sentinelle-autopilot");
  broadcast("sentinel_recurrence", event);
  return event;
}

export function startRecurrenceWatch() {
  if (unsubscribe) return { started: true, alreadyStarted: true };
  unsubscribe = onAlert((alert) => { try { observeAlertForRecurrence(alert); } catch {} });
  return { started: true, alreadyStarted: false };
}

export function recurrenceSnapshot() {
  clean();
  return {
    active: watches.size,
    watchMinutes: Math.round(WATCH_MS / 60_000),
    items: [...watches.values()].map((w) => ({ ...w })),
  };
}

export function _resetRecurrenceForTests() {
  if (unsubscribe) { try { unsubscribe(); } catch {} unsubscribe = null; }
  watches.clear();
}
