// ═══════════════════════════════════════════════════════════════════════════
// STORE — modèle temps réel en mémoire.
// Reçoit chaque événement de télémétrie (normalisé), maintient les vues dérivées
// (appareils, sessions d'activité, utilisateurs, bugs regroupés, séries
// temporelles, santé des services) et sert de source aux routes REST/SSE.
// Le statut des bugs est persisté (JsonDb) pour survivre aux redémarrages.
// ═══════════════════════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { config } from "./config.js";
import { JsonDb } from "./jsondb.js";

const ONLINE_MS = 70_000;        // appareil « en ligne » si vu il y a < 70 s
const ACTIVE_MS = 5 * 60_000;    // « actif » si vu il y a < 5 min

/** @typedef {Object} TelemetryEvent
 * @property {string} id @property {string} type @property {string} action
 * @property {string} severity @property {string} status @property {number|null} duration_ms
 * @property {string|null} user_id @property {string|null} user_label
 * @property {string} session_id @property {string} device_id
 * @property {string} platform @property {string} browser @property {string} app_version
 * @property {string} env @property {string|null} screen @property {string|null} endpoint
 * @property {number|null} http_status @property {string|null} message @property {string|null} stack
 * @property {number} ts  (ms epoch, received_at)
 */

/** Normalise une ligne telemetry_events (DB) en événement interne. */
export function normalize(row) {
  const ts = row.received_at ? Date.parse(row.received_at) : Date.now();
  return {
    id: row.id || row.event_id || crypto.randomUUID(),
    event_id: row.event_id || null,
    type: row.type || "action",
    action: row.action || null,
    severity: row.severity || "info",
    status: row.status || "ok",
    duration_ms: row.duration_ms ?? null,
    user_id: row.user_id || null,
    user_label: row.user_label || null,
    session_id: row.session_id || null,
    device_id: row.device_id || null,
    platform: row.platform || "other",
    browser: row.browser || "other",
    app_version: row.app_version || "?",
    env: row.env || "production",
    connection: row.connection || null,
    screen_size: row.screen_size || null,
    screen: row.screen || null,
    endpoint: row.endpoint || null,
    http_status: row.http_status ?? null,
    correlation_id: row.correlation_id || null,
    message: row.message || null,
    stack: row.stack || null,
    meta: row.meta || {},
    ts,
    client_ts: row.client_ts ? Date.parse(row.client_ts) : ts,
  };
}

/** Empreinte d'un bug : regroupe les erreurs équivalentes. */
function bugFingerprint(ev) {
  const msg = String(ev.message || ev.action || "erreur")
    .replace(/https?:\/\/\S+/g, "«url»")
    .replace(/\b[a-f0-9]{8,}\b/gi, "«id»")
    .replace(/\d+/g, "#")
    .slice(0, 140);
  const frame = String(ev.stack || "").split("\n").map((l) => l.trim())
    .find((l) => /\.js/i.test(l)) || "";
  const frameNorm = frame.replace(/:\d+:\d+/g, "").replace(/\?[^):]*/g, "").slice(0, 160);
  const key = [ev.type, ev.action, msg, frameNorm, ev.app_version].join("|");
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
}

/** Extrait un pointeur fichier:ligne exploitable depuis une stack. */
function extractCodeRef(stack) {
  if (!stack) return null;
  const lines = String(stack).split("\n");
  for (const l of lines) {
    const m = l.match(/((?:https?:\/\/[^\s)]+|[\w./-]+)\.js)[:?](\d+)?(?::(\d+))?/i);
    if (m) {
      let file = m[1].replace(/^https?:\/\/[^/]+\//, "");        // garde le chemin
      file = file.replace(/\?.*$/, "");
      const fnMatch = l.match(/at\s+([\w.$<>]+)\s/);
      return { file, line: m[2] ? Number(m[2]) : null, fn: fnMatch ? fnMatch[1] : null };
    }
  }
  return null;
}

