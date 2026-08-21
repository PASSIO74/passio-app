# Diagnostic temporaire OAuth / modèle Claude Code

Objectif unique : exécuter le plus petit changement possible afin de provoquer un vrai appel modèle via le canal `Claude PR Task` et exposer, en cas d'échec, le diagnostic structuré expurgé déjà prévu par le workflow.

Consigne :
- lire AGENTS.md et CLAUDE.md ;
- ne modifier aucun fichier applicatif ;
- créer uniquement `docs/CLAUDE_OAUTH_DIAGNOSTIC_2026-08-21.md` avec une ligne indiquant que le diagnostic du canal CLI direct a été exécuté ;
- ne toucher à aucune migration, config prod, dashboard, secret ou workflow ;
- ne pas déployer ;
- laisser le workflow persister le changement si le modèle répond.

Si l'appel modèle échoue avant modification, ne rien inventer : laisser le workflow remonter la cause structurée expurgée.