# PASSIO — Profil & Multi-profil V2

> ## ⚠️ PARTIELLEMENT REMPLACÉ par ADR-010 (2026-08-30)
>
> **Ce qui reste en vigueur** : le principe de séparation du §1 — « changer un filtre Feed ne change
> pas de profil passion ; changer de profil passion ne change pas automatiquement les intérêts
> Feed ». ADR-010 le reprend mot pour mot et l'implémente.
>
> **Ce qui est remplacé** : le modèle d'identité. Ce document définit le « profil passion » comme
> une *identité publique dans un contexte de passion*, avec ses *relations et contexte social
> associés*, et vise une table serveur `passion_profiles` avec visibilité par passion. Cette cible
> n'a jamais été construite, et [ADR-010](../.passio/adr/ADR-010-identite-publique-unique-passions-classification.md)
> décide de ne pas la construire : un compte a **une seule** identité publique, et une passion est
> une étiquette de classification et une préférence de lecture — sans abonnés, sans pseudonyme,
> sans cloisonnement de confidentialité.
>
> Le §2 (« état réel vérifié du produit ») reste exact et utile : il avait correctement diagnostiqué
> que « l'architecture actuelle est fondamentalement compte-first au niveau serveur ». C'est ce
> constat qu'ADR-010 entérine au lieu de chercher à le corriger.
>
> Le reste du document est conservé tel quel, comme trace du cadrage d'origine.

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Mission** : rendre le multi-profil réellement compréhensible, stable et sûr, sans confondre compte, intérêts du Feed et identité passionnelle.

---

## 1. Décision produit

PASSIO doit distinguer trois concepts qui sont aujourd’hui partiellement mélangés :

```text
Compte
├── sécurité / authentification / propriété des données
├── identité générale
└── contrôle de plusieurs profils passion

Profil passion
├── identité publique dans un contexte de passion
├── bio / avatar / couverture / Passio
├── contenus publiés avec cette identité
└── relations et contexte social associés

Intérêts Feed
└── ce que l’utilisateur veut découvrir
```

Ces trois concepts peuvent se recouper, mais **ne doivent jamais être équivalents automatiquement**.

Changer un filtre Feed ne change pas de profil passion.
Changer de profil passion ne change pas automatiquement les intérêts Feed.
Ajouter un intérêt ne crée pas automatiquement une identité publique.

---

## 2. État réel vérifié du produit

### 2.1 Le multi-profil existe surtout dans `user_state`

Le client maintient :

```text
state.user.profiles[]
state.user.currentProfileId
```

et permet de créer plusieurs profils passion.

Mais le schéma de production du 17 août 2026 ne contient pas de table serveur dédiée représentant ces identités passionnelles comme objets indépendants.

### 2.2 `profiles` est actuellement une identité compte

Le schéma production contient :

```text
profiles.id
profiles.username
profiles.emoji
profiles.color
profiles.passion_id
profiles.passions jsonb
profiles.bio
profiles.avatar_url
profiles.cover_url
profiles.is_private
profiles.rs_links
```

Plusieurs tables sociales référencent directement `profiles.id` :

```text
posts.author_id → profiles.id
stories.author_id → profiles.id
post_comments.author_id → profiles.id
conv_messages.from_id → profiles.id
conv_members.user_id → profiles.id
```

L’architecture actuelle est donc fondamentalement **compte-first** au niveau serveur.

### 2.3 Changer de profil actif réécrit actuellement l’identité publique du compte

`switchToProfile(id)` :

- met à jour `state.user.currentProfileId` ;
- sauvegarde l’état ;
- appelle `supaUpsertProfile()` ;
- synchronise `user_state`.

Le commentaire du code dit explicitement que le profil actif devient l’identité publique de la ligne `profiles` du compte.

### 2.4 Les anciens posts relisent l’identité courante de la ligne `profiles`

`supaLoadPosts()` charge :

```sql
profiles!author_id(username,emoji,color,avatar_url,is_private)
```

puis construit le post avec :

```text
authorName = r.profiles.username
authorEmoji = r.profiles.emoji
authorColor = r.profiles.color
authorAvatar = r.profiles.avatar_url
```

