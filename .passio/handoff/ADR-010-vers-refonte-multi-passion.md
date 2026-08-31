# Passation — ADR-010 → refonte multi-passion

**Écrit le 2026-08-31 par la session ADR-010, à l'intention de la session qui
implémente la refonte multi-passion.** Sa consigne lui demande de reconstituer
mon travail depuis `git`. Ce document lui évite de le deviner : il dit ce qui
est fait, ce sur quoi s'appuyer, et **les cinq endroits où sa consigne
contredit ce que je viens de livrer**.

> Sur les conflits fonctionnels, la consigne de la refonte est PRIORITAIRE.
> Ce document ne défend rien : il dit ce qu'il faudra défaire sciemment, et à
> quel prix, pour qu'aucune correction ne soit annulée par accident.

---

## 1. Où en est mon travail

- Branche `claude/multi-profile-clarity-nbk6xd`, tête **`9696e92`**, poussée.
- **PR #227 ouverte, NON fusionnée.** CI verte sur `fe21437` (run 2344) ; un run
  tourne sur `9696e92`.
- `main` est à `43b8ffa` et contient déjà le hotfix P0 confidentialité (#226).
- Arbre de travail **propre**. Je n'écris plus sur cette branche.

**Construire dessus, pas à côté.** `main` ne contient PAS ADR-010. Partir de
`main` ferait perdre les correctifs ci-dessous, dont deux P0.

---

## 2. Ce qui est acquis, et sur quoi s'appuyer

### Classification des passions (le socle réutilisable)

Tout est dans `app-02`, exposé globalement :

| Fonction | Rôle |
|---|---|
| `estPassionCanonique(id)` | l'id existe-t-il dans le référentiel ? Union du socle local `PASSIONS` et de la table serveur `passions`. Liste BLANCHE. |
| `classerPassion(id)` | `"null"` / `"canonique"` / `"non_canonique"` |
| `optionalCanonicalPassion(id)` | la valeur, ou `null` — pour les tables à politique facultative |
| `passionsPubliables()` | ce qu'on a le droit de PROPOSER à l'écriture |
| `passionParDefautPourPublier()` | ce que CE compte possède de publiable |
| `passionDeRepartage(source)` | classement hérité lors d'un repartage |
| `publicationRefuseeFautePassion(p)` | **garde commun, à appeler AVANT toute mutation locale** |
| `passionsPubliques(list)` | la liste vue par un VISITEUR — retire les archivées |
| `passionsVivantes()` | mes passions non archivées |

**Politique par table** — la clé étrangère `passion_id → passions(id)` est la
même sur cinq tables, l'invariant produit ne l'est pas :

| Table | Politique | Comportement |
|---|---|---|
| `posts`, `events` | obligatoire | refus **avant** la requête |
| `profiles`, `stories`, `conversations` | facultative | normalisé en `null`, l'écriture aboutit |

### Écriture du profil public : trois API étroites (#226, déjà en production)

`supaUpsertProfile` **n'existe plus comme opération** : ce n'est qu'un ALIAS de
`supaEnsureProfileExists`. Il n'écrit AUCUN champ d'une ligne existante.

| API | Autorité |
|---|---|
| `supaEnsureProfileExists()` | la ligne doit exister. N'écrit rien d'autre. Cache par UID. |
| `supaSavePublicProfile({…})` | liste blanche de champs réellement édités |
| `supaSavePassionState()` | `passions` et `passion_id` seulement |

> ⚠️ **Appeler `supaUpsertProfile()` pour publier est un no-op SILENCIEUX.**
> Quatre chemins l'ont fait sans que rien ne le signale (photo de passion,
> couverture, retrait de couverture, bio) : l'appel présent, la fonction
> existante, l'écriture jamais partie. Verrou : `multi-passion-integrite` ⑩,
> qui refuse tout appel à ce nom depuis un fichier de production.

---

## 3. LES CINQ CONFLITS avec la consigne de la refonte

### ⚠️ C1 — « Suivis » : j'ai livré l'EXCLUSIVITÉ, la consigne veut l'ADDITIVITÉ

C'est le conflit le plus direct, et il date d'il y a une heure (`9696e92`).

- **Consigne §4** : « Suivis est un choix sélectionnable, au même titre qu'une
  passion. Sélectionner une passion ou un mood ne doit pas désactiver Suivis. »
- **Ce que j'ai livré** : `state.feedView` vaut `"accueil"` OU `"suivis"`, et
  toucher une passion depuis « Suivis » **ramène en « accueil »**.

