    window.ensureLeaflet = function() {
      if (window.L) return Promise.resolve();
      if (window._leafletLoading) return window._leafletLoading;
      window._leafletLoading = new Promise(function(resolve, reject) {
        var css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        css.crossOrigin = "";
        document.head.appendChild(css);
        var s = document.createElement("script");
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
        s.crossOrigin = "";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return window._leafletLoading;
    };
