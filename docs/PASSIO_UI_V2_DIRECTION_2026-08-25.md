# PASSIO — Direction produit et interface du concept testable

**Date de décision :** 25 août 2026  
**Statut :** document directeur validant la nouvelle priorité  
**Source de vérité technique :** branche `main` du dépôt `PASSIO74/passio-app`  
**Organisation :** ChatGPT orchestre, Claude Code implémente par branches et PR, Codex contre-vérifie  

## 1. Décision exécutive

La priorité numéro 1 de PASSIO change officiellement :

> **Construire maintenant la nouvelle expérience visuelle et fonctionnelle complète, la rendre testable sur téléphone, puis la valider progressivement.**

Les chantiers de performance, de montée en charge et d’optimisation profonde sont suspendus jusqu’à validation du concept. Nous ne cherchons pas encore à rendre chaque nouvelle fonction parfaitement dimensionnée pour un million d’utilisateurs. Nous cherchons d’abord à répondre à trois questions :

1. L’utilisateur comprend-il immédiatement ce qu’est PASSIO ?
2. Le passage du contenu à la rencontre réelle paraît-il naturel ?
3. Les écrans, onglets et actions donnent-ils envie d’utiliser le produit ?

Les protections de sécurité déjà acquises restent actives. Elles ne sont pas supprimées. Elles deviennent des garde-fous de l’expérimentation, pas le chantier principal.

Cette décision remplace l’ancien ordre qui plaçait la refonte visuelle après la performance.

### Décision complémentaire validée — visuel du haut du Feed

Benjamin valide la nouvelle direction globale avec une conservation explicite :

> **Le sélecteur horizontal des profils Passio et le style visuel actuel des onglets Mood sont conservés.**

Concrètement :

- les profils restent présentés sous forme de bulles/cartes circulaires horizontales, avec l’identité active visiblement entourée en violet ;
- les intentions `Pour toi · Découvrir · Apprendre · Créer · Rencontrer` reprennent le style actuel des moods : mots simples alignés, onglet actif violet souligné ;
- ces deux éléments ne deviennent pas une succession de grosses pastilles arrondies ;
- seule la logique des moods change : intentions de classement non bloquantes au lieu de filtres durs ;
- cette conservation sert de point de continuité entre l’identité visuelle actuelle appréciée et la nouvelle architecture.

## 2. Ce que PASSIO doit devenir

### ADN définitif

**DÉCOUVRIR → PARTAGER → RENCONTRER**

Promesse compréhensible en quelques secondes :

> **Je découvre des passions et des personnes, je partage autour de mes passions, puis PASSIO m’aide à transformer ces interactions en vraies rencontres et expériences IRL.**

Boucle produit :

```text
Passion
→ contenu
→ personne
→ interaction
→ conversation
→ activité IRL
→ rencontre réelle
→ souvenir ou nouveau contenu
→ nouveau lien
```

PASSIO n’est ni un clone d’Instagram, ni un clone de TikTok, ni un agenda d’événements, ni une application de dating. Le contenu sert de point de départ ; la passion crée le lien ; le réel est l’aboutissement.

### Les deux piliers

1. **Feed — Découvrir et partager** : contenus, passions, personnes, Bobines et premières portes vers l’IRL.
2. **IRL — Rencontrer** : activités pertinentes, coordination, participation et retour vers le Feed.

L’IRL n’est pas un module isolé. Il doit apparaître comme la suite logique du Feed, d’un profil ou d’une conversation.

## 3. Diagnostic de l’interface actuelle

L’application contient déjà de nombreuses briques, mais elle les présente encore comme un catalogue de fonctions.

- La barre du bas expose actuellement **Fil, Bobines, Créer, IRL et Carnets de voyage**.
- Les libellés sont masqués : les icônes seules sont ambiguës.
- Bobines est présenté comme un produit séparé alors qu’il s’agit d’un format de découverte.
- Les Carnets de voyage occupent une place primaire alors qu’ils doivent rejoindre l’univers secondaire **Passio : Voyage**.
- Messages et Profil, pourtant essentiels à la boucle humaine, ne sont pas tous deux dans la navigation principale.
- Le Feed empile profils, anciens moods, stories et contenus sans exprimer assez clairement la progression vers l’IRL.
- L’écran IRL donne une place très importante à la carte et à de nombreux outils avant d’aider l’utilisateur à choisir une activité.
- Créer est encore un écran Studio riche en choix techniques, alors que l’utilisateur veut simplement publier ou proposer une activité.
- Wallet, Passia, points, rangs et anciennes mécaniques secondaires créent encore du bruit à plusieurs endroits.

Conclusion : le problème principal n’est pas l’absence de fonctions. C’est leur hiérarchie et leur mise en relation.

## 4. Navigation mobile cible

La barre du bas représente désormais la promesse du produit, pas son inventaire technique.

```text
┌─────────────────────────────────────┐
│ Découvrir  Rencontrer   +  Messages │
│    ◉          ◇       Créer    ◌    │
│                              Profil │
└─────────────────────────────────────┘
```

Disposition exacte à cinq entrées :

| Position | Libellé visible | Destination | Rôle |
|---|---|---|---|
| 1 | **Découvrir** | Feed | contenus, personnes, passions, Bobines |
| 2 | **Rencontrer** | IRL | activités et expériences réelles |
| 3 | **Créer** | action centrale | publication, Bobine ou activité IRL |
| 4 | **Messages** | Inbox | relation et coordination |
| 5 | **Profil** | Moi / Mes Passio | identité et multi-profils |

Règles :

- les cinq libellés restent visibles ;
- `Créer` est un bouton d’action central, pas un écran permanent ;
- Bobines reste accessible depuis le Feed et la création, mais sort de la barre principale ;
- Explorer est absorbé par la recherche du Feed ;
- Carnets de voyage sort du cœur, sans suppression de ses données ;
- Wallet, Passia et points sortent du cœur ;
- le profil actif ne change jamais silencieusement pendant une navigation.

