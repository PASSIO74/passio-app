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

## Trafic hors public — robots, émulations, équipe (2026-10-05)
Mesuré du 28/09 au 04/10 en production : 15 des 19 appareils sans compte n'étaient personne (dix « iPhone » 390 × 844 déclarant une connexion « 4g », arrivés juste après chaque fusion sur `main`). `js/telemetry.js` pose désormais `meta.trafic` sur chaque événement d'un tel appareil — et sur aucun autre :

| Valeur | Quand | Comment la poser / l'enlever |
|---|---|---|
| `robot` | `navigator.webdriver`, « HeadlessChrome », robot d'indexation connu | automatique |
| `emulation` | agent iPhone/iPad servi par Chromium (`navigator.connection` ou `navigator.userAgentData`, qu'aucun navigateur iOS n'expose) ; rattrapé côté serveur pour les lignes d'avant (`platform = ios` + `connection` non vide) | automatique |
| `equipe` | appareil de l'équipe | ouvrir une fois `https://passio-app.netlify.app/?equipe=1` (mémorisé sur l'appareil, retiré de la barre d'adresse) ; `?equipe=0` l'enlève |

**Écartés de** : visiteurs et entonnoir des liens (`dashboard/server/store.js`), « appareils en ligne » (accueil du dashboard), « en ligne / 24 h » du pilotage téléphone (`compterAudience`), « Appareils actifs 7 j » de la veille et du digest (`filtrePublic()`). **Gardés dans** : erreurs, problèmes, santé, flux et silence de la veille, Sentinelle — une erreur vue par un robot reste une erreur de la production. Une définition, trois lecteurs : `tests/unit/trafic-hors-public.test.mjs` les confronte.

## Activation des nouveaux comptes (2026-10-06) — RÉEL
| Métrique | Définition | Source | Fraîcheur | Qualité |
|---|---|---|---|---|
| Activation à 7 j | Part des comptes confirmés créés entre 7 et 30 jours plus tôt (hors e2e et éditeur) qui ont fait au moins un geste social dans leurs 7 premiers jours : publication, story, commentaire (publication ou activité), abonnement, participation à une activité, activité organisée, message. Les comptes de moins de 7 jours sont « en cours », hors taux ; sans compte mûr, pas de taux. | `GESTES_ACTIVATION` + `activation()` (`supabase/functions/_shared/pilotage.js`) — fonction `pilotage` (PostgREST) et digest (`sqlActivation()`, API de gestion) | à la demande (téléphone), chaque matin (digest) | RÉEL |

Le like n'en est pas (`post_likes` sans horodatage). Une définition, deux lecteurs : `tests/unit/activation.test.mjs` les confronte sur un même jeu de données. Mesure du jour : 1 compte activé sur 3 comptes mûrs.

## KPI produit — statut honnête (mis à jour 2026-08-08)
| KPI candidat | Statut | Pourquoi |
|---|---|---|
| DAU / WAU / MAU | **RÉEL** | Calculés sur `telemetry_events` (utilisateurs identifiés distincts par fenêtre), `dashboard/server/kpi.js` → vue « KPI produit ». Pagination `.range()` (plafond PostgREST 1000). |
| Habitude (DAU/MAU) · Taux de retour 7 j | **RÉEL** | Idem `kpi.js` (`computeKpi`, testé). |
| Rétention J1 / J7 / J30 (cohorte) | **RÉEL (avec garde)** | `dashboard/server/retention.js` : `profiles.created_at` × retour télémétrie. Cohorte comptée seulement si fenêtre écoulée ET couverte par la télémétrie ; sinon « insuffisant »/inconnu, jamais un faux 0 %. Aujourd'hui surtout « insuffisant » (télémétrie ~3 j de recul). |
| K-factor / viralité | **UNKNOWN** | Invitations/parrainage non instrumentés en agrégat. |
| Passions par utilisateur | **UNKNOWN** | Dérivable de la colonne jsonb `profiles.passions` mais non exposé. (Il n'existe pas de table `profile_passions` — cf. ADR-007 et ADR-010.) |
| Profils par utilisateur / taux de bascule | **UNKNOWN** | Bascule de profil non marquée en télémétrie (candidat `telemetry-event`). |
| Création de contenu (posts/stories/CDV/IRL) | **PARTIEL** | Marqueurs de publication existent (`supaPublishPostWithRetry`) ; agrégat par type à construire. |

## Financier
| Métrique | Statut |
|---|---|
| Burn / runway / MRR / ARR / CAC / LTV | **UNKNOWN (absent)** — pas de données financières branchées. Ne jamais fabriquer. |

## Règle North Star
Avant de promouvoir une métrique en objectif, vérifier qu'elle reflète un **engagement passionnel signifiant** (cf. `context/MULTI_PROFILE.md`, `PRODUCT_PRINCIPLES.md`) et non de la vanité. Piloté par le skill `kpi` / agent `passio-executive-intelligence` (PLANIFIÉ).
