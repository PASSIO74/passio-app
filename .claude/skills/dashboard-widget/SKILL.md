---
name: dashboard-widget
description: "Panneau ou capacité du dashboard (Express, SSE, dbwatch). Dire : ajoute un panneau, widget, alerte."
---

# /dashboard-widget — Nouveau panneau du centre de pilotage

Le dashboard (`dashboard/`) est une app INDÉPENDANTE (Node/Express + SPA vanilla, thème violet), qui ne fait PAS partie du build Passio. Architecture modulaire côté serveur.

## Anatomie
- **Serveur** : `dashboard/server/index.js` (Express) + modules par domaine (`accounts`, `alerts`, `audit`, `checklist`, `dbwatch`, `git`, `ingest`, `sessions`, `signups`, `store`, `tests`, `testusers`…). Données JSON dans `dashboard/data/*.json` via `jsondb.js`. Flux temps réel via `sse.js`.
- **Client** : `dashboard/public/index.html` (SPA vanilla, un seul fichier), thème violet cohérent avec Passio.
- **Lecture Supabase** : clé **service_role** (`dashboard/.env`, RLS bypassée, lecture SEULE). `dbwatch.js`/`ingest.js` surveillent les tables.

## Ajouter une CAPACITÉ (surveillance, alerte, ingestion) — pas seulement un affichage
1. Nouveau module `dashboard/server/<nom>.js`, logique isolée, exporté et branché dans `index.js`.
2. Surveillance temps réel → s'appuyer sur `dbwatch.js` / `ingest.js` (poll ou realtime Supabase, service_role, lecture seule) puis émettre via `sse.js`.
3. Alerte → écrire dans `dashboard/data/alerts.json` via `jsondb.js`, et pousser au client.
4. Test obligatoire : `dashboard/test/<nom>.test.js`.
⚠️ `claude.js` / `claudecli.js` portent l'intégration Claude Code : sa sandbox est une liste **BLANCHE** `--tools`, jamais une liste noire (une liste noire laissait passer `PowerShell` et tout le MCP Supabase, `execute_sql` compris), et `--tools ""` ouvre la liste COMPLÈTE au lieu de la vider. `git.js` : opérations désactivées en prod, **jamais de push** (un push déploie Passio).

## Ajouter un widget
1. **Côté serveur** : nouveau module `dashboard/server/<nom>.js` (ou étendre un existant) exposant une route (ex. `GET /api/<nom>`) qui lit Supabase en service_role ou un JSON local. Pousser les mises à jour temps réel via `sse.js` si la donnée bouge.
2. **Côté client** : ajouter le panneau dans `dashboard/public/index.html` — thème violet, `var(--...)` cohérentes, s'abonner au flux SSE, rendu vanilla (pas de framework). Pour un graphe, inline SVG (pas de CDN — cohérent avec la philosophie Passio).
3. **Tests** : `dashboard/test/*.test.js` (`cd dashboard && npm test`, 10 verts). Ajouter un test du nouveau module serveur.

## Règles
- **Lecture seule** sur la prod. Aucune mutation git en prod, jamais de push depuis le dashboard.
- Ne pas exposer de PII ni la clé service_role côté client (tout passe par le backend).
- Doc : `dashboard/README.md`, `dashboard/docs/SECURITE.md`.

## Vérifier
`cd dashboard && npm start` → http://localhost:4610, vérifier le panneau + le flux SSE (skill `/preview` avec `{url}`).
