// INCIDENT PACKETS — deterministic evidence bundles prepared before any AI call.
//
// CYCLE DE VIE (2026-09-18) : 166 paquets sur 166 étaient restés en DETECTED
// depuis vingt jours — la seule sortie était un POST manuel sans aucune UI, et
// 11 high jamais résolus rendaient le NO_GO du Release Guardian structurel.
//   · le regroupement se fait par signal.key (plus par key@révision : un seul
//     appareil en coupure faisait 40 paquets) ; la révision devient un attribut
//     (`revisions[]`) ; fenêtre 24 h pour conn:/apislow:, 15 min sinon ;
//   · `sweepIncidents` (10 min) RÉSOUT automatiquement, acteur « auto », un
//     paquet ouvert dont la clé est muette depuis 24 h (warn/info) ou 72 h
//     (high/critical), avec une révision main postérieure à la dernière
//     occurrence, et sans diagnostic « défaut réel » non réparé sur cette clé ;
//   · une clé qui revient après clôture ROUVRE le paquet (phase REOPENED,
//     recurrenceCount++) au lieu de créer un orphelin ;
//   · les paquets à l'ancien format de clusterKey restent lisibles, sans
//     fusion rétroactive.
import { config } from "./config.js";
import { revisionCourte } from "./git-revision.js";
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
// Les clés de bruit réseau se regroupent sur 24 h : un testeur en 3G n'est pas
// un incident nouveau toutes les 15 minutes.
const CLUSTER_BRUIT_MS = Number(process.env.DASH_INCIDENT_CLUSTER_BRUIT_H || 24) * 3_600_000;
const SWEEP_MS = Math.max(0, Number(process.env.DASH_INCIDENT_SWEEP_MIN ?? 10)) * 60_000;
const SILENCE_WARN_MS = 24 * 3_600_000;
const SILENCE_HIGH_MS = 72 * 3_600_000;
const SILENCE_SANS_REVISION_MS = 7 * 24 * 3_600_000;

export function clusterWindowFor(key) { return /^(conn|apislow):/.test(String(key || "")) ? CLUSTER_BRUIT_MS : CLUSTER_MS; }

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

// Révision lue par git-revision.js (dépôt principal OU worktree). Jusqu'au
// 2026-09-18 ce module lisait `.git` à la main en le supposant DOSSIER : dans un
// worktree la clé de regroupement (`clusterKey`) restait nue. `null` quand on
// ne sait pas — jamais une révision inventée.
function repoRevision() {
  return revisionCourte(config.repoPath, 12) || null;
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

export function canTransitionIncident(from, to, opts = {}) {
  if (!INCIDENT_PHASES.includes(from) || !INCIDENT_PHASES.includes(to)) return false;
  // L'acteur « auto » (balayage) peut résoudre depuis n'importe quelle phase :
  // c'est le silence prouvé qui résout, pas un parcours de phases humain.
  if (to === "RESOLVED" && opts.actor === "auto" && from !== "RESOLVED") return true;
  return NEXT[from] === to;
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
    clusterKey: signalKey || "signal",
    revisions: [{ sha: revision, firstSeenAt: new Date(ts).toISOString(), lastSeenAt: new Date(ts).toISOString(), occurrences: 1 }],
    recurrenceCount: 0,
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
    const fenetre = clusterWindowFor(incoming.clusterKey);
    const cluster = d.items.find((x) =>
      x.status !== "closed" && x.clusterKey === incoming.clusterKey
      && now - (Date.parse(x.lastSeenAt || x.createdAt) || 0) <= fenetre);
    if (cluster) {
      fusionner(cluster, incoming);
      result = cluster;
      pruneIncidents(d);
      return;
    }
    // La clé revient après une clôture : on rouvre le paquet clos le plus
    // récent (récidive), on ne fabrique pas un orphelin.
    const clos = d.items.find((x) => x.status === "closed" && x.clusterKey === incoming.clusterKey);
    if (clos) {
      rouvrir(clos, incoming, "auto");
      fusionner(clos, incoming);
      result = clos;
      pruneIncidents(d);
      return;
    }
    d.items.unshift(incoming);
    pruneIncidents(d);
  });
  return result;
}

function fusionner(cluster, incoming) {
  cluster.occurrences = (cluster.occurrences || 1) + 1;
  cluster.lastSeenAt = incoming.createdAt;
  cluster.evidence = mergeEvidence(cluster.evidence, incoming.evidence);
  cluster.evidenceCount = cluster.evidence.length;
  cluster.signal = { ...cluster.signal, alertId: incoming.signal.alertId, message: incoming.signal.message || cluster.signal.message };
  const rev = incoming.context && incoming.context.revision;
  cluster.revisions = Array.isArray(cluster.revisions) ? cluster.revisions : [];
  const r = cluster.revisions.find((x) => x.sha === rev);
  if (r) { r.lastSeenAt = incoming.createdAt; r.occurrences = (r.occurrences || 1) + 1; }
  else { cluster.revisions.push({ sha: rev, firstSeenAt: incoming.createdAt, lastSeenAt: incoming.createdAt, occurrences: 1 }); if (cluster.revisions.length > 20) cluster.revisions.shift(); }
  const c = confidenceFor(cluster); cluster.confidence = c.level; cluster.confidenceBasis = c.basis;
}

