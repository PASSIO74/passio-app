---
name: reprise-autonome
description: Reprend le travail PASSIO tout seul après une interruption (crédits épuisés, session fermée, machine laissée tourner la nuit), sans attendre Benjamin ni demander d'autorisation. À utiliser au démarrage d'une session qui fait suite à une autre, ou quand Benjamin dit "continue sans t'arrêter", "reprends", "travaille toute la nuit", "ne m'attends pas".
---

# /reprise-autonome — Travail continu sans supervision

Benjamin laisse la machine tourner. Il n'est pas là. **Ne rien lui demander, ne pas l'attendre, ne pas s'arrêter en fin d'étape** — enchaîner.

## Retrouver l'état réel (jamais de mémoire, toujours des faits)

```bash
git log --oneline -8
git status --porcelain
```

Puis `TaskList`, puis lire dans cet ordre :

1. `PASSIO_MASTER_CONTROL.md` — incidents ouverts et mesures datées
2. `passio_qa_registry.json` — source machine
3. `PASSIO_INITIAL_JOINT_AUDIT.md` — le plan d'action priorisé
4. `PASSIO_ENGINEERING_LOG.md` — ce qu'a fait la boucle précédente

Une reprise ne commente pas l'interruption : elle repart.

## Les deux mécanismes de reprise

**Cron de session** (`CronCreate`, horaire) — relance le travail tant que la session vit. Si les crédits sont épuisés, le déclenchement suivant *est* la reprise. **Limite réelle : le cron est en mémoire, il meurt avec la session.** Il ne survit pas à une fermeture de Claude.

**Ce skill** — c'est la partie durable. Une session neuve qui lit ce fichier reprend le fil sans intervention. Le recréer, le cron, fait partie de la reprise :

> `CronCreate`, expression horaire à une minute décalée (pas `:00`), avec le prompt de reprise. Auto-expire après 7 jours.

## Ce qu'on fait sans demander

Coder, tester, mesurer, committer au fil de l'eau, documenter, créer des skills, consulter ChatGPT via `revue-croisee`, lancer les suites e2e y compris `PASSIO_E2E_MULTI=1`, interroger la prod en lecture.

## Ce qu'on prépare sans exécuter

Sans supervision, deux catégories restent **prêtes mais non appliquées**, avec leur documentation et leur plan de retour arrière :

- **migrations SQL et changements de RLS** — une policy fautive appliquée à 3 h du matin sur la beta ne se voit qu'au réveil ;
- **toute opération destructive** sur la base ou le dépôt.

Ce n'est pas de la timidité : c'est que ces deux-là n'ont pas de filet automatique, alors que le reste en a un (CI + tests).

## Pousser en production

`git push origin main` **déploie**. La règle de la nuit : pousser uniquement si la suite **complète** est verte, `PASSIO_E2E_MULTI=1` inclus — pas seulement la suite par défaut, qui skippe précisément les tests d'autorisation (cf. `CI-GATE-001`).

## Discipline de boucle

À chaque tour : mesurer avant d'affirmer · `NON MESURÉ` plutôt qu'un chiffre de complaisance · mettre à jour `PASSIO_ENGINEERING_LOG.md` · créer un skill dès qu'un savoir non devinable serait perdu, et l'inscrire dans `.passio/SKILLS_REGISTRY.md`.

### Committer sans aspirer le travail d'une autre session

```bash
git commit -F message.txt -- chemin/un chemin/deux
```

**Toujours les chemins explicites.** `git commit` sans chemin valide **tout l'index** — or une session Claude parallèle y indexe ses propres fichiers en continu (hook `PostToolUse`). Vécu le 2026-08-15 : trois fichiers d'une autre session sont partis dans un commit dont le message ne parlait que de tests.

Et `-F fichier`, jamais une here-string : le `@` de PowerShell parasite le message.

Avant de committer, `git status --porcelain` : si des fichiers inconnus sont indexés, une autre session travaille — ne committer que les siens.

## Au retour de Benjamin

Un compte rendu court : ce qui a été fait, ce qui a été trouvé, ce qui l'attend (migrations préparées, décisions produit). Pas le journal de bord — il est dans le fichier.
