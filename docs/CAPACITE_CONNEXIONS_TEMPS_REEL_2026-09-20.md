# Capacité : le mur le plus proche est une connexion WebSocket, et 98 % étaient payées pour rien (2026-09-20)

Demande de Benjamin, après le dossier stockage : « trouve une solution gratuite pour augmenter
considérablement le nombre de connexion / utilisateur ! Y a-t-il pas d'autres outils ? »

Cinquième volet de capacité, et le premier qui **lit** le forfait au lieu de le déduire.

## 1. Les plafonds du Pro, enfin mesurés

Page Usage de l'organisation, cycle du 27/08 au 27/09/2026 :

| Poste | Consommé | Plafond | Part | Grandit avec… |
|---|---:|---:|---:|---|
| Storage Image Transformations | 19 | 100 | **19 %** | le contenu |
| **Realtime Concurrent Peak Connections** | **84** | **500** | **17 %** | **les personnes SIMULTANÉES** |
| Egress | 36,98 Go | 250 Go | 15 % | l'usage |
| Cached Egress | 24,69 Go | 250 Go | 10 % | l'usage |
| Monthly Active Users | 8 560 | 100 000 | 9 % | les personnes |
| Realtime Messages | 253 510 | 5 000 000 | 5 % | l'activité |
| Storage Size | 0,139 Go | 100 Go | < 1 % | le contenu |
| Edge Function Invocations | 2 440 | 2 000 000 | < 1 % | l'activité |

⚠️ **LA PART LA PLUS HAUTE N'EST PAS LE MUR.** Les transformations d'images sont à 19 %, mais elles
comptent des **images d'origine distinctes** : ce compteur suit le catalogue, pas la fréquentation.
Le classement qui décide d'un lot de capacité est « qu'est-ce qui monte quand il y a plus de monde ».
Marges (plafond ÷ consommé) : **Realtime ×5,95** · **Egress ×6,76** · Cached Egress ×10,1 ·
MAU ×11,7. Le mur le plus proche est donc le temps réel, **avec l'egress juste derrière, à portée de
main** — pas loin en troisième position.

⚠️ **ET CE « JUSTE DERRIÈRE » EST UNE CORRECTION : J'AVAIS PUBLIÉ « EGRESS ×17 ».** Le calcul était
`250 / 14,79` — **le plafond divisé par le POURCENTAGE** au lieu de la consommation. Les deux autres
marges étant justes, l'erreur était invisible à la relecture, et elle rangeait l'egress en
troisième position alors qu'il est deuxième. Le dossier dont la thèse entière est « on ne classe les
plafonds qu'après les avoir lus » a publié un classement faux : **lire un nombre ne suffit pas, il
faut encore le diviser par le bon.** Conséquence directe sur ce lot : son remède pousse sur
l'egress (section 3 bis), donc sur le mur voisin.

⚠️ **ET CE QUOTA NE COMPTE NI DES CANAUX NI DES MESSAGES : IL COMPTE DES CLIENTS.** supabase-js
multiplexe **tous** les canaux d'un client sur **UN SEUL** WebSocket (`RealtimeClient`, une socket par
instance). « 500 connexions » veut donc dire « 500 personnes dont l'onglet est ouvert **en même
temps** », quel que soit le nombre d'abonnements de chacune. C'est la mesure qui invalide le réflexe
« réduisons le nombre de canaux » — la consolidation de 2026-07-15 (9 canaux → 1) n'a jamais pu
peser sur ce compteur, et une dixième liaison n'y pèsera pas davantage.

## 2. 97,9 % de ces connexions n'avaient rien à recevoir

Mesuré en production sur 7 jours (`telemetry_events`, sessions distinctes) : **2 546 sessions sans
compte sur 2 600**. Chacune ouvrait pourtant sa connexion, parce que `supaSubscribe` créait
`realtime:db` **sans condition** et que la policy de ce canal est ouverte à `anon`.

