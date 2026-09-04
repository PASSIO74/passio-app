// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-4A5 : « Filtre » est une VUE de « Rencontrer ».
// ──────────────────────────────────────────────────────────────────────────
// ① 2026-08-29, après essai réel : « les bulles de profil dans le filtre, et
//    l'onglet Filtres fait comme pour Liste et Carte : quand on clique dessus
//    tu n'ouvres plus un panel mais tu affiches dessous tous les choix. »
//    La troisième case a donc cessé d'ouvrir un dialogue pour devenir une VUE.
//
// ② 2026-09-04, maquette validée : la vue est réorganisée en QUATRE SECTIONS
//    NOMMÉES, dans cet ordre, et rien d'autre :
//
//        Quand ?            Aujourd'hui · Cette semaine · Ce week-end
//                           + « Choisir une date » (le vrai calendrier)
//        Où ?               la ville / position de référence + « Modifier »
//                           + Distance maximale : 5 · 10 · 25 · 50 km
//        Quelles passions ? Toutes · Mes passions · Chercher, puis les bulles
//        Horaire            Matin · Après-midi · Soir
//
//    puis, discrètement, une ligne « Mes événements | Mes rencontres », et un
//    bouton violet FIXE « Afficher N résultats » posé juste au-dessus de la
//    barre d'onglets.
//
//    ⚠️ Le mot est « Filtre », au SINGULIER, partout : la case du commutateur,
//    le titre de la page, le dialogue de repli. Jamais « Filtres », jamais
//    « Filtrer les rencontres ».
//
//    ⚠️ Les quatre « intentions » (Tous · Cette semaine · Ma ville · Mes
//    passions) ne sont plus RENDUES DANS CETTE VUE : chacune de leurs trois
//    actions y est devenue une commande explicite et nommée — « Cette semaine »
//    est une case de « Quand ? », « Ma ville » est la carte de « Où ? », « Mes
//    passions » est une case de « Quelles passions ? ». Le module UI-4A0/4A1
//    n'est pas touché : sous `passio_ui_4a5="0"` il reprend sa place dans la
//    tête et dans le dialogue d'outils, à la lettre.
//
// ── Ce que ce lot ne fait TOUJOURS PAS ────────────────────────────────────
// Aucun moteur de filtrage n'est écrit ici. Pas un seul. Tout est SERVI par
// l'existant :
//   • les bulles de passion sont le nœud `#irlPassionRow` DÉPLACÉ — le moteur
//     `renderIrlPassionTiles()` continue d'y écrire, la délégation
//     `[data-irlpassion]` continue de le lire ;
//   • le calendrier est le volet `#irlPaneDate` DÉPLACÉ depuis la feuille
//     `#irlFiltersPanel` — `_renderIrlInlineCal` et `_syncIrlFilterTabs` le
//     retrouvent par son `id`, et les `onclick` inline de ses cellules ne
//     survivraient pas à une régénération ;
//   • « Quand ? » appelle `setIrlDateFilter`, « Distance » `setIrlDistanceKm`,
//     « Horaire » `setIrlTimePreset`, « Toutes / Mes passions »
//     `setIrlPassionsToutes` / `setIrlPassionsMiennes`, « Modifier »
//     `openIrlCitySelector`, « Chercher » `ouvrirRecherchePassionIRL` — toutes
//     dans app-07, toutes écrivant dans les MÊMES variables que la feuille
//     historique ;
//   • « Mes événements » et « Mes rencontres » portent `data-irlfilter`, dont
//     la délégation globale existe depuis toujours (app-07) ;
//   • le nombre du pied est celui que `_syncIrlFiltersFooter(n)` publie à
//     chaque rendu (`window._irlResultCount`). On le RECOPIE : un second
//     comptage divergerait le jour où le filtrage changerait.
//
// ── Activation — ACTIF PAR DÉFAUT ─────────────────────────────────────────
//     localStorage.passio_ui_4a5 = "0"    → kill switch local, prioritaire
//     window.PASSIO_UI_4A5 = false        → coupure immédiate en mémoire
//
// Le drapeau ne sait qu'ENLEVER : aucune valeur positive n'active, rien n'est
// écrit dans `localStorage`. La coupure REND les nœuds déplacés à leur place
// AVANT de retirer le panneau, sinon la suppression les emporterait.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var STORAGE_KEY = "passio_ui_4a5";
  var ROOT_CLASS = "passio-ui-4a5";
  var VERSION = "ui4a5";
  var ATTR_VUE = "data-v4a5-vue";      // "filtres" quand la vue est ouverte

  var PANNEAU_ID = "v4a5Panneau";
  var AVANCE_ID = "v4a5Avance";        // hôte du calendrier déplacé
  var PASSIONS_ID = "v4a5Passions";    // hôte des bulles déplacées
  var PIED_ID = "v4a5Pied";
  var DONE_ID = "v4a5Done";
  var RESET_ID = "v4a5Reset";

  // ⚠️ VOLET DATE REPLIÉ À L'OUVERTURE (2026-09-02, « je voudrais que tout
  // tienne sur la page sans descendre »). Le calendrier pèse ~340 px à lui
  // seul. `_syncIrlFilterTabs()` lit `window._irlFilterTab || "date"` et pose
  // la classe `on` sur le volet correspondant, À CHAQUE `renderIRL()` : une
  // valeur qui ne désigne AUCUN onglet laisse donc le volet replié, sans
  // toucher au moteur ni masquer quoi que ce soit en CSS.
  //
  // ⚠️ Elle doit être NON VIDE : `""` est faux, et le moteur retomberait sur
  // « date ». Et elle est rendue à "date" quand la vue se ferme ou que le
  // drapeau tombe, sinon la feuille historique (`openIrlFiltersPanel`, qui ne
  // repose la valeur que si elle est absente) s'ouvrirait sans aucun volet.
  var TAB_AUCUN = "aucun";

  // ── Les trois tables de choix. Les VALEURS sont celles du moteur ─────────
  // ⚠️ Ne jamais renommer une valeur : `today`, `week`, `weekend` sont écrites
  // dans `irlDateFilters` et relues par `_filterIrlEvents`, et « 6-12 » est la
  // clé que `_syncIrlTimeUI` pose déjà sur les pastilles du volet historique.
  var QUAND = [
    { val: "today", label: "Aujourd'hui" },
    { val: "week", label: "Cette semaine" },
    { val: "weekend", label: "Ce week-end" },
  ];
  var DISTANCES = ["5", "10", "25", "50"];
  var HORAIRES = [
    { debut: 6, fin: 12, label: "Matin" },
    { debut: 12, fin: 18, label: "Après-midi" },
    { debut: 18, fin: 23, label: "Soir" },
  ];
  var RACCOURCIS = [
    { filtre: "mine", label: "Mes événements" },
    // « Mes rencontres » = les activités auxquelles je me suis INSCRIT, le même
    // état `joined` que « Mes inscriptions » du dialogue historique. Seul le
    // mot change ; l'identifiant, lui, ne bouge pas.
    { filtre: "joined", label: "Mes rencontres" },
  ];

  var vueFiltres = false;
  var enPanne = false;
  var observateur = null;
  var listeObservee = null;
  var enAttente = false;
  var essais = 0;
  var sigLieu = null;
  var sigPied = null;

  // Places d'origine, pour les rendre à la coupure. `null` = jamais déplacé.
  var origPassion = null;                // { parent, next }
  var origAvance = [];                   // [{ node, parent, next }]
  var haspopupOrigine = null;

  // ══════════════════════════════════════════════════════════════════════════
  // DRAPEAU — il ne sait qu'enlever.
  // ══════════════════════════════════════════════════════════════════════════
  function uiV4a5Enabled() {
    if (window.PASSIO_UI_4A5 === false) return false;    // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;                    // kill switch local
    return true;
  }

  function actif() { return !enPanne && uiV4a5Enabled(); }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  // Un `catch` muet sur un chemin de décision masque un ReferenceError. Tout
  // échec est audible, et strictement TECHNIQUE : ni titre, ni ville, ni
  // identifiant de personne, ni le texte tapé dans la recherche.
  function fail(ou, err) {
    var msg = "ui_v4a5 (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[ui-v4a5] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "ui_v4a5_filtres", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  // ⚠️ AUCUNE clé de `meta` ne doit percuter le filtre PII de `telemetry.js`
  // (`pass`, `name`, `label`, `city`, `ville`, `lat`, `lng`, `location`…) : une
  // clé filtrée disparaît EN SILENCE. Et surtout : la position précise de
  // l'utilisateur n'est JAMAIS mesurée — on n'envoie ni ville, ni coordonnées.
  function track(nom, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") window.tel.action(nom, meta || { v: VERSION });
    } catch (e) {}
  }

  // ── Accès au DOM historique ───────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function ecranIrl() { return el("screen-irl"); }
  function barreVues() { return el("v4a3Vue"); }
  function declencheur() { return el("irlToolsBtn"); }
  function liste() { return el("eventList"); }
  function panneau() { return el(PANNEAU_ID); }
  function coque() { return document.querySelector(".app-shell"); }

  function replierVolets() {
    try {
      window._irlFilterTab = TAB_AUCUN;
      if (typeof _syncIrlFilterTabs === "function") _syncIrlFilterTabs();
    } catch (e) { fail("replier_volets", e); }
  }

  function rendreVoletParDefaut() {
    try {
      if (window._irlFilterTab === TAB_AUCUN) window._irlFilterTab = "date";
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTION DU PANNEAU
  // Construit UNE fois, jamais régénéré : il héberge des nœuds déplacés (les
  // bulles, le calendrier) et des cases dont le clic déclenche un rendu. Le
  // régénérer les arracherait — c'est exactement le piège d'UI-4A4.
  //
  // ⚠️ Tout est bâti par `createElement` + `textContent` : aucun contenu
  // utilisateur n'entre ici, et rien n'est concaténé en HTML.
  // ══════════════════════════════════════════════════════════════════════════

  // Une case de choix : coche + libellé. L'état vit sur `aria-pressed`, et la
  // coche le redit une seconde fois — il ne tient jamais à la seule couleur.
  function caseChoix(label, attr, valeur) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "v4a5-case";
    b.setAttribute(attr, valeur);
    b.setAttribute("aria-pressed", "false");
    var mark = document.createElement("span");
    mark.className = "v4a5-case-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "✓";
    var txt = document.createElement("span");
    txt.className = "v4a5-case-txt";
    txt.textContent = label;
    b.appendChild(mark);
    b.appendChild(txt);
    return b;
  }

  function bloc(titre, id) {
    var s = document.createElement("section");
    s.className = "v4a5-bloc";
    if (id) s.id = id;
    var t = document.createElement("h3");
    t.className = "v4a5-bloc-titre";
    t.textContent = titre;
    s.appendChild(t);
    return s;
  }

  function svgIcone(d, extra) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var chemins = [d].concat(extra || []);
    for (var i = 0; i < chemins.length; i++) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", chemins[i]);
      svg.appendChild(p);
    }
    return svg;
  }

  function construirePanneau() {
    var wrap = document.createElement("div");
    wrap.className = "v4a5-panneau";
    wrap.id = PANNEAU_ID;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Filtre des activités");

    // ── ① Quand ? ──────────────────────────────────────────────────────────
    var quand = bloc("Quand ?", "v4a5BlocQuand");
    // « Tout effacer » n'a PAS de case à lui : c'est une commande, pas un
    // filtre. Elle se pose au bout du premier titre, en petit, et s'éteint
    // quand il n'y a rien à effacer — un bouton toujours actif qui ne fait
    // rien est un bouton qui ment.
    var tete = document.createElement("div");
    tete.className = "v4a5-bloc-tete";
    tete.appendChild(quand.firstChild);              // le <h3> déjà créé
    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "v4a5-reset";
    reset.id = RESET_ID;
    reset.textContent = "Tout effacer";
    reset.addEventListener("click", function () {
      try {
        if (typeof clearAllIrlFilters === "function") clearAllIrlFilters();
        replierVolets();
        track("ui_v4a5_reset", { v: VERSION });
      } catch (e) { fail("reset", e); }
    });
    tete.appendChild(reset);
    quand.insertBefore(tete, quand.firstChild);

    var gQuand = document.createElement("div");
    gQuand.className = "v4a5-choix";
    gQuand.id = "v4a5Quand";
    QUAND.forEach(function (q) {
      var b = caseChoix(q.label, "data-v4a5-quand", q.val);
      b.addEventListener("click", function () {
        try {
          if (typeof setIrlDateFilter === "function") setIrlDateFilter(q.val);
          track("ui_v4a5_quand", { v: VERSION, quand: q.val });
        } catch (e) { fail("quand", e); }
      });
      gQuand.appendChild(b);
    });
    quand.appendChild(gQuand);

    // « Choisir une date » : une LIGNE, pas une case — elle n'est pas un choix
    // de plus, elle déplie le calendrier réel. L'icône reste : elle est
    // FONCTIONNELLE (elle dit ce que la ligne ouvre), contrairement aux
    // pictogrammes de titre, retirés le 2026-09-04.
    var ligne = document.createElement("button");
    ligne.type = "button";
    ligne.className = "v4a5-ligne";
    ligne.id = "v4a5DateBtn";
    ligne.setAttribute("aria-expanded", "false");
    ligne.setAttribute("aria-controls", AVANCE_ID);
    var ico = document.createElement("span");
    ico.className = "v4a5-ligne-ico";
    ico.appendChild(svgIcone("M4 6.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z",
      ["M8 2.6v3.4", "M16 2.6v3.4", "M4 10h16"]));
    var txt = document.createElement("span");
    txt.className = "v4a5-ligne-txt";
    txt.id = "v4a5DateTxt";
    txt.textContent = "Choisir une date";
    var go = document.createElement("span");
    go.className = "v4a5-ligne-go";
    go.setAttribute("aria-hidden", "true");
    go.appendChild(svgIcone("M9 5l7 7-7 7"));
    ligne.appendChild(ico);
    ligne.appendChild(txt);
    ligne.appendChild(go);
    ligne.addEventListener("click", function () { basculerCalendrier(); });
    quand.appendChild(ligne);

    // Hôte du calendrier historique (`#irlPaneDate`), déplacé par `poserAvance`.
    var hoteCal = document.createElement("div");
    hoteCal.className = "v4a5-volet";
    hoteCal.id = AVANCE_ID;
    quand.appendChild(hoteCal);
    wrap.appendChild(quand);

    // ── ② Où ? ─────────────────────────────────────────────────────────────
    var ou = bloc("Où ?", "v4a5BlocOu");
    var lieu = document.createElement("div");
    lieu.className = "v4a5-lieu";
    var lico = document.createElement("span");
    lico.className = "v4a5-lieu-ico";
    lico.appendChild(svgIcone("M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z",
      ["M14.6 10a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0"]));
    var corps = document.createElement("span");
    corps.className = "v4a5-lieu-corps";
    var nom = document.createElement("b");
    nom.id = "v4a5LieuNom";
    nom.textContent = "…";
    var sub = document.createElement("span");
    sub.id = "v4a5LieuSub";
    sub.className = "v4a5-lieu-sub";
    sub.textContent = "";
    corps.appendChild(nom);
    corps.appendChild(sub);
    var modif = document.createElement("button");
    modif.type = "button";
    modif.className = "v4a5-lieu-btn";
    modif.id = "v4a5LieuBtn";
    modif.textContent = "Modifier";
    modif.appendChild(svgIcone("M9 5l7 7-7 7"));
    modif.addEventListener("click", function (e) {
      e.stopPropagation();
      try {
        if (typeof openIrlCitySelector === "function") openIrlCitySelector();
        track("ui_v4a5_lieu", { v: VERSION });
      } catch (err) { fail("lieu", err); }
    });
    lieu.appendChild(lico);
    lieu.appendChild(corps);
    lieu.appendChild(modif);
    ou.appendChild(lieu);

    var sTitre = document.createElement("div");
    sTitre.className = "v4a5-sous-titre";
    sTitre.textContent = "Distance maximale";
    ou.appendChild(sTitre);

    var gDist = document.createElement("div");
    gDist.className = "v4a5-choix v4a5-choix-4";
    gDist.id = "v4a5Dist";
    DISTANCES.forEach(function (km) {
      var b = caseChoix(km + " km", "data-v4a5-dist", km);
      b.addEventListener("click", function () {
        try {
          if (typeof setIrlDistanceKm === "function") setIrlDistanceKm(km);
          track("ui_v4a5_dist", { v: VERSION, km: Number(km) });
        } catch (e) { fail("dist", e); }
      });
      gDist.appendChild(b);
    });
    ou.appendChild(gDist);
    wrap.appendChild(ou);

    // ── ③ Quelles passions ? ───────────────────────────────────────────────
    var pass = bloc("Quelles passions ?", "v4a5BlocPassions");
    var gModes = document.createElement("div");
    gModes.className = "v4a5-choix";
    gModes.id = "v4a5Modes";
    [
      { mode: "toutes", label: "Toutes" },
      { mode: "miennes", label: "Mes passions" },
      { mode: "chercher", label: "Chercher" },
    ].forEach(function (m) {
      var b = caseChoix(m.label, "data-v4a5-passions", m.mode);
      b.addEventListener("click", function () {
        try {
          if (m.mode === "toutes" && typeof setIrlPassionsToutes === "function") setIrlPassionsToutes();
          else if (m.mode === "miennes" && typeof setIrlPassionsMiennes === "function") setIrlPassionsMiennes();
          else if (m.mode === "chercher" && typeof ouvrirRecherchePassionIRL === "function") ouvrirRecherchePassionIRL();
          track("ui_v4a5_passions", { v: VERSION, mode: m.mode });
        } catch (e) { fail("passions", e); }
      });
      gModes.appendChild(b);
    });
    pass.appendChild(gModes);

    // Hôte des bulles historiques (`#irlPassionRow`), déplacées par
    // `poserPassions`. La section garde son `id` : trois suites et le bloc CSS
    // du lot le visent.
    var hotePass = document.createElement("div");
    hotePass.className = "v4a5-section";
    hotePass.id = PASSIONS_ID;
    pass.appendChild(hotePass);
    wrap.appendChild(pass);

    // ── ④ Horaire ──────────────────────────────────────────────────────────
    var hor = bloc("Horaire", "v4a5BlocHoraire");
    var gHor = document.createElement("div");
    gHor.className = "v4a5-choix";
    gHor.id = "v4a5Horaire";
    HORAIRES.forEach(function (h) {
      var b = caseChoix(h.label, "data-v4a5-horaire", h.debut + "-" + h.fin);
      b.addEventListener("click", function () {
        try {
          if (typeof setIrlTimePreset === "function") setIrlTimePreset(h.debut, h.fin);
          track("ui_v4a5_horaire", { v: VERSION, plage: h.debut + "-" + h.fin });
        } catch (e) { fail("horaire", e); }
      });
      gHor.appendChild(b);
    });
    hor.appendChild(gHor);
    wrap.appendChild(hor);

    // ── ⑤ Raccourcis personnels, sur UNE ligne, visuellement secondaires ────
    // ⚠️ `data-irlfilter` : la délégation globale d'app-07 les prend en charge,
    // et `renderIRL` repose leur classe `active` à chaque rendu. Aucun second
    // gestionnaire ici — deux écouteurs, ce serait deux bascules par clic.
    var racc = document.createElement("div");
    racc.className = "v4a5-raccourcis";
    racc.id = "v4a5Raccourcis";
    RACCOURCIS.forEach(function (r, i) {
      if (i > 0) {
        var sep = document.createElement("span");
        sep.className = "v4a5-raccourci-sep";
        sep.setAttribute("aria-hidden", "true");
        racc.appendChild(sep);
      }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "v4a5-raccourci";
      b.setAttribute("data-irlfilter", r.filtre);
      b.setAttribute("aria-pressed", "false");
      b.textContent = r.label;
      racc.appendChild(b);
    });
    wrap.appendChild(racc);

    return wrap;
  }

  // Le panneau se pose JUSTE SOUS le commutateur — « dessous », au sens propre
  // de la demande. Sans commutateur (UI-4A3 coupé), il se pose juste avant la
  // liste, ce qui revient au même endroit.
  function poserPanneau() {
    var p = panneau();
    var barre = barreVues();
    var l = liste();
    if (!p) {
      if (!l || !l.parentNode) return false;
      p = construirePanneau();
      if (barre && barre.parentNode) barre.parentNode.insertBefore(p, barre.nextSibling);
      else l.parentNode.insertBefore(p, l);
      return true;
    }
    // Auto-réparation de la position : UI-4A3 peut reposer sa barre APRÈS nous
    // (kill switch puis réactivation), ce qui mettrait le panneau au-dessus des
    // onglets. La condition redevient fausse dès le déplacement : pas de boucle.
    if (barre && barre.parentNode && p.previousElementSibling !== barre) {
      barre.parentNode.insertBefore(p, barre.nextSibling);
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LE PIED FIXE — « Afficher N résultats »
  // ⚠️ Il n'est PAS dans `#screen-irl` : il est posé dans `.app-shell`, en
  // frère de `.app-main` et de `.app-nav`, et positionné en absolu par rapport
  // à la coque. C'est la seule façon qu'il ne défile pas avec le contenu ET
  // qu'il reste dans la colonne de 440 px sur grand écran — un `position:
  // fixed` s'étalerait sur toute la fenêtre. La hauteur de la barre d'onglets
  // (`62px + env(safe-area-inset-bottom)`) est reprise telle quelle en CSS :
  // le bouton ne peut donc jamais passer sous la barre système du téléphone.
  // ══════════════════════════════════════════════════════════════════════════
  function pied() { return el(PIED_ID); }

  function poserPied() {
    var c = coque();
    if (!c) return;
    var p = pied();
    if (p && p.parentNode === c) return;
    if (!p) {
      p = document.createElement("div");
      p.className = "v4a5-pied";
      p.id = PIED_ID;
      var done = document.createElement("button");
      done.type = "button";
      done.className = "v4a5-done";
      done.id = DONE_ID;
      done.textContent = "Afficher les résultats";
      done.addEventListener("click", function () { fermer("done"); });
      p.appendChild(done);
    }
    var nav = c.querySelector(".app-nav");
    if (nav) c.insertBefore(p, nav); else c.appendChild(p);
  }

  // ⚠️ On RECOPIE le nombre publié par `_syncIrlFiltersFooter`, on ne recompte
  // rien : un second comptage divergerait le jour où `_filterIrlEvents`
  // changerait, et les deux nombres resteraient plausibles.
  function majPied() {
    var done = el(DONE_ID);
    var reset = el(RESET_ID);
    if (!done) return;
    var n = window._irlResultCount;
    var txt = (typeof n !== "number") ? "Afficher les résultats"
      : n === 0 ? "Aucun résultat"
      : n === 1 ? "Afficher 1 résultat"
      : "Afficher " + n + " résultats";
    var srcReset = el("irlFiltersResetBtn");
    var off = !!(srcReset && srcReset.disabled);
    var sig = txt + "|" + (off ? "1" : "0");
    if (sig === sigPied) return;
    sigPied = sig;
    done.textContent = txt;
    done.disabled = (n === 0);
    if (reset) {
      reset.disabled = off;
      reset.hidden = off;
    }
  }

  // ── Les bulles de passion entrent dans le filtre ─────────────────────────
  function poserPassions() {
    var row = el("irlPassionRow");
    var hote = el(PASSIONS_ID);
    if (!row || !hote) return;
    if (row.parentNode === hote) return;
    if (!origPassion) origPassion = { parent: row.parentNode, next: row.nextSibling };
    hote.appendChild(row);
  }

  function rendrePassions() {
    var row = el("irlPassionRow");
    if (!row || !origPassion || !origPassion.parent) { origPassion = null; return; }
    try {
      if (origPassion.next && origPassion.next.parentNode === origPassion.parent) {
        origPassion.parent.insertBefore(row, origPassion.next);
      } else {
        origPassion.parent.appendChild(row);
      }
    } catch (e) { fail("restitution_passions", e); }
    origPassion = null;
  }

  // ── Le calendrier ────────────────────────────────────────────────────────
  // Déplacé, jamais recréé : `_syncIrlFilterTabs` et `_renderIrlInlineCal` le
  // retrouvent par son `id`, et les `onclick` inline des cellules du
  // calendrier ne survivraient pas à une régénération.
  //
  // ⚠️ Seul `#irlPaneDate` monte ici. Les trois onglets carrés (`.irl-ftabs`)
  // et les volets Distance / Horaire restent dans la feuille historique : la
  // maquette du 2026-09-04 les remplace par les cases « 5/10/25/50 km » et
  // « Matin / Après-midi / Soir ». Ils continuent d'être synchronisés par
  // `renderIRL` — le kill switch retrouve donc la feuille complète.
  function poserAvance() {
    var hote = el(AVANCE_ID);
    var n = el("irlPaneDate");
    if (!hote || !n) return;
    if (n.parentNode === hote) return;
    origAvance.push({ node: n, parent: n.parentNode, next: n.nextSibling });
    hote.appendChild(n);
  }

  function rendreAvance() {
    for (var i = origAvance.length - 1; i >= 0; i--) {
      var o = origAvance[i];
      if (!o || !o.node || !o.parent) continue;
      try {
        if (o.next && o.next.parentNode === o.parent) o.parent.insertBefore(o.node, o.next);
        else o.parent.appendChild(o.node);
      } catch (e) { fail("restitution_avance", e); }
    }
    origAvance = [];
  }

  function calendrierOuvert() { return window._irlFilterTab === "date"; }

  function basculerCalendrier() {
    try {
      if (calendrierOuvert()) {
        replierVolets();
      } else if (typeof setIrlFilterTab === "function") {
        setIrlFilterTab("date");
      }
      majQuand();
      track("ui_v4a5_calendrier", { v: VERSION, ouvert: calendrierOuvert() });
    } catch (e) { fail("calendrier_bascule", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SYNCHRONISATION DES ÉTATS — l'écran MIROITE le moteur, il ne décide rien.
  // Appelée à chaque `appliquer()`, donc après chaque `renderIRL()`.
  // ══════════════════════════════════════════════════════════════════════════
  function cocher(noeud, on) {
    if (!noeud) return;
    var v = on ? "true" : "false";
    if (noeud.getAttribute("aria-pressed") !== v) noeud.setAttribute("aria-pressed", v);
  }

  function majQuand() {
    var g = el("v4a5Quand");
    if (g) {
      var cases = g.querySelectorAll("[data-v4a5-quand]");
      for (var i = 0; i < cases.length; i++) {
        var val = cases[i].getAttribute("data-v4a5-quand");
        cocher(cases[i], typeof irlDateFilterActif === "function" && irlDateFilterActif(val));
      }
    }
    var btn = el("v4a5DateBtn");
    var txt = el("v4a5DateTxt");
    var ouvert = calendrierOuvert();
    var pose = false;
    try { pose = typeof irlDateFilterActif === "function" && irlDateFilterActif("custom"); } catch (e) {}
    if (btn) {
      if (btn.getAttribute("aria-expanded") !== String(ouvert)) btn.setAttribute("aria-expanded", String(ouvert));
      btn.classList.toggle("is-open", ouvert);
      // ⚠️ Une date choisie au calendrier n'a AUCUNE case pour la porter : les
      // trois cases du dessus ne connaissent que « today », « week » et
      // « weekend ». Sans ce marqueur, la seule trace d'une période retenue
      // serait le libellé de la ligne — et un texte gris se lit comme un
      // repos. La ligne prend donc l'accent tant que la période tient.
      btn.classList.toggle("is-set", pose);
    }
    if (txt) {
      // ⚠️ La ligne ne dit la période que si elle vient DU CALENDRIER. Cocher
      // « Aujourd'hui » y écrivait « Aujourd'hui », juste sous la case qui le
      // disait déjà : la même information deux fois, à deux endroits, pour
      // deux commandes différentes. Une période choisie au calendrier, elle,
      // n'a aucune case pour la porter — c'est le seul cas où la ligne parle.
      var resume = "";
      try {
        if (pose && typeof irlDateResumeTexte === "function") resume = irlDateResumeTexte();
      } catch (e) {}
      var voulu = resume || "Choisir une date";
      if (txt.textContent !== voulu) txt.textContent = voulu;
    }
  }

  function majDistance() {
    var g = el("v4a5Dist");
    if (!g) return;
    var courant = "";
    try { if (typeof irlDistanceValue === "function") courant = irlDistanceValue(); } catch (e) {}
    var cases = g.querySelectorAll("[data-v4a5-dist]");
    for (var i = 0; i < cases.length; i++) {
      cocher(cases[i], cases[i].getAttribute("data-v4a5-dist") === courant && !!courant);
    }
  }

  function majHoraire() {
    var g = el("v4a5Horaire");
    if (!g) return;
    var cle = "";
    try { if (typeof irlTimePresetKey === "function") cle = irlTimePresetKey(); } catch (e) {}
    var cases = g.querySelectorAll("[data-v4a5-horaire]");
    for (var i = 0; i < cases.length; i++) {
      cocher(cases[i], !!cle && cases[i].getAttribute("data-v4a5-horaire") === cle);
    }
  }

  function majModes() {
    var g = el("v4a5Modes");
    if (!g) return;
    var mode = "choix";
    try { if (typeof irlPassionsMode === "function") mode = irlPassionsMode(); } catch (e) {}
    var cases = g.querySelectorAll("[data-v4a5-passions]");
    for (var i = 0; i < cases.length; i++) {
      var m = cases[i].getAttribute("data-v4a5-passions");
      // « Chercher » ouvre un sélecteur : ce n'est pas un état, donc jamais coché.
      cocher(cases[i], m !== "chercher" && m === mode);
    }
  }

  function majLieu() {
    var nom = el("v4a5LieuNom");
    var sub = el("v4a5LieuSub");
    if (!nom || !sub) return;
    var ref = { nom: "Choisir une ville", sub: "" };
    try { if (typeof irlLieuReference === "function") ref = irlLieuReference(); } catch (e) { fail("lieu_ref", e); }
    var sig = String(ref.nom) + "|" + String(ref.sub);
    if (sig === sigLieu) return;
    sigLieu = sig;
    nom.textContent = ref.nom;
    sub.textContent = ref.sub;
  }

  function majRaccourcis() {
    var g = el("v4a5Raccourcis");
    if (!g) return;
    var b = g.querySelectorAll("[data-irlfilter]");
    for (var i = 0; i < b.length; i++) {
      // `renderIRL` repose déjà la classe `active` : on ne fait que la refléter
      // sur `aria-pressed`, jamais l'inverse — l'état vit dans `irlFilters`.
      cocher(b[i], b[i].classList.contains("active"));
    }
  }

  function majTout() {
    majQuand();
    majDistance();
    majHoraire();
    majModes();
    majLieu();
    majRaccourcis();
    majPied();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉCLENCHEUR DEVIENT UN ONGLET
  // Le bouton reste le MÊME nœud (sa pastille `#irlToolsBadge` est alimentée
  // par `_updateIrlFiltersBtn` à chaque rendu — le recréer perdrait le
  // compteur, en silence). Seuls ses rôles changent, et ils sont rendus tels
  // quels à la coupure.
  // ══════════════════════════════════════════════════════════════════════════
  function poserRoleOnglet() {
    var btn = declencheur();
    if (!btn) return;
    if (btn.getAttribute("role") !== "tab") btn.setAttribute("role", "tab");
    if (btn.hasAttribute("aria-haspopup")) {
      if (haspopupOrigine === null) haspopupOrigine = btn.getAttribute("aria-haspopup");
      btn.removeAttribute("aria-haspopup");
    }
  }

  function rendreRoleOnglet() {
    var btn = declencheur();
    if (!btn) { haspopupOrigine = null; return; }
    btn.removeAttribute("role");
    btn.removeAttribute("aria-selected");
    btn.classList.remove("is-on");
    if (haspopupOrigine !== null) btn.setAttribute("aria-haspopup", haspopupOrigine);
    haspopupOrigine = null;
  }

  // Ré-alignement, jamais capture : on n'écrit que si la valeur diffère de
  // celle qu'UI-4A3 vient de poser. Sans cette garde, chaque rendu produirait
  // une écriture inutile — et l'observateur voit ses propres écritures.
  function syncOnglets() {
    var btn = declencheur();
    // ⚠️ Seulement s'il est ENCORE un onglet. À la coupure, `rendreRoleOnglet`
    // lui a rendu son rôle d'action : lui reposer un `aria-selected` laisserait
    // sur un simple bouton un attribut qui n'a de sens que dans un `tablist`.
    if (btn && btn.getAttribute("role") === "tab") {
      var on = vueFiltres ? "true" : "false";
      if (btn.getAttribute("aria-selected") !== on) btn.setAttribute("aria-selected", on);
      btn.classList.toggle("is-on", vueFiltres);
    }
    var barre = barreVues();
    if (!barre) return;
    var onglets = barre.querySelectorAll("[data-v4a3-onglet]");
    for (var i = 0; i < onglets.length; i++) {
      var o = onglets[i];
      if (vueFiltres) {
        // La vue Filtre prend la sélection : deux onglets ne peuvent pas être
        // sélectionnés en même temps dans un même `tablist`.
        if (o.getAttribute("aria-selected") !== "false") o.setAttribute("aria-selected", "false");
        o.classList.remove("is-on");
      } else if (window.PassioUIV4A3 && typeof PassioUIV4A3.vue === "function") {
        var sel = o.getAttribute("data-v4a3-onglet") === PassioUIV4A3.vue();
        if (o.getAttribute("aria-selected") !== String(sel)) o.setAttribute("aria-selected", String(sel));
        o.classList.toggle("is-on", sel);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OUVERTURE / FERMETURE DE LA VUE
  // ══════════════════════════════════════════════════════════════════════════
  function ouvrir() {
    if (!actif()) return;
    vueFiltres = true;
    // La carte quitte l'écran comme en vue Liste : trois vues exclusives.
    try {
      if (window.PassioUIV4A3 && typeof PassioUIV4A3.vue === "function"
        && PassioUIV4A3.vue() === "carte" && typeof PassioUIV4A3.setVue === "function") {
        PassioUIV4A3.setVue("liste");
      }
    } catch (e) { fail("vue_carte", e); }
    document.documentElement.setAttribute(ATTR_VUE, "filtres");
    appliquer();
    // ⚠️ Le calendrier n'est peint qu'à l'ouverture de la feuille historique
    // (`openIrlFiltersPanel`), que ce lot ne passe plus jamais. Sans cet appel,
    // le volet Date s'ouvre VIDE — un échec parfaitement muet.
    try { if (typeof _renderIrlInlineCal === "function") _renderIrlInlineCal(); } catch (e) { fail("calendrier", e); }
    // Le calendrier repart replié : c'est ce qui fait tenir la page sur un
    // écran. Un tap sur « Choisir une date » l'ouvre.
    replierVolets();
    try { if (typeof _syncIrlDistanceUI === "function") _syncIrlDistanceUI(); } catch (e) {}
    try { if (typeof _syncIrlTimeUI === "function") _syncIrlTimeUI(); } catch (e) {}
    syncOnglets();
    majTout();
    // Les choix s'affichent DESSOUS : encore faut-il les voir.
    try {
      var main = el("appMain");
      if (main) main.scrollTop = 0;
    } catch (e) {}
    track("ui_v4a5_ouvre", { v: VERSION });
  }

  function fermer(raison) {
    if (!vueFiltres) return;
    vueFiltres = false;
    document.documentElement.removeAttribute(ATTR_VUE);
    rendreVoletParDefaut();
    syncOnglets();
    track("ui_v4a5_ferme", { v: VERSION, r: String(raison || "onglet") });
  }

  function basculer() {
    if (vueFiltres) fermer("onglet");
    else ouvrir();
  }

  // ⚠️ CAPTURE sur `document`, et `stopPropagation()`. Le bouton porte un
  // `onclick` inline (`ContextualTools.open('irl', this)`) : un écouteur posé
  // sur le bouton s'exécuterait APRÈS lui. Arrêter l'événement AVANT qu'il
  // n'atteigne la cible est la seule façon de neutraliser l'attribut sans le
  // retirer — et il redevient actif dès la coupure, sans rechargement.
  document.addEventListener("click", function (e) {
    if (!actif()) return;
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;
    if (t.closest("#irlToolsBtn")) {
      e.preventDefault();
      e.stopPropagation();
      basculer();
      return;
    }
    // Un clic sur Liste ou Carte rend la main à UI-4A3 : la vue Filtre se
    // referme, et l'événement suit son cours normal.
    if (vueFiltres && t.closest("[data-v4a3-onglet]")) fermer("vue");
  }, true);

  // ══════════════════════════════════════════════════════════════════════════
  // APPLICATION
  // ══════════════════════════════════════════════════════════════════════════
  function appliquer() {
    // ⚠️ VERROU DE COUPURE. Un rendez-vous armé AVANT la coupure survit à
    // l'arrêt de l'observateur : sans ce test, il reconstruirait le panneau
    // juste après sa dépose, et le kill switch paraîtrait sans effet.
    if (!actif()) return;
    try {
      observer();                       // (ré)abonne `#eventList` dès qu'elle existe
      // ⚠️ Quitter l'écran referme la vue. Sans ça, ouvrir Filtre puis passer
      // au Fil et revenir sur « Rencontrer » ramènerait le panneau au lieu de
      // la liste : un écran qui ne montre pas son contenu, sans que rien ne
      // l'ait demandé. L'état de la vue vit en mémoire et repart de la liste.
      var ecran = ecranIrl();
      if (vueFiltres && ecran && !ecran.classList.contains("active")) fermer("ecran");
      if (!poserPanneau()) return;
      poserPied();
      poserRoleOnglet();
      poserPassions();
      poserAvance();
      majTout();
      syncOnglets();
    } catch (e) {
      // On écrit dans ce que l'on observe : sans verrou, une erreur
      // reproductible relancerait la décoration à l'infini.
      enPanne = true;
      fail("decoration", e);
      apply();
    }
  }

  function planifier() {
    if (enAttente) return;
    enAttente = true;
    setTimeout(function () { enAttente = false; appliquer(); }, 0);
  }

  function apply() {
    var racine = document.documentElement;
    if (!actif()) {
      cesserObservation();
      vueFiltres = false;
      racine.classList.remove(ROOT_CLASS);
      racine.removeAttribute(ATTR_VUE);
      // Restituer AVANT de retirer le panneau : les nœuds déplacés vivent
      // dedans, le supprimer les emporterait.
      rendreVoletParDefaut();
      rendrePassions();
      rendreAvance();
      rendreRoleOnglet();
      var p = panneau();
      if (p && p.parentNode) p.parentNode.removeChild(p);
      var f = pied();
      if (f && f.parentNode) f.parentNode.removeChild(f);
      sigLieu = null;
      sigPied = null;
      syncOnglets();
      return false;
    }
    racine.classList.add(ROOT_CLASS);
    observer();
    planifier();
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBSERVATION
  // Deux cibles, et DEUX SEULEMENT :
  //   • `#screen-irl` en `childList` NON récursif — c'est là qu'apparaissent le
  //     commutateur d'UI-4A3, la rangée de passions et notre panneau ;
  //   • `#eventList` en `childList` — son contenu est réécrit à CHAQUE
  //     `renderIRL()`, ce qui est le signal « l'état des filtres a bougé ».
  //
  // ⚠️ PAS de `subtree` sur l'écran. `#irlMapWrap` en est un enfant direct et
  // MapLibre y mute le DOM à chaque frame d'animation : un observateur récursif
  // relancerait la synchronisation des dizaines de fois par seconde, pour rien.
  //
  // Nos propres écritures d'attributs (aria-pressed, disabled) ne réveillent
  // rien — on n'observe pas les attributs — et les réécritures de contenu sont
  // sous signature.
  //
  // ⚠️ `setTimeout`, JAMAIS `requestAnimationFrame` : rAF ne part pas sur une
  // page qui ne compose pas de frames (onglet en arrière-plan, headless).
  // Piège payé aux lots UI-3A, UI-3B, UI-4B.
  // ══════════════════════════════════════════════════════════════════════════
  function observer() {
    var ecran = ecranIrl();
    if (!ecran) return;
    try {
      if (!observateur) {
        observateur = new MutationObserver(function () { planifier(); });
        // `attributeFilter: ["class"]` sur l'écran LUI-MÊME (jamais ses
        // descendants) : c'est le seul signal de sortie d'écran, et nos
        // écritures d'attributs portent toutes sur des descendants.
        observateur.observe(ecran, { childList: true, attributes: true, attributeFilter: ["class"] });
      }
      // La liste peut n'exister qu'après le premier rendu (et un lot amont
      // pourrait un jour la remplacer) : on (ré)abonne dès qu'elle change.
      var l = liste();
      if (l && l !== listeObservee) {
        observateur.observe(l, { childList: true });
        listeObservee = l;
      }
    } catch (e) { fail("observateur", e); }
  }

  function cesserObservation() {
    try { if (observateur) observateur.disconnect(); } catch (e) {}
    observateur = null;
    listeObservee = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉMARRAGE
  // Chargé HORS du bloc BUILD:APP : en production ce fichier s'exécute AVANT
  // que l'application existe (le bloc app n'est injecté qu'une fois le code
  // d'accès franchi). Reprise bornée, cadencée par `setTimeout`, et compteur
  // remis à zéro par `passio:app-ready` — sans quoi le budget serait brûlé
  // pendant la saisie du code, et le lot resterait invisible (piège mesuré le
  // 2026-08-28 sur UI-4B).
  // ══════════════════════════════════════════════════════════════════════════
  function boot() {
    try {
      if (!ecranIrl() || !document.body) {
        if (essais++ > 80) return;
        setTimeout(boot, 150);
        return;
      }
      if (apply() && !panneau() && essais++ < 80) setTimeout(boot, 150);
    } catch (e) { fail("boot", e); }
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste vert).
  window.PassioUIV4A5 = {
    isEnabled: uiV4a5Enabled,
    isActive: actif,
    apply: apply,
    decorate: appliquer,
    open: ouvrir,
    close: function () { fermer("api"); },
    toggle: basculer,
    isOpen: function () { return vueFiltres; },
    calendarOpen: calendrierOuvert,
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
