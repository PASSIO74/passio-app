---
name: diag
description: "Bug de bout en bout : client_errors, repro dans le preview, cause racine. Dire : debug, plante, s'affiche pas."
---

# /diag — Diagnostic de bug PASSIO

## 1. Récolter les indices
- **Erreurs prod loggées** :
  ```
  execute_sql  (connecteur supabase-passio-readonly)
  SELECT created_at, message, stack, url FROM client_errors ORDER BY created_at DESC LIMIT 30
  ```
  ⚠️ Rappel : un `catch(e){ return []; }` large **n'apparaît PAS** dans client_errors (exceptions avalées) — cf. bug diagLog (fil vide 6 j). Si un chemin critique renvoie vide sans erreur, suspecter un catch large.
- **Signalements utilisateurs** (modération) : table `reports`.
- Activer le debug client : `localStorage.PASSIO_DEBUG="1"` → `diagLog` (app-08) écrit en console.

## 2. Reproduire dans le preview
- `preview_start {name}` (cf. `.claude/launch.json`), déverrouiller le gate (code `2125`), naviguer vers l'écran.
- `read_console_messages` / `read_network_requests` pour les erreurs JS et les 400/500 Supabase.
- Reproduire le geste avec `computer`/`form_input`, relire l'état avec `read_page`.

## 3. Isoler la cause
Passer les suspects classiques (détail dans `docs/PIEGES_CONNUS.md`) :
- Post introuvable → `findPostAnywhere` oublié quelque part.
- « Invalid Date »/NaN → `new Date(x+"Z")` au lieu de `supaTs`.
- Bouton cassé sur un pseudo à apostrophe → `escapeJsArg` manquant.
- Fonction écrasée en silence → collision de globals (`npm run audit:globals`).
- 0 résultat / 400 Supabase → embed `profiles(...)` sans FK, ou RLS, ou colonne absente (`information_schema`).
- Mutation sans effet → UPDATE/DELETE qui touche 0 ligne (policy RLS manquante).
- Handler onclick inexistant → `npm run audit:handlers`.

## 4. Corriger et prouver
Corriger la **cause racine** (pas le symptôme), re-vérifier dans le preview (console propre + geste OK), et si c'est du cross-compte/RLS/realtime → valider avec `/e2e-multi`. Rapporter : cause racine, correctif, preuve.
