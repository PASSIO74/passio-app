---
name: passio-chaos-testing
description: "Injecte des pannes contrôlées (réseau, WebSocket, latence, quota) et éprouve la reprise. Dire : chaos."
---

# /passio-chaos-testing — Casser exprès, sous contrôle

## Règle de sécurité, en premier

**Le chaos ne se pratique jamais contre la production.** Or PASSIO n'a **qu'une base** : Supabase `njkiyoklssvefstljemx` sert la prod *et* les tests. Conséquence stricte : l'injection se fait **côté client uniquement**, par interception dans le navigateur (`page.route`, `page.context().setOffline`, faux WebSocket). **Aucune panne ne s'injecte côté serveur, côté base, ni par manipulation de données réelles.** Une expérience qui exigerait de dégrader le serveur est à déclarer non exécutable, pas à improviser.

Après toute campagne : `npm run purge:e2e`, puis vérifier 0 compte résiduel.

## La méthode

Chaque expérience s'écrit **hypothèse → injection → observation → verdict**, l'hypothèse **avant** l'exécution — sinon elle produit une justification après coup.

- Leviers Playwright (offline, 500, 200 + tableau vide, latence, réponse perdue, 401, 429, WebSocket tué, quota plein, horloge décalée) : [`injections.md`](references/injections.md).
- Les 15 expériences C1 → C15 et leurs hypothèses : [`catalogue.md`](references/catalogue.md).

## Le piège de mesure, à écarter systématiquement

**Une expérience de chaos doit prouver que l'injection a réellement eu lieu** — compter les requêtes interceptées, vérifier que le statut est passé à `failed`, que le canal est bien tombé. Sans cette assertion, un test de chaos vert peut n'avoir rien testé du tout (cas vécu : `injections.md`).

Deuxième garde : `polling: "raf"` ne se déclenche **jamais** sur une page non composée en headless — toujours `polling: 50`.

## Cycle complet attendu

Une expérience rouge ouvre `passio-autoheal`, qui exige **réinjection après correctif**.

```
PANNE INJECTÉE → COMPORTEMENT FAUTIF PROUVÉ → CORRECTIF
              → PANNE RÉINJECTÉE → COMPORTEMENT CORRECT PROUVÉ
              → NON-RÉGRESSION → SCÉNARIO CONSERVÉ
```

## Réussite / échec

✅ Hypothèse écrite **avant** l'exécution · injection **prouvée** par une assertion propre · scénario conservé dans `tests/e2e/` · comptes de test purgés.

🛑 Injection non vérifiée → le test ne vaut rien · panne injectée côté serveur ou en base → interdit, il n'y a qu'une base · verdict « ça tient » sans observation du comportement dégradé.

Format de résultat d'une expérience : [`catalogue.md`](references/catalogue.md).
