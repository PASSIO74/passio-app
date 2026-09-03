# « Mes passions » — la page dédiée (2026-09-03)

> Demande de Benjamin, maquette à l'appui : « refonte de la page *Mes passions* ».
> Deux choses en une — **une règle produit** (aucune passion n'est principale) et
> **une forme** (un panneau devient une page).

---

## 1. La règle produit, d'abord

**Il n'existe AUCUNE passion principale, favorite ou prioritaire.** Toutes les
passions actives ont exactement la même importance. La passion d'une publication
se choisit **au Studio, au moment de publier** (ADR-011 §3).

Ce que la page disait avant, à chaque ouverture :

- une pastille pleine largeur, `« Passion du Studio ✓ »`, sur une carte et une
  seule (`.v8-state.on`, `data-v8-active`) ;
- un liseré violet plein autour de cette carte (`.v8-passion-card.is-active`).

Les deux sont **retirés**, code et CSS. Ce qui a été *conservé* : `currentProfileId`
reste la source de vérité de l'identité d'écriture et `switchToProfile` son seul
point d'écriture. Le moteur n'a pas bougé — **c'est l'écran qui cesse de le
raconter comme un rang.**

> ⚠️ **Retirer la pastille ne suffit pas : il faut retirer les MOTS partout.**
> Une pastille supprimée mais un libellé resté dans le menu « … », dans une aide
> ou dans un titre redirait exactement ce que la règle interdit. Le verrou ②
> de `mes-passions-page.spec.js` balaie le texte entier de la page ET le menu
> d'une carte contre `/principale|favorite|prioritaire|Passion du Studio/i`.

---

## 2. La forme : un panneau devient une page

`#passionManager` était une **section** de `#screen-profiles`, prise entre l'état
vide « Créer un post » (que le lot UI-7 y a déplacé) et le Studio. `openPassionManager`
posait `hidden = false` et faisait un `scrollIntoView` — on gérait ses passions au
milieu d'autre chose.

Désormais `openPassionManager` pose la classe **`passions-page-open`** sur
`#screen-profiles`, et une seule règle CSS fait le reste :

```css
#screen-profiles.passions-page-open > *:not(#passionManager) { display: none !important; }
```

> ⚠️ **MASQUER, JAMAIS RETIRER.** `renderProfilesScreen` continue d'écrire dans
> `#myPosts`, `#profileEvents`, le rail et les panneaux UI-7 ; refermer la page
> les rend intacts, sans un re-rendu. C'est l'invariant du dépôt, et c'est aussi
> ce qui rend la page robuste : elle n'a pas à connaître les modules qui
> déplacent des nœuds dans cet écran (UI-7 en déplace quatre).
>
> ⚠️ `!important` est **nécessaire** : plusieurs frères portent un
> `style="display:…"` en ligne (le Studio et ses blocs média) qu'une règle de
> classe ne battrait pas.

### L'en-tête

| Élément | Id | Ce qu'il fait |
|---|---|---|
| `←` | `#fermerPassionManager` | `closePassionManager()` — **même id que l'ancien lien « Fermer »**, c'est la même commande sous une autre forme |
| Titre | `#passionManagerTitre` | « **Mes passions** » |
| `?` | `#aidePassionManager` | `openPassionsAide()` |

> ⚠️ **Le titre de la PAGE change, pas le libellé de la COMMANDE.** L'entrée du
> menu « ⋯ » reste « **Gérer mes passions** » : une commande nomme un geste, une
> page nomme un lieu. L'aide contextuelle `second_profil` et le repli de fil vide
> citent toujours la commande par ce nom.

### Les trois sorties, et le geste de retour

Une page plein écran qui n'a pas d'entrée dans `closeCurrentOverlay` est le
défaut corrigé le 2026-09-02 sur les quatre grands panneaux : le geste de retour
tombe dans le `goTo(écran)` qui suit, et on quitte le profil depuis une page dont
on n'est jamais « revenu ». Deux ajouts, donc :

- **`closeCurrentOverlay`** (app-02) ferme la page et **consomme** le retour.
  Elle est en **dernier** : c'est la couche la plus basse de la pile (elle n'est
  pas `position: fixed`, elle vit dans le flux de l'écran).
- **`goTo`** ferme la page **avant** la bascule d'écran — sinon l'onglet
  « Profil » de la barre du bas ramenait sur elle au lieu du profil.
  ⚠️ Sans danger pour `ouvrirGestionPassions`, qui fait `goTo` **puis**
  `openPassionManager`, dans cet ordre.

---

## 3. Le haut de page : trois nœuds, une seule source de vérité

Tout est écrit par **`_rendrePagePassionsEntete()`** (app-06), appelée depuis la
branche UI-8 de `renderProfilesScreen`.

| Nœud | Contenu | Source |
|---|---|---|
| `#passionsResume` | « X passions actives sur N » | `nbPassionsVivantes()` · `PASSIONS_OFFERTES` |
| `#profilesQuotaSub` | l'alerte de quota, **ou** la ligne d'information | `changementsPassionRestants()` |
| `#nouveauProfilLien` | la porte d'ajout, armée **ou** désarmée | `plafondPassionsAtteint()` |

> ⚠️ **AUCUN NOMBRE ÉCRIT EN DUR, NULLE PART** — ni dans le code, ni dans les
> tests, qui lisent `PASSIONS_OFFERTES` et `CHANGEMENTS_PASSION_OFFERTS` dans la
> page. Un plafond qui change doit faire échouer honnêtement, pas obliger à
> réécrire un test.
>
> ⚠️ **LE PLAFOND PEUT NE PAS S'APPLIQUER.** `passionsRestantesOffertes()` rend
> `Infinity` sous la coupure du sélecteur plat, et `changementsPassionRestants()`
> rend `Infinity` pour un visiteur sans compte ou en démo. Dans ces cas on
> n'écrit **ni** « sur N » **ni** d'alerte : annoncer une limite qui ne borne rien
> est un mensonge. Verrou ⑦ bis.

### Les quatre états, et pourquoi l'alerte n'est pas permanente

`#profilesQuotaSub` porte `data-passion-quota` :

| `changementsPassionRestants()` | attribut | rendu |
|---|---|---|
| `Infinity` | *(absent)* | nœud masqué |
| `> 0` | `disponible` | ligne discrète « **N** changements de passion disponibles sur N. » |
| `<= 0` | `epuise` | **alerte** « Aucun changement disponible pour le moment. » (`role="status"`) |

> **Une alerte permanente n'alerte plus de rien** — c'est tout le point de la
> demande. `role="status"` et non `alert` : l'information est une contrainte de
> l'écran, pas un incident ; un lecteur d'écran ne doit pas être coupé.
>
> ⚠️ Le fond de l'alerte est **OPAQUE** (`#efe8ff`), jamais un `rgba` : le
> contrôle de contraste remonte au premier fond opaque et **ignore l'alpha**
> (invariant des pastilles de mood, fiche 17).

### La porte d'ajout : désarmée, pas seulement grisée

Au plafond, `_rendrePagePassionsEntete` :

- écrit le motif **dans** la porte : « Limite de N atteinte » ;
- pose `aria-disabled="true"` et `data-passion-porte="fermee"` ;
- **retire `role` et `tabindex`** ;
- le CSS ajoute `pointer-events: none` via `.is-plein`.

> ⚠️ **RETIRER `role` EST LE POINT CRITIQUE.** `app-08` porte un écouteur
> **délégué** qui active à Entrée/Espace tout `[role="button"]` non natif. Griser
> sans retirer le rôle aurait laissé une cible qui **répond au clavier à un geste
> qu'elle annonce refuser** — et `pointer-events` ne couvre pas le clavier.
>
> ⚠️ **ELLE RESTE PEINTE.** Désarmer n'est pas cacher : une porte qui disparaît
> ne dit pas pourquoi elle a disparu. Le motif du refus est écrit, jamais deviné.
>
> ⚠️ **CONSÉQUENCE ASSUMÉE : au plafond, la porte n'ouvre plus la fenêtre
> payante.** Deux suites la cliquaient pour la faire apparaître
> (`profil-entete-passions` ③ bis quinquies, `passions-plates` ㉒) ; elles
> mesurent désormais le refus **là où il est** — dans la porte — puis ouvrent la
> fenêtre par `openPassionPaywall()` pour vérifier l'invariant de boucle, qui n'a
> pas changé. `restaurerPassion` au plafond y mène toujours pour de vrai.

---

## 4. Les cartes

Ce que la maquette énumère, et **rien d'autre** : image, nom, nombre de
publications, nombre d'activités, menu « … ». La ligne de **bio** a été retirée
de la carte (elle reste éditable et affichée dans l'espace de la passion), et la
règle CSS `.v8-passion-card .profile-card-bio` est partie avec son émetteur.

La carte **reste cliquable** : `openEditPassionProfile(id)`, le moteur historique
(photo, couverture, bio). Rien n'a été réécrit.

> ⚠️ **LA PASTILLE PHOTO EST CONSERVÉE** (`.passion-photo-badge`) : elle a son
> propre verrou (`carte-passion-photo.spec.js`) et c'est un raccourci réel vers
> un `<input type="file">` que le menu « … » déclenche aussi. La maquette ne la
> montre pas ; la retirer aurait supprimé une fonction pour un détail de rendu.
>
> ⚠️ **Le menu « … » d'une carte passe à 44 px** (`min-width`/`min-height`,
> bornés à `#profileList .v8-passion-card`). La règle historique le laissait à
> **34 px**, sous le seuil que ce dépôt s'impose — mesuré par le verrou ⑭, pas
> supposé.

---

## 5. Les archives

- Titre **repliable** : `#passionArchiveToggle` (`aria-expanded`, `aria-controls`)
  + `#passionArchiveList`. Ouvert par défaut — une passion rangée doit rester
  visible sans un geste de plus, c'est le défaut corrigé le 2026-09-02.
- L'état du repli vit **en mémoire** (`_passionArchiveDeplie`), pas dans le DOM :
  le conteneur est réécrit en entier à chaque rendu, le lire sur le nœud qu'on
  s'apprête à détruire l'aurait perdu à chaque geste.
- **Plus de discours rassurant** (« rien n'a été supprimé : publications,
  activités, bobines et médias restent visibles… ») : la garantie a rejoint
  l'aide du « ? », où on la lit une fois au lieu de la relire à chaque ouverture.

### Un seul libellé : « Réactiver »

Avant : trois libellés selon l'état — « Restaurer » / « Échanger » /
« Indisponible ». Le **bouton** portait l'explication de la règle de quota, que
l'utilisateur devait reconstituer en voyant le mot changer sous ses yeux.

Désormais : « **Réactiver** » toujours, et l'état du bouton porte le reste.

```
bloqué  ⟺  plafondPassionsAtteint() && quotaChangementsAtteint()
```

et dans ce cas seulement : `disabled`, `aria-disabled`,
`data-v8-reactivation="bloquee"`, `title`, plus **une** ligne sous la liste —
« Réactivation possible lorsqu'un changement sera disponible. » (répétée sur
chaque ligne, elle serait devenue du décor).