**Pourquoi je l'ai fait ainsi, à ne pas relire comme un caprice** : le moteur
(`renderFeed`, app-02 ~4320) **ne consulte PAS `_activeFeedPassions` en vue
« suivis »**. Laisser une passion cochée y aurait donc affiché un filtre sans
effet — un clic mort. L'exclusivité rendait la contradiction impossible.

**Ce qu'il faut faire** : la consigne §4 supprime la cause. « Suivis » cesse
d'être une *vue* pour devenir un *critère* — un booléen à côté de
`_activeFeedPassions`. Le moteur consulte alors les trois sources en union.
`state.feedView` disparaît au profit de quelque chose comme
`state.feedSuivis: true|false`.

**À prévoir, sinon ça mordra :**
- `state.feedView` est **persisté** et migré dans `loadState` (app-02 ~164). Une
  valeur héritée doit se convertir, pas être ignorée.
- **Trois de mes tests verrouillent l'ancien comportement et DOIVENT être
  réécrits** (`tests/e2e/feed-vues-adr010.spec.js`) : ⑥ (« aucune passion
  active »), ⑥ ter (bascule), **⑥ quater (« toucher une passion rend la vue
  accueil ») — celui-ci exige littéralement l'inverse de la consigne**.
  Les voir rouges ne signifie PAS que la refonte a cassé quelque chose.
- ⑥ quinquies (« sans aucune passion, Suivis reste atteignable ») **garde sa
  valeur** : c'est un défaut réel corrigé, voir C5.

### ⚠️ C2 — les moods sont un filtre ET, la consigne les veut en source OU

`_moodVisible(p)` (app-02 ~4351) s'applique **après** la sélection des sources :
aujourd'hui `(passions OU suivis) ET mood`. La consigne §4 veut
`passions OU suivis OU mood`.

Ce n'est pas un réglage, c'est un **déplacement d'étage** : le mood passe de
filtre à source. Deux pièges connus à ne pas rouvrir :

- `selectedMoods` démarre à `{"creation"}` et `state.feedMoodsTouched` existe
  pour que le défaut ne masque pas tout le contenu (« RÈGLE ABSOLUE » §7,
  commentée dans app-02). En mode OU, un mood coché par défaut **élargirait**
  au lieu de restreindre : le comportement par défaut change de sens.
- `PASSIO_MOOD_LABELS` est la **seule** source de vérité des moods, et une liste
  BLANCHE. Ne pas relire les moods depuis le DOM de `#moodSelector` : il est
  masqué par UI-7, et c'est exactement le défaut corrigé par la PR #198.

### ⚠️ C3 — « À propos » et « Passion active » : trois lots à défaire proprement

La consigne §1 veut deux onglets et supprime « À propos » et « Passion active ».

- Les **trois onglets** viennent de **UI-7 §6** (`js/ui-v7-lot.js`, ~ lignes 17,
  144-146). Ils sont sous le drapeau `passio_ui_7`.
- La ligne **« Passion active »** (`#v8ActivePassion`) et les **deux filtres
  jumeaux** `profilePostFilterId` / `profileEventFilterId` viennent de **UI-8**
  (`app-06`). La consigne les remplace par **un seul** sélecteur au-dessus des
  onglets : les deux états fusionnent en un.
- ⚠️ **`profilePostFilterId` a une migration** (`app-06` ~1453) qui convertit
  l'ancien `profileFilterIds` multiple. Elle ne tourne qu'une fois
  (`_v8FiltresMigres`). Renommer l'état sans reprendre cette migration perd le
  filtre des comptes existants, en silence.
- ⚠️ **Retirer « Passion active » retire le seul appelant de `switchToProfile()`
  sur cet écran.** `currentProfileId` reste la source de vérité de l'identité
  d'écriture ; après §3, le Studio en devient le seul point de choix. Vérifier
  qu'aucun compte ne peut se retrouver avec un `currentProfileId` pointant une
  passion **archivée** — `currentProfile()` rend `null` dans ce cas, et tout le
  lot UI-8 suppose cet état impossible. Le nettoyage vit aux points d'ÉCRITURE
  (`archiverPassion`, `deleteProfile`, `restaurerPassionActiveApresFusion`).

### ⚠️ C4 — l'identité partagée (§2) peut rouvrir une fuite déjà fermée

« Benjamin / Moto · Podcast · Voyage » partout : le composant doit lire
**`passionsPubliques(list)`**, jamais la liste brute.

