// OBSERVATION HEALTH — proves that the dashboard is actually seeing production.
// States are explicit: LIVE | DEGRADED | NOT_CONFIGURED | UNAVAILABLE, plus
// IDLE pour le seul seam SSE (aucun navigateur : rien à livrer, rien à prouver).
//
// Quatre parts (2026-09-18) :
//   · dbRead   — lecture service_role de telemetry_events (5 min) ;
//   · canary   — canari public bout-en-bout (15 min). Le canari compte ses
//                échecs CONSÉCUTIFS (`missedCount`) : avant, l'état battait
//                entre LIVE (90 s après chaque envoi tant que lastSuccessAt
//                < 30 min) et UNAVAILABLE, sans mémoire. Un seul canari manqué
//                est DEGRADED, deux de suite UNAVAILABLE, et LIVE ne revient
//                qu'après un succès observé ;
//   · sse      — IDLE sans navigateur (NON compté dans l'état global : l'autonomie
//                nocturne ne doit pas être notée « dégradée » parce que personne
//                ne regarde), LIVE/UNAVAILABLE avec clients ;
//   · persistence — les JsonDb du pilotage écrivent encore (jsondb.storageHealth).
// Les alertes sur transition sont émises par observation-alerts.js, pas ici.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config, supabaseReady } from "./config.js";
import { JsonDb, storageHealth } from "./jsondb.js";

const db = new JsonDb("observation", {
  dbRead: null,
  canary: null,
  sse: { lastSentAt: null, lastAckAt: null, lastId: null, clients: 0 },
});

const CANARY_ACTION = "sentinel_observation_canary";
const CANARY_EVERY_MS = Number(process.env.DASH_CANARY_EVERY_MIN || 15) * 60_000;
const CANARY_DEADLINE_MS = Number(process.env.DASH_CANARY_DEADLINE_S || 90) * 1000;
const DB_READ_EVERY_MS = Number(process.env.DASH_DB_READ_EVERY_MIN || 5) * 60_000;
// Échecs consécutifs du canari à partir desquels la part est UNAVAILABLE.
const CANARY_MISSED_UNAVAILABLE = 2;

let admin = null;
let anon = null;
let started = false;

function nowIso() { return new Date().toISOString(); }
function ageMs(iso) { return iso ? Date.now() - Date.parse(iso) : Infinity; }

export function isSyntheticCanary(ev) {
  return Boolean(ev && ev.type === "lifecycle" && ev.action === CANARY_ACTION && ev.meta?.synthetic === true);
}

export function observeSyntheticCanary(ev) {
  if (!isSyntheticCanary(ev)) return false;
  const id = ev.correlation_id || ev.meta?.canary_id || ev.event_id || ev.id;
  db.update((d) => {
    const c = d.canary || {};
    c.lastObservedAt = nowIso();
    c.lastObservedId = id || null;
    if (c.pendingId && id === c.pendingId) {
      c.lastLatencyMs = Math.max(0, Date.now() - Date.parse(c.sentAt));
      c.lastSuccessAt = c.lastObservedAt;
      c.pendingId = null;
      c.deadlineAt = null;
      c.lastError = null;
      c.missedCount = 0;
    }
    d.canary = c;
  });
  return true;
}

export function noteSseHeartbeat({ id, clients }) {
  db.update((d) => {
    d.sse = d.sse || {};
    d.sse.lastSentAt = nowIso();
    d.sse.lastId = id;
    d.sse.clients = clients || 0;
  });
}

// Conservé pour permettre un vrai ACK navigateur plus tard sans casser l'API.
export function acknowledgeSseHeartbeat(id) {
  db.update((d) => {
    d.sse = d.sse || {};
    if (!id || id === d.sse.lastId) d.sse.lastAckAt = nowIso();
  });
  return true;
}

