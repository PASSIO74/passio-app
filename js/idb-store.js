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

  // ⚠️ DEUX PIÈGES SAFARI, TOUS DEUX SILENCIEUX (corrigés le 2026-09-02).
  //
  // ① `indexedDB.open()` peut n'émettre NI `onsuccess` NI `onerror` sur WebKit —
  //    défaut connu, surtout au tout premier chargement d'une PWA installée et au
  //    retour depuis le cache de page. La promesse ne se règle alors JAMAIS.
  // ② Comme elle était mémorisée pour toute la session, cette promesse morte
  //    était rendue à CHAQUE appel suivant : plus une seule lecture, plus une
  //    seule écriture du store durable jusqu'au rechargement. Les conversations
  //    ne vivaient plus que dans localStorage — c'est-à-dire jusqu'au premier
  //    dépassement de quota, ou jusqu'à la purge ITP au bout de sept jours.
  //
  // Remède : un délai maximal, et surtout on NE MÉMORISE PAS un échec — la
  // tentative suivante rouvre. Une panne transitoire ne condamne plus la session.
  var OPEN_TIMEOUT_MS = 3000;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    var p = new Promise(function (resolve, reject) {
      var fini = false;
      var minuteur = setTimeout(function () {
        if (fini) return;
        fini = true;
        reject(new Error("idb-open-timeout"));
      }, OPEN_TIMEOUT_MS);
      function ok(v) { if (fini) return; fini = true; clearTimeout(minuteur); resolve(v); }
      function ko(e) { if (fini) return; fini = true; clearTimeout(minuteur); reject(e); }
      try {
        if (typeof indexedDB === "undefined" || !indexedDB) { ko(new Error("no-idb")); return; }
        var rq = indexedDB.open(DB_NAME, VERSION);
        rq.onupgradeneeded = function () {
          var db = rq.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = function () { ko(rq.error || new Error("idb-open-error")); };
        // `onblocked` : une autre page tient une version antérieure. Sans ce
        // gestionnaire l'ouverture reste en attente indéfiniment.
        rq.onblocked = function () { ko(new Error("idb-blocked")); };
      } catch (e) { ko(e); }
    });
    _dbPromise = p;
    p.catch(function () { if (_dbPromise === p) _dbPromise = null; });
    return p;
  }

  // Lit une valeur (objet structuré, pas de JSON.parse nécessaire).
  // → Promise<val>            valeur trouvée
  // → Promise<null>           la clé n'existe pas — le store est VRAIMENT vide
  // → Promise<undefined>      LECTURE IMPOSSIBLE (base fermée, erreur, délai)
  //
  // ⚠️ La distinction entre les deux derniers cas est le sujet. Avant, un échec
  // de lecture rendait `null`, exactement comme un store vide — et l'appelant
  // (hydrateConvsFromIDB) en concluait « première fois » puis ÉCRASAIT le store
  // durable avec ce qu'il avait sous la main. Sur iPhone, où localStorage peut
  // avoir été purgé par l'ITP au bout de sept jours pendant qu'IndexedDB, lui,
  // survivait, une simple erreur passagère effaçait donc l'historique complet
  // des conversations. Un échec doit se dire, jamais se confondre avec un vide.
  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
          rq.onsuccess = function () { resolve(rq.result == null ? null : rq.result); };
          rq.onerror = function () { resolve(undefined); };
        } catch (e) { resolve(undefined); }
      });
    }).catch(function () { return undefined; });
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

// ⚠️ LE BLOC « CDV, FONCTIONNALITÉ SECONDAIRE DE LA PASSION VOYAGE » A ÉTÉ
// RETIRÉ (refonte multi-passion, §6). Il faisait deux choses, toutes deux
// devenues sans objet : masquer l'entrée « CDV » de la barre de navigation
// (l'entrée n'existe plus dans le balisage) et injecter un bouton « Ouvrir mes
// carnets de voyage » dans l'explorateur de la passion Voyage (il ouvrait un
// écran supprimé).
//
// ⚠️ Il ENVELOPPAIT `window.openPassionExplorer`. Retirer l'enveloppe rend la
// fonction d'origine intacte — c'était sa seule modification de comportement.
