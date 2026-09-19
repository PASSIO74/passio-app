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

  // ─── RÉFÉRENTIEL DES PASSIONS (2026-09-19) ─────────────────────────────────
  // `data/passions-v1.json` pèse **568 ko** pour 5 001 passions, et il est
  // retéléchargé à chaque session : le service worker ne le pré-cache pas
  // (constat écrit dans passions-flat.js). C'est le plus gros transfert de
  // l'application après `app.js`, pour un fichier qui ne change QU'AU
  // DÉPLOIEMENT — `scripts/build.js` le recopie tel quel dans `dist/`.
  //
  // ⚠️ LA CLÉ DE FRAÎCHEUR EST LA RELEASE, PAS UNE DURÉE. Un TTL devine ; la
  // release SAIT : même commit déployé ⇒ même fichier, par construction. Et
  // comme l'empreinte est stockée AVEC le paquet, un déploiement invalide le
  // cache tout seul, sans rien à purger. Hors artefact (`npm run serve`, bancs),
  // `window.PASSIO_RELEASE` est absent → `releaseCourante()` rend "" → RIEN
  // n'est ni lu ni écrit, et le comportement d'avant tient à l'octet près.
  //
  // ⚠️ ON NE CACHE JAMAIS UN REPLI HORS LIGNE. `repliHorsLigne()` fabrique ses
  // entrées depuis le socle embarqué (19 passions) : le mettre en cache
  // installerait un référentiel tronqué pour tous les démarrages suivants, sur
  // une simple coupure réseau d'une seconde. C'est la faute exacte du 2026-09-10
  // (« le rejeu RÉTRÉCISSAIT la liste blanche des passions »), et l'appelant la
  // garde en refusant d'appeler `idbPassionsSave` sur ce chemin.
  // ⚠️ MÊME LECTURE QUE `versionApp()` (telemetry.js), Y COMPRIS
  // `PASSIO_APP_VERSION` — qui manquait ici au premier jet (relevé par
  // `audit-passio`). Deux lectures du même contrat de release finissent par
  // désigner deux versions, et c'est alors le cache qui se croit frais sur une
  // version qui a changé. On ne peut pas appeler `versionApp` : telemetry.js est
  // chargé APRÈS ce fichier et n'expose pas la fonction — d'où la copie, dite en
  // clair plutôt que subie.
  // ⚠️ LES DEUX CHAMPS SONT CONCATÉNÉS, JAMAIS L'UN *OU* L'AUTRE. Le premier jet
  // rendait `PASSIO_APP_VERSION` SEUL quand il était posé — ce qui aligne bien la
  // lecture sur `versionApp()` (telemetry.js), mais transforme un champ
  // d'ÉTIQUETTE en clé de cache. Rien ne le pose côté client aujourd'hui ; le
  // jour où quelqu'un y écrit une version produit stable (« 2026.10.0 »), la clé
  // CESSE DE CHANGER AU DÉPLOIEMENT et le référentiel est figé à travers les
  // releases — exactement le défaut que le cache est censé éviter. En les
  // concaténant, la clé change dès que l'un des deux bouge : aucune valeur
  // stable ne peut plus la geler, et l'alignement avec le contrat de release est
  // conservé.
  function releaseCourante() {
    var bouts = [];
    try {
      if (window.PASSIO_APP_VERSION) bouts.push(String(window.PASSIO_APP_VERSION).slice(0, 24));
      var r = window.PASSIO_RELEASE;
      if (r && typeof r.commit === "string" && /^[0-9a-f]{7,40}$/i.test(r.commit)) bouts.push(r.commit.slice(0, 8));
      else if (r && typeof r.buildId === "string" && r.buildId) bouts.push("b" + r.buildId.slice(0, 8));
    } catch (e) {}
    return bouts.join("-").slice(0, 40);
  }
  window.idbPassionsRelease = releaseCourante;

  // Rend le paquet SEULEMENT s'il a été écrit par la release servie ; sinon null
  // (l'appelant part sur le réseau, comme avant).
  window.idbPassionsLoad = function () {
    var rel = releaseCourante();
    if (!rel) return Promise.resolve(null);
    return idbGet("passions_v1").then(function (rec) {
      if (!rec || rec.release !== rel || !rec.paquet) return null;
      // Une entrée dont la forme ne tient pas est traitée comme absente : un
      // cache corrompu ne doit jamais valoir mieux qu'une absence de cache.
      var pq = rec.paquet;
      if (!pq || !Array.isArray(pq.passions) || !pq.passions.length) return null;
      return pq;
    }).catch(function () { return null; });
  };

  window.idbPassionsSave = function (paquet) {
    var rel = releaseCourante();
    if (!rel || !paquet || !Array.isArray(paquet.passions) || !paquet.passions.length) return Promise.resolve(false);
    var safe;
    try { safe = JSON.parse(JSON.stringify(paquet)); } catch (e) { return Promise.resolve(false); }
    return idbPut("passions_v1", { release: rel, paquet: safe });
  };
  window.idbPassionsClear = function () { return idbPut("passions_v1", null); };
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
