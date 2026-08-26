// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V2 — lot UI-2 : Feed V2 et intentions, DERRIÈRE LE MÊME APERÇU.
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §6 et §15.
//
// Ce module ne rend PAS le fil : il fournit à `js/app-02-state-utils.js` les
// quelques décisions et fragments propres à la V2, toujours derrière un garde.
// Hors aperçu, chacune de ses fonctions est soit jamais appelée, soit renvoie
// une valeur neutre — le fil actuel garde exactement son comportement.
//
// Ce que le lot ajoute, et rien d'autre :
//   ① « Envie du moment » s'allume avec l'aperçu V2 (un seul aperçu à tester) ;
//   ② les Bobines entrent dans le fil — un tap ouvre le viewer vertical ;
//   ③ un module « Passionnés à découvrir », avec parcimonie ;
//   ④ des états vide/chargement cohérents avec la nouvelle hiérarchie.
//
// Ce que le lot NE touche PAS : les bulles de profils, la ligne d'onglets
// (dont le langage visuel est verrouillé), le moteur de publication, les
// commentaires, réactions et partages, et le classement de base
// (`rankFeedPosts`) — les intentions ne font que le réordonner, sans jamais
// retirer un contenu du fil.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // Le fil V2 suit exactement le drapeau du shell (lot UI-1) : un seul aperçu
  // commande toute la V2, comme l'exige la direction (§14 « aperçu unique »).
  function enabled() {
    try {
      return !!(window.PassioUIV2
        && typeof window.PassioUIV2.isEnabled === "function"
        && window.PassioUIV2.isEnabled());
    } catch (e) { return false; }
  }

  // ── ② Bobines dans le fil ────────────────────────────────────────────────
  // Une Bobine est un FORMAT de découverte, pas un univers concurrent : elle
  // entre donc dans le fil unique. Le viewer plein écran reste la profondeur
  // du contenu, atteint par un tap sur le média.
  function keepReelsInFeed() { return enabled(); }

  function reelCover(p) {
    return p.coverPhotoUrl || p.cover || p.image || p.photo || null;
  }

  // Média d'une carte Bobine dans le fil. Retourne "" si rien n'est jouable :
  // l'appelant garde alors son rendu habituel plutôt qu'un cadre noir vide.
  function reelMediaHtml(p) {
    if (!p || !p.id) return "";
    var cover = reelCover(p);
    var hasVideo = !!(p.video && String(p.video).trim());
    if (!cover && !hasVideo) return "";

    var inner = cover
      ? '<img class="v2-reel-cover" src="' + safeUrlAttr(passioThumb(cover, 700)) + '" alt="" loading="lazy" decoding="async"'
        + ' onerror="this.style.display=\'none\';">'
      // Sans vignette, la vidéo elle-même sert d'aperçu : muette, sans
      // contrôles, elle ne démarre aucune lecture — le tap ouvre le viewer.
      : '<video class="v2-reel-cover" src="' + safeUrlAttr(p.video) + '" muted playsinline preload="metadata"'
        + ' tabindex="-1" aria-hidden="true"></video>';

    // `escapeJsArg` est appliqué AU POINT D'INTERPOLATION, pas via une variable
    // intermédiaire : c'est ce que vérifie `npm run audit:echappement`, et c'est
    // aussi ce qui rend l'assainissement lisible pour un relecteur. Le contexte
    // est un argument de chaîne JS simple-quotée dans un attribut `on*` — donc
    // `escapeJsArg`, jamais `escapeHtml` (le HTML décode `&#39;` AVANT le parse
    // JS, et un identifiant à apostrophe casserait le handler).
    // `openReelById` existe déjà pour l'onglet Bobines du profil : on réutilise
    // le moteur, on n'en écrit pas un second.
    return '<div class="post-media v2-reel-media" role="button" tabindex="0"'
      + ' aria-label="Ouvrir la bobine en plein écran"'
      + ' onclick="event.stopPropagation();if(typeof openReelById===\'function\')openReelById(\''
      +   escapeJsArg(String(p.id)) + '\');"'
      + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'
      +   'event.stopPropagation();if(typeof openReelById===\'function\')openReelById(\''
      +   escapeJsArg(String(p.id)) + '\');}">'
      + inner
      + '<span class="v2-reel-badge">Bobine</span>'
      + '<span class="v2-reel-play" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>'
      + "</span>"
      + "</div>";
  }

  // ── ③ Module « Passionnés à découvrir » ──────────────────────────────────
  // Le contenu doit mener à la PERSONNE avant de mener à la conversation
  // (annexe A17) : le module ouvre un profil, il n'expose aucun bouton
  // « Message » direct et ne propose jamais de « rencontrer quelqu'un ».
  var PEOPLE_MAX = 3;
  var PEOPLE_AFTER = 3; // « avec parcimonie, après les premiers contenus »

  function insertPeopleAfter() { return PEOPLE_AFTER; }

  // Candidats : des personnes réelles du contenu affiché, jamais inventées.
  // On part des AUTEURS des posts visibles — c'est la seule source qui
  // garantisse que la personne a bien publié autour de la passion regardée.
  function peopleCandidates(visiblePosts) {
    var out = [];
    try {
      var me = [(typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null,
                state.user && state.user.id, "me"].filter(Boolean);
      var following = (state.user && state.user.following) || [];
      var blocked = (state.user && state.user.blocked) || [];
      var seen = {};
      (visiblePosts || []).forEach(function (p) {
        if (!p || !p.authorId) return;
        if (seen[p.authorId]) return;
        if (me.indexOf(p.authorId) > -1) return;
        if (following.indexOf(p.authorId) > -1) return;   // déjà suivi : sans intérêt
        if (blocked.indexOf(p.authorId) > -1) return;     // modération : jamais
        var u = (typeof userById === "function") ? userById(p.authorId) : null;
        if (!u || !u.name) return;                        // pas de profil réel → on saute
        seen[p.authorId] = 1;
        out.push({ user: u, passion: p.passion, source: p._source === "me" ? "me" : "seed" });
      });
    } catch (e) { return []; }
    return out.slice(0, PEOPLE_MAX);
  }

  function peopleModuleHtml(visiblePosts) {
    var people = peopleCandidates(visiblePosts);
    // Moins de deux personnes : le module n'apporte rien et ferait un trou dans
    // le fil. Mieux vaut ne rien afficher que d'afficher une liste creuse.
    if (people.length < 2) return "";

    var cards = people.map(function (item) {
      var u = item.user;
      var pa = (typeof passionById === "function") ? passionById(item.passion) : null;
      var label = (pa && pa.label) ? pa.label : (item.passion || "");
      // Idem : `escapeJsArg` au point d'interpolation. Le NOM affiché, lui, est
      // du texte HTML → `escapeHtml` (deux contextes, deux désinfectants).
      return '<button type="button" class="v2-people-card"'
        + ' onclick="openUserProfile(\'' + escapeJsArg(String(u.id)) + '\',\''
        +   escapeJsArg(item.source) + '\')">'
        + '<span class="avatar" style="background:' + avatarBg(u) + ';">' + avatarInner(u) + "</span>"
        + '<span class="v2-people-name">' + escapeHtml(u.name) + "</span>"
        + (label ? '<span class="v2-people-passion">' + escapeHtml(label) + "</span>" : "")
        + "</button>";
    }).join("");

    return '<section class="v2-people" aria-label="Passionnés à découvrir">'
      + '<h2 class="v2-people-title">Passionnés à découvrir</h2>'
      + '<p class="v2-people-lede">Des personnes qui publient autour de tes Passio.</p>'
      + '<div class="v2-people-row">' + cards + "</div>"
      + "</section>";
  }

  // ── ④ États vide / chargement ────────────────────────────────────────────
  // Le fil ne doit jamais être un cul-de-sac : l'état vide de la V2 nomme la
  // suite possible au lieu de constater l'absence.
  var EMPTY = {
    // Aucune bulle de profil active — c'est l'écran que voit le plus souvent un
    // nouveau compte : il doit désigner le geste, pas constater le vide.
    "no-selection": {
      title: "Choisis une Passio pour commencer",
      text: "Touche une bulle au-dessus : ton fil se remplit aussitôt.",
    },
    // Une passion est active mais personne n'a encore publié dedans.
    passions: {
      title: "Rien encore autour de cette Passio",
      text: "Publie le premier contenu, ou change d'envie du moment juste au-dessus.",
    },
    "no-content": {
      title: "Ton fil est prêt",
      text: "Choisis une Passio au-dessus pour voir ce qui s'y passe.",
    },
  };

  function emptyCopy(context) {
    if (!enabled()) return null;
    return EMPTY[context] || null;
  }

  window.PassioUIV2Feed = {
    isEnabled: enabled,
    keepReelsInFeed: keepReelsInFeed,
    reelMediaHtml: reelMediaHtml,
    insertPeopleAfter: insertPeopleAfter,
    peopleModuleHtml: peopleModuleHtml,
    emptyCopy: emptyCopy,
  };
})();
