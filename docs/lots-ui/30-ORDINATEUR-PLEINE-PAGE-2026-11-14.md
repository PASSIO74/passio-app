# 30 — Sur ordinateur, un vrai site pleine page (2026-11-14)

## La demande

Benjamin, le 2026-11-14 : « pour l'utilisation sur ordinateur, fais en sorte que cela ressemble à un vrai site qui prend toute la page — fais une vraie configuration ordinateur, ergonomique ».

Avant : à partir de 900 px, l'app était une colonne de téléphone de 440 px au milieu de l'écran, élargie à 640 px au-dessus de 1100 px (LOT-51). La barre d'onglets restait en bas de cette colonne.

## Ce qui change, à partir de 1024 px de large

Tout est dans UN bloc en fin de `styles.css`, entre les marqueurs `ORDINATEUR-PLEINE-PAGE:DEBUT` et `:FIN`, sous `@media (min-width: 1024px)`. Aucun nœud n'est créé ni déplacé.

- **La coque** (`.app-shell`) occupe toute la fenêtre, en grille : l'en-tête sur toute la largeur, le menu à gauche (`--pc-rail`, 248 px), le contenu à droite. Seuls les enfants dans le flux sont des cellules ; les panneaux absolus et fixes ne sont pas concernés.
- **La navigation** (`#appNavV2`, et la barre historique si la v2 est coupée) devient un menu latéral : icône et libellé sur une ligne, l'écran courant sur fond violet pâle, « Créer » en bouton principal sous les destinations (`order`, le DOM ne bouge pas).
- **Le contenu** garde une largeur de lecture (760 px), centrée. « Rencontrer » et « Explorer » montent à 1080 px : les activités passent sur deux colonnes, les passions sur une grille qui se remplit.
- **Les fenêtres** (`.modal`, feuille « Créer ») sont des dialogues centrés, plus des feuilles collées en bas.
- **La conversation** (`#conv-fullpage`) et **les fiches** (`#postDetailPage`, `#eventDetailPage`) s'ouvrent dans la zone de contenu : l'en-tête et le menu restent visibles. Le fil d'une conversation garde 880 px de large.
- **L'accueil** (`#landing`) est en deux colonnes (titre et boutons à gauche, les six piliers à droite) ; **l'inscription** est une colonne centrée de 560 px.
- Les toasts et le pied « Afficher N résultats » ne se calent plus sur une barre du bas qui n'existe plus.
- Stories, bobines et éditeur média restent en plein écran : ce sont des lecteurs.

Sous 1024 px, rien ne change : téléphone et tablette gardent la colonne et la barre du bas (entre 900 et 1023 px, la colonne de 440 px).

## Le seul changement de code

`goTo` (app-02) referme la conversation ouverte, **sur ordinateur seulement** (`matchMedia("(min-width: 1024px)")`). Le menu latéral reste cliquable à côté d'une conversation : sans cela, un clic sur « Découvrir » changeait l'écran dessous et la conversation restait affichée. C'est le défaut des deux pages de détail (2026-09-18), sur une troisième surface. `_convOrigine` est vidé avant l'appel, sinon `closeConversation` relancerait un `goTo` vers l'écran d'origine. Sur téléphone la conversation recouvre la barre : rien ne change (verrou ③ bis).

Reste connu : l'entrée d'historique `#conv` de la conversation refermée par le menu reste derrière l'écran d'arrivée, comme celle d'une fiche refermée de la même façon. Le premier retour est sans effet visible.

## Les pièges

- `#appNavV2.app-nav-v2` porte `display: grid` avec un identifiant : une règle `.app-shell > .app-nav` ne le bat pas. Le bloc nomme l'identifiant.
- `#postDetailPage` porte `inset:0` en style en ligne : `top` et `left` sont en `!important`.
- `styles.css` est en CRLF et contient des octets hors UTF-8 : le bloc a été ajouté en binaire.
- La règle du LOT-51 (`width: min(640px, …)`) est retirée : elle aurait été battue en silence par le bloc.

## Les verrous

`tests/e2e/lot51-grand-ecran.spec.js` (6), réécrite :

- ① 1440 × 900 : coque sur toute la fenêtre, en-tête pleine largeur, menu à gauche sous l'en-tête (libellés visibles, cliquable), contenu à droite, pas de débordement ;
- ② le seuil : pleine page à 1024 px ; colonne et barre du bas à 390 px et à 1000 px ;
- ③ le menu navigue et referme la conversation ouverte à côté ; ③ bis sur téléphone, `goTo` ne la referme pas ;
- ④ la fiche d'une publication est sous l'en-tête, à droite du menu ;
- ⑤ une fenêtre est un dialogue centré.

## Les mesures

- La suite : 6 sur 6.
- Suites voisines (navigation, cadrage, barre v2, historique, conversation, panneau contextuel à 1280 px, mise à jour pendant un appel à 1280 px) : 91 sur 91.
- `npm run verif` vert.
- Contrôle à l'écran à 1440 × 900 et 1280 × 660 : fil, Rencontrer (liste, carte, filtre), Explorer, Messages, conversation, Profil, Studio, fiche de publication, fiche d'activité, feuille « Créer », notifications, Paramètres, story, accueil, inscription.

## Ce qui n'est pas fait

- Pas de colonne de droite (suggestions, activités proches) : il faudrait du contenu neuf, pas une mise en page.
- Messages n'est pas en deux volets (liste et conversation côte à côte).
- WebKit n'a pas été mesuré sur cette disposition (le socle WebKit de la CI tourne au gabarit iPhone).