Conséquence : **un ancien post ne transporte pas l’identité passionnelle publique qui l’a créé**.

Si l’identité publique de la ligne `profiles` change, l’ancien contenu peut être rendu avec la nouvelle identité courante du compte.

C’est incompatible avec un multi-profil passionnel fort.

### 2.5 `posts` n’a pas de `passion_profile_id`

Le schéma actuel possède :

```text
posts.author_id
posts.passion_id
```

mais pas d’identifiant immuable de profil passion.

`passion_id` indique le thème du contenu, pas l’identité publique qui a publié.

### 2.6 Confidentialité actuelle au niveau compte

`profiles.is_private` est un booléen unique.

La confidentialité actuelle ne permet donc pas une séparation propre du type :

```text
Profil Photo public
Profil Musique followers-only
Profil Escalade privé
```

sans nouvelle modélisation.

### 2.7 Follow actuel au niveau compte

Le schéma `follows` contient :

```text
follower_id
following_id
```

sans `passion_profile_id`.

Suivre quelqu’un signifie aujourd’hui suivre le compte, pas explicitement une de ses identités passionnelles.

### 2.8 L’UI mélange identité et filtrage

Sur l’écran Profil, `profileList` représente les profils passion, mais le tap sur une carte appelle `toggleProfileSelect(profileId)` et sert surtout à filtrer les contenus affichés.

L’activation réelle de l’identité passe par `switchToProfile(id)` ailleurs.

Le même objet visuel sert donc à deux concepts :

- identité active ;
- filtre d’affichage.

C’est ambigu.

### 2.9 Le Feed utilise encore les profils passion comme filtres

`renderProfileStrip()` transforme `state.user.profiles` en filtres Feed par Passio.

Avec Onboarding V2 et Feed V2, cela doit être remplacé par les **intérêts Feed persistés** (`selectedFeedPassions`).

Le profil passion n’est pas un filtre de consommation.

### 2.10 La création de profil contient encore une économie

Le code actuel possède :

```text
FREE_PROFILES_LIMIT = 3
EXTRA_PROFILE_COST_PASSIA = 150
Pass Passion
paiement Passia
récompense profile_create
+15 pts · +2 Passia
```

Tout ce modèle sort du cœur avec Wallet/Passia/points.

---

## 3. Architecture cible : compte + profils passion

### 3.1 `profiles` reste la racine compte

Ne pas détourner brutalement la table `profiles` actuelle.

Elle est déjà utilisée comme racine d’identité et comme FK par de nombreuses tables sensibles.

Cible conceptuelle :

```text
profiles
= compte public / propriétaire / racine auth-sociale
```

Elle conserve notamment :

- `id = auth user id` selon le contrat existant ;
- display name général ;
- avatar général ;
- confidentialité par défaut ;
- informations générales du compte.

### 3.2 Ajouter une entité `passion_profiles`

Nom recommandé :

```sql
passion_profiles
```

Champs proposés :

```text
id uuid/text PK
account_id text NOT NULL FK → profiles.id
passion_id text NOT NULL FK → passions.id
display_name text
bio text
emoji text
color text
avatar_url text
cover_url text
visibility text NOT NULL DEFAULT 'inherit'
status text NOT NULL DEFAULT 'active'
is_primary boolean NOT NULL DEFAULT false
created_at timestamptz
updated_at timestamptz
```

Contrainte cible :

```text
UNIQUE(account_id, passion_id)
```

pour le premier modèle simple.

Si un jour plusieurs identités pour la même Passio deviennent réellement nécessaires, cette contrainte pourra évoluer avec une migration explicite.

### 3.3 `account_id` reste la racine sécurité

Les policies ne doivent jamais faire confiance à un `passion_profile_id` fourni par le client sans vérifier :

```text
passion_profiles.account_id = auth.uid()
```

Toute écriture avec identité passionnelle exige cette preuve.

---

## 4. Identité historique immuable des contenus

### 4.1 Ajouter `passion_profile_id` aux contenus futurs

P0 cible :

```text
posts.passion_profile_id nullable
stories.passion_profile_id nullable
```

