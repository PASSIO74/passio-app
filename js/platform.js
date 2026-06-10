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
      }
    })();

    // ═══ MONITORING : remonte les erreurs JS dans Supabase (table client_errors) ═══
    (function() {
      var sent = 0;
      function report(message, source, line, col, stackText) {
        try {
          if (sent >= 5) return; // max 5 erreurs par session (anti-spam)
          sent++;
          if (!window.supa) return;
          window.supa.from("client_errors").insert({
            message: String(message).slice(0, 500),
            source: String(source || "").slice(0, 200),
            line: line || null,
            stack: String(stackText || "").slice(0, 1500),
            url: location.pathname,
            ua: navigator.userAgent.slice(0, 200),
            uid: window.MY_UID || null,
          }).then(function(){}, function(){});
        } catch (e) {}
      }
      window.addEventListener("error", function(e) {
        report(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
      });
      window.addEventListener("unhandledrejection", function(e) {
        var r = e.reason || {};
        report("Promise rejetée: " + (r.message || String(r)).slice(0, 300), "", null, null, r.stack);
      });
    })();

    var _ua           = navigator.userAgent;
    var _isIOS        = /iphone|ipad|ipod/i.test(_ua) && !window.MSStream;
    var _isAndroid    = /android/i.test(_ua);
    var _isWindows    = /windows/i.test(_ua);
    var _isMac        = /mac os x/i.test(_ua) && !_isIOS;
    var _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

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

    if (!_isStandalone) {

      // ══ ANDROID / DESKTOP compatible ══
      // Stocke le prompt natif dès qu'il arrive, puis le déclenche automatiquement
      window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        window._pwaPrompt = e;
        // Déclenchement automatique immédiat (pas besoin de cliquer)
        try { e.prompt(); } catch(_) {}
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
        // ══ iOS autre navigateur : rediriger vers Safari ══
        else if (_isIOSOther) {
          setTimeout(function() {
            window.location.href = 'https://passio-app.netlify.app/';
          }, 800);
        }
        // ══ Firefox Android : ouvrir Chrome ══
        else if (_isAndroid && _isFirefox) {
          setTimeout(function() {
            window.location.href = 'intent://passio-app.netlify.app/#Intent;scheme=https;package=com.android.chrome;end';
          }, 600);
        }
      });
    }
