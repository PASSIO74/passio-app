# Veille de production et digest du matin

> Posés le 2026-09-18 (lot B de la conception « autonomie pendant les mois de test »).
> Deux workflows GitHub, deux scripts en lecture seule, deux fonctions pures testées par mutation.
> Ils ne corrigent rien : ils VOIENT ce que le silence cache et le disent une fois, par e-mail GitHub, avec le geste à faire.

## Pourquoi

La sentinelle autonome (`sentinelle-autonome.yml`) ne voit que ce qui lève une erreur JavaScript. Mesuré du 09-11 au 09-18 :

- le 09-17, 310 lignes de télémétrie et 0 compte identifié sur toute la journée (médiane des jours ouvrés : 2 081) — personne n'a rien dit ;
- 1 inscription sur 2 non confirmée le 09-16 ; la chaîne SMTP (Brevo, 300 e-mails/jour) n'a aucun témoin ;
- 8 runs rouges sur `main` en 10 jours, rattrapés uniquement parce que Benjamin était devant l'écran ;
- les crons GitHub sont servis 4 à 23 fois moins souvent qu'annoncé (cron 10 min ≈ 4 % des créneaux, horaire ≈ 25 %, 4 h ≈ 75 %), et GitHub les désactive après 60 jours sans commit, sans e-mail ;
- les jetons (`SENTINELLE_TOKEN` 90 j, `SUPABASE_ACCESS_TOKEN`, `NETLIFY_AUTH_TOKEN`) ne sont éprouvés qu'à l'usage.

Zéro ligne, et ça ressemble au calme. La veille regarde précisément là.

## `scripts/veille-production.mjs` — les huit signaux

Chaque signal rend `ok | warn | alert | unknown` et un texte fait de comptages (jamais un identifiant, jamais un e-mail : le dépôt est public). `unknown` = la mesure n'a pas pu être lue, et ça se voit ; ça ne passe jamais pour « ok ».