Puis progressivement, selon besoin réel :

```text
events.passion_profile_id
post_comments.passion_profile_id
```

### 4.2 Pourquoi nullable

Les données historiques n’ont pas cette information fiable.

Il serait dangereux de deviner quelle identité passionnelle a créé chaque ancien contenu à partir du profil actuellement actif.

Donc :

```text
legacy row → passion_profile_id = NULL
new row → passion_profile_id obligatoire côté application
```

### 4.3 Fallback historique

Pour les anciens objets :

- afficher l’identité générale du compte ;
- afficher la `passion_id` du contenu ;
- ne pas prétendre connaître l’ancien profil passion exact.

### 4.4 Pas de backfill inventé

Un backfill automatique n’est autorisé que si une preuve fiable existe dans les données historiques.

Sinon : **NULL est plus vrai qu’une attribution fabriquée**.

---

## 5. Rendu public d’un contenu V2

### Nouveau contenu

Le renderer résout :

```text
post.author_id → compte propriétaire
post.passion_profile_id → identité publique historique
```

Puis affiche les champs du profil passion.

### Si profil passion supprimé/désactivé

Ne pas casser l’historique.

Options recommandées :

- soft-delete (`status = archived`) ;
- conserver les champs nécessaires au rendu historique ;
- ne jamais cascade-delete les posts simplement parce qu’un profil passion est archivé.

### Si compte supprimé

Appliquer la politique de suppression du compte globale ; ce sujet reste séparé.

---

## 6. Profil personnel V2

L’écran Profil personnel devient beaucoup plus simple.

### Zone 1 — identité générale

```text
[avatar] Benjamin
Bio générale
liens sociaux

142 abonnés · 84 abonnements

[Modifier le profil]
```

Supprimer du cœur :

- étoiles ;
- Score Passion ;
- Passia ;
- rang ;
- leaderboard ;
- compteurs de récompenses ;
- badges génériques non essentiels au MVP.

### Zone 2 — mes profils passion

Titre :

> **Mes Passio**

Exemple :

```text
🎵 Musique        Actif
📷 Photographie   Activer
🏄 Surf           Activer

+ Créer un profil Passio
```

### Carte passion

Affiche :

- avatar/emoji ;
- Passio ;
- bio courte ;
- état `Actif` ;
- visibilité si différente du défaut ;
- menu `…`.

### Tap sur une carte

Ouvre la fiche/gestion de cette identité.

**Ne sert plus à filtrer les posts du profil personnel.**

### Activation

Action explicite :

> `Utiliser cette identité`

Puis seulement :

```text
state.user.currentProfileId = passionProfile.id
```

La transition doit être visuellement confirmée.

---

## 7. Création d’un profil passion V2

### Entrées naturelles

- Profil → `+ Ajouter une Passio` ;
- Creation V2 lorsqu’on veut publier dans une Passio sans identité ;
- après une utilisation répétée d’une Passio, éventuellement suggestion contextuelle.

### Formulaire minimum

```text
Choisir la Passio
Nom affiché (prérempli depuis le compte)
Bio courte optionnelle
Avatar optionnel
Visibilité
```

### Valeurs par défaut

- display name : identité générale ;
- avatar : identité générale ou emoji Passio ;
- visibilité : `inherit` ;
- Passio : explicite ;
- aucun GPS ;
- aucune récompense ;
- aucun coût Passia ;
- aucun rang.

### Aucun paywall interne Passia

Supprimer la logique :

```text
FREE_PROFILES_LIMIT
EXTRA_PROFILE_COST_PASSIA
openProfilePaywall
payForExtraProfile
Pass Passion
```

du produit cœur.

Une future monétisation éventuelle doit être conçue séparément et ne doit pas dépendre d’une monnaie interne.

---

## 8. Suppression / archivage d’un profil passion

### Décision

Un profil passion avec historique public ne doit pas être hard-delete immédiatement.

Action utilisateur :

> `Archiver ce profil`

Effets :

- plus sélectionnable pour de nouvelles publications ;
- absent des suggestions de changement d’identité ;
- contenus historiques restent rendables ;
- relations éventuelles restent cohérentes ;
- possibilité de restaurer si raisonnable.

