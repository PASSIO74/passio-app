# Architecture du code PASSIO

## Structure (depuis le découpage du 2026-06-10)

- `index.html` — squelette HTML (~1 500 lignes), référence les fichiers ci-dessous
- `styles.css` — tout le CSS (~6 300 lignes)
- `js/platform.js` — détection plateforme, flag debug, monitoring d'erreurs
- `js/pwa-detect.js` — détection installation PWA
- `js/leaflet-loader.js` — chargement de Leaflet à la demande
- `js/app-01-diag-seed.js` → `js/app-09-boot-pwa.js` — logique applicative
  (diag, état, posts, commentaires, config, reels, IA/IRL, UI/modales, boot)
- `js/pwa-landing.js`, `js/emoji-misc.js` — scripts secondaires

## Build de production

`node scripts/build.js dist/index.html` ré-assemble le tout en UN SEUL fichier
monolithique (les 9 fichiers app redeviennent un seul <script>, le hoisting
est donc identique à l'ancien format). La CI fait ce build puis minifie.

⚠️ Les 9 fichiers app partagent la même portée globale et se chargent dans
l'ordre. Ne pas réordonner les balises <script> entre les marqueurs
BUILD:APP-START/END, et ne pas ajouter d'appel de fonction top-level qui
référence un fichier ultérieur.

## Vérification après modification

- `node --check js/*.js` (syntaxe)
- `node scripts/build.js /tmp/test.html` (le build doit passer)
- `npx playwright test` (tests smoke, aussi exécutés en CI avant déploiement)
