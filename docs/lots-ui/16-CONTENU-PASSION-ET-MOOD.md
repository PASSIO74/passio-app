
  **LE FIL DE DÉMONSTRATION DIT SA PASSION ET SON ENVIE (2026-09-02), ACTIF,
  SANS DRAPEAU.** Remarque d'un testeur après essai réel, rapportée par
  Benjamin : « le contenu général (fake) dans le fil n'est pas assez explicite
  par rapport à la passion et au mood ; il faut que les testeurs comprennent
  bien la différence visuellement. »

  Puis, en relisant le premier jet : « attention il n'y a plus les mood chill
  etc., il reste que explorer / apprendre / idée / rencontrer », « du coup
  recrée du contenu en lien avec les nouveaux mood », et « mets plus de contenu
  (rencontre) avec le lien en bas voir l'activité ».

  Une seule remarque au départ, **trois** causes indépendantes à l'arrivée — et
  c'est ce qui compte ici, parce que n'en corriger qu'une laissait le défaut
  entier. La deuxième correction de Benjamin a d'ailleurs invalidé une partie du
  premier jet : j'avais donné deux belles couleurs à un vocabulaire mort.

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
  | *(neutre)*    | `all`      | —                 | aucune pastille |

  ⚠️ **TROIS pastilles, et c'est le PRODUIT qui les compte.** Le Studio ne
  propose que 💡 Idées · 📚 Apprendre · 🤝 Rencontrer · ✨ Tous depuis le
  2026-08-29. La quatrième intention du rail, **« Explorer », n'aura jamais de
  pastille** : elle se calcule côté LECTEUR (auteur non suivi, passion non
  cochée) et ne regarde jamais le mood — lui en donner une la rendrait
  décorative, donc mensongère.

  ⚠️ **Un repli est posé sur le sélecteur générique `[data-mood]`.** Il attrape
  TOUTE valeur, alors que trois seulement ont une couleur : sans lui, une
  quatrième envie sortirait plus grosse et plus grasse dans l'ANCIENNE capsule
  grise translucide — un état intermédiaire que personne n'aurait dessiné.

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

  ## ① ter. La cause qu'on n'avait pas vue : deux envies étaient MORTES

  Le premier jet a donné une couleur à **cinq** envies. Benjamin a corrigé :
  « il n'y a plus les mood chill etc., il reste que explorer / apprendre / idée
  / rencontrer ». Vérification faite, il avait raison depuis le 2026-08-29 :
  `studio-moods.spec.js` ② affirme déjà que « chill » et « actu » **ne sont plus
  proposés** au composer. Ils gardaient pourtant un libellé, donc une pastille.
  Le fil remettait sous les yeux du testeur deux mots introuvables ailleurs dans
  le produit — et j'avais aggravé le défaut en les rendant plus visibles.

  ### AFFICHER et ADMETTRE sont deux choses

  C'est le piège du lot, et il ne se voit pas d'une relecture.
  `PASSIO_MOOD_LABELS` servait à **deux usages sans rapport** :

  1. **nommer** une envie sur une carte (`moodTagLabel`, `moodShortLabel`) ;
  2. **admettre** une valeur de `posts.mood` dans le repli d'exploration
     (`moodsAffichables`, app-02).

  Retirer « chill » et « actu » de cette table unique aurait donc fait
  **disparaître du fil des milliers de publications RÉELLES** déjà en base — un
  changement de vocabulaire qui efface du contenu. Les deux usages sont scindés :

  ```js
  var PASSIO_MOOD_LABELS = { creation, learn, irl };          // ce qui s'AFFICHE
  var PASSIO_MOODS_ADMIS = { …labels, chill: 1, actu: 1 };     // ce qui a le DROIT d'exister
  ```

  Conséquence voulue : une publication « chill » se comporte **exactement comme
  le neutre `all`** — elle entre dans le fil, elle entre dans l'exploration, et
  elle ne porte aucune pastille.

  ⚠️ **`legacyMoodToFeedIntent` n'a PAS été touchée** : elle rendait déjà
  « generic » pour ces deux valeurs. Elles ne satisfaisaient donc **aucune** des
  envies du rail bien avant ce lot — le produit avait tranché avant l'affichage.

  ⚠️ **NE PAS confondre le MOOD « actu », mort, et la PASSION « actu »**
  (Actualité 🌍), l'une des 19 du catalogue, parfaitement vivante.

  ### Les survivants du vocabulaire mort

  - `js/app-05-config-profil.js` : `mood: reel.mood || "chill"`. **Repartager
    une bobine écrivait une valeur morte dans `posts.mood`, en production, à
    chaque partage.** Corrigé en `all`.
  - **Sept publications reliées à une activité** (elles portent donc
    « Voir l'activité ») étaient étiquetées « Chill », « Idées » ou
    « Apprendre » : `p_ev_yoga`, `p_ev_ceramique`, `p_ev_ia`, `p_ev_danse`,
    `p_ev_livre`, `reel_seed_sport_skate_1`, `reel_seed_musique_1`. Une carte
    qui ouvre un rendez-vous doit dire qu'elle invite — récrites en
    « Rencontrer », lieu et jour en première ligne.
  - **Quatre publications désignaient des personas SANS ACCENT** (`u_ines`,
    `u_anais`, `u_chloe`) qui n'existent pas : `userById` rendait null et la
    carte sortait avec « ? » comme auteur. Défaut **préexistant**, visible en
    production, trouvé en vérifiant l'intégrité du socle.
  - Le **rail historique masqué** `#moodSelector` (index.html) propose encore
    Chill et Actu. Il est **volontairement laissé tel quel** : c'est la roue de
    secours du kill switch `passio_feed_intents_v1="0"`, que la fiche 07 exige
    gelée à l'octet près. À rouvrir si le kill switch doit suivre les quatre
    envies.

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

  ## ③ Le corpus est REFAIT sur les envies vivantes

  « Du coup recrée du contenu en lien avec les nouveaux mood. » Il ne s'agissait
  plus de compléter, mais de **reprendre les 116 publications** qui portaient une
  envie morte. Elles ont été **réécrites**, pas ré-étiquetées : le texte change,
  parce qu'une anecdote tranquille ne devient pas une invitation en changeant
  d'étiquette — c'est précisément le mensonge que le testeur avait vu.

  Le travail a été mené par un workflow de 40 agents : **écriture** par lots de
  huit, puis **contestation adversariale** de chaque lot par un sceptique chargé
  de refuser (et de corriger lui-même) tout texte dont la forme ne prouve pas
  l'envie. Répartition obtenue après contestation : **50 Rencontrer, 30
  Apprendre, 22 Idées, 14 neutres**.

  La forme tenue, une par envie — c'est elle qui permet au testeur de
  reconnaître l'envie **avant** de regarder la pastille :

  - 💡 **Idées** → on FABRIQUE : un numéro de version, une contrainte
    matérielle, un reste-à-faire (« Onzième version de l'écran d'accueil »,
    « six images gardées sur trois pellicules »).
  - 📚 **Apprendre** → on TRANSMET : une règle nommée puis des étapes
    numérotées, applicables demain (« Ma règle des 20 minutes, celle que je
    répète en cabinet »).
  - 🤝 **Rencontrer** → on SE DONNE RENDEZ-VOUS : ligne
    « 📍 lieu — 📅 jour heure », ce qui se passe, les places, un appel à réponse.
  - *(neutre)* → un moment : aucune leçon, aucune invitation, rien à faire
    après l'avoir lu.

  **Zéro publication porte encore une envie morte**, et aucune case du tableau
  passion × envie n'est vide sur les trois envies vivantes.

  ---

  ## ③ bis. « Voir l'activité » : 105 cartes au lieu de 9

  « Mets plus de contenu (rencontre) avec le lien en bas voir l'activité. »

  Ce lien n'est pas décoratif et ne se pose pas à la main : c'est **`eventId`**,
  et lui seul, qui le déclenche. `refEvenement` (`js/ui-v3-passerelle.js`) le
  lit, puis `decorerActivite` ne pose le lien **que si `trouverEvenement`
  retrouve la fiche**. Une publication sans `eventId` reçoit le CTA générique
  « Trouver une activité » ; une publication reliée reçoit « Voir l'activité »,
  qui ouvre la fiche existante.

  ⚠️ **Un identifiant fantaisiste ne casse rien — il ne peint simplement
  RIEN.** C'est le pire cas pour du contenu de démonstration : le lien manque
  sans que personne ne le sache. D'où le verrou ② quater.

  **66 publications neuves**, deux par activité pour les 36 activités du socle,
  et jamais le même auteur sur la paire : celle qui **organise** et annonce, puis
  celle qui **y va** et donne envie autrement. Avec les sept cartes recousues,
  le socle passe de 9 à **105 publications reliées**, couvrant les 36 activités.

  Le socle compte désormais **389 publications** (contre 323).

  ⚠️ **Prix payé, assumé et mesuré** : « Rencontrer » pèse maintenant **50 % du
  socle** (196 sur 389), et jusqu'à 70 % sur `sport`. C'est la conséquence
  arithmétique d'un étiquetage honnête — un texte qui annonce un lieu, un jour et
  des places EST une invitation — combinée au quota de réécriture demandé aux
  agents. Le dégradé de tête (§④) reste la contre-mesure : quelle que soit la
  passion cochée, les quatre premières cartes montrent quatre envies différentes.
  Si le fil devait paraître monotone, le levier est le quota de réécriture, pas
  le ré-étiquetage — remettre un mensonge sur une carte serait revenir au défaut
  d'origine.

  ⚠️ **Ajoutées EN FIN de tableau** : trois suites prennent
  `state.seed.posts[0]` sans le choisir.

  ## ④ Le piège qui a demandé un second tour : le classement ignore le mood

  Premier jet livré, le haut du fil affichait **cinq cartes « 💡 Idées »
  d'affilée**. Le contenu était pourtant complet et coloré : c'est le
  CLASSEMENT qui l'écrasait.

  `feedPostScore` (app-02) vaut `recency * 1.0 + affinity * 0.35 + engagement *
  0.12`. Il **ne contient aucun terme de mood** — et l'engagement plafonne à 3,
  atteint dès ~20 likes, donc partagé par la quasi-totalité du socle. À passion
  et engagement égaux, **c'est la fraîcheur seule qui décide**. Or les
  publications récentes de chaque passion étaient majoritairement des « Idées ».

  Correctif : les trois séries **roulent les envies dans le temps** —
  `hours(0.2)` → `hours(1.98)`, en fractions d'heure. Chaque série tient la même
  partition, qui est celle du produit après le passage à quatre intentions :

      💡 Idées · 📚 Apprendre · 🤝 Rencontrer · 🤝 Rencontrer (reliée) · neutre

  La quatrième carte porte un `eventId` réel : c'est elle qui montre
  « Voir l'activité » au testeur, dès le premier écran. Ordre réel obtenu,
  vérifié au navigateur avec la seule passion « musique » cochée :

      1. 💡 Idées        ⟶ Trouver une activité
      2. 📚 Apprendre    ⟶ Trouver une activité
      3. 🤝 Rencontrer   ⟶ Trouver une activité
      4. 🤝 Rencontrer   ⟶ Voir l'activité        (jam de Léa, e1)
      5. (aucune pastille — le neutre)

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

  `tests/e2e/contenu-passion-mood.spec.js` (8 cas) :
  ① les trois envies ont trois fonds ET trois encres **différents deux à deux** —
  un jeton recopié par erreur rendrait deux envies identiques sans rien casser
  d'autre ; ① bis chacune tient l'AA (4,5:1) mesurée sur son fond opaque
  effectif ; ① ter la **passion** est lisible, nommée **une seule fois**, et son
  texte rendu est inchangé ; ② aucune case vide du tableau passion × envie sur
  les trois envies vivantes ; ② bis les trois séries tiennent la partition
  `creation · learn · irl · irl · all`, avec **exactement une** carte reliée ;
  ② quater **chaque publication reliée pointe vers une activité réellement
  présente** et porte bien « Rencontrer » ; ② ter les exemples « Rencontrer »
  annoncent un lieu et un jour ; ③ les valeurs léguées ne dessinent **aucune**
  pastille.

  `tests/e2e/studio-moods.spec.js` — assertion **retournée** (`chill` et `actu`
  rendent `""`), plus un cas neuf : « perdre son libellé ne fait pas perdre son
  droit d'exister » (les deux tables, comparées).

  `tests/e2e/exploration-moods.spec.js` — renommé et **renforcé** : les valeurs
  léguées entrent toujours dans le repli, et n'y portent aucune pastille.

  `tests/e2e/pastille-mood.spec.js` (3 cas, inchangé) tient l'autre bord : le
  neutre et le mood inconnu ne dessinent aucune pastille.

  ---

  ## ⑤ Trois défauts trouvés par l'audit adversarial, dont un en production

  Le lot a été relu par un auditeur indépendant qui a **rejoué les suites en A/B
  isolé** (avant / après). Trois trouvailles méritent d'être retenues, parce
  qu'aucune ne se voyait à la relecture.

  ① **Un compteur faux qui survit — défaut PRODUIT, pas de fixture.**
  `renderFeed` peint 12 cartes puis complète le reste en `requestIdleCallback`,
  **depuis `visible`, un instantané figé** dont les posts sont des copies
  (`allFeedPosts` fait `{...p}`). Un like optimiste **annulé** par un refus
  serveur laissait donc « 🤍 5 » : le cœur relu en direct, le nombre figé à sa
  valeur optimiste. Les cartes du premier lot sont rattrapées par la retouche en
  place ; **celles au-delà de la douzième n'existaient pas encore**, donc rien ne
  pouvait les corriger — et le faux compteur survivait jusqu'au rendu suivant.
  Mon contenu n'a pas créé ce défaut, il l'a rendu **atteignable** en poussant le
  fixture du test de la 9ᵉ à la 14ᵉ place. Correctif : `_feedCompteursFrais`
  relit les compteurs volatils sur l'objet canonique (`findPostAnywhere`) sans
  toucher au classement — re-classer ferait sauter les cartes sous le doigt.

  ② **Deux tests reposaient sur un ACCIDENT du socle.** Trois cas de
  `feed-premier-rendu.spec.js` tenaient parce que la case « yoga × creation »
  était vide — ce n'était écrit nulle part. Le jour où le socle l'a comblée
  (délibérément : un compte qui cochait yoga + Idées tombait sur un fil vide),
  les trois sont devenus rouges **sans qu'aucun comportement ne change**. La
  prémisse appartient au fixture : `viderPassionEnvie(page, "yoga", "creation")`
  la pose désormais explicitement.

  ③ **Un fixture que la production disputait.** `feed-malformed-post.spec.js`
  ne vidait pas `state.seed.posts` avant de semer : `renderFeed` ne peignant que
  20 cartes, cinq publications neuves et très aimées ont suffi à pousser
  `valid2` hors du lot peint. C'est le piège de la fiche 06, à la lettre.

  ⚠️ **La leçon commune aux trois : un test vert peut l'être pour une raison
  qui n'est pas la sienne.** Aucun de ces trois-là ne mesurait ce qu'il croyait.
