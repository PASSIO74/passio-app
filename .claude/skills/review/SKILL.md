---
name: review
description: Revue de code pré-commit du diff en cours sur PASSIO, en déléguant au subagent audit-passio + audits automatiques, avant de livrer. À utiliser avant un commit/ship, pour relire un changement, ou quand Benjamin dit "relis", "review", "vérifie mon code", "avant de pousser".
---

# /review — Revue pré-commit PASSIO

Filet de sécurité avant `/ship`. Combine l'œil expert (subagent) et les audits mécaniques.

## Étapes
1. **Diff** : `git diff` (+ `git diff --staged`) pour cerner le changement.
2. **Subagent `audit-passio`** : le lancer sur le diff — il connaît les pièges transverses (findPostAnywhere, supaTs, 3 helpers d'échappement, collisions globals, catch large, RLS 0-ligne, guards de rendu).
3. **Audits mécaniques** :
   ```
   npm run audit:globals
   npm run audit:handlers
   ```
   + `node --check` sur chaque `.js` modifié.
4. **Fiches de pièges** : lire la fiche `docs/PIEGES_CONNUS.md` du/des domaines touchés — il y a presque toujours un invariant local.
5. **Sécurité** : si le diff affiche du contenu utilisateur → skill `/xss-audit` ; s'il touche la visibilité/RLS → `/rls-audit`.
6. **Tests** : la couverture existe-t-elle ? Sinon proposer/écrire (skill `/new-test`), et faire tourner `/test`.

## Sortie
Liste priorisée (bloquant / à corriger / suggestion) : fichier:ligne, problème, conséquence concrète, correctif. Si tout est propre, le dire et enchaîner sur `/ship`. Ne jamais valider un diff sans avoir lancé au moins `audit:globals` + `audit:handlers`.

## Rappel
Sur PASSIO, un bug se cache souvent dans un `catch` large (invisible dans `client_errors`) ou une mutation RLS à 0 ligne — insister sur ces deux points.