### Profil sans historique

Un hard delete peut éventuellement être permis si aucune dépendance n’existe, mais ce n’est pas requis pour le premier lot.

---

## 9. Profil public visité V2

Le profil visité doit répondre immédiatement :

> Qui est cette personne, quelles Passio partage-t-elle, puis-je entrer en relation avec elle ?

### En-tête

```text
[avatar] Benjamin
Bio générale

[Suivre] [Message]
```

### Passio publiques

```text
Ses Passio
🎵 Musique
📷 Photo
🏄 Surf
```

Tap sur une Passio :

```text
profil public
→ vue de l’identité passionnelle
→ contenus de cette identité
→ activités publiques sûres liées
```

### Contexte Feed

Si le profil a été ouvert depuis un post Photo, ouvrir directement ou mettre en évidence le profil passion Photo correspondant.

### CTA

Priorité :

1. `Suivre` ;
2. `Message` ;
3. activités IRL publiques sûres si disponibles.

Pas de score de prestige.

---

## 10. Follow : décision par étapes

### État actuel

Follow = compte → compte.

### Lot P0

Conserver temporairement la sémantique compte pour éviter une migration sociale massive pendant la simplification.

Le bouton reste :

> `Suivre`

et signifie suivre la personne dans son ensemble.

### Cible P1

Évaluer le passage à :

```text
profile_follows
follower_account_id
following_passion_profile_id
```

ou modèle équivalent.

Cela permettrait :

> suivre la Photo de Benjamin sans nécessairement suivre son Surf.

Cette évolution doit être instrumentée et testée avant migration, car elle touche :

- Feed ;
- notifications ;
- confidentialité ;
- recherche ;
- compteurs ;
- blocage.

### Ne pas faire

Ne pas simuler un follow par profil uniquement en local.

---

## 11. Messagerie : compte pour la sécurité, identité figée pour l’UX

### État actuel

`conv_members.user_id` et `conv_messages.from_id` référencent le compte `profiles.id`.

Cela est utile pour la sécurité et ne doit pas être cassé dans le lot Profil V2 initial.

### P0

Conserver la membership au niveau compte.

Lorsque la conversation est créée depuis une identité passionnelle :

- conserver le contexte UX non sensible ;
- ne pas changer automatiquement d’identité dans une conversation existante ;
- ne pas réécrire le schéma messages dans le même lot.

### Cible P1

Le système devra figer l’identité passionnelle utilisée dans une conversation, par exemple via :

```text
conv_members.passion_profile_id nullable
```

ou une table de binding dédiée.

Objectif : les anciens messages ne doivent pas changer de nom/avatar si l’utilisateur change d’identité active.

Tout changement d’identité dans une conversation devra être explicite et auditable.

---

## 12. Commentaires et réactions

### Compte propriétaire

L’authentification et l’autorisation restent compte-first.

### Identité publique

À terme, un commentaire peut porter :

```text
author_id = compte
passion_profile_id = identité affichée
```

Mais cela ne doit pas être ajouté au premier diff si cela élargit excessivement le scope.

### Priorité

1. posts ;
2. stories ;
3. events ;
4. commentaires/messages selon preuve d’usage.

---

## 13. IRL et profils passion

### Création d’événement

À terme :

```text
events.author_id = compte
events.passion_profile_id = identité organisatrice
```

Cela évite que l’organisateur public change de visage lorsque le compte active une autre Passio.

### Affichage profil public

Une identité passionnelle peut afficher ses événements publics seulement si :

- visibilité événement autorisée ;
- localisation publique sûre ;
- mineurs/gates respectés ;
- aucun blocage pertinent.

### Adresse exacte

Jamais sur le profil public par simple rattachement IRL.

---

## 14. Confidentialité V2

### Compte

Garde une confidentialité par défaut :

```text
profiles.is_private
```

### Profil passion

Ajoute :

```text
visibility = inherit | public | followers | private
```

### Résolution

`inherit` → politique du compte.

Les autres valeurs sont des overrides explicites.

### RLS

