# « Gérer mes passions » — le rail redevient une commande de lecture (2026-09-03)

> Demande de Benjamin, mot pour mot : « refaire les paramètres de mes passions :
> mettre plutôt **gérer mes passions**, enlever la **bulle +** sur le profil
> passion et le mettre dans (**gérer mes passions**) ».

Deux gestes, une seule idée : **séparer regarder de posséder**. Le rail de bulles
en haut du profil sert à filtrer ce qu'on affiche ; le panneau des paramètres
sert à administrer ce qu'on a. Tant que la porte d'acquisition vivait dans le
rail, les deux se confondaient — et un utilisateur qui voulait seulement filtrer
son profil pouvait tomber sur une offre plafonnée.

---

## 1. Ce qui change à l'écran

| Avant | Après |
| --- | --- |
| Menu ⋯ du profil → « 🗂️ Mes passions (N archivée) » | « 🗂️ **Gérer** mes passions (N archivée) » |
| Titre du panneau : « Mes passions   + Ajouter   Fermer » | « **Gérer mes passions**   Fermer » |
| Rail `#v9ProfilePassions` : bulle « + » en tête, puis les passions | **rien que les passions** |
| Porte d'ajout : bulle « + » du rail, **et** lien « + Ajouter » du titre | **une seule** : la bulle « + » dans le panneau, au-dessus des cartes, avec sa ligne d'invite |

Le vocabulaire n'est **sous aucun kill switch** : couper UI-6B ou UI-8 ne
ressuscite ni « Mes passions » ni « + Ajouter ».

## 2. Pourquoi « Gérer », et pas « Mes passions »

Le rail **dit déjà** « mes passions » : il les montre. Deux surfaces portant le
même titre pour deux gestes de nature différente, c'était une invitation à
chercher l'ajout dans le rail — exactement ce que la demande vient corriger.
C'est le **verbe** qui distingue les deux surfaces.

## 3. Ce n'est pas un retour en arrière sur le 2026-09-01

Il faut le dire clairement, parce que trois demandes successives ont déplacé
cette même bulle et qu'une lecture rapide y verrait une hésitation :

| Date | Demande | Où vit la bulle |
| --- | --- | --- |
| ≤ 2026-08-31 | — | rail du **Fil** |
| 2026-09-01 | « la bulle de rajout de passion doit être sur le profil, pas dans le fil » | rail du **Profil**, en queue |
| 2026-09-02 | rail coulissant : en queue, elle sortait du scrollport (mesurée à x=326 pour un rail arrêté à 304 px, à 320 px avec 3 passions) | rail du **Profil**, en **tête** |
| **2026-09-03** | « enlever la bulle + sur le profil passion et le mettre dans gérer mes passions » | **panneau `#passionManager`** |

Elle **reste sur le profil**. Elle descend seulement du rail vers le panneau qui
administre les passions. Et le raisonnement de 2026-09-02 sur la tête du rail
tombe avec elle : hors d'un conteneur `overflow-x: auto`, il n'y a plus de
scrollport dont sortir.

---

## 4. Les six pièges de ce chantier

### ① Le réécriveur qui aurait détruit la bulle en silence

`js/ui-v6b-profil.js` (UI-6B, **actif par défaut**, `MutationObserver` sur
`#screen-profiles`) portait `renommerSection()` : un vestige de vocabulaire qui,
à chaque rendu, réécrivait le titre du panneau **et** faisait

```js
lien.textContent = "+ Ajouter une passion";   // sur #nouveauProfilLien
```

`#nouveauProfilLien` est devenu la **bulle**. Cette ligne aurait remplacé ses
deux enfants — le rond pointillé et le libellé — par un nœud de texte nu, **au
boot**, sans ouvrir le panneau (`decorer()` ne teste que l'existence de
`#screen-profiles`, pas sa visibilité). La porte serait restée cliquable :
aucun test d'existence n'aurait rougi.

`renommerSection()` **et sa restitution dans `toutRendre()`** ont donc été
retirées. C'est la famille de défauts nº 1 du dépôt — *une décoration qui survit
à la disparition de sa cible* — et ici elle ne se serait même pas vue comme une
erreur.

