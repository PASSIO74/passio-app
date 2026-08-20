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
- multi-profil reste fondamental ;
- Feed→profil→message→IRL devient le parcours prioritaire ;
- Sentinelle existante est renforcée, pas réécrite.

## Documents à lire dans cet ordre

1. `.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`
2. `docs/PASSIO_PRODUCT_AUDIT_V2_2026-08-20.md`
3. `docs/CLAUDE_CODE_REPRISE_PRODUCT_2026-08-20.md`
4. `docs/PASSIO_WALLET_PASSIA_REMOVAL_MAP_2026-08-20.md`
5. `docs/PASSIO_CORE_NAV_AND_JOURNEYS_V2_2026-08-20.md`
6. `docs/PASSIO_ACCEPTANCE_TEST_MATRIX_2026-08-20.md`
7. `docs/PASSIO_SENTINELLE_MOBILE_HARDENING_SPEC_2026-08-20.md`
8. `.passio/context/MULTI_PROFILE.md`
9. `.passio/context/TESTING_STRATEGY.md`
10. `PASSIO_SENTINELLE_JOINT_AUDIT.md` avant toute extension de capacité Sentinelle.

## Démarrage exact de la session

### Étape 1 — Vérifier le terrain

Claude Code doit commencer par :

- `git status` ;
- branche courante ;
- comparaison avec `main` ;
- changements non commités du poste ;
- version Node/npm et disponibilité Playwright si nécessaire ;
- ne toucher à rien tant qu'un travail utilisateur non commité pourrait être écrasé.

### Étape 2 — Baseline avant code

Mesurer et enregistrer :

- écrans/destinations visibles ;
- occurrences Wallet/Passia/score/rank/crypto ;
- interactions exposées si script de mesure disponible ;
- taille JS/CSS si mesure existante ;
- résultats `audit:globals`, `audit:handlers`, smoke ;
- tests navigation, profils, feed, messages, IRL, confidentialité/blocage/authz, multi-comptes selon disponibilité ;
- aucune valeur inventée si une mesure n'est pas disponible.

### Étape 3 — Audit exact Wallet/CDV

Produire les deux tableaux d'inventaire demandés dans le brief. Le document Wallet déjà préparé est un **point de départ vérifié**, pas un substitut à une recherche locale exhaustive : Claude Code possède la meilleure visibilité sur les fichiers réels.

### Étape 4 — Premier diff recommandé

Commencer par **`remove/wallet-navigation`**, le lot le plus lisible et réversible :

- retirer destinations/CTA/chips visibles Wallet ;
- réécrire microcopy landing/profil/IA ;
- gérer deep links obsolètes ;
- ne pas encore supprimer les structures DB ;
- tests navigation + handlers + smoke.

Une fois ce lot vert : revue ChatGPT → contrôle Codex ciblé → commit clair.

### Étape 5 — Deuxième diff

**`remove/passia-points-core`** :

- supprimer appels de récompenses avant les fonctions centrales ;
- neutraliser score/passia sur publication/commentaire/like/profil/IRL/onboarding ;
- préserver comportement social réel ;
- normaliser l'état legacy ;
- ajouter tests négatifs Wallet et ancien état ;
- seulement ensuite retirer `REWARDS`, `RANKS`, shop/crypto/renderers/CSS morts.

### Étape 6 — CDV

Traiter **séparément** avec `extract/cdv-core-navigation`. Retirer du cœur, préserver données et briques partagées, conserver une voie d'extraction Passio : Voyage.

### Étape 7 — Navigation + boucle cœur

Puis seulement :

`simplify/core-navigation-onboarding` → `improve/feed-person-message` → `improve/message-irl-loop` → `instrument/core-funnel`.

Le ranking Feed V2 vient **après instrumentation**.

## Répartition des IA

### ChatGPT

- garde la promesse produit et le scope ;
- arbitre les ambiguïtés fonctionnelles ;
- fournit critères d'acceptation ;
- relit les écarts entre intention et comportement ;
- refuse le scope creep.

### Claude Code

- possède la réalité du dépôt local ;
- fait recherches exhaustives ;
- implémente les changements multi-fichiers ;
- exécute tests/mesures ;
- découpe en petits commits ;
- signale les contradictions entre specs et code.

### Codex

- intervient après lots sensibles ;
- relit diff et migrations/normalisation ;
- cherche régressions, références oubliées et failles cross-compte ;
- ajoute/propose tests ciblés ;
- ne redéfinit pas la vision produit.

## Garde-fous absolus

- pas de suppression DB opportuniste ;
- pas de migration destructive sans inventaire + rollback + tests ;
- pas de méga-commit mélangeant Wallet et CDV ;
- pas de neutralisation d'un test pour rendre le lot vert ;
- pas de modification du ranking « au feeling » ;
- pas de nouvelle gamification pour remplacer Passia ;
- pas de changement silencieux d'identité multi-profil ;
- pas de baisse RLS/confidentialité/blocage ;
- pas d'auto-merge ou auto-deploy Sentinelle ;
- main/prod après tests verts et revue explicite seulement.

## Première phrase recommandée à Claude Code

> Reprends PASSIO depuis la branche `product/passio-core-simplification-2026-08-20`. Lis le paquet de démarrage et les specs listées, vérifie d'abord l'état réel du dépôt et les changements locaux, puis réalise Sprint 0 et le premier lot `remove/wallet-navigation` sans toucher à la DB. Avant de modifier, annonce les fichiers réellement impactés et les tests que tu vas utiliser comme preuve.

## Résultat attendu de la première séquence

À la fin du premier bloc de travail, nous devons avoir :

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
