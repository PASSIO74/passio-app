// ══════════════════════════════════════════════════════════════════════════
// PASSIO UI V4 — lot UI-4A2 : carte d'activité V2 dans « Rencontrer ».
// Direction produit : docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md §8
// (« Carte événement ») et §15 (lot UI-4 — IRL V2), arbitrage §A24.
//
// UI-4A0 a posé la tête de l'écran, UI-4A1 a raccordé les intentions au moteur
// de filtrage. Ce lot-ci, et rien d'autre, refait la CARTE de la liste : la
// carte historique empile aujourd'hui un pavé de date, une ligne de méta, trois
// pastilles, 120 caractères de description, la preuve sociale, un pied avec
// avatars et compteur, une barre de quatre actions sociales et un aperçu de
// commentaires — soit une demi-page par activité, où presque rien ne sert à
// décider. La direction tranche : « Elle affiche seulement ce qui permet une
// décision rapide. »
//
// La carte du lot porte donc EXACTEMENT ce que §8 énumère :
//   ① un visuel (couverture de l'activité, sinon la pastille emoji) ;
//   ② le titre ;
//   ③ Passio · quand (Aujourd'hui / Demain / jour court, puis l'heure) ;
//   ④ la ville ou zone · la distance approximative si elle est connue ;
//   ⑤ les participants AGRÉGÉS · les places restantes ;
//   ⑥ la preuve sociale historique, quand elle existe (personnes suivies) ;
//   ⑦ « Voir » et « Je viens ».
//
// ── Ce qui n'est PAS fait ici, et pourquoi ────────────────────────────────
//   • aucune vue « Liste / Carte » : c'est le sous-lot suivant (UI-4A3) ;
//   • aucun moteur de filtrage, de tri, de pagination : tout reste à app-07 ;
//   • aucun moteur RSVP : `setEventRsvp` est le seul point d'écriture, avec
//     ses places, sa liste d'attente, sa notification à l'organisateur, son
//     écriture Supabase et la lecture de son `{ error }`.
//
// ── Vie privée (§A24) ─────────────────────────────────────────────────────
// La carte V2 en montre MOINS que l'historique, jamais plus : ville publique
// seulement — ni le nom du lieu (`venue`), ni l'adresse, ni le contact — et un
// AGRÉGAT de participants au lieu du trombinoscope. La preuve sociale est le
// seul endroit où des personnes sont nommées, et elle est déjà bornée par le
// moteur historique aux comptes que l'on suit (`_eventFriendsGoing`). Ce module
// n'expose aucune donnée que le moteur ne calculait pas déjà.
//
// ── Rien n'est retiré, rien n'est régénéré ────────────────────────────────
// La carte historique reste INTÉGRALEMENT dans le DOM : le bloc du lot est
// AJOUTÉ, et les nœuds recouverts sont masqués par CSS, jamais supprimés. Trois
// raisons, toutes payées ailleurs dans ce dépôt :
//   ① `_loadEventCommentCounts`, `_loadEventReactions` et
//      `_loadEventCommentsPreviews` retrouvent APRÈS COUP `[data-evlike]`,
//      `[data-evc]`, `[data-evchipholder]` et `[data-evcomments]` : les retirer
//      ferait échouer ces patchs en silence ;
//   ② les `onclick` inline de la carte historique mourraient à la première
//      régénération de chaîne HTML (piège du lot UI-4B) ;
//   ③ le kill switch doit rendre l'écran historique SANS rechargement, et sans
//      dépendre d'un nouveau rendu (qui, lui, pourrait déclencher une demande
//      GPS que personne n'a demandée).
// Le masquage est BORNÉ au marqueur `data-v4a2` posé par la décoration : une
// carte que le lot n'a pas su décorer reste entièrement historique, avec toutes
// ses portes — jamais amputée de ce qu'on ne lui a pas remplacé (piège du lot
// UI-3A). L'ordre visuel est donné par `order`, donc AUCUN nœud n'est déplacé.
//
// ── Activation — ACTIF PAR DÉFAUT (2026-08-28) ────────────────────────────
//     localStorage.passio_ui_4a2 = "0"    → kill switch local, prioritaire
//     window.PASSIO_UI_4A2 = false        → coupure immédiate en mémoire
//
// Le lot a été mis en ligne sur l'URL normale par décision de Benjamin, en même
// temps que UI-4A0, UI-4A1 et UI-4B : le mécanisme d'aperçu ne lui permettait
// pas de voir les lots sur son appareil, et l'attente de validation bloquait
// tout le chantier. Les anciens liens `?passio_preview=passio-ui-4a2[-demo]`
// restent tolérés mais ne décident plus rien.
//
// Les coupures restent INDÉPENDANTES et prioritaires, chacune ne défaisant que
// SON lot : couper UI-4A0 rend la tête historique sans toucher aux cartes,
// couper UI-4A2 rend les cartes historiques sous la tête V2. C'est le chemin de
// retour arrière, et il ne demande aucun déploiement.
//
// ⚠️ Le module n'écrit RIEN de durable : ni Supabase, ni `state`, ni
// `localStorage`. La seule écriture possible est le RSVP, sur geste explicite,
// et elle passe par le moteur historique.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var PREVIEW_NAME = "passio-ui-4a2";
  var DEMO_PREVIEW_NAME = "passio-ui-4a2-demo";
  var STORAGE_KEY = "passio_ui_4a2";
  var ROOT_CLASS = "passio-ui-4a2";
  var VERSION = "ui4a2";

  var MARQUEUR = "data-v4a2";        // posé sur la carte réellement décorée
  var ATTR_SIG = "data-v4a2-sig";    // état déjà peint, pour n'écrire qu'au changement
  var CLASSE_BLOC = "v4a2";

  var LIB_VOIR = "Voir";
  var LIB_REVOIR = "Revoir";
  var LIB_VIENS = "Je viens";
  var LIB_FILE = "Liste d'attente";
  var LIB_ANNULE = "Annulé";
  var LIB_ORGANISE = "Tu organises";

  var observateur = null;
  var pending = false;
  // ⚠️ Verrou d'échec, et non un simple `catch`. La décoration écrit dans la
  // carte, ce que l'observateur voit : sans ce verrou, une erreur reproductible
  // relancerait la décoration en boucle infinie. Un échec coupe le lot pour la
  // session — l'application reste celle d'avant, et l'incident reste audible.
  var enPanne = false;

  // ══════════════════════════════════════════════════════════════════════════
  // DRAPEAU
  // Ordre de priorité : coupure mémoire > kill switch local > aperçu > éteint.
  // Aucune valeur positive persistante : l'aperçu vient de l'URL, jamais d'un
  // état posé sur l'appareil du testeur.
  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ ACTIF PAR DÉFAUT depuis la mise en ligne du 2026-08-28, décidée par
  // Benjamin. Le drapeau ne sait plus qu'ENLEVER : `PREVIEW_NAME` et
  // `DEMO_PREVIEW_NAME` n'apparaissent plus dans cette fonction — les anciens
  // liens `?passio_preview=…` restent tolérés mais ne décident plus rien, et
  // aucune valeur positive n'est écrite dans `localStorage`. Les deux coupures
  // priment sur tout et rendent l'écran historique sans rechargement.
  function uiV4a2Enabled() {
    if (window.PASSIO_UI_4A2 === false) return false;   // coupure mémoire
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === "0") return false;                   // kill switch local
    return true;
  }

  function actif() { return !enPanne && uiV4a2Enabled(); }

  // ── Diagnostic ────────────────────────────────────────────────────────────
  // Un `catch` muet sur un chemin de décision masque un ReferenceError — le
  // défaut qui a coûté six jours de fil vide au projet. Tout échec est audible,
  // et strictement TECHNIQUE : ni titre d'activité, ni ville, ni identifiant de
  // personne, ni URL de média.
  function fail(ou, err) {
    var msg = "ui_v4a2 (" + ou + ") : " + ((err && err.message) || err || "?");
    if (window.console && console.error) console.error("[ui-v4a2] " + ou + " :", err);
    try { if (typeof diagLog === "function") diagLog(msg); } catch (e) {}
    try {
      if (window.tel && window.tel.error) {
        window.tel.error(err instanceof Error ? err : new Error(msg),
          { action: "ui_v4a2_cartes", meta: { v: VERSION, step: String(ou) } });
      }
    } catch (e) {}
  }

  // Métadonnées AUTORISÉES : version, étape et compteurs — que des constantes
  // techniques de ce fichier. Aucun texte libre, aucun contenu d'activité.
  function track(name, meta) {
    try {
      if (window.tel && typeof window.tel.action === "function") {
        window.tel.action(name, meta || { v: VERSION });
      }
    } catch (e) {}
  }

  function notify(msg) {
    try { if (typeof toast === "function") { toast(msg); return; } } catch (e) {}
    if (window.console && console.warn) console.warn("[ui-v4a2] " + msg);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCÈS AU MOTEUR HISTORIQUE
  // Tout est délégué, rien n'est recalculé « à peu près » : les places, les
  // états d'activité, la distance et l'heure viennent des mêmes fonctions que
  // la carte historique, sinon les deux surfaces divergeraient.
  // ══════════════════════════════════════════════════════════════════════════
  function liste() { return document.getElementById("eventList"); }

  function trouverEvenement(id) {
    if (!id) return null;
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

  function estEnCours(ev) {
    try { return typeof _eventIsLive === "function" ? !!_eventIsLive(ev) : false; }
    catch (e) { fail("etat_live", e); return false; }
  }

  // ⚠️ `_isMyEvent` s'appuie d'abord sur `ev._mine`, un drapeau que SEULES les
  // copies rendues par `allEvents()` portent — l'objet canonique, celui que ce
  // module manipule, ne l'a pas. Sans le repli sur `state.userEvents`, une
  // activité que j'ai créée mais dont l'organisateur n'est pas mon identifiant
  // courant recevrait « Je viens » alors que la carte historique, elle,
  // affichait « Organisé ». Deux surfaces ne peuvent pas dire l'inverse l'une
  // de l'autre sur la même activité.
  function estMien(ev) {
    try { if (typeof _isMyEvent === "function" && _isMyEvent(ev)) return true; }
    catch (e) { fail("etat_mien", e); }
    try {
      var mes = (typeof state !== "undefined" && state && state.userEvents) || [];
      var id = ev && ev.id;
      for (var i = 0; i < mes.length; i++) if (mes[i] && mes[i].id === id) return true;
    } catch (e) { fail("etat_mien_state", e); }
    return false;
  }

  // Places restantes : `null` = illimité. Même calcul que le moteur, délégué
  // quand il est chargé.
  function placesRestantes(ev) {
    try { if (typeof _eventSpotsLeft === "function") return _eventSpotsLeft(ev); }
    catch (e) { fail("places", e); }
    if (!ev || !ev.maxAttendees) return null;
    return Math.max(0, ev.maxAttendees - ((ev.attendees || []).length));
  }

  function estComplet(ev) {
    var r = placesRestantes(ev);
    return r !== null && r <= 0;
  }

  function passionDe(ev) {
    try {
      if (typeof passionById === "function") return passionById(ev && ev.passion) || null;
    } catch (e) { fail("passion", e); }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LES QUATRE LIGNES DE LA CARTE
  // Chacune est du TEXTE, posé par `textContent` : aucun contenu d'activité ne
  // traverse une chaîne HTML, donc aucun contexte d'échappement à choisir ici.
  // ══════════════════════════════════════════════════════════════════════════

  // Jours de CALENDRIER, pas une division en millisecondes. La carte historique
  // fait `Math.ceil((date - now) / 86400000)` : une activité de ce soir dans
  // trois heures y sort « Demain », et une activité déjà commencée « Aujourd'hui ».
  // Sur une carte dont le seul rôle est de faire décider, cet écart n'est pas
  // tolérable — on compare donc des minuits.
  function joursCalendaires(ts) {
    try {
      var a = new Date(ts); a.setHours(0, 0, 0, 0);
      var b = new Date(); b.setHours(0, 0, 0, 0);
      return Math.round((a.getTime() - b.getTime()) / 86400000);
    } catch (e) { fail("jours", e); return 0; }
  }

  function dateCourte(ts) {
    try {
      return new Date(ts).toLocaleDateString("fr-FR",
        { weekday: "short", day: "numeric", month: "short" });
    } catch (e) { fail("date", e); return ""; }
  }

  function heureDe(ev) {
    try { if (typeof _eventTimeLabel === "function") return _eventTimeLabel(ev); }
    catch (e) { fail("heure", e); }
    return "";
  }

  function libelleQuand(ev) {
    if (estEnCours(ev)) return "En cours";
    var h = heureDe(ev);
    var j = joursCalendaires(ev && ev.date);
    var jour;
    if (estTermine(ev)) jour = dateCourte(ev.date);
    else if (j === 0) jour = "Aujourd'hui";
    else if (j === 1) jour = "Demain";
    else jour = dateCourte(ev.date);
    return h ? (jour ? jour + " · " + h : h) : jour;
  }

  // Ligne « Passio · quand ». La Passio d'abord : c'est le premier critère de
  // tri mental d'un testeur qui cherche « ce que je peux vivre ».
  function ligneQuoi(ev) {
    var p = passionDe(ev);
    var bouts = [];
    if (p) bouts.push([p.emoji, p.label].filter(Boolean).join(" "));
    var quand = libelleQuand(ev);
    if (quand) bouts.push(quand);
    return bouts.join(" · ");
  }

  // Ligne « ville · environ N km ». Ville PUBLIQUE seulement (§A24) : ni le nom
  // du lieu, ni l'adresse, ni le contact ne montent sur la carte.
  function ligneOu(ev) {
    var bouts = [];
    if (ev && ev.city) bouts.push(String(ev.city));
    var km = null;
    try {
      if (typeof _eventDistanceKm === "function") km = _eventDistanceKm(ev, null);
    } catch (e) { fail("distance", e); km = null; }
    // Même garde que la carte historique : au-delà de 20 000 km, la « distance »
    // ne dit plus rien d'utile (point de référence par défaut, pas une position).
    if (km != null && km < 20000 && typeof _fmtDistance === "function") {
      try {
        var d = _fmtDistance(km);
        if (d) bouts.push("environ " + d);
      } catch (e) { fail("distance_fmt", e); }
    }
    return bouts.join(" · ");
  }

  // Ligne « N personnes · N places ». Agrégat, jamais de visages (§A24).
  function ligneMonde(ev) {
    var n = ((ev && ev.attendees) || []).length;
    var bouts = [n + " personne" + (n > 1 ? "s" : "")];
    var reste = placesRestantes(ev);
    if (reste !== null && reste !== undefined) {
      bouts.push(reste <= 0 ? "complet" : reste + " place" + (reste > 1 ? "s" : ""));
    }
    var att = ((ev && ev.waitlist) || []).length;
    if (att) bouts.push(att + " en attente");
    return bouts.join(" · ");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISUEL
  // ══════════════════════════════════════════════════════════════════════════
  function pastilleEmoji(emoji) {
    var d = document.createElement("div");
    d.className = "v4a2-emoji";
    d.setAttribute("aria-hidden", "true");
    d.textContent = emoji;
    return d;
  }

  // ⚠️ `coverUrl` est un champ posé par un AUTRE compte. `safeUrlAttr` est
  // utilisé ici comme VALIDATEUR de schéma, pas comme échappeur : la chaîne
  // qu'il rend est échappée pour un attribut HTML, et l'affecter à `img.src`
  // casserait toute URL contenant `&`. On lui demande donc son seul verdict
  // (« schéma autorisé ou non »), puis on affecte l'URL BRUTE par PROPRIÉTÉ —
  // aucun parse HTML n'a lieu sur ce chemin, donc aucune sortie d'attribut ni
  // `javascript:` n'est possible. Sans le helper (bloc app pas encore chargé),
  // on refuse le média et on retombe sur l'emoji : jamais l'inverse.
  function urlMediaSure(u) {
    var s = String(u == null ? "" : u).trim();
    if (!s) return "";
    try {
      if (typeof safeUrlAttr !== "function") return "";
      return safeUrlAttr(s) === "#" ? "" : s;
    } catch (e) { fail("url", e); return ""; }
  }

  function construireVisuel(ev) {
    var v = document.createElement("div");
    v.className = "v4a2-visuel";
    var p = passionDe(ev);
    var emoji = String((ev && ev.emoji) || (p && p.emoji) || "✨");
    var url = urlMediaSure(ev && ev.coverUrl);
    if (!url) { v.appendChild(pastilleEmoji(emoji)); return v; }
    var img = document.createElement("img");
    img.className = "v4a2-img";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    // Média mort ou refusé : on retombe sur la pastille plutôt que de laisser
    // un cadre vide qui ferait douter de l'activité elle-même.
    img.addEventListener("error", function () {
      try {
        if (img.parentNode === v) v.removeChild(img);
        if (!v.firstChild) v.appendChild(pastilleEmoji(emoji));
      } catch (e) { fail("visuel_erreur", e); }
    }, { once: true });
    img.src = url;
    v.appendChild(img);
    return v;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIONS — « Voir » et « Je viens »
  // Les deux ouvrent des moteurs historiques. Aucune écriture n'a lieu avant le
  // geste, et « Je viens » n'appelle QUE `setEventRsvp` : c'est lui, et lui
  // seul, qui décide de la liste d'attente quand l'activité est complète.
  //
  // Le retrait et les états intermédiaires (« Peut-être », « Je ne peux pas »)
  // ne sont PAS dupliqués ici : une réponse déjà posée ouvre la feuille
  // historique `openEventRsvpSheet`, qui les porte déjà toutes.
  // ══════════════════════════════════════════════════════════════════════════
  function bouton(classe, libelle, role) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = classe;
    b.setAttribute("data-v4a2-act", role);
    b.textContent = libelle;
    return b;
  }

  function voir(id) {
    if (typeof openEventDetails !== "function") {
      fail("voir", "openEventDetails indisponible");
      return false;
    }
    track("ui_v4a2_voir", { v: VERSION });
    try { openEventDetails(id); } catch (e) { fail("voir_open", e); return false; }
    return true;
  }

  function participer(ev) {
    if (!ev) return false;
    if (typeof setEventRsvp !== "function") {
      fail("rsvp", "setEventRsvp indisponible");
      notify("La participation n'est pas disponible ici.");
      return false;
    }
    track("ui_v4a2_rsvp_go", { v: VERSION, from: etatRsvp(ev.id) || "none", full: estComplet(ev) });
    try {
      var r = setEventRsvp(ev.id, "going");
      if (r && typeof r.catch === "function") r.catch(function (e) { fail("rsvp_go", e); });
    } catch (e) { fail("rsvp_go", e); return false; }
    return true;
  }

  function ouvrirFeuilleRsvp(id) {
    if (typeof openEventRsvpSheet !== "function") {
      fail("rsvp_sheet", "openEventRsvpSheet indisponible");
      return false;
    }
    track("ui_v4a2_rsvp_sheet", { v: VERSION });
    try { openEventRsvpSheet(id); } catch (e) { fail("rsvp_sheet_open", e); return false; }
    return true;
  }

  function libelleReponse(etat) {
    try {
      if (typeof RSVP_LABELS !== "undefined" && RSVP_LABELS && RSVP_LABELS[etat]) {
        return RSVP_LABELS[etat].short;
      }
    } catch (e) { fail("libelle_rsvp", e); }
    return "Ma réponse";
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNATURE
  // Ce qui, dans la carte, peut changer sans nouveau rendu de la liste : la
  // participation (patchée en place par `_patchEventCardJoin`) et tout ce qui
  // en découle. On ne réécrit QUE lorsque cette signature bouge — sinon
  // l'observateur, qui voit nos propres écritures, tournerait en rond.
  // ══════════════════════════════════════════════════════════════════════════
  function signature(ev) {
    return [
      etatRsvp(ev.id) || "-",
      ((ev.attendees || []).length),
      String(placesRestantes(ev)),
      ((ev.waitlist || []).length),
      estAnnule(ev) ? "x" : "-",
      estTermine(ev) ? "o" : "-",
      estEnCours(ev) ? "l" : "-",
    ].join("|");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉCORATION D'UNE CARTE
  // ══════════════════════════════════════════════════════════════════════════
  function construireBloc(ev) {
    var bloc = document.createElement("div");
    bloc.className = CLASSE_BLOC;

    bloc.appendChild(construireVisuel(ev));

    var corps = document.createElement("div");
    corps.className = "v4a2-corps";

    var titre = document.createElement("div");
    titre.className = "v4a2-titre";
    titre.textContent = String((ev && ev.title) || "Activité");
    corps.appendChild(titre);

    var quoi = document.createElement("div");
    quoi.className = "v4a2-l v4a2-quoi";
    corps.appendChild(quoi);

    var ou = document.createElement("div");
    ou.className = "v4a2-l v4a2-ou";
    corps.appendChild(ou);

    var monde = document.createElement("div");
    monde.className = "v4a2-l v4a2-monde";
    corps.appendChild(monde);

    var actions = document.createElement("div");
    actions.className = "v4a2-actions";
    // Les actions sont DANS une carte elle-même cliquable (`openEventDetails`
    // en `onclick` inline) : sans cette barrière, « Je viens » ouvrirait aussi
    // la fiche par-dessus le geste.
    actions.addEventListener("click", function (e) { e.stopPropagation(); });
    corps.appendChild(actions);

    bloc.appendChild(corps);
    return bloc;
  }

  function peindre(bloc, ev) {
    var q = bloc.querySelector(".v4a2-quoi");
    var o = bloc.querySelector(".v4a2-ou");
    var m = bloc.querySelector(".v4a2-monde");
    var a = bloc.querySelector(".v4a2-actions");
    if (!q || !o || !m || !a) return false;

    q.textContent = ligneQuoi(ev);
    var lo = ligneOu(ev);
    o.textContent = lo;
    // Pas de ligne vide qui creuse un trou dans la carte : une activité sans
    // ville n'en affiche aucune plutôt qu'un séparateur orphelin.
    o.hidden = !lo;
    m.textContent = ligneMonde(ev);

    while (a.firstChild) a.removeChild(a.firstChild);

    var annule = estAnnule(ev);
    var termine = estTermine(ev);
    var reponse = etatRsvp(ev.id);

    var bVoir = bouton("btn small ghost v4a2-voir", termine ? LIB_REVOIR : LIB_VOIR, "voir");
    bVoir.addEventListener("click", function () { voir(ev.id); });
    a.appendChild(bVoir);

    // Annulé et terminé ne sont JAMAIS recouverts d'une invitation à venir :
    // la seule chose honnête à dire là est l'état de l'activité (même règle
    // qu'aux lots UI-3B et UI-4B).
    if (annule) {
      var pill = document.createElement("span");
      pill.className = "v4a2-etat v4a2-etat-annule";
      pill.setAttribute("data-v4a2-act", "annule");
      pill.setAttribute("role", "status");
      pill.textContent = LIB_ANNULE;
      a.appendChild(pill);
      return true;
    }
    if (termine) return true;

    if (estMien(ev)) {
      // Organiser n'est pas participer : proposer « Je viens » à l'organisateur
      // de sa propre activité n'a aucun sens. La gestion reste dans la fiche.
      var mien = document.createElement("span");
      mien.className = "v4a2-etat v4a2-etat-mien";
      mien.setAttribute("data-v4a2-act", "mien");
      mien.textContent = LIB_ORGANISE;
      a.appendChild(mien);
      return true;
    }

    if (reponse) {
      var bRep = bouton("btn small ghost v4a2-reponse", libelleReponse(reponse), "reponse");
      bRep.setAttribute("data-v4a2-rsvp", reponse);
      bRep.addEventListener("click", function () { ouvrirFeuilleRsvp(ev.id); });
      a.appendChild(bRep);
      return true;
    }

    // Complet : le libellé DIT ce qui va se passer avant le geste, plutôt que
    // de le faire découvrir par le toast du moteur après coup. L'appel, lui,
    // reste `setEventRsvp(id, "going")` : c'est le moteur, seule autorité, qui
    // bascule en liste d'attente.
    var bGo = bouton("btn small primary v4a2-go", estComplet(ev) ? LIB_FILE : LIB_VIENS, "go");
    bGo.addEventListener("click", function () { participer(ev); });
    a.appendChild(bGo);
    return true;
  }

  function decorerCarte(carte) {
    if (!carte) return;
    var id = carte.getAttribute("data-evid");
    if (!id) return;
    var ev = trouverEvenement(id);
    if (!ev) {
      // Activité introuvable : la carte historique reste ENTIÈRE, avec toutes
      // ses portes. On ne masque jamais ce qu'on n'a pas remplacé.
      if (carte.hasAttribute(MARQUEUR)) nettoyerCarte(carte);
      return;
    }
    // ⚠️ Le bloc n'entre dans le DOM qu'une fois PEINT. L'insérer d'abord
    // laisserait, si la peinture échouait, un bloc vide dans une carte que le
    // marqueur ne couvre pas — deux surfaces à moitié posées valent moins que
    // la carte historique intacte.
    var bloc = carte.querySelector(":scope > ." + CLASSE_BLOC);
    var neuf = !bloc;
    if (neuf) bloc = construireBloc(ev);
    var sig = signature(ev);
    if (!neuf && carte.getAttribute(ATTR_SIG) === sig) return;   // rien n'a bougé
    if (!peindre(bloc, ev)) { fail("peinture", "bloc incomplet"); return; }
    if (neuf) carte.appendChild(bloc);
    carte.setAttribute(ATTR_SIG, sig);
    carte.setAttribute(MARQUEUR, "1");
  }

  function nettoyerCarte(carte) {
    try {
      var bloc = carte.querySelector(":scope > ." + CLASSE_BLOC);
      if (bloc && bloc.parentNode) bloc.parentNode.removeChild(bloc);
      carte.removeAttribute(MARQUEUR);
      carte.removeAttribute(ATTR_SIG);
    } catch (e) { fail("nettoyage", e); }
  }

  function cartes() {
    var l = liste();
    if (!l) return [];
    try { return [].slice.call(l.querySelectorAll(".event-card[data-evid]")); }
    catch (e) { fail("cartes", e); return []; }
  }

  function decorer() {
    if (!actif()) return;
    var lot = cartes();
    for (var i = 0; i < lot.length; i++) {
      try { decorerCarte(lot[i]); }
      catch (e) {
        // Une carte qui échoue ne doit pas emporter les autres — mais une
        // erreur reproductible coupe le lot (verrou), elle ne boucle pas.
        enPanne = true;
        fail("decoration", e);
        // On coupe AUSSI l'observation : un lot en panne ne doit plus être
        // réveillé par le moindre patch du moteur, sinon il rejoue son échec à
        // chaque chargement de commentaires.
        cesserObservation();
        retirerDecorations();
        document.documentElement.classList.remove(ROOT_CLASS);
        return;
      }
    }
  }

  function retirerDecorations() {
    var lot = cartes();
    for (var i = 0; i < lot.length; i++) nettoyerCarte(lot[i]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OBSERVATION
  // Aucune enveloppe de `renderIRL` ici, DÉLIBÉRÉMENT : UI-4A0 et UI-4A1 en
  // posent déjà deux, l'une par-dessus l'autre, et une troisième ajouterait un
  // maillon de plus à une chaîne qui a déjà coûté un `null.apply` au lot UI-4A1.
  // Un observateur voit tout ce qu'une enveloppe verrait — le rendu complet de
  // la liste — ET ce qu'elle ne verrait PAS : `_patchEventCardJoin`, qui
  // réécrit le seul pied d'une carte après un RSVP sans repasser par `renderIRL`.
  //
  // ⚠️ `setTimeout` et JAMAIS `requestAnimationFrame` : rAF ne part pas sur une
  // page qui ne compose pas de frames — onglet en arrière-plan, navigateur sans
  // tête, machine saturée. Les cartes resteraient historiques, en silence.
  // Piège déjà payé aux lots UI-3A, UI-3B et UI-4B.
  // ══════════════════════════════════════════════════════════════════════════
  function planifier() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; try { decorer(); } catch (e) { fail("planifie", e); } }, 0);
  }

  function observer() {
    if (observateur) return;
    var l = liste();
    if (!l) return;
    try {
      observateur = new MutationObserver(function () { planifier(); });
      observateur.observe(l, { childList: true, subtree: true });
    } catch (e) { fail("observateur", e); observateur = null; }
  }

  function cesserObservation() {
    if (!observateur) return;
    try { observateur.disconnect(); } catch (e) { fail("observateur_stop", e); }
    observateur = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTIVATION / COUPURE
  // La coupure ne relance AUCUN rendu : elle retire nos nœuds, nos marqueurs et
  // la classe racine, et la carte historique — restée entière dans le DOM —
  // réapparaît. Repeindre la liste risquerait de redemander la position au
  // testeur, ce qu'un kill switch n'a pas à faire.
  // ══════════════════════════════════════════════════════════════════════════
  function apply() {
    var on = actif();
    var root = document.documentElement;
    if (!on) {
      root.classList.remove(ROOT_CLASS);
      cesserObservation();
      retirerDecorations();
      return false;
    }
    root.classList.add(ROOT_CLASS);
    observer();
    decorer();
    return true;
  }

  // ⚠️ En PRODUCTION, le bloc app sort dans `app.js`, injecté seulement une fois
  // le code d'accès franchi : au premier `boot()`, ni `allEvents` ni
  // `safeUrlAttr` n'existent, et `#eventList` est vide. On repasse donc à
  // `passio:app-ready`, avec une reprise bornée par `setTimeout` en secours
  // (jamais de boucle infinie, jamais de `requestAnimationFrame`).
  var essais = 0;
  function boot() {
    try {
      var on = apply();
      if (on && !observateur && essais++ < 80) setTimeout(boot, 150);
    } catch (e) { fail("boot", e); }
  }

  // Surface publique unique (aucun global top-level : `audit:globals` reste
  // vert). `isEnabled` est la version PURE — celle qu'UI-4A0 et UI-4A1
  // interrogent pour savoir si leur aperçu est impliqué par le nôtre ; elle ne
  // consulte JAMAIS les leurs en retour, donc aucune récursion n'est possible.
  window.PassioUIV4A2 = {
    PREVIEW_NAME: PREVIEW_NAME,
    DEMO_PREVIEW_NAME: DEMO_PREVIEW_NAME,
    isEnabled: uiV4a2Enabled,
    isActive: actif,
    apply: apply,
    refresh: decorer,
  };

  window.addEventListener("passio:app-ready", function () {
    essais = 0;
    boot();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
