# PASSIO — Carte de retrait Wallet / Passia / points

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Décision source** : `.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`
- **Statut** : spécification d'exécution pour Claude Code ; aucune suppression prod ne doit être déduite de ce document sans vérification du dépôt et de la base.

## But

Retirer proprement du cœur PASSIO tout le système d'économie/gamification qui concurrence la promesse **Passion → contenu → personne → conversation → IRL**.

Le chantier ne consiste pas à cacher l'onglet Wallet. Il faut déconnecter le système sur six couches : **discours produit, navigation/UI, état local, logique métier, persistance/synchronisation, tests/docs**.

## Inventaire vérifié dans le dépôt

| Zone | Référence vérifiée | Type | Décision | Risque à traiter |
|---|---|---|---|---|
| Landing | `index.html` — piliers « Envoie des Passia… » et « Ton Passia deviendra une vraie monnaie » | copy/positionnement | **SUPPRIMER / RÉÉCRIRE** | laisser une promesse économique devenue fausse |
| Profil principal | `mainProfileStars`, `profileStarsScore` | UI score | **SUPPRIMER** | trou visuel / handler `goTo('wallet')` orphelin |
| Profil principal | `profilePassiaChip`, `topPassia` | UI solde | **SUPPRIMER** | idem |
| IA | raccourci `sendAIQuery('Comment gagner des Passia')` | raccourci produit | **SUPPRIMER** | IA continue à promouvoir le système retiré |
| Wallet | `#screen-wallet` | écran | **SUPPRIMER DU CŒUR** | deep links / navigation / rendu |
| Wallet | onglets `mywallet`, `shop`, `crypto` | sous-navigation | **SUPPRIMER** | handlers/classes dédiés |
| Wallet | Score Passion / prochain rang / étoiles | gamification | **SUPPRIMER** | références `RANKS` et rendu associé |
| Wallet | solde Passia | économie interne | **SUPPRIMER** | état legacy |
| Wallet | leaderboard | classement public | **SUPPRIMER** | données seed/render éventuelles |
| Boutique | packs Passia | économie interne | **SUPPRIMER** | fonctions achat démo et données packs |
| Boutique | Pass Passion | abonnement lié à Passia | **SUPPRIMER DU CŒUR** | ne pas confondre avec une éventuelle offre future distincte |
| Crypto | piste Passia/token | crypto/marketing | **SUPPRIMER** | promesse réglementaire et produit inutile au MVP |
| `app-01-diag-seed.js` | `RANKS` | logique score | **RETIRER** après recherche dépendances | appels de rang disséminés |
| `app-01-diag-seed.js` | `REWARDS` | moteur récompenses | **RETIRER** après neutralisation des appels | publication/IRL/profil/commentaires peuvent l'appeler |
| `app-01-diag-seed.js` | `LIKES_PER_PASSIA` | économie interne | **RETIRER** | realtime likes |
| `app-02-state-utils.js` | `user.score`, `user.passia` | état local/synchronisé | **DÉPRÉCIER puis retirer de l'état canonique** | anciens `localStorage` / `user_state` |
| `app-02-state-utils.js` | `transactions`, `quests` | historique/gamification | **AUDITER** puis retirer si exclusivement récompenses | ne pas supprimer une structure partagée sans preuve |
| `app-02-state-utils.js` | `rewardToast()` | feedback gamifié | **RETIRER / remplacer par toast neutre si appel fonctionnel utile** | appels transverses |
| `app-02-state-utils.js` | `grantReward()` | logique métier | **RETIRER** après suppression des appels | publication, commentaire, événements, profils |
| `app-02-state-utils.js` | `awardLikeReceived()` | récompense realtime | **RETIRER** sans casser la réception realtime des likes | séparer événement social de récompense |
| Onboarding | récompenses `first_login`, `daily` | gamification activation | **SUPPRIMER** | onboarding doit toujours finir correctement |
| `app-04-comments-shop.js` | texte de suppression « points et Passia restent acquis » | copy | **RÉÉCRIRE** | incohérence utilisateur |
| `app-04-comments-shop.js` | `PASSIA_PASSES`, achats, crédit Passia, `setWalletTab()` | boutique/logique | **SUPPRIMER** après inventaire des appels | fonctions potentiellement référencées inline |
| `app-05-config-profil.js` | styles `.topbar-chip.score`, `.topbar-chip.passia`, `.kpi.score`, `.kpi.passia` | CSS dynamique | **NETTOYER** | styles morts et classes résiduelles |
| `styles.css` | sélecteurs Wallet/shop/crypto/score/passia | CSS | **AUDITER puis supprimer les sélecteurs strictement dédiés** | ne pas casser des composants partagés |
| Navigation | anciens appels `goTo('wallet')` / éventuels hashes | routing | **REDIRIGER vers `feed` ou `profile` selon contexte** | écran blanc / état de nav invalide |
| Docs | Passia/Wallet/crypto/points | documentation | **MARQUER historique ou mettre à jour** | specs contradictoires |
| DB/migrations | **NON ÉTABLI À CE STADE** | persistance prod | **AUDIT OBLIGATOIRE AVANT TOUT DROP** | données utilisateur / rollback |

