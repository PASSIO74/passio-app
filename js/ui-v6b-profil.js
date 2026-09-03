// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-6B : le Profil du §11
// ──────────────────────────────────────────────────────────────────────────
// Cible (§11 de la direction) :
//   [couverture .............................. ✏️]
//   [avatar] Benjamin
//   Bio générale
//   Abonnés · Abonnements
//
//   Mes Passio
//   🎵 Musique          Actif
//   📷 Photographie     Activer
//   + Ajouter une Passio
//
// « Les étoiles, scores, Passia, rangs, leaderboards et paywalls internes
//  sortent du cœur. L'activation d'une identité Passio est toujours volontaire
//  et visiblement confirmée. »
//
// ⚠️ CE QUE CE LOT RÉPARE, ET QUI N'EST PAS QU'UNE AFFAIRE D'APPARENCE.
// `switchToProfile()` — la SEULE fonction qui change l'identité active — était
// définie et appelée par PERSONNE (vérifié sur tout le dépôt avant d'écrire une
// ligne). Cliquer une carte de profil appelle `toggleProfileSelect()`, qui ne
// change qu'un FILTRE d'affichage. Autrement dit, la question du §11 — « avec
// quelle identité est-ce que j'agis ? » — n'avait aucune réponse atteignable.
// Le bouton « Activer » de ce lot est ce chaînon manquant. Il n'introduit
// aucun moteur : il appelle `switchToProfile`, telle quelle.
//
// ⚠️ TROIS PIÈGES DE CET ÉCRAN :
// ① `#profileList` est réécrit EN ENTIER (`innerHTML`) par
//    `renderProfilesScreen()` — que `switchToProfile()` rappelle lui-même. Un
//    bouton posé une fois serait donc arraché par son propre clic. Il est
//    reposé par un MutationObserver, avec une signature par carte pour n'écrire
//    qu'au changement : l'observateur voit ses propres écritures.
// ② La carte entière porte `onclick="toggleProfileSelect(...)"`. Sans
//    `stopPropagation`, activer une identité basculerait AUSSI le filtre de
//    contenu — deux gestes pour un tap, dont un que personne n'a demandé.
// ③ La statistique « posts » est masquée (§11 ne garde qu'Abonnés ·
//    Abonnements), mais rien n'est perdu : les onglets de contenu justes
//    en dessous ouvrent la même chose, et `openMyPostsTab` reste appelable.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_6B === false   ·   localStorage.passio_ui_6b === "0"
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = 1;
  var CLASSE_RACINE = "passio-ui-6b";
  var MODIF_ID = "v6bModifier";

  var enPanne = false;
  var observateur = null;
  var enAttente = false;
  var essais = 0;

  function actif() {
    try { if (window.PASSIO_UI_6B === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_6b") === "0") return false; } catch (e) {}
    return true;
  }

  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v6b] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v6b " + etape);
    } catch (x) {}
  }

  function track(nom, meta) {
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  function ecran() { return document.getElementById("screen-profiles"); }
  function el(id) { return document.getElementById(id); }

  // ── ① Le crayon ──────────────────────────────────────────────────────────
  // Ordre de Benjamin (2026-08-29) : « remplace l'onglet Modifier par un petit
  // onglet très discret (crayon) en haut à droite ». Le bouton pleine largeur
  // posé sous les statistiques laisse donc la place à une pastille d'icône
  // ancrée au coin haut droit de la couverture.
  //
  // ⚠️ DEUX POINTS QUI NE SONT PAS DE L'APPARENCE.
  // ① Le point d'édition reste `openMainProfileMenu` — le même menu, avec les
  //    mêmes quatre entrées (Modifier le profil · Photo de profil · Photo de
  //    couverture · Apparence). Rien n'est retiré, seule la porte change de
  //    forme. Le « ⋯ » historique occupait EXACTEMENT ce coin et ouvrait ce
  //    même menu : le laisser mettrait deux boutons identiques côte à côte, il
  //    est donc masqué en CSS (jamais retiré du DOM — le kill switch le rend).
  // ② La pastille VISIBLE fait 30 px, mais la cible tactile doit rester à
  //    44 px (mesurée sur la BOÎTE du bouton, qu'un débord en pseudo-élément
  //    ne satisferait pas) : le bouton garde ses 44 px et c'est un `::before`
  //    en `inset: 7px` qui PEINT le rond. Même patron que la pastille d'UI-3A.
  function poserModifier() {
    if (el(MODIF_ID)) return;
    // Le coin haut droit de la couverture, où vivait le « ⋯ ». La couverture
    // n'est jamais réécrite par `renderMainProfile` (elle ne reçoit qu'un
    // `style.background`) : le bouton y survit aux rendus.
    var hote = el("mainProfileCover");
    if (!hote) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "v6b-modifier";
    b.id = MODIF_ID;
    b.title = "Modifier le profil";
    b.setAttribute("aria-label", "Modifier le profil");
    b.setAttribute("aria-haspopup", "menu");
    // Contenu statique, aucun contenu utilisateur : pas d'échappement en jeu.
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M4.5 19.5h3.6L18.6 9a2.2 2.2 0 0 0-3.1-3.1L5 16.4v3.1z"/>'
      + '<path d="M14.2 7.3l2.5 2.5"/></svg>';
    b.addEventListener("click", function (e) {
      e.preventDefault();
      // La couverture entière est cliquable : sans ceci, ouvrir le menu
      // déclencherait aussi le geste de la couverture.
      e.stopPropagation();
      try {
        if (typeof openMainProfileMenu === "function") openMainProfileMenu(e);
      } catch (x) { fail("modifier", x); }
    });
    hote.appendChild(b);
  }

  // ── ② « Mes Passio » ─────────────────────────────────────────────────────
  // Le titre et le lien sont RÉÉCRITS EN TEXTE, jamais reconstruits : le lien
  // porte `onclick="openCreateProfile()"` et l'id `#nouveauProfilLien`, que
  // l'aide contextuelle « second_profil » cible par sélecteur.
  function renommerSection() {
    try {
      var lien = el("nouveauProfilLien");
      if (!lien) return;
      var titre = lien.parentNode;
      if (!titre || titre.getAttribute("data-v6b-titre") === "1") return;
      // Le premier nœud de texte du titre, celui d'avant le lien.
      for (var i = 0; i < titre.childNodes.length; i++) {
        var n = titre.childNodes[i];
        if (n.nodeType === 3 && (n.nodeValue || "").trim()) {
          n.nodeValue = "Gérer mes passions ";
          break;
        }
      }
      lien.textContent = "+ Ajouter une passion";
      titre.setAttribute("data-v6b-titre", "1");
    } catch (e) { fail("titre", e); }
  }

  function idDeCarte(carte) {
    try {
      var h = carte.getAttribute("onclick") || "";
      var m = h.match(/toggleProfileSelect\('([^']*)'\)/);
      if (!m) return "";
      return m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    } catch (e) { return ""; }
  }

  function profilActifId() {
    try { return (state && state.user && state.user.currentProfileId) || ""; } catch (e) { return ""; }
  }

  function activer(id) {
    try {
      if (typeof switchToProfile !== "function") return;
      switchToProfile(id);
      // « visiblement confirmée » (§11) : le changement d'identité ne peut pas
      // être silencieux — c'est avec elle que l'utilisateur publiera ensuite.
      var nom = "";
      try {
        var p = (state.user.profiles || []).filter(function (x) { return x.id === id; })[0];
        if (p && p.passion && typeof passionById === "function") nom = passionById(p.passion).label || "";
      } catch (e) {}
      if (typeof toast === "function") {
        toast(nom ? "Tu agis maintenant en " + nom : "Identité changée");
      }
      track("ui_v6b_activer", {});
    } catch (e) { fail("activation", e); }
  }

  // ⚠️ Garde de cohabitation (même famille que `ficheReprisParV4b` au lot UI-4B).
  // Sous le lot UI-8, `renderProfilesScreen` rend lui-même l'état de la carte —
  // et cette carte n'appelle plus `toggleProfileSelect`, donc `idDeCarte()` ne
  // trouverait rien de toute façon. On rend la surface à app-06 plutôt que
  // d'empiler deux écritures.
  function cartesReprisesParV8() {
    try { if (window.PASSIO_UI_8 === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_8") === "0") return false; } catch (e) {}
    return !!document.querySelector("#profileList [data-v8-card]");
  }

  function decorerCartes() {
    if (cartesReprisesParV8()) return;
    var cartes = document.querySelectorAll("#profileList .profile-card");
    var courant = profilActifId();
    for (var i = 0; i < cartes.length; i++) {
      var carte = cartes[i];
      var id = idDeCarte(carte);
      if (!id) continue;
      var etat = (id === courant) ? "actif" : "libre";
      // Signature : on n'écrit qu'au changement réel (piège ①).
      if (carte.getAttribute("data-v6b") === etat) continue;
      carte.setAttribute("data-v6b", etat);

      var ancien = carte.querySelector(".v6b-ident");
      if (ancien && ancien.parentNode) ancien.parentNode.removeChild(ancien);

      var n;
      if (etat === "actif") {
        n = document.createElement("span");
        n.className = "v6b-ident v6b-actif";
        n.textContent = "Actif";
      } else {
        n = document.createElement("button");
        n.type = "button";
        n.className = "v6b-ident v6b-activer";
        n.textContent = "Activer";
        n.setAttribute("data-v6b-activer", id);
        (function (idFige) {
          n.addEventListener("click", function (e) {
            e.preventDefault();
            // Piège ② : la carte entière bascule un FILTRE. Sans ceci,
            // activer une identité changerait aussi l'affichage.
            e.stopPropagation();
            activer(idFige);
          });
        })(id);
      }
      // Avant le « ⋯ », qui reste le dernier élément de la carte.
      var dots = carte.querySelector(".profile-dots-btn");
      if (dots && dots.parentNode === carte) carte.insertBefore(n, dots);
      else carte.appendChild(n);
    }
  }

  function toutRendre() {
    try {
      var m = el(MODIF_ID);
      if (m && m.parentNode) m.parentNode.removeChild(m);
      var marques = document.querySelectorAll(".v6b-ident");
      for (var i = 0; i < marques.length; i++) {
        if (marques[i].parentNode) marques[i].parentNode.removeChild(marques[i]);
      }
      var cartes = document.querySelectorAll("[data-v6b]");
      for (var j = 0; j < cartes.length; j++) cartes[j].removeAttribute("data-v6b");
      // Le titre reprend ses mots d'origine.
      var lien = el("nouveauProfilLien");
      if (lien) {
        var titre = lien.parentNode;
        if (titre && titre.getAttribute("data-v6b-titre") === "1") {
          for (var k = 0; k < titre.childNodes.length; k++) {
            var n = titre.childNodes[k];
            if (n.nodeType === 3 && (n.nodeValue || "").trim()) {
              // Le markup d'origine dit « Gérer mes passions » depuis le
              // 2026-09-03 (avant : « Mes passions », et « Mes profils passion »
              // avant ADR-010) : restituer un libellé plus ancien réintroduirait
              // un vocabulaire retiré.
              n.nodeValue = "Gérer mes passions ";
              break;
            }
          }
          lien.textContent = "+ Ajouter";
          titre.removeAttribute("data-v6b-titre");
        }
      }
    } catch (e) { fail("restitution", e); }
  }

  function decorer() {
    if (enPanne) return;
    // Verrou de coupure : un rendez-vous armé avant la coupure ne doit pas
    // reposer ce que `toutRendre()` vient de retirer.
    if (!actif()) return;
    if (!ecran()) return;
    try {
      poserModifier();
      renommerSection();
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
      observateur.observe(ec, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    } catch (e) { fail("observation", e); }
  }

  function cesserObservation() {
    try { if (observateur) observateur.disconnect(); } catch (e) {}
    observateur = null;
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  // Chargé HORS du bloc BUILD:APP : reprise bornée en setTimeout, compteur
  // remis à zéro par `passio:app-ready`.
  function boot() {
    if (!ecran()) {
      if (essais++ > 80) return;
      setTimeout(boot, 150);
      return;
    }
    if (apply()) track("ui_v6b_profil", { v: VERSION });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });

  window.PassioUIV6B = {
    isEnabled: actif,
    apply: apply,
    decorate: decorer,
  };
})();
