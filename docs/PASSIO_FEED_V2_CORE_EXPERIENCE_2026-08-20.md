# PASSIO — Feed V2, expérience cœur

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Rôle du Feed** : découvrir des contenus **pour découvrir des personnes**, puis créer des interactions capables de devenir conversations et expériences IRL.

---

## 1. Principe directeur

Le Feed n'est pas un produit de consommation passive.

Sa boucle utile est :

```text
Passio
→ contenu pertinent
→ personne intéressante
→ interaction
→ profil
→ conversation
→ IRL
→ nouveau contenu
```

Le Feed V2 doit donc maximiser la **pertinence humaine**, pas le temps passé à scroller.

---

## 2. Existant vérifié à préserver

### 2.1 La carte Feed possède déjà le bon noyau humain

Le renderer actuel affiche déjà :

- avatar auteur cliquable ;
- nom auteur cliquable ;
- Passio ;
- heure/date relative ;
- contenu ;
- média ;
- like ;
- commentaires ;
- réaction ;
- partage.

Avatar et nom ouvrent déjà :

```js
openUserProfile(authorId, source)
```

C'est la bonne fondation. Il ne faut pas créer une nouvelle page auteur.

### 2.2 Le profil public possède déjà `Message` + `Suivre`

Le profil visité propose aujourd'hui :

- `💬 Message` → `startDirectMessage(...)` ;
- `➕ Suivre` / `✓ Suivi`.

Le parcours **Feed → Profil → Message** est donc déjà techniquement très proche de la cible.

Décision maintenue : **ne pas mettre un gros bouton “Message” sur chaque publication**. Le contenu mène à la personne ; le profil confirme le contexte humain avant la conversation.

### 2.3 Le Feed filtre déjà les comptes bloqués

La déduplication actuelle construit un ensemble d'IDs de posts associés aux auteurs bloqués et élimine ces posts du Feed.

À conserver ; les futurs modules personnes/IRL doivent appliquer la même règle.

### 2.4 Le ranking possède déjà des invariants utiles

Le score actuel combine :

```text
fraîcheur
+ affinité Passio
+ auteur suivi
+ engagement plafonné
```

La suite `feed-ranking.spec.js` prouve notamment :

- affinité utile à fraîcheur égale ;
- fraîcheur dominante ;
- aucun post ajouté/perdu ;
- fallback chronologique ;
- ordre stable.

**Ne pas réécrire ce ranking dans le premier lot Feed V2.**

---

## 3. Problèmes vérifiés du Feed actuel

### 3.1 Le Feed exclut explicitement les Bobines

Le code actuel fait :

```js
if (p.isReel) return false;
```

Cela coupe artificiellement l'un des meilleurs formats de découverte du Feed.

### 3.2 Les Bobines vivent comme une destination séparée

L'application possède un viewer `reelsViewer` avec titre **Bobines** et liste dédiée.

Le viewer peut rester pour l'expérience plein écran, mais **Bobines ne doit plus être un univers de navigation concurrent du Feed**.

### 3.3 Le Feed contient encore du CDV au sommet

`renderVlogCarousel()` injecte actuellement les carnets de voyage dans le haut du Fil avec une tuile :

> « Créer un carnet »

Le CDV sortant du cœur vers **Passio : Voyage**, ce carrousel doit sortir du Feed cœur.

### 3.4 Le filtre mood est trop structurant

`selectedMoods` démarre actuellement avec :

```js
new Set(["creation"])
```

Le Feed filtre ensuite réellement les posts par mood et peut afficher :

> « Choisis un mood »

Cela signifie qu'un contenu parfaitement pertinent pour la Passio choisie peut disparaître parce qu'il ne correspond pas au mood par défaut.

Décision : **le mood devient un raffinement facultatif**, jamais une condition pour avoir un Feed.

### 3.5 Explorer est encore une destination complète

Le topbar ouvre actuellement `screen-explore`.

Explorer possède déjà une recherche utile :

- Passions ;
- utilisateurs Supabase ;
- utilisateurs seed ;
- ouverture `openUserProfile`.

