---
name: test
description: "Suite Playwright complète + audits globals et handlers. Dire : lance les tests, vérifie que rien n'est cassé."
---

# /test — Suite de tests PASSIO

## Lancer (dans l'ordre, tout doit être vert)
```
npm run audit:globals
npm run audit:handlers
npm run test:all
```
- `audit:globals` : collisions de globals (17 scripts partagent window) — aussi dans le CI, AVANT Playwright.
- `audit:handlers` : onclick référençant des fonctions fantômes.
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