⚠️ Corollaire : la restitution du kill switch ne doit **jamais** reposer un
libellé « d'origine » qui n'est plus celui du markup. Elle aurait écrasé
« Gérer mes passions » par « Mes passions » à la première coupure.

### ② L'id `nouveauProfilLien` est conservé, et c'est délibéré

C'est la **même porte**, seule sa forme change. Le garder évite deux pertes
silencieuses :

* l'aide contextuelle `second_profil` (app-06, `renderProfilesScreen`) la vise
  par sélecteur — `montrerHint` refuse une cible absente **sans erreur** ;
* cinq suites e2e la nomment.

Changer l'id aurait fait disparaître l'aide sans un seul rouge.

### ③ L'ancre de repli de l'aide `second_profil`

Le rail venait en second dans la cascade **parce qu'il portait la bulle** :
montrer le rail, c'était montrer la porte. Il ne montre plus que les passions
qu'on a déjà — une aide qui dit « tu peux en ajouter une autre » en le désignant
montrerait exactement ce qu'on possède. Nouvelle cascade :

`#nouveauProfilLien` → `#v6bModifier` (le crayon d'UI-6B) → `.profile-dots-btn`
→ `#v9ProfilePassions` en **dernier ressort**.

⚠️ **Le rail reste dans la liste, et ce n'est pas du zèle** : sous UI-6B le « ⋯ »
de la couverture est masqué (remplacé par le crayon), et sous le kill switch
c'est le crayon qui n'existe pas. Aucune des deux portes n'est visible dans tous
les états.

⚠️ **On teste `offsetParent`, pas l'existence.** La version d'avant se contentait
de `ecran.querySelector(".profile-dots-btn")` : sous UI-6B ce nœud **existe** et
est masqué, donc l'ancre était retenue puis refusée — le repli suivant n'était
jamais atteint.

### ④ `openCreateProfile`, pas `ouvrirRecherchePassionsCompte`

`ouvrirRecherchePassionsCompte` a été **retirée** avec la bulle du rail, dont
elle était l'unique appelant (règle : *pas de fonction globale sans appelant* —
l'audit du 2026-06-10 en avait trouvé sept).

⚠️ **La différence entre les deux n'est PAS le plafond.** Les deux le gardaient,
l'une par `plafondPassionsAtteint()`, l'autre par le `placesRestantes() <= 0` de
`PassioFlatUI.ouvrirAjoutPassions` — et toutes deux finissent sur
`openPassionPaywall`. La différence est le **repli** : sous la coupure
`flat_passions_v1="0"`, `ouvrirAjoutPassions` rend `false` et le tap est **mort,
sans un message**, là où `openCreateProfile` rend encore sa modale de choix
historique. Une porte de dernier recours ne peut pas dépendre d'un lot qu'un
kill switch éteint. **Le déménagement corrige donc un défaut au passage.**

### ⑤ La porte est du balisage STATIQUE, sœur de `#profileList`

`renderProfilesScreen` réécrit **`#profileList.innerHTML` en entier** (deux
branches), plus `#profilesQuotaSub` et `#passionArchiveBox`. La porte est posée
entre `#profilesQuotaSub` et `#profileList`, dans un frère
`.passion-manager-porte` : au-dessus des cartes (donc visible sans défiler) et
hors de toute zone réécrite. La faire rendre par `renderProfilesScreen`
obligerait à la recréer à chaque rendu et rouvrirait le risque de la perdre à la
première branche oubliée.

Conséquence voulue : **elle n'est plus sous `PassioFlatUI.actif()`**. La bulle du
rail n'existait que si le lot plat était actif ; celle-ci existe drapeau ou pas —
et c'est précisément ce qui rend le repli d'④ atteignable.

### ⑥ La bulle seule est MUETTE — d'où la ligne d'invite

Dans le rail, la bulle se lisait **par contraste** : entourée de passions, un
« + » et le mot « Ajouter » suffisaient. Seule dans le panneau, sous deux
paragraphes gris et au-dessus des grosses cartes, « Ajouter » n'annonce plus
**quoi**. `.passion-manager-porte-mot` est le libellé que le contexte lui
donnait : « Ajoute une passion à ton profil : elle apparaît dans ton rail, et son
contenu entre dans ton fil. »

⚠️ Elle est **inerte** — aucun `onclick`. Deux cibles pour un seul geste
referaient la faute de l'ancienne bulle « Toutes » (deux commandes, un résultat).

⚠️ **Aucun chiffre dedans.** Le décompte des places vit dans `#profilesQuotaSub`,
juste au-dessus, écrit par `renderProfilesScreen` : une seconde source dirait
faux dès le premier ajout.

Verrou : `③ bis bis` mesure le texte **et** l'absence de `onclick` — une porte
redevenue muette ne ferait broncher aucun test de présence.

### ⑦ Aucun `onkeydown`, aucune ligne de CSS

`app-08` porte un écouteur **délégué** qui active à Entrée/Espace tout
`[role="button"]` non natif. En ajouter un second produirait **deux activations
pour une touche**. `role` + `tabindex` suffisent.

Et `.psel-tile-plus` / `.profile-tile` n'ont jamais été ancrées à un rail : le
déménagement n'a coûté **aucune règle**. Ne les ancrez pas à une surface — la
tuile « Chercher » de Rencontrer les partage.

⚠️ Un seul effet visuel change : `.profile-strip.has-filter .profile-tile:not(.active)`
grisait la bulle « + » (`opacity: .4`, `grayscale(.6)`) dès qu'une passion était
cochée — la porte d'acquisition s'estompait comme un critère non retenu. Hors du
rail, elle ne se grise plus jamais.

---

## 5. Les tests : assertions retournées, jamais vidées

| Suite | Ce qui change |
| --- | --- |
| `profil-entete-passions.spec.js` | `③` : 3 bulles au lieu de 4. **Nouveau `③ bis bis`** : la porte a quitté le rail **et** existe dans le panneau — les deux moitiés dans le même cas, sans quoi « retirée et jamais reposée » passerait. `③ quater` 7→6, `③ quater bis` 11→10. **`③ nonies` change de surface**, il n'est pas supprimé (voir ci-dessous). `mesurerRail` perd `plus`/`plusDansLeChamp`. |
| `passions-plates.spec.js` | le helper `ouvrirRecherche` ouvre le panneau. `⑰` (kill switch) mesure désormais que la porte **existe** et rend la **grille historique** au lieu de la feuille de recherche — plus fort que l'ancienne absence. `⑰ bis` prouve le lot par `etat.actif`, pas par un comptage devenu muet. `㉑` retourné dans les deux sens. |
| `ui-v7-lot.spec.js`, `ui-v6b-profil.spec.js` (×3) | lisent l'`aria-label` et `.profile-tile-label` de la bulle, et `#passionManagerTitre` — plus un `textContent` de lien. |
| `ui-v8-passions.spec.js` | la porte reste visible, et porte son `aria-label`. |

⚠️ **`③ nonies` n'est pas supprimé avec la bulle.** La question qu'il pose —
« la porte est-elle réellement **peinte**, ou seulement dans le DOM ? » — vaut
pour toute porte, où qu'elle vive. Supprimer le cas avec sa cible aurait rendu le
déménagement gratuit. Il mesure maintenant, à 320 et 390 px et à 3 et 10
passions : panneau replié → boîte vide (comportement voulu, et prémisse
explicite) ; panneau ouvert → boîte non vide, dans la fenêtre, ≥ 44 px de haut.

⚠️ **Piège de casse** : « Gérer mes passions » ne **contient pas** « Mes
passions » (M majuscule). Trois `.toContain("Mes passions")` seraient devenus
rouges ; ils visent maintenant `#passionManagerTitre`, une ancre stable — les
anciens lisaient `nouveauProfilLien.parentNode.textContent`, qui a changé de
parent avec la bulle.

---

## 5 bis. Trois survivants trouvés par la relecture croisée

Les gates statiques étaient verts et les 156 tests des suites touchées passaient
quand une relecture adversariale a trouvé ceci. Aucun des trois n'était visible
d'un audit mécanique : tous survivent à la disparition de leur cible **sans rien
casser**.

### ① Un bouton qui nommait le geste et ne le livrait plus

`renderFeedExplorationFallback` (app-02), repli du fil vide :

```js
'<button class="btn ghost" onclick="goTo(\'profiles\')">➕ Ajouter une passion</button>'
```

`goTo('profiles')` tenait sa promesse en un tap tant que la bulle « + » était en
tête du rail. Après le déménagement, il dépose l'utilisateur sur un écran où
**plus rien n'annonce l'ajout** : trois taps à deviner. Le bouton ne nomme pas la
cible, donc ni `audit:handlers` ni aucune des cinq suites réécrites ne pouvaient
le voir — et `feed-premier-rendu.spec.js` **validait le cul-de-sac** en exigeant
la liste `["goTo('profiles')", …]`.

`ouvrirGestionPassionsDepuisPaywall` est renommée **`ouvrirGestionPassions`**
(elle ne sert plus le seul paywall) et devient la cible de ce bouton. Le test
exige maintenant le handler **et** le résultat : après le clic, la porte d'ajout
est peinte.

Même famille, pré-existant depuis le 2026-09-01 : l'état vide du fil disait
« Ajoute une passion **ci-dessus** » — le rail du Fil n'a plus de porte depuis
deux jours. Réécrit.

### ② La boucle « mur → panneau → mur », rouverte par le déménagement

L'invariant de la fiche 16 fermait un cycle : quota épuisé → le paywall retire
« Gérer mes passions ». Il ne suffisait plus.

Au plafond **avec des changements restants**, le chemin le plus fréquent commence
maintenant dans le panneau : on tape la bulle, le mur s'ouvre, et le bouton
« Gérer mes passions » renvoie **exactement là d'où l'on vient**, devant la même
bulle qui vient de refuser. Avant le 2026-09-03 il déplaçait vraiment.

`_paywallCacheGerer()` (app-06) le retire dans les **deux** cas : quota épuisé,
ou panneau déjà ouvert **et à l'écran**.

⚠️ `offsetParent`, pas `.hidden` : le panneau vit dans `#screen-profiles`, qui
peut être inactif — déplié sur un écran qu'on ne regarde pas, il n'est pas « déjà
là », et le bouton reprend tout son sens. Le verrou mesure les deux sens : retiré
depuis le panneau, **présent** depuis le Fil.

### ③ Le câblage que rien n'exerçait

Les douze cas du dépôt qui touchent `#passionManager` l'ouvrent tous par
`page.evaluate(() => openPassionManager())`. Aucun ne clique la porte qui y mène.
Supprimez l'entrée « 🗂️ Gérer mes passions » du menu ⋯ — la seule porte vers la
seule porte d'ajout — et la suite complète reste **verte**. C'est mot pour mot la
leçon d'`adopterCompteConnecte` inscrite dans CLAUDE.md.

`③ bis ter` ne fait donc que des **gestes** : crayon → entrée du menu → bulle →
chemin d'ajout ouvert. Et `③ bis quater` prouve le contrat de fratrie (deux
`renderProfilesScreen()` de suite : la porte est toujours là, une seule, ses deux
enfants intacts).

