# PASSIO — Carte des compétences (Skills Map)

> Le mandat propose ~150 skills « type grande boîte tech ». PASSIO est une **PWA vanilla JS + Supabase**, mono-repo, sans framework ni bundler. On mappe donc les *capacités* utiles à la **réalité du stack**, pas au catalogue générique.
> Règle du mandat elle-même respectée : **pas de placeholder factory** (CXLIV), **pas d'over-engineering** (§69), **les références pointent vers des fichiers réels** (CXLV).

## Principe : réutiliser l'existant, ne pas dupliquer

PASSIO possède **déjà** 35 skills locales et 3 subagents (`.claude/`, gitignorés par choix — cf. ADR-006). La bonne architecture n'est pas d'en créer 100 de plus mais :
1. de **réutiliser** les skills existantes (elles sont tunées au stack) ;
2. d'ajouter une **couche de contrôle** (`passio-orchestrator`, `passio-red-team`, `passio-engineering-council`, `passio-skill-factory`, commandes `/passio-*`) qui **route** vers elles ;
3. de ne créer une nouvelle skill **que sur un vrai manque récurrent** (via `passio-skill-factory`).

## Skills existantes (déjà en place, tunées PASSIO)

**Livraison/qualité** : `ship`, `review`, `test`, `refactor`, `preview`, `new-test`, `e2e-multi`.
**Backend/DB/sécurité** : `migration`, `schema`, `rls-audit`, `xss-audit`, `storage`, `realtime`.
**Produit/design** : `design`, `a11y`, `motion`, `engagement`, `onboarding`, `feed-tuning`.
**Croissance/data** : `growth`, `retention`, `kpi`, `ab-test`, `telemetry-event`, `notifications-strategy`.
**Ops/diagnostic** : `diag`, `perf`, `prod-errors`, `moderation`, `pwa`.
**Pilotage** : `dashboard`, `dashboard-widget`, `dashboard-feature`, `pilot-report`.

**Subagents** : `audit-passio` (revue régressions), `migration-checker` (schéma prod↔repo), `growth-analyst` (analyse télémétrie).

## Couche de contrôle AJOUTÉE (Wave 2)

| Capacité | Forme | Fichier | Rôle |
|---|---|---|---|
| Orchestrateur | agent | `.claude/agents/passio-orchestrator.md` | Route une demande vers les bonnes skills/subagents, séquence, consolide. |
| Red Team | agent | `.claude/agents/passio-red-team.md` | Revue adversariale d'une feature majeure. |
| Engineering Council | agent | `.claude/agents/passio-engineering-council.md` | Décisions à fort impact vues par plusieurs spécialistes virtuels. |
| Skill Factory | skill | `.claude/skills/passio-skill-factory/SKILL.md` | Détecte les vrais manques, crée/fusionne/retire des skills. |
| `/passio-audit` | skill | `.claude/skills/passio-audit/SKILL.md` | Audit multi-domaines du dépôt, sorties P0–P4. |
| `/passio-feature` | skill | `.claude/skills/passio-feature/SKILL.md` | Workflow complet de feature (produit→archi→sécu→impl→test→red team→doc). |
| `/passio-health` | skill | `.claude/skills/passio-health/SKILL.md` | Dashboard santé (build/tests/sécu/migrations…), preuves réelles. |
| `/passio-scale-review` | skill | `.claude/skills/passio-scale-review/SKILL.md` | Comportement d'un sous-système à 1k→100M. |
| `/passio-launch-review` | skill | `.claude/skills/passio-launch-review/SKILL.md` | GO / GO-WITH-RISKS / NO-GO avant livraison majeure. |

## Skills du catalogue mandat NON créées (et pourquoi)

`react-engineer`, `nextjs-engineer`, `ios/android/flutter-engineer`, `kubernetes-engineer`, `microservices-architect`, `kafka/event-driven-architect`, `monorepo-architect`, `websocket-engineer`… → **hors stack** (vanilla JS, pas de framework/bundler/mobile natif ; realtime = Supabase managé). Les créer serait la « placeholder factory » que le mandat interdit. Elles seront ajoutées par `passio-skill-factory` **si et seulement si** le stack évolue (trigger + ADR).

Registre à jour et vivant : `.passio/SKILLS_REGISTRY.md`.
