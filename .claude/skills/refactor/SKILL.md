---
name: refactor
description: Refactorise du code PASSIO en toute sûreté (factorisation, simplification, cohérence) sans changer le comportement, en respectant l'architecture vanilla/hoisting. À utiliser quand Benjamin veut nettoyer, factoriser, simplifier, réduire la duplication, ou dit "refacto", "nettoie", "factorise", "c'est le bazar".
---

# /refactor — Refacto sûre PASSIO

Améliorer la structure SANS changer le comportement observable. Sur un codebase vanilla de 17 scripts partageant `window`, la prudence est maximale.

## Contraintes structurelles
- **Ordre de chargement app-01..09 = dépendances par hoisting → NE PAS réordonner.** Déplacer une fonction entre fichiers peut casser une dépendance.
- **Globals partagés** : renommer/extraire une fonction top-level peut créer une collision. `npm run audit:globals` AVANT et APRÈS.
- Pas de modules ES, pas de bundler (choix assumé). Rester en fonctions globales.
- Les onclick inline référencent des noms de fonctions → renommer une fonction = mettre à jour tous ses onclick (`npm run audit:handlers`).

## Cibles de refacto typiques (PASSIO en a déjà beaucoup fait)
- Factoriser la duplication (ex. `_filterIrlEvents` a remplacé ~80 lignes dupliquées ; `_renderCommentsList` unifie 5 surfaces).
- Supprimer le code mort — ⚠️ MAIS grep les appels d'abord (le retrait de `diagLog` a causé un fil vide 6 j).
- Unifier les patterns divergents (décodage média `applyMsgContentData`, échappement, `findPostAnywhere`).

## Méthode
1. Filet de tests d'abord : la zone est-elle couverte ? Sinon écrire un test caractérisant le comportement actuel (skill `/new-test`) AVANT de toucher.
2. Refacto par petits pas, `node --check` + audits entre chaque.
3. Charger la skill `simplify` (native) pour la passe qualité (réutilisation/simplification/efficacité) — elle applique les fixes.
4. Vérifier dans le preview que le comportement est identique.
5. `/test` complet doit rester vert.

## Garde-fou
Si un doute sur une dépendance de hoisting → ne pas déplacer, dupliquer le helper localement plutôt que casser l'ordre. Committer la refacto SÉPARÉMENT d'un changement de comportement.
