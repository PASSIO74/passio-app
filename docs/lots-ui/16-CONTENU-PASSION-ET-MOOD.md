
  **LE FIL DE DÉMONSTRATION DIT SA PASSION ET SON ENVIE (2026-09-02), ACTIF,
  SANS DRAPEAU.** Remarque d'un testeur après essai réel, rapportée par
  Benjamin : « le contenu général (fake) dans le fil n'est pas assez explicite
  par rapport à la passion et au mood ; il faut que les testeurs comprennent
  bien la différence visuellement. »

  Une seule remarque, deux causes indépendantes — et c'est ce qui compte ici,
  parce que ne corriger que l'une des deux laissait le défaut entier.

  ---

  ## ① La cause visuelle : cinq envies, une seule capsule

  `PASSIO_MOOD_LABELS` distinguait bien les cinq envies par leur libellé
  (💡 Idées · 📚 Apprendre · 🤝 Rencontrer · 😌 Chill · 🌍 Actu), mais
  `.post-mood-tag` les peignait toutes de la même façon : 10 px, graisse 600,
  fond `rgba(250,248,255,.72)`, filet `--border`. Deux cartes voisines ne se
  distinguaient donc **qu'au mot près**, à lire — alors qu'un testeur parcourt
  le fil en diagonale et ne lit pas les pastilles.

  Correctif : `_moodTagHTML` (app-02) pose désormais `data-mood`, et le bloc
  « PASTILLE DE MOOD » de `styles.css` donne une teinte à chaque envie.

  | envie      | valeur en base | jetons              | encre / fond           |
  |------------|----------------|---------------------|------------------------|
  | 💡 Idées      | `creation` | `--mood-create-*` | `#5b21b6` sur `#f1eafe` — 7,7:1 |
  | 📚 Apprendre  | `learn`    | `--mood-learn-*`  | `#1d4ed8` sur `#e7f0fe` — 5,8:1 |
  | 🤝 Rencontrer | `irl`      | `--mood-meet-*`   | `#a83218` sur `#ffede9` — 5,9:1 |
  | 😌 Chill      | `chill`    | `--mood-chill-*`  | `#15683f` sur `#e8f6ee` — 6,1:1 |
  | 🌍 Actu       | `actu`     | `--mood-news-*`   | `#92500a` sur `#fff3dc` — 5,7:1 |

  ⚠️ **`data-mood` n'est posé que sur la branche où `moodTagLabel` a rendu un
  libellé.** Le neutre (`all` — c'est-à-dire TOUS les posts venus de Supabase),
  le mood absent et le mood inconnu ne dessinent toujours **aucune** pastille.
  La couleur ne peut donc pas ressusciter la capsule creuse de 20 × 8 px
  corrigée le 2026-08-29 ; `pastille-mood.spec.js` tient toujours ce bord.

  ⚠️ **Les fonds sont OPAQUES, jamais des `rgba`.** Le contrôle de contraste du
  projet remonte les ancêtres jusqu'au premier fond opaque : une teinte
  translucide serait prise pour une couleur pleine, alpha ignoré, et le rapport
  mesuré ne prouverait rien. Même règle que `--accent-tile` (fiche 05).

  ⚠️ **Le ton chaud de « Rencontrer » est autorisé, et seulement lui.** §5 de la
  direction réserve la couleur chaude au passage au réel — ce qu'est exactement
  cette envie. Il reste hors de tout jeton d'accent général, et il n'est pas
  `var(--v2-coral)` : ce jeton n'existe que sous `.passio-ui-v2`, or la pastille
  doit tenir dans les deux chartes.

  ⚠️ **Ces jetons ne vivent que sur `:root`**, contrairement à `--accent-tile`
  qui est déclaré dans les deux palettes. Ce sont des teintes SÉMANTIQUES (bleu
  = apprendre, vert = chill), étrangères à la famille violette que
  `.passio-ui-v2` remappe : rien à redéclarer, et surtout rien qui doive
  diverger entre les deux chartes.

  ⚠️ **Le bloc CSS est posé AVANT celui d'UI-4A5**, qui reste le dernier de la
  feuille.

  ### ① bis. Et la passion, elle, ne se voyait pas non plus

  La remarque visait « la passion ET le mood ». Or la carte porte la passion de
  la publication **une seule fois** (fiche 11 : la ligne d'identité a été
  retirée de `renderPostHTML` et d'`openPost` en 2026-09-02), et cette unique
  mention partageait le gris `--muted` à 11 px **avec l'heure** : le testeur
  voyait une pastille d'envie colorée à droite, et rien pour la passion à
  gauche.

  `renderPostHTML` et `openPost` enrobent désormais cette mention dans
  `<span class="post-passion-tag">`, rendue en `--accent` et graisse 700.

  ⚠️ **C'est un ENROBAGE, pas une deuxième mention.** Le `textContent` de
  `.post-author-meta` est inchangé à l'octet près — `profil-entete-passions`
  et `refonte-multi-passion` l'assertent tous les deux. La règle de la fiche 11
  tient : une carte ne nomme la passion qu'une fois.

  ⚠️ **Couleur uniforme `--accent`, jamais `passion.color`.** Le catalogue
  contient du `#a78bfa`, qui ne donne que 2,6:1 sur blanc ; l'accent tient
  6,15:1. Colorer chaque passion de sa propre teinte aurait rendu une carte
  sur cinq illisible.

  ---

  ## ② La cause éditoriale : l'étiquette disait autre chose que le texte

  Neuf publications du socle portaient une envie que leur texte contredisait —
  le testeur lisait donc une pastille et un contenu qui ne parlaient pas de la
  même chose. Elles sont **ré-étiquetées, pas réécrites** (la valeur en base
  change, le texte reste) :

  | post | passion | avant | après | ce que disait le texte |
  |------|---------|-------|-------|------------------------|
  | `p10` | yoga | chill | **learn** | une routine en 4 étapes numérotées |
  | `p23` | cuisine | chill | **creation** | 4 essais, puis « je mets la recette » |
  | `p25` | art | chill | **irl** | « atelier ouvert samedi, 4 places, Uzès » |
  | `p40` | musique | chill | **learn** | « Leçon : … » en toutes lettres |
  | `p54` | sport | chill | **learn** | « Retenez ça, surtout les débutants » |
  | `p69` | jeuxvideo | chill | **irl** | « vendredi à Rennes, 8 places, DM » |
  | `pv1` | voyage | chill | **learn** | « Règle n°1 du voyage en solo » |
  | `p19` | tech | creation | **actu** | un « hot take » ne fabrique rien |
  | `p41` | musique | creation | **learn** | un tuto de setup, liste à l'appui |

  Deux textes ont en revanche été **réécrits**, parce que l'étiquette était
  juste et le texte faux :
  - `p18` (jeuxvideo/chill) racontait un record chronométré — que `p68` raconte
    DÉJÀ, en « Idées ». Deux cartes, un seul sujet, deux couleurs : le pire cas
    possible pour qui essaie de comprendre les envies.
  - `p57` (tech/chill) était une lecture du marché, donc de l'actualité.

  ---

  ## ③ Trente-huit publications neuves, écrites comme des EXEMPLES TYPES

  Le bloc « EXEMPLES D'ENVIE » de `js/app-01-diag-seed.js` (p401 → p438) tient
  **une forme par envie**, d'un bout à l'autre :

  - 💡 **Idées** → on FABRIQUE : un état d'avancement, un numéro de version, un
    reste à faire (« Version 12 », « le proto 3 aura la couture soudée »).
  - 📚 **Apprendre** → on TRANSMET : une règle ou trois étapes numérotées,
    réutilisables telles quelles par qui lit.
  - 🤝 **Rencontrer** → on SE DONNE RENDEZ-VOUS : 📍 lieu, 📅 date, nombre de
    places, et une question qui appelle une réponse.
  - 😌 **Chill** → on RACONTE UN MOMENT : aucune leçon, aucune invitation, rien
    à faire après l'avoir lu.
  - 🌍 **Actu** → on RAPPORTE UN FAIT DATÉ : un chiffre, une source, et ce que
    ça change pour la passion.

  Les quinze premières forment **trois séries complètes** — Musique
  (`p401`→`p405`), Photo (`p406`→`p410`), Cuisine (`p411`→`p415`) : les cinq
  envies sur UNE passion. Les vingt-trois suivantes comblent les cases vides du
  tableau passion × envie.

  **Résultat mesuré : 323 publications, et plus AUCUNE case vide** sur les 19
  passions × 5 envies. Avant le lot il en manquait huit (yoga/creation,
  actu/creation, actu/irl, animaux/creation, animaux/actu, mode/chill,
  podcast/chill, moto/actu) : un compte qui cochait l'une de ces paires tombait
  sur un fil vide et concluait que l'application était cassée.

  ⚠️ **Ajoutées EN FIN de tableau.** Trois suites prennent `state.seed.posts[0]`
  sans le choisir ; insérer en tête aurait changé leur sujet en silence.

  ---

  ## ④ Le piège qui a demandé un second tour : le classement ignore le mood

  Premier jet livré, le haut du fil affichait **cinq cartes « 💡 Idées »
  d'affilée**. Le contenu était pourtant complet et coloré : c'est le
  CLASSEMENT qui l'écrasait.

  `feedPostScore` (app-02) vaut `recency * 1.0 + affinity * 0.35 + engagement *
  0.12`. Il **ne contient aucun terme de mood** — et l'engagement plafonne à 3,
  atteint dès ~20 likes, donc partagé par la quasi-totalité du socle. À passion
  et engagement égaux, **c'est la fraîcheur seule qui décide**. Or les
  publications récentes de chaque passion étaient majoritairement des « Idées ».

  Correctif : les trois séries **roulent les cinq envies dans le temps**, avec
  une phase décalée d'une série à l'autre — `hours(0.2)` → `hours(1.98)`, en
  fractions d'heure. Ordre réel obtenu, vérifié au navigateur :

      musique seule  → 💡 Idées · 📚 Apprendre · 🤝 Rencontrer · 😌 Chill · 🌍 Actu
      photo seule    → 📚 Apprendre · 🤝 Rencontrer · 😌 Chill · 🌍 Actu · 💡 Idées
      cuisine seule  → 🤝 Rencontrer · 😌 Chill · 🌍 Actu · 💡 Idées · 📚 Apprendre

  ⚠️ **Les séries doivent rester sous les 2 h.** Au-delà, les publications
  existantes — beaucoup datées de `hours(2)` et `hours(3)` — se glissent au
  milieu du dégradé et le cassent. Toute retouche de ces horodatages doit être
  revérifiée à l'écran, pas déduite.

  ⚠️ **Les commentaires ont suivi.** Recaler un post sans recaler ses
  commentaires les daterait d'AVANT la publication qu'ils commentent.

  ⚠️ **Ne pas « corriger » ça dans le classement.** Ajouter un terme de
  diversité de mood à `feedPostScore` toucherait l'ordre de TOUTES les
  publications réelles pour un problème de contenu de démonstration. Le fil de
  production, lui, n'a pas ce défaut : ses moods viennent de vrais auteurs.

  ---

  ## Verrous

  `tests/e2e/contenu-passion-mood.spec.js` (5 cas) :
  ① les cinq envies ont cinq fonds ET cinq encres **différents deux à deux** —
  un jeton recopié par erreur rendrait deux envies identiques sans rien casser
  d'autre ; ② chacune tient l'AA (4,5:1) mesurée sur son fond opaque effectif ;
  ③ aucune case vide du tableau passion × envie, calculé sur `PASSIONS` et
  `state.seed.posts` ; ④ les trois séries existent, sur une seule passion
  chacune, avec cinq envies distinctes ; ⑤ les exemples « Rencontrer »
  annoncent bien un lieu (📍) et un jour.

  `tests/e2e/pastille-mood.spec.js` (3 cas, inchangé) tient l'autre bord : le
  neutre et le mood inconnu ne dessinent aucune pastille.
