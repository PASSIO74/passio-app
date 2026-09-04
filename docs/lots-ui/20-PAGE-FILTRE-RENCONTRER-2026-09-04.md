# 20 — La page « Filtre » de Rencontrer (2026-09-04)

> Maquette validée à l'appui. Le lot **UI-4A5** n'est pas remplacé : il est
> **réorganisé**. Même module (`js/ui-v4a5-filtres.js`), même drapeau
> (`localStorage.passio_ui_4a5 = "0"` · `window.PASSIO_UI_4A5 = false`), même
> bloc CSS — qui reste le **DERNIER** de `styles.css`.

---

## 1. Ce qui change, et ce qui ne change pas

L'écran garde sa tête : en-tête PASSIO, titre « Rencontrer », barre
« Rechercher une activité ou une ville », puis les trois cases
**Liste · Carte · Filtre**, l'active en **violet plein**.

Sous les onglets, la vue Filtre est réorganisée en **quatre sections nommées**,
dans cet ordre et rien d'autre :

| Section | Contenu | Ce qu'elle écrit |
|---|---|---|
| **Quand ?** | Aujourd'hui · Cette semaine · Ce week-end, puis « Choisir une date » qui déplie le vrai calendrier | `irlDateFilters` (`today`, `week`, `weekend`, `custom`) |
| **Où ?** | une carte compacte (lieu de référence + « Modifier »), puis 5 · 10 · 25 · 50 km | `irlSelectedCity` (sélecteur historique) et `irlDistanceFilter` |
| **Quelles passions ?** | Toutes · Mes passions · Chercher, puis les bulles de passion | `irlPassionFilters` |
| **Horaire** | Matin · Après-midi · Soir | `irlTimeFilter` |

Puis, **discrètement, sur une seule ligne** : « Mes événements | Mes
rencontres » (`irlFilters`, valeurs `mine` et `joined`). Et, **fixe au-dessus
de la barre d'onglets**, le bouton violet **« Afficher N résultats »**.

**AUCUN MOTEUR N'EST ÉCRIT ICI.** Le module ne fait que **poser des commandes
et miroiter l'état**. Les bulles de passion sont le nœud `#irlPassionRow`
**DÉPLACÉ** (donc toujours réécrit par `renderIrlPassionTiles`), le calendrier
est le volet `#irlPaneDate` **DÉPLACÉ** (donc toujours peint par
`_renderIrlInlineCal`, avec ses `onclick` inline intacts), et le nombre du pied
est celui que `_syncIrlFiltersFooter(n)` publie à chaque rendu.

---

## 2. Ce qui a quitté cette vue, et pourquoi

### Les quatre « intentions »

`Tous · Cette semaine · Ma ville · Mes passions` (UI-4A0/4A1) **ne sont plus
rendues dans la vue Filtre**. Chacune de leurs trois actions y est devenue une
commande explicite et nommée : « Cette semaine » est une case de « Quand ? »,
« Ma ville » est la carte de « Où ? », « Mes passions » est une case de
« Quelles passions ? ». Les garder aurait donné **deux** commandes pour le
même filtre, dans la même page.

⚠️ **Le module UI-4A0/4A1 n'est pas touché.** Sous `passio_ui_4a5="0"` les
intentions reprennent leur place dans la tête et dans le dialogue d'outils,
à la lettre. Leur suite (`ui-v4a1-intentions.spec.js`) pose déjà cette coupure
et garde **toutes** ses assertions.

⚠️ **Conséquence assumée** : `irlCityIntent` (le prédicat « seulement dans ma
ville ») n'est plus posable depuis la vue Filtre. Le filtre reste dans le
moteur, `clearAllIrlFilters()` continue de l'effacer, et le dialogue de repli
le repose. La carte « Où ? » + une distance couvre le besoin de façon plus
large : elle dit d'où l'on cherche ET jusqu'où.

### Les onglets carrés Date / Distance / Horaire

`.irl-ftabs`, `#irlPaneDist` et `#irlPaneTime` **restent dans la feuille
historique** (`#irlFiltersPanel`, masquée) : le curseur de distance devient
quatre paliers, la plage horaire devient trois cases. `renderIRL` continue de
les synchroniser (`_syncIrlDistanceUI`, `_syncIrlTimeUI`) — le kill switch
retrouve donc la feuille **complète**, avec ses trois volets.

Seul `#irlPaneDate` monte dans la page, sous « Choisir une date ».

---

## 3. Les six pièges de ce lot

