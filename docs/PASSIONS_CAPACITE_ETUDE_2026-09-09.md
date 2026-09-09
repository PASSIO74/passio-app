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

## 6. Ce que cette étude ne dit pas

- Elle ne mesure pas quelles frappes échouent réellement en production. La
  table des demandes (`passions:demandes`) et la télémétrie de la page
  « Rechercher » le diraient, et **c'est la seule donnée qui pourrait
  contredire la répartition du §5**. À regarder avant d'écrire les 3 092 lignes.
- Le banc de scalabilité duplique les entrées réelles pour atteindre 50 000 : le
  gzip y est donc optimiste et les seaux de préfixes pessimistes. Les colonnes
  « brut » et « recherche » restent fiables ; la colonne gzip aux grands N est à
  lire comme une borne basse.

