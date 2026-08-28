// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V3 — lot UI-3A : passerelle « Trouver une expérience » du Feed vers l'IRL.
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §6 et §15.
//
// Périmètre EXACT de ce lot, et rien de plus :
//   une publication du Feed qui porte une Passio et n'est PAS déjà reliée à un
//   événement reçoit, en bas de carte, un lien discret « Trouver une expérience »
//   — et rien d'autre depuis le 2026-08-27, voir `construireBridge`. Le tap ouvre
//   une feuille basse du même nom, qui propose exactement trois suites, toutes
//   servies par des moteurs QUI EXISTENT DÉJÀ :
//     ① Voir les activités      → irlPassionFilters + goTo("irl")/renderIRL
//     ② Découvrir des personnes → openPassionExplorer(passion)
//     ③ Proposer une sortie     → openCreateEvent() + feedIrlBridgePrefill()
//
// Lot UI-3B (ajouté le 2026-08-27, même module) : les publications DÉJÀ reliées
// à une activité EXISTANTE reçoivent, au même endroit et dans le même style, le
// lien « Voir l'activité ». Le tap ouvre la fiche EXISTANTE (`openEventDetails`),
// où l'action primaire devient un unique « Je participe » servi par le moteur
// RSVP historique (`setEventRsvp`). Les deux lots sont EXCLUSIFS : une carte
// reliée à une activité ne reçoit jamais « Trouver une expérience », et
// inversement. Contrat visuel arrêté par Benjamin : pas de « À vivre en vrai »,
// pas de trait, pas de Passio répétée, pas de bouton RSVP dans le Feed.
//
// ⚠️ AUCUN effet de bord métier. Ce module ne crée pas d'événement, pas de RSVP,
// pas de message, pas de relation ; il n'écrit ni en base, ni dans `state`, ni
// dans `localStorage`. Il ne touche jamais `state.user.currentProfileId` :
// l'identité active traverse la passerelle inchangée.
//
// ── Activation — ACTIF PAR DÉFAUT depuis la validation visuelle de Benjamin
//    du 2026-08-27 (PR #163). Le lot était en aperçu jusque-là. ────────────
//     localStorage.passio_ui_3 = "0"   → kill switch, prioritaire
//     window.PASSIO_UI_3 = false       → coupure immédiate en mémoire
//     ?passio_preview=passio-ui-3      → toléré, sans effet supplémentaire
//
// Le drapeau ne sait que RETIRER : il n'y a volontairement aucune branche
// « valeur positive qui active ». `"1"` et `true` sont IGNORÉS, exactement
// comme dans `ui-v2-shell.js` — l'activation vient de la décision de
// déploiement, jamais d'un état persistant du navigateur.
//
// Le module n'écrit toujours RIEN dans `localStorage` : promouvoir le lot ne
// change pas cet invariant, il le rend seulement inutile pour activer. Un
// appareil coupé le reste, et le lien d'aperçu déjà partagé continue de
// fonctionner sans rien poser sur l'appareil du testeur.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var PREVIEW_NAME = "passio-ui-3";
  var STORAGE_KEY = "passio_ui_3";
  var ROOT_CLASS = "passio-ui-3";
  var VERSION = "ui3a";

  // Vocabulaire validé par Benjamin le 2026-08-27. Le lien de la carte et le
  // titre du panneau portent DÉLIBÉRÉMENT le même libellé : ce que le tap
  // promet est exactement ce que le panneau tient. Une seule constante, pour
  // qu'ils ne puissent pas diverger.
  var LIBELLE_CTA = "Trouver une expérience";

  // ── Vocabulaire UI-3B, validé par Benjamin le 2026-08-27 ─────────────────
  // Trois constantes, et rien d'autre : la carte ne porte QUE « Voir l'activité »,
  // la fiche QUE « Je participe », et le retrait reste une action secondaire.
  var VERSION_3B = "ui3b";
  var LIBELLE_VOIR = "Voir l'activité";
  var LIBELLE_RSVP = "Je participe";
  var LIBELLE_RSVP_FAIT = "✓ Je participe";
  var LIBELLE_RSVP_ATTENTE = "⏳ Sur liste d'attente";
  var LIBELLE_RSVP_RETIRER = "Retirer ma participation";

  // Aperçu de validation VISUELLE : une carte liée, uniquement en mémoire,
  // uniquement sous ce paramètre. Elle ne crée ni post, ni activité, ni RSVP
  // dans Supabase/localStorage et reste absente de l'URL normale.
  var DEMO_PREVIEW_NAME = "passio-ui-3b-demo";
  var DEMO_POST_ID = "__passio_ui3b_demo_post";
  var DEMO_EVENT_ID = "__passio_ui3b_demo_event";
  var demoRsvp = "";

  function demoDemandee() {
    try {
      return new URLSearchParams(window.location.search).get("passio_preview") === DEMO_PREVIEW_NAME;
    } catch (e) { fail("demo_query", e); return false; }
  }

  function demoPassion() {
    try {
      if (typeof _activeFeedPassions !== "undefined" && _activeFeedPassions.size) {
        return String(Array.from(_activeFeedPassions)[0]);
      }
      if (typeof allPassions === "function") {
        var ps = allPassions();
        if (ps && ps[0] && ps[0].id) return String(ps[0].id);
      }
    } catch (e) { fail("demo_passion", e); }
    return "musique";
  }

  function demoPost() {
    return {
      id: DEMO_POST_ID,
      authorId: "__passio_preview",
      authorName: "Aperçu Passio",
      authorEmoji: "✨",
      authorColor: "#7c3aed",
      passion: demoPassion(),
      mood: "all",
      type: "text",
      text: "Une activité est liée à cette publication — démonstration non enregistrée.",
      createdAt: Date.now(),
      likes: 0,
      comments: [],
      eventId: DEMO_EVENT_ID,
    };
  }

  function demoEvent() {
    return {
      id: DEMO_EVENT_ID,
      title: "Jam acoustique",
      passion: demoPassion(),
      organizerId: "__passio_preview",
      date: Date.now() + (3 * 86400000),
      time: "18:30",
      city: "Lyon",
      venue: "Café des Arts",
      price: 0,
      maxAttendees: 12,
      attendees: [],
      maybes: [],
      waitlist: [],
      desc: "Une rencontre simple autour de la musique. Cette activité sert uniquement à valider l'interface UI-3B.",
    };
  }

  // Le moteur historique exige que l'activité soit présente dans son catalogue
  // au moment où il construit la fiche. On l'y place pendant cet appel
  // synchrone, puis on la retire immédiatement : aucune donnée de démonstration
  // ne survit dans state, saveState ou Supabase.
  function avecDemoEvent(run) {
    if (!demoDemandee() || typeof state === "undefined" || !state.seed) return run();
    var arr = state.seed.events || (state.seed.events = []);
    var deja = arr.some(function (e) { return e && e.id === DEMO_EVENT_ID; });
    if (!deja) arr.unshift(demoEvent());
    try { return run(); }
    finally {
      if (!deja) {
        var i = arr.findIndex(function (e) { return e && e.id === DEMO_EVENT_ID; });
        if (i >= 0) arr.splice(i, 1);
      }
    }
  }

  // ── Drapeau ───────────────────────────────────────────────────────────────
  // Ordre de priorité : coupure mémoire > kill switch local > défaut ACTIVÉ.
  // Les deux coupures restent prioritaires sur tout le reste : un appareil
  // coupé le reste, y compris si on lui envoie le lien d'aperçu.
  //
  // `PREVIEW_NAME` n'apparaît plus dans cette fonction : le paramètre d'URL
  // reste valide (il mène à une app où le lot est actif) mais il n'a plus rien
  // à décider. Le retirer d'ici est ce qui garantit qu'il ne peut pas devenir,
  // par accident, un chemin d'activation qui court-circuiterait un kill switch.
  function uiV3Enabled() {
    if (window.PASSIO_UI_3 === false) return false; // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;               // kill switch local
    return true;
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
    if (demoDemandee() && String(id) === DEMO_POST_ID) return demoPost();
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

  // Pose une publication de démonstration via le moteur de rendu existant.
  // L'ajout au seed ne dure que le temps SYNCHRONE de renderFeed(), puis il est
  // retiré ; seul le DOM rendu reste visible sur l'URL de validation.
  var demoRendering = false;
  function assurerDemoFeed() {
    if (!demoDemandee() || demoRendering) return false;
    var list = feedList();
    if (!list || list.querySelector('article.post[data-postid="' + DEMO_POST_ID + '"]')) return !!list;
    if (typeof state === "undefined" || !state.seed || typeof renderFeed !== "function") return false;
    var arr = state.seed.posts || (state.seed.posts = []);
    var deja = arr.some(function (p) { return p && p.id === DEMO_POST_ID; });
    if (!deja) arr.unshift(demoPost());
    demoRendering = true;
    try {
      renderFeed();
      // L'aide de première visite est positionnée au-dessus du Feed et peut
      // intercepter le tap sur la carte de démonstration. Cette URL sert à une
      // validation directe : on la ferme sans modifier son état persistant.
      fermerAideContextuelle();
      setTimeout(function () { fermerAideContextuelle(); }, 0);
    }
    catch (e) { fail("demo_render", e); }
    finally {
      demoRendering = false;
      if (!deja) {
        var i = arr.findIndex(function (p) { return p && p.id === DEMO_POST_ID; });
        if (i >= 0) arr.splice(i, 1);
      }
    }
    return !!feedList() && !!feedList().querySelector('article.post[data-postid="' + DEMO_POST_ID + '"]');
  }

  // La ligne basse d'une carte éligible ne porte QUE le lien. Elle a d'abord
  // affiché un « trait Passio » — badge de la Passio, emoji, ligne fine violet →
  // corail — retiré le 2026-08-27 après essai réel de Benjamin sur la preview :
  // la Passio figure déjà dans l'en-tête du post, la répéter en bas alourdissait
  // la carte sans rien apprendre. Le lien reste discret et aligné à droite.
  function construireBridge(post) {
    var row = document.createElement("div");
    row.className = "v3-bridge";
    row.setAttribute("data-v3-bridge", String(post.id));

    var cta = document.createElement("button");
    cta.type = "button";
    cta.className = "v3-tempt";
    cta.setAttribute("data-v3-tempt", String(post.id));
    cta.setAttribute("aria-haspopup", "dialog");
    cta.setAttribute("aria-expanded", "false");
    // `textContent` : le libellé est une constante du lot, mais la règle vaut
    // pour toute la ligne — aucune chaîne HTML n'est construite ici.
    cta.textContent = LIBELLE_CTA;

    row.appendChild(cta);
    return row;
  }

  // Le CTA historique « 🤝 Organiser un IRL » (pont `feed_irl_bridge_v1`) ne doit
  // pas cohabiter avec « Trouver une expérience » : les deux répondent au même besoin, les
  // afficher ensemble donnerait deux portes vers l'IRL au bas d'une carte.
  //
  // ⚠️ Il est MASQUÉ par une règle CSS ancrée à `.passio-ui-3`, jamais retiré du
  // DOM. Le retirer marchait à l'aller et pas au retour : une coupure en mémoire
  // enlevait bien « Trouver une expérience », mais ne rendait pas le CTA historique — la
  // carte se retrouvait sans aucune porte vers l'IRL jusqu'à la repeinte
  // suivante. Un masquage porté par la classe racine se défait tout seul quand
  // le kill switch la retire. (Défaut relevé en contre-revue, PR #163.)
  function decorerArticle(article) {
    var id = article.getAttribute("data-postid");
    if (!id) return;
    if (article.querySelector("[data-v3-bridge]")) return; // déjà décorée

    var post = trouverPost(id);
    if (!post || !post.id) return;

    // UI-3B en premier : une publication DÉJÀ reliée à une activité relève de ce
    // lot et de lui seul. Le `return` est inconditionnel — même quand l'activité
    // est introuvable, la carte ne bascule PAS sur « Trouver une expérience » :
    // ce serait proposer une autre porte que celle que la publication annonce.
    var evId = refEvenement(post);
    if (evId) { decorerActivite(article, post, evId); return; }

    if (!eligible(post)) return;
    var passionId = passionDuPost(post);
    if (!passionId) return;

    article.appendChild(construireBridge(post));
    // Marque la carte comme DÉCORÉE. C'est cet attribut, et lui seul, qui
    // autorise le CSS à masquer le CTA historique : les deux éligibilités ne se
    // recouvrent pas (le pont historique n'exige aucune passion, la passerelle
    // en exige une CONNUE), donc masquer sans condition privait de toute porte
    // vers l'IRL les cartes que la passerelle ne décore pas.
    article.setAttribute("data-v3-decore", "1");
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
    // Le marqueur part avec la décoration : une carte non décorée ne doit
    // jamais rester porteuse de la condition qui masque le CTA historique.
    var marquees = list.querySelectorAll("[data-v3-decore]");
    for (var j = 0; j < marquees.length; j++) {
      marquees[j].removeAttribute("data-v3-decore");
      marquees[j].removeAttribute("data-v3-activity-source");
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
  // alors jamais été posée : pas de trait, pas de lien, en silence.
  // Le dépôt a déjà payé ce piège (cf. la note de `attendreFilStable` dans
  // tests/e2e/interactions.spec.js) ; mesuré ici sur le runner CI, où le trait
  // n'apparaissait pas en 5 secondes. La coalescence reste assurée par `pending`.
  function planifierScan() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      assurerDemoFeed();
      decorateFeed(null);
    }, 0);
  }

  function observerLeFil() {
    var list = feedList();
    if (!list || observer) return;
    observer = new MutationObserver(function () { planifierScan(); });
    observer.observe(list, { childList: true });
    planifierScan();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEUILLE BASSE « TROUVER UNE EXPÉRIENCE »
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

  // ⚠️ L'ancre porte SON identifiant de publication. Elle était lue via
  // `ctxPostId` (le contexte de la feuille) : UI-3B pose la même ancre depuis un
  // parcours qui n'ouvre pas la feuille, et aurait restitué la position d'une
  // autre carte. La donnée voyage donc avec l'ancre, jamais à côté.
  function poserAncre(postId) {
    ancre = null;
    try {
      var el = document.querySelector('#feedList article.post[data-postid="' + cssEscape(postId) + '"]');
      if (el) ancre = { el: el, top: el.getBoundingClientRect().top, postId: String(postId) };
    } catch (e) { fail("ancre", e); }
  }

  function restituerAncre() {
    if (!ancre || !ancre.el) return;
    try {
      // La carte a pu être remplacée par une repeinte du fil : on la retrouve
      // par son identifiant plutôt que de garder un nœud orphelin.
      var el = document.body.contains(ancre.el)
        ? ancre.el
        : document.querySelector('#feedList article.post[data-postid="' + cssEscape(ancre.postId || ctxPostId) + '"]');
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

    // Le trait violet → corail ne subsiste QUE dans la feuille, où il tient lieu
    // de transition d'ouverture. Sur la carte il a été retiré le 2026-08-27 : il
    // y répétait une Passio déjà lisible dans l'en-tête du post.
    var trace = document.createElement("div");
    trace.className = "v3-sheet-trace";
    trace.setAttribute("aria-hidden", "true");

    var head = document.createElement("div");
    head.className = "v2-sheet-head";
    var titre = document.createElement("h2");
    titre.className = "v2-sheet-title";
    titre.id = "v3SheetTitle";
    titre.textContent = LIBELLE_CTA;
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
  // PAR-DESSUS le fil : ouverte au moment où l'on tape le lien, elle
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
  // LOT UI-3B — publication DÉJÀ reliée à une activité
  // ──────────────────────────────────────────────────────────────────────────
  // Deux surfaces, aucun moteur nouveau :
  //   ① la carte du Feed reçoit le seul lien « Voir l'activité » ;
  //   ② la fiche EXISTANTE (`openEventDetails`) voit son action primaire
  //      remplacée par un unique « Je participe », servi par `setEventRsvp`.
  // Rien n'est écrit tant que le testeur n'a pas tapé « Je participe ».
  // ══════════════════════════════════════════════════════════════════════════

  // Référence d'activité PORTÉE par la publication. Uniquement les structures
  // reconnues par l'application — jamais déduite du texte, de la ville ou de la
  // Passio : une déduction ouvrirait la porte à un CTA qui ment.
  function refEvenement(post) {
    if (!post) return "";
    if (post.eventId) return String(post.eventId);
    if (post.event_id) return String(post.event_id);
    var sd = post.sharedReelData;
    if (sd && sd.kind === "event" && sd.id) return String(sd.id);
    return "";
  }

  function sourceRef(post) {
    if (!post) return "none";
    if (post.eventId || post.event_id) return "direct";
    return "shared";
  }

  // Résolution par les moteurs EXISTANTS, dans leur ordre d'autorité :
  // l'objet canonique du `state` d'abord, la vue agrégée ensuite.
  function trouverEvenement(id) {
    if (!id) return null;
    if (demoDemandee() && String(id) === DEMO_EVENT_ID) return demoEvent();
    try {
      if (typeof _findCanonicalEvent === "function") {
        var ev = _findCanonicalEvent(id);
        if (ev) return ev;
      }
    } catch (e) { fail("event_lookup", e); }
    try {
      if (typeof allEvents === "function") {
        return allEvents().find(function (e) { return e && e.id === id; }) || null;
      }
    } catch (e) { fail("event_lookup_all", e); }
    return null;
  }

  function etatRsvp(id) {
    if (demoDemandee() && String(id) === DEMO_EVENT_ID) return demoRsvp;
    try { if (typeof myRsvp === "function") return myRsvp(id) || ""; }
    catch (e) { fail("rsvp_etat", e); }
    return "";
  }

  // Activité supprimée, inaccessible ou pas encore chargée : la publication
  // reste visible et NUE. Le diagnostic est purement technique — pas
  // d'identifiant de publication, pas de titre, pas de ville, pas de personne —
  // et une seule fois par publication et par session, pour ne pas noyer le fil
  // de diagnostic à chaque repeinte.
  var orphelinsVus = {};
  function signalerActiviteIntrouvable(postId) {
    var k = String(postId);
    if (orphelinsVus[k]) return;
    orphelinsVus[k] = 1;
    try { if (typeof diagLog === "function") diagLog("ui_v3b : activité liée introuvable"); } catch (e) {}
    track("ui_v3b_ref_absente", { v: VERSION_3B });
  }

  // La ligne basse d'une carte reliée : le MÊME gabarit qu'UI-3A (lien discret,
  // aligné à droite, chevron), et rien d'autre. Pas de sous-carte, pas de titre
  // recopié, pas de date, pas de bouton de participation : le contrat visuel
  // validé le 2026-08-27 tient en un lien.
  function construireVoirActivite(post, ev) {
    var row = document.createElement("div");
    row.className = "v3-bridge";
    row.setAttribute("data-v3-bridge", String(post.id));

    var cta = document.createElement("button");
    cta.type = "button";
    cta.className = "v3-tempt v3-voir";
    cta.setAttribute("data-v3-activity", String(ev.id));
    cta.setAttribute("data-v3-post", String(post.id));
    cta.textContent = LIBELLE_VOIR;

    row.appendChild(cta);
    return row;
  }

  // L'activité a disparu entre l'affichage du lien et le tap : on retire le lien
  // devenu mensonger, et le marqueur avec lui — la carte redevient exactement
  // celle d'avant, CTA historique compris.
  function retirerDecoration(postId) {
    if (!postId) return;
    try {
      var art = document.querySelector('#feedList article.post[data-postid="' + cssEscape(postId) + '"]');
      if (!art) return;
      var row = art.querySelector("[data-v3-bridge]");
      if (row && row.parentNode) row.parentNode.removeChild(row);
      art.removeAttribute("data-v3-decore");
      art.removeAttribute("data-v3-activity-source");
    } catch (e) { fail("decoration_retrait", e); }
  }

  function decorerActivite(article, post, evId) {
    var ev = trouverEvenement(evId);
    if (!ev) { signalerActiviteIntrouvable(post.id); return; }
    article.appendChild(construireVoirActivite(post, ev));
    // Même marqueur qu'UI-3A : c'est lui qui autorise le CSS à masquer le CTA
    // historique, borné aux cartes réellement décorées.
    article.setAttribute("data-v3-decore", "1");
    // Les partages d'événement portent déjà une sous-carte historique cliquable.
    // Le CSS borné à cette source la masque pendant UI-3B afin de ne garder
    // qu'une seule porte « Voir l'activité » ; le kill switch la restitue.
    article.setAttribute("data-v3-activity-source", sourceRef(post));
  }

  // ── La fiche ──────────────────────────────────────────────────────────────
  // `ctxFiche` = { id, postId } tant que la fiche a été ouverte PAR ce lot. Hors
  // de ce contexte, la fiche reste exactement celle d'avant : ouvrir un
  // événement depuis l'écran IRL ne change rien.
  var ctxFiche = null;
  var observerFicheRef = null;
  var fichePending = false;

  function pageFiche() { return document.getElementById("eventDetailPage"); }
  function ficheOuverte() {
    var page = pageFiche();
    return !!page && page.style.display !== "none" && page.style.display !== "";
  }

  function ouvrirActivite(evId, postId) {
    if (!uiV3Enabled()) return false;
    var ev = trouverEvenement(evId);
    if (!ev) {
      // Le lien existait, l'activité a disparu entre-temps : on le dit, on
      // n'ouvre rien, et on ne bascule sur AUCUNE autre activité.
      signalerActiviteIntrouvable(postId);
      notify("Cette activité n'est plus disponible.");
      retirerDecoration(postId);
      return false;
    }
    // Une aide contextuelle est `position: fixed` : ouverte à cet instant, elle
    // recouvrirait la fiche. Même geste qu'UI-3A.
    fermerAideContextuelle();

    ctxFiche = { id: String(ev.id), postId: String(postId || "") };
    if (ctxFiche.postId) poserAncre(ctxFiche.postId);

    if (typeof openEventDetails !== "function") {
      fail("fiche", "openEventDetails indisponible");
      notify("La fiche de l'activité n'est pas disponible ici.");
      ctxFiche = null;
      return false;
    }
    try {
      if (demoDemandee() && String(ev.id) === DEMO_EVENT_ID) {
        avecDemoEvent(function () { openEventDetails(ev.id); });
      } else {
        openEventDetails(ev.id);
      }
    } catch (e) {
      fail("fiche_open", e);
      notify("La fiche de l'activité n'est pas disponible ici.");
      ctxFiche = null;
      return false;
    }

    observerLaFiche();
    appliquerCtaFiche();
    track("ui_v3b_open_event", { v: VERSION_3B, src: sourceRef(trouverPost(postId)) });
    return true;
  }

  // Action primaire de la fiche, remplacée UNE fois la fiche rendue. Elle n'est
  // posée que dans le contexte de ce lot, sur une activité ni annulée ni
  // terminée — dans ces deux cas la fiche historique dit déjà la bonne chose, et
  // la recouvrir d'un « Je participe » serait mensonger.
  // L'aperçu UI-4B reconstruit la fiche ENTIÈRE, action primaire comprise. Deux
  // modules qui écrivent la même barre se repeindraient l'un l'autre sans fin
  // (chacun observe `#eventDetailCta`). UI-4B est alors le seul écrivain ; le
  // reste d'UI-3B — lien du Feed, contexte, ancre de retour — est inchangé.
  // Hors aperçu, `PassioUIV4B` répond « éteint » et rien ne change ici.
  function ficheReprisParV4b() {
    try { return !!(window.PassioUIV4B && window.PassioUIV4B.isEnabled()); }
    catch (e) { return false; }
  }

  function appliquerCtaFiche() {
    if (!ctxFiche || !uiV3Enabled()) return;
    if (ficheReprisParV4b()) return;
    if (String(window._openEventDetailId || "") !== ctxFiche.id) return;
    var cta = document.getElementById("eventDetailCta");
    if (!cta) return;
    var ev = trouverEvenement(ctxFiche.id);
    if (!ev) return;
    try {
      if (typeof _eventIsCancelled === "function" && _eventIsCancelled(ev)) return;
      if (typeof _eventIsOver === "function" && _eventIsOver(ev)) return;
    } catch (e) { fail("fiche_etat", e); return; }

    var etat = etatRsvp(ctxFiche.id);
    var sig = etat || "none";
    // ⚠️ Le marqueur vit sur le nœud INJECTÉ, pas sur `#eventDetailCta` : le
    // moteur historique repeint la barre par `innerHTML`, ce qui efface les
    // enfants mais garde les attributs de l'hôte. Un marqueur posé sur l'hôte
    // aurait donc dit « déjà à jour » sur une barre redevenue historique.
    var box = cta.querySelector("[data-v3-rsvp]");
    if (box && box.getAttribute("data-v3-rsvp") === sig) return;

    cta.innerHTML = "";
    cta.appendChild(construireCtaFiche(sig));
  }

  function construireCtaFiche(etat) {
    var box = document.createElement("div");
    box.className = "v3-rsvp";
    box.setAttribute("data-v3-rsvp", etat);

    // Participation confirmée (ou file d'attente) : un ÉTAT lisible, pas un
    // bouton qui bascule — un tap malheureux ne doit pas désinscrire.
    if (etat === "going" || etat === "waitlist") {
      var st = document.createElement("div");
      st.className = "v3-rsvp-etat";
      st.setAttribute("data-v3-rsvp-etat", etat);
      st.setAttribute("role", "status");
      st.textContent = etat === "going" ? LIBELLE_RSVP_FAIT : LIBELLE_RSVP_ATTENTE;
      box.appendChild(st);
      box.appendChild(construireRetrait());
      return box;
    }

    var go = document.createElement("button");
    go.type = "button";
    go.className = "btn primary block v3-rsvp-go";
    go.setAttribute("data-v3-rsvp-go", "1");
    go.textContent = LIBELLE_RSVP;
    box.appendChild(go);
    // Une réponse antérieure posée AILLEURS (feuille historique à trois états)
    // reste retirable ici, sans que cette surface la nomme ni la propose.
    if (etat !== "none") box.appendChild(construireRetrait());
    return box;
  }

  function construireRetrait() {
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "v3-rsvp-retirer";
    rm.setAttribute("data-v3-rsvp-remove", "1");
    rm.textContent = LIBELLE_RSVP_RETIRER;
    return rm;
  }

  // Geste EXPLICITE, et lui seul, déclenche l'écriture. `setEventRsvp` est le
  // moteur historique : places, liste d'attente, annulation, notification de
  // l'organisateur, écriture Supabase et lecture de son `{ error }` y sont déjà.
  function participer() {
    if (!ctxFiche) return false;
    var id = ctxFiche.id;
    if (demoDemandee() && id === DEMO_EVENT_ID) {
      demoRsvp = "going";
      appliquerCtaFiche();
      track("ui_v3b_demo_rsvp_go", { v: VERSION_3B });
      return true;
    }
    if (typeof setEventRsvp !== "function") {
      fail("rsvp", "setEventRsvp indisponible");
      notify("La participation n'est pas disponible ici.");
      return false;
    }
    track("ui_v3b_rsvp_go", { v: VERSION_3B, from: etatRsvp(id) || "none" });
    try {
      var r = setEventRsvp(id, "going");
      if (r && typeof r.catch === "function") r.catch(function (e) { fail("rsvp_go", e); });
    } catch (e) { fail("rsvp_go", e); return false; }
    return true;
  }

  function retirerParticipation() {
    if (!ctxFiche) return false;
    var id = ctxFiche.id;
    if (demoDemandee() && id === DEMO_EVENT_ID) {
      demoRsvp = "";
      appliquerCtaFiche();
      track("ui_v3b_demo_rsvp_remove", { v: VERSION_3B });
      return true;
    }
    if (typeof setEventRsvp !== "function") return false;
    track("ui_v3b_rsvp_remove", { v: VERSION_3B, from: etatRsvp(id) || "none" });
    try {
      var r = setEventRsvp(id, null);
      if (r && typeof r.catch === "function") r.catch(function (e) { fail("rsvp_remove", e); });
    } catch (e) { fail("rsvp_remove", e); return false; }
    return true;
  }

  // Le moteur repeint la fiche ENTIÈRE à chaque changement de participation
  // (`_refreshEventDetailIfOpen`) : la barre redevient alors historique. Un
  // observateur coalescé la remet dans l'état du lot, et détecte la fermeture.
  //
  // ⚠️ `setTimeout` et jamais `requestAnimationFrame` : même piège qu'UI-3A, rAF
  // ne part pas sur une page qui ne compose pas de frames.
  function planifierFiche() {
    if (fichePending) return;
    fichePending = true;
    setTimeout(function () { fichePending = false; majFiche(); }, 0);
  }

  function majFiche() {
    if (!ctxFiche) return;
    if (!ficheOuverte()) { quitterFiche(); return; }
    // La fiche affiche une AUTRE activité (l'utilisateur a rebondi depuis
    // l'album ou une recommandation) : le contexte du lot est périmé, on le
    // rend au moteur historique plutôt que de recouvrir une fiche qu'on n'a
    // pas ouverte.
    if (String(window._openEventDetailId || "") !== ctxFiche.id) { quitterFiche(); return; }
    try { appliquerCtaFiche(); } catch (e) { fail("fiche_cta", e); }
  }

  function observerLaFiche() {
    var page = pageFiche();
    if (!page || observerFicheRef) return;
    observerFicheRef = new MutationObserver(function () { planifierFiche(); });
    // Deux cibles, un seul observateur : l'affichage de la page (fermeture) et
    // le contenu de la barre d'action (repeinte par le moteur historique).
    observerFicheRef.observe(page, { attributes: true, attributeFilter: ["style"] });
    var cta = document.getElementById("eventDetailCta");
    if (cta) observerFicheRef.observe(cta, { childList: true });
  }

  // Retour au Feed : on rend la position exacte de la carte tapée. La fiche est
  // un calque `position: fixed` qui ne démonte pas le fil, mais un rendu
  // survenu entre-temps peut l'avoir bougé.
  function quitterFiche() {
    ctxFiche = null;
    if (observerFicheRef) { observerFicheRef.disconnect(); observerFicheRef = null; }
    restituerAncre();
  }

  // Coupure décidée alors que la fiche est ouverte : la barre d'action doit
  // redevenir CELLE D'AVANT, sans rechargement. On laisse le moteur historique
  // se réafficher lui-même plutôt que de reconstruire son HTML ici.
  function restaurerFicheHistorique(id) {
    if (!id || !ficheOuverte()) return;
    if (String(window._openEventDetailId || "") !== String(id)) return;
    try {
      if (typeof openEventDetails === "function") {
        if (demoDemandee() && String(id) === DEMO_EVENT_ID) {
          avecDemoEvent(function () { openEventDetails(id); });
        } else {
          openEventDetails(id);
        }
      }
    } catch (e) { fail("fiche_restore", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVATION
  // ══════════════════════════════════════════════════════════════════════════

  // Délégation unique : les cartes du fil sont reconstruites en permanence, un
  // listener par bouton fuirait à chaque repeinte.
  function onDocumentClick(e) {
    if (!e.target || !e.target.closest) return;

    // UI-3B — « Voir l'activité » (carte du Feed) puis la fiche.
    var voir = e.target.closest("[data-v3-activity]");
    if (voir) {
      e.preventDefault();
      e.stopPropagation(); // le corps de la carte ouvre le post : ce lien, non.
      ouvrirActivite(voir.getAttribute("data-v3-activity"), voir.getAttribute("data-v3-post"));
      return;
    }
    var go = e.target.closest("[data-v3-rsvp-go]");
    if (go) { e.preventDefault(); e.stopPropagation(); participer(); return; }
    var rm = e.target.closest("[data-v3-rsvp-remove]");
    if (rm) { e.preventDefault(); e.stopPropagation(); retirerParticipation(); return; }

    // UI-3A — « Trouver une expérience ».
    var cta = e.target.closest("[data-v3-tempt]");
    if (!cta) return;
    e.preventDefault();
    e.stopPropagation();
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
      // La fiche ouverte par le lot redevient la fiche historique, barre
      // d'action comprise. On coupe le contexte AVANT de la repeindre, sinon
      // l'observateur la remettrait aussitôt dans l'état du lot.
      var ctx = ctxFiche;
      ctxFiche = null;
      if (observerFicheRef) { observerFicheRef.disconnect(); observerFicheRef = null; }
      if (ctx) restaurerFicheHistorique(ctx.id);
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
    assurerDemoFeed();
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
    DEMO_PREVIEW_NAME: DEMO_PREVIEW_NAME,
    isEnabled: uiV3Enabled,
    apply: apply,
    decorateFeed: decorateFeed,
    openSheet: openSheet,
    closeSheet: closeSheet,
    dismissHint: fermerAideContextuelle,
    // Lot UI-3B — surface de test et de diagnostic, sans effet de bord.
    eventRefOf: refEvenement,
    openActivity: ouvrirActivite,
    // Les trois moteurs de sortie vers le réel, exposés pour le lot UI-5
    // (§7 : les mêmes actions, depuis une bobine). Ce sont EXACTEMENT les
    // fonctions que la passerelle du Feed appelle : UI-5 n'en réécrit aucune,
    // et le marqueur « sans GPS imposé » reste posé au même endroit.
    seeActivities: voirActivites,
    discoverPeople: decouvrirPersonnes,
    proposeOuting: proposerSortie,
  };
})();
