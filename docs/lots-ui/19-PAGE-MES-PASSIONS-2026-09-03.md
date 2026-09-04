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

### La porte d'ajout : elle refuse, mais elle répond

> ## 🔁 REVIREMENT DU 2026-09-04 — LA VERSION CI-DESSOUS EST CELLE QUI VAUT
>
> La première version de ce lot **DÉSARMAIT** la porte au plafond :
> `aria-disabled="true"`, `role` et `tabindex` retirés, `pointer-events: none`.
> Le raisonnement était qu'une cible grisée qui répond encore promet un refus et
> fait quand même le geste.
>
> **À l'usage, elle ne faisait aucun geste ET n'en promettait aucun.** Un compte
> à trois passions — c'est-à-dire un compte **normal**, arrivé au bout de sa
> dotation — tapait la porte et n'obtenait **rien** : ni toast, ni fenêtre, ni
> mot. Rapporté par Benjamin le 2026-09-04 (« ajouter une passion / réactiver ne
> fonctionnent pas ») et **reproduit au navigateur** : à trois passions le clic
> échoue en `pointer-events: none`, et à trois changements consommés le bouton
> « Réactiver » est `disabled` — **les deux gestes de la page sont morts en même
> temps**, ce qui est exactement le symptôme décrit.
>
> Un refus qui ne se prononce pas est **indiscernable d'une panne**. La règle de
> la fiche 16 tranche, et elle est plus ancienne que ce lot : **une porte fermée
> doit dire par où passer**.

Au plafond, `_rendrePagePassionsEntete` :

- écrit le motif **et la sortie** dans la porte : « Limite de N atteinte —
  appuie pour voir comment en changer » ;
- pose `data-passion-porte="fermee"` (l'**aspect**, jamais l'inertie) et la
  classe `.is-plein` ;
- **garde `role="button"` et `tabindex="0"`**, et ne pose **pas**
  `aria-disabled`.

> ⚠️ **NI `aria-disabled` NI `pointer-events: none`.** Les deux désarment : le
> second coupe le pointeur, le premier retire la commande aux lecteurs d'écran
> **et à toute automatisation** (Playwright refuse de cliquer un
> `aria-disabled="true"` avec « element is not enabled » — c'est d'ailleurs son
> journal qui a mis le doigt dessus). Les poser sur une cible qui **répond**
> serait mentir.
>
> ⚠️ **ELLE RESTE PEINTE.** Refuser n'est pas disparaître : une porte qui
> disparaît ne dit pas pourquoi. Le motif du refus est écrit, jamais deviné.
>
> ⚠️ **ELLE MÈNE TOUJOURS À `openCreateProfile`,** qui au plafond ouvre
> `openPassionPaywall()` : la fenêtre nomme la limite, dit qu'aucun paiement
> n'est ouvert, et donne la sortie réelle. C'est le comportement de **toutes**
> les autres portes d'acquisition — le Studio, `quickCreateProfile`,
> `ajouterPassionAuCompte` — dont celle-ci était devenue la **seule exception
> muette**.
>
> ⚠️ **LA BOUCLE « mur → panneau → mur » RESTE FERMÉE** par `_paywallCacheGerer()`,
> qui retire « Gérer mes passions » quand on tape depuis le panneau déjà ouvert.
> Rien de cet invariant n'a bougé.
>
> ⚠️ **ET LE PLAFOND N'EST PAS DESSERRÉ D'UN POUCE.** Il est gardé aux **points
> d'écriture** (`ajouterPassionAuCompte`, `restaurerPassion`), pas par l'inertie
> d'un bouton. Un bouton inerte n'a jamais été une garde — c'était un affichage.
>
> ⚠️ **CE QUE LES SUITES MESURENT MAINTENANT.** `mes-passions-page` ⑤,
> `profil-entete-passions` (③ bis quinquies) et `passions-plates` (㉒)
> **recliquent la porte** et exigent qu'elle réponde. Elles avaient été réécrites
> le 2026-09-03 pour ne plus la cliquer — donc plus rien ne mesurait qu'un tap
> mène quelque part, et le tap ne menait effectivement plus nulle part. **Un
> verrou qui cesse d'exercer le geste cesse de protéger le geste.**

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

