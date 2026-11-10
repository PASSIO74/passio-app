#!/usr/bin/env node
// Écrit donnees/domaines/fil.json (registre + constats du domaine « fil ») à partir des
// tables ci-dessous, et vérifie au passage que chaque capture citée existe sur disque.
//   node docs/audit-ux-ui-2026-11-10/outils/sondes/fil-registre.js
"use strict";
const fs = require("fs");
const path = require("path");
const AUDIT = path.resolve(__dirname, "..", "..");
const dirDon = path.join(AUDIT, "donnees", "captures", "fil");

const vuesDe = (id) => fs.existsSync(dirDon) ? fs.readdirSync(dirDon).filter((f) => f.startsWith(id + "--")).map((f) => f.replace(id + "--", "").replace(".json", "")) : [];
const aApres = (id) => vuesDe(id).some((v) => { try { return !!JSON.parse(fs.readFileSync(path.join(dirDon, id + "--" + v + ".json"), "utf8")).apres; } catch (e) { return false; } });

// ── Constats ───────────────────────────────────────────────────────────────
const constats = [];
const C = (o) => constats.push(Object.assign({ type: "observation", nature: "friction", priorite: "P3", gravite: 2, effort: "S", risqueTechnique: "faible", dependances: "Aucune.", sensible: false }, o));

C({ id: "FIL-C01", titre: "« Voir l'activité » n'apparaît pas à l'ouverture sur une publication reliée à une activité",
  emplacement: "Fil › carte reliée à une activité — décoration UI-3B (js/ui-v3-passerelle.js:382-383 et 1006-1008), arrivée des activités (js/app-08-ui-modals-tour.js:6283-6288 et 9881)",
  surfaces: ["FIL-005", "FIL-014"], nature: "fonctionnel", priorite: "P1", gravite: 3, effort: "S",
  preuve: "Capture FIL-005 (m390, m360) : pastille « Rencontrer », aucune porte, ~6 s après l'ouverture. Mesure du banc (outils/sondes/parcours-02-lien-activite.js, parcours-03-suite.js, capture PCS-001) : porte absente à 5, 20 et 40 s, présente à 60 s ou après un aller-retour d'écran. Cause lue dans le code : `decorerArticle` (ui-v3-passerelle.js:382-383) confie la carte à `decorerActivite`, qui sort sans rien peindre quand `trouverEvenement` ne connaît pas encore l'activité (1006-1008) ; les activités arrivent ensuite du serveur (`fusionnerEvenementsServeur`, app-08:6283) et le seul repeint déclenché est `renderIRL()` quand l'écran Rencontrer est actif (app-08:6286-6287, 9796) ; rien n'invalide `_feedDomSig` ni ne rappelle `PassioUIV3.decorateFeed()`. L'observateur du fil (ui-v3-passerelle.js:460) n'écoute que les ajouts de cartes.",
  probleme: "La carte annonce une rencontre (pastille corail) mais n'offre aucun moyen d'ouvrir l'activité pendant la première minute. Un partage d'activité montre, lui, l'ancienne sous-carte « ÉVÉNEMENT IRL » qui déborde de la carte (FIL-014).",
  declencheur: "Ouvrir l'application sur le fil quand une publication reliée à une activité est dans les premières cartes (cas normal : le fil se peint avant la lecture des activités).",
  consequence: "Le passage Fil → IRL, cœur de la promesse, échoue au moment où la personne lit la publication : elle ne peut ni voir ni rejoindre l'activité.",
  proposition: "À l'arrivée des activités (fin de `fusionnerEvenementsServeur` quand `change` est vrai, et après la fusion du démarrage), redécorer les cartes du fil qui portent une référence d'activité sans porte : appeler `PassioUIV3.decorateFeed()` (la décoration saute déjà les cartes décorées) — sans repeindre le fil.",
  visuels: ["FIL-005"], risqueRegression: "Faible : la décoration est idempotente (`[data-v3-bridge]`). Verrous concernés : tests/e2e/ui-v3-passerelle*.spec.js, activite-au-fil.spec.js.",
  critereAcceptation: "Compte connecté, faux serveur : 5 s après l'ouverture, la carte d'une publication dont `event_id` désigne une activité à venir porte « Voir l'activité », sans changer d'écran.",
  fichiers: ["js/ui-v3-passerelle.js", "js/app-08-ui-modals-tour.js"] });

C({ id: "FIL-C02", titre: "La barre d'actions est faite d'emojis : nommée « 🤍 5 », « 💬 34 », « 😊 », en 12,5 px",
  emplacement: "Carte et page d'une publication › barre d'actions — `renderPostHTML` (js/app-02-state-utils.js:10490-10500), `openPost` (10571-10581), .post-action (styles.css:1155)",
  surfaces: ["FIL-002", "FIL-003", "FIL-051"], nature: "accessibilite", priorite: "P2", gravite: 2, effort: "M",
  preuve: "Sonde fil-02-interactions : les quatre actions sont des `span` (rôle bouton posé après coup) dont le nom accessible est « 🤍 5 », « 💬 34 », « 😊 » ; seule « Partager » a un `aria-label`. Texte en 12,5 px. Le cœur non aimé est un emoji gris clair. Capture FIL-002 (gros plan « actions »). L'identité du produit réserve les emojis au contenu et demande des icônes SVG `currentColor` pour les fonctions — ce que fait déjà le partage, dans la même barre.",
  probleme: "Les actions les plus fréquentes du produit sont les moins lisibles : pictogrammes d'emoji pâles, compteurs petits, aucun nom prononçable pour un lecteur d'écran, aucun état « aimé » exposé.",
  declencheur: "Toute lecture du fil ; toute utilisation d'un lecteur d'écran ou d'un clavier.",
  consequence: "Geste d'aimer et de commenter moins évident ; pour une personne non voyante, trois boutons sans nom utile par carte.",
  proposition: "Remplacer les trois emojis par des icônes SVG `currentColor` (cœur plein et violet quand aimé), compteurs en 13,5 px à l'encre, `aria-label` (« J'aime — 5 », « Commenter — 34 commentaires », « Réagir ») et `aria-pressed` sur le j'aime. Les emojis restent pour les réactions choisies (pastille « 🔥 3 »).",
  visuels: ["FIL-002"], risqueRegression: "`_paintPostLike`, `patchPostLikeDom`, `likePostDetail` et `_patchPostCommentCount` réécrivent ces boutons en `innerHTML` avec l'emoji : à modifier ensemble. Verrous : interactions.spec.js, accessibilite-cibles.spec.js.",
  critereAcceptation: "Chaque action de la barre a un nom accessible en toutes lettres ; le j'aime expose `aria-pressed` ; les compteurs mesurent ≥ 13 px ; contraste ≥ 4,5:1.",
  fichiers: ["js/app-02-state-utils.js", "js/app-03-posts-vlogs.js", "js/app-04-comments-shop.js", "styles.css"] });

C({ id: "FIL-C03", titre: "Mon j'aime déjà posé s'affiche « 🤍 » pendant les premières secondes ; le toucher alors compte un j'aime de trop",
  emplacement: "Carte › j'aime — `renderPostHTML` lit `state.user.likedPosts` (js/app-02-state-utils.js:10314) alors que la lecture du fil rend `liked: cpl.aime` (js/app-08-ui-modals-tour.js:5007)",
  surfaces: ["FIL-002"], nature: "fonctionnel", priorite: "P2", gravite: 2, effort: "S",
  preuve: "Sonde fil-02-interactions (compte neuf sur l'appareil, j'aime présent en base) : à ~3 s, `post.liked = true`, `likes = 5`, mais la carte affiche « 🤍 5 » ; un toucher envoie un second POST post_likes et affiche « ❤️ 6 » (la base en compte 5). Capture FIL-002 (avant : cœur gris). Quelques secondes plus tard le tour de relecture des compteurs (`_postLikeRefreshTour`, app-03, phase initiale tirée entre 0,2 et 15 s) repeint « ❤️ 5 » (visible sur FIL-001).",
  probleme: "Sur un appareil où l'état local ne connaît pas encore mes j'aime (nouvel appareil, données effacées), le fil dit que je n'ai pas aimé ce que j'ai aimé, puis se corrige seul.",
  declencheur: "Première ouverture sur un appareil ; toucher le cœur avant le premier tour de relecture.",
  consequence: "Compteur faux d'une unité jusqu'à la relecture suivante ; impression que le j'aime n'avait pas été gardé.",
  proposition: "Peindre l'état aimé avec `p.liked === true || likedPosts.includes(p.id)` dans `renderPostHTML` et `openPost`, et aligner `state.user.likedPosts` sur `aime` à la lecture du fil.",
  visuels: ["FIL-002"], risqueRegression: "Un j'aime retiré hors ligne ne doit pas réapparaître : respecter l'intention locale en attente (`_postLikeReconcileLoaded`). Verrous : interactions.spec.js (4 cas de like).",
  critereAcceptation: "État local vide, j'aime présent en base : la carte affiche l'état aimé dès le premier rendu qui suit la lecture du fil ; un toucher le retire (compteur 4), il n'en ajoute pas.",
  fichiers: ["js/app-02-state-utils.js", "js/app-08-ui-modals-tour.js"] });