class Store {
  constructor() {
    /** @type {TelemetryEvent[]} */
    this.events = [];
    this.seen = new Set();               // dédup event_id
    this.devices = new Map();
    this.sessions = new Map();           // sessions d'activité (par session_id)
    this.users = new Map();
    this.bugs = new Map();               // fingerprint -> bug live
    this.links = new Map();              // linkId -> cycle de vie d'un lien partagé
    this.testUids = new Set();           // comptes de test à EXCLURE (faux profils @passio-e2e.test)
    this.internalUids = new Set(config.internalUids); // exclusion interne OPTIONNELLE (vide par défaut → tes comptes comptent comme testeurs)
    this.resolvedNames = {};             // uid -> pseudo (résolu depuis profiles)
    // statut/notes de bug persistés (survivent au redémarrage)
    this.bugMeta = new JsonDb("bug-meta", {});
  }

  /** Définit les identifiants des comptes de test à ne jamais compter. */
  setTestUids(ids) { this.testUids = new Set(ids || []); }

  /** Un uid à ne JAMAIS compter comme testeur : compte jetable e2e OU compte
   *  interne (le tien). Filtre unique réutilisé par tous les modules. */
  isExcludedUid(uid) { return !!uid && (this.testUids.has(uid) || this.internalUids.has(uid)); }

  /** Enregistre des pseudos résolus (uid -> username). */
  setResolvedNames(obj) { Object.assign(this.resolvedNames, obj || {}); }
  /** uids observés sans pseudo connu (à résoudre via profiles). */
  unresolvedUids() {
    const out = [];
    for (const [uid, u] of this.users) if (!u.label && !this.resolvedNames[uid] && !this.isExcludedUid(uid)) out.push(uid);
    return out;
  }
  /** Carte uid -> nom lisible pour le client (pseudo d'événement ou résolu). */
  clientNames() {
    const out = { ...this.resolvedNames };
    for (const [uid, u] of this.users) if (u.label) out[uid] = u.label;
    return out;
  }

  /** @param {TelemetryEvent} ev */
  add(ev) {
    // Ne compter que les VRAIS testeurs :
    //  • env≠production = runs e2e / dev local (des milliers de faux appareils) → ignoré ;
    //  • compte jetable e2e OU compte interne (le tien) → ignoré.
    if (config.onlyProdEvents && ev.env !== "production") return false;
    if (this.isExcludedUid(ev.user_id)) return false;
    if (ev.event_id) {
      if (this.seen.has(ev.event_id)) return false;
      this.seen.add(ev.event_id);
      if (this.seen.size > config.eventBuffer * 2) {
        // borne l'ensemble de dédup
        this.seen = new Set([...this.seen].slice(-config.eventBuffer));
      }
    }
    this.events.push(ev);
    if (this.events.length > config.eventBuffer) this.events.shift();

    this._touchDevice(ev);
    this._touchSession(ev);
    this._touchUser(ev);
    if (ev.type === "link") this._touchLink(ev);
    if (this._isProblem(ev)) this._recordBug(ev);
    return true;
  }

  /** Un événement « à problème » : erreur JS, coupure de connexion ou appel
   *  API en échec. Élargit la notion de bug pour que TOUT problème rencontré
   *  par un testeur remonte dans « Problèmes » — pas seulement les erreurs JS
   *  (un testeur en coupure réseau était auparavant totalement invisible). */
  _isProblem(ev) {
    if (ev.type === "error") return true;
    if (ev.type === "connectivity") return ev.severity === "error" || ev.severity === "warn";
    if (ev.type === "api" && ev.status === "error") return true;
    return false;
  }

  _touchDevice(ev) {
    if (!ev.device_id) return;
    let d = this.devices.get(ev.device_id);
    if (!d) { d = { deviceId: ev.device_id, firstSeen: ev.ts, errorCount: 0 }; this.devices.set(ev.device_id, d); }
    d.lastSeen = ev.ts;
    d.platform = ev.platform; d.browser = ev.browser; d.appVersion = ev.app_version;
    d.env = ev.env;
    if (ev.connection) d.connection = ev.connection;
    if (ev.screen_size) d.screenSize = ev.screen_size;
    if (ev.user_id) { d.userId = ev.user_id; d.userLabel = ev.user_label || d.userLabel; }
    if (ev.session_id) d.sessionId = ev.session_id;
    if (ev.screen) d.screen = ev.screen;
    if (this._isProblem(ev)) { d.errorCount = (d.errorCount || 0) + 1; d.lastProblem = ev.ts; }
    // Suit l'état de connexion pour repérer un appareil « en difficulté ».
    if (ev.type === "connectivity") {
      if (ev.action === "offline" || ev.action === "send_failed") d.offline = true;
      else if (ev.action === "online" || ev.action === "recovered") d.offline = false;
      d.lastConnEvent = ev.action;
    }
  }