⚠️ **CE QUE LE VISITEUR PERD EST RÉEL, ET LA PREMIÈRE RÉDACTION DE CE LOT L'A NIÉ.** Elle écrivait
« un canal qui ne transporte que des accusés de lecture… rien qu'il puisse recevoir ». **C'est faux**,
et aucun des verrous n'aurait pu le démentir — c'est `audit-passio` qui l'a relevé, après que tout
était vert. `_creerCanalDb` porte treize `.on("postgres_changes", …)`, mais **un client réel n'en
pose que DOUZE** : la première (`conv_messages` INSERT) est sous `if (!PASSIO_REALTIME_V3 &&
!PASSIO_REALTIME_V2)`, et `PASSIO_REALTIME_V3` vaut `true` par défaut. Les douze se partagent ainsi :

- **trois ne le concernent pas** : `conv_members` et `notifications` sont filtrées sur son
  identifiant, qui n'existe pas côté serveur ; `conv_reads` n'a aucun filtre et n'est retenue que par
  la RLS ;
- **neuf portent du contenu PUBLIC qu'il reçoit très bien** : `posts` INSERT, `post_likes` (INSERT et
  DELETE), `post_comments`, `event_comments`, `comment_interactions` (INSERT et DELETE),
  `video_lives`, `profiles` UPDATE.

⚠️ **CE COMPTE A ÉTÉ FAUX DEUX FOIS DE SUITE, ET LA SECONDE EST LA PLUS INSTRUCTIVE.** « Sept et
six » d'abord, de mémoire. Puis « quatre et neuf sur treize » — compté cette fois, mais en comptant
les `.on(` du FICHIER au lieu de ce que l'application EXÉCUTE. Or c'est **mot pour mot** le piège
consigné le matin même dans `CLAUDE.md` (« DOUZE ET NON TREIZE… elle est CONDITIONNELLE… aucun
client réel ne la pose ») — et le paragraphe qui se donnait raison sur le split le reconduisait sur
le total. **Une leçon écrite ne protège que celui qui va la relire** : compter les `.on(` d'un
fichier n'est pas compter ce que l'application exécute.

Ce qu'il perd est donc le **rafraîchissement vif du public** : une publication qui apparaît seule, un
compteur de j'aime qui monte, une bulle « 🔴 LIVE » qui s'allume.

## 3. Le couplage qui rend le marché acceptable — et sans lui le lot coûtait plus qu'il ne rapportait

Les deux filets (`startFeedRefreshLoop` dans app-08, `_vliveFiletTour` dans app-05) reculent jusqu'à
**5 minutes** quand ils ne trouvent rien — décision de la veille, justifiée par « ça arrive par le
temps réel ». Retirez le temps réel au visiteur et **ils deviennent son seul chemin**.

`seulChemin` (les deux filets, même autorité) les maintient donc à 60 s pour lui — exactement la
latence qu'un compte subit déjà quand son canal décroche.

## 3 bis. ⚠️ Le marché a DEUX termes, et la première rédaction n'en comptait qu'un

Elle l'écrivait partout comme « 60 s de latence contre 97,9 % d'un quota de 500 ». **Il manque ce
qu'on paie en face, et c'est mesurable** :

- un tour du filet du fil, c'est **QUATRE** requêtes (`posts`, puis les lots `post_likes`,
  `post_comments`, `comment_interactions`), et le filet tourne pour **tout le monde** ;
- avant : un onglet visiteur calme reculait à 300 s, soit ~1 req/min avec le filet des lives ;
- `seulChemin` vrai en permanence : **4 req/min + 1 = 5 req/min. ×5, en régime permanent, chez les
  98 % de sessions que le lot prétend soulager.**

Et ce n'est pas neutre : la fiche « amplification » de la veille établit que `supaLoadPosts()` à 60 s
**est** le poste dominant de la base (un balayage de `profiles` par ligne évaluée, via la policy
SELECT de `posts`). Le lot aurait **restauré pour 98 % des onglets ce que la veille venait de
réduire** — et poussé sur l'egress, qui est le second mur (section 1).

⚠️ **D'OÙ LA BORNE, ET ELLE EST PRÉCISE** : `filetEstLeSeulChemin()` (app-02, autorité des deux
filets) n'est vraie que **pendant qu'on regarde le fil** (`#screen-feed.active`). Ailleurs — Messages,
Profil, Explorer, Rencontrer — la fraîcheur de ces filets n'est visible nulle part, et ils reculent
comme avant ; `goTo("feed")` les réveille au retour, donc on ne sert jamais du périmé. L'onglet
masqué était déjà couvert par `filetProchainPas`.

