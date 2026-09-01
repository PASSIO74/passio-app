// ══════════════════════════════════════════════════════════════════════════
// RÉFÉRENTIEL PLAT — LA COLLE DES SEPT SURFACES (lot flat_passions_v1)
//
// Ce fichier n'invente AUCUN moteur. Il ouvre le sélecteur unique
// (`PassionSearchSelector`) et rend le résultat aux fonctions qui existent
// déjà : `ajouterPassionAuCompte` (app-06), `setFeedPassions` (app-02),
// `switchToProfile` (app-06), `irlPassionFilterSet` + `renderIRL` (app-07).
//
// Il est appelé depuis les moteurs eux-mêmes, à un seul endroit chacun, sous
// un garde `PassioFlatUI.actif()`. Aucun observateur de DOM : ce lot change ce
// que l'écran SIGNIFIE, pas seulement ce qu'il montre — et ce dépôt a déjà
// documenté qu'une décoration par observateur se fait effacer au premier
// re-rendu (`_feedWindowRedecorer`, `renderProfileStrip` et son `_lastHtml`).
//
// ⚠️ SÉPARATION LECTURE / ÉCRITURE (ADR-010, décision 6). Les surfaces de
// LECTURE (Fil, Rencontrer, Profil) ne touchent jamais `currentProfileId` ;
// seule la surface d'ÉCRITURE (Studio) le fait, et par `switchToProfile`, son
// unique point d'écriture.
//
// ⚠️ PUBLIER RESTE GARDÉ PAR LE SERVEUR. Une passion du référentiel plat n'est
// publiable que si elle existe RÉELLEMENT dans la table `passions` — la clé
// étrangère de `posts.passion_id` est infranchissable côté client. Tant que la
// migration n'est pas appliquée, le Studio refuse proprement, avec un message
// qui dit quoi faire, au lieu de laisser partir un insert qui sera rejeté.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  function journal(quoi, e) {
    try {
      if (typeof diagLog === "function") diagLog("passions_flat_ui " + quoi + " " + (e && e.message ? e.message : e || ""));
    } catch (_) {}
  }

  function moteur() { try { return window.PassioPassions || null; } catch (e) { return null; } }
  function selecteur() { try { return window.PassionSearchSelector || null; } catch (e) { return null; } }

  function actif() {
    var m = moteur();
    return !!(m && m.actif() && selecteur());
  }

  function dire(msg, type) {
    try { if (typeof toast === "function") toast(msg, type); } catch (e) {}
  }

  // ── Les passions du compte, à jour ────────────────────────────────────────
  // ⚠️ `state` vaut `null` avant `loadState()` : on teste la VALEUR.
  function mesPassions() {
    try {
      var s = (typeof state !== "undefined") ? state : null;
      var profils = (s && s.user && s.user.profiles) || [];
      return profils.filter(function (p) { return p && p.passion && !p.archived; })
                    .map(function (p) { return p.passion; });
    } catch (e) { journal("mesPassions", e); return []; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ① « MES PASSIONS » — ajouter par recherche, en multi
  // ══════════════════════════════════════════════════════════════════════════
  function ouvrirAjoutPassions(options) {
    if (!actif()) return false;
    options = options || {};
    var deja = mesPassions();
    selecteur().ouvrir({
      mode: "multi",
      titre: options.titre || "Qu'est-ce qui te passionne ?",
      sousTitre: "Recherche et choisis directement ce que tu aimes.",
      selection: [],
      valider: "Ajouter à mes passions",
      onValider: function (ids) {
        var ajoutees = 0;
        ids.forEach(function (id) {
          if (deja.indexOf(id) >= 0) return;
          try {
            // Un SEUL moteur d'ajout — celui de `confirmCreateProfile`.
            if (typeof ajouterPassionAuCompte === "function" && ajouterPassionAuCompte(id, "")) ajoutees++;
          } catch (e) { journal("ajout", e); }
        });
        try { if (typeof renderProfilesScreen === "function") renderProfilesScreen(); } catch (e) {}
        try { if (typeof renderTopbar === "function") renderTopbar(); } catch (e) {}
        try { if (typeof renderProfileStrip === "function") renderProfileStrip(); } catch (e) {}
        try { if (typeof renderFeed === "function") renderFeed(); } catch (e) {}
        if (ajoutees) dire(ajoutees === 1 ? "✨ Passion ajoutée" : "✨ " + ajoutees + " passions ajoutées", "success");
      },
    });
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ② LE FIL — choisir ce qu'on veut voir
  // ⚠️ SÉLECTION DE LECTURE. On écrit `_activeFeedPassions` par `setFeedPassions`
  // et rien d'autre : la passion d'écriture (`currentProfileId`) n'est pas
  // touchée. C'est la décision 6 d'ADR-010, et le lot UI-8 l'a déjà payée une
  // fois en confondant les deux.
  //
  // ⚠️ UNE PASSION COCHÉE DANS LE FIL SANS ÊTRE DANS « MES PASSIONS » EST UN
  // PIÈGE : `renderProfileStrip` ne dessine que les passions vivantes plus les
  // « orphelines » déjà actives — donc elle aurait une bulle, mais un compte
  // qui la décoche ne la retrouverait plus. On l'ajoute donc au compte en même
  // temps : choisir de voir une passion, c'est l'avoir.
  // ══════════════════════════════════════════════════════════════════════════
  function ouvrirPassionsDuFil() {
    if (!actif()) return false;
    var courant = [];
    try { courant = Array.from(_activeFeedPassions || []); } catch (e) {}
    selecteur().ouvrir({
      mode: "multi",
      titre: "Ton fil",
      sousTitre: "Choisis les passions que tu veux voir. Tu peux en ajouter autant que tu veux.",
      selection: courant,
      valider: "Voir mon fil",
      onValider: function (ids) {
        ids.forEach(function (id) {
          try { if (typeof ajouterPassionAuCompte === "function") ajouterPassionAuCompte(id, ""); }
          catch (e) { journal("fil_ajout", e); }
        });
        try { if (typeof setFeedPassions === "function") setFeedPassions(ids); } catch (e) { journal("setFeedPassions", e); }
        // ⚠️ Invalider le guard no-op AVANT de repeindre : `renderFeed` sort tôt
        // quand la signature du DOM est inchangée (piège documenté dans CLAUDE.md).
        try { window._feedDomSig = null; } catch (e) {}
        try { if (typeof renderProfileStrip === "function") renderProfileStrip(); } catch (e) {}
        try { if (typeof renderFeed === "function") renderFeed(); } catch (e) {}
      },
    });
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ③ LE STUDIO — la passion de DESTINATION, choix unique
  // ⚠️ `#postPassion` RESTE LA SEULE SOURCE DE VÉRITÉ. `publishPost` lit
  // `$("#postPassion").value` et rien d'autre : le sélecteur écrit dedans, il
  // ne publie jamais lui-même. Masquer le `<select>` sans écrire dedans
  // publierait sous la mauvaise passion, EN SILENCE — c'est le piège exact du
  // lot UI-6 avec `studioType`.
  // ══════════════════════════════════════════════════════════════════════════
  function passionPubliable(id) {
    try { return typeof estPassionCanonique === "function" ? estPassionCanonique(id) : true; }
    catch (e) { return true; }
  }

  function ouvrirChoixStudio() {
    if (!actif()) return false;
    var sel = document.getElementById("postPassion");
    if (!sel) return false;
    selecteur().ouvrir({
      mode: "unique",
      titre: "Associer cette publication à une passion",
      sousTitre: "Tu peux choisir directement « Enduro » — sans passer par « Moto ».",
      permettreDemande: false,   // on ne dépose pas une demande depuis le Studio :
                                 // elle ne serait pas publiable, donc inutile ici.
      // ⚠️ UN BOUTON DE VALIDATION, ET C'EST NÉCESSAIRE. Sans lui, le tap sur un
      // résultat concluait tout seul — sauf quand la passion était refusée : on
      // restait alors devant une sélection affichée, un toast déjà disparu, et
      // rien à toucher. Mesuré par Benjamin sur la preview : « j'arrive à
      // choisir la passion mais je n'arrive pas à la valider ».
      valider: "Publier dans cette passion",
      // Le motif du refus s'affiche DANS LE PIED, avant même de valider, et
      // désactive le bouton. Une passion absente du référentiel SERVEUR ne peut
      // pas être écrite (clé étrangère de `posts.passion_id`) : laisser publier
      // produirait un post visible chez son auteur, jamais arrivé, perdu au
      // changement d'appareil.
      verifier: function (id) {
        if (passionPubliable(id)) return null;
        var p = moteur().parId(id);
        return "« " + ((p && p.label) || id) + " » n'est pas encore ouverte à la publication : "
          + "elle range ton fil, mais on ne peut pas encore y publier. Choisis-en une autre.";
      },
      onValider: function (ids) {
        var id = ids && ids[0];
        if (!id) return;
        try {
          // Le `<select>` ne contient que les passions du compte : on ajoute
          // l'option si elle manque, sinon `sel.value = id` ne prend pas.
          if (!Array.prototype.some.call(sel.options, function (o) { return o.value === id; })) {
            var p = moteur().parId(id) || { label: id, emoji: "✨" };
            var opt = document.createElement("option");
            opt.value = id;
            opt.textContent = (p.emoji || "✨") + " " + p.label;
            sel.appendChild(opt);
          }
          sel.value = id;
          if (typeof ajouterPassionAuCompte === "function") ajouterPassionAuCompte(id, "");
          if (typeof onStudioPassionChange === "function") onStudioPassionChange();
          rafraichirBoutonStudio();
          // ⚠️ Le composer UI-6 affiche « Publier dans : X » dans un résumé
          // SÉPARÉ du `<select>`. Sans ce rappel, le choix serait écrit dans la
          // source de vérité mais l'écran continuerait d'annoncer l'ancienne
          // passion — le défaut exact d'`identiteCourante()` au lot UI-8, où le
          // Studio annonçait un expéditeur qui n'était pas celui du post.
          if (window.PassioUIV6 && typeof PassioUIV6.sync === "function") PassioUIV6.sync();
        } catch (e) { journal("studio", e); }
      },
    });
    return true;
  }

  // Le bouton du Studio affiche toujours la valeur RÉELLE du `<select>` : deux
  // sources d'affichage divergeraient au premier chemin qui écrit l'une sans
  // l'autre (le brouillon, la republication, le pont Fil→IRL).
  function rafraichirBoutonStudio() {
    try {
      var b = document.getElementById("studioPassionBtn");
      var sel = document.getElementById("postPassion");
      if (!b || !sel) return;
      var id = sel.value;
      var m = moteur();
      var p = (m && m.parId(id)) || (typeof passionById === "function" ? passionById(id) : null);
      var libelle = p ? ((p.emoji || "✨") + " " + p.label) : "Choisir une passion";
      b.textContent = libelle;
      b.setAttribute("aria-label", "Passion de la publication : " + (p ? p.label : "aucune"));
    } catch (e) { journal("bouton_studio", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ④ RENCONTRER — filtrer par passion précise
  // ⚠️ `irlPassionFilters` est un `let` de portée script : il n'est PAS une
  // propriété de `window`. On passe par `irlPassionFilterSet()`, l'accesseur
  // qu'app-07 expose exprès, et on le relit à chaud (`renderIrlPassionTiles`
  // REMPLACE le Set le temps d'un calcul).
  // ══════════════════════════════════════════════════════════════════════════
  function ouvrirFiltreIRL() {
    if (!actif()) return false;
    var courant = [];
    try {
      if (typeof irlPassionFilterSet === "function") courant = Array.from(irlPassionFilterSet());
    } catch (e) { journal("irl_lecture", e); }
    selecteur().ouvrir({
      mode: "multi",
      titre: "Quelles activités ?",
      sousTitre: "Cherche une passion précise : escalade, yoga aérien, cuisine japonaise…",
      selection: courant,
      permettreDemande: false,   // ici on FILTRE ; proposer un terme absent ne
                                 // montrerait aucune activité.
      valider: "Voir les activités",
      onValider: function (ids) {
        try {
          var set = irlPassionFilterSet();
          set.clear();
          ids.forEach(function (id) { set.add(id); });
          if (typeof renderIRL === "function") renderIRL();
        } catch (e) { journal("irl_ecriture", e); }
      },
    });
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⑤ PREMIÈRE VISITE / ONBOARDING — montage EN LIGNE
  // La spécification veut « une grande recherche » immédiatement visible :
  // une feuille à ouvrir ajouterait le geste qu'on cherche à retirer.
  //
  // ⚠️ MONTÉ UNE SEULE FOIS. `renderPassionGrid` est rappelée à chaque
  // sélection ; re-monter le composant viderait le champ et ferait perdre le
  // focus — le clavier se refermerait à chaque passion cochée.
  // ══════════════════════════════════════════════════════════════════════════
  function monterOnboarding(hote, opts) {
    if (!actif() || !hote) return false;
    opts = opts || {};
    if (hote.getAttribute("data-psel-monte") === "1") return true;
    hote.setAttribute("data-psel-monte", "1");
    selecteur().monterDans(hote, {
      mode: "multi",
      titre: "",                  // le titre de l'écran d'onboarding sert déjà
      sousTitre: "",
      selection: (opts.selection || []).slice(),
      max: opts.max || 0,
      onChangement: opts.onChangement || null,
    });
    return true;
  }

  window.PassioFlatUI = {
    actif: actif,
    mesPassions: mesPassions,
    ouvrirAjoutPassions: ouvrirAjoutPassions,
    ouvrirPassionsDuFil: ouvrirPassionsDuFil,
    ouvrirChoixStudio: ouvrirChoixStudio,
    ouvrirFiltreIRL: ouvrirFiltreIRL,
    monterOnboarding: monterOnboarding,
    rafraichirBoutonStudio: rafraichirBoutonStudio,
    passionPubliable: passionPubliable,
  };
})();
