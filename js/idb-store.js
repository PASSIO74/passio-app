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