⚠️ **Une justification à un seul terme n'est pas une justification, c'est une publicité.** Elle a
survécu à une passe d'audit et à dix verrous verts, parce qu'aucun verrou ne peut mesurer ce qu'un
texte omet.

⚠️ **LE FILET DES LIVES PORTAIT LE MÊME COUPLAGE ET N'A PAS ÉTÉ TRAITÉ DU PREMIER COUP**, ni mesuré :
le cas ④ du verrou ne lisait qu'app-08. Un visiteur aurait gardé une bulle « 🔴 LIVE » allumée
jusqu'à cinq minutes après la fin du direct. **« Corriger une surface, c'est corriger une surface »,
et un verrou qui n'en lit qu'une ne garde qu'une.**

## 4. Une autorité, cinq lecteurs, et deux surfaces que le boot ne voyait pas

`connexionTempsReelAutorisee()` (app-02) délègue à `_uidEstUnCompte()` — la **forme** de
l'identifiant, pas le jeton du SDK : app-02 ne doit dépendre de rien de chargé après lui (même raison
que `_uidEstUnCompte` contre `_compteAuthReel`, fiche du 2026-09-13). Un compte dont la session a
expiré garde donc sa connexion, et c'est le bon sens de l'échec : il recevra ses messages dès le
rafraîchissement du jeton, et il n'est pas la masse qu'on écarte.

⚠️ **ELLE ÉCHOUE OUVERT, DANS LE MÊME SENS QUE SES APPELANTS.** Ils la lisent par
`typeof … === "function" && !connexionTempsReelAutorisee()` : autorité absente, la connexion s'ouvre.
Un `catch` qui refuserait irait donc à l'**inverse** du câblage et couperait le temps réel d'un vrai
compte pour une cause que personne ne pourrait nommer. Le chemin est de toute façon une impossibilité
(`_uidEstUnCompte` porte déjà son propre `catch`) — on le **trace** plutôt que de le trancher en
silence, même jurisprudence que `requireAdmission`.

⚠️ **CINQ SURFACES RESTAIENT ATTEIGNABLES SANS COMPTE, et aucune n'est sur le chemin du démarrage** —
le lot mesurait le boot et se taisait sur les **gestes**. La première rédaction en nommait deux,
puis « deux » a été réécrit après qu'une passe adversariale en a trouvé trois de plus :

- **ouvrir une conversation de DÉMONSTRATION** → `_subscribeTyping` (app-04) créait son canal sans
  condition, pour une conversation qui n'a aucune ligne serveur. Sa voisine
  `_supaConvSpecificChannel` est gardée aussi, mais ⚠️ **elle ne fuyait pas en production** : son
  `if (window.PASSIO_REALTIME_V3) return;` la rend inerte par défaut. La garde couvre le repli V1 ;
  écrire qu'elle « créait son canal sans condition » aurait été faux ;
- **taper une bulle « 🔴 LIVE »** → `joinVideoLive` (app-05) gardait sur `!MY_UID`, **vrai pour un
  `u_<aléatoire>`**. Le message (« Connecte-toi pour rejoindre un live ») était déjà juste ; c'est la
  condition qui ne l'était pas ;