## 5. Direction visuelle

### Intention

Une interface **claire, premium, vivante et humaine**, proche de la charte PASSIO existante. Le violet reste l’identité de la passion et de la découverte. Une couleur plus chaude signale le passage au réel. L’ensemble ne doit pas devenir sombre ni ressembler à un tableau de bord technique.

### Système de couleurs compact

| Nom | Couleur | Usage |
|---|---|---|
| Encre | `#17152B` | textes et contraste |
| Nuage | `#F7F5FC` | fond principal |
| Blanc | `#FFFFFF` | cartes et surfaces |
| Violet Passio | `#6D32F4` | découverte, sélection, marque |
| Iris | `#A784FF` | profondeur, transitions, accents doux |
| Corail IRL | `#FF6B57` | rencontre, activité réelle, CTA IRL |

Les couleurs d’état succès, alerte et erreur restent sémantiques et ne deviennent pas des couleurs de marque.

### Typographie

- **Titres et appels à l’action :** Manrope ou équivalent local, graisse 700–800, compact et assuré.
- **Texte, détails et formulaires :** Inter ou police système équivalente, graisse 400–600, très lisible sur mobile.
- Au moins deux niveaux de titre visiblement distincts ; pas une multitude de tailles presque identiques.

### Élément signature : le « trait Passio »

Un trait fin part du badge de passion d’un contenu, traverse le module contextuel et change progressivement du violet vers le corail lorsqu’une action mène au réel.

```text
🎵 Musique ────────────────● À vivre en vrai
                            Jam samedi · Lyon
                            [Ça me tente]
```

Ce motif relie visuellement Feed et IRL. Il doit rester discret, identifiable et réutilisable sur les cartes Feed, Bobines, événements et conversations.

### Mouvement

- une seule animation forte : lors de `Ça me tente`, le trait violet devient corail et ouvre le panneau IRL contextuel ;
- transitions courtes et tactiles ;
- aucun festival de micro-animations ;
- respect de `prefers-reduced-motion`.

## 6. Le nouveau Feed

### Rôle

Le Feed ne cherche pas seulement à prolonger le défilement. Il aide à découvrir quelque chose, quelqu’un, puis une possibilité réelle.

### Structure mobile

```text
┌──────────────────────────────────┐
│ PASSIO      Recherche   Alertes  │
│ Tes profils Passio               │
│ (Suivis) (Musique●) (Photo) (…)  │
├──────────────────────────────────┤
│ Envie du moment                  │
│ Pour toi  Découvrir  Apprendre   │
│ ━ actif   Créer      Rencontrer  │
├──────────────────────────────────┤
│ Stories utiles                   │
├──────────────────────────────────┤
│ [avatar] Léa · Musique           │
│ contenu / photo / Bobine         │
│ ♡   Commenter   Partager         │
│ 🎵 ───── À vivre en vrai         │
│          [Ça me tente]           │
└──────────────────────────────────┘
```

### « Envie du moment » remplace les anciens moods dominants

Les anciens choix `Création · Apprendre · Chill · Actu` ne doivent plus filtrer durement le Feed.

La nouvelle ligne est :

- **Pour toi** — état par défaut, équilibre global ;
- **Découvrir** — nouvelles passions, personnes et formats ;
- **Apprendre** — contenus utiles, conseils et pratiques ;
- **Créer** — inspirations, défis et contenus qui donnent envie d’essayer ;
- **Rencontrer** — contenus ayant une continuité locale ou IRL crédible.

Ce sont des **intentions de classement**, pas des filtres qui vident le Feed. Un seul choix à la fois. Changer d’intention ne change ni le profil actif ni l’identité de publication.

Le style visuel est verrouillé : conserver la ligne d’onglets actuelle, sobre et soulignée. Les nouvelles intentions remplacent les anciens mots sans transformer le composant en chips/pills. Si les cinq libellés ne tiennent pas sur un petit écran, la ligne défile horizontalement sans réduire leur lisibilité.

Le sélecteur de profils placé au-dessus reste lui aussi dans son langage visuel actuel : bulles illustrées, nom court et anneau violet pour la sélection. La refonte peut corriger espacements, alignements et accessibilité, mais ne doit pas changer cette signature appréciée.

Un mood historique peut rester dans `Affiner`, de façon optionnelle, uniquement pour la compatibilité des contenus existants.

### Flux multi-format

Un seul Feed contient :

- texte ;
- photo ;
- vidéo ;
- Bobine ;
- publication liée à une activité ;
- modules ponctuels `Passionnés à découvrir` ;
- modules ponctuels `À vivre en vrai`.

Les Bobines ne sont plus exclues du Feed. Un tap sur leur média ouvre le viewer vertical plein écran, puis la fermeture revient à la position précédente.

### Carte Feed reliée à l’IRL

Chaque carte garde un noyau simple : auteur, Passio, contenu et interactions. Une zone contextuelle apparaît seulement si elle apporte une vraie suite.

Cas 1 — contenu lié à un événement :

```text
À vivre en vrai
Jam skate · samedi · Lyon
[Voir l’activité]   [Je participe]
```

Cas 2 — contenu sans événement, mais avec une Passio :

```text
[Ça me tente]
```

Le tap ouvre un panneau léger :

```text
Autour de cette Passio
• Voir les activités proches
• Découvrir des personnes intéressées
• Proposer une sortie
```

Il n’y a ni formulaire long ni proposition agressive de « rencontrer cette personne ».

### Découverte humaine

Un module `Passionnés à découvrir` apparaît avec parcimonie, après les premiers contenus pertinents. Il mène au profil, puis aux actions **Suivre** et **Message**.

## 7. Bobines connectées au réel

Une Bobine est un format de découverte, pas une destination indépendante ni une machine à temps de visionnage.

Actions cibles dans le viewer :

