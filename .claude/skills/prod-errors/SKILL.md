---
name: prod-errors
description: Lit et synthétise l'état de santé de la prod PASSIO — erreurs client (client_errors), signalements de modération (reports), comptes de test à purger. À utiliser pour un point santé, une revue matinale, ou quand Benjamin dit "y a des erreurs en prod ?", "check la prod", "modération".
---

# /prod-errors — Santé prod PASSIO

## Erreurs client
```
supabase db query --linked "SELECT created_at, message, url, count(*) OVER (PARTITION BY message) AS occurrences FROM client_errors ORDER BY created_at DESC LIMIT 50"
```
⚠️ Rappel : les exceptions **catchées** (ex. `catch(e){return []}`) n'arrivent PAS ici. Une table vide ne prouve pas l'absence de bug (cf. diagLog / fil vide 6 j). Le monitoring vient de `js/platform.js` (nécessite `window.supa` défini).

## Modération
```
supabase db query --linked "SELECT created_at, kind, target_id, reason FROM reports ORDER BY created_at DESC LIMIT 30"
```
Tables `blocks` / `reports` (RLS : reports lecture admin only).

## Comptes de test à purger
```
supabase db query --linked "SELECT count(*) FROM auth.users WHERE email LIKE '%@passio-e2e.test'"
```
Purge (supprimer d'abord conv_members/conv_messages/profiles à cause des FK) :
```
supabase db query --linked "DELETE FROM auth.users WHERE email LIKE '%@passio-e2e.test'"
```

## Télémétrie (centre de pilotage)
Table `telemetry_events` (opt-out, PII masqué). Dashboard : `cd dashboard && npm start` → http://localhost:4610 (clé service_role dans `dashboard/.env`).

## Rapport
Top erreurs par occurrence + tendance, signalements en attente, nb de comptes de test. Proposer les correctifs prioritaires, pas juste lister.