C({ id: "FIL-C04", titre: "La discussion montre deux commentaires et demi : sa liste est bornée à 260 px",
  emplacement: "Feuille « Discussion » — `#commentsBox` `max-height:260px` (js/app-04-comments-shop.js:1320)",
  surfaces: ["FIL-030", "FIL-031"], nature: "friction", priorite: "P2", gravite: 2, effort: "S",
  preuve: "Sonde fil-02 : `#commentsBox` 260 px de haut pour 2 975 px de contenu (30 commentaires chargés) ; la feuille occupe 522 px sur 844, les 322 px du haut restent vides. Capture FIL-030 (m390, m360) ; avec le clavier simulé (FIL-031) la liste garde ses 260 px.",
  probleme: "Lire une discussion de 34 commentaires se fait par une lucarne de 260 px, alors que la moitié de l'écran est libre.",
  declencheur: "Ouvrir la discussion d'une publication commentée.",
  consequence: "Beaucoup de défilement pour peu de lecture ; le fil des réponses dépliées ne tient pas à l'écran.",
  proposition: "Laisser la liste prendre la hauteur disponible (`max-height: min(54vh, 470px)`, davantage sans clavier), retirer le sous-titre « Réponds à cette publication. », ramener le champ vide à une ligne.",
  visuels: ["FIL-030"], risqueRegression: "La feuille doit rester sous la hauteur visible clavier ouvert (mesurer avec `--app-vh`). Verrous : commentaires*.spec.js.",
  critereAcceptation: "À 390×844 sans clavier, au moins cinq commentaires d'une ligne sont visibles ; clavier ouvert, le champ et le bouton d'envoi restent visibles.",
  fichiers: ["js/app-04-comments-shop.js", "styles.css"] });

