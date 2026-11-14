# Messagerie — la conversation (domaine `msg-conversation`)

> Audit du 2026-11-10, version finale. Registre et constats : `donnees/domaines/msg-conversation.json`,
> généré par `outils/sondes/msg-conversation-_registre.js` à partir de `-_surfaces.js` et `-_constats.js`,
> qui recroise registre, constats et captures sur disque. Prototype : `prototypes/messagerie.html`.

## 1. Périmètre et méthode

- **Périmètre** : l'écran de conversation (1:1, groupe, discussion d'activité — même composant
  `#conv-fullpage`), de l'ouverture à la fermeture : en-tête, fil, bulles de tous types, barre de
  saisie, vocal, pièces jointes, emoji / GIF, menu d'un message, statuts d'envoi, défilement, cas de
  blocage, conversation d'exemple, proposition IRL, fond de conversation vu depuis le fil. La liste des
  conversations, la création, la gestion des groupes, les paramètres et les appels relèvent du domaine
  `msg-liste` : je n'y suis passé que pour entrer dans une conversation.
- **Lu** : `js/app-04-comments-shop.js` (5640-7805), `js/app-09-boot-pwa.js` (530-2110),
  `js/emoji-misc.js`, `js/ui-v6a-messages.js`, `js/ui-v6c-proposer-irl.js`,
  `js/app-07-ia-explore-irl.js` (6129-6306), `js/app-08-ui-modals-tour.js` (6716-7541),
  `js/app-02-state-utils.js` (toast), `index.html` (1392-1481, 1729-1762), `styles.css` (1468-1505,
  5909-6302, 12247-12280), `scripts/build.js`, `docs/journal/social-messagerie.md`,
  `docs/PIEGES_CONNUS.md`, et les outils du banc.
- **Ouvert** : uniquement par le banc (`sonde.js`, `capturer.js`), mode `compte` (faux serveur en
  mémoire) et mode `demo`. Gabarits : m390 partout ; m360 pour l'écran principal et la saisie ; m320 là
  où un débordement était possible ; t768 et d1440 pour l'écran principal. **Tous sont des émulations
  Chromium** (agent Android, tactile) : aucun appareil réel.
- **Jeu de données** (`outils/jeu/msg-conversation.js`, fictif) : une conversation 1:1 avec tous les
  types de message sur quatre jours (texte court et long, lien, emoji seul, photo, GIF, vidéo, vocal,
  document, fichier audio, position, réponse, réactions, accusé de lecture) ; un groupe de 5 ; une
  conversation de 230 messages ; une interlocutrice au nom très long ; une conversation vide ; une
  discussion d'activité ; un fil court pour les envois.
- **Sondes gardées comme preuve** : `outils/sondes/msg-conversation-01…11-*.js`. Scénarios de capture :
  `outils/scenarios/msg-conversation.js` (15 scénarios ; les APRÈS sont des maquettes appliquées par le
  banc, l'application n'est pas modifiée).

### Limites du banc à connaître en lisant ce rapport

| Sujet | Ce que fait le banc | Conséquence |
|---|---|---|
| Micro | Aucun micro : `getUserMedia` remplacé par un flux audio de synthèse ; le Chromium de Playwright annonce `audio/mp4` mais n'encode rien → conteneur forcé en webm. | Tout ce qui touche à l'enregistrement est « simulé ». La course « toucher bref » dépend du délai d'ouverture du micro : à mesurer sur appareil. |
| Appui long | L'appui tactile (CDP) ne produit pas le `contextmenu` d'un vrai appui long ; au relâchement Chromium émet un clic. | Feuille d'actions ouverte par appui maintenu **puis glissé** ; MSG-C64 reste une hypothèse. |
| Clavier virtuel | Simulé par réduction de la fenêtre (300 px). | MSG-C88 est une hypothèse, à vérifier sur deux téléphones. |
| Temps réel | WebSocket avalé. | Arrivée d'un message et « en train d'écrire » injectés par le point d'entrée du canal ou forcés. |
| GIF | KLIPY refusé. | Sélecteurs remplis par des images locales. |
| Page servie | `index.html` de développement ; la production sert la page construite. | La grille d'emojis cassée (MSG-152) est un défaut de course, reproduit en retardant un script ; l'état de production est MSG-151. |
| Captures | Le banc fige les animations à leur fin. | Un toast s'y trouve toujours effacé : la visibilité des toasts a été mesurée à part (sonde 10, sans figer). |

