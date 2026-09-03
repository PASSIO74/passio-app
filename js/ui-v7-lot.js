// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-7 : cohérence des interfaces déjà validées
// ──────────────────────────────────────────────────────────────────────────
// Trois surfaces, un seul module — elles partagent le même drapeau, la même
// mécanique d'observation et les mêmes verrous :
//
//   ③ LE FIL. La rangée des passions (`#profileStrip`) et celle des stories
//      sont RÉDUITES d'environ un quart. Rectifié le 2026-08-29 : ce lot avait
//      d'abord transformé les passions en pastilles « emoji + libellé » qui
//      revenaient à la ligne ; Benjamin les veut en BULLES comme avant, juste
//      plus petites. C'est donc purement une affaire de CSS — aucun moteur de
//      rendu, de classement ni de défilement n'est touché, et
//      `toggleProfileFilter` reste le seul point d'écriture. (`toggleFollowingFilter`
//      est mentionnée ici dans l'état d'origine du lot ; elle a été supprimée le
//      2026-08-30 avec la bascule `_showFollowingFeed` — ADR-010.)
//
//   ⑥ LE PROFIL. Des onglets NOMMÉS remplacent les onglets d'icônes, qui
//      redeviennent de petits sous-filtres DANS « Publications ». Rien n'est
//      retiré : les blocs historiques sont DÉPLACÉS dans des panneaux, jamais
//      régénérés.
//      ⚠️ ILS SONT DEUX, PLUS TROIS (ADR-011 §2) : « À propos » a été retiré
//      par la refonte multi-passion, et ce qu'il contenait vit désormais dans
//      le panneau `#passionManager`, ouvert à la demande.
//
//   ⑧ LA BOBINE. Après l'enregistrement, l'aperçu existant reçoit deux issues
//      explicites — « Recommencer » et « Continuer » — et « Continuer » ouvre
//      une feuille légère (description · passion · couverture · activité
//      facultative · Publier). Aucun montage, aucun filtre, aucune timeline.
//
// ⚠️ CINQ PIÈGES PAYÉS À L'ÉCRITURE, dans l'ordre où ils se présentent :
//
// ① `renderProfileStrip` (app-06) réécrit `#profileStrip.innerHTML` et garde
//    son propre cache `_lastHtml` : tout nœud injecté DANS la rangée serait
//    effacé au rendu suivant. C'est pourquoi la compacité des passions est
//    portée par le CSS seul — un module qui voudrait y ajouter quoi que ce
//    soit devrait le poser en FRÈRE du conteneur, jamais dedans.
//
// ② Les nœuds du profil sont DÉPLACÉS, pas régénérés. `#myPosts`,
//    `#profileList`, `#profileEvents`, `#profileTopPosts` et `.profile-tabs`
//    sont retrouvés PAR ID / PAR CLASSE par app-06 à chaque rendu, et les
//    onglets d'icônes portent des `onclick` inline. Reconstruire cette chaîne
//    HTML tuerait les uns et les autres (même règle qu'au lot UI-4B). Et c'est
//    l'ORDRE d'origine de l'écran qui est mémorisé, pas le « frère suivant » de
//    chaque nœud : ce frère a lui aussi déménagé, et rendre un bloc « avant
//    lui » restituait un ordre inventé.
//
// ③ `state` vaut `null` — pas `undefined` — tant qu'app-01 n'a pas tourné.
//    Tout accès à une propriété passe donc par `etat()`, jamais par un
//    `typeof state === "undefined"` suivi d'un `state.quelquechose`.
//
// ④ Le module est chargé HORS du bloc BUILD:APP : en production le bloc
//    applicatif n'est injecté qu'APRÈS le code d'accès. La reprise est bornée
//    par `setTimeout` (jamais `requestAnimationFrame`, qui ne part pas sur une
//    page qui ne compose aucune trame) et son compteur est REMIS À ZÉRO par
//    `passio:app-ready`.
//
// ⑤ Verrou de coupure dans chaque fonction de décoration : un rendez-vous armé
//    AVANT la coupure survivrait à l'arrêt de l'observateur et reconstruirait
//    la surface juste après sa dépose — le kill switch paraîtrait sans effet.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_7 === false   ·   localStorage.passio_ui_7 === "0"
// Le drapeau ne sait qu'ENLEVER : aucune valeur positive n'active, et rien
// n'est écrit dans `localStorage`.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = 1;
  var CLASSE_RACINE = "passio-ui-7";

  var enPanne = false;
  var essais = 0;

  // ── Drapeau ──────────────────────────────────────────────────────────────
  function actif() {
    try { if (window.PASSIO_UI_7 === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_7") === "0") return false; } catch (e) {}
    return true;
  }

  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v7] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v7 " + etape);
    } catch (x) {}
  }

  function track(nom, meta) {
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  // Piège ③ : `state` est `null` avant le boot d'app-01.
  function etat() {
    try { return (typeof state !== "undefined" && state) ? state : null; } catch (e) { return null; }
  }

  function el(id) { return document.getElementById(id); }

  function notifier(msg) {
    try { if (typeof toast === "function") { toast(msg); return; } } catch (e) {}
    try { if (window.console && console.warn) console.warn("[ui-v7] " + msg); } catch (e) {}
  }

  // Mémoire de l'ORDRE d'origine, et non du frère suivant de chaque nœud.
  // ⚠️ La nuance décide de la justesse du kill switch : quand on déplace neuf
  // blocs dans trois panneaux, le « frère suivant » mémorisé a lui-même
  // déménagé, et le remettre « avant lui » ne veut plus rien dire — la
  // restitution rendait l'écran dans un ordre inventé. On retient donc la liste
  // ordonnée des enfants AVANT le premier déplacement, et on la rejoue telle
  // quelle : `appendChild` déplace, donc rejouer l'ordre restaure l'ordre.
  var hoteOrigine = null;
  var ordreOrigine = null;

  function memoriserOrdre(hote) {
    if (ordreOrigine || !hote) return;
    hoteOrigine = hote;
    ordreOrigine = Array.prototype.slice.call(hote.children);
  }
  function deplacer(noeud, hote) {
    if (!noeud || !hote) return false;
    hote.appendChild(noeud);
    return true;
  }
  function rendreLesNoeuds() {
    if (!hoteOrigine || !ordreOrigine) return;
    try {
      for (var i = 0; i < ordreOrigine.length; i++) hoteOrigine.appendChild(ordreOrigine[i]);
    } catch (e) { fail("restitution", e); }
    hoteOrigine = null;
    ordreOrigine = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ③ LE FIL — les passions restent des bulles, simplement plus compactes
  // ══════════════════════════════════════════════════════════════════════════
  // Rien à faire en JavaScript : la compacité est entièrement portée par le
  // bloc CSS `:root.passio-ui-7 #screen-feed .profile-tile*`. Le rendu, le
  // défilement horizontal et les filtres restent ceux de `renderProfileStrip`
  // (app-06), qu'aucun code de ce module ne touche.

  // ══════════════════════════════════════════════════════════════════════════
  // ⑥ LE PROFIL — trois onglets nommés
  // ══════════════════════════════════════════════════════════════════════════
  var BARRE_ID = "v7ProfileTabs";
  // ⚠️ DEUX onglets, plus trois. La refonte multi-passion (§1) retire « À propos » :
  // les passions se présentent désormais en haut de l'écran, dans le rail de
  // bulles (`renderProfilePassionRail`, app-06), et leur GESTION vit dans le
  // panneau `#passionManager`, ouvert à la demande. Un troisième onglet aurait
  // gardé une deuxième liste de passions sous les deux premières — la
  // duplication que cette refonte supprime.
  var PANNEAUX = [
    { cle: "publications", libelle: "Publications" },
    { cle: "activites", libelle: "Activité" },
  ];
  var ongletActif = "publications";

  function ecranProfil() { return el("screen-profiles"); }

  // Le titre de section dont le texte contient `motif` (les titres n'ont pas
  // d'id ; on ne les régénère pas, on les déplace).
  function titreContenant(ecran, motif) {
    var titres = ecran.querySelectorAll(".section-title");
    for (var i = 0; i < titres.length; i++) {
      if ((titres[i].textContent || "").indexOf(motif) > -1) return titres[i];
    }
    return null;
  }

  function construireProfil() {
    var ec = ecranProfil();
    if (!ec || el(BARRE_ID)) return false;
    var carte = el("mainProfileCard");
    var listeProfils = el("profileList");
    var mesPosts = el("myPosts");
    if (!carte || !listeProfils || !mesPosts) return false;
    memoriserOrdre(ec);

    // ── La barre d'onglets, juste sous la carte d'identité ──
    var barre = document.createElement("div");
    barre.className = "v7-tabs";
    barre.id = BARRE_ID;
    barre.setAttribute("role", "tablist");
    barre.setAttribute("aria-label", "Sections du profil");

    var hotes = {};
    PANNEAUX.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "v7-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("data-v7-tab", p.cle);
      b.setAttribute("aria-selected", p.cle === ongletActif ? "true" : "false");
      b.setAttribute("aria-controls", "v7Pan-" + p.cle);
      b.textContent = p.libelle;
      b.addEventListener("click", function () { choisirOnglet(p.cle); });
      barre.appendChild(b);

      var pan = document.createElement("div");
      pan.className = "v7-pan";
      pan.id = "v7Pan-" + p.cle;
      pan.setAttribute("role", "tabpanel");
      pan.setAttribute("data-v7-pan", p.cle);
      pan.hidden = p.cle !== ongletActif;
      hotes[p.cle] = pan;
    });

    carte.parentNode.insertBefore(barre, carte.nextSibling);
    var ancre = barre;
    PANNEAUX.forEach(function (p) {
      ancre.parentNode.insertBefore(hotes[p.cle], ancre.nextSibling);
      ancre = hotes[p.cle];
    });

    // ── Publications : les sous-filtres, puis le contenu ──
    // ⚠️ 2026-08-31 : la ligne d'aide (`.profile-tabs-hint`) et le bloc
    // « 🔥 Publications populaires » ont été retirés du profil. On ne les
    // cherche donc plus : un `querySelector` qui ne trouve jamais rien est une
    // règle qui survit à la disparition de sa cible.
    var sousFiltres = ec.querySelector(".profile-tabs");
    if (sousFiltres) {
      // Marqueur seulement : les libellés sont posés DANS LE MARKUP depuis la
      // PR #185 (`.profile-tab-lbl`). Ce lot n'en repose aucun — deux libellés
      // pour un onglet, c'était le doublon garanti.
      sousFiltres.classList.add("v7-subfilters");
      deplacer(sousFiltres, hotes.publications);
    }
    deplacer(mesPosts, hotes.publications);

    // ── Activités : organisées et rejointes (le moteur est dans app-06) ──
    var titreAct = titreContenant(ec, "Mes activités");
    if (titreAct) deplacer(titreAct, hotes.activites);
    var evs = el("profileEvents");
    if (evs) deplacer(evs, hotes.activites);
    // ⚠️ 2026-08-31 : plus de lien « Trouver une activité » au bas de l'onglet.
    // Retiré sur demande de Benjamin — la barre du bas porte déjà « Rencontrer »,
    // qui mène au même écran, et le doublon alourdissait la section.

    // ⚠️ PLUS DE PANNEAU « À propos ». Ce qu'il contenait — le titre (« Mes
    // passions » à l'époque, « Gérer mes passions » depuis le 2026-09-03), la
    // phrase du modèle, le lien des passions archivées et la liste
    // `#profileList` — vit maintenant dans `#passionManager`, un panneau masqué
    // que les options du profil ouvrent à la demande (app-06). Ces nœuds ne sont
    // donc PAS déplacés ici : ils restent dans leur conteneur, qui est `hidden`
    // tant qu'on ne le demande pas.
    //
    // ⚠️ ET LE « LIEN » D'AJOUT N'EN EST PLUS UN : `#nouveauProfilLien` est la
    // BULLE « + » descendue du rail le 2026-09-03. Ce détail compte ICI parce
    // que `titreContenant(ec, motif)` (plus haut) cible des titres par leur
    // TEXTE : un futur `titreContenant(ec, "Mes passions")` écrit d'après ce
    // commentaire ne matcherait plus rien, en silence.
    //
    // ⚠️ Le lien secondaire « Carnets de voyage » a été retiré avec la
    // fonctionnalité elle-même (§6).

    ec.setAttribute("data-v7-profil", "1");
    return true;
  }

  // ⚠️ `lienSecondaire()` a été RETIRÉE le 2026-08-31 avec son unique appelant,
  // le lien « Trouver une activité » au bas de l'onglet Activité. La boucle de
  // nettoyage sur `.v7-secondaire` reste dans `retirerProfil()` : elle coûte un
  // `querySelectorAll` vide et rend proprement une session déjà décorée par la
  // version précédente du module, encore chargée dans un onglet ouvert.

  function choisirOnglet(cle) {
    ongletActif = cle;
    var barre = el(BARRE_ID);
    if (barre) {
      var btns = barre.querySelectorAll("[data-v7-tab]");
      for (var i = 0; i < btns.length; i++) {
        btns[i].setAttribute("aria-selected",
          btns[i].getAttribute("data-v7-tab") === cle ? "true" : "false");
      }
    }
    var pans = document.querySelectorAll("[data-v7-pan]");
    for (var j = 0; j < pans.length; j++) {
      pans[j].hidden = pans[j].getAttribute("data-v7-pan") !== cle;
    }
    track("ui_v7_profil_onglet", { tab: cle });
  }

  function retirerProfil() {
    try {
      var sf = document.querySelector(".profile-tabs.v7-subfilters");
      if (sf) sf.classList.remove("v7-subfilters");
      rendreLesNoeuds();
      var barre = el(BARRE_ID);
      if (barre && barre.parentNode) barre.parentNode.removeChild(barre);
      var pans = document.querySelectorAll("[data-v7-pan]");
      for (var j = 0; j < pans.length; j++) {
        if (pans[j].parentNode) pans[j].parentNode.removeChild(pans[j]);
      }
      var sec = document.querySelectorAll(".v7-secondaire");
      for (var k = 0; k < sec.length; k++) {
        if (sec[k].parentNode) sec[k].parentNode.removeChild(sec[k]);
      }
      var ec = ecranProfil();
      if (ec) ec.removeAttribute("data-v7-profil");
    } catch (e) { fail("profil_restitution", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⑧ LA BOBINE — deux issues après l'enregistrement, puis une feuille légère
  // ══════════════════════════════════════════════════════════════════════════
  var ACTIONS_ID = "v7BobineActions";
  var FEUILLE_ID = "v7BobineSheet";

  function editeur() { return el("mediaEditor"); }

  function modeBobine() {
    try {
      return !!(typeof meState !== "undefined" && meState && meState.mode === "bobine");
    } catch (e) { return false; }
  }

  // Aperçu prêt : l'éditeur est en phase d'édition, sur une bobine, avec une
  // vidéo réellement posée. C'est exactement l'état où `meEnterEditPhase()`
  // laisse l'écran après un relâchement du bouton d'enregistrement.
  function apercuPret() {
    var ed = editeur();
    if (!ed || !ed.classList.contains("phase-edit")) return false;
    if (!modeBobine()) return false;
    try { return !!(meState.media && meState.mediaType === "video"); } catch (e) { return false; }
  }

  function decorerBobine() {
    var ed = editeur();
    if (!ed) return;
    var bas = ed.querySelector(".me-bottom");
    if (!bas) return;

    if (!apercuPret()) {
      ed.removeAttribute("data-v7-bobine");
      var vieux = el(ACTIONS_ID);
      if (vieux && vieux.parentNode) vieux.parentNode.removeChild(vieux);
      return;
    }
    ed.setAttribute("data-v7-bobine", "1");
    if (el(ACTIONS_ID)) return;

    var rangee = document.createElement("div");
    rangee.id = ACTIONS_ID;
    rangee.className = "v7-bobine-actions";

    var recommencer = document.createElement("button");
    recommencer.type = "button";
    recommencer.className = "btn ghost block";
    recommencer.setAttribute("data-v7-bobine-act", "recommencer");
    recommencer.textContent = "Recommencer";
    recommencer.addEventListener("click", function () {
      track("ui_v7_bobine_recommencer", {});
      // Le moteur existant : il libère l'aperçu, vide les overlays et rouvre
      // la caméra. On ne duplique aucune de ces étapes.
      if (typeof meBackToCapture === "function") meBackToCapture();
      else notifier("Impossible de reprendre la capture ici.");
    });

    var continuer = document.createElement("button");
    continuer.type = "button";
    continuer.className = "btn primary block";
    continuer.setAttribute("data-v7-bobine-act", "continuer");
    continuer.textContent = "Continuer";
    continuer.addEventListener("click", function () { ouvrirFeuilleBobine(); });

    rangee.appendChild(recommencer);
    rangee.appendChild(continuer);
    bas.appendChild(rangee);
  }

  function retirerBobine() {
    var a = el(ACTIONS_ID);
    if (a && a.parentNode) a.parentNode.removeChild(a);
    var ed = editeur();
    if (ed) ed.removeAttribute("data-v7-bobine");
    fermerFeuilleBobine();
    var f = el(FEUILLE_ID);
    if (f && f.parentNode) f.parentNode.removeChild(f);
  }

  // ── La feuille de finition ───────────────────────────────────────────────
  // Volontairement minimale (§8) : description, passion, couverture,
  // association facultative à une activité, publier. Aucun montage, aucune
  // musique, aucun filtre, aucune timeline.
  function construireFeuilleBobine() {
    var f = el(FEUILLE_ID);
    if (f) return f;
    f = document.createElement("div");
    f.id = FEUILLE_ID;
    f.className = "v7-sheet-backdrop";
    f.hidden = true;
    f.innerHTML =
      '<div class="v7-sheet" role="dialog" aria-modal="true" aria-labelledby="v7BobineTitre">'
      + '<div class="v7-sheet-grip" aria-hidden="true"></div>'
      + '<div class="v7-sheet-head">'
      + '<h2 class="v7-sheet-title" id="v7BobineTitre">Ta bobine</h2>'
      + '<button type="button" class="v7-sheet-close" data-v7-close="1" aria-label="Fermer">×</button>'
      + "</div>"
      + '<div class="v7-sheet-body">'
      + '<label class="v7-champ"><span>Description</span>'
      + '<textarea class="input" id="v7BobineDesc" rows="2" maxlength="600"'
      + ' placeholder="Raconte ce moment en une phrase…"></textarea></label>'
      + '<label class="v7-champ"><span>Passion</span>'
      + '<select class="input" id="v7BobinePassion"></select></label>'
      + '<div class="v7-champ"><span>Couverture</span>'
      + '<div class="v7-cover-row">'
      + '<div class="v7-cover-vue" id="v7BobineCoverVue" aria-hidden="true">🎞️</div>'
      + '<button type="button" class="btn small ghost" id="v7BobineCoverBtn">Choisir une image</button>'
      + '<button type="button" class="btn small ghost" id="v7BobineCoverClear" hidden>Retirer</button>'
      + '</div>'
      + '<input type="file" accept="image/*" id="v7BobineCoverInput" hidden />'
      + '</div>'
      + '<label class="v7-champ"><span>Activité liée (facultatif)</span>'
      + '<select class="input" id="v7BobineEvent"></select></label>'
      + '</div>'
      + '<div class="v7-sheet-foot">'
      + '<button type="button" class="btn primary block" id="v7BobinePublier">Publier ma bobine</button>'
      + '</div>'
      + "</div>";

    f.addEventListener("click", function (e) {
      if (e.target === f || (e.target.closest && e.target.closest("[data-v7-close]"))) {
        fermerFeuilleBobine();
      }
    });
    document.body.appendChild(f);

    var input = el("v7BobineCoverInput");
    var btn = el("v7BobineCoverBtn");
    var clear = el("v7BobineCoverClear");
    if (btn && input) btn.addEventListener("click", function () { input.click(); });
    if (input) input.addEventListener("change", function (e) { lireCouverture(e); });
    if (clear) clear.addEventListener("click", function () { poserCouverture(null); });
    var pub = el("v7BobinePublier");
    if (pub) pub.addEventListener("click", function () { publierBobine(); });
    return f;
  }

  var couverture = null;   // data URL réduite, ou URL Storage une fois envoyée

  function poserCouverture(url) {
    couverture = url || null;
    var vue = el("v7BobineCoverVue");
    var clear = el("v7BobineCoverClear");
    if (vue) {
      vue.innerHTML = "";
      if (couverture) {
        var img = document.createElement("img");
        img.alt = "";
        img.src = couverture;                 // data:/blob: produits ici même
        vue.appendChild(img);
      } else {
        vue.textContent = "🎞️";
      }
    }
    if (clear) clear.hidden = !couverture;
  }

  // Réduction par canvas avant toute chose : une couverture pleine résolution
  // en base64 partirait dans `saveState()` et remplirait le quota local. On
  // borne à 640 px de large, en JPEG.
  function lireCouverture(e) {
    var f = e && e.target && e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var im = new Image();
      im.onload = function () {
        try {
          var max = 640;
          var w = im.width, h = im.height;
          if (w > max) { h = Math.round(h * (max / w)); w = max; }
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(im, 0, 0, w, h);
          poserCouverture(c.toDataURL("image/jpeg", 0.82));
        } catch (x) { fail("couverture", x); poserCouverture(String(r.result)); }
      };
      im.onerror = function () { notifier("Image illisible."); };
      im.src = String(r.result);
    };
    r.onerror = function () { notifier("Lecture du fichier impossible."); };
    r.readAsDataURL(f);
    try { e.target.value = ""; } catch (x) {}
  }

  function remplirPassions() {
    var s = el("v7BobinePassion");
    var st = etat();
    if (!s || !st || !st.user) return;
    // ⚠️ Même règle que `renderStudio` (app-06) depuis le lot UI-8 : on ne
    // propose pas de publier dans une passion archivée. Deux composeurs qui ne
    // répondent pas la même chose à « où puis-je publier ? », c'est la porte
    // dérobée assurée.
    var profils = (st.user.profiles || []).filter(function (p) {
      try {
        if (typeof passionsUnifieesActives === "function" && passionsUnifieesActives() && p.archived) return false;
        // ⚠️ FILTRE CANONIQUE — ajouté le 2026-08-31. Ce sélecteur était le SEUL
        // point d'écriture du dépôt à ne pas l'appliquer : il proposait une
        // passion personnelle, la PRÉSÉLECTIONNAIT même quand c'était le profil
        // actif, et la publication était ensuite refusée. Le commentaire juste
        // au-dessus annonçait précisément ce risque (« si les deux ne répondent
        // pas la même chose à "où puis-je publier ?", c'est la porte dérobée
        // assurée ») — il décrivait ce fichier.
        if (typeof estPassionCanonique === "function" && !estPassionCanonique(p.passion)) return false;
        return true;
      } catch (e) { return true; }
    });
    var courant = st.user.currentProfileId;
    s.innerHTML = "";
    profils.forEach(function (p) {
      var pn = (typeof passionById === "function") ? passionById(p.passion) : { emoji: "✨", label: p.passion };
      var o = document.createElement("option");
      o.value = p.passion;
      o.textContent = (pn.emoji ? pn.emoji + " " : "") + pn.label;
      if (p.id === courant) o.selected = true;
      s.appendChild(o);
    });
  }

  // Activités À VENIR que j'organise ou que j'ai rejointes : ce sont les seules
  // qu'une bobine puisse honnêtement illustrer. Aucune écriture, aucun RSVP.
  function remplirActivites() {
    var s = el("v7BobineEvent");
    if (!s) return;
    s.innerHTML = "";
    var vide = document.createElement("option");
    vide.value = "";
    vide.textContent = "Aucune";
    s.appendChild(vide);
    var evs = [];
    try {
      if (typeof allEvents === "function") {
        var maintenant = Date.now();
        evs = allEvents().filter(function (e) {
          if (!e || e.date < maintenant - 86400000) return false;
          var mien = (typeof _isMyEvent === "function") ? _isMyEvent(e) : false;
          var rep = (typeof myRsvp === "function") ? myRsvp(e.id) : null;
          return mien || (rep && rep !== "declined");
        }).slice(0, 20);
      }
    } catch (e) { fail("activites", e); evs = []; }
    evs.forEach(function (e) {
      var o = document.createElement("option");
      o.value = String(e.id);
      // textContent : le titre vient d'un compte tiers, il ne traverse jamais
      // une chaîne HTML.
      o.textContent = String(e.title || "Activité");
      s.appendChild(o);
    });
  }

  function ouvrirFeuilleBobine() {
    if (!apercuPret()) { notifier("Filme d'abord ta bobine."); return; }
    construireFeuilleBobine();
    remplirPassions();
    remplirActivites();
    poserCouverture(null);
    var d = el("v7BobineDesc");
    if (d) d.value = "";
    var f = el(FEUILLE_ID);
    if (!f) return;
    f.hidden = false;
    f.classList.add("open");
    document.addEventListener("keydown", surToucheFeuille, true);
    track("ui_v7_bobine_continuer", {});
  }

  function fermerFeuilleBobine() {
    var f = el(FEUILLE_ID);
    if (!f || f.hidden) return;
    f.classList.remove("open");
    f.hidden = true;
    document.removeEventListener("keydown", surToucheFeuille, true);
  }

  function surToucheFeuille(e) {
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); fermerFeuilleBobine(); }
  }

  // Publication : on RENSEIGNE `meState.details`, puis on appelle `mePublish()`.
  // C'est lui, et lui seul, qui construit le post, l'insère dans `state` et
  // lance `_publishReelWithFeedback`. Aucun second moteur de publication.
  function publierBobine() {
    var btn = el("v7BobinePublier");
    var desc = el("v7BobineDesc");
    var pass = el("v7BobinePassion");
    var ev = el("v7BobineEvent");
    if (typeof mePublish !== "function") {
      notifier("La publication n'est pas disponible ici.");
      return;
    }
    var details = {
      text: desc ? String(desc.value || "").trim() : "",
      passion: pass ? String(pass.value || "") : "",
      eventId: ev ? String(ev.value || "") : "",
      cover: couverture || null,
    };
    if (btn) { btn.disabled = true; btn.textContent = "Publication…"; }
    track("ui_v7_bobine_publier", {
      hasText: !!details.text, hasCover: !!details.cover, hasEvent: !!details.eventId,
    });

    // Couverture : on l'envoie sur le Storage AVANT de publier, avec le moteur
    // existant. En cas d'échec on garde la version réduite en local — elle ne
    // part jamais en base (`mePublish` ne met que la vidéo dans `media_url`).
    envoyerCouverture(details.cover).then(function (url) {
      details.cover = url;
      try {
        meState.details = details;
        fermerFeuilleBobine();
        mePublish();
      } catch (e) { fail("publier", e); notifier("Publication impossible."); }
      if (btn) { btn.disabled = false; btn.textContent = "Publier ma bobine"; }
    });
  }

  function envoyerCouverture(dataUrl) {
    if (!dataUrl || String(dataUrl).indexOf("data:") !== 0) {
      return Promise.resolve(dataUrl || null);
    }
    if (typeof supaUploadMedia !== "function" || !window._supaReal) {
      return Promise.resolve(dataUrl);
    }
    var cle = "reelcover_" + Date.now();
    return Promise.race([
      supaUploadMedia(cle, "photos", dataUrl, "image"),
      new Promise(function (r) { setTimeout(function () { r(null); }, 20000); }),
    ]).then(function (u) {
      return (u && String(u).indexOf("http") === 0) ? u : dataUrl;
    }).catch(function () { return dataUrl; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉCORATION, OBSERVATION, COUPURE
  // ══════════════════════════════════════════════════════════════════════════
  var observateurs = [];
  var enAttente = false;

  function decorer() {
    if (enPanne) return;
    if (!actif()) return;          // piège ⑤ : verrou de coupure
    try {
      if (ecranProfil()) construireProfil();
      if (editeur()) decorerBobine();
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

  function observer(noeud) {
    if (!noeud) return;
    try {
      var o = new MutationObserver(function () { planifier(); });
      o.observe(noeud, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      observateurs.push(o);
    } catch (e) { fail("observation", e); }
  }

  function cesserObservation() {
    for (var i = 0; i < observateurs.length; i++) {
      try { observateurs[i].disconnect(); } catch (e) {}
    }
    observateurs = [];
  }

  function apply() {
    var racine = document.documentElement;
    if (!actif()) {
      racine.classList.remove(CLASSE_RACINE);
      cesserObservation();
      retirerProfil();
      retirerBobine();
      return false;
    }
    enPanne = false;
    racine.classList.add(CLASSE_RACINE);
    if (!observateurs.length) {
      observer(ecranProfil());
      observer(editeur());
    }
    planifier();
    return true;
  }

  // ── Démarrage (piège ④) ──────────────────────────────────────────────────
  function boot() {
    if (!el("screen-feed") || !ecranProfil()) {
      if (essais++ > 80) return;
      setTimeout(boot, 150);
      return;
    }
    if (apply()) track("ui_v7_lot", { v: VERSION });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });

  window.PassioUIV7 = {
    isEnabled: actif,
    apply: apply,
    decorate: decorer,
    selectProfileTab: choisirOnglet,
    openReelSheet: ouvrirFeuilleBobine,
    closeReelSheet: fermerFeuilleBobine,
  };
})();
