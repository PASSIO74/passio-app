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
   côté depuis `PassioPassions.taille()` — et **rien** quand le référentiel n'a
   pas répondu ou n'est que son repli hors ligne.
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
- **L'invariant « 160 Ko jamais au démarrage » tient** (`passions-plates` ⑤,
  ⑰ bis et ⑰ quater, verts). Le référentiel part à l'**ouverture de la page**
  — et aussi à l'ouverture d'une **fiche de passion** (`openPassionExplorer`,
  joignable depuis les bulles du Fil, l'IA et la passerelle UI-3) : dans les deux
  cas c'est un **geste utilisateur**, très exactement l'usage réel que
  l'invariant réserve. `boot()` n'appelle ni l'un ni l'autre. Le premier rendu
  est **synchrone** avec ce qu'on a sous la main (socle + perso) ; le référentiel
  **repeint** quand il arrive.
- **⚠️ LE REPEINT APPARTIENT À `charger()`, PAS À SES APPELANTS.**
  `evaluerBesoinDeNoms` — la chaîne d'auto-détection, seule à appeler
  `repeindreLesRails()` et donc seule à invalider les **trois** caches
  (`#profileStrip._lastHtml`, `#v9ProfilePassions[data-v9-sig]`,
  `window._feedDomSig`) — sort en tête sur `pret()`. Dès qu'un **autre** chargeur
  gagne la course (la page « Rechercher » ouverte pendant que l'hydratation
  traîne, ce qui peut durer 10 s), elle ne repeignait plus **jamais** : le rail du
  Fil et celui du Profil gardaient leurs « ✨ Passion » **pour toute la session**,
  référentiel pourtant chargé — le défaut du 2026-09-02 rouvert par la porte de
  côté. `charger()` repeint donc lui-même, de sorte que **tout** chargeur présent
  ou futur l'obtienne.
- **Les passions PERSO restent partout.** Elles ne se créent plus
  (`passionsPersoSuspendues`), mais elles vivent sur des profils : les retirer de
  la grille **ou des résultats** les rendrait introuvables depuis l'écran même
  qui sert à les retrouver. `_exChercherPassions` les rajoute donc après le
  référentiel, qui ne les connaît pas.
- **`.passion-tile-create` reste fermée** (`publication-optimiste-refusee`).
- **⚠️ LE REPLI HORS LIGNE N'EST PAS UN RÉFÉRENTIEL, et le croire RÉTRÉCIT la
  page.** `repliHorsLigne()` fabrique une vingtaine de lignes toutes à
  `popularity: 0` ; `suggestions()` filtre sur `popularity >= 1000` et n'en rend
  alors qu'une poignée — **non vide**, donc le repli sur le socle ne se
  déclenchait pas et la grille tombait de 19 tuiles à deux. Pire, `taille()`
  rendait la taille du **repli** : la page annonçait « un aperçu parmi 21
  passions », un nombre inventé présenté comme mesuré. D'où
  `PassioPassions.horsLigne()`, second chemin de rendu ajouté à l'API publique :
  hors ligne, la grille garde le socle **et le compteur se tait**.

## Huit défauts trouvés en chemin — quatre en production, quatre introduits par ce lot

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

### ④ Trois surfaces, un seul identifiant de bouton — et le mauvais qui bougeait

`document.getElementById("followBtn_<uid>")` rend le **premier dans l'ordre du
document**. Trois surfaces l'émettaient pour la même personne : le profil visité
(app-04), « Créateurs à suivre » (`#suggestedCreators`, dans `#screen-explore`) et
la fiche d'une passion (`#pexCreators`, dans la modale — **après** l'écran dans
`index.html`). Suivre quelqu'un **depuis la modale** écrivait bien l'état, mais
retournait le bouton **caché derrière** : celui sous le doigt restait « Suivre »,
on retapait, et on se **désabonnait en silence**.