### ① « Tout tient sur un écran » ne veut plus dire la même chose

La règle du **2026-09-02** — « je voudrais que tout tienne sur la page sans
descendre » — visait un panneau dont le bouton de validation était **hors de
l'écran** : valider ses choix demandait de descendre. La maquette du
2026-09-04 répond au même besoin autrement, et mieux : la page **défile**, et
le bouton est **FIXE**, donc toujours atteignable, à n'importe quelle hauteur.

Le verrou a suivi : « tout tient sur un écran » est remplacé par **« le bouton
violet reste au-dessus de la barre d'onglets, page en haut comme en bas »**,
mesuré aux deux extrémités du défilement. Un pied qui ne tiendrait qu'au départ
passerait le premier contrôle et échouerait au second.

### ② Le pied N'EST PAS dans `#screen-irl`

Il est posé dans **`.app-shell`**, en frère de `.app-main` et de `.app-nav`, et
positionné **en absolu par rapport à la coque**. Deux raisons, toutes deux
mesurées :

* dans `.app-main` (la zone de défilement), il descendrait avec le contenu —
  « toujours visible » ne serait vrai que sur une page courte ;
* en `position: fixed`, il s'étalerait sur **toute la fenêtre** au lieu de
  rester dans la colonne de 440 px du grand écran.

⚠️ **Sa distance au bas est celle de la barre d'onglets, safe-area comprise** :
`calc(62px + env(safe-area-inset-bottom, 0px))`, la valeur exacte de
`.app-nav`. Une constante nue suffirait sur Android (inset nul) et glisserait
le bouton **sous** la barre d'accueil d'un iPhone — le défaut déjà payé sur les
toasts. Le verrou lit la **déclaration CSS** : c'est la seule chose qu'un
navigateur sans encoche puisse prouver.

⚠️ Et le pied **mange 128 px en bas de la zone de défilement**
(`padding-bottom` sur `.app-main`, dans cette vue seulement). Sans cette
réserve, la dernière ligne du panneau — les raccourcis « Mes événements | Mes
rencontres » — passerait **sous** le bouton, et rien ne dirait qu'elle existe.

### ③ Flex, pas une grille à colonnes égales — et c'est mesuré

À 390 px, trois colonnes égales font 115 px, soit **101 px de texte**. « Cette
semaine » en fait **100,4 px** à 12,5 px de fonte, et la coche lui en ajoute
**13** : cocher « Cette semaine » cassait donc son propre libellé en deux
lignes, sous ses deux voisines restées sur une.

En flex (`flex: 1 1 auto`), chaque case se dimensionne sur **son** texte puis
grandit pour remplir la ligne — c'est ce que montre la maquette, où les trois
cases n'ont pas la même largeur. Et si la rangée déborde, c'est une **case
entière** qui passe à la ligne, jamais un mot coupé.

⚠️ **La distance garde quatre parts égales** (`flex: 1 1 0`) : « 5 km » et
« 50 km » sont assez courts pour que l'égalité tienne, et une échelle de
distances se lit mieux régulière.

⚠️ **Jamais d'ellipse sur ces libellés.** La règle du 2026-09-02 tient : à trois
colonnes, `text-overflow` sortait « Mes évène… » — une case qui ne dit plus ce
qu'elle fait. Le verrou balaie `scrollWidth > clientWidth` sur chaque libellé,
aux trois largeurs.

### ④ Le violet plein ne vaut QUE pour l'état coché

La demande du **2026-09-01** (« les grands carrés violets sont agressifs, mets
plutôt des carrés violet très léger et tu écris en violet foncé ») portait sur
le **repos**. Celle du 2026-09-04 (« utiliser le violet plein avec une coche
pour les choix actifs ») porte sur la **sélection**. Les deux tiennent
ensemble, et c'est la grammaire de toute la page :

