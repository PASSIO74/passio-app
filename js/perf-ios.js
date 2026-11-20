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
  // Nombre d'enregistrements REÇUS par métrique, jamais plafonné : c'est lui qui
  // dit « quelque chose de neuf est arrivé ». La taille de l'anneau (`n`, ≤ 120)
  // ne le dit plus dès que la fenêtre est pleine — voir `snapshot`.
  var recus = Object.create(null);          // métrique → nombre d'enregistrements
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
    recus[k] = (recus[k] || 0) + 1;
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
  //
  // ⚠️ UNE MÉTRIQUE NE REPART QUE SI ELLE A BOUGÉ (2026-11-20, audit « 100 000 »,
  // AFF-02 / CLIC-04). Chaque photo réémettait l'agrégat CUMULÉ de TOUTES les
  // métriques, inchangé ou non : mesuré sur 72 h de production, `perf` faisait
  // 77 % de la télémétrie, dont 83 % de photos « periodic » (une valeur mesurée
  // une seule fois par session, `gate_ready`, revenait ~18 fois). À 2 000–5 000
  // onglets ouverts, ce flux seul dépassait le plafond de débit de la base
  // (4 200 lignes/min), qui refuse alors les lots ENTIERS — erreurs et flows
  // compris. On n'échantillonne pas un agrégat (telemetry.js, `ECH_PERF`) : on
  // cesse de le RÉPÉTER. La dernière ligne émise d'une métrique reste sa valeur
  // à jour, puisqu'une métrique sans nouvel échantillon n'a pas changé.
  // `ios_context` suit la même règle : il ne repart qu'avec une métrique, ou si
  // ses compteurs (longues tâches, saccades) ont bougé.
  // ⚠️ « A BOUGÉ » SE LIT SUR LES ENREGISTREMENTS REÇUS (`recus`), JAMAIS SUR `n`
  // (contre-revue du 20/11, B1). `n` est la taille de l'anneau : à 120, il ne
  // bouge plus alors que les valeurs changent. Le premier jet comparait `n` — les
  // métriques les plus actives (image par image, touchers) se figeaient à leur
  // valeur du 120ᵉ échantillon, photo de sortie comprise.
  var _recusEmis = {};      // métrique → `recus` à sa dernière émission
  var _ctxEmis = null;      // empreinte des compteurs du dernier `ios_context`
  function snapshot(labelPhase) {
    var r = report();
    var ph = String(labelPhase || "auto").slice(0, 24);
    var names = Object.keys(r.metrics);
    var emises = 0;
    for (var i = 0; i < names.length; i++) {
      var s = r.metrics[names[i]];
      if (!s) continue;
      var vus = recus[names[i]] || 0;
      if (_recusEmis[names[i]] === vus) continue;   // rien de neuf depuis sa dernière ligne
      _recusEmis[names[i]] = vus;
      emises++;
      emit("ios_stat_" + names[i], s.p95, {
        phase: ph, n: s.n, p50: s.p50, p99: s.p99, mn: s.mn, mx: s.mx, avg: s.avg,
      });
    }
    var ctx = r.context;
    var m = { phase: ph, uptime_s: r.uptime_s,
      sup_longtask: r.support.longtask ? 1 : 0, sup_event: r.support.event_timing ? 1 : 0,
      longtask_n: counters.longtask_n || 0, tbt_ms: counters.tbt_ms || 0, jank_n: counters.jank_n || 0 };
    var empreinteCtx = m.longtask_n + "|" + m.tbt_ms + "|" + m.jank_n;
    if (emises > 0 || _ctxEmis !== empreinteCtx) {
      _ctxEmis = empreinteCtx;
      for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) m[k] = ctx[k];
      emit("ios_context", null, m);
    }
    return r;
  }
  // ─── Quand photographier : la mesure de performance CÈDE sous la pression ───
  // `perf` est la famille la plus volumineuse et la moins urgente. Dédoublonner
  // ne suffit pas à l'échelle : une seule photo vaut ~12 lignes, et 500 sessions
  // qui démarrent par minute en font 6 000 — plus que le plafond de la base. La
  // règle est donc : au moindre signal de pression, AUCUNE photo automatique
  // (ni t45, ni périodique, ni arrière-plan, ni sortie). Deux signaux :
  //   · la production est en délestage (js/reglages-distants.js, facteur 2 ou 4) ;
  //   · CET appareil s'est vu refuser un lot pour débit (429) il y a peu
  //     (`tel.sousPression()`, js/telemetry.js).
  // Rien n'est marqué « émis » pendant ce silence : la pression passée, la photo
  // suivante emporte tout ce qui a bougé entre-temps.
  // La photo PÉRIODIQUE demande en plus que quelqu'un regarde : onglet masqué,
  // rien ne bouge à l'écran, et le passage en arrière-plan a déjà pris sa photo.
  function sousPression() {
    try {
      var f = (typeof W.delestageFacteur === "function") ? W.delestageFacteur() : 1;
      if (f === 2 || f === 4) return true;
    } catch (e) {}
    try { if (W.tel && typeof W.tel.sousPression === "function" && W.tel.sousPression()) return true; } catch (e) {}
    return false;
  }
  function photoUtile(phase) {
    if (sousPression()) return false;
    if (phase === "periodic") {
      try { if (document.visibilityState === "hidden") return false; } catch (e) {}
    }
    return true;
  }
  // La seule porte des photos AUTOMATIQUES. `snapshot()` reste l'outil nu (API
  // publique, bancs, baseline à la main) : lui ne juge de rien.
  function photo(phase) {
    if (!photoUtile(phase)) return false;
    snapshot(phase);
    return true;
  }
  // La cadence périodique S'ESPACE : 3, 6, 12, 24 min, puis toutes les 30 min.
  // Les agrégats d'une session convergent — la dixième photo d'une demi-heure
  // n'apprend presque rien de plus que la quatrième, et c'est la dernière
  // (arrière-plan, sortie) qui porte l'état final.
  var SNAP_FIRST_MS = 45000, SNAP_EVERY_MS = 180000, SNAP_MAX_MS = 1800000;
  function delaiPeriodique(k) {
    var d = SNAP_EVERY_MS * Math.pow(2, Math.max(0, Math.min(k | 0, 10)));
    return d > SNAP_MAX_MS ? SNAP_MAX_MS : d;
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
  // ⚠️ EN PRODUCTION, `goTo` PEUT ARRIVER APRÈS LA FIN DU SONDAGE (60 × 300 ms =
  //    18 s depuis le <head>, où ce fichier est inliné) : le bloc app est injecté
  //    après le gate, et un gate réarmé (`passio_gate_actif="1"`) fait courir les
  //    18 s pendant la saisie du code. Les parcours `nav_*` et `feed_to_irl`
  //    étaient alors perdus pour toute la session. `passio:app-ready` (émis une
  //    fois, après le neuvième script) retente ; en développement il n'est jamais
  //    émis, le sondage reste.
  //    La réussite est retenue ICI (`pose`), jamais par `goTo.__perf` : un module
  //    qui enveloppe `goTo` par-dessus cache le marqueur, et une seconde enveloppe
  //    chronométrerait chaque navigation deux fois (le piège corrigé par #813).
  //    Verrou sur l'artefact : tests/e2e/navigation-artefact.spec.js.
  (function hookGoTo() {
    var pose = false, tries = 0, iv = null;
    function poser() {
      if (pose) return true;
      if (typeof W.goTo !== "function") return false;
      pose = true;
      if (W.goTo.__perf) return true;       // déjà enveloppé
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
      return true;
    }
    iv = setInterval(function () {
      if (poser() || ++tries > 60) clearInterval(iv);
    }, 300);
    W.addEventListener("passio:app-ready", function () {
      if (poser()) clearInterval(iv);
    });
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
  // Le battement périodique, nommé pour que le banc éprouve CE que le minuteur
  // exécute (`_tickPeriodique`), et non une copie de sa condition. La décision
  // se prend au battement ; la photo, elle, attend un moment d'oisiveté.
  function tickPeriodique() {
    if (!photoUtile("periodic")) return false;
    whenIdle(function () { snapshot("periodic"); });
    return true;
  }
  // La cadence ne s'espace que sur une photo PRISE : un battement refusé (onglet
  // masqué, pression) ne compte pas, sinon une longue absence repoussait la
  // photo du retour à 30 min (contre-revue du 20/11).
  var _photosPeriodiques = 0;
  function armerPeriodique() {
    setTimeout(function () {
      var prise = false;
      try { prise = tickPeriodique(); } catch (e) {}
      if (prise) _photosPeriodiques++;
      armerPeriodique();
    }, delaiPeriodique(_photosPeriodiques));
  }
  setTimeout(function () {
    whenIdle(function () { photo("t45"); });
    armerPeriodique();
  }, SNAP_FIRST_MS);
  // Dernière photo avant la fermeture : c'est la session la plus longue qui porte
  // les p99 intéressants, et c'est justement celle qu'on perdrait sans ceci.
  W.addEventListener("pagehide", function () {
    try { if (photo("exit") && W.tel && W.tel.flush) W.tel.flush({ keepalive: true }); } catch (e) {}
  });
  // Passage en arrière-plan : sur mobile, c'est souvent la DERNIÈRE occasion —
  // le système tue l'onglet masqué sans `pagehide`. Puisque la photo périodique
  // ne tourne plus onglet masqué, celle-ci emporte l'état du moment ; le
  // dédoublonnage la rend gratuite quand rien n'a bougé depuis la précédente.
  // Pas avant t45 : une session éclair n'a encore rien de stable à dire, et
  // `pagehide` reste là pour elle.
  function surArrierePlan() {
    try {
      if (document.visibilityState !== "hidden") return false;
      if (Date.now() - startedAt < SNAP_FIRST_MS) return false;
      if (!photo("hidden")) return false;
      if (W.tel && W.tel.flush) W.tel.flush({ keepalive: true });
      return true;
    } catch (e) { return false; }
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", surArrierePlan);
  }

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
    // Pour les bancs : le battement périodique, sa cadence et la porte des photos
    // automatiques — ce que les minuteurs exécutent réellement, pas une copie de
    // leurs conditions. (Le passage en arrière-plan s'éprouve par son événement.)
    _tickPeriodique: tickPeriodique,
    _delaiPeriodique: delaiPeriodique,
    _photo: photo,
    context: domContext,
    // baseline() : le rapport en JSON lisible, à copier tel quel dans le dossier
    // de mesure (docs/PERF_IOS_BASELINE.md). Aucun chiffre n'est inventé : ce qui
    // n'a pas été mesuré n'apparaît pas.
    baseline: function () { return JSON.stringify(report(), null, 2); },
    // Remise à zéro complète : les compteurs repartent de 0, donc la mémoire de
    // ce qui a été émis aussi — sinon une métrique revenue au même compte serait tue.
    reset: function () { samples = Object.create(null); counters = Object.create(null); recus = Object.create(null); startedAt = Date.now(); _recusEmis = {}; _ctxEmis = null; },
  };
})();
