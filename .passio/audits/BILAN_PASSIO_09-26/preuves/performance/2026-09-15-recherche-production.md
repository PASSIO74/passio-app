# PERF-01 — `rechercher_passions` en production, avant / après la migration du 15/09

Mesure de bout en bout (`POST /rest/v1/rpc/rechercher_passions`, clé anon, projet `njkiyoklssvefstljemx`),
10 mots (« rand », « ski », « musi », « cuisine », « photo », « yoga », « jeux », « vélo », « peint », « danse »),
10 appels séquentiels puis 20 en parallèle. Script : `mesure-recherche.mjs` (scratch, reproduit dans `docs/CAPACITE_2026-09-14.md`).

| | séquentiel p50 | p95 | parallèle ×20 p50 | p95 | max | résultats |
|---|---|---|---|---|---|---|
| avant (10:4x UTC) | 247 ms | 291 ms | 951 ms | 1 372 ms | 1 389 ms | 20 / mot |
| après (10:5x UTC) | **74 ms** | 103 ms | **193 ms** | **227 ms** | 262 ms | 20 / mot |

En base après application (API de gestion) : `recherche` non nulle sur 100 % des lignes, index `passions_recherche_trgm` +
`passions_normalized_trgm`, trigger `trg_passions_recherche`, `search_path=public, extensions, pg_temp`,
`EXPLAIN ANALYZE select * from rechercher_passions('rand', 20)` : 9,5 ms.