function rouvrir(it, incoming, actor) {
  const at = incoming ? incoming.createdAt : new Date().toISOString();
  it.reopenedFrom = it.closedAt || null;
  it.status = "open";
  it.phase = "DETECTED";
  it.closedAt = null;
  it.resolution = null;
  it.autoResolved = false;
  it.recurrenceCount = (it.recurrenceCount || 0) + 1;
  it.phaseHistory = it.phaseHistory || [];
  it.phaseHistory.push({ phase: "REOPENED", at, evidence: "le signal est revenu après clôture", note: null, actor: safeText(actor, 120) });
}

/** Rouvre le paquet clos le plus récent portant cette clé. Retourne le paquet, ou null. */
export function reopenIncidentBySignal(signalKey, { actor = "auto", at = new Date().toISOString() } = {}) {
  const key = safeText(signalKey, 180);
  let out = null;
  db.update((d) => {
    const clos = (d.items || []).find((x) => x.status === "closed" && x.clusterKey === key);
    if (!clos) return;
    rouvrir(clos, { createdAt: at }, actor);
    out = clos;
  });
  return out;
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
    if (!canTransitionIncident(current, nextPhase, { actor: opts.actor })) {
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
      it.resolvedBy = safeText(opts.actor || null, 120);
      it.autoResolved = opts.actor === "auto";
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

// ─── Balayage : résolution automatique par le silence prouvé ────────────────
const heures = (ms) => Math.round(ms / 360_000) / 10;

/**
 * Décide, pour UN paquet ouvert, s'il peut être résolu automatiquement. PUR.
 *   silenceMs  : 24 h (warn/info) ou 72 h (high/critical) sans occurrence de sa clé ;
 *   révision   : une révision main enregistrée APRÈS la dernière occurrence — ou,
 *                pour warn/info seulement, 7 jours de silence sans révision ;
 *   défaut     : aucun diagnostic « defect » sans réparation vérifiée sur la clé.
 * Retourne { resoudre, raison, evidence, revision }.
 */
export function decisionResolutionAuto(packet, { now = Date.now(), alerts = [], releases = [], diagnostics = [] } = {}) {
  const key = packet.clusterKey || packet.signal?.key;
  const signalKey = packet.signal?.key || key;
  const grave = packet.severity === "high" || packet.severity === "critical";
  const derniereAlerte = alerts.filter((a) => (a.key || a.title) === signalKey).reduce((m, a) => Math.max(m, Number(a.ts) || 0), 0);
  const lastSeen = Math.max(Date.parse(packet.lastSeenAt || packet.createdAt) || 0, derniereAlerte);
  const silence = now - lastSeen;
  const seuil = grave ? SILENCE_HIGH_MS : SILENCE_WARN_MS;
  if (silence < seuil) return { resoudre: false, raison: `silence ${heures(silence)} h < ${heures(seuil)} h` };
  const defautOuvert = diagnostics.some((d) => d.key === signalKey && d.verdict === "defect" && !(d.repair && d.repair.ok));
  if (defautOuvert) return { resoudre: false, raison: "diagnostic « défaut réel » sans réparation vérifiée" };
  const revision = releases.filter((r) => r && (r.branch === "main" || r.branch == null) && r.revision && (Date.parse(r.at) || 0) > lastSeen)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] || null;
  if (!revision && !(!grave && silence >= SILENCE_SANS_REVISION_MS)) return { resoudre: false, raison: "aucune révision main postérieure à la dernière occurrence" };
  const evidence = `aucune occurrence de ${signalKey} depuis ${heures(silence)} h` + (revision ? ` ; révision main ${revision.revision} postérieure` : " ; 7 jours de silence");
  return { resoudre: true, raison: revision ? "auto_quiet_after_deploy" : "auto_quiet_7d", evidence, revision: revision ? revision.revision : null };
}

/** Un balayage : résout ce qui peut l'être, avec preuve. Fournisseurs injectables. Retourne les ids résolus. */
export function sweepIncidents({ now = Date.now(), alerts = [], releases = [], diagnostics = [] } = {}) {
  const resolus = [];
  for (const it of (db.get().items || []).filter((x) => x.status !== "closed")) {
    const dec = decisionResolutionAuto(it, { now, alerts, releases, diagnostics });
    if (!dec.resoudre) continue;
    try {
      transitionIncident(it.id, "RESOLVED", { actor: "auto", evidence: dec.evidence, resolution: dec.raison });
      resolus.push(it.id);
    } catch {}
  }
  return resolus;
}

let _sweepTimer = null;
export function startIncidentSweep(everyMs = SWEEP_MS) {
  if (_sweepTimer || !everyMs) return _sweepTimer;
  const tour = async () => {
    try {
      // Imports paresseux : alerts.js importe ce module (cycle), sentinel.js est lourd.
      const [alerts, releases, sentinel] = await Promise.all([import("./alerts.js"), import("./release-recorder.js"), import("./sentinel.js")]);
      sweepIncidents({ alerts: alerts.listAlerts(), releases: releases.releaseHistory(120), diagnostics: sentinel.listDiagnoses(100) });
    } catch (e) { console.error("[incidents] balayage en échec :", e && e.message ? e.message : e); }
  };
  _sweepTimer = setInterval(tour, everyMs);
  if (typeof _sweepTimer.unref === "function") _sweepTimer.unref();
  return _sweepTimer;
}
export function stopIncidentSweep() { if (_sweepTimer) { clearInterval(_sweepTimer); _sweepTimer = null; } }

/** RÉSERVÉ AUX TESTS. */
export function _resetIncidentsForTests() { db.update((d) => { d.items = []; ensureRetention(d); }); }