Cette capacité doit être **réutilisée dans le contexte du Feed**, pas supprimée.

### 3.6 Le Feed et les profils passion sont trop couplés conceptuellement

L'onboarding V2 sépare désormais :

- intérêts de découverte ;
- identité active ;
- profils passion supplémentaires.

Le Feed doit adopter la même sémantique.

---

## 4. Architecture cible du Feed V2

### Zone A — en-tête compact

Objectif : comprendre immédiatement **ce que je regarde**.

Contient :

- titre / branding PASSIO ;
- recherche ;
- notifications ;
- accès Messages si non déjà dans le nav final pendant la transition.

La recherche ouvre un overlay ou une vue légère utilisant les fonctions existantes de recherche Passio/utilisateur.

Pas besoin d'un écran Explorer permanent dans le nav cœur.

### Zone B — Passio du Feed

Ligne horizontale compacte :

```text
Pour toi | Suivis | 🎵 Musique | 📷 Photo | 🛹 Skate | …
```

#### `Pour toi`

Combine les intérêts persistés de l'utilisateur.

#### `Suivis`

Contenus des personnes suivies.

#### Passio

Un tap filtre explicitement la découverte sur cette Passio.

### Règle multi-profil

Toucher un filtre Passio **ne change pas silencieusement l'identité active**.

- Feed = ce que je découvre ;
- profil actif = identité avec laquelle j'agis/publie quand ce contexte est nécessaire.

Un changement d'identité doit être volontaire et visible.

### Zone C — stories

Les stories peuvent rester comme **format temporaire compact** dans le haut du Feed si elles sont actives et pertinentes.

Elles ne justifient pas une destination primaire.

Règles :

- pas de rang/points autour ;
- auteurs bloqués exclus ;
- comptes privés respectés ;
- pas de ligne vide permanente si aucune story utile.

### Zone D — flux principal multi-format

Un seul flux accueille :

- texte ;
- photo ;
- vidéo ;
- audio si conservé ;
- Bobine ;
- publication rattachée à un événement.

CDV n'est plus un format du Feed cœur.

---

## 5. Bobines : format du Feed, viewer en profondeur

### Décision

Une Bobine est un **post court vertical**, pas un produit séparé.

Dans le Feed :

- aperçu vidéo vertical ;
- auteur ;
- Passio ;
- légende courte ;
- interactions ;
- contexte IRL si disponible.

Tap sur la vidéo :

```text
Feed → reelsViewer
```

Le viewer plein écran est donc conservé comme **mode de lecture**, pas comme destination de navigation.

### Ranking

Une Bobine ne reçoit **aucun boost artificiel parce qu'elle est une Bobine**.

Elle passe par la même logique de pertinence que les autres contenus tant que les métriques humaines ne justifient pas une règle différente.

### Retour

Fermer le viewer revient au Feed à la position précédente si l'infrastructure courante le permet.

---

## 6. Bobine → IRL : utiliser `posts.event_id`

La base possède déjà :

```sql
posts.event_id
```

et le Studio sait déjà rattacher une publication à un événement via `window._pendingEventPost`.

Donc **aucune nouvelle table n'est nécessaire pour relier une Bobine à l'IRL**.

### Cas 1 — Bobine créée depuis un événement

Elle garde `event_id`.

Dans le Feed, afficher sous le contenu un module compact :

```text
🤝 À vivre en vrai
Jam skate · Lyon · samedi
Voir l'activité →
```

Les données affichées doivent respecter la future politique de visibilité IRL : ville/date publiques sûres ; jamais adresse exacte si non autorisée.

### Cas 2 — Bobine non liée à un événement

Ne rien forcer.

Après instrumentation, on pourra proposer de manière facultative :

> « Voir les activités de cette Passio »

sans prétendre que la Bobine correspond à un événement précis.

### Cas 3 — après IRL

Le flux déjà prévu **IRL → publication** peut produire photo, vidéo ou Bobine rattachée à `event_id`.

La boucle devient naturellement :

```text
Bobine → événement → présence → nouvelle Bobine/post
```

---

## 7. Carte Feed V2

### En-tête

