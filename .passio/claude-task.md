# PASSIO — test E2E Claude Code

Objectif: prouver que Claude Code exécute réellement une modification visible de l'application de bout en bout.

## Modification demandée

Dans le fil principal PASSIO (`#screen-feed`), ajoute immédiatement en haut du contenu un bandeau temporaire très visible avec le texte exact :

`TEST CLAUDE CODE OK — 19 AOÛT 2026`

Le bandeau doit :
- être affiché en gros texte rouge ;
- rester lisible sur mobile et desktop ;
- ne pas casser la navigation ni le layout du feed ;
- être implémenté proprement dans les fichiers existants les plus appropriés ;
- rester strictement limité à ce test visuel.

## Validation obligatoire

- Lis `AGENTS.md` et `CLAUDE.md` avant de modifier le code.
- Ne modifie pas ce fichier `.passio/claude-task.md`.
- Effectue toi-même les changements de l'application.
- Lance les contrôles de syntaxe/tests pertinents pour les fichiers touchés.
- Committe les changements avec un message explicite.
- Pousse le commit sur la branche PR courante.
- Ne pousse jamais sur `main` et ne fusionne pas la PR.

À la fin, résume les fichiers modifiés et les checks exécutés.