# PASSIO — Paquet de démarrage Claude Code · vendredi 21 août 2026

- **Session prévue** : vendredi 21 août 2026 à 03:00 Europe/Paris
- **Branche de cadrage** : `product/passio-core-simplification-2026-08-20`
- **Objectif** : démarrer directement dans la réalité du dépôt, sans refaire le débat produit.

## Mandat

Simplifier PASSIO autour de : **« partage tes Passio et rencontre les gens »**.

Boucle canonique :

**Passion → contenu → personne → interaction → conversation → IRL → nouveau contenu.**

Décisions déjà prises :

- Wallet supprimé du cœur ;
- Passia, points, étoiles, Score Passion, rangs, leaderboard, packs, Pass Passion, boutique et piste crypto supprimés du cœur ;
- aucune monnaie/score générique de remplacement ;
- CDV extrait vers **Passio : Voyage**, données préservées ;
- navigation cible : **Fil · IRL · Créer · Messages · Profil** ;
- Explorer doit prouver un rôle distinct avant de rester destination primaire ;
- bobines/stories/vlogs sont des formats, pas des produits séparés ;
- multi-profil reste fondamental, mais il ne doit plus imposer plusieurs profils avant la première valeur ;
- les passions choisies à l'onboarding doivent personnaliser immédiatement le premier Fil ;
- Feed→profil→message→IRL devient le parcours prioritaire ;
- Sentinelle existante est renforcée, pas réécrite ;
- aucun nouveau lot IRL ne doit diminuer confidentialité, blocage ou sécurité localisation.

## Documents à lire dans cet ordre

1. `.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`
2. `docs/PASSIO_PRODUCT_AUDIT_V2_2026-08-20.md`
3. `docs/CLAUDE_CODE_REPRISE_PRODUCT_2026-08-20.md`
4. `docs/PASSIO_WALLET_PASSIA_REMOVAL_MAP_2026-08-20.md`
5. `docs/PASSIO_WALLET_PASSIA_DB_STATE_AUDIT_2026-08-20.md`
6. `docs/PASSIO_CDV_EXTRACTION_MAP_2026-08-20.md`
7. `docs/PASSIO_CORE_NAV_AND_JOURNEYS_V2_2026-08-20.md`
8. `docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md`
9. `docs/PASSIO_NAV_V2_IMPLEMENTATION_LOT_2026-08-20.md`
10. `docs/PASSIO_FEED_PROFILE_MESSAGE_LOT_2026-08-20.md`
11. `docs/PASSIO_CONVERSATION_TO_IRL_LOT_2026-08-20.md`
12. `docs/PASSIO_CORE_FUNNEL_ANALYTICS_V1_2026-08-20.md`
13. `docs/PASSIO_IRL_TRUST_SAFETY_AUDIT_2026-08-20.md`
14. `docs/PASSIO_ACCEPTANCE_TEST_MATRIX_2026-08-20.md`
15. `docs/PASSIO_SENTINELLE_MOBILE_HARDENING_SPEC_2026-08-20.md`
16. `.passio/context/MULTI_PROFILE.md`
17. `.passio/context/TESTING_STRATEGY.md`
18. `PASSIO_SENTINELLE_JOINT_AUDIT.md` avant toute extension de capacité Sentinelle.

## Démarrage exact de la session

### Étape 0 — Vérifier que nous travaillons sur la dernière version réelle

Avant toute modification, Claude Code doit confirmer que la version locale exécutée est bien la version de référence la plus récente de PASSIO :

- dépôt attendu `PASSIO74/passio-app` ;
- branche courante ;
- `git status` ;
- HEAD local ;
- comparaison avec `main` et avec la branche de cadrage ;
- changements non commités ;
- écran mobile réellement exécuté comparé aux écrans mobiles de référence les plus récents disponibles ;
- ne rien modifier si un travail utilisateur non commité risque d'être écrasé.

Cette vérification est obligatoire à chaque reprise Claude Code.

### Étape 1 — Baseline avant code

Mesurer et enregistrer :

- écrans/destinations visibles ;
- occurrences Wallet/Passia/score/rank/crypto ;
- occurrences CDV dans navigation, feed, tour, routes et logique partagée ;
- comportement réel du premier onboarding et du premier rendu Feed ;
- interactions exposées si script de mesure disponible ;
- taille JS/CSS si mesure existante ;
- résultats `audit:globals`, `audit:handlers`, smoke ;
- tests navigation, profils, feed, messages, IRL, confidentialité/blocage/authz, multi-comptes selon disponibilité ;
- état réel du schéma prod de référence avant toute hypothèse DB ;
- aucune valeur inventée si une mesure n'est pas disponible.

### Étape 2 — Audit exact Wallet/CDV

Produire les deux tableaux d'inventaire demandés dans le brief.

Pour Wallet/Passia, le nouvel audit DB/état établit déjà qu'aucun DROP SQL n'est actuellement nécessaire : l'économie historique vit surtout dans le code client et `user_state.data`. Claude Code doit néanmoins confirmer localement toutes les références avant suppression.

### Étape 3 — Premier diff recommandé

Commencer par **`remove/wallet-navigation`**, le lot le plus lisible et réversible :

- retirer destinations/CTA/chips visibles Wallet ;
- réécrire microcopy landing/profil/IA ;
- gérer deep links obsolètes ;
- ne pas toucher destructivement à la DB ;
- tests navigation + handlers + smoke.

Une fois ce lot vert : revue ChatGPT → contrôle Codex ciblé → commit clair.

### Étape 4 — Deuxième diff

