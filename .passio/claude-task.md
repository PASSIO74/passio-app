# PASSIO — Politique modèles Claude : Fable 5 → Opus 5

Objectif : mettre le workflow Claude Code distant en conformité avec la politique utilisateur actuelle, sans casser le canal E2E validé par la PR #90 / run 32479895152.

Exigences strictes :
- Claude Fable 5 (`claude-fable-5`) est le modèle primaire par défaut ;
- Claude Opus 5 (`claude-opus-5`) est le repli automatique ;
- le repli ne doit se produire que si Fable échoue AVANT d'avoir produit une modification de travail ; si Fable a déjà modifié un fichier, ne pas relancer Opus par-dessus : échouer explicitement ;
- conserver la politique `subscription-only` via `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` explicitement vide ;
- ne jamais introduire de facturation API comme fallback ;
- journaliser dans le run le modèle réellement utilisé, et valider qu'il s'agit bien de Fable 5 ou Opus 5 ;
- préserver les garde-fous actuels : branche `claude-task/*`, pas de push direct `main`, pas de merge automatique, task file non modifié, diff réel obligatoire, diagnostics expurgés des secrets ;
- ajouter/adapter des tests ou assertions de CI qui verrouillent cette hiérarchie et empêchent une dérive silencieuse vers un autre modèle ;
- mettre à jour AGENTS.md ou la doc canonique uniquement si nécessaire pour refléter exactement cette politique ;
- ne modifier aucun fichier applicatif PASSIO, aucune migration, aucun dashboard, aucune config de production.

Avant de modifier : vérifier la dernière `main` réelle et relire le run E2E validé #38 / PR #90 comme référence de comportement.

Critères d'acceptation :
1. Fable 5 est tenté en premier.
2. Opus 5 ne sert que de fallback sûr sans diff Fable préalable.
3. OAuth abonnement uniquement.
4. Le modèle réellement exécuté est visible dans les logs.
5. Tests/validation YAML + garde anti-dérive passent.
6. Aucun changement applicatif.
