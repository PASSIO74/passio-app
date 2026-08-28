// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-5 : « Bobines connectées au réel »
// (§7 et §15 de docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md)
// ──────────────────────────────────────────────────────────────────────────
// « Une Bobine est un format de découverte, pas une destination indépendante
//  ni une machine à temps de visionnage. »  — §7
//
// Ce module ajoute UNE rangée d'actions à chaque bobine du viewer, et rien
// d'autre. Il ne crée AUCUN moteur : les trois sorties vers le réel sont
// exactement celles de la passerelle UI-3A, appelées par sa surface publique
// (`PassioUIV3.seeActivities` / `.discoverPeople` / `.proposeOuting`), et
// l'ouverture d'une activité passe par `PassioUIV3.openActivity`, qui sait
// déjà refuser une référence introuvable au lieu de basculer sur une autre.
//
// Deux branches, EXCLUSIVES, décidées par `PassioUIV3.eventRefOf` — la même
// règle canonique que le Feed (eventId / event_id / sharedReelData) :
//   ① la bobine est reliée à une activité  → un seul lien « Voir l'activité »,
//      conformément au §7 (« la fiche de l'activité correspondante est
//      affichée directement ») ;
//   ② sinon → « Ça m'intrigue », « Découvrir cette Passio »,
//      « À vivre près de moi », « Proposer une sortie ». PASSIO ne fabrique
//      jamais d'événement qui n'existe pas.
//
// ⚠️ POURQUOI ON FERME LE VIEWER AVANT TOUTE SORTIE. Le viewer est en
// `z-index: 9999` (styles.css). Or `toast()` est à 200, la fiche d'activité
// `#eventDetailPage` à 200, et la feuille basse d'UI-3 à 1200 : ouvertes
// par-dessus, elles seraient DANS LE DOM ET INVISIBLES. Seule la couche des
// modales (10001) passerait au-dessus. Plutôt que de retenir quelle surface
// monte et laquelle non, le module applique UNE règle sans exception —
// `closeReels()` d'abord, puis la sortie 80 ms plus tard. C'est exactement le
// geste que `_openReelAuthor` documente déjà dans app-05, pour la même raison.
// Effet de bord voulu : « retour Feed stable » (§15) devient vrai, l'écran
// d'arrivée n'est jamais empilé sous une bobine encore ouverte.
//
// ⚠️ POURQUOI UN MutationObserver, ET PAS UNE ENVELOPPE DE FONCTION.
// `openReels()` fait `#reelsList.innerHTML = …` : toute décoration tierce est
// effacée à CHAQUE ouverture, et `openReelById()` rouvre le viewer. Un appel
// unique après `openReels` manquerait aussi les rendus déclenchés ailleurs.
// L'observateur voit tout, y compris ses propres écritures — d'où le marqueur
// d'idempotence posé sur `.reel-item`.
//
// ⚠️ « Ça m'intrigue » N'EST PAS UN BOUTON DÉCORATIF. Le signal est posé sur la
// PASSION (pas sur la bobine seule : c'est la seule granularité que les
// moteurs existants savent consommer) dans `state.user.passionSignals`, et il
// pèse réellement dans `feedPostScore` (app-02, bloc affinité). 100 % local,
// réversible, borné — la direction §7 l'autorise mot pour mot : « la
// personnalisation peut rester simple, locale et explicable ».
//
// Coupures, prioritaires sur tout, dans cet ordre :
//   window.PASSIO_UI_5 === false   ·   localStorage.passio_ui_5 === "0"
// Le drapeau ne sait qu'ENLEVER : aucune valeur positive n'active, rien n'est
// écrit dans localStorage.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = 1;
  var CLASSE_RACINE = "passio-ui-5";
  var MARQUEUR = "data-v5";
  var CLASSE_RANGEE = "v5-actions";
  var SIGNAUX_MAX = 200;      // le blob user_state part EN ENTIER à chaque sync

  // Un échec reproductible ne doit pas boucler : on écrit dans ce que l'on
  // observe. Le verrou n'est relevé que par une réactivation explicite.
  var enPanne = false;
  var observateur = null;
  var enAttente = false;
  var essais = 0;

  // ── Drapeau ───────────────────────────────────────────────────────────────
  function actif() {
    try { if (window.PASSIO_UI_5 === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_5") === "0") return false; } catch (e) {}
    return true;
  }

  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v5] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v5 " + etape);
    } catch (x) {}
  }

  function track(nom, meta) {
    // ⚠️ Le filtre PII de js/telemetry.js rejette toute clé contenant « pass » :
    // `has_psn`, jamais `has_passion` — la donnée disparaîtrait en silence.
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  function notify(msg) {
    // Le toast est sous le viewer : on ne le montre qu'une fois fermé.
    try { if (typeof toast === "function") toast(msg); } catch (e) {}
  }

  // ── Accès à l'application, sans jamais supposer qu'elle est chargée ───────
  // ⚠️ app-01 déclare `let state = null` : `typeof state === "undefined"` est
  // FAUX et `state.user` lèverait un TypeError qui tuerait la reprise.
  function etat() {
    try {
      if (typeof state !== "undefined" && state && state.user) return state;
      if (window.state && window.state.user) return window.state;
    } catch (e) {}
    return null;
  }

  function liste() { return document.getElementById("reelsList"); }

  function bobineParId(id) {
    try {
      if (typeof findPostAnywhere === "function") return findPostAnywhere(id) || null;
    } catch (e) { fail("recherche", e); }
    return null;
  }

  // Passion d'une bobine, normalisée par le MÊME moteur que la passerelle du
  // Feed : une passion inconnue n'est pas une passion.
  function passionDe(reel) {
    try {
      if (typeof feedIrlBridgePassion === "function") return feedIrlBridgePassion(reel) || "";
    } catch (e) { fail("passion", e); }
    return "";
  }

  function libellePassion(id) {
    try {
      var meta = (typeof window.passionById === "function") ? window.passionById(id) : null;
      if (!meta) return "";
      return String(meta.label || "").trim();
    } catch (e) { return ""; }
  }

  function refActivite(reel) {
    try {
      if (window.PassioUIV3 && typeof window.PassioUIV3.eventRefOf === "function") {
        return window.PassioUIV3.eventRefOf(reel) || "";
      }
    } catch (e) { fail("ref_activite", e); }
    return "";
  }

  // ── Le signal « Ça m'intrigue » ──────────────────────────────────────────
  function signaux() {
    var st = etat();
    if (!st) return null;
    if (!st.user.passionSignals || typeof st.user.passionSignals !== "object"
        || Array.isArray(st.user.passionSignals)) st.user.passionSignals = {};
    return st.user.passionSignals;
  }

  function intrigue(passion) {
    var m = signaux();
    return !!(m && passion && m[passion]);
  }

  // Bascule le signal. On envoie l'INTENTION, jamais un état re-déduit d'une
  // lecture faite ailleurs — c'est la règle du projet sur toute écriture d'état.
  function basculerSignal(passion) {
    var m = signaux();
    if (!m || !passion) return false;
    var veut = !m[passion];
    if (veut) {
      m[passion] = Date.now();
      // Borne : le blob `user_state` part en entier à chaque synchronisation.
      var cles = Object.keys(m);
      if (cles.length > SIGNAUX_MAX) {
        cles.sort(function (a, b) { return (m[a] || 0) - (m[b] || 0); });
        for (var i = 0; i < cles.length - SIGNAUX_MAX; i++) delete m[cles[i]];
      }
    } else {
      delete m[passion];
    }
    try { if (typeof saveState === "function") saveState(); } catch (e) { fail("sauvegarde", e); }
    // Le classement du fil vient de changer : sans invalider la signature, le
    // prochain rendu serait sauté et le signal semblerait sans effet.
    try { window._feedDomSig = null; } catch (e) {}
    return veut;
  }

  // ── Sorties vers le réel ─────────────────────────────────────────────────
  // Toutes passent par la MÊME séquence : fermer le viewer, puis appeler le
  // moteur existant. Voir l'en-tête pour la raison (empilement des couches).
  function apresFermeture(fn) {
    try { if (typeof closeReels === "function") closeReels(); } catch (e) { fail("fermeture", e); }
    // Jamais requestAnimationFrame : il ne part pas sur une page qui ne compose
    // pas de frames (onglet en arrière-plan, headless, machine saturée).
    setTimeout(function () {
      try { fn(); } catch (e) { fail("sortie", e); }
    }, 80);
  }

  function moteurV3(nom) {
    try {
      var api = window.PassioUIV3;
      if (api && typeof api[nom] === "function") return api[nom];
    } catch (e) {}
    return null;
  }

  function voirActivites(passion) {
    var f = moteurV3("seeActivities");
    if (!f) { fail("moteur", "seeActivities indisponible"); return; }
    track("ui_v5_reel_irl", { v: VERSION, has_psn: !!passion });
    apresFermeture(function () { f(passion); });
  }

  function decouvrirPassio(passion) {
    var f = moteurV3("discoverPeople");
    if (!f) { fail("moteur", "discoverPeople indisponible"); return; }
    track("ui_v5_reel_passio", { v: VERSION, has_psn: !!passion });
    apresFermeture(function () { f(passion); });
  }

  function proposerSortie(passion, reelId) {
    var f = moteurV3("proposeOuting");
    if (!f) { fail("moteur", "proposeOuting indisponible"); return; }
    track("ui_v5_reel_propose", { v: VERSION, has_psn: !!passion, has_ref: !!reelId });
    apresFermeture(function () { f(passion, reelId); });
  }

  function ouvrirActivite(evId, reelId) {
    var f = moteurV3("openActivity");
    if (!f) { fail("moteur", "openActivity indisponible"); return; }
    track("ui_v5_reel_activite", { v: VERSION, has_ref: !!evId });
    apresFermeture(function () { f(evId, reelId); });
  }

  // ── Construction de la rangée ────────────────────────────────────────────
  function chip(texte, classe, onActivation) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "v5-chip" + (classe ? " " + classe : "");
    b.textContent = texte;                 // contenu d'autrui : jamais d'innerHTML
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();                 // le tap ne doit pas mettre la bobine en pause
      try { onActivation(b); } catch (x) { fail("action", x); }
    });
    return b;
  }

  function construireRangee(reel, evId, passion) {
    var row = document.createElement("div");
    row.className = CLASSE_RANGEE;
    row.setAttribute("role", "group");

    if (evId) {
      // §7 : « Si la Bobine possède un event_id, la fiche de l'activité
      // correspondante est affichée directement. » Un seul lien, rien d'autre :
      // proposer en plus « Proposer une sortie » inviterait à créer un doublon
      // de l'activité que la bobine montre déjà.
      row.setAttribute("aria-label", "Cette bobine est reliée à une activité");
      row.appendChild(chip("Voir l'activité", "v5-chip-fort", function () {
        ouvrirActivite(evId, reel.id);
      }));
      return row;
    }

    row.setAttribute("aria-label", "Prolonger cette bobine dans le réel");

    // ① Signal d'intérêt — le seul qui n'ouvre rien. État exposé par
    //    aria-pressed, et re-taper le retire (réversible, comme un like).
    var b1 = chip("Ça m'intrigue", "v5-chip-signal", null);
    b1.setAttribute("aria-pressed", intrigue(passion) ? "true" : "false");
    b1.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var pose = basculerSignal(passion);
      b1.setAttribute("aria-pressed", pose ? "true" : "false");
      b1.classList.toggle("v5-chip-actif", pose);
      track("ui_v5_reel_signal", { v: VERSION, has_psn: !!passion, on: !!pose });
    });
    b1.classList.toggle("v5-chip-actif", intrigue(passion));
    row.appendChild(b1);

    // ② Le contexte de la Passio (personnes et contenus), pas une rencontre.
    var nom = libellePassion(passion);
    row.appendChild(chip(nom ? "Découvrir " + nom : "Découvrir cette Passio", "", function () {
      decouvrirPassio(passion);
    }));

    // ③ Les activités de cette Passio — SANS demande de position : le moteur
    //    d'UI-3A pose le marqueur à usage unique que renderIRL consomme.
    row.appendChild(chip("À vivre près de moi", "", function () {
      voirActivites(passion);
    }));

    // ④ Le formulaire EXISTANT, prérempli. Aucun événement n'est créé ici.
    row.appendChild(chip("Proposer une sortie", "", function () {
      proposerSortie(passion, reel.id);
    }));

    return row;
  }

  // ── Décoration d'une bobine ──────────────────────────────────────────────
  function decorerItem(item) {
    if (!item || item.getAttribute(MARQUEUR) === "1") return;

    var id = item.getAttribute("data-post-id");
    if (!id) return;
    var reel = bobineParId(id);
    if (!reel) return;                     // bobine inconnue : on ne touche à rien

    var evId = refActivite(reel);
    var passion = evId ? "" : passionDe(reel);

    // Aucune activité reliée ET aucune passion reconnue : le lot n'a rien à
    // dire. On laisse la bobine EXACTEMENT telle quelle — surtout pas une
    // rangée vide, et surtout pas de masquage (rien n'est remplacé).
    if (!evId && !passion) return;

    var info = item.querySelector(".reel-info");
    if (!info) return;                     // gabarit inattendu : on s'abstient

    var ancienne = info.querySelector(":scope > ." + CLASSE_RANGEE);
    if (ancienne && ancienne.parentNode) ancienne.parentNode.removeChild(ancienne);

    info.appendChild(construireRangee(reel, evId, passion));
    item.setAttribute(MARQUEUR, "1");
    item.setAttribute("data-v5-kind", evId ? "activite" : "passio");
  }

  function decorer() {
    if (enPanne) return;
    var l = liste();
    if (!l) return;
    try {
      var items = l.querySelectorAll(".reel-item");
      for (var i = 0; i < items.length; i++) decorerItem(items[i]);
    } catch (e) {
      // On écrit dans ce qu'on observe : sans verrou, une erreur reproductible
      // relancerait la décoration à l'infini.
      enPanne = true;
      fail("decoration", e);
    }
  }

  function planifier() {
    if (enAttente) return;
    enAttente = true;
    setTimeout(function () { enAttente = false; decorer(); }, 0);
  }

  // ── Retrait (kill switch) ────────────────────────────────────────────────
  function retirer() {
    var l = liste();
    if (!l) return;
    try {
      var rows = l.querySelectorAll("." + CLASSE_RANGEE);
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].parentNode) rows[i].parentNode.removeChild(rows[i]);
      }
      var items = l.querySelectorAll("[" + MARQUEUR + "]");
      for (var j = 0; j < items.length; j++) {
        items[j].removeAttribute(MARQUEUR);
        items[j].removeAttribute("data-v5-kind");
      }
    } catch (e) { fail("retrait", e); }
  }

  // ── Observation ──────────────────────────────────────────────────────────
  function observer() {
    var l = liste();
    if (!l || observateur) return;
    try {
      observateur = new MutationObserver(function () { planifier(); });
      observateur.observe(l, { childList: true, subtree: true });
    } catch (e) { fail("observation", e); }
  }

  function cesserObservation() {
    try { if (observateur) observateur.disconnect(); } catch (e) {}
    observateur = null;
  }

  // ── Application / coupure ────────────────────────────────────────────────
  function apply() {
    var racine = document.documentElement;
    if (!actif()) {
      racine.classList.remove(CLASSE_RACINE);
      cesserObservation();
      retirer();
      return false;
    }
    enPanne = false;                       // réactivation explicite : verrou levé
    racine.classList.add(CLASSE_RACINE);
    observer();
    planifier();
    return true;
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  // Ce fichier est chargé HORS du bloc BUILD:APP : en production il est inliné
  // et s'exécute AVANT que l'application existe. La reprise est bornée, cadencée
  // par setTimeout (jamais rAF), et son compteur est REMIS À ZÉRO par
  // `passio:app-ready` — sans quoi les essais seraient brûlés pendant la saisie
  // du code d'accès et le lot ne se poserait jamais (cause mesurée le 2026-08-28).
  function boot() {
    if (!liste()) {
      if (essais++ > 80) return;
      setTimeout(boot, 150);
      return;
    }
    apply();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });

  // Surface publique unique (aucun global top-level : `audit:globals` reste vert).
  window.PassioUIV5 = {
    isEnabled: actif,
    apply: apply,
    decorate: decorer,
    signalOf: intrigue,
    toggleSignal: basculerSignal,
  };
})();
