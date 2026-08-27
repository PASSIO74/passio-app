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
// ── Activation — APERÇU UNIQUEMENT, en attente de la validation de Benjamin ──
//     ?passio_preview=passio-ui-4b        → la fiche V2 sur les activités réelles
//     ?passio_preview=passio-ui-4b-demo   → idem + une activité de démonstration
//                                           ouverte, entièrement en mémoire
//     localStorage.passio_ui_4b = "0"     → kill switch, prioritaire
//     window.PASSIO_UI_4B = false         → coupure immédiate en mémoire
//
// L'URL normale est strictement inchangée : sans le paramètre d'aperçu, ce
// module ne pose ni classe, ni écouteur, ni observateur. Il n'écrit RIEN dans
// `localStorage` — aucune activation ne persiste d'une visite à l'autre, et les
// deux coupures restent prioritaires sur le lien d'aperçu.
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
  var LIBELLE_RSVP_FAIT = "✓ Je participe";
  var LIBELLE_RSVP_ATTENTE = "⏳ Sur liste d'attente";
  var LIBELLE_RSVP_RETIRER = "Retirer ma participation";

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

  function uiV4bEnabled() {
    if (window.PASSIO_UI_4B === false) return false;   // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;                  // kill switch local
    return apercuDemande(PREVIEW_NAME) || demoDemandee();
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

  // Places restantes : `null` = illimité. Même calcul que le moteur historique,
  // délégué quand il est chargé.
  function placesRestantes(ev) {
    try {
      if (typeof _eventSpotsLeft === "function") return _eventSpotsLeft(ev);
    } catch (e) { fail("places", e); }
    if (!ev || !ev.maxAttendees) return null;
    return Math.max(0, ev.maxAttendees - ((ev.attendees || []).length));
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
  function texteParticipation(ev) {
    var n = (ev.attendees || []).length;
    var bouts = [n + " participant" + (n > 1 ? "s" : "")];
    var reste = placesRestantes(ev);
    if (reste !== null) {
      bouts.push(reste <= 0 ? "complet"
        : reste + " place" + (reste > 1 ? "s" : "") + " restante" + (reste > 1 ? "s" : ""));
    }
    var att = (ev.waitlist || []).length;
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
    if (cl.contains("event-feedback-prompt") || cl.contains("event-feedback-done")) return "avis";
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
    var sig = (etat || "none") + (complet ? "|full" : "");
    // ⚠️ Le marqueur vit sur le nœud INJECTÉ, jamais sur `#eventDetailCta` : le
    // moteur historique repeint la barre par `innerHTML`, ce qui efface les
    // enfants mais conserve les attributs de l'hôte. Un marqueur posé sur l'hôte
    // aurait donc annoncé « déjà à jour » sur une barre redevenue historique.
    var box = cta.querySelector("[data-v4b-rsvp]");
    if (box && box.getAttribute("data-v4b-rsvp") === sig) return false;

    cta.innerHTML = "";
    cta.appendChild(construireCta(sig, etat, complet));
    return true;
  }

  function construireCta(sig, etat, complet) {
    var box = document.createElement("div");
    box.className = "v4b-rsvp";
    box.setAttribute("data-v4b-rsvp", sig);

    // Participation confirmée (ou file d'attente) : un ÉTAT lisible, pas un
    // bouton qui bascule — un tap malheureux ne doit pas désinscrire.
    if (etat === "going" || etat === "waitlist") {
      var st = document.createElement("div");
      st.className = "v4b-rsvp-etat";
      st.setAttribute("data-v4b-rsvp-etat", etat);
      st.setAttribute("role", "status");
      st.textContent = etat === "going" ? LIBELLE_RSVP_FAIT : LIBELLE_RSVP_ATTENTE;
      box.appendChild(st);
      box.appendChild(construireRetrait());
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
      appliquerCta();
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
  }

  // Délégation unique : la barre d'action est reconstruite en permanence, un
  // écouteur par bouton fuirait à chaque repeinte.
  function onDocumentClick(e) {
    if (!e.target || !e.target.closest) return;
    var go = e.target.closest("[data-v4b-rsvp-go]");
    if (go) { e.preventDefault(); e.stopPropagation(); participer(); return; }
    var rm = e.target.closest("[data-v4b-rsvp-remove]");
    if (rm) { e.preventDefault(); e.stopPropagation(); retirerParticipation(); }
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

  // L'application doit avoir fini de se poser : ouvrir la fiche par-dessus la
  // landing ou avant le premier rendu du Feed donnerait un écran que le boot
  // recouvrirait aussitôt.
  function pretPourDemo() {
    if (typeof openEventDetails !== "function") return false;
    if (typeof state === "undefined" || !state.seed) return false;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
