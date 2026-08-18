// INCIDENT PACKETS — deterministic evidence bundles prepared before any AI call.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { JsonDb } from "./jsondb.js";
import { store } from "./store.js";

const KEEP = Number(process.env.DASH_INCIDENT_KEEP || 200);
const HARD_KEEP = Math.max(KEEP, Number(process.env.DASH_INCIDENT_HARD_KEEP || Math.max(KEEP * 5, 1000)));
const db = new JsonDb("incident-packets", {
  items: [],
  retention: {
    schema: 1,
    historyTrusted: true,
    legacyUnproven: false,
    criticalOverflow: false,
    criticalOverflowCount: 0,
    initializedAt: new Date().toISOString(),
  },
});
const CLUSTER_MS = Number(process.env.DASH_INCIDENT_CLUSTER_MIN || 15) * 60_000;

export const INCIDENT_PHASES = ["DETECTED", "CONFIRMED", "CORRELATED", "DIAGNOSED", "FIX_READY", "VERIFIED", "RESOLVED"];
const NEXT = Object.fromEntries(INCIDENT_PHASES.slice(0, -1).map((p, i) => [p, INCIDENT_PHASES[i + 1]]));

function safeText(v, max = 500) {
  if (v === null || v === undefined) return null;
  return String(v).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

function isCriticalOpen(incident) {
  return incident && incident.status !== "closed"
    && (incident.severity === "critical" || incident.severity === "high");
}

function ensureRetention(d) {
  if (!d.retention || d.retention.schema !== 1) {
    d.retention = {
      schema: 1,
      historyTrusted: false,
      legacyUnproven: true,
      criticalOverflow: false,
      criticalOverflowCount: 0,
      initializedAt: new Date().toISOString(),
    };
  }
  return d.retention;
}

function pruneIncidents(d) {
  d.items = d.items || [];
  const retention = ensureRetention(d);

  // La rétention nominale élimine d'abord les éléments qui ne sont PAS des
  // incidents high/critical ouverts. Un incident critique ouvert ne doit jamais
  // disparaître silencieusement parce que 200 événements plus récents existent.
  while (d.items.length > KEEP) {
    let removable = -1;
    for (let i = d.items.length - 1; i >= 0; i--) {
      if (!isCriticalOpen(d.items[i])) { removable = i; break; }
    }
    if (removable < 0) break;
    d.items.splice(removable, 1);
  }

  // Protection mémoire ultime : si le registre est composé de plus de HARD_KEEP
  // incidents high/critical ouverts, on borne malgré tout la mémoire mais on
  // grave l'overflow. Dès lors la complétude historique est définitivement non
  // prouvée et tout gate local doit rester HOLD.
  if (d.items.length > HARD_KEEP) {
    const dropped = d.items.splice(HARD_KEEP);
    const droppedCritical = dropped.filter(isCriticalOpen);
    if (droppedCritical.length) {
      retention.criticalOverflow = true;
      retention.criticalOverflowCount = (retention.criticalOverflowCount || 0) + droppedCritical.length;
      retention.lastCriticalOverflowAt = new Date().toISOString();
    }
  }
  retention.lastPrunedAt = new Date().toISOString();
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

function confidenceFor(packet) {
  const n = packet.evidenceCount || 0;
  const occurrences = packet.occurrences || 1;
  const structured = Boolean(packet.context?.correlationId || packet.context?.bugId);
  const revision = Boolean(packet.context?.revision);
  if (n >= 6 && occurrences >= 2 && structured && revision) return { level: "high", basis: "preuves multiples + répétition + corrélation structurée + révision connue" };
  if (n >= 3 || structured || occurrences >= 3) return { level: "medium", basis: "plusieurs preuves ou signal structuré/répété" };
  return { level: "low", basis: "signal isolé ou preuves encore insuffisantes" };
}

function evidenceKey(e) { return [e.ts, e.type, e.action, e.correlation_id, e.message].join("|"); }
function mergeEvidence(a = [], b = []) {
  const seen = new Set();
  const out = [];
  for (const e of [...a, ...b]) {
    const k = evidenceKey(e);
    if (seen.has(k)) continue;
    seen.add(k); out.push(e);
    if (out.length >= 20) break;
  }
  return out;
}

export function canTransitionIncident(from, to) {
  return INCIDENT_PHASES.includes(from) && INCIDENT_PHASES.includes(to) && NEXT[from] === to;
}

export function buildIncidentPacket(alert) {
  const ts = alert.ts || Date.now();
  const id = "inc_" + ts.toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const evidence = recentEvidence(alert);
  const meta = alert.meta || {};
  const revision = repoRevision();
  const signalKey = safeText(alert.key || alert.title, 180);
  const packet = {
    id,
    createdAt: new Date(ts).toISOString(),
    lastSeenAt: new Date(ts).toISOString(),
    status: "open",
    phase: "DETECTED",
    phaseHistory: [{ phase: "DETECTED", at: new Date(ts).toISOString(), evidence: "alerte primaire" }],
    severity: alert.level || "info",
    occurrences: 1,
    clusterKey: `${signalKey || "signal"}@${revision || "unknown"}`,
    signal: {
      alertId: alert.id || null,
      key: signalKey,
      title: safeText(alert.title, 180),
      message: safeText(alert.message, 500),
    },
    context: {
      revision,
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
    confidence: "low",
    confidenceBasis: null,
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
  const c = confidenceFor(packet);
  packet.confidence = c.level; packet.confidenceBasis = c.basis;
  return packet;
}

export function recordIncident(alert) {
  const incoming = buildIncidentPacket(alert);
  let result = incoming;
  db.update((d) => {
    d.items = d.items || [];
    ensureRetention(d);
    const now = Date.parse(incoming.createdAt);
    const cluster = d.items.find((x) =>
      x.status !== "closed" && x.clusterKey === incoming.clusterKey
      && now - (Date.parse(x.lastSeenAt || x.createdAt) || 0) <= CLUSTER_MS);
    if (cluster) {
      cluster.occurrences = (cluster.occurrences || 1) + 1;
      cluster.lastSeenAt = incoming.createdAt;
      cluster.evidence = mergeEvidence(cluster.evidence, incoming.evidence);
      cluster.evidenceCount = cluster.evidence.length;
      cluster.signal = { ...cluster.signal, alertId: incoming.signal.alertId, message: incoming.signal.message || cluster.signal.message };
      const c = confidenceFor(cluster); cluster.confidence = c.level; cluster.confidenceBasis = c.basis;
      result = cluster;
      pruneIncidents(d);
      return;
    }
    d.items.unshift(incoming);
    pruneIncidents(d);
  });
  return result;
}

export function listIncidentPackets(limit = 50) { return (db.get().items || []).slice(0, limit); }
export function getIncidentPacket(id) { return (db.get().items || []).find((x) => x.id === id) || null; }

export function incidentRetentionSnapshot() {
  const d = db.get();
  const r = d.retention || null;
  const historyTrusted = r?.historyTrusted === true;
  const criticalOverflow = r?.criticalOverflow === true;
  return {
    schema: r?.schema || 0,
    historyTrusted,
    legacyUnproven: r ? r.legacyUnproven === true : true,
    criticalOverflow,
    criticalOverflowCount: Number(r?.criticalOverflowCount || 0),
    lastCriticalOverflowAt: r?.lastCriticalOverflowAt || null,
    stored: (d.items || []).length,
    keep: KEEP,
    hardKeep: HARD_KEEP,
    complete: historyTrusted && !criticalOverflow,
    reason: !historyTrusted ? "historical_completeness_unproven"
      : criticalOverflow ? "critical_retention_overflow"
      : null,
  };
}

export function transitionIncident(id, nextPhase, opts = {}) {
  nextPhase = String(nextPhase || "").toUpperCase();
  let out = null;
  db.update((d) => {
    ensureRetention(d);
    const it = (d.items || []).find((x) => x.id === id);
    if (!it) return;
    const current = it.phase || "DETECTED";
    if (!canTransitionIncident(current, nextPhase)) {
      const e = new Error(`Transition incident interdite : ${current} → ${nextPhase}`);
      e.code = 409; throw e;
    }
    const entry = {
      phase: nextPhase,
      at: new Date().toISOString(),
      evidence: safeText(opts.evidence || null, 1000),
      note: safeText(opts.note || null, 1000),
      actor: safeText(opts.actor || null, 120),
    };
    if (nextPhase !== "RESOLVED" && !entry.evidence && !entry.note) {
      const e = new Error("Une preuve ou note est requise pour faire avancer un incident.");
      e.code = 400; throw e;
    }
    it.phase = nextPhase;
    it.phaseHistory = it.phaseHistory || [];
    it.phaseHistory.push(entry);
    if (nextPhase === "RESOLVED") {
      it.status = "closed";
      it.closedAt = entry.at;
      it.resolution = safeText(opts.resolution || opts.note || opts.evidence || "résolu après vérification", 1000);
      pruneIncidents(d);
    }
    out = it;
  });
  return out;
}

export function closeIncident(id, resolution = null) {
  const it = getIncidentPacket(id);
  if (!it) return null;
  if ((it.phase || "DETECTED") !== "VERIFIED") {
    const e = new Error("Un incident ne peut être clôturé qu'après la phase VERIFIED.");
    e.code = 409; throw e;
  }
  return transitionIncident(id, "RESOLVED", { resolution, evidence: resolution || "vérification terminée" });
}
