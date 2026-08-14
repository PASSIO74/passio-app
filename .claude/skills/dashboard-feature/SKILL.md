---
name: dashboard-feature
description: Développe une nouvelle fonctionnalité serveur du centre de pilotage PASSIO (route API, surveillance de table, alerte, intégration) au-delà d'un simple panneau. À utiliser quand Benjamin veut une capacité backend du dashboard (alertes auto, surveillance, ingestion, action Claude), ou dit "le dashboard doit faire X", "surveille automatiquement", "alerte quand".
---

# /dashboard-feature — Fonctionnalité serveur du pilotage

Pour ajouter une **capacité** au dashboard (pas juste un affichage → skill `/dashboard-widget`).

## Modules serveur existants (dashboard/server/)
- `index.js` (Express, routes) · `sse.js` (temps réel) · `store.js`/`jsondb.js` (persistance JSON) · `auth.js` (accès)
- `dbwatch.js` / `ingest.js` : surveillance & ingestion des tables Supabase (service_role, lecture seule)
- `alerts.js` : alertes · `audit.js` · `checklist.js` · `tests.js`/`testusers.js` : orchestration de tests · `signups.js`/`accounts.js` : suivi comptes
- `git.js` : opérations git **désactivées en prod, jamais de push** (push = deploy Passio) · `claude.js`/`claudecli.js` : intégration Claude Code

## Ajouter une capacité
1. Nouveau module `dashboard/server/<nom>.js` : logique isolée, exporté et branché dans `index.js`.
2. Si surveillance temps réel : s'appuyer sur `dbwatch.js` (poll/realtime Supabase) → émettre via `sse.js`.
3. Si alerte : écrire dans `dashboard/data/alerts.json` via `jsondb.js`, pousser au client.
4. **Tests** obligatoires : `dashboard/test/<nom>.test.js` (`cd dashboard && npm test`).

## Règles de sûreté (dashboard/docs/SECURITE.md)
- Prod = **lecture seule** (service_role côté serveur uniquement, jamais exposée au client).
- Aucune mutation git en prod, branche dédiée + audit pour toute modif du dépôt, jamais de push automatique.
- PII : ne jamais logger/exposer de contenu utilisateur ; respecter le filtre de `js/telemetry.js`.
- Toute action « Claude Code » déclenchée depuis le dashboard doit être auditée et confirmée.

## Vérifier
`cd dashboard && npm test` (vert) puis `npm start` → :4610, exercer la capacité et vérifier le comportement + SSE.
