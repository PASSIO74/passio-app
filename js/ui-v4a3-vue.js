// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V4 — lot UI-4A3 : commutateur Liste / Carte de « Rencontrer ».
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §8
// (« la liste de cartes est prioritaire ; la carte devient une vue secondaire
// ou un aperçu repliable ») et §15 (lot UI-4 — IRL V2).
//
// ── Ce que l'audit préalable a trouvé, et qui réduit ce lot ───────────────
// Les DEUX décisions de fond du §8 étaient déjà tenues par le moteur
// historique, depuis le chantier « content-first » du 2026-08-07 :
//   • la carte démarre repliée (classe `peek`, 132 px) et l'état est mémorisé
//     dans `localStorage.passio_irl_map_peek` ;
//   • la liste occupe donc l'écran dès l'arrivée.
// Il ne manquait que la surface que le §8 dessine explicitement : le choix
// **[Liste] [Carte]**, rendu visible et réversible d'un geste. C'est tout ce
// que ce lot ajoute — et il n'ajoute rien d'autre.
//
// ── Aucun second moteur de carte ──────────────────────────────────────────
// Le commutateur ne touche JAMAIS l'objet carte. Il pilote la seule fonction
// historique `toggleIrlMapPeek()`, qui déplie/replie ET programme le recadrage
// du moteur cartographique après sa transition. Deux raisons de ne pas faire
// autrement : le projet est passé de Leaflet à MapLibre (les commentaires du
// moteur disent encore « Leaflet »), donc appeler une API de redimensionnement
// depuis ici serait un pari sur la mauvaise ; et l'état replié est mémorisé par
// cette fonction, qu'il faut laisser seule maîtresse de sa clé.
//
// ⚠️ En vue Liste, la carte QUITTE l'écran — c'est le sens d'un commutateur, et
// la première remarque de Benjamin à l'essai. Elle n'est pour autant pas mise en
// `display: none` : le moteur cartographique s'initialise paresseusement et
// MESURE son conteneur, qu'un `display: none` réduirait à rien, donnant une
// carte blanche au retour. Le CSS la sort donc du FLUX en lui conservant sa
// boîte, et ce module la retire de l'arbre d'accessibilité tant qu'elle est
// hors écran.
//
// ── Activation — ACTIF PAR DÉFAUT ─────────────────────────────────────────
//     localStorage.passio_ui_4a3 = "0"    → kill switch local, prioritaire
//     window.PASSIO_UI_4A3 = false        → coupure immédiate en mémoire
//
// Comme ses frères depuis la mise en ligne du 2026-08-28, le drapeau ne sait
// qu'ENLEVER : aucune valeur positive n'active, rien n'est écrit dans
// `localStorage` par ce module. La coupure retire le commutateur et rend la
// vue Liste, sans rechargement.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var STORAGE_KEY = "passio_ui_4a3";
  var ROOT_CLASS = "passio-ui-4a3";
  var VERSION = "ui4a3";
  var BARRE_ID = "v4a3Vue";
  var ATTR_VUE = "data-v4a3-vue";     // "liste" | "carte", porté par la racine

  var VUES = [
    { id: "liste", label: "Liste" },
    { id: "carte", label: "Carte" },
  ];

  var vue = "liste";                  // en mémoire seule, jamais persistée
  var observateur = null;
  var pending = false;
  var enPanne = false;

  // ══════════════════════════════════════════════════════════════════════════
  // DRAPEAU — il ne sait qu'enlever.
  // ══════════════════════════════════════════════════════════════════════════
  function uiV4a3Enabled() {
    if (window.PASSIO_UI_4A3 === false) return false;   // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;                   // kill switch local
    return true;
  }

  function actif() { return !enPanne && uiV4a3Enabled(); }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  // Un `catch` muet sur un chemin de décision masque un ReferenceError. Tout
  // échec est audible, et strictement TECHNIQUE.
  function fail(ou, err) {
    var msg = "ui_v4a3 (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[ui-v4a3] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "ui_v4a3_vue", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  function track(name, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") {
        window.tel.action(name, meta || { v: VERSION });
      }
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCÈS AU MOTEUR HISTORIQUE
  // ══════════════════════════════════════════════════════════════════════════
  function ecranIrl() { return document.getElementById("screen-irl"); }
  function carteWrap() { return document.getElementById("irlMapWrap"); }
  function liste() { return document.getElementById("eventList"); }
  function barre() { return document.getElementById(BARRE_ID); }

  function carteRepliee() {
    var w = carteWrap();
    return !!w && w.classList.contains("peek");
  }

  // Le SEUL point par lequel ce module touche la carte. `toggleIrlMapPeek` est
  // une bascule : on ne l'appelle donc que lorsque l'état courant ne correspond
  // pas à celui que la vue demande, jamais « au cas où ».
  function demanderCarteDepliee(depliee) {
    if (carteRepliee() !== depliee) return;             // déjà dans le bon état
    if (typeof toggleIrlMapPeek !== "function") {
      fail("carte", "toggleIrlMapPeek indisponible");
      return;
    }
    try { toggleIrlMapPeek(); } catch (e) { fail("carte_toggle", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMUTATEUR
  // Construit par `document.createElement` : aucun contenu utilisateur n'entre
  // ici, et rien n'est concaténé en HTML.
  // ══════════════════════════════════════════════════════════════════════════
  function construireBarre() {
    var wrap = document.createElement("div");
    wrap.className = "v4a3-vue";
    wrap.id = BARRE_ID;
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", "Affichage des activités");

    for (var i = 0; i < VUES.length; i++) {
      (function (v) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "v4a3-onglet";
        b.setAttribute("data-v4a3-onglet", v.id);
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", "false");
        b.textContent = v.label;
        b.addEventListener("click", function () { choisir(v.id); });
        wrap.appendChild(b);
      })(VUES[i]);
    }
    return wrap;
  }

  // Idempotent : appelé au boot ET après chaque rendu. La barre se pose JUSTE
  // AU-DESSUS de la liste, donc sous la tête UI-4A0 et sous la carte — c'est
  // l'ordre du §8, où le choix d'affichage précède immédiatement le contenu.
  function poserBarre() {
    var l = liste();
    if (!l || !l.parentNode) return false;
    if (barre()) { syncBarre(); return true; }
    var noeud = construireBarre();
    l.parentNode.insertBefore(noeud, l);
    syncBarre();
    return true;
  }

  function retirerBarre() {
    var b = barre();
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function syncBarre() {
    var b = barre();
    if (!b) return;
    var onglets = b.querySelectorAll("[data-v4a3-onglet]");
    for (var i = 0; i < onglets.length; i++) {
      var on = onglets[i].getAttribute("data-v4a3-onglet") === vue;
      onglets[i].setAttribute("aria-selected", on ? "true" : "false");
      onglets[i].classList.toggle("is-on", on);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHOIX D'UNE VUE
  // L'état vit EN MÉMOIRE et rien n'est écrit : revenir sur l'écran redonne la
  // vue Liste, celle que la direction veut par défaut. Seule exception assumée,
  // et elle n'est pas la nôtre : `toggleIrlMapPeek` mémorise, lui, l'état
  // replié de la carte — c'est sa clé, sa décision, on ne la lui prend pas.
  // ══════════════════════════════════════════════════════════════════════════
  function choisir(id) {
    if (!actif()) return;
    var connue = false;
    for (var i = 0; i < VUES.length; i++) if (VUES[i].id === id) connue = true;
    if (!connue || id === vue) return;
    vue = id;
    appliquerVue();
    track("ui_v4a3_vue", { v: VERSION, vue: String(vue) });
  }

  // Hors écran ne suffit pas : une carte invisible ne doit pas rester annoncée
  // aux technologies d'assistance ni atteignable au clavier. Appelée par le
  // changement de vue ET par l'activation — sans quoi l'état d'ouverture aurait
  // le bon CSS et la mauvaise accessibilité (défaut attrapé par le test le
  // 2026-08-28).
  function syncAccessibiliteCarte() {
    var w = carteWrap();
    if (!w) return;
    if (actif() && vue !== "carte") w.setAttribute("aria-hidden", "true");
    else w.removeAttribute("aria-hidden");
  }

  function appliquerVue() {
    try {
      var root = document.documentElement;
      root.setAttribute(ATTR_VUE, vue);
      // La carte n'est dépliée que dans SA vue. En vue Liste elle est repliée
      // ET sortie de l'écran par le CSS — un onglet « Liste » qui montre la
      // carte ne serait pas un commutateur.
      demanderCarteDepliee(vue === "carte");
      syncAccessibiliteCarte();
      syncBarre();
    } catch (e) { fail("vue", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBSERVATION
  // Pas d'enveloppe de `renderIRL` : UI-4A0 et UI-4A1 en posent déjà deux, et
  // la troisième a failli coûter un `null.apply` au lot UI-4A1. Un observateur
  // sur le parent de la liste suffit — il voit le repeuplement de l'écran.
  //
  // ⚠️ `setTimeout` et JAMAIS `requestAnimationFrame` : rAF ne part pas sur une
  // page qui ne compose pas de frames. Piège payé aux lots UI-3A, UI-3B, UI-4B.
  // ══════════════════════════════════════════════════════════════════════════
  function planifier() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      if (!actif()) return;
      try { poserBarre(); } catch (e) { enPanne = true; fail("pose", e); apply(); }
    }, 0);
  }

  function observer() {
    if (observateur) return;
    var ecran = ecranIrl();
    if (!ecran) return;
    try {
      observateur = new MutationObserver(function () { planifier(); });
      observateur.observe(ecran, { childList: true });
    } catch (e) { fail("observateur", e); observateur = null; }
  }

  function cesserObservation() {
    if (!observateur) return;
    try { observateur.disconnect(); } catch (e) { fail("observateur_stop", e); }
    observateur = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVATION / COUPURE
  // La coupure rend la vue Liste — donc l'écran historique — et retire le
  // commutateur. Elle ne replie PAS la carte de force : si l'utilisateur l'a
  // dépliée, c'est son choix, mémorisé par le moteur.
  // ══════════════════════════════════════════════════════════════════════════
  function apply() {
    var on = actif();
    var root = document.documentElement;
    if (!on) {
      root.classList.remove(ROOT_CLASS);
      root.removeAttribute(ATTR_VUE);
      cesserObservation();
      retirerBarre();
      // La carte redevient annoncée : le lot ne laisse rien derrière lui.
      syncAccessibiliteCarte();
      return false;
    }
    root.classList.add(ROOT_CLASS);
    root.setAttribute(ATTR_VUE, vue);
    observer();
    poserBarre();
    // ⚠️ On aligne l'accessibilité, PAS le pli de la carte : `passio_irl_map_peek`
    // est la mémoire du moteur historique, et la déplier ou la replier au
    // démarrage écraserait un choix de l'utilisateur. En vue Liste la carte est
    // hors écran de toute façon, son pli n'y change rien.
    syncAccessibiliteCarte();
    return true;
  }

  // ⚠️ En PRODUCTION, le bloc app sort dans `app.js`, injecté seulement une fois
  // le code d'accès franchi : au premier `boot()`, `#eventList` peut être vide
  // et `toggleIrlMapPeek` inexistante. On repasse donc à `passio:app-ready`,
  // avec une reprise bornée par `setTimeout` en secours.
  var essais = 0;
  function boot() {
    try {
      var on = apply();
      if (on && !barre() && essais++ < 80) setTimeout(boot, 150);
    } catch (e) { fail("boot", e); }
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste vert).
  window.PassioUIV4A3 = {
    isEnabled: uiV4a3Enabled,
    isActive: actif,
    apply: apply,
    refresh: poserBarre,
    vue: function () { return vue; },
    setVue: choisir,
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
