# PASSIO — Corriger définitivement le canal principal issue → Claude Code

Contexte mesuré : le canari issue #89 a exécuté Claude correctement, lu la dernière main, créé le document local et passé les audits, mais il n'a pas pu créer/pousser sa branche. Cause racine rapportée par Claude : plusieurs règles `--allowedTools` de `.github/workflows/claude-code.yml` s'arrêtent au milieu d'un jeton et ne matchent jamais (`git checkout -b claude/:*`, `git switch -c claude/:*`, `git push ... claude/:*`, `node scripts/:*`).

Objectif : corriger ce défaut sans affaiblir la protection de `main`.

Exigences :
- partir de la dernière `main` réelle ;
- modifier uniquement infrastructure/tests/docs nécessaires, aucun fichier applicatif PASSIO ;
- remplacer les règles mortes par des permissions alignées sur des frontières de commande réellement comprises par Claude Code (`git checkout`, `git switch`, `git push`, `node` ou meilleure solution prouvée) ;
- NE PAS rendre possible un push vers `main` : la protection doit être assurée par un garde-fou PreToolUse qui inspecte la commande complète, conformément à l'architecture `allow large + garde-fou étroit` déjà documentée dans CLAUDE.md ;
- le garde doit refuser explicitement `git push` vers main, les pushes ambigus sans branche autorisée et les formes permettant de viser main ; autoriser uniquement les branches de travail prévues (`claude/*` dans le canal principal) ;
- ajouter des tests de non-régression qui prouvent : push vers `claude/*` autorisable, push vers main refusé, règles allowedTools alignées et non mortes ;
- conserver OAuth subscription-only, preuve branche/diff/PR, filtrage de confiance et absence de merge automatique ;
- améliorer si pertinent le message d'échec pour distinguer clairement un refus de permission ;
- valider YAML, scripts de garde et tests CI pertinents ;
- ne pas modifier `.passio/claude-task.md`.

Critère final : après merge, un nouveau canari issue → Claude doit pouvoir créer branche + commit + push + PR sans pouvoir pousser sur main.