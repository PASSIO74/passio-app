// ════════════════════════════════════════════════════════════════════════
// CARTES — MapLibre GL + OpenFreeMap (gratuit, sans clé, sans quota)
// ════════════════════════════════════════════════════════════════════════
// Remplace Leaflet + les tuiles raster de tile.openstreetmap.org, dont la
// politique d'usage interdit explicitement les applications à fort trafic
// (« heavy use ») : c'était le dernier service tiers non pérenne du projet.
//
// OpenFreeMap (openfreemap.org) sert des tuiles VECTORIELLES gratuitement, sans
// inscription, sans clé et sans limite de requêtes — mais elles ne se lisent pas
// avec Leaflet, d'où MapLibre GL.
//
// ⚠️ POURQUOI UNE COUCHE DE COMPATIBILITÉ `window.L` PLUTÔT QU'UNE RÉÉCRITURE ?
// Quatre cartes utilisent l'API Leaflet (IRL, carnet, live CDV, tour d'accueil).
// MapLibre attend les coordonnées en [lng, lat], soit l'INVERSE de Leaflet : une
// réécriture site par site aurait semé ce piège dans quatre fichiers. Ce shim
// implémente le sous-ensemble réellement utilisé et centralise l'inversion ICI,
// en un seul endroit testable.
//
// ⚠️ Il ne couvre QUE ce dont l'app se sert. Pour un besoin nouveau (couches,
// GeoJSON, clusters…), utiliser directement `maplibregl` plutôt que d'étendre
// ce shim à l'aveugle.
(function () {
  var MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
  var MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
  // Style « liberty » : le rendu le plus proche de l'ancienne carte OSM raster.
  var STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

  // ODbL : l'attribution OpenStreetMap est une OBLIGATION LÉGALE, pas une option.
  // Les appels passent `attributionControl:false` pour les petites cartes → on la
  // garde en mode compact (repliée derrière un « ⓘ ») au lieu de la supprimer.
  var ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · '
    + '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';

  function loadCss() {
    if (document.getElementById("maplibre-css")) return;
    var css = document.createElement("link");
    css.id = "maplibre-css";
    css.rel = "stylesheet";
    css.href = MAPLIBRE_CSS;
    document.head.appendChild(css);
  }

  // ---- Shim Leaflet minimal au-dessus de MapLibre ----
  function buildShim() {
    var ml = window.maplibregl;

    // Leaflet : [lat, lng] ou {lat, lng} · MapLibre : [lng, lat]. UNIQUE endroit
    // où cette conversion a lieu.
    function toLngLat(p) {
      if (!p) return [0, 0];
      if (Array.isArray(p)) return [p[1], p[0]];
      if (typeof p.lng === "number") return [p.lng, p.lat];
      if (typeof p.lon === "number") return [p.lon, p.lat];
      return [0, 0];
    }

    // ⚠️ ÉCHELLES DE ZOOM DIFFÉRENTES — le piège le plus sournois de la migration.
    // Leaflet raster travaille en tuiles de 256 px, MapLibre en tuiles de 512 px :
    // à numéro de zoom ÉGAL, MapLibre affiche une zone DEUX FOIS plus petite.
    // Mesuré : `setView([46.6, 2.5], 5.7)` montrait toute la France sous Leaflet,
    // et seulement 387 km de large sous MapLibre.
    //   zoom MapLibre = zoom Leaflet − 1
    // Les quatre appelants passent des valeurs pensées pour Leaflet (5, 5.7, 9,
    // 10, 11, 12, 13) : la conversion est faite ICI, une fois pour toutes, dans
    // les deux sens (setView/fitBounds en entrée, getZoom en sortie).
    var ZOOM_OFFSET = 1;
    function toMlZoom(z) { return Math.max(0, z - ZOOM_OFFSET); }
    function toLeafletZoom(z) { return z + ZOOM_OFFSET; }

    function MapShim(container, opts) {
      opts = opts || {};
      var el = typeof container === "string" ? document.getElementById(container) : container;
      this._map = new ml.Map({
        container: el,
        style: STYLE_URL,
        center: [2.5, 46.6],
        zoom: toMlZoom(5),
        attributionControl: false,
        // Le tilt/rotation n'a aucun sens ici et déroute au doigt sur mobile.
        pitchWithRotate: false,
        dragRotate: false,
        touchZoomRotate: true,
      });
      try { this._map.touchZoomRotate.disableRotation(); } catch (e) {}
      this._map.addControl(new ml.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
      if (opts.zoomControl !== false) {
        this._map.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");
      }
      this._markers = [];
      this._lineIds = [];
      this._lineSeq = 0;
      this._popup = null;
      this._destroyed = false;
    }

    // Exécute `fn` dès que le style accepte des sources/couches.
    //
    // ⚠️ NE PAS se fier aux signaux « prêt » de MapLibre ici : `isStyleLoaded()`
    // repasse à false pendant le chargement des tuiles, et l'événement `load`
    // s'est révélé ne PAS être émis de façon fiable selon le contexte de rendu
    // (carte hors écran, onglet en arrière-plan). Un `once("load")` posé alors
    // ne se déclenchait jamais → le tracé d'itinéraire du CDV n'apparaissait
    // pas du tout. On tente donc l'opération et on RÉESSAIE jusqu'à ce qu'elle
    // passe : le seul juge fiable, c'est `addSource` lui-même.
    MapShim.prototype._whenReady = function (fn) {
      var self = this;
      var tries = 0;
      (function attempt() {
        if (self._destroyed) return;
        try { fn(); return; } catch (e) { /* style pas encore prêt */ }
        if (++tries > 60) return; // ~9 s : on renonce sans bloquer la carte
        setTimeout(attempt, 150);
      })();
    };

    MapShim.prototype.setView = function (latlng, zoom) {
      this._map.jumpTo({ center: toLngLat(latlng), zoom: typeof zoom === "number" ? toMlZoom(zoom) : this._map.getZoom() });
      return this; // chaînable : les appels font L.map(...).setView(...)
    };

    MapShim.prototype.fitBounds = function (bounds, opts) {
      opts = opts || {};
      var pad = opts.padding;
      // Leaflet : padding [x, y] · MapLibre : un nombre ou {top,bottom,left,right}.
      var padding = Array.isArray(pad) ? { top: pad[1], bottom: pad[1], left: pad[0], right: pad[0] } : (pad || 20);
      this._lastFit = { b: bounds._b, o: { padding: padding, maxZoom: toMlZoom(opts.maxZoom || 16), duration: 0 } };
      try { this._map.fitBounds(this._lastFit.b, this._lastFit.o); } catch (e) {}
      return this;
    };

    // ⚠️ Recadre APRÈS le redimensionnement. Les cartes des modales sont créées
    // avant que leur conteneur ait sa taille finale : MapLibre mesurait alors une
    // boîte trop petite et le fitBounds initial sortait dézoomé (Paris–Marseille
    // s'affichait à l'échelle du continent). Les appelants invoquent déjà
    // invalidateSize() une fois la modale peinte : on en profite.
    MapShim.prototype.invalidateSize = function () {
      try {
        this._map.resize();
        if (this._lastFit) this._map.fitBounds(this._lastFit.b, this._lastFit.o);
      } catch (e) {}
      return this;
    };
    MapShim.prototype.closePopup = function () { try { if (this._popup) this._popup.remove(); } catch (e) {} return this; };
    MapShim.prototype.getCenter = function () { return this._map.getCenter(); }; // {lat, lng} : compatible
    MapShim.prototype.getZoom = function () { return toLeafletZoom(this._map.getZoom()); };
    MapShim.prototype.remove = function () {
      this._destroyed = true; // stoppe les réessais de _whenReady en cours
      this.clearLayers();
      try { this._map.remove(); } catch (e) {}
    };

    // Retire tout ce que le shim a ajouté (marqueurs + tracés).
    MapShim.prototype.clearLayers = function () {
      this._markers.forEach(function (mk) { try { mk.remove(); } catch (e) {} });
      this._markers = [];
      var m = this._map;
      this._lineIds.forEach(function (id) {
        try { if (m.getLayer(id)) m.removeLayer(id); } catch (e) {}
        try { if (m.getSource(id)) m.removeSource(id); } catch (e) {}
      });
      this._lineIds = [];
    };

    // Groupe de marqueurs : délègue au shim de carte, qui possède le vrai état.
    function LayerGroupShim() { this._map = null; this._markers = []; }
    LayerGroupShim.prototype.addTo = function (mapShim) { this._map = mapShim; return this; };
    LayerGroupShim.prototype.clearLayers = function () {
      var owner = this._map;
      this._markers.forEach(function (mk) {
        try { mk._m.remove(); } catch (e) {}
        if (owner) owner._markers = owner._markers.filter(function (x) { return x !== mk._m; });
      });
      this._markers = [];
      return this;
    };

    function MarkerShim(latlng, opts) {
      opts = opts || {};
      var icon = opts.icon || {};
      var el = document.createElement("div");
      if (icon.className) el.className = icon.className;
      el.innerHTML = icon.html || "";
      if (icon.iconSize) { el.style.width = icon.iconSize[0] + "px"; el.style.height = icon.iconSize[1] + "px"; }
      el.style.cursor = "pointer";
      // Leaflet ancre au centre quand iconAnchor = iconSize / 2 ; sinon en bas
      // (cas du 📍 de position, iconAnchor [16,32] pour une icône 32×32).
      var anchor = "center";
      if (icon.iconAnchor && icon.iconSize && icon.iconAnchor[1] >= icon.iconSize[1]) anchor = "bottom";
      this._m = new ml.Marker({ element: el, anchor: anchor }).setLngLat(toLngLat(latlng));
      this._popupOffset = anchor === "bottom" ? [0, -34] : [0, -18];
    }

    MarkerShim.prototype.addTo = function (target) {
      // La cible est soit la carte, soit un groupe de calques.
      var mapShim = target instanceof LayerGroupShim ? target._map : target;
      if (!mapShim) return this;
      this._m.addTo(mapShim._map);
      mapShim._markers.push(this._m);
      if (target instanceof LayerGroupShim) target._markers.push(this);
      this._owner = mapShim;
      return this;
    };

    MarkerShim.prototype.bindPopup = function (html) {
      var popup = new ml.Popup({ offset: this._popupOffset, closeButton: true, maxWidth: "280px" }).setHTML(html);
      this._m.setPopup(popup);
      var self = this;
      // `closePopup()` doit pouvoir fermer celle qui est ouverte.
      popup.on("open", function () { if (self._owner) self._owner._popup = popup; });
      return this;
    };

    function BoundsShim(points) {
      var b = new ml.LngLatBounds();
      (points || []).forEach(function (p) { b.extend(toLngLat(p)); });
      this._b = b;
    }

    function PolylineShim(points, opts) {
      this._points = points || [];
      this._opts = opts || {};
    }
    PolylineShim.prototype.addTo = function (mapShim) {
      if (!mapShim) return this;
      var pts = this._points.map(toLngLat);
      var o = this._opts;
      var id = "passio-line-" + (mapShim._lineSeq++);
      mapShim._lineIds.push(id);
      mapShim._whenReady(function () {
        var m = mapShim._map;
        if (m.getSource(id)) return;
        m.addSource(id, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } },
        });
        m.addLayer({
          id: id, type: "line", source: id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": o.color || "#7c3aed",
            "line-width": o.weight || 3,
            "line-opacity": o.opacity == null ? 1 : o.opacity,
            // Leaflet : dashArray "6 6" en pixels · MapLibre : multiples de la largeur.
            "line-dasharray": o.dashArray ? [2, 2] : [1],
          },
        });
      });
      return this;
    };

    window.L = {
      map: function (c, o) { return new MapShim(c, o); },
      // Les tuiles viennent du style OpenFreeMap : plus de couche à ajouter.
      // Conservé en no-op pour ne pas toucher les quatre appelants existants.
      tileLayer: function () { return { addTo: function () { return this; } }; },
      layerGroup: function () { return new LayerGroupShim(); },
      marker: function (ll, o) { return new MarkerShim(ll, o); },
      divIcon: function (o) { return o || {}; },
      latLngBounds: function (pts) { return new BoundsShim(pts); },
      polyline: function (pts, o) { return new PolylineShim(pts, o); },
    };
  }

  // ⚠️ MapLibre exige WebGL, contrairement à Leaflet (canvas 2D) : sur un très
  // vieil appareil ou avec l'accélération matérielle désactivée, la carte ne peut
  // pas s'afficher. On le détecte AVANT de télécharger 250 Ko de JS pour rien, et
  // les appelants affichent un repli lisible plutôt qu'un cadre vide.
  window.passioMapSupported = function () {
    if (window._mapWebgl !== undefined) return window._mapWebgl;
    try {
      var c = document.createElement("canvas");
      window._mapWebgl = !!(window.WebGLRenderingContext
        && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { window._mapWebgl = false; }
    return window._mapWebgl;
  };

  // `ensureLeaflet` : nom conservé car appelé par app-03, app-07 et app-08.
  window.ensureMapLibre = window.ensureLeaflet = function () {
    if (window.L && window.maplibregl) return Promise.resolve();
    if (!window.passioMapSupported()) return Promise.reject(new Error("WebGL indisponible"));
    if (window._mapLoading) return window._mapLoading;
    window._mapLoading = new Promise(function (resolve, reject) {
      loadCss();
      var s = document.createElement("script");
      s.src = MAPLIBRE_JS;
      s.onload = function () {
        try { buildShim(); resolve(); }
        catch (e) { reject(e); }
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return window._mapLoading;
  };
})();
