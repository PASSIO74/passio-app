# Le fil montrait une passion que je n'ai pas — l'envie était une source (2026-09-09)

## Le signal

Essai réel de partage entre deux comptes. Léane publie dans **Musculation**.
Benjamin, qui n'a pas cette passion, voit sa publication dans son fil :

> « je viens de faire un essai de partage de contenu avec Léane, elle a partagé
> un post dans musculation, quand je vais dans mon feed ses posts apparaissent
> alors que je n'ai pas sélectionné la passion en question ; normalement son post
> apparaît que dans suivis car je n'ai pas cette passion sur mon profil. »

## Ce qui a été mesuré, en production, le jour même

Lecture par le connecteur `supabase-passio-readonly` (canal ① d'ADR-012) :

| ce qu'on a lu | valeur |
|---|---|
| `posts` (la publication) | `passion_id = "fitness-musculation"`, `mood = "learn"` |
| `user_state` du lecteur → `feedFollowingOn` | **`false`** — « Suivis » était DÉCOCHÉ |
| `user_state` du lecteur → `selectedFeedPassions` | `["outdoor-randonnee","sante-sport-sante","test5"]` |
| `user_state` du lecteur → `feedIntents` | `["learn"]` |
| `follows` | il suivait bien Léane — mais le critère n'était pas coché |

**Aucune source ne l'amenait.** Le mapping `posts.passion_id → p.passion`
(app-02, `supaLoadPosts`) était correct, la publication portait bien sa passion,
et le lecteur ne l'avait pas. Ce qui la faisait entrer, c'était l'**envie**.

## La cause

ADR-011 §1 avait promu les envies du rail (`#feedIntentSelector` :
Explorer · Apprendre · Idées · Rencontrer) au rang de **troisième source**, en OU
inclusif avec « Suivis » et les passions :

```js
if (enviesChoisies.length > 0) {
  combinedPosts = combinedPosts.concat(allPosts.filter(function (p) {
    return enviesChoisies.some(function (env) { return feedPostMatchesIntent(p, env); });
  }));
}
```

`allPosts`, c'est **tout PASSIO**. `feedPostMatchesIntent(p, "learn")` est vrai
pour n'importe quelle publication du réseau portant ce mood. Cocher « Apprendre »
ouvrait donc le fil au réseau entier — et le fil cessait de pouvoir expliquer
pourquoi une carte était là.

⚠️ **Le défaut ne se voit pas dans le code du filtre, il se voit dans son POINT
D'APPLICATION.** Le prédicat était juste ; c'est son emploi qui ne l'était pas.
Un correctif qui aurait durci le prédicat aurait fait disparaître le symptôme sur
« Apprendre » et l'aurait laissé entier sur « Idées » et « Rencontrer ».

## La règle, désormais

```
  SOURCES (OU inclusif, cumulables) :  auteur suivi  OU  passion cochée
  FILTRE  (ET, seulement s'il est posé) :  envie cochée
```

- Les **deux sources** restent additives — l'acquis d'ADR-010 et d'ADR-011 §1 ne
  bouge pas : cocher une passion n'éteint jamais « Suivis », et réciproquement.
- Les **envies** s'appliquent à l'union **déjà constituée**. Elles ne peuvent que
  retrancher. Entre elles, elles restent multi-sélectionnables : une publication
  passe si elle satisfait **au moins une** envie cochée. Aucune envie cochée =
  aucun filtre.
- Une envie **seule**, sans passion ni « Suivis », ne rend rien : ce n'est pas une
  sélection, c'est une manière de lire une sélection qui n'existe pas.

## Les trois pièges du correctif — tous rencontrés

### ① `nothingSelected` comptait les envies

`aucuneSource` et `nothingSelected` incluaient `enviesChoisies.length === 0`.
Les y laisser aurait fait croire à un critère actif chez quelqu'un qui n'a désigné
**aucune provenance** : son écran vide n'aurait plus proposé la seule sortie qui
marche (« Choisis tes passions »). Les deux ne comptent plus que les sources.

### ② Le repli d'exploration rouvrait le défaut par la porte de l'état vide

`renderFeedExplorationFallback` (§7) annonce « Rien encore dans tes passions » et
peint **six publications d'autres passions**. Quand ce sont les sources qui sont
vides, c'est juste. Quand c'est l'**envie** qui a tout retranché, c'est
exactement le défaut qu'on vient de fermer, remis à l'écran par une autre porte —
et sous un titre qui, en plus, serait faux.

Il est donc désarmé dans ce cas précis (`_envieAVide`), au profit d'un message qui
**nomme l'envie** (« Rien en « Rencontrer » ») et la commande qui la lève. Le
repli, lui, reste vivant partout ailleurs — verrou ⑤ bis.

### ③ Le visiteur sans compte — un cul-de-sac créé par le correctif

`PassioFirstRun.filDecouverte()` sortait dès qu'une envie était cochée. C'était
juste tant qu'une envie prenait le relais comme source. Depuis qu'elle ne fait que
filtrer, sortir sur ce seul geste rendait un fil **vide** à quelqu'un qui n'a
encore rien pu choisir. La découverte reste sa source ; l'envie la filtre.

⚠️ **Ce piège est de la famille « cible supprimée = tout ce qui la vise doit
partir avec ».** Ici la cible n'est pas un nœud, c'est une PROPRIÉTÉ : « une envie
cochée amène du contenu ». Trois endroits en dépendaient, et deux étaient hors du
fichier corrigé.

## Autres points

- **Une seule table de libellés d'envie.** L'état vide doit dire « Rien en
  « Apprendre » ». Les mots sont écrits en dur dans `index.html` ; les recopier
  aurait fait deux copies, donc une divergence à terme, donc un message faux au
  pire moment. `PASSIO_FEED_INTENT_LABELS` (app-02) est la source, et le verrou ⑦
  la compare aux boutons **rendus**.
- **« Explorer » n'est pas un mood** et ne le devient pas. Son prédicat (auteur
  non suivi **ou** passion non cochée) est inchangé ; en filtre, il garde ce qui
  vient d'ailleurs que de mes abonnements — c'est-à-dire « fais-moi découvrir des
  gens dans mes passions », ce qu'il a toujours voulu dire.
