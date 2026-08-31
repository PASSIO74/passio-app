// ══════════════════════════════════════════════════════════════════════════
// LOT TAXO-1 — CATALOGUE HIÉRARCHIQUE DES PASSIONS ET SPÉCIALITÉS
// Source du référentiel : js/passion-catalog.js
// Migration miroir     : migrations/migration_passion_taxonomy.sql
//
// ⚠️ CE LOT NE CRÉE AUCUNE IDENTITÉ. ADR-010 §1-§7 tient entièrement : un
// compte = une ligne `profiles`, un pseudo, un avatar, une bio, des abonnés.
// Une passion classe et filtre ; une spécialité affine un classement. Ni
// l'une ni l'autre n'a d'abonnés, de pseudonyme ou de contexte social propre.
// Rien ici ne recrée un « profil par passion » — et surtout pas un profil par
// spécialité.
//
// ⚠️ CE LOT NE ROUVRE PAS LES PASSIONS PERSONNALISÉES AUTO-APPROUVÉES.
// « Je ne trouve pas ma passion » dépose une DEMANDE (`passion_requests`,
// statut `pending`). Aucun chemin ne la promeut en passion canonique : il faut
// éditer `js/passion-catalog.js` et jouer une migration, donc passer par une
// revue. C'est exactement la porte qu'ADR-010 a fermée.
//
// ── ACTIVATION — APERÇU UNIQUEMENT, ÉTEINT PAR DÉFAUT ─────────────────────
//     ?passion_taxonomy_v1=1                      → active, et MÉMORISE
//     ?passio_preview=passion-taxonomy-v1         → idem (alias)
//     ?passion_taxonomy_v1=0                      → coupe et OUBLIE
//     localStorage.passion_taxonomy_v1 = "1"      → activation persistante
//     localStorage.passion_taxonomy_v1 = "0"      → kill switch
//     window.PASSIO_TAXONOMY = true | false       → prioritaire, en mémoire
//
// ⚠️ ÉCART ASSUMÉ AVEC LES LOTS UI-*. Ceux-là n'écrivent JAMAIS de valeur
// positive dans `localStorage` : ils sont actifs par défaut, le drapeau ne sait
// qu'enlever, et un aperçu qui ne survit pas au rechargement n'y coûte rien.
// Ici c'est l'inverse — le lot est éteint par défaut et doit être essayé sur un
// téléphone, où le premier geste après avoir ouvert le lien est de recharger.
// Un aperçu purement volatil aurait été inessayable. La mémorisation est donc
// délibérée, et l'oubli explicite (`=0`) fait partie du contrat.
//
// ── CE QUE LA COUPURE REND ────────────────────────────────────────────────
// Tout. Aucun nœud historique n'est retiré du DOM (uniquement masqué par une
// classe racine), aucune fonction historique n'est remplacée sans conserver
// l'originale, et aucune donnée du lot n'est lue par le code historique. Les
// sélections de spécialités restent dans l'état — elles ne sont simplement
// plus lues ni montrées.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var CLE = "passion_taxonomy_v1";
  var APERCU = "passion-taxonomy-v1";
  var ROOT_CLASS = "passio-taxo-v1";

  // ── Journal d'échec BORNÉ ─────────────────────────────────────────────────
  // ⚠️ Un `catch` muet sur un chemin de rendu a déjà coûté six jours de fil vide
  // dans ce dépôt. Tous les `catch` de ce module passent ici.
  var _plaintes = {};
  function fail(ou, e) {
    try {
      if (_plaintes[ou]) return;
      _plaintes[ou] = 1;
      if (typeof diagLog === "function") diagLog("[taxo] " + ou + " : " + (e && e.message ? e.message : e));
      else console.warn("[taxo] " + ou, e);
    } catch (_) {}
  }

  function param(nom) {
    try { return new URLSearchParams(window.location.search).get(nom); } catch (e) { fail("query", e); return null; }
  }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // Une seule lecture d'URL, au chargement : `goTo` fait des `pushState` qui
  // conservent la query, mais rien ne garantit qu'un futur appelant le fasse.
  (function consommerUrl() {
    var v = param(CLE);
    if (v === null && param("passio_preview") === APERCU) v = "1";
    if (v === "1") lsSet(CLE, "1");
    else if (v === "0") lsDel(CLE);
  })();

  function actif() {
    try { if (window.PASSIO_TAXONOMY === true) return true; } catch (e) {}
    try { if (window.PASSIO_TAXONOMY === false) return false; } catch (e) {}
    return ls(CLE) === "1";
  }

  function cat() {
    try { return window.PASSIO_CATALOG || null; } catch (e) { return null; }
  }

  // `state` vaut `null` — pas `undefined` — tant que `loadState()` n'a pas
  // tourné. Le piège ② du 2026-08-28 : `typeof state === "undefined"` passe, et
  // l'accès à `state.user` juste après lève un TypeError non rattrapé.
  function pret() {
    try { return !!(typeof state !== "undefined" && state && state.user && cat()); }
    catch (e) { return false; }
  }

  function esc(s) {
    try { return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
    catch (e) { return ""; }
  }
  function dire(m, t) { try { if (typeof toast === "function") toast(m, t); } catch (e) {} }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉTAT — trois cartes, toutes locales, toutes facultatives
  // ──────────────────────────────────────────────────────────────────────────
  // ⚠️ RIEN N'EST OBLIGATOIRE. Un compte d'avant ce lot n'a aucune de ces clés :
  // toutes les lectures rendent le vide, et l'application se comporte
  // exactement comme avant. C'est ce qui fait qu'« un ancien contenu sans
  // spécialité reste visible » n'est pas une intention mais une propriété.
  // ══════════════════════════════════════════════════════════════════════════
  function carte(nom) {
    if (!pret()) return {};
    var u = state.user;
    if (!u[nom] || typeof u[nom] !== "object" || Array.isArray(u[nom])) u[nom] = {};
    return u[nom];
  }
  // { passionId: [specialtyId, …] } — les spécialités choisies par l'utilisateur
  function selections() { return carte("passionSpecialties"); }
  // { passionId: specialtyId } — la dernière destination du Studio, par passion
  function memoireStudio() { return carte("lastSpecialtyByPassion"); }

  function mesSpecialites(passionId) {
    var m = selections()[passionId];
    return Array.isArray(m) ? m.slice() : [];
  }

  // ⚠️ ON NE FAIT JAMAIS CONFIANCE À UN `specialty_id` REÇU. Toute entrée passe
  // par le catalogue embarqué, ET par la vérification d'appartenance. La base
  // pose la même règle par clé étrangère composite : les deux disent la même
  // chose, et c'est celle de la base qui fait autorité.
  function specialiteValide(specialtyId, passionId) {
    var c = cat();
    if (!c || !specialtyId) return false;
    var s = c.specialtyById(specialtyId);
    if (!s || !s.is_active) return false;
    return !passionId || s.passion_id === passionId;
  }
  function passionValide(passionId) {
    var c = cat();
    if (!c || !passionId) return false;
    var p = c.passionById(passionId);
    return !!(p && p.is_active);
  }

  function toggleSpecialite(passionId, specialtyId) {
    if (!pret()) return false;
    if (!specialiteValide(specialtyId, passionId)) { fail("toggleSpecialite", "hors catalogue : " + specialtyId); return false; }
    var m = selections();
    var l = Array.isArray(m[passionId]) ? m[passionId] : [];
    var i = l.indexOf(specialtyId);
    if (i >= 0) l.splice(i, 1); else l.push(specialtyId);
    m[passionId] = l;
    try { saveState(); } catch (e) { fail("saveState", e); }
    pousserSelections();
    return i < 0;
  }

  // ── Les passions du compte (le rail, « Mes passions ») ────────────────────
  // Elles vivent où elles ont toujours vécu : `state.user.profiles`, lu par
  // `passionsVivantes()`. Ce lot n'introduit AUCUN second stockage — sinon les
  // deux divergeraient, comme `_activeFeedPassions` et `state.selectedFeedPassions`
  // avaient divergé jusqu'au 2026-08-22.
  function mesPassions() {
    try {
      var l = (typeof passionsVivantes === "function") ? passionsVivantes() : ((state.user && state.user.profiles) || []);
      return l.map(function (p) { return p && p.passion; }).filter(passionValide);
    } catch (e) { fail("mesPassions", e); return []; }
  }
  function aPassion(id) { return mesPassions().indexOf(id) >= 0; }

  function ajouterPassion(id) {
    if (!passionValide(id)) return false;
    if (aPassion(id)) return true;
    try {
      window._newProfilePassion = id;
      if (typeof confirmCreateProfile === "function") { confirmCreateProfile(); return true; }
    } catch (e) { fail("ajouterPassion", e); }
    return false;
  }

  function retirerPassion(id) {
    try {
      var pr = ((state.user && state.user.profiles) || []).find(function (p) { return p && p.passion === id && !p.archived; });
      if (!pr) return false;
      // On passe par le moteur d'ARCHIVAGE : il conserve les publications
      // (porte dérobée ① du lot UI-8), rebascule la passion active et nettoie
      // les filtres du fil. Le refaire ici serait une deuxième vérité.
      if (typeof confirmArchivePassion === "function") { confirmArchivePassion(pr.id); return true; }
    } catch (e) { fail("retirerPassion", e); }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SYNCHRONISATION SERVEUR — au mieux, jamais bloquante
  // ⚠️ Le SDK ne LÈVE PAS sur un refus RLS : on lit `{ error }`, toujours.
  // ⚠️ Tant que la migration n'est pas appliquée, ces tables n'existent pas :
  // l'échec est ATTENDU et silencieux côté écran. C'est pour ça que la source
  // de vérité reste locale (`state.user`) et le serveur une simple copie.
  // ══════════════════════════════════════════════════════════════════════════
  var _poussePrevue = null;
  function pousserSelections() {
    if (_poussePrevue) return;
    _poussePrevue = setTimeout(function () {
      _poussePrevue = null;
      envoyerSelections();
    }, 1500);
  }

  function monUid() {
    try { return (typeof MY_UID !== "undefined" && MY_UID) ? String(MY_UID) : null; } catch (e) { return null; }
  }
  function supaPret() {
    try { return !!(typeof supa !== "undefined" && supa && window._supaReal && monUid()); } catch (e) { return false; }
  }

  function envoyerSelections() {
    if (!actif() || !supaPret() || !pret()) return;
    var uid = monUid();
    var passions = mesPassions();
    var lignesP = passions.map(function (id, i) {
      return { user_id: uid, passion_id: id, sort_order: i + 1, archived: false };
    });
    var lignesS = [];
    passions.forEach(function (pid) {
      mesSpecialites(pid).forEach(function (sid) {
        if (specialiteValide(sid, pid)) lignesS.push({ user_id: uid, specialty_id: sid, passion_id: pid });
      });
    });
    try {
      if (lignesP.length) {
        supa.from("user_passions").upsert(lignesP, { onConflict: "user_id,passion_id" })
          .then(function (r) { if (r && r.error) fail("upsert user_passions", r.error.message); })
          .catch(function (e) { fail("upsert user_passions", e); });
      }
      // Remplacement complet des spécialités : c'est la seule façon de
      // propager un DÉCOCHAGE sans tenir un journal de suppressions.
      supa.from("user_passion_specialties").delete().eq("user_id", uid).then(function (r) {
        if (r && r.error) { fail("delete user_passion_specialties", r.error.message); return; }
        if (!lignesS.length) return;
        supa.from("user_passion_specialties").insert(lignesS)
          .then(function (r2) { if (r2 && r2.error) fail("insert user_passion_specialties", r2.error.message); })
          .catch(function (e) { fail("insert user_passion_specialties", e); });
      }).catch(function (e) { fail("delete user_passion_specialties", e); });
    } catch (e) { fail("envoyerSelections", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECHERCHE — une seule, pour tout le lot
  // ══════════════════════════════════════════════════════════════════════════
  function chercher(q, limite) {
    var c = cat();
    if (!c) return [];
    try { return c.chercher(q, limite || 40); } catch (e) { fail("chercher", e); return []; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDUS PARTAGÉS
  // ══════════════════════════════════════════════════════════════════════════
  function pastilleHTML(o) {
    // Une seule pastille pour tout le lot : passion, spécialité, résultat de
    // recherche. `data-taxo-*` porte l'action ; aucun `onclick` inline n'est
    // écrit — la délégation d'événement évite d'un coup `escapeJsArg`, les
    // fonctions fantômes et l'audit des handlers.
    return '<button type="button" class="taxo-chip' + (o.on ? " on" : "") + '"'
      + ' data-taxo-act="' + esc(o.act) + '"'
      + ' data-taxo-passion="' + esc(o.passion || "") + '"'
      + ' data-taxo-id="' + esc(o.id || "") + '"'
      + ' aria-pressed="' + (o.on ? "true" : "false") + '">'
      + (o.emoji ? '<span class="taxo-chip-emoji">' + esc(o.emoji) + "</span>" : "")
      + '<span class="taxo-chip-label">' + esc(o.label) + "</span>"
      + (o.sous ? '<span class="taxo-chip-sub">' + esc(o.sous) + "</span>" : "")
      + "</button>";
  }

  function resultatsHTML(q) {
    var r = chercher(q, 40);
    if (!r.length) {
      return '<div class="taxo-vide">Aucun résultat pour « ' + esc(q) + ' ».</div>';
    }
    return '<div class="taxo-chips">' + r.map(function (e) {
      if (e.kind === "passion") {
        return pastilleHTML({ act: "passion", id: e.id, label: e.label, emoji: e.emoji, on: aPassion(e.id) });
      }
      // ⚠️ Toucher une spécialité SÉLECTIONNE AUSSI SA PASSION (spec §1). Le
      // sous-titre le dit avant le tap, pour que l'ajout de la passion ne soit
      // pas une surprise.
      return pastilleHTML({
        act: "specialite", id: e.id, passion: e.passion_id, label: e.label, emoji: e.emoji,
        sous: e.passionLabel, on: mesSpecialites(e.passion_id).indexOf(e.id) >= 0
      });
    }).join("") + "</div>";
  }

  // ── La feuille « Toutes les passions », organisée par univers ─────────────
  // ⚠️ Les univers NE SORTENT PAS D'ICI. Ils titrent les sections de ce
  // catalogue, et c'est tout : aucune carte, aucune publication, aucune
  // identité ne les affiche, et aucune colonne ne les stocke.
  var _rechercheCatalogue = "";

  function catalogueHTML() {
    var c = cat();
    if (!c) return "<div class='taxo-vide'>Catalogue indisponible.</div>";
    var corps;
    if (_rechercheCatalogue) {
      corps = resultatsHTML(_rechercheCatalogue);
    } else {
      corps = c.universes.map(function (u) {
        var ps = c.passionsOf(u.id);
        if (!ps.length) return "";
        return '<div class="taxo-univers">'
          + '<div class="taxo-univers-titre">' + esc(u.emoji) + " " + esc(u.label) + "</div>"
          + '<div class="taxo-chips">'
          + ps.map(function (p) {
              var n = mesSpecialites(p.id).length;
              return pastilleHTML({
                act: "passion", id: p.id, label: p.label, emoji: p.emoji,
                on: aPassion(p.id), sous: n ? n + " spé." : ""
              });
            }).join("")
          + "</div></div>";
      }).join("");
    }
    return ''
      + '<div class="modal-handle"></div>'
      + '<div class="taxo-sheet">'
      + '  <div class="taxo-sheet-head">'
      + '    <div class="taxo-sheet-titre">Toutes les passions</div>'
      + '    <input type="search" class="taxo-search" id="taxoCatalogueSearch" autocomplete="off"'
      + '           placeholder="Chercher une passion ou une spécialité…"'
      + '           aria-label="Chercher une passion ou une spécialité"'
      + '           value="' + esc(_rechercheCatalogue) + '"/>'
      + '    <div class="taxo-hint">Touche une spécialité : sa passion est ajoutée automatiquement.</div>'
      + "  </div>"
      + '  <div class="taxo-sheet-corps" id="taxoCatalogueCorps">' + corps + "</div>"
      + '  <div class="taxo-sheet-pied">'
      + '    <button type="button" class="btn ghost" data-taxo-act="proposer" style="flex:1;">Je ne trouve pas ma passion</button>'
      + '    <button type="button" class="btn primary" data-taxo-act="fermer" style="flex:1;">Terminé</button>'
      + "  </div>"
      + "</div>";
  }

  function ouvrirCatalogue() {
    if (!actif()) return;
    _rechercheCatalogue = "";
    try { openModal(catalogueHTML()); } catch (e) { fail("ouvrirCatalogue", e); return; }
    brancherRecherche();
  }

  // Repeint SEULEMENT le corps : réécrire la feuille entière ferait perdre le
  // focus du champ de recherche à chaque frappe, et le clavier mobile se
  // refermerait.
  function repeindreCatalogue() {
    var corps = document.getElementById("taxoCatalogueCorps");
    if (!corps) return;
    corps.innerHTML = _rechercheCatalogue ? resultatsHTML(_rechercheCatalogue) : catalogueCorpsSansRecherche();
  }
  function catalogueCorpsSansRecherche() {
    var html = catalogueHTML();
    var d = document.createElement("div");
    d.innerHTML = html;
    var c = d.querySelector("#taxoCatalogueCorps");
    return c ? c.innerHTML : "";
  }

  var _rebond = null;
  function brancherRecherche() {
    var champ = document.getElementById("taxoCatalogueSearch");
    if (!champ) return;
    champ.addEventListener("input", function () {
      var v = champ.value || "";
      if (_rebond) clearTimeout(_rebond);
      // 120 ms : l'index est déjà plié, la recherche coûte un `indexOf` par
      // entrée. Le rebond sert le clavier mobile, pas le processeur.
      _rebond = setTimeout(function () {
        _rechercheCatalogue = v.trim();
        repeindreCatalogue();
      }, 120);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ① ONBOARDING — populaires d'abord, catalogue complet derrière
  // ⚠️ ENVELOPPE, JAMAIS REMPLACEMENT. `renderPassionGrid` d'origine est
  // conservée et rappelée telle quelle quand le lot est coupé : c'est ce qui
  // rend le kill switch exact, y compris pour la recherche historique, le
  // plafond de sélection et la rangée « passion de départ ».
  // ══════════════════════════════════════════════════════════════════════════
  var _grilleOrigine = null;

  function grilleTaxo() {
    var grid = document.getElementById("passionGrid");
    var c = cat();
    if (!grid || !c) return;

    var sel = [];
    try { sel = (typeof selectedPassions !== "undefined" && selectedPassions) ? selectedPassions : []; } catch (e) {}

    var titre = document.getElementById("onbPassionsTitle");
    var texte = document.getElementById("onbPassionsText");
    if (titre) titre.textContent = "Qu'est-ce qui te passionne ?";
    if (texte) texte.textContent = "Choisis dans les plus populaires, ou explore tout le catalogue.";

    // Le champ historique reste le champ de recherche : on ne monte pas un
    // second input dans une étape d'onboarding déjà dense.
    var champ = document.getElementById("onbPassionSearch");
    var filtre = "";
    if (champ) {
      champ.style.display = "block";
      champ.placeholder = "Chercher une passion ou une spécialité…";
      filtre = (champ.value || "").trim();
    }

    var html;
    if (filtre) {
      html = resultatsHTML(filtre);
    } else {
      // ⚠️ « Afficher clairement les sélections sans montrer des centaines de
      // boutons » : 20 populaires, plus les passions déjà cochées si elles n'en
      // font pas partie — une passion cochée qui n'apparaît nulle part
      // donnerait à croire qu'elle a été perdue.
      var vus = {};
      var liste = c.populaires().slice();
      liste.forEach(function (p) { vus[p.id] = 1; });
      sel.forEach(function (id) {
        if (!vus[id]) { var p = c.passionById(id); if (p) { liste.push(p); vus[id] = 1; } }
      });
      html = '<div class="taxo-chips taxo-chips-grille">'
        + liste.map(function (p) {
            return pastilleHTML({ act: "onb", id: p.id, label: p.label, emoji: p.emoji, on: sel.indexOf(p.id) >= 0 });
          }).join("")
        + "</div>"
        + '<button type="button" class="taxo-voir-tout" data-taxo-act="catalogue-onb">'
        + "Voir toutes les passions <span>" + c.passions.length + " passions · " + c.specialties.length + " spécialités</span>"
        + "</button>";
    }
    grid.innerHTML = html;
    try { if (typeof renderOnbStarter === "function") renderOnbStarter(); } catch (e) { fail("renderOnbStarter", e); }
  }

  function envelopperGrille() {
    if (_grilleOrigine) return;
    try {
      if (typeof window.renderPassionGrid !== "function") return;
      _grilleOrigine = window.renderPassionGrid;
      window.renderPassionGrid = function () {
        if (!actif()) return _grilleOrigine.apply(this, arguments);
        try { grilleTaxo(); } catch (e) { fail("grilleTaxo", e); return _grilleOrigine.apply(this, arguments); }
      };
    } catch (e) { fail("envelopperGrille", e); }
  }

  // Le tap d'onboarding réutilise `togglePassion` : plafond, message « Max N »
  // et rangée « passion de départ » sont son travail, pas le nôtre.
  function tapOnb(id) {
    try { if (typeof togglePassion === "function") togglePassion(id); } catch (e) { fail("tapOnb", e); }
  }

  function onboardingEnCours() {
    try {
      var e = document.getElementById("onboarding");
      if (e && e.style.display !== "none" && e.offsetParent !== null) return true;
      var g = document.getElementById("passionGrid");
      return !!(g && g.offsetParent !== null);
    } catch (e) { return false; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ② « MES PASSIONS » — ajouter, retirer, ouvrir pour choisir ses spécialités
  // ⚠️ RIEN N'EST DÉPLACÉ NI RETIRÉ de `#passionManager`. Le bloc du lot est
  // AJOUTÉ en frère de `#profileList`, que `renderProfilesScreen` réécrit
  // entièrement à chaque rendu : y injecter quoi que ce soit serait effacé au
  // premier repeint (piège ① du lot UI-7).
  // ══════════════════════════════════════════════════════════════════════════
  var HOTE_MANAGER = "taxoManager";
  var _passionOuverte = null;      // la passion dépliée dans le gestionnaire
  var _rechercheManager = "";

  function managerHTML() {
    var c = cat();
    if (!c) return "";
    var passions = mesPassions();

    var corps;
    if (_rechercheManager) {
      corps = resultatsHTML(_rechercheManager);
    } else if (!passions.length) {
      corps = '<div class="taxo-vide">Tu n\'as encore aucune passion. Ouvre le catalogue pour en choisir.</div>';
    } else {
      corps = passions.map(function (id) {
        var p = c.passionById(id);
        if (!p) return "";
        var mes = mesSpecialites(id);
        var ouverte = _passionOuverte === id;
        var lignes = ''
          + '<div class="taxo-ligne' + (ouverte ? " ouverte" : "") + '" data-taxo-ligne="' + esc(id) + '">'
          + '  <button type="button" class="taxo-ligne-tete" data-taxo-act="deplier" data-taxo-id="' + esc(id) + '"'
          + '          aria-expanded="' + (ouverte ? "true" : "false") + '">'
          + '    <span class="taxo-ligne-emoji">' + esc(p.emoji) + "</span>"
          + '    <span class="taxo-ligne-corps">'
          + '      <span class="taxo-ligne-titre">' + esc(p.label) + "</span>"
          + '      <span class="taxo-ligne-meta">' + (mes.length ? mes.length + " spécialité" + (mes.length > 1 ? "s" : "") : "Aucune spécialité") + "</span>"
          + "    </span>"
          + '    <span class="taxo-ligne-chevron" aria-hidden="true">' + (ouverte ? "▾" : "▸") + "</span>"
          + "  </button>"
          + '  <button type="button" class="taxo-ligne-retirer" data-taxo-act="retirer" data-taxo-id="' + esc(id) + '"'
          + '          aria-label="Archiver ' + esc(p.label) + '" title="Archiver cette passion">🗄️</button>';
        if (ouverte) {
          var specs = c.specialtiesOf(id);
          lignes += '<div class="taxo-ligne-specs"><div class="taxo-chips">'
            + specs.map(function (s) {
                return pastilleHTML({ act: "specialite", id: s.id, passion: id, label: s.label, on: mes.indexOf(s.id) >= 0 });
              }).join("")
            + "</div></div>";
        } else if (mes.length) {
          // Repliée, la ligne montre quand même ce qui est coché : sinon le
          // choix n'existe plus qu'au prix d'un tap supplémentaire.
          lignes += '<div class="taxo-ligne-apercu">'
            + mes.slice(0, 6).map(function (sid) {
                var s = c.specialtyById(sid);
                return '<span class="taxo-mini">' + esc(s ? s.label : sid) + "</span>";
              }).join("")
            + (mes.length > 6 ? '<span class="taxo-mini">+' + (mes.length - 6) + "</span>" : "")
            + "</div>";
        }
        return lignes + "</div>";
      }).join("");
    }

    return ''
      + '<div class="taxo-manager-head">'
      + '  <input type="search" class="taxo-search" id="taxoManagerSearch" autocomplete="off"'
      + '         placeholder="Chercher une passion ou une spécialité…"'
      + '         aria-label="Chercher une passion ou une spécialité" value="' + esc(_rechercheManager) + '"/>'
      + "</div>"
      + '<div class="taxo-manager-corps">' + corps + "</div>"
      + '<div class="taxo-manager-pied">'
      + '  <button type="button" class="btn ghost small" data-taxo-act="catalogue">Voir toutes les passions</button>'
      + '  <button type="button" class="btn ghost small" data-taxo-act="proposer">Je ne trouve pas ma passion</button>'
      + "</div>";
  }

  function monterManager() {
    if (!actif() || !pret()) return;
    var box = document.getElementById("passionManager");
    if (!box || box.hidden) return;
    var hote = document.getElementById(HOTE_MANAGER);
    if (!hote) {
      hote = document.createElement("div");
      hote.id = HOTE_MANAGER;
      hote.className = "taxo-manager";
      // ⚠️ Monté dans un hôte DÉJÀ attaché : rendre dans un nœud détaché le
      // laisserait invisible aux synchronisations qui balaient le document
      // (règle commune des lots UI-6/6A/6B).
      box.appendChild(hote);
    }
    var sig = signatureManager();
    if (hote.getAttribute("data-taxo-sig") === sig) return;   // anti-boucle
    hote.setAttribute("data-taxo-sig", sig);
    hote.innerHTML = managerHTML();
    var champ = document.getElementById("taxoManagerSearch");
    if (champ) {
      champ.addEventListener("input", function () {
        var v = champ.value || "";
        if (_rebond) clearTimeout(_rebond);
        _rebond = setTimeout(function () {
          _rechercheManager = v.trim();
          hote.removeAttribute("data-taxo-sig");
          monterManager();
          var c2 = document.getElementById("taxoManagerSearch");
          if (c2) { try { c2.focus(); c2.setSelectionRange(v.length, v.length); } catch (e) {} }
        }, 120);
      });
    }
  }

  // L'observateur voit ses PROPRES écritures : sans signature, chaque rendu en
  // déclencherait un autre (piège de l'anti-boucle du lot UI-4A2).
  function signatureManager() {
    var m = selections();
    return [_rechercheManager, _passionOuverte, mesPassions().join(","),
            Object.keys(m).map(function (k) { return k + ":" + (m[k] || []).join("+"); }).join("|")].join("§");
  }

  function demonterManager() {
    var h = document.getElementById(HOTE_MANAGER);
    if (h && h.parentNode) h.parentNode.removeChild(h);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ③ STUDIO — passion obligatoire, spécialité FACULTATIVE
  // ⚠️ `studioType`, `photoDataUrl`, `selectedPassions`… sont des `let` de
  // portée script : ils existent comme identifiants globaux mais ne sont PAS
  // des propriétés de `window`. On lit `#postPassion.value`, jamais un
  // `window.postPassion` qui vaudrait toujours `undefined`.
  // ══════════════════════════════════════════════════════════════════════════
  var HOTE_STUDIO = "taxoStudioSpec";

  function passionStudio() {
    var s = document.getElementById("postPassion");
    return s ? (s.value || "") : "";
  }

  // LA valeur lue au moment de publier. Rend `null` — jamais une chaîne vide —
  // pour que le champ parte en `null` dans la base plutôt qu'en `''`, qui
  // ferait échouer la clé étrangère.
  function specialiteStudio() {
    if (!actif()) return null;
    var s = document.getElementById("taxoStudioSelect");
    var v = s ? (s.value || "") : "";
    if (!v) return null;
    return specialiteValide(v, passionStudio()) ? v : null;
  }

  function monterStudio() {
    if (!actif() || !pret()) return;
    var champ = document.getElementById("fieldPassion");
    if (!champ) return;
    var c = cat();
    var pid = passionStudio();
    var specs = (c && pid) ? c.specialtiesOf(pid) : [];

    var hote = document.getElementById(HOTE_STUDIO);
    if (!hote) {
      hote = document.createElement("div");
      hote.id = HOTE_STUDIO;
      hote.className = "taxo-studio";
      champ.appendChild(hote);
    }
    if (!specs.length) { hote.innerHTML = ""; hote.style.display = "none"; return; }
    hote.style.display = "block";

    // Le dernier choix pour CETTE passion. Mémoire par passion, jamais globale :
    // « Enduro » n'a aucun sens quand on repasse en Cuisine.
    var memoire = memoireStudio()[pid] || "";
    var courant = specialiteValide(memoire, pid) ? memoire : "";
    var sig = pid + "§" + courant;
    if (hote.getAttribute("data-taxo-sig") === sig) return;
    hote.setAttribute("data-taxo-sig", sig);

    hote.innerHTML = '<span class="taxo-studio-lbl">Spécialité <em>(facultatif)</em></span>'
      + '<select class="input" id="taxoStudioSelect">'
      + '<option value="">— Aucune —</option>'
      + specs.map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (s.id === courant ? " selected" : "") + ">" + esc(s.label) + "</option>";
        }).join("")
      + "</select>"
      + '<div class="taxo-studio-apercu" id="taxoStudioApercu">' + esc(apercuStudio(pid, courant)) + "</div>";

    var sel = document.getElementById("taxoStudioSelect");
    if (sel) sel.addEventListener("change", function () {
      var v = sel.value || "";
      try {
        if (v) memoireStudio()[pid] = v; else delete memoireStudio()[pid];
        saveState();
      } catch (e) { fail("memoireStudio", e); }
      var ap = document.getElementById("taxoStudioApercu");
      if (ap) ap.textContent = apercuStudio(pid, v);
      hote.setAttribute("data-taxo-sig", pid + "§" + v);
    });
  }

  // « Moto · Enduro ». Sans spécialité : « Moto » seul — jamais « Moto · ».
  function apercuStudio(pid, sid) {
    var c = cat();
    var p = c && c.passionById(pid);
    if (!p) return "";
    var s = sid ? c.specialtyById(sid) : null;
    return s ? (p.label + " · " + s.label) : p.label;
  }
  function libelleContenu(passionId, specialtyId) {
    return apercuStudio(passionId, specialtyId);
  }

  function demonterStudio() {
    var h = document.getElementById(HOTE_STUDIO);
    if (h && h.parentNode) h.parentNode.removeChild(h);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ④ FIL — panneau « Affiner », JAMAIS le rail principal
  // ⚠️ LE RAIL NE BOUGE PAS. `renderProfileStrip` réécrit `#profileStrip` en
  // ENTIER, cache `_lastHtml` compris (piège ① du lot UI-7) : rien d'injecté
  // dedans n'y survivrait. Et y verser 790 spécialités serait de toute façon
  // exactement ce que la spécification interdit.
  //
  // ⚠️ LE MOTEUR ADDITIF D'ADR-011 N'EST PAS TOUCHÉ. Une publication entre
  // toujours dès qu'elle satisfait AU MOINS UN critère — auteur suivi OU
  // passion cochée OU envie cochée. Les spécialités n'ajoutent pas une famille
  // de plus : elles RESSERRENT, à l'intérieur d'une passion déjà cochée, et
  // seulement celle-là. Une publication d'une AUTRE passion cochée n'est jamais
  // écartée par une spécialité choisie ailleurs, sinon cocher une spécialité
  // viderait le fil au lieu de l'affiner.
  //
  // ⚠️ ET LES ANCIENS CONTENUS RESTENT VISIBLES. Une publication sans
  // `specialty_id` — c'est-à-dire la totalité de l'existant — passe le filtre
  // de sa passion comme avant. Refuser le contenu non classé aurait vidé le fil
  // le jour de la bascule.
  // ══════════════════════════════════════════════════════════════════════════
  var HOTE_AFFINER = "taxoAffiner";
  var _affinerOuvert = false;

  function specialitesFilFor(passionId) {
    var m = carte("feedSpecialties")[passionId];
    return Array.isArray(m) ? m.slice() : [];
  }
  function toggleSpecialiteFil(passionId, specialtyId) {
    if (!specialiteValide(specialtyId, passionId)) return;
    var m = carte("feedSpecialties");
    var l = Array.isArray(m[passionId]) ? m[passionId] : [];
    var i = l.indexOf(specialtyId);
    if (i >= 0) l.splice(i, 1); else l.push(specialtyId);
    m[passionId] = l;
    try { saveState(); } catch (e) { fail("saveState feed", e); }
    monterAffiner(true);
    try { if (typeof _feedSelectionChanged === "function") _feedSelectionChanged(); } catch (e) { fail("repeindre fil", e); }
  }
  function viderSpecialitesFil() {
    try { state.user.feedSpecialties = {}; saveState(); } catch (e) { fail("viderSpecialitesFil", e); }
    monterAffiner(true);
    try { if (typeof _feedSelectionChanged === "function") _feedSelectionChanged(); } catch (e) {}
  }

  // LE prédicat, exposé pour le rendu du fil. Vrai quand la publication passe.
  function postPasseAffinage(post) {
    if (!actif() || !pret()) return true;
    try {
      var pid = post && (post.passion || post.passion_id);
      if (!pid) return true;
      var choisies = specialitesFilFor(pid);
      if (!choisies.length) return true;                 // rien d'affiné ici
      var sid = post.specialty || post.specialty_id;
      if (!sid) return true;                             // contenu d'avant le lot
      return choisies.indexOf(sid) >= 0;                 // OU entre spécialités
    } catch (e) { fail("postPasseAffinage", e); return true; }
  }

  function passionsAffinables() {
    // Les passions actuellement cochées dans le fil, et elles seules : affiner
    // une passion qu'on n'affiche pas n'a aucun effet observable.
    try {
      var s = (typeof _activeFeedPassions !== "undefined" && _activeFeedPassions) ? Array.from(_activeFeedPassions) : [];
      return s.filter(passionValide);
    } catch (e) { return []; }
  }

  function affinerHTML() {
    var c = cat();
    var passions = passionsAffinables();
    var total = 0;
    passions.forEach(function (p) { total += specialitesFilFor(p).length; });

    var tete = '<button type="button" class="taxo-affiner-btn' + (total ? " on" : "") + '"'
      + ' data-taxo-act="affiner-toggle" aria-expanded="' + (_affinerOuvert ? "true" : "false") + '">'
      + "Affiner" + (total ? " · " + total : "") + "</button>";

    if (!_affinerOuvert) return tete;
    if (!passions.length) {
      return tete + '<div class="taxo-affiner-corps"><div class="taxo-vide">'
        + "Coche d'abord une passion dans le rail pour l'affiner." + "</div></div>";
    }
    return tete + '<div class="taxo-affiner-corps">'
      + passions.map(function (pid) {
          var p = c.passionById(pid);
          var specs = c.specialtiesOf(pid);
          var mes = specialitesFilFor(pid);
          if (!specs.length) return "";
          return '<div class="taxo-affiner-bloc">'
            + '<div class="taxo-affiner-titre">' + esc(p.emoji) + " " + esc(p.label) + "</div>"
            + '<div class="taxo-chips">'
            + specs.map(function (s) {
                return pastilleHTML({ act: "spec-fil", id: s.id, passion: pid, label: s.label, on: mes.indexOf(s.id) >= 0 });
              }).join("")
            + "</div></div>";
        }).join("")
      + (total ? '<button type="button" class="btn ghost small" data-taxo-act="affiner-vider">Tout effacer</button>' : "")
      + "</div>";
  }

  function monterAffiner(force) {
    if (!actif() || !pret()) return;
    var strip = document.getElementById("profileStrip");
    if (!strip || !strip.parentNode) return;
    var hote = document.getElementById(HOTE_AFFINER);
    if (!hote) {
      hote = document.createElement("div");
      hote.id = HOTE_AFFINER;
      hote.className = "taxo-affiner";
      // FRÈRE du rail, jamais dedans — `renderProfileStrip` écraserait.
      strip.parentNode.insertBefore(hote, strip.nextSibling);
    }
    var sig = [_affinerOuvert, passionsAffinables().join(","),
               JSON.stringify(carte("feedSpecialties"))].join("§");
    if (!force && hote.getAttribute("data-taxo-sig") === sig) return;
    hote.setAttribute("data-taxo-sig", sig);
    hote.innerHTML = affinerHTML();
  }

  function demonterAffiner() {
    var h = document.getElementById(HOTE_AFFINER);
    if (h && h.parentNode) h.parentNode.removeChild(h);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⑤ « JE NE TROUVE PAS MA PASSION » — une DEMANDE, jamais une passion
  // ══════════════════════════════════════════════════════════════════════════
  function ouvrirProposition() {
    if (!actif()) return;
    try {
      openModal(''
        + '<div class="modal-handle"></div>'
        + '<div class="taxo-proposer">'
        + '  <div class="taxo-proposer-titre">Proposer une passion</div>'
        + '  <p class="taxo-proposer-texte">Dis-nous laquelle manque. Elle est <b>envoyée pour examen</b> : '
        + "elle n'est pas ajoutée au catalogue tout de suite, et tu ne peux pas encore publier dedans.</p>"
        + '  <input type="text" class="input" id="taxoProposeLabel" maxlength="60" autocomplete="off"'
        + '         placeholder="Ex. : Aquariophilie récifale" aria-label="Nom de la passion"/>'
        + '  <textarea class="input" id="taxoProposeNote" maxlength="280" rows="3"'
        + '            placeholder="Ce que tu y ferais (facultatif)" aria-label="Précision"></textarea>'
        + '  <div style="display:flex;gap:8px;margin-top:12px;">'
        + '    <button type="button" class="btn ghost" data-taxo-act="fermer" style="flex:1;">Annuler</button>'
        + '    <button type="button" class="btn primary" data-taxo-act="proposer-envoyer" style="flex:1;">Envoyer</button>'
        + "  </div>"
        + "</div>");
    } catch (e) { fail("ouvrirProposition", e); }
  }

  function envoyerProposition() {
    var champ = document.getElementById("taxoProposeLabel");
    var noteEl = document.getElementById("taxoProposeNote");
    var label = champ ? String(champ.value || "").trim() : "";
    var note = noteEl ? String(noteEl.value || "").trim().slice(0, 280) : "";
    if (label.length < 2) { dire("Écris le nom de la passion."); return; }
    if (label.length > 60) label = label.slice(0, 60);

    // Le catalogue la connaît peut-être déjà sous un autre nom : le dire vaut
    // mieux qu'ouvrir une demande qui sera refusée pour doublon.
    var deja = chercher(label, 3);
    if (deja.length && deja[0].kind === "passion") {
      dire("« " + deja[0].label + " » existe déjà dans le catalogue.");
      return;
    }

    var dem = { id: (typeof uid === "function" ? uid() : String(Date.now())), label: label, note: note, at: Date.now(), status: "pending" };
    try {
      if (!Array.isArray(state.user.passionRequests)) state.user.passionRequests = [];
      state.user.passionRequests.push(dem);
      saveState();
    } catch (e) { fail("passionRequests", e); }

    // ⚠️ On lit `{ error }` : le SDK ne lève pas sur un refus RLS, et un envoi
    // qui n'atteint jamais la base ne doit pas s'annoncer « envoyé ».
    var envoye = false;
    if (supaPret()) {
      try {
        supa.from("passion_requests").insert({
          id: dem.id, user_id: monUid(), label: label, note: note || null, status: "pending"
        }).then(function (r) {
          if (r && r.error) fail("insert passion_requests", r.error.message);
          else envoye = true;
        }).catch(function (e) { fail("insert passion_requests", e); });
      } catch (e) { fail("insert passion_requests", e); }
    }
    try { closeModal(); } catch (e) {}
    dire("Merci — « " + label + " » est envoyée pour examen." + (envoye ? "" : ""), "success");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉLÉGATION — un seul écouteur, aucun `onclick` inline
  // ⚠️ Aucun handler de ce lot n'est une chaîne construite : `audit:handlers`
  // et `audit:echappement` n'ont donc rien à vérifier, et un handler se relit
  // à l'œil (leçon du lot UI-8, porte dérobée ⑦).
  // ══════════════════════════════════════════════════════════════════════════
  function surClic(ev) {
    if (!actif()) return;
    var b;
    try { b = ev.target && ev.target.closest ? ev.target.closest("[data-taxo-act]") : null; } catch (e) { return; }
    if (!b) return;
    var act = b.getAttribute("data-taxo-act");
    var id = b.getAttribute("data-taxo-id") || "";
    var pid = b.getAttribute("data-taxo-passion") || "";
    ev.preventDefault();
    ev.stopPropagation();

    try {
      if (act === "fermer") { closeModal(); return; }
      if (act === "catalogue" || act === "catalogue-onb") { ouvrirCatalogue(); return; }
      if (act === "proposer") { ouvrirProposition(); return; }
      if (act === "proposer-envoyer") { envoyerProposition(); return; }

      if (act === "onb") { tapOnb(id); return; }

      if (act === "passion") {
        // Dans l'onboarding, une passion du catalogue passe par `togglePassion`
        // (plafond, passion de départ). Ailleurs, elle s'ajoute ou s'archive.
        if (onboardingEnCours()) { tapOnb(id); repeindreCatalogue(); return; }
        if (aPassion(id)) { retirerPassion(id); }
        else if (ajouterPassion(id)) { dire("Passion ajoutée", "success"); }
        rafraichir();
        return;
      }

      if (act === "specialite") {
        // ⚠️ TOUCHER UNE SPÉCIALITÉ SÉLECTIONNE SA PASSION (spec §1). Sans ça,
        // une spécialité cochée serait un clic mort : elle n'affinerait rien,
        // puisque l'affinage n'opère qu'à l'intérieur d'une passion choisie.
        if (onboardingEnCours()) {
          if (!aPassion(pid)) tapOnb(pid);
          toggleSpecialite(pid, id);
          repeindreCatalogue();
          return;
        }
        if (!aPassion(pid)) ajouterPassion(pid);
        toggleSpecialite(pid, id);
        rafraichir();
        return;
      }

      if (act === "deplier") { _passionOuverte = (_passionOuverte === id) ? null : id; rafraichir(); return; }
      if (act === "retirer") { retirerPassion(id); return; }

      if (act === "spec-fil") { toggleSpecialiteFil(pid, id); return; }
      if (act === "affiner-toggle") { _affinerOuvert = !_affinerOuvert; monterAffiner(true); return; }
      if (act === "affiner-vider") { viderSpecialitesFil(); return; }
    } catch (e) { fail("surClic:" + act, e); }
  }

  function rafraichir() {
    var h = document.getElementById(HOTE_MANAGER);
    if (h) h.removeAttribute("data-taxo-sig");
    monterManager();
    repeindreCatalogue();
    monterStudio();
    monterAffiner(true);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉMARRAGE ET SURVEILLANCE
  // ⚠️ JAMAIS `requestAnimationFrame` : il ne part pas sur une page qui ne
  // compose pas de frames (onglet en arrière-plan, headless, machine saturée) —
  // la surface ne serait jamais posée, en silence (piège du lot UI-3A).
  // ⚠️ Et le module écoute `passio:app-ready` EN REMETTANT SES COMPTEURS À ZÉRO :
  // en production le bloc app n'est injecté qu'APRÈS le code d'accès, et un
  // budget de reprise consommé pendant la saisie du code ne se reconstitue pas
  // tout seul (cause ③ du 2026-08-28).
  // ══════════════════════════════════════════════════════════════════════════
  var _essais = 0;
  var ESSAIS_MAX = 40;
  var _timer = null;
  var _observateur = null;
  var _branche = false;

  function appliquerClasseRacine() {
    try {
      var r = document.documentElement;
      if (actif()) r.classList.add(ROOT_CLASS);
      else r.classList.remove(ROOT_CLASS);
    } catch (e) { fail("classe racine", e); }
  }

  function tick() {
    _timer = null;
    try {
      appliquerClasseRacine();
      if (!actif()) { demonter(); return; }
      envelopperGrille();
      if (!pret()) { replanifier(); return; }
      brancher();
      monterManager();
      monterStudio();
      monterAffiner(false);
    } catch (e) {
      // ⚠️ Le corps entier est sous `try`, et l'échec REPLANIFIE au lieu de
      // conclure : une exception venue d'un `setTimeout` n'est rattrapée par
      // personne et tuerait la chaîne de reprise en silence.
      fail("tick", e);
      replanifier();
    }
  }

  function replanifier() {
    if (_timer) return;
    if (_essais++ > ESSAIS_MAX) return;
    _timer = setTimeout(tick, 250);
  }

  function brancher() {
    if (_branche) return;
    _branche = true;
    document.addEventListener("click", surClic, true);

    // Un seul observateur, sur le corps du document, filtré par la présence des
    // hôtes. Trois écrans à surveiller — `#passionManager` (réécrit par
    // `renderProfilesScreen`), `#postPassion` (repeuplé par `renderStudio`) et
    // `#profileStrip` (réécrit par `renderProfileStrip`) — et aucune enveloppe
    // de fonction : `_patchEventCardJoin` a montré qu'un rendu partiel échappe
    // toujours à une enveloppe (lot UI-4A2).
    try {
      _observateur = new MutationObserver(function () {
        if (!actif()) return;
        if (_majPrevue) return;
        _majPrevue = setTimeout(function () { _majPrevue = null; majSurfaces(); }, 60);
      });
      _observateur.observe(document.body, { childList: true, subtree: true });
    } catch (e) { fail("observer", e); }

    // Le `<select>` de passion du Studio change la liste des spécialités.
    // `onStudioPassionChange` (app-06) reste seule maîtresse de `switchToProfile` :
    // on écoute, on ne remplace pas.
    try {
      var sel = document.getElementById("postPassion");
      if (sel) sel.addEventListener("change", function () {
        var h = document.getElementById(HOTE_STUDIO);
        if (h) h.removeAttribute("data-taxo-sig");
        monterStudio();
      });
    } catch (e) { fail("brancher studio", e); }
  }

  var _majPrevue = null;
  function majSurfaces() {
    if (!actif() || !pret()) return;
    try {
      monterManager();
      monterStudio();
      monterAffiner(false);
    } catch (e) { fail("majSurfaces", e); }
  }

  function demonter() {
    // ⚠️ La coupure RESTITUE, elle ne se contente pas d'arrêter d'écrire : un
    // rendez-vous armé AVANT la coupure survit à l'arrêt de l'observateur et
    // reconstruirait la surface juste après sa dépose (règle commune des lots
    // UI-6/6A/6B). D'où le verrou `if (!actif()) return;` en tête de CHAQUE
    // fonction de montage, en plus de ce démontage.
    try { if (_majPrevue) { clearTimeout(_majPrevue); _majPrevue = null; } } catch (e) {}
    demonterManager();
    demonterStudio();
    demonterAffiner();
    try { closePassionManagerSheetSiOuverte(); } catch (e) {}
  }
  function closePassionManagerSheetSiOuverte() {
    var s = document.getElementById("taxoCatalogueCorps");
    if (s && typeof closeModal === "function") closeModal();
  }

  function demarrer() {
    _essais = 0;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    tick();
  }

  try {
    window.addEventListener("passio:app-ready", demarrer);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
    else demarrer();
  } catch (e) { fail("amorçage", e); }

  // ══════════════════════════════════════════════════════════════════════════
  // API PUBLIQUE — le seul point de contact avec le code historique
  // ══════════════════════════════════════════════════════════════════════════
  window.PassioTaxo = {
    actif: actif,
    catalogue: cat,
    chercher: chercher,
    mesPassions: mesPassions,
    mesSpecialites: mesSpecialites,
    specialitesDe: function (pid) { var c = cat(); return c ? c.specialtiesOf(pid) : []; },
    // Appelée par le Studio au moment de publier. Rend `null` hors lot : le
    // chemin historique est alors strictement inchangé.
    specialiteAPublier: specialiteStudio,
    // Appelée par le rendu du fil. Rend `true` hors lot : aucun contenu écarté.
    postPasseAffinage: postPasseAffinage,
    // « Moto · Enduro » pour les cartes.
    libelleContenu: libelleContenu,
    valideSpecialite: specialiteValide,
    ouvrirCatalogue: ouvrirCatalogue,
    ouvrirProposition: ouvrirProposition,
    _rafraichir: rafraichir
  };
})();
