# 10 PROFIL ENTETE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **EN-TÊTE DU PROFIL — la photo jusqu'au pseudo, et des passions qui sont des
  PORTES (2026-09-01), ACTIF, SANS DRAPEAU.** Trois demandes de Benjamin après
  essai réel : la photo de couverture « devrait aller jusqu'à juste au-dessus du
  nom de profil », la photo de profil « plus grande », et « les passions
  cliquables, ça renvoie vers la page de cette passion, pour que les utilisateurs
  puissent aller découvrir les passions directement ». Implémentation :
  `.main-profile-*` dans `styles.css`, `identitePassionsChipsHTML` /
  `identitePassionsLiensHTML` / `_identPassionOnclick` (app-02),
  `renderMainProfile` (app-06), l'en-tête du profil visité (app-04),
  `openPassionExplorer(pid, retourUserId)` (app-07). Verrou :
  `tests/e2e/profil-entete-passions.spec.js` (13, éprouvés par mutation — rendre
  ses marges d'origine à `.main-profile-avatar-wrap` fait rougir 2 tests).

  ⚠️ **CE QUI REND LA PLACE À LA PHOTO N'EST PAS LE PLAFOND, C'EST L'AVATAR.**
  Le plafond de `.main-profile-cover` monte à peine (0,24 → 0,34 de `--app-vh`,
  et l'`aspect-ratio: 3/2` le borne de toute façon à 237 px en 390 px de large).
  Le gain vient de `.main-profile-avatar-wrap` : l'avatar ne déborde plus de
  MOITIÉ dans le corps blanc (`margin-top: -45px` pour 90 px de haut), il tient
  ENTIER sur la couverture (`-130px` pour 116 px + 14 de garde). Les 45 px qu'il
  occupait dans le corps reviennent à la photo, et le pseudo se pose 4 px sous
  son bord bas. **Ces trois nombres sont liés** : agrandir l'avatar sans corriger
  `margin-top` le fait redéborder dans le corps ; le réduire sans corriger le fait
  flotter au milieu de la photo. Mesuré à 390 × 844 : cover 237 px (contre 202),
  carte 393 px (contre 360) pour 714 px visibles — la photo gagne 35 px de hauteur
  PLUS les 45 px de débord que l'avatar lui rend, la carte n'en prend que 33.

  ⚠️ **L'ASPECT-RATIO RESTE 3/2 — ne jamais l'élargir pour « gagner » de la
  hauteur.** C'est le rapport du recadreur (1080×720) : un rapport plus haut
  rognerait les côtés de toutes les couvertures déjà recadrées par leurs auteurs.
  On n'agrandit pas une photo en coupant celles qui existent.

  ⚠️ **CETTE DEMANDE N'ANNULE PAS CELLE DU 2026-08-31** (« le grand carré avec
  photo prend trop de place, réduis-le »). L'une vise la CARTE ENTIÈRE, l'autre la
  seule PHOTO — mais rien ne garantit tout seul que la carte ne regonfle pas.
  D'où un test de contre-mesure explicite : la carte d'identité reste sous les
  deux tiers de la zone visible. Toute demande d'agrandissement future doit
  repasser par lui.

  ⚠️ **PÉRIMÈTRE DES PASSIONS CLIQUABLES : LES DEUX EN-TÊTES DE PROFIL, ET RIEN
  D'AUTRE.** Les surfaces denses (`ident-passions-sm` : cartes de publication,
  commentaires et réponses, listes d'abonnés, recherche, inbox, notifications)
  gardent `identitePassionsHTML`, en texte inerte. Deux raisons, aucune
  décorative : ① ces lignes vivent DANS une rangée qui a déjà son geste (ouvrir le
  profil, ouvrir la publication) — un bouton imbriqué y donnerait deux
  destinations pour un tap ; ② elles mesurent 10,5 px, très loin des 44 px de
  cible tactile. Un test verrouille ce périmètre côté carte de publication.

  ⚠️ **`openModal` N'EMPILE PAS — d'où le second argument d'`openPassionExplorer`.**
  Ouverte depuis la modale d'un profil visité, la page de la passion la REMPLACE :
  sans chemin de retour, découvrir une passion faisait perdre la personne par qui
  on l'avait découverte (la croix rend le fil, pas le profil). `retourUserId` est
  une DONNÉE, pas une chaîne d'appel, et il peint un lien « ← Retour au profil ».
  Les huit appels historiques (Explorer, tuiles de tendance, IA, passerelle UI-3)
  ne le passent pas : ils viennent d'un écran, n'ont rien à restituer, et un lien
  de retour y mentirait. Un test couvre chacun des deux cas.

  ⚠️ **LA CIBLE TACTILE FAIT 44 px, LA PASTILLE VISIBLE 30 px** — même patron que
  la pastille d'UI-3A et le crayon d'UI-6B : la boîte du bouton garde ses 44 px et
  c'est un `::before` en `inset: 7px 0` (z-index négatif) qui PEINT la pilule, une
  cible se mesurant sur la BOÎTE. Deux conséquences propres à une rangée qui passe
  à la ligne : les marges négatives (`-7px 0`) rendent au corps les 14 px que la
  boîte ajoute, et le **`row-gap` vaut exactement 14 px** (30 peints + 14 = 44) —
  sans lui, deux rangées de boîtes se CHEVAUCHENT et un tap entre deux lignes
  atteint la pastille du dessous. Un test vérifie qu'aucune paire ne se recouvre.

  ⚠️ **LE FOND DE LA PASTILLE NE PEUT PAS ÊTRE `--bg-card`** : elle vit DANS
  `.main-profile-card`, qui est déjà `--bg-card` (#fff), et `--border` est à 7 %
  d'opacité — une pastille blanche sur carte blanche est invisible. D'où
  `--accent-wash`, le jeton d'« état actif discret » du thème.

  ⚠️ **LA RANGÉE EST FERRÉE À GAUCHE**, comme le pseudo et la bio.
  `.main-profile-body .ident-passions` la centrait alors que tout le corps du
  profil est à gauche — discret pour un libellé gris, franchement visible pour une
  rangée de pastilles. La règle de ce lot a la MÊME spécificité (0,2,0) et gagne
  par la position : ne pas la déplacer avant l'autre.

  ⚠️ **`passionsAffichables()` ET JAMAIS LA LISTE BRUTE** — la porte dérobée ② du
  lot UI-8 vaut a fortiori ici : le jsonb `profiles.passions` contient les passions
  ARCHIVÉES, et une passion rangée deviendrait une porte PUBLIQUE. Le rendu reste
  aussi BORNÉ (6 + « +N » non cliquable, `IDENT_PASSIONS_MAX_PROFIL`) : `flex-wrap`
  n'autorise pas à peindre une liste non bornée venue d'un autre compte. Le « +N »
  n'ouvre rien — un faux bouton est pire qu'une information.

  ⚠️ **LE GESTIONNAIRE N'EST PAS UNE CHAÎNE LIBRE** (`_identPassionOnclick`, même
  règle que `_passionTileOnclick`) : chaque branche écrit son appel EN TOUTES
  LETTRES, seul l'argument circule et il passe par `escapeJsArg`. Et **aucune
  activation clavier ici** : `app-08` porte le délégué unique des `[role="button"]`
  non natifs — un second écouteur produirait deux activations pour une touche.

