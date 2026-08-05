// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS DE TEST — regroupe une campagne de test (ex. « Benjamin + testeur 2 »).
// Une session a une fenêtre temporelle ; le rapport agrège les événements du
// store sur cette fenêtre (actions, écrans, erreurs, bugs, perf) + les notes.
// ═══════════════════════════════════════════════════════════════════════════
import { JsonDb } from "./jsondb.js";
import { store } from "./store.js";
import { audit } from "./audit.js";

const db = new JsonDb("test-sessions", { items: [] });

export function list() { return db.get().items.map(summarize); }
export function get(id) { return db.get().items.find((s) => s.id === id) || null; }

function summarize(s) {
  return { ...s, live: s.status === "running" };
}

export function create(input, actor) {
  const s = {
    id: "ts_" + Date.now().toString(36),
    name: input.name || "Session de test",
    participants: input.participants || [],
    devices: input.devices || [],
    features: input.features || [],
    environment: input.environment || "production",
    objectives: input.objectives || "",
    notes: [],
    bugs: [],
    status: "created",
    startedAt: null, endedAt: null, createdAt: Date.now(),
  };
  db.update((d) => d.items.unshift(s));
  audit("test_session_create", { id: s.id, name: s.name }, actor);
  return s;
}

export function control(id, action, actor) {
  const d = db.get(); const s = d.items.find((x) => x.id === id);
  if (!s) return null;
  const now = Date.now();
  if (action === "start") { s.status = "running"; s.startedAt = s.startedAt || now; s.resumedAt = now; }
  else if (action === "pause") { s.status = "paused"; }
  else if (action === "resume") { s.status = "running"; }
  else if (action === "end") { s.status = "ended"; s.endedAt = now; }
  db.save();
  audit("test_session_" + action, { id }, actor);
  return summarize(s);
}

export function addNote(id, note, actor) {
  const d = db.get(); const s = d.items.find((x) => x.id === id);
  if (!s) return null;
  s.notes.unshift({ ts: Date.now(), text: String(note.text || "").slice(0, 2000), author: actor, type: note.type || "note" });
  db.save();
  return summarize(s);
}

export function addBug(id, bug, actor) {
  const d = db.get(); const s = d.items.find((x) => x.id === id);
  if (!s) return null;
  s.bugs.unshift({ ts: Date.now(), title: String(bug.title || "Bug").slice(0, 200), severity: bug.severity || "moyen", description: String(bug.description || "").slice(0, 2000), author: actor, bugId: bug.bugId || null });
  db.save();
  audit("test_session_bug", { id, title: bug.title }, actor);
  return summarize(s);
}

/** Rapport agrégé : croise la fenêtre de session avec les événements du store. */
export function report(id) {
  const s = get(id); if (!s) return null;
  const from = s.startedAt || s.createdAt;
  const to = s.endedAt || Date.now();
  const evs = store.events.filter((e) => e.ts >= from && e.ts <= to);
  const byType = {}, byScreen = {}, byUser = {};
  let errors = 0, apiCalls = 0, latSum = 0, latN = 0;
  for (const e of evs) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (e.screen) byScreen[e.screen] = (byScreen[e.screen] || 0) + 1;
    if (e.user_label) byUser[e.user_label] = (byUser[e.user_label] || 0) + 1;
    if (e.type === "error") errors++;
    if (e.type === "api") { apiCalls++; if (e.duration_ms != null) { latSum += e.duration_ms; latN++; } }
  }
  const bugsInWindow = store.bugList().filter((b) => b.lastSeen >= from && b.lastSeen <= to);
  const devices = [...new Set(evs.map((e) => e.device_id).filter(Boolean))];
  const versions = [...new Set(evs.map((e) => e.app_version).filter(Boolean))];
  return {
    session: s,
    window: { from, to, durationMs: to - from },
    summary: {
      totalEvents: evs.length, errors, apiCalls,
      avgLatency: latN ? Math.round(latSum / latN) : 0,
      devices: devices.length, versions,
      participants: Object.keys(byUser),
      bugsAuto: bugsInWindow.length,
      bugsManual: s.bugs.length,
      criticalBugs: bugsInWindow.filter((b) => b.severity === "critical").length,
    },
    byType, byScreen, byUser,
    bugs: bugsInWindow, manualBugs: s.bugs, notes: s.notes,
    timeline: evs.slice(-200).map((e) => ({ ts: e.ts, type: e.type, action: e.action, screen: e.screen, user: e.user_label, status: e.status })),
    generatedAt: Date.now(),
  };
}
