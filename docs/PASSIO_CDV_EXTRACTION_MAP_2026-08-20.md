# PASSIO — Carte d’extraction CDV vers Passio : Voyage

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Décision** : le Carnet de voyage (CDV) sort du cœur PASSIO et devient un domaine de **Passio : Voyage**.
- **Principe** : **extraire sans détruire**. La première étape est une déconnexion produit/navigation. La séparation technique et les éventuelles migrations viennent ensuite, sur preuves.

## 1. Constat vérifié dans le dépôt

Le CDV n’est pas un simple écran autonome. Il est actuellement imbriqué dans plusieurs couches communes de PASSIO :

- navigation principale ;
- Studio/création ;
- `posts` via les posts de type `vlog` ;
- likes de posts génériques ;
- commentaires/réactions ;
- Storage média ;
- partage/deep links ;
- notifications ;
- realtime ;
- état local et brouillons ;
- profils et co-auteurs ;
- tour de démonstration ;
- migrations et policies RLS.

La conséquence est structurante : **on ne supprime pas le code CDV en même temps qu’on retire son bouton de navigation**.

## 2. Surface UI actuelle à sortir du cœur

### Navigation primaire

`index.html` contient actuellement cinq destinations dans la bottom-nav :

`Fil · Bobines · Créer · IRL · CDV`.

Décision :

- `CDV` disparaît de la navigation cœur ;
- `Bobines` n’est plus une destination produit primaire mais un format de contenu ;
- `Messages` devient destination primaire ;
- `Profil` devient destination primaire ou accès permanent équivalent ;
- `Créer` reste CTA central ;
- `IRL` reste primaire ;
- `Fil` reste primaire.

### Topbar

La topbar contient déjà des accès à `Explorer` et `Messages`. Le passage V2 doit éviter les doublons de destination sans rôle clair :

- si `Messages` passe dans la bottom-nav, l’icône topbar peut rester uniquement si elle sert un usage rapide/notification clairement distinct ; sinon elle est redondante ;
- `Explorer` reste secondaire tant qu’il ne prouve pas une fonction distincte du Feed/Recherche.

### Tour investisseur / démo

`TOUR_STEPS` contient une étape CDV et une étape Wallet. Les deux doivent être retirées du tour cœur. Le tour cible doit raconter la promesse : passions → feed → personnes → conversation → IRL.

### Studio

Le Studio expose aujourd’hui la création de carnet. Décision de transition :

- phase 1 : retirer l’entrée CDV du Studio cœur ou la masquer derrière un point d’entrée explicite **Passio : Voyage** non primaire ;
- phase 2 : réutiliser le code d’édition dans le vertical Voyage ;
- ne pas supprimer les fonctions d’éditeur avant que leur destination future soit décidée et testée.

## 3. Modules et comportements strictement voyage

Les éléments suivants sont candidats à l’extraction dans le vertical Voyage, pas à la suppression immédiate :

- écran `screen-cdv` ;
- éditeur de carnet/vlog ;
- `VLOG_DRAFT_KEY = passio_vlog_draft_v1` et logique de brouillon ;
- viewer de carnet ;
- carte/étapes/destination/budget/logement/transport/saison/conseils ;
- CDV Live ;
- favoris de lives/carnets ;
- collaborateurs de carnet ;
- collaborateurs de live ;
- interactions par étape/jour ;
- partage deep link `#carnet-<id>` ;
- filtres CDV/contextual tools ;
- création/inspiration depuis un carnet ;
- commentaires/réactions strictement CDV Live ;
- textes, styles et assets strictement CDV.

## 4. Briques partagées à préserver dans PASSIO cœur

Ces briques ne doivent pas être copiées ou supprimées aveuglément car elles servent aussi le cœur :

| Brique | Pourquoi elle est partagée | Action |
|---|---|---|
| `posts` | les carnets publiés sont des posts `type=vlog` et le Feed utilise `posts` | **PRÉSERVER** |
| likes génériques de post | un carnet peut être liké avec la même infrastructure qu’un post | **PRÉSERVER** |
| commentaires génériques | certaines surfaces partagent le renderer/comment interactions | **PRÉSERVER** |
| profils / identité auteur | auteur et co-auteurs utilisent les profils/comptes PASSIO | **PRÉSERVER** |
| notifications | invitations de co-auteurs et interactions transitent par les notifications | **PRÉSERVER** |
| Storage contenu | photos/vidéos/audio de carnets réutilisent l’infrastructure média | **PRÉSERVER** |
| helpers de sécurité | `escapeHtml`, `escapeJsArg`, `safeUrlAttr`, garde d’ownership | **PRÉSERVER** |
| realtime | infrastructure générique utilisée ailleurs | **PRÉSERVER** |
| `user_state` | peut contenir favoris/brouillons/état de voyage et d’autres données | **NE PAS PURGER** |
| navigation/history | infrastructure commune | **PRÉSERVER, adapter les routes** |

## 5. Dépendances DB vérifiées à préserver

### Carnets publiés

`migration_posts_vlog.sql` ajoute `posts.vlog jsonb` pour synchroniser les carnets cross-compte. Un carnet reste donc lié à la table cœur `posts`.

**Décision** : ne pas retirer `posts.vlog` lors de la sortie de CDV du cœur. Cette colonne devient une compatibilité de données / point de passage vers Passio : Voyage tant qu’une nouvelle frontière de données n’a pas été définie.

### Carnets collaboratifs

`migration_carnet_collaborators.sql` crée :

- `post_collaborators` ;
- fonction `can_edit_post(pid)` ;
- policy UPDATE partagée sur `posts` ;
- trigger `posts_freeze_author` ;
- realtime sur `post_collaborators`.

