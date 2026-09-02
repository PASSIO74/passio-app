# Leviers d'injection Playwright, et pièges de mesure

Toutes les injections se font **côté client**, dans le navigateur. Aucune ne touche le serveur, la base ni des données réelles (§ règle de sécurité du skill).

## Les leviers réellement disponibles

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

## Le piège de mesure à écarter systématiquement

**Une expérience de chaos doit prouver que l'injection a réellement eu lieu.**

Vécu sur ce dépôt : un test forçait `visibilityState` pour simuler un onglet caché — mais en headless cela **n'arrête pas `requestAnimationFrame`**, la simulation n'avait aucun effet, et le test passait sans rien exercer. Un test creux, invisible à `audit:tests`.

Donc : **asserter que la panne a mordu** avant d'asserter le comportement. Compter les requêtes interceptées, vérifier que le statut est bien passé à `failed`, que le canal est bien tombé. Sans cette assertion, un test de chaos vert peut ne rien avoir testé du tout.

Deuxième garde : `polling: "raf"` ne se déclenche **jamais** sur une page non composée en headless — toujours `polling: 50`.
