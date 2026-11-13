// ══════════════════════════════════════════════════════════════════════════
// PassionSearchSelector — LE SEUL composant de choix de passion
//
// « Recherche et choisis directement ce que tu aimes. »
//
// Une seule implémentation, sept surfaces : première visite, onboarding,
// « Mes passions », Fil, Profil, Studio, Rencontrer. Ce dépôt a déjà payé deux
// fois le prix de la duplication — les deux tables de libellés de mood, les
// deux écrans de profil — et à chaque fois les copies avaient divergé.
//
// ── CE QU'IL NE FAIT PAS ──────────────────────────────────────────────────
// ⛔ Aucun univers, aucune catégorie à ouvrir, aucune arborescence, aucun
//    « choisis d'abord une famille ». On tape « Enduro », on le sélectionne.
// ⛔ Il n'affiche JAMAIS les 1 900 passions d'un coup : au repos, quelques
//    récentes et quelques suggestions ; à la frappe, 20 résultats au plus.
// ⛔ Il n'écrit rien tout seul. Il rend la sélection à son appelant, qui
//    décide (`onChoisir` en mode unique, `onValider` en multi).
//
// ── DEUX MONTAGES ─────────────────────────────────────────────────────────
//   PassionSearchSelector.monterDans(hote, config)  → en ligne dans un écran
//   PassionSearchSelector.ouvrir(config)            → feuille basse (openModal)
// La première visite et « Rencontrer » utilisent le montage EN LIGNE : la
// spécification demande un champ de recherche « immédiatement visible », et
// une feuille à ouvrir ajouterait le geste qu'on cherche justement à retirer.
//
// ── TROIS RÈGLES DE CE DÉPÔT, APPLIQUÉES ICI ──────────────────────────────
// ① Aucun `onclick` inline. Tout passe par une délégation sur le conteneur :
//    `audit:handlers` exige qu'un `onclick` inline désigne une fonction globale
//    existante, et `audit:echappement` refuse un gestionnaire construit par
//    concaténation. Une délégation sur `data-*` n'a ni l'un ni l'autre problème.
// ② Tout libellé passe par `escapeHtml`. Les libellés du référentiel sont des
//    données ; un jour ils viendront du serveur, et ce jour-là ils seront du
//    contenu écrit ailleurs.
// ③ Le champ de saisie est en 16 px : en dessous, iOS zoome à la mise au point
//    et l'écran part de travers.
//
// ── VIE PRIVÉE ────────────────────────────────────────────────────────────
// ⚠️ LE BOUTON « Ajouter « … » » PORTE UN `data-tel` EXPLICITE, et c'est
// obligatoire : `js/telemetry.js` retombe sinon sur `textContent.slice(0, 40)`
// pour nommer un clic — il emporterait la recherche libre de la personne dans
// la télémétrie. Aucun événement de ce module ne transporte la frappe.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var DEBOUNCE_MS = 160;
  var LIMITE = 20;
  var SEUIL_PROPOSER_AJOUT = 3;   // en deçà, « Ajouter … » n'a pas de sens

  function journal(quoi, e) {
    try {
      if (typeof diagLog === "function") diagLog("passion_selector " + quoi + " " + (e && e.message ? e.message : e || ""));
    } catch (_) {}
  }

  function ech(s) {
    try { if (typeof escapeHtml === "function") return escapeHtml(String(s == null ? "" : s)); } catch (e) {}
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function moteur() {
    try { return window.PassioPassions || null; } catch (e) { return null; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNE INSTANCE
  // ══════════════════════════════════════════════════════════════════════════
  function Selecteur(hote, config) {
    this.hote = hote;
    this.cfg = Object.assign({
      mode: "multi",                 // "multi" | "unique"
      titre: "",
      sousTitre: "",
      placeholder: "Recherche : enduro, guitare électrique, cuisine coréenne…",
      selection: [],
      max: 0,                        // 0 = pas de plafond
      permettreDemande: true,
      valider: "",                   // libellé du bouton de validation, "" = aucun
      // Rend `null` si l'identifiant est choisissable, sinon le MOTIF du refus.
      // ⚠️ Le motif s'affiche DANS LE PIED, pas seulement en toast : au Studio,
      // un toast passait inaperçu et on restait devant une sélection affichée
      // sans rien pour conclure. Mesuré par Benjamin sur la preview.
      verifier: null,
      // Appelée à la place du toast quand `max` est atteint : l'appelant décide
      // ce que « plus de place » veut dire chez lui (au compte, la limite qui a
      // refusé le geste ; ailleurs, un simple plafond de confort).
      onMax: null,
      onChoisir: null,
      onValider: null,
      onChangement: null,
    }, config || {});
    this.selection = (this.cfg.selection || []).slice();
    this.frappe = "";
    this.resultats = [];
    this.jeton = 0;                  // annulation des recherches devenues obsolètes
    this.minuteur = null;
    this.monter();
  }

  Selecteur.prototype.monter = function () {
    var self = this;
    this.hote.classList.add("psel");
    this.hote.innerHTML = ""
      + (this.cfg.titre ? '<h2 class="psel-titre">' + ech(this.cfg.titre) + "</h2>" : "")
      + (this.cfg.sousTitre ? '<p class="psel-sous">' + ech(this.cfg.sousTitre) + "</p>" : "")
      + '<div class="psel-champ">'
      +   '<span class="psel-loupe" aria-hidden="true">🔍</span>'
      +   '<input type="search" class="psel-input" autocomplete="off" autocapitalize="off"'
      +     ' spellcheck="false" enterkeyhint="search"'
      +     ' aria-label="Rechercher une passion"'
      +     ' placeholder="' + ech(this.cfg.placeholder) + '" />'
      +   '<button type="button" class="psel-vider" data-psel="vider" hidden'
      +     ' aria-label="Effacer la recherche">✕</button>'
      + "</div>"
      + '<div class="psel-choisies" data-psel-zone="choisies"></div>'
      + '<div class="psel-liste" data-psel-zone="liste" role="listbox" aria-label="Résultats"></div>'
      + '<div class="psel-pied" data-psel-zone="pied"></div>';

    this.input = this.hote.querySelector(".psel-input");
    this.zoneChoisies = this.hote.querySelector('[data-psel-zone="choisies"]');
    this.zoneListe = this.hote.querySelector('[data-psel-zone="liste"]');
    this.zonePied = this.hote.querySelector('[data-psel-zone="pied"]');

    this.input.addEventListener("input", function () {
      self.frappe = self.input.value;
      var v = self.hote.querySelector('[data-psel="vider"]');
      if (v) v.hidden = !self.frappe;
      self.chercherDebounce();
    });
    // Entrée sélectionne le premier résultat : sur mobile, c'est le geste que
    // le clavier propose (« rechercher »), et il ne doit pas être un cul-de-sac.
    // ⚠️ LE PIED EST RÉÉCRIT À CHAQUE FRAPPE (`rendrePied` pose `innerHTML`),
    // donc un champ d'alias non mémorisé perdrait sa saisie au premier
    // caractère tapé ailleurs — même famille que le cache `_lastHtml` de
    // `renderProfileStrip`. On garde la valeur sur l'INSTANCE et on la
    // réinjecte au rendu ; l'écoute est DÉLÉGUÉE, donc elle survit au
    // remplacement du nœud, et elle ne déclenche AUCUN re-rendu.
    this.hote.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || !t.getAttribute("data-psel-alias")) return;
      self.alias = t.value;
    });

    this.input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var premier = self.resultats[0];
      if (premier) self.basculer(premier.id);
      else if (self.peutProposerAjout()) self.creer();
    });

    // ⚠️ UNE SEULE délégation, sur le conteneur. Les résultats sont réécrits à
    // chaque frappe : un écouteur par ligne serait reposé des centaines de fois.
    this.hote.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-psel]") : null;
      if (!b || !self.hote.contains(b)) return;
      var action = b.getAttribute("data-psel");
      var id = b.getAttribute("data-psel-id");
      if (action === "vider") { self.input.value = ""; self.frappe = ""; b.hidden = true; self.input.focus(); self.chercher(); return; }
      if (action === "choisir" && id) { self.basculer(id); return; }
      if (action === "retirer" && id) { self.retirer(id); return; }
      if (action === "ajouter") { self.creer(); return; }
      if (action === "valider") { self.valider(); return; }
    });

    this.rendreChoisies();
    this.zoneListe.innerHTML = '<p class="psel-vide">Chargement des passions…</p>';
    var m = moteur();
    if (!m) { this.zoneListe.innerHTML = '<p class="psel-vide">Recherche indisponible.</p>'; return; }
    // ⚠️ REPEINDRE LES PUCES APRÈS LE CHARGEMENT, pas seulement à la sélection.
    // Mesuré à l'écran : une passion déjà choisie s'affichait « ✨ musique » —
    // son identifiant brut et l'emoji générique — parce que `parId()` rend
    // `null` tant que le référentiel n'est pas là, et que rien ne repassait
    // ensuite. Le même défaut de famille que `passionById` qui retombe sur
    // « ✨ Passion » (lot TAXO-1), à ceci près qu'ici la valeur fausse n'est
    // que peinte, jamais persistée.
    m.charger().then(function () { self.rendreChoisies(); self.chercher(); }).catch(function (e) {
      journal("charger", e);
      self.zoneListe.innerHTML = '<p class="psel-vide">Recherche indisponible pour le moment.</p>';
    });
  };

  // ── Recherche : anti-rebond + annulation des réponses périmées ────────────
  // ⚠️ LE JETON N'EST PAS UN LUXE. Sans lui, une réponse serveur lente pour
  // « gui » arrive APRÈS celle de « guitare » et réécrit la liste avec des
  // résultats périmés. Ce dépôt a déjà eu ce défaut exact sur la recherche de
  // comptes (PR #210).
  Selecteur.prototype.chercherDebounce = function () {
    var self = this;
    if (this.minuteur) clearTimeout(this.minuteur);
    this.minuteur = setTimeout(function () { self.chercher(); }, DEBOUNCE_MS);
  };

  Selecteur.prototype.chercher = function () {
    var self = this;
    var m = moteur();
    if (!m) return;
    var mien = ++this.jeton;
    var q = this.frappe;
    m.chercherAsync(q, { limite: LIMITE, exclure: this.selection, serveur: true })
      .then(function (r) {
        if (mien !== self.jeton) return;      // une frappe plus récente a gagné
        self.resultats = r || [];
        // ⚠️ LA LISTE DIT À QUELLE FRAPPE ELLE CORRESPOND. Tant qu'une recherche
        // est en vol, l'écran garde les résultats PRÉCÉDENTS — c'est le bon
        // comportement (vider la liste à chaque touche ferait clignoter
        // l'écran), mais rien ne permettait de distinguer « voici tes résultats »
        // de « voici encore les précédents ». Sans ce marqueur, un observateur
        // qui lit trop tôt conclut à un défaut de classement là où il n'y a
        // qu'une réponse en route : c'est exactement ce qui a fait rougir la CI
        // le 2026-09-01, la migration appliquée ayant activé la recherche
        // SERVEUR, plus lente que le repli local.
        self.frappeRendue = q;
        self.rendreListe();
      })
      .catch(function (e) { journal("chercher", e); });
  };

  // ── Rendu ────────────────────────────────────────────────────────────────
  Selecteur.prototype.ligneHTML = function (p) {
    // ⚠️ NI le terme plus général, NI la « famille » ne s'affichent. Le modèle
    // est plat : une ligne, un nom, rien qui suggère qu'il faudrait passer par
    // autre chose.
    // LOT-15 (audit UX/UI du 2026-11-10, CRE-C17) : la ligne CHOISIE le dit (« ✓ »,
    // aria-selected) — elle gardait son « + », et l'état ne se lisait qu'en haut.
    var choisie = this.selection.indexOf(p.id) > -1;
    return '<button type="button" class="psel-item' + (choisie ? " psel-item-choisie" : "") + '" role="option" aria-selected="' + (choisie ? "true" : "false") + '"'
      + ' data-psel="choisir" data-psel-id="' + ech(p.id) + '">'
      + '<span class="psel-item-emoji" aria-hidden="true">' + ech(p.emoji || "✨") + "</span>"
      + '<span class="psel-item-label">' + ech(p.label) + "</span>"
      + '<span class="psel-item-plus" aria-hidden="true">' + (choisie ? "✓" : "+") + "</span>"
      + "</button>";
  };

  Selecteur.prototype.rendreListe = function () {
    try {
      var zone = this.hote.querySelector('[data-psel-zone="liste"]');
      if (zone) zone.setAttribute("data-psel-q", this.frappeRendue == null ? "" : this.frappeRendue);
    } catch (e) {}
    var m = moteur();
    var q = String(this.frappe || "").trim();
    var html = "";

    if (!q) {
      var rec = (m ? m.recentes() : []).filter(function (r) { return this.selection.indexOf(r.id) < 0; }, this);
      if (rec.length) {
        html += '<p class="psel-section">Récemment utilisées</p>';
        html += rec.slice(0, 6).map(function (r) {
          var p = (m && m.parId(r.id)) || r;
          return this.ligneHTML(p);
        }, this).join("");
      }
      html += '<p class="psel-section">Quelques idées</p>';
    }

    if (this.resultats.length) {
      html += this.resultats.map(this.ligneHTML, this).join("");
    } else if (q) {
      html += '<p class="psel-vide">Aucune passion ne correspond.</p>';
    }

    this.zoneListe.innerHTML = html;
    this.rendrePied();
  };

  Selecteur.prototype.peutProposerAjout = function () {
    if (!this.cfg.permettreDemande) return false;
    var q = String(this.frappe || "").trim();
    if (q.length < SEUIL_PROPOSER_AJOUT) return false;
    var m = moteur();
    if (!m) return false;
    // On ne propose PAS d'ajouter un terme qui existe déjà, même par alias :
    // la spécification l'exige, et sans ça le référentiel se remplirait de
    // variantes de ce qu'il contient déjà.
    var a = m.analyserDemande(q);
    return !!(a.valide && !a.doublon);
  };

  Selecteur.prototype.rendrePied = function () {
    var q = String(this.frappe || "").trim();
    var html = "";
    if (this.peutProposerAjout()) {
      // ⚠️ `data-tel` OBLIGATOIRE : sans lui, `telemetry.js` nomme ce clic avec
      // le `textContent` du bouton — donc avec la recherche libre de la
      // personne. Le libellé reste visible à l'écran, il ne part nulle part.
      // ⚠️ LE LIBELLÉ DIT CE QUI VA SE PASSER (lot creation_passion_v1). Tant
      // que la création n'est pas possible — hors ligne, sans compte, migration
      // non appliquée — le bouton DÉPOSE UNE DEMANDE, et il le dit : promettre
      // « Créer » puis rendre une entrée « en vérification » est exactement le
      // reproche des testeurs, à l'envers.
      var peutCreer = false;
      try {
        var mm = moteur();
        peutCreer = !!(mm && typeof mm.creationDisponible === "function" && mm.creationDisponible());
      } catch (e) {}
      html += '<button type="button" class="psel-ajouter" data-psel="ajouter"'
        + ' data-tel="' + (peutCreer ? "passion_creation" : "passion_ajout_demande") + '">'
        + (peutCreer
            ? "Créer « " + ech(q) + " »"
            : "Demander l'ajout de « " + ech(q) + " »")
        + "</button>";
      // ⚠️ AUTRES NOMS — LE CHAMP QUI REND LA PASSION TROUVABLE (2026-09-10).
      // Mesuré en base après le rattrapage des alias : les six passions créées
      // depuis l'app étaient les SEULES à zéro alias, `creer_passion` écrivant
      // `aliases = '{}'` EN DUR. « GRS » existe et reste introuvable en tapant
      // « gymnastique rythmique ». Or la personne qui crée est justement celle
      // qui sait comment on la nomme autrement — on ne le lui demandait jamais.
      //
      // FACULTATIF, ET UNE SEULE LIGNE : le reproche des testeurs était que
      // créer une passion était trop DIFFICILE. On n'ajoute donc pas une étape,
      // on ajoute une occasion. Rien de saisi ⇒ comportement d'avant, à l'octet.
      //
      // ⚠️ Il n'apparaît QUE si la création est réellement possible. Sous le
      // chemin de DEMANDE (hors ligne, sans compte, migration non appliquée),
      // les alias ne seraient transmis à personne : un champ qui ne sert à rien
      // est un mensonge d'interface.
      if (peutCreer) {
        html += '<input type="text" class="psel-alias" data-psel-alias="1"'
          + ' maxlength="120" autocomplete="off" enterkeyhint="done"'
          + ' aria-label="Autres noms de cette passion, separes par des virgules"'
          + ' placeholder="Autres noms, séparés par des virgules (facultatif)"'
          + ' value="' + ech(this.alias || "") + '">';
      }
    }
    if (this.cfg.valider) {
      var n = this.selection.length;
      var refus = this.motifRefus();
      if (refus) html += '<p class="psel-refus" role="status">' + ech(refus) + "</p>";
      // LOT-15 (CRE-C02) : une NOTE (non bloquante) dit ce que le choix entraîne.
      if (!refus && n && typeof this.cfg.note === "function") {
        var note = "";
        try { note = this.cfg.note(this.selection.slice()) || ""; } catch (e) { journal("note", e); }
        if (note) html += '<p class="psel-note" role="status">' + ech(note) + "</p>";
      }
      var bloque = n === 0 || !!refus;
      html += '<button type="button" class="btn primary block psel-valider" data-psel="valider"'
        + (bloque ? " disabled" : "") + ">"
        + ech(this.cfg.valider) + (this.cfg.mode === "multi" && n ? " (" + n + ")" : "") + "</button>";
    }
    this.zonePied.innerHTML = html;
  };

  // Rend le motif de refus de la sélection courante, ou "" si tout va bien.
  Selecteur.prototype.motifRefus = function () {
    if (typeof this.cfg.verifier !== "function") return "";
    for (var i = 0; i < this.selection.length; i++) {
      try {
        var m = this.cfg.verifier(this.selection[i]);
        if (m) return m;
      } catch (e) { journal("verifier", e); }
    }
    return "";
  };

  // LOT-15 (CRE-C17) : les lignes déjà peintes suivent la sélection sur place
  // (la liste n'est pas repeinte en mode unique — on garde le défilement).
  Selecteur.prototype.marquerLignes = function () {
    var sel = this.selection;
    if (!this.zoneListe) return;
    Array.prototype.forEach.call(this.zoneListe.querySelectorAll(".psel-item"), function (b) {
      var on = sel.indexOf(b.getAttribute("data-psel-id")) > -1;
      b.classList.toggle("psel-item-choisie", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      var plus = b.querySelector(".psel-item-plus");
      if (plus) plus.textContent = on ? "✓" : "+";
    });
  };

  Selecteur.prototype.rendreChoisies = function () {
    try { this.marquerLignes(); } catch (e) {}
    var m = moteur();
    if (!this.selection.length) { this.zoneChoisies.innerHTML = ""; return; }
    this.zoneChoisies.innerHTML = '<p class="psel-section">' + ech(this.cfg.titreChoisies || "Tes passions") + '</p>'
      + this.selection.map(function (id) {
        var p = (m && m.parId(id)) || { id: id, label: id, emoji: "✨" };
        return '<span class="psel-puce">'
          + '<span aria-hidden="true">' + ech(p.emoji || "✨") + "</span>"
          + "<span>" + ech(p.label) + "</span>"
          + '<button type="button" class="psel-puce-x" data-psel="retirer" data-psel-id="' + ech(id) + '"'
          + ' aria-label="Retirer ' + ech(p.label) + '">✕</button>'
          + "</span>";
      }).join("");
  };

  // ── Sélection ────────────────────────────────────────────────────────────
  Selecteur.prototype.basculer = function (id) {
    var m = moteur();
    if (this.cfg.mode === "unique") {
      this.selection = [id];
      if (m) m.noterUtilisation(id);
      this.rendreChoisies();
      this.rendrePied();
      this.notifier();
      // ⚠️ DEUX GESTES QUAND UN BOUTON EXISTE : le tap sélectionne, le bouton
      // conclut. Conclure au tap privait l'écran de toute confirmation — et
      // quand le choix était REFUSÉ, la feuille restait ouverte sur une
      // sélection affichée, sans rien à toucher pour avancer ni comprendre.
      // Sans bouton déclaré, le tap conclut comme avant.
      if (!this.cfg.valider && typeof this.cfg.onChoisir === "function") this.cfg.onChoisir(id);
      return;
    }
    var i = this.selection.indexOf(id);
    if (i >= 0) { this.selection.splice(i, 1); }
    else {
      if (this.cfg.max && this.selection.length >= this.cfg.max) {
        if (typeof this.cfg.onMax === "function") {
          try { this.cfg.onMax(this.cfg.max); } catch (e) {}
          return;
        }
        try { if (typeof toast === "function") toast("Maximum " + this.cfg.max + " passions pour commencer"); } catch (e) {}
        return;
      }
      this.selection.push(id);
      if (m) m.noterUtilisation(id);
    }
    this.rendreChoisies();
    this.chercher();          // la liste exclut ce qui est déjà choisi
    this.notifier();
  };

  Selecteur.prototype.retirer = function (id) {
    var i = this.selection.indexOf(id);
    if (i < 0) return;
    this.selection.splice(i, 1);
    this.rendreChoisies();
    this.chercher();
    this.notifier();
  };

  Selecteur.prototype.notifier = function () {
    try { if (typeof this.cfg.onChangement === "function") this.cfg.onChangement(this.selection.slice()); }
    catch (e) { journal("onChangement", e); }
  };

  Selecteur.prototype.valider = function () {
    // Le bouton est déjà désactivé dans ce cas ; le garde est ici parce que la
    // touche Entrée et un appel programmatique ne passent pas par le bouton.
    if (this.motifRefus()) return;
    if (!this.selection.length) return;
    try { if (typeof this.cfg.onValider === "function") this.cfg.onValider(this.selection.slice()); }
    catch (e) { journal("onValider", e); }
  };

  // ── « Je ne trouve pas ma passion » ───────────────────────────────────────
  // ⚠️ DEPUIS LE 2026-11-04, LA DEMANDE D'UN COMPTE REVIENT COMME UNE PASSION :
  // le serveur la résout dans le même INSERT (`trg_passion_request_auto` →
  // `creer_passion`, rattachement dans `user_passions`, `status = 'approved'`),
  // et l'écran la traite comme une création — sélectionnée, publiable, annoncée
  // « ajoutée à tes passions ». Un refus se NOMME par son motif. Et AUCUN rejeu
  // n'existe : rien n'annonce qu'une demande non partie « partira plus tard ».
  var MOTIFS = {
    auth_requise:     "Crée ton compte pour ajouter une passion.",
    nom_invalide:     "Choisis un nom de passion — deux lettres au moins, pas d'adresse web.",
    nom_trop_long:    "Un nom plus court : six mots au maximum.",
    nom_indisponible: "Ce nom n'est pas disponible. Essaie une autre formulation.",
    quota_creation:   "Tu as utilisé tes trois créations de passion.",
    quota_jour:       "Tu as créé beaucoup de passions aujourd'hui. Reviens demain pour en créer d'autres.",
    quota_total:      "Tu as atteint le nombre de passions que tu peux créer.",
    trop_court:       "Donne un nom d'au moins 2 caractères.",
    trop_long:        "Un nom plus court : six mots au maximum.",
    // Refus et issues d'une DEMANDE (`deposerDemande`, passions-flat.js).
    trop_de_demandes: "Tu as déjà fait 5 demandes en 24 h. Réessaie demain.",
    deja_demandee:    "Tu as déjà demandé cette passion.",
    demande_refusee:  "Cette passion n'a pas pu être ajoutée à ton compte.",
    serveur_indisponible: "Le serveur n'a pas pu traiter la demande : rien n'a été ajouté. Réessaie dans un instant.",
    hors_ligne:       "Pas de connexion : la demande n'est pas partie. Réessaie quand tu seras en ligne.",
    sans_compte:      "Demande notée sur cet appareil. Crée un compte pour ajouter cette passion à tes passions."
  };

  // ── « Je ne trouve pas ma passion » → ON LA CRÉE ───────────────────
  // Le geste CONCLUT : le serveur écrit la passion au référentiel, elle est
  // sélectionnée dans la foulée, et PUBLIABLE tout de suite. Le chemin de
  // DEMANDE subsiste comme repli — hors ligne, sans compte, ou quand la RPC
  // échoue sans motif nommé — et, pour un compte, il conclut de même.
  Selecteur.prototype.creer = function () {
    var self = this;
    var m = moteur();
    if (!m || typeof m.creerPassion !== "function") return this.demanderAjout();
    var q = String(this.frappe || "").trim();
    if (!q) return;

    // ⚠️ LE BOUTON DIT « Demander l'ajout » → ON DÉPOSE UNE DEMANDE, POINT.
    // La première version envoyait TOUS les taps vers la création, donc vers la
    // porte d'inscription : un visiteur voyait un bouton promettre une demande,
    // tapait, et recevait un mur — la demande n'étant JAMAIS enregistrée, alors
    // qu'elle est faite pour ce cas-là. Le libellé et le geste doivent dire la
    // même chose.
    var peutCreer = false;
    try { peutCreer = !!(typeof m.creationDisponible === "function" && m.creationDisponible()); } catch (e) {}
    if (!peutCreer) return this.demanderAjout();

    // ⚠️ LE PLAFOND SE VÉRIFIE AVANT D'ÉCRIRE AU SERVEUR. Sans ça, `basculer`
    // refusait la sélection (plafond atteint → `onMax`, qui REMPLACE la
    // feuille) pendant que le toast annonçait « créée et ajoutée » : la passion
    // était bien écrite en base, le quota consommé, et elle n'était nulle part.
    if (this.cfg.mode !== "unique" && this.cfg.max && this.selection.length >= this.cfg.max) {
      if (typeof this.cfg.onMax === "function") { try { this.cfg.onMax(this.cfg.max); } catch (e) { journal("onMax", e); } return; }
      try { if (typeof toast === "function") toast("Maximum " + this.cfg.max + " passions pour commencer"); } catch (e) {}
      return;
    }

    // La porte, AVANT l'écriture : on ne demande pas à quelqu'un de nommer sa
    // passion pour lui apprendre ensuite qu'il lui fallait un compte.
    // ⚠️ `openModal` REMPLACE la feuille ouverte — c'est voulu : le sélecteur
    // s'efface derrière la porte d'inscription, il ne reste pas dessous.
    try {
      if (typeof requireAuthentication === "function" && !requireAuthentication("preferences")) return;
    } catch (e) { journal("gate", e); }

    // ⚠️ ON DÉCOUPE ICI, LE SERVEUR TRANCHE. Ce découpage n'est pas une
    // validation : `creer_passion` replie, borne à cinq, refuse le balisage et
    // ÉCARTE tout alias qui percute une passion existante. Une garde d'écran
    // n'a jamais été une garde — celle-ci ne sert qu'à ne pas envoyer de vide.
    var alias = String(this.alias || "").split(",")
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 1; })
      .slice(0, 5);

    m.creerPassion(q, alias.length ? { alias: alias } : null).then(function (r) {
      self.conclure(r);
    }).catch(function (e) {
      // ⚠️ JAMAIS MUET : sans ce toast, une faute dans le `.then` ci-dessus
      // faisait un tap qui ne produit RIEN — indiscernable d'un bouton mort.
      journal("creer", e);
      try { if (typeof toast === "function") toast("Impossible de créer cette passion pour le moment."); } catch (_) {}
    });
  };

  Selecteur.prototype.demanderAjout = function () {
    var self = this;
    var m = moteur();
    if (!m) return;
    var q = String(this.frappe || "").trim();
    // ⚠️ LE PLAFOND SE VÉRIFIE AVANT D'ÉCRIRE AU SERVEUR — comme pour une
    // création, et pour la même raison : la demande d'un compte est approuvée
    // et rattachée par le serveur ; refusée ensuite à la sélection, elle serait
    // créée, quota consommé, et nulle part à l'écran.
    if (this.cfg.mode !== "unique" && this.cfg.max && this.selection.length >= this.cfg.max) {
      if (typeof this.cfg.onMax === "function") { try { this.cfg.onMax(this.cfg.max); } catch (e) { journal("onMax", e); } return; }
      try { if (typeof toast === "function") toast("Maximum " + this.cfg.max + " passions pour commencer"); } catch (e) {}
      return;
    }
    m.deposerDemande(q).then(function (r) {
      r = r || {};
      if (!r.valide) {
        try { if (typeof toast === "function") toast("Donne un nom d'au moins 2 caractères."); } catch (e) {}
        return;
      }
      if (r.doublon) {
        // Elle existe déjà : on la sélectionne au lieu d'en créer une seconde.
        self.input.value = "";
        self.frappe = "";
        self.basculer(r.doublon.id);
        self.chercher();
        try { if (typeof toast === "function") toast("« " + r.doublon.label + " » existe déjà — ajoutée.", "success"); } catch (e) {}
        return;
      }
      self.conclure(r);
    }).catch(function (e) {
      journal("demande", e);
      try { if (typeof toast === "function") toast(MOTIFS.serveur_indisponible); } catch (_) {}
    });
  };

  // Ce que l'écran fait d'une réponse — création, ou demande. UNE fonction pour
  // les deux chemins : une passion obtenue est sélectionnée et annoncée, un refus
  // est NOMMÉ, et une demande non partie le dit sans rien promettre.
  Selecteur.prototype.conclure = function (r) {
    var self = this;
    r = r || {};
    if (r.erreur) {
      // ⚠️ TROIS CRÉATIONS OFFERTES, ENSUITE C'EST PAYANT (2026-09-08, soir).
      // Le plafond est tenu par le SERVEUR (`creer_passion` → `quota_creation`),
      // jamais par l'écran : un attribut d'affichage n'a jamais été une garde.
      // Mais un refus qui ne se prononce pas est indiscernable d'une panne —
      // règle de la fiche 16, réaffirmée par le revirement du 2026-09-04 :
      // une porte fermée doit dire par où passer. On ouvre donc le paywall,
      // comme TOUTES les autres portes d'acquisition, plutôt qu'un toast qui
      // disparaît avant d'être lu. Le même plafond refuse la DEMANDE d'un nom
      // nouveau (`trg_passion_request_auto` passe par `creer_passion`).
      if (/^quota_(creation|jour|total)$/.test(r.erreur)) {
        try { if (typeof toast === "function") toast(MOTIFS[r.erreur] || MOTIFS.quota_creation); } catch (e) {}
        try {
          if (typeof openPassionPaywall === "function") openPassionPaywall({ creation: true });
        } catch (e) { journal("paywall", e); }
        return;
      }
      try { if (typeof toast === "function") toast(MOTIFS[r.erreur] || "Impossible d'ajouter cette passion pour le moment."); } catch (e) {}
      return;
    }
    if (r.passion && r.passion.id) {
      self.input.value = "";
      self.frappe = "";
      self.alias = "";
      // ⚠️ LA SÉLECTION EST CE QUI LA GARDE : l'enregistrement des passions
      // réécrit le serveur depuis l'état local et retire de `user_passions` ce
      // qui n'y est pas — une passion approuvée mais pas choisie en repartirait.
      self.basculer(r.passion.id);
      self.chercher();
      try {
        if (typeof toast === "function") {
          toast(r.approuvee
            ? "« " + r.passion.label + " » ajoutée à tes passions."
            : r.cree
              ? "✨ « " + r.passion.label + " » créée et ajoutée."
              : "« " + r.passion.label + " » existe déjà — ajoutée.", "success");
        }
      } catch (e) {}
      // ⚠️ AUCUNE FRAPPE EN TÉLÉMÉTRIE : on n'envoie ni le nom, ni la recherche.
      try {
        if (window.tel && tel.action) {
          tel.action(r.approuvee ? "passion_demande_approuvee" : (r.cree ? "passion_creee" : "passion_deja_connue"), {});
        }
      } catch (e) {}
      return;
    }
    // Rien d'obtenu : la demande est partie et attend côté serveur, ou elle
    // n'est pas partie (sans compte, hors ligne). On le DIT — et sans rien
    // promettre : aucun code ne renvoie une demande restée sur l'appareil.
    self.input.value = "";
    self.frappe = "";
    self.chercher();
    try {
      if (typeof toast === "function") {
        if (r.envoyee) toast("Demande envoyée.", "success");
        else toast(MOTIFS[r.raison] || MOTIFS.hors_ligne);
      }
    } catch (e) {}
    try { if (typeof self.cfg.onDemande === "function") self.cfg.onDemande(r); } catch (e) {}
  };

  // ══════════════════════════════════════════════════════════════════════════
  // API PUBLIQUE
  // ══════════════════════════════════════════════════════════════════════════
  function monterDans(hote, config) {
    if (!hote) return null;
    try { return new Selecteur(hote, config); }
    catch (e) { journal("monter", e); return null; }
  }

  // Feuille basse. On réutilise `openModal` : elle pose déjà le « × », le fond
  // et la fermeture. ⚠️ `openModal` REMPLACE la modale ouverte, elle n'empile
  // pas — l'appelant qui ouvre le sélecteur depuis une autre modale doit se
  // souvenir d'où il venait.
  function ouvrir(config) {
    config = config || {};
    var idHote = "pselHote";
    try {
      if (typeof openModal !== "function") return null;
      openModal('<div class="modal-handle"></div><div id="' + idHote + '" class="psel-feuille"></div>');
    } catch (e) { journal("openModal", e); return null; }
    var hote = document.getElementById(idHote);
    if (!hote) return null;
    var suite = config.onValider;
    var suiteChoisir = config.onChoisir;
    var inst = monterDans(hote, Object.assign({}, config, {
      onValider: function (ids) {
        try { if (typeof closeModal === "function") closeModal(); } catch (e) {}
        if (typeof suite === "function") suite(ids);
      },
      onChoisir: function (id) {
        // En mode unique, choisir CONCLUT : garder la feuille ouverte après un
        // choix unique laisse croire qu'on peut en prendre un second.
        //
        // ⚠️ C'EST L'APPELANT QUI DÉCIDE DE FERMER, et l'ordre compte. La
        // première version fermait AVANT d'appeler `onChoisir` : un choix
        // REFUSÉ — au Studio, une passion que le serveur ne connaît pas encore —
        // refermait quand même la feuille, laissant un toast d'explication et
        // aucun moyen d'en choisir une autre sans tout rouvrir. Un `onChoisir`
        // qui rend `false` garde donc la main.
        var refuse = false;
        if (typeof suiteChoisir === "function") {
          try { refuse = (suiteChoisir(id) === false); } catch (e) { journal("onChoisir", e); }
        }
        if (!refuse && config.fermerAuChoix !== false) {
          try { if (typeof closeModal === "function") closeModal(); } catch (e) {}
        }
      },
    }));
    // Pas de mise au point automatique sur mobile : elle fait monter le clavier
    // par-dessus la feuille avant même qu'on ait vu ce qu'elle contient.
    return inst;
  }

  window.PassionSearchSelector = {
    monterDans: monterDans,
    ouvrir: ouvrir,
    // Pour les tests : le composant doit être observable sans passer par l'UI.
    _Selecteur: Selecteur,
  };
})();