> ⚠️ **`disabled` VRAI, pas grisé** : un `<button disabled>` n'envoie pas son
> `onclick`, donc `restaurerPassion` n'est pas atteignable par un chemin que
> l'écran annonce refuser. **La garde reste AUSSI dans `restaurerPassion`** —
> deux bouts, comme le plafond ; le verrou ⑩ bis l'appelle directement pour le
> prouver.

---

## 6. Ce qui a été SUPPRIMÉ, et pourquoi il fallait le supprimer

`openArchivedPassions()` — la modale des archives — **est retirée**. Sa dernière
porte était le lien « Passions archivées (N) » de `#profilesQuotaSub`, que la
page remplace par la section repliable. Gardée, elle serait devenue une huitième
fonction globale sans appelant, du genre que l'audit du 2026-06-10 a trouvé sept
fois.

Sont partis avec elle :

- le `setTimeout(openArchivedPassions, 350)` de `restaurerPassion` (la page
  repeint la liste elle-même, avec une ligne de moins) ;
- les règles CSS `.v8-state*` et `.v8-passion-card.is-active` ;
- la règle `.v8-passion-card .profile-card-bio`.

> **Cible supprimée = tout ce qui la vise doit partir avec.** Une règle CSS ou
> une fonction qui survit à la disparition de sa cible est l'un des défauts que
> ce dépôt traque nommément (les douze de la fiche 15 sont tous de cette famille).

