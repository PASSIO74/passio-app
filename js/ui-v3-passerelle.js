// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V3 — lot UI-3A : passerelle « Ça me tente » du Feed vers l'IRL.
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §6 et §15.
//
// Périmètre EXACT de ce lot, et rien de plus :
//   une publication du Feed qui porte une Passio et n'est PAS déjà reliée à un
//   événement reçoit, en bas de carte, le « trait Passio » (violet → corail) et
//   un lien discret « Ça me tente ». Le tap ouvre une feuille basse
//   « Autour de cette Passio » qui propose exactement trois suites, toutes
//   servies par des moteurs QUI EXISTENT DÉJÀ :
//     ① Voir les activités      → irlPassionFilters + goTo("irl")/renderIRL
//     ② Découvrir des personnes → openPassionExplorer(passion)
//     ③ Proposer une sortie     → openCreateEvent() + feedIrlBridgePrefill()
//
// Hors périmètre (lot UI-3B) : les publications DÉJÀ reliées à un événement et
// l'action « Je participe ». Elles sont explicitement exclues ici.
//
// ⚠️ AUCUN effet de bord métier. Ce module ne crée pas d'événement, pas de RSVP,
// pas de message, pas de relation ; il n'écrit ni en base, ni dans `state`, ni
// dans `localStorage`. Il ne touche jamais `state.user.currentProfileId` :
// l'identité active traverse la passerelle inchangée.
//
// ── Activation ────────────────────────────────────────────────────────────
//     ?passio_preview=passio-ui-3      → SEULE façon d'activer le lot
//     localStorage.passio_ui_3 = "0"   → kill switch (prioritaire sur l'URL)
//     window.PASSIO_UI_3 = false       → coupure immédiate en mémoire
//
// Le drapeau ne sait qu'ACTIVER POUR CETTE URL ou RETIRER : aucune valeur
// positive n'est écrite dans `localStorage`, donc l'URL normale reste
// rigoureusement celle de la production actuelle — y compris après une visite
// de l'aperçu. C'est la différence avec un aperçu « collant », qui laisserait
// une trace persistante sur l'appareil du testeur.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var PREVIEW_NAME = "passio-ui-3";
  var STORAGE_KEY = "passio_ui_3";
  var ROOT_CLASS = "passio-ui-3";
  var VERSION = "ui3a";

  // ── Drapeau ───────────────────────────────────────────────────────────────
  // Ordre de priorité : coupure mémoire > kill switch local > aperçu par URL >
  // défaut OFF. Les deux coupures passent AVANT l'URL : un appareil coupé le
  // reste même si on lui envoie le lien d'aperçu.
  function uiV3Enabled() {
    if (window.PASSIO_UI_3 === false) return false;
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;
    try {
      if (new URLSearchParams(window.location.search).get("passio_preview") === PREVIEW_NAME) return true;
    } catch (e) {}
    return false;
  }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  // Un `catch` muet sur un chemin de décision masque un ReferenceError : le
  // défaut qui a coûté six jours de fil vide au projet. Tout échec est donc
  // audible (console + diagLog + télémétrie d'erreur), jamais montré au
  // testeur sous forme d'erreur brute.
  function fail(ou, err) {
    var msg = "ui_v3 (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[ui-v3] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "ui_v3_bridge", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  // Métadonnées AUTORISÉES : version, identifiants d'étape et booléens de
  // présence. Aucun texte libre, aucun identifiant de personne, aucun contenu.
  // ⚠️ `has_psn` et non `has_passion` : le filtre PII de js/telemetry.js rejette
  // toute clé contenant « pass » — la donnée disparaîtrait en silence.
  function track(name, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") {
        window.tel.action(name, meta || { v: VERSION });
      }
    } catch (e) {}
  }

  function notify(message) {
    if (typeof window.toast === "function") { window.toast(message); return; }
    if (window.console && console.warn) console.warn("[ui-v3] " + message);
  }

  // ── Réemploi des moteurs existants ────────────────────────────────────────
  // Rien n'est réimplémenté : chaque helper délègue à la fonction du projet et
  // renvoie une valeur neutre quand elle n'est pas encore chargée (aperçu ouvert
  // pendant un chargement partiel). Les `typeof` restent nécessaires : ces
  // fonctions vivent dans les app-*.js, hors de ce module.
  function trouverPost(id) {
    try {
      if (typeof findPostAnywhere === "function") return findPostAnywhere(id);
    } catch (e) { fail("lookup", e); }
    return null;
  }

  // Passion NORMALISÉE : on réutilise `feedIrlBridgePassion`, qui ne renvoie un
  // identifiant que s'il correspond à une passion réellement connue. Une valeur
  // libre ou inconnue vaut « absente » → la carte n'est pas éligible.
  function passionDuPost(p) {
    try {
      if (typeof feedIrlBridgePassion === "function") return feedIrlBridgePassion(p) || "";
    } catch (e) { fail("passion", e); }
    return "";
  }

  function passionAffichable(pid) {
    try {
      if (typeof passionById === "function") {
        var p = passionById(pid);
        if (p) return { emoji: p.emoji || "✨", label: p.label || pid };
      }
    } catch (e) { fail("passion_label", e); }
    return { emoji: "✨", label: pid };
  }

  // ── Éligibilité UI-3A ─────────────────────────────────────────────────────
  // « Publication portant une Passio, mais SANS événement déjà lié ». Les deux
  // exclusions relèvent du lot UI-3B et sont donc traitées ici comme des
  // non-éligibilités, pas comme des cas à décorer autrement.
  function eligible(post) {
    if (!post || !post.id) return false;
    if (post.sharedReelData && post.sharedReelData.kind === "event") return false;
    if (post.eventId || post.event_id) return false;
    return !!passionDuPost(post);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉCORATION DES CARTES DU FEED
  // ══════════════════════════════════════════════════════════════════════════
  function feedList() { return document.getElementById("feedList"); }

  // Le « trait Passio » : badge de la Passio, ligne fine violet → corail, puis le
  // lien. C'est la ligne elle-même qui RELIE visuellement la Passio à l'action —
  // pas une pastille générique de plus (direction §A19).
  function construireBridge(post, passionId) {
    var vue = passionAffichable(passionId);

    var row = document.createElement("div");
    row.className = "v3-bridge";
    row.setAttribute("data-v3-bridge", String(post.id));

    // `textContent` partout : le libellé d'une passion PERSONNALISÉE est du texte
    // saisi par un utilisateur. Aucune chaîne HTML n'est construite ici, donc
    // aucune fenêtre d'échappement oublié.
    var chip = document.createElement("span");
    chip.className = "v3-bridge-passion";
    var em = document.createElement("span");
    em.className = "v3-bridge-emoji";
    em.setAttribute("aria-hidden", "true");
    em.textContent = vue.emoji;
    var lab = document.createElement("span");
    lab.className = "v3-bridge-label";
    lab.textContent = vue.label;
    chip.appendChild(em);
    chip.appendChild(lab);

    var trace = document.createElement("span");
    trace.className = "v3-bridge-trace";
    trace.setAttribute("aria-hidden", "true");

    var cta = document.createElement("button");
    cta.type = "button";
    cta.className = "v3-tempt";
    cta.setAttribute("data-v3-tempt", String(post.id));
    cta.setAttribute("aria-haspopup", "dialog");
    cta.setAttribute("aria-expanded", "false");
    cta.textContent = "Ça me tente";

    row.appendChild(chip);
    row.appendChild(trace);
    row.appendChild(cta);
    return row;
  }

  // Le CTA historique « 🤝 Organiser un IRL » (pont `feed_irl_bridge_v1`) ne doit
  // pas cohabiter avec « Ça me tente » : les deux répondent au même besoin, les
  // afficher ensemble donnerait deux portes vers l'IRL au bas d'une carte.
  //
  // ⚠️ Il est MASQUÉ par une règle CSS ancrée à `.passio-ui-3`, jamais retiré du
  // DOM. Le retirer marchait à l'aller et pas au retour : une coupure en mémoire
  // enlevait bien « Ça me tente », mais ne rendait pas le CTA historique — la
  // carte se retrouvait sans aucune porte vers l'IRL jusqu'à la repeinte
  // suivante. Un masquage porté par la classe racine se défait tout seul quand
  // le kill switch la retire. (Défaut relevé en contre-revue, PR #163.)
  function decorerArticle(article) {
    var id = article.getAttribute("data-postid");
    if (!id) return;
    if (article.querySelector("[data-v3-bridge]")) return; // déjà décorée

    var post = trouverPost(id);
    if (!eligible(post)) return;
    var passionId = passionDuPost(post);
    if (!passionId) return;

    article.appendChild(construireBridge(post, passionId));
  }

  // Retire toute trace du lot : une coupure en mémoire rend exactement le fil
  // d'avant, sans rechargement.
  function nettoyer(list) {
    list = list || feedList();
    if (!list) return;
    var poses = list.querySelectorAll("[data-v3-bridge]");
    for (var i = 0; i < poses.length; i++) {
      if (poses[i].parentNode) poses[i].parentNode.removeChild(poses[i]);
    }
  }

  function decorateFeed(list) {
    list = list || feedList();
    if (!list) return false;
    if (!uiV3Enabled()) { nettoyer(list); return false; }
    try {
      var arts = list.querySelectorAll("article.post[data-postid]");
      for (var i = 0; i < arts.length; i++) decorerArticle(arts[i]);
      return true;
    } catch (e) {
      // Un fil décoré à moitié doit rester VISIBLE et l'échec rester audible.
      fail("decorate", e);
      nettoyer(list);
      return false;
    }
  }

  // `renderFeed` repeint `#feedList` en deux temps (peinture rapide puis
  // complément en idle) et se rejoue à chaque filtre, like realtime ou refresh.
  // Un observateur coalescé décore donc les cartes quelle que soit la vague qui
  // les a posées, sans qu'app-02 ait à connaître ce module.
  var observer = null;
  var pending = false;

  // ⚠️ `setTimeout` et JAMAIS `requestAnimationFrame` pour cadencer la décoration.
  // rAF ne se déclenche pas sur une page qui ne COMPOSE pas de frames — onglet en
  // arrière-plan, navigateur sans tête, machine saturée. La passerelle n'aurait
  // alors jamais été posée : pas de trait, pas de « Ça me tente », en silence.
  // Le dépôt a déjà payé ce piège (cf. la note de `attendreFilStable` dans
  // tests/e2e/interactions.spec.js) ; mesuré ici sur le runner CI, où le trait
  // n'apparaissait pas en 5 secondes. La coalescence reste assurée par `pending`.
  function planifierScan() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; decorateFeed(null); }, 0);
  }

  function observerLeFil() {
    var list = feedList();
    if (!list || observer) return;
    observer = new MutationObserver(function () { planifierScan(); });
    observer.observe(list, { childList: true });
    planifierScan();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEUILLE BASSE « AUTOUR DE CETTE PASSIO »
  // ──────────────────────────────────────────────────────────────────────────
  // Même mécanique que la feuille « Créer » d'UI-1 (mêmes classes `.v2-sheet-*`,
  // mêmes jetons) : `openModal` empile mal — ouvrir une modale depuis une autre
  // la REMPLACE — et le parcours ③ ouvre justement une modale par-dessus.
  // ══════════════════════════════════════════════════════════════════════════
  var lastFocused = null;
  var ancre = null;         // { el, top } — la carte tapée et sa place à l'écran
  var ctxPostId = "";
  var ctxPassion = "";

  var CHOIX = [
    {
      key: "activities",
      emoji: "📍",
      titre: "Voir les activités",
      aide: "Les sorties déjà proposées autour de cette Passio.",
      run: function (passion) { voirActivites(passion); },
    },
    {
      key: "people",
      emoji: "🧑‍🤝‍🧑",
      titre: "Découvrir des personnes",
      aide: "Qui partage cette Passio — sans message envoyé automatiquement.",
      run: function (passion) { decouvrirPersonnes(passion); },
    },
    {
      key: "propose",
      emoji: "✨",
      titre: "Proposer une sortie",
      aide: "Le formulaire IRL, prérempli avec cette Passio.",
      run: function (passion, postId) { proposerSortie(passion, postId); },
    },
  ];

  function conteneurScroll() { return document.getElementById("appMain"); }

  // ── Position du Feed : on l'ancre sur la CARTE, jamais sur un `scrollTop` ──
  // `.post` porte `content-visibility: auto` (styles.css) : les cartes hors écran
  // sont estimées, la hauteur du fil est réévaluée en continu, et Chromium
  // corrige alors `scrollTop` de lui-même — précisément POUR que le contenu
  // visible ne bouge pas. Reposer à la fermeture un `scrollTop` figé à
  // l'ouverture reviendrait donc à défaire cette correction : on RECRÉERAIT le
  // saut qu'on cherche à éviter (mesuré : jusqu'à 96 px).
  //
  // Ce que le testeur doit retrouver, c'est SA carte au même endroit de l'écran.
  // On mémorise donc l'article tapé et sa position dans la fenêtre, et on ne
  // corrige que s'il a réellement bougé.
  var ANCRE_TOLERANCE_PX = 2;

  function poserAncre(postId) {
    ancre = null;
    try {
      var el = document.querySelector('#feedList article.post[data-postid="' + cssEscape(postId) + '"]');
      if (el) ancre = { el: el, top: el.getBoundingClientRect().top };
    } catch (e) { fail("ancre", e); }
  }

  function restituerAncre() {
    if (!ancre || !ancre.el) return;
    try {
      // La carte a pu être remplacée par une repeinte du fil : on la retrouve
      // par son identifiant plutôt que de garder un nœud orphelin.
      var el = document.body.contains(ancre.el)
        ? ancre.el
        : document.querySelector('#feedList article.post[data-postid="' + cssEscape(ctxPostId) + '"]');
      if (!el) return;
      var delta = el.getBoundingClientRect().top - ancre.top;
      if (Math.abs(delta) <= ANCRE_TOLERANCE_PX) return;   // rien n'a bougé
      var host = conteneurScroll();
      if (host) host.scrollTop += delta;
    } catch (e) { fail("ancre_restitution", e); }
    ancre = null;
  }

  function ensureSheet() {
    var wrap = document.getElementById("v3PassioSheet");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "v3PassioSheet";
    // Les classes V2 sont RÉUTILISÉES telles quelles ; `v3-sheet-backdrop`
    // n'ajoute que le trait de tête, propre à ce lot.
    wrap.className = "v2-sheet-backdrop v3-sheet-backdrop";
    wrap.hidden = true;

    var sheet = document.createElement("div");
    sheet.className = "v2-sheet v3-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "v3SheetTitle");

    var grip = document.createElement("div");
    grip.className = "v2-sheet-grip";
    grip.setAttribute("aria-hidden", "true");

    // Le « trait Passio » se prolonge dans la feuille : c'est le même motif qui
    // relie la carte à ses suites réelles.
    var trace = document.createElement("div");
    trace.className = "v3-sheet-trace";
    trace.setAttribute("aria-hidden", "true");

    var head = document.createElement("div");
    head.className = "v2-sheet-head";
    var titre = document.createElement("h2");
    titre.className = "v2-sheet-title";
    titre.id = "v3SheetTitle";
    titre.textContent = "Autour de cette Passio";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "v2-sheet-close";
    close.setAttribute("data-v3-close", "1");
    close.setAttribute("aria-label", "Fermer");
    close.textContent = "×";
    head.appendChild(titre);
    head.appendChild(close);

    var list = document.createElement("div");
    list.className = "v2-sheet-list";
    list.id = "v3SheetList";

    sheet.appendChild(grip);
    sheet.appendChild(trace);
    sheet.appendChild(head);
    sheet.appendChild(list);
    wrap.appendChild(sheet);

    wrap.addEventListener("click", function (e) {
      if (e.target === wrap || (e.target.closest && e.target.closest("[data-v3-close]"))) {
        closeSheet({ restaurer: true });
      }
    });

    document.body.appendChild(wrap);
    return wrap;
  }

  function renderSheet() {
    var wrap = ensureSheet();
    var list = wrap.querySelector("#v3SheetList");
    if (!list) return;
    list.innerHTML = "";

    CHOIX.forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v2-sheet-item v3-sheet-item";
      btn.setAttribute("data-v3-choice", c.key);

      var em = document.createElement("span");
      em.className = "v2-sheet-emoji";
      em.setAttribute("aria-hidden", "true");
      em.textContent = c.emoji;

      var txt = document.createElement("span");
      txt.className = "v2-sheet-text";
      var t = document.createElement("span");
      t.className = "v2-sheet-item-title";
      t.textContent = c.titre;
      var h = document.createElement("span");
      h.className = "v2-sheet-item-hint";
      h.textContent = c.aide;
      txt.appendChild(t);
      txt.appendChild(h);

      btn.appendChild(em);
      btn.appendChild(txt);
      btn.addEventListener("click", function () {
        var passion = ctxPassion;
        var postId = ctxPostId;
        track("ui_v3_choice", { v: VERSION, choice: c.key, has_psn: !!passion, has_ref: !!postId });
        // La feuille se ferme AVANT d'ouvrir la suite : sinon son fond assombri
        // resterait au-dessus du formulaire IRL ou de la fiche Passion.
        // `restaurer:false` — on part volontairement du Feed, restaurer sa
        // position ferait sauter l'écran d'arrivée.
        closeSheet({ restaurer: false });
        try { c.run(passion, postId); } catch (e) {
          fail("choice_" + c.key, e);
          notify("Action indisponible pour le moment.");
        }
      });
      list.appendChild(btn);
    });
  }

  // Une aide contextuelle (`.passio-hint`) est `position: fixed` et se pose
  // PAR-DESSUS le fil : ouverte au moment où l'on tape « Ça me tente », elle
  // recouvre le bas de la carte et intercepte le tap. Le produit prévoit déjà sa
  // fermeture — on l'appelle, exactement comme la feuille « Créer » d'UI-1,
  // plutôt que de lui passer devant avec un z-index (ce qui laisserait une bulle
  // orpheline flotter sur la feuille).
  function fermerAideContextuelle() {
    try {
      if (typeof window.fermerHint === "function") { window.fermerHint(); return; }
    } catch (e) {}
    try {
      var hint = document.querySelector(".passio-hint");
      if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    } catch (e) {}
  }

  function openSheet(postId) {
    if (!uiV3Enabled()) return false;
    var post = trouverPost(postId);
    if (!eligible(post)) return false;
    fermerAideContextuelle();

    ctxPostId = String(post.id);
    ctxPassion = passionDuPost(post);

    var wrap = ensureSheet();
    renderSheet();
    lastFocused = document.activeElement;
    wrap.hidden = false;
    // Deux images : la classe pilote la transition, `hidden` l'accessibilité.
    //
    // ⚠️ Même piège : sans `.open`, le fond reste à `opacity: 0` — le panneau
    // serait présent dans le DOM mais INVISIBLE. On garde rAF quand il tourne
    // (la transition démarre alors sur une frame propre), doublé d'un délai qui,
    // lui, se déclenche toujours. `classList.add` est idempotent : que les deux
    // arrivent ne change rien.
    var ouvrir = function () { wrap.classList.add("open"); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(ouvrir);
    setTimeout(ouvrir, 32);

    var cta = document.querySelector('[data-v3-tempt="' + cssEscape(ctxPostId) + '"]');
    if (cta) cta.setAttribute("aria-expanded", "true");

    // `preventScroll` : le Feed ne doit pas bouger d'un pixel parce qu'on a
    // donné le focus à une entrée de la feuille.
    var first = wrap.querySelector(".v2-sheet-item");
    if (first) focusSansScroll(first);
    document.addEventListener("keydown", onSheetKeydown, true);

    // Ancre posée UNE FOIS le panneau en place : c'est l'état que le testeur voit
    // derrière la feuille, donc celui qu'il doit retrouver en la fermant.
    poserAncre(ctxPostId);

    track("ui_v3_tempt_open", { v: VERSION, has_psn: !!ctxPassion, has_ref: !!ctxPostId });
    return true;
  }

  function closeSheet(opts) {
    var wrap = document.getElementById("v3PassioSheet");
    if (!wrap || wrap.hidden) return false;
    wrap.classList.remove("open");
    wrap.hidden = true;
    document.removeEventListener("keydown", onSheetKeydown, true);

    var cta = ctxPostId ? document.querySelector('[data-v3-tempt="' + cssEscape(ctxPostId) + '"]') : null;
    if (cta) cta.setAttribute("aria-expanded", "false");

    // Fermeture SANS action : le Feed doit reprendre exactement là où il était.
    // La feuille est `position: fixed` et ne démonte pas le fil, mais un
    // rendu déclenché entre-temps (like realtime, refresh) peut avoir bougé le
    // conteneur : on repose donc la position mesurée à l'ouverture.
    if (!opts || opts.restaurer !== false) {
      // ⚠️ Rendre le focus AVANT de corriger la position : un `focus()` ordinaire
      // fait défiler l'élément dans la vue. `preventScroll` couvre le cas
      // courant, la correction d'ancre couvre ce qui aurait échappé.
      if (cta) focusSansScroll(cta);
      else if (lastFocused) focusSansScroll(lastFocused);
      restituerAncre();
    }
    ancre = null;
    lastFocused = null;
    return true;
  }

  function onSheetKeydown(e) {
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); closeSheet({ restaurer: true }); return; }
    if (e.key !== "Tab") return;
    // Piège de focus : la feuille est modale, la tabulation ne doit pas partir
    // derrière elle (sinon le lecteur d'écran lit un écran masqué).
    var wrap = document.getElementById("v3PassioSheet");
    if (!wrap || wrap.hidden) return;
    var focusables = wrap.querySelectorAll("button:not([disabled])");
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function focusSansScroll(el) {
    if (!el || typeof el.focus !== "function") return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  // Les identifiants de post sont techniques (uid ou id Supabase), mais ils
  // entrent dans un sélecteur CSS : on les échappe plutôt que de leur faire
  // confiance. `CSS.escape` n'existe pas partout → repli explicite.
  function cssEscape(v) {
    var s = String(v);
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
    return s.replace(/["\\\]]/g, "\\$&");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LES TROIS SUITES — toutes servies par des moteurs existants
  // ══════════════════════════════════════════════════════════════════════════

  // ① Voir les activités : l'écran IRL EXISTANT, filtré sur cette Passio.
  // On repose `irlPassionFilters` (le filtre multi-sélection déjà en place) puis
  // on laisse `goTo("irl")` faire son `renderIRL()`. Aucune demande de position
  // n'est émise par ce chemin : UI-3A n'appelle jamais la géolocalisation et ne
  // conditionne rien à elle.
  //
  // ⚠️ `irlPassionFilters` est un `let` de app-07 : une liaison lexicale globale,
  // pas une propriété de `window`. On y accède donc par son nom, dans un
  // `try/catch` qui JOURNALISE (un chargement partiel doit rester audible).
  function voirActivites(passion) {
    var pose = false;
    try {
      if (passion && typeof irlPassionFilters !== "undefined" && irlPassionFilters
          && typeof irlPassionFilters.clear === "function") {
        irlPassionFilters.clear();
        irlPassionFilters.add(passion);
        pose = true;
      }
    } catch (e) { fail("irl_filter", e); }

    // `renderIrlPassionTiles` affiche TOUJOURS une passion filtrée, même si elle
    // n'est ni « mienne » ni déjà épinglée : aucune écriture d'état n'est donc
    // nécessaire pour que la tuile active soit visible.
    //
    // Marqueur À USAGE UNIQUE lu et effacé par `renderIRL` (app-07) : l'arrivée
    // par cette passerelle ne déclenche AUCUNE demande de position. Il est posé
    // juste avant la navigation, donc consommé par le rendu qu'elle provoque.
    window._passioIrlSkipGeoOnce = true;
    try {
      if (typeof goTo === "function") { goTo("irl"); }
      else if (typeof renderIRL === "function") { renderIRL(); }
      else { notify("L'écran IRL n'est pas disponible ici."); return; }
    } catch (e) {
      fail("irl_open", e);
      notify("L'écran IRL n'est pas disponible ici.");
      return;
    }
    track("ui_v3_open_irl", { v: VERSION, has_psn: !!pose });
  }

  // ② Découvrir des personnes : la fiche Passion EXISTANTE (créateurs + posts de
  // cette Passio). Aucun contact n'est établi — l'utilisateur choisit d'ouvrir
  // un profil, ou pas (direction §A17).
  function decouvrirPersonnes(passion) {
    if (!passion || typeof openPassionExplorer !== "function") {
      notify("Cette Passio n'a pas encore d'espace dédié.");
      return;
    }
    try { openPassionExplorer(passion); } catch (e) {
      fail("people_open", e);
      notify("Cette Passio n'a pas encore d'espace dédié.");
      return;
    }
    track("ui_v3_open_people", { v: VERSION, has_psn: true });
  }

  // ③ Proposer une sortie : le formulaire IRL EXISTANT, prérempli par le moteur
  // EXISTANT (`feedIrlBridgePrefill`) avec la Passio normalisée et la référence
  // TECHNIQUE de la publication. Aucun événement n'est créé : le testeur reste
  // maître de la soumission.
  function proposerSortie(passion, postId) {
    if (typeof openCreateEvent !== "function") {
      fail("propose", "openCreateEvent indisponible");
      if (typeof goTo === "function") goTo("irl");
      return;
    }
    try { openCreateEvent(); } catch (e) {
      fail("propose_open", e);
      if (typeof goTo === "function") goTo("irl");
      return;
    }
    // `openCreateEvent` injecte le formulaire de façon SYNCHRONE via `openModal` :
    // préremplir immédiatement évite la fenêtre où le modal est visible mais
    // encore vierge (piège déjà rencontré sur le pont Fil → IRL).
    try {
      if (typeof feedIrlBridgePrefill === "function") feedIrlBridgePrefill(passion, postId);
    } catch (e) { fail("propose_prefill", e); }
    track("ui_v3_open_propose", { v: VERSION, has_psn: !!passion, has_ref: !!postId });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVATION
  // ══════════════════════════════════════════════════════════════════════════

  // Délégation unique : les cartes du fil sont reconstruites en permanence, un
  // listener par bouton fuirait à chaque repeinte.
  function onDocumentClick(e) {
    var cta = e.target.closest && e.target.closest("[data-v3-tempt]");
    if (!cta) return;
    e.preventDefault();
    e.stopPropagation();   // le corps de la carte ouvre le post : ce lien, non.
    openSheet(cta.getAttribute("data-v3-tempt"));
  }

  // Le listener n'est POSÉ que lorsque le lot est actif, et RETIRÉ dès qu'il est
  // coupé : sur l'URL normale, ce module ne laisse strictement aucune empreinte
  // d'exécution — pas même un écouteur qui ne fait rien.
  var listenerPose = false;

  function apply() {
    var on = uiV3Enabled();
    var root = document.documentElement;

    if (!on) {
      root.classList.remove(ROOT_CLASS);
      nettoyer(null);
      closeSheet({ restaurer: false });
      if (observer) { observer.disconnect(); observer = null; }
      if (listenerPose) {
        document.removeEventListener("click", onDocumentClick, true);
        listenerPose = false;
      }
      return false;
    }

    root.classList.add(ROOT_CLASS);
    if (!listenerPose) {
      document.addEventListener("click", onDocumentClick, true);
      listenerPose = true;
    }
    observerLeFil();
    decorateFeed(null);
    return true;
  }

  function boot() {
    try { apply(); } catch (e) { fail("boot", e); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste vert).
  window.PassioUIV3 = {
    PREVIEW_NAME: PREVIEW_NAME,
    isEnabled: uiV3Enabled,
    apply: apply,
    decorateFeed: decorateFeed,
    openSheet: openSheet,
    closeSheet: closeSheet,
    dismissHint: fermerAideContextuelle,
  };
})();
