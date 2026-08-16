---
name: passio-chaos-testing
description: Injecte des pannes contrôlées dans PASSIO (réseau coupé, WebSocket tué, erreurs backend, latence, événement perdu/dupliqué/réordonné, session expirée, quota plein, corruption d'état) et vérifie que l'application dégrade proprement puis se rétablit. À utiliser pour éprouver la robustesse avant un jalon, pour valider un mécanisme de reprise, ou quand Benjamin dit « et si ça tombe ? », « chaos », « injection de pannes ».
---

# /passio-chaos-testing — Casser exprès, sous contrôle

## Règle de sécurité, en premier

**Le chaos ne se pratique jamais contre la production.** Or PASSIO n'a **qu'une base** : Supabase `njkiyoklssvefstljemx` sert la prod *et* les tests.

Conséquence stricte : l'injection se fait **côté client uniquement**, par interception dans le navigateur (`page.route`, `page.context().setOffline`, faux WebSocket). **Aucune panne ne s'injecte côté serveur, côté base, ni par manipulation de données réelles.** Une expérience qui exigerait de dégrader le serveur est à déclarer non exécutable, pas à improviser.

Après toute campagne : `npm run purge:e2e`, puis vérifier 0 compte résiduel.

## Les leviers réellement disponibles (Playwright)

```js
// réseau coupé / rétabli
await ctx.setOffline(true);  /* … */  await ctx.setOffline(false);

// erreur backend ciblée sur un endpoint
await page.route("**/rest/v1/post_likes*", r => r.fulfill({ status: 500, body: "{}" }));

// refus RLS silencieux (le cas le plus pernicieux : 200 + 0 ligne)
await page.route("**/rest/v1/posts*", r => r.fulfill({ status: 200, body: "[]" }));

// latence
await page.route("**/rest/v1/**", async r => { await new Promise(s => setTimeout(s, 5000)); await r.continue(); });

// réponse perdue (jamais résolue)
await page.route("**/rest/v1/conv_messages*", () => { /* aucune réponse */ });

// 401 / token expiré
await page.route("**/rest/v1/**", r => r.fulfill({ status: 401, body: '{"message":"JWT expired"}' }));

// 429
await page.route("**/rest/v1/**", r => r.fulfill({ status: 429, body: '{"message":"rate limited"}' }));

// WebSocket realtime tué
await page.route("**/realtime/v1/websocket*", r => r.abort());

// quota localStorage plein
await page.addInitScript(() => { const s = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { if (String(k).startsWith("passio_")) throw new DOMException("QuotaExceededError"); return s(k, v); }; });

// horloge décalée
await page.addInitScript(() => { const D = Date; const skew = 3600e3;
  window.Date = class extends D { constructor(...a){ super(...(a.length?a:[D.now()+skew])); } static now(){ return D.now()+skew; } }; });
```

## Le catalogue d'expériences

Chacune s'écrit : **hypothèse → injection → observation → verdict**. Une expérience sans hypothèse écrite d'avance produit une justification après coup.

| # | Panne injectée | Hypothèse à vérifier |
|---|---|---|
| C1 | Réseau coupé pendant un envoi de message | statut `failed`, mise en outbox, renvoi automatique au retour |
| C2 | 500 sur une écriture de like | affichage optimiste **annulé**, pas laissé en place |
| C3 | 200 + tableau vide (refus RLS déguisé) | l'action n'est pas comptée comme réussie |
| C4 | Réponse jamais résolue | pas de blocage d'interface, pas de double envoi au retry |
| C5 | WebSocket realtime coupé puis rétabli | réabonnement, et rattrapage de ce qui a été manqué |
| C6 | Événement realtime dupliqué | un seul effet métier (dédup par id) |
| C7 | Événements réordonnés | l'état final est le même |
| C8 | Événement perdu | le cycle de rafraîchissement le rattrape |
| C9 | 401 en cours de session | rafraîchissement de session, pas de déconnexion brutale |
| C10 | 429 | recul exponentiel, pas de martèlement |
| C11 | Quota localStorage dépassé | pas de faux « état propre » ; l'IndexedDB prend le relais |
| C12 | Horloge en avance d'une heure | l'état de l'autre appareil n'est pas perdu (**échoue aujourd'hui** — voir `passio-sync-audit`) |
| C13 | Onglet caché pendant l'envoi | le beacon `keepalive` sauve l'état |
| C14 | Service worker d'une version précédente | pas de mélange de versions (`version-skew.spec.js`) |
| C15 | Deux contextes agissant simultanément | convergence, pas d'effet doublé |

## Le piège de mesure à écarter systématiquement

**Une expérience de chaos doit prouver que l'injection a réellement eu lieu.**

Vécu sur ce dépôt : un test forçait `visibilityState` pour simuler un onglet caché — mais en headless cela **n'arrête pas `requestAnimationFrame`**, la simulation n'avait aucun effet, et le test passait sans rien exercer. Un test creux, invisible à `audit:tests`.

Donc : **asserter que la panne a mordu** avant d'asserter le comportement. Compter les requêtes interceptées, vérifier que le statut est bien passé à `failed`, que le canal est bien tombé. Sans cette assertion, un test de chaos vert peut ne rien avoir testé du tout.

Deuxième garde : `polling: "raf"` ne se déclenche **jamais** sur une page non composée en headless — toujours `polling: 50`.

## Cycle complet attendu

Une expérience rouge n'est pas la fin : elle ouvre `passio-autoheal`, qui exige **réinjection après correctif**. La séquence complète est :

```
PANNE INJECTÉE → COMPORTEMENT FAUTIF PROUVÉ → CORRECTIF
              → PANNE RÉINJECTÉE → COMPORTEMENT CORRECT PROUVÉ
              → NON-RÉGRESSION → SCÉNARIO CONSERVÉ
```

## Critères de réussite

- Chaque expérience a une hypothèse écrite **avant** l'exécution.
- L'injection est **prouvée** par une assertion propre.
- Le scénario est conservé dans `tests/e2e/`.
- Les comptes de test sont purgés.

## Critères d'échec

- Une injection non vérifiée → le test ne vaut rien.
- Une panne injectée côté serveur ou en base → interdit, il n'y a qu'une base.
- Un verdict « ça tient » sans observation du comportement dégradé.

## Format de résultat

```
EXPÉRIENCE <Cn> — <panne>
Hypothèse   : <ce qu'on attend>
Injection   : <mécanisme> — prouvée par <assertion>
Observé     : <ce qui se passe vraiment>
Verdict     : TENU | DÉFAUT RÉEL | NON EXÉCUTABLE (<pourquoi>)
Suite       : <incident ouvert / test conservé / rien>
```
