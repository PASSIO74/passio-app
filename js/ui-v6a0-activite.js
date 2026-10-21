// ══════════════════════════════════════════════════════════════════════════
// UI-6A0 — « CRÉER UNE ACTIVITÉ » : la photo d'abord, l'essentiel ensuite (#174)
//
// En moins d'une minute, une personne doit pouvoir proposer une activité qui
// DONNE ENVIE — pas remplir un formulaire administratif. Le formulaire
// d'`openCreateEvent` (app-07) avait tout le moteur (couverture réelle, date,
// heure, durée, récurrence, lieu, places) mais le rangeait comme un dossier :
// une couverture de 140 px, la description en quinzième position, la
// récurrence au milieu de l'horaire, et « Publier » sans garde contre le
// double envoi.
//
// Ce module ne réécrit RIEN du moteur. Il RANGE la modale déjà rendue :
//   ① titre « Créer une activité » ;
//   ② couverture dominante (16:9), devenue un vrai contrôle : rôle bouton,
//      tabulation, Entrée/Espace, nom « Ajouter / Changer la couverture » ;
//      le « Retirer » sort de la zone (un bouton dans un bouton n'est pas
//      atteignable au clavier) ; fallback Passio si aucune photo ;
//   ③ Titre · Passion · Description (guidée en une phrase) remontés ensemble ;
//   ④ Date · Heure · Durée, puis le lieu, puis places et prix ;
//   ⑤ récurrence, contact et lien dans « Plus d'options » (rien n'est retiré) ;
//   ⑥ « Aperçu » : la future fiche, rendue par `textContent` ;
//   ⑦ une seule action primaire, « Publier l'activité », gardée contre le
//      double envoi (deux clics = deux activités, mesuré sur le moteur).
//
// ⚠️ INVARIANTS : chaque champ garde son `id` — `submitEvent` les relit tels
// quels. Les nœuds sont DÉPLACÉS, jamais recréés : leurs `oninput`/`onchange`
// inline (autocomplétion du lieu, récurrence) suivent. Les en-têtes de section
// d'origine sont MASQUÉS, jamais retirés. Le bouton « Créer un événement » de
// Rencontrer est déjà masqué par UI-4A0 : le « + » central reste la seule porte.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_6A0 === false   ·   localStorage.passio_ui_6a0 === "0"
// (liste blanche des réglages distants : coupable chez tout le monde depuis le
// pilotage). Le drapeau ne sait qu'ENLEVER : coupé, la modale d'avant revient
// telle quelle à la prochaine ouverture.
// Verrou : tests/e2e/ui-v6a0-activite.spec.js.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var CLASSE = "v6a0";
  var enCours = false;

  function actif() {
    try { if (window.PASSIO_UI_6A0 === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_6a0") === "0") return false; } catch (e) {}
    return true;
  }
  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v6a0] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v6a0 " + etape);
    } catch (x) {}
  }
  function el(id) { return document.getElementById(id); }
  function champ(id) { var n = el(id); return n ? (n.closest("label.field") || n) : null; }
  function grille(id) { var n = champ(id); return n && n.parentElement && n.parentElement !== racine() ? n.parentElement : n; }
  function racine() { return el("modalContent"); }
  function enTete(texte) {
    var r = racine(); if (!r) return null;
    var divs = r.children;
    for (var i = 0; i < divs.length; i++) {
      if (divs[i].tagName === "DIV" && (divs[i].textContent || "").trim() === texte) return divs[i];
    }
    return null;
  }

  // ── ② la couverture, contrôle accessible ─────────────────────────────────
  function libelleCouverture() {
    var zone = el("evCoverPreviewWrap"), img = el("evCoverPreviewImg");
    if (!zone) return;
    var avec = !!(img && img.style.display === "block" && img.getAttribute("src"));
    var nom = avec ? "Changer la couverture" : "Ajouter une couverture";
    zone.setAttribute("aria-label", nom);
    zone.classList.toggle("v6a0-cover-pleine", avec);
    var ph = el("evCoverPreviewPlaceholder");
    var t = ph && ph.querySelector(".v6a0-cover-titre");
    if (t) t.textContent = nom;
  }
  function couverture() {
    var zone = el("evCoverPreviewWrap");
    if (!zone || zone.getAttribute("data-v6a0")) return;
    zone.setAttribute("data-v6a0", "1");
    zone.classList.add("v6a0-cover");
    zone.setAttribute("role", "button");
    zone.setAttribute("tabindex", "0");
    zone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); var f = el("evCoverFile"); if (f) f.click(); }
    });
    var ph = el("evCoverPreviewPlaceholder");
    if (ph) {
      ph.textContent = "";
      var t = document.createElement("div"); t.className = "v6a0-cover-titre";
      var s = document.createElement("div"); s.className = "v6a0-cover-aide";
      s.textContent = "La photo qui donne envie de venir";
      ph.appendChild(t); ph.appendChild(s);
    }
    var retirer = el("evCoverRemoveBtn");
    if (retirer) {
      retirer.setAttribute("type", "button");
      retirer.className = "v6a0-cover-retirer";
      retirer.removeAttribute("style");
      retirer.style.display = "none";
      retirer.textContent = "Retirer la couverture";
      zone.parentNode.insertBefore(retirer, zone.nextSibling);
      // Le moteur bascule `style.display` de ce bouton : on l'aligne sur l'image.
    }
    libelleCouverture();
  }

  // ── ⑥ l'aperçu de la future fiche ────────────────────────────────────────
  function valeur(id) { var n = el(id); return n ? String(n.value || "").trim() : ""; }
  function texteOption(id) { var n = el(id); return n && n.selectedOptions && n.selectedOptions[0] ? n.selectedOptions[0].textContent.replace(/\s*✦\s*$/, "").trim() : ""; }
  function rendreApercu() {
    var box = el("v6a0Apercu");
    if (!box) return;
    box.textContent = "";
    var carte = document.createElement("div"); carte.className = "v6a0-apercu-carte";
    var visuel = document.createElement("div"); visuel.className = "v6a0-apercu-visuel";
    var img = el("evCoverPreviewImg");
    if (img && img.style.display === "block" && img.getAttribute("src")) {
      var i = document.createElement("img"); i.alt = ""; i.src = img.getAttribute("src"); visuel.appendChild(i);
    }
    var corps = document.createElement("div"); corps.className = "v6a0-apercu-corps";
    var titre = document.createElement("div"); titre.className = "v6a0-apercu-titre";
    titre.textContent = valeur("evTitle") || "Titre de ton activité";
    var meta = document.createElement("div"); meta.className = "v6a0-apercu-meta";
    var quand = "";
    var d = valeur("evDate");
    if (d) {
      try { quand = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); } catch (e) { quand = d; }
    }
    var parts = [texteOption("evPassion"), [quand, valeur("evTime")].filter(Boolean).join(" · "), valeur("evVenue") || valeur("evCity")].filter(Boolean);
    meta.textContent = parts.join("  ·  ");
    var desc = document.createElement("div"); desc.className = "v6a0-apercu-desc";
    desc.textContent = valeur("evDesc");
    corps.appendChild(titre); corps.appendChild(meta); if (desc.textContent) corps.appendChild(desc);
    carte.appendChild(visuel); carte.appendChild(corps);
    box.appendChild(carte);
  }

  // ── ①③④⑤⑦ le rangement ───────────────────────────────────────────────────
  function ranger(editId) {
    var r = racine();
    if (!r || !el("evTitle") || r.getAttribute("data-v6a0")) return;
    r.setAttribute("data-v6a0", "1");
    r.classList.add(CLASSE);

    var t = r.querySelector(".modal-title");
    if (t) t.textContent = editId ? "Modifier l'activité" : "Créer une activité";
    var st = r.querySelector(".modal-subtitle");
    if (st) st.textContent = editId ? "Les inscrits seront prévenus de tes changements."
      : "Une photo, un titre, un moment : en moins d'une minute.";

    ["Photo de couverture", "Infos principales", "Lieu", "Détails"].forEach(function (h) {
      var n = enTete(h); if (n) n.classList.add("v6a0-masque");
    });
    couverture();

    var publier = r.querySelector("button.btn.primary.block");
    if (!publier) return;
    var ancre = el("evCoverData");                       // juste après la couverture
    function apres(n) { if (n && ancre && ancre.parentNode === r) { r.insertBefore(n, ancre.nextSibling); ancre = n; } }

    // ③ Titre, Passion (+ Type), Description
    apres(champ("evTitle"));
    apres(grille("evPassion"));
    var desc = el("evDesc");
    if (desc) desc.setAttribute("placeholder", "Ce qu'on va vivre ensemble, en une ou deux phrases.");
    apres(champ("evDesc"));
    // ④ Quand, puis Où, puis combien
    var quand = grille("evDate");
    if (quand) quand.classList.add("v6a0-quand");      // la date prend sa ligne (CSS)
    apres(quand);
    apres(champ("evPlaceSearch"));
    apres(el("evPlaceSuggestions"));
    apres(el("evPlacePicked"));
    apres(champ("evVenue"));
    apres(champ("evAddress"));
    apres(grille("evCity"));
    apres(grille("evMax"));

    // ⑤ Plus d'options : récurrence, contact, lien (déplacés, rien n'est retiré)
    var options = document.createElement("details");
    options.className = "v6a0-options";
    var resume = document.createElement("summary");
    resume.textContent = "Plus d'options";
    options.appendChild(resume);
    [grille("evRecurrence"), champ("evContact"), champ("evLink")].forEach(function (n) { if (n) options.appendChild(n); });
    apres(options);

    // ⑥ ⑦ actions
    var apercu = document.createElement("div"); apercu.id = "v6a0Apercu"; apercu.className = "v6a0-apercu"; apercu.hidden = true;
    var actions = document.createElement("div"); actions.className = "v6a0-actions";
    var bApercu = document.createElement("button");
    bApercu.type = "button"; bApercu.className = "btn ghost v6a0-btn-apercu"; bApercu.textContent = "Aperçu";
    bApercu.setAttribute("aria-expanded", "false"); bApercu.setAttribute("aria-controls", "v6a0Apercu");
    bApercu.addEventListener("click", function () {
      var ouvrir = apercu.hidden;
      if (ouvrir) rendreApercu();
      apercu.hidden = !ouvrir;
      bApercu.setAttribute("aria-expanded", ouvrir ? "true" : "false");
      bApercu.textContent = ouvrir ? "Masquer l'aperçu" : "Aperçu";
    });
    publier.classList.add("v6a0-publier");
    publier.style.marginTop = "0";
    publier.textContent = editId ? "Enregistrer les modifications" : "Publier l'activité";
    r.insertBefore(apercu, publier);
    r.insertBefore(actions, publier);
    actions.appendChild(bApercu);
    actions.appendChild(publier);

    setTimeout(libelleCouverture, 40);                    // couverture d'édition posée à 20 ms
  }

  // ── Branchements ─────────────────────────────────────────────────────────
  function envelopper(nom, fabrique) {
    var origine = window[nom];
    if (typeof origine !== "function" || origine.__v6a0) return;
    var f = fabrique(origine);
    f.__v6a0 = true;
    window[nom] = f;
  }

  function brancher() {
    envelopper("openCreateEvent", function (origine) {
      return function (editId) {
        var r = origine.apply(this, arguments);
        if (actif()) { try { ranger(editId); } catch (e) { fail("ranger", e); } }
        return r;
      };
    });
    ["previewEventCover", "removeEventCover"].forEach(function (nom) {
      envelopper(nom, function (origine) {
        return function () {
          var r = origine.apply(this, arguments);
          // previewEventCover pose l'image dans un FileReader : on relit après.
          setTimeout(function () { try { libelleCouverture(); var a = el("v6a0Apercu"); if (a && !a.hidden) rendreApercu(); } catch (e) {} }, 60);
          return r;
        };
      });
    });
    // ⑦ Un seul envoi à la fois : sous la garde, un second clic pendant l'envoi
    // ne crée pas une seconde activité. Coupé, `submitEvent` reste l'original.
    envelopper("submitEvent", function (origine) {
      return async function () {
        if (!actif()) return origine.apply(this, arguments);
        if (enCours) return;
        enCours = true;
        var b = document.querySelector("#modalContent .v6a0-publier");
        if (b) { b.disabled = true; b.setAttribute("aria-busy", "true"); }
        try { return await origine.apply(this, arguments); }
        finally {
          enCours = false;
          if (b && b.isConnected) { b.disabled = false; b.removeAttribute("aria-busy"); }
        }
      };
    });
  }

  if (typeof window.openCreateEvent === "function") brancher();
  else document.addEventListener("DOMContentLoaded", brancher);
  window.PassioUiV6a0 = { actif: actif, _ranger: ranger };
})();
