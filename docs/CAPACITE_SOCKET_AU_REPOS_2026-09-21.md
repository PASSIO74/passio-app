# Socket au repos : un compte qui ne regarde pas ne tient pas de connexion — 21 septembre 2026

Lot ⑤ de capacité, demandé par Benjamin après la synthèse des quatre premiers
(« le seul levier gratuit qui ferait monter le nombre de comptes ouverts en
même temps »). Risque normal : client seulement (app-02, app-04, app-08),
aucune migration, aucune policy, aucun canal nouveau. Implémentation Claude Code.

## Le mur, et ce qu'il compte

`Realtime Concurrent Peak Connections : 500` (forfait Pro) compte des
**clients connectés**, un WebSocket par onglet de compte. Depuis le 20/09 un
visiteur n'en ouvre aucun ; un compte en tient un dès qu'il a un onglet ouvert
— y compris derrière une autre application sur le téléphone, ou dans un onglet
de bureau oublié depuis une heure. Ce qu'un onglet masqué reçoit, personne ne
le voit : le fil ne se peint pas (filet arrêté sous `document.hidden`), les
compteurs ne se lisent pas, et un message privé est de toute façon notifié
**par l'expéditeur** (`_notifierMessage`, app-08 : ligne `notifications` +
push via `notify-call` — au plus une notification par conversation et par
fenêtre de 5 min, push seulement si la permission est accordée). Ce qui n'est
pas notifié est **relu** au réveil.

## Ce qui change

- `socketTempsReelAuRepos(etat)` (app-02), **pure**, même forme que
  `filetProchainPas` : au repos si l'onglet est masqué depuis **3 min**, ou
  visible mais sans aucun geste depuis **15 min** *sauf* conversation ouverte
  (« messages privés toujours en temps réel » quand on les regarde) ;
  **jamais** pendant un appel (`window._call`) ou un live
  (`_vliveHost`/`_vliveView`) — leurs canaux vivent sur le même socket.
- Câblage (app-08) : `_rtReposArmer` (armé par `supaSubscribe`, donc jamais
  pour un visiteur) écoute les gestes (`pointerdown`, `keydown`, `touchstart`,
  `wheel`, `scroll`), `visibilitychange`, `pageshow`, `online`, et un tick de
  30 s évalue la politique. `_rtEndormir` relâche tous les porteurs de canaux
  (`_dbChan`, `_userTopicChan`, `_callRingChan`, `_typingChannel`,
  `_supaConvChannel`, `_privateConvChans`, `_supaSubscribed`), puis
  `supa.removeAllChannels()` et `supa.realtime.disconnect()`.
- `_rtReveiller` (premier geste, retour au premier plan, `pageshow`, réseau
  revenu) : `supaSubscribe()` rejoint les **mêmes** canaux par la **même**
  garde (`connexionTempsReelAutorisee`), la conversation ouverte reprend son
  canal de frappe, puis **rattrapage** — `postgres_changes` ne rejoue rien,
  donc on relit : la liste des conversations (`_rafraichirConversationsServeur`,
  factorisée depuis `supaInit`, pastilles non-lu comprises), la conversation
  ouverte (`_rattraperConversationOuverte`, factorisée depuis
  `openConversation`) — qui est alors **marquée lue** (`supaMarkRead`,
  `unread = 0`) et dont les accusés de l'autre sont relus (`supaLoadOtherRead`),
  comme le faisait la réception temps réel —, les notifications, les
  commentaires d'une activité ouverte, et, pour un réveil par geste ou réseau,
  le fil et les lives (le retour au premier plan les relit déjà).
