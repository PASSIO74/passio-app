# La page « Rechercher » rattrape le référentiel plat — 2026-09-03

> Constat de Benjamin : « il faut analyser et optimiser la page rechercher (logo
> loupe), il n'a pas été mis à jour depuis longtemps, par exemple on est censé
> avoir 5000 passions mais ce n'est plus à jour… »

## Ce qui était vrai, et ce qui ne l'était pas

**Le nombre n'a jamais été 5 000.** Le référentiel plat publie **1 908 passions**
en production — vérifié des deux côtés le 2026-09-03 : `select count(*) from
public.passions` rend 1 908, et `data/passions-v1.json` porte la même empreinte
(`0bd8e78e33dfd1cc`). Le chiffre de 5 000 était une attente, jamais une donnée.

**Mais le constat était juste, et pire que ce qu'il annonçait.** La page était
restée sur `PASSIONS` — les **dix-neuf** entrées du socle embarqué d'`app-01`,
qui n'est qu'un *repli d'affichage*. Trois lots l'avaient dépassée sans jamais
la traverser :

| Section | Ce qu'elle faisait | Conséquence |
|---|---|---|
| « Toutes les passions » | `[...PASSIONS, ...customs]` | **19 tuiles**, et rien ne disait combien il y en a — d'où l'idée de « 5 000 » restée sans démenti |
| « Passions tendance » | `PASSIONS.map(...)` puis tri par nombre de posts | une passion du réseau portant dix publications n'avait **aucun chemin** vers la section |
| Recherche | `PASSIONS.filter(label.toLowerCase().includes(q))` | 19 libellés, comparaison littérale : ni alias, ni pluriel, ni accent replié — « enduro », « astrophoto », « guitares » ne rendaient **rien** |

## Ce qui a changé

Le **référentiel est désormais la seule autorité** de cette page ; le socle n'en
est plus que le repli.

1. **La recherche** passe par `PassioPassions.chercherAsync(q, { limite: 6,
   serveur: true })` — le même barème que le sélecteur des sept surfaces (exact,
   alias, préfixe, milieu de libellé, repli au singulier, mots dans le désordre),
   plus le repli serveur pour ce que l'index local par préfixe ne rattrape pas.
2. **La grille** montre `suggestions(24)` (qui **alterne** un terme précis et une
   grande famille), plus les passions perso, plus le **nombre réel** écrit à
   côté depuis `PassioPassions.taille()`.
3. **Les tendances** partent des passions **réellement publiées** (`seed` +
   `userPosts` + `supabasePosts`), le socle ne servant plus qu'à compléter une
   section qui serait autrement creuse.
4. **La fiche d'une passion** (`openPassionExplorer`) charge les comptes réels et
   propose des **« Passions proches »** (`liees()`).

## ⚠️ Invariants

- **`PassioPassions.taille()` est un chemin de RENDU**, `_etat()` non (« exposé
  pour les tests et le diagnostic — jamais pour un chemin de rendu »). C'est
  pourquoi la fonction a été ajoutée à l'API publique plutôt que d'appeler
  `_etat().taille`.
- **Le nombre affiché ne doit JAMAIS être une constante.** Tant que le
  référentiel n'a pas répondu, `#explorePassionsCount` reste **vide** : se taire
  plutôt qu'inventer un ordre de grandeur — c'est faute de l'avoir dit que
  « 5 000 » a pu tenir.
- **On n'affiche jamais 1 908 tuiles.** La spécification du lot plat l'interdit
  (« il n'affiche JAMAIS les 1 900 passions d'un coup ») : la grille est un
  aperçu, la RECHERCHE est le chemin vers le reste.
- **L'invariant « 160 Ko jamais au démarrage » tient** (`passions-plates` ⑤ et
  ⑰ bis). Le référentiel part à l'**ouverture de la page**, ce qui est très
  exactement l'usage réel que l'invariant réserve : `boot()` n'appelle pas
  `renderExplorer`. Le premier rendu est **synchrone** avec ce qu'on a sous la
  main (socle + perso) ; le référentiel **repeint** quand il arrive — les deux
  sections nomment des passions, sans ce repeint elles resteraient « ✨ Passion ».
- **Les passions PERSO restent partout.** Elles ne se créent plus
  (`passionsPersoSuspendues`), mais elles vivent sur des profils : les retirer de
  la grille **ou des résultats** les rendrait introuvables depuis l'écran même
  qui sert à les retrouver. `_exChercherPassions` les rajoute donc après le
  référentiel, qui ne les connaît pas.
- **`.passion-tile-create` reste fermée** (`publication-optimiste-refusee`).

## Trois défauts trouvés en chemin, tous en production

### ① La recherche n'avait ni anti-rebond ni annulation

Chaque frappe partait en requête `profiles` : taper « guitare » lançait **sept**
recherches réseau. Et les réponses s'écrivaient dans l'**ordre d'arrivée** — une
requête lente partie sur « gui » écrasait le résultat de « guitare ». Même
frappe, deux écrans selon le réseau.

Correctif : anti-rebond de 160 ms (la valeur du sélecteur) et **jeton monotone**
(`_exSearchJeton`) qui jette toute réponse devenue obsolète.

> ⚠️ **Le verrou ⑦ retient la recherche de PASSIONS, pas celle des utilisateurs.**
> `supa` est un `let` d'`app-08` : une suite ne peut pas le rendre vrai depuis
> `window`. Un test bâti sur `supaSearchUsers` serait **vert par accident** sur
> tout appareil sans client Supabase.

### ② Deux moteurs de suivi, dont un qui ne suivait personne

« Créateurs à suivre » portait **deux** boutons « Suivre » :

- pour le seed : `onclick="toast('+ X suivi·e')"` — il **ne suivait personne** ;
- pour les comptes réels : `followUserFromExplorer`, un **second moteur
  d'écriture** sans garde `requireAuthentication` (un visiteur sans compte
  écrivait donc un suivi), sans chemin de retour, sans mise à jour du bouton.

Les deux passent par `toggleFollowUser` (app-04), le moteur unique.
`followUserFromExplorer` est **retirée avec son dernier appelant**.

### ③ Le libellé d'une passion perso n'était pas échappé

`openPassionExplorer` interpolait `p.emoji` et `p.label` **bruts** dans le
balisage de la modale. Le libellé d'une passion perso est tapé par la personne.
C'est de l'auto-injection, pas une XSS stockée — mais l'échappement était présent
partout ailleurs, et cet endroit-là seul y échappait.

## Ce que ce lot NE fait PAS

- **Les créateurs d'une fiche de passion se cherchent sur `passion_id`**, la
  colonne **indexée** (`idx_profiles_passion`), pas sur un `contains` de la
  colonne jsonb `passions` — celle-ci n'a **aucun index** en production, la
  filtrer ferait un balayage complet à chaque ouverture de fiche. On rate donc
  les comptes qui portent la passion en **seconde** : compromis assumé tant
  qu'aucun index GIN n'existe.
- Aucune migration, aucune RLS touchée, aucun drapeau nouveau : la page suit
  `flat_passions_v1`, et sa coupure (`localStorage.flat_passions_v1="0"` ou
  `window.PASSIO_FLAT_PASSIONS=false`) la ramène **exactement** au socle de 19,
  compteur muet compris.

## Verrou

`tests/e2e/recherche-referentiel.spec.js` (9 cas). Le cas ① est une **prémisse** :
il établit que `moto-enduro` est absent du socle, sans quoi les suivants
pourraient être verts avec le code d'avant.
