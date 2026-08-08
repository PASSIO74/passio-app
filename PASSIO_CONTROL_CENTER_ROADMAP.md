# PASSIO Control Center — Roadmap

> Feuille de route du **centre de pilotage** (l'app `dashboard/` + le plan de contrôle `.passio/`). Distincte de la roadmap **produit/technique** de PASSIO (`PASSIO_TECHNICAL_ROADMAP.md`).
> Principe : construire par vagues, ne rien fabriquer de factice, marquer `UNKNOWN`/`MOCK`/`RÉEL`. On n'ajoute une brique que si un besoin réel la justifie (anti sur-ingénierie).
> Mis à jour : 2026-08-08.

## Légende
Priorité **P0–P4** · Impact (H/M/B) · Difficulté (H/M/B) · Statut : ✅ Fait · 🔄 En cours · ⬜ Planifié.

---

## WAVE 1 — Reconnaissance ✅ FAIT
| Livrable | Statut | Preuve |
|---|---|---|
| Audit du dépôt | ✅ | `PASSIO_REPOSITORY_AUDIT.md` |
| Modèle système canonique | ✅ | `PASSIO_SYSTEM_MODEL.md` |
| Vision & roadmap technique | ✅ | `PASSIO_TECHNICAL_VISION.md`, `PASSIO_TECHNICAL_ROADMAP.md` |

## WAVE 2-3 — Plan de contrôle (« OS ») ✅ FAIT (cette session)
| Livrable | Statut | Preuve |
|---|---|---|
| Couche contexte (16 fichiers) | ✅ | `.passio/context/` (VISION, PASSIO_CONTEXT, MULTI_PROFILE, SECURITY_MODEL, DATABASE_MODEL, ENGINEERING/PRODUCT_PRINCIPLES, AGENT_MODEL, TESTING_STRATEGY, KNOWN_RISKS, TECH_DEBT, DECISIONS, CURRENT_PRIORITIES, GLOSSARY…) |
| Décisions (6 ADR + template) | ✅ | `.passio/adr/` |
| Registres (skills, agents, intégrations, métriques) | ✅ | `.passio/{SKILLS,AGENTS,INTEGRATIONS,METRICS}_REGISTRY.md` |
| Audits fondateurs (sécurité, perf, index) | ✅ | `.passio/audits/` |
| Playbooks (carte → skills) | ✅ | `.passio/playbooks/README.md` |
| Gouvernance des agents (frontières READ/SAFE/SENSITIVE/DESTRUCTIVE) | ✅ | `.passio/context/AGENT_MODEL.md`, `VISION.md` |

## WAVE 4 — Qualité du dashboard 🔄 (3/4)
| Item | P | Impact | Diff. | Dépendances | Validation |
|---|---|---|---|---|---|
| ✅ Home « statut en 1 minute » | P1 | H | M | métriques existantes | Accueil + **Brief exécutif** copiable (`b99928f`), bandeau honnête « pas de données » (`f4bd7d1`) |
| ✅ Provenance visible sur chaque métrique (source/fraîcheur/confiance/RÉEL-LOCAL) | P1 | H | M | `METRICS_REGISTRY.md` | Bandeau de provenance sur Accueil / KPI / Brief (`f4bd7d1`, `2931f5d`) |
| ✅ Command palette (Ctrl/⌘-K) | P2 | M | M | — | Navigation clavier vers toute vue + actions (`a3dbcdd`) |
| Accessibilité (contraste, focus, clavier) | P2 | M | M | skill `a11y` | Passe AA — ⬜ à faire |

## WAVE 5 — Données 🔄 (KPI/rétention faits ; sources & cron à venir)
| Item | P | Impact | Diff. | Dépendances | Validation |
|---|---|---|---|---|---|
| Registre de sources vivant (statut/last-success/last-failure) | P2 | M | B | `INTEGRATIONS_REGISTRY.md` | Panneau « Sources » avec état réel |
| ✅ Agrégats KPI produit (DAU/WAU/MAU, habitude, retour 7j, rétention J1/J7/J30) | P1 | H | H | télémétrie | RÉEL : `kpi.js` + `retention.js` (`2931f5d`, `c39ff77`), tests 28/28, rétention gardée « insuffisant » tant que la fenêtre n'est pas couverte |
| Cron `purge_telemetry(30)` (rétention) | P2 | M | B | pg_cron | Rétention appliquée |

## WAVE 6 — Intelligence ⬜
| Item | P | Impact | Diff. | Dépendances | Validation |
|---|---|---|---|---|---|
| 🔄 Chaîne DONNÉE → SIGNAL → INSIGHT → PRIORITÉ → ACTION | P2 | H | H | KPI agrégés | Amorcée : le **Brief exécutif** dérive des « prochaines actions » de signaux réels (`b99928f`). Reste : insights/priorités formalisés avec confiance |
| Registre de décisions actionnable (états OPEN→CLOSED) | P2 | M | M | `context/DECISIONS.md` | Décision créée/suivie dans le dashboard |
| Registre de risques piloté (heatmap actionnable) | P2 | M | M | `context/KNOWN_RISKS.md` | Risques P0-P3 suivis, revus, datés |

## WAVE 7 — Opérations IA ⬜
| Item | P | Impact | Diff. | Dépendances | Validation |
|---|---|---|---|---|---|
| `passio-executive-intelligence` (synthèse exécutive) | P2 | H | H | KPI fiables | Vue exécutive avec priorités/risques/décisions |
| `passio-agent-supervisor` (qualité/redondance des agents) | P3 | M | M | registres | Rapport d'audit des agents |
| `passio-decision-engine` (trade-offs explicites) | P3 | M | M | décisions | Arbitrage structuré reproductible |

## WAVE 8 — Automatisation ⬜
| Item | P | Impact | Diff. | Validation |
|---|---|---|---|---|
| Brief exécutif quotidien / revue hebdo (structure définie) | P3 | M | M | Rapport généré dans `.passio/reports/` |
| Notifications d'alerte (e-mail/webhook — points de sortie déjà prévus dans `alerts.js`) | P3 | M | B | Alerte P0 routée |

## WAVE 9 — Durcissement ⬜
| Item | P | Impact | Diff. | Validation |
|---|---|---|---|---|
| `control-red-team` (attaque du dashboard : auth, secrets, injection agent) | P2 | H | M | Rapport red-team sans faille critique |
| Couverture de tests du dashboard (auth, permissions, provenance) | P2 | M | M | `dashboard/test/` étendu, verts |
| Audit de dépendances automatisé | P2 | M | B | `npm audit`/Dependabot vert |

## WAVE 10 — Amélioration continue ⬜
Rétro après chaque vague : qu'est-ce qui manquait, quel agent a peu apporté, quel travail répété doit devenir un skill, quelle source est peu fiable, quoi simplifier. Mettre à jour registres, risques, décisions.

---

## Note de cadrage
Les vagues 4→10 sont **planifiées, pas fabriquées**. Le dashboard actuel est déjà mûr et RÉELLEMENT connecté (télémétrie live, bugs, sessions, tests, git, Claude, readiness). Les livrables ci-dessus l'enrichissent au besoin ; aucun ne doit afficher de donnée inventée. Priorité produit P0 (SMTP, URLs signées) : voir `PASSIO_TECHNICAL_ROADMAP.md` — elle prime sur l'esthétique du pilotage.
