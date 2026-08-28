// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V4 — lot UI-4A0 : tête de l'écran « Rencontrer ».
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §8 et §15,
// ordre « UI-4A0 — relance minimale après limite technique » (issue #165).
//
// Périmètre volontairement MINUSCULE : ce module ne pose que le bandeau de
// tête de l'écran IRL — titre, sous-titre, recherche et quatre intentions —
// et laisse INTACTS, sous ce bandeau, la liste, la carte, les cartes
// d'activité et tous les moteurs historiques de `js/app-07-ia-explore-irl.js`.
//
// Ce qu'il NE fait pas, et qui revient aux sous-lots suivants (UI-4A1/4A2) :
//   • aucune simplification des cartes d'activité ;
//   • aucun commutateur Liste / Carte, aucune réorganisation de la carte ;
//   • aucun raccordement des intentions au moteur de filtrage DANS CE FICHIER —
//     c'est `js/ui-v4a1-intentions.js` (lot UI-4A1) qui le fait, à partir des
//     trois seules surfaces ajoutées ici : l'événement `passio:ui4a0-intents`,
//     l'événement `passio:ui4a0-apply` et `PassioUIV4A0.setIntents(...)`. Sous
//     le seul aperçu UI-4A0, une intention ne change toujours PAS la liste ;
//     leur état est
//     tenu EN MÉMOIRE et exposé par `window.PassioUIV4A0.intents()` pour que
//     UI-4A1 le branche sur `irlDateFilters` / `irlSelectedCity` /
//     `irlPassionFilters` sans avoir à créer un second filtre. Tant que ce
//     raccordement n'existe pas, une intention ne change PAS la liste : c'est
//     une décision de découpage, pas un oubli.
//
// Deux seuls comportements sont réellement branchés dans ce lot :
//   ① la recherche — le champ de tête écrit dans le champ historique
//      `#irlCitySearch` puis appelle `filterIrlByCity()` : même état, même
//      anti-rebond, même pipeline `irlSearchQuery`. Aucun second moteur ;
//   ② aucune demande GPS à l'ouverture — `renderIRL` est enveloppé pour armer
//      le marqueur historique `_passioIrlSkipGeoOnce` avant chaque rendu. Les
//      gestes explicites (« Utiliser ma position » dans le sélecteur de ville)
//      appellent `requestUserLocation()` directement et restent intacts.
//
// ⚠️ Le module n'écrit RIEN : ni Supabase, ni `state`, ni `localStorage`.
//
// ── Activation — ACTIF PAR DÉFAUT (2026-08-28) ────────────────────────────
//     localStorage.passio_ui_4a0 = "0"    → kill switch local, prioritaire
//     window.PASSIO_UI_4A0 = false        → coupure immédiate en mémoire
//
// Mis en ligne sur l'URL normale par décision de Benjamin, en même temps que
// UI-4A1, UI-4A2 et UI-4B. Les anciens liens `?passio_preview=passio-ui-4a0`
// restent tolérés mais ne décident plus rien, et aucune activation positive
// n'est écrite dans `localStorage`. Les deux coupures priment sur tout : couper
// en cours de session rend l'écran IRL historique intégralement, sans
// rechargement et sans déploiement.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var PREVIEW_NAME = "passio-ui-4a0";
  var DEMO_PREVIEW_NAME = "passio-ui-4a0-demo";
  var STORAGE_KEY = "passio_ui_4a0";
  var ROOT_CLASS = "passio-ui-4a0";
  var HEAD_ID = "v4a0Head";
  var SEARCH_ID = "v4a0Search";
  var VERSION = "ui4a0";

  var TITRE = "Rencontrer";
  var SOUS_TITRE = "Des activités à vivre autour de tes passions";
  var PLACEHOLDER = "Rechercher une activité ou une ville";

  // Les quatre intentions arrêtées par Benjamin. `pour_toi` n'est pas une
  // option de plus : c'est l'état NEUTRE, celui où aucune restriction n'est
  // demandée. Les trois autres se combinent librement.
  var INTENTIONS = [
    { id: "pour_toi", label: "Pour toi", neutre: true },
    { id: "semaine", label: "Cette semaine" },
    { id: "ville", label: "Ma ville" },
    { id: "passio", label: "Mes Passio" },
  ];

  var intentions = [];      // sélection courante, en mémoire seule
  var enveloppePosee = false;
  var renderIRLOriginal = null;
  var displayRechercheHistorique = null;

  // ══════════════════════════════════════════════════════════════════════════
  // DRAPEAU
  // Ordre de priorité : coupure mémoire > kill switch local > aperçu > éteint.
  // Aucune valeur positive persistante : l'aperçu vient de l'URL, jamais d'un
  // état posé sur l'appareil du testeur.
  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ ACTIF PAR DÉFAUT depuis la mise en ligne du 2026-08-28, décidée par
  // Benjamin. Le drapeau ne sait plus qu'ENLEVER : `PREVIEW_NAME` et
  // `DEMO_PREVIEW_NAME` n'apparaissent plus dans cette fonction — les anciens
  // liens `?passio_preview=…` restent tolérés mais ne décident plus rien, et
  // aucune valeur positive n'est écrite dans `localStorage`. Les deux coupures
  // priment sur tout et rendent l'écran historique sans rechargement.
  function uiV4a0Enabled() {
    if (window.PASSIO_UI_4A0 === false) return false;   // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;                   // kill switch local
    return true;
  }

  // Signal sortant — le seul canal par lequel un sous-lot apprend qu'une
  // intention a changé ou que la tête vient d'être posée/retirée. Aucun état
  // n'est partagé autrement.
  function emettre(nom, detail) {
    try {
      window.dispatchEvent(new CustomEvent(nom, { detail: detail || {} }));
    } catch (e) { fail("evenement", e); }
  }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  // Un `catch` muet sur un chemin de décision masque un ReferenceError — le
  // défaut qui a coûté six jours de fil vide au projet. Tout échec est audible,
  // et strictement TECHNIQUE : ni titre, ni ville, ni identifiant de personne,
  // ni le texte tapé dans la recherche.
  function fail(ou, err) {
    var msg = "ui_v4a0 (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[ui-v4a0] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "ui_v4a0_tete", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  // Métadonnées AUTORISÉES : version et identifiants d'étape/intention, tous
  // des constantes techniques de ce fichier. Aucun texte libre, aucun contenu.
  function track(name, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") {
        window.tel.action(name, meta || { v: VERSION });
      }
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANDEAU DE TÊTE
  // Construit par `document.createElement` : aucun contenu utilisateur n'entre
  // ici, et rien n'est concaténé en HTML.
  // ══════════════════════════════════════════════════════════════════════════
  function ecranIrl() { return document.getElementById("screen-irl"); }
  function head() { return document.getElementById(HEAD_ID); }
  function champTete() { return document.getElementById(SEARCH_ID); }
  function champHistorique() { return document.getElementById("irlCitySearch"); }
  function ligneRechercheHistorique() { return document.getElementById("irlSearchRow"); }

  // La barre historique porte un display:flex inline : une règle CSS normale ne
  // peut pas la masquer. On mémorise donc exactement sa valeur inline, puis on
  // la restaure au kill switch sans rechargement.
  function masquerRechercheHistorique() {
    var row = ligneRechercheHistorique();
    if (!row) return;
    if (displayRechercheHistorique === null) displayRechercheHistorique = row.style.display;
    row.style.display = "none";
  }

  function restaurerRechercheHistorique() {
    var row = ligneRechercheHistorique();
    if (row && displayRechercheHistorique !== null) {
      row.style.display = displayRechercheHistorique;
    }
    displayRechercheHistorique = null;
  }

  function creerChip(intention) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "v4a0-chip";
    b.setAttribute("data-v4a0-intent", intention.id);
    b.setAttribute("aria-pressed", "false");
    var mark = document.createElement("span");
    mark.className = "v4a0-chip-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "✓";
    var txt = document.createElement("span");
    txt.className = "v4a0-chip-label";
    txt.textContent = intention.label;
    b.appendChild(mark);
    b.appendChild(txt);
    b.addEventListener("click", function () { basculerIntention(intention.id); });
    return b;
  }

  function construireHead() {
    var wrap = document.createElement("div");
    wrap.className = "v4a0-head";
    wrap.id = HEAD_ID;

    var h = document.createElement("h1");
    h.className = "v4a0-title";
    h.textContent = TITRE;
    wrap.appendChild(h);

    var sub = document.createElement("p");
    sub.className = "v4a0-sub";
    sub.textContent = SOUS_TITRE;
    wrap.appendChild(sub);

    var box = document.createElement("div");
    box.className = "v4a0-searchbox";
    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("class", "v4a0-search-icon");
    var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", "11"); c.setAttribute("cy", "11"); c.setAttribute("r", "7");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M20 20 L16.4 16.4");
    icon.appendChild(c); icon.appendChild(p);
    box.appendChild(icon);

    var input = document.createElement("input");
    input.type = "search";
    input.id = SEARCH_ID;
    input.className = "v4a0-search";
    input.autocomplete = "off";
    input.placeholder = PLACEHOLDER;
    input.setAttribute("aria-label", PLACEHOLDER);
    input.addEventListener("input", onRecherche);
    box.appendChild(input);
    wrap.appendChild(box);

    var groupe = document.createElement("div");
    groupe.className = "v4a0-intents";
    groupe.setAttribute("role", "group");
    groupe.setAttribute("aria-label", "Intentions rapides");
    for (var i = 0; i < INTENTIONS.length; i++) groupe.appendChild(creerChip(INTENTIONS[i]));
    wrap.appendChild(groupe);

    return wrap;
  }

  // Idempotent : appelé au boot ET après chaque `renderIRL`, il ne recrée le
  // bandeau que s'il a disparu. Rien dans l'app ne réécrit `#screen-irl`
  // aujourd'hui, mais reposer le bandeau coûte moins qu'un écran décapité.
  function poserHead() {
    var ecran = ecranIrl();
    if (!ecran) return false;
    masquerRechercheHistorique();
    if (head()) { syncHead(); return true; }
    var noeud = construireHead();
    if (ecran.firstChild) ecran.insertBefore(noeud, ecran.firstChild);
    else ecran.appendChild(noeud);
    syncHead();
    return true;
  }

  function retirerHead() {
    var h = head();
    if (h && h.parentNode) h.parentNode.removeChild(h);
    restaurerRechercheHistorique();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECHERCHE — un seul état, celui du moteur historique
  // Le champ de tête n'est qu'une SURFACE : il recopie sa valeur dans
  // `#irlCitySearch` (resté dans le DOM, simplement masqué par le lot) puis
  // laisse `filterIrlByCity()` faire son anti-rebond et son rendu. Aucune
  // écriture directe dans `irlSearchQuery`, aucun filtre parallèle.
  // ══════════════════════════════════════════════════════════════════════════
  function onRecherche() {
    try {
      var mien = champTete();
      var hist = champHistorique();
      if (!mien || !hist) return;
      if (hist.value === mien.value) return;
      hist.value = mien.value;
      if (typeof window.filterIrlByCity === "function") window.filterIrlByCity();
    } catch (e) { fail("recherche", e); }
  }

  // Le sens inverse : « Réinitialiser » vide `#irlCitySearch`. On répercute,
  // sauf pendant la frappe — écraser un champ que quelqu'un est en train de
  // remplir est le pire des synchronismes.
  function syncRecherche() {
    var mien = champTete();
    var hist = champHistorique();
    if (!mien || !hist) return;
    // Après une action explicite du moteur historique (par exemple
    // « Réinitialiser »), la source de vérité doit reprendre la main même si le
    // champ de tête a encore le focus. Pendant la frappe, les deux valeurs sont
    // déjà identiques, donc cette synchronisation ne déplace pas le curseur.
    if (mien.value !== hist.value) mien.value = hist.value;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTENTIONS — état en mémoire, exposé pour UI-4A1
  // ══════════════════════════════════════════════════════════════════════════
  function estNeutre(id) {
    for (var i = 0; i < INTENTIONS.length; i++) {
      if (INTENTIONS[i].id === id) return !!INTENTIONS[i].neutre;
    }
    return false;
  }

  function basculerIntention(id) {
    try {
      if (estNeutre(id)) {
        intentions = [];                        // retour à l'état neutre
      } else {
        var pos = intentions.indexOf(id);
        if (pos === -1) intentions.push(id);
        else intentions.splice(pos, 1);
      }
      syncIntentions();
      track("ui_v4a0_intent", { v: VERSION, intent: String(id), n: intentions.length });
      emettre("passio:ui4a0-intents", { intents: intentions.slice() });
    } catch (e) { fail("intention", e); }
  }

  // Pose l'état des chips SANS ré-émettre l'événement : c'est la voie par
  // laquelle un sous-lot resynchronise la tête sur l'état RÉEL du moteur (ville
  // refusée faute de choix, « Tout afficher », kill switch…). Les identifiants
  // inconnus et l'état neutre sont ignorés : on ne stocke que des intentions.
  function setIntents(liste) {
    try {
      var propre = [];
      var src = Array.isArray(liste) ? liste : [];
      for (var i = 0; i < src.length; i++) {
        var id = String(src[i]);
        if (estNeutre(id) || propre.indexOf(id) !== -1) continue;
        for (var j = 0; j < INTENTIONS.length; j++) {
          if (INTENTIONS[j].id === id) { propre.push(id); break; }
        }
      }
      intentions = propre;
      syncIntentions();
    } catch (e) { fail("set_intentions", e); }
  }

  function syncIntentions() {
    var h = head();
    if (!h) return;
    var chips = h.querySelectorAll("[data-v4a0-intent]");
    for (var i = 0; i < chips.length; i++) {
      var id = chips[i].getAttribute("data-v4a0-intent");
      var on = estNeutre(id) ? intentions.length === 0 : intentions.indexOf(id) !== -1;
      chips[i].setAttribute("aria-pressed", on ? "true" : "false");
      chips[i].classList.toggle("is-on", on);
    }
  }

  function syncHead() {
    syncRecherche();
    syncIntentions();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUCUNE DEMANDE GPS À L'OUVERTURE
  // `renderIRL` (app-07) demande la position dès que l'écran IRL est visible.
  // Plutôt que de dupliquer ce rendu, on ARME avant chaque appel le marqueur à
  // usage unique que le moteur consomme déjà (`_passioIrlSkipGeoOnce`, posé par
  // UI-3A pour la même raison). Le moteur le remet à `false` lui-même : ce lot
  // ne peut donc jamais désactiver durablement la géolocalisation, et les
  // gestes explicites — « Utiliser ma position » dans le sélecteur de ville —
  // appellent `requestUserLocation()` directement, sans passer par ici.
  //
  // L'enveloppe est retirée par le kill switch : la fonction d'origine est
  // conservée et remise telle quelle.
  // ══════════════════════════════════════════════════════════════════════════
  function poserEnveloppeRender() {
    if (enveloppePosee) return;
    if (typeof window.renderIRL !== "function") return;
    // Notre enveloppe peut être encore DANS la chaîne, recouverte par celle d'un
    // sous-lot (UI-4A1) : `window.renderIRL` ne porte alors plus `_v4a0`, mais
    // `renderIRLOriginal` est toujours renseigné. La reconnaître évite d'en
    // empiler une seconde — elle se garde elle-même par `uiV4a0Enabled()`.
    if (window.renderIRL._v4a0 || renderIRLOriginal) { enveloppePosee = true; return; }
    renderIRLOriginal = window.renderIRL;
    var enveloppe = function () {
      if (uiV4a0Enabled()) {
        try { window._passioIrlSkipGeoOnce = true; } catch (e) { fail("geo_skip", e); }
      }
      var r = renderIRLOriginal.apply(this, arguments);
      if (uiV4a0Enabled()) {
        try { poserHead(); } catch (e) { fail("head_post_render", e); }
      }
      return r;
    };
    enveloppe._v4a0 = true;
    window.renderIRL = enveloppe;
    enveloppePosee = true;
  }

  // ⚠️ `renderIRLOriginal` n'est remis à null QUE si l'enveloppe a réellement été
  // retirée. Si un sous-lot a enveloppé par-dessus, la nôtre reste dans la
  // chaîne : l'oublier ferait planter le prochain rendu sur un `null.apply`.
  // Elle devient simplement inerte, `uiV4a0Enabled()` étant désormais faux.
  function retirerEnveloppeRender() {
    if (!enveloppePosee) return;
    if (renderIRLOriginal && window.renderIRL && window.renderIRL._v4a0) {
      window.renderIRL = renderIRLOriginal;
      renderIRLOriginal = null;
    }
    enveloppePosee = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVATION / COUPURE
  // ══════════════════════════════════════════════════════════════════════════
  function apply() {
    var on = uiV4a0Enabled();
    var root = document.documentElement;

    if (!on) {
      root.classList.remove(ROOT_CLASS);
      retirerEnveloppeRender();
      retirerHead();
      // Le champ historique reprend la main : il n'a jamais quitté le DOM, il
      // était seulement masqué par la classe racine que l'on vient de retirer.
      emettre("passio:ui4a0-apply", { on: false });
      return false;
    }

    root.classList.add(ROOT_CLASS);
    poserEnveloppeRender();
    poserHead();
    emettre("passio:ui4a0-apply", { on: true });
    return true;
  }

  // ⚠️ En PRODUCTION, le bloc app n'est pas dans la page : `scripts/build.js` le
  // sort dans `app.js`, injecté seulement une fois le code d'accès franchi. Ce
  // module, lui, est inliné et s'exécute tout de suite : au premier `boot()`,
  // `renderIRL` n'existe pas encore et l'enveloppe anti-GPS ne peut pas être
  // posée. On repasse donc à l'événement `passio:app-ready` émis par le loader,
  // avec une reprise bornée en secours (jamais de boucle infinie, jamais de
  // `requestAnimationFrame` : une page qui ne compose pas de frame ne le déclenche
  // pas — piège payé au lot UI-3A).
  var essais = 0;
  function boot() {
    try {
      var on = apply();
      if (on && !enveloppePosee && essais++ < 80) setTimeout(boot, 150);
    } catch (e) { fail("boot", e); }
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste
  // vert). `intents()` rend une COPIE : personne ne modifie l'état du lot par
  // effet de bord.
  window.PassioUIV4A0 = {
    PREVIEW_NAME: PREVIEW_NAME,
    DEMO_PREVIEW_NAME: DEMO_PREVIEW_NAME,
    isEnabled: uiV4a0Enabled,
    apply: apply,
    refresh: syncHead,
    intents: function () { return intentions.slice(); },
    setIntents: setIntents,
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
