// INCIDENT PACKETS — deterministic evidence bundles prepared before any AI call.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { JsonDb } from "./jsondb.js";
import { store } from "./store.js";

const db = new JsonDb("incident-packets", { items: [] });
const KEEP = Number(process.env.DASH_INCIDENT_KEEP || 200);

function safeText(v, max = 500) {
  if (v === null || v === undefined) return null;
  return String(v).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

function repoRevision() {
  try {
    const gitDir = path.join(config.repoPath, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return head.slice(0, 12);
    const ref = head.slice(4).trim();
    try { return fs.readFileSync(path.join(gitDir, ref), "utf8").trim().slice(0, 12); }
    catch {
      const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.endsWith(" " + ref));
      return line ? line.slice(0, 12) : null;
    }
  } catch { return null; }
}

function recentEvidence(alert) {
  const meta = alert.meta || {};
  const rows = store.recent({
    type: meta.endpoint ? "api" : undefined,
    screen: meta.screen || undefined,
    user: meta.user || undefined,
  }, 30) || [];
  return rows.slice(0, 12).map((ev) => ({
    ts: ev.ts,
    type: ev.type,
    action: safeText(ev.action, 120),
    status: ev.status,
    severity: ev.severity,
    screen: safeText(ev.screen, 120),
    endpoint: safeText(ev.endpoint, 180),
    http_status: ev.http_status ?? null,
    correlation_id: safeText(ev.correlation_id, 120),
    message: safeText(ev.message, 240),
  }));
}

export function buildIncidentPacket(alert) {
  const ts = alert.ts || Date.now();
  const id = "inc_" + ts.toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const evidence = recentEvidence(alert);
  const meta = alert.meta || {};
  return {
    id,
    createdAt: new Date(ts).toISOString(),
    status: "open",
    severity: alert.level || "info",
    signal: {
      alertId: alert.id || null,
      key: safeText(alert.key || alert.title, 180),
      title: safeText(alert.title, 180),
      message: safeText(alert.message, 500),
    },
    context: {
      revision: repoRevision(),
      screen: safeText(meta.screen, 120),
      endpoint: safeText(meta.endpoint, 180),
      action: safeText(meta.action, 120),
      correlationId: safeText(meta.cid || meta.correlation_id, 120),
      bugId: safeText(meta.bug, 120),
      view: safeText(meta.view, 80),
    },
    evidence,
    evidenceCount: evidence.length,
    hypothesis: null,
    confidence: evidence.length >= 3 ? "medium" : "low",
    reproduction: meta.cid ? `Ouvrir la trace ${safeText(meta.cid, 120)} et rejouer l'action ${safeText(meta.action || "concernée", 120)}.` : null,
    testsToRun: [
      meta.bug ? "tests ciblés du domaine concerné" : null,
      meta.cid ? "rejouer le parcours critique associé à la trace" : null,
      alert.level === "critical" ? "smoke E2E" : null,
    ].filter(Boolean),
    definitionOfDone: [
      "le signal initial ne se reproduit plus",
      "les tests ciblés passent",
      "aucune régression critique n'apparaît dans la télémétrie",
    ],
    aiReady: true,
  };
}

export function recordIncident(alert) {
  const packet = buildIncidentPacket(alert);
  db.update((d) => {
    d.items.unshift(packet);
    if (d.items.length > KEEP) d.items.length = KEEP;
  });
  return packet;
}

export function listIncidentPackets(limit = 50) { return db.get().items.slice(0, limit); }
export function getIncidentPacket(id) { return db.get().items.find((x) => x.id === id) || null; }

export function closeIncident(id, resolution = null) {
  let out = null;
  db.update((d) => {
    const it = d.items.find((x) => x.id === id);
    if (!it) return;
    it.status = "closed";
    it.closedAt = new Date().toISOString();
    it.resolution = safeText(resolution, 1000);
    out = it;
  });
  return out;
}
