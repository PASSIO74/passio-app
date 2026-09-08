# Journaux du run CI 33861671142 (« CI & Deploy » n° 2494, SHA c8cb8e99) — lus le 2026-09-08

Source : outil GitHub `get_job_logs` (return_content, tail 30 à 400 lignes par job), depuis la session de complément. Le rapport 13 avait laissé TCI-C04 BLOQUÉ (403 proxy) : débloqué ici.

| Job | Id | Résultat lu dans le journal |
|---|---|---|
| Suites navigateur 1/6 | 100987968030 | 190 passed (5.1m) — aucune reprise (aucun `×`) |
| Suites navigateur 2/6 | 100987967912 | 179 passed (6.3m) — aucune reprise |
| Suites navigateur 3/6 | 100987968023 | 199 passed, **1 flaky** (`tests/e2e/monitoring-file-boot.spec.js:49` « une erreur levée AVANT le vrai client est mise en file, puis remontée », réussi à la reprise), 2 skipped (6.9m) |
| Suites navigateur 4/6 | 100987967930 | 168 passed (5.5m) |
| Suites navigateur 5/6 | 100987967753 | 183 passed, 4 skipped (6.6m) |
| Suites navigateur 6/6 | 100987968020 | 177 passed (6.9m) |
| **Total navigateur** | | **1 096 passés, 1 instable (repris), 6 ignorés, 0 échec** |
| Audits statiques et bancs serveur | 100987967835 | 9 audits statiques verts ; banc T&S serveur vert ; migration référentiel vert ; dashboard : 349 tests, 344 pass, 5 skipped, 0 fail |
| **Suites production (comptes réels)** | 100987968096 | `npx playwright test --project=prod` : **15 tests, 3 passed, 12 skipped** (17,7 s). Passés : authz-critical (bloc complet : usurpation 403, cross-compte 0 ligne, notifications/messages/télémétrie d'autrui invisibles, client anonyme sans donnée privée, storage cloisonné), blocage-acces (1 cas), + 1. Purge : `[purge:rest] 5 compte(s) de test … 2 ligne(s) supprimées · comptes restants : 0` ; **`[purge:storage] clés Supabase absentes — ignoré.`** Puis étape « Mesure passion_id » : `Référentiel passions : 1000 identifiant(s).` puis **`MESURE PASSIONS — échec : fetch failed`** — et l'étape est VERTE (le script ne rend pas de code d'erreur). |
| Déploiement production | 100991636758 | build dist, minification (index 7 min, app.js 5 min, css 5 min), `Deploy to Netlify` vert 10:44:08 UTC |

## Ce que ces journaux changent

1. **TCI-C04 (flakiness)** : PROUVÉ — 1 test instable sur 1 103 dans ce run (monitoring-file-boot.spec.js:49), repris avec succès ; les durées longues des shards 2 et 6 viennent de l'installation Playwright (7 min) et non de reprises.
2. **TCI-01 confirmé et précisé** : le job « Suites production » vert ne prouve que **3 tests sur 15** ; les 12 autres (multi-comptes, confidentialité, suppression de compte, user-state-horodatage…) sont `skipped` faute de `PASSIO_E2E_MULTI`. Le vert de ce job vaut pour authz-critical et blocage-acces, rien d'autre.
3. **Nouveau (CPL-TCI-A)** : `scripts/mesure-passions.js` échoue (`fetch failed`) et le job reste vert — échec silencieux d'une étape de CI. Et il lit « 1000 identifiants » : la mesure elle-même est tronquée par `max-rows` (confirme PRO-01 sur le chemin service_role, pas seulement anon).
4. **Nouveau (CPL-TCI-B)** : la purge Storage des comptes e2e est ignorée en CI (« clés Supabase absentes ») : chaque run laisse ses objets Storage en production (rejoint SUP-10 / AUTH-05, résidus).
