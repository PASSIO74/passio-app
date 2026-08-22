# Canari — transport ChatGPT → Claude Code (2026-08-21)

Note de canari. **Aucun effet applicatif** : ce fichier est de la documentation
pure, il n'entre ni dans le build (`scripts/build.js`), ni dans le déploiement
Netlify, ni dans le Centre de pilotage.

## Ce qui a été prouvé

Le transport **ChatGPT → GitHub (issue #76) → Claude Code via l'abonnement OAuth**
a été exécuté avec succès le **21 août 2026**. La chaîne a produit, depuis
GitHub Actions et sans intervention sur le poste de Benjamin :

- une branche dédiée au run (`claude/issue-76-32484026839`), créée depuis un
  `main` à jour (`7793a08`) ;
- un commit réel portant ce fichier, et lui seul ;
- une pull request vers `main`, ouverte par l'étape de publication du workflow
  (l'agent ne pousse pas lui-même — voir le commit 7793a08).

## Portée

- Périmètre : `docs/` uniquement. Aucun `js/app-*.js`, `styles.css`,
  `index.html`, `sw.js`, migration, dashboard ou configuration de production
  n'est touché.
- Réversible : la suppression de ce fichier suffit à défaire le canari.
- Instrumentation Centre de pilotage / Sentinelle : **non pertinente** ici, le
  changement n'ayant aucune surface d'exécution.
