# Registre des métriques

> Aucune métrique n'est affichée sans provenance. Chaque ligne : définition, source, fraîcheur, qualité. `RÉEL` = calculée sur données prod · `ESTIMÉ` · `MOCK` (démo) · `UNKNOWN` (pas encore calculée). **Ne jamais inventer une valeur pour remplir une barre de progression.**
> Dernière revue : 2026-08-08.

## Ce que la télémétrie capture RÉELLEMENT (`telemetry_events`)
Instrumentation automatique (`js/telemetry.js`) : **navigation** (wrap `goTo`), **clics** (délégation), **fetch** (timing par endpoint, sans query), **erreurs**. Marqueurs sémantiques : `supaPublishPostWithRetry`, `likePost`, `submitComment`, `sendMessageToSupabase`, `toggleJoinEvent`. PII masqué (liste blanche `meta`, redaction e-mail/JWT/hex, jamais de contenu ni base64).

## Métriques calculées par le dashboard (RÉEL)
| Métrique | Définition | Source | Fraîcheur | Qualité |
|---|---|---|---|---|
| Événements 5 min / activité live | Flux d'événements récents | `store.overview()`, `/events` | temps réel (SSE) | RÉEL |
| Taux de succès API | % d'appels fetch réussis | `store.apiPerf()` | temps réel | RÉEL |
| Erreurs 5 min (`health.errors5m`) | Nombre d'erreurs récentes | `store.health()` | temps réel | RÉEL |
| Latence API par endpoint | Timing fetch (sans query) | `store.apiPerf()` | temps réel | RÉEL |
| Appareils / sessions actives | Clients connectés, parcours | `store.deviceList()`, `sessionList()`, `userJourney()` | temps réel | RÉEL |
| Bugs groupés | Erreurs regroupées + code | `store.bugList()` | temps réel | RÉEL |
| Inscriptions / comptes | `signups()`, `accounts()` | Supabase (service_role) | à la demande | RÉEL |
| **Readiness score** (0-100) | Pondération : stabilité 20, bugs critiques 25, tests fonctionnels 25, couverture checklist 15, dispo API 15 | `/readiness` | temps réel | RÉEL (aide à la décision, **pas** une garantie — mention explicite dans l'API) |

## KPI produit — statut honnête
| KPI candidat | Statut | Pourquoi |
|---|---|---|
| DAU / WAU / MAU | **UNKNOWN** | Pas d'agrégat calculé ; la télémétrie a la matière (navigation/actions) mais l'agrégation n'est pas branchée. |
| Rétention J1 / J7 / J30 | **UNKNOWN** | Cohortes non calculées. Priorité roadmap (`PASSIO_TECHNICAL_ROADMAP.md` P1). |
| K-factor / viralité | **UNKNOWN** | Invitations/parrainage non instrumentés en agrégat. |
| Passions par utilisateur | **UNKNOWN** | Dérivable de `profile_passions` mais non exposé. |
| Profils par utilisateur / taux de bascule | **UNKNOWN** | Bascule de profil non marquée en télémétrie (candidat `telemetry-event`). |
| Création de contenu (posts/stories/CDV/IRL) | **PARTIEL** | Marqueurs de publication existent (`supaPublishPostWithRetry`) ; agrégat par type à construire. |

## Financier
| Métrique | Statut |
|---|---|
| Burn / runway / MRR / ARR / CAC / LTV | **UNKNOWN (absent)** — pas de données financières branchées. Ne jamais fabriquer. |

## Règle North Star
Avant de promouvoir une métrique en objectif, vérifier qu'elle reflète un **engagement passionnel signifiant** (cf. `context/MULTI_PROFILE.md`, `PRODUCT_PRINCIPLES.md`) et non de la vanité. Piloté par le skill `kpi` / agent `passio-executive-intelligence` (PLANIFIÉ).
