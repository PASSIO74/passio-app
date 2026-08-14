---
name: perf
description: Audite et améliore la performance/rapidité de PASSIO (taille des bundles, jank de rendu, pollings, requêtes Supabase, images). À utiliser quand Benjamin veut accélérer l'app, réduire le poids, corriger un lag, ou dit "perf", "c'est lent", "optimise la vitesse", "ça rame".
---

# /perf — Audit & optimisation performance PASSIO

## Cibles connues (déjà optimisées — vérifier qu'on ne régresse pas)
- **Bundles prod** : `dist/index.html` ~134 Ko, `dist/app.js` + `dist/styles.css` externalisés (hash de contenu, immutables). Vérifier après build : `node scripts/build.js dist/index.html` puis tailles.
- **`saveState()` débouncé 250 ms** — ne pas réintroduire un `JSON.stringify` synchrone dans une boucle chaude. ⚠️ Avant un `removeItem(STATE_KEY)`, appeler `discardPendingStateSave()`.
- **Guards no-op de rendu** : `_feedDomSig` (renderFeed), `_lastHtml` (renderStories/renderProfileStrip), `_feedPostsSig`. Un render direct dans `#feedList` sans invalider = bug, mais SUPPRIMER un guard = jank de retour.
- **Pollings suspendus si `document.hidden`** (fil 60 s, live CDV 5 s, outbox 15 s, SW 60 s).
- **UN canal realtime `realtime:db`** pour tous les postgres_changes (pas 9 canaux).
- **Images downscalées avant upload** (`_downscaleImageForUpload`, max 1600px).
- **IRL** : init MapLibre débouncée (`_scheduleIrlMapUpdate`), liste paginée (`IRL_PAGE_SIZE`).

## Méthode d'audit
1. Mesurer avant : tailles `dist/`, et dans le preview → `preview_logs`, `read_network_requests` (poids/nombre de requêtes), timing.
2. Chercher les régressions : `JSON.stringify` synchrones répétés, re-render complet sur une micro-interaction (cf. « ne pas rebuild tout le fil »), boucles qui décodent des images, requêtes Supabase N+1 (préférer `.in(...)`).
3. Vérifier les index prod si une requête est lente :
   ```
   supabase db query --linked "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='<t>'"
   ```
4. Implémenter, rebuild, re-mesurer, prouver le gain chiffré.

## Ne pas faire
- Ne pas externaliser le seed démo (dépendance synchrone de l'init — rejeté sciemment).
- Ne pas ajouter de framework/bundler (l'app est vanilla par choix).