La visibilité doit être appliquée serveur.

Une carte masquée uniquement côté client n’est jamais une preuve de confidentialité.

### Blocage

Un block compte ↔ compte domine toutes les identités passionnelles.

Créer un nouveau profil passion ne doit jamais contourner un block existant.

---

## 15. Recherche et découverte

### Résultat personne

La recherche peut continuer à afficher l’identité générale :

```text
Benjamin
🎵 Musique · 📷 Photo
```

### Résultat profil passion

P1 : autoriser recherche précise :

```text
Benjamin · Photo
```

ouvrant directement le profil passion.

### Indexation

Ne jamais indexer une identité `private` ou interdite par le modèle de visibilité.

---

## 16. Contenu du profil personnel

L’actuelle barre :

```text
Posts | Photos | Vidéos | Bobines | Carnets
```

est trop liée aux anciens silos de formats.

### Cible P0

```text
Publications | IRL
```

Puis filtres secondaires si utile :

```text
Tous | Photos | Vidéos | Bobines
```

### CDV

`Carnets` sort du profil cœur avec Passio : Voyage.

Il pourra rester accessible via l’univers Voyage, pas via un onglet cœur permanent.

---

## 17. Statistiques publiques

### Garder

- publications ;
- abonnés ;
- abonnements.

### Évaluer avant exposition

- nombre d’événements ;
- nombre de rencontres ;
- présence IRL.

Ces métriques peuvent devenir des signaux de pression sociale ou de sécurité et ne doivent pas être ajoutées automatiquement.

### Supprimer du cœur

- score ;
- points ;
- Passia ;
- rang ;
- leaderboard ;
- prestige générique.

---

## 18. Migration historique

### Étape 1 — aucun changement destructif

Créer `passion_profiles` sans modifier immédiatement les FK historiques.

### Étape 2 — matérialiser les profils passion existants

À partir de `user_state.data.user.profiles`, créer côté serveur des `passion_profiles` lorsqu’un utilisateur se connecte avec le nouveau client.

Conditions :

- opération idempotente ;
- validation de propriété par `auth.uid()` ;
- déduplication `(account_id, passion_id)` ;
- aucune création pour données malformées ;
- journalisation de migration.

### Étape 3 — starter profile

Pour les nouveaux comptes, créer seulement le profil passion primaire défini par Onboarding V2.

### Étape 4 — colonnes nullable

Ajouter `passion_profile_id` aux nouvelles publications.

### Étape 5 — double-read

Renderer :

```text
si passion_profile_id présent
→ lire passion_profiles
sinon
→ fallback compte legacy
```

### Étape 6 — writes nouveaux

Nouveaux posts exigent une identité passionnelle valide côté application ; le serveur vérifie ownership.

### Étape 7 — métriques et observation

Mesurer :

- taux de rows legacy ;
- échecs de migration ;
- références invalides ;
- divergence identité compte/profil.

### Étape 8 — seulement ensuite envisager NOT NULL

Pas avant que les données historiques et clients anciens soient maîtrisés.

---

## 19. Compatibilité ancien client / nouveau client

Pendant la transition :

### Ancien client

Continue à écrire sans `passion_profile_id`.

### Nouveau client

Écrit `passion_profile_id` quand disponible.

### Serveur

Accepte temporairement les deux formats.

### Lecture

Nouveau client sait lire les deux.

### Fin de transition

Seulement après adoption suffisante, décider si les écritures legacy doivent être refusées.

---

## 20. RLS proposée pour `passion_profiles`

### SELECT

Autorisé selon :

- propriétaire ;
- visibilité ;
- relation follow ;
- block dans les deux sens ;
- politique compte héritée.

### INSERT

```text
account_id = auth.uid()
```

### UPDATE / ARCHIVE

```text
account_id = auth.uid()
```

### DELETE

À limiter fortement ; préférer archive.

---

## 21. Sentinelle / Centre de pilotage

Toute migration multi-profil doit être visible dans le Centre de pilotage.

### Signaux minimum

