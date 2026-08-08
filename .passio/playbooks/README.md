# Playbooks — procédures exécutables

> Les procédures **exécutables** de PASSIO sont les **skills** Claude Code (`/…`). Ce dossier ne les duplique pas : il en donne la carte et le contexte de gouvernance. Registre complet : [`../SKILLS_REGISTRY.md`](../SKILLS_REGISTRY.md).

## Carte playbook → skill

| Situation | Playbook (skill) | Notes de gouvernance |
|---|---|---|
| Développer une feature | `/feature` | Definition of Done : `../context/ENGINEERING_PRINCIPLES.md`. Vérifier le multi-profil (`../context/MULTI_PROFILE.md`). |
| Corriger un bug | `/diag` puis `/review` | Lire `client_errors`, reproduire, isoler, corriger, prouver. |
| Migration Supabase (`database-migration`) | `/migration` (+ subagent `migration-checker`) | Schéma prod ≠ repo (ADR-005) ; additive par défaut ; RLS + publication realtime ; rollback prévu. |
| Mettre en prod | `/ship` | Tests + audits verts → build → commit → push `main` (= déploiement). **SENSITIVE WRITE**. |
| Incident prod | `/prod-errors` puis `/diag` | Distinguer « PASSIO KO » de « pilotage sans données » (`../context/VISION.md`). |
| Revue avant lancement | `/review`, `/rls-audit`, `/xss-audit`, `/e2e-multi` | Couvre code, RLS, XSS, cross-compte. |
| Red team | `/security-review` (+ `control-red-team` PLANIFIÉ) | Attaquer aussi le dashboard lui-même. |
| Point de situation | `/pilot-report` | Vue salle de contrôle temps réel. |

## Frontières d'action (rappel)
READ · SAFE WRITE (autonome) · **SENSITIVE WRITE** (tests verts + geste explicite : migration, push main) · **DESTRUCTIVE** (confirmation, jamais un agent seul). Détail : `../context/AGENT_MODEL.md`.

## Sorties
Les rapports générés (pilotage, audits datés) sont écrits dans [`../reports/`](../reports/).
