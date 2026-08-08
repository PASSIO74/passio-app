# Audit de performance — PASSIO

> Daté du **2026-08-08**. Synthèse ; rapports détaillés : `../../docs/lighthouse-*.json`, `../../docs/lighthouse-prod.report.html`. Triggers de scale : `../../docs/SCALE_RUNBOOK.md`.

## Optimisations déjà en place (2026-07-15)
- **CSS externalisé** : HTML 364 → 134 Ko.
- **`saveState` débouncé** (piège : `discardPendingStateSave`).
- **Canal realtime unique** (`realtime:db`).
- **Downscale des images** à l'upload.
- **Index prod vérifiés** complets (`migration_indexes_et_monitoring.sql`, `migration_scale_indexes_2.sql`).
- Conversations en **IndexedDB** (write-through) au lieu de gonfler localStorage.

## Hotspots structurels
| Hotspot | Impact | Prio | Trigger |
|---|---|---|---|
| Taille des `app-*.js` (parse JS ; `app-07` 274 Ko, `app-03` 257 Ko, `app-04` 250 Ko) | Temps de parse au boot | P2/P3 | Découpage progressif ; bundler seulement si parse mesuré trop lourd (ADR-001). |
| `styles.css` monolithique (~301 Ko) | Parse CSS | P3 | Si perf CSS devient hotspot mesuré. |
| Feed à grand volume | Classement `rankFeedPosts` côté client | — | Ranking serveur si > ~50k posts actifs (SCALE_RUNBOOK). |
| Fan-out notifications | Coût à grande échelle | — | Table de fan-out / job si > ~100k users. |

## Ce qui n'est PAS mesuré ici
- Perf CPU/mémoire des appareils clients (API navigateur limitées — non remontée par la télémétrie).
- Charge serveur (pas de test de charge ; relève des triggers de scale).

## Méthode de suivi
Lighthouse mobile périodique (rapports datés dans `docs/`), latence API RÉELLE via le dashboard (`store.apiPerf()`, cf. `../METRICS_REGISTRY.md`). Ne pas optimiser sans mesure préalable (anti sur-ingénierie).
