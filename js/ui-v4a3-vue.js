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
// ── 2026-08-30 : les trois onglets se comportent pareil ───────────────────
// La carte s'affiche DESSOUS le commutateur, comme la liste et comme la vue
// Filtres d'UI-4A5. Le balisage historique la place très au-dessus (juste sous
// la barre d'action) : la vue Carte DÉPLACE donc `#irlMapWrap` juste avant
// `#eventList`, et le rend à sa place d'origine dès qu'on quitte la vue ou que
// le drapeau tombe. Le nœud est déplacé, jamais recréé — le moteur Leaflet vit
// dedans.
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
  var origCarte = null;               // position d'origine de #irlMapWrap
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
  // LA CARTE S'AFFICHE SOUS LES ONGLETS
  // ──────────────────────────────────────────────────────────────────────────
  // Demandé par Benjamin le 2026-08-30, après essai réel : « quand je clique
  // sur Carte je voudrais qu'elle apparaisse DESSOUS les trois onglets, comme
  // quand je clique sur Liste — le même effet sur les trois clics. »
  //
  // Dans le balisage historique, `#irlMapWrap` précède la liste de très haut
  // (juste sous la barre d'action) : le commutateur, lui, se pose au ras de
  // `#eventList`. La carte s'affichait donc AU-DESSUS des onglets, quand la
  // liste et la vue Filtres s'affichent dessous — trois cases, deux
  // comportements. La vue Carte DÉPLACE donc le nœud juste avant la liste, et
  // le rend à sa place d'origine dès qu'on la quitte.
  //
  // ⚠️ Le nœud est DÉPLACÉ, jamais recréé : le moteur cartographique (Leaflet)
  // vit dans `#irlMap`, ses écouteurs et ses tuiles avec lui. Le reconstruire
  // donnerait une carte blanche, et `initIrlMap()` ne réinitialise pas deux fois.
  //
  // ⚠️ La destination est `#eventList`, JAMAIS `barre.nextSibling` : UI-4A5 y
  // pose son panneau de filtres et le REMET à cette place après chaque rendu.
  // Deux modules qui revendiquent le même point d'ancrage se renverraient la
  // balle indéfiniment, chacun réveillant l'observateur de l'autre.
  // ══════════════════════════════════════════════════════════════════════════

  // Déplacer le conteneur ne change pas sa largeur, mais Leaflet mesure à
  // l'attache : on lui redemande un recadrage. `irlMap` est un `let` de portée
  // script (donc absent de `window`, et en zone morte tant qu'app-07 n'a pas
  // tourné) — d'où le `typeof` DANS un `try`, le seul des deux qui protège.
  function recadrerCarte() {
    setTimeout(function () {
      try {
        if (typeof irlMap !== "undefined" && irlMap
          && typeof irlMap.invalidateSize === "function") irlMap.invalidateSize();
      } catch (e) {}
    }, 320);
  }

  function carteDeplacee() { return !!origCarte; }

  function placerCarte(sousLesOnglets) {
    try {
      var w = carteWrap();
      var l = liste();
      if (!w || !l || !l.parentNode) return;
      if (sousLesOnglets) {
        // Hors de portée (un autre lot l'aurait déménagée ailleurs) : on ne
        // force rien, la vue reste correcte, seule la place change.
        if (w.parentNode !== l.parentNode) return;
        if (w.nextElementSibling === l) return;        // déjà en place
        // On mémorise les DEUX voisins. ⚠️ En DÉVELOPPEMENT le voisin suivant
        // est le nœud de texte du retour à la ligne, qui ne bouge jamais ; en
        // PRODUCTION la CI minifie avec `--collapse-whitespace --remove-comments`
        // et ce voisin devient `#irlPassionRow` — qu'UI-4A5 emmène dans son
        // panneau de filtres. Ne retenir que lui rendait donc la carte à la FIN
        // de l'écran, sous la liste, et seulement en prod. Le précédent (la
        // barre d'action) ne bouge, lui, dans aucun des deux.
        if (!origCarte) origCarte = { parent: w.parentNode, prev: w.previousSibling, next: w.nextSibling };
        l.parentNode.insertBefore(w, l);
        poserBarre();                                   // les onglets restent au-dessus
        recadrerCarte();
      } else {
        if (!origCarte) return;
        var o = origCarte;
        origCarte = null;
        // Chaque repère n'est suivi que s'il est encore chez lui ; le dernier
        // repli (fin du parent) ne sert que si les deux ont disparu.
        if (o.next && o.next.parentNode === o.parent) o.parent.insertBefore(w, o.next);
        else if (o.prev && o.prev.parentNode === o.parent) o.parent.insertBefore(w, o.prev.nextSibling);
        else o.parent.appendChild(w);
        recadrerCarte();
      }
    } catch (e) { fail("placer_carte", e); }
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

  // Devant quoi la barre se pose. Normalement la liste ; en vue Carte, la carte
  // déplacée, qui vient de se glisser entre les deux — sans quoi une barre
  // reconstruite après un rendu passerait SOUS la carte, et le commutateur
  // cesserait de coiffer ce qu'il commande.
  function ancreBarre() {
    var l = liste();
    if (!l || !l.parentNode) return null;
    var w = carteWrap();
    if (carteDeplacee() && w && w.parentNode === l.parentNode
      && (w.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)) return w;
    return l;
  }

  // Idempotent : appelé au boot ET après chaque rendu. La barre se pose JUSTE
  // AU-DESSUS du contenu qu'elle commande, donc sous la tête UI-4A0 — c'est
  // l'ordre du §8, où le choix d'affichage précède immédiatement le contenu.
  function poserBarre() {
    var ancre = ancreBarre();
    if (!ancre || !ancre.parentNode) return false;
    var b = barre();
    if (b) {
      // Ré-alignement, jamais capture : on ne déplace la barre que si l'ancre
      // est passée DEVANT elle. Sinon on ne touche à rien — l'écriture inutile
      // réveillerait l'observateur, et celui d'UI-4A5, à chaque rendu.
      if (b.parentNode === ancre.parentNode
        && (b.compareDocumentPosition(ancre) & Node.DOCUMENT_POSITION_PRECEDING)) {
        ancre.parentNode.insertBefore(b, ancre);
      }
      syncBarre();
      return true;
    }
    var noeud = construireBarre();
    ancre.parentNode.insertBefore(noeud, ancre);
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
      // Elle s'affiche SOUS les onglets, comme la liste et comme la vue
      // Filtres : les trois cases se comportent pareil (2026-08-30).
      placerCarte(vue === "carte");
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
      // Avant de retirer la barre : la carte retrouve sa place d'origine, sinon
      // la coupure laisserait le balisage remanié derrière elle.
      placerCarte(false);
      retirerBarre();
      // La carte redevient annoncée : le lot ne laisse rien derrière lui.
      syncAccessibiliteCarte();
      return false;
    }
    root.classList.add(ROOT_CLASS);
    root.setAttribute(ATTR_VUE, vue);
    observer();
    // Ré-activation en cours de session : la place de la carte suit la vue
    // courante. Idempotent — en vue Liste, rien n'a été déplacé, donc rien à
    // rendre.
    placerCarte(vue === "carte");
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