- **Ça m’intrigue** — signal positif ;
- **Découvrir cette Passio** — ouvre le contexte passion ;
- **À vivre près de moi** — activités et personnes pertinentes, sans GPS imposé ;
- **Proposer une sortie** — ouvre une activité préremplie ;
- **Pas pour moi** — signal négatif accessible sans encombrer l’écran.

Si la Bobine possède un `event_id`, la fiche de l’activité correspondante est affichée directement. Sinon, PASSIO propose des suites liées à la Passio sans inventer un événement.

Exemple cible :

```text
Bobine escalade
→ Ça m’intrigue
→ Escalade autour de moi
→ personnes et activités pertinentes
→ proposer ou rejoindre une sortie
→ rencontre IRL
→ souvenir publié dans le Feed
```

Pour la première version testable, la personnalisation peut rester simple, locale et explicable. Aucun moteur d’IA lourd n’est nécessaire.

## 8. Nouvel écran IRL

### Rôle

L’IRL n’est pas une carte d’événements. Il aide à répondre rapidement : **qu’est-ce que je peux vivre, avec qui, quand et dans quel cadre ?**

### Écran de découverte

```text
┌──────────────────────────────────┐
│ IRL · À vivre en vrai            │
│ Des activités autour de tes Passio│
│ [Rechercher activité ou ville]   │
│                                  │
│ Pour toi · Cette semaine         │
│ Ma ville · Mes Passio · Filtres  │
│                                  │
│ [Liste]                 [Carte]  │
├──────────────────────────────────┤
│ [image] Jam acoustique           │
│ Musique · samedi 18 h            │
│ Lyon 6e · environ 3 km           │
│ 12 personnes · 4 places          │
│ [Voir]              [Je viens]   │
└──────────────────────────────────┘
```

Décisions :

- la liste de cartes est prioritaire ;
- la carte devient une vue secondaire ou un aperçu repliable ;
- aucun GPS demandé à l’ouverture ;
- ville manuelle toujours possible ;
- quatre intentions visibles au maximum ;
- filtres détaillés dans un panneau ;
- aucun bandeau de comptage complexe réintroduit ;
- `Créer une activité` reste accessible directement depuis l’écran et via le bouton central.

### Carte événement

Elle affiche seulement ce qui permet une décision rapide :

- visuel ;
- Passio ;
- titre ;
- date et heure ;
- ville ou zone ;
- distance approximative si autorisée ;
- participants agrégés ;
- places restantes ;
- éventuellement une relation connue si son consentement le permet ;
- `Voir` et `Je viens`.

### Fiche événement

Ordre recommandé :

1. ce que l’on va faire ;
2. quand et dans quelle zone ;
3. qui organise ;
4. places et réponse ;
5. ce qu’il faut savoir ;
6. discussion si autorisée ;
7. album et souvenirs après l’événement.

CTA de réponse toujours accessible : **Je viens**, **Peut-être**, **Je ne peux pas** ou **Liste d’attente**.

L’adresse exacte reste protégée jusqu’à l’autorisation serveur correspondante. Le contact se fait dans PASSIO, pas par exposition publique d’un numéro.

### Après l’activité

PASSIO propose, sans obligation :

- partager une photo, vidéo ou Bobine ;
- conserver automatiquement le contexte Passio et `event_id` ;
- publier dans le Feed avec la visibilité choisie ;
- retrouver les personnes ou la conversation de l’activité ;
- proposer une nouvelle expérience.

## 9. Créer devient une action centrale

Tap sur le bouton central :

```text
Créer
├── Publication — idée, photo ou vidéo
├── Bobine — vidéo courte autour d’une Passio
├── Activité IRL — quelque chose à vivre ensemble
└── Plus — audio/podcast, Story
```

Le composer Publication ne demande plus de choisir `Texte`, `Photo` ou `Vidéo` avant de commencer. Il contient :

```text
Publier en tant que [identité active]  Changer
[Écris quelque chose…]
[Ajouter photo ou vidéo]
Passio : [préremplie]                  Modifier
Affiner                               ▾
[Publier]
```

Règles :

- aucune récompense `+10 pts` ;
- aucun Wallet ou Passia ;
- mood facultatif sous `Affiner` ;
- aucune caméra, micro ou géolocalisation demandée sans action explicite ;
- l’origine Feed, Bobine, conversation ou événement préremplit le contexte sans changer silencieusement d’identité ;
- retour au Feed après une publication ou Bobine ;
- ouverture de la fiche après création d’une activité.

## 10. Messages et conversation

Messages devient une destination principale parce qu’il transforme l’intérêt en relation.

Inbox simplifiée :

```text
Messages                        [+]
[Rechercher…]

[avatar] Nina
Musique · Dernier message…        12:43
```

Le `+` regroupe `Nouveau message` et `Nouveau groupe`.

Dans une conversation 1:1, `Proposer un IRL` reste une action contextuelle légère dans le menu du composer ou le header secondaire. Elle ouvre le formulaire existant avec une Passio et un titre suggérés, mais sans GPS, adresse déduite, message automatique, auto-ajout ou auto-RSVP.

Après création, une carte sûre de l’activité peut être partagée dans la conversation : titre, ville/zone, date et bouton `Voir l’activité`.

## 11. Profil et multi-profils

Profil devient une destination principale. Il répond à : qui suis-je, quelles sont mes Passio, avec quelle identité est-ce que j’agis ?

Profil personnel :

```text
[avatar] Benjamin
Bio générale
Abonnés · Abonnements
[Modifier]

Mes Passio
🎵 Musique          Actif
📷 Photographie     Activer
🏄 Surf             Activer
+ Ajouter une Passio
```

Le profil public visité répond à : qui est cette personne, que partage-t-elle, quelles Passio avons-nous en commun, puis-je la suivre, lui parler ou découvrir une activité publique sûre ?

Les étoiles, scores, Passia, rangs, leaderboards et paywalls internes sortent du cœur. L’activation d’une identité Passio est toujours volontaire et visiblement confirmée.

## 12. Onboarding et première valeur

Le nouveau compte doit arriver rapidement à un premier Feed pertinent :