  _touchSession(ev) {
    if (!ev.session_id) return;
    let s = this.sessions.get(ev.session_id);
    if (!s) { s = { sessionId: ev.session_id, deviceId: ev.device_id, start: ev.ts, screens: [], eventCount: 0, errorCount: 0 }; this.sessions.set(ev.session_id, s); }
    s.last = ev.ts; s.eventCount++;
    s.userId = ev.user_id || s.userId; s.userLabel = ev.user_label || s.userLabel;
    s.platform = ev.platform; s.browser = ev.browser; s.appVersion = ev.app_version; s.env = ev.env;
    if (this._isProblem(ev)) s.errorCount++;
    if (ev.type === "nav" && ev.screen && s.screens[s.screens.length - 1] !== ev.screen) {
      s.screens.push(ev.screen);
      if (s.screens.length > 100) s.screens.shift();
    }
  }

  _touchUser(ev) {
    if (!ev.user_id) return;
    let u = this.users.get(ev.user_id);
    if (!u) { u = { userId: ev.user_id, devices: new Set(), firstSeen: ev.ts }; this.users.set(ev.user_id, u); }
    u.lastSeen = ev.ts; u.label = ev.user_label || u.label;
    if (ev.device_id) u.devices.add(ev.device_id);
  }

  // ── Suivi du cycle de vie des liens partagés ────────────────────────────────
  // PRINCIPE D'HONNÊTETÉ : on ne prétend JAMAIS qu'un lien a été « cliqué ».
  // On distingue des étapes prouvées par un signal réel :
  //   créé (link_create) → partagé/copié (link_share) → OUVERTURE CONFIRMÉE
  //   (link_open : la page a réellement chargé sur l'appareil cible et a émis le
  //   marqueur ?plk) → échec de chargement (link_load_error). Un lien partagé
  //   sans signal d'ouverture reste « non confirmé », jamais « ouvert ».
  _touchLink(ev) {
    const id = ev.correlation_id || (ev.meta && ev.meta.link_id);
    if (!id) return;
    let l = this.links.get(id);
    if (!l) {
      l = {
        id, kind: null, target: null, createdAt: null,
        createdBy: null, createdByLabel: null, createdDevice: null, createdPlatform: null,
        shareCount: 0, channels: new Set(), shares: [],
        opens: [], openDevices: new Set(), openCount: 0, errorOpens: 0,
        firstOpen: null, lastOpen: null, lastEvent: ev.ts,
      };
      this.links.set(id, l);
      // Borne la carte (les liens les plus anciens sont évincés).
      if (this.links.size > 8000) { const first = this.links.keys().next().value; this.links.delete(first); }
    }
    l.lastEvent = ev.ts;
    const m = ev.meta || {};
    if (ev.action === "link_create") {
      l.createdAt = l.createdAt || ev.ts;
      l.kind = m.link_kind || l.kind;
      l.target = m.link_target || l.target;
      l.createdBy = ev.user_id || l.createdBy;
      l.createdByLabel = ev.user_label || l.createdByLabel;
      l.createdDevice = ev.device_id || l.createdDevice;
      l.createdPlatform = ev.platform || l.createdPlatform;
    } else if (ev.action === "link_share" || ev.action === "link_copy") {
      l.shareCount++;
      if (m.link_channel) l.channels.add(m.link_channel);
      l.shares.push({ ts: ev.ts, channel: m.link_channel || "?" });
      if (l.shares.length > 50) l.shares.shift();
      if (!l.createdBy && ev.user_id) { l.createdBy = ev.user_id; l.createdByLabel = ev.user_label; }
    } else if (ev.action === "link_open" || ev.action === "link_load_error") {
      const err = ev.action === "link_load_error" || ev.status === "error";
      l.opens.push({
        ts: ev.ts, device: ev.device_id, platform: ev.platform, browser: ev.browser,
        user: ev.user_id, userLabel: ev.user_label, status: err ? "error" : "ok",
        session: ev.session_id,
      });
      if (l.opens.length > 100) l.opens.shift();
      if (ev.device_id) l.openDevices.add(ev.device_id);
      l.openCount++;
      if (err) l.errorOpens++;
      l.firstOpen = l.firstOpen || ev.ts;
      l.lastOpen = ev.ts;
    }
  }

