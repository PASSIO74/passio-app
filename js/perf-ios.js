/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — PERF-IOS, phase 1 : instrumentation et baseline iPhone
 * ---------------------------------------------------------------------------
 * OBJET : mesurer la fluidité RÉELLE sur iPhone/Safari/PWA avant d'optimiser
 * quoi que ce soit. Cette phase n'optimise RIEN et ne change aucun comportement
 * fonctionnel : elle ne fait qu'observer, agréger en p50/p95/p99 et publier.
 * Sans ce socle, les phases suivantes (Feed P0, médias, chemin critique JS,
 * CSS/GPU, IRL) n'auraient aucun critère de réussite vérifiable.
 *
 * CHARGEMENT : script classique dans <head>, APRÈS telemetry.js dont il
 * réutilise l'émetteur (`window.tel`). Aucune dépendance dure : si la
 * télémétrie est absente ou désactivée (localhost, opt-out), tout continue de
 * se mesurer EN LOCAL et reste consultable par `PassioPerf.report()`.
 *
 * IIFE `"use strict"` : n'expose que `window.PassioPerf` (+ alias `window.perf9`
 * volontairement absent — un seul nom, pour ne pas gonfler la surface globale).
 * Aucune déclaration top-level → `npm run audit:globals` reste vert.
 *
 * ⚠️ SAFARI : tout appel à une API de mesure est DÉTECTÉ avant usage
 * (PerformanceObserver, supportedEntryTypes, longtask, event timing, LCP,
 * performance.memory, requestIdleCallback). Safari n'implémente ni `longtask`
 * ni, selon les versions, `event`/`largest-contentful-paint` : dans ce cas la
 * métrique est simplement ABSENTE du rapport — jamais inventée, jamais à zéro.
 * Une métrique manquante doit se voir, sinon la baseline ment.
 *
 * CONFIDENTIALITÉ : aucune donnée utilisateur ne transite. Les valeurs émises
 * sont des durées, des compteurs et des noms d'écran ; elles passent malgré tout
 * par le filtre PII de telemetry.js (`scrubMeta`), qui n'accepte que des
 * primitives. Les clés choisies ici évitent la liste noire (pas de `name`,
 * `label`, `query`, `code`…) — un renommage malheureux les ferait disparaître
 * EN SILENCE.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var W = window;
  if (W.PassioPerf) return;                 // idempotent (double inclusion en dev)

  var P = W.performance;
  var HAS_NOW = !!(P && typeof P.now === "function");
  function now() { return HAS_NOW ? P.now() : Date.now(); }

  // ─── Stockage local borné ──────────────────────────────────────────────────
  // Anneau de 120 échantillons par métrique : assez pour un p95 honnête sur une
  // session, borné pour ne jamais peser en mémoire (c'est un outil de mesure de
  // fluidité, il serait absurde qu'il crée lui-même de la pression mémoire).
  var MAX_SAMPLES = 120;
  var MAX_METRICS = 60;                     // garde-fou : pas d'explosion de noms
  var samples = Object.create(null);        // métrique → [ms]
  var counters = Object.create(null);       // compteur → n
  var startedAt = Date.now();

  function record(metric, ms) {
    if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return;
    var k = String(metric).slice(0, 40);
    if (!samples[k]) {
      if (Object.keys(samples).length >= MAX_METRICS) return;
      samples[k] = [];
    }
    var a = samples[k];
    a.push(Math.round(ms * 100) / 100);
    if (a.length > MAX_SAMPLES) a.splice(0, a.length - MAX_SAMPLES);
  }
  function bump(name, n) {
    var k = String(name).slice(0, 40);
    counters[k] = (counters[k] || 0) + (typeof n === "number" ? n : 1);
  }
  function pct(sorted, p) {
    if (!sorted.length) return null;
    var i = Math.ceil(p * sorted.length) - 1;
    if (i < 0) i = 0;
    if (i >= sorted.length) i = sorted.length - 1;
    return sorted[i];
  }
  function stats(metric) {
    var a = samples[metric];
    if (!a || !a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var sum = 0;
    for (var i = 0; i < s.length; i++) sum += s[i];
    return {
      n: s.length,
      mn: Math.round(s[0]),
      p50: Math.round(pct(s, 0.5)),
      p95: Math.round(pct(s, 0.95)),
      p99: Math.round(pct(s, 0.99)),
      mx: Math.round(s[s.length - 1]),
      avg: Math.round(sum / s.length),
    };
  }

  // ─── Émission vers le centre de pilotage (jamais bloquante) ────────────────
  function emit(action, ms, meta) {
    try {
      if (W.tel && typeof W.tel.perf === "function") W.tel.perf(action, ms, meta);
    } catch (e) { /* la mesure ne doit JAMAIS casser l'app qu'elle observe */ }
  }

  // ─── performance.mark / measure (détectés) ─────────────────────────────────
  var HAS_MARK = !!(P && typeof P.mark === "function" && typeof P.measure === "function");
  function mark(name) {
    if (!HAS_MARK) return;
    try { P.mark("passio:" + name); } catch (e) {}
  }
  // measure : borne un intervalle ENTRE DEUX MARQUES et le consigne. Renvoie la
  // durée (ms) ou null si l'une des marques manque — sans lever.
  function measure(metric, fromMark, toMark) {
    if (!HAS_MARK) return null;
    try {
      var a = "passio:" + fromMark;
      var b = toMark ? "passio:" + toMark : undefined;
      var m = b ? P.measure("passio:" + metric, a, b) : P.measure("passio:" + metric, a);
      // Certains navigateurs ne renvoient rien : on relit l'entrée.
      var d = (m && typeof m.duration === "number") ? m.duration : null;
      if (d == null && typeof P.getEntriesByName === "function") {
        var list = P.getEntriesByName("passio:" + metric, "measure");
        if (list && list.length) d = list[list.length - 1].duration;
      }
      if (typeof d === "number") { record(metric, d); return d; }
    } catch (e) { /* marque absente : intervalle non mesurable, pas une erreur */ }
    return null;
  }

  // ─── Chronomètre de parcours ───────────────────────────────────────────────
  // journey("feed_to_irl") renvoie une fonction de clôture. Le parcours est
  // consigné À LA PEINTURE suivante quand c'est possible (double rAF : c'est
  // l'instant où l'utilisateur VOIT le résultat), avec un secours en timer —
  // rAF ne se déclenche jamais sur un onglet caché, et un parcours perdu vaut
  // moins qu'un parcours mesuré grossièrement... mais un parcours INVENTÉ vaut
  // pire que rien : sans peinture, on consigne le temps handler, marqué comme tel.
  function journey(name, meta) {
    var t0 = now(), done = false;
    return function end(extra) {
      if (done) return;
      done = true;
      var painted = false;
      var finish = function (peint) {
        if (painted) return;
        painted = true;
        var ms = now() - t0;
        record(name, ms);
        var m = { ms_paint: peint ? 1 : 0 };
        if (meta) for (var k in meta) if (Object.prototype.hasOwnProperty.call(meta, k)) m[k] = meta[k];
        if (extra) for (var k2 in extra) if (Object.prototype.hasOwnProperty.call(extra, k2)) m[k2] = extra[k2];
        emit("ios_" + name, ms, m);
      };
      if (W.requestAnimationFrame) {
        requestAnimationFrame(function () { requestAnimationFrame(function () { finish(true); }); });
        setTimeout(function () { finish(false); }, 1500);
      } else {
        finish(false);
      }
    };
  }

  // ─── Observateurs (tous détectés) ──────────────────────────────────────────
  var observers = [];
  function observe(type, cb, extraInit) {
    try {
      if (!W.PerformanceObserver) return null;
      var sup = W.PerformanceObserver.supportedEntryTypes;
      if (sup && sup.indexOf(type) === -1) return null;   // Safari : longtask absent
      var o = new W.PerformanceObserver(cb);
      var init = { type: type, buffered: true };
      if (extraInit) for (var k in extraInit) if (Object.prototype.hasOwnProperty.call(extraInit, k)) init[k] = extraInit[k];
      o.observe(init);
      observers.push(o);
      bump("obs_" + type);
      return o;
    } catch (e) { return null; }
  }

  // 1) Tâches longues (> 50 ms) : la cause n°1 d'un fil qui « accroche ».
  //    Absent de Safari — la métrique manquera sur iPhone, et c'est justement ce
  //    que la baseline doit dire au lieu d'afficher un zéro rassurant.
  var SUP_LONGTASK = observe("longtask", function (list) {
    var es = list.getEntries();
    for (var i = 0; i < es.length; i++) {
      record("longtask", es[i].duration);
      bump("longtask_n");
      bump("tbt_ms", Math.max(0, Math.round(es[i].duration - 50)));   // temps de blocage total
    }
  });

  // 2) Event Timing : latence RÉELLE d'un geste (du tap au rendu), là où c'est
  //    supporté. Seuil 64 ms : on ne veut que ce qui se sent.
  var GESTES = { pointerdown: 1, pointerup: 1, click: 1, touchstart: 1, touchend: 1, keydown: 1 };
  var SUP_EVENT = observe("event", function (list) {
    var es = list.getEntries();
    for (var i = 0; i < es.length; i++) {
      var e = es[i];
      if (!GESTES[e.name]) continue;
      record("evt_" + e.name, e.duration);
      bump("evt_slow_n");
    }
  }, { durationThreshold: 64 });

  // 3) Peinture : FCP (partout) et LCP (absent d'anciennes versions de Safari).
  observe("paint", function (list) {
    var es = list.getEntries();
    for (var i = 0; i < es.length; i++) {
      if (es[i].name === "first-contentful-paint") record("fcp", es[i].startTime);
    }
  });
  observe("largest-contentful-paint", function (list) {
    var es = list.getEntries();
    if (es.length) record("lcp", es[es.length - 1].startTime);
  });

  // ─── FPS approximatif PENDANT le scroll (jamais en continu) ────────────────
  // Une boucle rAF permanente coûterait de la batterie et fausserait ce qu'elle
  // mesure. On n'échantillonne que tant que l'utilisateur fait défiler, et on
  // s'arrête 900 ms après le dernier événement de scroll.
  var scrolling = false, frames = 0, tScroll = 0, tLastFrame = 0, tLastScrollEvt = 0;
  function frameTick() {
    if (!scrolling) return;
    var t = now();
    var delta = t - tLastFrame;
    tLastFrame = t;
    frames++;
    if (delta > 50) bump("jank_n");          // frame > 50 ms = saccade visible
    if (delta > 16.7) record("frame_ms", delta);
    if (t - tLastScrollEvt > 900) {
      scrolling = false;
      var dur = t - tScroll;
      if (dur > 400 && frames > 5) {
        var fps = Math.round((frames / dur) * 1000);
        record("scroll_fps", fps);
        emit("ios_scroll_fps", fps, { frames: frames, dur_ms: Math.round(dur), jank_n: counters.jank_n || 0 });
      }
      return;
    }
    requestAnimationFrame(frameTick);
  }
  function onScroll() {
    tLastScrollEvt = now();
    if (scrolling || !W.requestAnimationFrame) return;
    scrolling = true; frames = 0; tScroll = tLastScrollEvt; tLastFrame = tLastScrollEvt;
    requestAnimationFrame(frameTick);
  }
  (function attachScroll() {
    var opts = false;
    try {
      // Détection du support des options : sur un vieux WebKit, passer un objet
      // équivaut à `capture:true` — inoffensif ici, mais autant être exact.
      var probe = Object.defineProperty({}, "passive", { get: function () { opts = { passive: true, capture: true }; return true; } });
      W.addEventListener("_p", null, probe);
      W.removeEventListener("_p", null, probe);
    } catch (e) {}
    // capture:true — les événements `scroll` des conteneurs internes ne bouillonnent
    // pas ; seule la phase de capture sur `document` les voit tous.
    document.addEventListener("scroll", onScroll, opts || true);
  })();

  // ─── Contexte : volume DOM, mémoire, connexion ─────────────────────────────
  function domContext() {
    var out = {};
    try { out.dom_nodes = document.getElementsByTagName("*").length; } catch (e) {}
    try {
      var fl = document.getElementById("feedList");
      // `feed_posts` et non `feed_cards` : `card` figure dans la liste noire PII
      // de telemetry.js (carte bancaire) — la clé serait jetée EN SILENCE.
      if (fl) out.feed_posts = fl.querySelectorAll(".post").length;
      out.medias = document.querySelectorAll("img,video").length;
    } catch (e) {}
    try {
      // performance.memory : Chrome uniquement. Absent sur Safari → champ omis,
      // jamais mis à 0 (un 0 se lirait « aucune mémoire consommée »).
      if (P && P.memory && typeof P.memory.usedJSHeapSize === "number") {
        out.heap_mb = Math.round(P.memory.usedJSHeapSize / 1048576);
      }
    } catch (e) {}
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c && c.effectiveType) out.net = String(c.effectiveType);
      if (typeof navigator.deviceMemory === "number") out.dev_mem = navigator.deviceMemory;
      if (typeof navigator.hardwareConcurrency === "number") out.cpu = navigator.hardwareConcurrency;
    } catch (e) {}
    return out;
  }

  // ─── Rapport / baseline ────────────────────────────────────────────────────
  function report() {
    var metrics = {};
    var names = Object.keys(samples);
    for (var i = 0; i < names.length; i++) metrics[names[i]] = stats(names[i]);
    return {
      phase: "perf-ios-1",
      uptime_s: Math.round((Date.now() - startedAt) / 1000),
      // Ce que l'appareil sait mesurer : indispensable pour ne pas comparer une
      // baseline iPhone (sans longtask) à un « après » Chrome (avec).
      support: {
        longtask: !!SUP_LONGTASK,
        event_timing: !!SUP_EVENT,
        mark: HAS_MARK,
        memory: !!(P && P.memory),
        idle: typeof W.requestIdleCallback === "function",
      },
      context: domContext(),
      counters: counters,
      metrics: metrics,
    };
  }

  // snapshot : publie la baseline au centre de pilotage. Un événement `perf` par
  // métrique (duration_ms = p95, le chiffre qui décide) + un événement de
  // contexte. Volume borné : au plus MAX_METRICS + 1 événements par appel, et le
  // client de télémétrie plafonne déjà à 400 événements/minute.
  function snapshot(labelPhase) {
    var r = report();
    var ph = String(labelPhase || "auto").slice(0, 24);
    var names = Object.keys(r.metrics);
    for (var i = 0; i < names.length; i++) {
      var s = r.metrics[names[i]];
      if (!s) continue;
      emit("ios_stat_" + names[i], s.p95, {
        phase: ph, n: s.n, p50: s.p50, p99: s.p99, mn: s.mn, mx: s.mx, avg: s.avg,
      });
    }
    var ctx = r.context;
    var m = { phase: ph, uptime_s: r.uptime_s,
      sup_longtask: r.support.longtask ? 1 : 0, sup_event: r.support.event_timing ? 1 : 0,
      longtask_n: counters.longtask_n || 0, tbt_ms: counters.tbt_ms || 0, jank_n: counters.jank_n || 0 };
    for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) m[k] = ctx[k];
    emit("ios_context", null, m);
    return r;
  }

  // ─── Parcours instrumentés ─────────────────────────────────────────────────

  // A) Démarrage après le gate → premier fil réellement peint.
  //    `__gateReady` est la promesse posée par access-gate.js ; le boot applicatif
  //    l'attend. On date sa résolution, puis on guette l'apparition d'une vraie
  //    carte de post dans #feedList (le squelette ne compte pas : il est peint
  //    avant toute donnée, le prendre pour le fil rendrait la mesure flatteuse).
  (function bootJourney() {
    mark("load");
    var tGate = 0;
    try {
      if (W.__gateReady && typeof W.__gateReady.then === "function") {
        W.__gateReady.then(function () {
          tGate = now(); mark("gate_ready");
          record("gate_ready", tGate);
          watchFeed();
        }, function () {});
      } else {
        tGate = now(); watchFeed();
      }
    } catch (e) {}

    function watchFeed() {
      var fini = false, mo = null, iv = null;
      var stop = function () {
        fini = true;
        if (mo) { try { mo.disconnect(); } catch (e) {} mo = null; }   // pas de fuite
        if (iv) { clearInterval(iv); iv = null; }
      };
      var check = function () {
        if (fini) return false;
        var fl = document.getElementById("feedList");
        if (!fl || !fl.querySelector(".post")) return false;
        var ms = now() - tGate;
        record("boot_feed", ms);
        emit("ios_boot_feed", ms, domContext());
        mark("feed_ready");
        stop();
        return true;
      };
      var start = function () {
        if (check()) return;
        try {
          if (W.MutationObserver) {
            mo = new W.MutationObserver(function () { check(); });
            mo.observe(document.body, { childList: true, subtree: true });
          }
        } catch (e) {}
        // Filet : un fil peint sans mutation observable (rendu avant l'attache)
        // ou un MutationObserver indisponible. Abandon au bout de 60 s — un fil
        // qui n'est jamais arrivé ne doit pas laisser un observateur en vie.
        iv = setInterval(function () { if (check()) return; }, 1000);
        setTimeout(stop, 60000);
      };
      if (document.body) start();
      else document.addEventListener("DOMContentLoaded", start, { once: true });
    }
  })();

  // B) Navigation : chaque changement d'écran est chronométré jusqu'à la peinture.
  //    Couvre « changement d'onglet », « profil », « ouverture IRL » et surtout le
  //    parcours produit central Feed → IRL, consigné sous son propre nom.
  function currentScreenId() {
    try {
      var el = document.querySelector(".screen.active");
      if (el && el.id) return el.id.replace(/^screen-/, "");
    } catch (e) {}
    return null;
  }
  (function hookGoTo() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (typeof W.goTo === "function" && !W.goTo.__perf) {
        var orig = W.goTo;
        W.goTo = function (screen) {
          var from = currentScreenId();
          var cible = String(screen || "?").replace(/[^a-z0-9_-]/gi, "").slice(0, 20);
          var end = journey("nav_" + cible, { from: from || "?" });
          var endBridge = (from === "feed" && cible === "irl") ? journey("feed_to_irl", { from: from }) : null;
          var r;
          try {
            r = orig.apply(this, arguments);
          } finally {
            // `finally` : même si la navigation lève, la mesure est close — sinon
            // le parcours suivant hériterait d'un chronomètre jamais arrêté.
            end();
            if (endBridge) endBridge();
          }
          return r;
        };
        W.goTo.__perf = true;
        clearInterval(iv);
      }
      if (tries > 60) clearInterval(iv);
    }, 300);
  })();

  // C) Gestes du fil : ouverture de post, commentaires, j'aime, suivre, bobines.
  //    Écouteur DÉLÉGUÉ unique en phase de capture — il précède donc tout
  //    gestionnaire applicatif, exactement comme la mesure de latence perçue déjà
  //    en place dans telemetry.js, qu'il prolonge en agrégat p50/p95/p99 local.
  //    Rien n'est mesuré hors de cette liste : un clic non classé ressort
  //    immédiatement, sans rAF ni allocation.
  var CIBLES = [
    ['.post-action[data-action="like"],[data-postlike],[data-livelike],[data-steplike]', "like"],
    ["[data-cmtcount]", "comment_open"],
    ['[id^="followBtn_"],.cdv-live-follow-btn', "follow"],
    [".nav-item[data-screen]", "tab"],
    [".story,.reel-card,.nav-bobines", "bobine_open"],
    [".post[data-postid]", "post_open"],
  ];
  document.addEventListener("click", function (e) {
    try {
      var t = e.target;
      if (!t || !t.closest) return;
      for (var i = 0; i < CIBLES.length; i++) {
        if (!t.closest(CIBLES[i][0])) continue;
        journey("tap_" + CIBLES[i][1])();
        return;                       // un seul classement par clic (le plus précis)
      }
    } catch (err) {}
  }, true);

  // ─── Publication périodique (travail non urgent) ───────────────────────────
  // requestIdleCallback quand il existe (absent de Safari), sinon un timer :
  // dans les deux cas la publication ne dispute jamais la main à une interaction.
  function whenIdle(fn) {
    if (typeof W.requestIdleCallback === "function") {
      try { W.requestIdleCallback(fn, { timeout: 4000 }); return; } catch (e) {}
    }
    setTimeout(fn, 0);
  }
  var SNAP_FIRST_MS = 45000, SNAP_EVERY_MS = 180000;
  setTimeout(function () {
    whenIdle(function () { snapshot("t45"); });
    setInterval(function () { whenIdle(function () { snapshot("periodic"); }); }, SNAP_EVERY_MS);
  }, SNAP_FIRST_MS);
  // Dernière photo avant la fermeture : c'est la session la plus longue qui porte
  // les p99 intéressants, et c'est justement celle qu'on perdrait sans ceci.
  W.addEventListener("pagehide", function () {
    try { snapshot("exit"); if (W.tel && W.tel.flush) W.tel.flush({ keepalive: true }); } catch (e) {}
  });

  // ─── API publique ──────────────────────────────────────────────────────────
  W.PassioPerf = {
    phase: "perf-ios-1",
    record: record,
    bump: bump,
    stats: stats,
    mark: mark,
    measure: measure,
    journey: journey,
    report: report,
    snapshot: snapshot,
    context: domContext,
    // baseline() : le rapport en JSON lisible, à copier tel quel dans le dossier
    // de mesure (docs/PERF_IOS_BASELINE.md). Aucun chiffre n'est inventé : ce qui
    // n'a pas été mesuré n'apparaît pas.
    baseline: function () { return JSON.stringify(report(), null, 2); },
    reset: function () { samples = Object.create(null); counters = Object.create(null); startedAt = Date.now(); },
  };
})();