```text
Créer un compte
→ règles essentielles
→ choisir 3 à 7 Passio
→ réglages minimaux de confidentialité
→ Feed personnalisé
```

Sont différés : biographie détaillée, GPS obligatoire, Wallet, Passia, tour investisseur, profil passion complexe et réglages avancés.

Le multi-profil apparaît progressivement lorsqu’il apporte une valeur concrète, par exemple au moment de publier dans une nouvelle Passio.

## 13. Ce qui existe déjà et doit être rendu visible

À la date du document :

- onboarding orienté premier Feed pertinent : livré ;
- pont Feed → IRL, première étape avec CTA et préremplissage : livré derrière contrôle ;
- `Envie du moment` : livré — **raccordé à l’aperçu unique `passio-ui-v2` au lot UI-2** ; l’ancien aperçu séparé `feed-intents-v1` n’active plus rien à lui seul ;
- conversation → IRL et quatrième aide contextuelle : livrés derrière l’aperçu `irl-proposal-v1` ;
- moteur d’événements, RSVP, liste d’attente, conversation d’événement et retour post-IRL : déjà présents en partie ;
- règles majorité, blocage et confidentialité IRL : base serveur livrée ;
- navigation cible, Bobines dans le Feed, nouveau sélecteur Créer, redesign IRL et nettoyage du Profil : non implémentés comme expérience cohérente complète.

Nous devons donc assembler et montrer les capacités existantes avant de reconstruire ce qui fonctionne déjà.

## 14. Mode de validation

Toutes les nouveautés d’interface sont regroupées dans un aperçu unique et non persistant :

```text
?passio_preview=passio-ui-v2
```

Le nom exact peut être adapté par Claude Code aux conventions réelles du dépôt, mais le principe reste obligatoire :

- aucun changement global avant validation ;
- l’URL normale reste stable ;
- l’aperçu active la navigation et les surfaces V2 nécessaires ;
- aucun réglage durable dans le navigateur de l’utilisateur ;
- un arrêt simple permet de revenir à l’interface actuelle ;
- chaque lot produit une URL de preview mobile à tester.

Validation par lot :

1. capture avant/après en 390 × 844 ;
2. test réel au pouce ;
3. vérification libellés, hiérarchie, scroll, clavier et retour ;
4. parcours heureux testable même si certaines données restent de démonstration ;
5. liste courte des défauts visuels ;
6. correction ;
7. validation de Benjamin avant le lot suivant.

## 15. Lots d’implémentation visuelle

### Lot UI-1 — Shell et navigation

- cinq onglets : Découvrir, Rencontrer, Créer, Messages, Profil ;
- libellés visibles ;
- Bobines et CDV retirés du nav principal ;
- bouton Créer central ouvrant un bottom sheet ;
- tokens visuels et `trait Passio` ;
- compatibilité des anciennes routes conservée.

**Résultat testable :** la nouvelle hiérarchie de PASSIO est visible immédiatement.

### Lot UI-2 — Feed V2 et intentions

- intégrer `Envie du moment` dans la nouvelle hiérarchie ;
- conserver exactement le langage visuel actuel des profils horizontaux et des onglets Mood soulignés ;
- remplacer les libellés Mood par les cinq intentions sans convertir le composant en pastilles ;
- aucun filtre dur ;
- Feed multi-format ;
- cartes plus lisibles ;
- premier module `Passionnés à découvrir` ;
- états vide/chargement cohérents.

**Résultat testable :** le Feed donne une intention claire et montre des personnes, pas seulement des posts.

### Lot UI-3 — Passerelle Feed → IRL

- `trait Passio` ;
- module événement lié ;
- action `Ça me tente` ;
- panneau `Autour de cette Passio` ;
- préremplissage du formulaire existant ;
- retour à la position du Feed.

**Résultat testable :** une publication peut mener en quelques gestes à une activité réelle.

### Lot UI-4 — IRL V2

- liste prioritaire ;
- carte secondaire ;
- quatre filtres simples ;
- cards événement ;
- fiche événement hiérarchisée ;
- CTA RSVP accessible ;
- création directe.

**Résultat testable :** un testeur choisit une activité sans devoir comprendre tous les outils IRL.

### Lot UI-5 — Bobines V2

- Bobines visibles dans le Feed ;
- viewer secondaire ;
- actions `Ça m’intrigue`, `Découvrir cette Passio`, `À vivre près de moi`, `Proposer une sortie` ;
- raisons de découverte simples ;
- retour Feed stable.

**Résultat testable :** une Bobine nourrit explicitement la découverte puis l’IRL.

### Lot UI-6 — Création, Messages et Profil

- sélecteur Créer complet ;
- composer unifié ;
- inbox simplifiée ;
- proposition IRL contextuelle ;
- Profil / Mes Passio simplifié ;
- suppression visuelle des mécaniques économiques du cœur.

**Résultat testable :** tous les points de la boucle utilisent la même hiérarchie.

### Lot UI-7 — Parcours complet et finition du concept

- onboarding → Feed ;
- Feed → profil → message ;
- Feed/Bobine → IRL ;
- conversation → IRL ;
- RSVP → discussion ;
- IRL → souvenir → Feed ;
- cohérence des retours, états vides, textes et animations ;
- revue mobile globale.

**Résultat testable :** le concept PASSIO complet peut être présenté et validé.

## 16. Ce que nous ne faisons pas encore

- dimensionnement parfait pour un million d’utilisateurs ;
- optimisation profonde du DOM et de la fenêtre de Feed ;
- budgets p95/p99 complets ;
- moteur ML lourd de recommandations ;
- refonte totale de la base et du schéma multi-profil ;
- catalogue mondial parfait de toutes les passions ;
- carte géospatiale ultra-dense ;
- automatisation avancée de tous les contrôles ;
- suppression destructive immédiate des anciennes fonctions ou données ;
- activation globale avant validation visuelle.

