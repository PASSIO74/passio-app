# Messagerie — liste, nouvelle conversation, groupes, paramètres, appels

Domaine `msg-liste` · groupe Messagerie · surfaces MSG-001 à MSG-084 · constats MSG-C01 à MSG-C32.
Registre et constats complets : `donnees/domaines/msg-liste.json`. Captures : `captures/msg-liste/`.

## 1. Périmètre et méthode

**Lu.** `docs/journal/social-messagerie.md`, `docs/lots-ui/04-…` (UI-6A), `docs/APPELS_TRANSITION.md` ;
`js/ui-v6a-messages.js` en entier ; `js/app-04-comments-shop.js` (3600–4290, 5140–5830, 6296–6800) ;
`js/app-05-config-profil.js` (586–840, 1198–2512) ; `js/app-09-boot-pwa.js` (1352–1410, 1480–1930) ;
`js/app-08-ui-modals-tour.js` (2125–2204, 2590–2660, 6470–6610, 7020–7250, 7355–7540, 9116–9152) ;
`index.html` (écran Messages, conversation pleine page, panneau Options) ; `styles.css` (5550–5975, 6274–6299).

**Ouvert.** L'application uniquement par le banc. Douze sondes gardées comme preuves
(`outils/sondes/msg-liste-01` à `-10`), puis onze scénarios de capture (`outils/scenarios/msg-liste.js`) :
43 surfaces capturées, 19 avec maquette après. Jeu fictif `outils/jeu/msg-liste.js` : compte sans
conversation, 12 conversations (tous les types d'aperçu, non-lus, groupe, discussion d'activité, nom très
long, compte privé, fil sans message), 46 conversations.

**Modes.** `compte` (session fictive, faux serveur) pour presque tout ; `demo` pour les exemples et l'état vide.
**Gabarits.** m390 partout ; m360 pour l'écran Messages et les surfaces de saisie ; t768 et d1440 pour
l'écran Messages. Ce sont des émulations Chromium, aucun véritable appareil.

**Limites à connaître.**
- **Les appels sont désactivés en production** (`PASSIO_APPELS_ACTIFS = false`, app-05:648) : aucun bouton
  d'appel n'est rendu. Les six écrans d'appel sont **simulés** — drapeau d'essai `passio_appels_actifs`
  armé, écrans rendus par `_callRenderIncomingUI` / `_callRenderActiveUI`, sans WebRTC.
- Le temps réel est coupé dans le banc : l'arrivée d'un message est simulée en appelant
  `_handleIncomingConvMessage` avec une ligne de la forme du serveur.
- Le faux serveur n'imite pas la clé étrangère `conv_members.user_id → profiles` : il accepte un membre
  `u_…` que la production refuse (ce refus est cité « d'après le code », app-05:2246–2249).
- Les boîtes `confirm()` / `prompt()` du navigateur ne se capturent pas : leur texte est relevé par
  l'événement « dialog ».
- Épingle et sourdine de MSG-001, archive non lue de MSG-030 : données injectées après le démarrage (simulé).

## 2. Cartographie

| Surface | Porte d'entrée | Condition | Code |
|---|---|---|---|
| Écran Messages (tête, recherche, liste) | barre basse › Messages | toujours | app-04:5451, ui-v6a-messages.js, index.html:1192 |
| Menu « + » | bouton « + » | lot UI-6A actif | ui-v6a-messages.js:141 |
| Bandeau et vue « Archivées » | sous la recherche | ≥ 1 conversation archivée | app-04:5474, 5625 |
| Pagination | bas de liste | > 30 conversations | app-04:5533, 5612 |
| Squelette, état vide, aucun résultat | — | liste vide selon le cas | app-04:5498–5530 |
| Nouveau message | « + » › Nouveau message | — | app-04:4007–4285 |
| Nouveau groupe | « + » › Nouveau groupe | — | app-05:1906–1997 |
| En-tête de conversation | toucher une ligne | 1:1 / groupe / exemple | app-04:5685–5724 |
| Paramètres | en-tête › ⋮ | 14 entrées en 1:1, 12 en groupe | app-09:1645–1713 |
| Fond de conversation | Paramètres | — | app-09:1855–1897 |
| Pièces jointes | Paramètres ou menu « + » du champ | — | app-09:1560–1643 |
| Fenêtre des membres | en-tête de groupe › icône | groupe | app-05:1999–2493 |
| Signaler, bloquer | Paramètres (1:1) | — | app-04:5147–5244, app-09:1803 |
| Comptes bloqués | Options ··· › Personnalisation | — | app-04:5412–5440, index.html:517 |
| Badge de l'onglet | barre basse | ≥ 1 non-lu réel | app-08:2165 |
| Appels | en-tête 1:1 | **désactivés en production** | app-05:600–1760 |

Constaté au passage : les filtres lu / non lu / passion n'existent plus (`renderMessageFilters` vide les deux
rangées, app-04:3997) ; la ligne de liste n'a aucun geste (ni glisser, ni appui long).

