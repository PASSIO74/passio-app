---
name: telemetry-event
description: "Ajoute un événement de télémétrie (filtre PII) remonté au pilotage. Dire : mesure cette action, track, instrumente."
---

# /telemetry-event — Nouvel événement de télémétrie PASSIO

Pipeline : `js/telemetry.js` (`<head>`) → table `telemetry_events` → backend dashboard (service_role) → SSE → SPA. Tout nouvel événement doit passer le **filtre PII**.

## Ajouter un marqueur sémantique
Au bon endroit dans `js/app-*.js`, après l'action réussie :
```js
window.tel && tel.action("<nom_action>", { <champs_minimisés> });
```
Exemples existants : `like_post {postId}`, `comment_post {postId, len}`, `event_join {eventId}`, `publish_reel {passion}`, `send_message {kind, hasFile}`.

## ⚠️ Règles PII (non négociable)
- `js/telemetry.js` filtre `meta` par **liste blanche** + scrubber (redaction e-mail/JWT/hex). **Jamais** de contenu de message, de pseudo en clair, de base64, d'URL avec query.
- Envoyer des **identifiants et des mesures**, pas du contenu : `{postId, len}` OK ; `{text}` INTERDIT.
- `telemetry.js` est un IIFE `"use strict"` qui n'expose que `window.PassioTelemetry`/`window.tel` → `audit:globals` reste vert. Ne pas ajouter de global top-level.
- Types disponibles : `nav`, `click`, `api`, `perf`, `action`, `heartbeat` (échantillonnage par type dans `SAMPLE`).

## Types automatiques (déjà instrumentés)
Navigation (wrap `goTo`), clics (délégation), fetch (endpoint sans query), erreurs, perf. N'ajouter un `tel.action` que pour un **événement métier** non couvert.

## Vérifier
1. `npm run audit:globals` (vert).
2. Dans le preview, déclencher l'action → vérifier l'insert dans `telemetry_events` (aucun PII) :
   ```
   supabase db query --linked "SELECT type, action, meta FROM telemetry_events ORDER BY created_at DESC LIMIT 10"
   ```
3. Vérifier que le dashboard le reçoit (skill `/pilot-report`) et l'exploiter dans un KPI si pertinent.

## Après
Documenter le nouveau champ dans le commentaire de tête de `js/telemetry.js` (liste blanche).
