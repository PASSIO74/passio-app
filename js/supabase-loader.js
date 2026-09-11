    // Chargement PARESSEUX du SDK Supabase (~120 Ko gzip). Il ne sert qu'APRÈS
    // le code d'accès : inutile de le télécharger/parser sur la page verrouillée
    // (gain FCP + « unused JS » sur la 1re page que tout le monde voit).
    // Appelé en TÊTE de boot() (post-gate). Idempotent. Calque de ensureLeaflet.
    window.ensureSupabase = function () {
      if (typeof window.supabase !== "undefined") return Promise.resolve();
      if (window._supabaseLoading) return window._supabaseLoading;
      window._supabaseLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        // ⚠️ AUTO-HÉBERGÉ ET ÉPINGLÉ (2026-09-11). Il venait de jsDelivr à la
        // version FLOTTANTE `@2`, sans intégrité : une publication cassée ou
        // compromise du SDK atteignait la production sans aucun déploiement de
        // notre côté, et sans qu'aucune gate puisse le voir. Le fichier vit dans
        // `js/vendor/` (copié dans dist/ par scripts/build.js), la CSP n'autorise
        // plus aucun CDN de scripts. Monter de version = remplacer le fichier ET
        // ce chemin, en un seul commit — c'est le but.
        s.src = "js/vendor/supabase-js-2.116.0.js";
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return window._supabaseLoading;
    };