Point critique : cette migration modifie la **policy UPDATE commune de `posts`**. La supprimer ou la réécrire dans le cadre d’un simple retrait CDV pourrait casser l’ownership de contenu.

**Décision** : aucune suppression de cette fonction/policy/trigger au lot navigation. Audit RLS spécifique obligatoire avant toute séparation DB.

### CDV Live

`migration_cdv_lives.sql` crée :

- `cdv_lives` ;
- `cdv_live_steps` ;
- `cdv_live_comments` ;
- `cdv_live_reactions` ;
- `cdv_live_followers` ;
- policies RLS et index associés.

`migration_cdv_v2.sql` ajoute :

- `lat`, `lng` sur `cdv_live_steps` ;
- `cdv_live_collaborators` ;
- policies et realtime associés.

Autres migrations CDV vérifiées dans le dépôt :

- `migration_cdv_live_like_toggle.sql` ;
- `migration_cdv_lives_cascade.sql` ;
- `migration_cdv_lives_realtime.sql` ;
- `migration_cdv_step_video.sql` ;
- `migration_cdv_steps_update.sql`.

**Décision** : toutes ces structures sont conservées pendant l’extraction produit. Elles deviennent un domaine dormant ou verticalisé, pas des déchets à purger.

### Interactions par étape

`migration_step_interactions.sql` crée une table générique `step_interactions` dont `thread_id` couvre :

- `cdvstep:<liveId>:<stepId>` ;
- `carnetstep:<postId>:<index>`.

**Décision** : conserver la table. Si elle ne sert qu’au voyage aujourd’hui, cela n’autorise toujours pas un DROP sans inventaire prod et stratégie de verticalisation.

## 6. Compatibilité Feed

Un carnet publié peut continuer à exister dans les données et potentiellement dans l’historique du Feed après sa sortie de la navigation cœur.

Règle cible :

- le nouveau PASSIO cœur ne doit plus pousser la création CDV comme fonctionnalité centrale ;
- les anciens posts `type=vlog` ne doivent pas faire planter le Feed ;
- si un ancien carnet apparaît, la carte peut rester lisible ou afficher un CTA secondaire « Voir dans Passio : Voyage » ;
- ne pas maintenir deux éditeurs complets du carnet dans le cœur ;
- le partage d’un ancien carnet doit produire une destination valide, même si elle devient un pont vers le vertical Voyage.

## 7. Plan d’extraction en lots réversibles

### CDV-1 — Sortie navigation

- retirer `CDV` de bottom-nav ;
- mettre à jour ordre/config de navigation ;
- retirer étape CDV du tour cœur ;
- retirer raccourcis cœur évidents ;
- anciens accès `goTo('cdv')` doivent être inventoriés ;
- aucun changement DB.

**Preuves** : navigation, handlers, smoke, contextual-nav.

### CDV-2 — Sortie création cœur

- retirer création de carnet du Studio cœur ;
- conserver code derrière une frontière/route/flag temporaire si nécessaire ;
- enlever la récompense `publish_vlog` avec le chantier gamification ;
- préserver brouillons existants jusqu’à décision de migration.

**Preuves** : création post standard toujours verte ; aucun draft CDV supprimé silencieusement.

### CDV-3 — Pont de compatibilité

- définir comportement pour anciens `type=vlog` ;
- définir comportement de `#carnet-*` ;
- définir CTA « Passio : Voyage » si le vertical existe ; sinon fallback honnête sans écran cassé ;
- conserver données et médias.

### CDV-4 — Frontière technique

Claude Code doit produire une matrice :

`fonction/symbole | strictement Voyage | partagé | dépendances | nouveau propriétaire | stratégie`.

La séparation de fichiers n’est justifiée que si elle réduit réellement le couplage sans réécriture disproportionnée.

### CDV-5 — Frontière DB future

Seulement après usage réel du vertical Voyage : décider si `posts.vlog`, `post_collaborators` et/ou tables `cdv_*` restent dans le même projet Supabase ou migrent vers un autre schéma/service.

Aucun choix maintenant par anticipation.

## 8. Tests de non-régression obligatoires

Après CDV-1/CDV-2 :

- `smoke.spec.js` ;
- `navigation.spec.js` ;
- `contextual-nav.spec.js` ;
- `feed-ranking.spec.js` ;
- `feed-malformed-post.spec.js` ;
- `interactions.spec.js` ;
- `profils-types.spec.js` ;
- `multi-comptes.spec.js` si la surface touchée concerne les posts/identités ;
- `authz-critical.spec.js` si une policy ou écriture est touchée ;
- `cdv.spec.js` reste la preuve que la fonctionnalité préservée fonctionne tant qu’elle vit encore dans le dépôt.

Le but est paradoxal mais volontaire : **retirer CDV du cœur tout en gardant ses tests fonctionnels tant qu’on n’a pas fini son extraction**.

## 9. Critères d’acceptation

- aucun bouton CDV dans la navigation cœur ;
- aucun CDV dans le tour de valeur principal ;
- création cœur simplifiée ;
- aucun carnet/draft/média/donnée supprimé ;
- anciens `type=vlog` tolérés ;
- aucun handler fantôme ;
- Feed/IRL/Messages/Profil/Créer restent accessibles ;
- aucune modification RLS/DB opportuniste ;
- frontière entre briques Voyage et briques partagées documentée ;
- la réutilisation future dans **Passio : Voyage** reste possible sans copier aveuglément tout PASSIO.

## 10. Répartition IA

- **ChatGPT** : frontière produit, comportement de compatibilité, critères d’acceptation.
- **Claude Code** : recherche locale exhaustive, séparation des appels/fichiers, modifications multi-fichiers, tests.
- **Codex** : contrôle croisé des diffs qui touchent `posts`, RLS, realtime, history/deep links et tests de non-régression.
