// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V4 — lot UI-4B : fiche activité V2.
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §8 et §15,
// arbitrages de Benjamin du 2026-08-27 (issue #165).
//
// Mission unique de la page : en moins de dix secondes, répondre à
//   « Qu'est-ce qu'on va vivre ? Quand ? Où ? Avec qui ? Puis-je participer ? »
//
// La fiche historique contient DÉJÀ toutes les bonnes fonctions ; elle les
// présente comme une pile de boutons et de cartes. Ce module ne recrée aucun
// moteur : il RÉORGANISE ce que `openEventDetails` (app-07) vient de rendre —
// en DÉPLAÇANT les nœuds existants, jamais en les régénérant — puis ajoute une
// seule surface neuve, le bloc signature « Le rendez-vous », et remplace la
// barre d'action par une action primaire unique « Je participe ».
//
// Déplacer plutôt que réécrire n'est pas un détail de style : les `onclick`
// inline de la fiche (calendrier, invitation, check-in, QR, album, avis,
// commentaires, signalement) et les nœuds que des chargements asynchrones
// retrouvent par identifiant (`#eventAlbum`, `#eventCommentsList`,
// `#eventCommentInput`) survivent intacts à un `appendChild`. Ils ne
// survivraient pas à une reconstruction de chaîne HTML.
//
// ⚠️ AUCUNE fonction historique n'est supprimée. Tout élément que ce module ne
// sait pas classer part dans « Autres actions » : la fiche peut donc évoluer
// dans app-07 sans que rien ne disparaisse ici en silence.
//
// ⚠️ AUCUN effet de bord métier. Le module n'écrit ni en base, ni dans `state`,
// ni dans `localStorage`. La participation passe par `setEventRsvp` (moteur
// historique : places, liste d'attente, notification, écriture Supabase et
// lecture de son `{ error }` y sont déjà) et seulement après un geste explicite.
//
// ── Activation — ACTIF PAR DÉFAUT (2026-08-28) ────────────────────────────
//     localStorage.passio_ui_4b = "0"     → kill switch, prioritaire
//     window.PASSIO_UI_4B = false         → coupure immédiate en mémoire
//
// Mis en ligne sur l'URL normale par décision de Benjamin, en même temps que
// UI-4A0, UI-4A1 et UI-4A2. L'ancien lien `?passio_preview=passio-ui-4b` reste
// toléré mais ne décide plus rien.
//
// La DÉMONSTRATION, elle, reste strictement sur son propre lien :
//     ?passio_preview=passio-ui-4b-demo   → ouvre une activité fictive,
//                                           entièrement en mémoire
// Elle injecte une activité qui n'existe nulle part : elle n'a rien à faire
// dans l'application de tout le monde, et rien n'en est jamais écrit.
//
// Le module n'écrit RIEN dans `localStorage` : aucune activation ne persiste, et
// les deux coupures rendent la fiche historique sans rechargement.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var PREVIEW_NAME = "passio-ui-4b";
  var DEMO_PREVIEW_NAME = "passio-ui-4b-demo";
  var STORAGE_KEY = "passio_ui_4b";
  var ROOT_CLASS = "passio-ui-4b";
  var VERSION = "ui4b";

  // ── Vocabulaire arrêté par Benjamin le 2026-08-27 ─────────────────────────
  // Une action primaire, un état, un retrait secondaire. Ni « Peut-être », ni
  // « Je ne participe pas », ni bloc « Choisir ma participation » : les textes
  // à trois états de l'issue sont dépassés pour cette surface.
  var LIBELLE_RSVP = "Je participe";
  var LIBELLE_RSVP_FILE = "Rejoindre la liste d'attente";
  var LIBELLE_RSVP_FAIT = "✓ Tu participes";
  var LIBELLE_RSVP_ATTENTE = "Tu es sur la liste d'attente";
  // Formulé du point de vue de la personne (LOT-3, PCS-C03).
  var LIBELLE_RSVP_RETIRER = "Je ne peux plus venir";
  // Le retrait est inerte juste après une inscription : un second appui au même
  // endroit (double appui, doigt qui rebondit) ne doit pas désinscrire (IRL-C50).
  var RETRAIT_GARDE_MS = 1200;
  var _inscritA = 0;

  // ══════════════════════════════════════════════════════════════════════════
  // DRAPEAU
  // Ordre de priorité : coupure mémoire > kill switch local > aperçu > éteint.
  // Il n'existe volontairement AUCUNE valeur positive persistante : l'aperçu
  // vient de l'URL, jamais d'un état posé sur l'appareil du testeur.
  // ══════════════════════════════════════════════════════════════════════════
  function apercuDemande(nom) {
    try {
      return new URLSearchParams(window.location.search).get("passio_preview") === nom;
    } catch (e) { fail("query", e); return false; }
  }

  function demoDemandee() { return apercuDemande(DEMO_PREVIEW_NAME); }

  // ⚠️ ACTIF PAR DÉFAUT depuis la mise en ligne du 2026-08-28, décidée par
  // Benjamin. Le drapeau ne sait plus qu'ENLEVER : `PREVIEW_NAME` n'apparaît
  // plus dans cette fonction — l'ancien lien `?passio_preview=passio-ui-4b`
  // reste toléré mais ne décide plus rien.
  //
  // `demoDemandee()`, en revanche, garde tout son rôle : la DÉMONSTRATION
  // (`?passio_preview=passio-ui-4b-demo`) injecte une activité entièrement en
  // mémoire, qui n'a rien à faire dans l'application de tout le monde. Elle
  // reste donc strictement sur son lien, et elle seule.
  function uiV4bEnabled() {
    if (window.PASSIO_UI_4B === false) return false;   // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;                  // kill switch local
    return true;
  }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  // Un `catch` muet sur un chemin de décision masque un ReferenceError — le
  // défaut qui a coûté six jours de fil vide au projet. Tout échec est audible,
  // et strictement TECHNIQUE : ni titre, ni ville, ni identifiant de personne.
  function fail(ou, err) {
    var msg = "ui_v4b (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[ui-v4b] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "ui_v4b_fiche", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  // Métadonnées AUTORISÉES : version, identifiants d'étape, booléens de
  // présence. Aucun texte libre, aucun contenu, aucune donnée utilisateur.
  function track(name, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") {
        window.tel.action(name, meta || { v: VERSION });
      }
    } catch (e) {}
  }

  function notify(message) {
    if (typeof window.toast === "function") { window.toast(message); return; }
    if (window.console && console.warn) console.warn("[ui-v4b] " + message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVITÉ DE DÉMONSTRATION — mémoire seule
  // Elle sert à valider la COMPOSITION visuelle sans dépendre du contenu réel
  // d'un compte. Elle n'entre jamais dans `state` durablement, ni dans
  // `localStorage`, ni dans Supabase : elle est insérée dans le catalogue le
  // temps SYNCHRONE d'un appel au moteur historique, puis retirée.
  // ══════════════════════════════════════════════════════════════════════════
  var DEMO_EVENT_ID = "__passio_ui4b_demo_event";
  var demoEv = null;
  var demoRsvp = "";

  // Couverture LOCALE et volontaire : un dégradé violet → corail dessiné ici,
  // pas une image distante inventée. `data:image/svg+xml` est accepté par
  // `safeUrlAttr` et par la CSP de production (`img-src … data:`).
  function couvertureDemo(emoji) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560">'
      + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0%" stop-color="#3b1080"/>'
      + '<stop offset="55%" stop-color="#6d32f4"/>'
      + '<stop offset="100%" stop-color="#ff6b57"/>'
      + '</linearGradient></defs>'
      + '<rect width="900" height="560" fill="url(#g)"/>'
      + '<text x="450" y="360" font-size="220" text-anchor="middle">' + emoji + '</text>'
      + '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // Quelques visages du contenu de démonstration déjà présent dans l'app, pour
  // que « avec qui ? » soit lisible. Absents : le trombinoscope historique sait
  // déjà retomber sur un participant générique.
  function participantsDemo() {
    try {
      var us = (typeof state !== "undefined" && state.seed && state.seed.users) || [];
      return us.slice(0, 5).map(function (u) { return u.id; });
    } catch (e) { fail("demo_users", e); return []; }
  }

  function demoEvent() {
    if (demoEv) return demoEv;
    var d = new Date(Date.now() + 3 * 86400000);
    d.setHours(18, 30, 0, 0);
    demoEv = {
      id: DEMO_EVENT_ID,
      title: "Jam acoustique au coucher du soleil",
      passion: "musique",
      emoji: "🎸",
      eventType: "Jam session",
      organizerId: "u_lea",
      date: d.getTime(),
      time: "18:30",
      city: "Lyon",
      venue: "Café des Arts",
      price: 0,
      maxAttendees: 12,
      coverUrl: couvertureDemo("🎸"),
      attendees: participantsDemo(),
      maybes: [],
      waitlist: [],
      desc: "On installe deux guitares, un cajón et on joue ce qui vient. "
        + "Débutants bienvenus : personne ne compte les fausses notes.\n\n"
        + "Cette activité sert uniquement à valider l'interface UI-4B — elle n'existe dans aucune base.",
    };
    return demoEv;
  }

  function estDemo(id) { return demoDemandee() && String(id) === DEMO_EVENT_ID; }

  // Le moteur historique exige que l'activité soit dans son catalogue au moment
  // où il construit la fiche. On l'y place pendant cet appel SYNCHRONE, puis on
  // la retire dans le `finally` : rien ne survit dans `state`, et `saveState`
  // n'est jamais appelé entre les deux.
  function avecDemoEvent(run) {
    if (typeof state === "undefined" || !state.seed) return run();
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

  // Tout appel au moteur de rendu passe par ici : en démonstration il est
  // encadré par l'insertion temporaire, sinon il part tel quel.
  function rendreFiche(id) {
    if (typeof openEventDetails !== "function") {
      fail("fiche", "openEventDetails indisponible");
      return false;
    }
    try {
      if (estDemo(id)) avecDemoEvent(function () { openEventDetails(id); });
      else openEventDetails(id);
      return true;
    } catch (e) { fail("fiche_rendu", e); return false; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RÉEMPLOI DES MOTEURS EXISTANTS
  // Chaque helper délègue à la fonction du projet et renvoie une valeur neutre
  // quand elle n'est pas encore chargée. Les `typeof` restent nécessaires : ces
  // fonctions sont des liaisons lexicales des app-*.js, pas des propriétés de
  // `window`.
  // ══════════════════════════════════════════════════════════════════════════
  function trouverEvenement(id) {
    if (!id) return null;
    if (estDemo(id)) return demoEvent();
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
    if (estDemo(id)) return demoRsvp;
    try { if (typeof myRsvp === "function") return myRsvp(id) || ""; }
    catch (e) { fail("rsvp_etat", e); }
    return "";
  }

  function estAnnule(ev) {
    try { return typeof _eventIsCancelled === "function" ? !!_eventIsCancelled(ev) : false; }
    catch (e) { fail("etat_annule", e); return false; }
  }

  function estTermine(ev) {
    try { return typeof _eventIsOver === "function" ? !!_eventIsOver(ev) : false; }
    catch (e) { fail("etat_termine", e); return false; }
  }

  // Nombre d'inscrits d'un état (`going`, `waitlist`, `maybe`). ⚠️ LA LISTE
  // N'EST PLUS LE COMPTEUR (C-04, 2026-11-03) : depuis
  // `migration_participants_visibilite_2026-11-03.sql`, un tiers ne lit qu'une
  // partie de `attendees` / `waitlist` — le nombre public vient de la RPC
  // `participants_compte` (`ev.counts`), et `_nbInscrits` (app-07) est la seule
  // autorité qui réconcilie les deux. Mesuré au faux serveur : 5 inscrits, le
  // bloc « Le rendez-vous » disait « 1 participant ». Repli sur la liste si le
  // moteur manque (l'activité de démonstration n'a pas de compteur).
  function nbInscrits(ev, etat) {
    try { if (typeof _nbInscrits === "function") return _nbInscrits(ev, etat); }
    catch (e) { fail("nb_inscrits", e); }
    if (!ev) return 0;
    var liste = etat === "waitlist" ? ev.waitlist : etat === "maybe" ? ev.maybes : ev.attendees;
    return (liste || []).length;
  }

  // Places restantes : `null` = illimité. Même calcul que le moteur historique,
  // délégué quand il est chargé.
  function placesRestantes(ev) {
    try {
      if (typeof _eventSpotsLeft === "function") return _eventSpotsLeft(ev);
    } catch (e) { fail("places", e); }
    if (!ev || !ev.maxAttendees) return null;
    return Math.max(0, ev.maxAttendees - nbInscrits(ev, "going"));
  }

  function estComplet(ev) {
    var r = placesRestantes(ev);
    return r !== null && r <= 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BLOC SIGNATURE « LE RENDEZ-VOUS »
  // La seule surface RÉELLEMENT neuve du lot. Elle répond d'un coup d'œil à
  // « quand ? où ? avec qui ? puis-je entrer ? ».
  //
  // Vie privée : uniquement la ville / zone PUBLIQUE. L'adresse exacte et le
  // téléphone restent là où le moteur historique les a mis — dans les infos
  // pratiques, plus bas — et ne sont jamais élevés au premier niveau. Ce module
  // n'ajoute aucune donnée que la fiche historique ne montrait pas déjà, et
  // n'invente aucune protection côté client.
  // ══════════════════════════════════════════════════════════════════════════
  function texteDate(ev) {
    try {
      return new Date(ev.date).toLocaleDateString("fr-FR",
        { weekday: "long", day: "numeric", month: "long" });
    } catch (e) { fail("date", e); return ""; }
  }

  function texteHeure(ev) {
    try { if (typeof _eventTimeLabel === "function") return _eventTimeLabel(ev); }
    catch (e) { fail("heure", e); }
    return "";
  }

  // Participants AGRÉGÉS : un compte, l'état des places, la file d'attente.
  // Les visages individuels restent dans la section Participants, plus bas.
  // 2026-11-27 — trois cas où l'on ne compte pas :
  //  · EXEMPLE (sujet 200) : les mêmes mots que la carte, pas de faux participants ;
  //  · inscrits INCONNUS (sujet 197) : visiteur ou lecture en échec — « 0
  //    participant · 3 places restantes » sur une activité complète ;
  //  · ANNULÉE ou TERMINÉE (sujet 204) : plus de places à prendre.
  function texteParticipation(ev) {
    if (estExemple(ev)) return "Activité d'exemple · pas d'inscription";
    try {
      if (typeof _inscritsInconnus === "function" && _inscritsInconnus(ev)) return _texteInscritsInconnus(ev);
    } catch (e) { fail("inscrits_inconnus", e); }
    var n = nbInscrits(ev, "going");
    var bouts = [n + " participant" + (n > 1 ? "s" : "")];
    var fini = estAnnule(ev) || estTermine(ev);
    var reste = fini ? null : placesRestantes(ev);
    if (reste !== null) {
      bouts.push(reste <= 0 ? "complet"
        : reste + " place" + (reste > 1 ? "s" : "") + " restante" + (reste > 1 ? "s" : ""));
    }
    var att = fini ? 0 : nbInscrits(ev, "waitlist");
    if (att) bouts.push(att + " en liste d'attente");
    return bouts.join(" · ");
  }

  function ligneRdv(classe, texte) {
    var el = document.createElement("div");
    el.className = classe;
    el.textContent = texte;
    return el;
  }

  function construireRendezVous(ev) {
    var carte = document.createElement("div");
    carte.className = "v4b-rdv";

    // Tuile de date corail. `aria-hidden` : la date complète est lue juste à
    // côté, la faire lire deux fois par un lecteur d'écran n'apprend rien.
    var tuile = document.createElement("div");
    tuile.className = "v4b-rdv-tuile";
    tuile.setAttribute("aria-hidden", "true");
    try {
      var d = new Date(ev.date);
      var jour = document.createElement("span");
      jour.className = "v4b-rdv-jour";
      jour.textContent = String(d.getDate());
      var mois = document.createElement("span");
      mois.className = "v4b-rdv-mois";
      mois.textContent = d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
      tuile.appendChild(jour);
      tuile.appendChild(mois);
    } catch (e) { fail("tuile", e); }

    var corps = document.createElement("div");
    corps.className = "v4b-rdv-corps";

    var quand = [texteDate(ev), texteHeure(ev)].filter(Boolean).join(" · ");
    if (quand) corps.appendChild(ligneRdv("v4b-rdv-quand", quand));
    // Ville ou zone publique seulement — et rien du tout si l'activité n'en
    // porte pas : inventer un lieu serait pire que ne rien dire.
    if (ev.city) corps.appendChild(ligneRdv("v4b-rdv-ou", String(ev.city)));
    corps.appendChild(ligneRdv("v4b-rdv-places", texteParticipation(ev)));

    carte.appendChild(tuile);
    carte.appendChild(corps);
    return carte;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RÉORGANISATION DE LA FICHE
  // Les nœuds rendus par `openEventDetails` sont CLASSÉS puis DÉPLACÉS dans des
  // sections ordonnées. Rien n'est régénéré, rien n'est supprimé : un élément
  // non reconnu tombe dans « Autres actions ».
  // ══════════════════════════════════════════════════════════════════════════
  var SECTIONS = [
    { key: "rendezvous", titre: "Le rendez-vous" },
    { key: "organisateur" },
    { key: "description" },
    { key: "infos", titre: "Infos pratiques" },
    { key: "participants" },
    { key: "discussion" },
    { key: "contexte" },
    { key: "echanges", titre: "Échanges" },
    { key: "secondaire", titre: "Autres actions" },
  ];

  // Rôle → (section, poids dans la section). Le poids sert à ordonner les
  // moments à l'intérieur d'une même surface : sur place → souvenir → avis →
  // album, tels que Benjamin les a listés.
  var ROLES = {
    statut:       { sec: "rendezvous",   poids: 0 },
    organisateur: { sec: "organisateur", poids: 0 },
    description:  { sec: "description",  poids: 0 },
    infos:        { sec: "infos",        poids: 0 },
    preuve:       { sec: "participants", poids: 0 },
    participants: { sec: "participants", poids: 1 },
    discussion:   { sec: "discussion",   poids: 0 },
    surplace:     { sec: "contexte",     poids: 0 },
    souvenir:     { sec: "contexte",     poids: 1 },
    avis:         { sec: "contexte",     poids: 2 },
    album:        { sec: "contexte",     poids: 3 },
    echanges:     { sec: "echanges",     poids: 0 },
    pratique:     { sec: "secondaire",   poids: 0 },
    secondaire:   { sec: "secondaire",   poids: 1 },
    autres:       { sec: "secondaire",   poids: 2 },
  };

  // Les `onclick` inline de la fiche sont le signalement le plus stable de ce
  // qu'un bouton FAIT — plus stable que son libellé, qui peut être retouché.
  var PAR_HANDLER = [
    [/openEventChat/, "discussion"],
    [/checkInEvent|openCheckinCodeEntry|openEventCheckinQr/, "surplace"],
    [/startTripFromEvent|shareEventExperience/, "souvenir"],
    [/openEventFeedback/, "avis"],
    [/reportEvent/, "secondaire"],
    [/downloadEventIcs|openEventInvite|openEventManage|shareEvent\(/, "pratique"],
  ];

  function handlersDe(el) {
    var out = [];
    try {
      if (el.getAttribute && el.getAttribute("onclick")) out.push(el.getAttribute("onclick"));
      var kids = el.querySelectorAll ? el.querySelectorAll("[onclick]") : [];
      for (var i = 0; i < kids.length; i++) out.push(kids[i].getAttribute("onclick"));
    } catch (e) { fail("handlers", e); }
    return out.join(" ");
  }

  function roleDe(el) {
    if (!el || el.nodeType !== 1) return null;
    var cl = el.classList;
    // Classes et identifiants d'abord : ils identifient le CONTENU, alors qu'un
    // `onclick` de descendant identifierait seulement une action interne (un
    // trombinoscope contient des `openUserProfile`).
    if (cl.contains("event-detail-urgency")) return "statut";
    if (cl.contains("event-social-proof")) return "preuve";
    if (cl.contains("event-detail-organizer")) return "organisateur";
    if (cl.contains("event-detail-desc")) return "description";
    if (cl.contains("event-detail-info-card") || cl.contains("event-detail-recurrence")) return "infos";
    if (cl.contains("event-detail-participants")) return "participants";
    if (cl.contains("event-recap-cta")) return "souvenir";
    if (cl.contains("event-feedback-prompt") || cl.contains("event-feedback-done") || cl.contains("event-feedback-retours")) return "avis";
    if (cl.contains("post-actions")) return "echanges";
    if (el.id === "eventAlbum") return "album";
    if (el.id === "eventCommentsList") return "echanges";
    if (el.hasAttribute && el.hasAttribute("data-evrating")) return "avis";
    try { if (el.querySelector && el.querySelector("#eventCommentInput")) return "echanges"; }
    catch (e) { fail("role_composeur", e); }

    var h = handlersDe(el);
    for (var i = 0; i < PAR_HANDLER.length; i++) {
      if (PAR_HANDLER[i][0].test(h)) return PAR_HANDLER[i][1];
    }
    return null;
  }

  // Un titre de section historique appartient à ce qui le SUIT. On regarde donc
  // devant plutôt que de se fier à son texte français, qui peut changer.
  function roleDuTitre(enfants, depuis) {
    for (var i = depuis + 1; i < enfants.length; i++) {
      var el = enfants[i];
      if (el.classList && el.classList.contains("event-detail-section-title")) return null;
      var r = roleDe(el);
      if (r) return r;
    }
    return null;
  }

  function classer(content) {
    var enfants = Array.prototype.slice.call(content.children);
    var seaux = {};
    SECTIONS.forEach(function (s) { seaux[s.key] = []; });

    // Un élément que le classement ne reconnaît pas HÉRITE du titre sous lequel
    // il se trouve : la ligne « Plus que 2 places » n'a ni classe ni handler,
    // mais elle appartient visiblement à « Participants ». Sans cet héritage
    // elle partait en « Autres actions », loin de ce qu'elle commente.
    var titreRole = null;

    enfants.forEach(function (el, i) {
      var role;
      if (el.classList && el.classList.contains("event-detail-section-title")) {
        titreRole = roleDuTitre(enfants, i);
        role = titreRole || "autres";
      } else {
        role = roleDe(el) || titreRole || "autres";
      }
      var cible = ROLES[role] || ROLES.autres;
      seaux[cible.sec].push({ el: el, poids: cible.poids, rang: i });
    });

    // Tri STABLE : le poids ordonne les moments, le rang d'origine préserve
    // l'ordre du moteur à poids égal (un titre reste collé à son contenu).
    Object.keys(seaux).forEach(function (k) {
      seaux[k].sort(function (a, b) { return (a.poids - b.poids) || (a.rang - b.rang); });
    });
    return seaux;
  }

  function construireSection(def, entrees, extra) {
    if (!entrees.length && !extra) return null;
    var sec = document.createElement("section");
    sec.className = "v4b-sec";
    sec.setAttribute("data-v4b-sec", def.key);
    if (def.titre) {
      var h = document.createElement("h3");
      h.className = "v4b-sec-titre";
      h.textContent = def.titre;
      sec.appendChild(h);
    }
    entrees.forEach(function (e) { sec.appendChild(e.el); });
    if (extra) sec.appendChild(extra);
    return sec;
  }

  // Le corps est-il déjà dans sa forme V2 ? C'est le seul signal fiable : le
  // moteur historique repeint `#eventDetailContent` en entier à chaque ouverture
  // et à chaque changement de participation, ce qui efface notre racine.
  function dejaReorganise(content) {
    var p = content.firstElementChild;
    return !!p && p.classList && p.classList.contains("v4b-fiche");
  }

  function reorganiser() {
    var content = document.getElementById("eventDetailContent");
    if (!content || dejaReorganise(content) || !content.children.length) return false;
    var ev = evenementCourant();
    if (!ev) return false;                 // activité inconnue : fiche historique

    var seaux = classer(content);
    var racine = document.createElement("div");
    racine.className = "v4b-fiche";
    racine.setAttribute("data-v4b-fiche", "1");

    SECTIONS.forEach(function (def) {
      var extra = def.key === "rendezvous" ? construireRendezVous(ev) : null;
      var sec = construireSection(def, seaux[def.key], extra);
      if (sec) racine.appendChild(sec);
    });

    // Les enfants d'origine ont TOUS été déplacés dans une section : ce qui
    // reste ici est vide. On ne vide donc rien « à l'aveugle ».
    content.appendChild(racine);
    marquerHero();
    return true;
  }

  // Retour et partage : mêmes boutons, mêmes handlers, mais en icônes sobres
  // posées sur la photo (le CSS s'en charge). On garantit ici le nom accessible,
  // que le libellé visible ne portera plus. Idempotent, et sans conséquence si
  // la classe racine disparaît : « Retour » reste exact.
  function marquerHero() {
    try {
      var back = document.querySelector("#eventDetailPage .event-detail-back:not(#eventDetailShareBtn)");
      if (back && !back.getAttribute("aria-label")) back.setAttribute("aria-label", "Retour");
    } catch (e) { fail("hero", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTION PRIMAIRE UNIQUE
  // Une activité annulée ou terminée n'est JAMAIS recouverte : la barre
  // historique y dit déjà la bonne chose (« Événement annulé », « Partager mon
  // expérience »), et poser « Je participe » par-dessus serait mensonger.
  // ══════════════════════════════════════════════════════════════════════════
  function appliquerCta() {
    var ev = evenementCourant();
    if (!ev) return false;
    var cta = document.getElementById("eventDetailCta");
    if (!cta) return false;
    if (estAnnule(ev) || estTermine(ev)) return false;

    var etat = etatRsvp(ev.id);
    var complet = estComplet(ev);
    // 2026-11-27 : « je participe » est une DEMANDE tant que l'organisation ne l'a
    // pas validée — le pied le dit (« Demande envoyée » / « Participation
    // confirmée »), avec les mêmes mots que la carte (`_etatParticipationAffiche`).
    var vu = etatAffiche(ev);
    // LOT-19 (audit UX/UI du 2026-11-10) : deux états que le pied confondait
    // avec celui d'une participante ordinaire — l'ORGANISATION (IRL-C53 : elle
    // voyait « ✓ Je participe / Retirer ma participation » sur sa propre
    // activité) et l'EXEMPLE (IRL-C66 : bouton actif, refus seulement après).
    var orga = estOrganisation(ev);
    var exemple = !orga && estExemple(ev);
    var pointer = !orga && !exemple && etat === "going" && peutPointer(ev);
    var refuse = !orga && !exemple && !etat && demandeRefusee(ev);
    var sig = (etat || "none") + (vu ? "|" + vu : "") + (complet ? "|full" : "") + (orga ? "|orga:" + nbInscrits(ev, "going") : "") + (exemple ? "|exemple" : "") + (pointer ? "|pointer" : "") + (refuse ? "|refuse" + signatureRedemande(ev) : "");
    // ⚠️ Le marqueur vit sur le nœud INJECTÉ, jamais sur `#eventDetailCta` : le
    // moteur historique repeint la barre par `innerHTML`, ce qui efface les
    // enfants mais conserve les attributs de l'hôte. Un marqueur posé sur l'hôte
    // aurait donc annoncé « déjà à jour » sur une barre redevenue historique.
    var box = cta.querySelector("[data-v4b-rsvp]");
    if (box && box.getAttribute("data-v4b-rsvp") === sig) return false;

    cta.innerHTML = "";
    cta.appendChild(orga ? construireCtaOrga(sig, ev) : exemple ? construireCtaExemple(sig) : refuse ? construireCtaRefus(sig, ev) : construireCta(sig, etat, complet, vu, pointer));
    return true;
  }

  // ⚠️ UNE DEMANDE REFUSÉE A UN ÉTAT (2026-11-28, sujet 212). Le bandeau « Ta
  // demande n'a pas été acceptée » surmontait un pied « Je participe » identique
  // à celui d'une première fois : un appui renvoyait une demande — et une
  // notification à l'organisation —, sans que la personne sache si redemander
  // était permis ou vain, autant de fois qu'elle le voulait. La base admet la
  // redemande (la réinscription clôt le refus) : elle reste possible, mais comme
  // un geste EXPLICITE, confirmé, sous un état qui dit le refus.
  // 2026-11-28 : la base la BORNE (`inscription_gardee`) — une seule redemande,
  // 24 h après le refus, aucune après deux. Quand elle est fermée (lu par
  // `etat_redemande_sortie`, ou appris d'un refus), le bouton cède la place à la
  // phrase qui dit pourquoi, et jusqu'à quand.
  function redemandeFermee(ev) {
    try {
      var v = typeof _vueRefusSortie !== "undefined" ? _vueRefusSortie : null;
      return v && v.id === ev.id && v.redemande && v.redemande.motif ? v.redemande : null;
    } catch (e) { fail("etat_redemande", e); return null; }
  }

  function signatureRedemande(ev) {
    var r = redemandeFermee(ev);
    return r ? ":" + r.motif + ":" + (r.possibleLe || "") : "";
  }

  function demandeRefusee(ev) {
    try {
      return typeof _vueRefusSortie !== "undefined" && !!_vueRefusSortie
        && _vueRefusSortie.id === ev.id && (_vueRefusSortie.refuse === true || !!redemandeFermee(ev));
    } catch (e) { fail("etat_refus", e); return false; }
  }

  function construireCtaRefus(sig, ev) {
    var box = document.createElement("div");
    box.className = "v4b-rsvp v4b-rsvp-refus";
    box.setAttribute("data-v4b-rsvp", sig);
    var st = document.createElement("div");
    st.className = "v4b-rsvp-etat";
    st.setAttribute("role", "status");
    st.setAttribute("data-v4b-rsvp-refus", "1");
    st.textContent = "Demande non acceptée";
    box.appendChild(st);
    var d = document.createElement("div");
    d.className = "v4b-rsvp-detail";
    var fermee = ev ? redemandeFermee(ev) : null;
    if (fermee) {
      var phrase = "";
      try { if (typeof _phraseRedemande === "function") phrase = _phraseRedemande(fermee, false); } catch (e) { fail("phrase_redemande", e); }
      d.textContent = "L'organisation n'a pas retenu ta demande. " + (phrase || "Tu ne peux pas redemander pour l'instant.");
      d.setAttribute("data-v4b-rsvp-redemande-fermee", fermee.motif);
      box.appendChild(d);
      return box;
    }
    d.textContent = "L'organisation n'a pas retenu ta demande. Tu peux redemander une fois si quelque chose a changé : elle sera de nouveau prévenue.";
    box.appendChild(d);
    var re = document.createElement("button");
    re.type = "button";
    re.className = "btn ghost block v4b-rsvp-redemander";
    re.setAttribute("data-v4b-rsvp-redemander", "1");
    re.textContent = "Redemander à participer";
    box.appendChild(re);
    return box;
  }

  function redemander() {
    var ev = evenementCourant();
    if (!ev || typeof confirmerAction !== "function") return;
    var id = ev.id;
    confirmerAction({ titre: "Redemander à participer ?", texte: "Ta première demande n'a pas été acceptée. L'organisation recevra une nouvelle demande — c'est la seule redemande possible pour cette activité.",
      libelle: "Redemander", annuler: "Ne pas redemander", danger: false }).then(function (oui) {
      var actuel = evenementCourant();
      // La fiche a pu changer pendant la question : on ne redemande que pour CELLE-CI.
      if (!oui || !actuel || actuel.id !== id) return;
      track("ui_v4b_rsvp_redemander", { v: VERSION });
      _inscritA = Date.now();
      participer();
    }, function (e) { fail("rsvp_redemander", e); });
  }

  // 2026-11-27 (ergonomie e) : PENDANT l'activité (de 1 h avant à la fin), l'action
  // du moment est de pointer son arrivée — elle était enfouie au milieu de la
  // fiche. Mêmes conditions que le bouton du corps (fenêtre de pointage, pas déjà
  // pointé) ; le moteur `checkInEvent` reste seul juge (position ou code, base).
  function peutPointer(ev) {
    try {
      return typeof _canCheckIn === "function" && typeof _hasCheckedIn === "function"
        && typeof checkInEvent === "function" && !estDemo(ev.id) && _canCheckIn(ev) && !_hasCheckedIn(ev);
    } catch (e) { fail("etat_pointer", e); return false; }
  }

  function estOrganisation(ev) {
    try { return typeof _canManageEvent === "function" && !estDemo(ev.id) && !!_canManageEvent(ev); }
    catch (e) { fail("etat_orga", e); return false; }
  }

  function estExemple(ev) {
    try { return !!(window.PassioFirstRun && typeof PassioFirstRun.masquerChiffresDemo === "function" && PassioFirstRun.masquerChiffresDemo(ev)); }
    catch (e) { fail("etat_exemple", e); return false; }
  }

  // IRL-C53 : l'organisation n'a pas à « participer » à sa propre activité ni à
  // pouvoir s'en retirer d'un geste — son pied dit qu'elle organise, combien
  // viennent, et mène à ses deux gestes : écrire aux participants, gérer.
  function construireCtaOrga(sig, ev) {
    var box = document.createElement("div");
    box.className = "v4b-rsvp v4b-rsvp-inscrit v4b-rsvp-orga";
    box.setAttribute("data-v4b-rsvp", sig);
    var st = document.createElement("div");
    st.className = "v4b-rsvp-etat";
    st.setAttribute("role", "status");
    var n = nbInscrits(ev, "going");
    st.textContent = "Tu organises · " + n + " participant" + (n > 1 ? "s" : "");
    box.appendChild(st);
    var suite = document.createElement("div");
    suite.className = "v4b-rsvp-suite";
    var chat = document.createElement("button");
    chat.type = "button";
    chat.className = "btn primary v4b-rsvp-chat";
    chat.setAttribute("data-v4b-rsvp-chat", "1");
    chat.textContent = "Écrire aux participants";
    suite.appendChild(chat);
    var gerer = document.createElement("button");
    gerer.type = "button";
    gerer.className = "btn ghost v4b-rsvp-gerer";
    gerer.setAttribute("data-v4b-rsvp-gerer", "1");
    gerer.textContent = "Gérer l'activité";
    suite.appendChild(gerer);
    box.appendChild(suite);
    return box;
  }

  // IRL-C66 : une activité d'exemple le dit AVANT le geste ; le pied est neutre.
  function construireCtaExemple(sig) {
    var box = document.createElement("div");
    box.className = "v4b-rsvp v4b-rsvp-exemple";
    box.setAttribute("data-v4b-rsvp", sig);
    var st = document.createElement("div");
    st.className = "v4b-rsvp-etat";
    st.setAttribute("role", "status");
    st.textContent = "Exemple — participation désactivée";
    box.appendChild(st);
    var d = document.createElement("div");
    d.className = "v4b-rsvp-detail";
    d.textContent = "Cette activité montre ce qui se partage sur PASSIO ; elle n'a pas lieu.";
    box.appendChild(d);
    return box;
  }

  function etatAffiche(ev) {
    if (estDemo(ev.id)) return demoRsvp === "going" ? "confirmee" : demoRsvp === "waitlist" ? "attente" : "";
    try { if (typeof _etatParticipationAffiche === "function") return _etatParticipationAffiche(ev) || ""; }
    catch (e) { fail("etat_affiche", e); }
    return "";
  }

  function libelleEtat(vu, etat) {
    try {
      if (typeof LIBELLES_PARTICIPATION !== "undefined" && LIBELLES_PARTICIPATION[vu]) return LIBELLES_PARTICIPATION[vu];
    } catch (e) { fail("libelle_etat", e); }
    return etat === "going" ? LIBELLE_RSVP_FAIT : LIBELLE_RSVP_ATTENTE;
  }

  function construireCta(sig, etat, complet, vu, pointer) {
    var box = document.createElement("div");
    box.className = "v4b-rsvp";
    box.setAttribute("data-v4b-rsvp", sig);

    // Participation confirmée (ou file d'attente) : un ÉTAT lisible, pas un
    // bouton qui bascule — un tap malheureux ne doit pas désinscrire.
    // ⚠️ LOT-3 (audit UX/UI du 2026-11-10, PCS-C03, IRL-C50) : l'état « inscrit »
    // ressemblait à un bouton inactif, ne disait ni la date ni la suite, et posait
    // « Retirer ma participation » EXACTEMENT sous le doigt qui venait de
    // s'inscrire (mesuré : un second appui à 0,5 s désinscrivait). Désormais :
    // une confirmation qui dit quand ; à la place du bouton, l'ÉTAPE SUIVANTE
    // (écrire aux participants — fonction existante, `openEventChat`) ; le retrait
    // à l'écart, et inerte pendant RETRAIT_GARDE_MS après l'inscription.
    if (etat === "going" || etat === "waitlist") {
      box.classList.add("v4b-rsvp-inscrit");
      // 2026-11-27 (revue visuelle) : demande, place validée et liste d'attente
      // avaient le MÊME pied vert. Une classe par état ; la couleur suit (styles.css).
      box.classList.add("v4b-etat-" + (etat === "waitlist" ? "attente" : (vu || "confirmee")));
      var st = document.createElement("div");
      st.className = "v4b-rsvp-etat";
      st.setAttribute("data-v4b-rsvp-etat", etat);
      st.setAttribute("role", "status");
      if (vu) st.setAttribute("data-v4b-participation", vu);
      st.textContent = libelleEtat(vu, etat);
      box.appendChild(st);
      var ev = evenementCourant();
      var detail = document.createElement("div");
      detail.className = "v4b-rsvp-detail";
      // IRL-C55 : annoncer la notification et la validation sans afficher de rang.
      var quand = ev ? texteDate(ev) + (texteHeure(ev) ? " · " + texteHeure(ev) : "") : "";
      detail.textContent = etat !== "going" ? RSVP_LABELS.waitlist.detail
        : vu === "demande" ? (quand ? quand + " — " : "") + "en attente de validation par l'organisation."
        : (quand ? quand + " — tu es attendu·e." : "");
      if (detail.textContent) box.appendChild(detail);
      // Le pied est fixé en BAS et grandit vers le haut : l'élément du bas prend
      // la place de l'ancien bouton. Le retrait passe donc AU-DESSUS de la suite —
      // sous le doigt qui vient de s'inscrire, c'est « Écrire aux participants ».
      var rmInscrit = construireRetrait();
      if (etat === "waitlist") rmInscrit.textContent = "Quitter la liste d'attente";
      box.appendChild(rmInscrit);
      if (etat === "going" && pointer) {
        var suiteP = document.createElement("div");
        suiteP.className = "v4b-rsvp-suite v4b-rsvp-suite-pointer";
        var pt = document.createElement("button");
        pt.type = "button";
        pt.className = "btn primary v4b-rsvp-pointer";
        pt.setAttribute("data-v4b-rsvp-pointer", "1");
        pt.textContent = "Je suis arrivé·e";
        suiteP.appendChild(pt);
        var chatP = document.createElement("button");
        chatP.type = "button";
        chatP.className = "btn ghost v4b-rsvp-chat";
        chatP.setAttribute("data-v4b-rsvp-chat", "1");
        chatP.textContent = "Écrire aux participants";
        suiteP.appendChild(chatP);
        box.appendChild(suiteP);
      } else if (etat === "going") {
        var suite = document.createElement("div");
        suite.className = "v4b-rsvp-suite";
        var chat = document.createElement("button");
        chat.type = "button";
        chat.className = "btn primary v4b-rsvp-chat";
        chat.setAttribute("data-v4b-rsvp-chat", "1");
        chat.textContent = "Écrire aux participants";
        suite.appendChild(chat);
        var inv = document.createElement("button");
        inv.type = "button";
        inv.className = "btn ghost v4b-rsvp-inviter";
        inv.setAttribute("data-v4b-rsvp-inviter", "1");
        inv.textContent = "Inviter quelqu'un";
        suite.appendChild(inv);
        box.appendChild(suite);
      }
      return box;
    }

    var go = document.createElement("button");
    go.type = "button";
    go.className = "btn primary block v4b-rsvp-go";
    go.setAttribute("data-v4b-rsvp-go", "1");
    // Complet : le moteur historique bascule lui-même en liste d'attente. Le
    // libellé le DIT avant le geste plutôt que de le découvrir après coup.
    go.textContent = complet ? LIBELLE_RSVP_FILE : LIBELLE_RSVP;
    box.appendChild(go);
    // Une réponse posée AILLEURS (feuille historique à trois états) reste
    // retirable ici, sans que cette surface la nomme ni la propose.
    if (etat) box.appendChild(construireRetrait());
    return box;
  }

  // 2026-11-23 (Benjamin) : l'organisation voyait DEUX « Écrire aux
  // participants » (le pied + « Discussion des participants » du corps) et DEUX
  // « Gérer » (le pied + celui de « Autres actions »). Le pied gagne : un bouton
  // du corps dont le pied porte le même geste est MASQUÉ, jamais retiré — il
  // revient dès que le pied ne le porte plus (activité terminée, retrait de la
  // participation, coupure du lot). Reconnu par son handler, pas son libellé.
  var DOUBLONS_DU_PIED = [
    { pied: "[data-v4b-rsvp-chat]", corps: /^\s*openEventChat\(/ },
    { pied: "[data-v4b-rsvp-gerer]", corps: /^\s*openEventManage\(/ },
    { pied: "[data-v4b-rsvp-pointer]", corps: /^\s*checkInEvent\(/ },
  ];
  function masquerDoublonsDuPied() {
    var content = document.getElementById("eventDetailContent");
    if (!content) return;
    var cta = document.getElementById("eventDetailCta");
    var boutons = content.querySelectorAll("button[onclick]");
    DOUBLONS_DU_PIED.forEach(function (d) {
      var auPied = !!(cta && cta.querySelector(d.pied));
      for (var i = 0; i < boutons.length; i++) {
        var b = boutons[i];
        if (!d.corps.test(b.getAttribute("onclick") || "")) continue;
        if (auPied) { b.style.display = "none"; b.setAttribute("data-v4b-doublon", "1"); }
        else if (b.getAttribute("data-v4b-doublon")) { b.style.display = ""; b.removeAttribute("data-v4b-doublon"); }
      }
    });
    // Une section dont il ne reste que des doublons masqués (« discussion » n'a
    // que ce bouton) se masque avec eux : vide, elle gardait sa marge (44 px de
    // blanc au lieu de 22 entre « Participants » et la suite).
    var secs = content.querySelectorAll(".v4b-sec");
    for (var j = 0; j < secs.length; j++) {
      var s = secs[j];
      var vide = s.children.length > 0 && Array.prototype.every.call(s.children, function (c) {
        return c.hasAttribute("data-v4b-doublon");
      });
      if (vide) { s.style.display = "none"; s.setAttribute("data-v4b-sec-vide", "1"); }
      else if (s.getAttribute("data-v4b-sec-vide")) { s.style.display = ""; s.removeAttribute("data-v4b-sec-vide"); }
    }
  }

  // 2026-11-27 (ergonomie a) : l'organisation voit EN TÊTE de sa fiche les
  // demandes de participation qui attendent sa réponse. Le nombre est celui de la
  // base (`demandesAValider`, app-07) ; tant qu'il n'est pas connu, rien.
  function peindreDemandes() {
    var racine = document.querySelector("#eventDetailContent > .v4b-fiche");
    if (!racine) return;
    var ev = evenementCourant();
    var b = racine.querySelector(":scope > [data-v4b-demandes]");
    var n = null;
    if (ev && estOrganisation(ev) && typeof demandesAValider === "function") {
      n = demandesAValider(ev.id);
      try { if (typeof rafraichirDemandesAValider === "function") rafraichirDemandesAValider(ev.id); } catch (e) { fail("demandes_lire", e); }
    }
    if (!(n > 0)) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.className = "btn primary block v4b-demandes";
      b.setAttribute("data-v4b-demandes", "1");
      racine.insertBefore(b, racine.firstChild);
    }
    var texte = typeof texteDemandesAValider === "function" ? texteDemandesAValider(n) : n + " à valider";
    if (b.textContent !== texte) b.textContent = texte;
  }

  function construireRetrait() {
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "v4b-rsvp-retirer";
    rm.setAttribute("data-v4b-rsvp-remove", "1");
    rm.textContent = LIBELLE_RSVP_RETIRER;
    return rm;
  }

  // Geste EXPLICITE, et lui seul, déclenche l'écriture. `setEventRsvp` reste le
  // seul moteur : il gère les places, la file d'attente, la notification de
  // l'organisateur, l'écriture Supabase et la lecture de son `{ error }`.
  function participer() {
    var ev = evenementCourant();
    if (!ev) return false;
    if (estDemo(ev.id)) return demoParticipation("going");
    if (typeof setEventRsvp !== "function") {
      fail("rsvp", "setEventRsvp indisponible");
      notify("La participation n'est pas disponible ici.");
      return false;
    }
    track("ui_v4b_rsvp_go", { v: VERSION, from: etatRsvp(ev.id) || "none", full: estComplet(ev) });
    try {
      var r = setEventRsvp(ev.id, "going");
      if (r && typeof r.catch === "function") r.catch(function (e) { fail("rsvp_go", e); });
    } catch (e) { fail("rsvp_go", e); return false; }
    return true;
  }

  function retirerParticipation() {
    var ev = evenementCourant();
    if (!ev) return false;
    if (estDemo(ev.id)) return demoParticipation("");
    if (typeof setEventRsvp !== "function") return false;
    track("ui_v4b_rsvp_remove", { v: VERSION, from: etatRsvp(ev.id) || "none" });
    try {
      var r = setEventRsvp(ev.id, null);
      if (r && typeof r.catch === "function") r.catch(function (e) { fail("rsvp_remove", e); });
    } catch (e) { fail("rsvp_remove", e); return false; }
    return true;
  }

  // En démonstration, `setEventRsvp` n'est jamais appelé : l'activité n'est pas
  // dans `state`, il n'y a donc RIEN à écrire — et surtout rien qui pourrait
  // fuir vers Supabase. L'état vit dans ce module et disparaît au rechargement.
  function demoParticipation(etat) {
    var ev = demoEvent();
    // « me » est l'identifiant que le trombinoscope historique sait rendre avec
    // le profil actif — aucun compte n'est créé, aucune donnée n'est écrite.
    var moi = "me";
    demoRsvp = etat;
    ev.attendees = (ev.attendees || []).filter(function (x) { return x !== moi; });
    if (etat === "going") ev.attendees.push(moi);
    track(etat ? "ui_v4b_demo_rsvp_go" : "ui_v4b_demo_rsvp_remove", { v: VERSION });
    // La fiche entière est repeinte pour que le bloc « Le rendez-vous » et le
    // trombinoscope suivent — exactement ce que le moteur ferait en vrai.
    rendreFiche(ev.id);
    planifier();
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CYCLE DE VIE
  // ══════════════════════════════════════════════════════════════════════════
  function pageFiche() { return document.getElementById("eventDetailPage"); }

  function ficheOuverte() {
    var page = pageFiche();
    return !!page && page.style.display !== "none" && page.style.display !== "";
  }

  function idCourant() { return String(window._openEventDetailId || ""); }

  function evenementCourant() {
    var id = idCourant();
    return id ? trouverEvenement(id) : null;
  }

  // ⚠️ `setTimeout` et JAMAIS `requestAnimationFrame` : rAF ne se déclenche pas
  // sur une page qui ne COMPOSE pas de frames — onglet en arrière-plan,
  // navigateur sans tête, machine saturée. La fiche resterait alors historique,
  // en silence. Le dépôt a déjà payé ce piège deux fois (UI-3A, UI-3B).
  var pending = false;
  function planifier() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; majFiche(); }, 0);
  }

  // ⚠️ Verrou d'échec, et non un simple `catch`. Restaurer la fiche historique
  // repeint `#eventDetailContent`, ce que l'observateur voit — sans ce verrou,
  // une erreur reproductible relancerait la réorganisation en boucle infinie.
  // Un échec coupe donc le lot pour la session : l'application reste celle
  // d'avant, et l'incident reste audible.
  var enPanne = false;

  function majFiche() {
    if (enPanne || !uiV4bEnabled() || !ficheOuverte()) return;
    try {
      reorganiser();
      // Une relecture peut arriver pendant que la personne parcourt la fiche.
      var places = document.querySelector("#eventDetailContent .v4b-rdv-places");
      var ev = evenementCourant();
      if (places && ev) {
        var texte = texteParticipation(ev);
        if (places.textContent !== texte) places.textContent = texte;
      }
      appliquerCta();
      masquerDoublonsDuPied();
      peindreDemandes();
      var pg = pageFiche();
      if (pg && pg.scrollTop <= 40 && pg.classList.contains("v4b-defile")) pg.classList.remove("v4b-defile");
    } catch (e) {
      // Une fiche à moitié réorganisée doit rester LISIBLE : on rend la main au
      // moteur historique plutôt que de laisser un écran cassé.
      enPanne = true;
      fail("maj", e);
      restaurerHistorique();
    }
  }

  // Rend la fiche EXACTEMENT telle que le moteur historique la produit — on le
  // laisse se réafficher lui-même plutôt que de reconstruire son HTML ici.
  function restaurerHistorique() {
    if (!ficheOuverte()) return;
    var id = idCourant();
    if (id) rendreFiche(id);
  }

  var observateur = null;
  function observer() {
    var page = pageFiche();
    if (!page || observateur) return;
    observateur = new MutationObserver(function () { planifier(); });
    // Trois cibles, un seul observateur : l'affichage de la page (ouverture
    // depuis n'importe quel parcours), le corps (repeinte du moteur) et la barre
    // d'action (repeinte après un RSVP par `_refreshEventDetailIfOpen`).
    observateur.observe(page, { attributes: true, attributeFilter: ["style"] });
    var content = document.getElementById("eventDetailContent");
    if (content) observateur.observe(content, { childList: true });
    var cta = document.getElementById("eventDetailCta");
    if (cta) observateur.observe(cta, { childList: true });
    // 2026-11-27 (ergonomie g) : à 320 px, héros + pied ne laissaient que 17 % de
    // l'écran au contenu. Dès qu'on lit (la fiche défile), le pied passe en forme
    // COMPACTE (styles.css, `.v4b-defile`) : aucune action ne disparaît, seul le
    // rappel de la date — déjà dans « Le rendez-vous » — se tait.
    if (!page._v4bDefile) {
      page._v4bDefile = true;
      page.addEventListener("scroll", function () {
        var d = page.scrollTop > 40;
        if (page.classList.contains("v4b-defile") !== d) page.classList.toggle("v4b-defile", d);
      }, { passive: true });
    }
  }

  // Délégation unique : la barre d'action est reconstruite en permanence, un
  // écouteur par bouton fuirait à chaque repeinte.
  function onDocumentClick(e) {
    if (!e.target || !e.target.closest) return;
    var go = e.target.closest("[data-v4b-rsvp-go]");
    if (go) { e.preventDefault(); e.stopPropagation(); _inscritA = Date.now(); participer(); return; }
    var redem = e.target.closest("[data-v4b-rsvp-redemander]");
    if (redem) { e.preventDefault(); e.stopPropagation(); redemander(); return; }
    var chat = e.target.closest("[data-v4b-rsvp-chat]");
    if (chat) {
      e.preventDefault(); e.stopPropagation();
      var evC = evenementCourant();
      track("ui_v4b_rsvp_suite", { v: VERSION, quoi: "chat" });
      try { if (evC && typeof openEventChat === "function") openEventChat(evC.id); } catch (x) { fail("rsvp_chat", x); }
      return;
    }
    var inv = e.target.closest("[data-v4b-rsvp-inviter]");
    if (inv) {
      e.preventDefault(); e.stopPropagation();
      var evI = evenementCourant();
      track("ui_v4b_rsvp_suite", { v: VERSION, quoi: "inviter" });
      try { if (evI && typeof openEventInvite === "function") openEventInvite(evI.id); } catch (x) { fail("rsvp_inviter", x); }
      return;
    }
    var pointe = e.target.closest("[data-v4b-rsvp-pointer]");
    if (pointe) {
      e.preventDefault(); e.stopPropagation();
      var evP = evenementCourant();
      track("ui_v4b_rsvp_suite", { v: VERSION, quoi: "pointer" });
      try { if (evP && typeof checkInEvent === "function") checkInEvent(evP.id); } catch (x) { fail("rsvp_pointer", x); }
      return;
    }
    var dem = e.target.closest("[data-v4b-demandes]");
    if (dem) {
      e.preventDefault(); e.stopPropagation();
      var evD = evenementCourant();
      track("ui_v4b_rsvp_suite", { v: VERSION, quoi: "demandes" });
      try { if (evD && typeof openEventParticipantValidation === "function") openEventParticipantValidation(evD.id); } catch (x) { fail("demandes", x); }
      return;
    }
    var gerer = e.target.closest("[data-v4b-rsvp-gerer]");
    if (gerer) {
      e.preventDefault(); e.stopPropagation();
      var evG = evenementCourant();
      track("ui_v4b_rsvp_suite", { v: VERSION, quoi: "gerer" });
      try { if (evG && typeof openEventManage === "function") openEventManage(evG.id); } catch (x) { fail("rsvp_gerer", x); }
      return;
    }
    var rm = e.target.closest("[data-v4b-rsvp-remove]");
    if (rm) {
      e.preventDefault(); e.stopPropagation();
      if (Date.now() - _inscritA < RETRAIT_GARDE_MS) return; // IRL-C50 : appui de rebond
      retirerParticipation();
    }
  }

  // Escape ferme la fiche, comme le bouton « Retour » (même appel, donc même
  // comportement d'historique). On ne le prend PAS quand une modale est ouverte
  // par-dessus, ni quand la frappe va vers un champ : Escape y a déjà un sens.
  function onKeydown(e) {
    if (e.key !== "Escape" && e.key !== "Esc") return;
    if (!ficheOuverte()) return;
    var modal = document.getElementById("modalBackdrop");
    if (modal && modal.classList.contains("active")) return;
    var actif = document.activeElement;
    if (actif && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName || "")) return;
    if (typeof closeEventDetail !== "function") return;
    e.preventDefault();
    try { closeEventDetail(); } catch (err) { fail("escape", err); }
  }

  // ── Ouverture de l'activité de démonstration ──────────────────────────────
  // L'app démarre sur le Feed ; le moteur de la fiche et le `state` peuvent
  // encore être en cours de chargement. On réessaie quelques fois, brièvement,
  // puis on renonce en le disant — jamais en boucle infinie.
  var demoEssais = 0;
  var demoPretObserver = null;

  // Le délai borné reste un filet de secours, mais ne doit pas être l'unique
  // signal : sous forte charge, l'app peut devenir prête après son expiration.
  // On observe donc les deux classes de boot et on ouvre dès que l'état réel le
  // permet. L'observateur est strictement réservé à l'aperçu de démonstration.
  function armerOuvertureDemo() {
    if (!demoDemandee() || demoPretObserver || idCourant() === DEMO_EVENT_ID) return;
    var landing = document.getElementById("landing");
    var feed = document.getElementById("screen-feed");
    if (!landing && !feed) return;
    demoPretObserver = new MutationObserver(function () {
      if (!demoDemandee() || !uiV4bEnabled()) {
        demoPretObserver.disconnect();
        demoPretObserver = null;
        return;
      }
      if (idCourant() === DEMO_EVENT_ID) {
        demoPretObserver.disconnect();
        demoPretObserver = null;
        return;
      }
      ouvrirDemo();
    });
    if (landing) demoPretObserver.observe(landing,
      { attributes: true, attributeFilter: ["class", "style"] });
    if (feed) demoPretObserver.observe(feed,
      { attributes: true, attributeFilter: ["class", "style"] });
  }

  function desarmerOuvertureDemo() {
    if (!demoPretObserver) return;
    demoPretObserver.disconnect();
    demoPretObserver = null;
  }

  // L'application doit avoir fini de se poser : ouvrir la fiche par-dessus la
  // landing ou avant le premier rendu du Feed donnerait un écran que le boot
  // recouvrirait aussitôt.
  function pretPourDemo() {
    if (typeof openEventDetails !== "function") return false;
    // ⚠️ `state` est déclaré `let state = null` (app-01) : il EXISTE avant le
    // boot, donc `typeof state === "undefined"` est faux et `state.seed` levait
    // un TypeError — non rattrapé, il tuait définitivement la chaîne de reprise
    // de la démonstration. Mesuré le 2026-08-28.
    if (typeof state === "undefined" || !state || !state.seed) return false;
    var landing = document.getElementById("landing");
    if (landing && landing.classList.contains("active")) return false;
    var feed = document.getElementById("screen-feed");
    return !!feed && feed.classList.contains("active");
  }

  function ouvrirDemo() {
    if (!demoDemandee() || !uiV4bEnabled()) return;
    if (idCourant() === DEMO_EVENT_ID) return;
    if (!pretPourDemo()) {
      if (demoEssais++ < 80) { setTimeout(ouvrirDemo, 150); return; }
      fail("demo_ouverture", "application non prête");
      return;
    }
    if (rendreFiche(DEMO_EVENT_ID)) {
      desarmerOuvertureDemo();
      track("ui_v4b_demo_open", { v: VERSION });
      planifier();
    }
  }

  var listenerPose = false;

  function apply() {
    var on = uiV4bEnabled();
    var root = document.documentElement;

    if (!on) {
      root.classList.remove(ROOT_CLASS);
      if (observateur) { observateur.disconnect(); observateur = null; }
      desarmerOuvertureDemo();
      if (listenerPose) {
        document.removeEventListener("click", onDocumentClick, true);
        document.removeEventListener("keydown", onKeydown, true);
        listenerPose = false;
      }
      // Coupure décidée alors que la fiche est ouverte : elle redevient celle
      // d'avant, corps et barre d'action compris, sans rechargement. On coupe
      // l'observateur AVANT, sinon il la remettrait aussitôt dans l'état du lot.
      restaurerHistorique();
      return false;
    }

    root.classList.add(ROOT_CLASS);
    // Une réactivation EXPLICITE relève le verrou d'échec : sans cela, un
    // module coupé une fois resterait muet pour le reste de la session sans que
    // l'on puisse le rappeler. Une nouvelle erreur le rabaisserait aussitôt.
    enPanne = false;
    if (!listenerPose) {
      document.addEventListener("click", onDocumentClick, true);
      document.addEventListener("keydown", onKeydown, true);
      listenerPose = true;
    }
    observer();
    armerOuvertureDemo();
    ouvrirDemo();
    planifier();
    return true;
  }

  function boot() {
    try { apply(); } catch (e) { fail("boot", e); }
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste vert).
  // Posée AVANT `boot()` : c'est elle que `ui-v3-passerelle.js` interroge pour
  // savoir s'il doit laisser la barre d'action à ce lot.
  window.PassioUIV4B = {
    PREVIEW_NAME: PREVIEW_NAME,
    DEMO_PREVIEW_NAME: DEMO_PREVIEW_NAME,
    DEMO_EVENT_ID: DEMO_EVENT_ID,
    isEnabled: uiV4bEnabled,
    apply: apply,
    refresh: majFiche,
  };

  // ⚠️ En PRODUCTION, le bloc app sort dans `app/` (9 scripts), injecté une fois
  // le code d'accès franchi. Ce module, lui, est inliné et s'exécute tout de
  // suite : son premier `boot()` tombe donc dans un monde où ni `state` ni
  // `openEventDetails` n'existent, et le budget de relance de la démonstration
  // (80 essais × 150 ms, soit 12 s) se consommait pendant que l'utilisateur
  // saisissait le code — sans jamais être rendu. UI-4A0, UI-4A1 et UI-4A2
  // écoutaient déjà `passio:app-ready` ; ce module était le seul à ne pas le
  // faire. Corrigé le 2026-08-28, c'est le même motif que ses trois frères.
  window.addEventListener("passio:app-ready", function () {
    demoEssais = 0;
    boot();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
