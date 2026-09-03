# 06 BOBINE EPINGLEE VUE CARTE TESTS

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.


  **⚠️ UN LIEN DE BOBINE MONTRAIT LA BOBINE DE QUELQU'UN D'AUTRE (2026-09-01).**
  `buildReels(pinnedId)` n'épinglait la cible que si elle était SORTIE des 30
  plus récentes. Quand elle est dans la liste sans en être la tête, `openReels`
  ouvre le viewer sur la bobine n° 0 et `openReelById` la corrige par un
  `scrollIntoView` dont l'effet n'arrive qu'au tour de rendu SUIVANT. Sonde :
  cible en position 5 → `reelsState.current === 0` à l'ouverture, correction
  ~2 s plus tard. Entre les deux, l'écran montre le contenu d'un tiers —
  exactement ce que le booléen de `openReelById` existe pour empêcher.
  ⚠️ **Épingler TOUJOURS supprime la fenêtre au lieu de la raccourcir** : la
  cible EST l'indice 0, il n'y a plus rien à corriger. La liste ne s'allonge pas
  (`[cible] + 29`) et ne porte pas de doublon (la cible est retirée de la suite).
  ⚠️ **Ce défaut était INVISIBLE sans contenu plus récent que la démonstration** :
  sans lui, la cible EST déjà l'indice 0. C'est ce qui l'a laissé passer, et ce
  qui a fait rougir la CI le jour où la production a porté des bobines récentes.
  Verrou : `reel-deeplink.spec.js`, « cible dans les 30 mais pas la plus
  récente ». ⚠️ Il lit l'état **dès** l'ouverture du viewer, sans attente : une
  attente le rendrait vert sur le code fautif, donc aveugle. Éprouvé par
  mutation — remettre l'épinglage conditionnel le fait rougir en affichant
  `reel_recent_4`.

  **⚠️ LA SUITE N'EST PAS ISOLÉE DE LA PRODUCTION, ET ÇA SE VOIT EN CI.**
  `tests/e2e/interactions.spec.js` stubbe `supaLoadPosts` APRÈS `bootOnboarded`
  (qui attend 2,5 s) : la première requête du démarrage a déjà ramené le contenu
  RÉEL, qui grossit de jour en jour. Diagnostic CI du 2026-09-01 :
  `{"dansEtat":true,"nbPosts":35,"nbNoeuds":20}` — le fixture était dans l'état,
  mais `renderFeed` peint en **deux temps** (les `FAST` = 20 premières cartes
  tout de suite, le reste dans un `requestIdleCallback` qu'un nouveau rendu
  ANNULE). Au-delà de 20 posts réels, le fixture pouvait n'arriver jamais, et
  trois tests de like rougissaient sur `main` comme sur les branches, sans
  qu'aucun code n'ait changé. `seedServerPost` vide donc `state.supabasePosts`
  avant de semer : le fixture est le SEUL post serveur.
  ⚠️ Famille générale : **un test qui laisse une requête de production remplir
  son état ne mesure pas ce qu'il croit**. Le fichier documentait déjà ce piège
  un cran plus haut ; il manquait ce cran-ci.

  **⚠️ La vue Carte s'affiche SOUS les onglets (2026-08-30), dans `js/ui-v4a3-vue.js`.**
  Demandé par Benjamin après essai réel : « quand je clique sur Carte je voudrais qu'elle
  apparaisse dessous les trois onglets, comme quand je clique sur Liste — le même effet
  sur les trois clics. » Dans le balisage historique, `#irlMapWrap` précède la liste de
  très haut (juste sous `.irl-actionbar`) alors que le commutateur se pose au ras de
  `#eventList` : la carte s'affichait donc AU-DESSUS des onglets, quand la liste et la
  vue Filtres s'affichent dessous — trois cases, deux comportements. La vue Carte
  **DÉPLACE** donc le nœud juste avant `#eventList`, et le rend à sa place d'origine dès
  qu'on quitte la vue ou que le drapeau tombe.
  ⚠️ Quatre points à connaître avant d'y toucher. ① Le nœud est **déplacé, jamais
  recréé** : le moteur Leaflet vit dans `#irlMap`, et `initIrlMap()` ne réinitialise pas
  deux fois — le reconstruire donnerait une carte blanche. On redemande seulement un
  `invalidateSize()` après le déplacement (`irlMap` est un `let` de portée script, absent
  de `window` et en zone morte tant qu'app-07 n'a pas tourné : le `typeof` doit être DANS
  un `try`). ② La destination est `#eventList`, **jamais `barre.nextSibling`** : UI-4A5 y
  pose son panneau et l'y REMET après chaque rendu — deux modules sur le même point
  d'ancrage se renverraient la balle, chacun réveillant l'observateur de l'autre. L'ordre
  obtenu est `v4a3Vue > v4a5Panneau > irlMapWrap > eventList`. ③ `poserBarre()` ne vise
  plus la liste mais une **ancre** (`ancreBarre()`) : sans elle, une barre reconstruite
  après un rendu se serait insérée SOUS la carte déplacée. Le ré-alignement n'écrit que
  si l'ancre est passée devant la barre — une écriture inconditionnelle réveillerait les
  deux observateurs à chaque rendu. ④ La restitution mémorise **les deux voisins** : le
  suivant (`#irlPassionRow`) peut avoir déménagé dans le panneau d'UI-4A5 au moment de
  rendre la carte, et ne retenir que lui la reléguait en FIN d'écran, sous la liste ; le
  précédent (`.irl-actionbar`) sert alors de repère. Verrous : `ui-v4a3-vue.spec.js`
  (« la carte s'affiche SOUS les onglets », éprouvé par mutation — neutraliser le
  déplacement le fait rougir) et `ui-v4a5-filtres.spec.js` (« cohabitation avec la vue
  Carte : chacun son ancrage, aucun va-et-vient »).