C({ id: "FIL-C05", titre: "Le même fil s'appelle « Discussion » ou « Commentaires », et son nombre passe de 34 à 37 en l'ouvrant",
  emplacement: "Carte « 💬 34 » (app-02:10494) · feuille « Discussion », « Discussion (37) », « Discussion · 38 » (app-04:1318, 1374, 1494, 2331) · page « Commentaires (34) » (app-02:10584) · `nbCommentairesPost` (app-02:2407)",
  surfaces: ["FIL-002", "FIL-030", "FIL-051"], nature: "clarte", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Sonde fil-02 : la carte annonce 34, la feuille titre « Discussion (37) » une fois chargée (les 3 réponses s'ajoutent), puis « Discussion · N » après un envoi ; la page d'une publication titre « Commentaires (34) » (capture FIL-052). Trois écritures du titre dans le code.",
  probleme: "Deux mots pour un même objet et un compteur qui change de définition (commentaires, puis commentaires + réponses) dès qu'on ouvre le fil.",
  declencheur: "Ouvrir la discussion d'une publication qui a des réponses.", consequence: "Doute sur le nombre réel ; vocabulaire instable.",
  proposition: "Un seul mot (« Discussion ») et une seule forme (« Discussion · 34 commentaires »), fondée sur le compte des commentaires de premier niveau partout ; les réponses restent comptées sous leur commentaire.",
  visuels: ["FIL-030", "FIL-050"], risqueRegression: "Les verrous qui lisent le titre « Discussion (N) » (controle-general-2026-11-10 ⑤, commentaires-pagination) sont à réaligner.",
  critereAcceptation: "Carte, feuille et page affichent le même nombre pour une même publication, avant et après ouverture.",
  fichiers: ["js/app-04-comments-shop.js", "js/app-02-state-utils.js"] });

C({ id: "FIL-C10", titre: "Le panneau de réaction sort de l'écran par le haut et demande deux touchers",
  emplacement: "Panneau « Emoji | GIF » — `emojiReactPanel` (js/app-04-comments-shop.js:3336-3470 ; position 3459-3463 sans retour dans l'écran) et `cmtComposerEmoji` (3092-3282)",
  surfaces: ["FIL-052", "FIL-053", "FIL-039"], nature: "fonctionnel", priorite: "P2", gravite: 3, effort: "S",
  preuve: "Capture FIL-052 (m390) : les premières rangées d'emojis sont coupées par le haut de l'écran. À 360×640, le toucher du troisième emoji échoue dans le banc (« element is outside of the viewport », scénario detail-et-options) : il n'est pas atteignable. Emojis de 18 px dans des cases de 28 px ; onglets de 31 px. Un emoji touché n'est pas envoyé : il faut « Envoyer ✓ » (FIL-053).",
  probleme: "Réagir à une publication située en haut ou au milieu de l'écran ouvre un panneau dont le début est hors champ ; les cases sont petites ; le geste prend deux touchers.",
  declencheur: "Toucher « 😊 » sur une carte ou sur la page d'une publication quand le bouton est à moins de ~260 px du haut.", consequence: "Emojis les plus courants (première rangée) inaccessibles sur petit écran ; réaction plus lente qu'un j'aime.",
  proposition: "Passer le panneau par `_ramenerDansLEcran` (déjà écrit pour le panneau GIF, emoji-misc.js:200), cases de 40 px et emojis de 24 px ; un toucher sur un emoji réagit aussitôt (re-toucher le retire, comme aujourd'hui), la validation restant pour le GIF.",
  visuels: ["FIL-052", "FIL-039"], risqueRegression: "Verrous : reaction-ordre.spec.js, gif-klipy.spec.js ⑧ (position des panneaux). La validation avant envoi d'un GIF était une demande explicite : ne pas la retirer.",
  critereAcceptation: "À 360×640 et 390×844, quel que soit l'endroit du bouton, le panneau est entièrement dans l'écran (8 px de marge) ; chaque case mesure ≥ 40 px.",
  fichiers: ["js/app-04-comments-shop.js", "js/emoji-misc.js"] });

C({ id: "FIL-C11", titre: "Cibles et champs de la discussion sous les seuils (28 × 40, 34 × 34, sans étiquette)",
  emplacement: "Feuille « Discussion » et réponse en ligne — .comment-action (styles.css:3183, 11358), bouton « ✓ » (js/emoji-misc.js:380-382), `#newComment` (app-04:1323)",
  surfaces: ["FIL-030", "FIL-037", "FIL-036"], nature: "accessibilite", priorite: "P2", gravite: 2, effort: "S",
  preuve: "Fiches FIL-030--m390 et FIL-037--m390 (mesures.cibles.sous44) : actions d'un commentaire 28 × 35-40 px (💬, 😊) et 38 × 35-40 (🤍) ; tri « Pertinents / Récents » 78 × 24-34 ; envoi d'une réponse « ✓ » 34 × 34 ; « × » de la feuille 34 × 34 ; « Publier » 42 px de haut. `mesures.champsSansEtiquette` : `textarea#newComment` et `input#reply-input-…` n'ont qu'un texte d'appel. Avatars des commentaires focalisables sans nom (`mesures.sansNom`).",
  probleme: "Les commandes d'une discussion sont petites et serrées (trois icônes sur 110 px) et les champs n'ont pas de nom.",
  declencheur: "Aimer, répondre ou réagir à un commentaire au pouce ; naviguer au lecteur d'écran.", consequence: "Erreurs de toucher entre « répondre » et « réagir » ; champs annoncés sans libellé.",
  proposition: "Actions de commentaire à 44 px de large, envoi de réponse à 44 × 44, « Publier » et outil emoji à 46 px, `aria-label` sur les deux champs et sur les avatars (« Profil de … »). Pendant une réponse, masquer la saisie de commentaire (un seul champ à l'écran).",
  visuels: ["FIL-030", "FIL-037"], risqueRegression: "accessibilite-cibles.spec.js mesure déjà ces zones par `elementFromPoint` : étendre la liste.",
  critereAcceptation: "Dans la discussion à 360 px, toute commande mesure ≥ 44 × 44 px (zone sondée) et chaque champ a un nom accessible.",
  fichiers: ["styles.css", "js/emoji-misc.js", "js/app-04-comments-shop.js"] });

C({ id: "FIL-C12", titre: "La page d'une publication s'intitule « Post » et n'offre aucun champ pour commenter",
  emplacement: "Page d'une publication — en-tête (index.html:1256-1260, fond #ede9fe en dur), `openPost` (js/app-02-state-utils.js:10558-10588)",
  surfaces: ["FIL-050", "FIL-051"], nature: "clarte", priorite: "P2", gravite: 2, effort: "M",
  preuve: "Captures FIL-050 et FIL-051. Fiche FIL-050--m390 : « Commentaires (0) » et « Aucun commentaire — sois le premier 💬 » à 4,39:1 (#6e6987 sur #ede9fe, seuil 4,5). Pour écrire, il faut toucher « 💬 », qui rouvre la même liste dans la feuille « Discussion » par-dessus la page. Aucune image ne s'agrandit (`openFullImg` n'est appelé que par la messagerie).",
  probleme: "La page qui montre le mieux la discussion ne permet pas d'y participer directement, emploie un autre mot que le reste de l'application et un fond différent.",
  declencheur: "Toucher le texte ou le média d'une carte (« Lire la suite »).", consequence: "Invitation « sois le premier » sans geste associé ; doublon liste/feuille ; textes secondaires sous le seuil de contraste.",
  proposition: "Titre « Publication », fond `--bg-deep`, intertitre « Discussion · N commentaires », et un bouton « Écrire un commentaire » (ou la saisie elle-même) en bas de page, qui ouvre le composeur existant.",
  visuels: ["FIL-050"], risqueRegression: "La page est une sœur de `<main>` en `position: fixed` (z-index 200) : garder ce cadrage. Verrous : controle-general-2026-11-10 ②, post-detail*.spec.js.",
  critereAcceptation: "Depuis la page d'une publication, un commentaire peut être commencé en un toucher visible sans chercher l'icône ; contrastes ≥ 4,5:1 sur le fond de la page.",
  fichiers: ["index.html", "js/app-02-state-utils.js", "styles.css"] });

C({ id: "FIL-C13", titre: "Les envies ne se lisent pas comme des filtres",
  emplacement: "En-tête du fil — `#feedIntentSelector` (index.html:637-648), .feed-intent-btn (styles.css:1286-1322)",
  surfaces: ["FIL-001", "FIL-073", "FIL-075"], type: "jugement", nature: "clarte", priorite: "P2", gravite: 2, effort: "S",
  preuve: "Capture FIL-001 : quatre mots en 11 px (10,5 px sous 360 px) sans bordure ni intitulé, entre le rail et les stories. Capture FIL-073 : « Apprendre » cochée alors qu'aucune source ne l'est, l'écran dit « Tu ne suis encore personne » sans parler de l'envie. Capture FIL-075 : l'envie cochée ne se distingue que par la graisse et un fond léger.",
  probleme: "Rien n'indique que « Explorer · Apprendre · Idées · Rencontrer » retranchent du fil ; « Rencontrer » y côtoie l'onglet « Rencontrer » de la barre basse, qui mène ailleurs.",
  declencheur: "Première lecture de l'en-tête ; fil qui se vide après un toucher.", consequence: "Filtre posé sans le savoir, fil appauvri sans explication visible à l'endroit du geste.",
  proposition: "Donner à la rangée la forme de filtres : intitulé « Filtrer : », pastilles bordées en 13 px, état coché plein. Sans changer le moteur (les envies filtrent l'union, fiche 23).",
  visuels: ["FIL-001"], risqueRegression: "feed-envie-filtre.spec.js ⑦ compare les libellés aux boutons rendus : ne pas les changer. Largeur à 320 px à vérifier (quatre pastilles + intitulé).",
  critereAcceptation: "Test auprès de cinq personnes : quatre disent spontanément que la rangée filtre le fil. À 320 px, aucune pastille n'est tronquée.",
  fichiers: ["index.html", "styles.css"] });

C({ id: "FIL-C14", titre: "Sur petit écran, le premier contenu commence à mi-hauteur",
  emplacement: "En-tête du fil — barre (64 px), rail (70), envies (44), stories (65)",
  surfaces: ["FIL-001", "FIL-016"], type: "jugement", nature: "friction", priorite: "P3", gravite: 2, effort: "S",
  preuve: "Sonde fil-01 : `#feedList` commence à 273 px. Capture FIL-001--m320 (320×568) : la première carte commence à 273 px, soit 48 % de la hauteur ; il reste ~230 px de contenu au-dessus de la barre basse. Libellés des stories en 9,5 px.",
  probleme: "L'en-tête permanent (décision du 2026-08-29) prend près de la moitié d'un petit écran avant toute publication.", declencheur: "Ouvrir le fil sur un téléphone de 568 à 640 px de haut.",
  consequence: "La première publication n'est qu'entrevue ; la promesse « découvrir » passe après quatre rangées de commandes.",
  proposition: "Sans replier l'en-tête : sous 660 px de haut, masquer les libellés des stories et resserrer les marges ; porter ces libellés à 11 px ailleurs.",
  visuels: ["FIL-001"], risqueRegression: "entete-fil-permanent.spec.js exige que rail, envies et stories restent visibles : la proposition n'en retire aucun.",
  critereAcceptation: "À 320×568, la première carte commence au plus tard à 250 px ; aucun libellé de l'en-tête sous 11 px à 390 px.",
  fichiers: ["styles.css"] });

C({ id: "FIL-C15", titre: "Le visiteur lit « ta communauté » et « Publier la première » avant tout contenu",
  emplacement: "Fil d'un visiteur — séparateur « Exemples PASSIO » genre « seul » (js/app-02-state-utils.js:8625-8642), carte de bienvenue (js/first-run.js)",
  surfaces: ["FIL-080"], nature: "clarte", priorite: "P2", gravite: 2, effort: "S",
  preuve: "Capture FIL-080 (m390, m360) et sonde fil-03-visiteur : sous la carte de bienvenue, le séparateur dit « Pas encore de publication de ta communauté par ici… » avec un bouton violet « Publier la première » ; la première publication commence à ~670 px sur 844. Deux boutons principaux violets se suivent (« Choisir mes passions », « Publier la première »).",
  probleme: "Une personne sans compte n'a pas de communauté et ne peut pas publier ; le message et son bouton lui parlent d'un état qui n'est pas le sien et repoussent le contenu sous l'écran.",
  declencheur: "Première visite (appareil vierge).", consequence: "Le premier écran d'un nouveau venu montre des commandes, presque pas de contenu ; « Publier la première » mène à une demande de compte.",
  proposition: "Pour un visiteur (`PassioFirstRun.estVisiteur()`), réduire le séparateur à son titre et une ligne (« Voici des exemples de ce qui se partage sur PASSIO. ») sans bouton.",
  visuels: ["FIL-080"], risqueRegression: "fil-reel-dabord.spec.js et fil-panne-reseau.spec.js lisent `data-genre` et le bouton : ajouter un genre ou un attribut plutôt que modifier « seul ».",
  critereAcceptation: "En visiteur à 390×844, le séparateur ne porte aucun bouton et la première carte commence au plus tard à 580 px.",
  fichiers: ["js/app-02-state-utils.js", "styles.css"] });

C({ id: "FIL-C16", titre: "Le séparateur « Exemples PASSIO » prend quatre lignes de 12 px et deux boutons",
  emplacement: "Séparateur — `poserSeparateurExemples` (js/app-02-state-utils.js:8595-8644), .feed-exemples-sep (styles.css:11549-11594)",
  surfaces: ["FIL-070", "FIL-019"], type: "jugement", nature: "clarte", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Capture FIL-070 : quatre lignes centrées en 12 px gris, puis « Publier la première » et « Inviter quelqu'un », avant la première carte (qui commence à ~475 px).",
  probleme: "Le message juste (réel d'abord, exemples ensuite) est long et pâle à l'endroit où il compte.", declencheur: "Compte sans publication réelle dans ses passions (cas de tout compte neuf).",
  consequence: "Lu en diagonale ; le contenu descend.", proposition: "Une phrase en 13 px à l'encre (« Personne de ta communauté n'a encore publié ici : voici des exemples. »), mêmes deux gestes.",
  visuels: ["FIL-070"], risqueRegression: "Textes lus par fil-reel-dabord.spec.js : à réaligner.", critereAcceptation: "Le séparateur « seul » mesure au plus 170 px de haut à 390 px ; son texte est ≥ 13 px.", fichiers: ["js/app-02-state-utils.js", "styles.css"] });

C({ id: "FIL-C17", titre: "États vides : le bouton ne fait pas ce que le message conseille",
  emplacement: "`#feedEmpty` — textes (js/app-02-state-utils.js:9862-9895), bouton ajouté par `decorateEmpty` (js/ui-v2-shell.js:749-761)",
  surfaces: ["FIL-072", "FIL-073", "FIL-074"], nature: "clarte", priorite: "P2", gravite: 2, effort: "S",
  preuve: "Capture FIL-072 : « Tu ne suis encore personne — ouvre le profil de quelqu'un et touche « Suivre »… Tu peux aussi cocher une passion ci-dessus. », suivi du seul bouton « Publier une Passio ». Le guillemet fermant « » » commence une ligne. La bulle « Musique » décochée est à 40 % d'opacité et désaturée (styles.css:4555). Capture FIL-074 (« Choisis tes passions ») : bouton « Explorer les passions ».",
  probleme: "Le message donne deux sorties (suivre quelqu'un, cocher une passion) et le bouton en propose une troisième, dans un mot (« Passio ») que le reste du fil n'emploie pas pour une publication.",
  declencheur: "Décocher ses passions en gardant « Suivis » sans abonnement ; tout décocher.", consequence: "La sortie la plus simple (recocher la bulle grisée) n'est pas celle qu'on montre.",
  proposition: "Faire du bouton l'action du message : « Trouver des personnes à suivre » (écran Rechercher) pour « Tu ne suis encore personne » ; garder « Explorer les passions » pour « Choisis tes passions ». Espaces insécables autour des guillemets. Bulle décochée lisible (opacité ≥ 0,6).",
  visuels: [], risqueRegression: "ui-v2 §5 (decorateEmpty) et feed-envie-filtre.spec.js lisent ces libellés.", critereAcceptation: "Chaque état vide du fil a un bouton dont le libellé reprend une sortie nommée dans son texte.", fichiers: ["js/ui-v2-shell.js", "js/app-02-state-utils.js", "styles.css"] });

C({ id: "FIL-C18", titre: "Une photo qui ne charge pas laisse un rectangle gris muet",
  emplacement: "Carte photo — `onerror` (js/app-02-state-utils.js:10349-10356)", surfaces: ["FIL-012"], nature: "polish", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Capture FIL-012 (adresse d'image en 404) : boîte #eee de 200 px, sans texte.", probleme: "L'échec n'est pas dit et le gris #eee est hors palette.", declencheur: "Média supprimé, réseau instable, bloqueur.",
  consequence: "Carte qui paraît cassée.", proposition: "Boîte plus basse sur lavis `--accent-tile` avec « Image indisponible ».", visuels: ["FIL-012"],
  risqueRegression: "Le `onerror` est écrit d'un seul tenant (audit:echappement).", critereAcceptation: "Une image en échec affiche un libellé lisible sur un fond de la palette.", fichiers: ["js/app-02-state-utils.js", "styles.css"] });

C({ id: "FIL-C19", titre: "Une photo très haute occupe plus d'un écran",
  emplacement: "Carte photo — image en `width:100%` sans plafond (js/app-02-state-utils.js:10349-10356)", surfaces: ["FIL-008"], type: "jugement", nature: "friction", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Capture FIL-008 : la photo (rapport ~1:2,2) dépasse la hauteur visible ; ni l'auteur ni les actions ne sont à l'écran avec elle.", probleme: "Le fil perd son rythme et la carte ses repères.", declencheur: "Capture d'écran ou photo verticale très allongée.",
  consequence: "Défilement long sans commande.", proposition: "Plafonner la hauteur dans le fil (≈ 480 px, recadrage centré) ; l'image entière reste sur la page de la publication.", visuels: ["FIL-008"],
  risqueRegression: "cadrage.spec.js ; ne pas rogner les photos portrait ordinaires (4:5).", critereAcceptation: "Dans le fil à 390×844, aucune image ne dépasse 480 px de haut.", fichiers: ["styles.css"] });

C({ id: "FIL-C20", titre: "Un repartage est un texte sans lien vers l'original ; un partage d'activité déborde de la carte",
  emplacement: "Repartage — `sharePostInFeed` (js/app-03-posts-vlogs.js:78-106), rendu sans branche dédiée dans `renderPostHTML` ; partage d'activité — sous-carte (js/app-02-state-utils.js:10325-10343)",
  surfaces: ["FIL-013", "FIL-014"], nature: "clarte", priorite: "P2", gravite: 2, effort: "M",
  preuve: "Capture FIL-013 : « 📤 A partagé un post / 🎵 Léa Fontaine – Musique / citation » en texte, sans photo de l'original ni moyen de l'ouvrir (le toucher ouvre le repartage). Capture FIL-014 : la sous-carte « ÉVÉNEMENT IRL » dépasse des marges de la carte tant que la carte n'est pas redécorée (FIL-C01), et dit « événement » quand le reste dit « activité ».",
  probleme: "Le repartage perd ce qu'il partage ; l'ancienne sous-carte d'activité réapparaît mal cadrée.", declencheur: "Voir un repartage dans le fil ; ouvrir l'application avec un partage d'activité en tête.",
  consequence: "Impossible de rejoindre la publication d'origine ou son auteur ; mot « événement » résiduel.",
  proposition: "Rendre le repartage comme une carte citée cliquable (auteur, extrait, vignette) qui ouvre l'original par `sharedReel` ; aligner la sous-carte d'activité sur les marges et le mot « activité ».",
  visuels: [], risqueRegression: "partage*.spec.js ; les repartages existants portent le texte en dur dans `content`.", critereAcceptation: "Toucher la citation d'un repartage ouvre la publication d'origine ; aucune boîte ne dépasse la carte.", fichiers: ["js/app-02-state-utils.js", "js/app-03-posts-vlogs.js", "styles.css"] });

C({ id: "FIL-C21", titre: "La vidéo du fil montre un cadre noir et deux commandes de lecture",
  emplacement: "Carte vidéo — `videoPubliqueHTML` (js/app-02-state-utils.js:4224-4228)", surfaces: ["FIL-010"], nature: "polish", priorite: "P3", gravite: 1, effort: "M",
  preuve: "Capture FIL-010 : bouton « ▶ Lire » superposé aux commandes natives (lecture, volume, plein écran, menu) sur fond noir, sans image d'aperçu (`preload=\"none\"`). Fichier de substitution du banc.",
  probleme: "Deux façons de lancer la lecture et aucune idée du contenu avant de la lancer.", declencheur: "Publication vidéo dans le fil.", consequence: "Carte peu engageante ; commandes natives de 0:00 inutiles avant lecture.",
  proposition: "Masquer les commandes natives tant que la lecture n'a pas commencé ; afficher une image d'aperçu quand elle existe.", visuels: [], risqueRegression: "Lecture automatique et économie de données (`preferencesVideoPublique`) ; iOS exige `playsinline`.",
  critereAcceptation: "Avant lecture, une seule commande « Lire » est visible sur la vidéo.", fichiers: ["js/app-02-state-utils.js"] });

C({ id: "FIL-C22", titre: "« Post », « publication », « Passio », « feed » : quatre mots pour une publication et son fil",
  emplacement: "« Options du post », « Supprimer le post », « Supprimer ce post ? », « Post supprimé. » (app-04:19, 218, 261) · titre « Post » (index.html:1259) · « Charger plus de posts » (app-02:9802) · « Aucun post pour cette sélection » (app-02:9886) · « Signaler cette publication » (app-04:40) · « Publier une Passio » (ui-v2-shell.js:761)",
  surfaces: ["FIL-050", "FIL-062", "FIL-063", "FIL-091", "FIL-072"], nature: "polish", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Captures FIL-050, FIL-062, FIL-063, FIL-091, FIL-072 et lecture du code (lignes citées).", probleme: "Le même objet change de nom d'un écran à l'autre, parfois dans la même feuille.", declencheur: "Parcours ordinaire du fil.",
  consequence: "Vocabulaire hésitant, anglicismes dans une interface en français.", proposition: "« Publication » partout (« Supprimer la publication », « Afficher plus de publications »), « fil » pour le fil.", visuels: ["FIL-050"],
  risqueRegression: "Nombreux verrous lisent ces libellés (suppression-durable, interactions).", critereAcceptation: "Aucune chaîne visible du fil ne contient « post » ou « feed ».", fichiers: ["js/app-04-comments-shop.js", "js/app-02-state-utils.js", "index.html", "js/ui-v2-shell.js"] });

C({ id: "FIL-C23", titre: "Les menus mêlent emojis et pictogrammes comme icônes de fonction",
  emplacement: "Options d'un commentaire (js/app-04-comments-shop.js:2391-2408), d'une publication d'autrui (37-46), de ma publication (19-21)", surfaces: ["FIL-034", "FIL-035", "FIL-060"], nature: "polish", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Captures FIL-034 (💬 😊 🎬 📋 🔕 🚫 ⚠️), FIL-060 (🚩 🚫), FIL-062 (corbeille SVG). Deux entrées « Réagir avec un emoji » et « Réagir avec un GIF » ouvrent des panneaux voisins.",
  probleme: "Trois menus contextuels, trois styles d'icône ; l'identité demande des SVG `currentColor` pour les fonctions.", declencheur: "Ouvrir un « ⋯ ».", consequence: "Aspect hétérogène ; rendu des emojis variable selon l'appareil.",
  proposition: "Pictogrammes SVG dans les trois menus ; une seule entrée « Réagir » ; même feuille pour les deux menus (aujourd'hui `openModal` pour l'un, `#cmtSheet` pour l'autre).", visuels: ["FIL-034", "FIL-060"],
  risqueRegression: "Faible.", critereAcceptation: "Les trois menus « ⋯ » du fil emploient le même gabarit et aucune icône en emoji.", fichiers: ["js/app-04-comments-shop.js"] });

C({ id: "FIL-C24", titre: "Une publication ne peut pas être corrigée : son menu n'offre que « Supprimer »",
  emplacement: "Options de ma publication — `openPostOptions` (js/app-04-comments-shop.js:9-26)", surfaces: ["FIL-062"], type: "hypothese", nature: "friction", priorite: "P3", gravite: 2, effort: "L",
  preuve: "Capture FIL-062 : deux entrées, « Supprimer le post » et « Annuler ». Un commentaire, lui, se modifie (FIL-036).", probleme: "Une coquille oblige à supprimer puis republier (les j'aime et la discussion sont perdus).", declencheur: "Erreur dans un texte publié.",
  consequence: "Perte d'interactions ou faute laissée en ligne.", proposition: "À arbitrer par le produit : permettre de modifier le TEXTE d'une publication (mention « modifié »), comme pour un commentaire. Aucune maquette : ce serait une fonction nouvelle.", visuels: [],
  risqueRegression: "Écriture sur `posts` (policy UPDATE auteur existante côté faux serveur ; à vérifier en production).", critereAcceptation: "Décision produit consignée ; si retenue : le texte modifié est visible après rechargement, sur un second compte.", fichiers: ["js/app-04-comments-shop.js", "js/app-08-ui-modals-tour.js"] });

C({ id: "FIL-C25", titre: "Le bandeau hors ligne recouvre la barre du haut",
  emplacement: "`#offlineBanner` — position fixe en haut, z-index 9999 (index.html:1250-1253)", surfaces: ["FIL-076"], nature: "polish", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Capture FIL-076 (hors ligne simulé) : le bandeau « Mode hors-ligne — contenu en cache » masque le logo et les boutons Rechercher, Notifications et Menu ; sa croix de fermeture est un « × » de 16 px.",
  probleme: "Pendant la coupure, trois commandes de la barre sont inatteignables tant qu'on n'a pas fermé le bandeau, dont la croix est petite.", declencheur: "Perte de réseau.", consequence: "Barre du haut masquée.",
  proposition: "Faire pousser le contenu par le bandeau (ou le poser sous la barre), croix à 44 px.", visuels: [], risqueRegression: "cadrage.spec.js (hauteur du shell).", critereAcceptation: "Hors ligne, les boutons de la barre du haut restent visibles et touchables.", fichiers: ["index.html", "styles.css"] });

C({ id: "FIL-C26", titre: "L'aperçu des commentaires d'une carte affiche « 🤍 0 » pour un commentaire aimé",
  emplacement: "Carte › aperçu de deux commentaires — `commentsPreview` (js/app-02-state-utils.js:10388-10419) ; aperçus servis sans interactions (`fil_compteurs`)", surfaces: ["FIL-003"], nature: "clarte", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Capture FIL-003 : « 🤍 0 » sous un commentaire qui porte deux j'aime en base (visible « 🤍 2 » dans la discussion, FIL-030). Les trois actions de l'aperçu (🤍 💬 😊) font 28 × 40 px et leurs avatars sont focalisables sans nom (fiche FIL-002--m390, mesures.sansNom).",
  probleme: "L'aperçu se présente comme interactif mais ses compteurs sont faux tant que la discussion n'a pas été ouverte.", declencheur: "Lire une carte commentée.", consequence: "Chiffres contradictoires entre la carte et la discussion.",
  proposition: "Aperçu en lecture seule (auteur, texte, heure) : un toucher ouvre la discussion, où les compteurs sont justes.", visuels: ["FIL-003"], risqueRegression: "`likeComment` et `_patchCmtLike` ciblent aussi ces boutons ([data-cmtlike]).",
  critereAcceptation: "Aucun compteur de j'aime d'un commentaire n'est affiché avant que ses interactions aient été lues.", fichiers: ["js/app-02-state-utils.js"] });

C({ id: "FIL-C27", titre: "Rien ne distingue la publication d'un compte privé",
  emplacement: "Carte — en-tête (js/app-02-state-utils.js:10466-10485) ; filtre client des comptes privés (js/app-08-ui-modals-tour.js:4880-4882)", surfaces: ["FIL-090"], type: "jugement", nature: "clarte", priorite: "P3", gravite: 2, effort: "S", sensible: true,
  preuve: "Capture FIL-090 : la carte d'un compte privé que je suis est identique aux autres ; « Partager » y est proposé. Observation du banc : avec un état local sans abonnements, la première lecture du fil écarte cette publication (le filtre client lit `state.user.following` avant qu'il soit chargé) ; elle n'apparaît qu'au rafraîchissement suivant (échec du premier passage du scénario « volume », donnees/echecs).",
  probleme: "On ne sait pas qu'on regarde un contenu réservé aux abonnés, au moment où l'on peut le partager.", declencheur: "Suivre un compte privé.", consequence: "Risque de rediffuser sans le vouloir ce qu'un compte privé réservait.",
  proposition: "Un cadenas discret près de l'heure (« Réservé aux abonnés ») ; vérifier ce que « Partager » propose pour ces publications (domaine « partage »).", visuels: [],
  risqueRegression: "La RLS reste la barrière : ne rien assouplir.", critereAcceptation: "La carte d'un compte privé porte une mention de visibilité lisible par un lecteur d'écran.", fichiers: ["js/app-02-state-utils.js"] });

C({ id: "FIL-C28", titre: "La suite du fil se demande au bouton « ⤵ Charger plus de posts »",
  emplacement: "Bas de fil — `moreBtnHtml` (js/app-02-state-utils.js:9802), `loadMoreFeedPosts` (js/app-08-ui-modals-tour.js:9260)", surfaces: ["FIL-091"], type: "jugement", nature: "friction", priorite: "P3", gravite: 1, effort: "M",
  preuve: "Captures FIL-091 et FIL-092 (fil de 80 publications) : 20 cartes, puis un bouton ; après le toucher, la suite s'ajoute sous la position de lecture, sans saut. Le chargement automatique (`feed_window_v1`) est coupé par défaut (fiche 14).",
  probleme: "Geste manuel toutes les 20 publications ; flèche « ⤵ » et mot « posts ».", declencheur: "Lire plus de 20 publications.", consequence: "Interruption de lecture.",
  proposition: "Garder le bouton tant que le fenêtrage n'est pas levé (préalable documenté), le renommer « Afficher la suite » et montrer « Chargement… » pendant la lecture.", visuels: [], dependances: "Levée du drapeau `feed_window_v1` (fiche lots-ui 14).",
  risqueRegression: "feed-window.spec.js, capacite-fil-cache.spec.js.", critereAcceptation: "Le bouton de pagination ne contient pas le mot « posts » et indique son état pendant la lecture.", fichiers: ["js/app-02-state-utils.js"] });

C({ id: "FIL-C29", titre: "La saisie d'un commentaire s'arrête à 400 caractères sans le dire",
  emplacement: "`#newComment` `maxlength=\"400\"` (js/app-04-comments-shop.js:1323) ; refus « Trop court » sous 2 caractères (1449)", surfaces: ["FIL-032"], nature: "friction", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Capture FIL-032 : texte long en cours de saisie, aucun compteur ; le champ cesse d'accepter des caractères à 400. Le toast « Trop court » ne dit pas le minimum.", probleme: "Limite invisible.", declencheur: "Écrire un commentaire long.",
  consequence: "Fin de phrase coupée sans explication.", proposition: "Afficher « 380 / 400 » à partir de 350 caractères ; toast « Écris au moins 2 caractères ».", visuels: [], risqueRegression: "Faible.", critereAcceptation: "Au-delà de 350 caractères, un compteur est visible sous le champ.", fichiers: ["js/app-04-comments-shop.js"] });

C({ id: "FIL-C30", titre: "« Passionnés à découvrir » propose d'abord des comptes que je suis déjà",
  emplacement: "Module inséré dans le fil — js/ui-v2-shell.js:704-730", surfaces: ["FIL-018"], nature: "clarte", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Capture FIL-005 (avant, ~6 s après l'ouverture) : le module liste Léa Fontaine, Malik Benali et Marie-Charlotte…, tous trois suivis ; après un repeint (FIL-005 après) il liste d'autres comptes. Capture FIL-018.", probleme: "Le module est peint avant la lecture des abonnements et n'est pas repeint ensuite.", declencheur: "Ouverture de l'application sur un appareil dont l'état local ne connaît pas encore les abonnements.",
  consequence: "Suggestions sans objet.", proposition: "Repeindre le module à l'arrivée des abonnements (même moment que FIL-C01).", visuels: [], risqueRegression: "Faible.", critereAcceptation: "10 s après l'ouverture, le module ne liste aucun compte déjà suivi.", fichiers: ["js/ui-v2-shell.js"] });

// Constats issus de la sonde fil-04-ecritures (complétés par `--resultats`).
const R = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "fil-04-resultats.json"), "utf8")); } catch (e) { return null; } })();
const r = (chemin, defaut) => { try { return chemin.split(".").reduce((o, k) => o[k], R); } catch (e) { return defaut; } };