**`remove/passia-points-core`** :

- supprimer appels de récompenses avant les fonctions centrales ;
- neutraliser score/passia sur publication/commentaire/like/profil/IRL/onboarding ;
- préserver le comportement social réel ;
- ajouter une migration applicative idempotente de l'état legacy ;
- filtrer score/passia/transactions/quests/activePass au chargement local, à la restauration `user_state` et au payload sortant ;
- ajouter tests négatifs Wallet et ancien état ;
- seulement ensuite retirer `REWARDS`, `RANKS`, shop/crypto/renderers/CSS morts.

### Étape 5 — CDV

Traiter **séparément** avec `extract/cdv-core-navigation`.

Retirer du cœur, préserver données et briques partagées, conserver une voie d'extraction Passio : Voyage. Ne pas supprimer naïvement `posts.vlog`, collaborations ou policies partagées.

### Étape 6 — Onboarding → premier moment de valeur

Traiter `simplify/core-navigation-onboarding` avec `PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md`.

Priorité immédiate O1 : corriger le défaut où l'utilisateur choisit ses passions puis arrive sur un Feed vide parce que `_activeFeedPassions` est remis à zéro.

Ensuite seulement :

- persister/restaurer `selectedFeedPassions` ;
- découpler intérêts Feed et profils passion ;
- créer un seul profil passion de départ ;
- conserver tous les profils historiques ;
- ne pas demander GPS pendant l'onboarding ;
- ne pas forcer le tour démo ;
- tests reload/cross-device/multi-profils.

### Étape 7 — Navigation + boucle cœur

Puis :

`simplify/core-navigation-onboarding` → `improve/feed-person-message` → `improve/message-irl-loop` → `instrument/core-funnel`.

Le ranking Feed V2 vient **après instrumentation**.

### Étape 8 — Gate Trust & Safety avant accélération IRL

Avant de considérer `improve/message-irl-loop` prêt pour un lancement public, appliquer les garde-fous de `PASSIO_IRL_TRUST_SAFETY_AUDIT_2026-08-20.md` :

- INSERT DM exige appartenance à la conversation ;
- blocage empêche les nouvelles interactions directes ;
- adresse/GPS exacts non publics par défaut ;
- participants/check-ins/feedback non exposés publiquement en brut ;
- check-in validé côté serveur avec token non dérivable ;
- mineurs 13–17 hors IRL pour le premier lancement public tant qu'un cadre dédié n'existe pas ;
- tests REST bruts de contournement.

Ne pas mélanger ces migrations sensibles avec le premier lot Wallet.

## Répartition des IA

### ChatGPT

- garde la promesse produit et le scope ;
- arbitre les ambiguïtés fonctionnelles ;
- fournit critères d'acceptation ;
- relit les écarts entre intention et comportement ;
- définit les frontières Trust & Safety ;
- protège la simplicité du premier parcours ;
- refuse le scope creep.

### Claude Code

- possède la réalité du dépôt local ;
- fait recherches exhaustives ;
- implémente les changements multi-fichiers ;
- exécute tests/mesures ;
- découpe en petits commits ;
- signale les contradictions entre specs et code ;
- réalise les migrations expand/contract nécessaires aux lots de sécurité ;
- vérifie les chemins signup/signin/OAuth, reload et state sync.

### Codex

- intervient après lots sensibles ;
- relit diff et migrations/normalisation ;
- cherche régressions, références oubliées et failles cross-compte ;
- attaque blocage, membership DM, localisation, participants et check-in ;
- vérifie que les intérêts Feed persistent sans duplication de profils ;
- ajoute/propose tests ciblés ;
- ne redéfinit pas la vision produit.

## Garde-fous absolus

- pas de suppression DB opportuniste ;
- pas de migration destructive sans inventaire + rollback + tests ;
- pas de méga-commit mélangeant Wallet, CDV et sécurité IRL ;
- pas de neutralisation d'un test pour rendre le lot vert ;
- pas de modification du ranking « au feeling » ;
- pas de nouvelle gamification pour remplacer Passia ;
- pas de changement silencieux d'identité multi-profil ;
- pas de création automatique de multiples profils pour chaque intérêt Feed ;
- pas de baisse RLS/confidentialité/blocage ;
- pas d'adresse exacte rendue publique par simple commodité UX ;
- pas de check-in qualifié de vérifié s'il reste forgeable côté client ;
- pas d'auto-merge ou auto-deploy Sentinelle ;
- main/prod après tests verts et revue explicite seulement.

## Première phrase recommandée à Claude Code

> Reprends PASSIO depuis la dernière version réelle vérifiée du dépôt `PASSIO74/passio-app`, puis charge la branche `product/passio-core-simplification-2026-08-20`. Compare d'abord dépôt, branche, HEAD, changements locaux et interface mobile exécutée avec la référence la plus récente. Lis ensuite le paquet et les specs dans l'ordre, réalise la baseline, puis commence uniquement le lot `remove/wallet-navigation`. Avant chaque lot, annonce fichiers réellement impactés et tests de preuve.

## Résultat attendu de la première séquence

À la fin du premier bloc de travail, nous devons avoir :

- dernière version réelle confirmée ;
- baseline enregistrée ;
- inventaire Wallet/CDV confirmé localement ;
- Wallet retiré de la navigation et du discours cœur ;
- anciens liens gérés ;
- aucune DB supprimée ;
- tests du lot verts ;
- diff court et relisible ;
- revue ChatGPT ;
- contrôle Codex ciblé ;
- prochaine étape clairement bornée.