Les surfaces marquent désormais leurs boutons d'un `data-follow-uid` et
`toggleFollowUser` les retourne **tous** (l'identifiant historique reste pris en
compte pour les surfaces qui ne l'ont pas encore). Verrou : cas ⑩.

### ⑤ Une passion trouvée par le SERVEUR seul ouvrait une fiche « Passion »

`fusionner` (`passions-flat.js`) garde volontairement les résultats serveur
absents du référentiel local : ils sont **réels**, la base fait foi, ils sont
seulement plus récents que l'instantané JSON — c'est tout l'apport de la
recherche serveur. Mais `openPassionExplorer` **re-résolvait** par `passionById`,
qui ne les connaît ni par le socle ni par `parId` : la ligne de résultat
s'affichait « Astrophotographie » et la fiche s'ouvrait sur « ✨ Passion ».
L'appelant passe désormais le libellé qu'il vient d'afficher
(`openPassionExplorer(pid, retour, libelleConnu)`). C'est de l'**affichage**, et
rien d'autre : `estPassionCanonique` reste seule juge de ce qui est publiable.

### ⑥ Cinq catch larges sans log, et un panneau qui pouvait rester figé

Le mode de défaillance de tous ces `catch` était **le comportement d'avant le
lot** — la page rend les 19 du socle, et personne ne peut dire si le référentiel
a échoué ou s'il n'avait rien à proposer. C'est le motif du bug `diagLog` (fil
vide six jours). Tous logguent maintenant. Et `_exSearchLancer` n'avait pas de
`.catch` : le panneau, mis à « Recherche… » de façon synchrone, pouvait y rester
**pour toujours** sans un message ni une trace.

### ⑦ La grille débordait de l'écran — vu à l'œil, pas par un test

`.passion-grid` est en `repeat(3, 1fr)`, et une piste `1fr` a un
`min-width: auto` : elle refuse de descendre sous la largeur de son contenu le
plus large. Tant que la grille ne servait que les **dix-neuf** libellés courts du
socle (« Photo », « Sport »…), rien ne débordait. Dès qu'elle a rendu le
référentiel plat, « Astrophotographie » et « Guitare électrique » ont poussé la
troisième colonne **hors de l'écran** — 17 px à 390 px.

> ⚠️ **CHANGER LES DONNÉES D'UNE MISE EN PAGE, C'EST CHANGER LA MISE EN PAGE.**
> Aucun des douze verrous précédents ne pouvait le voir : ils comptaient des
> tuiles et lisaient des libellés, **jamais une largeur**. Il a fallu regarder
> l'écran.

Correctif : `minmax(0, 1fr)` sur la grille, et sur le libellé `hyphens: auto`
(le document est en `lang="fr"`, donc la coupure est « Astrophoto-graphie » et
non au hasard) avec `overflow-wrap: anywhere` en filet.

### ⑧ Le bouton « OK » sortait de l'écran à 320 px — défaut ANTÉRIEUR

Mesuré **identique avec l'ancien libellé d'invite** : ce n'est pas ce lot qui l'a
causé. Un élément flex a un `min-width: auto`, et un `<input>` a une largeur
intrinsèque d'environ vingt caractères (204 px) : il refusait de rétrécir et
poussait le bouton dehors. `min-width: 0` sur le champ le règle (input à 146 px,
débordement à zéro). Personne ne l'avait vu parce qu'**aucune suite ne mesurait
la largeur de cet écran** — c'est désormais le cas (⑬, à 320 / 390 / 430 px).

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

`tests/e2e/recherche-referentiel.spec.js` (15 cas). Le cas ① est une **prémisse** :
il établit que `moto-enduro` est absent du socle, sans quoi les suivants
pourraient être verts avec le code d'avant.

**Les trois verrous des défauts introduits (⑩, ⑪, ⑫) ont été éprouvés par
RÉINJECTION**, et le procédé a payé : au premier jet, ⑪ passait **avec le défaut
remis en place**. Sur un appareil neuf `recentes()` est vide, `suggestions()`
rend alors `[]`, et le repli sur le socle se déclenche quand même — le défaut est
invisible. Il n'apparaît que si quelqu'un a déjà utilisé la recherche. Le test
pose donc cette prémisse (`passio_passions_recentes` semé avant le boot), et la
grille tombe alors bien à **deux tuiles** sans le correctif.

> ⚠️ **`page.route` NE VOIT PAS la requête du référentiel** — mesuré à la sonde :
> elle part bien vers `/data/passions-v1.json`, mais transite par le **service
> worker**. Le cas ⑪ coupe donc par `window.fetch` dans un `addInitScript`. Un
> test bâti sur `page.route` serait vert **en ne coupant rien** ; c'est sa
> prémisse qui l'a révélé.
