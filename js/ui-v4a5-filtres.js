// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-4A5 : « Filtres » devient une VUE de « Rencontrer », et les
// bulles de passion y entrent.
// ──────────────────────────────────────────────────────────────────────────
// Demandé par Benjamin le 2026-08-29, après essai réel :
//   ① les bulles de profil (la rangée de passions) quittent le corps de
//      l'écran et entrent DANS le filtre ;
//   ② « Filtres » se comporte comme « Liste » et « Carte » : un clic n'ouvre
//      plus un panneau par-dessus l'écran, il AFFICHE DESSOUS tous les choix.
//
// Autrement dit, la troisième case du commutateur cesse d'être une action qui
// ouvre un dialogue pour devenir une VUE de plus. Trois vues exclusives :
//     [ Liste ]  [ Carte ]  [ Filtres ]
//
// ── Ce que ce lot ne fait PAS ─────────────────────────────────────────────
// Aucun moteur de filtrage n'est écrit ici. Pas un seul. Tout ce que le
// panneau affiche est SERVI par l'existant :
//   • les bulles de passion sont le nœud `#irlPassionRow` DÉPLACÉ — le moteur
//     `renderIrlPassionTiles()` continue d'y écrire, la délégation
//     `[data-irlpassion]` continue de le lire ;
//   • les quatre intentions sont CONSTRUITES par UI-4A0
//     (`PassioUIV4A0.renderIntentsInto`), seule détentrice de
//     `basculerIntention` — la seule voie qui émette l'événement dont UI-4A1
//     dépend ;
//   • « Choisir une ville », « Mes événements » et « Mes inscriptions » sont
//     les items de `irlToolsSections()`, rendus par
//     `ContextualTools.renderInto` — même échappement, même délégation
//     `[data-irlfilter]` ;
//   • le calendrier, le curseur de distance et la plage horaire sont les
//     nœuds `.irl-ftabs` / `#irlPaneDate` / `#irlPaneDist` / `#irlPaneTime`
//     DÉPLACÉS depuis la feuille `#irlFiltersPanel`. `renderIRL()` appelle
//     déjà `_syncIrlFilterTabs`, `_syncIrlDistanceUI`, `_syncIrlTimeUI` et
//     `_syncIrlFiltersFooter` à chaque rendu : ils retrouvent ces nœuds par
//     leur `id`, quel que soit leur parent. Rien à resynchroniser ici.
//
// ── DÉPLACER vs RECONSTRUIRE : la ligne de partage, et pourquoi ───────────
// On DÉPLACE ce qui est réécrit EN PLACE par un moteur (`#irlPassionRow`, dont
// l'`innerHTML` est refait à chaque rendu mais dont le nœud, lui, survit ; les
// volets de filtres, que personne ne recrée). On RECONSTRUIT ce qui vit dans
// un hôte réécrit en entier — c'est le cas des intentions dans le panneau
// contextuel (piège du lot UI-4A4 : une chip déplacée y était arrachée par son
// propre clic). Ici l'hôte est le NÔTRE et n'est jamais réécrit, mais on passe
// quand même par le constructeur d'UI-4A0 : le moteur d'intentions ne se
// duplique pas.
//
// ⚠️ Ce que le panneau réécrit, il le réécrit sous SIGNATURE. `#v4a5Outils`
// (les items ville / mes événements) et le pied dépendent de l'état des
// filtres : ils sont recalculés à chaque rendu, mais n'écrivent QUE si le
// résultat a changé — on écrit dans ce que l'on observe.
//
// ⚠️ Le clic sur `#irlToolsBtn` est intercepté en phase de CAPTURE sur
// `document`, avec `stopPropagation()`. C'est le seul moyen d'empêcher le
// `onclick` inline `ContextualTools.open('irl', this)` de partir : un écouteur
// posé sur le bouton lui-même s'exécuterait APRÈS l'attribut, l'ordre en phase
// « at target » étant celui de l'enregistrement. L'attribut reste intact dans
// le DOM et redevient actif dès la coupure.
//
// ⚠️ La sélection visuelle des onglets se dispute avec UI-4A3, qui repose
// `aria-selected` à chaque rendu (`syncBarre`). On ne lui prend pas son état :
// on le RÉ-ALIGNE après coup, et seulement quand la valeur diffère. UI-4A3
// n'observe que les enfants directs de `#screen-irl`, jamais les attributs :
// aucune de nos écritures ne le réveille, donc aucun aller-retour.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_4A5 === false   ·   localStorage.passio_ui_4a5 === "0"
// Le drapeau ne sait qu'ENLEVER : aucune valeur positive n'active, rien n'est
// écrit dans localStorage. La coupure rend `#irlPassionRow` et les volets de
// filtres à leur place d'origine, retire le panneau, et le bouton « Filtres »
// rouvre le dialogue historique — sans rechargement.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = "ui4a5";
  var STORAGE_KEY = "passio_ui_4a5";
  var ROOT_CLASS = "passio-ui-4a5";
  var ATTR_VUE = "data-v4a5-vue";        // "filtres" quand la vue est ouverte
  var PANNEAU_ID = "v4a5Panneau";
  var OUTILS_ID = "v4a5Outils";
  var INTENTS_ID = "v4a5Intents";
  var AVANCE_ID = "v4a5Avance";
  var PASSIONS_ID = "v4a5Passions";
  var PIED_ID = "v4a5Pied";
  var DONE_ID = "v4a5Done";
  var RESET_ID = "v4a5Reset";

  // ⚠️ VOLETS REPLIÉS À L'OUVERTURE (2026-09-02, demande de Benjamin : « je
  // voudrais que tout tienne sur la page sans descendre »). Le volet Date
  // s'ouvrait d'office et pesait 337 px à lui seul — le tiers du panneau —
  // alors que Distance et Horaire, eux, étaient repliés : « Voir les
  // activités » se trouvait hors de l'écran, donc valider ses choix
  // demandait de descendre.
  //
  // `_syncIrlFilterTabs()` lit `window._irlFilterTab || "date"` et pose la
  // classe `on` sur le volet correspondant, À CHAQUE `renderIRL()`. Une
  // valeur qui ne désigne AUCUN onglet laisse donc les trois volets repliés,
  // sans toucher au moteur ni masquer quoi que ce soit en CSS — ce qui aurait
  // fait mentir la pastille « ce filtre est actif » des onglets.
  //
  // ⚠️ Elle doit être NON VIDE : `""` est faux, et le moteur retomberait sur
  // « date ». Et elle est rendue à "date" quand la vue se ferme ou que le
  // drapeau tombe, sinon la feuille historique (`openIrlFiltersPanel`, qui ne
  // repose la valeur que si elle est absente) s'ouvrirait sans aucun volet.
  var TAB_AUCUN = "aucun";

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

  var vueFiltres = false;
  var enPanne = false;
  var observateur = null;
  var listeObservee = null;
  var enAttente = false;
  var essais = 0;
  var sigOutils = null;
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

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTION DU PANNEAU
  // Construit UNE fois, jamais régénéré : il héberge des nœuds déplacés (les
  // bulles, les volets) et des chips dont le clic déclenche un rendu. Le
  // régénérer les arracherait — c'est exactement le piège d'UI-4A4.
  // ══════════════════════════════════════════════════════════════════════════
  function section(titre, id) {
    var s = document.createElement("div");
    s.className = "ctx-section v4a5-section";
    if (id) s.id = id;
    if (titre) {
      var t = document.createElement("div");
      t.className = "ctx-section-title";
      t.textContent = titre;
      s.appendChild(t);
    }
    return s;
  }

  function construirePanneau() {
    var wrap = document.createElement("div");
    wrap.className = "v4a5-panneau";
    wrap.id = PANNEAU_ID;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Filtres des activités");

    // ① Les bulles de passion. La section est créée vide : `poserPassions`
    //    y déplace le nœud historique quand il existe.
    wrap.appendChild(section("Mes passions", PASSIONS_ID));

    // ② Les quatre intentions, construites par UI-4A0.
    var sIntents = section("Ce que je cherche");
    var hoteIntents = document.createElement("div");
    hoteIntents.className = "v4a5-intents";
    hoteIntents.id = INTENTS_ID;
    sIntents.appendChild(hoteIntents);
    wrap.appendChild(sIntents);

    // ③ Ville + « Mes événements / Mes inscriptions », servis par
    //    irlToolsSections() et rendus par ContextualTools.
    var sOutils = document.createElement("div");
    sOutils.className = "v4a5-outils";
    sOutils.id = OUTILS_ID;
    wrap.appendChild(sOutils);

    // ④ Date / Distance / Horaire : les volets historiques, déplacés.
    var sAvance = section("Date, distance, horaire", AVANCE_ID);
    wrap.appendChild(sAvance);

    // ⑤ Le pied : effacer, et revenir au résultat.
    var pied = document.createElement("div");
    pied.className = "v4a5-pied";
    pied.id = PIED_ID;

    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "btn secondary block";
    reset.id = RESET_ID;
    reset.textContent = "✕ Tout effacer";
    reset.addEventListener("click", function () {
      try {
        if (typeof clearAllIrlFilters === "function") clearAllIrlFilters();
        track("ui_v4a5_reset", { v: VERSION });
      } catch (e) { fail("reset", e); }
    });

    var done = document.createElement("button");
    done.type = "button";
    done.className = "btn primary block";
    done.id = DONE_ID;
    done.textContent = "Voir les activités";
    done.addEventListener("click", function () { fermer("done"); });

    pied.appendChild(reset);
    pied.appendChild(done);
    wrap.appendChild(pied);
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

  // ── ① Les bulles de passion entrent dans le filtre ───────────────────────
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

  // ── ② Les intentions ─────────────────────────────────────────────────────
  function poserIntentions() {
    var hote = el(INTENTS_ID);
    if (!hote || hote.firstChild) return;              // déjà construites
    var api = window.PassioUIV4A0;
    if (!api || typeof api.renderIntentsInto !== "function") return;   // lot amont coupé
    if (typeof api.isEnabled === "function" && !api.isEnabled()) return;
    api.renderIntentsInto(hote);
  }

  // ── ④ Les volets Date / Distance / Horaire ───────────────────────────────
  // Déplacés, jamais recréés : `_syncIrlFilterTabs`, `_syncIrlDistanceUI`,
  // `_syncIrlTimeUI` et `_renderIrlInlineCal` les retrouvent par leur `id`,
  // et les `onclick` inline des cellules du calendrier ne survivraient pas à
  // une régénération.
  function poserAvance() {
    var hote = el(AVANCE_ID);
    var source = el("irlFiltersPanel");
    if (!hote || !source) return;
    var noeuds = [];
    var tabs = source.querySelector(".irl-ftabs");
    if (tabs) noeuds.push(tabs);
    ["irlPaneDate", "irlPaneDist", "irlPaneTime"].forEach(function (id) {
      var n = el(id);
      if (n) noeuds.push(n);
    });
    for (var i = 0; i < noeuds.length; i++) {
      var n = noeuds[i];
      if (n.parentNode === hote) continue;
      origAvance.push({ node: n, parent: n.parentNode, next: n.nextSibling });
      hote.appendChild(n);
    }
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

  // ── ③ Ville / Mes événements — sous signature ────────────────────────────
  // La section « affiner » est RETIRÉE : ses contrôles sont juste au-dessous,
  // en ligne. Un item qui rouvrirait la feuille historique contredirait le lot.
  function majOutils() {
    var hote = el(OUTILS_ID);
    if (!hote) return;
    if (typeof irlToolsSections !== "function") return;
    if (!window.ContextualTools || typeof ContextualTools.renderInto !== "function") return;
    var config;
    try { config = irlToolsSections(); } catch (e) { fail("sections", e); return; }
    if (!config || !config.sections) return;
    var garde = { sections: config.sections.filter(function (s) { return s && s.id !== "affiner"; }) };
    var sig;
    try { sig = JSON.stringify(garde); } catch (e) { sig = null; }
    if (sig !== null && sig === sigOutils) return;     // rien n'a changé : on n'écrit pas
    if (ContextualTools.renderInto(hote, garde)) sigOutils = sig;
  }

  // ── ⑤ Le pied miroite le moteur, il ne recompte rien ─────────────────────
  // `_syncIrlFiltersFooter(n)` écrit déjà « Voir les 12 événements » et l'état
  // désactivé dans les boutons de la feuille historique, à CHAQUE rendu. On
  // recopie : un second comptage divergerait le jour où le filtrage changerait.
  function majPied() {
    var done = el(DONE_ID);
    var reset = el(RESET_ID);
    var srcDone = el("irlFiltersDoneBtn");
    var srcReset = el("irlFiltersResetBtn");
    var txt = (srcDone && srcDone.textContent) ? srcDone.textContent : "Voir les activités";
    var off = !!(srcReset && srcReset.disabled);
    var sig = txt + "|" + (off ? "1" : "0");
    if (sig === sigPied) return;
    sigPied = sig;
    if (done) done.textContent = txt;
    if (reset) {
      reset.disabled = off;
      reset.style.opacity = off ? ".45" : "1";
    }
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
        // La vue Filtres prend la sélection : deux onglets ne peuvent pas être
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
    // Les trois volets repartent repliés : c'est ce qui fait tenir le panneau
    // sur un écran. Un tap sur Date, Distance ou Horaire ouvre le sien.
    replierVolets();
    try { if (typeof _syncIrlDistanceUI === "function") _syncIrlDistanceUI(); } catch (e) {}
    try { if (typeof _syncIrlTimeUI === "function") _syncIrlTimeUI(); } catch (e) {}
    syncOnglets();
    majPied();
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
    // ⚠️ Un onglet de volet DÉJÀ ouvert se referme au second tap. Sans ça, le
    // panneau n'aurait plus qu'un sens : on peut déplier Date, jamais le
    // replier — et on retombe sur le panneau qui dépasse de l'écran. Le
    // `onclick` inline `setIrlFilterTab('date')` n'a pas de bascule : on
    // l'arrête en CAPTURE, exactement comme celui de `#irlToolsBtn`, et il
    // reste intact pour la coupure.
    var ftab = vueFiltres && t.closest(".irl-ftab");
    if (ftab && ftab.closest("#" + AVANCE_ID) && ftab.classList.contains("sel")) {
      e.preventDefault();
      e.stopPropagation();
      replierVolets();
      return;
    }

    // Un clic sur Liste ou Carte rend la main à UI-4A3 : la vue Filtres se
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
      // ⚠️ Quitter l'écran referme la vue. Sans ça, ouvrir Filtres puis passer
      // au Fil et revenir sur « Rencontrer » ramènerait le panneau au lieu de
      // la liste : un écran qui ne montre pas son contenu, sans que rien ne
      // l'ait demandé. L'état de la vue vit en mémoire et repart de la liste.
      var ecran = ecranIrl();
      if (vueFiltres && ecran && !ecran.classList.contains("active")) fermer("ecran");
      if (!poserPanneau()) return;
      poserRoleOnglet();
      poserPassions();
      poserIntentions();
      poserAvance();
      majOutils();
      majPied();
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
      sigOutils = null;
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
  // relancerait `irlToolsSections()` et sa signature des dizaines de fois par
  // seconde, pour rien. Rien de ce que ce lot doit voir ne se produit dans la
  // carte.
  //
  // Nos propres écritures d'attributs (aria-selected, disabled) ne réveillent
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