  // Étape la plus avancée PROUVÉE par un signal (jamais de supposition).
  _linkStatus(l) {
    if (l.openCount > 0) return (l.errorOpens && l.errorOpens === l.openCount) ? "opened_error" : "opened";
    if (l.shareCount > 0) return "shared";     // partagé mais AUCUN signal d'ouverture → non confirmé
    if (l.createdAt) return "created";
    return "unknown";
  }

  _linkDto(l, full = false) {
    const dto = {
      id: l.id, kind: l.kind, target: l.target, status: this._linkStatus(l),
      orphan: !l.createdAt,                     // ouverture sans création connue de notre côté
      createdAt: l.createdAt, createdBy: l.createdBy, createdByLabel: l.createdByLabel,
      createdPlatform: l.createdPlatform,
      shareCount: l.shareCount, channels: [...l.channels],
      openCount: l.openCount, openDevices: l.openDevices.size, errorOpens: l.errorOpens,
      firstOpen: l.firstOpen, lastOpen: l.lastOpen, lastEvent: l.lastEvent,
    };
    if (full) { dto.shares = l.shares.slice(); dto.opens = l.opens.slice(); }
    return dto;
  }

  linkList(limit = 300) {
    return [...this.links.values()].map((l) => this._linkDto(l))
      .sort((a, b) => b.lastEvent - a.lastEvent).slice(0, limit);
  }
  link(id) { const l = this.links.get(id); return l ? this._linkDto(l, true) : null; }

  /** Entonnoir des liens : chiffres honnêtes, chaque étape adossée à un signal réel. */
  linkFunnel() {
    const now = Date.now(), DAY = 24 * 60 * 60_000;
    const all = [...this.links.values()];
    const created = all.filter((l) => l.createdAt).length;
    const shared = all.filter((l) => l.shareCount > 0).length;
    const openedOk = all.filter((l) => l.openCount > 0 && l.errorOpens < l.openCount).length;
    const openedErr = all.filter((l) => l.openCount > 0 && l.errorOpens === l.openCount).length;
    const sharedUnconfirmed = all.filter((l) => l.shareCount > 0 && l.openCount === 0).length;
    const orphanOpens = all.filter((l) => !l.createdAt && l.openCount > 0).length;
    const totalOpens = all.reduce((a, l) => a + l.openCount, 0);
    const sharedThenOpened = all.filter((l) => l.shareCount > 0 && l.openCount > 0).length;
    return {
      total: all.length, created, shared,
      opened: openedOk, openedError: openedErr, sharedUnconfirmed, orphanOpens, totalOpens,
      // Taux d'ouverture confirmée PARMI les liens partagés (dénominateur honnête).
      openRate: shared ? Math.round((sharedThenOpened / shared) * 100) : null,
      createdToday: all.filter((l) => l.createdAt && now - l.createdAt < DAY).length,
      openedToday: all.filter((l) => l.firstOpen && now - l.firstOpen < DAY).length,
      lastActivity: all.length ? Math.max(...all.map((l) => l.lastEvent)) : null,
    };
  }

  _recordBug(ev) {
    const fp = bugFingerprint(ev);
    let b = this.bugs.get(fp);
    if (!b) {
      b = {
        id: fp, title: (ev.message || ev.action || "Erreur").slice(0, 120),
        type: ev.type, action: ev.action, firstSeen: ev.ts, count: 0,
        users: new Set(), devices: new Set(), versions: new Set(), screens: new Set(),
        severity: ev.severity || "error", message: ev.message, stack: ev.stack,
        endpoint: ev.endpoint, httpStatus: ev.http_status,
        codeRef: extractCodeRef(ev.stack), samples: [],
      };
      this.bugs.set(fp, b);
    }
    b.lastSeen = ev.ts; b.count++;
    if (ev.user_id) b.users.add(ev.user_id);
    if (ev.device_id) b.devices.add(ev.device_id);
    if (ev.app_version) b.versions.add(ev.app_version);
    if (ev.screen) b.screens.add(ev.screen);
    if (ev.stack && !b.stack) { b.stack = ev.stack; b.codeRef = extractCodeRef(ev.stack); }
    if (b.samples.length < 8) b.samples.push({ ts: ev.ts, message: ev.message, session: ev.session_id, device: ev.device_id, correlation: ev.correlation_id });
    // gravité = la plus élevée observée
    const rank = { info: 1, warn: 2, error: 3, critical: 4 };
    if ((rank[ev.severity] || 0) > (rank[b.severity] || 0)) b.severity = ev.severity;
  }