Toujours visible :

```text
[avatar] Nom
         🎵 Passio · il y a 12 min
```

Optionnel : petit contexte :

- `Suivi` ;
- `Découverte` ;
- `Après un IRL` ;
- `Événement lié`.

Ne jamais afficher :

- Score Passion ;
- rang ;
- Passia ;
- leaderboard ;
- pseudo-indice de confiance générique.

### Corps

Selon format :

- texte lisible ;
- média pleine largeur ;
- Bobine avec ratio vertical ;
- texte long tronqué avec “Lire la suite”.

### Contexte Passio

La Passio doit toujours rester identifiable même lorsque le visuel domine.

### Actions

P0 : conserver les interactions éprouvées :

- like ;
- commentaire ;
- partage ;
- réactions existantes si elles restent lisibles.

Ne pas faire simultanément une refonte profonde des interactions et du ranking.

P1 après mesure : évaluer si le bouton emoji dédié doit être fusionné avec le like/réactions pour réduire le bruit visuel.

### Relation humaine

Avatar/nom restent le CTA principal vers la personne.

Pas de bouton `Message` dominant sur chaque carte.

---

## 8. Découverte de personnes sans écran Explorer primaire

Le Feed doit pouvoir introduire des personnes **sans devenir un annuaire**.

### Module `Passionnés à découvrir`

Un module séparé du ranking des posts peut apparaître avec parcimonie :

```text
Passionnés à découvrir · Photo
[avatar] Lina — Street photo    Voir
[avatar] Hugo — Argentique      Voir
```

Source :

- Passio sélectionnée ;
- profils visibles ;
- blocage respecté ;
- comptes déjà suivis dépriorisés ;
- aucune donnée sensible.

### Fréquence

P0/P1 : maximum un module dans une fenêtre de plusieurs contenus, et **jamais avant que l'utilisateur n'ait vu ses premiers contenus personnalisés**.

Ne pas injecter un module après chaque publication.

### Clic

```text
personne → openUserProfile → Suivre / Message
```

On réutilise donc exactement le cœur déjà existant.

---

## 9. Découverte IRL dans le Feed

À activer seulement après les P0 du Trust & Safety IRL.

### Module `À vivre en vrai`

Peut apparaître quand une Passio sélectionnée possède des événements pertinents.

Affiche uniquement :

- titre ;
- Passio ;
- date ;
- ville/zone sûre ;
- état complet/annulé si pertinent.

Ne doit jamais révéler automatiquement :

- adresse exacte ;
- GPS exact ;
- contact privé ;
- participants bruts.

### Localisation

Sans permission GPS :

- utiliser ville choisie manuellement si connue ;
- sinon proposer les événements pertinents sans prétendre être “près de toi”.

---

## 10. Mood : passer de filtre obligatoire à outil facultatif

### Actuel

```text
Création | Apprendre | Chill | Actu
```

avec `Création` actif par défaut.

### Cible

Par défaut : **aucun filtre mood restrictif**.

Deux options d'implémentation acceptables :

1. `selectedMoods` vide = pas de filtre ;
2. introduire un état explicite `all`.

La règle existante `selectedMoods vide → zéro post` doit être supprimée.

### UI

Déplacer les moods dans :

```text
Affiner ▾
```

ou une ligne secondaire non dominante.

Le Feed doit d'abord être filtré par **Passio**, pas par humeur imposée.

---

## 11. Recherche intégrée

Réutiliser le moteur `filterExplore()` / `supaSearchUsers` existant pour fournir depuis le Feed :

```text
Recherche
├── Passions
├── Personnes
└── contenus, si la capacité réelle est ensuite ajoutée
```

### P0

- Passions ;
- personnes.

### P1

- contenus ;
- événements IRL sûrs.

### Assistant IA

Ne pas mettre l'assistant IA au centre du Feed.

Il reste secondaire tant qu'un usage clair n'est pas démontré : découverte, aide à créer ou sécurité.

Les anciennes suggestions IA Wallet/Passia/CDV doivent disparaître dans les lots dédiés.

---

## 12. Ranking : doctrine de migration