- `passion_profile_created` ;
- `passion_profile_migration_failed` ;
- `invalid_profile_ownership_attempt` ;
- `content_profile_reference_missing` ;
- `legacy_identity_fallback_used` ;
- erreurs RLS associées.

### Alertes

Créer une alerte si :

- hausse d’échecs ownership ;
- posts nouveaux sans `passion_profile_id` au-delà d’un seuil attendu ;
- référence vers profil archivé/inexistant inattendue ;
- fuite cross-account détectée par tests ou prod diagnostics.

### Données

Ne pas envoyer bio, nom ou contenu privé dans les événements techniques de Sentinelle.

---

## 22. Analytics produit

Événements proposés :

```text
profile_viewed
passion_profile_viewed
passion_profile_created
passion_profile_activated
passion_profile_archived
profile_follow_clicked
profile_message_clicked
profile_irl_opened
```

Propriétés sûres :

- `source` ;
- `passion_id` ;
- `is_own_profile` ;
- `profile_count_bucket` ;
- `visibility_mode`.

Jamais :

- bio texte ;
- display name ;
- email ;
- GPS/adresse ;
- contenu privé.

---

## 23. Tests d’acceptation Profil V2

### PROF2-01 — séparation Feed/identité

Changer les intérêts Feed ne modifie jamais l’identité active.

### PROF2-02 — activation explicite

Une identité ne devient active qu’après action utilisateur explicite.

### PROF2-03 — ancien post stable

Un post avec `passion_profile_id` conserve nom/avatar/profil passion affichés après activation d’un autre profil du même compte.

### PROF2-04 — legacy fallback

Un ancien post sans `passion_profile_id` reste lisible via identité générale sans attribution inventée.

### PROF2-05 — ownership

Compte A ne peut jamais créer/modifier le profil passion de B.

### PROF2-06 — création progressive

Créer un profil passion ne crée aucun point/Passia/transaction.

### PROF2-07 — pas de paywall Passia

Le quatrième profil n’ouvre aucun paywall Wallet/Passia.

### PROF2-08 — profil archivé

Profil archivé non sélectionnable pour nouvelle publication ; ancien contenu reste lisible.

### PROF2-09 — suppression sans cascade contenu

Archiver un profil ne supprime pas les posts associés.

### PROF2-10 — confidentialité inherit

Profil `inherit` respecte `profiles.is_private`.

### PROF2-11 — confidentialité override

Profil `private` reste invisible aux comptes non autorisés côté serveur.

### PROF2-12 — blocage

Un nouveau profil passion ne permet pas de contourner un block compte-compte.

### PROF2-13 — recherche privée

Profil passion privé absent des résultats non autorisés.

### PROF2-14 — Feed privé

Contenus d’un profil passion privé n’apparaissent pas via Feed/Bobine/modules de découverte.

### PROF2-15 — profil public depuis Feed

Tap auteur d’un post V2 ouvre le bon profil passion en contexte.

### PROF2-16 — Suivre

Le CTA follow P0 garde la sémantique compte sans créer une fausse relation profile-specific locale.

### PROF2-17 — Message

Profil public → Message réutilise la conversation compte existante sans envoyer automatiquement de message.

### PROF2-18 — identité conversation

Changer le profil actif ne réécrit pas visuellement l’identité historique déjà affichée dans une conversation une fois le binding P1 implémenté.

### PROF2-19 — création

Creation V2 affiche le profil passion qui publie et écrit son `passion_profile_id`.

### PROF2-20 — event identity

Événement V2 peut être relié à une identité passionnelle sans exposer d’adresse privée.

### PROF2-21 — migration idempotente

Relancer la migration de `user_state` ne crée aucun doublon.

### PROF2-22 — multi-device

Les mêmes profils passion apparaissent après connexion sur un second appareil.

### PROF2-23 — ancien client

Un write legacy reste lisible pendant la fenêtre de compatibilité.

### PROF2-24 — analytics privacy

Aucun nom/bio/email/contenu privé dans analytics.

### PROF2-25 — mobile

Activation, édition, création et changement d’identité restent utilisables à une main sur petit écran.

### PROF2-26 — Sentinelle

Échecs de migration/référence sont visibles et diagnostiquables sans PII inutile.