  // ── Lectures ───────────────────────────────────────────────────────────

  recent(filter = {}, limit = 200) {
    let out = this.events;
    if (filter.type) out = out.filter((e) => e.type === filter.type);
    if (filter.severity) out = out.filter((e) => e.severity === filter.severity);
    if (filter.user) out = out.filter((e) => e.user_id === filter.user || e.user_label === filter.user);
    if (filter.device) out = out.filter((e) => e.device_id === filter.device);
    if (filter.session) out = out.filter((e) => e.session_id === filter.session);
    if (filter.env) out = out.filter((e) => e.env === filter.env);
    if (filter.screen) out = out.filter((e) => e.screen === filter.screen);
    if (filter.status) out = out.filter((e) => e.status === filter.status);
    if (filter.q) {
      const q = String(filter.q).toLowerCase();
      out = out.filter((e) => JSON.stringify(e).toLowerCase().includes(q));
    }
    return out.slice(-limit).reverse();
  }

  overview() {
    const now = Date.now();
    const events = this.events;
    const online = [...this.devices.values()].filter((d) => now - d.lastSeen < ONLINE_MS);
    const activeUsers = [...this.users.values()].filter((u) => now - u.lastSeen < ACTIVE_MS);
    const onlineUsers = new Set(online.map((d) => d.userId).filter(Boolean));
    const activeSessions = [...this.sessions.values()].filter((s) => now - s.last < ACTIVE_MS);
    const last5 = events.filter((e) => now - e.ts < 5 * 60_000);
    const count = (pred) => events.filter(pred).length;
    const apis = events.filter((e) => e.type === "api" && e.duration_ms != null);
    const avgLatency = apis.length ? Math.round(apis.reduce((a, e) => a + e.duration_ms, 0) / apis.length) : 0;
    const apiErrors = count((e) => e.type === "api" && e.status === "error");
    const totalApis = count((e) => e.type === "api");
    const openBugs = [...this.bugs.values()].filter((b) => (this._status(b.id) !== "corrige" && this._status(b.id) !== "ignore"));
    const criticalBugs = openBugs.filter((b) => b.severity === "critical");

    return {
      totals: {
        users: this.users.size,
        onlineUsers: onlineUsers.size,
        activeUsers: activeUsers.length,
        onlineDevices: online.length,
        sessions: activeSessions.length,
        signups: count((e) => e.action === "signup" || e.action === "account_created"),
        // Compte les marqueurs sémantiques ET les vrais inserts DB (HTTP 201),
        // pour refléter l'activité même si un marqueur ne s'est pas déclenché.
        publications: count((e) => /publish_/.test(e.action || "") || (e.type === "api" && /\/posts(\?|$)/.test(e.endpoint || "") && e.http_status === 201)),
        messages: count((e) => e.action === "send_message" || (e.type === "api" && /conv_messages/.test(e.endpoint || "") && e.http_status === 201)),
        comments: count((e) => e.action === "comment_post" || (e.type === "api" && /post_comments/.test(e.endpoint || "") && e.http_status === 201)),
        reactions: count((e) => /react|like_post/.test(e.action || "") || (e.type === "api" && /(post_likes|comment_interactions|event_reactions)/.test(e.endpoint || "") && e.http_status === 201)),
        notifications: count((e) => /notif/.test(e.action || "") || (e.type === "api" && /notifications/.test(e.endpoint || "") && e.http_status === 201)),
        errors: count((e) => e.type === "error"),
        // Problèmes de connexion des testeurs (coupures, échecs d'envoi) sur 30 min.
        connectivityIssues: events.filter((e) => e.type === "connectivity" && e.severity !== "info" && now - e.ts < 30 * 60_000).length,
        // Appareils « en difficulté » : un problème (erreur/coupure) récent.
        strugglingDevices: [...this.devices.values()].filter((d) => d.lastProblem && now - d.lastProblem < ACTIVE_MS).length,
        criticalBugs: criticalBugs.length,
        openBugs: openBugs.length,
        actionsPerMin: last5.length ? Math.round(last5.length / 5) : 0,
        avgLatency,
        apiSuccessRate: totalApis ? Math.round(((totalApis - apiErrors) / totalApis) * 100) : 100,
      },
      health: this.health(),
      links: this.linkFunnel(),
      updatedAt: now,
    };
  }