- **Le classement n'a pas bougé.** `rankFeedPostsForIntents` et `_feedIntentBonus`
  sont intacts : une envie ordonne toujours ce qu'elle laisse passer.
- **Le kill switch legacy est intact.** Sous `passio_feed_intents_v1="0"`, le rail
  historique et son filtre mood reprennent à l'octet près.

## Verrous

- `tests/e2e/feed-envie-filtre.spec.js` (**12 cas**) — la suite dédiée, écrite sur
  la prémisse EXACTE de la production (`fitness-musculation`, `mood: "learn"`,
  « Suivis » décoché). ① et ① bis sont éprouvés par **réinjection du défaut** :
  remettre la concaténation d'ADR-011 §1 les fait rougir, les dix autres restent
  verts — c'est ce qui prouve qu'ils mesurent bien CE défaut-là.
- `tests/e2e/feed-intents.spec.js` — deux cas EXIGEAIENT le comportement retiré
  (« une envie SEULE fait entrer du contenu qu'aucune passion cochée n'amenait »)
  et sont désormais leur propre inverse.
- `tests/e2e/refonte-multi-passion.spec.js` ④ — même chose : il demandait que
  l'envie « Idées » fasse entrer la publication d'un inconnu dans une passion non
  cochée.

## La SEULE façon dont une passion non cochée peut encore paraître

Le **repli d'exploration (§7)**, et lui seul. Il ne se déclenche que lorsque le
fil serait **entièrement vide** faute de contenu dans les passions cochées, et il
ne se cache pas : bandeau « **Exploration — Hors de tes passions, ce n'est pas ton
fil personnalisé** », puis un badge « Exploration · *nom de la passion* » sur
chaque carte, six au maximum.

C'est une décision assumée (spec §7) : l'alternative est un cul-de-sac
(« Aucun post pour cette sélection », sans aucune sortie cliquable). La différence
avec le défaut corrigé est entière — là, du contenu d'une passion inconnue était
**fondu dans le fil**, sans étiquette, comme s'il avait été choisi.

⚠️ **Conséquence pratique pour un compte dont les passions n'ont aucun contenu**
(cas de Benjamin : randonnée + sport-santé + test5, zéro publication, « Suivis »
décoché) : après ce lot, il atterrit sur ce repli, donc il continue de VOIR des
publications d'ailleurs — sous bandeau. Les deux sorties sont dans l'écran :
cocher « Suivis » (il suit déjà des comptes) ou ajouter la passion.

## Point ouvert

Les comptes de production portent encore leurs `feedIntents` persistés. Pour celui
de Benjamin (`["learn"]`, deux passions sans contenu, « Suivis » décoché), le fil
sera **vide** au premier chargement après ce lot, avec le message « Rien en
« Apprendre » » et la commande qui le lève juste au-dessus. C'est le comportement
voulu — mais c'est un changement visible : le décochage n'est pas fait à sa place,
parce que personne d'autre que lui ne sait s'il voulait ce filtre.