C({ id: "FIL-C06", titre: "Supprimer un commentaire agit sans confirmation et annonce « supprimé » même si le serveur refuse",
  emplacement: "Options de mon commentaire — `deleteCommentEntry` et `_supaDeleteCommentRow` (js/app-04-comments-shop.js:2444-2482) : ni confirmation, ni lecture de `{ error }`",
  surfaces: ["FIL-035"], nature: "fonctionnel", priorite: "P1", gravite: 3, effort: "M",
  preuve: "Capture FIL-035. Sonde fil-04-ecritures (faux serveur répondant 500 au DELETE de post_comments) : toast « " + (r("suppressionRefusee.toasts", []) || []).slice(-1)[0] + " », commentaire retiré de l'écran (" + (r("suppressionRefusee.encoreAffiche", "?") === false ? "oui" : "non") + "), ligne toujours en base (" + r("suppressionRefusee.encoreEnBase", "?") + ") ; à la relecture de la discussion il est de retour (" + r("apresRelecture.supprimeRevenu", "?") + "). Dans le code : `await supa.from(table).delete()` sans lecture du verdict, à l'inverse de la suppression d'une publication (file vérifiée `_delOb*`).",
  probleme: "Un toucher sur « Supprimer » efface aussitôt, sans retour possible ; et si l'écriture échoue, l'écran dit quand même « Commentaire supprimé » — le commentaire reste visible de tous et revient chez son auteur.",
  declencheur: "Toucher « Supprimer » (voisin de « Modifier ») ; réseau instable ou refus du serveur.", consequence: "Suppression accidentelle irréversible ; ou fausse assurance d'avoir retiré un propos.",
  proposition: "Confirmer (ou proposer « Annuler » pendant 5 s dans le toast) ; lire le verdict de l'écriture et, sur un échec, remettre le commentaire à l'écran avec « Non supprimé · Réessayer », sur le modèle de la file des commentaires.",
  visuels: [], risqueRegression: "Compteur `commentsTotal` décrémenté à tort si l'annulation n'est pas symétrique. Verrous : commentaires*.spec.js, retrait-interactions-direct.spec.js.",
  critereAcceptation: "DELETE refusé par le serveur : le commentaire est de nouveau à l'écran avec un message d'échec ; aucun toast « supprimé ». Suppression réussie : un geste d'annulation ou une confirmation existe.",
  fichiers: ["js/app-04-comments-shop.js"] });