  /** Santé synthétique de Passio. */
  health() {
    const now = Date.now();
    const win = this.events.filter((e) => now - e.ts < 5 * 60_000);
    // Erreurs JS + problèmes de connexion : une coupture réseau doit peser sur la santé.
    const errs = win.filter((e) => e.type === "error" || (e.type === "connectivity" && e.severity !== "info")).length;
    const connErrs = win.filter((e) => e.type === "connectivity" && e.severity === "error").length;
    const critical = [...this.bugs.values()].some((b) => b.severity === "critical" && now - b.lastSeen < 5 * 60_000);
    const apis = win.filter((e) => e.type === "api");
    const apiErrRate = apis.length ? apis.filter((e) => e.status === "error").length / apis.length : 0;
    let level = "operational", label = "Opérationnel";
    if (critical || apiErrRate > 0.4) { level = "critical"; label = "Critique"; }
    else if (errs > 8 || apiErrRate > 0.15 || connErrs >= 3) { level = "degraded"; label = "Dégradé"; }
    else if (errs > 2 || apiErrRate > 0.05 || connErrs >= 1) { level = "minor"; label = "Légèrement dégradé"; }
    return { level, label, errors5m: errs, apiErrorRate: Math.round(apiErrRate * 100), connErrors5m: connErrs };
  }

  /** Série temporelle par minute (N dernières minutes) pour un graphe. */
  timeseries(minutes = 30) {
    const now = Date.now();
    const buckets = [];
    for (let i = minutes - 1; i >= 0; i--) {
      const start = now - i * 60_000;
      const label = new Date(start).toISOString().slice(11, 16);
      buckets.push({ t: label, events: 0, errors: 0, api: 0, messages: 0, publications: 0, latencySum: 0, latencyN: 0 });
    }
    const base = now - minutes * 60_000;
    for (const e of this.events) {
      if (e.ts < base) continue;
      const idx = Math.min(minutes - 1, Math.floor((e.ts - base) / 60_000));
      const b = buckets[idx]; if (!b) continue;
      b.events++;
      if (e.type === "error") b.errors++;
      if (e.type === "api") { b.api++; if (e.duration_ms != null) { b.latencySum += e.duration_ms; b.latencyN++; } }
      if (e.action === "send_message") b.messages++;
      if (/publish_/.test(e.action || "")) b.publications++;
    }
    return buckets.map((b) => ({ t: b.t, events: b.events, errors: b.errors, api: b.api, messages: b.messages, publications: b.publications, latency: b.latencyN ? Math.round(b.latencySum / b.latencyN) : 0 }));
  }

  deviceList() {
    const now = Date.now();
    return [...this.devices.values()].map((d) => ({
      ...d,
      online: now - d.lastSeen < ONLINE_MS,
      active: now - d.lastSeen < ACTIVE_MS,
      idleMs: now - d.lastSeen,
      // « En difficulté » : a rencontré un problème (erreur/coupure) récemment.
      struggling: !!(d.lastProblem && now - d.lastProblem < ACTIVE_MS),
      netTrouble: !!d.offline,
    })).sort((a, b) => (Number(b.struggling) - Number(a.struggling)) || (b.lastSeen - a.lastSeen));
  }

  sessionList() {
    return [...this.sessions.values()].map((s) => ({ ...s, durationMs: (s.last || s.start) - s.start }))
      .sort((a, b) => b.last - a.last);
  }

  userJourney(sessionId) {
    return this.events.filter((e) => e.session_id === sessionId).sort((a, b) => a.ts - b.ts);
  }