## Séquence de retrait recommandée

### Phase A — couper la promesse avant de couper le code

1. Réécrire landing et microcopy.
2. Retirer Wallet des destinations et CTA visibles.
3. Supprimer chips Score/Passia du profil et raccourci IA.
4. Rediriger les anciennes routes/hashes Wallet vers une destination valide.

Cette phase doit pouvoir être livrée sans migration DB.

### Phase B — neutraliser le moteur de récompenses

Ordre sûr :

`sites d'appel → feedback neutre si nécessaire → mutations score/passia → transactions de récompense → fonctions REWARDS/RANKS → données constantes`.

Ne jamais commencer par supprimer `grantReward()` si des handlers l'appellent encore. `npm run audit:handlers` ne détectera pas forcément tous les appels internes ; recherche statique obligatoire en plus.

### Phase C — état legacy et synchronisation

Le format historique contient au minimum `user.score`, `user.passia`, `transactions` et `quests`. Le nouveau client doit accepter un ancien blob sans erreur et **ne jamais réafficher** le système supprimé.

Politique cible :

- à `loadState()`, tolérer les clés historiques ;
- ne plus les prendre comme source de comportement produit ;
- normaliser l'état canonique sans score/Passia ;
- empêcher la synchronisation cross-appareil de ressusciter les clés dépréciées ;
- introduire si nécessaire un `stateSchemaVersion` / normaliseur explicite plutôt que des suppressions ad hoc ;
- ne pas effacer des données serveur tant que le schéma réel et les versions clients actives ne sont pas connus.

### Phase D — boutique, crypto et CSS

Après neutralisation fonctionnelle : supprimer DOM Wallet, shop, Pass Passion et crypto ; retirer les renderers/handlers/constants devenus inaccessibles ; nettoyer CSS strictement dédié ; vérifier absence de globals/handlers fantômes.

### Phase E — base de données

Claude Code doit produire une table séparée :

`objet DB | existe en prod ? | lecture actuelle ? | écriture actuelle ? | donnée utilisateur ? | clients anciens ? | action | rollback`.

Règle : **aucune table/colonne n'est supprimée parce que son nom ressemble à Wallet/Passia**. Le retrait frontend peut être terminé avec une DB legacy inerte si c'est la voie la plus sûre.

## Recherche finale obligatoire

Après implémentation, rechercher au minimum, casse-insensible :

`wallet`, `passia`, `score passion`, `leaderboard`, `rank`, `rangs`, `points`, `étoiles`, `reward`, `likes_per_passia`, `crypto`, `pass passion`, `transactions`, `quests`.

Chaque résultat restant doit être classé : **historique documenté**, **compatibilité legacy justifiée**, **faux positif**, ou **défaut à corriger**.

## Critères d'acceptation

- aucune destination Wallet visible ;
- aucune promesse Passia/points/crypto sur landing, profil, feed, IA ou onboarding ;
- aucun Score Passion, rang ou leaderboard public ;
- publication, commentaire, like, création de profil, création/join IRL fonctionnent sans récompense ;
- réception realtime d'un like continue à fonctionner sans mutation Passia ;
- un ancien état contenant score/passia/transactions/quests charge sans exception ;
- une synchronisation ancien↔nouveau client ne fait pas réapparaître de UI Wallet ;
- anciens deep links Wallet ne produisent aucun écran cassé ;
- `audit:globals`, `audit:handlers`, smoke, profils, feed, IRL et multi-comptes restent verts ;
- toute éventuelle migration DB possède précondition, test et rollback.

## Non-objectifs

Ce chantier ne doit pas créer une nouvelle monnaie, un nouveau score, un système de badges de remplacement, une marketplace transactionnelle ou une nouvelle offre premium. La monétisation future sera un chantier séparé, déclenché par un besoin réel et des données d'usage.