- Contre-revue adversariale (26 constats, 24 confirmés, consolidés en six) :
  ① `supaSubscribe` et `_subscribeUserTopic` **respectent le repos** — sans
  cela, le rafraîchissement de jeton d'auth-js (~58 min, onglet visible, relayé
  aux autres onglets) rappelait `supaInit` → `supaSubscribe` et rouvrait le
  socket pour toujours, `endormi` restant vrai ; ② la relecture de la liste au
  réveil **fusionne** dans les objets locaux (`_fusionnerConvsServeurDansLocal`)
  au lieu de les remplacer — l'entrée serveur ne porte que le dernier message,
  et remplaçait la conversation ouverte (fil réduit à un message, brouillon et
  statuts d'envoi perdus) ; liste PUIS conversation ouverte, jamais en
  parallèle ; ③ conversation ouverte marquée lue et accusés relus (ci-dessus) ;
  ④ `filetEstLeSeulChemin` lit aussi l'état du socket : un compte visible et
  immobile dont le socket dort a le filet à 60 s, comme un visiteur, au lieu de
  reculer à 5 min ; ⑤ `ensureCallPushSubscription` une fois par session, pas un
  `upsert` par réveil ; les lives ne sont pas relus deux fois au retour ;
  ⑥ une sonnerie entrante (`_callIncoming`) compte comme un appel.
- Une mesure par repos : `rt_repos` (`raison`, `reveil`, `duree_ms`), jamais
  d'identifiant. Le stub hors ligne porte `realtime.disconnect`.

Préservé : messagerie (push pendant le repos, relecture au réveil, canal de
frappe repris), notifications (relues), appels et lives (jamais endormis),
droits d'accès (la même garde décide de la reconnexion), visiteurs (aucun
socket, rien à endormir).

## Ce que ça change pour les utilisateurs

- Un compte dont l'onglet est masqué depuis 3 min, ou immobile depuis 15 min
  hors conversation, **ne compte plus** dans les 500 connexions. Le réveil
  prend le temps d'une jonction de canal (quelques centaines de ms), pendant
  laquelle un événement temps réel serait manqué — et c'est précisément ce que
  le rattrapage relit.
- Pendant le repos, un nouveau message n'arrive pas dans l'onglet ; il arrive
  par push (comme quand l'application est fermée) et à l'écran dès le retour.

## Mesure

Le gain sur le pic de connexions dépend de la part d'onglets masqués ou
immobiles dans la population connectée — **non mesurable ici** : le banc de
charge tient ses sockets ouverts, et la page Usage (pic de connexions) ne se
lit qu'après déploiement et en présence d'un vrai trafic. Ce qui est mesuré :
au banc navigateur, un compte masqué 3 min ferme son socket (2 canaux + 1
`disconnect`), reste fermé 10 min de plus sans rien rouvrir, et rejoint ses 2
canaux au retour avec ses 4 relectures de rattrapage. Aucun chiffre de
« comptes en plus » n'est avancé sans cette lecture.

## Vérification

`tests/e2e/capacite-socket-au-repos.spec.js` (8) : politique pure et bornes
(13 cas), masqué 3 min → repos → retour (canaux dont `ring:` simulé, socket,
gardes, rattrapage mesuré contre l'étalon des gestionnaires du produit, push
une fois, mesure), inactivité 15 min → geste, conversation ouverte visible
jamais par inactivité mais bien par masquage (canal de frappe repris),
rafraîchissement de jeton pendant le repos sans effet + filet « seul chemin »,
appel (même sonnant)/live jamais coupés, visiteur sans rien à endormir,
rattrapage de la messagerie sur les vraies fonctions (fusion sans écrasement,
brouillon et statuts gardés, marqué lu, accusés relus), câblage à la source
(réveil par `supaSubscribe` et sa garde, ordre liste puis conversation, aucun
nouveau site `supa.channel(` : l'inventaire des portes de
`capacite-connexions-temps-reel` est inchangé). Suites voisines vertes :
`capacite-connexions-temps-reel`, `capacite-amplification`,
`conv-ouverture-fil`, `multi-passion-integrite`.

Retour arrière : revert ; ou `REPOS_TEMPS_REEL_MASQUE_MS = Infinity` et
`REPOS_TEMPS_REEL_INACTIF_MS = Infinity` rendent le comportement d'avant sans
toucher au reste.
