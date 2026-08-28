// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V4 — lot UI-4A1 : raccord des intentions de « Rencontrer ».
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §8 et §15,
// ordre « ORDRE ACTUEL — lancer uniquement UI-4A1 » (issue #165).
//
// UI-4A0 a posé la tête de l'écran IRL et tient l'état des quatre intentions
// EN MÉMOIRE, sans effet sur la liste. Ce lot-ci, et rien d'autre, branche ces
// intentions sur le moteur historique de `js/app-07-ia-explore-irl.js` :
//
//   • « Cette semaine » pilote UNIQUEMENT la valeur "week" de `irlDateFilters`.
//     Les autres dates choisies dans le panneau détaillé ne sont pas touchées ;
//   • « Mes Passio » ajoute exactement `_irlMyPassions()` dans
//     `irlPassionFilters`, après avoir photographié le choix détaillé antérieur,
//     restauré tel quel à l'extinction ;
//   • « Ma ville » pose le prédicat ville `setIrlCityIntent(...)`. S'il n'y a
//     aucune ville sélectionnée, elle ouvre le sélecteur HISTORIQUE
//     (`openIrlCitySelector`) et reste INACTIVE jusqu'au choix — jamais de GPS.
//
// Tout changement passe par le MÊME `renderIRL()` et le même tableau
// d'événements : aucun second moteur, aucune copie de la liste, aucun tri neuf.
// La sémantique combinée est celle du moteur : OU à l'intérieur des dates et
// des passions, ET entre « semaine », « ville » et « Passio ».
//
// ⚠️ Le prédicat ville n'existait PAS avant ce lot : `irlSelectedCity` ne
// servait que de point de référence (centrage de carte, distances, tri « le
// plus proche »). Il a donc fallu l'ajouter — dans le pipeline commun
// `_filterIrlEvents`, pas ici, pour que la liste et les marqueurs de la carte
// ne divergent jamais.
//
// ── Snapshot et soupape ───────────────────────────────────────────────────
// À l'activation, une copie bornée de `irlDateFilters`, `irlPassionFilters`, de
// la ville sélectionnée et du prédicat ville est prise UNE fois. Couper le lot
// en session défait NOS effets par rapport à cette copie, puis relance le même
// rendu : l'aperçu ne laisse aucun filtre de démonstration dans l'écran
// historique. Trois nuances assumées :
//   ① la restitution est faite valeur par valeur, jamais en bloc : réécrire les
//      Sets entiers effacerait une date ou une passion choisie dans le panneau
//      détaillé APRÈS l'activation, que le snapshot ne peut pas connaître ;
//   ② la ville sélectionnée est photographiée mais JAMAIS réécrite — ce module
//      ne la modifie pas (seul le sélecteur historique le fait, sur geste
//      explicite) ; la restaurer ne pourrait qu'annuler un choix humain ;
//   ③ `clearAllIrlFilters()` est un geste explicite : le vide DEVIENT le neutre,
//      le snapshot est abandonné et ne ressuscite plus à la coupure.
//
// ⚠️ Le module n'écrit RIEN de durable : ni Supabase, ni `state`, ni
// `localStorage`. Il ne modifie que des états de filtrage en mémoire, tous
// remis en place à la coupure.
//
// ── Activation — ACTIF PAR DÉFAUT (2026-08-28) ────────────────────────────
//     localStorage.passio_ui_4a1 = "0"    → kill switch local, prioritaire
//     window.PASSIO_UI_4A1 = false        → coupure immédiate en mémoire
//
// Mis en ligne sur l'URL normale par décision de Benjamin, en même temps que
// UI-4A0, UI-4A2 et UI-4B. Les anciens liens `?passio_preview=passio-ui-4a1`
// restent tolérés mais ne décident plus rien.
//
// Couper UI-4A0 coupe TOUJOURS ce lot : sans la tête, il n'y a aucune chip à
// raccorder, et l'écran historique doit revenir entier, filtres compris. C'est
// ce que fait `actif()`, qui interroge la tête à chaque décision.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var PREVIEW_NAME = "passio-ui-4a1";
  var DEMO_PREVIEW_NAME = "passio-ui-4a1-demo";
  var STORAGE_KEY = "passio_ui_4a1";
  var ROOT_CLASS = "passio-ui-4a1";
  var VERSION = "ui4a1";

  var SEMAINE = "semaine", VILLE = "ville", PASSIO = "passio";
  var DATE_SEMAINE = "week";   // valeur historique EXACTE de `irlDateFilters`

  var snapshot = null;         // état historique, capturé une seule fois
  var passionsAvant = null;    // choix détaillé antérieur à « Mes Passio »
  var passionsAjoutees = [];   // ce que « Mes Passio » a réellement ajouté
  var passioOn = false;
  var villeEnAttente = false;  // « Ma ville » demandée, ville pas encore choisie
  var applique = [];           // dernières intentions réellement appliquées

  var enveloppeRender = false, renderIRLOriginal = null;
  var enveloppeClear = false, clearOriginal = null;
  var ecouteursPoses = false;
  var enApply = false;

  // ══════════════════════════════════════════════════════════════════════════
  // DRAPEAU
  // Ordre de priorité : coupure mémoire > kill switch local > aperçu > éteint.
  // ⚠️ `uiV4a1Enabled` ne consulte JAMAIS `PassioUIV4A0.isEnabled()` : c'est
  // l'inverse qui a lieu (la tête demande à ses héritiers). Une consultation
  // croisée créerait une récursion infinie.
  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ ACTIF PAR DÉFAUT depuis la mise en ligne du 2026-08-28, décidée par
  // Benjamin. Le drapeau ne sait plus qu'ENLEVER : `PREVIEW_NAME` et
  // `DEMO_PREVIEW_NAME` n'apparaissent plus dans cette fonction — les anciens
  // liens `?passio_preview=…` restent tolérés mais ne décident plus rien, et
  // aucune valeur positive n'est écrite dans `localStorage`. Les deux coupures
  // priment sur tout et rendent l'écran historique sans rechargement.
  function uiV4a1Enabled() {
    if (window.PASSIO_UI_4A1 === false) return false;   // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;                   // kill switch local
    return true;
  }

  function tete() { return window.PassioUIV4A0 || null; }

  // Effectivement actif : sans la tête, il n'y a aucune chip à raccorder — et
  // couper UI-4A0 en session doit rendre l'écran historique COMPLET, filtres
  // compris.
  function actif() {
    if (!uiV4a1Enabled()) return false;
    var t = tete();
    if (!t || typeof t.isEnabled !== "function") return false;
    try { return !!t.isEnabled(); } catch (e) { fail("tete", e); return false; }
  }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  // Un `catch` muet sur un chemin de décision masque un ReferenceError. Tout
  // échec est audible, et strictement TECHNIQUE : aucun nom de ville, aucun
  // titre, aucun identifiant de personne.
  function fail(ou, err) {
    var msg = "ui_v4a1 (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[ui-v4a1] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "ui_v4a1_intentions", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  // Métadonnées AUTORISÉES : version, identifiant d'intention et compte, tous
  // des constantes techniques de ce fichier. Aucun texte libre, aucun contenu.
  function track(name, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") {
        window.tel.action(name, meta || { v: VERSION });
      }
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCÈS AU MOTEUR HISTORIQUE
  // `irlPassionFilters` et `irlSelectedCity` sont des `let` de app-07 : ils
  // n'existent pas sur `window`, et le premier est REMPLACÉ le temps d'un calcul
  // dans `renderIrlPassionTiles`. On passe donc par les accesseurs du moteur, et
  // on relit à chaud — jamais de référence capturée.
  // ══════════════════════════════════════════════════════════════════════════
  function moteurPret() {
    return typeof window.renderIRL === "function"
      && typeof window.irlPassionFilterSet === "function"
      && typeof window.setIrlCityIntent === "function"
      && typeof window.irlCityIntentName === "function"
      && typeof window.irlSelectedCityName === "function";
  }

  function dates() { return window.irlDateFilters || null; }

  function passions() {
    try { return window.irlPassionFilterSet(); } catch (e) { fail("passions", e); return null; }
  }

  function nomVille() {
    try { return window.irlSelectedCityName() || ""; } catch (e) { fail("ville", e); return ""; }
  }

  function predicatVille() {
    try { return window.irlCityIntentName() || ""; } catch (e) { fail("predicat", e); return ""; }
  }

  function poserPredicatVille(nom) {
    try { window.setIrlCityIntent(nom || ""); } catch (e) { fail("predicat_set", e); }
  }

  function mesPassions() {
    try {
      var l = (typeof window._irlMyPassions === "function") ? window._irlMyPassions() : [];
      return Array.isArray(l) ? l.filter(Boolean) : [];
    } catch (e) { fail("mes_passions", e); return []; }
  }

  function rendre() {
    try { if (typeof window.renderIRL === "function") window.renderIRL(); }
    catch (e) { fail("rendu", e); }
  }

  function listeDe(set) {
    var out = [];
    if (!set || typeof set.forEach !== "function") return out;
    set.forEach(function (v) { out.push(v); });
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SNAPSHOT — une seule capture, à l'activation
  // ══════════════════════════════════════════════════════════════════════════
  function capturerSnapshot() {
    if (snapshot || !moteurPret()) return;
    snapshot = {
      dates: listeDe(dates()),
      passions: listeDe(passions()),
      ville: nomVille(),          // photographiée, jamais réécrite (cf. en-tête)
      predicatVille: predicatVille(),
    };
  }

  function oublierMemoire() {
    snapshot = null;
    passionsAvant = null;
    passionsAjoutees = [];
    passioOn = false;
    villeEnAttente = false;
    applique = [];
  }

  // Retire « Mes Passio » : on supprime EXACTEMENT les identifiants que l'on a
  // ajoutés, pas le contenu du Set. Remplacer le Set par l'instantané effacerait
  // une passion cochée dans le panneau détaillé APRÈS l'activation de la chip —
  // exactement ce que l'ordre interdit.
  function retirerMesPassio() {
    var p = passions();
    if (p) for (var i = 0; i < passionsAjoutees.length; i++) p.delete(passionsAjoutees[i]);
    passionsAjoutees = [];
    passionsAvant = null;
    passioOn = false;
  }

  // Coupure : on défait NOS effets, valeur par valeur, et on remet le prédicat
  // ville tel qu'il était. Le snapshot sert de référence pour ce qui nous
  // appartient ; il ne réécrit jamais en bloc un état que l'utilisateur a pu
  // changer depuis, ni la ville sélectionnée (que ce module ne pose jamais).
  function restaurerSnapshot() {
    if (!snapshot) { oublierMemoire(); return; }
    var copie = snapshot;
    var avaitSemaine = applique.indexOf(SEMAINE) !== -1;
    try {
      if (moteurPret()) {
        var d = dates();
        if (d) {
          if (copie.dates.indexOf(DATE_SEMAINE) !== -1) d.add(DATE_SEMAINE);
          else if (avaitSemaine) d.delete(DATE_SEMAINE);
        }
        retirerMesPassio();
        poserPredicatVille(copie.predicatVille);
      }
    } catch (e) { fail("restauration", e); }
    oublierMemoire();
    var t = tete();
    if (t && typeof t.setIntents === "function") { try { t.setIntents([]); } catch (e) { fail("chips_reset", e); } }
    rendre();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // APPLICATION DES INTENTIONS
  // Un toggle ne modifie que les valeurs qu'il POSSÈDE : "week" pour la date,
  // les passions de `_irlMyPassions()` pour les Passio, le prédicat ville pour
  // la ville. Un choix détaillé venu du panneau historique n'est jamais effacé
  // en silence.
  // ══════════════════════════════════════════════════════════════════════════
  function appliquerIntentions(voulu) {
    if (!moteurPret()) return;
    var demande = Array.isArray(voulu) ? voulu.slice() : [];
    var veut = function (id) { return demande.indexOf(id) !== -1; };
    var avait = function (id) { return applique.indexOf(id) !== -1; };

    // ① Cette semaine — la seule valeur touchée est "week".
    var d = dates();
    if (d) {
      if (veut(SEMAINE)) d.add(DATE_SEMAINE);
      else if (avait(SEMAINE)) d.delete(DATE_SEMAINE);
    }

    // ② Mes Passio — instantané borné avant d'écrire, restitué à l'extinction.
    var p = passions();
    if (p) {
      if (veut(PASSIO) && !passioOn) {
        passionsAvant = listeDe(p);
        passionsAjoutees = [];
        var miennes = mesPassions();
        for (var i = 0; i < miennes.length; i++) {
          if (p.has(miennes[i])) continue;      // déjà choisie : elle ne nous
          p.add(miennes[i]);                    // appartient pas, on n'y touchera
          passionsAjoutees.push(miennes[i]);    // pas à l'extinction
        }
        passioOn = true;
      } else if (!veut(PASSIO) && passioOn) {
        retirerMesPassio();
      }
    }

    // ③ Ma ville — jamais de GPS. Sans ville choisie, on ouvre le sélecteur
    //    historique et l'intention reste inactive jusqu'au choix.
    if (veut(VILLE)) {
      var nom = nomVille();
      if (nom) {
        poserPredicatVille(nom);
        villeEnAttente = false;
      } else {
        poserPredicatVille("");
        villeEnAttente = true;
        demande = demande.filter(function (id) { return id !== VILLE; });
        try {
          if (typeof window.openIrlCitySelector === "function") window.openIrlCitySelector();
        } catch (e) { fail("selecteur_ville", e); }
      }
    } else {
      poserPredicatVille("");
      villeEnAttente = false;
    }

    applique = demande;
    poserChips(applique);
    rendre();
    track("ui_v4a1_intents", { v: VERSION, n: applique.length });
  }

  function poserChips(liste) {
    var t = tete();
    if (!t || typeof t.setIntents !== "function") return;
    try { t.setIntents(liste || []); } catch (e) { fail("chips", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESYNCHRONISATION — les chips disent l'état RÉEL du moteur
  // Appelée après chaque rendu : « Tout afficher », une date décochée dans le
  // panneau détaillé ou un choix de ville doivent se voir dans la tête.
  // ══════════════════════════════════════════════════════════════════════════
  function intentionsDuMoteur() {
    var out = [];
    var d = dates();
    if (d && d.has(DATE_SEMAINE)) out.push(SEMAINE);
    if (predicatVille()) out.push(VILLE);
    var p = passions();
    if (passioOn && p && p.size) out.push(PASSIO);
    else if (passioOn && (!p || !p.size)) {
      // Le panneau détaillé (ou « Tout afficher ») a vidé les passions : la chip
      // ne peut plus prétendre restreindre quoi que ce soit.
      passioOn = false; passionsAvant = null; passionsAjoutees = [];
    }
    return out;
  }

  function syncDepuisMoteur() {
    if (!actif() || !moteurPret()) return;
    // « Ma ville » était en attente et une ville vient d'être choisie dans le
    // sélecteur historique : l'intention prend effet, sans second geste. Le
    // rendu est différé (setTimeout, jamais requestAnimationFrame : une page qui
    // ne compose pas de frame ne le déclencherait pas — piège payé au lot UI-3A)
    // et se termine forcément, `villeEnAttente` étant déjà retombé.
    if (villeEnAttente) {
      var nom = nomVille();
      if (nom) {
        villeEnAttente = false;
        poserPredicatVille(nom);
        applique = intentionsDuMoteur();
        poserChips(applique);
        setTimeout(rendre, 0);
        return;
      }
    }
    applique = intentionsDuMoteur();
    poserChips(applique);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENVELOPPES
  // Posées PAR-DESSUS celle d'UI-4A0 (la tête s'applique avant nous), retirées
  // à la coupure. Chacune conserve la fonction d'origine et la remet telle
  // quelle.
  // ══════════════════════════════════════════════════════════════════════════
  function poserEnveloppeRender() {
    if (enveloppeRender) return;
    if (typeof window.renderIRL !== "function") return;
    if (window.renderIRL._v4a1 || renderIRLOriginal) { enveloppeRender = true; return; }
    renderIRLOriginal = window.renderIRL;
    var enveloppe = function () {
      var r = renderIRLOriginal.apply(this, arguments);
      if (actif()) {
        try { setTimeout(syncDepuisMoteur, 0); } catch (e) { fail("sync_post_rendu", e); }
      }
      return r;
    };
    enveloppe._v4a1 = true;
    window.renderIRL = enveloppe;
    enveloppeRender = true;
  }

  function poserEnveloppeClear() {
    if (enveloppeClear) return;
    if (typeof window.clearAllIrlFilters !== "function") return;
    if (window.clearAllIrlFilters._v4a1 || clearOriginal) { enveloppeClear = true; return; }
    clearOriginal = window.clearAllIrlFilters;
    var enveloppe = function () {
      // Geste utilisateur explicite : le vide devient le NEUTRE. On abandonne le
      // snapshot (il ne doit jamais ressusciter à la coupure) et nos mémoires
      // bornées ; le moteur, lui, remet aussi le prédicat ville à vide.
      if (actif()) {
        snapshot = { dates: [], passions: [], ville: nomVille(), predicatVille: "" };
        passionsAvant = null;
        passionsAjoutees = [];
        passioOn = false;
        villeEnAttente = false;
        applique = [];
      }
      return clearOriginal.apply(this, arguments);
    };
    enveloppe._v4a1 = true;
    window.clearAllIrlFilters = enveloppe;
    enveloppeClear = true;
  }

  // ⚠️ Les fonctions d'origine ne sont oubliées QUE si l'enveloppe a réellement
  // été retirée. Si un lot ultérieur enveloppait par-dessus, la nôtre resterait
  // dans la chaîne : l'oublier ferait planter l'appel suivant sur un
  // `null.apply`. Elle devient simplement inerte (`actif()` étant faux).
  function retirerEnveloppes() {
    if (enveloppeRender && renderIRLOriginal && window.renderIRL && window.renderIRL._v4a1) {
      window.renderIRL = renderIRLOriginal;
      renderIRLOriginal = null;
    }
    enveloppeRender = false;
    if (enveloppeClear && clearOriginal && window.clearAllIrlFilters && window.clearAllIrlFilters._v4a1) {
      window.clearAllIrlFilters = clearOriginal;
      clearOriginal = null;
    }
    enveloppeClear = false;
  }

  function poserEcouteurs() {
    if (ecouteursPoses) return;
    window.addEventListener("passio:ui4a0-intents", function (ev) {
      if (!actif()) return;
      try {
        var d = (ev && ev.detail && Array.isArray(ev.detail.intents)) ? ev.detail.intents : [];
        appliquerIntentions(d);
      } catch (e) { fail("intentions", e); }
    });
    // La tête vient d'être posée ou retirée (kill switch UI-4A0 compris) : on
    // s'aligne, ce qui restaure le snapshot quand elle disparaît.
    window.addEventListener("passio:ui4a0-apply", function () {
      try { apply(); } catch (e) { fail("apply_tete", e); }
    });
    ecouteursPoses = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVATION / COUPURE
  // ══════════════════════════════════════════════════════════════════════════
  function apply() {
    if (enApply) return actif();          // la tête nous rappelle pendant notre
    enApply = true;                       // propre application : une seule passe
    var on = false;
    try {
      on = actif();
      var root = document.documentElement;
      if (!on) {
        root.classList.remove(ROOT_CLASS);
        // Nos enveloppes d'abord : celle d'UI-4A0 se retrouve alors au sommet de
        // la chaîne et peut se démonter proprement. Ensuite seulement, on lui
        // demande de se réévaluer — sans l'aperçu d'un héritier, la tête s'en va.
        retirerEnveloppes();
        var t = tete();
        if (t && typeof t.apply === "function") {
          try { t.apply(); } catch (e) { fail("tete_off", e); }
        }
        restaurerSnapshot();
        return false;
      }
      root.classList.add(ROOT_CLASS);
      poserEcouteurs();
      capturerSnapshot();
      poserEnveloppeRender();
      poserEnveloppeClear();
      syncDepuisMoteur();
      return true;
    } catch (e) { fail("apply", e); return on; }
    finally { enApply = false; }
  }

  // ⚠️ En PRODUCTION, le bloc app sort dans `app.js`, injecté seulement une fois
  // le code d'accès franchi : au premier `boot()`, ni `renderIRL` ni les
  // accesseurs du moteur n'existent. On repasse donc à `passio:app-ready`, avec
  // une reprise bornée par `setTimeout` en secours (jamais de boucle infinie,
  // jamais de `requestAnimationFrame`).
  var essais = 0;
  function boot() {
    try {
      // La tête d'abord : nos enveloppes doivent se poser PAR-DESSUS les
      // siennes, et elle doit exister pour porter les chips.
      var t = tete();
      if (t && typeof t.apply === "function" && uiV4a1Enabled()) {
        try { t.apply(); } catch (e) { fail("tete_apply", e); }
      }
      var on = apply();
      if (on && !enveloppeRender && essais++ < 80) setTimeout(boot, 150);
    } catch (e) { fail("boot", e); }
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste
  // vert). `isEnabled` est la version PURE, celle que la tête interroge.
  window.PassioUIV4A1 = {
    PREVIEW_NAME: PREVIEW_NAME,
    DEMO_PREVIEW_NAME: DEMO_PREVIEW_NAME,
    isEnabled: uiV4a1Enabled,
    isActive: actif,
    apply: apply,
    refresh: syncDepuisMoteur,
    intents: function () { return applique.slice(); },
  };

  window.addEventListener("passio:app-ready", function () {
    essais = 0;
    boot();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
