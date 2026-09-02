/* ═══════════════════════════════════════════════════════════════════════════
   PASSIO — PREMIÈRE VISITE  (drapeau `first_run_experience_v1`)
   ───────────────────────────────────────────────────────────────────────────
   « L'application est elle-même le pitch. »

   Un visiteur qui n'a pas de compte entre DIRECTEMENT dans « Découvrir »,
   comprend la valeur du produit en s'en servant, et ne crée un compte qu'au
   moment où il tente une action engageante.

   ── DRAPEAU : ACTIF PAR DÉFAUT depuis le 2026-09-01 ────────────────────────
       (rien)                                            → ACTIF
       localStorage.passio_first_run_experience_v1 = "0"  → coupure prioritaire
       window.PASSIO_FIRST_RUN_V1 = false                → coupure en mémoire

   Le drapeau ne sait plus qu'ENLEVER — même patron qu'UI-3A et les lots UI-4 :
   aucune valeur positive n'active, et rien n'est écrit dans `localStorage`.
   Coupé ⇒ landing + onboarding + tour historiques, à l'octet près : ce module
   n'écrit alors rien, n'observe rien, et `entreeDirecte()` rend `false` pour
   que `boot()` appelle `showLanding()`.

   ⚠️ UN COMPTE EXISTANT N'ENTRE JAMAIS DANS CE PARCOURS, drapeau actif compris :
   `entreeDirecte()` sort sur sa garde `compteExistant()`. Le basculement ne
   change donc RIEN pour qui possède déjà un compte — il ne change la porte
   d'entrée que pour un appareil qui n'en a aucun.

   ⚠️ LE PARAMÈTRE `?passio_preview=first-run-v1` NE DÉCIDE PLUS RIEN, et sa
   persistance a été RETIRÉE avec lui. Elle existait pour une raison précise,
   qui a disparu avec le basculement : le parcours traverse une inscription, et
   la confirmation d'e-mail (SMTP Brevo, 2026-08-30) ramène la personne par un
   LIEN NEUF, donc sans le paramètre — sans persistance, elle aurait terminé son
   inscription hors du parcours qu'elle testait. Le défaut étant désormais
   « actif », ce lien neuf tombe sur le parcours de toute façon.

   ── CE QUE CE MODULE NE FAIT JAMAIS ────────────────────────────────────────
   • aucune écriture Supabase en mode invité — ni `signInAnonymously` (le
     chemin historique `onbSkipAuth` en crée un, celui-ci PAS), ni `supaInit`
     (qui upserte la ligne `profiles`), ni `supaSaveUserState` ;
   • aucune demande de géolocalisation, aucune demande de notification ;
   • aucune action à effet externe rejouée automatiquement après inscription ;
   • aucun desserrage de RLS : le fil invité lit ce que la policy
     « Lecture respectant les comptes privés » laisse déjà lire sans session.

   ── ARCHITECTURE ───────────────────────────────────────────────────────────
   IIFE `"use strict"` : n'expose que `window.PassioFirstRun` et
   `window.requireAuthentication` (aucun global de haut niveau → `audit:globals`
   reste vert). Chargé HORS du bloc BUILD:APP, donc inliné et exécuté AVANT
   `app.js` en production : à l'évaluation, ni `state`, ni `boot`, ni
   `renderFeed` n'existent. Toute reprise passe donc par `passio:app-ready`
   avec compteurs remis à zéro, et par des `setTimeout` bornés — JAMAIS par
   `requestAnimationFrame` (il ne part pas sur une page qui ne compose pas de
   frames : onglet en arrière-plan, headless, machine saturée).
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var CLE_DRAPEAU   = "passio_first_run_experience_v1";
  var CLE_PREFS     = "passio_first_run_v1";
  var VERSION_PREFS = 1;
  var CLASSE_RACINE = "passio-first-run";

  // ══════════════════════════════════════════════════════════════════════════
  // 1. DRAPEAU
  // ══════════════════════════════════════════════════════════════════════════

  // ⚠️ ACTIF PAR DÉFAUT depuis le 2026-09-01, sur ordre de Benjamin (« allume »).
  // Le drapeau ne sait plus qu'ENLEVER — même patron qu'UI-3A et les lots UI-4 :
  // aucune valeur positive n'active, et RIEN n'est écrit dans `localStorage`.
  // Coupures, prioritaires sur tout : `window.PASSIO_FIRST_RUN_V1 = false` et
  // `localStorage.passio_first_run_experience_v1 = "0"`.
  //
  // ⚠️ La persistance de l'aperçu N'A PLUS LIEU D'ÊTRE, et c'est ce qui permet
  // de la retirer sans rouvrir le défaut qu'elle fermait. Elle existait pour une
  // raison précise : le parcours traverse une inscription, et la confirmation
  // d'e-mail ramène par un lien NEUF, donc sans `?passio_preview=…` — la
  // personne aurait terminé son inscription hors du parcours qu'elle testait.
  // Le défaut étant désormais « actif », ce lien neuf tombe sur le parcours de
  // toute façon. Le paramètre d'aperçu reste TOLÉRÉ mais ne décide plus rien.
  //
  // ⚠️ Le `"1"` d'un appareil qui a testé l'aperçu reste lu, et c'est voulu :
  // on cesse d'en écrire, on ne le renie pas. La coupure `"0"` est testée AVANT
  // lui, donc un kill switch posé sur un tel appareil gagne quand même.
  function actif() {
    if (window.PASSIO_FIRST_RUN_V1 === false) return false;
    var stocke = null;
    try { stocke = localStorage.getItem(CLE_DRAPEAU); } catch (e) {}
    if (stocke === "0") return false;
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. ACCÈS PRUDENT À L'ÉTAT DE L'APPLICATION
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ `state` est un `let` de portée SCRIPT déclaré dans app-01 : il n'est PAS
  // une propriété de `window` (`window.state` vaut toujours `undefined`), et il
  // vaut `null` — pas `undefined` — tant que `boot()` n'a pas fait
  // `state = loadState()`. Le motif `typeof state === "undefined" || !state.x`
  // lève donc un TypeError sur `null`, non rattrapé quand il vient d'un
  // `setTimeout` : c'est exactement ce qui a tué la reprise de `ui-v4b-fiche.js`
  // le 2026-08-28. D'où cet accesseur unique, sous `try`.
  function etat() {
    try { return (typeof state !== "undefined" && state) ? state : null; } catch (e) { return null; }
  }

  function appPrete() { return !!etat(); }

  // ⚠️ `MY_UID` N'EST PAS UNE PREUVE DE COMPTE, et c'est le piège central de ce
  // lot. `getMyUserId()` (app-08) FABRIQUE un identifiant local `u_xxxxxxxx` au
  // chargement du script — pour tout le monde, toujours — et l'écrit dans
  // `localStorage.passio_uid`. Tester « MY_UID est-il posé ? » rendait donc
  // TOUJOURS vrai : `entreeDirecte()` sortait par sa garde « compte existant »
  // et la landing historique s'affichait, drapeau actif. Mesuré au premier
  // démarrage réel — aucun test unitaire, aucune erreur, aucun symptôme.
  //
  // Le seul identifiant qui prouve un compte est un uuid Supabase. Le
  // placeholder local n'en a ni la forme ni le rôle : il ne sert qu'à attribuer
  // du contenu local à « moi » tant qu'aucun compte n'existe.
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function uidSupabase() {
    var v = null;
    try { if (typeof MY_UID !== "undefined" && MY_UID) v = MY_UID; } catch (e) {}
    if (!v) { try { v = localStorage.getItem("passio_uid"); } catch (e) {} }
    return (typeof v === "string" && RE_UUID.test(v)) ? v : null;
  }

  // Un compte existe-t-il sur cet appareil ? Deux preuves, chacune suffisante :
  // `state.onboarded` (l'onboarding local a été mené à son terme) et un uuid
  // Supabase connu (un compte s'est déjà connecté ici, même si sa session n'est
  // pas encore rétablie au moment où `boot()` décide).
  //
  // ⚠️ EXIGENCE DU LOT : « Les utilisateurs déjà inscrits ou ayant terminé leur
  // onboarding ne doivent jamais être renvoyés dans le nouveau parcours. » Cette
  // fonction est le seul endroit qui en décide.
  function compteExistant() {
    var s = etat();
    if (s && s.onboarded) return true;
    if (uidSupabase()) return true;
    return false;
  }

  function estVisiteur() { return actif() && appPrete() && !compteExistant(); }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. PRÉFÉRENCES LOCALES DU VISITEUR — format VERSIONNÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Clé dédiée, séparée de `passio_mvp_state_v1` : c'est ce qui permet à la
  // migration vers le compte d'être idempotente et relançable (elle a une
  // source distincte de sa cible). N'y entre QUE des identifiants — jamais de
  // média, de base64, d'adresse, ni le moindre texte saisi.
  function prefsVides() {
    return {
      v: VERSION_PREFS,
      passions: [],      // ids de passions du catalogue
      specialites: [],   // ids de spécialités (rattachées à une passion)
      intents: [],       // envies du Fil
      tour: {},          // { decouvrir:1, rencontrer:1, creer:1, abandonne:1 }
      bienvenue: "",     // "" | "vue" | "fermee"
      retour: null,      // { screen, hash } — jamais de contenu, juste une route
      migre: false,
      debut: 0
    };
  }

  var _prefsCache = null;

  function prefs() {
    if (_prefsCache) return _prefsCache;
    var brut = null;
    try { brut = localStorage.getItem(CLE_PREFS); } catch (e) {}
    var o = null;
    if (brut) { try { o = JSON.parse(brut); } catch (e) { o = null; } }
    // Version inconnue (future, ou fichier corrompu) : on repart d'un objet
    // vide plutôt que de raisonner sur une forme qu'on ne connaît pas.
    if (!o || typeof o !== "object" || o.v !== VERSION_PREFS) o = prefsVides();
    var d = prefsVides();
    if (!Array.isArray(o.passions))    o.passions = d.passions;
    if (!Array.isArray(o.specialites)) o.specialites = d.specialites;
    if (!Array.isArray(o.intents))     o.intents = d.intents;
    if (!o.tour || typeof o.tour !== "object") o.tour = {};
    _prefsCache = o;
    return o;
  }

  function sauverPrefs() {
    try { localStorage.setItem(CLE_PREFS, JSON.stringify(prefs())); } catch (e) {}
  }

  function oublierPrefs() {
    _prefsCache = null;
    try { localStorage.removeItem(CLE_PREFS); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. TÉLÉMÉTRIE — identifiants et compteurs seulement
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ `js/telemetry.js` filtre `meta` par une liste NOIRE de noms de clés
  // (`DENY_KEY`) : elle rejette `label`, `name`, `title`, `query`, `search`,
  // `city`, `email`… mais laisserait passer une clé nouvelle porteuse de texte.
  // La garantie vient donc de ce qu'on ENVOIE : ici, uniquement des nombres et
  // des mots-clés fermés (`ctx` ∈ liste finie ci-dessous). Jamais un libellé de
  // passion, jamais une recherche libre, jamais une position.
  function tel(nom, meta) {
    try { if (window.tel && window.tel.action) window.tel.action(nom, meta || {}); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. CATALOGUE — spécialités et synonymes, en COUCHE ADDITIVE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ AUCUNE PASSION N'EST REDÉFINIE ICI. La source de vérité reste
  // `PASSIONS` (app-01, socle canonique minimal embarqué — ADR-010) complétée
  // par le référentiel serveur : ce module lit `allPassions()` / `passionById()`
  // et n'en garde aucune copie. Ce qui suit est une couche PAR-DESSUS, indexée
  // par identifiant de passion existant, qui n'apporte que ce que le catalogue
  // n'a pas encore : des spécialités et des synonymes de recherche.
  //
  // Le jour où un vrai catalogue hiérarchique arrive (passion → spécialités,
  // avec synonymes), il remplace `SPECIALITES` et `SYNONYMES` ici, et rien
  // d'autre ne bouge : `specialitesDe()` et `chercher()` sont les deux seuls
  // points de lecture. Une spécialité n'est jamais publiée comme une passion —
  // elle n'est pas canonique — elle SÉLECTIONNE sa passion parente.
  var SPECIALITES = {
    musique:     [["guitare","Guitare"],["piano","Piano"],["chant","Chant"],["mao","Beatmaking / MAO"],["batterie","Batterie"]],
    photo:       [["argentique","Argentique"],["portrait","Portrait"],["rue","Photo de rue"],["nature","Nature"],["retouche","Retouche"]],
    voyage:      [["randonnee","Randonnée"],["roadtrip","Road trip"],["backpack","Sac à dos"],["vanlife","Van life"],["citytrip","City trip"]],
    cuisine:     [["patisserie","Pâtisserie"],["vegan","Cuisine végétale"],["boulange","Boulange"],["bbq","Barbecue"],["fermentation","Fermentation"]],
    sport:       [["course","Course à pied"],["escalade","Escalade"],["velo","Vélo"],["muscu","Musculation"],["natation","Natation"]],
    litterature: [["romans","Romans"],["poesie","Poésie"],["bd","BD & manga"],["ecriture","Écriture"],["clubs","Clubs de lecture"]],
    cinema:      [["courtmetrage","Court-métrage"],["montage","Montage"],["cinephilie","Ciné-club"],["docu","Documentaire"]],
    tech:        [["dev","Développement"],["ia","Intelligence artificielle"],["hardware","Hardware / DIY"],["design","Design produit"],["domotique","Domotique"]],
    art:         [["dessin","Dessin"],["peinture","Peinture"],["ceramique","Céramique"],["illustration","Illustration"],["street","Street art"]],
    jardinage:   [["potager","Potager"],["permaculture","Permaculture"],["plantes","Plantes d'intérieur"],["bonsai","Bonsaï"]],
    metier:      [["bois","Travail du bois"],["couture","Couture"],["cuir","Maroquinerie"],["metal","Métal & forge"],["bijoux","Bijoux"]],
    jeuxvideo:   [["inde","Jeux indés"],["retro","Rétrogaming"],["esport","Esport"],["creation","Création de jeux"],["jdr","Jeux de rôle"]],
    yoga:        [["hatha","Hatha"],["vinyasa","Vinyasa"],["meditation","Méditation"],["respiration","Respiration"],["naturo","Naturopathie"]],
    mode:        [["upcycling","Upcycling"],["vintage","Vintage"],["stylisme","Stylisme"],["sneakers","Sneakers"]],
    danse:       [["hiphop","Hip-hop"],["contemporain","Contemporain"],["salsa","Salsa"],["classique","Classique"],["afro","Afro"]],
    podcast:     [["interview","Interview"],["fiction","Fiction sonore"],["montageson","Montage son"],["radio","Radio libre"]],
    moto:        [["roadster","Roadster"],["trail","Trail / Adventure"],["mecanique","Mécanique"],["balade","Balades"],["custom","Custom"]],
    animaux:     [["chiens","Chiens"],["chats","Chats"],["equitation","Équitation"],["aquario","Aquariophilie"],["ornitho","Ornithologie"]],
    actu:        [["geopolitique","Géopolitique"],["sciences","Sciences"],["climat","Climat"],["medias","Médias"]]
  };

  // Synonymes de RECHERCHE des passions. Le libellé du catalogue est toujours
  // cherché en plus — ceci ne fait qu'ajouter des portes d'entrée.
  var SYNONYMES = {
    musique: ["zik","concert","instrument","son"],
    photo: ["appareil","photographie","argentique","objectif"],
    voyage: ["vacances","aventure","monde","trip"],
    cuisine: ["food","recette","chef","gastronomie"],
    sport: ["fitness","running","entrainement","muscu"],
    litterature: ["livre","lecture","bouquin","roman"],
    cinema: ["film","serie","realisation","video"],
    tech: ["informatique","code","ia","numerique","geek"],
    art: ["dessin","peinture","creation","artiste"],
    jardinage: ["plantes","potager","jardin","nature"],
    metier: ["artisanat","bricolage","diy","fait main","artisan"],
    jeuxvideo: ["gaming","jeu","console","gamer"],
    yoga: ["bien-etre","meditation","zen","relaxation","sophrologie"],
    mode: ["style","vetement","fringues","couture"],
    danse: ["danser","choregraphie","bal"],
    podcast: ["audio","emission","micro","radio"],
    moto: ["deux roues","scooter","biker","roadtrip"],
    animaux: ["chien","chat","animalier","pet"],
    actu: ["news","information","journal","monde","politique"]
  };

  // Les 12 passions mises en avant dans le panneau (§ « 10 à 12 passions
  // populaires »). Filtrées contre le catalogue réel : une passion retirée du
  // socle ne doit pas laisser un trou.
  var POPULAIRES = ["musique","sport","cuisine","voyage","photo","art","cinema","tech","jeuxvideo","yoga","litterature","moto"];

  function catalogue() {
    try {
      if (typeof allPassions === "function") {
        var l = allPassions();
        if (Array.isArray(l) && l.length) return l;
      }
    } catch (e) {}
    try { if (typeof PASSIONS !== "undefined" && Array.isArray(PASSIONS)) return PASSIONS; } catch (e) {}
    return [];
  }

  // ⚠️ `passionById()` NE REND JAMAIS `null` : sur un identifiant inconnu elle
  // rend un objet de repli `{ emoji: "✨", label: "Passion", … }` SANS `id`.
  // L'utiliser comme test d'existence rendait donc TOUJOURS vrai — et la
  // migration transférait au compte des identifiants morts, produisant un filtre
  // de fil qui ne montre rien, sans explication. Mesuré par le test de
  // migration, pas déduit.
  //
  // Le seul discriminant fiable est la liste BLANCHE du référentiel
  // (`estPassionCanonique`, ADR-010) — ni le drapeau `custom`, ni le préfixe
  // `custom_`, qui ne couvrent ni « autre », ni « test », ni la chaîne vide.
  function passionConnue(id) {
    if (typeof id !== "string" || !id) return false;
    try { if (typeof estPassionCanonique === "function") return estPassionCanonique(id); } catch (e) {}
    var l = catalogue();
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return true;
    return false;
  }

  // Les métadonnées d'affichage d'une passion CONNUE. Rend `null` pour tout le
  // reste — c'est ce que `passionById` aurait dû faire.
  function metaPassion(id) {
    if (!passionConnue(id)) return null;
    try { if (typeof passionById === "function") return passionById(id) || null; } catch (e) {}
    var l = catalogue();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  function specialitesDe(passionId) {
    var brut = SPECIALITES[passionId];
    if (!Array.isArray(brut)) return [];
    return brut.map(function (s) { return { id: passionId + ":" + s[0], label: s[1], passion: passionId }; });
  }

  // Une spécialité n'existe que rattachée à une passion VIVANTE du catalogue :
  // c'est ce qui garantit qu'un identifiant retenu par la migration désigne
  // toujours quelque chose. Format `"<passion>:<specialite>"`.
  function specialiteValide(id) {
    if (typeof id !== "string") return false;
    var i = id.indexOf(":");
    if (i <= 0) return false;
    var p = id.slice(0, i), s = id.slice(i + 1);
    if (!metaPassion(p)) return false;
    var l = SPECIALITES[p];
    if (!Array.isArray(l)) return false;
    for (var k = 0; k < l.length; k++) if (l[k][0] === s) return true;
    return false;
  }

  function passionDeSpecialite(id) {
    var i = String(id || "").indexOf(":");
    return i > 0 ? String(id).slice(0, i) : "";
  }

  // Normalisation de recherche : minuscules, accents retirés. `normalize` est
  // disponible partout où l'app tourne (iOS 10.3+, Chrome 34+) ; le repli ne
  // sert qu'aux environnements exotiques et dégrade sans casser.
  function norm(s) {
    var t = String(s || "").toLowerCase();
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t.trim();
  }

  // Recherche COMMUNE passions / spécialités / synonymes (exigence du lot).
  // Rend une liste de passions à afficher, chacune éventuellement accompagnée
  // des spécialités qui ont provoqué la correspondance.
  function chercher(terme) {
    var q = norm(terme);
    var liste = catalogue();
    if (!q) return liste.map(function (p) { return { passion: p, specialites: [] }; });
    var out = [];
    liste.forEach(function (p) {
      var touche = norm(p.label).indexOf(q) !== -1 || norm(p.id).indexOf(q) !== -1;
      if (!touche) {
        var syn = SYNONYMES[p.id] || [];
        for (var i = 0; i < syn.length; i++) { if (norm(syn[i]).indexOf(q) !== -1) { touche = true; break; } }
      }
      var specs = specialitesDe(p.id).filter(function (s) { return norm(s.label).indexOf(q) !== -1; });
      if (touche || specs.length) out.push({ passion: p, specialites: specs });
    });
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. LIENS PROFONDS — priorité absolue, le tour est simplement DIFFÉRÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Les routages existants (`#reel=` en app-06, `#irl-event-` et
  // `#irl-checkin-` en app-07) attendent que l'application soit prête et
  // ouvrent eux-mêmes leur destination. Ce module ne les double PAS : il se
  // contente de ne rien poser par-dessus. La carte de bienvenue et le tour
  // attendent que l'écran redevienne le Fil, sans overlay ouvert.
  // ⚠️ LE HASH D'ARRIVÉE N'EST PAS CELUI QU'ON RETROUVE. Mesuré : ouvrir
  // `#irl-event-e1` amène `openEventDetails`, qui repose `#event-e1`. Un test
  // qui n'aurait retenu que la forme d'ENTRÉE aurait conclu que le lien profond
  // était perdu, alors que la destination était bien ouverte. Les deux formes
  // sont donc reconnues — mais la vérité, c'est l'ÉCRAN, pas le hash : voir
  // `ecranOccupe()`, qui regarde ce qui est réellement affiché.
  var RE_LIEN_PROFOND = /^#(reel=|irl-event-|irl-checkin-|event-|post-|profil-|conv-)/;

  function lienProfond() {
    try { return RE_LIEN_PROFOND.test(window.location.hash || ""); } catch (e) { return false; }
  }

  // Une destination est-elle en train d'occuper l'écran ? On ne pose jamais la
  // carte de bienvenue ni une bulle par-dessus : le lecteur de bobines est en
  // z-index 9999, la fiche d'activité en 200, les feuilles basses en 1200 —
  // une bulle « non bloquante » posée dessous serait dans le DOM et INVISIBLE.
  function ecranOccupe() {
    try {
      if (lienProfond()) return true;
      if (typeof reelsState !== "undefined" && reelsState && reelsState.open) return true;
    } catch (e) {}
    var m = document.getElementById("modalBackdrop");
    if (m && m.classList.contains("active")) return true;
    // ⚠️ La fiche d'activité N'A PAS de classe d'état : elle reste dans le DOM et
    // c'est `style.display` qui l'ouvre et la ferme (`openEventDetails`,
    // `closeEventDetails`). Chercher une classe « active » ou « open » rendait
    // TOUJOURS false — et une bulle d'aide était posée par-dessus une fiche
    // ouverte par lien profond, soit exactement ce que « le tour est différé »
    // interdit. Mesuré, pas déduit.
    var ev = document.getElementById("eventDetailPage");
    if (ev && ev.style && ev.style.display !== "none" && ev.style.display !== "") return true;
    // Feuille basse / panneau plein écran ouverts par un autre lot.
    if (document.querySelector(".ctx-tools-root.open, #convFullpage.active, #conv-fullpage.active")) return true;
    var l = document.getElementById("landing");
    if (l && l.classList.contains("active")) return true;
    var o = document.getElementById("onboarding");
    if (o && o.classList.contains("active")) return true;
    return false;
  }

  function ecranActif() {
    var s = document.querySelector(".screen.active");
    return s ? String(s.id || "").replace(/^screen-/, "") : "";
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. CONTENU PUBLIC EN LECTURE SEULE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // La policy « Lecture respectant les comptes privés » (migration_posts_privacy_rls)
  // autorise déjà, SANS session, la lecture des publications dont l'auteur n'est
  // pas privé : `auth.uid()` vaut NULL et la deuxième branche du OU suffit. On
  // utilise donc les VRAIES données publiques — aucune RLS n'est desserrée, et
  // aucun contenu privé, « abonnés uniquement » ou de conversation n'est demandé.
  //
  // ⚠️ Ce chemin ne passe SURTOUT PAS par `supaInit()`, qui écrit : il upserte la
  // ligne `profiles` du compte courant (`supaEnsureProfileExists`) et déclenche
  // `supaSaveUserState`. En mode invité, MY_UID est nul et ces écritures seraient
  // soit refusées, soit — pire — attribuées à l'identifiant d'un compte
  // précédemment vu sur cet appareil.
  var _contenuCharge = false;

  function chargerContenuPublic() {
    if (_contenuCharge) return;
    _contenuCharge = true;
    var s = etat();
    if (!s) return;
    // Lecture seule, best-effort : un échec laisse le contenu de démonstration
    // en place, ce qui reste un fil vivant. Aucun `catch` muet — on trace.
    try {
      if (typeof supaLoadPosts === "function") {
        supaLoadPosts().then(function (posts) {
          if (!Array.isArray(posts) || !posts.length) return;
          var s2 = etat(); if (!s2) return;
          s2.supabasePosts = posts;
          rendreFil();
        }).catch(function (e) { journal("posts publics", e); });
      }
    } catch (e) { journal("posts publics", e); }
    try {
      if (typeof supaLoadEvents === "function") {
        supaLoadEvents().then(function (evs) {
          if (!Array.isArray(evs) || !evs.length) return;
          var s2 = etat(); if (!s2) return;
          // Même fusion que `supaLoadAll` : les activités serveur priment, les
          // locales qu'elles ne recouvrent pas restent.
          var ids = {}; evs.forEach(function (e) { ids[e.id] = 1; });
          var locales = (s2.seed.events || []).filter(function (e) { return !ids[e.id]; });
          s2.seed.events = evs.concat(locales);
          if (ecranActif() === "irl") { try { renderIRL(); } catch (e) {} }
        }).catch(function (e) { journal("activités publiques", e); });
      }
    } catch (e) { journal("activités publiques", e); }
  }

  // ⚠️ Un `catch(e){}` muet sur un chemin de rendu a déjà coûté six jours de fil
  // vide (bug `diagLog`). Tout échec de ce module passe donc par ici.
  function journal(quoi, e) {
    try { if (typeof diagLog === "function") diagLog("first-run: " + quoi + " — " + (e && e.message ? e.message : e)); } catch (_) {}
  }

  function rendreFil() {
    try { if (ecranActif() === "feed" && typeof renderFeed === "function") renderFeed(); } catch (e) { journal("renderFeed", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. CONTENU DE DÉMONSTRATION — étiqueté « Exemple PASSIO »
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le contenu de démonstration (`state.seed`, app-01) couvre déjà les 19
  // passions et tous les formats demandés : photo, vidéo, création personnelle,
  // passion sportive, passion créative, activité IRL, profil public. On ne le
  // duplique donc pas — on le SIGNALE, ce qui est le seul manque : rien ne le
  // distinguait d'un contenu réel.
  //
  // ⚠️ L'étiquette n'est posée QUE pour un visiteur (`estVisiteur()`), et donc
  // jamais pour un compte existant : le drapeau coupé rend le fil à l'octet près.
  // `_source` est posé par `allFeedPosts` (app-02) : "seed" = contenu de
  // démonstration, "supabase" = publication réelle, "me" = la mienne. C'est le
  // SEUL discriminant — deviner d'après la forme de l'identifiant étiquetterait
  // un jour une vraie publication comme un exemple.
  function estDemo(p) {
    return !!p && p._source === "seed";
  }

  // Identifiants du contenu de démonstration, pour l'étiquette et pour interdire
  // la participation à une activité fictive.
  function evenementDemo(ev) {
    if (!ev) return false;
    var id = String(ev.id || "");
    // Une activité venue du serveur porte un uuid ; celles du seed portent des
    // identifiants courts et lisibles posés par `buildSeed` (« e1 », « e2 »…).
    if (/^e\d+$/.test(id)) return true;
    if (String(ev.organizerId || "").indexOf("u_") === 0) return true;
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. CARTE DE BIENVENUE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ POSÉE EN FRÈRE DE `#feedList`, JAMAIS DEDANS. `renderFeed` réécrit
  // `#feedList.innerHTML` en entier (et `renderProfileStrip` fait de même avec
  // `#profileStrip`, cache `_lastHtml` compris) : rien d'injecté à l'intérieur
  // n'y survit — c'est le piège ① du lot UI-7. Et le fenêtrage du Fil
  // (`feed_window_v1`) remplace en plus le contenu de chaque carte à la
  // réhydratation. En frère, la carte ne dépend d'aucun de ces cycles.
  // ⚠️ FERMER LA CARTE EST UNE DÉCISION DE SESSION, PAS UNE DÉCISION DÉFINITIVE.
  //
  // La première version écrivait `prefs().bienvenue = "fermee"` dans
  // `localStorage` : la carte ne revenait alors JAMAIS. Benjamin l'a fermée pour
  // « réessayer » et s'est retrouvé sans aucun moyen de rouvrir le panneau de
  // passions — la seule autre porte étant une entrée du menu Paramètres, que
  // personne ne va chercher. Le parcours devenait un aller simple, et le panneau
  // n'a tout simplement jamais été vu.
  //
  // Tant qu'AUCUN COMPTE n'existe, rien n'est acquis : les choix ne vivent que
  // sur cet appareil, et la carte est le rappel de ce fait autant que la porte
  // du panneau. Elle revient donc à chaque nouvelle visite, et la fermeture ne
  // vaut que pour la session en cours. Dès qu'un compte existe, `estVisiteur()`
  // devient faux et la carte ne se pose plus du tout.
  var CLE_BIENVENUE_SESSION = "passio_first_run_bienvenue_fermee";

  function bienvenueFermeeCetteSession() {
    try { return sessionStorage.getItem(CLE_BIENVENUE_SESSION) === "1"; } catch (e) { return false; }
  }

  function marquerBienvenueFermee() {
    try { sessionStorage.setItem(CLE_BIENVENUE_SESSION, "1"); } catch (e) {}
  }

  function carteBienvenueHTML() {
    // Le message suit l'état réel. Répéter « Bienvenue sur PASSIO » à quelqu'un
    // qui a DÉJÀ choisi ses passions serait sourd : à ce stade, ce qu'il ignore
    // n'est plus ce qu'est PASSIO, c'est que ses choix ne vivent que sur cet
    // appareil tant qu'il n'a pas de compte.
    var dejaChoisi = prefs().passions.length > 0;
    var titre = dejaChoisi ? "Tes passions sont sur cet appareil" : "Bienvenue sur PASSIO";
    var texte = dejaChoisi
      ? "Crée ton compte pour les garder, ou continue d'explorer."
      : "Tout ce que tu aimes, au même endroit.";
    var principal = dejaChoisi ? "Modifier mes passions" : "Personnaliser mon expérience";
    var secondaire = dejaChoisi ? "Plus tard" : "Explorer d'abord";
    return ''
      + '<section class="fr-welcome" id="frWelcome" role="region" aria-labelledby="frWelcomeTitle">'
      +   '<button type="button" class="fr-welcome-close" onclick="PassioFirstRun.fermerBienvenue()" aria-label="Fermer la carte de bienvenue">×</button>'
      +   '<div class="fr-welcome-title" id="frWelcomeTitle">' + escapeHtml(titre) + '</div>'
      +   '<div class="fr-welcome-text">' + escapeHtml(texte) + '</div>'
      +   '<div class="fr-welcome-actions">'
      +     '<button type="button" class="btn primary fr-welcome-cta" onclick="PassioFirstRun.ouvrirPersonnalisation(\'bienvenue\')">' + escapeHtml(principal) + '</button>'
      +     '<button type="button" class="btn ghost fr-welcome-alt" onclick="PassioFirstRun.fermerBienvenue()">' + escapeHtml(secondaire) + '</button>'
      +   '</div>'
      // ⚠️ TROISIÈME LIGNE, ET PAS UN TROISIÈME BOUTON DANS LA RANGÉE : les
      // deux actions ci-dessus partagent une rangée en `flex: 1 1 auto`, un
      // troisième bouton y écraserait les libellés. Ce lien est la seule porte
      // VISIBLE, sans geste préalable, vers le compte déjà créé : le gate
      // « J'ai déjà un compte » demande, lui, d'avoir tenté un like ou un
      // commentaire (défaut vécu le 2026-09-02).
      +   '<button type="button" class="fr-welcome-signin" onclick="PassioFirstRun.allerConnexion(\'deja_compte\')">J\'ai déjà un compte — me connecter</button>'
      + '</section>';
  }

  function poserBienvenue() {
    if (!estVisiteur()) return false;
    var p = prefs();
    // Fermée dans CETTE session : on n'insiste pas. Elle reviendra à la
    // prochaine visite, tant qu'aucun compte n'existe (cf. la note ci-dessus).
    if (bienvenueFermeeCetteSession()) return false;
    if (document.getElementById("frWelcome")) return true;
    if (ecranOccupe() || ecranActif() !== "feed") return false;
    var liste = document.getElementById("feedList");
    if (!liste || !liste.parentNode) return false;
    var hote = document.createElement("div");
    hote.innerHTML = carteBienvenueHTML();
    var carte = hote.firstChild;
    liste.parentNode.insertBefore(carte, liste);
    if (p.bienvenue !== "vue") { p.bienvenue = "vue"; sauverPrefs(); }
    return true;
  }

  function fermerBienvenue() {
    var el = document.getElementById("frWelcome");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    marquerBienvenueFermee();
    // La carte partie, la première indication contextuelle peut prendre sa place.
    planifierTour();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. PANNEAU « QU'EST-CE QUI TE PASSIONNE ? »
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Réutilise `openModal` — la feuille basse maison, qui injecte déjà son « × »
  // et se ferme au fond et à Échap. Aucune seconde identité visuelle.
  //
  // ⚠️ Tous les boutons sont des `<button>` NATIFS, jamais des
  // `<div role="button">`. app-08 porte un délégué clavier générique qui active
  // tout `[role="button"]` non natif : un second écouteur, ou un `role="button"`
  // portant son propre `onkeydown`, produirait DEUX activations pour une touche
  // — et une bascule s'annulerait, donc la touche ne ferait plus rien du tout.
  // Les natifs sont explicitement exclus par ce délégué.
  var _panneauTout = false;   // « Voir toutes les passions » déplié ?
  var _panneauQuery = "";
  var _selPassions = null;    // sélection EN COURS dans le panneau
  var _selSpecialites = null;
  var _panneauOrigine = "";

  function ouvrirPersonnalisation(origine) {
    _panneauOrigine = String(origine || "menu");
    var p = prefs();
    // Amorce sur ce qui est déjà choisi — le panneau est aussi l'écran de
    // MODIFICATION (« Tu pourras tout modifier ensuite »).
    _selPassions = {};
    (p.passions.length ? p.passions : passionsDuFil()).forEach(function (id) { _selPassions[id] = 1; });
    _selSpecialites = {};
    p.specialites.forEach(function (id) { _selSpecialites[id] = 1; });
    _panneauTout = false;
    _panneauQuery = "";
    if (_panneauOrigine === "bienvenue") tel("welcome_personalize_clicked", {});
    try { openModal(panneauHTML()); } catch (e) { journal("ouverture du panneau", e); return; }
    setTimeout(function () {
      var champ = document.getElementById("frSearch");
      if (champ) { try { champ.focus(); } catch (e) {} }
    }, 60);
  }

  function passionsDuFil() {
    var s = etat();
    if (!s || !Array.isArray(s.selectedFeedPassions)) return [];
    return s.selectedFeedPassions.slice();
  }

  function nbSelection() { return Object.keys(_selPassions || {}).length; }

  function panneauHTML() {
    return ''
      + '<div class="modal-handle"></div>'
      + '<div class="modal-title">Qu\'est-ce qui te passionne ?</div>'
      + '<div class="modal-subtitle">Choisis quelques sujets. Tu pourras tout modifier ensuite.</div>'
      + '<div class="fr-search-wrap">'
      +   '<input type="search" id="frSearch" class="input fr-search" autocomplete="off"'
      +     ' placeholder="Chercher une passion, une spécialité…"'
      +     ' aria-label="Chercher une passion ou une spécialité"'
      +     ' oninput="PassioFirstRun.chercherDansPanneau(this.value)"/>'
      + '</div>'
      + '<div id="frGrid" class="fr-grid">' + grilleHTML() + '</div>'
      + '<div id="frSpecs" class="fr-specs">' + specialitesHTML() + '</div>'
      + '<div class="fr-panel-footer">'
      +   '<button type="button" id="frValider" class="btn primary block fr-valider"'
      +     ' onclick="PassioFirstRun.validerPersonnalisation()">' + libelleValidation() + '</button>'
      +   '<button type="button" class="btn ghost block fr-revoir" onclick="PassioFirstRun.relancerTour()">Revoir les repères</button>'
      + '</div>';
  }

  function libelleValidation() {
    var n = nbSelection();
    if (!n) return "Choisis au moins une passion";
    return "Voir mon fil (" + n + ")";
  }

  // Grille : les 12 populaires par défaut, le catalogue entier une fois déplié
  // ou dès qu'une recherche est en cours.
  function grilleHTML() {
    var resultats = chercher(_panneauQuery);
    var visibles;
    if (_panneauQuery) {
      visibles = resultats;
    } else if (_panneauTout) {
      visibles = resultats;
    } else {
      var rang = {};
      POPULAIRES.forEach(function (id, i) { rang[id] = i; });
      visibles = resultats
        .filter(function (r) { return rang[r.passion.id] !== undefined; })
        .sort(function (a, b) { return rang[a.passion.id] - rang[b.passion.id]; });
    }
    if (!visibles.length) {
      return '<div class="fr-vide">Aucune passion ne correspond. Essaie un autre mot.</div>';
    }
    var html = visibles.map(function (r) { return tuileHTML(r.passion); }).join("");
    if (!_panneauQuery && !_panneauTout) {
      html += '<button type="button" class="fr-tile fr-tile-more" onclick="PassioFirstRun.voirToutes()">'
            + '<span class="fr-tile-emoji" aria-hidden="true">➕</span>'
            + '<span class="fr-tile-label">Voir toutes les passions</span></button>';
    }
    return html;
  }

  function tuileHTML(p) {
    var choisie = !!(_selPassions && _selPassions[p.id]);
    return '<button type="button" class="fr-tile' + (choisie ? " is-on" : "") + '"'
      + ' data-fr-passion="' + escapeHtml(p.id) + '"'
      + ' aria-pressed="' + (choisie ? "true" : "false") + '"'
      + ' onclick="PassioFirstRun.basculerPassion(\'' + escapeJsArg(p.id) + '\')">'
      + '<span class="fr-tile-emoji" aria-hidden="true">' + escapeHtml(p.emoji || "✨") + '</span>'
      + '<span class="fr-tile-label">' + escapeHtml(p.label || "Passion") + '</span>'
      + '</button>';
  }

  // Spécialités des passions RETENUES : « les spécialités rattachées à une
  // passion » n'ont de sens qu'une fois la passion choisie.
  function specialitesHTML() {
    var ids = Object.keys(_selPassions || {});
    if (!ids.length) return "";
    var blocs = ids.map(function (pid) {
      var meta = metaPassion(pid);
      var specs = specialitesDe(pid);
      if (!meta || !specs.length) return "";
      return '<div class="fr-spec-bloc">'
        + '<div class="fr-spec-titre">' + escapeHtml((meta.emoji || "") + " " + (meta.label || "")) + '</div>'
        + '<div class="fr-spec-row">'
        + specs.map(function (s) {
            var on = !!(_selSpecialites && _selSpecialites[s.id]);
            return '<button type="button" class="fr-chip' + (on ? " is-on" : "") + '"'
              + ' data-fr-spec="' + escapeHtml(s.id) + '"'
              + ' aria-pressed="' + (on ? "true" : "false") + '"'
              + ' onclick="PassioFirstRun.basculerSpecialite(\'' + escapeJsArg(s.id) + '\')">'
              + escapeHtml(s.label) + '</button>';
          }).join("")
        + '</div></div>';
    }).filter(Boolean).join("");
    if (!blocs) return "";
    return '<div class="fr-spec-intro">Affine si tu veux — c\'est facultatif.</div>' + blocs;
  }

  function rafraichirPanneau() {
    var g = document.getElementById("frGrid");
    if (g) g.innerHTML = grilleHTML();
    var s = document.getElementById("frSpecs");
    if (s) s.innerHTML = specialitesHTML();
    var v = document.getElementById("frValider");
    if (v) { v.textContent = libelleValidation(); v.disabled = nbSelection() === 0; }
  }

  function basculerPassion(id) {
    if (!_selPassions) _selPassions = {};
    if (_selPassions[id]) {
      delete _selPassions[id];
      // Une spécialité orpheline n'a plus de parent : elle part avec.
      Object.keys(_selSpecialites || {}).forEach(function (sid) {
        if (passionDeSpecialite(sid) === id) delete _selSpecialites[sid];
      });
    } else {
      _selPassions[id] = 1;
    }
    rafraichirPanneau();
  }

  // « Choisir une spécialité sélectionne automatiquement sa passion principale. »
  function basculerSpecialite(id) {
    if (!specialiteValide(id)) return;
    if (!_selSpecialites) _selSpecialites = {};
    if (_selSpecialites[id]) {
      delete _selSpecialites[id];
    } else {
      _selSpecialites[id] = 1;
      var parent = passionDeSpecialite(id);
      if (parent && _selPassions && !_selPassions[parent]) _selPassions[parent] = 1;
    }
    rafraichirPanneau();
  }

  function voirToutes() { _panneauTout = true; rafraichirPanneau(); }

  function chercherDansPanneau(v) {
    _panneauQuery = String(v || "");
    // ⚠️ La recherche libre n'est JAMAIS envoyée à la télémétrie (§ « ne jamais
    // envoyer une recherche libre »). Aucun appel `tel()` ici, délibérément.
    rafraichirPanneau();
  }

  function validerPersonnalisation() {
    var ids = Object.keys(_selPassions || {});
    if (!ids.length) { try { toast("Choisis au moins une passion"); } catch (e) {} return; }
    var p = prefs();
    p.passions = ids.slice();
    p.specialites = Object.keys(_selSpecialites || {}).filter(specialiteValide);
    if (!p.debut) p.debut = Date.now();
    p.migre = false; // de nouveaux choix : la migration a de nouveau du travail
    // La carte a joué son rôle POUR CETTE SESSION : elle invitait à
    // personnaliser, c'est fait, et la laisser en tête du fil occuperait la
    // place du premier repère. Elle reviendra à la prochaine visite — sous une
    // autre forme, « Tes passions sont sur cet appareil » — tant qu'aucun compte
    // ne les met à l'abri.
    p.bienvenue = "vue";
    sauverPrefs();
    marquerBienvenueFermee();
    var carte = document.getElementById("frWelcome");
    if (carte && carte.parentNode) carte.parentNode.removeChild(carte);
    appliquerPrefs();
    try { closeModal(); } catch (e) {}
    // « Dès validation, le Fil doit visuellement se personnaliser immédiatement.
    //   Aucun rechargement ou passage par un second onboarding. »
    try { if (typeof goTo === "function" && ecranActif() !== "feed") goTo("feed"); } catch (e) {}
    rendreFil();
    try { if (typeof renderProfileStrip === "function") renderProfileStrip(); } catch (e) {}
    tel("guest_passions_saved", { n: p.passions.length, s: p.specialites.length, from: _panneauOrigine });
    try { toast("Ton fil est à toi ✨"); } catch (e) {}
    planifierTour();
  }

  // Applique les préférences du visiteur au moteur EXISTANT du fil. Aucun
  // second moteur : `setFeedPassions` (app-02) reste le seul point d'écriture
  // des intérêts, et `_activeFeedPassions` la seule source lue par le rendu.
  function appliquerPrefs() {
    var s = etat();
    if (!s) return;
    var p = prefs();
    var valides = p.passions.filter(function (id) { return !!metaPassion(id); });
    if (!valides.length) return;
    try { if (typeof setFeedPassions === "function") setFeedPassions(valides); } catch (e) { journal("setFeedPassions", e); }
    if (p.intents && p.intents.length) {
      try { if (typeof setFeedIntents === "function") setFeedIntents(p.intents); } catch (e) { journal("setFeedIntents", e); }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 11. ÉCHAPPEMENT — les helpers maison, appelés PAR LEUR NOM
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ AUCUNE ENVELOPPE. La première version de ce module passait par des alias
  // locaux (`escHtml` / `escJs`) délégant aux helpers d'app-02 avec un repli.
  // `audit:echappement` l'a refusée, et il a raison : un handler inline doit se
  // relire À L'ŒIL, sans remonter la provenance de la chaîne — c'est la même
  // règle qui a fait réécrire `_passionTileOnclick` (ADR-011) et
  // `_passionFilterRowHTML` (lot UI-8) en toutes lettres.
  //
  // Les trois helpers sont donc appelés directement, chacun selon le CONTEXTE :
  //   `escapeHtml`  → texte HTML ;
  //   `escapeJsArg` → argument de chaîne JS simple-quotée dans un `onclick`
  //                   (le HTML décode `&#39;` AVANT le parse JS : `escapeHtml`
  //                   seul y casse le bouton) ;
  //   `safeUrlAttr` → URL d'un autre utilisateur (aucune ici : ce module n'en
  //                   rend aucune).
  //
  // Ils vivent dans app-02, donc absents à l'ÉVALUATION de ce fichier en
  // production (bloc app chargé après). Ce n'est pas un problème : aucune des
  // fonctions ci-dessous n'est atteignable avant que l'application tourne —
  // toutes passent par `estVisiteur()`, qui exige `state`, ou sont appelées par
  // un moteur d'app-02 lui-même.

  // ══════════════════════════════════════════════════════════════════════════
  // 12. GATE D'AUTHENTIFICATION — `requireAuthentication(actionContext)`
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Point d'entrée UNIQUE de toutes les actions engageantes. Rend `true` quand
  // l'action peut continuer, `false` quand elle doit s'arrêter — et affiche
  // alors une fenêtre qui EXPLIQUE l'action, jamais un simple « Connecte-toi ».
  //
  // Contrat d'appel, à respecter partout :
  //     if (!requireAuthentication("suivre")) return;
  //
  // Hors mode invité (drapeau coupé, ou compte existant) elle rend TOUJOURS
  // `true` sans rien afficher : le comportement des comptes existants n'est pas
  // modifié d'un octet.
  var CONTEXTES = {
    aimer:       { titre: "Crée ton compte pour aimer cette publication" },
    commenter:   { titre: "Crée ton compte pour commenter" },
    suivre:      { titre: "Crée ton compte pour suivre cette personne" },
    message:     { titre: "Crée ton compte pour envoyer un message" },
    publier:     { titre: "Crée ton compte pour publier ta création" },
    bobine:      { titre: "Crée ton compte pour publier ta bobine" },
    activite:    { titre: "Crée ton compte pour proposer une activité" },
    rejoindre:   { titre: "Crée ton compte pour participer à cette activité" },
    preferences: { titre: "Crée ton compte pour conserver tes passions" }
  };
  var TEXTE_COMMUN = "Tes passions et tes préférences seront conservées.";

  function requireAuthentication(actionContext) {
    if (!estVisiteur()) return true;
    var ctx = CONTEXTES[actionContext] ? actionContext : "preferences";
    memoriserRetour(ctx);
    tel("guest_auth_gate_shown", { ctx: ctx });
    try { openModal(gateHTML(ctx)); } catch (e) { journal("gate " + ctx, e); }
    return false;
  }

  function gateHTML(ctx) {
    return ''
      + '<div class="modal-handle"></div>'
      + '<div class="modal-title fr-gate-title">' + escapeHtml(CONTEXTES[ctx].titre) + '</div>'
      + '<div class="modal-subtitle">' + escapeHtml(TEXTE_COMMUN) + '</div>'
      + '<div class="fr-gate-pitch">' + escapeHtml(PITCH) + '</div>'
      + '<div class="fr-gate-actions">'
      +   '<button type="button" class="btn primary block" onclick="PassioFirstRun.allerInscription(\'' + escapeJsArg(ctx) + '\')">Créer mon compte</button>'
      +   '<button type="button" class="btn ghost block" onclick="PassioFirstRun.allerConnexion(\'' + escapeJsArg(ctx) + '\')">J\'ai déjà un compte</button>'
      +   '<button type="button" class="btn ghost block fr-gate-stay" onclick="closeModal()">Continuer à explorer</button>'
      + '</div>';
  }

  // ── Mémorisation du contexte, pour le RETOUR STABLE après authentification ──
  //
  // On ne mémorise QU'UNE ROUTE : l'écran, le hash, et l'action demandée. Jamais
  // un brouillon, jamais un média, jamais le texte d'un message — ni ici, ni
  // dans `localStorage` (§ « Ne pas transférer de média, de message ou de
  // publication non validée »).
  function memoriserRetour(ctx) {
    var p = prefs();
    var h = "";
    try { h = window.location.hash || ""; } catch (e) {}
    p.retour = {
      screen: ecranActif() || "feed",
      hash: RE_LIEN_PROFOND.test(h) ? h : "",
      action: ctx || "",
      scroll: mesurerScroll()
    };
    sauverPrefs();
  }

  function mesurerScroll() {
    try {
      var m = document.getElementById("appMain");
      var v = m ? m.scrollTop : 0;
      return (typeof v === "number" && isFinite(v)) ? Math.round(v) : 0;
    } catch (e) { return 0; }
  }

  // ── Bascule vers l'inscription / la connexion ────────────────────────────
  //
  // ⚠️ AUCUN SECOND SYSTÈME D'AUTH. On rouvre l'onboarding EXISTANT à son étape
  // « auth » et on laisse `onbDoAuth` faire tout le travail : validation de
  // format, `signUp`/`signInWithPassword`, confirmation d'e-mail par Brevo,
  // anti-énumération, lien de renvoi. Rien n'est désactivé, rien n'est doublé.
  //
  // ⚠️ ORDRE OBLIGATOIRE : `switchAuthTab` D'ABORD, message ensuite —
  // `switchAuthTab` remet `#authMsg` à zéro, donc tout ce qu'on veut voir
  // survivre à la bascule se pose APRÈS elle (piège ① du 2026-08-30).
  function ouvrirAuth(mode, ctx) {
    try { closeModal(); } catch (e) {}
    var onb = document.getElementById("onboarding");
    if (!onb) return;
    onb.classList.add("active");
    var landing = document.getElementById("landing");
    if (landing) landing.classList.remove("active");
    // ⚠️ LE FORMULAIRE D'AUTH VIT SUR L'ÉTAPE « splash », PAS SUR « auth ».
    // L'étape `data-onb-step="auth"` existe encore dans le balisage mais porte
    // `style="display:none!important"` : c'est un alias mort. L'ouvrir
    // afficherait un écran VIDE — l'onboarding paraîtrait cassé sans la moindre
    // erreur. Et `onbStepIdx` doit repartir de 0, sinon le `onbNext()` que
    // `onbDoAuth` déclenche en cas de succès sauterait l'âge ou le prénom.
    try {
      if (typeof showOnbStep === "function") showOnbStep("splash");
      onbStepIdx = 0;
    } catch (e) { journal("ouverture auth", e); }
    try { if (typeof switchAuthTab === "function") switchAuthTab(mode); } catch (e) {}
    // Rappel du POURQUOI, posé APRÈS switchAuthTab (qui l'aurait effacé).
    try {
      var msg = document.getElementById("authMsg");
      if (msg && ctx && CONTEXTES[ctx]) {
        msg.className = "onb-auth-msg";
        msg.textContent = CONTEXTES[ctx].titre + " " + TEXTE_COMMUN;
      }
    } catch (e) {}
    poserSortieExploration();
    if (mode === "signup") tel("guest_signup_started", { ctx: ctx || "" });
    // Sans cette mesure, les trois portes vers un compte EXISTANT (carte de
    // bienvenue, Paramètres, déconnexion) seraient indiscernables de portes
    // cassées : rien ne comptait les connexions, `guest_signup_started` étant
    // réservé à la création. `ctx` reste une liste fermée de mots-clés.
    else tel("guest_signin_started", { ctx: ctx || "" });
  }

  // ⚠️ SANS CETTE PORTE, LE PARCOURS SE REFERME. L'onboarding est un écran plein
  // sans sortie : une fois dedans, un visiteur qui change d'avis — ou qui vient
  // de créer un compte et doit attendre son e-mail de confirmation — n'a plus
  // aucun moyen de revenir au fil. « Continuer à explorer » est une des trois
  // issues promises par le gate : elle doit rester vraie une fois l'écran ouvert.
  function poserSortieExploration() {
    if (document.getElementById("frBackToExplore")) return;
    var onb = document.getElementById("onboarding");
    if (!onb) return;
    var b = document.createElement("button");
    b.type = "button";
    b.id = "frBackToExplore";
    b.className = "fr-back-explore";
    b.textContent = "← Continuer à explorer";
    b.addEventListener("click", retourExploration);
    onb.appendChild(b);
  }

  function retourExploration() {
    var b = document.getElementById("frBackToExplore");
    if (b && b.parentNode) b.parentNode.removeChild(b);
    var onb = document.getElementById("onboarding");
    if (onb) onb.classList.remove("active");
    var l = document.getElementById("landing");
    if (l) l.classList.remove("active");
    try { document.body.classList.add("screen-feed-active"); } catch (e) {}
    try { if (typeof goTo === "function") goTo("feed"); } catch (e) { journal("retour exploration", e); }
  }

  function allerInscription(ctx) { ouvrirAuth("signup", ctx); }
  function allerConnexion(ctx) { ouvrirAuth("signin", ctx); }

  // ══════════════════════════════════════════════════════════════════════════
  // 13. TOUR CONTEXTUEL — trois indications, pas un carrousel
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le tour historique (`TOUR_STEPS`, app-08) est un overlay plein écran de
  // plusieurs étapes qui masque l'application pour la décrire. Ici, chaque
  // indication est ANCRÉE à l'élément dont elle parle, ne bloque ni le
  // défilement ni le tap, se ferme, et se mémorise. Les trois sont
  // INDÉPENDANTES : chacune a son propre déclencheur, aucune n'attend son tour.
  //
  // ⚠️ PAS D'ÉCOUTEUR CLAVIER SUR UN `role="button"`. app-08 en porte déjà un,
  // générique, pour tout `[role="button"]` non natif. Les boutons ci-dessous
  // sont des `<button>` natifs, que ce délégué exclut explicitement : Entrée et
  // Espace passent par le navigateur, une seule fois.
  // Les quatre formulations courtes de la direction produit. Elles servent
  // d'accroche à l'indication qui parle de la surface concernée — jamais de
  // texte décoratif posé ailleurs.
  var FORMULES = {
    decouvrir: "Ce qui t'inspire",
    creer: "Ce que tu veux partager",
    rencontrer: "Ce que tu veux vivre",
    profil: "Tout ce qui te passionne"
  };

  // Le pitch principal. Il n'a PAS d'écran à lui : « l'application est
  // elle-même le pitch ». Il n'apparaît qu'au seul moment où il sert vraiment —
  // quand quelqu'un décide s'il crée un compte.
  var PITCH = "Toutes tes passions. Une seule identité. Découvre des contenus, "
            + "partage ce que tu aimes et rencontre des personnes pour vivre tes "
            + "passions dans le monde réel.";

  var ETAPES = {
    decouvrir: {
      accroche: FORMULES.decouvrir,
      titre: "Un Fil construit autour de tes passions",
      texte: "Mélange tes passions, tes envies et les personnes que tu suis.",
      cible: function () {
        return document.getElementById("feedPassionsBlock")
            || document.getElementById("profileStrip")
            || document.getElementById("feedList");
      }
    },
    rencontrer: {
      accroche: FORMULES.rencontrer,
      titre: "Passe du numérique au réel",
      texte: "Trouve des activités autour de toi, sans activer automatiquement ta position.",
      cible: function () {
        return document.querySelector("#screen-irl .irl-actionbar")
            || document.getElementById("eventList")
            || document.getElementById("screen-irl");
      }
    },
    creer: {
      accroche: FORMULES.creer,
      titre: "À toi de créer",
      texte: "Publie une idée, une bobine ou propose une activité IRL.",
      // ⚠️ LE BOUTON « CRÉER » VISIBLE N'EST PAS `.app-nav .nav-cta`. Le lot UI-1
      // (`ui-v2-shell.js`, actif par défaut) construit une barre NEUVE
      // `nav#appNavV2.app-nav-v2` et met la barre historique en `display:none` :
      // le sélecteur d'origine trouvait donc un nœud de rectangle NUL, la garde
      // `offsetParent` refusait l'ancrage, et l'indication ne se posait jamais —
      // sans erreur, sans symptôme. Mesuré, pas déduit. La V2 d'abord,
      // l'historique en repli pour que la coupure d'UI-1 reste servie.
      cible: function () {
        return document.querySelector(".app-nav-v2 .nav-v2-cta")
            || document.querySelector('.app-nav-v2 [data-v2-key="create"]')
            || document.querySelector(".app-nav .nav-cta");
      }
    },

    // ── Au-delà du premier tour ────────────────────────────────────────────
    // « Les explications de Profil, Messages et Studio ne font pas partie du
    // premier tour. Elles peuvent apparaître une seule fois lors de la première
    // ouverture de ces écrans. » Elles vivent donc dans la même table, avec la
    // même mémorisation et la même fermeture — mais AUCUNE n'est déclenchée par
    // `planifierTour()` : seule `surNavigation` les pose, à l'ouverture de leur
    // écran. C'est ce qui garantit que le premier tour reste à trois étapes.
    profil: {
      accroche: FORMULES.profil,
      titre: "Ton profil réunit tes passions",
      texte: "Une seule identité publique, et autant de passions que tu veux.",
      cible: function () { return document.getElementById("mainProfileCover") || document.getElementById("screen-profiles"); }
    },
    messages: {
      titre: "Tes conversations",
      texte: "Les échanges nés de tes passions se retrouvent ici.",
      cible: function () { return document.getElementById("screen-messages"); }
    },
    studio: {
      accroche: FORMULES.creer,
      titre: "Publie ce que tu veux",
      texte: "Un texte, une photo, une vidéo — la passion se choisit juste en dessous.",
      cible: function () { return document.getElementById("screen-studio"); }
    },

    // ── Aides AU GESTE ─────────────────────────────────────────────────────
    // Demandées par Benjamin après essai : « une petite bulle d'explication pour
    // toutes les fonctionnalités — les moods, les bulles de profil en haut… ».
    //
    // ⚠️ ELLES NE SONT PAS DES ÉTAPES DE TOUR, et c'est ce qui les rend
    // acceptables. Le lot remplace justement un tour long par des indications
    // contextuelles ; en empiler une par commande à l'ouverture reviendrait à
    // reconstruire le tutoriel qu'on vient de retirer, en pire — six bulles
    // d'affilée sur le premier écran. Chacune se déclenche donc au PREMIER
    // GESTE sur la commande dont elle parle : on explique ce qu'on vient de
    // toucher, au moment où la question se pose, une seule fois, jamais avant.
    // La garde `bulleVisible()` interdit qu'il y en ait deux à l'écran.
    passions: {
      titre: "Tes passions filtrent le Fil",
      texte: "Touche-en plusieurs : elles s'ADDITIONNENT, elles ne se remplacent pas.",
      cible: function () { return document.getElementById("profileStrip"); }
    },
    envies: {
      titre: "Ton envie du moment",
      texte: "Explorer, Apprendre, Idées, Rencontrer — ça s'ajoute à tes passions, ça ne les remplace pas.",
      cible: function () { return document.getElementById("feedIntentSelector") || document.getElementById("moodSelector"); }
    },
    stories: {
      titre: "Ce qui se passe maintenant",
      texte: "Des moments courts, publiés dans la journée. Ils disparaissent au bout de 24 h.",
      cible: function () { return document.getElementById("storiesRowFeed"); }
    },
    // ⚠️ PAS D'AIDE « BOBINES », ET C'EST DÉLIBÉRÉ. Elle a existé, elle a été
    // retirée le 2026-09-01 après mesure : elle ne pouvait PAS s'afficher.
    // ① Son ancre n'existait pas. `.app-nav-v2 [data-v2-key="reels"]` ne matche
    //    rien — `DESTINATIONS` (ui-v2-shell) ne contient que discover, meet,
    //    create, messages et profile ; et le repli `.app-nav .nav-bobines`
    //    existe bien dans index.html mais vit dans la nav HISTORIQUE, que UI-1
    //    met en `display: none` : mesuré à 0×0, `offsetParent` nul, donc refusé
    //    par la garde de `montrerEtape`. Même piège que l'étape « Créer », qui
    //    visait `.app-nav .nav-cta` avant correction.
    // ② Et même avec une ancre valide, il n'y a aucun MOMENT où la montrer :
    //    toute porte vers les bobines ouvre le lecteur en z-index 9999, quand
    //    `.fr-tip` est à 9000. `ecranOccupe()` la refuserait donc — et relâcher
    //    cette garde pour un cas particulier rouvrirait exactement le défaut ④
    //    du lot (une bulle posée par-dessus une destination déjà ouverte).
    // Les bobines restent expliquées là où c'est vrai : la rangée d'actions
    // qu'UI-5 pose dans `.reel-info`, à l'intérieur du lecteur.
  };

  // Quelle aide au geste correspond à l'élément touché ? La correspondance se
  // fait par ZONE (un conteneur stable), jamais par le nœud exact : les rangées
  // de passions, d'envies et de stories sont repeintes en entier à chaque rendu.
  var ZONES_GESTE = [
    ["#profileStrip", "passions"],
    ["#feedIntentSelector", "envies"],
    ["#moodSelector", "envies"],
    ["#storiesRowFeed", "stories"]
  ];
  // ⚠️ SEULES CES TROIS ÉTAPES forment le premier tour. Ajouter une entrée à
  // `ETAPES` n'y change rien — il faudrait l'ajouter ici aussi, et le lot
  // l'interdit (« trois indications principales maximum »).
  var ORDRE_ETAPES = ["decouvrir", "rencontrer", "creer"];
  var ETAPES_ECRAN = { profiles: "profil", messages: "messages", studio: "studio" };

  function etapeVue(id) { return !!prefs().tour[id]; }
  function tourAbandonne() { return !!prefs().tour.abandonne; }

  function bulleVisible() { return !!document.querySelector(".fr-tip"); }

  function fermerBulle(raison) {
    var el = document.querySelector(".fr-tip");
    if (!el) return;
    var id = el.getAttribute("data-fr-tip") || "";
    if (el.parentNode) el.parentNode.removeChild(el);
    if (raison === "abandon") {
      var p = prefs();
      p.tour.abandonne = true;
      sauverPrefs();
      tel("tour_dismissed", { step: id });
    }
    // Le tour est fini quand les trois indications ont été vues.
    // ⚠️ « Terminé » se mesure sur les TROIS étapes du premier tour, jamais sur
    // `ETAPES` : les indications de Profil, Messages et Studio n'en font pas
    // partie et peuvent très bien n'être jamais vues.
    if (ORDRE_ETAPES.every(etapeVue) && !prefs().tour.termine) {
      var p2 = prefs();
      p2.tour.termine = true;
      sauverPrefs();
      tel("first_run_completed", { n: ORDRE_ETAPES.length });
    }
  }

  function montrerEtape(id) {
    if (!estVisiteur()) return false;
    var e = ETAPES[id];
    if (!e || etapeVue(id) || tourAbandonne() || bulleVisible()) return false;
    if (ecranOccupe()) return false;
    var cible = null;
    try { cible = e.cible(); } catch (_) { cible = null; }
    // `offsetParent` nul = élément dans un conteneur masqué : une bulle ancrée
    // là serait invisible (même garde que `montrerHint`, app-02).
    if (!cible || !cible.offsetParent) return false;
    var r = cible.getBoundingClientRect();
    if (!r.width && !r.height) return false;

    var bulle = document.createElement("div");
    bulle.className = "fr-tip";
    bulle.setAttribute("data-fr-tip", id);
    bulle.setAttribute("role", "dialog");
    bulle.setAttribute("aria-modal", "false");
    bulle.setAttribute("aria-labelledby", "frTipTitle");
    // Contenu strictement statique (constantes ci-dessus) — aucune donnée
    // utilisateur n'entre ici. Échappé quand même : la règle ne souffre pas
    // d'exception, et le jour où un libellé devient dynamique, c'est déjà bon.
    bulle.innerHTML = ''
      + (e.accroche ? '<div class="fr-tip-eyebrow">' + escapeHtml(e.accroche) + '</div>' : '')
      + '<div class="fr-tip-title" id="frTipTitle">' + escapeHtml(e.titre) + '</div>'
      + '<div class="fr-tip-text">' + escapeHtml(e.texte) + '</div>'
      + '<div class="fr-tip-actions">'
      +   '<button type="button" class="fr-tip-skip" onclick="PassioFirstRun.abandonnerTour()">Ne plus afficher</button>'
      +   '<button type="button" class="fr-tip-ok" onclick="PassioFirstRun.fermerBulle()">Compris</button>'
      + '</div>';

    // Ancrage borné à la fenêtre, en respectant les safe areas basses (la barre
    // de navigation occupe le bas de l'écran sur mobile).
    var largeur = Math.min(300, window.innerWidth - 24);
    document.body.appendChild(bulle);
    var h = bulle.offsetHeight || 120;
    var gauche = Math.max(12, Math.min(r.left, window.innerWidth - largeur - 12));
    var haut = r.bottom + 10;
    if (haut + h + 90 > window.innerHeight) haut = Math.max(12, r.top - h - 10);
    bulle.style.width = largeur + "px";
    bulle.style.left = Math.round(gauche) + "px";
    bulle.style.top = Math.round(haut) + "px";

    // Échap ferme la bulle. Écouteur porté par la BULLE, pas par `document` :
    // celui d'app-02 ferme déjà la modale sur Échap, et un second écouteur
    // global fermerait les deux d'un coup.
    bulle.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { ev.stopPropagation(); fermerBulle(); }
    });
    var ok = bulle.querySelector(".fr-tip-ok");
    if (ok) { try { ok.focus({ preventScroll: true }); } catch (_) { try { ok.focus(); } catch (__) {} } }

    var p = prefs();
    p.tour[id] = true;
    sauverPrefs();
    tel("tour_step_seen", { step: id });
    return true;
  }

  // ⚠️ ÉCOUTEUR DE CLIC SEULEMENT, JAMAIS DE CLAVIER. app-08 porte déjà un
  // délégué qui active tout `[role="button"]` non natif à Entrée/Espace en
  // appelant `el.click()` : la frappe nous parvient donc par ce clic-là, une
  // seule fois. Ajouter ici un second écouteur clavier produirait DEUX
  // déclenchements pour une touche — le piège documenté dans app-02.
  //
  // Ni `preventDefault`, ni `stopPropagation` : l'aide s'affiche APRÈS le geste,
  // elle ne le remplace pas. Le petit délai laisse le rendu se terminer, sinon
  // la bulle s'ancre sur une rangée que le repeint va déplacer.
  //
  // ⚠️ EN PHASE DE CAPTURE, ET C'EST OBLIGATOIRE. Une tuile de passion porte un
  // `onclick` inline qui appelle `toggleProfileFilter` → `renderFeed` →
  // `renderProfileStrip`, laquelle RÉÉCRIT `#profileStrip` en entier. En phase
  // bubbling, cet `onclick` a donc déjà tourné quand l'événement atteint
  // `document` : la tuile cliquée est DÉTACHÉE du document, et
  // `ev.target.closest("#profileStrip")` remonte dans un arbre orphelin sans
  // jamais trouver la zone. L'aide ne se posait jamais — mesuré, aucun symptôme
  // visible. Même famille que le piège d'UI-4A4, où une chip déplacée était
  // « arrachée par son propre clic ». En capture, on lit la cible AVANT que
  // quiconque n'ait pu la remplacer.
  var _gesteArme = false;

  function armerAidesAuGeste() {
    if (_gesteArme) return;
    _gesteArme = true;
    document.addEventListener("click", function (ev) {
      try {
        if (!estVisiteur() || tourAbandonne() || bulleVisible()) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        for (var i = 0; i < ZONES_GESTE.length; i++) {
          if (t.closest(ZONES_GESTE[i][0])) {
            var id = ZONES_GESTE[i][1];
            if (etapeVue(id)) return;
            setTimeout(function () { try { montrerEtape(id); } catch (e) { journal("aide " + id, e); } }, 450);
            return;
          }
        }
      } catch (e) { journal("aide au geste", e); }
    }, true);
  }

  // Déclencheur des étapes du Fil (1 et 3). L'étape « Rencontrer » a le sien,
  // posé à la première ouverture de l'écran IRL (cf. `surNavigation`).
  var _tourPlanifie = null;

  function planifierTour() {
    if (!estVisiteur() || tourAbandonne()) return;
    if (_tourPlanifie) clearTimeout(_tourPlanifie);
    // ⚠️ `setTimeout`, JAMAIS `requestAnimationFrame` : sur une page qui ne
    // compose pas de frames (onglet en arrière-plan, headless, machine
    // saturée), rAF ne part pas — l'indication ne serait jamais posée, en
    // silence. Piège payé au lot UI-3A.
    _tourPlanifie = setTimeout(function () {
      _tourPlanifie = null;
      if (ecranActif() !== "feed") return;
      if (document.getElementById("frWelcome")) return; // la carte parle déjà
      if (!etapeVue("decouvrir")) { montrerEtape("decouvrir"); return; }
      if (!etapeVue("creer")) montrerEtape("creer");
    }, 700);
  }

  function abandonnerTour() { fermerBulle("abandon"); }

  // « relançable depuis l'aide ou les options » : remet les trois indications à
  // zéro et repart de la première. Utilisable même quand le tour a été abandonné.
  function relancerTour() {
    var p = prefs();
    // Remet TOUT à zéro — les trois étapes du premier tour comme les aides au
    // geste. « Revoir les repères » doit rendre l'écran tel qu'un nouveau venu
    // le découvre, sinon l'entrée ment sur ce qu'elle fait.
    p.tour = {};
    sauverPrefs();
    try { closeModal(); } catch (e) {}
    fermerBulle();
    try { if (typeof goTo === "function" && ecranActif() !== "feed") goTo("feed"); } catch (e) {}
    planifierTour();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 14. MIGRATION DES PRÉFÉRENCES DU VISITEUR VERS LE COMPTE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // IDEMPOTENTE ET RELANÇABLE. Cinq propriétés exigées par le lot :
  //
  //  ① elle ne tourne qu'une fois utile — le drapeau `migre` est posé APRÈS
  //    l'écriture, donc une coupure réseau au milieu la laisse à refaire, et la
  //    refaire ne produit aucun doublon (fusion par ensemble) ;
  //  ② elle N'ÉCRASE PAS les choix déjà présents sur un compte existant : les
  //    passions du compte viennent D'ABORD, celles du visiteur s'ajoutent ;
  //  ③ elle fusionne et dédoublonne ;
  //  ④ elle nettoie les identifiants archivés ou inconnus — un filtre qui
  //    désigne une passion disparue vide l'écran sans explication ;
  //  ⑤ elle survit à une interruption : la source (`passio_first_run_v1`) est
  //    une clé SÉPARÉE de la cible (`state.selectedFeedPassions`), donc lisible
  //    tant que le travail n'est pas fait.
  //
  // ⚠️ Elle ne dépend PAS du drapeau. La confirmation d'e-mail ramène la
  // personne par un lien neuf, éventuellement sans le paramètre d'aperçu : si
  // des préférences d'invité existent, c'est qu'elles ont été créées sous le
  // parcours — les perdre parce que l'URL a changé serait le pire des deux
  // mondes. Rien à migrer ⇒ elle ne fait rien.
  function passionArchivee(id) {
    var s = etat();
    if (!s || !s.user || !Array.isArray(s.user.profiles)) return false;
    for (var i = 0; i < s.user.profiles.length; i++) {
      var pr = s.user.profiles[i];
      if (pr && pr.passion === id && pr.archived) return true;
    }
    return false;
  }

  function idsRetenus(liste) {
    var vus = {}, out = [];
    (liste || []).forEach(function (id) {
      if (typeof id !== "string" || !id) return;
      if (vus[id]) return;                 // ③ dédoublonnage
      if (!metaPassion(id)) return;        // ④ identifiant inconnu du catalogue
      if (passionArchivee(id)) return;     // ④ passion rangée par ce compte
      vus[id] = 1; out.push(id);
    });
    return out;
  }

  function migrerPreferences() {
    var s = etat();
    if (!s) return false;
    var p = prefs();
    var rien = !p.passions.length && !p.specialites.length && !p.intents.length;
    if (p.migre || rien) return false;

    // ② Les choix du compte d'abord, ceux du visiteur ensuite : l'ordre porte
    // le sens (le premier choisi est le primaire, cf. `setFeedPassions`), donc
    // ajouter en QUEUE est ce qui « n'écrase pas ».
    var duCompte = Array.isArray(s.selectedFeedPassions) ? s.selectedFeedPassions : [];
    var fusion = idsRetenus(duCompte.concat(p.passions));
    if (fusion.length) {
      try { if (typeof setFeedPassions === "function") setFeedPassions(fusion); } catch (e) { journal("migration passions", e); return false; }
    }

    // Envies du Fil : même règle, union sans écrasement.
    if (p.intents.length) {
      try {
        var actuelles = (typeof feedIntentsSelected === "function") ? (feedIntentsSelected() || []) : [];
        var vus = {}, envies = [];
        actuelles.concat(p.intents).forEach(function (i) {
          if (typeof i === "string" && i && !vus[i]) { vus[i] = 1; envies.push(i); }
        });
        if (typeof setFeedIntents === "function") setFeedIntents(envies);
      } catch (e) { journal("migration envies", e); }
    }

    // Spécialités : conservées telles quelles sur le compte, débarrassées de
    // celles dont la passion parente n'a pas survécu au filtre ci-dessus.
    var gardees = {};
    fusion.forEach(function (id) { gardees[id] = 1; });
    var specs = p.specialites.filter(function (sid) {
      return specialiteValide(sid) && gardees[passionDeSpecialite(sid)];
    });
    try {
      s.user = s.user || {};
      var deja = Array.isArray(s.user.passionSpecialites) ? s.user.passionSpecialites : [];
      var vus2 = {}, union = [];
      deja.concat(specs).forEach(function (x) { if (typeof x === "string" && x && !vus2[x]) { vus2[x] = 1; union.push(x); } });
      s.user.passionSpecialites = union;
    } catch (e) { journal("migration spécialités", e); }

    // État du tour : reporté tel quel, pour ne pas relancer depuis le début.
    try {
      s.firstRunTour = p.tour;
      if (typeof saveState === "function") saveState();
    } catch (e) { journal("migration tour", e); }

    // ① Drapeau posé APRÈS le travail : une coupure avant cette ligne laisse la
    // migration à refaire, et la refaire est sans effet de bord.
    p.migre = true;
    sauverPrefs();
    tel("guest_preferences_migrated", { n: fusion.length, s: specs.length });
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 15. ENTRÉE DIRECTE — appelée par `boot()` à la place de `showLanding()`
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Rend `true` quand elle a pris la main. `boot()` n'appelle `showLanding()`
  // que si elle rend `false` — donc drapeau coupé, ou compte existant.
  //
  // Ce qui n'est PAS affiché avant le fil, par construction : long carrousel,
  // présentation plein écran, formulaire d'inscription, demande de GPS, demande
  // de notification, demande de profil complet. Aucun de ces appels n'existe
  // ici, et le tour lui-même est différé.
  var _entree = false;

  function entreeDirecte() {
    if (!actif()) return false;
    if (!appPrete()) return false;      // `boot()` a posé `state` avant d'appeler
    if (compteExistant()) return false; // exigence : jamais pour un compte existant
    if (_entree) return true;
    _entree = true;

    document.documentElement.classList.add(CLASSE_RACINE);
    var l = document.getElementById("landing");   if (l) l.classList.remove("active");
    var o = document.getElementById("onboarding"); if (o) o.classList.remove("active");

    var p = prefs();
    if (!p.debut) { p.debut = Date.now(); sauverPrefs(); }

    // Préférences déjà choisies lors d'une visite précédente : le fil est
    // personnalisé AVANT le premier rendu, pas après.
    appliquerPrefs();

    try { if (typeof renderEverything === "function") renderEverything(); } catch (e) { journal("renderEverything", e); }
    try { document.body.classList.add("screen-feed-active"); } catch (e) {}

    // ⚠️ Lecture seule, et JAMAIS `supaInit()` (qui écrit).
    chargerContenuPublic();

    armerAidesAuGeste();

    tel("first_run_started", { deep: lienProfond() ? 1 : 0, known: p.passions.length ? 1 : 0 });

    // Carte de bienvenue et tour : différés, et jamais posés par-dessus une
    // destination de lien profond. La reprise est bornée — un lien profond qui
    // n'aboutit pas ne doit pas laisser tourner un minuteur pour toujours.
    planifierAccueil();
    return true;
  }

  var _essaisAccueil = 0;
  var ESSAIS_ACCUEIL_MAX = 40;   // ~24 s à 600 ms — le temps d'un réseau mobile froid

  function planifierAccueil() {
    if (!estVisiteur()) return;
    if (_essaisAccueil >= ESSAIS_ACCUEIL_MAX) return;
    _essaisAccueil++;
    setTimeout(function () {
      try {
        if (!estVisiteur()) return;
        if (ecranOccupe() || ecranActif() !== "feed") { planifierAccueil(); return; }
        if (bienvenueFermeeCetteSession()) { planifierTour(); return; }
        if (!poserBienvenue()) { planifierAccueil(); return; }
      } catch (e) {
        // Le corps entier est sous `try` et REPLANIFIE au lieu de conclure :
        // une exception venue d'un `setTimeout` n'est rattrapée par personne, et
        // conclure ici tuerait la chaîne en silence (piège des liens profonds).
        journal("accueil", e);
        planifierAccueil();
      }
    }, 600);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 16. RETOUR STABLE APRÈS AUTHENTIFICATION
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ AUCUNE ACTION N'EST REJOUÉE. On remet la personne devant l'écran et le
  // contenu qu'elle regardait, et on RAPPELLE ce qu'elle voulait faire — le
  // dernier geste lui appartient. Publier, envoyer un message ou s'inscrire à
  // une activité automatiquement après une création de compte serait un effet
  // externe qu'elle n'a pas confirmé.
  var RAPPELS = {
    aimer:     "Tu peux aimer cette publication.",
    commenter: "Tu peux écrire ton commentaire.",
    suivre:    "Tu peux suivre cette personne.",
    message:   "Tu peux envoyer ton message.",
    publier:   "Tu peux publier ta création.",
    bobine:    "Tu peux publier ta bobine.",
    activite:  "Tu peux proposer ton activité.",
    rejoindre: "Tu peux confirmer ta participation."
  };

  var _apresFait = false;

  function apresAuthentification() {
    // ⚠️ DEUX CHEMINS MÈNENT ICI, et un seul passe par `onbFinish`.
    //   • inscription → âge → prénom → passions → `onbFinish` → ici ;
    //   • « J'ai déjà un compte » → `onbDoAuth` fait `location.reload()`, et
    //     la confirmation d'e-mail ramène par un LIEN NEUF : dans les deux cas
    //     `onbFinish` n'est jamais atteint, c'est `reprise()` qui appelle ici.
    // Sans ce garde, les deux chemins se croiseraient un jour et enverraient
    // deux fois `guest_signup_completed`.
    if (_apresFait) return;
    // ⚠️ `onbFinish` (app-02) appelle ici SANS CONDITION, donc aussi pour une
    // inscription qui n'a jamais traversé le parcours de première visite —
    // drapeau coupé, ou compte créé par le chemin historique. Sans cette sortie,
    // ces inscriptions-là émettraient `guest_signup_completed`, et le centre de
    // pilotage compterait comme « venues du mode invité » des créations de
    // compte qui n'en viennent pas. `debut` est posé par `entreeDirecte()` : sa
    // présence est la seule preuve que le parcours a bien eu lieu.
    var pref = prefs();
    if (!pref.debut && !pref.retour && !pref.passions.length && !pref.specialites.length) return;
    _apresFait = true;
    var migre = migrerPreferences();
    tel("guest_signup_completed", { migrated: migre ? 1 : 0 });

    var r = pref.retour;
    // Le retour ne sert qu'une fois : le garder ferait re-naviguer à chaque
    // rechargement suivant, longtemps après que la personne soit passée à autre chose.
    pref.retour = null;
    sauverPrefs();

    setTimeout(function () {
      try {
        if (r && r.hash) {
          // Destination de lien profond : on redonne la main aux routages
          // existants (`#reel=`, `#irl-event-`…) en reposant le hash.
          try { if (window.location.hash !== r.hash) window.location.hash = r.hash; } catch (e) {}
        } else if (r && r.screen && r.screen !== "feed") {
          // « Si la destination n'existe plus, revenir proprement dans Découvrir. »
          var cible = document.getElementById("screen-" + r.screen);
          try { if (typeof goTo === "function") goTo(cible ? r.screen : "feed"); } catch (e) {}
        }
        if (r && typeof r.scroll === "number" && r.scroll > 0) {
          var m = document.getElementById("appMain");
          if (m) { try { m.scrollTop = r.scroll; } catch (e) {} }
        }
        if (r && r.action && RAPPELS[r.action]) {
          try { if (typeof toast === "function") toast(RAPPELS[r.action]); } catch (e) {}
        }
      } catch (e) { journal("retour", e); }
    }, 350);

    // Le parcours de première visite est terminé : la classe racine part, les
    // gates cessent (le compte existe), et les prochaines visites sont des
    // visites normales. Les préférences restent en place tant que la migration
    // n'est pas confirmée — elles seront rejouées au prochain boot sinon.
    try { document.documentElement.classList.remove(CLASSE_RACINE); } catch (e) {}
    if (migre) tel("first_run_completed", { via: "signup" });
  }

  // Pré-remplit l'étape « passions » de l'onboarding avec ce que le visiteur a
  // déjà choisi : lui redemander serait un second onboarding.
  function prefiller() {
    var p = prefs();
    var ids = idsRetenus(p.passions);
    if (!ids.length) return;
    try {
      if (typeof selectedPassions !== "undefined") {
        selectedPassions = ids.slice();
        if (typeof renderPassionGrid === "function") renderPassionGrid();
      }
    } catch (e) { journal("préremplissage", e); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 17. CROCHETS APPELÉS PAR LES MOTEURS
  // ══════════════════════════════════════════════════════════════════════════

  // Appelé par `goTo` (app-02) après le changement d'écran.
  function surNavigation(screen) {
    if (!estVisiteur()) return;
    fermerBulle();
    if (screen === "irl") {
      // « Ne jamais déclencher automatiquement la géolocalisation. » UI-4A0 arme
      // déjà ce marqueur avant chaque rendu ; on le réarme ici pour que la
      // garantie tienne aussi lorsque ce lot est coupé. Le marqueur est à usage
      // unique et consommé par `renderIRL` : la position reste demandable par un
      // geste explicite.
      try { window._passioIrlSkipGeoOnce = true; } catch (e) {}
      setTimeout(function () { try { montrerEtape("rencontrer"); } catch (e) { journal("étape IRL", e); } }, 700);
      return;
    }
    var secondaire = ETAPES_ECRAN[screen];
    if (secondaire) {
      setTimeout(function () { try { montrerEtape(secondaire); } catch (e) { journal("étape " + screen, e); } }, 700);
      return;
    }
    if (screen === "feed") {
      // Le budget d'essais est REMIS À ZÉRO à chaque retour sur le fil : sinon
      // une navigation un peu longue (Rencontrer, une fiche, un profil) le
      // consommerait entièrement et la carte de bienvenue ne serait jamais
      // posée — un lot muet, indiscernable d'un lot cassé.
      _essaisAccueil = 0;
      planifierAccueil();
    }
  }

  // Ouverture d'un contenu par un visiteur. `kind` appartient à une liste FERMÉE
  // ("post" | "profil" | "activite") : aucun identifiant, aucun titre, aucun
  // pseudo ne quitte l'appareil — c'est un compteur d'usage, pas une trace.
  var CONTENUS = { post: 1, profil: 1, activite: 1 };

  function contenuOuvert(kind) {
    if (!estVisiteur()) return;
    tel("guest_content_opened", { kind: CONTENUS[kind] ? kind : "autre" });
  }

  // Appelé par `renderFeed` (app-02) : le fil de DÉCOUVERTE d'un visiteur qui
  // n'a encore rien choisi. Voir le commentaire au point d'appel — c'est lui qui
  // porte le raisonnement.
  //
  // ⚠️ La condition est « aucun choix », pas « aucun contenu » : dès qu'une
  // passion est cochée, la sélection additive normale reprend, y compris si
  // elle ne donne rien (ce vide-là est un choix, et le repli d'exploration
  // d'app-02 s'en charge déjà).
  function filDecouverte() {
    if (!estVisiteur()) return false;
    if (prefs().passions.length) return false;
    try { if (typeof _activeFeedPassions !== "undefined" && _activeFeedPassions && _activeFeedPassions.size) return false; } catch (e) {}
    try {
      if (typeof feedIntentsSelected === "function" && (feedIntentsSelected() || []).length) return false;
    } catch (e) {}
    return true;
  }

  // Appelé par le rendu d'une carte de publication (app-02) : étiquette
  // « Exemple PASSIO » sur le contenu de démonstration, pour un visiteur
  // seulement. Rend une chaîne HTML, ou "" — jamais `null`.
  function etiquetteDemo(p) {
    if (!estVisiteur() || !estDemo(p)) return "";
    return '<span class="fr-demo-tag" title="Contenu de démonstration">Exemple PASSIO</span>';
  }

  // Les chiffres d'une activité de démonstration ne doivent RIEN promettre :
  // ni une proximité (la distance vient d'un point de référence, pas de la
  // position du visiteur — qu'on ne demande jamais), ni des participants qui
  // n'existent pas. Consommée par `ui-v4a2-cartes.js`, aux deux endroits qui
  // fabriquent ces lignes.
  function masquerChiffresDemo(ev) {
    return estVisiteur() && evenementDemo(ev);
  }

  // Une activité de démonstration n'est jamais présentée comme une rencontre
  // réellement disponible : la participation y est refusée AVANT même le gate
  // d'authentification, avec sa propre explication.
  function participationPossible(ev) {
    if (!estVisiteur()) return true;
    if (evenementDemo(ev)) {
      try { if (typeof toast === "function") toast("Cette activité est un exemple : elle n'accueille pas de vraie participation."); } catch (e) {}
      return false;
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 18. API PUBLIQUE
  // ══════════════════════════════════════════════════════════════════════════
  window.PassioFirstRun = {
    actif: actif,
    estVisiteur: estVisiteur,
    entreeDirecte: entreeDirecte,
    prefs: prefs,
    oublierPrefs: oublierPrefs,
    // Panneau
    ouvrirPersonnalisation: ouvrirPersonnalisation,
    basculerPassion: basculerPassion,
    basculerSpecialite: basculerSpecialite,
    voirToutes: voirToutes,
    chercherDansPanneau: chercherDansPanneau,
    validerPersonnalisation: validerPersonnalisation,
    chercher: chercher,
    specialitesDe: specialitesDe,
    // Bienvenue
    fermerBienvenue: fermerBienvenue,
    // Tour
    relancerTour: relancerTour,
    abandonnerTour: abandonnerTour,
    fermerBulle: fermerBulle,
    montrerEtape: montrerEtape,
    // Exposés pour que le verrou « toute aide déclarée a une ancre atteignable »
    // interroge la table RÉELLE, et non une copie recopiée dans le test — une
    // copie serait restée verte le jour où la production a perdu son ancre.
    zonesGeste: function () { return ZONES_GESTE.slice(); },
    cibleEtape: function (id) {
      var e = ETAPES[id];
      if (!e || typeof e.cible !== "function") return null;
      try { return e.cible() || null; } catch (_) { return null; }
    },
    // Auth
    requireAuthentication: requireAuthentication,
    allerInscription: allerInscription,
    allerConnexion: allerConnexion,
    // Exposée pour `openAuthScreen` (app-02) : quand l'écran de connexion est
    // ouvert depuis les Paramètres ou après une déconnexion, la porte
    // « ← Continuer à explorer » doit exister là aussi — sinon l'onboarding
    // reste un écran plein sans retour pour qui change d'avis.
    poserSortieExploration: poserSortieExploration,
    apresAuthentification: apresAuthentification,
    retourExploration: retourExploration,
    migrerPreferences: migrerPreferences,
    prefiller: prefiller,
    // Crochets moteurs
    surNavigation: surNavigation,
    filDecouverte: filDecouverte,
    contenuOuvert: contenuOuvert,
    etiquetteDemo: etiquetteDemo,
    participationPossible: participationPossible,
    masquerChiffresDemo: masquerChiffresDemo
  };

  // Fonction commune demandée par le lot, appelable telle quelle depuis
  // n'importe quel moteur : `if (!requireAuthentication("suivre")) return;`
  // Posée sur `window` (et non déclarée en haut niveau) pour ne créer aucun
  // global susceptible d'être écrasé en silence par un autre script.
  window.requireAuthentication = requireAuthentication;

  // ── Reprise ───────────────────────────────────────────────────────────────
  //
  // ⚠️ En production, ce fichier est INLINÉ et s'exécute avant `app.js` : au
  // moment où il est évalué, ni `state` ni `boot` n'existent. `entreeDirecte()`
  // est appelée par `boot()` lui-même, donc rien à attendre pour l'entrée. Il
  // reste deux cas à rattraper : la migration d'un retour de confirmation
  // d'e-mail (l'application démarre avec une session, sans passer par
  // `onbFinish`), et la remise à zéro des compteurs.
  //
  // Compteurs remis à zéro sur `passio:app-ready` : sans ça, un module inliné
  // brûle son budget de reprise PENDANT la saisie du code d'accès, quand
  // l'application n'existe pas encore (piège ③ du 2026-08-28).
  function reprise() {
    _essaisAccueil = 0;
    // Compte retrouvé (session, ou onboarding terminé) + préférences d'invité en
    // attente ⇒ migration. Indépendante du drapeau, et sans effet si rien à faire.
    setTimeout(function () {
      try {
        if (!appPrete() || !compteExistant()) return;
        var p = prefs();
        var aFaire = (!p.migre && (p.passions.length || p.specialites.length || p.intents.length)) || !!p.retour;
        if (!aFaire) return;
        apresAuthentification();
        try { if (typeof renderFeed === "function" && ecranActif() === "feed") renderFeed(); } catch (e) {}
      } catch (e) { journal("reprise", e); }
    }, 1200);
  }

  window.addEventListener("passio:app-ready", reprise);
  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(reprise, 0);
  else window.addEventListener("DOMContentLoaded", function () { setTimeout(reprise, 0); });
})();
