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
    this.input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var premier = self.resultats[0];
      if (premier) self.basculer(premier.id);
      else if (self.peutProposerAjout()) self.demanderAjout();
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
      if (action === "ajouter") { self.demanderAjout(); return; }
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
        self.rendreListe();
      })
      .catch(function (e) { journal("chercher", e); });
  };

  // ── Rendu ────────────────────────────────────────────────────────────────
  Selecteur.prototype.ligneHTML = function (p) {
    // ⚠️ NI le terme plus général, NI la « famille » ne s'affichent. Le modèle
    // est plat : une ligne, un nom, rien qui suggère qu'il faudrait passer par
    // autre chose.
    return '<button type="button" class="psel-item" role="option" aria-selected="false"'
      + ' data-psel="choisir" data-psel-id="' + ech(p.id) + '">'
      + '<span class="psel-item-emoji" aria-hidden="true">' + ech(p.emoji || "✨") + "</span>"
      + '<span class="psel-item-label">' + ech(p.label) + "</span>"
      + '<span class="psel-item-plus" aria-hidden="true">+</span>'
      + "</button>";
  };

  Selecteur.prototype.rendreListe = function () {
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
      html += '<button type="button" class="psel-ajouter" data-psel="ajouter"'
        + ' data-tel="passion_ajout_demande">'
        + "Ajouter « " + ech(q) + " » à mes passions</button>";
    }
    if (this.cfg.valider) {
      var n = this.selection.length;
      var bloque = (this.cfg.mode === "multi" && n === 0);
      html += '<button type="button" class="btn primary block psel-valider" data-psel="valider"'
        + (bloque ? " disabled" : "") + ">"
        + ech(this.cfg.valider) + (n ? " (" + n + ")" : "") + "</button>";
    }
    this.zonePied.innerHTML = html;
  };

  Selecteur.prototype.rendreChoisies = function () {
    var m = moteur();
    if (!this.selection.length) { this.zoneChoisies.innerHTML = ""; return; }
    this.zoneChoisies.innerHTML = '<p class="psel-section">Tes passions</p>'
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
      if (typeof this.cfg.onChoisir === "function") this.cfg.onChoisir(id);
      this.notifier();
      return;
    }
    var i = this.selection.indexOf(id);
    if (i >= 0) { this.selection.splice(i, 1); }
    else {
      if (this.cfg.max && this.selection.length >= this.cfg.max) {
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
    try { if (typeof this.cfg.onValider === "function") this.cfg.onValider(this.selection.slice()); }
    catch (e) { journal("onValider", e); }
  };

  // ── « Je ne trouve pas ma passion » ───────────────────────────────────────
  // ⚠️ LA DEMANDE N'EST PAS UNE PASSION PUBLIABLE. Elle apparaît dans « Mes
  // passions » avec l'état « En vérification », elle ne s'affiche pas sur le
  // profil public, et publier dessous reste refusé : `estPassionCanonique`
  // (app-02) est la seule autorité, et la clé étrangère de `posts.passion_id`
  // la refuserait de toute façon.
  Selecteur.prototype.demanderAjout = function () {
    var self = this;
    var m = moteur();
    if (!m) return;
    var q = String(this.frappe || "").trim();
    m.deposerDemande(q).then(function (r) {
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
      self.input.value = "";
      self.frappe = "";
      self.chercher();
      try {
        if (typeof toast === "function") {
          toast(r.envoyee
            ? "Demande envoyée. La passion apparaîtra « en vérification »."
            : "Demande enregistrée sur cet appareil. Elle partira à la prochaine connexion.", "success");
        }
      } catch (e) {}
      try { if (typeof self.cfg.onDemande === "function") self.cfg.onDemande(r); } catch (e) {}
    }).catch(function (e) { journal("demande", e); });
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