Nous acceptons temporairement des données de démonstration, un classement simple et certains raccords locaux si cela permet de valider honnêtement le parcours. Nous n’acceptons pas de faux succès, de fuite de données privées, de contournement de majorité ou de blocage.

## 17. Critères de validation du concept

Le concept est prêt à passer à la phase performance lorsque :

- un nouveau testeur comprend la promesse en moins de dix secondes ;
- les cinq onglets sont identifiables sans explication ;
- les nouveaux moods/intensions ne vident jamais le Feed ;
- une Bobine apparaît dans le Feed et peut mener à une Passio ou à l’IRL ;
- une publication peut ouvrir une activité liée ou un panneau `Ça me tente` ;
- l’écran IRL aide à choisir une activité avant de montrer la complexité ;
- Créer propose clairement Publication, Bobine et Activité IRL ;
- Messages permet de proposer un IRL sans parcours forcé ;
- Profil rend le multi-profil compréhensible ;
- l’utilisateur peut revenir de l’IRL vers le Feed avec un souvenir ;
- tous les parcours principaux sont confortables en 390 × 844 ;
- Benjamin a vu, testé et validé chaque lot dans une preview.

## 18. Méthode de travail efficace avec Claude Code

Pour chaque lot :

1. ChatGPT fournit un ordre court extrait de ce document.
2. Claude Code repart du dernier `main`, crée une branche isolée et implémente un seul lot.
3. Claude Code ouvre une PR et fournit la preview ainsi que les captures 390 × 844.
4. Benjamin teste visuellement.
5. ChatGPT arbitre les corrections produit.
6. Codex contrôle navigation, régressions, accessibilité, mobile et cohérence Feed → IRL.
7. Le lot n’est fusionné qu’après validation explicite.

Nous ne lançons pas plusieurs lots UI concurrents. Une seule branche produit active à la fois évite les divergences et rend chaque changement visible.

### Conservation canonique de cette direction

Ce fichier est la base de travail produit à venir. Claude Code doit en créer une copie versionnée dans le dépôt, sous un nom canonique tel que :

```text
docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md
```

Puis il doit ajouter un lien court vers ce document dans la mémoire projet appropriée (`CLAUDE.md` ou index documentaire existant), sans recopier 900 lignes dans plusieurs fichiers. En cas de contradiction :

1. la décision utilisateur la plus récente dans cette conversation prime pour le produit ;
2. ce document consolidé prime sur les anciennes spécifications UX ;
3. `main` GitHub prime pour l’état du code réellement livré ;
4. sécurité, majorité, blocage et confidentialité déjà acquises restent non négociables.

La remarque sur les profils et moods fait partie du contrat canonique, pas d’une préférence facultative.

### Principe de préservation de l’application actuelle

La V2 est une évolution maîtrisée de PASSIO, pas une reconstruction qui efface le travail existant.

À préserver par défaut :

- le logo, la marque violette et l’univers clair actuel ;
- les cartes blanches arrondies et la sensation générale déjà familière ;
- le bouton central `Créer`, dont le comportement évolue mais dont la présence forte reste ;
- les bulles de profils, stories et anneaux de sélection ;
- la ligne d’onglets Mood soulignés ;
- les composants Feed, commentaires, réactions, partage et profils qui fonctionnent ;
- les moteurs de publication, Bobines, messages, événements, RSVP, conversation d’événement et post-IRL déjà présents ;
- les routes historiques nécessaires aux données et deep links ;
- les protections de sécurité, tests et comportements mobiles déjà acquis ;
- toutes les données et fonctions secondaires, même lorsqu’elles quittent la navigation cœur.

Règle d’implémentation : **réutiliser, déplacer, simplifier et reconnecter avant de remplacer**.

Claude Code ne doit donc pas :

- réécrire l’application dans un framework ;
- remplacer globalement `styles.css` ;
- supprimer les anciens écrans ou handlers dans les premiers lots ;
- casser CDV, Bobines ou Studio parce qu’ils sortent de la navigation principale ;
- changer simultanément le design, les données et les moteurs métier ;
- supprimer un test existant pour faire passer une PR ;
- modifier l’interface normale pendant que la V2 est encore en validation.

Avant chaque lot, Claude Code produit des captures de référence de l’interface actuelle. Après le lot, il fournit les mêmes vues dans l’aperçu V2. Les différences non demandées sont considérées comme des régressions.

Le nouveau langage visuel complète l’existant : le violet et les composants appréciés restent ; le corail IRL et le `trait Passio` s’ajoutent uniquement pour matérialiser le passage vers le réel.

## 19. Premier ordre Claude Code à préparer

Le premier lot à lancer est **UI-1 — Shell et navigation**. Il ne doit pas essayer de refaire tout PASSIO en une PR. Il construit le cadre testable dans lequel tous les autres écrans viendront ensuite.

Livrable attendu :

- branche depuis le dernier `main` ;
- nouvelle bottom-nav sous aperçu `passio-ui-v2` ;
- libellés visibles ;
- bouton Créer ouvrant le sélecteur léger ;
- aucune modification du visuel actuel des profils Feed et des onglets Mood dans ce premier lot ;
- routes historiques conservées hors navigation primaire ;
- captures avant/après mobile ;
- tests de navigation ciblés ;
- PR non fusionnée pour validation visuelle.

## 20. Preuve de compréhension

La nouvelle direction n’est pas « optimiser l’application existante jusqu’à ce qu’elle soit parfaite ».

La nouvelle direction est :

> **Donner d’abord une forme visible au vrai produit PASSIO, tester cette forme avec ses utilisateurs, corriger rapidement l’expérience, puis seulement industrialiser ce qui a été validé.**

Le produit à valider n’est pas une collection de Feed, Bobines, Carte, Studio, Wallet et Carnets. C’est une seule boucle humaine :

> **Je découvre quelque chose qui me parle. Je rencontre la personne ou la communauté derrière cette passion. Je propose ou je rejoins une expérience. Je la vis. Je reviens partager.**

