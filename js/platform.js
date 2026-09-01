    // ═══ MODE PRODUCTION : logs désactivés ═══
    // Pour réactiver les logs : localStorage.setItem("passio_debug", "1") puis recharger.
    (function() {
      try {
        window.PASSIO_DEBUG = localStorage.getItem("passio_debug") === "1"
          || location.hostname === "localhost" || location.hostname === "127.0.0.1";
      } catch (e) { window.PASSIO_DEBUG = false; }
      if (!window.PASSIO_DEBUG) {
        console.log = function() {};
        console.debug = function() {};
        console.info = function() {}; // même sort que log/debug (warn/error restent)
      }
    })();

    // ═══ MONITORING : remonte les erreurs JS dans Supabase (table client_errors) ═══
    // platform.js est chargé dans <head>, AVANT app-08 qui crée le client et fait
    // `window.supa = supa`. Les erreurs survenant pendant le boot (les plus
    // utiles) arrivent donc avant que window.supa existe → on les met en file et
    // on les vide dès que le client est prêt.
    (function() {
      var sent = 0;
      var pending = [];

      // ─── Ne pas remonter depuis localhost ────────────────────────────────
      // Il n'existe qu'UNE base : ce qui part d'ici atterrit dans la table de
      // PRODUCTION. Or la suite e2e provoque des erreurs VOLONTAIRES — le spec
      // d'échappement vérifie qu'une charge hostile rend le handler non
      // compilable, et le `SyntaxError` qui en résulte EST la preuve que
      // l'attaque est inerte.
      //
      // Mesuré le 2026-08-16 : « Unexpected token ')' » occupait la PREMIÈRE
      // place du monitoring avec 55 occurrences et 55 clients distincts, toutes
      // venant de 127.0.0.1. Une vraie erreur d'un vrai testeur serait passée
      // inaperçue dessous — c'est exactement ce qu'une table d'erreurs ne doit
      // jamais faire. Même raisonnement que pour la télémétrie (localhost en
      // opt-in strict depuis ce jour-là).
      //
      // `?monitoring=1` force la remontée pour déboguer la chaîne elle-même.
      var MONITORING_ACTIF = (function() {
        try {
          if (new URLSearchParams(location.search).get("monitoring") === "1") return true;
          return location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
        } catch (e) { return true; }   // en cas de doute, on remonte
      })();
      function doInsert(payload) {
        try { window.supa.from("client_errors").insert(payload).then(function(){}, function(){}); } catch (e) {}
      }
      // ⚠️ `window.supa` existe dès le PARSE d'app-08 : c'est le stub noop, dont
      // l'insert ne part nulle part. Vider la file dessus jetait justement les
      // erreurs les plus utiles — celles du boot — alors que le vrai client
      // arrive une à deux secondes plus tard. On attend `_supaReal`.
      function flush() {
        if (!window._supaReal) return;
        while (pending.length) doInsert(pending.shift());
      }
      function report(message, source, line, col, stackText) {
        try {
          if (!MONITORING_ACTIF) return;
          if (sent >= 5) return; // max 5 erreurs par session (anti-spam)
          sent++;
          var payload = {
            message: String(message).slice(0, 500),
            source: String(source || "").slice(0, 200),
            line: line || null,
            stack: String(stackText || "").slice(0, 1500),
            url: location.pathname,
            ua: navigator.userAgent.slice(0, 200),
            uid: window.MY_UID || null,
          };
          if (window._supaReal) doInsert(payload);
          else pending.push(payload); // boot (ou stub noop) : on garde pour plus tard
        } catch (e) {}
      }
      window.addEventListener("error", function(e) {
        report(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
        flush();
      });
      window.addEventListener("unhandledrejection", function(e) {
        var r = e.reason || {};
        report("Promise rejetée: " + (r.message || String(r)).slice(0, 300), "", null, null, r.stack);
        flush();
      });
      // Vide la file dès que le client Supabase est dispo (boot ~ quelques s).
      var tries = 0;
      var iv = setInterval(function() {
        tries++;
        if (window._supaReal) flush();
        if (window._supaReal || tries > 40) clearInterval(iv); // abandon après ~20s
      }, 500);
    })();

    var _ua           = navigator.userAgent;
    var _isIOS        = /iphone|ipad|ipod/i.test(_ua) && !window.MSStream;
    var _isAndroid    = /android/i.test(_ua);
    var _isWindows    = /windows/i.test(_ua);
    var _isMac        = /mac os x/i.test(_ua) && !_isIOS;
    var _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    // _pwaInstalled : référencé par pwa-landing.js mais jamais déclaré
    // → « ReferenceError: _pwaInstalled is not defined » (4310 erreurs en 3 j).
    // Vrai si l'app tourne en standalone OU déjà installée (flag persistant).
    var _pwaInstalled = _isStandalone;
    try { _pwaInstalled = _pwaInstalled || localStorage.getItem('passio_pwa_installed') === '1'; } catch (e) {}
    window.addEventListener('appinstalled', function () {
      _pwaInstalled = true;
      try { localStorage.setItem('passio_pwa_installed', '1'); } catch (e) {}
    });

    // Navigateur actuel
    var _isChrome   = /chrome|chromium/i.test(_ua) && !/edg|opr|samsungbrowser|crios/i.test(_ua);
    var _isEdge     = /edg(e|\/)/i.test(_ua);
    var _isSamsung  = /samsungbrowser/i.test(_ua);
    var _isOpera    = /opr\//i.test(_ua);
    var _isFirefox  = /firefox|fxios/i.test(_ua);
    var _isSafari   = /safari/i.test(_ua) && !/chrome|crios|chromium/i.test(_ua);
    var _isIOSSafari= _isIOS && _isSafari;
    var _isIOSOther = _isIOS && !_isIOSSafari;

    // Navigateur compatible PWA install natif ?
    var _supportsPWA = _isChrome || _isEdge || _isSamsung || _isOpera;

    window._pwaPrompt = null;

    // Sommes-nous déjà sur un déploiement PASSIO ? L'adresse canonique, mais
    // AUSSI les previews de PR et de branche (`pr-232--passio-app.netlify.app`,
    // `<branche>--passio-app.netlify.app`), que Netlify sert sous un sous-domaine
    // — donc sous une ORIGINE différente. Les redirections ci-dessous ne doivent
    // jamais faire quitter un de ces déploiements : elles ramèneraient en
    // production quelqu'un venu tester autre chose.
    function _estDeploiementPassio() {
      try {
        var h = window.location.hostname || '';
        return h === 'passio-app.netlify.app' || /--passio-app\.netlify\.app$/.test(h);
      } catch (e) { return false; }
    }

    if (!_isStandalone) {

      // ══ ANDROID / DESKTOP compatible ══
      // Stocke le prompt natif dès qu'il arrive, puis le déclenche automatiquement
      window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        window._pwaPrompt = e;
        // NE PAS appeler e.prompt() ici : Chrome exige un geste utilisateur,
        // sinon « Failed to execute 'prompt' on 'BeforeInstallPromptEvent' »
        // (4305 erreurs en 3 jours). Le prompt est déclenché au clic sur le
        // bouton INSTALLER (pwaInstall(), app-09).
        var btn = document.getElementById('btn-install-app');
        if (btn) btn.style.display = '';
      });

      window.addEventListener('load', function() {
        // Afficher le bouton INSTALLER seulement si pas encore installé
        var btn = document.getElementById('btn-install-app');
        if (btn) btn.style.display = '';

        // ══ iOS Safari : afficher le guide automatiquement après 1.5s ══
        if (_isIOSSafari) {
          setTimeout(function() {
            if (typeof pwaShowOverlay === 'function') pwaShowOverlay();
          }, 1500);
        }
        // ══ iOS autre navigateur : ramener sur l'adresse canonique ══
        // ⚠️ Rectifié le 2026-08-28. Cette redirection n'ouvre PAS Safari : le
        // schéma reste `https`, donc on demeure dans le navigateur courant.
        // Elle avait donc deux effets, tous deux non voulus :
        //   ① elle DÉTRUISAIT la query — un lien d'aperçu
        //      `?passio_preview=…` était effacé 800 ms après le chargement, en
        //      pleine saisie du code d'accès. C'est l'une des causes mesurées
        //      des « aperçus invisibles » du 2026-08-28 ;
        //   ② lancée depuis l'adresse canonique elle-même, elle rechargeait la
        //      page pour rien, et pouvait le refaire à chaque chargement.
        // On ne ramène donc plus que depuis une AUTRE origine, et en conservant
        // query et fragment.
        //   ③ ⚠️ UNE PREVIEW DE PR EST UNE AUTRE ORIGINE. Netlify sert les
        //      déploiements de branche sous `pr-<n>--passio-app.netlify.app` :
        //      la garde d'origine du ② les prenait donc pour « un autre site »
        //      et ramenait sur la PRODUCTION — c'est-à-dire hors de l'aperçu
        //      qu'on venait précisément d'ouvrir. Le paramètre `?passio_preview=…`
        //      survivait au voyage, mais atterrissait sur un code qui ne contient
        //      pas encore le lot : on concluait « l'aperçu ne marche pas » alors
        //      qu'il n'avait jamais été chargé. Mesuré le 2026-09-01 en préparant
        //      la preview de la PR #232. Même famille que ①, et même remède :
        //      ne jamais déplacer quelqu'un qui est DÉJÀ sur un déploiement PASSIO.
        else if (_isIOSOther) {
          setTimeout(function() {
            try {
              if (_estDeploiementPassio()) return;
              window.location.href = 'https://passio-app.netlify.app/'
                + window.location.search + window.location.hash;
            } catch (e) {}
          }, 800);
        }
        // ══ Firefox Android : ouvrir Chrome ══
        // Même garde : depuis une preview de PR, cet `intent://` renverrait sur
        // la production, et l'aperçu testé serait perdu en silence.
        else if (_isAndroid && _isFirefox && !_estDeploiementPassio()) {
          setTimeout(function() {
            window.location.href = 'intent://passio-app.netlify.app/#Intent;scheme=https;package=com.android.chrome;end';
          }, 600);
        }
      });
    }
