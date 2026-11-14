# 31 — Profil : ergonomie de son propre profil (2026-11-14)

## La demande

Benjamin, le 2026-11-14, capture de SON profil sur Android à l'appui : « Améliore la page de profil, je ne la trouve pas ergonomique et pratique ».

## Ce qui a été mesuré (avant)

Son état réel, relu en base (canal ①, lecture seule) : pseudo « Ben test 1 sur portable », bio `Benjamin ladame⏎⏎Annecy⏎⏎37 ans` (deux lignes VIDES), 7 passions, 5 abonnements. Rejoué en local à 390 × 844 :

| Élément | Avant | Pourquoi |
|---|---|---|
| Carte d'identité | 487 px (80 → 567), 0,68 de la zone visible | bio 98 px + bouton « Partager mon profil » pleine largeur 56 px |
| Bio | 98 px pour 3 lignes de texte | chaque ligne vide = une ligne blanche de 19,5 px (`pre-line`) |
| Blancs carte → rail → onglets → formats | 36 px × 3 | `--espace-profil` saturé à son plafond |
| Onglets « Publications \| Activité » | 704 → 756, coupés par la barre du bas (778) | idem |
| Formats (Tout · Photos…) | jusqu'à 848, sous la barre | idem |
| Rail des passions | 4 bulles sur 7, coupure PILE dans la marge de la 5e | rien ne disait qu'il y en avait d'autres ; « Course à p… » |
| Après défilement | les onglets partent avec la page | il fallait remonter tout le profil pour passer à « Activité » |
| Entrée sur la bio | ouvre l'éditeur DEUX fois | `onkeydown` en ligne + délégué clavier d'app-08 |

**La cause des onglets sous la barre est une RÉGRESSION** de « tout doit tenir sur une page » (2026-09-10) : la formule `--espace-profil` comptait un corps de carte FIXE de 145 px. Une bio réelle et le bouton « Partager » (LOT-12, ajouté après la formule) en faisaient 249 : la formule voyait 104 px qui n'existaient pas. Le verrou ① ter de `profil-entete-passions` (carte < 2/3) restait vert : sa fixture n'a pas de bio. À 390 × 765, l'écran de référence de Benjamin noté le 2026-09-10, les onglets étaient à moitié sous la barre — exactement sa capture.

## Ce qui change

1. **La bio en paragraphes** — `bioEnParagraphesHtml(texte)` (app-02), SEUL rendu des deux `.main-profile-bio` (mon profil, app-06 ; profil visité, app-04). Une ligne vide devient un écart de 6 px (`.bio-sep + .bio-para`) au lieu d'une ligne blanche. La donnée ne change pas (décision du 2026-09-03 : « je dois pouvoir éditer comme j'ai envie ») ; le séparateur `\n\n` reste dans le DOM (`<span hidden>`) : `textContent` rend la bio à l'octet près. Normalisée AUSSI à l'affichage (une bio d'autrui n'est jamais garantie normalisée), chaque morceau passe par `escapeHtml`. 98 → 71 px chez Benjamin.
2. **Le corps de la carte est MESURÉ** — `_suivreCorpsCarteProfil` (app-06, un `ResizeObserver`) pose `--corps-carte-profil` sur `#screen-profiles` ; `--espace-profil` et la borne de survie de `--couverture-profil` le lisent (repli 145 px avant la première mesure). Constantes corrigées : barre 66 px (et non 62), bordures de la carte 2 px, et les **zones sûres de l'iPhone** (`env(safe-area-inset-top)` porté par `.app-shell`, `env(safe-area-inset-bottom)` ajouté à la barre) — `--app-vh` vaut `innerHeight` en `viewport-fit=cover` : sans elles, une PWA installée (47 + 34 px) remettait les formats 68 px sous la barre. Plancher de couverture 140 px : l'avatar (116 + 14) tient toujours sur la photo.
3. **« Partager mon profil » RETIRÉ** — d'abord déplacé de sa rangée pleine largeur (56 px, c'est elle qui faisait passer les onglets sous la barre) vers la place libre à droite de l'avatar, puis **supprimé le même jour sur demande de Benjamin** : « supprime "partager profil", il sert à rien ». Le bouton (LOT-12, PAR-C14), `partagerMonProfil` (son seul appelant) et leurs règles CSS sont partis ensemble — cible supprimée, tout ce qui la vise part avec. Le lien de MON profil reste à un geste : crayon → « Inviter des amis » (`inviterDesAmis`, qui envoie `lienPartageDe("user", MY_UID)` pour un vrai compte).
4. **Le rail va jusqu'aux bords de l'écran** (`margin-inline: -16px`, padding 16 conservé) : à 390 px la 5e vignette dépasse de ~28 px — l'indice d'une rangée qui coulisse, sans chiffre ni flèche. Bulle 74 px, écart 8 (pas inchangé : 82), libellé jusqu'à 70 px : « Course à pied » s'écrit en entier.
5. **Onglets collants** — `#v7ProfileTabs` en `position: sticky`, `top: -16px` (−28 px sur ordinateur, dans le bloc ORDINATEUR) : la barre se colle au ras de l'en-tête. Au toucher d'un AUTRE onglet, si le panneau commence sous la barre collée, `recadrerSousBarre` (ui-v7-lot) le ramène juste dessous ; re-toucher l'onglet actif ne bouge rien (la barre est sous le pouce en permanence : un tap involontaire ne doit pas faire perdre la lecture). `scroll-margin-top: 60px` sur `#myPosts` et les panneaux.
6. **Entrée sur la bio** : l'`onkeydown` en ligne est retiré (index.html), le délégué d'app-08 suffit.
7. Le curseur « main » de la bio d'AUTRUI et de MA couverture (aucun clic, mesuré) est retiré ; le groupe des formats s'annonce « Filtrer par format de contenu » (il disait « multi-sélection », faux depuis LOT-16).
8. La barre collante a un fond OPAQUE dans tous les thèmes (en « Sombre », `--bg-card` est translucide à 92 % : les publications transparaissaient).