| Signal | Mesure | `warn` | `alert` |
|---|---|---|---|
| `flux` | lignes `telemetry_events` env=production hors canari et hors `meta.synthetic`, par heure Paris (SQL) ; canaris sur 2 h | ≥ 4 h actives consécutives à 0 (≥ 6 h le week-end) | ≥ 8 h ; ou à 21 h un jour ouvré, journée < 100 lignes alors que la médiane des jours ouvrés > 500 ; ou 0 canari en 2 h (« chaîne d'ingestion » : poste éteint ou Supabase refuse) |
| `inscriptions` | `auth.users` hors `%@passio-e2e.test` : créés/confirmés 24 h et 7 j, non confirmés > 24 h | ≥ 3 créés sur 7 j et moins de 50 % confirmés | ≥ 3 créés en 24 h et 0 confirmé |
| `erreurs` | `client_errors` + télémétrie `type=error` : dernière heure vs médiane horaire 7 j | ≥ 10, ≥ 5 × médiane, ≥ 2 appareils | — |
| `api` | télémétrie `type=api` dernière heure | ≥ 20 refus 401/403 hors `/auth/v1` sur ≥ 3 appareils | ≥ 5 réponses ≥ 500 sur ≥ 2 appareils |
| `deploiement` | `release.json` servi vs `main` (API GitHub) et dernier run `deploy.yml` sur main | — | dernier run main en échec ; ou main en avance sur le commit servi depuis > 90 min sans run en cours (« déploiement bloqué ») |
| `crons` | âge du dernier run terminé et `state` de sentinelle-autonome, sentinelle-distante, disponibilite, sauvegarde, moderation-alerte | > 8 / 12 / 6 / 30 / 30 h | > 24 / 36 / 24 / 54 / 54 h, ou workflow `disabled_*` |
| `base` | `GET /rest/v1/passions` avec la clé anon ; `pg_database_size` ; `cron.job` | > 6 Go ; purge `purge_telemetry` non planifiée | anon ≠ 200 ; > 7,5 Go (plan 8 Go) |
| `jetons` | `SENTINELLE_TOKEN` (en-tête `github-authentication-token-expiration`), `SUPABASE_ACCESS_TOKEN` (`GET /v1/projects`), `NETLIFY_AUTH_TOKEN` (`GET /api/v1/user`) | GitHub < 14 j | < 3 j ou 401/403 sur l'un des trois |

Le trafic humain (`flux`) n'est **jamais évalué entre 22 h et 08 h Paris** : la nuit est vide, c'est la normale. Les heures actives mesurées sont 09 h–21 h. Le canari, lui, est jugé à toute heure (c'est une machine).

Les seuils sont **calibrés sur la desserte réelle de GitHub** : un cron « toutes les 30 min » est servi toutes les 2 à 5 h. Un retour au vert peut donc mettre quelques heures à se voir, et une panne n'est pas relevée dans l'heure — dans la demi-journée. Ne pas resserrer sans mesurer.

### Lectures

- **API de gestion Supabase** (`POST https://api.supabase.com/v1/projects/<ref>/database/query`, jeton `SUPABASE_ACCESS_TOKEN`) : **SELECT seulement**. `estSelectSeul()` refuse toute autre forme (DML, DDL, deux ordres séparés par `;`) avant l'envoi, et les requêtes du script y sont éprouvées au chargement. ADR-012 n'est pas contredit : rien n'est écrit depuis la CI.
- **PostgREST** avec la clé **anon** (publique, lue dans `js/app-08-ui-modals-tour.js` par le workflow, jamais recopiée dans un fichier YAML).
- **API GitHub** avec `github.token` (runs, commits, état des workflows) et `SENTINELLE_TOKEN` (uniquement `GET /user`, pour lire sa date d'expiration).
- **`https://passio-app.netlify.app/release.json`** : le commit réellement servi.

Aucune lecture n'échoue en silence : une mesure en panne devient `unknown` avec son code HTTP ; si **toutes** sont en panne, le script sort en code 2 et le workflow ouvre `[VEILLE MUETTE]`.

### Sortie

```
node scripts/veille-production.mjs          # lisible
node scripts/veille-production.mjs --json   # { signaux, alerte, titre, corps, resume }
```

Codes de sortie : `0` rien en alerte, `3` au moins une alerte, autre = panne du lecteur (le workflow échoue, donc se voit).

## `.github/workflows/veille-production.yml`

- `cron: */30 * * * *` (servi toutes les 2 à 5 h en pratique), `workflow_dispatch`, et `pull_request` sur ses propres chemins (verrous unitaires seulement, aucune lecture).
- ≥ 1 `alert` → **une** issue `[VEILLE] N alerte(s) : …`, label `veille`, créée avec `github.token` (elle ne déclenche rien), **jamais `claude`**. Mise à jour (titre + corps) à chaque passage tant que l'alerte dure ; refermée d'elle-même quand tout est `ok`/`warn`.
- Les `warn` seuls n'ouvrent pas d'issue : ils sont dans le résumé du run et repris par le digest.
- Le corps de l'issue commence par **« Ce que tu fais »** : un geste par signal en alerte (le tableau du runbook les reprend).
- `if: failure()` → issue `[VEILLE MUETTE]`, labels `disponibilite` + `veille-muette`, refermée au prochain verdict rendu. Une veille qui ne parle plus ressemble à une production saine : c'est la panne qu'elle existe pour voir, elle ne peut pas se l'autoriser.
- Permissions : `contents: read`, `issues: write`. Aucun secret n'est imprimé ; la clé anon est masquée (`::add-mask::`).

⚠️ Le label `disponibilite` est aussi celui de `disponibilite.yml`, qui referme « la première issue ouverte portant ce label » quand le site répond : une issue `[VEILLE MUETTE]` peut donc être refermée par la sonde du site avec un commentaire hors sujet. Le prochain run muet la rouvre ; l'e-mail de création est déjà parti. À corriger côté `disponibilite.yml` (filtrer par titre `[DISPONIBILITÉ]`) dans un lot qui le touche.

## `scripts/digest.mjs` — ce qui t'attend, ce que les machines ont fait

`composerDigest(donnees, now)` (pure) écrit une issue Markdown en trois parties.

**Ce qui t'attend** — chaque ligne porte le geste et le lien :

1. PR ouvertes, non brouillon, dont un fichier touche le **périmètre critique de `deploy.yml`** (`.github/*`, `migrations/*`, `dashboard/server/{auth,config,repair,sentinel}.js`, `scripts/run_migrations.js`, `scripts/sauvegarde-donnees.js`) sans review de PASSIO74 **sur le SHA de tête** contenant « Contre-revue technique indépendante » → `gh pr review <n> --comment --body "Contre-revue technique indépendante — <ce que tu as vérifié>"`.
2. Issues ouvertes labels `humain`, `recidive`, `moderation`, `disponibilite`, `veille`, ou titre `[SENTINELLE DISTANTE]`.
3. Issues `sentinelle` ouvertes depuis > 6 h sans label humain (enquête perdue ou bloquée).
4. PR `claude/issue-*` ouvertes depuis > 2 h sans fusion.
5. Résidus du registre (`.passio/residus/registre-residus.json`, évalués par `scripts/lib/registre-residus.js` comme `audit-registre-residus.js --json`) dont l'échéance (« échéance », « au plus tard le », « visé avant le ») est à moins de 7 jours ou dépassée.

**Ce que les machines ont fait depuis le dernier digest** : enquêtes sentinelle fermées et PR de réparation fusionnées, runs sauvegarde / disponibilité / veille (succès, échecs), déploiements main.

**Usage** : inscriptions 24 h / 7 j (créées, confirmées), appareils actifs 7 j, erreurs client 24 h — via `mesurerUsage()` de `veille-production.mjs`.

Règle d'émission : issue `[DIGEST] <date> — N à faire` (label `digest`, jamais `claude`) **si N > 0 ou si c'est lundi** ; le digest précédent est refermé. Un jour de semaine sans rien à faire : seulement le résumé du run — aucun e-mail pour dire « rien ».

Les titres de PR et d'issues sont neutralisés (`propre()` : une ligne, bornée, sans balise, bloc de code ni image Markdown) : ce sont des textes de tiers qui finissent dans une issue publique.

## `.github/workflows/digest.yml`

`cron: 30 6 * * *` (08:30 Paris demandé, servi entre 08:30 et ~13 h), `workflow_dispatch`, `pull_request` sur ses chemins. `if: failure()` → `[DIGEST MUET]` (labels `disponibilite` + `digest-muet`), refermée au prochain digest composé.

## Verrous

- `tests/unit/veille-production.test.mjs` : 17 verrous, fixtures tirées des mesures réelles (profil horaire, silence du 09-17, comptages d'inscriptions). 17 mutations éprouvées rouges (seuils, garde de nuit, week-end, `;` dans une requête, mesure en échec…).
- `tests/unit/digest.test.mjs` : 13 verrous, fixtures tirées de l'historique GitHub (#479, #281, #327, #305, RES-13/14). 13 mutations éprouvées rouges (périmètre critique, SHA de tête, brouillon, lundi, horizon des résidus, titre hostile…).
- Les deux sont dans la chaîne `npm run verif` (racine), donc joués par la CI, et par les workflows eux-mêmes sur toute PR qui les touche.

## Ce que ces deux canaux ne font PAS

- Ils n'écrivent rien en base, ne poussent rien, ne fusionnent rien, ne posent jamais le label `claude`.
- Ils ne remplacent pas la sentinelle (erreurs JavaScript → correctif) ni la sonde de disponibilité (site injoignable → `[DISPONIBILITÉ]`).
- La veille ne se surveille pas elle-même : le Centre de pilotage (lot D) lit l'âge de son dernier run.
- Aucun seuil sous 4 h n'a de sens ici : un cron GitHub est servi toutes les 2 à 5 h. Les règles sub-horaires vivent dans le pilotage local.

## Retour arrière

Supprimer les deux workflows retire entièrement ces canaux ; les scripts et leurs tests peuvent rester (aucune dépendance ailleurs, sauf `mesurerUsage` importé par le digest).
