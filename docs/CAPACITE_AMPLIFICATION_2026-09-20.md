# L'amplification — ce qui borne PASSIO maintenant (2026-09-20)

> Suite directe de `docs/CAPACITE_SANS_INVESTIR_2026-09-19.md`, et réponse à
> « trouve des solutions pour augmenter encore plus les capacités du nombre
> d'utilisateurs sans investissement ».
>
> **Réponse courte** : le mur n'est plus la lecture (2 000 à 4 000 connectés
> tenus, mesuré le 14/09), ni le stockage, ni la télémétrie — tous réglés le
> 19/09. C'est **l'AMPLIFICATION** : une écriture qui se transforme en N
> lectures, et une frappe de clavier qui coûte cent fois ce qu'elle devrait.
> Tout ce qui suit est gratuit.

---

## 1. La mesure qui change le cadrage

Première lecture du **temps CPU réel** de la base (`pg_stat_statements`,
cumulé depuis le 2026-05-13, soit 129 jours — canal ① d'ADR-012).

| Part du CPU | Requête | Appels | Moyenne |
|---|---|---|---|
| **66,1 %** | décodage WAL de Realtime (`realtime.apply_rls`) | 6 811 145 | 7,1 ms |
| 6,7 % | lecture `telemetry_events` (pilotage + veille) | 97 337 | 50,2 ms |
| 5,8 % | `passions` id/status paginé (référentiel canonique) | 2 847 316 | 1,5 ms |
| 2,9 % | décodage WAL de Realtime (second rôle) | 354 568 | 5,9 ms |
| **2,3 %** | **`rpc/rechercher_passions`** | 18 185 | **92,2 ms** |

**Le temps réel pèse 69 % du CPU de la base, avec DIX comptes.** Et son coût
est en **O(changements × clients abonnés)** : il ne grandit pas avec l'usage,
il grandit avec l'usage **multiplié par** le nombre de personnes en ligne.
C'est la seule forme quadratique du produit, donc la seule qui décide si
2 000 connectés tiennent.

### Le facteur d'amplification, mesuré et non déduit

La même vue donne `rows / calls` = **1,03** sur le décodage WAL : ce ne sont
pas des sondages à vide, **chaque appel rend une ligne réelle**. Or les tables
publiques n'ont connu qu'environ **550 000 changements de lignes** sur la
période (insertions + mises à jour + suppressions, `pg_stat_user_tables`),
pour **7,17 millions de lignes décodées et vérifiées par la RLS**.

**×13.** Ce facteur n'est pas une constante de Supabase : c'est le nombre
d'abonnements concurrents qui ont matché chaque changement. Avec dix comptes
et douze souscriptions sans filtre par client, il vaut treize. Il vaut ce
qu'on lui donne — **c'est la définition opérationnelle du mur**.

⚠️ **Ce que cette mesure ne dit pas, et qu'il ne faut pas lui faire dire** :
elle est CUMULÉE sur 129 jours et précède donc le nettoyage de la publication
realtime du 19/09 (25 tables → 12). Elle dit où est le poids et quel est le
facteur, pas ce qu'il reste exactement après ce nettoyage.

### Les compteurs de tables, qui désignent les coupables

| Table | Lignes vivantes | Balayages séquentiels | Tuples lus |
|---|---|---|---|
| `profiles` | **9** | **18 964 110** | **132 550 791** |
| `follows` | 8 | 820 671 | 6 141 226 |
| `conv_members` | 11 | 723 854 | 4 891 799 |
| `video_lives` | **21** | **223 315** | 4 585 823 |

Dix-neuf millions de balayages sur une table de neuf lignes n'est pas un
problème d'index — un balayage de neuf lignes est gratuit. C'est un problème
de **nombre de requêtes** : dix-neuf millions de requêtes ont touché cette
table. Il fallait trouver qui les émet.

---

## 2. ⑥ La recherche : les deux premières lettres coûtaient 97 % du mot

`rechercher_passions` est la requête la plus lente du produit — **92,2 ms de
moyenne**. La migration du 15/09 avait pourtant fait le travail : la colonne
`recherche`, les deux index GIN trigramme, et ils **sont bien utilisés**
(`passions_recherche_trgm` : 4 770 lectures ; le plan rend un `BitmapOr` en
0,4 ms sur « ski »).

⚠️ **ET MA PREMIÈRE ENQUÊTE A CONCLU LE CONTRAIRE, À TORT.** Un `EXPLAIN` où
j'avais *simplifié* l'`ORDER BY` en retirant l'expression de score montrait un
balayage complet (`Rows Removed by Filter: 4988`) et un index jamais lu. La
simplification changeait le plan : c'est elle qui fabriquait le défaut.
**Une requête simplifiée pour la lisibilité n'est plus la requête qu'on mesure.**

La vraie cause est ailleurs, et le chronomètre la donne (production, cinq
répétitions à chaud) :

| Longueur de la frappe | Durée |
|---|---|
| **1 lettre** | **80 à 133 ms** |
| **2 lettres** | **15 à 51 ms** |
| 3 lettres | 0,6 à 8,5 ms |
| 4 et plus | 0,4 à 2,9 ms |

⚠️ **Et ma deuxième explication était fausse aussi.** J'ai d'abord écrit
« pg_trgm ne peut extraire aucun trigramme sous trois caractères, l'index
décroche ». C'est une vraie propriété de pg_trgm, mais **ce n'est pas ce qui
mord ici** — `audit-passio` a demandé la mesure, et le plan de production pour
`q = 'a'` la donne :

```
Seq Scan on passions   rows=4626   (Rows Removed by Filter: 383)
  SubPlan 1  Function Scan on unnest   loops=4263
  SubPlan 2  Function Scan on unnest   loops=4263
Execution Time: 297 ms
```

`recherche like '%a%'` matche **92 % du catalogue** : le balayage est le BON
plan. Ce qui coûte, c'est **l'expression de score** — deux `unnest(aliases)` +
`unaccent_immutable` par ligne retenue, soit 4 263 fois deux — puis le tri.
Un index parfait n'y changerait rien : il faudrait quand même noter 4 626
lignes. **On ne répare pas ça avec un index, on cesse de poser la question.**

Comme la recherche part à **chaque frappe** (anti-rebond 160 ms), tout mot tapé
traversait d'abord son pire cas :

| Mot tapé | Coût total | Dont 2 premières lettres |
|---|---|---|
| guitare | 109,4 ms | 106,2 ms — **97 %** |
| escalade | 238,5 ms | 228,1 ms — **96 %** |
| randonnée | 234,1 ms | 213,9 ms — **91 %** |
| céramique | 156,9 ms | 141,2 ms — **90 %** |
| photographie | 136,5 ms | 111,0 ms — **81 %** |

**Le correctif : on ne demande rien au serveur sous trois caractères.**

⚠️ **On ne perd rien, et c'est ce qui rend le plancher acceptable.** La
recherche LOCALE (index par préfixe sur les 5 001 entrées et leurs alias)
répond déjà à ces frappes, immédiatement et hors ligne, et `chercherAsync`
rend le local tel quel dès que le serveur ne complète pas. Le serveur
n'apporte que la sous-chaîne au milieu d'un mot et le flou — deux choses qui
n'ont aucun sens sur une ou deux lettres.

⚠️ **Les quatre passions à nom court restent trouvables** — mesuré en base,
C++, C#, Go et DJ sont les SEULES dont le libellé normalisé fait moins de
trois caractères, sur 5 009. L'index local les rend par **préfixe**, qui est
justement la bonne réponse à « dj ». Ne pas « réparer » ce plancher en le
descendant à 2 pour elles.

⚠️ **Il n'y a pas de repli serveur moins cher, mesuré aussi** : une recherche
par préfixe (`normalized_label like 'a%'` + alias) coûte **68 à 75 ms** — la
base est en collation `en_US.UTF-8`, où un btree ne sert pas un `LIKE 'x%'`,
et `unaccent_immutable` est appelée par alias et par ligne. **Le bon geste
n'est pas de chercher autrement, c'est de ne pas demander.**

⚠️ **Et la mesure de capacité du 14/09 n'avait jamais vu ce cas** :
`scripts/charge.mjs` interroge le RPC avec `q: "rando"` — cinq lettres, donc
le chemin rapide. Un banc de charge qui n'exerce que le cas favorable mesure
la capacité du cas favorable.

---

## 3. ⑦ Un événement reçu déclenchait une requête chez CHAQUE connecté

Les gestionnaires temps réel de `posts` et de `post_comments` faisaient, à la
réception :

```js
const { data: prof } = await supa.from("profiles").select("username,emoji,color")…
```

L'événement est poussé à **tous** les connectés. Une seule publication
coûtait donc **N requêtes** à la base, une par personne en ligne. À 2 000
connectés, une publication = 2 000 requêtes. C'est la forme quadratique, et
elle ne se voyait pas parce que chaque requête prise isolément est minuscule.

⚠️ **MAIS CE N'EST PAS L'ORIGINE DES 19 MILLIONS DE BALAYAGES, et je l'ai
d'abord écrit.** `audit-passio` l'a relevé, et le schéma de production le
confirme. Deux faits le démentent : ① sur une table de neuf lignes PostgreSQL
balaie pour **toute** requête, donc ce compteur totalise toutes les lectures de
`profiles`, quelle qu'en soit l'origine (132 550 791 / 18 964 110 = 6,99 tuples
par balayage — « table entière, chaque fois ») ; ② la policy SELECT de `posts`
porte `NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = posts.author_id AND
pr.is_private = true)`, donc **un balayage par ligne évaluée**, et
`startFeedRefreshLoop` rejoue `supaLoadPosts()` toutes les 60 s chez chaque
client visible — environ **86 400 balayages par jour et par onglet ouvert**.

**Le producteur dominant est là, et ce lot n'y touche pas.** Attribuer un gros
chiffre au défaut qu'on vient de corriger fait croire à la session suivante que
le poste est réglé : c'est « une fiche qui décrit un défaut déjà refermé coûte
autant qu'une fiche qui en tait un », en version inverse. Le correctif reste
juste **pour sa propre raison** — le coût en O(connectés) est réel et grandit
avec le succès — mais il ne vaut pas le chiffre que je lui avais prêté.

⚠️ **Le cache existait depuis toujours et personne ne le consultait ici.**
`cacheRemoteProfile` écrit dans `state.seed.users`, `userById` le lit, et
c'est déjà cette source que le fil, les commentaires et la messagerie
peignent **partout ailleurs**. La requête réseau était l'exception, pas la
règle : on ne « met pas en cache », on **cesse de contourner le cache**.

⚠️ **Et on ne crée pas une troisième autorité de cache** : `_fetchProfile`
(app-04) fait déjà « un profil sans réseau », avec son propre `Map`, et il lit
`{ error }` — il refuse de mettre en cache un repli anonyme obtenu sur une
coupure, défaut qu'il a déjà payé. `_profilAuteur` lui délègue au lieu de
recopier.

⚠️ **La fraîcheur ne baisse pas *tant que le canal est joint*** : l'abonnement
`profiles` UPDATE du même canal rafraîchit ce cache en direct. La nuance compte
— `postgres_changes` ne rejoue rien après une coupure, et le canal est rejoint
**après** le premier `supaLoadPosts()` : un renommage tombé dans cet intervalle
ne sera pas vu de la session (bornée : `state.seed` n'est pas persisté).

⚠️ **Le manque est INSCRIT** : un auteur absent du cache est demandé une fois
puis mémorisé, sinon la publication suivante du même auteur repaierait la
même requête, chez tout le monde.

---

## 4. ⑧ Un changement de live rechargeait la liste chez chacun, N fois

L'abonnement `*` appelait `supaRefreshVideoLives()` — donc une vraie requête —
à chaque événement reçu, chez chaque connecté.

⚠️ **ET MON PREMIER REMÈDE ÉTAIT LE MAUVAIS.** J'avais posé un débounce de
250 ms en écrivant « un seul live produit plusieurs événements d'affilée ».
C'est faux, et les chiffres que je citais le démentaient déjà : 2 089 INSERT,
2 414 UPDATE, 2 068 DELETE, soit **~1,16 UPDATE par live** — des événements
espacés par la durée du live, jamais une rafale. Surtout, l'hôte d'un live
envoie un UPDATE `last_seen` **toutes les 25 secondes**. 25 000 ms ≫ 250 ms :
aucun de ces événements n'était coalescé. Un live d'une heure = 144 battements
× N connectés, avant comme après. **Un débounce ne coalesce que ce qui arrive
groupé ; il faut regarder ce que la production produit vraiment avant de
choisir la forme du remède.**

**Le vrai geste : ne pas recharger pour un événement qui ne change rien à
l'écran.** `supaRefreshVideoLives` calcule déjà sa signature de visibilité —
`id + status` — mais **après** avoir payé la requête. On la prend avant : une
mise à jour dont l'identifiant est déjà connu au même statut est un battement
de cœur, et il n'y a rien à redemander.

⚠️ **On ne saute que ce cas-là** : insertion, suppression, identifiant inconnu
ou statut différent repassent par la requête. Un événement qu'on ne sait pas
lire est un événement qu'on honore.

⚠️ **Un live qui cesse de battre disparaît toujours** : `supaLoadVideoLives`
filtre sur `last_seen` et le filet de 60 s le purge. Sauter le battement ne
prolonge aucune bulle morte.

La coalescence reste par-dessus, pour ce qui arrive réellement groupé
(plusieurs lives qui démarrent ensemble, la reprise après un retour à l'écran).

⚠️ **Rien ne part d'une page masquée** — la réponse ne peut rien peindre, et
WebKit coupe de toute façon les requêtes en vol au passage en arrière-plan.
Le rendez-vous est **reporté, pas annulé** : `visibilitychange` **et
`pageshow`** le rejouent. Sans ce rattrapage, on aurait remplacé « trop de
requêtes » par « une bulle éteinte ». ⚠️ La première rédaction **nommait**
`pageshow` sans jamais l'écouter — sur iOS, un retour depuis le bfcache émet
`pageshow` sans forcément `visibilitychange`. **Un commentaire qui promet une
couverture qu'il n'a pas est pire qu'un trou : on croit le cas traité.**

---

## 5. ⑨ `conv_members` : O(N) pour un événement qui concerne UNE personne

Le gestionnaire jetait à sa **première ligne** tout ce qui n'était pas
`user_id === MY_UID`. Un `filter: user_id=eq.${MY_UID}` côté serveur est
exactement équivalent, et c'est le geste déjà posé sur `notifications`, la
seule souscription du canal qui en portait un.

⚠️ **Mais ce qu'il évite est l'ÉVALUATION, pas la livraison — et j'avais écrit
l'inverse.** La policy `conv_members_select_member` est
`is_conv_member(conv_id, auth.uid())` : Realtime ne **livrait** la ligne qu'aux
membres de cette conversation, deux personnes pour un 1:1. Ce qui coûtait en
O(N abonnés), c'est la **décision** : pour savoir à qui livrer, Realtime appelle
`is_conv_member` (SECURITY DEFINER) une fois par abonnement et par ligne. Un
filtre de colonne est tranché avant, sans toucher à la base. Le gain est réel
mais d'un autre ordre que celui annoncé — et le dire juste évite que le prochain
lot cherche un « O(N) livraisons » sur `conv_reads` ou `comment_interactions`,
où le raisonnement serait tout aussi faux : mêmes policies de membre.

⚠️ **La garde client reste**, mais pas pour la raison que j'avais donnée. Si
`MY_UID` changeait, c'est le **filtre** qui deviendrait périmé et jetterait
silencieusement les événements de la nouvelle identité — aucune garde client ne
rattrape ce qui n'arrive jamais. La vraie règle est : **ce filtre doit être
refait quand `MY_UID` change**, ce que personne ne fait aujourd'hui, ni ici ni
pour `notifications`. La garde client, elle, reste parce qu'un filtre Realtime
est une optimisation de transport, jamais une frontière de sécurité.

---

## 6. Ce qui reste ouvert, nommé plutôt que tu

- **Les onze autres souscriptions du canal restent sans filtre**, et c'est en
  partie légitime : `posts`, `post_likes`, `post_comments` sont des événements
  de fil, que tout le monde veut voir. Mais à 2 000 connectés, un « j'aime »
  coûte 2 000 évaluations de RLS et 2 000 messages WebSocket, pour patcher un
  compteur que la plupart des clients n'ont **pas à l'écran**
  (`findPostAnywhere` rend `null` et le gestionnaire ne fait rien). S'abonner à
  ce qui est visible plutôt qu'à tout est le prochain lot — c'est un
  changement d'architecture, pas un réglage.
- **`chargerReferentielPassions` : 2 847 316 appels, 5,8 % du CPU**, six
  allers-retours par session, non caché, et son plafond `PAGES_MAX` est muet.
  Un RPC rendant la liste en une ligne supprimerait la pagination et ce
  silence. Pas fait ici : la liste blanche est **mutable** (une passion créée
  apparaît, une passion archivée disparaît), donc elle ne se cache ni sur la
  release ni sur un TTL sans arbitrage.
- **Une garde serveur pour les frappes courtes** : `rechercher_passions` est
  exécutable par `anon`, et un appelant qui martèle `q='a'` coûte 133 ms par
  coup — de quoi saturer un vCPU à huit requêtes par seconde. Le dépôt veut
  ses gardes aux deux bouts ; celle-ci demande une migration, donc une
  contre-revue humaine.
- **Les minuteurs sont le `O(connectés)` permanent, et ce lot n'y touche pas.**
  `startFeedRefreshLoop` (60 s) rejoue `supaLoadPosts()` chez chaque client
  visible, et la policy de `posts` lit `profiles` par ligne évaluée : c'est le
  producteur dominant des 19 millions de balayages. Le filet `video_lives`
  (60 s) tourne même sans aucun live — un seul onglet toujours ouvert produit
  185 760 des 223 315 balayages mesurés. Les deux appellent un recul
  (intervalle qui s'allonge quand rien ne change), pas un débounce.
- **`creer_passion` accepte un libellé de deux caractères** : une telle passion
  serait invisible aux autres depuis le plancher de ⑥, jusqu'à la régénération
  du JSON. Zéro cas aujourd'hui, et rien ne garde l'invariant.
- **Le forfait Supabase n'a jamais été LU** : « Pro » est déduit du go/no-go
  du 11/09 et de la compute Micro mesurée, jamais constaté dans Billing.

---

## 7. Ce qui a été cherché et n'a rien donné

Écrit parce qu'un « rien trouvé sur cet axe » a autant de valeur qu'un
constat — sans lui, la session suivante refait l'enquête.

- **La publication realtime est correcte** : 12 tables, exactement celles qui
  sont écoutées, `telemetry_events` comprise (le pilotage s'y abonne). La
  migration du 19/09 est bien appliquée, mesuré.
- **Les index de recherche sont bien là et bien lus** : `passions_recherche_trgm`
  et `passions_normalized_trgm` à 4 770 lectures chacun. Le doute venait de ma
  propre requête, pas de la base.
- **`rechercher_passions` n'a que deux appelants** : `js/passions-flat.js` et
  `scripts/charge.mjs`. Aucune surface oubliée.
- **`profiles` n'a pas de problème d'index** : neuf lignes, un balayage y est
  le bon plan. Le volume venait du nombre d'appels.