## 2. Cartographie

| Surface | Porte d'entrée | Fichiers |
|---|---|---|
| Écran de conversation (`#conv-fullpage`) | carte de la liste ; `openConversation(id)` ; notification ; profil → message | `app-04` 5654-5824, `index.html` 1392-1478, `styles.css` 5909-6085 |
| En-tête (`#convFpHead`) | — | `app-04` 5700-5724 ; bouton IRL `app-07` 6258-6306 |
| Fil (`#convFpThread`) : séparateurs, bulles, statuts | — | `app-04` 5919-6168 (`renderConvFpThread`), 7158 (`_msgStatusIndHtml`) |
| Barre de saisie (`.conv-toolbar`) | — | `index.html` 1432-1476 ; `app-04` 5726-5737, 6993 (`sendMessageFp`) |
| Barre d'enregistrement (`#voiceRecordBar`) | maintenir le micro | `index.html` 1424-1429 ; `app-09` 1981-2108 |
| Barre de réponse (`#convReplyBar`) | feuille d'actions → Répondre | `app-04` 6398-6418 |
| Liste de mentions (`#convMentionBox`) | « @ » dans un groupe | `app-04` 7634-7688 |
| « En train d'écrire » (`#convTypingBar`) | canal temps réel | `app-04` 7738-7749 |
| Feuille d'actions d'un message | appui long / clic droit | `app-04` 6263-6283, 6334-6363 |
| « Transférer vers… » | feuille d'actions | `app-04` 6569-6736 |
| « Signaler ce message » | feuille d'actions (message reçu) | `app-04` 6371-6386, 5280 |
| Menu « + » (`#convAttachMenu`) | bouton « + » | `index.html` 1437-1461 ; `ui-v6c` ; `app-09` 708-741 |
| Panneau emoji / GIF (`#convEmojiPanel`) | bouton emoji | `index.html` 1729-1762 ; `emoji-misc.js` ; `app-09` 531-609 |
| Sélecteur GIF flottant (`#gif-panel-msg`) | bouton pellicule | `emoji-misc.js` 117-193, 476-494 |
| Visionneuse d'image (`#fullImgViewer`) | toucher une photo | `app-09` 1933-1973 |
| Galerie « Pièces jointes » (`#convFilesPanel`) | « + » → Pièces jointes | `app-09` 1560-1643 |
| Toasts (`#toastStack`) | erreurs, refus, confirmations | `app-02` 3325 ; `styles.css` 1468 — **sous** la conversation (MSG-C85) |

Conditions d'apparition : boutons d'appel seulement si `appelsDisponibles()` ; bouton IRL de l'en-tête
seulement en 1:1 et après un verdict serveur favorable ; entrée « Proposer un IRL » du menu en 1:1, sans
ce verdict ; « Signaler ce message » seulement sur un message reçu ; « Supprimer pour tous » seulement sur
les miens ; nom de l'expéditeur et mentions seulement en groupe.

## 3. Parcours déroulés et états difficiles