Ajouté aussi : `aides-contextuelles.spec.js` exerçait **un seul** des quatre crans
de la cascade d'ancres. Un cas jumeau sous `passio_ui_6b="0"` — l'état où le
crayon n'existe pas — couvre les suivants.

## 6. Ce qui n'a PAS changé, et ne doit pas changer

* **Cinq surfaces homonymes hors profil restent intactes** : l'intention IRL
  « Mes passions » (`ui-v4a0-tete.js`, id `passio`), la section du panneau
  Filtres (`ui-v4a5-filtres.js`), le bouton `.fr-only` des Paramètres
  (`index.html`), la carte de bienvenue (`first-run.js`) et les libellés du
  sélecteur. Elles ne montrent pas le panneau d'administration, et des suites
  e2e distinctes les assertent.
* **L'état vide du rail** garde son lien « Ajouter une passion » : ce n'est pas
  la bulle, c'est le démarrage à froid — un compte à zéro passion, où le rail
  n'affiche rien d'autre.
* **Le plafond et le quota** : rien n'est touché. `PASSIONS_OFFERTES = 3`,
  `CHANGEMENTS_PASSION_OFFERTS = 3`, gardes aux deux bouts. La porte n'est
  toujours pas gardée par `requireAuthentication` — c'est le plafond
  **universel** qui borne un visiteur, décision de la fiche 16.