* **repos** : lavis `--accent-tile`, écriture `--accent-2`, filet
  `--accent-tile-line` — jetons **OPAQUES**, jamais des `rgba` (le contrôle de
  contraste remonte au premier fond opaque et ignore l'alpha) ;
* **coché** : `--accent` plein, écriture blanche, **et la coche ✓**.

⚠️ **L'état ne tient JAMAIS à la seule couleur** : `aria-pressed` le dit, la
coche le redit. `cases-violet-leger.spec.js` mesure les deux états.

### ⑤ Un seul gestionnaire par clic sur les raccourcis

« Mes événements » et « Mes rencontres » portent `data-irlfilter`, dont la
**délégation globale existe depuis toujours** dans app-07. Le module ne pose
**aucun** écouteur dessus : un second gestionnaire basculerait **deux** fois par
clic, et le filtre paraîtrait mort. Le verrou clique deux fois de suite et
vérifie que l'état revient bien à son point de départ.

Même logique pour `aria-pressed` : `renderIRL` repose la classe `active`, le
module ne fait que la **refléter**. Jamais l'inverse — l'état vit dans
`irlFilters`.

### ⑥ « Ce week-end » est une VALEUR NEUVE du moteur

`weekend` n'existait pas dans `irlDateFilters`. Sans son prédicat dans
`_filterIrlEvents`, la case se serait cochée **sans rien filtrer** — un défaut
qu'aucun test d'attribut n'aurait vu. Le verrou compare les activités retenues
aux bornes calculées du week-end.

⚠️ **La ligne « Choisir une date » ne parle que pour une période venue du
CALENDRIER.** Cocher « Aujourd'hui » y écrivait « Aujourd'hui », juste sous la
case qui le disait déjà : la même information deux fois, pour deux commandes
différentes. Une période choisie au calendrier, elle, n'a aucune case pour la
porter — la ligne prend alors l'accent (`.is-set`) et affiche le résumé, sinon
la seule trace du choix serait un texte gris, que l'œil lit comme un repos.

⚠️ **Un dimanche, le week-end est celui qui finit ce soir**, pas celui d'après :
`_irlWeekendRange()` recule d'un jour quand `getDay() === 0`. Pointer six jours
plus loin ferait dire « ce week-end » à un filtre qui masque précisément les
activités du jour même.

---

## 4. Vocabulaire — « Filtre », au SINGULIER

Un seul mot, partout : la case du commutateur (`index.html`), le titre de la
feuille de repli, et `irlToolsSections().title`. Ni « Filtres », ni « Filtrer
les rencontres ». Le verrou balaie le **texte entier** de `#screen-irl` : retirer
le mot d'un endroit et l'oublier ailleurs est exactement le défaut qu'il garde.

Les **identifiants** ne bougent pas — `#irlToolsBtn`, `data-irlfilter`,
`data-irlpassion`, `passio_ui_4a5` : un titre n'est pas un identifiant d'écran
(piège ⑦ du lot UI-7).

---

## 5. Télémétrie

Les événements existants sont conservés (`ui_v4a5_ouvre`, `ui_v4a5_ferme`,
`ui_v4a5_reset`) et quatre s'ajoutent pour les nouvelles commandes :
`ui_v4a5_quand`, `ui_v4a5_dist`, `ui_v4a5_horaire`, `ui_v4a5_passions`, plus
`ui_v4a5_calendrier` et `ui_v4a5_lieu`.

⚠️ **La position précise de l'utilisateur n'est JAMAIS mesurée** : ni ville, ni
coordonnées, ni nom de lieu. `ui_v4a5_lieu` ne dit que « le sélecteur a été
ouvert ». Et aucune clé de `meta` ne percute le filtre PII de `telemetry.js`
(`pass`, `name`, `label`, `city`, `ville`, `lat`, `lng`, `location`…) : une clé
filtrée disparaîtrait **en silence**. Les clés retenues sont `v`, `quand`,
`km`, `plage`, `mode`, `ouvert`, `r`, `step`.

---

## 6. Fichiers

| Fichier | Ce qui change |
|---|---|
| `js/ui-v4a5-filtres.js` | construction du panneau et du pied fixe, synchronisation des états |
| `js/app-07-ia-explore-irl.js` | `_irlWeekendRange`, `weekend` dans `_filterIrlEvents`, `irlDateFilterActif`, `irlDistanceValue`, `setIrlDistanceKm`, `irlTimePresetKey`, `setIrlTimePreset`, `irlPassionsMode`, `setIrlPassionsToutes`, `setIrlPassionsMiennes`, `irlLieuReference`, `irlDateResumeTexte`, `window._irlResultCount`, titre au singulier |
| `index.html` | « Filtres » → « Filtre » sur le commutateur et la feuille de repli |
| `styles.css` | bloc UI-4A5 réécrit (toujours le **dernier** du fichier) |
| `tests/e2e/ui-v4a5-filtres.spec.js` | 24 cas |
| `tests/e2e/cases-violet-leger.spec.js` | mesure les nouvelles familles de cases, aux deux états |
| `tests/e2e/ui-v7-lot.spec.js`, `tests/e2e/contextual-nav.spec.js` | libellé au singulier |