Voilà désormais le filtre de toutes les décisions d’interface et l’ordre de travail officiel du projet.

## Annexe A — Raisonnement complet derrière les arbitrages

Cette annexe conserve les arguments produits développés dans nos conversations. Elle doit éviter que Claude Code ou une future session applique les écrans mécaniquement sans comprendre leur intention.

### A1. Pourquoi valider le concept avant d’optimiser la performance

Optimiser très profondément l’interface actuelle reviendrait à accélérer une hiérarchie que nous voulons remplacer. Une application peut charger très vite tout en restant difficile à comprendre. À l’inverse, un prototype honnête, suffisamment fluide pour être testé, permet de vérifier d’abord si les utilisateurs veulent réellement suivre le parcours proposé.

La bonne séquence est donc :

```text
Concept visible
→ usage réel
→ corrections de parcours
→ validation
→ industrialisation et performance
```

Nous évitons ainsi trois gaspillages : optimiser des onglets qui vont disparaître, perfectionner des fonctions secondaires et dimensionner un comportement que personne n’a encore validé.

### A2. Pourquoi la navigation doit raconter le produit

La barre actuelle raconte : `Fil, vidéos, studio, événements, voyages`. Elle décrit des formats et des outils. Elle n’explique pas ce que l’utilisateur peut accomplir.

La barre V2 raconte :

```text
Découvrir → Rencontrer
        Créer
Relation → Identité
```

`Découvrir`, `Rencontrer`, `Créer`, `Messages` et `Profil` sont des intentions humaines durables. Les formats peuvent évoluer sans devoir refaire la navigation.

### A3. Pourquoi afficher les libellés des onglets

Une maison peut signifier accueil, Feed ou tableau de bord. Une pellicule peut signifier vidéo, Bobines ou média. L’icône IRL actuelle n’est pas universelle et le Carnet de voyage peut être confondu avec un profil ou une bibliothèque.

Les libellés :

- réduisent le temps d’apprentissage ;
- rendent la promesse visible à chaque écran ;
- améliorent l’accessibilité ;
- évitent de devoir expliquer l’application à un testeur ;
- permettent de mesurer si les mots `Découvrir` et `Rencontrer` sont compris.

### A4. Pourquoi conserver cinq entrées

Trois entrées seraient trop pauvres pour rendre Messages et Profil directement accessibles. Six ou sept remettraient l’utilisateur face au catalogue de fonctions. Cinq permet de couvrir les deux piliers, l’action centrale, la relation et l’identité, tout en restant confortable au pouce.

### A5. Pourquoi `Découvrir` plutôt que seulement `Fil`

`Fil` décrit un composant technique. `Découvrir` exprime le bénéfice. L’écran peut continuer à être nommé Feed dans le code, mais le mot visible doit annoncer contenus, personnes, Passio et possibilités.

Cette formulation doit être testée. Si les utilisateurs cherchent explicitement le mot `Fil`, la variante finale pourra afficher `Fil` avec un titre d’écran `Découvrir`. Le prototype doit nous permettre d’arbitrer avec de vrais retours.

### A6. Pourquoi `Rencontrer` plutôt que seulement `IRL`

`IRL` est compris par une partie du public, mais pas nécessairement par tous. `Rencontrer` donne immédiatement le bénéfice. Pour conserver l’identité distinctive de la fonction, l’écran affiche :

> **IRL · À vivre en vrai**

Le libellé de navigation peut donc être humain et le nom de l’univers rester PASSIO IRL.

### A7. Pourquoi `Créer` reste au centre

La création referme la boucle : un contenu découvert inspire une publication, une Bobine ou une activité. La position centrale est la plus visible et la plus facilement atteignable. Cependant, `Créer` ne doit plus ouvrir un Studio technique : le bouton doit demander simplement ce que l’utilisateur souhaite faire.

Le mot `Créer` est préféré à `Partager` dans la barre car il inclut aussi la création d’une activité IRL. Le sous-titre et les trois choix réintroduisent naturellement la notion de partage.

### A8. Pourquoi Messages devient primaire

Une passion ne conduit pas directement d’un contenu à une rencontre avec un inconnu. Entre les deux, il y a une personne, un profil, une interaction et souvent une conversation. Cacher Messages dans la topbar minimise donc le maillon qui construit la confiance et permet la coordination.

Messages ne doit pas devenir un produit de discussion infinie. Sa présence primaire se justifie uniquement comme pont humain vers une relation ou un IRL.

### A9. Pourquoi Profil devient primaire

Le multi-profil passionnel est une différence fondamentale de PASSIO. Si Profil reste difficile à trouver tandis que Carnets de voyage est primaire, l’interface contredit le produit. Le Profil doit permettre de comprendre son identité générale, ses différentes Passio et l’identité actuellement active.

L’utilisateur ne doit jamais se demander sous quel profil il publie ou rejoint une activité.

### A10. Pourquoi Bobines quitte la barre principale

Une Bobine est un format, comme une photo ou une vidéo. Lui donner un onglet permanent pousse naturellement l’équipe à optimiser un flux séparé et le temps de visionnage. Cela rapproche PASSIO de TikTok et éloigne la Bobine de sa mission : provoquer la curiosité, révéler une Passio ou une personne et ouvrir une possibilité réelle.

La retirer de la barre ne signifie pas la cacher. Au contraire : elle entre dans le Feed, peut s’ouvrir plein écran et obtient des actions spécifiquement PASSIO.

### A11. Pourquoi CDV sort du cœur sans être supprimé

Les Carnets de voyage peuvent constituer un bon produit, mais ils ne répondent pas directement aux trois mots `Découvrir, Partager, Rencontrer` dans le contexte général. Les laisser en navigation primaire dilue la promesse et donne l’impression d’une application assemblée par accumulation.

Les données et fonctions sont préservées. Elles migrent progressivement vers **Passio : Voyage**, univers secondaire accessible depuis le Profil ou une entrée dédiée hors navigation cœur.

