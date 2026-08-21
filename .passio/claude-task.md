# CANARI E2E FINAL R2 — PASSIO

Objectif strict : prouver que Claude Code peut modifier réellement cette branche depuis GitHub Actions après retour du quota.

Travail demandé :
- lire AGENTS.md puis CLAUDE.md ;
- vérifier que la branche part de la dernière `main` réelle ;
- créer uniquement `docs/CANARY_E2E_PASSIO_FINAL.md` ;
- y écrire : date, SHA de départ, nom de branche, modèle Claude réellement utilisé, mode d'authentification et confirmation que le PC utilisateur n'est pas requis ;
- ne modifier aucun fichier applicatif, aucune migration, aucun workflow, aucun dashboard, aucune configuration de production ;
- exécuter les vérifications pertinentes ;
- ne pas toucher à `.passio/claude-task.md`.

Critère de réussite : un diff réel hors fichier de tâche doit être produit par Claude Code sur cette branche. Aucun merge automatique.