### Feed V2-A

**Aucun changement de formule.**

Modifier seulement :

- sources/format éligibles ;
- persistance des filtres ;
- exclusion CDV ;
- intégration Bobines ;
- mood non bloquant ;
- modules de découverte séparés.

### Feed V2-B, après instrumentation

Signaux candidats :

- pertinence Passio ;
- affinité auteur ;
- fraîcheur ;
- qualité ;
- diversité d'auteurs ;
- découverte contrôlée ;
- conversation issue du contenu ;
- IRL issue du contenu ;
- sécurité/modération.

### Ne pas optimiser directement

- temps de session ;
- nombre de scrolls ;
- autoplay ;
- répétition infinie d'un même format ;
- engagement outrageux comme objectif autonome.

---

## 13. Diversité du Feed

Même sans changer le score, ajouter plus tard un **post-processing borné** peut empêcher :

- 8 posts du même auteur consécutifs ;
- 10 Bobines consécutives ;
- répétition excessive d'une seule Passio lorsque plusieurs ont été choisies.

Mais ce mécanisme vient **après les métriques** et doit préserver l'ensemble des contenus éligibles.

---

## 14. États vides

### Aucun intérêt configuré

> « Choisis tes Passio pour construire ton Fil. »

CTA : `Choisir mes Passio`.

### Passio configurée mais aucun contenu

> « Rien de nouveau ici pour le moment. »

Actions :

- voir des passionnés ;
- ajouter une autre Passio ;
- publier quelque chose.

### Suivis vide

> « Suis des personnes qui partagent tes Passio. »

CTA vers recherche/personnes, pas vers un écran générique confus.

### Mood

Il n'existe plus d'état vide “Choisis un mood” dans le parcours par défaut.

---

## 15. Instrumentation Feed V2

Réutiliser les événements canoniques :

```text
personalized_feed_viewed
feed_post_impression
feed_author_opened
profile_opened_from_feed
meaningful_interaction
conversation_cta_opened
conversation_started
```

Ajouter si nécessaire :

```text
feed_reel_opened
feed_people_module_viewed
feed_person_opened
feed_irl_module_viewed
feed_irl_opened
feed_filter_changed
feed_search_opened
```

### Propriétés sûres

- `post_id` ;
- `author_id` ;
- `passion_id` ;
- `format` ;
- `source_module` ;
- `event_id` si public/autorisé ;
- `active_profile_id` si nécessaire à la compréhension du contexte.

Jamais :

- texte du post dans l'analytics ;
- message privé ;
- adresse exacte ;
- GPS ;
- e-mail/téléphone.

---

## 16. Tests Feed V2

### FEED2-01 — first value

Après onboarding avec une Passio, le Feed contient immédiatement les contenus correspondants.

### FEED2-02 — reload

Les Passio sélectionnées sont restaurées après rechargement.

### FEED2-03 — mood non bloquant

Sans sélection de mood, les contenus Passio restent visibles.

### FEED2-04 — Bobine éligible

Un post `isReel=true` correspondant à une Passio sélectionnée apparaît dans le Feed.

### FEED2-05 — Bobine viewer

Tap aperçu Bobine → ouvre le viewer ; fermeture → retour Feed cohérent.

### FEED2-06 — ranking invariant

L'intégration Bobines ne modifie pas arbitrairement le score : même formule et même propriété “aucun contenu ajouté/perdu”.

### FEED2-07 — CDV absent

Aucun carrousel « Créer un carnet » dans le Feed cœur.

### FEED2-08 — auteur

Avatar/nom → bon profil ; source Feed conservée.

### FEED2-09 — profil → message

Depuis le profil ouvert via Feed : conversation existante réutilisée ou créée une fois.

### FEED2-10 — blocage

Auteur bloqué absent des posts, modules personnes et modules IRL associés.

### FEED2-11 — compte privé

Aucun contenu privé ne réapparaît via module/reel/recherche.

### FEED2-12 — Bobine liée IRL

`event_id` valide → module IRL affiché avec seulement données publiques autorisées.

### FEED2-13 — événement disparu/annulé

