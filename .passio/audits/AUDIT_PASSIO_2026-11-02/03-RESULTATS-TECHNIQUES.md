# Résultats techniques — audit PASSIO 2026-11-02

## 1. Environnement d'exécution (ce qu'il permettait, ce qu'il interdisait)

- Bac à sable Linux, 2 CPU, Node 22, PostgreSQL 16 (binaires serveur), Google Chrome 148 stable (téléchargement du
  Chromium Playwright **bloqué** → `PASSIO_CHROMIUM=/usr/bin/google-chrome`, variable prévue par le dépôt).
- Réseau sortant : GitHub (`gh`) et registres npm. **Supabase REST/Edge/Realtime, Netlify, CDN : injoignables**
  (403 du proxy). Base de production lisible **uniquement** par le connecteur read-only (canal ① d'ADR-012) ;
  `SET LOCAL role` refusé au rôle de lecture (42501) → évaluation RLS par les prédicats, le faux serveur et la CI.
- Aucune écriture en production, aucun compte réel contacté, aucune donnée personnelle dans les livrables.
- Poste de Benjamin relié à la session (Windows, aucun dossier attaché) : non utilisé pour l'exécution.

## 2. Référence de départ (main `6ea94e1`)

| Contrôle | Commande | Résultat |
|---|---|---|
| Gates statiques | `npm run verif` | **vert**, exit 0, 11 s (37 suites unitaires `# fail 0`) |
| Suite locale complète | `npx playwright test --project=local` (1 worker, Chrome 148) | **2 061 tests : 2 014 verts, 27 sautés, 20 rouges, 0 instable**, 127 min |
| Rejeu des 20 rouges sur `main` INTACT (worktree séparé) | 11 fichiers de specs | **20 rouges identiques, 123 verts** — préexistants ; la CI du même code (Chromium épinglé) les passe → écart d'environnement (`preuves/suite-locale-*`) |
| Advisors Supabase | `get_advisors` security / performance | sécurité : 8 INFO (RLS sans policy = tables service_role), 1 WARN `pg_trgm` dans `public`, 29 fonctions SECURITY DEFINER exécutables (toutes lues : délibérées, 2 oracles C-02/C-10) ; performance : 2 initplan `realtime.messages`, 12 index inutilisés, 1 doublon |
| Journaux Supabase 24 h | `query_logs` | fonction `pilotage` : 605 appels, 1 seul 401 ; aucun 5xx en série |
| CI de `main` | run 41452850152 (PR #679) | vert, déployé |

Les 20 rouges préexistants (liste exacte dans `preuves/`) : `admission-18-plus` (1), `cgu-consentement` ⑩,
`creation-passion` ⑭, `navigation` tour des 6 écrans, `pilotage-nuage` ① (corrigé par H : `require()`),
`profil-entete-passions` ×3, `profil-visite-options` ×5 (limite d'environnement documentée dans
`docs/journal/social-messagerie.md`), `ui-v2-shell` ×2, `ui-v4a5-filtres` ×3, `ui-v7-parcours` ②, `ui-v7-bobine-camera`.

## 3. Ce qui a été exécuté par les agents (preuves dans `rapports/` et `preuves/`)

| Agent | Exécutions | Résultat |
|---|---|---|
| B backend | 13 fichiers unitaires du périmètre ; `node --experimental-strip-types --check` ×5 Edge ; `npm audit` racine + dashboard + manifeste des versions vendorées ; reproduction B-01 (shim + faux moteur) | **170/170** ; racine 0 avis ; dashboard 3 (1 critical `proxy-addr`) ; maplibre 4.7.1 **GHSA-jrc7-96c5-q579** ; `apercu-liens` **18/18** (+3, mutations rouges) |
| C données/sécurité | inventaire catalogue (policies, GRANTs table+colonne, 29 fonctions avec corps, triggers, buckets, publication) ; intégrité par agrégats ; `bash scripts/bancs-sql-restants.sh` + bancs nommés ; migration neuve + banc | **42/42** bancs existants (28 + 14) ; banc neuf **38/38** (2 mutations rouges) ; 0 secret non-anon dans le dépôt |
| D frontend | 37 captures 390×844 ; relevés a11y (cibles, 16 px, noms, contrastes CDP, focus, Échap) ; états dégradés (500, 8 s, coupure, désordre) sur 6 gestes ; doubles clics ×6 ; XSS ~20 surfaces × 6 charges ; fluidité CDP ×4 | 6 specs neufs **38/38** (9 prouvés rouges sur HEAD restauré) ; voisins 15/15, 168/168, 68/68, 57/58 (1 instable réseau du banc) ; 0 débordement, 0 image sans alt, 0 fuite (16,6 Mo plateau), 0 longtask/200 posts |
| E parcours | faux serveur PostgREST partagé (policies recopiées, triggers capacité/suivi/prétri rejoués) ; 10 parcours multi-comptes ; cas ajoutés aux suites `prod` | **10/10** ; prod (agrégats) : 14 comptes, 0 banni, 0 bloc, 0 liste d'attente, 0 masqué, 2 signalements sans motif |
| F performance | `node scripts/build.js` + mesures brotli ; CWV CDP ×4 Slow 4G / 3G ×5 ; `pg_stat_statements` 173 j ; 7 `EXPLAIN (ANALYZE, BUFFERS)` ; dérives 500 messages + 20 vocaux sous quota simulé ; bancs des scripts de charge | `charge-verdict` **12/12**, `charge-gardes` **5/5**, `perf-derives` **3/3**, `perf-dist` **5/5** (dist) ; voisins `version-skew`+`dist-build` 10/10 |
| G Sentinelle | lecture des 15 workflows ; `gh run list` ×9 crons sur 7 j ; issues par label ; banc d'injection (a–f) ; restauration synthétique PG16 ; tests du périmètre | **189/189** unitaires ; crons : 100 % réussite, servis 3–17 % des créneaux (écart max 7,6 h) ; sauvegarde quotidienne verte (dimanche complète : 45 tables, schéma) ; rollback jamais exercé sur 30 j |
| H pilotage | recalcul SQL indépendant de chaque indicateur ; lecture `pilotage/index.ts` ; tests | unitaires **103/103** + `telemetrie-pii` **9/9** ; `pilotage-nuage` **22/22**, `telemetrie-*` **48/48** ; dashboard **604/604** (5 sautés) ; 0 écart sur les agrégats ; journaux Edge : 605 appels / 1 401 |
| Coordination | B-01, F-03, B-02/E-01, F-01, G-02, E-05 ; chaîne `verif` élargie | `xss-marqueur` 1/1 (rouge sur `main`), `messagerie-pagination` 2/2 (rouge sur `main`), `promotion-attente` 3/3, parcours E b/f verts, banc promotion **43/43** (3 rouges par mutation), `sentinelle-detecter` **63/63** (1 rouge par mutation), IRL **120/120**, messagerie **119/119**, carte/IRL 80/85 (5 préexistants), dist 5/5 ; `npm run verif` vert à chaque commit |
| Revue indépendante | gates + bancs rejoués, 13 cas sondés sur `repair.js`, worktree `origin/main` de comparaison | 1 bloquant trouvé et corrigé (`irl.spec.js:364`), 1 risque corrigé (squat `n_pa_`), 5 suites à faire |

## 4. Intégration continue sur la branche (PR #681)

| Run | SHA | Résultat |
|---|---|---|
| 41510167652 | `98a5459` (état des 5 premiers agents) | smoke ✓ · **suites production (comptes réels, cible staging) ✓** · 6 shards navigateur ✓ · WebKit iPhone ✓ · gates `dist` ✓ · audits statiques et bancs serveur ✓ · **Gouvernance critique ✗ par conception** (périmètre critique : revue GitHub de PASSIO74 sur le SHA de tête exigée) |
| 41546466427 | `ddaec2a` (+ E, F, coordination) | audits statiques et bancs serveur ✓ (dont les 3 bancs neufs) · gates `dist` ✓ · **suites production ✗** : 17 verts, 3 sautés, 1 « expected to fail, but passed » — le cas C-01 d'E marqué `test.fail` : la **cible de la CI est le staging (`fcksxofaelcdmmifnwjo`)**, qui refuse déjà l'accusé d'un tiers (403 42501) alors que la production porte `reads_upsert` sans appartenance → **divergence staging/production** consignée ; autres jobs en cours à la clôture |
| 41547358557 | `aa07330` (cas C-01 devenu verrou ordinaire) | suites production ✓ · WebKit ✓ · dist ✓ · audits ✓ · shards 3/4 ✓ · **shard 1 ✗** : cas c1 d'E (ordre de 20 messages envoyés dans la même milliseconde — effet du tri `created_at, id` de F-03 : corrigé par une fraction de microseconde sur `at` + horodatage serveur µs dans le faux serveur) · **shard 2 ✗** : `compte-suspendu.spec.js` ① — **instable sur `main` aussi** (run 41324907631 du 01/11, relevé par G ; sans rapport avec le diff) · Gouvernance critique ✗ par conception |
| run suivant | `8f14c54`+ (c3 déterministe, livrables, tri µs) | en file à la clôture (groupe de concurrence) ; **vérifier dans Actions** |

À noter : sur une PR, les suites « production » tournent contre le **staging** ; seule `authz-critical` tourne contre
la production, au `push` sur `main` (barrière de déploiement). Les cas B-02 (`multi-comptes`) ne tournent que sous
`PASSIO_E2E_MULTI=1` : à lancer après application de la migration.

## 5. Mesures (chiffres, conditions)

**Artefact servi (brotli)** : `index` 100 + `app.js` 361 + `styles` 39 + `supabase-js` 52 = **552 Ko avant le fil**
(+52 % vs 04/09 : 364 Ko), MapLibre 205 Ko **retiré du démarrage** par F-01 (était chargé à tout démarrage).
**CWV (stub local, artefact prod, CPU ×4, 5 répétitions)** : premier écran ≈ 1 s ; LCP **3,9 s** (4G lent 1,6 Mb/s,
150 ms) / **12,6 s** (3G lent 400 kb/s, 400 ms) ; CLS **0,32** visiteur / 0,12 compte ; TBT ≈ 220 ms.
**Dérives** : 0 fuite de minuteurs/écouteurs/canaux sur 4 tours ; IndexedDB garde 500 messages + 20 vocaux base64
sous quota localStorage simulé. Un compte connecté : 1 socket, 1 canal `realtime:db`, 12 liaisons ; visiteur : 0.
**Base (`pg_stat_statements`, 173 j, 37,1 M appels)** : décodage WAL Realtime = **66 % du CPU** ; référentiel des
passions 3ᵉ requête (6 requêtes/démarrage, 5,7 % du CPU) ; pilotage `telemetry_events` 54,6 ms de moyenne sans bon
index ; 7 `EXPLAIN ANALYZE` sains à la taille actuelle (13 profils, 37 posts, 88 messages, 13 776 lignes de télémétrie).
**Télémétrie** : `received_at` serveur, âge max 2,8 j (rétention 3 j), 0 PII sur l'échantillon lu.
**Capacité (bancs de septembre, staging, PARTIELLEMENT PÉRIMÉS, rien au-delà de 100 comptes)** : ~400 req/s de
lecture sur Micro ; 100 comptes écrivant 90 s : p50/p95 75/134 ms, 0 erreur ; mur dur **Realtime 500 connexions**
(forfait Pro + spend cap) ; **estimation** (dite telle) : ~5 000 actifs/jour tenus sans changement, premier goulot
Realtime, second egress Netlify au rythme des déploiements.

## 6. Commandes utiles pour rejouer

```
npm run verif                                   # gates statiques (3 bancs ajoutés)
PASSIO_CHROMIUM=/usr/bin/google-chrome PASSIO_PORT=8108 npx playwright test --project=local --workers=1 tests/e2e/audit-2026-11-*.spec.js
bash tests/sql/migration-promotion-attente.test.sh
bash tests/sql/migration-audit-2026-11-02-oracles-et-privileges.test.sh
PASSIO_CIBLE=dist PASSIO_CHROMIUM=/usr/bin/google-chrome PASSIO_PORT=8110 npx playwright test --project=local --workers=1 tests/e2e/audit-2026-11-perf-dist.spec.js
cd dashboard && npm test
```