### A12. Pourquoi Explorer est absorbé par le Feed

Explorer et le Feed répondent tous deux à la découverte. Deux destinations obligent l’utilisateur à comprendre une différence interne que le produit n’a pas encore prouvée. Recherche de passions, personnes, contenus et activités peut vivre depuis le Feed dans une vue légère.

Explorer ne redeviendra autonome que si les tests montrent un besoin distinct impossible à servir proprement dans Découvrir.

### A13. Pourquoi Wallet, Passia, points et rangs disparaissent du cœur

Ces mécanismes ajoutent une seconde motivation artificielle au-dessus de la passion. Ils peuvent pousser à publier ou rencontrer pour gagner plutôt que pour vivre une expérience réelle. Ils compliquent l’onboarding, la création, le profil et l’IRL sans renforcer la promesse centrale.

Une éventuelle monétisation future sera conçue séparément. Elle ne doit pas décider de l’architecture actuelle de l’expérience.

### A14. Pourquoi `Envie du moment` remplace les anciens moods dominants

Les anciens moods décrivent surtout le type du contenu. Pire, lorsqu’ils filtrent durement le Feed, un choix par défaut peut masquer des contenus pourtant très pertinents et donner l’impression que PASSIO est vide.

Les nouvelles intentions répondent à la question :

> **Qu’est-ce que j’ai envie de faire maintenant ?**

Elles influencent l’ordre, jamais l’existence du Feed. `Rencontrer` peut faire remonter les contenus liés à une activité ou à une communauté locale. `Créer` peut faire remonter des inspirations et défis. `Découvrir` introduit de nouvelles Passio. L’utilisateur comprend l’effet attendu sans devoir apprendre une taxonomie technique.

### A15. Pourquoi `Pour toi` reste le défaut

Imposer une intention au démarrage enfermerait l’expérience. `Pour toi` fournit un mélange raisonnable à partir des intérêts, suivis et signaux existants. L’utilisateur choisit une intention uniquement lorsqu’il souhaite orienter sa session.

Cela réduit également le risque de Feed vide dans une zone ou une Passio encore peu dense.

### A16. Pourquoi un Feed multi-format unique

Séparer texte, photos, vidéos et Bobines produit des silos. Or une même passion peut être transmise par plusieurs formats. Un seul Feed permet de classer par pertinence humaine et passionnelle plutôt que par type de média.

Le viewer plein écran reste utile pour regarder une Bobine, mais il devient une profondeur du contenu, pas un univers concurrent.

### A17. Pourquoi ne pas mettre un gros bouton Message sur chaque post

Le contenu doit d’abord mener à la personne. Le profil public permet de vérifier qui elle est, ses Passio, ses contenus et le contexte de la relation avant d’ouvrir une conversation. Cette étape réduit les contacts agressifs et rend le parcours plus humain.

Les actions dominantes d’une publication restent donc légères ; avatar et nom ouvrent le profil, où `Suivre` et `Message` sont évidents.

### A18. Pourquoi `Ça me tente` plutôt que `Rencontrer cette personne`

`Ça me tente` exprime un intérêt pour la passion ou l’expérience. Il ne suppose ni attirance, ni consentement, ni disponibilité d’une personne en particulier. Il ouvre plusieurs suites possibles : activité existante, personnes intéressées, groupe ou proposition de sortie.

Cette formulation évite de transformer PASSIO en dating forcé tout en gardant un passage clair vers le réel.

### A19. Pourquoi le « trait Passio »

Le lien Feed → IRL ne doit pas être seulement technique. L’utilisateur doit le percevoir visuellement. Le trait relie le badge de passion au module réel, avec un passage du violet au corail. Il rend visible la transformation : une passion numérique devient une expérience humaine.

Cet élément est plus distinctif qu’une accumulation de cartes violettes et de dégradés génériques. Il donne à PASSIO un langage que l’on peut reconnaître dans le Feed, les Bobines, les fiches d’activité et les conversations.

### A20. Pourquoi la couleur IRL est plus chaude

Le violet reste l’univers de l’idée, de la découverte et de l’identité PASSIO. Le corail représente l’action, la présence et le monde réel. Ce changement de température visuelle aide l’utilisateur à comprendre qu’il quitte la consommation de contenu pour une décision concrète.

Il ne crée pas deux applications : le trait et les composants communs assurent la continuité.

### A21. Pourquoi l’écran IRL commence par une liste

Une carte demande d’explorer un territoire. Une liste bien conçue permet de comparer immédiatement activité, Passio, date, distance approximative et places. Elle correspond mieux à la question principale : « est-ce que cette activité me convient ? »

La carte reste utile pour comprendre une zone, mais elle devient secondaire. Cette décision réduit aussi l’importance perçue du GPS et protège mieux la confidentialité des lieux.

### A22. Pourquoi limiter les filtres visibles

Date, distance, horaire, places, type, ville, Passio et tri exposés en même temps créent une interface d’outil de recherche complexe. Quatre intentions couvrent la majorité des besoins : `Pour toi`, `Cette semaine`, `Ma ville`, `Mes Passio`.

Les autres filtres restent disponibles dans un panneau. La richesse fonctionnelle demeure, mais elle n’est plus payée en complexité visuelle.

### A23. Pourquoi aucun GPS obligatoire

PASSIO doit fonctionner avec une ville choisie manuellement. Le GPS exact est sensible, crée une demande de permission anxiogène et peut bloquer la première valeur. Il n’est demandé qu’après une action explicite `Utiliser ma position`.

Cette règle améliore à la fois l’UX, la confiance et la compatibilité avec les zones où la densité locale est encore faible.

### A24. Pourquoi protéger l’adresse et les participants

Une activité future révèle qui sera où et quand. Afficher publiquement l’adresse exacte ou la liste brute des participants transforme une fonction sociale en risque de sécurité. Le produit montre donc ville/zone et agrégats publics ; les détails précis ne sont révélés qu’aux personnes autorisées par le serveur.

