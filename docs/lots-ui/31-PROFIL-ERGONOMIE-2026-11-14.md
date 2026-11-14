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
2. **Le corps de la carte est MESURÉ** — `_suivreCorpsCarteProfil` (app-06, un `ResizeObserver`) pose `--corps-carte-profil` sur `#screen-profiles` ; `--espace-profil` et la borne de survie de `--couverture-profil` le lisent (repli 145 px avant la première mesure). Constantes corrigées : barre 66 px (et non 62), bordures de la carte 2 px. Plancher de couverture 140 px : l'avatar (116 + 14) tient toujours sur la photo.
3. **« Partager » à droite de l'avatar, sur la photo** — même bouton, même classe `.main-profile-partager`, même `partagerMonProfil()`, mais dans `.main-profile-avatar-wrap` (flex, `space-between`, `align-items: flex-end`) : aligné sur le bord bas de l'avatar, il ne coûte plus aucune hauteur (−56 px). Pilule blanche visible de 34 px, boîte de 44 px (patron du crayon d'UI-6B). Libellé « Partager » (tient à 320 px), nom accessible « Partager mon profil ».
4. **Le rail va jusqu'aux bords de l'écran** (`margin-inline: -16px`, padding 16 conservé) : à 390 px la 5e vignette dépasse de ~28 px — l'indice d'une rangée qui coulisse, sans chiffre ni flèche. Bulle 74 px, écart 8 (pas inchangé : 82), libellé jusqu'à 70 px : « Course à pied » s'écrit en entier.
5. **Onglets collants** — `#v7ProfileTabs` en `position: sticky`, `top: -16px` (−28 px sur ordinateur, dans le bloc ORDINATEUR) : la barre se colle au ras de l'en-tête. Au toucher d'un onglet, si le panneau commence sous la barre collée, `recadrerSousBarre` (ui-v7-lot) le ramène juste dessous. `scroll-margin-top: 60px` sur `#myPosts` et les panneaux.
6. **Entrée sur la bio** : l'`onkeydown` en ligne est retiré (index.html), le délégué d'app-08 suffit.
7. Le curseur « main » de la bio d'AUTRUI (aucun clic) est retiré.

## Mesures (après), état de Benjamin

| Écran | Carte | Onglets | Formats (bas) | Barre du bas |
|---|---|---|---|---|
| 390 × 844 | 80 → 484 (0,57) | 621 → 673 | 765 | 778 |
| 390 × 765 | 80 → 484 (0,64) | 569 → 621 | 687 | 699 |
| 390 × 693 | 80 → 426 (0,62) | 503 → 555 | 617 | 627 |
| 375 × 667 | 80 → 400 (0,60) | 477 → 529 | 591 | 601 |

À 320 × 568 (iPhone SE de 1re génération), la couverture tombe à son plancher de 140 px et la rangée de formats déborde encore (comme avant) : c'est l'avatar qui fixe le plancher.

## Ce qui ne change pas — et pourquoi

- **Aucun bouton « Modifier le profil »** : le crayon discret au coin de la couverture est une décision du 2026-08-29 (« remplace l'onglet Modifier par un petit onglet très discret (crayon) »), et LOT-16 a déjà refusé PRO-C16 pour la même raison. La bio reste une porte vers l'éditeur.
- Couverture en 3/2, avatar 116 px et ses deux marges liées, pseudo au ras de la photo, carte sous les 2/3 : intacts (et désormais vérifiés AVEC une bio).
- Rail : bulles rondes, multi-sélection sans « Toutes », pas de « + », pas de chiffre, centrage par marges `auto` quand la rangée tient, départ à 0 quand elle déborde.
- Onglets « Publications | Activité », formats avec leurs libellés écrits, choix unique avec « Tout » neutre.
- Le profil visité garde sa mise en page ; seule sa bio passe en paragraphes (classe commune).

## Pièges

- **`corps.offsetHeight` ne mesure pas le corps** : la marge négative de l'avatar (−130 px) traverse `.main-profile-body`, dont la boîte remonte dans la photo (300 px mesurés pour 170 sous la couverture). La mesure est `bas du corps − bas de la couverture`.
- **Écrire la variable sur l'écran, jamais une classe** : UI-6B et UI-7 observent l'attribut `class` de `#screen-profiles` et de ses descendants. Écran masqué = mesure nulle, ignorée.
- **Le bouton sur la photo doit être positionné** : `.main-profile-cover` est `position: relative` ; un bouton qui ne l'est pas est peint SOUS elle.
- **Le collage se fait au bord du CONTENU de `#appMain`** (sous son `padding-top`) : `top: 0` laissait les publications défiler visibles dans une bande de 16 px au-dessus de la barre.
- **Un `\n` simple doit rester un `\n`** dans un nœud texte : couper chaque ligne en bloc casserait `biographie-multiligne` (`textContent` exact).

## Verrous

`tests/e2e/profil-ergonomie.spec.js` (15) — ① tout tient sur une page avec sa bio et ses passions (844, 765, 693, 667) et ① bis la mesure suit une bio qui s'allonge ; ② bio en paragraphes, ② bis profil visité échappé ; ③ « Partager » sur la photo (390, 320) et ③ bis son geste, sans bouton « Modifier » ; ④ rail jusqu'au bord, 5e bulle entamée ; ⑤ onglets collants et recadrage ; ⑥ Entrée = une ouverture ; ⑦ ordinateur ; ⑧ coupure d'UI-7. **Contre-épreuve sur le code d'avant : 13 rouges sur 15** (③ bis et ⑧ sont des cas de non-régression, verts par nature).