- **lancer un live** → `startVideoLive`, le **jumeau** resté sur `!MY_UID`. Aucun canal ne fuyait (la
  RLS refuse l'INSERT avant), mais un visiteur passait la garde, obtenait la fenêtre de titre puis
  **la demande de permission caméra/micro** avant d'être refusé — ce qui heurte la règle de première
  visite « aucune demande de permission » ;
- **ouvrir un lien profond `?call=<id>&from=<uuid>`** → `_checkIncomingCallFromUrl` est armé au boot
  pour tout le monde et attend `window._supaReal && MY_UID`, **vrai pour un `u_<aléatoire>`**. Le
  visiteur voyait l'écran d'appel entrant et, qu'il accepte **ou refuse**, ouvrait un canal
  `call:<id>`. Gardé à l'entonnoir `handlePushIncomingCall`, qui couvre aussi le message
  `INCOMING_CALL` du service worker ;
- **passer un appel** → `startCall`, même idiome. Rien ne fuit (la ligne suivante écarte les pairs de
  démonstration, seuls contacts d'un visiteur), mais laisser l'idiome intact à côté de trois
  commentaires qui le déclarent défectueux ferait conclure qu'il a été audité et validé.

⚠️ **LA LEÇON N'EST PAS « IL EN RESTAIT »**, c'est que chacune a été trouvée par une relecture
adversariale APRÈS que les gates étaient vertes, jamais par un verrou. D'où l'inventaire déclaré des
**portes** (§7) : il ne prouve pas l'inatteignabilité — aucun grep ne le peut — il force à l'écrire.

⚠️ **`ring:<uid>` n'était PAS du lot** : il est gardé par `admissionCompteReel` depuis la sonde du
2026-09-11. Un visiteur ouvrait donc **deux** canaux au repos, pas trois — la première rédaction en
annonçait trois.

## 5. Les autres outils : tous plus bas, et c'est la deuxième fois qu'on l'évite

La question posée était « y a-t-il pas d'autres outils ? ». Inventaire des paliers **gratuits** :

| Service | Connexions simultanées |
|---|---:|
| Supabase Pro (actuel) | **500** |
| Ably | 200 |
| Pusher Channels | 100 |
| Cloudflare Durable Objects | payant (Workers ~5 $/mois) |

**Aucun n'est un levier** : on aurait migré **vers un plafond plus bas**, en ajoutant un fournisseur,
une authentification et une seconde origine à maintenir. C'est exactement la faute R2 du dossier
stockage, évitée une seconde fois le même jour : **avant de changer de fournisseur, lire le plafond
de celui qu'on a.** Le vrai levier n'était pas un outil, c'était de cesser de payer une place pour
des gens qui n'ont rien à recevoir.

## 6. Ce que ça donne, et ce qui reste à MESURER

- **Attendu** : le pic tombe des 84 mesurés vers l'ordre de la poignée (les sessions AVEC compte),
  soit une marge qui cesse d'être le mur le plus proche. Le suivant est alors **l'egress (×6,8)**, et
  non les MAU — cette ligne a dit « MAU » tant que la marge d'egress était mal calculée (§1).
- ⚠️ **ET « 84 » ET « 97,9 % » NE PARLENT PAS DE LA MÊME POPULATION.** 84 est un **pic de
  simultanéité**, 97,9 % une **part de sessions sur 7 jours**. Or un onglet de compte reste ouvert
  bien plus longtemps qu'une visite de passage : la part des comptes dans le PIC est donc
  mécaniquement **supérieure** à 2,1 %. Transposer l'une sur l'autre est un raccourci, et il est
  nommé ici pour que la mesure d'acceptation ne se lise pas comme une confirmation d'un chiffre
  qu'on n'a jamais calculé.
- ⚠️ **CE CHIFFRE EST UNE ATTENTE, PAS UNE MESURE, et il le restera jusqu'à la relecture de la page
  Usage après déploiement.** Deux chiffres-phares de la journée ont déjà été faux (le « 1 Go » du
  dossier stockage, le « 91 % de travail » de #515) : tant que le pic n'est pas relu, ce lot a un
  encadrement, pas un gain.
- **Ce que ça ne fait pas** : la forme quadratique du temps réel demeure pour les comptes — à N
  connectés, une publication reste évaluée N fois. S'abonner à ce qui est VISIBLE reste un changement
  d'architecture, pas un réglage.

## 7. Verrou

`tests/e2e/capacite-connexions-temps-reel.spec.js` (**10 cas**) : ① la garde précède le drapeau (et
la trace ne porte qu'un argument) · ② un visiteur n'ouvre aucun canal · ③ il ne pose pas le drapeau,
s'inscrire dans la même session rend le temps réel · ④ les **deux** filets ne reculent pas quand ils
sont le seul chemin, **et la borne « fil à l'écran » + le réveil par `goTo` sont mesurés** · ④ bis
les **cinq surfaces de geste** sont gardées · ⑤ aucune borne recopiée hors de `filetProchainPas` ·
⑤ bis **l'inventaire des portes** · ⑥ aucun lecteur ne recopie la condition d'identité · ⑦ le verdict
dans les deux sens · ⑦ bis l'autorité échoue **ouvert**, et le trace.

**Éprouvé par RÉINJECTION de huit mutations** : garde retirée de `supaSubscribe` (**4 rouges**),
drapeau posé avant la garde (**1**), couplage retiré du filet des lives (**1**), gardes de geste
retirées (**2**), autorité rendue fail-closed (**1**), borne « fil à l'écran » retirée (**1**),
réveil retiré de `goTo` (**1**), porte de canal non déclarée (**1**).

### ⚠️ Quatre pièges de banc, et deux verrous qui ne verrouillaient rien

1. **Une tranche prise sur un nombre magique cesse de couvrir sa fonction dès qu'elle grandit, sans
   un rouge** : `slice(i, i + 2600)` s'arrêtait à **un caractère** de la fin de
   `startFeedRefreshLoop`. Le verrou lit désormais le corps jusqu'à son accolade fermante.
2. **Un verrou qui épingle une expression littérale rougit sur le lot suivant, pour une raison qui
   n'est pas la sienne** — `capacite-amplification` ⑪ exigeait `vivant || !apresVide || !avantVide`
   mot pour mot et est tombé sur l'ajout de `seulChemin`. Il mesure maintenant les **trois termes**.
3. **Puis le même verrou l'a refait deux fois de plus, dans le lot qui corrigeait la règle.** ⓐ Le
   cas ⑥ épinglait un **compte exact de lecteurs par fichier** (`toBe(2)`) : ajouter une garde
   légitime — `startVideoLive`, `?call=` — le faisait rougir. ⓑ Réécrit pour balayer les fichiers
   entiers à la recherche d'une condition recopiée, il a **rougi sur trois innocents**
   (`app-04:5340`, `app-05:569`, `app-08:1863` — tous posent la condition sur *quelqu'un d'autre*).
   Il mesure enfin **dans le corps de chaque fonction gardée**, et là seulement. **Un verrou qui
   rougit sur un innocent finit par être désarmé** : troisième fois en deux jours, et la première où
   c'est le verrou gardien de la règle qui l'enfreint.
4. **UN VERROU VIDE EST PIRE QUE PAS DE VERROU.** Le cas ⑤ bis mesurait d'abord le BOOT d'un visiteur
   au navigateur — ce que l'audit réclamait à juste titre, la thèse du lot n'étant mesurée nulle
   part. **Il ne pouvait rien prouver** : mesuré, `supaInit` n'atteint jamais `supaSubscribe` sous
   l'isolation de `bootOnboarded`, donc le cas restait **VERT avec la garde retirée** (vérifié par
   réinjection). Remplacé par l'**inventaire déclaré des portes** — chaque site de création de canal,
   avec la raison qu'un visiteur ne l'atteint pas, sur le patron de
   `scripts/tests-isolation-socle.json`. Il ne prouve pas l'inatteignabilité ; il force à l'écrire,
   et une porte neuve rougit jusqu'à ce que quelqu'un le fasse.

### ⚠️ Et un ralentissement de banc qui ne venait PAS de ce lot

`compteurVliveAuCalme` (`capacite-amplification`) attendait `window._dbChan`, **jamais posé sous
l'isolation** puisque `supaInit` s'arrête avant : chacun de ses quatre appels payait ses 20 s, avant
comme après ce lot — je l'ai d'abord attribué au lot, à tort. Le signal accepte désormais quatre
témoins et **est borné à 6 s**, la boucle de stabilité restant le vrai garant : **1 min 54 → 1 min 00
sur la suite**. Un verrou qui attend un signal que le produit ne pose pas ne mesure rien, il ralentit.

### ⚠️ `diagLog` ne prenait qu'un argument, et huit appels en passaient deux

`diagLog("vlive_filet", e && e.message)` jetait le message d'erreur **en silence** : la trace ne
portait que l'étiquette, donc un filet en panne était indiscernable d'un filet au calme — et la
Sentinelle ne voit que ce qui est journalisé. Corriger les huit appelants aurait laissé le neuvième
refaire la faute : **c'est l'autorité qui accepte le reste**, en le joignant.
