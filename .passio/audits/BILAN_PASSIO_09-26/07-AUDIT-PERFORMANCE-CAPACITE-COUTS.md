# Audit performance, capacité et coûts — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (main, 2026-09-04). Modèle : Claude Fable 5.1 (auditeurs de domaine et relecteurs adversariaux). Statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE. Priorités : P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future. Chaque problème a été soumis à une relecture adversariale indépendante (angles reproduction / impact / contexte) ; la priorité retenue est celle de la relecture quand elle diffère.


## Domaine « perf-capacite-couts »

> ⚠️ **Domaine reconstitué par l'orchestrateur.** Les trois sous-agents Fable 5.1 affectés à ce domaine ont été interrompus par l'épuisement des crédits de session avant de rendre leur sortie structurée. L'orchestrateur (Fable 5.1 également) a reconstitué contrôles et problèmes à partir des preuves qu'ils avaient déposées (scripts, captures, journaux, requêtes) et de vérifications ciblées dans le code du SHA audité. **Aucune relecture adversariale n'a pu être faite sur ces problèmes** : ils sont marqués « NON VÉRIFIÉ (pas de relecture) » et sont prioritaires pour la contre-revue GPT-6 Astra.

Domaine performance / capacité / coûts reconstitué par l'orchestrateur à partir des mesures déposées par trois sous-agents Fable 5.1 interrompus (poids du build de production reproduit à l'identique de deploy.yml, émulation Chromium à 390×844 avec et sans bridage réseau/CPU, médiane de 3, soak de 5 minutes) et des relevés base du domaine supabase-isolation. Sur un appareil rapide l'application est vive (première peinture 124 ms, fil actif 154 ms, navigation 20-60 ms, 500 cartes rendues en 14 ms, aucune fuite mémoire sur 344 navigations). Sur réseau lent + CPU ×4 (profil d'un téléphone d'entrée de gamme), la première carte du fil arrive à 9,1 s à cause d'un monolithe de 1,75 Mo (364 Ko brotli) chargé en bloc. La CAPACITÉ (1 000 / 10 000 / 100 000 utilisateurs) N'EST PAS PROUVÉE : aucune mesure de charge n'existe, aucun staging ne permet d'en faire, l'instance a 60 connexions PostgreSQL, 78 policies réévaluent auth.uid() par ligne, et Realtime diffuse à tous les accusés de lecture. Les COÛTS ne sont pas lisibles (plans Supabase/Netlify/Brevo inaccessibles). Aucune relecture adversariale (crédits épuisés).

