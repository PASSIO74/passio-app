# PASSIO — Audit DB + état legacy Wallet / Passia / points

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Décision produit** : Wallet, Passia, points/étoiles, Score Passion, rangs, leaderboard, packs, Pass Passion et piste crypto sortent du cœur PASSIO.
- **Objet de ce document** : fermer l'inconnue « existe-t-il une économie réellement persistée dans des tables métier en production ? » et définir la suppression la plus sûre.

## 1. Verdict

### Verdict principal

Dans la photographie du schéma de production du **2026-08-17** (`migrations/SCHEMA_PROD_REFERENCE.sql`) :

- aucune table `wallet` ;
- aucune table `passia` ;
- aucune table `transactions` ;
- aucune table `quests` ;
- aucune colonne `passia` ;
- aucune colonne `score` ou `points` rattachée aux profils/utilisateurs ;
- aucune entité de schéma dédiée au classement/rang Wallet.

La recherche des termes `wallet`, `passia`, `score`, `points`, `transactions` et `quests` dans cette photographie ne retourne aucune correspondance de schéma.

Le répertoire `migrations/` ne contient par ailleurs **aucune migration nommée ou dédiée à Wallet/Passia**.

### Conséquence

L'économie historique n'est pas matérialisée aujourd'hui comme un sous-système relationnel métier en production.

Elle vit principalement dans :

1. le code client ;
2. le DOM/UI ;
3. le `localStorage` ;
4. le blob JSON privé `user_state.data` synchronisé entre appareils.

**Il n'y a donc aucune raison de créer une migration SQL destructive pour supprimer Wallet/Passia du cœur.**

Le retrait doit être essentiellement **applicatif + migration d'état JSON idempotente**.

---

## 2. Ce qu'est réellement `user_state`

`migration_profile_photos_and_state_sync.sql` crée :