  // ── Visiteurs : « qui ouvre l'app / le lien », un enregistrement par appareil ──
  // Unité = l'APPAREIL (device_id anonyme stable), au plus proche d'« une personne
  // qui a ouvert l'app ». On expose TOUT ce que la télémétrie connaît réellement :
  // plateforme, navigateur, OS, taille d'écran, connexion, environnement, nb de
  // sessions/événements, écrans parcourus, lien(s) d'arrivée, et — s'il a créé un
  // compte — l'identité liée. La télémétrie masque le PII par conception : AUCUN
  // numéro ici. Le numéro (saisi à l'inscription) vit dans auth.users et n'est
  // réuni aux infos de connexion que dans la vue « Comptes » (voir accounts.js).
  visitorList() {
    const now = Date.now();
    // Agrégats par appareil : sessions, événements, écrans distincts parcourus.
    const perDev = new Map();
    for (const s of this.sessions.values()) {
      if (!s.deviceId) continue;
      let a = perDev.get(s.deviceId);
      if (!a) { a = { sessions: 0, events: 0, screens: new Set() }; perDev.set(s.deviceId, a); }
      a.sessions++; a.events += s.eventCount || 0;
      (s.screens || []).forEach((sc) => a.screens.add(sc));
    }
    // Lien(s) d'arrivée : ouvertures confirmées (?plk) attribuées à cet appareil.
    const linkByDev = new Map();
    for (const l of this.links.values()) {
      for (const o of (l.opens || [])) {
        if (!o.device) continue;
        let set = linkByDev.get(o.device);
        if (!set) { set = new Set(); linkByDev.set(o.device, set); }
        set.add(l.id);
      }
    }
    return [...this.devices.values()].map((d) => {
      const agg = perDev.get(d.deviceId) || { sessions: 0, events: 0, screens: new Set() };
      const viaLinks = [...(linkByDev.get(d.deviceId) || [])];
      return {
        deviceId: d.deviceId,
        firstSeen: d.firstSeen, lastSeen: d.lastSeen,
        online: now - d.lastSeen < ONLINE_MS,
        active: now - d.lastSeen < ACTIVE_MS,
        idleMs: now - d.lastSeen,
        platform: d.platform || "other",
        browser: d.browser || "other",
        appVersion: d.appVersion || "?",
        env: d.env || "production",
        connection: d.connection || null,
        screenSize: d.screenSize || null,
        screen: d.screen || null,
        sessions: agg.sessions,
        events: agg.events,
        screens: [...agg.screens],
        userId: d.userId || null,
        userLabel: d.userLabel || null,
        signedUp: !!d.userId,
        viaLinks, viaLink: viaLinks[0] || null,
        errorCount: d.errorCount || 0,
        netTrouble: !!d.offline,
      };
    }).sort((a, b) => (Number(b.online) - Number(a.online)) || (b.lastSeen - a.lastSeen));
  }

  /** Entonnoir des visiteurs : ouverture app → arrivée par lien → compte créé. */
  visitorFunnel() {
    const now = Date.now(), DAY = 24 * 60 * 60_000;
    const devs = [...this.devices.values()];
    // Appareils arrivés via une ouverture de lien confirmée (?plk).
    const viaLink = new Set();
    for (const l of this.links.values()) for (const dev of l.openDevices) viaLink.add(dev);
    return {
      total: devs.length,
      prod: devs.filter((d) => (d.env || "production") === "production").length,
      viaLink: viaLink.size,
      signedUp: devs.filter((d) => d.userId).length,
      online: devs.filter((d) => now - d.lastSeen < ONLINE_MS).length,
      today: devs.filter((d) => now - d.firstSeen < DAY).length,
      lastSeen: devs.length ? Math.max(...devs.map((d) => d.lastSeen)) : null,
      // ⚠️ RUPTURE DE SÉRIE au 2026-08-15 — ne pas comparer avant/après.
      //
      // Un appareil n'apparaît ici que s'il a produit au moins un événement
      // CONSERVÉ. Or jusqu'au 2026-08-15, la télémétrie pré-authentification
      // partait sous une identité fabriquée (« u_… ») que la RLS rejetait
      // systématiquement : un visiteur qui n'a jamais créé de compte ne laissait
      // donc AUCUNE trace, et n'était pas compté.
      //
      // Conséquence : avant cette date, `total` sous-estimait précisément la
      // population que cet entonnoir sert à mesurer, et le taux de conversion
      // visiteurs → comptes était donc SURESTIMÉ. Les deux bornes sont
      // correctes depuis. Voir TEL-IDENT-002 dans PASSIO_MASTER_CONTROL.md.
      rupture: { depuis: "2026-08-15", motif: "télémétrie pré-auth rejetée avant cette date : visiteurs non convertis invisibles, conversion surestimée" },
    };
  }

  _status(id) { return (this.bugMeta.get()[id] || {}).status || "nouveau"; }