### Contrôles (15)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| PERF-C01 | Poids du build de production (minifié comme deploy.yml) | **PROUVÉ** | test exécuté | preuves/perf-capacite-couts/01-poids-dist.json : boot = index.html 302 Ko + app.js 1 226 Ko + styles.css 221 Ko = 1 749 Ko brut, 464 Ko gzip, 364 Ko brotli ; passions-v1.json 164 Ko (33 Ko br) à la demande |
| PERF-C02 | Démarrage sans bridage (390×844, brotli, requêtes externes exclues) | **PROUVÉ** | émulation | mesures-perf.json médianes sans_bridage : FCP 124 ms, appReady 155 ms, écran fil actif 154 ms, première carte 811 ms, DOM 3 018 nœuds, tas 9,5 Mo, 0 long task |
| PERF-C03 | Démarrage réseau lent (Slow 3G) + CPU ×4 | **DÉFAILLANT** | émulation | médianes slow3g_cpu4 : FCP 2,5 s, appReady 8,2 s, première carte 9,1 s, 5 long tasks (531 ms) au boot |
| PERF-C04 | Navigation entre écrans | **PROUVÉ** | émulation | nav (ms) sans bridage : profil 26, IRL 40, messages 27, explore 58, fil 19 ; bridé : 96 / 188 / 68 / 76 / 75 |
| PERF-C05 | Long fil de conversation (504 messages) | **PROUVÉ** | émulation | conv_open_500msg_ms 33 (bridé 101), panneau 252 nœuds (fenêtrage) |
| PERF-C06 | Fil de 500 cartes : rendu et DOM | **PROBABLE** | émulation | render 500 → frame 14 ms (bridé 55 ms) ; 14 789 nœuds DOM (feed_window_v1 coupé par défaut) ; tas 9,5 Mo stable |
| PERF-C07 | Recherche de passions (référentiel 1 908) | **PROUVÉ** | émulation | charger 0-0,1 ms (cache), chercher « guitare » 0,3 ms (bridé 1,4 ms) |
| PERF-C08 | Mémoire sur la durée (soak 5 min, 344 navigations) | **PROUVÉ** | émulation | tas constant 9,5 Mo, DOM constant 14 789, 3 long tasks au total |
| PERF-C09 | Carte (MapLibre + tuiles OpenFreeMap) | **BLOQUÉ** | non réalisé | map_status « échec » : unpkg/openfreemap injoignables derrière le proxy |
| PERF-C10 | Requêtes lentes, index, policies (advisors Supabase) | **DÉFAILLANT** | requête base | get_advisors (session orchestrateur) : 78 `auth_rls_initplan` (auth.uid() réévalué par ligne), 30 `multiple_permissive_policies`, 20 index inutilisés, 3 clés étrangères sans index |
| PERF-C11 | Pagination des lectures principales | **CONFORME PAR INSPECTION** | inspection code | fil par lots de 60 (`supaLoadPosts(offset)`, docs/SCALE_RUNBOOK.md) ; conversations 30/page ; événements limit 60 SANS pagination ni filtre de date (IRL-07) ; `passions` sans `.range` (PRO-01) |
| PERF-C12 | Limites Realtime | **DÉFAILLANT** | requête base | fonctions_realtime_storage_staging.md : 25 tables dans la publication dont telemetry_events et conv_reads (SELECT true → chaque client reçoit TOUS les accusés de lecture) ; canaux broadcast publics sans RLS ; plan/limites Realtime non lisibles |
| PERF-C13 | Capacité 1 000 / 10 000 / 100 000 utilisateurs | **BLOQUÉ** | non réalisé | Aucun outil de charge dans le dépôt (grep k6/artillery/autocannon : 0 hors docs), aucun staging (un seul projet Supabase), interdiction de charger la production → CAPACITÉ NON PROUVÉE ; `max_connections` = 60 (session orchestrateur) |
| PERF-C14 | Coûts (Supabase, Netlify, Storage, bande passante, e-mails, médias, carte) | **BLOQUÉ** | non réalisé | Plans et factures non lisibles par le connecteur. Volumes mesurés : base 92 Mo, Storage 171 Mo / 70 objets (2,4 Mo par objet en moyenne, buckets PUBLICS = sortie non plafonnée), telemetry_events 111 828 lignes / 54 Mo jamais purgées |
| PERF-C15 | Batterie, réseau lent réel, appareils réels | **BLOQUÉ** | non réalisé | Aucun appareil réel disponible |

### Problèmes (6)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| PERF-01 | **P0** | NON VÉRIFIÉ (pas de relecture) | Capacité non prouvée : aucune mesure de charge, aucun environnement pour la faire, et des plafonds connus (60 connexions PostgreSQL, policies non optimisées, Realtime diffusé à tous) |
| PERF-02 | **P2** | NON VÉRIFIÉ (pas de relecture) | Monolithe de 1,75 Mo chargé en bloc : 9 s avant la première carte sur téléphone lent |
| PERF-03 | **P2** | NON VÉRIFIÉ (pas de relecture) | 78 policies RLS réévaluent `auth.uid()` par ligne, 30 tables cumulent des policies permissives, 20 index inutilisés, 3 FK sans index |
| PERF-04 | **P2** | NON VÉRIFIÉ (pas de relecture) | Télémétrie jamais purgée (111 828 lignes, 54 Mo, plus de la moitié de la base) et publiée en Realtime |
| PERF-05 | **P2** | NON VÉRIFIÉ (pas de relecture) | Coûts non maîtrisables : buckets publics sans plafond de sortie, vidéos jusqu'à 50 Mo, plans inconnus |
| PERF-06 | **P3** | NON VÉRIFIÉ (pas de relecture) | Fil sans fenêtrage par défaut : 14 789 nœuds DOM à 500 cartes |