## 3. Parcours déroulés et états difficiles

| État exercé | Résultat observé |
|---|---|
| Compte sans conversation | cinq « Exemple PASSIO · réponse désactivée » ; aucun badge |
| Premier message d'un compte neuf | « Nouveau message » : cinq lignes « Passionné » puis cinq personnages d'exemple (MSG-C03) |
| Choisir une personne sans écrire | conversation créée en base, ligne « Démarrer la conversation… » ; exemples toujours mêlés (MSG-C22, C24) |
| 12 puis 46 conversations | liste en 0,2 s ; 30 lignes puis « Voir les conversations plus anciennes (16) » ; position gardée au retour |
| Nom très long | deux lignes dans la liste, coupé dans l'en-tête, trois lignes sur l'écran d'appel : aucun débordement |
| Recherche sans accent | « lea f », « ines » → aucun résultat (MSG-C06) |
| Recherche d'un mot ancien | « Aucun résultat » ; seul le dernier message est connu (MSG-C07) |
| Recherche puis changement d'onglet | la recherche reste posée, liste vide au retour |
| Clavier ouvert (simulé) | « Nouveau message » et « Nouveau groupe » restent utilisables |
| Épingler, archiver, sourdine, fond, brouillon, description puis **rechargement** | tout est perdu (MSG-C01) |
| Message entrant en sourdine | son, cloche, badge : rien n'est coupé (MSG-C02) |
| Message entrant dans une archivée | reste archivée, onglet « 9+ », rien dans la liste (MSG-C14) |
| Rafale de messages | onglet plafonné « 9+ », titre « (20) PASSIO » pour 14 non-lus (MSG-C15) |
| Créer un groupe : champs vides | trois toasts successifs (nom, passion, membre) |
| Créer un groupe | seuls dix personnages d'exemple sont proposés (MSG-C04) |
| Retirer un membre (créatrice) | immédiat, sans confirmation, écrit en base (MSG-C09) |
| Retirer un membre (non créatrice) | refus du serveur, dit honnêtement |
| Ajouter un membre (non créatrice) | refus du serveur, annoncé réussi (MSG-C05) |
| Photo de groupe | toast de succès, erreur JavaScript, avatar inchangé (MSG-C11) |
| Bloquer puis débloquer | écrit puis retiré en base ; la conversation ne revient pas tout de suite (MSG-C29) |
| Écrire à un compte bloqué | refusé, avec la marche à suivre |
| Se chercher soi-même | proposé ; ouvre un fil avec soi-même (MSG-C22) |
| Hors ligne (simulé) | bandeau, liste en cache ; recherche « Aucun utilisateur trouvé » ; groupe « créé » jamais synchronisé (MSG-C23) |
| Serveur en erreur 500 | recherche : résultat local sans message ; création de conversation : fil local ouvert sans un mot |
| Micro indisponible (appels armés) | toast « Caméra/micro indisponible ou refusé » |
| Retour du système pendant un appel (simulé) | l'appel et son écran restent |

