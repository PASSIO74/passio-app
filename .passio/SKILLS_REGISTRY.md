# Registre des skills PASSIO

> Skills Claude Code **locaux** (`.claude/skills/`, gitignorés — cf. [`adr/ADR-006-claude-tooling-gitignored.md`](adr/ADR-006-claude-tooling-gitignored.md)). Ce registre est la trace **versionnée** de ce qui existe côté machine.
> Statut : `ACTIF` (utilisé) · `À REVOIR` (redondance/qualité) · `PLANIFIÉ` (pas encore créé).
> Dernière revue : 2026-08-08.

## Croissance / Produit
| Skill | Mission | Statut |
|---|---|---|
| `growth` | Boucles de croissance/viralité (invitations, preuve sociale, parrainage) | ACTIF |
| `retention` | Rétention/engagement via télémétrie (DAU/WAU, cohortes, décrochage) | ACTIF |
| `engagement` | Mécaniques d'engagement (réactions, commentaires, partages) | ACTIF |
| `onboarding` | Tunnel d'inscription / time-to-value / activation | ACTIF |
| `feed-tuning` | Réglage de `rankFeedPosts` (fraîcheur × affinité × engagement) | ACTIF |
| `notifications-strategy` | Stratégie push / ré-engagement / anti-spam | ACTIF |
| `ab-test` | Expérimentation / feature flags / rollout progressif | ACTIF |
| `kpi` | Définition et suivi des KPI réseau social | ACTIF |

## Qualité / Test
| Skill | Mission | Statut |
|---|---|---|
| `test` | Suite complète + audits (globals, handlers) | ACTIF |
| `e2e-multi` | Tests e2e **multi-comptes** (preuve RLS + realtime cross-compte) | ACTIF |
| `new-test` | Nouveau test Playwright (conventions maison) | ACTIF |
| `review` | Revue de code pré-commit (délègue à `audit-passio`) | ACTIF |
| `diag` | Diagnostic de bug bout-en-bout (lit `client_errors`, reproduit) | ACTIF |
| `refactor` | Refactorisation sûre (hoisting/globals préservés) | ACTIF |
| `simplify` | Nettoyage qualité du diff (réutilisation, efficacité) | ACTIF |

## Sécurité / Trust & Safety
| Skill | Mission | Statut |
|---|---|---|
| `xss-audit` | Failles XSS stockées + usage des 3 helpers | ACTIF |
| `rls-audit` | Policies RLS (confidentialité, mutations 0-ligne) | ACTIF |
| `moderation` | Modération (signalements, blocages, contenu abusif) | ACTIF |
| `security-review` | Revue sécurité générique | ACTIF |

## Design / UX
| Skill | Mission | Statut |
|---|---|---|
| `design` | Refonte/polish d'écran (charte violet, variables CSS) | ACTIF |
| `a11y` | Accessibilité (contraste AA, cibles 44px, aria, clavier) | ACTIF |
| `motion` | Micro-interactions & animations « juice » | ACTIF |

## Data / Pilotage
| Skill | Mission | Statut |
|---|---|---|
| `dashboard` | Lance/travaille le centre de pilotage | ACTIF |
| `dashboard-widget` | Ajoute un panneau/widget au dashboard | ACTIF |
| `dashboard-feature` | Nouvelle capacité serveur du dashboard (route, surveillance, alerte) | ACTIF |
| `pilot-report` | Rapport de supervision temps réel (salle de contrôle) | ACTIF |
| `prod-errors` | Santé prod (client_errors, reports, comptes de test) | ACTIF |
| `telemetry-event` | Ajoute un événement de télémétrie via le filtre PII | ACTIF |

## Ingénierie / Infra / Data-layer
| Skill | Mission | Statut |
|---|---|---|
| `feature` | Nouvelle feature de A à Z (local + Supabase + realtime + cross-compte) | ACTIF |
| `migration` | Migration SQL Supabase prod (invariants respectés) | ACTIF |
| `schema` | Inspecte le schéma prod RÉEL (repo ≠ vérité) | ACTIF |
| `storage` | Audit Supabase Storage (médias, orphelins, URLs signées) | ACTIF |
| `realtime` | Débogue le temps réel (canaux, broadcast, presence) | ACTIF |
| `perf` | Performance (bundles, jank, pollings, requêtes, images) | ACTIF |
| `pwa` | Expérience PWA (installabilité, SW, offline, push) | ACTIF |
| `preview` | Lance le dev server + vérifie dans le navigateur | ACTIF |
| `ship` | Séquence de mise en prod (tests → build → commit → push) | ACTIF |

## Manques identifiés (candidats — cf. `PASSIO_CONTROL_CENTER_ROADMAP.md`)
- Aucun skill **exécutif transverse** (synthèse produit+tech+growth en une vue) → cf. agent `passio-executive-intelligence` (PLANIFIÉ).
- Aucun skill **décision** (structurer un arbitrage avec trade-offs) → agent `passio-decision-engine` (PLANIFIÉ).
- Aucun skill **red-team du dashboard** (attaquer le pilotage lui-même) → `control-red-team` (PLANIFIÉ).

## Gouvernance
Redondances possibles à surveiller (`retention`/`engagement`/`kpi` se recouvrent partiellement — usages distincts assumés). Toute création de skill passe par : besoin réel non couvert → mission claire → test → inscription ici. Ne pas multiplier des prompts génériques (cf. mandat §10).
