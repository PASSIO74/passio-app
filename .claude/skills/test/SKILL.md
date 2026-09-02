---
name: test
description: "Suite Playwright complète + audits globals et handlers. Dire : lance les tests, vérifie que rien n'est cassé."
---

# /test — Suite de tests PASSIO

## Lancer (dans l'ordre, tout doit être vert)
```
npm run verif        # les 7 gates statiques de la CI, ~2 s
npm run test:all     # la suite Playwright complète
```
- `verif` : les SEPT gates statiques que la CI exige, en ~2 s — collisions de globals (17 scripts partagent `window`), onclick fantômes, échappement contextuel, tests creux, stub Supabase hors ligne, clés de télémétrie contre le filtre PII, miroirs du référentiel des passions. **Toujours les lancer AVANT Playwright** : un rouge ici se trouve en 2 s au lieu d'un cycle CI de ~30 min.
- `test:local` / `test:prod` : la suite sans écriture en base (897 tests) ou les 7 suites à comptes réels.
- `test:all` : suite Playwright complète (smoke, access-gate, cadrage, feed-ranking, irl, cdv, dist-build…).

Première fois : `npx playwright install chromium`.

## Suites notables
- `tests/e2e/dist-build.spec.js` — rebuild + 3 chemins (verrouillé sans JS app / saisie code / jeton → boot). Protège l'architecture d'externalisation.
- `tests/e2e/cadrage.spec.js` — le shell n'est jamais masqué par la barre système.
- `tests/e2e/irl.spec.js` (22), `tests/e2e/cdv.spec.js` (48), `tests/e2e/feed-ranking.spec.js` (5).

## Multi-comptes (opt-in, base réelle)
Non lancés par `test:all`. Voir la skill `/e2e-multi` : `PASSIO_E2E_MULTI=1 npm test`. Seuls tests capables de valider les policies RLS et le realtime cross-compte.

## Rapport
Nombre de tests verts/rouges. Si rouge : nom du test + cause racine (pas juste la stack). Ne jamais contourner un test qui échoue — corriger la cause.