La preuve sociale peut exister — par exemple une personne suivie qui participe — uniquement avec une règle de visibilité claire.

### A25. Pourquoi Créer ouvre trois intentions principales

`Texte`, `Photo` et `Vidéo` sont des détails de composition, pas trois intentions différentes. Les trois vraies actions cœur sont :

1. partager une publication ;
2. créer une Bobine ;
3. proposer une activité IRL.

Podcast, audio et Story restent accessibles sous `Plus`. Cela préserve les capacités existantes sans les laisser concurrencer les actions les plus importantes.

### A26. Pourquoi l’identité active est visible avant publication

Dans un produit multi-profil, une erreur d’identité est plus grave qu’un mauvais filtre. L’utilisateur doit savoir clairement qui publie, organise ou intervient. Un contexte peut préremplir une Passio, mais ne doit jamais changer secrètement le profil actif.

Cette règle réduit les erreurs sociales et prépare une future séparation serveur plus robuste sans attendre sa refonte complète pour valider l’UX.

### A27. Pourquoi Conversation → IRL reste discret

Une grosse bannière permanente pousserait trop tôt vers la rencontre et réduirait l’espace de discussion. L’action `Proposer un IRL` vit donc dans le menu contextuel ou le composer. Elle apparaît au moment où l’utilisateur cherche une action supplémentaire.

La création préremplit uniquement les informations sûres. Elle n’ajoute personne, n’envoie rien et n’inscrit personne sans validation.

### A28. Pourquoi la boucle post-IRL est indispensable

Sans retour vers le Feed, l’IRL devient un cul-de-sac. Un souvenir facultatif :

- prouve que les passions se vivent réellement sur PASSIO ;
- nourrit le contenu futur ;
- renforce la relation entre participants ;
- inspire d’autres personnes ;
- prépare naturellement une prochaine activité.

L’utilisateur conserve le choix de publier et de choisir la visibilité. Il n’existe aucune récompense artificielle ni obligation.

### A29. Pourquoi un aperçu unique et non persistant

Les différentes nouveautés forment un concept. Tester séparément une nouvelle barre sur l’ancienne hiérarchie ou un nouvel écran IRL dans l’ancien Feed donnerait des retours trompeurs. Un aperçu `passio-ui-v2` permet de voir la cohérence d’ensemble tout en livrant les changements par petites PR.

Le mode non persistant évite d’enfermer un compte dans une configuration expérimentale et garantit que l’URL normale reste stable.

### A30. Pourquoi des lots courts plutôt qu’une refonte géante

Une méga-PR rendrait impossible de savoir quel choix provoque un bug ou un mauvais ressenti. Les lots courts donnent un écran testable, une comparaison avant/après et une décision claire. Ils limitent aussi les conflits avec les fonctions existantes.

Le cadre est construit en premier, puis le Feed, la passerelle, l’IRL, les Bobines et les autres surfaces viennent s’y intégrer.

### A31. Ce que le prototype peut simplifier — et ce qu’il ne peut pas simuler

Le prototype peut utiliser :

- contenus et événements de démonstration ;
- recommandation déterministe simple ;
- données locales temporaires ;
- carte simplifiée ;
- textes et images provisoires ;
- instrumentation minimale.

Le prototype ne doit jamais simuler :

- une participation serveur réussie si elle a échoué ;
- une majorité ou une permission inexistante ;
- une fausse activité locale présentée comme réelle ;
- une adresse privée rendue publique ;
- une identité de profil ambiguë ;
- un blocage contourné.

Autrement dit : nous acceptons une capacité incomplète, pas une promesse trompeuse.

### A32. Pourquoi les captures et tests au pouce sont obligatoires

Le produit est mobile. Une suite automatique peut confirmer qu’un bouton existe, mais pas qu’il est visible, compréhensible et atteignable. Chaque lot doit donc montrer le résultat en 390 × 844 et être testé avec :

- un pouce ;
- le clavier ouvert ;
- la barre système et la safe area ;
- le retour téléphone ;
- un contenu long ;
- un état vide ;
- une erreur simple.

Le jugement visuel de Benjamin fait partie de la Definition of Done du concept.

### A33. Pourquoi conserver le visuel actuel des profils et moods

Une refonte efficace ne change pas ce qui possède déjà une identité claire et appréciée. Les bulles de profils rendent immédiatement visible la nature multi-profil de PASSIO. La ligne de moods soulignée est légère, familière et prend moins de place que de grandes pastilles.

Nous conservons donc leur grammaire visuelle tout en corrigeant leur rôle produit :

- le sélecteur de profils continue de montrer l’identité et les facettes de l’utilisateur ;
- la ligne Mood devient `Envie du moment` et influence le classement sans supprimer artificiellement des contenus ;
- l’utilisateur ressent une continuité avec l’application actuelle au milieu d’une refonte importante ;
- l’effort de design est concentré sur les vrais problèmes : navigation globale, relation Feed → IRL, hiérarchie de l’IRL et action Créer.

## Annexe B — Carte visuelle des écrans

```text
                         ┌───────────────┐
                         │   DÉCOUVRIR   │
                         │ Feed + moods  │
                         │ + Bobines     │
                         └───────┬───────┘
                                 │ Ça me tente
                                 ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│    PROFIL     │◀──────▶│   RENCONTRER  │◀──────▶│   MESSAGES    │
│ Mes Passio    │        │ IRL + RSVP    │        │ coordination  │
│ Suivre/Parler │        │ liste > carte │        │ proposer IRL  │
└───────┬───────┘        └───────┬───────┘        └───────────────┘
        │                         │
        │                         ▼
        │                 ┌───────────────┐
        └────────────────▶│    CRÉER      │
                          │ Post/Bobine   │
                          │ Activité IRL  │
                          └───────┬───────┘
                                  │ souvenir
                                  └──────────────▶ retour Feed
```

Cette carte montre que les cinq onglets ne sont pas cinq produits parallèles. Ils servent une seule boucle.