```sql
CREATE TABLE IF NOT EXISTS user_state (
  user_id    text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Cette table est **owner-only via RLS** et sert à synchroniser l'état privé du compte entre appareils.

Elle ne doit surtout pas être supprimée : elle porte d'autres informations utiles de PASSIO, notamment profils locaux/personas, réglages, brouillons et autres états privés non stockés dans des tables partagées.

Le code `_syncableState()` copie l'état allégé puis retire seulement :

- `seed` ;
- `supabasePosts`.

Le payload envoyé est ensuite :

```js
{ user_id: MY_UID, data: _syncableState() }
```

Donc tout ancien champ économique encore présent dans `state` peut être poussé dans `user_state.data`.

---

## 3. Données économiques actuellement présentes dans l'état client

Le `defaultState()` actuel contient au minimum :

```js
user: {
  score: 0,
  passia: 0,
  ...
},
transactions: [],
quests: []
```

Le code possède également au moins un état `user.activePass` créé lors d'un achat de Pass Passion.

### Producteurs identifiés

#### `grantReward(kind)`

Mutations :

- `state.user.score += r.pts`
- `state.user.passia += r.passia`
- ajout dans `state.transactions`

#### `awardLikeReceived()`

Mutations :

- incrément du score ;
- incrément de `likesReceived` ;
- tous les `LIKES_PER_PASSIA`, crédit d'un Passia ;
- ajout dans `state.transactions`.

#### onboarding

Le premier login et la connexion quotidienne ajoutent encore score/Passia et transactions.

#### boutique / Pass Passion

Le code de boutique :

- crédite `state.user.passia` ;
- écrit des transactions `purchase` ;
- crée `state.user.activePass` ;
- écrit des transactions `pass_purchase`.

#### suppression d'un post

Cas particulier important : `deletePost()` écrit actuellement un objet `post_delete` dans `state.transactions` avec `pts: 0` et `passia: 0`.

Cela montre que `transactions` a été réutilisé comme pseudo-historique générique, même si son existence vient du Wallet.

**Décision** : ne pas conserver `transactions` uniquement pour cet audit local de suppression. Si aucune autre dépendance fonctionnelle n'est trouvée lors de la recherche exhaustive locale, supprimer aussi cette écriture `post_delete` et retirer `transactions` du modèle canonique.

---

## 4. Quêtes

Le seed actuel contient des quêtes avec deux récompenses :

- `reward` en points/étoiles ;
- `passia`.

Exemples vérifiés :

- organiser un événement IRL → points + Passia ;
- atteindre un nombre de likes → points + Passia ;
- créer une passion communautaire → points + Passia.

Ces quêtes appartiennent donc bien au système de gamification économique à sortir du cœur.

**Décision P0** : `quests` n'est pas conservé comme remplacement déguisé du Wallet.

Si un jour PASSIO réintroduit des objectifs de découverte/activation, ils devront être redéfinis comme mécanisme produit séparé, non monétaire, validé par des données.

---

## 5. Risque majeur : résurrection cross-appareil

Le simple retrait de `score/passia` de `defaultState()` est insuffisant.

Pourquoi :

1. un ancien appareil contient encore `score`, `passia`, `transactions`, `quests`, `activePass` ;
2. `_syncableState()` peut les envoyer dans `user_state.data` ;
3. un nouveau client appelle `supaLoadUserState()` ;
4. `_applyUserState(data)` réapplique les clés du blob serveur dans `state` ;
5. l'ancien modèle peut donc réapparaître en mémoire après une restauration serveur.

Le code actuel de `_applyUserState()` fait volontairement un merge générique des clés reçues hors `seed` et `supabasePosts`.

La correction doit donc traiter **les deux frontières** :

- état local chargé ;
- état serveur entrant.

---

## 6. Stratégie cible : migration applicative, pas migration SQL

### Fonction recommandée

Introduire un normaliseur idempotent, nom indicatif :

```js
sanitizeLegacyEconomyState(obj)
```

ou, si un versionnage général est introduit :

```js
migrateStateToCurrentSchema(obj)
```

### À neutraliser/supprimer du modèle canonique

Après vérification exhaustive des dépendances :

- `user.score`
- `user.passia`
- `user.activePass`
- `transactions`
- `quests`
- tout autre champ exclusivement Wallet/Passia découvert par recherche statique.

### À NE PAS supprimer automatiquement

- `user.likesReceived` tant qu'un audit distinct n'a pas confirmé qu'il n'est utilisé que par Passia ; il peut être une métrique sociale réelle ;
- données de posts, likes, commentaires, profils, IRL ;
- `user_state` lui-même ;
- analytics historiques ;
- données nécessaires à un rollback ou à l'observation de versions anciennes.

---

## 7. Où appeler le normaliseur

### A. Chargement local

Après parsing de `localStorage`, avant que l'état ne devienne source de vérité pour l'UI.

Objectif : un ancien stockage local Wallet charge sans exception mais son économie n'entre plus dans le modèle actif.

### B. Restauration `user_state`

Avant ou pendant `_applyUserState(data)`.

Objectif : empêcher un ancien blob serveur de réinjecter des champs dépréciés.

### C. Avant synchronisation

Défense en profondeur dans `_syncableState()` : le payload sortant ne doit plus contenir les clés économiques, même si une vieille fonction les a réintroduites en mémoire.

Cette troisième garde est importante pendant la période de transition où d'anciens clients peuvent encore tourner.

---

## 8. Compatibilité ancien ↔ nouveau client

Le système `user_state` fonctionne encore en « dernier écrivain gagne » sur un blob. Une migration appliquée le 2026-08-16 rend `updated_at` autoritaire côté serveur, mais ne transforme pas le blob en merge champ-par-champ.

Conséquence : pendant une fenêtre où un ancien client est encore ouvert, il peut continuer à envoyer des clés Wallet dans son JSON.

### Politique recommandée

Le **nouveau client doit toujours filtrer ces clés à l'entrée et à la sortie**.

Il n'est pas nécessaire de modifier la table ou son trigger pour cette simplification produit.

À terme, les blobs Wallet disparaîtront naturellement lors des réécritures par des clients mis à jour.

### Ne pas faire

- `UPDATE user_state SET data = data - 'transactions' ...` global en prod sans nécessité ;
- suppression de la table `user_state` ;
- migration qui tente de parcourir/modifier massivement tous les blobs uniquement pour nettoyer une donnée désormais ignorée ;
- ajout d'un nouveau système Wallet V2 pour « migrer proprement » l'ancien.

---

## 9. Séquence d'implémentation recommandée à Claude Code

### Lot W1 — Navigation et promesse

- retirer Wallet de l'UI/navigation ;
- retirer Score/Passia du profil ;
- retirer copies landing/IA ;
- gérer les anciennes routes.

Aucun changement DB.

### Lot W2 — Producteurs de récompenses

Recherche exhaustive des appels à :

- `grantReward`
- `awardLikeReceived`
- `REWARDS`
- `RANKS`
- `LIKES_PER_PASSIA`
- `rewardToast`

Puis :

1. supprimer/neutraliser les appels ;
2. vérifier les comportements métier sous-jacents ;
3. retirer les fonctions/constants devenues mortes.

Exemple : rejoindre un IRL doit encore rejoindre l'événement, mais ne doit plus créditer de points.

### Lot W3 — Boutique/Pass/crypto

- retirer packs ;
- retirer Pass Passion lié à Passia ;
- retirer `activePass` ;
- retirer achat/crédit fictif ;
- retirer crypto ;
- retirer handlers/CSS dédiés.

### Lot W4 — État legacy

- ajouter normaliseur idempotent ;
- appliquer local + serveur + outbound sync ;
- retirer `score/passia/transactions/quests/activePass` du modèle canonique après validation des références ;
- supprimer `post_delete` dans `transactions` si plus aucun consommateur légitime.

### Lot W5 — Tests négatifs

Tester qu'aucun ancien blob ne réactive l'économie.

---

## 10. Matrice de tests spécifique état legacy

### WSTATE-01 — ancien localStorage

État historique :

```json
{
  "user": { "score": 1234, "passia": 88, "activePass": { "id": "x" } },
  "transactions": [{ "kind": "purchase", "passia": 100 }],
  "quests": [{ "id": "q1", "done": true }]
}
```

Attendu après boot nouveau client :

- app fonctionnelle ;
- aucune UI Wallet ;
- aucune logique dépendante de ces valeurs ;
- état canonique nettoyé selon la migration retenue.

### WSTATE-02 — ancien `user_state` serveur

Même payload injecté côté serveur, appareil local vierge.

Attendu : aucune résurrection économique après `supaLoadUserState()`.

### WSTATE-03 — payload sortant

Même si des clés legacy sont réinjectées artificiellement en mémoire, `_syncableState()` ne doit pas les renvoyer.

### WSTATE-04 — idempotence

Exécuter le normaliseur deux fois donne le même résultat et aucune exception.

### WSTATE-05 — profils et drafts préservés

Nettoyer Wallet ne supprime ni profils passion, ni préférences, ni brouillons, ni autres données privées légitimes de `user_state`.

### WSTATE-06 — like cross-compte

Un like reçu continue à produire le comportement social attendu et les notifications éventuelles, mais aucun point/Passia/transaction.

### WSTATE-07 — IRL

Créer ou rejoindre un événement fonctionne sans `grantReward`.

### WSTATE-08 — post delete

Supprimer un post fonctionne et nettoie les références/médias attendus sans dépendre de `state.transactions`.

### WSTATE-09 — ancien deep link Wallet

Une ancienne destination Wallet redirige proprement ; pas d'écran vide et pas de recréation de state Wallet.

### WSTATE-10 — multi-appareils

Nouveau client A nettoyé + ancien blob simulé B : après restauration sur A, aucun champ économique n'influence l'app.

---

## 11. Base de données : action décidée

| Objet | Existe en prod ? | Action |
|---|---:|---|
| table Wallet | non observée | aucune |
| table Passia | non observée | aucune |
| table transactions | non observée | aucune |
| colonne profil score | non observée | aucune |
| colonne profil passia | non observée | aucune |
| table quests | non observée | aucune |
| `user_state.data` JSON | oui | **conserver la table, filtrer/migrer les clés côté application** |
| trigger `user_state.updated_at` | oui | conserver ; indépendant du Wallet |

**Conclusion DB : aucun DROP n'est nécessaire pour le retrait Wallet/Passia actuel.**

---

## 12. Definition of Done

Le chantier Wallet/Passia est réellement terminé quand :

- aucune UI ni route principale Wallet ;
- aucun Score Passion/rang/leaderboard ;
- aucune récompense points/Passia sur les actions ;
- aucune boutique Passia/Pass Passion/crypto ;
- aucun champ économique dans l'état canonique ;
- un ancien état local ou serveur est accepté mais neutralisé ;
- les clés legacy ne repartent plus dans les nouveaux payloads `user_state` ;
- les parcours Feed, profils, publication, commentaires, likes, messages et IRL restent fonctionnels ;
- aucun changement destructif de schéma de production n'a été nécessaire ;
- les tests de synchronisation cross-appareil et de sécurité restent verts.

---

## 13. Répartition IA

- **ChatGPT** : décision d'architecture de retrait, compatibilité legacy, critères d'acceptation et arbitrage « supprimer vs conserver ».
- **Claude Code** : recherche exhaustive locale, modification multi-fichiers, normaliseur d'état, suppression des producteurs et exécution des suites de tests.
- **Codex** : revue ciblée des oublis Wallet/Passia, tests négatifs de résurrection cross-appareil, régressions likes/IRL/profils et vérification qu'aucune migration SQL destructive n'a été introduite inutilement.