C({ id: "FIL-C07", titre: "« Masquer ce commentaire » ne tient que jusqu'à la relecture de la discussion",
  emplacement: "Options d'un commentaire d'autrui — action « hide » (js/app-04-comments-shop.js:2437) : retrait local de la liste, aucune mémoire", surfaces: ["FIL-034"], nature: "fonctionnel", priorite: "P2", gravite: 2, effort: "M",
  preuve: "Sonde fil-04-ecritures : après « Masquer », le commentaire disparaît (affiché : " + r("masque.affiche", "?") + ") ; discussion rouverte après expiration du cache de 20 s (cache vidé par la sonde : temps simulé) : commentaire de retour (" + r("apresRelecture.masqueRevenu", "?") + ").",
  probleme: "Le geste promet de ne plus voir un commentaire ; il revient à la prochaine ouverture.", declencheur: "Masquer un commentaire puis rouvrir la discussion plus de 20 s après, ou recharger.", consequence: "Promesse non tenue sur un geste de confort et de protection.",
  proposition: "Mémoriser les commentaires masqués (liste locale bornée, par compte) et les filtrer dans `_renderCommentsList`, comme les comptes bloqués ; ou retirer l'entrée si elle ne peut pas être tenue.", visuels: [],
  risqueRegression: "Clé de stockage à inscrire dans `ACCOUNT_SCOPED_KEYS`.", critereAcceptation: "Un commentaire masqué reste masqué après rechargement de l'application, pour le même compte.", fichiers: ["js/app-04-comments-shop.js", "js/app-02-state-utils.js"] });

C({ id: "FIL-C08", titre: "« Bloquer » agit au premier toucher, sans confirmation, depuis deux menus",
  emplacement: "Options d'une publication d'autrui (js/app-04-comments-shop.js:41-43) et d'un commentaire (2407, 2438) → `blockUser` (5147-5160) : blocage et désabonnement immédiats",
  surfaces: ["FIL-034", "FIL-060"], nature: "friction", priorite: "P2", gravite: 3, effort: "S", sensible: true,
  preuve: "Captures FIL-034 et FIL-060. Sonde fil-04-ecritures : un toucher sur « Bloquer ce compte » → toasts " + JSON.stringify(r("blocage.toasts", [])) + ", comptes bloqués : " + r("blocage.bloques", "?") + ", abonnements restants : " + r("blocage.suivis", "?") + " (3 avant), aucune fenêtre de confirmation (modale ouverte : " + r("blocage.modale", "?") + "). Dans le menu d'un commentaire, l'entrée ne nomme pas la personne.",
  probleme: "Une action lourde (ne plus se voir, ne plus se suivre, publications retirées du fil) part d'un toucher, à côté de « Masquer » et « Signaler ».", declencheur: "Toucher par erreur l'entrée rouge d'un menu « ⋯ ».",
  consequence: "Blocage et désabonnement involontaires ; il faut retrouver « Comptes bloqués » dans les réglages puis se réabonner.",
  proposition: "Demander confirmation en nommant la personne et les effets (« Vous ne verrez plus vos publications ; tu ne la suivras plus »), séparer visuellement les entrées de modération ; garder le moteur et ses garde-fous.",
  visuels: ["FIL-034", "FIL-060"], risqueRegression: "stories-blocage.spec.js, reactions-commentaire-bloque.spec.js ; `blockUser` est aussi appelé depuis le profil visité (les changer ensemble).",
  critereAcceptation: "Depuis les deux menus, bloquer demande un second geste explicite qui nomme la personne ; annuler ne change rien.", fichiers: ["js/app-04-comments-shop.js"] });

