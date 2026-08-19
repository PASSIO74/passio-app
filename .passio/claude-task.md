# Tâche Claude Code — preuve E2E réelle

Lis `AGENTS.md` et `CLAUDE.md` avant toute modification.

## Objectif
Afficher temporairement `19 AOÛT 2026` en très grand texte rouge en haut du fil `#screen-feed`.

## Contraintes
- La modification applicative doit être réalisée par Claude Code, pas par ChatGPT.
- Modification minimale, sûre et facilement réversible.
- Ne modifie pas `.passio/claude-task.md`.
- Ne touche pas à Supabase, aux données, à l’authentification ou à la logique métier.
- Travaille uniquement sur la branche actuelle de cette Pull Request.
- Ne pousse jamais directement sur `main` et ne merge rien.
- Exécute les vérifications pertinentes.
- Committe et pousse toi-même l’implémentation sur cette branche.

## Critère de preuve
À la fin, la branche doit contenir au moins un nouveau commit produit pendant l’exécution Claude Code, avec un diff applicatif affichant le bandeau demandé.