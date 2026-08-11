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
  // Types JAMAIS échantillonnés ni plafonnés : ce sont EXACTEMENT les signaux de
  // problème qu'on ne veut pas rater (une erreur / une coupure réseau doit
  // toujours remonter, même si l'appareil a déjà atteint le plafond/minute).
  // « link » inclus : une création/partage/ouverture de lien est un signal rare et
  // précieux (funnel du centre de pilotage) — jamais échantillonné ni plafonné.
  var CRITICAL_TYPE = { error: 1, connectivity: 1, link: 1 };

  // ─── File + envoi ──────────────────────────────────────────────────────────
  var queue = [];
  var MAX_QUEUE = 300;
  var flushTimer = null;
  var retryTimer = null;
  var sending = false;          // un envoi réseau est en cours
  var sendFailures = 0;         // échecs d'envoi CONSÉCUTIFS (appareil injoignable)
  var authRetries = 0;          // rejets d'auth CONSÉCUTIFS (token expiré, ≠ coupure)
  var AUTH_MAX_RETRIES = 6;     // grâce (~30 s) laissée au SDK pour rafraîchir le token
  var offlineSince = 0;         // ms epoch du passage hors-ligne (0 = en ligne)
  var BACKLOG_KEY = "passio_tel_backlog";  // file persistée (survit reload/coupure)

  // Persiste la file : si l'appareil est en coupure et que l'onglet se ferme,
  // les événements (dont les erreurs de connexion) sont rejoués au prochain
  // chargement → l'incident devient VISIBLE au lieu d'être perdu.
  function persistBacklog() {
    try { localStorage.setItem(BACKLOG_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch (e) {}
  }
  function loadBacklog() {
    try {
      var raw = localStorage.getItem(BACKLOG_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) queue = arr.concat(queue).slice(-MAX_QUEUE);
    } catch (e) {}
  }

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
    persistBacklog();                      // durable : rien n'est perdu même en coupure
    if (queue.length >= 12) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, 3000);
  }

  // Config d'envoi (URL + clé anon) exposée par app-08 ; runtime, pas au load.
  function supaCfg() { return window.PASSIO_SUPABASE || null; }

  // Session persistée par le SDK Supabase dans localStorage (lue SANS dépendre du
  // SDK — telemetry.js reste autonome). Gère le format v2 (champs à plat) et v1
  // (imbriqué dans currentSession).
  function readStoredSession(cfg) {
    try {
      var ref = (String(cfg.url).match(/https?:\/\/([^.]+)\./) || [])[1];
      var raw = ref && localStorage.getItem("sb-" + ref + "-auth-token");
      if (!raw) return null;
      var j = JSON.parse(raw);
      var s = (j && j.currentSession) ? j.currentSession : j;   // v1 vs v2
      if (s && s.access_token) return s;
    } catch (e) {}
    return null;
  }

  // Nudge non bloquant : demande au SDK (s'il est chargé) de rafraîchir la session.
  // getSession() est dédupliqué par le verrou interne du SDK → aucun double refresh
  // même si son timer d'auto-refresh tourne déjà. Anti-rafale 15 s. Effet : au
  // prochain essai d'envoi, localStorage portera un access_token frais.
  var _lastRefreshNudge = 0;
  function nudgeSessionRefresh() {
    var now = Date.now();
    if (now - _lastRefreshNudge < 15000) return;
    _lastRefreshNudge = now;
    try {
      var sb = window.supa;
      if (sb && sb.auth && typeof sb.auth.getSession === "function") {
        var p = sb.auth.getSession();
        if (p && typeof p.then === "function") p.then(function () {}, function () {});
      }
    } catch (e) {}
  }

  // Jeton d'accès pour la RLS `user_id = auth.uid()` (compte connecté).
  // ⚠️ Un onglet resté en arrière-plan peut porter un token EXPIRÉ dans localStorage
  // tant que le SDK ne l'a pas rafraîchi → PostgREST renverrait 401 (JWT invalide)
  // et le lot serait rejeté. On DÉTECTE l'expiration pour demander au SDK un refresh
  // immédiat (le prochain essai relira un token frais). On renvoie tout de même le
  // token courant : un repli sur la clé anon échouerait de toute façon (event.user_id
  // non-null ≠ auth.uid() NULL sous la policy « user_id IS NULL OR user_id=auth.uid() »).
  function authToken(cfg) {
    var s = readStoredSession(cfg);
    if (!s) return cfg.anon;                    // pré-auth : insert user_id NULL toléré
    var expMs = (typeof s.expires_at === "number") ? s.expires_at * 1000 : 0;
    if (expMs && Date.now() >= expMs - 10000) nudgeSessionRefresh();  // marge d'horloge 10 s
    return s.access_token || cfg.anon;
  }

  // Envoi d'un lot par POST REST direct + keepalive (survit à la fermeture de
  // l'onglet, contrairement au client SDK). La file n'est vidée qu'en cas de
  // succès → une coupure garde les événements pour un rejeu ultérieur.
  function flush(opts) {
    opts = opts || {};
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length) return;
    var cfg = supaCfg();
    if (!cfg) return;                      // config pas prête → file persistée, on réessaiera
    if (!opts.keepalive && sending) return;
    var batch = queue.slice(0, opts.keepalive ? 20 : 60);  // keepalive : lots plus petits (limite 64 Ko)
    if (!batch.length) return;
    if (!opts.keepalive) sending = true;
    var req;
    try {
      req = fetch(cfg.url + "/rest/v1/telemetry_events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.anon,
          Authorization: "Bearer " + authToken(cfg),
          Prefer: "return=minimal",
        },
        body: JSON.stringify(batch),
        keepalive: !!opts.keepalive,
      });
    } catch (e) { sending = false; onSendFailure(0, batch.length, opts); return; }
    req.then(function (res) {
      sending = false;
      if (res && res.ok) {
        queue.splice(0, batch.length);     // retire ce qui est parti
        persistBacklog();
        onSendSuccess();
        if (queue.length && !opts.keepalive) flush();   // écoule le reste
      } else {
        onSendReject(res ? res.status : 0, batch.length, opts);
      }
    }, function () { sending = false; onSendFailure(0, batch.length, opts); });
  }

  // Réponse serveur non-OK : distingue un REJET définitif (RLS/validation 4xx →
  // le lot ne passera jamais, on le retire pour ne pas bloquer la file) d'une
  // panne temporaire (réseau/5xx → on garde et on réessaie en backoff).
  function onSendReject(status, n, opts) {
    // 401/403 = quasi toujours un JWT expiré / en cours de rafraîchissement (timing
    // d'auth), PAS une donnée invalide NI une panne réseau : on GARDE le lot et on
    // réessaie APRÈS refresh du token — sans le compter comme une coupure (aucun
    // événement offline/recovered parasite pour un simple retour d'arrière-plan).
    if (status === 401 || status === 403) { onAuthReject(status, n, opts); return; }
    var permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
    if (permanent) {
      queue.splice(0, n); persistBacklog();
      track("connectivity", "server_reject", {
        severity: "warn", status: "error", http_status: status,
        message: "Lot de télémétrie rejeté par le serveur (HTTP " + status + ")",
        meta: { dropped: n },
      });
      if (queue.length && !opts.keepalive) flush();
      return;
    }
    onSendFailure(status, n, opts);
  }

  // Rejet d'AUTH (token périmé) : le SDK rafraîchit la session en tâche de fond (et
  // notre nudge l'a demandé). On relance un envoi en léger backoff, borné, SANS
  // toucher aux compteurs de connectivité. Au-delà de la grâce (session réellement
  // révoquée ?), on abandonne le lot pour ne pas bloquer la file indéfiniment.
  function onAuthReject(status, n, opts) {
    sending = false;
    nudgeSessionRefresh();
    if (authRetries >= AUTH_MAX_RETRIES) {
      authRetries = 0;
      queue.splice(0, n); persistBacklog();
      track("connectivity", "server_reject", {
        severity: "warn", status: "error", http_status: status,
        message: "Lot de télémétrie rejeté (auth) après " + AUTH_MAX_RETRIES + " essais (HTTP " + status + ")",
        meta: { dropped: n },
      });
      if (queue.length && !opts.keepalive) flush();
      return;
    }
    authRetries++;
    persistBacklog();                     // le lot reste en file (rien de retiré)
    if (opts.keepalive) return;           // page en fermeture → rejoué au prochain load
    var delay = Math.min(15000, 1500 * authRetries);   // 1.5 s → 15 s
    if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; flush(); }, delay);
  }

  // Panne d'envoi (réseau/serveur) : l'appareil est probablement injoignable.
  // On trace l'échec (il partira au rétablissement) et on réessaie en backoff.
  function onSendFailure(httpStatus /*, n, opts */) {
    sending = false;
    sendFailures++;
    if (!offlineSince) offlineSince = Date.now();
    persistBacklog();
    if (sendFailures === 1 || sendFailures === 3 || sendFailures % 10 === 0) {
      track("connectivity", "send_failed", {
        severity: sendFailures >= 3 ? "error" : "warn", status: "error", http_status: httpStatus,
        message: "Échec d'envoi de la télémétrie #" + sendFailures + " (appareil peut-être hors ligne)",
        meta: { failed_sends: sendFailures, online: navigator.onLine, backlog: queue.length },
      });
    }
    var delay = Math.min(60000, 3000 * Math.pow(2, Math.min(sendFailures - 1, 5)));  // 3s→60s
    if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; flush(); }, delay);
  }

  // Envoi réussi : si on sortait d'une série d'échecs, trace la RÉCUPÉRATION
  // (fenêtre de coupure) pour que l'incident soit visible dans le dashboard.
  function onSendSuccess() {
    if (sendFailures >= 3 || offlineSince) {
      track("connectivity", "recovered", {
        severity: "warn", status: "ok",
        message: "Connexion rétablie après " + sendFailures + " échec(s) d'envoi",
        meta: { failed_sends: sendFailures, offline_ms: offlineSince ? Date.now() - offlineSince : null, backlog: queue.length },
      });
    }
    sendFailures = 0; offlineSince = 0; authRetries = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  // Rejoue le backlog persistant au boot, puis vide la file dès que la config
  // d'envoi est prête (app-08 pose window.PASSIO_SUPABASE en différé).
  // Respecte l'opt-out : si la télémétrie est désactivée, on purge le backlog
  // au lieu de le rejouer.
  if (ENABLED) {
    loadBacklog();
    (function waitCfg() {
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (supaCfg()) flush();
        if ((supaCfg() && !queue.length) || tries > 120) clearInterval(iv);
      }, 500);
    })();
  } else {
    try { localStorage.removeItem(BACKLOG_KEY); } catch (e) {}
  }

  // ─── API publique ───────────────────────────────────────────────────────────
  function track(type, action, fields) {
    if (!ENABLED) return;
    fields = fields || {};
    if (!CRITICAL_TYPE[type]) {            // erreurs & connexion : jamais filtrées
      var st = SAMPLE[action] != null ? SAMPLE[action] : (SAMPLE[type] != null ? SAMPLE[type] : 1);
      if (st < 1 && Math.random() > st) return;
      if (overCap()) return;
    }
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
    // Réception d'un événement realtime venu d'un AUTRE appareil (preuve de
    // livraison cross-device). type dédié "rt_recv" → n'entre dans aucun compteur
    // d'activité existant ; le centre de pilotage l'apparie à l'émission par cible.
    recv: function (name, meta) { track("rt_recv", name, { meta: meta }); },
    click: function (label, meta) { track("click", label, { meta: meta }); },
    perf: function (name, ms, meta) { track("perf", name, { duration_ms: ms, status: ms > 2000 ? "slow" : "ok", meta: meta }); },
    api: function (f) { track("api", f && f.action || "request", f); },
    // ── Suivi des liens partagés (funnel honnête) ─────────────────────────────
    // linkCreate : à l'instant où l'app FABRIQUE une URL partageable. Renvoie un
    // identifiant de lien stable (à insérer dans l'URL via tagUrl) qui permettra
    // d'apparier, côté pilotage, la CRÉATION à une ÉVENTUELLE ouverture confirmée.
    linkCreate: function (kind, target) {
      var id = "lk_" + uid16();
      track("link", "link_create", {
        correlation_id: id, severity: "info", status: "ok", message: "Lien créé",
        meta: {
          link_id: id,
          link_kind: String(kind || "app").slice(0, 24),
          link_target: target != null ? String(target).slice(0, 40) : null,
        },
      });
      return id;
    },
    // linkShare : le lien vient d'être copié ou envoyé via un canal (clipboard,
    // whatsapp, email, sms, natif…). N'affirme rien sur l'ouverture.
    linkShare: function (id, channel) {
      if (!id) return;
      track("link", "link_share", {
        correlation_id: id, severity: "info", status: "ok",
        message: "Lien partagé (" + (channel || "?") + ")",
        meta: { link_id: id, link_channel: String(channel || "?").slice(0, 24) },
      });
      flush();
    },
    // tagUrl : insère le marqueur de suivi ?plk=<id> AVANT le hash de l'URL, sans
    // toucher au routage par hash de l'app (deep-links #reel/#irl-event conservés).
    tagUrl: function (url, id) {
      if (!id) return url;
      try {
        var u = new URL(url, location.href);
        u.searchParams.set("plk", id);
        return u.toString();
      } catch (e) {
        var s = String(url || ""), hash = "", hi = s.indexOf("#");
        if (hi >= 0) { hash = s.slice(hi); s = s.slice(0, hi); }
        s += (s.indexOf("?") >= 0 ? "&" : "?") + "plk=" + encodeURIComponent(id);
        return s + hash;
      }
    },
    // linkFromUrl : relit l'identifiant de suivi d'une URL taguée (pour émettre un
    // link_share depuis une fonction qui ne reçoit que l'URL).
    linkFromUrl: function (url) {
      try { return new URL(url, location.href).searchParams.get("plk") || null; }
      catch (e) { var m = /[?&]plk=([^&#]+)/.exec(String(url || "")); return m ? decodeURIComponent(m[1]) : null; }
    },
    // shareLink : raccourci « tout-en-un » pour un point de partage à action unique.
    // Crée le lien, tague l'URL et enregistre le partage en un appel ; renvoie
    // l'URL taguée À DIFFUSER. Idéal quand création et partage sont simultanés
    // (carnet, live, profil, événement, invitation beta…).
    shareLink: function (rawUrl, kind, target, channel) {
      var id = this.linkCreate(kind, target);
      var url = this.tagUrl(rawUrl, id);
      this.linkShare(id, channel || "?");
      return url;
    },
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
  track("session", "start", { meta: { referrer: document.referrer ? "external" : "direct", online: navigator.onLine } });

  // 1quater) OUVERTURE DE LIEN CONFIRMÉE. Si l'URL porte le marqueur ?plk=<id>,
  // c'est que la page a RÉELLEMENT chargé sur l'appareil cible et que ce code
  // s'exécute → preuve honnête d'ouverture (aucune supposition : sans ce signal,
  // le pilotage ne prétend jamais qu'un lien a été ouvert). On nettoie ensuite le
  // marqueur de la barre d'adresse pour ne pas le re-partager par erreur.
  (function captureLinkOpen() {
    try {
      var plk = new URLSearchParams(location.search).get("plk");
      if (!plk) return;
      track("link", "link_open", {
        correlation_id: plk, severity: "info", status: "ok",
        message: "Ouverture de lien confirmée (page chargée)",
        meta: { link_id: plk, referrer: document.referrer ? "external" : "direct", online: navigator.onLine },
      });
      flush();
      if (window.history && history.replaceState) {
        var u = new URL(location.href); u.searchParams.delete("plk");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch (e) {}
  })();
  document.addEventListener("visibilitychange", function () {
    track("lifecycle", document.hidden ? "hidden" : "visible");
    if (document.hidden) flush({ keepalive: true });
  });
  window.addEventListener("pagehide", function () { track("session", "end"); flush({ keepalive: true }); });

  // 1bis) Connectivité réseau : capture EXPLICITE des coupures (le signal le plus
  // demandé — un testeur qui perd le réseau doit apparaître, pas disparaître).
  window.addEventListener("offline", function () {
    if (!offlineSince) offlineSince = Date.now();
    track("connectivity", "offline", {
      severity: "warn", status: "error",
      message: "Appareil passé hors ligne", meta: { online: false },
    });
    persistBacklog();
  });
  window.addEventListener("online", function () {
    track("connectivity", "online", {
      severity: "info", status: "ok", message: "Appareil de nouveau en ligne",
      meta: { online: true, offline_ms: offlineSince ? Date.now() - offlineSince : null, backlog: queue.length },
    });
    flush();   // tente d'écouler le backlog dès le retour du réseau
  });

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