Le post reste lisible ; le CTA événement disparaît ou affiche l'état annulé proprement.

### FEED2-14 — aucune fuite adresse

Le module événement Feed ne contient jamais l'adresse exacte sans droit correspondant.

### FEED2-15 — filtre ≠ identité

Changer de Passio dans le Feed ne modifie pas `currentProfileId` silencieusement.

### FEED2-16 — identité de publication

Créer depuis le Feed affiche explicitement le profil qui publie.

### FEED2-17 — recherche

Recherche depuis Feed trouve Passions et personnes et ouvre le bon profil.

### FEED2-18 — ranking fallback

`passio_feed_rank=0` conserve le tri chronologique.

### FEED2-19 — analytics privacy

Impressions/ouvertures instrumentées sans texte, GPS ou adresse.

### FEED2-20 — mobile

Scroll, vidéo, retour viewer et ouverture profil restent fluides sur viewport mobile.

---

## 17. Lots d'implémentation recommandés

### F2-1 — Feed default state

- restaurer `selectedFeedPassions` ;
- mood non restrictif par défaut ;
- supprimer l'état vide mood ;
- tests.

### F2-2 — retirer CDV du Feed

- retirer le carrousel ;
- préserver le code/data CDV pour Passio : Voyage ;
- aucun changement DB destructif.

### F2-3 — Bobines inline

- retirer l'exclusion `p.isReel` ;
- renderer adapté ;
- tap vers viewer existant ;
- retour ;
- tests ranking/non-régression.

### F2-4 — recherche Feed

- réutiliser recherche Passions/utilisateurs ;
- supprimer progressivement le besoin de `screen-explore` primaire ;
- pas de duplication de logique.

### F2-5 — personnes à découvrir

- module borné ;
- filtres blocage/confidentialité ;
- instrumentation.

### F2-6 — IRL contextuel

Après durcissement Trust & Safety :

- rendre `posts.event_id` dans le Feed ;
- module événement sûr ;
- événements par Passio en module facultatif.

### F2-7 — ranking V2

Seulement après données suffisantes.

---

## 18. Scope guard

Le lot Feed V2 initial ne doit pas :

- réécrire la messagerie ;
- réécrire le ranking ;
- introduire un système ML complexe ;
- créer une économie interne ;
- créer une destination Bobines séparée nouvelle ;
- réintroduire CDV ;
- modifier les policies IRL sensibles dans le même diff ;
- imposer autoplay sonore ;
- changer silencieusement de profil actif ;
- mesurer du contenu privé.

---

## 19. Definition of Done

Le Feed V2 est prêt lorsque :

- premier Feed personnalisé immédiatement ;
- Passio persistées ;
- mood facultatif ;
- CDV absent ;
- texte/photo/vidéo/Bobine dans un même flux ;
- Bobine ouvre le viewer existant ;
- auteur toujours accessible ;
- profil → Message reste simple ;
- recherche Passions/personnes accessible sans Explorer primaire ;
- Bobine/post lié à IRL peut exposer un CTA sûr via `event_id` ;
- aucune adresse/GPS privé ne fuit ;
- blocage/confidentialité préservés ;
- ranking actuel et sa soupape chronologique préservés jusqu'à instrumentation ;
- tests mobile, Feed, profils, interactions, ranking, confidentialité et multi-comptes verts.

---

## 20. Répartition IA

### ChatGPT

- garde le Feed orienté relation humaine ;
- arbitre hiérarchie des contenus/modules ;
- protège le lien Feed + IRL et la simplicité ;
- définit critères d'acceptation et métriques.

### Claude Code

- identifie tous les chemins `renderFeed`, Bobines, filtres et recherche ;
- implémente F2-1 à F2-6 en petits diffs ;
- conserve les invariants ranking/realtime ;
- mesure performances mobile.

### Codex

- vérifie pertes/duplications de posts ;
- attaque les cas block/private ;
- vérifie retour viewer et races realtime ;
- contrôle `event_id` et absence de fuite de localisation ;
- vérifie qu'un filtre Feed ne change pas silencieusement l'identité multi-profil.
