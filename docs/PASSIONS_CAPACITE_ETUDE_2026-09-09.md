# Combien de passions PASSIO peut-il porter ? — étude de capacité (2026-09-09)

> Question de Benjamin : « il n'y a pas assez de passions dans l'app, à peu près
> 2 000 aujourd'hui. Jusqu'à combien peux-tu en mettre ? »
>
> **Réponse courte : le code tient 20 000 sans rien changer d'autre qu'une
> constante. Je recommande de ne jamais dépasser 12 000, et de viser 5 000 au
> prochain chantier. Le vrai plafond n'est pas technique, il est éditorial :
> ce qui manque aujourd'hui ce ne sont pas des lignes, ce sont des ALIAS.**

Tous les chiffres ci-dessous sont MESURÉS, jamais estimés à vue.

---

## 1. L'état réel, aujourd'hui

| Source | Compte |
|---|---|
| `data/passions/*.js` (source) | **1 908** |
| `public.passions` en production, `status='active'` | **1 914** (1 889 `curated` + 19 `legacy` + 6 `user_suggested`) |
| `data/passions-v1.json` (miroir généré) | 154 Ko brut · **37 Ko gzip** (19,9 o/passion) |

Réparti sur 13 fichiers de domaine :

| Domaine | Passions | Racines | Alias / passion |
|---|---:|---:|---:|
| `10-sport` | 240 | 8 | 0,88 |
| `20-scene` | 156 | 3 | 0,66 |
| `30-arts` | 235 | 6 | 0,76 |
| `40-mobilite` | 136 | 3 | 0,77 |
| `45-air-eau` | 50 | 2 | 1,64 |
| `50-techno` | 215 | 5 | 0,96 |
| `60-maison` | 182 | 3 | 0,84 |
| `70-vivant` | 134 | 4 | 0,69 |
| `75-nature-engagement` | 61 | 3 | 1,72 |
| `80-culture` | 218 | 6 | 0,46 |
| `85-savoirs` | 79 | 3 | 1,49 |
| `90-bienetre` | 87 | 2 | 0,56 |
| `95-social` | 115 | 3 | 0,65 |
| **Total** | **1 908** | 51 | **0,83** |

⚠️ **871 passions sur 1 908 (46 %) n'ont AUCUN alias.** C'est la statistique la
plus importante du document — voir §5.

---

## 2. Le serveur n'est pas la contrainte

`public.passions` porte déjà tous les index nécessaires :

```
passions_normalized_idx   btree (normalized_label)
passions_trgm_idx         gin   (normalized_label gin_trgm_ops)
passions_aliases_gin      gin   (aliases)
passions_popularity_idx   btree (popularity desc)
passions_status_idx       btree (status)
```

et la recherche serveur `rechercher_passions(q, lim)` est **appliquée en
production** (score exact → préfixe → alias → sous-chaîne → trigramme, plafonnée
à 50 lignes).

Un `gin_trgm_ops` sur 1 900 lignes et sur 500 000 lignes, c'est le même ordre de
grandeur de latence pour une réponse plafonnée à 50. **Côté base, 100 000
passions ne poseraient aucun problème.** Toutes les contraintes réelles sont
CLIENT.

---

## 3. Les trois plafonds CLIENT, mesurés

### 3.1 Le plafond DUR : 20 000 — et il est silencieux

`chargerReferentielPassions` (app-02) pagine la liste blanche de publication :

```js
var PAS = 1000;
var PAGES_MAX = 20;      // ← 20 × 1000 = 20 000
```

Au-delà de 20 000 passions actives, la boucle s'arrête et publie un Set
TRONQUÉ. `estPassionCanonique` refuse alors à la publication des passions
parfaitement légitimes — **exactement le défaut du 2026-09-09** (« PostgREST
plafonne à `max-rows` »), reproduit un cran plus haut, et tout aussi muet.

C'est une constante : la lever coûte une ligne. Mais lever la constante ne rend
pas le mécanisme sain — voir 3.2.

### 3.2 Le vrai coût caché : la liste blanche se télécharge EN ENTIER, chaque session

