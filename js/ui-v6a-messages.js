// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-6A : l'inbox Messages du §10
// ──────────────────────────────────────────────────────────────────────────
// Cible (§10 de la direction) :
//   Messages                        [+]
//   [Rechercher…]
//
//   [avatar] Nina
//   Musique · Dernier message…        12:43
//
// « Le + regroupe Nouveau message et Nouveau groupe. »
//
// Le module RÉORGANISE ce que l'écran rend déjà : il déplace la recherche,
// masque les deux gros boutons et pose une tête. Il ne remplace AUCUN moteur :
// le « + » appelle `openNewMessage()` / `openCreateGroup()`, les mêmes
// fonctions que les boutons masqués.
//
// ⚠️ TROIS PIÈGES DE CET ÉCRAN, mesurés avant d'écrire une ligne :
// ① `renderMessages()` REPART DE ZÉRO (`list.innerHTML = …`) à chaque envoi,
//    chaque réception, chaque frappe dans la recherche et chaque changement de
//    filtre. Une ligne de Passio écrite une fois disparaîtrait au premier
//    message reçu. Elle est donc (re)posée par un MutationObserver, avec une
//    signature par carte pour n'écrire qu'au changement — l'observateur voit
//    ses propres écritures.
// ② `renderMessages()` SORT TÔT quand l'écran n'est pas actif, ou quand la
//    conversation plein écran est ouverte. Décorer avant que l'écran soit actif
//    ne décore donc rien : c'est l'observateur, et lui seul, qui fait foi.
// ③ La recherche est DÉPLACÉE, jamais reconstruite : son `oninput` inline
//    appelle `_globalMsgSearch(this.value)`, et `#convGlobalSearch` est retrouvé
//    par id ailleurs dans l'application. On mémorise sa place d'origine pour la
//    lui rendre à la coupure.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_6A === false   ·   localStorage.passio_ui_6a === "0"
// Le drapeau ne sait qu'ENLEVER : aucune valeur positive n'active, rien n'est
// écrit dans localStorage.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = 1;
  var CLASSE_RACINE = "passio-ui-6a";
  var HOTE_ID = "v6aHead";
  var MENU_ID = "v6aMenu";
  var MARQUEUR = "data-v6a";

  var enPanne = false;
  var observateur = null;
  var enAttente = false;
  var essais = 0;
  var origines = [];
  var fermerMenuGlobal = null;

  function actif() {
    try { if (window.PASSIO_UI_6A === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_6a") === "0") return false; } catch (e) {}
    return true;
  }

  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v6a] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v6a " + etape);
    } catch (x) {}
  }

  function track(nom, meta) {
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  function ecran() { return document.getElementById("screen-messages"); }
  function el(id) { return document.getElementById(id); }

  // ── Déplacement réversible ───────────────────────────────────────────────
  function deplacer(noeud, dans) {
    if (!noeud || !dans) return false;
    if (noeud.getAttribute(MARQUEUR) !== "1") {
      origines.push({ noeud: noeud, parent: noeud.parentNode, suivant: noeud.nextSibling });
      noeud.setAttribute(MARQUEUR, "1");
    }
    dans.appendChild(noeud);
    return true;
  }

  function toutRendre() {
    fermerMenu();
    for (var i = origines.length - 1; i >= 0; i--) {
      var o = origines[i];
      try {
        if (!o.parent) continue;
        if (o.suivant && o.suivant.parentNode === o.parent) o.parent.insertBefore(o.noeud, o.suivant);
        else o.parent.appendChild(o.noeud);
        o.noeud.removeAttribute(MARQUEUR);
      } catch (e) { fail("restitution", e); }
    }
    origines = [];
    var h = el(HOTE_ID);
    if (h && h.parentNode) h.parentNode.removeChild(h);
    // Les lignes de Passio sont retirées : la coupure rend l'inbox d'avant.
    try {
      var lignes = document.querySelectorAll(".v6a-psn");
      for (var j = 0; j < lignes.length; j++) {
        if (lignes[j].parentNode) lignes[j].parentNode.removeChild(lignes[j]);
      }
      var cartes = document.querySelectorAll("[data-v6a-psn]");
      for (var k = 0; k < cartes.length; k++) cartes[k].removeAttribute("data-v6a-psn");
    } catch (e) { fail("nettoyage", e); }
  }

  // ── Le menu du « + » ─────────────────────────────────────────────────────
  // Volontairement PAS `openModal` : celui-ci n'empile pas (ouvrir une modale
  // depuis une autre la REMPLACE) et pousse une entrée d'historique. Un menu
  // local, fermé au clic extérieur et à Escape, ne perturbe rien.
  function fermerMenu() {
    var m = el(MENU_ID);
    if (m && m.parentNode) m.parentNode.removeChild(m);
    if (fermerMenuGlobal) {
      document.removeEventListener("click", fermerMenuGlobal, true);
      document.removeEventListener("keydown", fermerMenuGlobal, true);
      fermerMenuGlobal = null;
    }
    var b = document.querySelector("[data-v6a-plus]");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function entreeMenu(emoji, texte, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "v6a-menu-item";
    b.setAttribute("role", "menuitem");
    b.textContent = emoji + "  " + texte;
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      fermerMenu();
      try { fn(); } catch (x) { fail("action", x); }
    });
    return b;
  }

  function ouvrirMenu(ancre) {
    if (el(MENU_ID)) { fermerMenu(); return; }
    var m = document.createElement("div");
    m.className = "v6a-menu";
    m.id = MENU_ID;
    m.setAttribute("role", "menu");
    m.appendChild(entreeMenu("✉️", "Nouveau message", function () {
      if (typeof openNewMessage === "function") openNewMessage();
    }));
    m.appendChild(entreeMenu("👥", "Nouveau groupe", function () {
      if (typeof openCreateGroup === "function") openCreateGroup();
    }));
    ancre.parentNode.appendChild(m);
    ancre.setAttribute("aria-expanded", "true");

    fermerMenuGlobal = function (ev) {
      if (ev.type === "keydown") { if (ev.key === "Escape") fermerMenu(); return; }
      if (m.contains(ev.target) || ancre.contains(ev.target)) return;
      fermerMenu();
    };
    // En phase de CAPTURE : un `onclick` inline d'une carte de conversation
    // stoppe la propagation avant la phase de bulle sur certains chemins.
    document.addEventListener("click", fermerMenuGlobal, true);
    document.addEventListener("keydown", fermerMenuGlobal, true);
    track("ui_v6a_plus", {});
  }

  // ── ① La tête : « Messages » + [+], puis la recherche ────────────────────
  function construire() {
    var ec = ecran();
    if (!ec) return false;

    var hote = document.createElement("div");
    hote.className = "v6a-head";
    hote.id = HOTE_ID;

    var rangee = document.createElement("div");
    rangee.className = "v6a-title-row";
    var titre = document.createElement("h1");
    titre.className = "v6a-title";
    titre.textContent = "Messages";
    rangee.appendChild(titre);

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "v6a-plus";
    plus.setAttribute("data-v6a-plus", "1");
    plus.setAttribute("aria-haspopup", "menu");
    plus.setAttribute("aria-expanded", "false");
    plus.setAttribute("aria-label", "Nouvelle conversation");
    plus.textContent = "+";
    plus.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      ouvrirMenu(plus);
    });
    rangee.appendChild(plus);
    hote.appendChild(rangee);

    // La recherche est DÉPLACÉE (piège ③) : son `oninput` inline doit survivre.
    var champ = el("convGlobalSearch");
    var boite = champ ? champ.parentNode : null;
    if (boite) deplacer(boite, hote);

    // Les deux gros boutons sont MASQUÉS, jamais retirés : le menu du « + »
    // appelle exactement les mêmes fonctions, et un retrait empêcherait la
    // coupure de les rendre sans rechargement.
    try {
      var b = ec.querySelector('button[onclick="openNewMessage()"]');
      if (b && b.parentNode) b.parentNode.setAttribute("data-v6a-legacy", "1");
    } catch (e) { fail("legacy", e); }

    ec.insertBefore(hote, ec.firstChild);
    return true;
  }

  // ── ② « Musique · Dernier message… » ─────────────────────────────────────
  // Le nom de la Passio de l'interlocuteur, devant l'aperçu. Aucun appel
  // réseau : la donnée est déjà dans l'état local.
  function passionDe(convId) {
    try {
      if (typeof getConversations !== "function") return "";
      var convs = getConversations() || [];
      var c = null;
      for (var i = 0; i < convs.length; i++) { if (convs[i].id === convId) { c = convs[i]; break; } }
      if (!c || c.isGroup || !c.userId) return "";
      var u = (typeof userById === "function") ? userById(c.userId) : null;
      if (!u || !u.passion || typeof passionById !== "function") return "";
      var meta = passionById(u.passion);
      return (meta && meta.label) ? String(meta.label) : "";
    } catch (e) { return ""; }
  }

  // `openConversation('<id>')` — l'id est échappé par `escapeJsArg` au rendu ;
  // on ne le ré-interprète pas, on le relit tel quel pour retrouver la conv.
  function convIdDe(carte) {
    try {
      var h = carte.getAttribute("onclick") || "";
      var m = h.match(/openConversation\('([^']*)'\)/);
      if (!m) return "";
      // `escapeJsArg` échappe l'apostrophe et l'antislash : on défait ces deux-là.
      return m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    } catch (e) { return ""; }
  }

  function decorerCartes() {
    var cartes = document.querySelectorAll("#messageList .msg-card");
    for (var i = 0; i < cartes.length; i++) {
      var carte = cartes[i];
      var id = convIdDe(carte);
      if (!id) continue;
      var label = passionDe(id);
      // Signature : l'observateur voit ses propres écritures, on n'écrit qu'au
      // changement réel — sinon la décoration boucle.
      if (carte.getAttribute("data-v6a-psn") === (label || "-")) continue;
      carte.setAttribute("data-v6a-psn", label || "-");

      var ancienne = carte.querySelector(".v6a-psn");
      if (ancienne && ancienne.parentNode) ancienne.parentNode.removeChild(ancienne);
      if (!label) continue;

      var apercu = carte.querySelector(".msg-preview");
      if (!apercu || !apercu.parentNode) continue;
      var span = document.createElement("span");
      span.className = "v6a-psn";
      span.textContent = label + " · ";
      apercu.insertBefore(span, apercu.firstChild);
    }
  }

  function decorer() {
    if (enPanne) return;
    // Verrou de coupure : un `planifier()` armé AVANT la coupure survivrait à
    // `cesserObservation()` et reconstruirait la tête juste après sa dépose.
    if (!actif()) return;
    var ec = ecran();
    if (!ec) return;
    try {
      if (!el(HOTE_ID) && !construire()) return;
      decorerCartes();
    } catch (e) {
      enPanne = true;
      fail("decoration", e);
    }
  }

  function planifier() {
    if (enAttente) return;
    enAttente = true;
    setTimeout(function () { enAttente = false; decorer(); }, 0);
  }

  // ── Application / coupure ────────────────────────────────────────────────
  function apply() {
    var racine = document.documentElement;
    if (!actif()) {
      racine.classList.remove(CLASSE_RACINE);
      cesserObservation();
      toutRendre();
      var lg = document.querySelector("[data-v6a-legacy]");
      if (lg) lg.removeAttribute("data-v6a-legacy");
      return false;
    }
    enPanne = false;
    racine.classList.add(CLASSE_RACINE);
    observer();
    planifier();
    return true;
  }

  function observer() {
    var ec = ecran();
    if (!ec || observateur) return;
    try {
      observateur = new MutationObserver(function () { planifier(); });
      observateur.observe(ec, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["class"],
      });
    } catch (e) { fail("observation", e); }
  }

  function cesserObservation() {
    try { if (observateur) observateur.disconnect(); } catch (e) {}
    observateur = null;
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  // Chargé HORS du bloc BUILD:APP : en production ce fichier s'exécute AVANT
  // que l'application existe. Reprise bornée, cadencée par setTimeout (jamais
  // requestAnimationFrame), compteur remis à zéro par `passio:app-ready`.
  function boot() {
    if (!ecran()) {
      if (essais++ > 80) return;
      setTimeout(boot, 150);
      return;
    }
    if (apply()) track("ui_v6a_inbox", { v: VERSION });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });

  window.PassioUIV6A = {
    isEnabled: actif,
    apply: apply,
    decorate: decorer,
    closeMenu: fermerMenu,
  };
})();