* **La découvrabilité baisse, et c'est le prix assumé du lot.** Pour un compte
  qui possède déjà une passion, l'ajout demande trois gestes (⋯ → « Gérer mes
  passions » → bulle) au lieu d'un rail visible dès l'arrivée. Si la question
  revient, la réponse n'est **pas** de remettre la bulle dans le rail — elle y
  mélangeait filtrer et acquérir, et le rail coulissant l'expulsait du scrollport
  en queue — mais d'enrichir le panneau ou le menu ⋯.
* **Sous `passio_ui_8="0"` la porte ne bouge pas.** `renderProfilesScreen`
  bascule sur la branche historique, `renderProfilePassionRail` **retire le rail
  du DOM** et `renderPassionArchiveBox` vide sa boîte : la bulle, statique,
  reste, et `openCreateProfile` fonctionne dans les deux mondes. Aucun chemin ne
  laisse le panneau sans porte d'ajout.
* **Deux portes de production** ouvrent le panneau : l'entrée du menu ⋯ et le
  bouton « Gérer mes passions » du paywall (`ouvrirGestionPassions`,
  retiré quand le quota est épuisé — sinon mur → panneau → mur).

## 7. Le rail était décalé, et le correctif évident l'aurait cassé (2026-09-03)

Une fois la bulle « + » partie, le rail du profil ne portait plus que des
passions — et le décalage est devenu visible. Mesuré à 390 px avec trois
passions : les bulles occupaient **51 → 293** dans une colonne de contenu qui va
de **16 à 374**. Trente-cinq pixels de vide à gauche, **quatre-vingt-un** à
droite. Sous une carte d'identité centrée, le rail se lisait de travers.