| État exercé | Résultat observé | Réf. |
|---|---|---|
| Ouverture d'un fil riche en médias | fil 360 px au-dessus du bas de 200 ms à 3 s, jamais recalé | MSG-103, C52 |
| Ouverture d'un fil de texte (230 messages) | 40 bulles, bas atteint, 230 bulles rendues en 29 ms | MSG-180 |
| Remontée de l'historique | +40 par page, point de lecture conservé, 5 remontées pour 230 | MSG-181 |
| Message reçu pendant la relecture | saut de plus de 10 000 px vers le bas ; aucun retour rapide | MSG-184, C55 |
| Champ : 141 caractères | 11 lignes dans 126 px utiles (96 à 360 px, 56 à 320 px) | MSG-121, C60 |
| Entrée sur clavier tactile | envoie le message | MSG-128, C59 |
| Double appui sur Envoyer, Entrée × 3, espaces seuls | 2 lignes pour 2 messages ; 0 pour les espaces | MSG-127 |
| 5 200 caractères | refusé, texte conservé, **message de refus invisible** | MSG-126, C85 |
| Serveur lent (7 s) | « ✓ » + 🕓 à 55 % | MSG-122, C62 |
| Serveur en erreur 500 puis « réessayer » | « ✓ réessayer » 47 × 15 px ; relance réussie | MSG-123, C62 |
| Hors ligne puis reconnexion | bandeau sur l'en-tête, « ✓ réessayer » ; envoi automatique et unique au retour | MSG-124/125, C62/C63 |
| GIF et position en panne serveur | affichés « ✓ », 0 ligne en base, rien en file | MSG-163, C57 |
| Photo, document, fichier audio (vrai sélecteur) | photo partie sans aperçu ; document illisible ; audio = bulle vide | MSG-155/156, C72/C50/C51 |
| Dépôt de photo en panne | statut d'échec, relance depuis la copie locale | MSG-164 |
| Position accordée / refusée | envoyée en un toucher / rien n'est envoyé, refus invisible | MSG-157/158, C56/C85 |
| Appui long : texte, photo, vidéo | feuille sous le doigt (texte, photo) ; rien sur la vidéo | MSG-148/149, C64/C65 |
| Supprimer pour moi / pour tous | immédiat, sans confirmation ni annulation | MSG-146, C58 |
| Vocal : maintien, toucher bref, glissement, ✕, refus | envoi correct ; enregistrement qui continue seul ; glisser envoie ; ✕ de 18 × 30 px ; refus invisible | MSG-170 à 175, C53/C54/C81 |
| Visionneuse + Retour ; panneau emoji + Retour | la conversation se ferme derrière, la couche reste | MSG-160/202, C73 |
| Brouillon : retour / rechargement | conservé / perdu (comme fond, épinglage, sourdine) | MSG-199/200, C74 |
| Bloqué par l'autre ; compte que j'ai bloqué | « réessayer » sans fin ; fil amputé, champ actif | MSG-203/204, C78 |
| Verdict IRL serveur « non » | bouton d'en-tête absent, entrée du menu présente | MSG-197, C69 |
| Conversation d'exemple | envoi et micro sans effet visible (refus masqué) | MSG-206, C87/C85 |
| Toast émis conversation ouverte (sonde 10) | absent de l'écran ; `elementFromPoint` → fil ou fond de feuille | C85 |
| Tablette, ordinateur | colonne centrée de 540 / 440 px, comme le reste de l'application | MSG-208 |

## 4. Ce qui fonctionne et doit être conservé

- L'ouverture ne donne pas le focus au champ sur tactile : le clavier ne masque pas le fil.
- Aucun doublon : double appui et Entrée répétée ne créent qu'un message.
- La file hors ligne : le message part seul, une seule fois, au retour du réseau.
- « Réessayer » renvoie réellement le message ; rien n'est perdu ; le dépôt d'une pièce jointe a son
  statut d'échec et sa relance depuis la copie locale.
- Pagination par 40 avec point de lecture conservé ; rendu rapide ; arrivée sur le dernier message dans
  un fil de texte ; ce que j'envoie me ramène en bas.
- Répondre : extrait cité, saut au message cité. Signaler : feuille claire, confidentialité rappelée.
- Groupes : nom de l'expéditeur au-dessus de chaque série, mentions @ propres. Nom très long coupé
  proprement. Conversation vide accueillante.
- Champ à 16 px (pas de zoom iOS) qui grandit jusqu'à cinq lignes ; message de plus de 5 000 caractères
  refusé avec le texte conservé.
- Le retour système ferme la conversation ; le brouillon est gardé pendant la session.
- Le menu « + » (lignes de 60 px, pictogrammes au trait) ; la galerie des pièces jointes et son état vide.
- Bulles de texte : alignements, largeur, contrastes ; réactions et accusé ✓✓ discrets ; la recherche
  d'emoji en français.

