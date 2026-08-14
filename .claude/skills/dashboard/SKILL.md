---
name: dashboard
description: Lance et travaille sur le Centre de pilotage PASSIO (télémétrie temps réel, dashboard/ Node+SPA). À utiliser quand Benjamin veut superviser la beta en direct, bosser sur le dashboard, ou dit "pilotage", "télémétrie", "dashboard", "supervision".
---

# /dashboard — Centre de pilotage PASSIO

App INDÉPENDANTE de supervision temps réel (`dashboard/`, Node/Express + SPA vanilla, thème violet). **Ne fait PAS partie du build/déploiement Passio** (Netlify ignore ce dossier).

## Lancer
```
cd dashboard && npm install
```
Première fois : `cp .env.example .env` puis renseigner `SUPABASE_SERVICE_ROLE_KEY` dans `dashboard/.env` (⚠️ clé service_role = bypass RLS, lecture SEULE côté serveur, jamais committée).
```
cd dashboard && npm start
```
→ http://localhost:4610. Tests backend : `cd dashboard && npm test`.

## Pipeline
`js/telemetry.js` (`<head>`, après platform.js) → table Supabase `telemetry_events` (opt-out, dans la publication realtime, RLS insert-own + aucun select) → backend dashboard (service_role) → flux SSE → SPA.

## Règles de données
- **PII masqué à la source** : `js/telemetry.js` a une liste blanche `meta` + redaction e-mail/JWT/hex, jamais de contenu de message ni base64. **Tout nouveau champ envoyé doit passer par ce filtre.**
- Instrumentation auto : navigation (wrap `goTo`), clics (délégation), fetch (endpoint sans query), erreurs. Marqueurs sémantiques `window.tel && tel.action(...)`.
- `telemetry.js` est un IIFE `"use strict"` : n'expose que `window.PassioTelemetry`/`window.tel` (audit:globals reste vert).

## Git du dashboard
Mutations désactivées en prod, **jamais de push** (push = deploy Passio), branche dédiée + audité. Doc : `dashboard/README.md`, `dashboard/docs/SECURITE.md`, `dashboard/docs/INTEGRATION_CLAUDE_CODE.md`.