La cause n'est pas un décalage mais un **alignement** : un conteneur flex range
ses enfants au DÉBUT, donc les 78 px de libre s'entassaient tous du même côté.

### Le correctif, et pourquoi ce n'est pas `justify-content: center`

```css
#v9ProfilePassions.v9-profile-strip > .profile-tile:first-child,
#profileStrip.profile-strip        > .profile-tile:first-child { margin-left: auto; }
#v9ProfilePassions.v9-profile-strip > .profile-tile:last-child,
#profileStrip.profile-strip        > .profile-tile:last-child  { margin-right: auto; }
```

Une marge `auto` ne distribue que du libre **positif**. Tant que la rangée tient,
les deux marges se partagent le vide et la rangée se centre ; dès qu'elle
déborde, il n'y a plus de libre, elles retombent à **0**, et le rail coulisse
depuis son vrai début.

`justify-content: center` fait la même chose dans le premier cas et **casse le
second** : il centre aussi la rangée qui déborde, le trop-plein part des deux
côtés, et la portion sortie à gauche devient **inatteignable** — `scrollLeft` ne
descend pas sous zéro. Mesuré par réinjection sur dix passions : la première
bulle partait à **−320 px**, définitivement hors du champ. C'est la raison pour
laquelle `③ decies bis` existe : à trois passions les deux écritures rendent
exactement la même image, et seul le cas qui déborde les sépare.

`flex: 1 1 0` est exclu pour la raison déjà racontée sous `.profile-tile` : il
comprimait les bulles au lieu de déplacer la rangée (défaut du 2026-09-02).

### Le Fil reçoit la même règle le soir même (2026-09-03)

« Aligne sur la largeur les bulles de passion sur le fil : la configuration de
base des utilisateurs est de 4 bulles, 1 pour Suivis et trois passions ; ensuite
les autres seront payantes donc ils switcheront sur le côté pour les voir, mais
je veux que la configuration à 4 bulles soit équilibrée dans la largeur,
centrée. » (Benjamin.)