C({ id: "FIL-C09", titre: "« Copier le texte » annonce « Texte copié » sans attendre le presse-papiers",
  emplacement: "Options d'un commentaire — action « copy » (js/app-04-comments-shop.js:2430-2433) : la promesse de `navigator.clipboard.writeText` n'est pas attendue", surfaces: ["FIL-034"], nature: "fonctionnel", priorite: "P3", gravite: 1, effort: "S",
  preuve: "Sonde fil-04-ecritures (presse-papiers non autorisé dans le banc) : toasts " + JSON.stringify(r("copie.toasts", [])) + ", rejets non rattrapés : " + JSON.stringify(r("copie.rejets", [])) + ". Le `try/catch` n'entoure qu'un appel asynchrone.",
  probleme: "Le succès est annoncé avant d'être connu.", declencheur: "Copier quand le navigateur refuse l'accès au presse-papiers.", consequence: "Rien n'est copié alors que l'écran dit le contraire.",
  proposition: "Attendre la promesse : « Texte copié » au succès, « Copie impossible » au refus (même aide que `partagerOuCopier`).", visuels: [], risqueRegression: "Aucun.", critereAcceptation: "Presse-papiers refusé : le toast dit « Copie impossible ».", fichiers: ["js/app-04-comments-shop.js"] });

constats.sort((a, b) => a.id.localeCompare(b.id));