## Le contenu d'abord (arbitrage des conceptions, compte réel à 0 publication)

L'arbitre a relu le compte RÉEL de Benjamin (canal ①, agrégat) : **0 publication**. Sur son écran, la rangée Tout · Photos · Vidéos · Bobines · Audio ne filtrait donc rien — cinq chemins vers des états vides — et occupait la dernière place visible, pendant que « Publie ta première création » restait sous la barre (779 à 844, 701 à 765).

9. ⛔ **RETIRÉ le 2026-11-14 (même jour, à la demande de Benjamin : « je ne vois plus les onglets photo / vidéo à cocher ») — la rangée de formats est désormais TOUJOURS peinte ; ce qui suit est l'historique.** ~~La rangée de formats ne se peint que si elle filtre quelque chose~~ : `_majRangeeFormats` (app-06) pose `data-formats="0|1"` sur `#screen-profiles .profile-tabs`, calculé sur TOUTES mes publications (jamais sur la passion filtrée), et SEULEMENT depuis `renderProfilesScreen` — jamais au toucher d'un format ou d'une bulle : la rangée ne disparaît jamais sous le doigt. Un format déjà choisi la garde peinte. Le masquage est en CSS sous `:root.passio-ui-7` ; le contenu prend sa place, à un `--espace-profil` des onglets ; **la formule ne change pas et rien au-dessus des onglets ne bouge**. Dès le premier média, la rangée revient, en bas de page comme décidé le 2026-09-10.
10. **État vide compact** sur MON profil : icône à gauche, bouton pleine largeur dessous (44 px), texte à 12 px (plancher de LOT-53) — 168 → 110 px ; « Créer une publication » inchangé.
11. **« Activité » sans titre qui répète l'onglet** : « Mes activités » est masqué à l'ÉCRAN seulement (il reste dans le DOM : UI-7 le retrouve par son texte, un lecteur d'écran le lit) ; le contenu remonte de 62 à un espace sous les onglets.
12. Le profil VISITÉ s'annonce aussi « Filtrer par format de contenu » (choix unique depuis LOT-16).

À 390 × 844, 0 publication : titre et texte de l'état vide visibles (719 → 757 pour une barre à 778) ; que des textes : l'en-tête de la 1re publication visible ; avec un média : inchangé.

## Mesures (après), état de Benjamin

| Écran | Carte | Onglets | Formats (bas) | Barre du bas |
|---|---|---|---|---|
| 390 × 844 (avec le bouton sur la photo, avant son retrait — sans effet sur la hauteur) | 80 → 484 (0,57) | 621 → 673 | 765 | 778 |
| 390 × 765 | 80 → 484 (0,64) | 569 → 621 | 687 | 699 |
| 390 × 693 | 80 → 426 (0,62) | 503 → 555 | 617 | 627 |
| 375 × 667 | 80 → 400 (0,60) | 477 → 529 | 591 | 601 |

À 320 × 568 (iPhone SE de 1re génération), la couverture tombe à son plancher de 140 px et ce sont les ONGLETS eux-mêmes qui passent ~14 px sous la barre (comme avant le lot, mesuré identique sur becddff) : c'est l'avatar qui fixe le plancher. Les onglets restent collants dès qu'on défile.

## Ce qui ne change pas — et pourquoi

- **Aucun bouton « Modifier le profil »** : le crayon discret au coin de la couverture est une décision du 2026-08-29 (« remplace l'onglet Modifier par un petit onglet très discret (crayon) »), et LOT-16 a déjà refusé PRO-C16 pour la même raison. La bio reste une porte vers l'éditeur.
- Couverture en 3/2, avatar 116 px et ses deux marges liées, pseudo au ras de la photo, carte sous les 2/3 : intacts (et désormais vérifiés AVEC une bio).
- Rail : bulles rondes, multi-sélection sans « Toutes », pas de « + », pas de chiffre, centrage par marges `auto` quand la rangée tient, départ à 0 quand elle déborde.
- Onglets « Publications | Activité », formats avec leurs libellés écrits, choix unique avec « Tout » neutre.
- Le profil visité garde sa mise en page ; seule sa bio passe en paragraphes (classe commune).

## Pièges

- **`corps.offsetHeight` ne mesure pas le corps** : la marge négative de l'avatar (−130 px) traverse `.main-profile-body`, dont la boîte remonte dans la photo (300 px mesurés pour 170 sous la couverture). La mesure est `bas du corps − bas de la couverture`.
- **Écrire la variable sur l'écran, jamais une classe** : UI-6B et UI-7 observent l'attribut `class` de `#screen-profiles` et de ses descendants. Écran masqué = mesure nulle, ignorée.
- **Un élément posé sur la photo doit être positionné** : `.main-profile-cover` est `position: relative` ; un élément qui ne l'est pas est peint SOUS elle (vécu avec le bouton Partager avant son retrait).
- **Le collage se fait au bord du CONTENU de `#appMain`** (sous son `padding-top`) : `top: 0` laissait les publications défiler visibles dans une bande de 16 px au-dessus de la barre.
- **Un `\n` simple doit rester un `\n`** dans un nœud texte : couper chaque ligne en bloc casserait `biographie-multiligne` (`textContent` exact).
- **Une formule de hauteur qui ignore les zones sûres** se vérifie verte partout sauf sur l'appareil visé : le cas ① ter les émule (`Emulation.setSafeAreaInsetsOverride`, Chromium).

## Verrous

`tests/e2e/profil-ergonomie.spec.js` (25) — ① tout tient sur une page avec sa bio et ses passions (844, 765, 693, 667), ① ter en PWA iPhone (zones sûres) et ① bis la mesure suit une bio qui s'allonge ; ② bio en paragraphes, ② bis profil visité échappé ; ③ plus de bouton « Partager » ni de `partagerMonProfil`, « Inviter des amis » toujours au menu du crayon, aucun bouton « Modifier » ; ④ rail jusqu'au bord, 5e bulle entamée ; ⑤ onglets collants et recadrage, ⑤ bis re-toucher l'onglet actif ne remonte rien ; ⑥ Entrée = une ouverture ; ⑦ ordinateur ; ⑧ coupure d'UI-7 ; ⑨–⑮ le contenu d'abord (0 publication à 844, 765, 667 ; que des textes ; la rangée ne disparaît pas sous le doigt et revient au premier média ; état vide compact ; « Activité » ; libellé du profil visité ; coupure). Les cas ① passent désormais AVEC une photo : c'est là que la rangée de formats existe et que le verrou du 2026-09-10 a un objet. **Contre-épreuve sur le code d'avant : 13 rouges sur 15** (③ bis — remplacé depuis par l'absence du bouton — et ⑧ étaient des cas de non-régression, verts par nature) ; ① ter et ⑤ bis, ajoutés après l'audit, sont rouges sur le premier commit du lot ; ⑨ à ⑭ sont rouges sur df3df2c (8 sur 8), ⑮ (non-régression) vert.

## Contre-vérification par trois conceptions indépendantes

Un atelier de conception (cartographie en cinq lectures, puis propositions « risque minimal », « pratique au quotidien », « le contenu d'abord ») a été mené en parallèle de l'implémentation, sans la voir au départ. La proposition « pratique » converge sur le diagnostic et les cinq gestes (bio, Partager sur la photo, mesure du corps, collant, rail au bord). Repris d'elle : le fond opaque en Sombre, le libellé des formats, le curseur de la couverture. L'arbitre a noté les trois propositions (7, 7, 6,5 sur 10), retenu le lot tel qu'il était comme base et greffé « le contenu d'abord » (ci-dessus) sans changer un pixel au-dessus des onglets. **Non repris, avec la raison** : une réserve d'« aperçu » (64 px) pour montrer la 1re publication à 844 px — elle aurait resserré les écarts de 36 à ~11 px, à rebours de « descends les onglets de contenu jusqu'en bas, espace tout le reste » (2026-09-10) ; une coupure de lot dédiée (aucune décision ne l'exige, le lot ORDINATEUR n'en a pas) ; des libellés de bulle sur deux lignes (le libellé gagne 6 px à la place, sans changer la hauteur du rail) ; « re-toucher l'onglet actif = remonter » (l'audit a tranché pour garder la position de lecture).

## Audit du diff (`audit-passio`) et ce qu'il a changé

Aucun P0–P2 (XSS, globals, cible déplacée, observateurs, coupures 6B/7/8, page « Mes passions », écran masqué : vérifiés). Corrigés : re-toucher l'onglet actif remontait la page (P3) ; les zones sûres de l'iPhone manquaient à la formule (P3, antérieur au lot) ; échec du `ResizeObserver` journalisé ; bio du profil visité calculée une fois ; (anneau de focus et libellé du bouton Partager, devenus sans objet avec son retrait).

**Laissé, avec sa raison** : la suite n'est pas au socle WebKit de la CI (`SUITES_WEBKIT`) — `playwright.config.js` est un chemin critique sous contre-revue humaine, et WebKit n'est pas installé dans l'environnement du lot. Le collage (`top` négatif dans un conteneur défilant) est standard sous WebKit, mais non prouvé ici : à inscrire au socle lors de la prochaine contre-revue de la configuration.

## Revue adversariale du complément (« le contenu d'abord » et retrait du bouton)

Trois relecteurs indépendants (cycle de vie, rendu mesuré à cinq tailles et en Sombre, cibles supprimées), chaque constat P0–P3 contre-vérifié : **aucun P0–P3**. Corrigés parmi les P4 :

- **Un média arrivé APRÈS l'entrée sur l'écran** (état du serveur hydraté par `renderEverything`, qui ne repeint pas le profil) laissait la rangée masquée alors que la liste, repeinte au premier toucher d'une bulle, montrait la photo. `renderProfileContent` appelle désormais `_majRangeeFormats(true)` : un rendu de la liste peut faire APPARAÎTRE la rangée, jamais la cacher sous le doigt. Verrou ⑪ bis.
- **Une ancienne multi-sélection** `["posts","photos"]` (d'avant LOT-16) masquait la rangée avec « Photos » coché dedans : la condition lit maintenant toute clé autre que `posts`. Verrou ⑪ bis.
- Un commentaire CSS citait encore le bouton supprimé ; le nombre de cas de la fiche était faux.

Laissés, avec leur raison : le bouton « Créer une publication » de l'état vide dépasse de ~11 px au-dessus de la barre à 0 publication (indice qu'il y a une suite, et « Créer » est aussi au centre de la barre) ; à la coupure d'UI-7 suivie d'un aller-retour d'écran puis d'un rétablissement, le rail se replace sous les panneaux — défaut PRÉEXISTANT d'UI-7 (`rendreLesNoeuds`), mesuré identique avant le lot, hors périmètre.

