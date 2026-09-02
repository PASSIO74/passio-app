# 08 REFONTE MULTI PASSION

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **REFONTE MULTI-PASSION (2026-08-31) — ADR-011, SANS DRAPEAU.**
  `.passio/adr/ADR-011-refonte-multi-passion.md`. Elle complète ADR-010 (qu'elle
  ne remet pas en cause : une identité publique, des passions qui classent) et en
  **amende l'interface** sur quatre points. Verrou :
  `tests/e2e/refonte-multi-passion.spec.js` (18 cas, les six tests d'acceptation).

  ① **LE FIL EST UNE SÉLECTION ADDITIVE (OU inclusif).** « Suivis », les passions
  et les envies du moment sont trois familles de critères CUMULABLES : une
  publication entre dès qu'elle en satisfait **au moins un**, et cocher l'un
  n'éteint jamais l'autre. Une seule liste, dédupliquée par `p.id`, classée par le
  moteur existant — aucune section par passion, par envie ni par source.
  ⚠️ **Ce que ça défait sciemment.** ADR-010 avait livré deux VUES EXCLUSIVES
  (`state.feedView` = `"accueil"` | `"suivis"`), et toucher une passion depuis
  « Suivis » ramenait en « accueil ». Ce n'était pas un caprice : `renderFeed` ne
  consultait PAS `_activeFeedPassions` en vue « suivis », donc une passion cochée
  y aurait été un CLIC MORT. La refonte supprime la cause — le moteur consulte
  désormais les trois sources — avant de supprimer l'exclusivité.
  ⚠️ **Migration** : `state.feedView` → `state.feedFollowingOn` (booléen persisté).
  Les DEUX anciennes vues se migrent à `true`, car les deux incluaient les comptes
  suivis. C'est ce qui préserve l'acquis d'ADR-010 : suivre quelqu'un garde un
  effet observable et durable. `setFeedView` survit en alias de compatibilité.
  ⚠️ **Les envies deviennent un FILTRE, plus seulement un classement.**
  `#feedIntentSelector` passe en multi-sélection (`state.feedIntents`, `setFeedIntents`,
  `feedIntentsSelected`) et `feedPostMatchesIntent` en fait un critère d'entrée.
  « Tous » (`for_you`) reste le NEUTRE : le cocher revient à tout décocher.
  ⚠️ **Le défaut ne doit pas ÉLARGIR** : `state.feedIntents` démarre VIDE. Le piège
  était `selectedMoods`, qui démarre à `{"creation"}` — en OU, un critère coché
  d'usine aurait ouvert le fil au lieu de le restreindre. Le rail legacy
  (`#moodSelector`, sous kill switch) n'est pas touché : son comportement ET reste
  intact à l'octet près.
  ⚠️ **Le classement est généralisé, pas remplacé** : `rankFeedPostsForIntents`
  retombe EXACTEMENT sur `rankFeedPostsForIntent` à zéro ou une envie ; à
  plusieurs, il retient le MEILLEUR bonus, jamais leur somme. La règle de bonus est
  extraite dans `_feedIntentBonus`, partagée — deux copies auraient divergé.

  ② **LE PROFIL : UN SEUL SÉLECTEUR, DEUX ONGLETS.** Le rail de passions se pose
  EN HAUT, au-dessus des onglets, et réutilise le composant du Fil —
  `passionTileHTML` (app-02), donc les mêmes classes `.profile-tile*`, les mêmes
  dimensions et les mêmes états. **Choix UNIQUE** ici (multi-sélection sur le Fil),
  et il commande les DEUX onglets à la fois (`setProfilePassion` écrit
  `profilePostFilterId` ET `profileEventFilterId`, tenus égaux). Deux onglets
  seulement : **Publications** et **Activité**. Même mécanique sur le profil
  d'autrui, avec une section « Activité » qui montre ce qu'il ORGANISE — jamais ses
  participations, qui ne sont pas chargées pour un tiers.
  **Retirés** : l'onglet et le panneau « À propos », la ligne « Passion active »
  (`#v8ActivePassion`), `openPassionSwitcher`, et les deux rangées de puces
  jumelles (`#v8PostFilter` / `#v8EventFilter`, avec `_passionFilterRowHTML` et
  `_monterFiltrePassion`).
  ⚠️ **La migration à un coup `_v8FiltresMigres` est REPRISE, pas renommée** : elle
  convertit l'ancien `profileFilterIds` multiple. La contourner perdrait le filtre
  des comptes existants, en silence.
  ⚠️ **RETIRER UN ONGLET PEUT FERMER UNE FONCTION.** « À propos » portait la
  gestion des passions (ajouter, illustrer, archiver). Elle vit maintenant dans
  `#passionManager`, panneau replié qu'ouvre l'entrée « Mes passions » du menu
  d'options du profil (`openPassionManager`). Sans cette porte, ajouter une passion
  devenait inatteignable — le défaut exact du Studio après un carnet (2026-08-29).
  ⚠️ `archiverPassion` **rebascule elle-même** `currentProfileId` sur une passion
  vivante : elle exigeait auparavant « choisis d'abord une autre passion active »,
  un geste qui n'existe plus. Le nettoyage vit au point d'ÉCRITURE, jamais à
  l'affichage.

  ③ **L'IDENTITÉ AFFICHÉE EST CENTRALISÉE.** `identitePassionsHTML(u)` /
  `identitePassionsTexte(u)` / `passionsAffichables(u)` (app-02) rendent, sous le
  pseudo, les passions du compte (« Benjamin » / « Moto · Podcast · Voyage »).
  Appliqué aux cartes de publication, au post ouvert, aux commentaires et réponses,
  aux abonnés/abonnements, aux DEUX écrans de recherche, aux notifications, à
  l'inbox Messages, à mon profil et au profil visité. `cacheRemoteProfile` et
  `_resolveProfilesByIds` transportent désormais la colonne `passions`.
  ⚠️ **Trois règles, chacune payée par un défaut réel.** ① `passionsPubliques()` et
  JAMAIS la liste brute : le jsonb `profiles.passions` contient les passions
  ARCHIVÉES (c'est voulu — la colonne sert de sauvegarde), les afficher ferait
  réapparaître chez tout le monde ce qu'un utilisateur a rangé (porte dérobée ② du
  lot UI-8). ② Ces libellés sont du CONTENU D'AUTRUI : `escapeHtml` obligatoire.
  ③ Le rendu est BORNÉ (3 + « +N ») et tronqué en CSS — une identité longue pousse
  hors de l'écran l'action posée à côté d'elle (« Message → », « Voir → »).
  ⚠️ L'inbox Messages n'affiche plus la passion ACTIVE mais TOUTES les passions :
  « Ben · 🏍️ Moto » laissait croire qu'on écrivait « depuis » une passion.

  ④ **LE STUDIO EST LE SEUL POINT DE CHOIX DE LA PASSION DE DESTINATION**, et il
  s'en souvient : `#postPassion` porte un `onchange="onStudioPassionChange()"` qui
  appelle `switchToProfile`. Sans cela, la ligne « Passion active » ayant disparu,
  la passion d'inscription serait devenue un choix définitif. Écriture et lecture
  restent indépendantes (ADR-010 §6) : ça ne touche aucune préférence du fil.
  La carte de passion n'offre plus « Publier dans celle-ci » — elle INDIQUE
  seulement laquelle le Studio présélectionnera.

  ⚠️ **LE GESTIONNAIRE D'UNE BULLE N'EST PAS UNE CHAÎNE LIBRE.** `passionTileHTML`
  prend une `action` (`feedFollowing` | `feedPassion` | `profilePassion` |
  `visitedPassion`) et un `arg` ; `_passionTileOnclick` écrit chaque appel EN
  TOUTES LETTRES. La première version laissait l'appelant fournir l'`onclick`
  entier — `audit:echappement` l'a refusée, à raison : un handler doit se relire à
  l'œil, sans remonter la provenance de la chaîne.