## 5. Constats par surface

**Ouverture et en-tête (MSG-100, 101, 103, 194, 195).** À l'ouverture d'un fil qui finit par des médias,
le dernier message est sous le pli (MSG-C52, P1). L'en-tête affiche « Voir le profil » au lieu de ce qui
relie les deux personnes, et la discussion d'une activité ne mène pas à sa fiche (MSG-C68). Paramètres,
Membres et Retour sous 44 px, sans nom accessible (MSG-C75).

**Bulles (MSG-104 à 113).** Mes vocaux, documents et positions envoyés sont blancs sur lavande, 1,08:1
(MSG-C50, P1) ; un fichier audio envoyé est une bulle vide (MSG-C51). « Aujourd'hui » deux fois,
« Hier » pour avant-hier (MSG-C61). Liens non cliquables (MSG-C67). Lecteur de vocal à 34 px et vitesse
de 24 × 18 px (MSG-C75) ; deux vocaux simultanés, son qui continue après la fermeture (MSG-C80) ; noms de
fichiers coupés à 140 px (MSG-C83). Heure sous chaque bulle : sept messages par écran (MSG-C77).

**Saisie et envoi (MSG-102, 120 à 128).** Champ de 156 px entre cinq commandes, deux entrées GIF
(MSG-C60, P1 ; MSG-C71). Entrée envoie sur mobile (MSG-C59). « ✓ » affiché sur un message pas encore
parti ou en échec, « réessayer » de 47 × 15 px (MSG-C62). Hors ligne, le bandeau global couvre Retour,
nom et menu (MSG-C63). Clavier ouvert : en-tête probablement hors écran (MSG-C88, hypothèse).

**Toasts (toute la conversation).** La pile des toasts (z-index 200) est sous le panneau de conversation
(z-index 1200) : aucun refus, aucune erreur, aucune confirmation n'est visible conversation ouverte
(MSG-C85, P1). Cela vide de leur effet les garde-fous de MSG-126, 158, 164, 165, 175, 177, 178, 185, 206.

**Menu d'un message (MSG-140 à 149).** Suppressions immédiates et irréversibles (MSG-C58, P1). Feuille
ouverte sous le doigt encore posé (MSG-C64, hypothèse) ; aucune feuille sur une vidéo (MSG-C65). Citation
« [MEDIA] atelier.jpg » et « Copier le texte » sur une photo (MSG-C66). Réactions de 36 px, pastilles
inertes, actions seulement à l'appui long (MSG-C75, C76). Transfert sans confirmation, conversation
d'origine en tête (MSG-C84). Icônes en emoji (MSG-C82).

**Pièces jointes, emoji, GIF (MSG-150 à 166).** Position exacte envoyée en un toucher (MSG-C56, P1) ;
photo partie sans aperçu (MSG-C72). GIF et position en échec affichés envoyés (MSG-C57, P1). Panneau
emoji serré, catégorie vide, ancien violet, grille cassée si un script arrive tard (MSG-C70). Deux
sélecteurs de GIF, envoi au premier toucher (MSG-C71). Le Retour système ferme la conversation derrière la
visionneuse et le panneau emoji (MSG-C73).

**Vocal (MSG-170 à 179).** Un simple toucher lance un enregistrement qui continue sans doigt posé, et le
toucher suivant l'envoie (MSG-C53, P1, sensible). Annuler demande un second doigt sur 18 × 30 px ;
glisser puis relâcher envoie (MSG-C54, P1). Aucun message sur un appui trop court, refus du micro sous
forme de question — et de toute façon invisible (MSG-C81, C85).

**Longue conversation (MSG-180 à 186).** Un message reçu pendant la relecture ramène de force en bas ;
pas de bouton de retour aux derniers messages (MSG-C55, P1). Citation au-delà de 40 messages : « Message
introuvable » (MSG-C86).

