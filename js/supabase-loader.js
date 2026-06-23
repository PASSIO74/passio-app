    // Chargement PARESSEUX du SDK Supabase (~120 Ko gzip). Il ne sert qu'APRÈS
    // le code d'accès : inutile de le télécharger/parser sur la page verrouillée
    // (gain FCP + « unused JS » sur la 1re page que tout le monde voit).
    // Appelé en TÊTE de boot() (post-gate). Idempotent. Calque de ensureLeaflet.
    window.ensureSupabase = function () {
      if (typeof window.supabase !== "undefined") return Promise.resolve();
      if (window._supabaseLoading) return window._supabaseLoading;
      window._supabaseLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return window._supabaseLoading;
    };