`chargerReferentielPassions` télécharge tous les identifiants actifs, en
`ceil(N/1000)` requêtes **séquentielles**. Mesuré sur les données réelles :
**27,1 o/id brut** (11,8 Ko gzip pour 1 908).

| N | Requêtes séquentielles | Transfert brut | Transfert gzip |
|---:|---:|---:|---:|
| 1 908 | 2 | 52 Ko | 12 Ko |
| 5 000 | 5 | 136 Ko | 31 Ko |
| 10 000 | 10 | 271 Ko | 62 Ko |
| 20 000 | 20 | 542 Ko | 124 Ko |

À 10 000, c'est **dix allers-retours en chaîne** à chaque démarrage, pour
reconstruire côté client une vérité que le serveur détient déjà : la clé
étrangère `posts.passion_id` refuse un identifiant inconnu (23503), et
`supaPublishPostWithRetry` traite déjà ce cas comme une erreur définitive avec
un message honnête.

**Recommandation : au-delà de 5 000, remplacer la liste blanche complète par une
vérification à l'unité** (un `select id from passions where id = ? and status='active'`,
mis en cache), ou l'abandonner et s'en remettre au verdict serveur. La liste
locale `PASSIONS` reste le plancher dans les deux cas.

### 3.3 Le poids du référentiel et le coût d'indexation

`data/passions-v1.json` est téléchargé au premier usage réel de la recherche —
**jamais au démarrage** (invariant vérifié par `passions-plates.spec.js` ⑤ et
⑰ bis). Coût réel mesuré : **82,8 o/passion brut**, **≈ 20 o/passion gzip**.

Banc exécuté (Node, CPU serveur ; le facteur téléphone milieu de gamme est
≈ ×5) :

| N | Construction de l'index | Recherche | JSON brut | gzip |
|---:|---:|---:|---:|---:|
| 1 908 | 31 ms (≈ 150 ms tél.) | 0,09 ms | 151 Ko | 36 Ko |
| 5 000 | 51 ms (≈ 260 ms tél.) | 0,15 ms | 410 Ko | 94 Ko |
| 10 000 | 137 ms (≈ 690 ms tél.) | 0,41 ms | 831 Ko | 189 Ko |
| 20 000 | 172 ms (≈ 860 ms tél.) | 0,70 ms | 1 674 Ko | 379 Ko |
| 50 000 | 655 ms (≈ 3,3 s tél.) | 2,39 ms | 4 262 Ko | 952 Ko |

Lecture :