---

## 24. Ordre d’implémentation recommandé

### P2-0 — audit avant migration

Claude Code confirme localement :

- schéma production réel ;
- policies `profiles`, `posts`, `stories`, `follows`, messages ;
- forme réelle `user_state.user.profiles` ;
- tous les appels `switchToProfile`, `supaUpsertProfile`, `renderProfileStrip`, `publishPost`, `supaLoadPosts` ;
- tests multi-profil existants.

### P2-1 — nettoyage UI sans schéma

- retirer score/Passia/badges génériques du profil cœur ;
- retirer paywall profil Passia ;
- clarifier `Mes Passio` ;
- séparer sélection de contenu et activation d’identité ;
- retirer Carnets du profil cœur ;
- tests UI.

### P2-2 — table `passion_profiles`

Migration expand-only :

- table ;
- indexes ;
- RLS ownership/visibility ;
- aucun changement destructif.

### P2-3 — migration des profils existants

- matérialisation idempotente depuis `user_state` ;
- starter profile nouveaux comptes ;
- tests cross-device et ownership.

### P2-4 — posts identifiés

- `posts.passion_profile_id nullable` ;
- write nouveau ;
- read dual ;
- historique stable ;
- tests cross-profile.

### P2-5 — stories

Même principe si stories restent dans le cœur.

### P2-6 — événements

Seulement après Trust & Safety IRL :

- identité organisatrice ;
- localisation privée séparée ;
- mineurs/gates.

### P2-7 — follow par profil

Étude + instrumentation, pas avant stabilisation P2-4.

### P2-8 — identity binding messagerie

Après gate authz DM et tests cross-compte.

---

## 25. Garde-fous absolus

- ne pas transformer `profiles.id` en identifiant de profil passion ;
- ne pas casser les FK auth/sociales existantes ;
- ne pas backfiller une identité historique sans preuve ;
- ne pas hard-delete les profils passion avec historique ;
- ne pas simuler une confidentialité profile-level uniquement en UI ;
- ne pas permettre qu’un profil passion contourne un block compte-compte ;
- ne pas changer silencieusement `currentProfileId` ;
- ne pas recoupler les profils passion aux intérêts Feed ;
- ne pas réintroduire Wallet/Passia/points pour limiter les profils ;
- ne pas mélanger migration multi-profil, sécurité IRL et refonte messagerie dans un méga-diff ;
- ne pas supprimer les chemins legacy avant fenêtre de compatibilité et métriques.

---

## 26. Definition of Done

Profil V2 est correctement fondé lorsque :

- compte, intérêts Feed et profils passion sont explicitement distincts ;
- profils passion sont synchronisés serveur et disponibles cross-device ;
- activation d’identité est explicite ;
- nouveaux posts conservent une identité passionnelle historique immuable ;
- anciens posts restent lisibles sans attribution fictive ;
- confidentialité et ownership sont serveur ;
- block compte-compte domine toutes les identités ;
- profil personnel est simple et sans économie artificielle ;
- profil visité mène naturellement à Suivre / Message / IRL sûr ;
- CDV est absent du cœur ;
- migrations sont expand/contract, observables et réversibles ;
- Sentinelle supervise les nouveaux objets et anomalies ;
- tests multi-compte/multi-profil prouvent l’absence de fuite.

---

## 27. Répartition IA

### ChatGPT

- modèle produit compte / identité / intérêt ;
- arbitrage UX ;
- règles historiques et confidentialité ;
- critères d’acceptation ;
- gouvernance Feed + Profil + IRL.

### Claude Code

- vérité du dépôt et du schéma local/prod ;
- audit exhaustif des références ;
- migrations expand-only ;
- RLS ;
- dual-read / dual-write temporaire ;
- migration `user_state` idempotente ;
- tests cross-device, cross-profile, multi-compte.

### Codex

- attaque ownership et RLS ;
- cherche usurpation de `passion_profile_id` ;
- vérifie stabilité historique des posts ;
- teste blocks et confidentialité ;
- cherche divergences ancien/nouveau client ;
- vérifie absence de fuite de profil entre conversations, Feed et IRL.
