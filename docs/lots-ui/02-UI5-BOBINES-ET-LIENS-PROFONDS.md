# 02 UI5 BOBINES ET LIENS PROFONDS

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.


  **Lot UI-5 — « Bobines connectées au réel » (§7 et §15), EN LIGNE le 2026-08-28.**
  `js/ui-v5-bobines.js` + bloc « PASSIO UI V5 » en fin de `styles.css`, tests
  `tests/e2e/ui-v5-bobines.spec.js` (15). Coupures : `localStorage.passio_ui_5="0"`,
  `window.PASSIO_UI_5=false`. Une rangée d'actions est AJOUTÉE dans `.reel-info` ;
  rien n'est retiré (le rail like/commentaire/soutien/partage reste entier).
  Deux branches EXCLUSIVES, décidées par `PassioUIV3.eventRefOf` — la même règle
  canonique que le Feed : une bobine reliée à une activité porte le seul lien
  « Voir l'activité » ; les autres portent « Ça m'intrigue », « Découvrir
  \<Passio\> », « À vivre près de moi », « Proposer une sortie ».
  AUCUN moteur nouveau : `ui-v3-passerelle.js` expose désormais `seeActivities` /
  `discoverPeople` / `proposeOuting` (les fonctions que la passerelle du Feed
  appelle déjà), et l'ouverture d'activité passe par `openActivity`.
  ⚠️ **Cinq pièges de ce lot.** ① Le viewer est en `z-index: 9999` alors que
  `toast()` et `#eventDetailPage` sont à 200 et les feuilles basses à 1200 :
  ouvertes par-dessus, elles seraient dans le DOM et INVISIBLES (seule
  `.modal-backdrop`, 10001, monte au-dessus). Le module ferme donc le viewer
  AVANT chaque sortie, sans exception — précédent `_openReelAuthor` — et un test
  vérifie que `reelsState.open` est faux au moment de chaque appel de moteur ;
  effet voulu : le « retour Feed stable » du §15 devient vrai. ② `openReels()`
  fait `#reelsList.innerHTML = …` à CHAQUE ouverture, et `openReelById` rouvre le
  viewer : la décoration passe par un `MutationObserver`, jamais par une
  enveloppe de fonction. ③ « Ça m'intrigue » serait DÉCORATIF sans effet réel —
  `state.user.likedPosts` n'est lu par aucun classement et le viewer n'en a
  aucun. Le signal porte donc sur la PASSION (seule granularité que
  `feedPostScore`, `irlPassionFilters` et `openPassionExplorer` savent déjà
  consommer), vit dans `state.user.passionSignals` et ajoute 0,6 au bloc affinité
  de `feedPostScore` ; 100 % local, réversible, borné à 200 entrées parce que le
  blob `user_state` part EN ENTIER à chaque synchronisation. ④ Aucune bobine ne
  portait d'`event_id` : deux bobines de démonstration en reçoivent un, sans quoi
  la branche « Voir l'activité » serait invisible — donc indiscernable d'un lot
  cassé (leçon UI-3B). ⑤ Les tests d'un lot « bobines » doivent VIDER les bobines
  du seed avant d'injecter les leurs : `buildReels()` assemble seed + Supabase +
  posts perso, donc le viewer en montre 22, et la liste étant en `scroll-snap`,
  une chip hors écran n'est pas cliquable.
  ⚠️ **Les deux manques laissés hors du lot UI-5 sont désormais fermés.**
  `event_id` est entré dans le `.select()` de `supaLoadPosts` avec la PR #184.
  Le **lien de partage `#reel=<id>`** est routé depuis le 2026-08-29 :
  `_openReelDeepLink()` en tête de `js/app-06-reels-partage.js`, écouteur
  `hashchange` + amorçage sur `window.__gateReady`, tests
  `tests/e2e/reel-deeplink.spec.js` (5). C'était un défaut de production, pas une
  fonctionnalité manquante : `openReelShareModal` fabriquait ces liens et les
  envoyait sur WhatsApp, Telegram, X, Facebook, e-mail, SMS et presse-papier
  depuis toujours, mais **personne ne les lisait** — donc la seule porte d'entrée
  d'un nouveau venu retombait sur le fil. Même défaut, même correctif que
  `#cdv-live-<id>` (app-03) et `#irl-event-<id>` (app-07).
  ⚠️ **Cinq règles de ce routage, dont deux P0 trouvés en revue de diff.**
  ① Il n'ouvre JAMAIS une autre bobine que celle demandée. `openReels()` montre
  la première de la liste quand l'id est absent, et `buildReels()` **tronque à
  30** : la garde est donc l'APPARTENANCE à `buildReels(id)` (qui épingle la
  cible via `pinnedId`), jamais une copie de ses conditions. Tester `isReel` +
  média ne suffisait pas — `buildReels` écarte aussi les **comptes bloqués**,
  donc une bobine d'un compte bloqué ouvrait le viewer sur le contenu d'autrui,
  avec un toast « introuvable » par-dessus. `openReelById` referme le viewer
  quand il rend `false`. ② Il attend que l'application soit VRAIMENT prête :
  `state` vaut **null** jusqu'à `state = loadState()`, qui part après
  `await ensureSupabase()` — sonder trop tôt levait un TypeError dans
  `findPostAnywhere`, non rattrapé car venu d'un `setTimeout`, ce qui TUAIT la
  chaîne de reprise en silence (même piège que `ui-v4b-fiche.js` le 2026-08-28).
  Le corps est sous `try` et une exception **replanifie** au lieu de conclure.
  ③ Il n'ouvre rien par-dessus le gate, la landing ou l'onboarding (viewer en
  z-index 9999 : il recouvrirait l'inscription de la personne même qui vient
  d'ouvrir le lien) — ces attentes ne consomment pas d'essai. ④ Il ne nettoie le
  hash que sur le chemin de SUCCÈS, et avant l'ouverture (`openReels()` empile
  son propre `#reels`) : le nettoyer sur échec rendait le lien irrécupérable,
  même par rechargement, alors que le budget d'attente (12 × 700 ms) peut être
  plus court qu'un réseau mobile froid. ⑤ Il mémorise l'id au premier passage :
  une ouverture normale des Bobines pendant l'attente empile `#reels` et le lien
  aurait été perdu sans un mot. ⚠️ La télémétrie de ce chemin n'est PAS corrélée
  au `?plk=` du lien : `telemetry.js` consomme et retire ce paramètre au
  chargement, avant que le bloc app n'existe. Son `link_open` prouve
  l'ouverture, `reel_link_open` l'affichage effectif ; les apparier demanderait
  une API publique qui n'existe pas encore.
  ⚠️ **Les liens IRL avaient le MÊME défaut, corrigé le 2026-08-30.**
  `#irl-event-<id>` et `#irl-checkin-<id>-<code>` (app-07) sondaient `allEvents()`
  **une seule fois**, à +1 200 ms d'un `setTimeout` d'amorçage — donc parfois avant
  que `state` existe. `allEvents()` fait `state.seed.events` : sur `state === null`
  il lève, l'exception venue d'un `setTimeout` ou d'un `hashchange` n'est rattrapée
  par personne, la boucle de reprise `setInterval` n'est **jamais armée**, et le
  lien meurt sans un toast. Le cas du **QR de pointage** est le pire des deux : on
  est devant l'organisateur, on scanne, il ne se passe rien. Les deux routages
  suivent désormais les mêmes règles que `#reel=` : attente de disponibilité qui ne
  consomme **pas** d'essai de contenu (sinon le budget de 12 essais est brûlé par le
  démarrage), mémorisation de l'id au premier passage (`goTo()` fait un
  `pushState("#irl")`, donc toute navigation pendant l'attente effacerait le lien),
  corps entier sous `try` qui **replanifie** au lieu de conclure, et écoute de
  `passio:app-ready` avec remise à zéro des compteurs. Le hash n'est toujours pas
  nettoyé — un rechargement doit pouvoir retenter. ⚠️ Mesuré en mutant les deux
  couches séparément : **chacune suffit seule** (neutraliser la garde laisse vert,
  car le `catch` replanifie ; faire conclure le `catch` laisse vert, car la garde
  évite l'exception). C'est une vraie défense en profondeur — et la conséquence
  honnête est qu'aucune mutation simple ne rougit : le test protège le
  comportement, pas chaque couche.