// ── Registre ───────────────────────────────────────────────────────────────
const registre = [];
const L = (id, surface, composant, etat, role, geste, observation, problemes, proposition, verdict, justification, preuveExtra) => {
  const vues = vuesDe(id);
  const visuel = vues.length ? (aApres(id) ? "avant-apres" : "avant") : "aucun";
  registre.push({ id, surface, composant, etat, role, geste, observation,
    preuve: (vues.length ? "capture " + id + " (" + vues.join(", ") + ")" : "avant non capturé") + (preuveExtra ? " ; " + preuveExtra : ""),
    problemes, proposition, visuel, verdict, justification });
};
const CO = "connecté";
L("FIL-001", "Fil", "En-tête (rail des passions, envies, stories) et première carte", "contenu normal", CO, "Onglet « Découvrir »", "observe", ["FIL-C13", "FIL-C14"], "Envies présentées comme des filtres ; libellés des stories lisibles, allégés sur petit écran.", "a-ameliorer", "L'en-tête fonctionne mais ses filtres ne se disent pas et il pèse sur petit écran.", "sonde fil-01-etat ; rendu : index.html:606-652");
L("FIL-002", "Fil", "Carte de publication — photo, barre d'actions", "contenu normal", CO + " · lecteur", "Défiler jusqu'à la carte", "observe", ["FIL-C02", "FIL-C03", "FIL-C05"], "Icônes SVG nommées, compteurs lisibles, état aimé lu du serveur.", "a-ameliorer", "Les actions les plus fréquentes sont les moins lisibles.", "sonde fil-02-interactions ; rendu : js/app-02-state-utils.js:10279");
L("FIL-003", "Fil", "Carte — aperçu de deux commentaires, porte « Trouver une activité »", "contenu normal", CO, "Bas d'une carte commentée", "observe", ["FIL-C26", "FIL-C02"], "Aperçu en lecture seule qui ouvre la discussion.", "a-ameliorer", "Compteurs d'aperçu faux, actions minuscules.", "rendu : js/app-02-state-utils.js:10388");
L("FIL-004", "Fil", "Carte — ma publication, texte court", "propriétaire", CO + " · propriétaire", "Défiler jusqu'à ma publication", "observe", [], "Aucun changement propre à cette carte.", "a-conserver", "La carte du propriétaire est identique aux autres, avec son « ⋯ » : rien à signaler.", "");
L("FIL-005", "Fil", "Carte — publication reliée à une activité", "activité chargée après le fil", CO, "Ouvrir l'application", "observe", ["FIL-C01", "FIL-C30"], "La porte « Voir l'activité » est posée dès que l'activité est connue.", "a-ameliorer", "Le passage vers l'IRL manque pendant la première minute.", "sondes parcours-02/03 (coordination)");
L("FIL-006", "Fil", "Carte — texte long tronqué (« Lire la suite »)", "texte > 220 caractères", CO, "Défiler", "observe", [], "Aucun changement.", "a-conserver", "La coupure et « Lire la suite » sont clairs depuis le correctif du 2026-11-10 ; la page affiche le texte entier.", "rendu : js/app-02-state-utils.js:10421-10424");
L("FIL-007", "Fil", "Carte — photo portrait", "contenu normal", CO, "Défiler", "observe", [], "Aucun changement.", "a-conserver", "La photo portrait tient dans l'écran avec son en-tête.", "");
L("FIL-008", "Fil", "Carte — photo très haute", "média très allongé", CO, "Défiler", "observe", ["FIL-C19"], "Hauteur plafonnée dans le fil.", "a-ameliorer", "La photo dépasse l'écran.", "");
L("FIL-009", "Fil", "Carte — photo sans texte", "texte vide", CO, "Défiler", "observe", [], "Aucun changement.", "a-conserver", "Sans texte, la carte reste équilibrée.", "");
L("FIL-010", "Fil", "Carte — vidéo", "avant lecture", CO, "Défiler", "simule", ["FIL-C21"], "Une seule commande de lecture avant le démarrage.", "a-ameliorer", "Double commande sur cadre noir.", "vidéo locale de substitution (boucle.webm)");
L("FIL-011", "Fil", "Carte — audio", "avant lecture", CO, "Défiler", "simule", [], "Aucun changement.", "a-conserver", "Le lecteur audio natif sur lavis est lisible ; à vérifier sur iPhone (rendu WebKit du lecteur).", "fichier local de substitution");
L("FIL-012", "Fil", "Carte — photo en échec", "média en échec (404)", CO, "Défiler", "simule", ["FIL-C18"], "L'échec est dit sur un fond de la palette.", "a-ameliorer", "Rectangle gris muet.", "adresse d'image en 404 dans le jeu de données");
L("FIL-013", "Fil", "Carte — repartage d'une publication", "contenu normal", CO, "Défiler", "observe", ["FIL-C20"], "Citation cliquable vers l'original (non maquettée : demande un rendu nouveau).", "a-ameliorer", "Le repartage ne mène pas à ce qu'il partage.", "rendu : js/app-03-posts-vlogs.js:78-106");
L("FIL-014", "Fil", "Carte — partage d'une activité (sous-carte « ÉVÉNEMENT IRL »)", "activité chargée après le fil", CO, "Défiler", "observe", ["FIL-C01", "FIL-C20"], "Même correction que FIL-005 ; sous-carte alignée.", "a-ameliorer", "Sous-carte ancienne visible et débordante tant que la carte n'est pas redécorée.", "rendu : js/app-02-state-utils.js:10325-10343");
L("FIL-015", "Fil", "Carte — nom d'auteur très long, photo panoramique", "nom de 47 caractères", CO, "Défiler", "observe", [], "Aucun changement.", "a-conserver", "Le nom passe sur deux lignes sans chevaucher le « ⋯ » ; la photo panoramique garde son rapport.", "");
L("FIL-016", "Fil", "Rangée de stories (porte d'entrée)", "stories réelles et d'exemple", CO, "Haut du fil", "observe", ["FIL-C14"], "Libellés à 11 px.", "a-ameliorer", "Libellés de 9,5 px.", "rendu : js/app-08-ui-modals-tour.js:630-704 ; intérieur : domaine « bobines »");
L("FIL-017", "Fil", "Module « Bobines à découvrir » (porte d'entrée)", "contenu normal", CO, "Défiler après la 2ᵉ carte", "observe", [], "Aucun changement.", "a-conserver", "Le rail est titré et se distingue des cartes ; l'intérieur relève du domaine « bobines ».", "rendu : js/ui-v2-shell.js:582");
L("FIL-018", "Fil", "Module « Passionnés à découvrir »", "contenu normal", CO, "Défiler après la 4ᵉ carte", "observe", ["FIL-C30"], "Module repeint à l'arrivée des abonnements.", "a-ameliorer", "Propose d'abord des comptes déjà suivis.", "rendu : js/ui-v2-shell.js:704");
L("FIL-019", "Fil", "Séparateur « Exemples PASSIO » après le réel (« Tu es à jour »)", "réel puis exemples", CO, "Défiler jusqu'à la fin des publications réelles", "observe", ["FIL-C16"], "Texte raccourci.", "a-conserver", "La frontière entre réel et exemples est dite au bon endroit ; seul le texte gagnerait à être plus court.", "rendu : js/app-02-state-utils.js:8595");
L("FIL-030", "Discussion", "Feuille « Discussion » d'une publication", "34 commentaires (page de 30)", CO, "Carte → « 💬 34 »", "observe", ["FIL-C04", "FIL-C05", "FIL-C11"], "Liste haute, titre unique, saisie compacte nommée.", "a-ameliorer", "Lucarne de 260 px et compteur instable.", "sonde fil-02-interactions ; rendu : js/app-04-comments-shop.js:1298");
L("FIL-031", "Discussion", "Saisie d'un commentaire, clavier ouvert", "clavier simulé (−300 px)", CO, "Toucher le champ", "simule", ["FIL-C04"], "Voir FIL-030.", "a-verifier", "Clavier simulé par réduction de fenêtre : à confirmer sur un véritable téléphone (iOS et Android).", "banc.simulerClavier");
L("FIL-032", "Discussion", "Commentaire long en cours de saisie", "texte de 260 caractères", CO, "Saisir", "observe", ["FIL-C29"], "Compteur à l'approche de la limite.", "a-ameliorer", "Limite de 400 caractères invisible.", "");
L("FIL-033", "Discussion", "Commentaire non envoyé (« Non envoyé · Réessayer »)", "écriture refusée (500)", CO, "Publier pendant une panne", "simule", [], "Aucun changement.", "a-conserver", "L'échec est dit sur le commentaire lui-même, le texte est gardé, un toucher relance : c'est le bon modèle (à étendre à la suppression).", "panne programmée sur le faux serveur ; js/app-04-comments-shop.js:614");
L("FIL-034", "Discussion", "Options d'un commentaire d'autrui", "menu ouvert", CO + " · autre que l'auteur", "« ⋯ » d'un commentaire", "observe", ["FIL-C07", "FIL-C08", "FIL-C09", "FIL-C23"], "Entrées regroupées, modération séparée, blocage confirmé.", "a-ameliorer", "Trois écritures de ce menu ne tiennent pas leur promesse ou agissent trop vite.", "sonde fil-04-ecritures ; js/app-04-comments-shop.js:2381");
L("FIL-035", "Discussion", "Options de mon commentaire", "menu ouvert", CO + " · auteur du commentaire", "« ⋯ » de mon commentaire", "observe", ["FIL-C06", "FIL-C23"], "Suppression confirmée ou annulable, verdict lu.", "a-ameliorer", "Suppression immédiate et succès annoncé sans preuve.", "sonde fil-04-ecritures");
L("FIL-036", "Discussion", "Modification d'un commentaire (éditeur en ligne)", "édition", CO + " · auteur du commentaire", "« ⋯ » → Modifier", "observe", ["FIL-C11"], "Aucun changement de structure.", "a-conserver", "Édition en place, « Annuler / Enregistrer » explicites, mention « modifié » : à garder (champ sans étiquette à nommer).", "js/app-04-comments-shop.js:2494");
L("FIL-037", "Discussion", "Réponse à un commentaire (champ en ligne)", "saisie", CO, "« 💬 » d'un commentaire", "observe", ["FIL-C11"], "Envoi à 44 px, un seul champ à l'écran.", "a-ameliorer", "Bouton d'envoi de 34 px et deux champs concurrents.", "js/emoji-misc.js:365");
L("FIL-038", "Discussion", "Réponses dépliées et liste « Réactions » d'un commentaire", "2 réponses, 1 réaction", CO, "« Voir 2 réponses », pastille « 👍 1 »", "observe", [], "Aucun changement.", "a-conserver", "Réponses repliées par défaut, pastille de réactions cliquable qui nomme les personnes : lisible.", "js/app-04-comments-shop.js:1093");
L("FIL-039", "Discussion", "Panneau emoji du composeur", "onglet Emoji", CO, "« 😊 » du composeur", "observe", ["FIL-C10"], "Cases de 40 px.", "a-ameliorer", "Cases de 28 px.", "js/app-04-comments-shop.js:3092");
L("FIL-040", "Discussion", "Panneau GIF du composeur", "réseau GIF refusé par le banc", CO, "Onglet « GIF »", "simule", [], "Non jugé ici.", "a-verifier", "KLIPY et Giphy sont refusés par le banc : la grille réelle et la recherche restent à vérifier en production (?equipe=1).", "réseau tiers refusé (fiche de capture, reseauRefuse)");
L("FIL-050", "Page d'une publication", "Texte long, aucun commentaire", "vide de commentaires", CO, "Carte → « Lire la suite »", "observe", ["FIL-C12", "FIL-C22"], "Titre « Publication », fond de l'application, porte d'écriture.", "a-ameliorer", "Mot, fond et absence de saisie.", "rendu : js/app-02-state-utils.js:10508 ; index.html:1256");
L("FIL-051", "Page d'une publication", "Photo, réactions, commentaires en ligne", "34 commentaires", CO, "Carte → toucher le texte", "observe", ["FIL-C12", "FIL-C02", "FIL-C05"], "Voir FIL-050.", "a-ameliorer", "Même page ; commenter passe par une feuille qui redouble la liste.", "");
L("FIL-052", "Réactions", "Panneau de réaction à une publication (Emoji | GIF)", "ouvert depuis la page", CO, "« 😊 » de la barre d'actions", "observe", ["FIL-C10"], "Panneau ramené dans l'écran, cases de 40 px.", "a-ameliorer", "Panneau coupé par le haut de l'écran.", "échec du geste à 360×640 (scénario detail-et-options)");
L("FIL-053", "Réactions", "Réaction choisie — ligne de validation", "emoji choisi, non envoyé", CO, "Toucher un emoji", "observe", ["FIL-C10"], "Un toucher réagit ; validation gardée pour le GIF.", "a-ameliorer", "Deux touchers pour une réaction.", "");
L("FIL-054", "Réactions", "Liste « Réactions » d'une publication", "4 réactions", CO, "Pastille « 🔥 3 »", "observe", [], "Aucun changement.", "a-conserver", "Qui a réagi, avec quoi : court et clair ; se ferme au toucher extérieur.", "js/app-04-comments-shop.js:1215");
L("FIL-060", "Menus", "Options d'une publication d'autrui", "menu ouvert", CO + " · autre que l'auteur", "« ⋯ » de la carte", "observe", ["FIL-C08", "FIL-C23"], "Pictogrammes SVG, blocage confirmé.", "a-ameliorer", "Blocage au premier toucher.", "js/app-04-comments-shop.js:31");
L("FIL-061", "Menus", "Signaler une publication — motif", "saisie", CO, "« ⋯ » → Signaler", "observe", [], "Aucun changement.", "a-conserver", "Champ étiqueté « Motif », confidentialité dite, motif exigé (3 caractères), « Annuler » présent.", "js/app-04-comments-shop.js:5280");
L("FIL-062", "Menus", "Options de ma publication", "menu ouvert", CO + " · propriétaire", "« ⋯ » de ma carte", "observe", ["FIL-C22", "FIL-C24"], "Mot « publication ».", "a-ameliorer", "Vocabulaire ; modification absente (à arbitrer).", "js/app-04-comments-shop.js:9");
L("FIL-063", "Menus", "Confirmation de suppression d'une publication", "confirmation", CO + " · propriétaire", "« ⋯ » → Supprimer", "observe", ["FIL-C22"], "Mot « publication ».", "a-conserver", "Confirmation exemplaire : conséquence dite, aperçu du texte, bouton rouge distinct, « Annuler » ; seul le mot « post » est à aligner.", "js/app-04-comments-shop.js:202");
L("FIL-064", "Passage vers l'IRL", "Feuille « Trouver une expérience »", "ouverte depuis une carte", CO, "« Trouver une activité » au bas d'une carte", "observe", [], "Aucun changement.", "a-conserver", "Trois suites nommées vers l'IRL depuis n'importe quelle carte : la porte est discrète (44 px) et claire. L'intérieur relève des domaines IRL.", "js/ui-v3-passerelle.js");
L("FIL-070", "Fil", "Séparateur « Exemples PASSIO » seul", "aucune publication réelle", CO + " · compte neuf", "Ouvrir le fil", "observe", ["FIL-C16"], "Une phrase, mêmes gestes.", "a-ameliorer", "Quatre lignes pâles avant le contenu.", "");
L("FIL-071", "Fil", "Carte d'exemple (« Exemple PASSIO »)", "contenu d'exemple", CO, "Défiler", "observe", [], "Aucun changement.", "a-conserver", "L'étiquette « Exemple PASSIO » et la pastille d'envie s'empilent proprement ; pas de « ⋯ » sur un exemple : honnête.", "js/first-run.js (etiquetteDemo)");
L("FIL-072", "Fil", "État vide — « Tu ne suis encore personne »", "« Suivis » seul, aucun abonnement", CO, "Décocher la passion", "observe", ["FIL-C17", "FIL-C22"], "Bouton aligné sur le message.", "a-ameliorer", "Le bouton ne correspond pas au conseil.", "js/app-02-state-utils.js:9862");
L("FIL-073", "Fil", "Envie cochée sans source", "envie + « Suivis » sans abonnement", CO, "Cocher « Apprendre »", "observe", ["FIL-C13", "FIL-C17"], "Voir FIL-001.", "a-ameliorer", "L'envie cochée n'est pas mentionnée.", "");
L("FIL-074", "Fil", "État vide — « Choisis tes passions »", "rien de coché", CO, "Tout décocher", "observe", ["FIL-C17"], "Bulles décochées plus lisibles.", "a-ameliorer", "Bulles décochées très pâles.", "js/app-02-state-utils.js:9870");
L("FIL-075", "Fil", "Fil filtré par l'envie « Rencontrer »", "envie cochée", CO, "Cocher « Rencontrer »", "observe", ["FIL-C13"], "Voir FIL-001.", "a-ameliorer", "État coché peu visible.", "");
L("FIL-076", "Fil", "Fil hors ligne (bandeau)", "hors ligne simulé", CO, "Couper le réseau", "simule", ["FIL-C25"], "Bandeau qui ne masque pas la barre.", "a-ameliorer", "Barre du haut recouverte.", "context.setOffline(true) + événement « offline »");
L("FIL-080", "Fil", "Fil d'un visiteur (bienvenue, exemples)", "première visite", "visiteur", "Ouvrir l'application sans compte", "observe", ["FIL-C15"], "Séparateur réduit à une ligne, sans bouton.", "a-ameliorer", "Message de compte adressé à un visiteur.", "sonde fil-03-visiteur");
L("FIL-081", "Fil", "Demande de compte au j'aime (visiteur)", "action réservée", "visiteur", "Toucher « 🤍 »", "observe", [], "Aucun changement.", "a-conserver", "Le motif est nommé (« pour aimer cette publication »), trois sorties dont « Continuer à explorer » : rien n'est perdu.", "js/first-run.js:1463");
L("FIL-090", "Fil", "Carte — publication d'un compte privé suivi", "compte privé, abonnement accepté", CO + " · abonné", "Défiler", "observe", ["FIL-C27"], "Mention de visibilité.", "a-verifier", "La mention relève d'un choix de confidentialité à arbitrer ; le retard d'apparition est à confirmer hors banc.", "état local pré-rempli avec les abonnements");
L("FIL-091", "Fil", "Bas de fil — « Charger plus de posts »", "80 publications", CO, "Défiler jusqu'en bas", "observe", ["FIL-C28", "FIL-C22"], "Libellé et état de chargement.", "a-ameliorer", "Mot « posts », geste manuel.", "js/app-02-state-utils.js:9802");
L("FIL-092", "Fil", "Après « Charger plus »", "page suivante ajoutée", CO, "Toucher le bouton", "observe", [], "Aucun changement.", "a-conserver", "La suite s'ajoute sous la position de lecture, sans saut ni rechargement des cartes déjà là.", "js/app-08-ui-modals-tour.js:9260");
// Surfaces identifiées dans le code, non rendues ou non vérifiables ici.
L("FIL-100", "Fil", "Squelette de chargement (#feedSkeleton)", "chargement", "tous", "Premier affichage", "code", [], "—", "a-conserver", "Deux cartes fantômes remplacées dès le premier rendu ; trop bref pour être capturé.", "index.html:652 ; js/app-02-state-utils.js:9595");
L("FIL-101", "Fil", "Tirer pour rafraîchir (#_pullIndicator)", "geste tactile", CO, "Tirer le fil vers le bas", "inaccessible", [], "—", "a-verifier", "Geste tactile continu non reproduit par le banc : à vérifier sur un véritable téléphone (seuil, retour haptique, indicateur).", "index.html:608 ; js/app-02-state-utils.js:8365");
L("FIL-102", "Fil", "Récap de la semaine (carte en tête du fil)", "compte de 3 jours et plus", CO, "Première ouverture de la semaine", "code", [], "—", "a-verifier", "Le module exige une session datée d'au moins trois jours, que la session fictive du banc ne porte pas : carte non rendue. À vérifier avec un compte réel de test.", "js/recap-semaine.js");
L("FIL-103", "Fil", "Séparateur « Exemples PASSIO » — panne de lecture (« Réessayer »)", "lecture du fil en échec", CO, "Serveur injoignable", "code", [], "—", "a-conserver", "D'après le code et son verrou (fil-panne-reseau.spec.js), la panne est dite et « Réessayer » relit ; non rejoué ici.", "js/app-02-state-utils.js:8604-8706");
L("FIL-104", "Fil", "Repli d'exploration (« Rien encore dans … »)", "passions sans contenu", CO, "Passion sans publication ni exemple", "code", [], "—", "a-verifier", "Non atteint avec les passions du banc (toutes ont des exemples) : trois boutons en tête puis six cartes « Exploration » d'après le code ; hiérarchie des trois boutons à regarder.", "js/app-02-state-utils.js:8843-8952");
L("FIL-105", "Fil", "État vide — « Rien en « Apprendre » » (envie qui vide le fil)", "envie sans résultat", CO, "Cocher une envie sans contenu", "code", ["FIL-C13"], "—", "a-conserver", "D'après le code, le message nomme l'envie et la commande qui la lève ; non atteint ici (les exemples couvrent chaque envie).", "js/app-02-state-utils.js:9848-9861");
L("FIL-106", "Fil", "Aide contextuelle « Appuie sur l'auteur… »", "première carte, aide jamais vue", CO, "Premier rendu du fil", "code", [], "—", "a-verifier", "Masquée par défaut dans le banc (aides déjà vues) ; sa superposition à la landing est connue (lot 28). Traitée par le domaine transverse.", "js/app-02-state-utils.js:8971-9059");
L("FIL-107", "Fil", "Nouveaux contenus arrivant en direct", "temps réel", CO, "Publication d'un autre compte pendant la lecture", "inaccessible", [], "—", "a-verifier", "Le canal temps réel est avalé par le banc : insertion en tête et effet sur la position de lecture à vérifier à deux comptes.", "js/app-08-ui-modals-tour.js:9212 (feedAddRealtimePost)");
L("FIL-108", "Passage vers l'IRL", "Bouton « 🤝 Organiser un IRL » (pont passio_feed_irl_bridge_v1)", "drapeau coupé par défaut", CO, "Drapeau local à « 1 »", "code", [], "—", "a-conserver", "Coupé par défaut et masqué sous UI-3, qui porte la seule porte « Trouver une activité » : pas de double porte à l'écran.", "js/app-07-ia-explore-irl.js:5523-5601");
L("FIL-109", "Fil", "Sélecteur de passions ouvert depuis le fil", "porte d'entrée", "visiteur · " + CO, "« Choisir mes passions », « Explorer les passions »", "code", [], "—", "a-verifier", "Portes vues sur FIL-080 et FIL-074 ; l'intérieur (js/passion-selector.js) relève des domaines « entrée » et « profils ».", "js/passion-selector.js");
L("FIL-110", "Page d'une publication", "Média en plein écran", "inexistant pour une publication", CO, "Toucher la photo sur la page", "code", ["FIL-C12"], "—", "a-verifier", "`openFullImg` n'est appelé que par la messagerie : une photo de publication ne s'agrandit pas. Besoin à confirmer auprès d'utilisateurs avant d'ajouter quoi que ce soit.", "js/app-09-boot-pwa.js:1933");
L("FIL-111", "Page d'une publication", "Double appui sur le média = j'aime", "geste", CO, "Double appui sur la photo", "code", [], "—", "a-verifier", "Écouteur `dblclick` (js/app-03-posts-vlogs.js:462) : comportement tactile réel à vérifier sur téléphone.", "js/app-02-state-utils.js:10570");

