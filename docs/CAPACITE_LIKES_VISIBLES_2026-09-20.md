# Compteurs de j’aime visibles — 20 septembre 2026

Une écriture dans `post_likes` déclenchait un événement INSERT ou DELETE chez
chaque compte autorisé abonné, même sans publication concernée à l’écran. Ces
deux bindings sont retirés de `realtime:db`. En V3, il reste dix bindings CDC.
Les nouveaux posts, commentaires, notifications, messages privés, accusés de
lecture et appels conservent leurs chemins immédiats.

## Contrat du compteur public

- Ces HEAD remplacent les deux bindings des comptes admis au Realtime, selon
  l'autorité existante `connexionTempsReelAutorisee()`. Les visiteurs anonymes,
  qui n'avaient déjà aucun abonnement, conservent leur filet du fil à 60 s et
  ne reçoivent aucune nouvelle lecture. La connexion réveille l'ordonnanceur.
- Le premier créneau est déphasé une seule fois, dès qu'un compte connecté
  possède une carte visible : `max(200, floor(random * 15000))` ms, donc
  **200 à 14 999 ms**, selon `POST_LIKE_REFRESH_INITIAL_JITTER_MS`. L'échéance
  reste fixe malgré le scroll, un onglet masqué ou un stop/start. Un nouveau
  compte ou une purge d'identité reçoit sa propre phase. Le fil conserve ses
  compteurs déjà chargés pendant cette attente ; le clic local reste immédiat.
- Seules les cartes de publications réseau réellement visibles sont relues :
  fil, liste de profil, détail et bobine. Une grille sans compteur, une carte
  hors scrollport, une carte recouverte ou un contenu de démonstration ne l’est pas.
- Au plus **trois HEAD séquentiels** par créneau de **15 000 à 16 499 ms** : la
  valeur exacte est 15 000 + un entier uniforme de 0 à 1 499 ms, soit au maximum
  **16 499 ms** entre débuts de créneaux sans délai réseau. Les constantes
  `POST_LIKE_REFRESH_MS`, `POST_LIKE_REFRESH_JITTER_MS` et
  `POST_LIKE_REFRESH_MAX_POSTS` dans app-03 sont l’autorité.
- Chaque HEAD utilise `count: exact`, `head: true`, `eq(post_id, id)`. Il ne
  télécharge ni corps de lignes ni identifiants des personnes ; `max-rows` ne
  tronque donc pas le compteur. Un zéro efface le dernier like ; un refus,
  une erreur ou un compte NULL/invalide conserve l’ancien affichage.
- Une rotation sert d’abord les cartes les moins récemment contrôlées. Avec
  six cartes visibles, prévoir environ 30–33 s hors latence réseau, et non 15 s
  chacune. Un même post rendu deux fois ne fait qu’un HEAD.
- L’ouverture, la navigation, le scroll, le retour au premier plan et la reprise
  réseau réveillent la même chaîne. Ils ne contournent pas le créneau global.
  Aucun nouveau HEAD sous onglet masqué, hors ligne, avant rechargement décidé
  ou sans carte visible. Chaque requête possède un AbortSignal à 8 s.
- Les clics locaux restent optimistes et immédiats. Les écritures successives
  d’un même post sont ordonnées ; le suivi réseau reste actif au-delà du verrou
  anti-double-clic de 800 ms. Une ancienne réponse ne peut ni effacer une intention
  plus récente ni remplir l’état après changement de compte/purge.
- Les copies fil/profil/bobines sont mises à jour en place. Aucun `renderFeed`
  n’est provoqué par le compteur. Une lecture complète du fil commencée avant
  un HEAD accepté ou un clic conserve ce compteur plus récent à son retour.

Un GET complet de `post_likes` du fil ne suspend pas les HEAD : ses lignes
peuvent être tronquées par le plafond serveur, il ne certifie pas un compte
exact. La pagination et les autres lectures du fil conservent leur contrat.
Limite conservée : un nouveau chargement complet du fil lancé après un HEAD
peut réintroduire son compte tronqué jusqu’au HEAD suivant. La protection
contre les réponses anciennes couvre les lectures déjà en vol ; elle ne
remplace pas le futur lot de compteurs agrégés dans le chargement du fil.

## Coût et limite de la preuve

Ce changement échange la propagation mondiale des likes contre un coût borné
par les cartes consultées. Au maximum, 200 onglets actifs montrant chacun trois
publications ajoutent environ 40 HEAD/s, hors reprises réseau ; moins de cartes
ou des onglets cachés réduisent ce coût. Les HEAD ne téléchargent pas de corps,
mais leur comptage exact consomme encore du travail en base. Ce calcul ne
garantit ni 200 utilisateurs simultanés ni une facture inchangée.

Plusieurs onglets visibles du même compte restent indépendants. Aucune élection
d’onglet meneur, modification SQL/RLS, hausse de quota ou migration n’est incluse.

## Vérification et pilotage

`capacite-likes-visibles.spec.js` exerce le navigateur, les surfaces de rendu,
la visibilité, les réponses différées, les intentions concurrentes, la rotation
et les callbacks privés conservés. Les suites interactions, capacité du fil et
amplification couvrent les chemins existants. La campagne staging doit employer
les dix bindings du produit et compter séparément les HEAD ; elle ne peut plus
qualifier ce lot avec l’ancien profil à douze bindings.

Déphasage initial (21 septembre) : les 21 cas existants de la suite compteurs
passent sur DIST. Après correction de l'horloge des nouveaux tests, les trois
cas dédiés passent avec un code de sortie 0 : échéance fixe malgré les réveils,
borne 14 999 ms avec clic immédiat, admission visible et changement de compte.
Les audits globals, handlers, tests creux et isolation passent ; la revue
indépendante du delta est favorable. Ce résultat local ne qualifie pas encore
la capacité de 200 comptes ; une nouvelle campagne reste nécessaire.

Validation locale initiale : les 65 cas des quatre suites ci-dessus ont tous affiché
`OK`, dont 20 nouveaux cas, puis les quatre vérifications ciblées après la
garde visiteurs passent aussi, dont le nouveau cas anonyme → connexion →
déconnexion en vol. La contre-revue indépendante du diff est favorable.
Le processus Playwright Windows a été interrompu
après ces résultats parce qu’il restait dans sa fermeture finale ; ce n’est
pas un code de sortie de suite réussi. Build, syntaxe, audits globals,
handlers, publication Realtime, stub Supabase, clés de télémétrie, isolation
et tests creux passent. La vérification générale, lancée avant les changements,
rencontre le défaut Windows CRLF du générateur `OUVERTURE_2026-09-11.sql` ;
la CI Linux demeure la validation complète requise avant livraison.

Les compteurs locaux `_postLikeRefreshStats` exposent le dernier délai initial
tiré (`initialDelayMs`), cycles, lectures, mises à
jour, erreurs et réponses écartées, sans identifiants ni contenu. La télémétrie
HTTP existante observe les appels ; aucun événement distant supplémentaire
n’est émis à chaque tour. Repli : annuler le commit et redéployer par la CI ;
réactiver seulement les deux bindings sans retirer les HEAD doublerait le coût.