## 4. Ce qui fonctionne et doit rester

- La tête de l'écran (MSG-001, MSG-003) : titre, « + » de 44 px, recherche de 16 px, menu à deux entrées de 44 px.
- La ligne de conversation : nom, heure relative (« 3 min », « 2 h », « 1 j », « 1 nov. »), aperçu avec « Toi : » et « Brouillon : ».
- Les exemples étiquetés ligne par ligne et exclus du badge (MSG-036, MSG-060).
- La pagination et la position de défilement conservée (MSG-035).
- L'en-tête 1:1 : identité, « Voir le profil », profil à un toucher (MSG-020).
- Le badge d'onglet et son libellé « Messages, N non lus ».
- La fenêtre de signalement (MSG-025) et le refus d'écrire à un compte bloqué (MSG-082).
- Le panneau des pièces jointes (MSG-028).
- Le message honnête sur un retrait refusé ; l'absence de bouton d'appel tant que les appels sont coupés.

## 5. Constats par surface

**Liste (MSG-001, 002, 030, 031).** Point non lu de 12 × 9 px sans nombre alors que l'onglet affiche 8 ;
épingle en emoji, sourdine invisible, 34 px vides sous la recherche (MSG-C13). Aperçus « [DOC] … »,
« [AUDIO] … », adresse Google Maps (MSG-C12, app-04:5554). Archivée non lue : badge sans ligne
correspondante ; vue des archives titrée « Messages » (MSG-C14).

**Recherche de la liste (MSG-033, 034).** Sensible aux accents (MSG-C06) ; ne connaît que le dernier message
de chaque conversation ; pas de bouton d'effacement ; reste posée en quittant l'écran (MSG-C07).

**Nouveau message (MSG-004 à 008).** Personnages d'exemple non signalés, cinq « Passionné » pour un compte
neuf (MSG-C03) ; accents (MSG-C06) ; son propre compte proposé, conversation créée avant tout message
(MSG-C22) ; « utilisateur », avatars carrés, champ sans étiquette (MSG-C27, C28).

**Nouveau groupe (MSG-010, 011).** Dix personnages d'exemple, aucune recherche, succès annoncé (MSG-C04) ;
passion obligatoire (MSG-C31) ; case de passion de 32 px (MSG-C10).

**Groupe (MSG-012 à 016, 026).** En-tête avec la photo d'un membre et un nom inerte (MSG-C20). Fenêtre des
membres : « 5 membres » pour 4, « Admin · En ligne » en dur, « ✨ Passion », membres hors cache absents
(MSG-C08) ; « Retirer » en 26 px sans confirmation (MSG-C09) ; ajout refusé annoncé réussi (MSG-C05) ;
photo (MSG-C11) ; « Supprimer » contre « Quitter » (MSG-C21).

**Paramètres (MSG-021 à 024, 027, 070, 071).** Réglages perdus au démarrage (MSG-C01, app-08:7059–7086) ;
sourdine sans effet (MSG-C02) ; quatorze entrées en emoji, rangement, gris et rouge (MSG-C17) ; six boîtes
natives (MSG-C18) ; fonds sombres (MSG-C16) ; exemples manipulés comme du réel (MSG-C24).

**Blocage (MSG-040, 041).** Fonctionne et s'écrit en base. « Débloquer » de 29 px (MSG-C10), liste non
repeinte après déblocage (MSG-C29), conséquences non dites dans la boîte native (MSG-C18).

**États réseau (MSG-038, 039, 075, 083).** Pannes présentées comme des absences ou des réussites (MSG-C23) ;
filet de 8 s vers « Aucune conversation » (MSG-C32, non reproduit).

**Notifications (MSG-078).** Demande du système sans explication à la première conversation (MSG-C25) ;
un message compte deux fois au badge de l'application (MSG-C15).

