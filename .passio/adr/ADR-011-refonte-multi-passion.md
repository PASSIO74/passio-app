# ADR-011 — Refonte multi-passion : sélection additive du Fil, profil à deux onglets, retrait du Carnet de voyage

- **Statut** : Accepté
- **Date** : 2026-08-31
- **Complète** : [ADR-010](ADR-010-identite-publique-unique-passions-classification.md), dont il conserve le modèle (une identité publique, des passions qui classent) et **amende deux décisions d'interface**.
- **Amende** : ADR-010 § « Fil » (les deux vues exclusives « Accueil » / « Suivis »).

## Contexte

ADR-010 a fixé le modèle de données et de vocabulaire : un compte, une identité
publique, des passions qui **classent** le contenu et servent de **préférence de
lecture**. Il a livré, dans la foulée, deux **vues exclusives** du Fil — « Accueil »
(union des passions cochées et des comptes suivis) et « Suivis » (les comptes
suivis, rien d'autre) — où toucher une passion quittait « Suivis ».

Cette exclusivité n'était pas un choix esthétique : le moteur (`renderFeed`) ne
consultait pas `_activeFeedPassions` en vue « suivis ». Laisser une passion cochée
y aurait affiché un contrôle sans effet — un clic mort. **La contradiction était
rendue impossible plutôt qu'affichée.**

À l'usage, ce modèle demande à l'utilisateur de choisir *une manière de lire* avant
de choisir *ce qu'il veut lire*. Or les trois familles de critères — les gens qu'on
suit, les passions qui nous intéressent, l'envie du moment — répondent à la même
question et devraient s'additionner.

Trois autres constats, indépendants, ont été traités dans le même chantier :

1. **Le profil disait trois fois la même chose.** Une ligne « Passion active », une
   rangée de puces sous « Publications », une seconde sous « Activités » — trois
   surfaces pour une seule question, avec deux réponses possibles (les deux filtres
   étaient indépendants). L'onglet « À propos » en portait une quatrième : la liste
   des cartes de passion.
2. **L'identité affichée variait d'un écran à l'autre.** Chaque surface écrivait un
   nom à sa façon ; deux écrans de recherche portaient chacun leur variante de
   pastilles de passion. On ne voyait pas la même personne selon l'endroit.
3. **Le Carnet de voyage était une application dans l'application** — écran, éditeur,
   viewer plein écran, lives, étapes, commentaires et réactions d'étape, « Mes
   lieux », passeport, géocodage — pour une promesse hors du cœur produit.

## Décision

### 1. Le Fil est une SÉLECTION ADDITIVE (OU inclusif)

Trois familles de critères, toutes cumulables. Une publication entre dès qu'elle
satisfait **au moins un** critère coché :

```
auteur suivi   OU   passion cochée   OU   envie cochée
```

- « Suivis » devient un **critère** parmi d'autres, plus une vue. Il vit dans
  `state.feedFollowingOn` (booléen persisté) et se coche dans le rail, à sa place
  historique.
- Les passions restent **multi-sélectionnables** (`_activeFeedPassions`).
- Les envies du moment (le rail `#feedIntentSelector` : Explorer · Apprendre ·
  Idées · Rencontrer) deviennent **multi-sélectionnables** et **filtrantes** —
  elles étaient jusqu'ici à choix unique et ne pilotaient que le classement. Elles
  vivent dans `state.feedIntents`. « Tous » reste le **neutre** : aucune envie cochée.
- Les résultats sont fondus dans **une seule liste**, dédupliquée par `p.id`, puis
  classés par le moteur existant. Aucune section par passion, par envie ni par source.
- Cocher l'un n'éteint jamais l'autre.

**Migration.** `state.feedView` valait `"accueil"` ou `"suivis"`. Les deux
incluaient les comptes suivis — l'une comme union, l'autre comme seule source :
les deux se migrent donc en `feedFollowingOn: true`. C'est ce qui **préserve
l'acquis d'ADR-010** — suivre quelqu'un garde un effet observable et durable, sans
bascule à réarmer.

⚠️ **Le défaut par défaut ne doit pas ÉLARGIR.** `selectedMoods` (le rail legacy)
démarre à `{"creation"}` ; en OU, un critère coché d'usine aurait ouvert le fil au
lieu de le restreindre. `state.feedIntents` démarre donc **vide** : sans geste, il
n'y a pas de critère d'envie. Et le rail legacy n'est pas touché — il reste sous
son kill switch, avec son comportement d'origine à l'octet près.

### 2. Le profil : un sélecteur unique, deux onglets

- Les passions se présentent **en haut du profil**, dans le **même composant** que
  le Fil (`passionTileHTML`, app-02 — mêmes classes `.profile-tile*`, donc mêmes
  dimensions, espacements et états visuels), **au-dessus** des onglets.
- **Choix UNIQUE** ici, contre multi-sélection sur le Fil : le profil répond à
  « je regarde quelle partie de cette personne ? », le Fil à « qu'est-ce que je
  veux voir ? ».
- La sélection commande **les deux onglets à la fois**. Les deux clés historiques
  (`profilePostFilterId`, `profileEventFilterId`) restent écrites, **tenues égales**.
- **Deux onglets** : « Publications » et « Activité ». Les cinq icônes de type de
  contenu restent des sous-filtres de « Publications ».
- **Retirés** : l'onglet et le panneau « À propos », la ligne « Passion active »
  (`#v8ActivePassion`), le sélecteur d'identité (`openPassionSwitcher`) et les deux
  rangées de puces jumelles (`#v8PostFilter`, `#v8EventFilter`).
- **La même mécanique s'applique au profil d'autrui**, avec une section « Activité »
  qui montre les sorties qu'il **organise** — jamais ses participations, qui ne sont
  pas chargées pour un tiers et qu'on n'inventera pas.

⚠️ **Retirer un onglet ne doit pas fermer une fonction.** « À propos » portait la
gestion des passions (ajouter, illustrer, archiver). Elle vit désormais dans
`#passionManager`, un panneau replié qu'ouvre l'entrée « Mes passions » des options
du profil. Sans cette porte, ajouter une passion serait devenu inatteignable —
c'est exactement le défaut du Studio après un carnet (2026-08-29).

### 3. L'identité affichée est centralisée

`identitePassionsHTML(u)` / `identitePassionsTexte(u)` (app-02) rendent, sous le
pseudo, les passions du compte :

```
Benjamin
Moto · Podcast · Voyage
```

Appliqué aux cartes de publication, au post ouvert, aux commentaires et réponses,
aux listes d'abonnés/abonnements, aux deux écrans de recherche, aux notifications,
à l'inbox Messages, à mon profil et au profil visité.

⚠️ **Trois règles non négociables**, chacune payée par un défaut réel de ce dépôt :
① `passionsPubliques()` et jamais la liste brute — le jsonb `profiles.passions`
contient les passions **archivées** (porte dérobée ② du lot UI-8) ; ② ces libellés
sont **du contenu d'autrui**, donc échappés ; ③ le rendu est **borné** (3 + « +N »)
et tronqué en CSS — une identité longue pousserait hors de l'écran l'action posée
à côté d'elle.

### 4. Toutes les interactions appartiennent au profil principal

Publier, commenter, répondre, aimer, partager, suivre, envoyer un message, participer
à une activité : toujours au nom du compte. **Le Studio est le seul endroit où l'on
choisit la passion de destination d'un contenu** — et il s'en souvient
(`onStudioPassionChange` → `switchToProfile`), sans quoi la passion d'inscription
serait devenue un choix définitif.

Écriture et lecture restent **indépendantes** (ADR-010, décision 6) : choisir sa
passion de publication ne touche pas les préférences du fil, et réciproquement.

### 5. Le Carnet de voyage est retiré de l'application

Écran, éditeur, viewer, lives, étapes, « Mes lieux », passeport, géocodage, liens
profonds, abonnements temps réel, contenu de démonstration, sous-filtre « Carnets »
du profil, entrée de navigation, étape du tour d'accueil, raccourci IA, pont
IRL↔CDV : tout part. `goTo("cdv")` est **redirigé** vers le fil, sur le modèle de
`goTo("wallet")` après ADR-009 — un ancien lien profond ne doit jamais laisser
l'application sans écran actif.

**Aucune migration destructive.** Les carnets déjà écrits restent dans
`localStorage`, dans les publications de type `vlog` et dans les tables `cdv_*` de
la base. Les tables restent dans la publication realtime ; on cesse seulement de
les écouter.

⚠️ **Le typage `vlog` est CONSERVÉ à la lecture** (`supaLoadPosts`), et c'est une
garantie de confidentialité, pas une survivance : la visibilité d'un carnet
(« public / abonnés / privé ») vivait dans un blob jsonb, hors de portée de la RLS.
C'est ce type qui permet à `allFeedPosts` de les écarter **tous**. Le retirer ferait
retomber un carnet « Privé » sur son type de média et l'afficherait, en clair, dans
le fil de tout le monde.

## Conséquences

- **Aucune migration de base.** Le schéma tient déjà ce modèle ; seuls des états
  locaux changent de forme, et ils se migrent au chargement.
- **`_kmBetween` reste** dans app-03 : `app-07` s'en sert pour trier les activités
  par proximité. C'est de la géométrie, pas du voyage — la retirer aurait fait
  retomber toutes les distances à 0, sans qu'aucune erreur ne le dise.
- Les badges d'assiduité « voyages / kilomètres / pays » valent désormais zéro.
  Ils ne sont **pas** supprimés : ils restent visibles comme non acquis, plutôt que
  de disparaître d'un profil qui les affichait hier.
- Les notifications de carnet déjà reçues restent affichées ; les toucher ramène
  au fil.

## Alternatives écartées

- **Garder les deux vues exclusives et ajouter les envies dedans** : rejeté. Cela
  aurait conservé la question « quelle manière de lire ? » avant « quoi lire ? »,
  qui est précisément ce que la refonte retire.
- **Supprimer les données de carnet en même temps que la fonctionnalité** : rejeté,
  et la consigne le demandait explicitement. Une fonctionnalité peut revenir ; un
  contenu détruit, non.
- **Laisser le moteur CDV en place derrière un drapeau** : rejeté. Un kill switch
  aurait dû restituer un écran, une navigation et un viewer — c'est-à-dire garder
  vivant tout ce que ce retrait supprime. La réversibilité tient ici à `git`, pas
  à un drapeau.
- **Un sélecteur de passion propre au profil** (des puces, comme avant) : rejeté.
  La consigne demande le composant du Fil, et c'est le bon critère : deux surfaces
  qui posent la même question doivent se ressembler.

## Trigger de réexamen

- Un fil devenu illisible pour un compte cochant beaucoup de critères à la fois —
  le OU inclusif ne borne rien par construction.
- Une demande répétée et observée de retrouver les carnets de voyage, qui rouvrirait
  la question de leur place (fonctionnalité à part, ou simple type de publication).
