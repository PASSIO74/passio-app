---
name: new-test
description: "Crée un test Playwright e2e (conventions maison, gate-helper, pièges connus). Dire : écris un test, couvrir ça."
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

## ⚠️ Un test vert ne prouve rien tant qu'on ne l'a pas vu rouge

**Avant de committer : casser le code exprès et vérifier que le test tombe.** Puis rétablir et le revoir vert. C'est deux minutes, et c'est la seule preuve que le test touche vraiment ce qu'il prétend garder.

Muter au bon endroit — la mutation doit ressembler à la faute qu'un humain commettrait :
- un champ renommé vers un nom que `scrubMeta` rejette (`ms` → `tel_ms` : le filtre PII contient « tel ») ;
- un filet de sécurité supprimé (`setTimeout` de secours, `catch` de repli) ;
- une condition inversée, une garde retirée.

**Vécu le 2026-08-16, à ne pas refaire** : un test censé vérifier le comportement en onglet caché forçait `document.visibilityState` à `"hidden"` via `defineProperty`. Il passait — et il passait **encore après suppression du code qu'il gardait**, parce qu'en headless `requestAnimationFrame` continue de tourner malgré cette propriété. Test creux, découvert uniquement par la mutation. Le remplaçant neutralise `requestAnimationFrame` lui-même dans un `addInitScript`, et **vérifie au passage que le chemin visé est bien emprunté** (`window.__rafDemandes > 0`) — sans quoi on retomberait dans le même piège d'un cran.

Règle qui en découle : quand un test simule un état du navigateur, **asserter que la simulation a pris**. Sinon un test qui ne teste rien ressemble exactement à un test qui passe.

`npm run audit:tests` attrape les specs qui ne vérifient que leurs propres constructions ; il n'attrape pas celles-ci. Seule la mutation le fait.