// ── Résumé ─────────────────────────────────────────────────────────────────
const sortie = {
  domaine: "fil",
  groupe: "Fil et interactions",
  titre: "Fil et interactions",
  resume: "Le fil tient sa promesse de lecture : cartes sobres, passion et envie lisibles, réel avant les exemples, exemples étiquetés, échec d'envoi d'un commentaire dit et rattrapable, suppression d'une publication confirmée. Ce qui gêne tient aux interactions. Le passage vers l'IRL manque pendant la première minute sur une publication reliée à une activité (la carte n'est pas redécorée quand l'activité arrive). Les actions les plus fréquentes — aimer, commenter, réagir — sont des emojis pâles sans nom accessible, et le panneau de réaction sort de l'écran. La discussion se lit par une lucarne de 260 px, son compteur change en l'ouvrant, et trois écritures de son menu ne tiennent pas leur promesse : supprimer annonce un succès non vérifié et sans confirmation, masquer ne dure pas, bloquer part au premier toucher. Pour un visiteur, le premier écran parle de « ta communauté » et de publier avant de montrer un contenu. L'enjeu : Découvrir fonctionne, Partager et surtout Rencontrer perdent des gestes au moment où ils comptent.",
  aConserver: [
    "L'ordre « réel d'abord, exemples ensuite », le séparateur qui le dit et l'étiquette « Exemple PASSIO » sur chaque carte d'exemple.",
    "La mention de passion en violet près de l'heure et la pastille d'envie colorée (corail réservé à « Rencontrer »).",
    "La porte « Trouver une activité » au bas de chaque carte et sa feuille à trois suites.",
    "Le statut « Non envoyé · Réessayer » posé sur le commentaire lui-même, texte conservé.",
    "La confirmation de suppression d'une publication (conséquence, aperçu, bouton rouge distinct).",
    "Le signalement avec motif obligatoire et confidentialité dite.",
    "La demande de compte du visiteur, qui nomme l'action et laisse « Continuer à explorer ».",
    "Les réponses repliées par défaut et la pastille de réactions qui nomme les personnes.",
    "La pagination qui ajoute la suite sous la position de lecture, sans saut.",
  ],
  registre, constats,
};

// ── Contrôles ──────────────────────────────────────────────────────────────
const idsR = new Set(registre.map((x) => x.id)), idsC = new Set(constats.map((x) => x.id));
const pb = [];
registre.forEach((x) => x.problemes.forEach((c) => { if (!idsC.has(c)) pb.push("registre " + x.id + " cite un constat inconnu " + c); }));
constats.forEach((c) => {
  c.surfaces.forEach((s) => { if (!idsR.has(s)) pb.push(c.id + " cite une surface inconnue " + s); });
  c.visuels.forEach((v) => { if (!vuesDe(v).length) pb.push(c.id + " cite un visuel sans capture " + v); });
  ["titre", "emplacement", "preuve", "probleme", "declencheur", "consequence", "proposition", "risqueRegression", "critereAcceptation"].forEach((k) => { if (!c[k]) pb.push(c.id + " : champ vide " + k); });
});
constats.forEach((c) => c.surfaces.forEach((s) => { const l = registre.find((x) => x.id === s); if (l && !l.problemes.includes(c.id)) pb.push("registre " + s + " ne cite pas " + c.id); }));
fs.writeFileSync(path.join(AUDIT, "donnees", "domaines", "fil.json"), JSON.stringify(sortie, null, 2) + "\n");
const compte = (f) => registre.filter(f).length;
console.log(JSON.stringify({
  surfaces: registre.length, observe: compte((x) => x.observation === "observe"), simule: compte((x) => x.observation === "simule"), code: compte((x) => x.observation === "code"), inaccessible: compte((x) => x.observation === "inaccessible"),
  avantApres: compte((x) => x.visuel === "avant-apres"), avant: compte((x) => x.visuel === "avant"), aucun: compte((x) => x.visuel === "aucun"),
  aConserver: compte((x) => x.verdict === "a-conserver"), aAmeliorer: compte((x) => x.verdict === "a-ameliorer"), aVerifier: compte((x) => x.verdict === "a-verifier"),
  constats: constats.length, P0: constats.filter((c) => c.priorite === "P0").length, P1: constats.filter((c) => c.priorite === "P1").length, P2: constats.filter((c) => c.priorite === "P2").length, P3: constats.filter((c) => c.priorite === "P3").length,
}, null, 1));
if (pb.length) console.log("⚠ " + pb.join("\n⚠ "));
