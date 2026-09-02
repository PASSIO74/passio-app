---
name: ship
description: "Mise en prod : tests, audits, build dist, push main (déploiement Netlify). Dire : ship, déploie, envoie en prod, pousse."
---

# /ship — Mise en production PASSIO

Objectif : aller au bout de la chaîne coder → tester → committer → pousser, **sans jamais demander d'autorisation** (autonomie totale, cf. CLAUDE.md).

## Étapes (dans l'ordre, s'arrêter net si une échoue)

1. **État git** — `git status` pour voir ce qui est modifié. Ne committer QUE les fichiers liés à la tâche en cours (une autre session Claude peut avoir des fichiers en attente — cf. hook `stage-edited-file.js`).

2. **Syntaxe** — `node --check` sur chaque `.js` modifié parmi `js/*.js` et `dashboard/**/*.js`.

3. **Audits + tests** (bloquants) :
   ```
   npm run audit:globals
   npm run audit:handlers
   npm test
   ```
   `audit:globals` détecte les collisions de globals (17 scripts classiques partagent `window`), `audit:handlers` les onclick fantômes. Si un test échoue, **corriger la cause**, ne pas contourner.

4. **Build prod** (si un fichier `js/app-*.js`, `emoji-misc.js`, `index.html` ou `styles.css` a changé) :
   ```
   node scripts/build.js dist/index.html
   ```
   Vérifier qu'il ne râle pas sur le nombre de fichiers app (exactement 9 entre les marqueurs BUILD:APP).

5. **Commit** — message conventionnel (`fix(scope):`, `feat(scope):`, `test(scope):`…), **jamais** un message commençant par « auto: » (le hook `.git/hooks/commit-msg` le refuse). Multi-lignes → `git commit -F <fichier>` (jamais la here-string `@'…'@`). Terminer le message par la ligne Co-Authored-By habituelle.

6. **Push** — `git push origin main`. ⚠️ Cela **déploie en production** (GitHub Actions → Netlify). C'est le but ici, donc on pousse.

7. **Vérifier le déploiement** — `gh run list --limit 1` puis `gh run watch` (ou signaler à Benjamin de surveiller https://passio-app.netlify.app). Rappeler que « origin/main à jour ≠ prod à jour » tant que le workflow n'est pas vert.

## Rapport final
Résumer : fichiers committés, hash du commit, résultat des tests, statut du déploiement. Faits accomplis, pas de conditionnel.
