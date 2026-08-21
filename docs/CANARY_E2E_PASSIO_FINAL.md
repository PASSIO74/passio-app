# Canari E2E final R2 — Claude Code sur GitHub Actions

Ce document est la **preuve d'exécution** demandée par `.passio/claude-task.md` :
Claude Code doit pouvoir modifier réellement une branche PASSIO depuis GitHub
Actions, après retour du quota, sans que l'ordinateur de Benjamin soit allumé.
Il n'a aucun effet applicatif — c'est une trace datée, rien d'autre.

## Faits du run

| Élément | Valeur | Comment c'est établi |
|---|---|---|
| Date | **2026-08-21** | date du run |
| Branche de travail | `claude-task/e2e-final-r2-20260821` | `GITHUB_HEAD_REF` / `git rev-parse --abbrev-ref HEAD` |
| SHA de départ (dernière `main` réelle) | **`9f14ef904c41519ec94bf1e0ade96ce72be89091`** — *docs(ai): formaliser le système d'orchestration PASSIO à jour* | `git ls-remote origin refs/heads/main` |
| SHA de tête de la branche avant ce document | `9a9453ef02105a0d7af8edb3e5f37c2e10d988fc` — *test: préparer canari Claude Code final R2* | `git rev-parse HEAD` |
| Modèle Claude réellement utilisé | **Claude Opus 5** (`claude-opus-5`) | `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` et `CLAUDE_CODE_SUBAGENT_MODEL` valent tous `claude-opus-5` dans l'environnement du run ; aucun sous-agent n'a été lancé |
| Mode d'authentification | **Abonnement Claude Pro, jeton OAuth** (`CLAUDE_CODE_OAUTH_TOKEN`) — pas de clé API facturée | `ANTHROPIC_API_KEY` est présente mais **vide** (longueur 0), vidée explicitement par le workflow ; l'étape « Contrôle d'authentification (subscription-only) » échoue le run si `authMethod` vaut `api_key` |
| Exécution | GitHub Actions, `ubuntu-latest` | `GITHUB_ACTIONS=true`, workflow `Claude PR Task` (`.github/workflows/claude-pr-task.yml`), run `32479895152` (#38), event `pull_request` sur `refs/pull/90/merge` |
| CLI | `@anthropic-ai/claude-code` 2.1.238 (version épinglée), entrypoint `sdk-cli` | étape « Install Claude Code CLI » du workflow, `CLAUDE_CODE_ENTRYPOINT` |

## Le PC de Benjamin n'est pas requis

**Confirmé.** Tout s'est déroulé sur un exécuteur GitHub hébergé
(`ubuntu-latest`), déclenché par l'ouverture de la PR #90, avec le jeton OAuth
lu depuis `secrets.CLAUDE_CODE_OAUTH_TOKEN`. Aucun poste local n'intervient :
ni pour l'authentification, ni pour l'exécution, ni pour l'écriture du présent
fichier. C'est exactement le « normal remote path » décrit dans `AGENTS.md`
(« The user's computer is not required for the normal remote path »).

Rappel de portée : ce canari prouve **l'exécution distante et l'écriture d'un
diff réel**. Il ne prouve rien sur la prod Supabase, ni sur Netlify, ni sur le
Centre de pilotage, qui n'ont pas été touchés.

## Périmètre du changement

- Fichier créé : `docs/CANARY_E2E_PASSIO_FINAL.md` (celui-ci), **et lui seul**.
- Aucun fichier applicatif (`index.html`, `js/*`, `styles.css`, `sw.js`), aucune
  migration, aucun workflow, aucun fichier du dashboard, aucune configuration de
  production n'a été modifié.
- `.passio/claude-task.md` n'a pas été touché.
- Aucun commit, aucun push, aucun merge, aucun changement de branche par l'agent :
  c'est le workflow qui persiste les fichiers modifiés. Pas de merge automatique.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `npm run audit:globals` | vert |
| `npm run audit:handlers` | vert |
| `npm run audit:echappement` | vert |
| `npm run audit:tests` | vert |
| `git status` / `git diff --name-only` | un seul fichier ajouté, hors fichier de tâche |
| Suite Playwright (`npm test`) | **non lancée** — aucun code exécutable n'est modifié par ce changement ; la CI de la PR reste l'autorité |

Les résultats ci-dessus sont ceux réellement obtenus pendant ce run ; en cas
d'écart, la sortie de la CI du run `32479895152` fait foi.
