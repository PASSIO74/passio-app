---
name: passio-audit
description: Audit transverse du dépôt PASSIO sur un ou plusieurs domaines (sécurité, DB/RLS, archi, perf, tests, dette, dépendances, cohérence design), avec findings priorisés P0→P4 écrits dans .passio/reports/. À utiliser pour un état des lieux, une revue avant jalon, ou quand Benjamin dit « audite », « fais le point technique », « où en est la dette ». Réutilise les skills/subagents d'audit existants.
---

# /passio-audit — Audit priorisé du dépôt

Objectif : produire des **findings actionnables priorisés**, pas un roman. Chaque finding : gravité, preuve (fichier:ligne), impact, correctif suggéré.

## Choisir la portée
Un domaine ou plusieurs : `security` · `database` · `architecture` · `performance` · `testing` · `tech-debt` · `dependencies` · `design-consistency` · `product-completeness`.

## Router vers les vérifs existantes (ne pas réinventer)
| Domaine | Moyens |
|---|---|
| security | subagent `passio-red-team`, skills `xss-audit`/`rls-audit`, `.passio/audits/SECURITY_AUDIT.md`, `grep` secrets |
| database | subagent `migration-checker`, skill `schema`, `.passio/context/DATABASE_MODEL.md`, `migrations/` |
| architecture | `.passio/audits/` (si présent), collisions : `npm run audit:globals` |
| performance | skill `perf`, `.passio/audits/PERFORMANCE_AUDIT.md`, `docs/lighthouse-*` |
| testing | `.passio/context/TESTING_STRATEGY.md`, `ls tests/e2e/`, lacunes de parcours |
| tech-debt | `.passio/context/TECH_DEBT.md` (mettre à jour) |
| dependencies | `package.json`, classer ESSENTIEL/UTILE/REMPLAÇABLE/INUTILISÉ |
| design-consistency | skill `design`, `a11y` |

## Régressions maison
Toujours passer le subagent `audit-passio` sur les zones chaudes (findPostAnywhere, supaTs, 3 helpers, catch large, globals).

## Sortie
Écrire `/.passio/reports/AUDIT_<domaine>_<AAAA-MM-JJ>.md` :
```
# Audit <domaine> — <date>
## P0 (critique) …
## P1 … / P2 … / P3 … / P4 …
## Surfaces saines
## Non vérifié (et pourquoi)
```
Puis mettre à jour `.passio/context/KNOWN_RISKS.md` / `TECH_DEBT.md` si un risque/dette nouveau émerge. **Ne pas corriger silencieusement un P0 sans le documenter.**
