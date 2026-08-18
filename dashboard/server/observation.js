// OBSERVATION HEALTH — proves that the dashboard is actually seeing production.
// States are explicit: LIVE | DEGRADED | NOT_CONFIGURED | UNAVAILABLE.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config, supabaseReady } from "./config.js";
import { JsonDb } from "./jsondb.js";

const db = new JsonDb("observation", {
  dbRead: null,
  canary: null,
  sse: { lastSentAt: null, lastAckAt: null, lastId: null, clients: 0 },
});

const CANARY_ACTION = "sentinel_observation_canary";
const CANARY_EVERY_MS = Number(process.env.DASH_CANARY_EVERY_MIN || 15) * 60_000;
const CANARY_DEADLINE_MS = Number(process.env.DASH_CANARY_DEADLINE_S || 90) * 1000;
const DB_READ_EVERY_MS = Number(process.env.DASH_DB_READ_EVERY_MIN || 5) * 60_000;

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

async function sendCanary() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    db.update((d) => { d.canary = { ...(d.canary || {}), configured: false, lastError: "SUPABASE_ANON_KEY manquante" }; });
    return;
  }
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
    db.update((d) => { d.canary = { ...(d.canary || {}), configured: true, pendingId: null, sentAt, lastError: String(e.message || e).slice(0, 240) }; });
  }
}

export function observationSnapshot() {
  const s = db.get();
  const dbRead = !s.dbRead || !s.dbRead.configured
    ? { state: "NOT_CONFIGURED", detail: s.dbRead?.error || "Supabase non configuré" }
    : s.dbRead.ok && ageMs(s.dbRead.at) <= DB_READ_EVERY_MS * 2
      ? { state: "LIVE", detail: `lecture DB OK (${s.dbRead.role || "backend"})`, at: s.dbRead.at }
      : { state: "UNAVAILABLE", detail: s.dbRead.error || "lecture DB trop ancienne", at: s.dbRead.at };

  let canary;
  if (!config.supabaseUrl || !config.supabaseAnonKey || s.canary?.configured === false) {
    canary = { state: "NOT_CONFIGURED", detail: s.canary?.lastError || "canari public non configuré" };
  } else if (s.canary?.pendingId && s.canary?.deadlineAt && Date.now() > Date.parse(s.canary.deadlineAt)) {
    canary = { state: "UNAVAILABLE", detail: `canari ${s.canary.pendingId} non observé sous ${Math.round(CANARY_DEADLINE_MS / 1000)} s` };
  } else if (s.canary?.lastSuccessAt && ageMs(s.canary.lastSuccessAt) <= CANARY_EVERY_MS * 2) {
    canary = { state: "LIVE", detail: `bout-en-bout ${s.canary.lastLatencyMs ?? "?"} ms`, at: s.canary.lastSuccessAt };
  } else {
    canary = { state: "DEGRADED", detail: s.canary?.pendingId ? "canari en attente" : (s.canary?.lastError || "aucune preuve récente") };
  }

  const sseAge = ageMs(s.sse?.lastAckAt);
  const sse = !s.sse?.clients
    ? { state: "DEGRADED", detail: "aucun navigateur dashboard connecté", clients: 0 }
    : s.sse?.lastAckAt && sseAge <= 75_000
      ? { state: "LIVE", detail: `heartbeat confirmé par ${s.sse.clients} client(s)`, at: s.sse.lastAckAt, clients: s.sse.clients }
      : { state: "DEGRADED", detail: "heartbeat émis mais non confirmé par le navigateur", clients: s.sse.clients };

  const order = { LIVE: 0, DEGRADED: 1, NOT_CONFIGURED: 2, UNAVAILABLE: 3 };
  const parts = { dbRead, sse, canary };
  const state = Object.values(parts).reduce((worst, x) => order[x.state] > order[worst] ? x.state : worst, "LIVE");
  return { state, parts, updatedAt: nowIso() };
}

export async function startObservation() {
  if (started) return;
  started = true;
  await probeDbRead();
  await sendCanary();
  setInterval(probeDbRead, DB_READ_EVERY_MS).unref();
  setInterval(sendCanary, CANARY_EVERY_MS).unref();
}

export const _test = { CANARY_ACTION, CANARY_DEADLINE_MS };
