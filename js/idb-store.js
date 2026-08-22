// ════════════════════════════════════════════════════════════════════════
// idb-store.js — petit wrapper IndexedDB pour le stockage DURABLE des données
// volumineuses (conversations + messages), sans la limite ~5 Mo de localStorage.
// Chargé AVANT le bundle app-*.js → window.idbConvLoad / idbConvSave dispo.
// Tout est best-effort : si IndexedDB est indisponible (mode privé strict, etc.),
// les fonctions résolvent null/false sans jamais throw — l'app retombe sur
// localStorage. Aucune dépendance, scripts classiques (pas de modules ES).
// ════════════════════════════════════════════════════════════════════════
(function () {
  var DB_NAME = "passio_store", STORE = "kv", VERSION = 1;
  var _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) { reject(new Error("no-idb")); return; }
        var rq = indexedDB.open(DB_NAME, VERSION);
        rq.onupgradeneeded = function () {
          var db = rq.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { reject(rq.error || new Error("idb-open-error")); };
      } catch (e) { reject(e); }
    });
    return _dbPromise;
  }

  // Lit une valeur (objet structuré, pas de JSON.parse nécessaire). → Promise<val|null>
  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
          rq.onsuccess = function () { resolve(rq.result == null ? null : rq.result); };
          rq.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  // Écrit une valeur (structured clone, sans sérialisation manuelle). → Promise<bool>
  function idbPut(key, val) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(val, key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
          tx.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }

  // API conversations
  window.idbConvLoad = function () { return idbGet("conversations_v1"); };
  window.idbConvSave = function (arr) {
    // Stocke une copie « plate » (structured clone échoue sur les objets non clonables) ;
    // on passe par JSON pour neutraliser d'éventuelles références non sérialisables.
    var safe;
    try { safe = JSON.parse(JSON.stringify(arr || [])); } catch (e) { return Promise.resolve(false); }
    return idbPut("conversations_v1", safe);
  };
  // Exposé pour debug/maintenance éventuelle
  window.idbConvClear = function () { return idbPut("conversations_v1", []); };
})();

// ════════════════════════════════════════════════════════════════════════
// Navigation produit temporaire — CDV devient une fonctionnalité SECONDAIRE
// de la passion Voyage (2026-08-19).
//
// Important : rien n'est supprimé. #screen-cdv, goTo("cdv"), les données,
// migrations et tests restent intacts. On retire uniquement le raccourci de la
// barre principale et on ajoute un accès contextualisé dans Passion > Voyage.
// Ce bloc est volontairement réversible pendant les essais produit.
// ════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  function demoteCdvFromMainNav() {
    var entry = document.querySelector('#appNav .nav-item[data-screen="cdv"]');
    if (!entry) return;
    entry.style.display = "none";
    entry.setAttribute("aria-hidden", "true");
    entry.setAttribute("data-secondary-feature", "voyage-cdv");
  }

  function installVoyageEntry() {
    if (typeof window.openPassionExplorer !== "function") return;
    if (window.openPassionExplorer._passioVoyageCdvWrapped) return;

    var original = window.openPassionExplorer;
    var wrapped = function (pid) {
      original.apply(this, arguments);
      if (pid !== "voyage") return;

      var modal = document.getElementById("modalContent");
      if (!modal || modal.querySelector("[data-voyage-cdv-entry]")) return;

      var block = document.createElement("div");
      block.setAttribute("data-voyage-cdv-entry", "1");
      block.style.cssText = "margin:12px 0 16px;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--bg-card);";
      block.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
          '<div style="font-size:28px;line-height:1;">📔</div>' +
          '<div style="min-width:0;flex:1;">' +
            '<div style="font-size:14px;font-weight:800;color:var(--text);">Carnets de voyage</div>' +
            '<div style="font-size:11px;line-height:1.45;color:var(--muted);margin-top:2px;">Fonction secondaire de la passion Voyage · carnets, étapes et voyages en direct.</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn primary block" data-open-voyage-cdv="1">Ouvrir mes carnets de voyage</button>';

      var firstSection = modal.querySelector(".section-title");
      if (firstSection) modal.insertBefore(block, firstSection);
      else modal.appendChild(block);

      var button = block.querySelector("[data-open-voyage-cdv]");
      if (button) {
        button.addEventListener("click", function () {
          if (typeof window.closeModal === "function") window.closeModal();
          if (typeof window.goTo === "function") window.goTo("cdv");
          try {
            if (window.tel && typeof window.tel.action === "function") {
              window.tel.action("secondary_feature_open", { feature: "cdv", passion: "voyage" });
            }
          } catch (_) {}
        });
      }
    };

    wrapped._passioVoyageCdvWrapped = true;
    window.openPassionExplorer = wrapped;
  }

  function bootSecondaryVoyageFeature() {
    demoteCdvFromMainNav();
    installVoyageEntry();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootSecondaryVoyageFeature, { once: true });
  } else {
    bootSecondaryVoyageFeature();
  }
})();