La demande décrit **exactement** le comportement des marges auto, et c'est
pourquoi elle ne coûte qu'un sélecteur de plus. La configuration de départ est
une rangée qui **tient** :

| à 390 px, sous UI-7 | calcul | résultat |
| --- | --- | --- |
| 4 bulles (Suivis + 3 passions) | `4×62 + 3×10 + 2×10` | **298 px** pour 390 → centrée, 40 px de vide de chaque côté (mesuré en `offsetLeft`, à l'unité près) |
| 11 bulles (Suivis + 10) | déborde | marges à **0**, le rail part de son vrai début, première bulle entière dans le champ |

Le jour où les passions payantes feront dépasser la rangée, le centrage
disparaît **de lui-même** : c'est la seconde moitié de la demande, et elle est
obtenue sans aucune condition en JS.

⚠️ La mesure en `getBoundingClientRect()` donne 37,8 / 40 au lieu de 40 / 40 :
`.profile-strip.has-filter .profile-tile:not(.active)` porte
`transform: scale(0.95)`, qui déplace le **rectangle** sans déplacer la boîte de
mise en page. La rangée est bien symétrique ; c'est la décoration qui ne l'est
pas. Les tests tolèrent donc quelques pixels — ce qu'ils prouvent est « au
milieu, et pas dans le coin », l'ancien état laissant plus de 60 px d'écart.

### ⚠️ Le bornage, et le test qui a failli être vert par accident

La règle est ancrée à des **identifiants**, jamais à `.profile-strip` seule, qui
est **partagée par trois surfaces** : le Fil (`#profileStrip`), mon profil
(`#v9ProfilePassions`) et le profil visité (`#visitedPassions`). Les deux
premières sont centrées ; **le profil visité garde son alignement au début** —
il n'a pas de configuration de départ à quatre bulles, et rien n'a été demandé
pour lui.

Le verrou de bornage (`③ decies quater`) a d'abord été écrit avec les **trois**
passions du socle. Sur le Fil, ce fixture peint **cinq** bulles (« Suivis » et
les envies s'y ajoutent) : la rangée **déborde**, donc elle est collée au début
*quoi qu'il arrive* — marges auto ou non. Le test était vert **sans rien
distinguer**. Il pose désormais **une seule** passion, pour que la rangée du Fil
tienne et que le centrage, s'il fuitait jusque-là, se voie.

L'état vide (`.v9-strip-empty`) n'est pas visé : ce n'est pas un
`.profile-tile`, et une phrase n'est pas une rangée de bulles.

### Verrous

`tests/e2e/profil-entete-passions.spec.js` — `③ decies` (trois passions :
centrée, et il reste du vide à répartir), `③ decies bis` (dix passions : la
rangée déborde et la première bulle reste atteignable), `③ decies ter` (une
passion seule est à la fois `:first-child` et `:last-child`), `③ decies quater`
(le Fil se centre AUSSI, le profil visité garde son alignement),
`③ decies quinquies` (le Fil dans sa configuration de départ : quatre bulles,
centrées) et `③ decies sexies` (onze bulles : le Fil déborde, sa première bulle
reste atteignable).

Éprouvés par **réinjection**, eux aussi : sans la règle posée sur
`#profileStrip`, `③ decies quater` et `③ decies quinquies` tombent et
`③ decies sexies` reste vert ; avec `justify-content: center` à la place, c'est
l'inverse — `③ decies sexies` tombe, la rangée démarrant à **−224 px** du bord
intérieur du rail.

⚠️ Les deux derniers **vident `_activeFeedPassions`** avant de mesurer : le rail
du Fil complète les passions possédées par les « envies » actives sans profil
(`_interet_…`), et avec le socle il peint cinq bulles — donc il déborde, donc le
cas ne mesurerait plus rien. Poser la prémisse, jamais espérer la trouver.

Éprouvés par **réinjection** : sans le correctif, `③ decies` et `③ decies ter`
tombent ; avec `justify-content: center`, `③ decies bis` tombe et les autres
restent verts.