`profiles.passions` (jsonb) contient AUSSI les passions **archivées**, marquées
`archived: true` — délibérément, car cette colonne sert de sauvegarde relue au
boot d'un appareil neuf. Les afficher telles quelles ferait réapparaître chez
tout le monde les passions qu'un utilisateur a rangées. C'était la **porte
dérobée ② du lot UI-8**, corrigée.

⚠️ Ces libellés sont **du contenu d'autrui** : toute session authentifiée écrit
sa propre ligne `profiles`. Échapper à l'affichage — `escapeHtml` en texte,
`escapeJsArg` dans un `onclick`, `safeUrlAttr` pour une URL.

### ⚠️ C5 — un défaut réel à ne pas réintroduire en refaisant le rail

`renderProfileStrip` (app-06) sortait tôt (`box.innerHTML = ""`) dès qu'aucune
passion n'était résoluble — et emportait la tuile « Suivis » avec lui. Un compte
**neuf qui suit déjà quelqu'un** perdait toute commande vers leurs publications,
sans moyen d'en sortir puisque la vue est persistée. Le défaut existait aussi
sur `main`.

La consigne §7 demande de **réutiliser ce composant sur le profil** : le refaire
sans ce garde recréerait le même enfermement. Verrou : ⑥ quinquies.

---

## 4. Points d'attention hors conflit

### Carnet de voyage (§6) — mesurer avant de couper

Mesuré le 2026-08-31 : **1 157 occurrences de `cdv` dans `js/`**, 40 dans
`index.html`, **162 règles CSS**, 4 fichiers de test dédiés, 10 routes/écrans.
C'est un retrait de l'ampleur d'ADR-009 (l'économie interne), dont les pièges
sont documentés dans `CLAUDE.md`. Les deux qui mordront ici :

- **Un renderer qui écrit dans un nœud supprimé lève.** ADR-009 : `renderTopbar`
  écrivait dans `#topPassia` sans garde, et cette fonction est rappelée à chaque
  publication et commentaire. Chercher tout `getElementById` visant un nœud CDV.
- **Retirer un gros bloc d'`index.html` emporte une balise structurelle
  voisine.** Compter `<main>`, `<section>`, `<div>` avant/après : le nombre
  d'erreurs `html.parser` doit être IDENTIQUE, pas nul (index.html en porte une,
  préexistante).
- **Les liens profonds `#cdv-live-<id>`** ont une chaîne de reprise (app-03).
  Retirer l'écran sans le routage laisse un lien qui ouvre le vide.
- `cdv.spec.js` est le fichier de test le plus lent (13,5 min) : le retirer
  raccourcit beaucoup la suite.
- **Ne pas migrer la base.** La consigne le dit, et c'est prudent : les données
  peuvent rester.

### Ressources partagées — j'ai libéré, à toi de les prendre

- **Port 8080** : libéré. Ma suite est arrêtée. `reuseExistingServer: true` →
  un `npm test` lancé sur le serveur d'autrui **ne prouve rien**.
- **Prod Supabase** : `global-teardown` purge TOUS les comptes
  `%@passio-e2e.test`. Une seule suite e2e à la fois.
- **Index git** : le hook `PostToolUse` fait `git add` à chaque édition, des
  deux sessions. Committer par
  `node .claude/scripts/session-registre.js commiter` (pathspec), jamais
  `git commit -a` ni `git add -A`.

### Verrous de test qui gardent des défauts réels — ne pas les affaiblir

| Fichier | Ce qu'il empêche |
|---|---|
| `multi-passion-integrite` ⑧ ⑨ ⑩ | écriture morte via l'alias ; passion principale `null` |
| `passion-politiques-ecriture` | les deux politiques par table |
| `publication-optimiste-refusee` | aucun post local sans passion canonique |
| `profil-confidentialite-interface` | un profil créé privé reste privé |
| `profil-trois-autorites` | pas de republication du profil entier |
| `passion-referentiel` | le référentiel serveur AJOUTE, il ne retranche pas |
| `adr-010-vocabulaire` | les formulations « profil passion » ne reviennent pas |

⚠️ **Ne pas retirer les blocs `/* … */` par expression régulière** dans un test
qui lit les sources : `accept="image/*"` ouvre un faux commentaire dont le `*/`
est mille lignes plus loin. Mesuré : 13 % des sources silencieusement ignorées.

---

## 5. Ce que je NE fais pas

Je n'implémente aucun point de la refonte : elle est assignée à l'autre session.
Je ne pousse plus sur `claude/multi-profile-clarity-nbk6xd` et je ne fusionne
pas #227 sans arbitrage de Benjamin — fusionner pendant que l'autre session
construit dessus déplacerait sa base sous ses pieds.