**Variantes (MSG-190 à 210).** Deux entrées « proposer un IRL » différentes, aucune en corail, verdict
serveur appliqué à une seule (MSG-C69). Fonds sombres peu lisibles (MSG-C79). Brouillon perdu au
rechargement (MSG-C74, même cause que MSG-C01 du domaine liste). Blocage : « réessayer » sans fin d'un
côté, fil amputé et champ actif de l'autre (MSG-C78). Conversation d'exemple non signalée, envoi sans
effet visible (MSG-C87).

### Sensible

- MSG-C53 : un enregistrement involontaire peut partir chez l'interlocuteur.
- MSG-C56 : la position précise part sans confirmation.
- MSG-C67 : rendre les liens cliquables exige un filtrage strict des schémas (http/https seulement).
- MSG-C69 : le garde-fou serveur des propositions IRL ne s'applique qu'à l'une des deux entrées.
- MSG-C78 : l'état « bloqué » ne doit pas être révélé à la personne bloquée.

## 6. Cohérence avec le reste de l'application

- **Toasts** : visibles sur les écrans à onglets, invisibles dans la conversation (et sous toute feuille
  ouverte par-dessus). À vérifier sur les autres panneaux plein écran (bobines, création).
- **Icônes** : emoji dans la feuille d'actions et les toasts, pictogrammes au trait dans le menu « + » et
  la barre de saisie ; `#7c3aed` en dur dans le panneau emoji au lieu de l'accent `#6D32F4`.
- **IRL** : « Proposer un moment IRL » (épingle) en en-tête, « Proposer un IRL » (poignée de main) dans le
  menu ; ni l'un ni l'autre en corail, couleur réservée au passage au réel ailleurs.
- **Liens** : actifs dans les commentaires, inertes dans les messages.
- **Confirmations** : fenêtres natives (`confirm`, `prompt`) dans les paramètres de conversation, feuilles
  de l'application pour le signalement, rien du tout pour la suppression d'un message.
- **Libellés de types** : « Photo » dans la liste, « [MEDIA] nom » dans la citation et le presse-papiers.
- **Statuts** : la coche « ✓ » veut dire « envoyé » dans le fil, mais s'affiche aussi sur un message en
  cours ou en échec.
- **Grands écrans** : la conversation reste dans la colonne centrée de l'application (cohérent).

## 7. Non vérifié, et comment le vérifier

| Point | Pourquoi | Comment |
|---|---|---|
| Clavier virtuel ouvert (MSG-C88, MSG-120) | émulation par réduction de fenêtre | Android Chrome et iOS Safari réels : nom, dernier message et champ visibles ensemble |
| Appui long réel (MSG-C64, MSG-148) | CDP ne produit pas le `contextmenu` | deux téléphones : relâcher après l'ouverture de la feuille déclenche-t-il une ligne ? |
| Toucher bref sur le micro (MSG-C53) | délai d'ouverture du micro simulé | appareil réel, micro déjà autorisé puis à autoriser |
| Envoi d'une vidéo (MSG-166) | le Chromium du banc n'encode pas le H.264 | appareil réel : durée, retour visuel, refus |
| Refus de fichier lourd (MSG-165) | fichier de 40 Mo non produit | appareil réel, après correction de MSG-C85 |
| Appareil sans MediaRecorder (MSG-177) | le banc l'a | navigateur ancien / WebView |
| Vocal webm sur iPhone (MSG-178) | demande un iPhone | iPhone réel, ancien vocal |
| Canal temps réel (« en train d'écrire », arrivée) | WebSocket avalé | deux comptes en préproduction |
| Lecteur d'écran et clavier complet | non déroulé | TalkBack / VoiceOver |
| Écrire sans compte (MSG-207) | non atteignable dans le banc | domaine « comptes » |

## 8. Compteurs

| | |
|---|---|
| Surfaces inventoriées | 88 |
| Observées (vrais gestes) | 55 |
| Simulées | 27 |
| Code seul | 5 |
| Inaccessibles | 1 |
| Avec avant-après | 48 |
| Avec avant seul | 26 |
| Sans capture | 14 |
| À conserver | 13 |
| À améliorer | 65 |
| À vérifier | 10 |
| Constats | 39 — P0 : 0 · P1 : 10 · P2 : 21 · P3 : 8 · sensibles : 5 |