async function probeDbRead() {
  if (!supabaseReady) {
    db.update((d) => { d.dbRead = { at: nowIso(), ok: false, configured: false, error: "Supabase non configuré" }; });
    return;
  }
  try {
    admin ||= createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.from("telemetry_events").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    db.update((d) => { d.dbRead = { at: nowIso(), ok: true, configured: true, role: "service_role", error: null }; });
  } catch (e) {
    db.update((d) => { d.dbRead = { at: nowIso(), ok: false, configured: true, role: "service_role", error: String(e.message || e).slice(0, 240) }; });
  }
}

/**
 * Compte un canari manqué : appelé avant chaque nouvel envoi si le précédent
 * n'a jamais été observé, et quand l'insertion elle-même échoue. Pur sur l'objet
 * canari, exporté pour être verrouillé.
 */
export function noterCanariManque(c) {
  const next = { ...(c || {}) };
  next.missedCount = (Number(next.missedCount) || 0) + 1;
  next.lastMissedAt = nowIso();
  next.pendingId = null;
  next.deadlineAt = null;
  return next;
}

async function sendCanary() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    db.update((d) => { d.canary = { ...(d.canary || {}), configured: false, lastError: "SUPABASE_ANON_KEY manquante" }; });
    return;
  }
  // Le canari précédent n'a jamais été vu : c'est un échec, on le compte AVANT
  // d'en envoyer un autre (sinon le nouvel envoi effaçait la trace du manqué).
  db.update((d) => { if (d.canary && d.canary.pendingId) d.canary = noterCanariManque(d.canary); });
  const id = "can_" + crypto.randomUUID();
  const sentAt = nowIso();
  try {
    anon ||= createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const row = {
      event_id: id,
      env: "production",
      type: "lifecycle",
      action: CANARY_ACTION,
      status: "ok",
      severity: "info",
      user_id: null,
      correlation_id: id,
      message: "synthetic observation canary",
      meta: { synthetic: true, canary_id: id, exclude_analytics: true, exclude_alerts: true },
    };
    const { error } = await anon.from("telemetry_events").insert(row);
    if (error) throw error;
    db.update((d) => {
      d.canary = {
        ...(d.canary || {}), configured: true, pendingId: id, sentAt,
        deadlineAt: new Date(Date.now() + CANARY_DEADLINE_MS).toISOString(), lastError: null,
      };
    });
  } catch (e) {
    db.update((d) => { d.canary = { ...noterCanariManque(d.canary || {}), configured: true, sentAt, lastError: String(e.message || e).slice(0, 240) }; });
  }
}

/**
 * État du canari, pur : `missedCount` échecs consécutifs comptés, plus le
 * canari en cours s'il a dépassé sa deadline (un manqué provisoire, pour ne pas
 * attendre l'envoi suivant). LIVE seulement après un succès et sans manqué.
 */
export function etatCanari(c, now = Date.now(), { everyMs = CANARY_EVERY_MS, deadlineMs = CANARY_DEADLINE_MS, configure = Boolean(config.supabaseUrl && config.supabaseAnonKey) } = {}) {
  if (!configure || c?.configured === false) {
    return { state: "NOT_CONFIGURED", detail: c?.lastError || "canari public non configuré", missed: 0 };
  }
  const enRetard = Boolean(c?.pendingId && c?.deadlineAt && now > Date.parse(c.deadlineAt));
  const missed = (Number(c?.missedCount) || 0) + (enRetard ? 1 : 0);
  if (missed >= CANARY_MISSED_UNAVAILABLE) {
    return { state: "UNAVAILABLE", detail: `${missed} canaris consécutifs non observés (dernier envoi ${c?.sentAt || "?"})`, missed, at: c?.lastSuccessAt || null };
  }
  if (missed === 0 && c?.lastSuccessAt && now - Date.parse(c.lastSuccessAt) <= everyMs * 2) {
    return { state: "LIVE", detail: `bout-en-bout ${c.lastLatencyMs ?? "?"} ms`, at: c.lastSuccessAt, missed: 0 };
  }
  const pourquoi = missed ? `1 canari non observé sous ${Math.round(deadlineMs / 1000)} s` : c?.pendingId ? "canari en attente" : (c?.lastError || "aucune preuve récente");
  return { state: "DEGRADED", detail: pourquoi, missed, at: c?.lastSuccessAt || null };
}

