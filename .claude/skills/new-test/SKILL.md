---
name: new-test
description: Crée un nouveau test Playwright e2e pour PASSIO en suivant les conventions maison (gate-helper, pièges de rédaction connus). À utiliser quand Benjamin veut couvrir une fonctionnalité, ajouter une non-régression, ou dit "écris un test", "couvre ça", "ajoute un test".
---

# /new-test — Nouveau test e2e PASSIO

## Conventions
- Tests dans `tests/e2e/<domaine>.spec.js` (playwright). Regrouper par écran (irl, cdv, feed-ranking…).
- **Déverrouiller le gate** en tête via `tests/e2e/gate-helper.js` (sinon l'app reste sur l'écran d'accès code `2125`).
- Tester de préférence une **fonction globale déterministe** (ex. `rankFeedPosts`, `cdvTripStats`) évaluée dans la page — plus stable qu'un parcours DOM.
- ⚠️ `state` est un binding de script : dans `page.evaluate`, tester `typeof state !== "undefined"`, JAMAIS `window.state` (un garde `window.state` fait échouer toute la suite en silence).

## Pièges de rédaction (déjà mordu — cf. docs/PIEGES_CONNUS.md)
- Un stub `supaUpdate*`/`supaPublish*` qui renvoie `null` fait échouer à tort les chemins « notifier après écriture réussie » → stubber `true`.
- La carte (MapLibre) est initialisée en différé puis recadrée → attendre que le zoom se **stabilise** (2 mesures identiques) avant d'asserter.
- Les guards no-op (`_feedDomSig`, `_lastHtml`) peuvent sauter un render → invalider avant d'asserter un re-rendu.

## Cross-compte / RLS / realtime
Ça ne se teste QUE dans `tests/e2e/multi-comptes.spec.js` (opt-in `PASSIO_E2E_MULTI=1`, inscription e-mail jetable `@passio-e2e.test`). Un UPDATE qui touche 0 ligne en silence (RLS) est invisible des tests mono-compte.

## Après
Lancer le nouveau test (`npm test -- <fichier>`), le rendre vert, puis vérifier que la suite globale (`npm run test:all`) reste verte.
