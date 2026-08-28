// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-4A4 : « Rencontrer » a trois onglets, et Outils devient utile
// ──────────────────────────────────────────────────────────────────────────
// Demandé par Benjamin le 2026-08-28, après essai réel :
//   ① les quatre intentions (Tous / Cette semaine / Ma ville / Mes Passio)
//      quittent la tête de l'écran et entrent dans le panneau « Outils » ;
//   ② le panneau est refait, plus lisible et plus pratique ;
//   ③ « Outils » rejoint [Liste] [Carte] : trois onglets côte à côte.
//
// ⚠️ LE PIÈGE CENTRAL, ET IL N'EST PAS INTUITIF. Le corps du panneau
// (`#ctxToolsBody`) est réécrit EN ENTIER par `innerHTML` à chaque rendu, et
// `ContextualTools.refresh("irl")` est rappelé depuis `renderIRL()` — que le
// clic sur une intention déclenche justement. Une chip DÉPLACÉE dans le panneau
// serait donc arrachée du DOM par son propre clic, et rien ne la recréerait.
// D'où la règle de ce lot : dans le panneau, les intentions sont RECONSTRUITES
// depuis l'état, jamais déménagées. Et c'est UI-4A0 qui les construit
// (`PassioUIV4A0.renderIntentsInto`) : lui seul détient `basculerIntention`,
// la seule voie qui émette l'événement dont UI-4A1 dépend. Un module tiers
// devrait dupliquer le moteur — ce que le projet interdit.
//
// ⚠️ LA RÈGLE INVERSE POUR LE DÉCLENCHEUR. `#irlToolsBtn` est DÉPLACÉ, pas
// reconstruit : son hôte de destination (`#v4a3Vue`) est stable, sa pastille
// `#irlToolsBadge` est alimentée par `_updateIrlFiltersBtn` à chaque rendu, et
// trois suites e2e le cliquent sans aucun kill switch. Le reconstruire ferait
// écrire le moteur dans une pastille invisible — le compteur de filtres serait
// silencieusement perdu. On mémorise donc sa place d'origine pour la lui rendre.
//
// ⚠️ « Outils » N'EST PAS UN ONGLET. Liste et Carte sont deux vues exclusives
// (`role="tab"`, `aria-selected`) ; Outils ouvre un dialogue. Lui donner
// `role="tab"` ferait mentir l'annonce vocale. Il garde son rôle de bouton et
// son `aria-haspopup="dialog"`, et se place À CÔTÉ du groupe d'onglets, pas
// dedans — visuellement trois cases, sémantiquement deux onglets et une action.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_4A4 === false   ·   localStorage.passio_ui_4a4 === "0"
// Le drapeau ne sait qu'ENLEVER : aucune valeur positive n'active, rien n'est
// écrit dans localStorage.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = 1;
  var CLASSE_RACINE = "passio-ui-4a4";
  var HOTE_ID = "v4a4Outils";          // conteneur du déclencheur, dans le commutateur
  var SECTION_ID = "v4a4Intentions";   // section injectée dans le panneau
  var MARQUEUR = "data-v4a4";

  var enPanne = false;
  var observateur = null;
  var enAttente = false;
  var essais = 0;

  // Place d'origine du déclencheur, pour la lui rendre à la coupure.
  var origineParent = null;
  var origineSuivant = null;

  function actif() {
    try { if (window.PASSIO_UI_4A4 === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_4a4") === "0") return false; } catch (e) {}
    return true;
  }

  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v4a4] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v4a4 " + etape);
    } catch (x) {}
  }

  function track(nom, meta) {
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  function ecranIrl() { return document.getElementById("screen-irl"); }
  function commutateur() { return document.getElementById("v4a3Vue"); }
  function declencheur() { return document.getElementById("irlToolsBtn"); }
  function corpsPanneau() { return document.getElementById("ctxToolsBody"); }

  // ── ① Le déclencheur rejoint le commutateur ──────────────────────────────
  function poserDeclencheur() {
    var barre = commutateur();
    var btn = declencheur();
    if (!barre || !btn) return false;
    if (document.getElementById(HOTE_ID)) return true;   // déjà posé

    // Mémoriser la place d'origine AVANT de déménager : c'est elle qu'on rend
    // à la coupure, et aussi quand UI-4A3 retire sa barre (retirerBarre
    // supprime le conteneur ET son contenu — le déclencheur disparaîtrait).
    if (!origineParent) {
      origineParent = btn.parentNode;
      origineSuivant = btn.nextSibling;
    }

    var hote = document.createElement("div");
    hote.className = "v4a4-outils-hote";
    hote.id = HOTE_ID;
    hote.appendChild(btn);
    barre.appendChild(hote);
    barre.setAttribute(MARQUEUR, "1");
    return true;
  }

  function rendreDeclencheur() {
    var btn = declencheur();
    var hote = document.getElementById(HOTE_ID);
    if (btn && origineParent) {
      try {
        if (origineSuivant && origineSuivant.parentNode === origineParent) {
          origineParent.insertBefore(btn, origineSuivant);
        } else {
          origineParent.appendChild(btn);
        }
      } catch (e) { fail("restitution", e); }
    }
    if (hote && hote.parentNode) hote.parentNode.removeChild(hote);
    var barre = commutateur();
    if (barre) barre.removeAttribute(MARQUEUR);
    origineParent = null;
    origineSuivant = null;
  }

  // ── ② Les intentions dans le panneau ─────────────────────────────────────
  // Le panneau sert aussi l'écran Voyages : on ne décore QUE quand il est ouvert
  // sur IRL. `ContextualTools` ne l'expose pas, mais le titre le dit.
  function panneauSurIrl() {
    try {
      var t = document.getElementById("ctxToolsTitle");
      return !!(t && /IRL/i.test(t.textContent || ""));
    } catch (e) { return false; }
  }

  function decorerPanneau() {
    if (enPanne) return;
    var corps = corpsPanneau();
    if (!corps || !panneauSurIrl()) return;
    if (document.getElementById(SECTION_ID)) return;   // déjà décoré ce rendu

    var api = window.PassioUIV4A0;
    if (!api || typeof api.renderIntentsInto !== "function") return;   // lot amont coupé
    if (typeof api.isEnabled === "function" && !api.isEnabled()) return;

    try {
      var section = document.createElement("div");
      section.className = "ctx-section v4a4-section";
      section.id = SECTION_ID;

      var titre = document.createElement("div");
      titre.className = "ctx-section-title";
      titre.textContent = "Ce que je cherche";
      section.appendChild(titre);

      var rangee = document.createElement("div");
      rangee.className = "v4a4-intents";
      section.appendChild(rangee);

      // ⚠️ INSÉRER AVANT DE RENDRE. `syncIntentions` (UI-4A0) balaie le
      // DOCUMENT pour poser `aria-pressed` : rendre les chips dans un nœud
      // encore détaché les laisse invisibles à cette synchronisation, et elles
      // s'affichent alors toutes éteintes alors que l'état est bon. Défaut
      // mesuré à l'écriture de ce lot, silencieux à la lecture du code.
      corps.insertBefore(section, corps.firstChild);

      // Les chips sont CONSTRUITES par UI-4A0, jamais déménagées : voir l'entête.
      if (!api.renderIntentsInto(rangee)) {
        if (section.parentNode) section.parentNode.removeChild(section);
        fail("intentions", "rendu refusé");
        return;
      }
    } catch (e) {
      // On écrit dans ce que l'on observe : sans verrou, une erreur
      // reproductible relancerait la décoration à l'infini.
      enPanne = true;
      fail("decoration", e);
    }
  }

  function planifier() {
    if (enAttente) return;
    enAttente = true;
    setTimeout(function () { enAttente = false; appliquer(); }, 0);
  }

  // ── Application / coupure ────────────────────────────────────────────────
  function appliquer() {
    if (!actif()) return;
    poserDeclencheur();
    decorerPanneau();
  }

  function apply() {
    var racine = document.documentElement;
    if (!actif()) {
      racine.classList.remove(CLASSE_RACINE);
      cesserObservation();
      var s = document.getElementById(SECTION_ID);
      if (s && s.parentNode) s.parentNode.removeChild(s);
      rendreDeclencheur();
      return false;
    }
    enPanne = false;                    // réactivation explicite : verrou levé
    racine.classList.add(CLASSE_RACINE);
    observer();
    planifier();
    return true;
  }

  // ── Observation ──────────────────────────────────────────────────────────
  // Deux hôtes à surveiller, et aucun n'est stable :
  //   • `#v4a3Vue` est reconstruit par UI-4A3 après chaque rendu de la liste ;
  //   • `#ctxToolsRoot` n'existe qu'à la première ouverture du panneau, vit dans
  //     `document.body` (hors de #screen-irl), et son corps est réécrit à chaque
  //     rendu. D'où un observateur sur `document.body`, seul point commun.
  function observer() {
    if (observateur) return;
    try {
      observateur = new MutationObserver(function () { planifier(); });
      observateur.observe(document.body, { childList: true, subtree: true });
    } catch (e) { fail("observation", e); }
  }

  function cesserObservation() {
    try { if (observateur) observateur.disconnect(); } catch (e) {}
    observateur = null;
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  // Chargé HORS du bloc BUILD:APP : en production ce fichier s'exécute AVANT
  // que l'application existe. Reprise bornée, cadencée par setTimeout (jamais
  // requestAnimationFrame, qui ne part pas sur une page sans composition), et
  // compteur remis à zéro par `passio:app-ready`.
  function boot() {
    if (!ecranIrl() || !document.body) {
      if (essais++ > 80) return;
      setTimeout(boot, 150);
      return;
    }
    if (apply()) track("ui_v4a4_pose", { v: VERSION });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });

  // Surface publique unique (aucun global top-level : `audit:globals` reste vert).
  window.PassioUIV4A4 = {
    isEnabled: actif,
    apply: apply,
    decorate: appliquer,
  };
})();