- **La recherche n'est jamais le problème.** L'index par préfixe de 3 lettres
  fait exactement ce que son commentaire annonçait (« à 20 000 un balayage ne
  suffirait plus, l'index se règle maintenant ») : 0,7 ms à 20 000, 2,4 ms à
  50 000. Rien à toucher.
- **Le problème, c'est la construction de l'index** : elle est SYNCHRONE et
  bloque le fil principal une fois, à la première recherche. À 20 000 c'est
  ≈ 0,9 s sur un téléphone milieu de gamme — visible. À 50 000, ≈ 3,3 s :
  inacceptable.
- **Et le téléchargement** : 379 Ko gzip à 20 000, sur un réseau mobile moyen
  c'est ≈ 2 s de plus. ⚠️ `data/passions-v1.json` **n'est pas pré-caché par le
  service worker** (commentaire de `charger()`) : ce coût est repayé après
  chaque déploiement.

---

## 4. Le plafond dont personne ne parle : la fragmentation

PASSIO est un réseau social. **Une passion n'est pas une étiquette, c'est une
PIÈCE.** Une pièce vide est un défaut, pas une richesse.

Il y a 6 comptes en production. Avec 1 908 passions, la probabilité que deux
personnes se croisent sur la même est déjà nulle. Multiplier par cinq ne rend
pas l'app plus riche : ça rend chaque fil plus vide.

Le ressenti « il n'y en a pas assez » ne vient donc **pas** du total. Il vient
d'une frappe qui ne trouve rien — et une frappe qui ne trouve rien, avec
46 % des passions sans alias, c'est très souvent une passion qui EXISTE et que
la recherche n'atteint pas. « jogging » trouve `running` parce que quelqu'un a
écrit l'alias ; « impro » ne trouvera « Improvisation théâtrale » que si
quelqu'un l'écrit aussi.

Trois garde-fous existent déjà et jouent dans le bon sens :

1. **Création depuis l'app** — trois créations offertes par compte, publiables
   tout de suite. La longue traîne se remplit toute seule, par des gens qui
   savent comment ils nomment leur passion. C'est le mécanisme le plus fiable :
   6 passions `user_suggested` en une semaine, sans campagne.
2. **`broader`** relie les entrées fines à leur terme général, invisible, pour
   suggérer sans imposer un passage.
3. **Modération / archivage** retire ce qui ne sert pas, sans rien détruire.

---

## 5. Ce que je recommande

### Trois nombres

| | Nombre | Pourquoi |
|---|---:|---|
| **Plafond dur du code** | **20 000** | `PAGES_MAX × PAS`. Au-delà : refus de publication silencieux. |
| **Plafond produit — ne jamais dépasser** | **12 000** | ≈ 230 Ko gzip, ≈ 0,7 s d'indexation sur téléphone, et surtout : au-delà on fragmente sans rien gagner. |
| **Cible du prochain chantier** | **5 000** | +3 092. Aucun changement d'architecture, aucun compromis de performance, et la couverture devient réellement complète. |

### Pourquoi 5 000 et pas 10 000 tout de suite

À 5 000, tout reste dans l'enveloppe actuelle : 94 Ko gzip, 260 ms d'indexation
sur téléphone, 5 requêtes de liste blanche. **Aucun des trois plafonds du §3
n'est atteint.** C'est le plus grand nombre qu'on puisse livrer sans toucher au
mécanisme, donc sans introduire de risque nouveau.

À 10 000, il faut d'abord traiter 3.2 (liste blanche) et 3.3 (indexation hors
fil principal, pré-cache SW). C'est un chantier technique séparé, à faire quand
le contenu le justifiera — pas avant.

### ⚠️ CORRECTION DU 2026-09-09, APRÈS LA VAGUE 1 — la répartition par domaine était FAUSSE

La première vague a écrit 213 entrées soignées sur `85-savoirs`. **33 existaient
déjà**, sous un autre fichier : philosophie, stoïcisme, éthique et mythologie
sous `interiorite-*` (`75-nature-engagement`) ; géographie, cartographie,
sociologie, psychologie et climatologie sous `sciences-*` (`50-techno`) ;
généalogie, archives, paléographie et héraldique sous `histoire-*`
(`80-culture`).

**Le tableau par domaine du §1 mesurait le DÉCOUPAGE EN FICHIERS, pas la
couverture.** Or chaque fichier du référentiel dit lui-même, en tête, que ce
découpage « ne sort JAMAIS à l'écran » : c'est une commodité de relecture. En
déduire que « `85-savoirs` n'a que 79 entrées, c'est le trou le plus profond »,
c'est lire une carte de fichiers en croyant lire une carte de couverture.

La répartition qui suivait ici (savoirs +321, culture +402, arts +325…) est donc
**retirée**. Elle allouait des lignes à des domaines dont on ne savait pas ce
qu'ils couvraient déjà.

**Ce qui la remplace** : à chaque vague, écrire, laisser
`npm run passions:valider` nommer les collisions, et repointer `broader` sur la
racine EXISTANTE plutôt que d'en créer une parallèle — deux « Philosophie » dans
la recherche, c'est le classement qui tranche au hasard.

**Ce que ça coûte** : ~15 % de redondance sur le premier domaine, et ce taux
monte à mesure que le référentiel se remplit. Compter environ **3 600 entrées
écrites pour 3 000 nettes** sur le reste du parcours vers 5 000.

**Ce que ça ne change pas** : les trois plafonds techniques du §3, ni le chiffre
de 5 000, ni celui de 12 000.

### La règle qui compte plus que le nombre

> **Aucune passion nouvelle sans au moins 2 alias, et rattrapage des 871
> existantes qui n'en ont aucun.**

