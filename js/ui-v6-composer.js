// ══════════════════════════════════════════════════════════════════════════
// PASSIO — LOT UI-6 : le composer de publication (§9 de la direction)
// ──────────────────────────────────────────────────────────────────────────
// « Le composer Publication ne demande plus de choisir Texte, Photo ou Vidéo
//  avant de commencer. »  — §9
//
// Cible :
//   Publier en tant que [identité active]   Changer
//   [Écris quelque chose…]
//   [Ajouter photo ou vidéo]
//   Passio : [préremplie]                   Modifier
//   Affiner                                 ▾
//   [Publier]
//
// Le module RÉORGANISE ce que l'écran rend déjà : il déplace des nœuds, il n'en
// régénère aucun. Régénérer tuerait les `onclick` inline et les nœuds que les
// lecteurs de fichiers retrouvent par id (`#photoPreviewBox`, `#videoInput`…).
//
// ⚠️ LE PIÈGE QUI DÉCIDE DE TOUT : `studioType` est la SEULE source de vérité de
// ce qui est publié. `publishPost` type le post et remplit `image`/`video`
// d'après CETTE variable, jamais d'après le média réellement attaché. Masquer
// les onglets sans rien d'autre publierait donc un post « texte » avec la photo
// perdue EN SILENCE. La parade retenue ne touche aucun moteur : le bouton
// unique se contente de déclencher `#photoInput.click()` / `#videoInput.click()`,
// et les gestionnaires de fichiers EXISTANTS fixent déjà `studioType` eux-mêmes.
// Rien n'est dupliqué, rien n'est réécrit.
//
// ⚠️ « +10 pts » a quitté le bouton avec le §11. Ce lot n'en masquait que
// l'AFFICHAGE ; depuis l'application de l'ADR-009, le moteur lui-même
// (`grantReward`, points, Passia) n'existe plus — il n'y a plus rien à masquer.
//
// Coupures, prioritaires sur tout :
//   window.PASSIO_UI_6 === false   ·   localStorage.passio_ui_6 === "0"
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var VERSION = 1;
  var CLASSE_RACINE = "passio-ui-6";
  var HOTE_ID = "v6Composer";
  var MARQUEUR = "data-v6";

  var enPanne = false;
  var observateur = null;
  var enAttente = false;
  var essais = 0;

  // Place d'origine de chaque nœud déplacé, pour la lui rendre à la coupure.
  var origines = [];

  function actif() {
    try { if (window.PASSIO_UI_6 === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_6") === "0") return false; } catch (e) {}
    return true;
  }

  function fail(etape, e) {
    try {
      if (window.console && console.error) console.error("[ui-v6] " + etape + " :", e);
      if (typeof diagLog === "function") diagLog("ui_v6 " + etape);
    } catch (x) {}
  }

  function track(nom, meta) {
    try { if (window.tel && typeof tel.action === "function") tel.action(nom, meta || {}); } catch (e) {}
  }

  function ecran() { return document.getElementById("screen-studio"); }
  function el(id) { return document.getElementById(id); }

  // ── Déplacement réversible ───────────────────────────────────────────────
  function deplacer(noeud, dans) {
    if (!noeud || !dans) return false;
    if (noeud.getAttribute(MARQUEUR) !== "1") {
      origines.push({ noeud: noeud, parent: noeud.parentNode, suivant: noeud.nextSibling });
      noeud.setAttribute(MARQUEUR, "1");
    }
    dans.appendChild(noeud);
    return true;
  }

  function toutRendre() {
    for (var i = origines.length - 1; i >= 0; i--) {
      var o = origines[i];
      try {
        if (!o.parent) continue;
        if (o.suivant && o.suivant.parentNode === o.parent) o.parent.insertBefore(o.noeud, o.suivant);
        else o.parent.appendChild(o.noeud);
        o.noeud.removeAttribute(MARQUEUR);
      } catch (e) { fail("restitution", e); }
    }
    origines = [];
    var h = el(HOTE_ID);
    if (h && h.parentNode) h.parentNode.removeChild(h);
  }

  // ── Petites surfaces neuves ──────────────────────────────────────────────
  function ligne(classe) {
    var d = document.createElement("div");
    d.className = classe;
    return d;
  }

  function lienTexte(texte, onActivation) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "v6-lien";
    b.textContent = texte;
    b.addEventListener("click", function (e) {
      e.preventDefault();
      try { onActivation(); } catch (x) { fail("action", x); }
    });
    return b;
  }

  // §5 : le Studio dit dans QUELLE passion il publie. La passion active est la
  // valeur par défaut (posée par `renderStudio`), et « Changer » n'ouvre que le
  // <select> existant : choisir une autre passion pour UNE publication ne change
  // pas durablement la passion active.
  // ⚠️ Gouverné par le drapeau du lot UI-8 : `localStorage.passio_ui_8="0"` doit
  // rendre le composer d'avant à l'octet près, libellés compris.
  function v8() {
    try { if (window.PASSIO_UI_8 === false) return false; } catch (e) {}
    try { if (localStorage.getItem("passio_ui_8") === "0") return false; } catch (e) {}
    return true;
  }
  function libellePublieDans() { return v8() ? "Publication dans : " : "Passion : "; }

  // ⚠️ Lot UI-8 : le PSEUDO GÉNÉRAL d'abord. Cette fonction lisait
  // `currentProfile().name` — le nom porté par la passion active — et le Studio
  // annonçait donc de publier « en tant que » quelque chose qui n'est pas
  // l'identité publique. Ce n'est pas une nuance de vocabulaire : c'est le
  // pseudo général qui part réellement avec le post (`publishPost` prend
  // `state.user.general.username` en premier), et lui seul.
  function identiteCourante() {
    try {
      var g = (typeof state !== "undefined" && state && state.user && state.user.general) || {};
      if (g.username) return String(g.username);
      if (typeof state !== "undefined" && state && state.user && state.user.name) return String(state.user.name);
      var p = (typeof currentProfile === "function") ? currentProfile() : null;
      if (p && p.name) return String(p.name);
      if (p && p.passion && typeof passionById === "function") {
        var meta = passionById(p.passion);
        if (meta && meta.label) return String(meta.label);
      }
    } catch (e) {}
    return "moi";
  }

  function libellePassionChoisie() {
    try {
      var s = el("postPassion");
      if (!s || !s.options || !s.options.length) return "";
      var o = s.options[s.selectedIndex];
      return o ? String(o.textContent || "").trim() : "";
    } catch (e) { return ""; }
  }

  // ── Construction ─────────────────────────────────────────────────────────
  function construire() {
    var ec = ecran();
    if (!ec) return false;

    var hote = document.createElement("div");
    hote.className = "v6-composer";
    hote.id = HOTE_ID;

    // ① « Publier en tant que … · Changer »
    var identite = ligne("v6-identite");
    var qui = document.createElement("span");
    qui.className = "v6-identite-txt";
    qui.textContent = "Publier en tant que " + identiteCourante();
    identite.appendChild(qui);
    // ⚠️ Lot UI-8 : plus de « Changer de profil » ici. Publier ne change JAMAIS
    // d'identité — il n'y a qu'un profil personnel. Ce qui se choisit, c'est la
    // PASSION, et elle se choisit sur la ligne « Publication dans » ci-dessous.
    identite.appendChild(lienTexte(v8() ? "Voir mon profil" : "Changer de profil", function () {
      if (typeof goTo === "function") goTo("profiles");
    }));
    hote.appendChild(identite);

    // ② Le texte, tel quel.
    var champTexte = el("postText");
    var labelTexte = champTexte ? champTexte.closest(".field") : null;
    if (labelTexte) deplacer(labelTexte, hote);

    // ③ Une seule zone média. ⚠️ On ne lit AUCUN fichier ici : on déclenche les
    // entrées existantes, dont les gestionnaires fixent déjà `studioType` — la
    // seule variable d'après laquelle `publishPost` type le post et remplit le
    // média. C'est ce qui évite de publier un « texte » avec la photo perdue.
    var media = ligne("v6-media");
    var bPhoto = document.createElement("button");
    bPhoto.type = "button";
    bPhoto.className = "v6-media-btn";
    bPhoto.setAttribute("data-v6-media", "photo");
    bPhoto.textContent = "📷  Ajouter une photo";
    bPhoto.addEventListener("click", function () {
      var i = el("photoInput");
      if (i) i.click(); else fail("media", "photoInput absent");
    });
    var bVideo = document.createElement("button");
    bVideo.type = "button";
    bVideo.className = "v6-media-btn";
    bVideo.setAttribute("data-v6-media", "video");
    bVideo.textContent = "🎬  Ajouter une vidéo";
    bVideo.addEventListener("click", function () {
      var i = el("videoInput");
      if (i) i.click(); else fail("media", "videoInput absent");
    });
    media.appendChild(bPhoto);
    media.appendChild(bVideo);
    hote.appendChild(media);

    // Les aperçus des blocs historiques suivent le bouton : ce sont eux que les
    // lecteurs de fichiers remplissent, on ne les recrée surtout pas.
    var blocPhoto = el("studioPhoto");
    var blocVideo = el("studioVideo");
    if (blocPhoto) deplacer(blocPhoto, hote);
    if (blocVideo) deplacer(blocVideo, hote);

    // ④ « Passio : … · Modifier » — le <select> reste la source lue par
    // publishPost, il est seulement replié derrière le résumé.
    var resume = ligne("v6-passio");
    var txt = document.createElement("span");
    txt.className = "v6-passio-txt";
    txt.setAttribute("data-v6-passio", "1");
    txt.textContent = libellePublieDans() + (libellePassionChoisie() || "—");
    resume.appendChild(txt);
    var champPassion = el("fieldPassion");
    resume.appendChild(lienTexte(v8() ? "Changer" : "Modifier", function () {
      if (!champPassion) return;
      var ouvert = champPassion.classList.toggle("v6-ouvert");
      if (ouvert) { var s = el("postPassion"); if (s) s.focus(); }
    }));
    hote.appendChild(resume);
    if (champPassion) deplacer(champPassion, hote);

    // ⑤ « Affiner » : le mood, replié. Il reste facultatif et garde son défaut
    // (il pilote le classement du fil, pas une quête : celles-ci ont disparu
    // avec l'ADR-009).
    var affiner = document.createElement("details");
    affiner.className = "v6-affiner";
    var somm = document.createElement("summary");
    somm.textContent = "Options";
    affiner.appendChild(somm);
    hote.appendChild(affiner);
    var champMood = el("fieldMood");
    if (champMood) deplacer(champMood, affiner);

    // ⑥ Le bouton de publication, sans sa récompense.
    var barre = null;
    try {
      var btn = ec.querySelector('button[onclick="publishPost()"]');
      if (btn) {
        barre = btn.parentNode;
        // Un seul nœud de texte à réécrire : l'attribut onclick reste intact.
        btn.textContent = "Publier";
        btn.setAttribute("data-v6-publier", "1");
      }
    } catch (e) { fail("bouton", e); }
    if (barre) deplacer(barre, hote);

    ec.appendChild(hote);
    return true;
  }

  // ── Synchronisation ──────────────────────────────────────────────────────
  // L'écran est repeint par `renderStudio` à chaque `goTo("studio")`, et
  // `shareEventExperience` force la Passio à +250 ms depuis une fiche
  // d'activité : le résumé doit se remettre à jour, pas être figé au montage.
  function syncResume() {
    try {
      var t = document.querySelector("[data-v6-passio]");
      if (t) t.textContent = libellePublieDans() + (libellePassionChoisie() || "—");
      var q = document.querySelector(".v6-identite-txt");
      if (q) q.textContent = "Publier en tant que " + identiteCourante();
    } catch (e) {}
  }

  function decorer() {
    if (enPanne) return;
    // ⚠️ Le verrou de coupure. `planifier()` peut avoir été armé par une mutation
    // ANTÉRIEURE à la coupure : sans ce contrôle, ce rendez-vous survivrait à
    // `cesserObservation()` et reconstruirait le composer juste après que
    // `toutRendre()` l'a démonté — le kill switch paraîtrait sans effet.
    if (!actif()) return;
    var ec = ecran();
    if (!ec) return;
    try {
      if (!el(HOTE_ID)) {
        if (!construire()) return;
        var s = el("postPassion");
        if (s && !s.getAttribute("data-v6-sync")) {
          s.setAttribute("data-v6-sync", "1");
          s.addEventListener("change", syncResume);
        }
      }
      syncResume();
    } catch (e) {
      // On écrit dans ce que l'on observe : sans verrou, une erreur
      // reproductible relancerait la décoration à l'infini.
      enPanne = true;
      fail("decoration", e);
    }
  }

  function planifier() {
    if (enAttente) return;
    enAttente = true;
    setTimeout(function () { enAttente = false; decorer(); }, 0);
  }

  // ── Application / coupure ────────────────────────────────────────────────
  function apply() {
    var racine = document.documentElement;
    if (!actif()) {
      racine.classList.remove(CLASSE_RACINE);
      cesserObservation();
      toutRendre();
      return false;
    }
    enPanne = false;
    racine.classList.add(CLASSE_RACINE);
    observer();
    planifier();
    return true;
  }

  function observer() {
    var ec = ecran();
    if (!ec || observateur) return;
    try {
      observateur = new MutationObserver(function () { planifier(); });
      observateur.observe(ec, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    } catch (e) { fail("observation", e); }
  }

  function cesserObservation() {
    try { if (observateur) observateur.disconnect(); } catch (e) {}
    observateur = null;
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  function boot() {
    if (!ecran()) {
      if (essais++ > 80) return;
      setTimeout(boot, 150);
      return;
    }
    if (apply()) track("ui_v6_composer", { v: VERSION });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("passio:app-ready", function () { essais = 0; boot(); });

  window.PassioUIV6 = {
    isEnabled: actif,
    apply: apply,
    decorate: decorer,
  };
})();