---

## 7. Télémétrie et Sentinelle

Deux canaux, deux rôles (app-06) :

- **`_passionsPageTel(nom, meta)`** → `tel.action`. Événements :
  `passions_page_ouverte` (`actives`, `archivees`, `plafond`),
  `passions_archives_repli` (`ouvert`, `archivees`),
  `passions_aide_ouverte` (`actives`).
- **`_passionsPageEchec(etape, e)`** → `tel.error` **et** `diagLog`. Un rendu qui
  casse remonte comme une **erreur** et non comme un écran vide silencieux :
  c'est ce que la Sentinelle lit.

> ⚠️ **AUCUNE CLÉ DE `meta` NE DOIT PERCUTER LE FILTRE PII** de `js/telemetry.js`.
> Sa liste NOIRE `DENY_KEY` contient entre autres **`pass`**, `name`, `label`,
> `tel`, `bio`, `user` — une clé filtrée disparaît **EN SILENCE**, l'événement
> part et sa charge utile n'arrive jamais. D'où `actives`, `plafond`, `restants`,
> `archivees`, `bloque`, `ouvert` — et **jamais « passions »**.
> `npm run audit:telemetry-keys` (8ᵉ gate de `npm run verif`) le vérifie
> statiquement ; le verrou ⑬ vérifie en plus que l'événement **part**.