Passer de 0,83 à 2,0 alias par passion fait plus pour le sentiment de couverture
que les 3 092 lignes elles-mêmes. Une passion qu'on ne trouve pas n'existe pas.
Cette règle doit devenir une **erreur** de `scripts/valider-referentiel-passions.js`,
pas une alerte — sinon elle ne sera pas tenue.

### Les trois gestes techniques, dans l'ordre

1. **Maintenant, avant toute vague** : porter `PAGES_MAX` de 20 à 40 dans
   `chargerReferentielPassions` (marge, pas besoin), et surtout **poser un
   `diagLog` quand la boucle atteint `PAGES_MAX`** — aujourd'hui la troncature
   est parfaitement muette, et c'est ça le défaut, pas la valeur de la constante.
2. **Avec la vague vers 5 000** : exiger 2 alias au validateur ; ajouter
   `data/passions-v1.json` au pré-cache du service worker.
3. **Seulement si on vise au-delà de 5 000** : remplacer la liste blanche
   complète par une vérification à l'unité (§3.2), et sortir la construction de
   l'index du fil principal.

---

---

## 5 bis. Vague 2 (2026-09-10) — le rattrapage des alias est FINI

**Zéro passion sans alias.** 871 entrées enrichies, 1 932 → **3 674 alias**,
moyenne 0,93 → **1,76**. Aucune passion ajoutée, aucun libellé changé : seul le
champ alias bouge.

C'était la recommandation la plus importante du §5, et elle est tenue en entier
— ce qui permet d'en faire une **règle bloquante sans aucune dérogation** :
`scripts/valider-referentiel-passions.js` refuse désormais une passion sans
alias. Une règle assortie d'un socle de 871 exceptions n'aurait jamais été
tenue ; elle aurait normalisé le manquement.

