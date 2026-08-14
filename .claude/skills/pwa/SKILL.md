---
name: pwa
description: Audite l'expérience PWA de PASSIO (installabilité, service worker, offline, cache, partage natif, push, cadrage mobile) — le socle mobile d'un réseau social. À utiliser pour un problème d'installation/offline/SW/mise à jour, ou quand Benjamin dit "PWA", "installation", "hors-ligne", "service worker", "ça se met pas à jour".
---

# /pwa — Audit PWA PASSIO

PASSIO est une PWA mobile-first (pas d'app store) → l'expérience PWA EST l'expérience produit.

## Points de contrôle
1. **Installabilité** : manifest valide (icônes, nom, theme_color violet, display standalone), critères Chrome/Android remplis. `pwa-landing.js`/`pwa-detect.js` gèrent l'invite d'installation.
2. **Service Worker** (`sw.js`) : stratégie de cache, **buildId** qui se bump quand app.js/styles.css changent (via le hash dans le HTML). Symptôme « ça se met pas à jour » = SW sert du cache périmé → vérifier le versioning du cache et `reg.update()` (suspendu si `document.hidden`).
3. **Offline** : file d'attente commentaires (`_cmtOb*`), messages (outbox), conversations en IndexedDB (`idbConvLoad/Save`), realtime avec rattrapage. Que se passe-t-il vraiment sans réseau ?
4. **Push** : Web Push VAPID pour les appels (`notify-call`). ⚠️ iOS = seulement si PWA **installée** sur l'écran d'accueil (pas onglet Safari).
5. **Partage natif** : `navigator.share` sur les contenus. Share target entrant (recevoir un partage) = piste.
6. **Cadrage mobile** : `--app-vh` mesurée en JS (jamais `100dvh`) — la barre d'onglets ne doit pas être masquée par la barre système. Couverture : `tests/e2e/cadrage.spec.js`.
7. **Perf install** : page verrouillée = quasi 0 Ko de JS app (loader après `__gateReady`), assets immutables (`_headers`).

## Méthode
Vérifier dans le preview (skill `/preview`, mobile 375px), inspecter le SW et le cache (`javascript_tool`), simuler offline, tester l'update après un rebuild. Lighthouse mobile formel reste une action humaine.

## Rapport
État installabilité/SW/offline/push/partage, symptômes reproduits, correctifs priorisés. Ne pas casser le versioning du cache ni le cadrage `--app-vh`.