/** L'état SSE, pur. IDLE sans client : rien à livrer, rien à prouver. */
export function etatSse(s, now = Date.now()) {
  if (!s?.clients) return { state: "IDLE", detail: "aucun navigateur connecté — rien à livrer", clients: 0 };
  const sseFresh = s.lastSentAt ? now - Date.parse(s.lastSentAt) <= 75_000 : false;
  return sseFresh
    ? { state: "LIVE", detail: `heartbeat livré au flux vers ${s.clients} client(s)`, at: s.lastSentAt, clients: s.clients, browserAck: Boolean(s.lastAckAt) }
    : { state: "UNAVAILABLE", detail: "heartbeat SSE trop ancien", clients: s.clients };
}

/** La part « persistance » : les JsonDb du pilotage écrivent-ils encore ? */
export function etatPersistence(sh = storageHealth()) {
  if (sh.available) return { state: "LIVE", detail: `${sh.total} fichier(s) de données écrits normalement`, failing: [] };
  const noms = sh.failing.map((f) => `${f.name} (${f.reason})`).join(", ");
  return { state: "UNAVAILABLE", detail: `écriture impossible : ${noms}`, failing: sh.failing };
}

const ORDER = { LIVE: 0, IDLE: 0, DEGRADED: 1, NOT_CONFIGURED: 2, UNAVAILABLE: 3 };

/** Pire état d'un sous-ensemble de parts (IDLE ne compte jamais). */
export function pireEtat(parts, cles = Object.keys(parts)) {
  return cles.map((k) => parts[k]).filter((p) => p && p.state !== "IDLE")
    .reduce((worst, x) => (ORDER[x.state] > ORDER[worst] ? x.state : worst), "LIVE");
}

/**
 * Le cœur de l'observation : DB + canari seulement. C'est ce que la porte de
 * release et le poste de commande exigent LIVE — pas le seam SSE, qui dépend
 * d'un humain devant l'écran.
 */
export function observationCoreState(snapshot) {
  return pireEtat(snapshot?.parts || {}, ["dbRead", "canary"]);
}

export function observationSnapshot() {
  const s = db.get();
  const dbRead = !s.dbRead || !s.dbRead.configured
    ? { state: "NOT_CONFIGURED", detail: s.dbRead?.error || "Supabase non configuré" }
    : s.dbRead.ok && ageMs(s.dbRead.at) <= DB_READ_EVERY_MS * 2
      ? { state: "LIVE", detail: `lecture DB OK (${s.dbRead.role || "backend"})`, at: s.dbRead.at }
      : { state: "UNAVAILABLE", detail: s.dbRead.error || "lecture DB trop ancienne", at: s.dbRead.at };

  const canary = etatCanari(s.canary);
  // Une écriture SSE réussie prouve le seam Node → socket dashboard, pas le
  // rendu UI. On l'appelle donc "livré au flux", jamais "ACK navigateur".
  const sse = etatSse(s.sse);
  const persistence = etatPersistence();

  const parts = { dbRead, sse, canary, persistence };
  const state = pireEtat(parts);
  return { state, core: observationCoreState({ parts }), parts, updatedAt: nowIso() };
}

export async function startObservation() {
  if (started) return;
  started = true;
  await probeDbRead();
  await sendCanary();
  setInterval(probeDbRead, DB_READ_EVERY_MS).unref();
  setInterval(sendCanary, CANARY_EVERY_MS).unref();
}

export const _test = { CANARY_ACTION, CANARY_DEADLINE_MS, CANARY_EVERY_MS, CANARY_MISSED_UNAVAILABLE };
/** RÉSERVÉ AUX TESTS : pose/lit l'objet canari du registre (isolé par DASH_DATA_DIR). */
export function _setCanaryForTests(c) { db.update((d) => { d.canary = c; }); return { ...(db.get().canary || {}) }; }
export function _getCanaryForTests() { return { ...(db.get().canary || {}) }; }