**Appels (MSG-050 à 055, 079) — simulés.** Commandes en emoji sans nom, Refuser et Répondre collés, pas de
photo, minuteur à 2,1:1, débit affiché, « 00:00 » pendant la sonnerie (MSG-C26).

### Sensible

- MSG-C22 : le simple choix d'une personne crée, côté serveur, une conversation visible dans sa liste
  avant tout message.
- MSG-C02 et MSG-C01 : un réglage de tranquillité annoncé actif ne l'est pas, puis disparaît.
- MSG-C08 : dans une discussion d'activité, la liste affichée des membres est incomplète.
- MSG-C05 : écart entre le groupe affiché et le groupe réel.

## 6. Cohérence avec le reste de l'application

- **Mots.** « utilisateur » (recherche, vide, groupe) contre « personne » / « membre » ; « Chercher »
  contre « Rechercher » ; « discussion » contre « conversation » ; « Nouveau message » qui ouvre une
  conversation ; masculin (« bloqué », « tu ne le suivras plus ») contre inclusif ailleurs (« ajouté·e »).
- **Icônes.** Emoji en icônes fonctionnelles dans tout le panneau Paramètres, la fenêtre des membres, les
  écrans d'appel, les toasts et deux titres de feuille, alors que la barre basse, l'en-tête et la barre de
  saisie sont en SVG `currentColor`.
- **Formes.** Avatars ronds dans la liste et l'en-tête, carrés arrondis dans « Nouveau message ».
- **Confirmations.** Boîtes du navigateur ici ; feuilles de l'application pour le signalement.
- **Sorties.** « ← Retour » en bas de la fenêtre des membres, « × » en haut à droite des feuilles,
  flèche à gauche des panneaux.
- **Compteurs.** Point sans nombre sur la ligne, nombre sur l'onglet, somme cloche + messages sur l'icône.
- **Navigation (établi par la coordination, cohérent avec le code).** « Retour » depuis une conversation
  ouverte à partir d'un profil ramène à la liste Messages : `closeConversation` (app-04:7789) repeint la
  liste, le contexte d'origine est perdu. À traiter avec le domaine `msg-conversation`.
- **Bureau (d1440).** L'écran Messages reste une colonne de téléphone centrée ; pas de vue liste + conversation.

## 7. Non vérifié, et comment le vérifier

| Point | Pourquoi | Comment |
|---|---|---|
| Appel réel, sonnerie, push d'appel | deux appareils, micro, appels désactivés | deux téléphones, drapeau armé, avant réactivation |
| Demande de notification du système | sans tête ; témoin à la place | téléphone réel, compte neuf |
| Squelette de chargement et filet de 8 s | le banc attend la fin du démarrage | réseau bridé sur appareil, stockage vidé |
| Refus de la clé étrangère pour un membre d'exemple | non imité par le faux serveur | lecture de `conv_members` après création, en préproduction |
| Sensibilité aux accents côté base | `ilike` lu dans le code | requête sur la base réelle |
| Export sur iPhone installé | lien `data:` + `download` | iPhone, application installée |
| Parcours clavier complet et lecteur d'écran | non déroulé | TalkBack / VoiceOver |
| Gestes de liste attendus (MSG-C30) | hypothèse | observation d'utilisateurs |
| Sourdine et push serveur | push non observable | deux comptes, application fermée |

## 8. Compteurs

| | |
|---|---|
| Surfaces inventoriées | 58 |
| Observées (vrais gestes) | 36 |
| Simulées | 17 |
| Code seul | 4 |
| Inaccessibles | 1 |
| Avec avant-après | 19 |
| Avec avant seul | 24 |
| Sans capture | 15 |
| À conserver | 10 |
| À améliorer | 43 |
| À vérifier | 5 |
| Constats | 32 — P0 : 0 · P1 : 8 · P2 : 18 · P3 : 6 |
