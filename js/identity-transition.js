/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — garde de transition d'identité pour la télémétrie.
 *
 * Objectif : lorsqu'un compte se déconnecte, vider réellement la file de
 * télémétrie AVANT que son jeton Supabase soit invalidé. telemetry.js protège
 * déjà les lots contre la RLS en désattribuant un ancien user_id si l'identité
 * a changé ; ce module évite d'avoir à perdre cette attribution dans le cas
 * normal du logout.
 *
 * Le module reste découplé de telemetry.js : il observe uniquement les requêtes
 * fetch vers telemetry_events, puis attend une fenêtre stable sans envoi après
 * avoir demandé flush(). Aucun accès aux secrets, à la queue interne ou au SDK.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (window.PassioIdentityTransition) return;

  var nativeFetch = window.fetch;
  var inFlight = 0;
  var lastActivityAt = 0;
  var wrappedLogout = false;
  var stableMs = 180;

  function isTelemetryRequest(input) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      return /\/rest\/v1\/telemetry_events(?:\?|$)/.test(String(url));
    } catch (e) { return false; }
  }

  if (typeof nativeFetch === "function" && !nativeFetch.__passioIdentityTransition) {
    var observedFetch = function () {
      var args = arguments;
      var watched = isTelemetryRequest(args[0]);
      if (watched) { inFlight++; lastActivityAt = Date.now(); }
      var p;
      try { p = nativeFetch.apply(this, args); }
      catch (e) {
        if (watched) { inFlight = Math.max(0, inFlight - 1); lastActivityAt = Date.now(); }
        throw e;
      }
      if (!watched || !p || typeof p.then !== "function") return p;
      return Promise.resolve(p).then(function (value) {
        inFlight = Math.max(0, inFlight - 1); lastActivityAt = Date.now();
        return value;
      }, function (err) {
        inFlight = Math.max(0, inFlight - 1); lastActivityAt = Date.now();
        throw err;
      });
    };
    observedFetch.__passioIdentityTransition = true;
    observedFetch.__passioNativeFetch = nativeFetch;
    window.fetch = observedFetch;
  }

  function requestFlush() {
    try {
      if (window.tel && typeof window.tel.flush === "function") window.tel.flush();
    } catch (e) {}
  }

  /**
   * Attend que flush() n'engendre plus aucune requête telemetry_events pendant
   * une fenêtre stable. On relance périodiquement flush() : si la queue contient
   * plus d'un lot, telemetry.js continue à l'écouler ; si elle est vide, l'appel
   * est un no-op. Le timeout empêche un réseau mort de bloquer la déconnexion.
   */
  function drain(timeoutMs) {
    timeoutMs = Math.max(250, Math.min(Number(timeoutMs) || 2800, 10000));
    var startedAt = Date.now();
    lastActivityAt = startedAt;
    requestFlush();

    return new Promise(function (resolve) {
      var settled = false;
      var timer = setInterval(function () {
        var now = Date.now();
        requestFlush();
        if (inFlight === 0 && now - lastActivityAt >= stableMs) {
          clearInterval(timer); settled = true;
          resolve({ ok: true, timedOut: false, waitedMs: now - startedAt });
          return;
        }
        if (now - startedAt >= timeoutMs) {
          clearInterval(timer); settled = true;
          resolve({ ok: false, timedOut: true, waitedMs: now - startedAt, inFlight: inFlight });
        }
      }, 45);
      // Filet de sécurité si un navigateur ralentit les timers d'arrière-plan.
      setTimeout(function () {
        if (settled) return;
        clearInterval(timer);
        resolve({ ok: false, timedOut: true, waitedMs: Date.now() - startedAt, inFlight: inFlight });
      }, timeoutMs + 400);
    });
  }

  // doLogout est défini dans le bloc applicatif chargé après le gate. On le
  // remplace lorsqu'il apparaît : les onclick inline résolvent la fonction au
  // moment du clic, donc aucun changement du HTML n'est requis.
  function wrapLogoutWhenReady() {
    if (wrappedLogout) return true;
    var current = window.doLogout;
    if (typeof current !== "function") return false;
    if (current.__passioTelemetryDrainWrapped) { wrappedLogout = true; return true; }

    var original = current;
    var guarded = async function () {
      try { await drain(2800); } catch (e) {}
      return original.apply(this, arguments);
    };
    guarded.__passioTelemetryDrainWrapped = true;
    guarded.__passioOriginal = original;
    window.doLogout = guarded;
    wrappedLogout = true;
    return true;
  }

  var api = {
    drain: drain,
    wrapLogout: wrapLogoutWhenReady,
    state: function () { return { inFlight: inFlight, lastActivityAt: lastActivityAt, wrappedLogout: wrappedLogout }; },
  };
  window.PassioIdentityTransition = api;

  if (!wrapLogoutWhenReady()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (wrapLogoutWhenReady() || tries >= 240) clearInterval(iv); // 60 s max
    }, 250);
  }
})();
