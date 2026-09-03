---
name: preview
description: Serveur de dev et vérification dans le navigateur : console, réseau, screenshot, gate 2125. Dire : montre-moi, ça marche.
---

# /preview — Vérification navigateur PASSIO

## Démarrer
- `preview_start {name}` (config dans `.claude/launch.json` ; sinon `npm run serve` → http://localhost:8080). Ne JAMAIS lancer le serveur via Bash.
- **Déverrouiller le gate** : l'app est protégée par code `2125` (saisir dans l'écran d'accès), ou le helper `tests/e2e/gate-helper.js` pose le jeton `sessionStorage["passio_gate_v1"]`.

## Vérifier
1. `read_console_messages` — 0 erreur JS attendue (attention : `state` est un binding de script, PAS `window.state` → dans `javascript_tool` tester `typeof state`).
2. `read_network_requests` — pas de 400/500 Supabase.
3. `read_page` — contenu et structure (renvoie des refs pour cliquer).
4. Reproduire le geste : `computer`/`form_input`, puis re-`read_page` pour confirmer.
5. `resize_window` mobile **375px** (l'app est mobile-first) + vérifier le cadrage bas (barre d'onglets non masquée — piège `--app-vh`).

## Prouver
`computer {action:"screenshot"}` pour un changement visuel, `read_network_requests` pour une modif API. Partager la preuve directement, ne jamais demander à Benjamin de vérifier à la main.

## Note
Le vrai client Supabase ne s'active qu'après le gate (`ensureSupabase()` + `_initRealSupa()`). Les appels WebRTC/live vidéo exigent 2 onglets/appareils réels + la CSP prod (STUN) — non testables en solo local.