et dans ce cas seulement : la classe `.est-bloquee` (l'aspect gris),
`data-v8-reactivation="bloquee"`, un `title`, un `aria-label` qui porte l'état
(« … — indisponible pour le moment, appuie pour savoir pourquoi »), plus **une**
ligne sous la liste — « Réactivation possible lorsqu'un changement sera
disponible. » (répétée sur chaque ligne, elle serait devenue du décor).

> ## 🔁 REVIREMENT DU 2026-09-04 — NI `disabled`, NI `aria-disabled`
>
> La première version posait `disabled` **vrai**, « pas seulement grisé », pour
> qu'aucun chemin ne puisse atteindre `restaurerPassion` alors que l'écran
> annonce refuser. Résultat mesuré : un `<button disabled>` n'envoie pas son
> `onclick`, donc **le tap ne produisait rien** — et le verdict de l'utilisateur
> n'a pas été « c'est bloqué » mais « **réactiver ne fonctionne pas** ». Même
> famille de défaut que la porte d'ajout ci-dessus, le même jour, sur la même
> page : les deux seuls gestes de « Mes passions » étaient inertes ensemble.
>
> `aria-disabled` ne remplace pas `disabled` : il désarme aussi, pour qui n'a
> pas la vue **et** pour toute automatisation. L'état vit donc dans le **nom
> accessible**, l'**aspect** et le **motif**, jamais dans l'inertie.
>
> ⚠️ **LA GARDE N'A PAS BOUGÉ D'UN POUCE.** Elle vit dans `restaurerPassion`,
> **point d'écriture**, exactement comme le plafond — et le verrou ⑩ bis
> l'appelle toujours directement pour le prouver. Retirer `disabled` ne réactive
> **aucune** passion : le tap ouvre `openPassionPaywall({restaurer})`, qui dit
> que les changements sont épuisés. **Un attribut d'affichage n'a jamais été une
> garde.**

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

- **`tests/e2e/mes-passions-page.spec.js` (28 cas)** — la page dédiée, les quatre
  états croisés (place disponible / limite atteinte × changement disponible /
  aucun), l'absence de passion principale, les archives repliables, la
  réactivation, la télémétrie, la Sentinelle, et le rendu de 320 à 430 px.
- Suites **adaptées** au même endroit : `ui-v8-passions` (le marqueur d'écriture
  ne distingue plus aucune carte, restauration par la page), `passions-archive-quota`
  (« Réactiver », son aspect bloqué et le compteur), `profil-entete-passions`
  (la porte répond au plafond, fratrie), `passions-plates` (㉒), `ui-v7-lot`,
  `ui-v6b-profil` (titre de page), `feed-premier-rendu`.

---

## 10. Le mode « passions illimitées » (2026-09-04)

> « Mets mon compte test en illimité avec les passions pour les tests. »

Un drapeau d'appareil : `localStorage["passio_passions_illimitees_v1"] = "1"`,
ou `window.PASSIO_PASSIONS_ILLIMITEES = true` (qui a la priorité, dans les deux
sens). Porte sans console : **Paramètres → Démo → « Passions illimitées (test) »**
(`#settingsPassionsIllimitees`).

> ⚠️ **CE N'EST PAS UNE COUPURE DE LOT, C'EST UNE ADHÉSION.** Toutes les autres
> bascules du dépôt (`flat_passions_v1`, `passio_ui_8`, `passio_ui_4a5`…) ne
> savent qu'**enlever** : seule la valeur « 0 » décide, rien n'est jamais écrit
> pour activer. Celle-ci fait l'inverse — elle n'existe que si on l'**allume**.
> Le défaut du produit reste donc le produit : trois passions, trois
> changements. Le verrou ⑭ le mesure en premier.

**Lu à un seul endroit, et c'est ce qui le rend sûr** :
`plafondPassionsActif()` et `quotaChangementsActif()` — les deux interrupteurs
dont **tout** le reste découle par lecture. `passionsRestantesOffertes` →
`Infinity`, donc `plafondPassionsAtteint` → faux, donc les gardes
d'`ajouterPassionAuCompte`, de `restaurerPassion`, du Studio et de
`PassioFlatUI.placesRestantes` s'ouvrent ; `changementsPassionRestants` →
`Infinity`, donc `quotaChangementsAtteint` → faux, donc
`_inscrireChangementPassion` n'échoue plus, `confirmArchivePassion` n'ouvre plus
la fenêtre payante et `_passionReactivationBloquee` rend faux.

> ⚠️ **POSER LE DRAPEAU À CHAQUE PORTE AURAIT LAISSÉ LA PROCHAINE PORTE
> L'OUBLIER** — la faute exacte que `quickCreateProfile` et le Studio ont déjà
> commise sur le plafond (fiche 16).
>
> ⚠️ **ET L'ÉCRAN NE MENT PAS**, sans une ligne de plus :
> `_rendrePagePassionsEntete` n'écrit « sur N » que si `plafondPassionsActif()`,
> et n'affiche l'alerte de quota que si `changementsPassionRestants()` est un
> nombre **fini**. Les deux mentions, le motif « Limite de N atteinte » et le
> motif de réactivation disparaissent d'eux-mêmes. Annoncer une limite qui ne
> borne rien est un mensonge (§ ci-dessus).
>
> ⚠️ **LE BOUTON DES PARAMÈTRES DIT L'ÉTAT, PAS LE GESTE**, et il est réécrit à
> chaque ouverture du panneau par `majBoutonPassionsIllimitees()` — comme
> l'entrée « Compte » que réécrit `majSectionCompte`, et pour la même raison :
> ce panneau est du balisage **statique**, il annoncerait sinon l'état de la
> dernière fois. Le verrou ⑭ quater **part du drapeau déjà posé** pour l'exiger ;
> démarrer à zéro l'aurait laissé vert sur la valeur écrite en dur dans
> `index.html`, même si la fonction n'était jamais appelée.
>
> ⚠️ **ÉTEINDRE ÉCRIT « 0 », n'efface pas la clé** : un `removeItem` laisserait
> un `window.PASSIO_PASSIONS_ILLIMITEES` posé entre-temps décider à sa place.
>
> ⚠️ **AUCUNE PORTE DÉROBÉE OUVERTE.** C'est du client vanilla : n'importe qui
> peut déjà écrire `state.user.profiles` depuis la console. Ce drapeau ne
> desserre **aucune RLS** et n'écrit rien en base que la console ne puisse
> écrire seule. Le jour où la formule payante s'ouvrira, c'est le **serveur** qui
> décidera — pas un `localStorage`.

Verrou : `tests/e2e/mes-passions-page.spec.js` ⑭ (4 cas) — éteint par défaut,
les deux limites levées, les gestes qui **aboutissent** au-delà du plafond et du
quota, et la bascule des Paramètres.