### PERF-01 — Capacité non prouvée : aucune mesure de charge, aucun environnement pour la faire, et des plafonds connus (60 connexions PostgreSQL, policies non optimisées, Realtime diffusé à tous)

| Champ | Valeur |
|---|---|
| Identifiant | PERF-01 |
| Priorité retenue | **P0** (proposée par l'auditeur : P0) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Toute la plateforme (base, Realtime, Edge Functions) |
| Résultat attendu | Une mesure de charge sur un staging isolé établissant le nombre d'utilisateurs simultanés supportés à 1 000 / 10 000 / 100 000 comptes, avec les goulots identifiés. |
| Résultat observé | Aucun test de charge n'a jamais été exécuté (aucun outil ni script dans le dépôt, aucun résultat dans docs/ ou .passio/). Il n'existe pas de staging (un seul projet Supabase pour dev, previews, CI et prod) et l'ordre interdit de charger la production. Les seules bornes connues : `max_connections` = 60 ; 78 policies avec `auth.uid()` non encapsulé (coût par ligne) ; 30 tables à policies permissives multiples ; Realtime : 25 tables publiées dont `conv_reads` en SELECT `true` (fan-out de tous les accusés de lecture à tous les clients) ; liste IRL limitée à 60 événements. |
| Reproduction | Sans objet : l'absence de mesure est le constat. |
| Preuve | preuves/supabase-isolation/fonctions_realtime_storage_staging.md (Realtime, staging) ; get_advisors (18 WARN perf) ; docs/SCALE_RUNBOOK.md (plan d'échelle sans mesure) ; PASSIO_PRODUCTION_READINESS.md:35-40 |
| Impact utilisateur et commercial | Critère d'interdiction explicite du GO grande échelle (« capacité non mesurée »). Aucune promesse commerciale sur le nombre d'utilisateurs ne peut être tenue. |
| Visibilité dans le Centre de pilotage | Partielle : latences API par endpoint et 5xx dans le dashboard ; aucun indicateur de saturation (connexions, Realtime). |
| Détection par la Sentinelle | Règle apislow/api5xx seulement. |
| Proposition de correction | Créer un projet Supabase de staging (même schéma via migrations), y rejouer un scénario k6 (lecture fil, publication, messagerie, Realtime) à 100 / 1 000 / 5 000 clients virtuels, corriger les advisors (`(select auth.uid())`, fusion des policies), retirer `conv_reads` et `telemetry_events` de la publication Realtime, puis documenter la capacité mesurée. |
| Risque de régression | Faible pour les advisors (réécriture mécanique) ; moyen pour Realtime (v3 topic privé déjà en place). |
| Effort estimé | 3 à 5 jours (staging + campagne) — hors correctifs. |

### PERF-02 — Monolithe de 1,75 Mo chargé en bloc : 9 s avant la première carte sur téléphone lent

| Champ | Valeur |
|---|---|
| Identifiant | PERF-02 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Démarrage |
| Résultat attendu | Première carte du fil sous 3 s sur Slow 3G / CPU ×4 (repère courant), scripts non critiques différés. |
| Résultat observé | index.html 302 Ko + app.js 1 226 Ko + CSS 221 Ko (364 Ko brotli) ; sur Slow 3G + CPU ×4 : FCP 2,5 s, appReady 8,2 s, première carte 9,1 s, 5 long tasks. Sans bridage : 811 ms. |
| Reproduction | preuves/perf-capacite-couts/mesure-perf.js (CDP Network.emulateNetworkConditions + setCPUThrottlingRate) sur dist minifié servi en brotli. |
| Preuve | preuves/perf-capacite-couts/mesures-perf.json ; 01-poids-dist.json |
| Impact utilisateur et commercial | Abandon à l'arrivée sur mobile bas de gamme ; l'app « est le pitch » (première visite) donc le premier chargement est commercial. |
| Visibilité dans le Centre de pilotage | Partielle : `app_ready` durée en télémétrie (si l'événement existe), pas de percentile affiché. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Découper app.js (écrans messagerie/IRL/studio chargés à la demande), sortir des 300 Ko d'index.html les modales rarement ouvertes, différer les modules UI non critiques, preload/priorités. |
| Risque de régression | Élevé (architecture par hoisting global, ordre de chargement) : à faire par lots avec les tests. |
| Effort estimé | 5 à 10 jours. |

### PERF-03 — 78 policies RLS réévaluent `auth.uid()` par ligne, 30 tables cumulent des policies permissives, 20 index inutilisés, 3 FK sans index

| Champ | Valeur |
|---|---|
| Identifiant | PERF-03 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Base de données |
| Résultat attendu | Policies en `(select auth.uid())`, une policy par (table, commande, rôle), index alignés sur les requêtes. |
| Résultat observé | Advisors Supabase (performance) : 78 auth_rls_initplan, 30 multiple_permissive_policies, 20 unused_index, 3 unindexed_foreign_keys. |
| Reproduction | get_advisors(type=performance) sur le projet. |
| Preuve | Session orchestrateur (manifeste §3) ; preuves/supabase-isolation/policies.json (15 SELECT encapsulées sur 16, les autres commandes non) |
| Impact utilisateur et commercial | Coût CPU proportionnel au nombre de lignes lues : dégradation non linéaire quand les tables grossissent. |
| Visibilité dans le Centre de pilotage | Latences API par endpoint. |
| Détection par la Sentinelle | apislow. |
| Proposition de correction | Migration mécanique `auth.uid()` → `(select auth.uid())` ; fusion des policies doublonnées (events « Lecture publique »/« Read events », follows, profiles) ; index sur les 3 FK ; suppression des index inutilisés après vérification. |
| Risque de régression | Faible (sémantique identique) ; tests RLS de la CI. |
| Effort estimé | 1 jour. |

### PERF-04 — Télémétrie jamais purgée (111 828 lignes, 54 Mo, plus de la moitié de la base) et publiée en Realtime

| Champ | Valeur |
|---|---|
| Identifiant | PERF-04 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Télémétrie / Centre de pilotage |
| Résultat attendu | Rétention bornée (purge_telemetry planifiée), table hors publication Realtime. |
| Résultat observé | `purge_telemetry(keep_days)` existe (service_role) mais aucun `cron.schedule` ne l'appelle ; telemetry_events est dans `supabase_realtime`. |
| Reproduction | Comptage des lignes et lecture de cron.job. |
| Preuve | Session orchestrateur (volumes) ; migrations/migration_security_hardening.sql:17-19 ; fonctions_realtime_storage_staging.md (publication) |
| Impact utilisateur et commercial | Croissance linéaire du stockage payant, requêtes du dashboard de plus en plus lentes, données personnelles (device_id, user_id) conservées sans limite (RGPD). |
| Visibilité dans le Centre de pilotage | Le dashboard lit cette table ; aucun indicateur de sa taille. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | `select cron.schedule('purge_telemetry', '0 3 * * *', $$select purge_telemetry(30)$$)` ; retirer la table de la publication. |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### PERF-05 — Coûts non maîtrisables : buckets publics sans plafond de sortie, vidéos jusqu'à 50 Mo, plans inconnus

| Champ | Valeur |
|---|---|
| Identifiant | PERF-05 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | Storage, bande passante, e-mails |
| Résultat attendu | Estimation des coûts par utilisateur actif et plafonds (taille média, quota Brevo) connus. |
| Résultat observé | Storage 171 Mo pour 70 objets (2,4 Mo en moyenne), buckets `content`/`attachments` publics (toute URL est servable à l'infini sans authentification), limite 50 Mo par objet ; e-mails de confirmation par Brevo (plan gratuit = 300/jour, non vérifié) ; plans Supabase/Netlify illisibles. |
| Reproduction | Sans objet (constat de périmètre). |
| Preuve | fonctions_realtime_storage_staging.md §Storage ; docs/SETUP_SMTP_AUTH.md |
| Impact utilisateur et commercial | Une vidéo virale ou un scraping des buckets publics fait exploser la bande passante ; 300 inscriptions/jour maximum si Brevo est au plan gratuit (lancement bloqué). |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Lire les plans, plafonner les médias (transcodage, 30 Mo vidéo déjà côté client), passer `attachments` en privé + URL signées (SUP-01), vérifier le quota Brevo avant tout lancement. |
| Risque de régression | Moyen (URL signées : pièces jointes existantes). |
| Effort estimé | 1 jour d'analyse + SUP-01. |

### PERF-06 — Fil sans fenêtrage par défaut : 14 789 nœuds DOM à 500 cartes

| Champ | Valeur |
|---|---|
| Identifiant | PERF-06 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Fil |
| Résultat attendu | DOM borné (fenêtrage `feed_window_v1`). |
| Résultat observé | Le fenêtrage est coupé par défaut (fiche 14) ; 500 cartes = 14 789 nœuds, rendu encore rapide (14-55 ms) mais mémoire DOM croissante sur mobile. |
| Reproduction | mesure-perf.js feed500. |
| Preuve | preuves/perf-capacite-couts/mesures-perf.json |
| Impact utilisateur et commercial | Faible aujourd'hui. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Activer `feed_window_v1` après avoir rebranché les décorateurs (`_feedWindowRedecorer`). |
| Risque de régression | Moyen (fiche 14). |
| Effort estimé | 1 jour. |

### Surfaces saines

- Démarrage sans bridage : FCP 124 ms, fil actif 154 ms, 3 requêtes (index, CSS, JS) en brotli.
- Aucune fuite mémoire : tas et DOM constants sur 5 minutes et 344 navigations.
- Conversation de 504 messages ouverte en 33 ms (fenêtrage), recherche de passions sous la milliseconde.
- Fil serveur paginé par lots de 60 sans N+1 ; conversations 30/page ; médias jamais en base64 en base.
- Cache : index.html réseau d'abord, assets hachés (version-skew.spec vert).

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Capacité 1 000 / 10 000 / 100 000 : NON MESURÉE (capacité non prouvée).
- Plans, quotas et factures Supabase / Netlify / Brevo : BLOQUÉS (non lisibles).
- Carte et tuiles : BLOQUÉES (réseau).
- Batterie, réseau lent réel, appareils réels : non réalisés.
- Seconde passe de mesures (tas précis via CDP, CPU ×1) : le navigateur a planté 6 fois sur 6 (mesures-perf-2.json) pendant la saturation CPU de l'environnement — non exploitable.
- Relecture adversariale des 6 problèmes : NON FAITE.

### Affirmations des anciens rapports confrontées au code actuel

- .passio/audits/PERFORMANCE_AUDIT.md : à confronter aux chiffres du jour (non relu faute de crédits).
- docs/SCALE_RUNBOOK.md : Realtime v3 (topic privé) confirmé actif ; mais `conv_reads` et `telemetry_events` restent dans la publication, ce que le runbook ne mentionne pas.

### Fichiers de preuve

- `preuves/perf-capacite-couts/01-poids-dist.json`
- `preuves/perf-capacite-couts/mesure-poids.js`
- `preuves/perf-capacite-couts/mesure-perf.js`
- `preuves/perf-capacite-couts/mesures-perf.json`
- `preuves/perf-capacite-couts/mesure-perf.log`
- `preuves/perf-capacite-couts/mesures-perf-2.json`
- `preuves/perf-capacite-couts/capture-fil-500.jpg`

### Notes de l'auditeur

Reconstitué par l'orchestrateur le 2026-09-04 (sous-agents wf_fe3cb58d, wf_891bc072, wf_eb42321e interrompus). Les mesures excluent volontairement les requêtes externes (SDK Supabase, MapLibre, polices) : le temps réel de première carte en production est donc SUPÉRIEUR aux chiffres cités.
