// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V2 — lots UI-1 (cadre et navigation) et UI-2 (Feed), DERRIÈRE UN
// APERÇU UNIQUE. Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md
//
// Ce module est ADDITIF et RÉVERSIBLE : hors aperçu il ne touche à rien —
// aucun nœud créé, aucune classe posée, aucun style appliqué. L'interface
// actuelle (barre du bas, profils du fil, onglets Mood, écrans, handlers)
// reste octet pour octet celle de `main`.
//
//     ?passio_preview=passio-ui-v2       → SEULE façon d'activer la V2
//     localStorage.passio_ui_v2 = "0"    → kill switch, prioritaire
//     window.PASSIO_UI_V2 = false        → coupure en mémoire, prioritaire
//
// ⚠️ L'aperçu N'EST JAMAIS DURABLE, et AUCUNE valeur POSITIVE ne l'active :
// ni `localStorage.passio_ui_v2 = "1"` (hérité d'une version antérieure de ce
// fichier), ni `window.PASSIO_UI_V2 = true`. Les deux drapeaux ne savent que
// RETIRER l'aperçu. L'URL normale rend donc l'interface actuelle sans
// exception, quel que soit l'historique du navigateur ou l'état mémoire —
// un poste ne peut pas rester enfermé dans une V2 non validée.
//
// L'aperçu N'ÉCRIT JAMAIS non plus : ni localStorage, ni `passio_config`, ni le
// profil actif. Retirer le paramètre de l'URL et recharger suffit à revenir.
//
// Périmètre :
//   UI-1 — barre du bas et sélecteur « Créer » ;
//   UI-2 — Feed : « Envie du moment » (le rail à cinq intentions d'app-02 suit
//          désormais CE drapeau, cf. `feedIntentsEnabled`), une Bobine insérée
//          dans le fil, le module « Passionnés à découvrir » et un état vide
//          qui se termine par une action.
// Restent explicitement hors périmètre : les bulles de profils du fil, le
// design validé en UI-1, `rankFeedPosts`, la publication, les commentaires,
// les réactions, le partage, les messages, les événements et le RSVP.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var PREVIEW_NAME = "passio-ui-v2";
  var STORAGE_KEY = "passio_ui_v2";
  var ROOT_CLASS = "passio-ui-v2";

  // ── Drapeau ───────────────────────────────────────────────────────────────
  // Ordre de priorité : coupure mémoire > kill switch local > canari d'URL >
  // défaut sûr (désactivé).
  //
  // ⚠️ Il n'y a VOLONTAIREMENT aucune branche « valeur positive qui active ».
  // Les deux drapeaux ne savent que RETIRER : `window.PASSIO_UI_V2 = false`
  // coupe, `= true` n'active rien ; `localStorage.passio_ui_v2 = "0"` coupe,
  // `"1"` est ignoré. Un aperçu activable durablement (ou par une variable
  // mémoire posée n'importe où) finirait par enfermer un poste dans une V2 non
  // validée, et l'URL normale cesserait d'être la référence stable que la
  // direction exige (§14). La SEULE activation positive est le canari d'URL.
  function uiV2Enabled() {
    if (window.PASSIO_UI_V2 === false) return false; // coupure mémoire, jamais l'inverse
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false; // kill switch : prioritaire sur l'URL
    try {
      // Canari non persistant : lecture seule de l'URL, aucune écriture. Toute
      // autre valeur stockée (dont un « 1 » hérité) est ignorée ici.
      var preview = new URLSearchParams(window.location.search).get("passio_preview");
      if (preview === PREVIEW_NAME) return true;
    } catch (e) {}
    return false;
  }

  // ── Destinations de la barre du bas V2 ────────────────────────────────────
  // Cinq entrées exactement, libellés VISIBLES, toutes pointant sur une route
  // existante. `Créer` est une action, pas un écran : elle n'a pas de
  // `data-screen` et ne prend donc jamais l'état actif.
  //
  // Bobines et CDV sortent de la barre principale mais restent parfaitement
  // routables (`openReels()`, `goTo("cdv")`, deep links `#cdv`) — ils ne sont
  // simplement plus des raccourcis permanents.
  var SVG = {
    discover: '<path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18"/><path d="M14.9 9.1l-1.6 4.2l-4.2 1.6l1.6 -4.2z"/>',
    meet: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
    create: '<path d="M12 6 V18"/><path d="M6 12 H18"/>',
    messages: '<path d="M21 15a2 2 0 0 1 -2 2h-9l-4 3v-14a2 2 0 0 1 2 -2h11a2 2 0 0 1 2 2z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>',
  };

  var DESTINATIONS = [
    { key: "discover", label: "Découvrir", screen: "feed", icon: SVG.discover },
    { key: "meet", label: "Rencontrer", screen: "irl", icon: SVG.meet },
    { key: "create", label: "Créer", action: "create", icon: SVG.create },
    { key: "messages", label: "Messages", screen: "messages", icon: SVG.messages },
    { key: "profile", label: "Profil", screen: "profiles", icon: SVG.profile },
  ];

  // ── Sélecteur « Créer » ───────────────────────────────────────────────────
  // UI-1 ne réécrit AUCUN moteur de création : chaque choix rouvre le handler
  // existant. Si un handler manque (chargement partiel), l'entrée le dit au
  // lieu d'échouer en silence.
  var CREATE_CHOICES = [
    {
      key: "post", emoji: "✍️", title: "Publication",
      hint: "Une idée, une photo ou une vidéo",
      run: function () { goToScreen("studio"); },
    },
    {
      key: "bobine", emoji: "🎬", title: "Bobine",
      hint: "Vidéo courte autour d'une Passio",
      run: function () { call("meOpen", "bobine"); },
    },
    {
      key: "irl", emoji: "🤝", title: "Activité IRL",
      hint: "Quelque chose à vivre ensemble",
      run: function () { call("openCreateEvent"); },
    },
    {
      key: "more", emoji: "✨", title: "Plus",
      hint: "Story, audio ou podcast",
      run: function () { renderCreateSheet("more"); },
    },
  ];

  var MORE_CHOICES = [
    {
      key: "story", emoji: "📸", title: "Story",
      hint: "Un moment qui disparaît en 24 h",
      run: function () { call("meOpen", "story"); },
    },
    {
      key: "audio", emoji: "🎙", title: "Audio / podcast",
      hint: "Ouvre le Studio sur le format audio",
      run: function () { openStudioOnType("audio"); },
    },
    {
      key: "back", emoji: "←", title: "Retour",
      hint: "Revenir aux trois actions principales",
      run: function () { renderCreateSheet("main"); },
    },
  ];

  // ── Utilitaires ───────────────────────────────────────────────────────────
  function call(fn, arg) {
    if (typeof window[fn] !== "function") {
      notify("Cette action n'est pas disponible ici.");
      return false;
    }
    try {
      if (arguments.length > 1) window[fn](arg); else window[fn]();
      return true;
    } catch (e) {
      // Ne PAS avaler l'erreur en silence : un chemin de création cassé doit
      // rester visible (piège « catch large » du projet).
      if (window.console && console.error) console.error("[ui-v2] " + fn + " :", e);
      notify("Action indisponible pour le moment.");
      return false;
    }
  }

  // Le Studio expose ses formats sous forme d'onglets cliquables : on rejoue le
  // clic plutôt que de dupliquer la logique de bascule (qui gère aussi les
  // champs affichés, l'état `studioType` et les cas carnet/live).
  function openStudioOnType(type) {
    if (!goToScreen("studio")) return;
    setTimeout(function () {
      var tab = document.querySelector('#studioTypeTabs .studio-type[data-type="' + type + '"]');
      if (tab) tab.click();
    }, 60);
  }

  function goToScreen(screen) {
    if (typeof window.goTo !== "function") return false;
    window.goTo(screen);
    return true;
  }

  function notify(message) {
    if (typeof window.toast === "function") { window.toast(message); return; }
    if (window.console && console.warn) console.warn("[ui-v2] " + message);
  }

  function track(name, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") {
        window.tel.action(name, meta || {});
      }
    } catch (e) {}
  }

  function svgIcon(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }

  // ── Construction de la barre du bas V2 ────────────────────────────────────
  function buildNav() {
    if (document.getElementById("appNavV2")) return document.getElementById("appNavV2");
    var legacy = document.getElementById("appNav");
    if (!legacy || !legacy.parentNode) return null;

    var nav = document.createElement("nav");
    nav.id = "appNavV2";
    nav.className = "app-nav app-nav-v2";
    nav.setAttribute("aria-label", "Navigation principale");

    DESTINATIONS.forEach(function (d) {
      // `nav-item` est conservé : `goTo` (app-02) synchronise déjà l'état actif
      // de TOUS les `.nav-item[data-screen]`, l'aperçu hérite donc gratuitement
      // du surlignage correct, y compris sur les navigations programmatiques.
      var el = document.createElement(d.action ? "button" : "div");
      el.className = "nav-item nav-v2-item" + (d.action === "create" ? " nav-v2-cta" : "");
      el.setAttribute("data-v2-key", d.key);
      if (d.screen) {
        el.setAttribute("data-screen", d.screen);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
      } else {
        el.type = "button";
        el.setAttribute("data-v2-action", d.action);
        el.setAttribute("aria-haspopup", "dialog");
        el.setAttribute("aria-expanded", "false");
      }
      el.setAttribute("aria-label", d.label);
      el.innerHTML = '<span class="nav-icon">' + svgIcon(d.icon) + "</span>"
        + '<span class="nav-label">' + d.label + "</span>";
      nav.appendChild(el);

      var activate = function () {
        if (d.action === "create") { openCreateSheet(); return; }
        track("ui_v2_nav", { key: d.key, screen: d.screen });
        goToScreen(d.screen);
      };
      el.addEventListener("click", activate);
      // Les `<div role="button">` doivent s'activer au clavier ; le délégué
      // générique d'app-08 exclut explicitement les `.nav-item`, et le listener
      // historique n'a jamais vu ces nœuds (créés après son exécution).
      if (d.screen) {
        el.addEventListener("keydown", function (e) {
          if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
          e.preventDefault();
          activate();
        });
      }
    });

    legacy.parentNode.insertBefore(nav, legacy.nextSibling);
    return nav;
  }

  // ── Sélecteur « Créer » (feuille basse légère) ────────────────────────────
  // Volontairement autonome : `openModal` empile mal (une modale ouverte depuis
  // une autre la REMPLACE) et centre son contenu. Une feuille dédiée reste
  // atteignable au pouce et n'interfère avec aucune modale existante.
  var lastFocused = null;

  function ensureSheet() {
    var wrap = document.getElementById("v2CreateSheet");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "v2CreateSheet";
    wrap.className = "v2-sheet-backdrop";
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="v2-sheet" role="dialog" aria-modal="true" aria-labelledby="v2SheetTitle">'
      + '<div class="v2-sheet-grip" aria-hidden="true"></div>'
      + '<div class="v2-sheet-head">'
      + '<h2 class="v2-sheet-title" id="v2SheetTitle">Créer</h2>'
      + '<button type="button" class="v2-sheet-close" data-v2-close="1" aria-label="Fermer">×</button>'
      + "</div>"
      + '<div class="v2-sheet-list" id="v2SheetList"></div>'
      + "</div>";

    wrap.addEventListener("click", function (e) {
      if (e.target === wrap || (e.target.closest && e.target.closest("[data-v2-close]"))) {
        closeCreateSheet();
      }
    });
    document.body.appendChild(wrap);
    return wrap;
  }

  function renderCreateSheet(mode) {
    var wrap = ensureSheet();
    var list = wrap.querySelector("#v2SheetList");
    var title = wrap.querySelector("#v2SheetTitle");
    var choices = mode === "more" ? MORE_CHOICES : CREATE_CHOICES;
    if (title) title.textContent = mode === "more" ? "Plus de formats" : "Créer";
    if (!list) return;

    list.innerHTML = "";
    choices.forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v2-sheet-item";
      btn.setAttribute("data-v2-create", c.key);
      // Libellés constants définis ici : aucune donnée utilisateur n'entre dans
      // ce markup, donc aucun besoin d'échappement — et surtout aucun risque.
      btn.innerHTML =
        '<span class="v2-sheet-emoji" aria-hidden="true">' + c.emoji + "</span>"
        + '<span class="v2-sheet-text">'
        + '<span class="v2-sheet-item-title">' + c.title + "</span>"
        + '<span class="v2-sheet-item-hint">' + c.hint + "</span>"
        + "</span>";
      btn.addEventListener("click", function () {
        track("ui_v2_create", { choice: c.key });
        // Les entrées de navigation interne (« Plus », « Retour ») gardent la
        // feuille ouverte ; toute action qui ouvre un éditeur la referme avant,
        // sinon le fond assombri resterait au-dessus de l'éditeur média.
        if (c.key === "more" || c.key === "back") { c.run(); return; }
        closeCreateSheet();
        c.run();
      });
      list.appendChild(btn);
    });
  }

  // Une aide contextuelle (spec §8) est `position: fixed` et se pose PAR-DESSUS
  // le reste : ouverte au moment où l'on tape « Créer », elle recouvre le haut
  // de la feuille et intercepte le tap sur le premier choix. Le produit prévoit
  // déjà sa fermeture — on l'appelle, plutôt que de lui passer devant avec un
  // z-index, ce qui laisserait une bulle orpheline flotter sur la feuille.
  function fermerAideContextuelle() {
    try {
      if (typeof window.fermerHint === "function") { window.fermerHint(); return; }
    } catch (e) {}
    // Repli si la fonction n'existe pas (chargement partiel) : on retire le
    // nœud, seul effet dont la feuille a besoin.
    try {
      var hint = document.querySelector(".passio-hint");
      if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    } catch (e) {}
  }

  function openCreateSheet() {
    fermerAideContextuelle();
    var wrap = ensureSheet();
    renderCreateSheet("main");
    lastFocused = document.activeElement;
    wrap.hidden = false;
    // Deux images : la classe pilote la transition, `hidden` l'accessibilité.
    requestAnimationFrame(function () { wrap.classList.add("open"); });
    var cta = document.querySelector('#appNavV2 [data-v2-action="create"]');
    if (cta) cta.setAttribute("aria-expanded", "true");
    var first = wrap.querySelector(".v2-sheet-item");
    if (first) first.focus();
    document.addEventListener("keydown", onSheetKeydown, true);
    track("ui_v2_create_open", {});
  }

  function closeCreateSheet() {
    var wrap = document.getElementById("v2CreateSheet");
    if (!wrap || wrap.hidden) return;
    wrap.classList.remove("open");
    wrap.hidden = true;
    var cta = document.querySelector('#appNavV2 [data-v2-action="create"]');
    if (cta) cta.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onSheetKeydown, true);
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    lastFocused = null;
  }

  function onSheetKeydown(e) {
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); closeCreateSheet(); return; }
    if (e.key !== "Tab") return;
    // Piège de focus : la feuille est modale, la tabulation ne doit pas partir
    // derrière elle (sinon le lecteur d'écran lit un écran masqué).
    var wrap = document.getElementById("v2CreateSheet");
    if (!wrap || wrap.hidden) return;
    var focusables = wrap.querySelectorAll("button:not([disabled])");
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UI-2 — DÉCORATION DU FEED
  // ──────────────────────────────────────────────────────────────────────────
  // Deux insertions, et rien d'autre. Elles s'ajoutent au fil DÉJÀ rendu par
  // `renderFeed` (app-02) : aucun post n'est retiré, réordonné ni dupliqué, le
  // moteur de classement `rankFeedPosts` n'est pas touché, et les bulles de
  // profils du haut restent hors de portée de ce code.
  //
  // Tout est construit par l'API DOM avec `textContent` : le contenu vient de
  // comptes tiers, et un nœud de texte ne peut pas devenir du markup. Les
  // seules URL posées passent par `safeMediaUrl` (même politique que
  // `safeUrlAttr`, cf. commentaire de cette fonction).
  // ══════════════════════════════════════════════════════════════════════════
  var MODULE_ATTR = "data-v2-module";
  var REEL_AFTER = 2;    // « insérer dans le Feed » — jamais la première carte
  var PEOPLE_AFTER = 4;  // « après les premiers contenus, jamais en tête »
  var PEOPLE_MIN = 2;    // moins de deux candidats → on n'affiche rien
  var PEOPLE_MAX = 3;

  // Même politique que `safeUrlAttr` (app-02) : http(s), data:image et blob:
  // seulement. La valeur est rendue BRUTE parce qu'elle est posée par l'API DOM
  // (`img.src`), où aucune sortie d'attribut n'est possible — l'échappement HTML
  // de `safeUrlAttr` y casserait au contraire toute URL contenant un « & ».
  function safeMediaUrl(u) {
    var s = String(u == null ? "" : u).trim();
    return /^(https?:\/\/|data:image\/|blob:)/i.test(s) ? s : "";
  }

  function feedList() { return document.getElementById("feedList"); }

  function removeFeedModules(list) {
    var old = list.querySelectorAll("[" + MODULE_ATTR + "]");
    for (var i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
  }

  // Cartes de post RÉELLES, en enfants directs : on ne compte ni les modules
  // insérés ici, ni un éventuel `.post` imbriqué dans un aperçu.
  function directPosts(list) {
    var out = [];
    var kids = list.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList && kids[i].classList.contains("post")) out.push(kids[i]);
    }
    return out;
  }

  function insertAfterNthPost(list, node, n) {
    var posts = directPosts(list);
    if (posts.length >= n) {
      var anchor = posts[n - 1];
      anchor.parentNode.insertBefore(node, anchor.nextSibling);
    } else {
      list.appendChild(node); // moins de contenus que prévu : jamais en tête non plus
    }
  }

  // ── Bobine dans le Feed ───────────────────────────────────────────────────
  // Le moteur existant est réutilisé tel quel : `buildReels()` (app-05) fait
  // déjà la déduplication, l'exclusion des comptes bloqués et le rejet des
  // bobines sans média. Aucun second lecteur, aucune logique de publication.
  function pickFeedReel() {
    if (typeof window.buildReels !== "function") return null;
    var reels = [];
    try { reels = window.buildReels() || []; }
    catch (e) {
      if (window.console && console.error) console.error("[ui-v2] buildReels :", e);
      return null;
    }
    return reels.length ? reels[0] : null;
  }

  function reelPoster(reel) {
    var candidates = [reel.poster, reel.photo, reel.coverPhotoUrl, reel.image];
    if (reel.cover && typeof window.resolveCoverUrl === "function") {
      try { candidates.push(window.resolveCoverUrl(reel.cover)); } catch (e) {}
    }
    for (var i = 0; i < candidates.length; i++) {
      var u = safeMediaUrl(candidates[i]);
      if (u) return u;
    }
    return "";
  }

  function authorName(post) {
    if (post && post.authorName) return post.authorName;
    try {
      var u = (typeof window.userById === "function") ? window.userById(post && post.authorId) : null;
      if (u && u.name) return u.name;
    } catch (e) {}
    return "Profil";
  }

  function buildReelCard(reel) {
    var card = document.createElement("article");
    card.className = "v2-feed-card v2-reel-card";
    card.setAttribute(MODULE_ATTR, "reel");
    card.setAttribute("data-reel-id", String(reel.id));
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Bobine de " + authorName(reel) + " — ouvrir");

    var media = document.createElement("div");
    media.className = "v2-reel-media";
    var poster = reelPoster(reel);
    if (poster) {
      // AUCUNE lecture automatique : la vignette est une <img>, pas une <video>.
      // Le viewer existant reste le seul lecteur de bobines de l'application.
      var img = document.createElement("img");
      img.className = "v2-reel-poster";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.src = poster;
      media.appendChild(img);
    } else {
      media.classList.add("v2-reel-media-empty");
    }
    var badge = document.createElement("span");
    badge.className = "v2-reel-badge";
    badge.textContent = "🎬 Bobine";
    media.appendChild(badge);
    var play = document.createElement("span");
    play.className = "v2-reel-play";
    play.setAttribute("aria-hidden", "true");
    play.textContent = "▶";
    media.appendChild(play);
    card.appendChild(media);

    var foot = document.createElement("div");
    foot.className = "v2-reel-foot";
    var who = document.createElement("span");
    who.className = "v2-reel-author";
    who.textContent = authorName(reel);
    foot.appendChild(who);
    var legende = String(reel.text || reel.caption || "").trim();
    if (legende) {
      var cap = document.createElement("span");
      cap.className = "v2-reel-caption";
      cap.textContent = legende;
      foot.appendChild(cap);
    }
    card.appendChild(foot);

    var ouvrir = function () {
      track("ui_v2_feed_reel_open", {});
      call("openReelById", reel.id);
    };
    card.addEventListener("click", ouvrir);
    card.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      ouvrir();
    });
    return card;
  }

  // ── Passionnés à découvrir ────────────────────────────────────────────────
  // Tous les identifiants sous lesquels MES contenus peuvent apparaître.
  // ⚠️ `MY_UID` (app-08) est déclaré avec `let` : un `let` de premier niveau ne
  // crée PAS de propriété sur `window`, il faut donc lire la liaison lexicale —
  // sous `typeof`+try, parce qu'elle est en zone morte tant qu'app-08 n'a pas
  // tourné. `me` est l'identifiant local historique de l'auteur courant.
  function mesIdentifiants() {
    var ids = ["me"];
    try { if (typeof MY_UID !== "undefined" && MY_UID) ids.push(MY_UID); } catch (e) {}
    try { if (window.MY_UID) ids.push(window.MY_UID); } catch (e) {}
    return ids;
  }

  // Candidats pris dans les auteurs RÉELLEMENT présents dans le fil rendu — pas
  // un annuaire, pas une recommandation calculée ailleurs.
  function pickPassionnes(posts) {
    var st = window.state || {};
    var user = st.user || {};
    var following = user.following || [];
    var blocked = user.blocked || [];
    var moi = mesIdentifiants();
    var seen = new Set();
    var out = [];
    for (var i = 0; i < posts.length && out.length < PEOPLE_MAX; i++) {
      var p = posts[i];
      if (!p || p._source === "me") continue;        // moi : jamais proposé
      var id = p.authorId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (moi.indexOf(id) > -1) continue;            // moi, sous n'importe quel id
      if (following.indexOf(id) > -1) continue;      // déjà suivi
      if (blocked.indexOf(id) > -1) continue;        // bloqué (modération)
      out.push(p);
    }
    // Moins de deux candidats : le module n'a rien à raconter, on n'affiche rien.
    return out.length >= PEOPLE_MIN ? out : [];
  }

  function buildPersonTile(p) {
    var info = {};
    try { info = (typeof window.userById === "function" && window.userById(p.authorId)) || {}; } catch (e) {}
    var nom = p.authorName || info.name || "Profil";
    var emoji = p.authorEmoji || info.profileEmoji || "✨";
    var couleur = String(p.authorColor || info.avatar || "");
    var photo = safeMediaUrl(info.photoUrl || p.authorAvatar);

    var tile = document.createElement("button");
    tile.type = "button";
    tile.className = "v2-person";
    tile.setAttribute("data-v2-person", String(p.authorId));
    tile.setAttribute("aria-label", "Voir le profil de " + nom);

    var av = document.createElement("span");
    av.className = "v2-person-avatar";
    if (photo) {
      var img = document.createElement("img");
      img.src = photo;
      img.alt = "";
      img.loading = "lazy";
      av.appendChild(img);
    } else {
      // Couleur venue d'un autre compte : bornée à une notation hexadécimale
      // avant d'atteindre le style (le CSSOM rejetterait le reste, on préfère
      // un défaut lisible à une tuile transparente).
      av.style.backgroundColor = /^#[0-9a-f]{3,8}$/i.test(couleur) ? couleur : "#8b5cf6";
      av.textContent = emoji;
    }
    tile.appendChild(av);

    var nm = document.createElement("span");
    nm.className = "v2-person-name";
    nm.textContent = nom;
    tile.appendChild(nm);

    var meta = null;
    try { meta = (typeof window.passionById === "function") ? window.passionById(p.passion) : null; } catch (e) {}
    var libelle = meta ? String((meta.emoji || "") + " " + (meta.label || "")).trim() : "";
    if (libelle) {
      var pa = document.createElement("span");
      pa.className = "v2-person-passion";
      pa.textContent = libelle;
      tile.appendChild(pa);
    }

    // Une seule issue : le profil existant. Ni message, ni rencontre directe.
    tile.addEventListener("click", function () {
      track("ui_v2_feed_person_open", {});
      call("openUserProfile", p.authorId);
    });
    return tile;
  }

  function buildPassionnesModule(candidates) {
    var box = document.createElement("section");
    box.className = "v2-feed-card v2-people";
    box.setAttribute(MODULE_ATTR, "people");
    box.setAttribute("aria-label", "Passionnés à découvrir");

    var head = document.createElement("h3");
    head.className = "v2-people-title";
    head.textContent = "Passionnés à découvrir";
    box.appendChild(head);

    var row = document.createElement("div");
    row.className = "v2-people-row";
    for (var i = 0; i < candidates.length; i++) row.appendChild(buildPersonTile(candidates[i]));
    box.appendChild(row);
    return box;
  }

  // Appelée par `renderFeed` juste après la peinture des cartes. Hors aperçu
  // elle ne fait que retirer ses propres nœuds (bascule en mémoire) et rend la
  // main : le fil reste exactement celui de `main`.
  function decorateFeed(list, posts) {
    list = list || feedList();
    if (!list) return false;
    removeFeedModules(list);
    if (!uiV2Enabled()) return false;
    try {
      var reel = pickFeedReel();
      if (reel) insertAfterNthPost(list, buildReelCard(reel), REEL_AFTER);

      var gens = pickPassionnes(Array.isArray(posts) ? posts : []);
      if (gens.length) insertAfterNthPost(list, buildPassionnesModule(gens), PEOPLE_AFTER);
      return true;
    } catch (e) {
      // Un fil décoré à moitié doit rester VISIBLE et l'échec rester audible
      // (piège « catch large » du projet) : on nettoie et on le dit.
      if (window.console && console.error) console.error("[ui-v2] décoration du fil :", e);
      removeFeedModules(list);
      return false;
    }
  }

  // ── État vide : une prochaine action, pas un cul-de-sac ───────────────────
  // Les textes historiques ne sont pas touchés : l'aperçu AJOUTE un bouton qui
  // dit quoi faire ensuite, et le retire dès qu'il est coupé.
  function decorateEmpty(emptyEl, ctx) {
    emptyEl = emptyEl || document.getElementById("feedEmpty");
    if (!emptyEl) return false;
    var old = emptyEl.querySelector("[data-v2-empty-cta]");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!uiV2Enabled()) return false;

    var rienChoisi = !!(ctx && ctx.nothingSelected);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn primary v2-empty-cta";
    btn.setAttribute("data-v2-empty-cta", rienChoisi ? "explore" : "create");
    btn.textContent = rienChoisi ? "Explorer les passions" : "Publier une Passio";
    btn.addEventListener("click", function () {
      track("ui_v2_empty_cta", { kind: rienChoisi ? "explore" : "create" });
      if (rienChoisi) { goToScreen("explore"); return; }
      openCreateSheet();
    });
    emptyEl.appendChild(btn);
    return true;
  }

  // ── Activation / désactivation ────────────────────────────────────────────
  function apply() {
    var on = uiV2Enabled();
    var root = document.documentElement;
    var legacy = document.getElementById("appNav");

    if (!on) {
      // Chemin par défaut : on ne crée rien et on ne défait rien. Si l'aperçu
      // avait été appliqué dans cette page (bascule en mémoire), on rend
      // exactement l'état d'origine.
      root.classList.remove(ROOT_CLASS);
      if (legacy) { legacy.hidden = false; legacy.removeAttribute("aria-hidden"); }
      var nav = document.getElementById("appNavV2");
      if (nav && nav.parentNode) nav.parentNode.removeChild(nav);
      closeCreateSheet();
      // UI-2 : les insertions du fil et le bouton d'état vide disparaissent avec
      // le reste — une bascule en mémoire rend exactement l'état d'origine.
      var list = feedList();
      if (list) removeFeedModules(list);
      decorateEmpty(null, {});
      return false;
    }

    root.classList.add(ROOT_CLASS);
    // La barre historique est MASQUÉE, jamais retirée : `applyNavOrder`
    // (app-05), la dépromotion CDV (idb-store) et la synchro d'état actif de
    // `goTo` continuent de trouver leurs nœuds — rien ne casse en dessous.
    if (legacy) { legacy.hidden = true; legacy.setAttribute("aria-hidden", "true"); }
    buildNav();
    // L'onglet actif est posé par `goTo` ; au premier rendu il n'a pas encore
    // tourné pour ces nœuds, on aligne donc sur l'écran affiché.
    syncActive();
    return true;
  }

  function syncActive() {
    var current = document.querySelector(".screen.active");
    var screen = current ? (current.id || "").replace(/^screen-/, "") : "feed";
    var items = document.querySelectorAll("#appNavV2 .nav-item[data-screen]");
    for (var i = 0; i < items.length; i++) {
      var is = items[i].getAttribute("data-screen") === screen;
      items[i].classList.toggle("active", is);
      if (is) items[i].setAttribute("aria-current", "page");
      else items[i].removeAttribute("aria-current");
    }
  }

  function boot() {
    try { apply(); } catch (e) {
      if (window.console && console.error) console.error("[ui-v2] activation :", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste vert).
  window.PassioUIV2 = {
    PREVIEW_NAME: PREVIEW_NAME,
    isEnabled: uiV2Enabled,
    apply: apply,
    refresh: syncActive,
    openCreateSheet: openCreateSheet,
    closeCreateSheet: closeCreateSheet,
    dismissHint: fermerAideContextuelle,
    // UI-2 — appelées par `renderFeed` (app-02). Inertes hors aperçu.
    decorateFeed: decorateFeed,
    decorateEmpty: decorateEmpty,
  };
})();