  bugList() {
    return [...this.bugs.values()].map((b) => this._bugDto(b))
      .sort((a, b) => (b.severityRank - a.severityRank) || (b.lastSeen - a.lastSeen));
  }
  bug(id) { const b = this.bugs.get(id); return b ? this._bugDto(b, true) : null; }

  _bugDto(b, full = false) {
    const rank = { info: 1, warn: 2, error: 3, critical: 4 };
    const meta = this.bugMeta.get()[b.id] || {};
    const dto = {
      id: b.id, title: b.title, type: b.type, action: b.action,
      severity: b.severity, severityRank: rank[b.severity] || 2,
      status: meta.status || "nouveau", assignee: meta.assignee || null, notes: meta.notes || null,
      count: b.count, firstSeen: b.firstSeen, lastSeen: b.lastSeen,
      users: b.users.size, devices: b.devices.size,
      versions: [...b.versions], screens: [...b.screens],
      endpoint: b.endpoint, httpStatus: b.httpStatus, codeRef: b.codeRef,
      message: b.message,
    };
    if (full) { dto.stack = b.stack; dto.samples = b.samples; dto.affectedUsers = [...b.users]; dto.affectedDevices = [...b.devices]; }
    return dto;
  }

  updateBug(id, patch) {
    if (!this.bugs.has(id)) return null;
    this.bugMeta.update((m) => { m[id] = { ...(m[id] || {}), ...patch, updatedAt: Date.now() }; });
    return this.bug(id);
  }

  /** Perf API agrégée par endpoint. */
  apiPerf() {
    const map = new Map();
    for (const e of this.events) {
      if (e.type !== "api" || e.duration_ms == null) continue;
      const key = e.action || e.endpoint || "?";
      let a = map.get(key);
      if (!a) { a = { endpoint: key, n: 0, sum: 0, max: 0, errors: 0, durations: [] }; map.set(key, a); }
      a.n++; a.sum += e.duration_ms; a.max = Math.max(a.max, e.duration_ms);
      if (e.status === "error") a.errors++;
      a.durations.push(e.duration_ms);
    }
    return [...map.values()].map((a) => {
      const sorted = a.durations.sort((x, y) => x - y);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || a.max;
      return { endpoint: a.endpoint, calls: a.n, avg: Math.round(a.sum / a.n), p95: Math.round(p95), max: Math.round(a.max), errorRate: Math.round((a.errors / a.n) * 100) };
    }).sort((a, b) => b.calls - a.calls);
  }

  /** Carte des services : santé dérivée des endpoints observés. */
  services() {
    const now = Date.now();
    const win = this.events.filter((e) => now - e.ts < 10 * 60_000);
    const groups = {
      "Frontend web": (e) => e.type === "nav" || e.type === "click" || e.type === "session",
      "API Supabase": (e) => e.type === "api" && /supabase|rest\/v1/i.test(e.endpoint || e.action || ""),
      "Authentification": (e) => /auth/i.test(e.endpoint || e.action || ""),
      "Base de données": (e) => e.type === "api" && /rest\/v1/i.test(e.endpoint || ""),
      "Messagerie": (e) => /message|conv_/i.test(e.action || e.endpoint || ""),
      "Notifications": (e) => /notif/i.test(e.action || e.endpoint || ""),
      "Stockage médias": (e) => /storage|upload|media/i.test(e.action || e.endpoint || ""),
      "Realtime": (e) => /realtime/i.test(e.endpoint || e.action || ""),
    };
    return Object.entries(groups).map(([name, pred]) => {
      const evs = win.filter(pred);
      const errs = evs.filter((e) => e.status === "error").length;
      const rate = evs.length ? errs / evs.length : 0;
      let status = "unknown";
      if (evs.length) status = rate > 0.4 ? "down" : rate > 0.15 ? "degraded" : rate > 0.05 ? "slow" : "operational";
      const lat = evs.filter((e) => e.duration_ms != null);
      const avg = lat.length ? Math.round(lat.reduce((a, e) => a + e.duration_ms, 0) / lat.length) : null;
      return { name, status, samples: evs.length, errorRate: Math.round(rate * 100), avgLatency: avg, lastSeen: evs.length ? Math.max(...evs.map((e) => e.ts)) : null };
    });
  }
}

export const store = new Store();