---

## 8. Les pièges rencontrés (mesurés, pas supposés)

1. **`[hidden]` ne replie rien sur un `display: flex`.** `.v8-switch-list` pose
   `display: flex`, qui bat la règle d'agent utilisateur `[hidden] { display: none }`.
   Replier la section posait bien l'attribut **et** l'`aria-expanded`… et la liste
   restait à l'écran. Un repli qui ne replie rien, **invisible à tout test
   d'attribut** — il a fallu `toBeHidden()` pour l'attraper. Remède :
   `#passionArchiveList[hidden] { display: none !important; }`.
2. **34 px.** Le « … » d'une carte était sous le seuil de 44 px depuis UI-8.
   Personne ne l'avait mesuré parce qu'aucun test ne mesurait *cette* cible-là.
3. **Le fixture qui ment.** Une passion absente du référentiel plat s'affiche
   « ✨ Passion » : un test vert sur ce libellé ne dit plus rien. Les fixtures de
   cette suite n'utilisent que des identifiants **réels** (`voyage`, `cuisine`,
   `photo`, `podcast`, `moto`).
4. **`Infinity` est un état, pas un accident.** Visiteur, démo, kill switch : le
   quota ne s'applique pas. Sans le verrou ⑦ bis, un rendu qui écrirait
   « Infinity changements » ou une alerte permanente resterait vert.
5. **La page masque des frères que d'autres modules déplacent.** UI-7 insère sa
   barre d'onglets et ses deux panneaux **entre** `#mainProfileCard` et
   `#passionManager`, et y déplace `#myPosts`. Une règle qui aurait listé les
   nœuds à masquer aurait raté tout ce qu'un futur lot ajoute ; `> *:not(#passionManager)`
   n'a rien à connaître.

---

## 9. Verrous

- **`tests/e2e/mes-passions-page.spec.js` (24 cas)** — la page dédiée, les quatre
  états croisés (place disponible / limite atteinte × changement disponible /
  aucun), l'absence de passion principale, les archives repliables, la
  réactivation, la télémétrie, la Sentinelle, et le rendu de 320 à 430 px.
- Suites **adaptées** au même endroit : `ui-v8-passions` (le marqueur d'écriture
  ne distingue plus aucune carte, restauration par la page), `passions-archive-quota`
  (« Réactiver » et son désarmement, le compteur), `profil-entete-passions`
  (porte armée / désarmée, fratrie), `passions-plates` (㉒), `ui-v7-lot`,
  `ui-v6b-profil` (titre de page), `feed-premier-rendu`.
