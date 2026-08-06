/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — Télémétrie (instrumentation du centre de pilotage)
 * ---------------------------------------------------------------------------
 * Service CENTRALISÉ de télémétrie : un seul point d'émission, un schéma
 * d'événement commun, du masquage PII, de l'échantillonnage et un opt-in strict.
 * Écrit dans la table Supabase `telemetry_events` (voir migration_telemetry.sql),
 * lue en temps réel par le backend du tableau de bord (clé service_role).
 *
 * CHARGEMENT : classique dans <head>, APRÈS platform.js (réutilise window.supa).
 * Ne dépend d'aucun autre script app-*, ne casse rien s'ils manquent (guards).
 *
 * ACTIVATION : en production, ACTIVE par défaut (suivi continu de la beta) avec
 * OPT-OUT, données minimisées (aucun PII — voir plus bas). À refléter dans la
 * politique de confidentialité.
 *   • ?telemetry=0  (ou localStorage.passio_telemetry="0") → désactive DURABLEMENT ;
 *   • ?telemetry=1  → force la capture complète (debug ciblé) ;
 *   • localhost / 127.0.0.1 → toujours actif ;
 *   • PASSIO_TELEMETRY_SAMPLE ∈ [0,1] → fraction d'appareils capturés (1 = tous) ;
 *   • PASSIO_TELEMETRY_DEFAULT_ON = false → repli opt-in strict (seul ?telemetry=1).
 *
 * CONFIDENTIALITÉ : jamais de mot de passe, token, clé, e-mail, code d'accès ni
 * contenu de message privé. `meta` est filtré par liste blanche + scrubber ;
 * `message` passe par redactString(). Cf. section 28 du cahier des charges.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var APP_VERSION = (window.PASSIO_APP_VERSION || "2026.08.0");

  // ─── Activation (opt-out en prod) ──────────────────────────────────────────
  var TELEMETRY_DEFAULT_ON = (window.PASSIO_TELEMETRY_DEFAULT_ON !== false); // false = opt-in strict
  var TELEMETRY_SAMPLE = (typeof window.PASSIO_TELEMETRY_SAMPLE === "number") ? window.PASSIO_TELEMETRY_SAMPLE : 1;

  function _deviceIdRaw() {
    try {
      var d = localStorage.getItem("passio_device_id");
      if (!d) { d = "dev_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 18); localStorage.setItem("passio_device_id", d); }
      return d;
    } catch (e) { return "dev_ephemere"; }
  }
  // Décision d'échantillonnage STABLE par appareil (toujours dedans ou dehors).
  function _sampledIn(frac) {
    if (frac >= 1) return true;
    if (frac <= 0) return false;
    var d = _deviceIdRaw(), h = 0;
    for (var i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
    return (h % 10000) / 10000 < frac;
  }
  function readEnabled() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("telemetry") === "1") { localStorage.setItem("passio_telemetry", "1"); return true; } // capture complète forcée
      if (q.get("telemetry") === "0") { localStorage.setItem("passio_telemetry", "0"); return false; } // opt-out durable
      var stored = localStorage.getItem("passio_telemetry");
      if (stored === "1") return true;
      if (stored === "0") return false;                            // l'utilisateur a refusé
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return true;
      return TELEMETRY_DEFAULT_ON && _sampledIn(TELEMETRY_SAMPLE); // défaut prod : actif (échantillonné)
    } catch (e) { return false; }
  }
  var ENABLED = readEnabled();

  // ─── Environnement ──────────────────────────────────────────────────────
  function detectEnv() {
    var h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "development";
    if (/deploy-preview|--/.test(h) || /netlify\.app$/.test(h) && /preview/.test(h)) return "preview";
    return "production";
  }
  function detectPlatform() {
    var ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return "ios";
    if (/android/i.test(ua)) return "android";
    if (/windows/i.test(ua)) return "windows";
    if (/mac os x/i.test(ua)) return "mac";
    if (/linux/i.test(ua)) return "linux";
    return "other";
  }
  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/edg(e|\/)/i.test(ua)) return "edge";
    if (/samsungbrowser/i.test(ua)) return "samsung";
    if (/opr\//i.test(ua)) return "opera";
    if (/firefox|fxios/i.test(ua)) return "firefox";
    if (/chrome|crios|chromium/i.test(ua) && !/edg/i.test(ua)) return "chrome";
    if (/safari/i.test(ua)) return "safari";
    return "other";
  }
  function connectionType() {
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return c && c.effectiveType ? c.effectiveType : "";
    } catch (e) { return ""; }
  }

  // ─── Identifiants ─────────────────────────────────────────────────────────
  function uid16() {
    // id court non cryptographique (dédup/corrélation, pas un secret).
    var s = "";
    var a = "0123456789abcdefghijklmnopqrstuvwxyz";
    for (var i = 0; i < 16; i++) s += a[(Math.random() * a.length) | 0];
    return Date.now().toString(36) + "-" + s;
  }
  var DEVICE_ID = _deviceIdRaw();
  var SESSION_ID = "s_" + uid16();       // une session logique par onglet/chargement
  var ENV = detectEnv();
  var PLATFORM = detectPlatform();
  var BROWSER = detectBrowser();
  var SCREEN_SIZE = (window.screen ? screen.width + "x" + screen.height : "");

  // ─── Masquage PII ─────────────────────────────────────────────────────────
  var DENY_KEY = /(pass|pwd|token|secret|apikey|api_key|\bkey\b|auth|jwt|bearer|code|email|mail|phone|tel|iban|card|cvv|ssn|content|body|\btext\b|message|vocal|base64|password)/i;
  var EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  var JWT_RE = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{5,}/g;
  var LONGHEX_RE = /\b[a-f0-9]{32,}\b/gi;

  function redactString(v) {
    if (v == null) return v;
    var s = String(v);
    if (/^data:/i.test(s)) return "[data-uri]";
    if (s.length > 4000) s = s.slice(0, 4000);
    s = s.replace(JWT_RE, "[jwt]").replace(EMAIL_RE, "[email]").replace(LONGHEX_RE, "[hex]");
    return s.length > 500 ? s.slice(0, 500) + "…" : s;
  }
  function scrubMeta(obj) {
    var out = {};
    if (!obj || typeof obj !== "object") return out;
    var keys = Object.keys(obj).slice(0, 30);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (DENY_KEY.test(k)) continue;                 // clé sensible → ignorée
      var val = obj[k];
      if (val == null) continue;
      var t = typeof val;
      if (t === "number" || t === "boolean") out[k] = val;
      else if (t === "string") {
        var s = redactString(val);
        out[k] = s.length > 160 ? s.slice(0, 160) + "…" : s;
      }
      // objets/tableaux imbriqués ignorés (évite fuite de contenu volumineux)
    }
    return out;
  }

  // ─── Échantillonnage / anti-flood ──────────────────────────────────────────
  var minuteBucket = 0, minuteCount = 0;
  var CAP_PER_MIN = 400;                 // plafond dur d'événements/minute/onglet
  function overCap() {
    var b = Math.floor(Date.now() / 60000);
    if (b !== minuteBucket) { minuteBucket = b; minuteCount = 0; }
    minuteCount++;
    return minuteCount > CAP_PER_MIN;
  }
  // Types échantillonnés (bruit potentiel). 1 = tout garder.
  var SAMPLE = { click: 1, api: 1, perf: 1, nav: 1, action: 1, heartbeat: 1 };

  // ─── File + envoi ──────────────────────────────────────────────────────────
  var queue = [];
  var MAX_QUEUE = 300;
  var flushTimer = null;

  function currentUser() {
    var id = window.MY_UID || null;
    var label = null;
    try {
      // pseudo public affichable, jamais l'e-mail
      if (window.state && state.user) {
        var g = state.user.general || {};
        label = g.username || state.user.name || null;
      }
    } catch (e) {}
    return { id: id, label: label ? redactString(label).slice(0, 40) : null };
  }
  function currentScreen() {
    try {
      var el = document.querySelector(".screen.active");
      if (el && el.id) return el.id.replace(/^screen-/, "");
    } catch (e) {}
    return window._telScreen || null;
  }

  function enqueue(ev) {
    queue.push(ev);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    if (queue.length >= 12) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, 3000);
  }

  function flush() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length) return;
    if (!window.supa) return;              // en attente du client (garde la file)
    var batch = queue.splice(0, queue.length);
    try {
      window.supa.from("telemetry_events").insert(batch).then(function () {}, function () {
        // échec réseau : on ne rejoue pas indéfiniment (best-effort, non bloquant)
      });
    } catch (e) {}
  }

  // Vide la file dès que le client Supabase est prêt (boot différé).
  (function waitSupa() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window.supa) flush();
      if (window.supa || tries > 60) clearInterval(iv);
    }, 500);
  })();

  // ─── API publique ───────────────────────────────────────────────────────────
  function track(type, action, fields) {
    if (!ENABLED) return;
    fields = fields || {};
    var st = SAMPLE[action] != null ? SAMPLE[action] : (SAMPLE[type] != null ? SAMPLE[type] : 1);
    if (st < 1 && Math.random() > st) return;
    if (overCap()) return;
    var u = currentUser();
    var ev = {
      event_id: uid16(),
      client_ts: new Date().toISOString(),
      env: ENV,
      type: String(type || "action").slice(0, 24),
      action: action ? String(action).slice(0, 80) : null,
      screen: fields.screen || currentScreen(),
      status: fields.status || "ok",
      severity: fields.severity || "info",
      duration_ms: (typeof fields.duration_ms === "number") ? Math.round(fields.duration_ms) : null,
      user_id: u.id,
      user_label: u.label,
      session_id: SESSION_ID,
      device_id: DEVICE_ID,
      platform: PLATFORM,
      browser: BROWSER,
      app_version: APP_VERSION,
      screen_size: SCREEN_SIZE,
      connection: connectionType(),
      endpoint: fields.endpoint ? String(fields.endpoint).slice(0, 200) : null,
      http_status: (typeof fields.http_status === "number") ? fields.http_status : null,
      correlation_id: fields.correlation_id || null,
      message: fields.message != null ? redactString(fields.message) : null,
      stack: fields.stack ? redactString(String(fields.stack).slice(0, 4000)) : null,
      meta: scrubMeta(fields.meta),
    };
    enqueue(ev);
    return ev.correlation_id || ev.event_id;
  }

  var Telemetry = {
    version: APP_VERSION,
    enabled: ENABLED,
    deviceId: DEVICE_ID,
    sessionId: SESSION_ID,
    track: track,
    nav: function (screen) { window._telScreen = screen; track("nav", "screen_view", { screen: screen }); },
    action: function (name, meta) { track("action", name, { meta: meta }); },
    click: function (label, meta) { track("click", label, { meta: meta }); },
    perf: function (name, ms, meta) { track("perf", name, { duration_ms: ms, status: ms > 2000 ? "slow" : "ok", meta: meta }); },
    api: function (f) { track("api", f && f.action || "request", f); },
    error: function (err, ctx) {
      var e = err || {};
      track("error", (ctx && ctx.action) || "js_error", {
        severity: (ctx && ctx.severity) || "error",
        status: "error",
        message: e.message || String(e),
        stack: e.stack || (ctx && ctx.stack) || "",
        screen: ctx && ctx.screen,
        meta: ctx && ctx.meta,
      });
      flush();
    },
    setEnabled: function (on) {
      ENABLED = !!on;
      // Persiste le choix : "1" = capture, "0" = opt-out durable (respecté aux prochains chargements).
      try { localStorage.setItem("passio_telemetry", on ? "1" : "0"); } catch (e) {}
    },
    flush: flush,
  };
  window.PassioTelemetry = Telemetry;
  window.tel = Telemetry;   // alias court

  if (!ENABLED) return;      // hooks passifs seulement si activé

  // ─── Hooks automatiques ─────────────────────────────────────────────────────

  // 1) Cycle de vie / session
  track("session", "start", { meta: { referrer: document.referrer ? "external" : "direct" } });
  document.addEventListener("visibilitychange", function () {
    track("lifecycle", document.hidden ? "hidden" : "visible");
    if (document.hidden) flush();
  });
  window.addEventListener("pagehide", function () { track("session", "end"); flush(); });

  // 2) Heartbeat de présence (l'appareil est « en ligne » pour le dashboard)
  setInterval(function () {
    if (document.hidden) return;
    track("lifecycle", "heartbeat", { meta: { online: navigator.onLine } });
  }, 20000);

  // 3) Erreurs JS (complète platform.js, table distincte, usage distinct)
  window.addEventListener("error", function (e) {
    track("error", "window_error", {
      severity: "error", status: "error",
      message: e.message, stack: e.error && e.error.stack,
      endpoint: e.filename ? String(e.filename).replace(/\?.*$/, "") : null,
      meta: { line: e.lineno, col: e.colno },
    });
    flush();
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    track("error", "unhandled_rejection", {
      severity: "error", status: "error",
      message: r.message || String(r), stack: r.stack,
    });
    flush();
  });

  // 4) Navigation : encapsule goTo() quand il apparaît (défini dans app-02)
  (function hookGoTo() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (typeof window.goTo === "function" && !window.goTo.__tel) {
        var orig = window.goTo;
        window.goTo = function (screen) {
          try { Telemetry.nav(screen); } catch (e) {}
          return orig.apply(this, arguments);
        };
        window.goTo.__tel = true;
        clearInterval(iv);
      }
      if (tries > 60) clearInterval(iv);
    }, 300);
  })();

  // 5) Clics : délégation sur les éléments intéressants (nav, boutons, [data-tel])
  document.addEventListener("click", function (e) {
    try {
      var t = e.target && e.target.closest
        ? e.target.closest("[data-tel],.nav-item,button,[role=button],.btn,a[href^='#']")
        : null;
      if (!t) return;
      var label = t.getAttribute("data-tel")
        || t.getAttribute("data-screen")
        || t.getAttribute("aria-label")
        || (t.id ? "#" + t.id : "")
        || (t.textContent || "").trim().slice(0, 40)
        || t.tagName.toLowerCase();
      Telemetry.click(String(label).slice(0, 60), { tag: t.tagName.toLowerCase() });
    } catch (err) {}
  }, true);

  // 6) Réseau : chronomètre les requêtes fetch (endpoint SANS query = pas de PII)
  (function hookFetch() {
    if (!window.fetch || window.fetch.__tel) return;
    var orig = window.fetch;
    window.fetch = function (input, init) {
      var url = "", method = (init && init.method) || (input && input.method) || "GET";
      try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch (e) {}
      var path = "";
      try { var u = new URL(url, location.href); path = u.host + u.pathname; } catch (e) { path = String(url).split("?")[0]; }
      var t0 = (performance && performance.now) ? performance.now() : Date.now();
      // ⛔ NE PAS chronométrer nos PROPRES envois de télémétrie (ni le monitoring
      // d'erreurs) : sinon chaque insert crée un événement api → réinséré →
      // boucle qui noie les vraies données (telemetry_events apparaissait 90×).
      var _selfCall = /telemetry_events|client_errors/i.test(path);
      return orig.apply(this, arguments).then(function (res) {
        var dt = ((performance && performance.now) ? performance.now() : Date.now()) - t0;
        // n'enregistre que les appels applicatifs pertinents (Supabase + API)
        if (/supabase|functions|api/i.test(path) && !_selfCall) {
          Telemetry.api({
            action: method + " " + path.replace(/\/rest\/v1\//, "/"),
            endpoint: path, http_status: res.status,
            duration_ms: dt,
            status: res.ok ? (dt > 1500 ? "slow" : "ok") : "error",
            severity: res.ok ? (dt > 1500 ? "warn" : "info") : "warn",
          });
        }
        return res;
      }, function (err) {
        var dt = ((performance && performance.now) ? performance.now() : Date.now()) - t0;
        if (/supabase|functions|api/i.test(path) && !_selfCall) {
          Telemetry.api({
            action: method + " " + path, endpoint: path,
            duration_ms: dt, status: "error", severity: "error",
            http_status: 0, message: err && err.message,
          });
        }
        throw err;
      });
    };
    window.fetch.__tel = true;
  })();

  // 7) Perf de démarrage (Navigation Timing) une fois la page chargée
  window.addEventListener("load", function () {
    setTimeout(function () {
      try {
        var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
        if (nav) {
          Telemetry.perf("page_load", nav.loadEventEnd || nav.duration, {
            ttfb: Math.round(nav.responseStart),
            dom: Math.round(nav.domContentLoadedEventEnd),
          });
        }
      } catch (e) {}
    }, 0);
  });
})();
