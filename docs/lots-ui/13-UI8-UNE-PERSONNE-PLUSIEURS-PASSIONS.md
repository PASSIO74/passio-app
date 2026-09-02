# 13 UI8 UNE PERSONNE PLUSIEURS PASSIONS

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **Lot UI-8 — « une personne, plusieurs passions » (2026-08-29), ACTIF PAR DÉFAUT.**
  Coupure unique : `localStorage.passio_ui_8="0"` ou `window.PASSIO_UI_8=false`. Le drapeau
  ne sait qu'ENLEVER — aucune valeur positive n'active, rien n'est écrit dans `localStorage`.
  Implémentation dans les moteurs eux-mêmes (`js/app-06-reels-partage.js`, bloc « LOT UI-8 »)
  plutôt que dans un module observateur : ce lot change ce que l'écran SIGNIFIE, pas seulement
  ce qu'il montre. CSS : bloc « PASSIO UI V8 » en fin de `styles.css`. Tests :
  `tests/e2e/ui-v8-passions.spec.js`.
  **Le modèle.** PASSIO ne donne plus l'impression qu'on possède plusieurs COMPTES : un seul
  profil personnel (pseudo, avatar, bio, abonnés) + plusieurs **passions**, univers de contenu
  rattachés à ce même profil. Une seule passion est active pour CRÉER ; consulter se fait par
  des filtres séparés. `currentProfileId` reste la seule source de vérité de l'identité active
  et `switchToProfile()` son seul point d'écriture — la ligne « Passion active », le sélecteur
  (`openPassionSwitcher`) et le bouton « Utiliser pour créer » l'appellent tous les trois.
  **Ce qui bouge.** ① Sous la carte d'identité, une ligne `Passion active : 🏍️ Moto · Changer`
  (`#v8ActivePassion`, rendue par `renderMainProfile` donc rafraîchie à chaque repeint).
  ② « À propos » ne filtre PLUS : la carte n'appelle plus `toggleProfileSelect`, « Réinitialiser »
  disparaît, et chaque carte porte photo/couverture/nom/bio, ses décomptes et son état
  (« Passion active ✓ » ou « Utiliser pour créer »). Le reste de la carte ouvre
  `openEditPassionProfile`. ③ Le filtre de contenu déménage dans « Publications » et devient à
  choix UNIQUE (`state.user.profilePostFilterId`), avec un jumeau dans « Activités »
  (`profileEventFilterId`) ; aucun filtre = « Toutes ». ④ Le Studio annonce
  `Publication dans : 🏍️ Moto · Changer` (le `<select>` `#postPassion` reste le seul moteur :
  choisir une autre passion pour UNE publication ne change pas la passion active). ⑤ Les
  Messages affichent `Ben sur portable · 🏍️ Moto` — pseudo général d'abord, passion en contexte
  gris. ⑥ « Supprimer ce profil » devient « Archiver cette passion ».
  ⚠️ **Sept points à connaître avant d'y toucher.**
  ① **La suppression effaçait aussi les posts.** `deleteProfile` filtrait `state.userPosts` sur
  `profileId` : perdre une passion, c'était perdre son contenu. L'archivage ne retire RIEN — la
  passion reste dans `state.user.profiles` avec `archived:true`, ses publications restent
  visibles dans « Toutes ». **Aucune migration Supabase** : le drapeau voyage dans le blob
  `user_state`. La fusion défensive d'app-02 le ré-injecte quand le serveur n'en a AUCUN
  (`=== undefined`), jamais quand il en porte un — sinon une restauration serveur serait annulée
  par un vieil état local. Le quota (`isNextProfilePaid`) compte toujours `profiles.length` :
  archiver ne libère pas d'emplacement payant, et c'est voulu.
  ② **La migration de l'ancien état n'efface jamais `profileFilterIds`.** Exactement une valeur
  encore valide devient le filtre unique ; vide ou multiple retombe sur « Toutes ». Elle ne
  tourne qu'une fois (`_v8FiltresMigres`), et un filtre qui désigne une passion disparue ou
  archivée retombe sur « Toutes » plutôt que de vider l'écran sans explication.
  ③ **La rangée de filtre est montée PAR RAPPORT au bloc qu'elle commande**
  (`insertBefore(rangee, #myPosts)`), jamais à une position fixe de l'écran : sous le lot UI-7,
  `#myPosts` et `#profileEvents` vivent dans des panneaux d'onglet, et une rangée posée « en
  haut de l'écran » sortirait du panneau — visible, mais sous le mauvais onglet.
  ④ **Deux modules ne peuvent pas écrire la même carte.** UI-6B posait « Actif »/« Activer » par
  MutationObserver en lisant l'`onclick` de la carte (`idDeCarte` cherche `toggleProfileSelect`).
  Sous UI-8 cet `onclick` n'existe plus et l'état est rendu par `renderProfilesScreen` :
  `cartesReprisesParV8()` rend donc la surface à app-06 (même famille de garde que
  `ficheReprisParV4b` au lot UI-4B). UI-6B garde « Modifier » et le renommage de section.
  ⑤ **`_myProfileEvents(9999)` est l'appel de COMPTAGE**, et il n'est volontairement pas soumis
  au filtre d'affichage : les cartes doivent annoncer le total d'une passion, pas ce que le
  filtre courant laisse passer.
  ⑥ **Le Studio publiait « en tant que » la mauvaise identité.** `identiteCourante()`
  (ui-v6-composer) lisait `currentProfile().name` — le nom porté par la passion — alors que
  `publishPost` envoie `state.user.general.username`. Ce n'était pas une nuance de vocabulaire :
  l'écran annonçait un expéditeur qui n'était pas celui du post.
  ⑦ **Un `onclick` construit par concaténation d'un identifiant de fonction VARIABLE est refusé
  par `audit:echappement`**, et il a raison : la relecture d'un handler doit se faire à l'œil.
  Chaque branche de `_passionFilterRowHTML` écrit son appel en toutes lettres, avec
  `escapeJsArg` inline dans l'attribut.
  ⚠️ **Six PORTES DÉROBÉES trouvées par l'audit du lot, toutes fermées — et toutes couvertes par
  un test.** Elles ne rendaient pas le lot imparfait, elles le rendaient FAUX : « archiver ne
  supprime rien » ne tenait pas.
  ① `openEditPassionProfile` gardait « 🗑 Supprimer ce profil » — or c'est cette modale que la
  nouvelle carte ouvre sur TOUTE sa surface : la suppression destructrice se retrouvait à deux
  taps, plus près qu'avant le lot. Elle devient « Archiver cette passion » sous UI-8.
  ② `supaUpsertProfile` publiait `state.user.profiles` EN ENTIER dans le profil public : ranger
  une passion la laissait visible chez tous les autres comptes. Seule conséquence hors appareil
  du lot, et rien ne la filtrait.
  ③ `archiverPassion` ne nettoyait pas `_activeFeedPassions` alors que `renderProfileStrip` ne
  rend plus que les vivantes : la tuile disparaissait, le filtre restait. Si c'était la seule
  sélectionnée, le Fil ne montrait plus QUE la passion rangée, sans commande pour en sortir.
  ④ Le paywall barrait la RESTAURATION : `openCreateProfile` ouvrait `openProfilePaywall()` avant
  la grille dès `profiles.length >= 3` (archivées comprises, ce qui est voulu), et la passion
  rangée n'apparaissait ni dans la liste ni dans le catalogue. Un compte à la limite gratuite se
  voyait réclamer 150 💎 pour une passion qu'il possède déjà et ne voit plus. Le quota est
  inchangé ; c'est le CHEMIN qui s'ouvre — et choisir une passion archivée la RESTAURE au lieu
  d'en créer une seconde (`confirmCreateProfile`, avant le re-test du paywall).
  ⑤ `ui-v7-lot.js` (`remplirPassions`, feuille de bobine) proposait encore de publier dans une
  passion archivée, là où `renderStudio` les excluait : deux composeurs, deux réponses à « où
  puis-je publier ? ».
  ⑥ `deleteProfile` (chemin historique) repliait `currentProfileId` sur `profiles[0]`, qui peut
  être ARCHIVÉE — un état que tout le lot suppose impossible.
  ⚠️ **Et la coupure doit rendre les MOTS aussi.** Le vocabulaire du composer
  (« Publication dans : … · Changer ») et la ligne d'identité des Messages sont gouvernés par le
  même drapeau `passio_ui_8` : un kill switch qui laisse les libellés du nouveau lot n'est pas un
  kill switch. Corollaire de test : `ui-v6-composer.spec.js` et `ui-v7-lot.spec.js` observent ces
  mots d'avant, ils posent donc `localStorage.passio_ui_8="0"` au boot et gardent TOUTES leurs
  assertions — comme `ui-v6b-profil.spec.js`. Seule exception non gouvernée par le drapeau :
  `identiteCourante()`, qui est une correction de défaut (le Studio annonçait un expéditeur qui
  n'était pas celui du post), pas un choix de lot.
  Convention de test appliquée, la même qu'aux mises en ligne d'UI-3A et d'UI-4 :
  `ui-v6b-profil.spec.js` observe le comportement historique de la carte, il pose donc
  `localStorage.passio_ui_8="0"` au boot et garde TOUTES ses assertions ; la cohabitation des
  deux lots est prouvée à part dans `ui-v8-passions.spec.js`.

  ⚠️ **Ordre des blocs dans `styles.css` (fusion UI-4A5 × UI-8, 2026-08-29).** Le lot UI-4A5
  énonce que son bloc doit rester le DERNIER de la feuille — ses sélecteurs gagnent par la
  position. Le bloc « PASSIO UI V8 » est donc posé JUSTE AVANT lui, pas à la fin. Les deux
  sont ancrés sur des familles disjointes (`.v8-*` d'un côté, `:root.passio-ui-4a5` de
  l'autre), donc rien ne se recouvre ; l'ordre ne sert qu'à honorer cette contrainte. Piège
  payé à la résolution : les deux blocs se terminaient par une `@media` dont l'accolade
  fermante était la ligne COMMUNE d'après le marqueur de conflit — concaténés tels quels,
  le `@media` du premier englobait tout le second, en silence et sans CSS invalide.

