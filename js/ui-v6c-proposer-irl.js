// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-6C : « Proposer un IRL » depuis une conversation (§10)
// ──────────────────────────────────────────────────────────────────────────
// « Dans une conversation 1:1, `Proposer un IRL` reste une action contextuelle
//  légère dans le menu du composer ou le header secondaire. Elle ouvre le
//  formulaire existant avec une Passio et un titre suggérés, mais SANS GPS,
//  adresse déduite, message automatique, auto-ajout ou auto-RSVP. »  — §10
//
// Le module n'introduit AUCUN moteur : il ajoute une entrée au menu de pièces
// jointes existant, et cette entrée appelle `PassioUIV3.proposeOuting`, qui
// appelle lui-même `openCreateEvent()` + `feedIrlBridgePrefill()`. Rien n'est
// créé tant que l'utilisateur n'a pas soumis le formulaire.
//
// ⚠️ CE QUE CE LOT NE FAIT PAS, ET C'EST DÉLIBÉRÉ (§10, mot pour mot) :
//   • aucune demande de position, aucune adresse déduite de la conversation ;
//   • aucun message envoyé automatiquement dans le fil ;
//   • aucun ajout de l'interlocuteur aux participants, aucun RSVP posé pour
//     lui — il n'est même pas informé tant que rien n'est partagé.
//
// ⚠️ LE TITRE SUGGÉRÉ NE NOMME PERSONNE. « Sortie avec Nina » serait le
// réflexe, et c'est précisément ce qu'il ne faut pas : un titre est PUBLIC
// dès la création, et l'utilisateur peut soumettre sans relire. La suggestion
// est donc construite sur la PASSIO (« Sortie musique »), qui ne divulgue
// personne. Le champ reste librement modifiable, et n'est jamais écrasé s'il
// contient déjà quelque chose.
//
// ⚠️ RÉSERVÉ AU 1:1. Dans un groupe, « proposer un IRL » n'a pas le même sens
// et la Passio de référence n'existe pas — l'entrée est simplement absente.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_6C === false   ·   localStorage.passio_ui_6c === "0"
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = 1;
  var CLASSE_RACINE = "passio-ui-6c";
  var ITEM_ID = "v6cProposerIrl";

  var enPanne = false;
  var observateur = null;
  var enAttente = false;
  var essais = 0;

  function actif() {
    try { if (window.PASSIO_UI_6C === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_6c") === "0") return false; } catch (e) {}
    return true;
  }

  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v6c] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v6c " + etape);
    } catch (x) {}
  }

  function track(nom, meta) {
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  function menu() { return document.getElementById("convAttachMenu"); }

  // La conversation ouverte, ou null. `_openedConvId` est posé par
  // `openConversation` et remis à null nulle part ailleurs que par la fermeture.
  function convOuverte() {
    try {
      if (!window._openedConvId || typeof getConversations !== "function") return null;
      var convs = getConversations() || [];
      for (var i = 0; i < convs.length; i++) {
        if (convs[i].id === window._openedConvId) return convs[i];
      }
    } catch (e) {}
    return null;
  }

  // La Passio de l'interlocuteur — la seule référence disponible ici, et la
  // seule que le §10 autorise à préremplir.
  function passionDe(c) {
    try {
      if (!c || c.isGroup || !c.userId || typeof userById !== "function") return "";
      var u = userById(c.userId);
      return (u && u.passion) ? String(u.passion) : "";
    } catch (e) { return ""; }
  }

  function libelleDe(passion) {
    try {
      if (!passion || typeof passionById !== "function") return "";
      var m = passionById(passion);
      return (m && m.label) ? String(m.label) : "";
    } catch (e) { return ""; }
  }

  function proposer() {
    var c = convOuverte();
    if (!c || c.isGroup) return;
    var passion = passionDe(c);

    // La conversation est fermée AVANT d'ouvrir le formulaire : le modal passe
    // par-dessus (z-index), mais laisser la conversation plein écran derrière
    // rendrait la sortie ambiguë — piège déjà payé sur le lecteur de bobines.
    try { if (typeof closeConversation === "function") closeConversation(); } catch (e) { fail("fermeture", e); }

    setTimeout(function () {
      try {
        var api = window.PassioUIV3;
        if (!api || typeof api.proposeOuting !== "function") {
          // Repli : le moteur historique, directement. Aucun second chemin de
          // création n'est écrit ici.
          if (typeof openCreateEvent === "function") {
            openCreateEvent();
            if (typeof feedIrlBridgePrefill === "function") feedIrlBridgePrefill(passion, null);
          } else if (typeof goTo === "function") {
            goTo("irl");
          }
        } else {
          api.proposeOuting(passion, null);
        }
        suggererTitre(passion);
        track("ui_v6c_proposer", { v: VERSION, has_psn: !!passion });
      } catch (e) { fail("proposition", e); }
    }, 80);
  }

  // Le titre suggéré : construit sur la Passio, jamais sur une personne (voir
  // l'entête). Jamais écrasé si le champ porte déjà quelque chose.
  function suggererTitre(passion) {
    try {
      var champ = document.getElementById("evTitle");
      if (!champ || (champ.value || "").trim()) return;
      var label = libelleDe(passion);
      if (!label) return;
      champ.value = "Sortie " + label.toLowerCase();
    } catch (e) { fail("titre", e); }
  }

  function construire() {
    var m = menu();
    if (!m || document.getElementById(ITEM_ID)) return false;

    var item = document.createElement("div");
    item.className = "attach-item v6c-item";
    item.id = ITEM_ID;
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");

    var ico = document.createElement("div");
    ico.className = "attach-icon";
    ico.style.background = "rgba(124,58,237,0.12)";
    ico.style.color = "var(--att-irl)";
    // Pictogramme dessiné, comme les cinq pastilles voisines du même menu :
    // l'emoji était TOUT le contenu de la pastille, le vider l'aurait laissée
    // ronde et vide au milieu des autres.
    ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M7.5 12.5 4 9l3-3 2.6 2.2h4.8L17 6l3 3-3.5 3.5"/>'
      + '<path d="M9.6 8.2 7.4 10.6a1.6 1.6 0 0 0 2.2 2.3l1.4-1.2 3.4 3a1.5 1.5 0 0 1-2 2.2"/>'
      + '<path d="M12.4 16.9a1.5 1.5 0 0 1-2 2.2l-1-.9"/></svg>';
    item.appendChild(ico);

    var lab = document.createElement("div");
    lab.className = "attach-label";
    lab.textContent = "Proposer un IRL";
    item.appendChild(lab);

    item.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      proposer();
    });
    item.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      proposer();
    });

    // En TÊTE du menu : c'est l'action que le §10 met en avant, les pièces
    // jointes restent dessous, dans leur ordre d'origine.
    m.insertBefore(item, m.firstChild);
    return true;
  }

  // Visible seulement en 1:1. `hidden` plutôt qu'un retrait : le menu est un
  // nœud statique de la page, et l'entrée doit revenir sans reconstruction.
  function synchroniser() {
    var item = document.getElementById(ITEM_ID);
    if (!item) return;
    var c = convOuverte();
    var visible = !!(c && !c.isGroup);
    if (item.hidden === !visible) return;   // rien n'a changé : on n'écrit pas
    item.hidden = !visible;
  }

  function decorer() {
    if (enPanne) return;
    if (!actif()) return;
    if (!menu()) return;
    try {
      construire();
      synchroniser();
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

  function toutRendre() {
    var item = document.getElementById(ITEM_ID);
    if (item && item.parentNode) item.parentNode.removeChild(item);
  }

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

  // L'ouverture d'une conversation ne touche PAS le menu : elle repeint
  // `#convFpHead` et le fil. On observe donc la page pleine, seul ancêtre commun.
  function observer() {
    var hote = document.getElementById("conv-fullpage");
    if (!hote || observateur) return;
    try {
      observateur = new MutationObserver(function () { planifier(); });
      observateur.observe(hote, {
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
  function boot() {
    if (!menu() || !document.getElementById("conv-fullpage")) {
      if (essais++ > 80) return;
      setTimeout(boot, 150);
      return;
    }
    if (apply()) track("ui_v6c_pose", { v: VERSION });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });

  window.PassioUIV6C = {
    isEnabled: actif,
    apply: apply,
    decorate: decorer,
    propose: proposer,
  };
})();