Le seuil est à **deux** alias en ALERTE chiffrée (623 passions n'en ont encore
qu'un), à un en ERREUR. La différence est une question d'honnêteté : on ne pose
en bloquant que ce qui est réellement atteint. Quand l'alerte tombera à zéro,
`PLANCHER_ALIAS` passera à 2 et l'alerte disparaîtra — un objectif laissé en
alerte permanente est un objectif que plus personne ne lit.

### ⚠️ Un défaut du generateur de delta, trouvé en s'en servant

Le delta de la vague 1 était **incomplet, en silence**. Mode `--ids` : il
n'émettait que les passions ABSENTES de la production. Or insérer 180 entrées
au milieu du référentiel **décale le `sort_order` de toutes celles qui
suivent** — 202 lignes se sont retrouvées avec un rang périmé en base (mesuré :
`yoga-hatha` à 1708 en prod contre 1888 dans le dépôt, exactement 180 d'écart).

Et la vague 2 l'aurait rendu total : elle ne crée AUCUNE passion, elle modifie
871 lignes existantes. En mode `--ids`, le générateur rendait « rien à
écrire » — un fichier vide, parfaitement satisfait de lui-même, pendant que la
recherche SERVEUR (`rechercher_passions` lit la colonne `aliases`) serait restée
sur l'ancien état. **Un outil qui ne voit que les ajouts est aveugle à toute
modification.**

Trois corrections, toutes dans `scripts/generer-delta-passions.js` :

1. **Mode `--etat`** : compare une EMPREINTE par ligne (les 8 colonnes que la
   migration écrit, dans le même ordre) et rattrape les modifications. Le delta
   du jour répare aussi, au passage, les 202 rangs périmés de la vague 1.
2. **Les relations ne suivent que les passions vraiment NOUVELLES.** Une passion
   dont on change les alias garde exactement les mêmes liens : les émettre
   produisait 1 984 lignes de `passion_relations` inutiles, 200 Ko de SQL à
   coller pour rien.
3. **Le verdict prouve ce que le delta fait.** Compter les passions actives ne
   dit RIEN d'un delta de modification — le total ne bouge pas d'une ligne quand
   on change 959 jeux d'alias, donc l'ancien verdict aurait affiché « OK » sur
   une base où rien n'aurait été écrit. Il recompte désormais l'empreinte
   attendue contre celle réellement en base, ligne à ligne. Éprouvé : sur des
   empreintes délibérément fausses, il rend bien `ECHEC`.

## 5 ter. Vague 3 (2026-09-10) — l'objectif de 5 000 est ATTEINT

**2 088 → 5 001 passions.** 2 913 entrées nouvelles, 4 350 → **9 100 alias**.
Zéro identifiant d'origine perdu, zéro libellé d'origine modifié (contrôlé
mécaniquement, voir plus bas). Les treize fichiers de domaine ont grossi ;
aucun n'a été refondu.

| Domaine | Avant | Après |
|---|---:|---:|
| `10-sport` | 240 | 574 |
| `20-scene` | 156 | 486 |
| `30-arts` | 235 | 581 |
| `40-mobilite` | 136 | 356 |
| `45-air-eau` | 50 | 137 |
| `50-techno` | 215 | 573 |
| `60-maison` | 182 | 415 |
| `70-vivant` | 134 | 279 |
| `75-nature-engagement` | 61 | 200 |
| `80-culture` | 218 | 447 |
| `85-savoirs` | 259 | 448 |
| `90-bienetre` | 87 | 217 |
| `95-social` | 115 | 288 |
| **Total** | **2 088** | **5 001** |

### ⚠️ Le taux de redondance mesuré : 7 %

Environ **3 125 entrées ont été écrites, 212 retirées** parce que le concept
existait déjà — soit **~7 %** (les 212 sont le décompte des retraits prononcés
au vu des rapports de `passions:valider`, pas une estimation). Ce n'est pas du
gaspillage, c'est le coût normal d'écrire à cette échelle, et il faut le
budgéter : viser 3 000 nouvelles demande d'en rédiger ~3 200.

⚠️ **La vague 1 avait mesuré 15 %** (33 doublons sur 213). L'écart n'est pas une
amélioration de méthode : la vague 1 visait un domaine déjà dense
(`85-savoirs`), la vague 3 a surtout comblé des domaines pauvres — `45-air-eau`
n'avait aucune nage (crawl, brasse, dos, papillon n'existaient nulle part,
alors qu'« apprendre à nager » est une des demandes les plus banales). Le taux
de redondance dit à quel point un domaine est DÉJÀ couvert ; il remontera.

**La moitié de ces collisions étaient INTER-FICHIERS**, et c'est le point qui
compte : « Ornithologie » vivait dans `70-vivant`, « Archéologie » dans
`80-culture`, « Microbiote » dans `90-bienetre`, « Bain de forêt » dans
`90-bienetre`, « Herbier » dans `85-savoirs`. Aucune relecture par domaine ne
pouvait les voir — le découpage en fichiers est une commodité de RELECTURE, pas
une frontière de sens. Seul `passions:valider` les voit, et c'est très
exactement pour cela qu'il existe.

Second enseignement : **un sigle n'appartient à personne.** « OCR » était déjà
l'alias d'une course d'obstacles (`running-course-obstacles`) avant d'être la
reconnaissance de caractères. « VAE » était le vélo à assistance électrique
avant la validation des acquis. « SIG », « JO », « BAFA », « SCOP » : mêmes
télescopages. Un alias en sigle mérite d'être relu deux fois.

### ⚠️ LE DÉFAUT LE PLUS GRAVE DE LA VAGUE, ET IL A ÉTÉ RATTRAPÉ PAR UN CONTRÔLE
### QUI NE CHERCHAIT PAS ÇA

En traitant une collision, le lot de corrections a retiré `finance-salaire`.
Ce n'était PAS une des nouvelles entrées : c'était une entrée **curée**,
présente depuis l'origine, **référencée par `posts.passion_id` en production**.

Le validateur ne l'a pas vue par son libellé ni par son identifiant. Il l'a vue
par la **relation orpheline** qu'elle laissait derrière elle — une autre entrée
pointait vers elle en `broader`. Sans ce contrôle-là, la perte serait passée :
un identifiant absent du référentiel ne lève RIEN. Il rend « ✨ Passion » sur
toutes les publications qui le portent, et le défaut ne se voit qu'à l'écran,
sur du contenu réel, donc après la mise en ligne.

D'où un contrôle ajouté et passé sur la vague entière, qui doit être rejoué à
chaque vague :

```
identifiants d'origine : 2 088 → présents : 2 088   ✅ aucun perdu
                                              ✅ aucun libellé d'origine modifié
```

### ⚠️ POURQUOI LE GÉNÉRATEUR DE DELTA NE SERT PLUS À CETTE VAGUE

`sort_order` est un index **GLOBAL** (`p.sort_order = i + 1` dans
`referentiel-passions.js`). Insérer 2 913 entrées décale donc la valeur de
**presque toutes** les lignes déjà en base. Un delta « ce qui a changé » —
même en mode `--etat`, qui compare une empreinte par ligne — vaudrait alors le
miroir entier. L'outil de la vague 2 reste juste ; il ne répond simplement pas
à ce cas.

La réponse est `scripts/decouper-migration-passions.js` : le miroir (1,45 Mo)
est découpé en **7 parties de ~240 Ko**, collables une par une.

⚠️ **Le découpage change une GARANTIE, et il faut le dire** : le miroir entier
est un `begin; … commit;` unique — tout ou rien. Découpé, chaque partie est sa
propre transaction, donc un échec à la partie 4 laisse les parties 1 à 3
appliquées. Ce n'est acceptable QUE parce que le miroir est additif et
idempotent (`on conflict do update`, protection de `status='archived'` et de
`source='legacy'`) : reprendre à la partie qui a échoué suffit.

⚠️ **Un découpeur qui perd une instruction en silence est pire que pas de
découpeur** — on croirait avoir tout appliqué. Deux contrôles, à deux niveaux :

- le script réassemble ses parties et compare la liste d'instructions à celle
  du fichier d'origine (contrôle sur le TEXTE) ;
- `tests/sql/decoupage-migration-passions.test.sh` (gate CI) **exécute** les
  deux chemins sur deux bases PostgreSQL jetables et compare l'**empreinte
  ligne à ligne** du résultat. Une instruction peut être intacte au texte et le
  découpage faux à l'exécution.

Mesuré : les 7 parties rendent une base à l'empreinte **identique** au fichier
entier (5 001 passions, mêmes relations, `rechercher_passions('jogging')` rend
toujours `running`), le rejeu ne change rien, et la partie 2 appliquée seule
**échoue** au lieu de laisser une base à moitié faite.

### Ce que la vague 3 ne règle pas

- **1 021 passions n'ont encore qu'UN alias** (c'était 623 avant la vague : les
  nouvelles entrées en portent deux, mais toutes n'y arrivent pas). Le plancher
  reste à 1, la cible à 2. `PLANCHER_ALIAS` ne passera à 2 que quand l'alerte
  sera à zéro.
- **Le référentiel servi passe de 154 Ko à 568 Ko** (bruts). L'invariant tient —
  il n'est jamais chargé au démarrage — mais il devient **plus cher à
  enfreindre**, pas moins. Les commentaires qui citaient « 160 Ko » ont été
  corrigés dans le code vivant ; ceux des documents d'époque ont été laissés,
  ce sont des mesures datées.
- **Le prochain palier n'est pas un nombre, c'est une mesure d'usage.** Le §6
  ci-dessous vaut plus que jamais : avant d'écrire une vague 4, il faut lire ce
  que les gens cherchent réellement et ne trouvent pas.

## 6. Ce que cette étude ne dit pas

- Elle ne mesure pas quelles frappes échouent réellement en production. La
  table des demandes (`passions:demandes`) et la télémétrie de la page
  « Rechercher » le diraient, et **c'est la seule donnée qui pourrait
  contredire la répartition du §5**. À regarder avant d'écrire les 3 092 lignes.
- Le banc de scalabilité duplique les entrées réelles pour atteindre 50 000 : le
  gzip y est donc optimiste et les seaux de préfixes pessimistes. Les colonnes
  « brut » et « recherche » restent fiables ; la colonne gzip aux grands N est à
  lire comme une borne basse.

