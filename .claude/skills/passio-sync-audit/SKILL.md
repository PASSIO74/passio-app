---
name: passio-sync-audit
description: Audite la synchronisation de PASSIO — multi-appareils, Supabase Realtime, outbox, idempotence, hors-ligne, concurrence, convergence, et l'autorité de l'horloge. À utiliser quand une donnée n'arrive pas sur l'autre appareil, qu'un changement se perd, qu'un état diverge entre deux sessions, ou avant de toucher à `user_state`, aux outbox ou aux canaux realtime.
---

# /passio-sync-audit — Prouver la convergence, pas la supposer

État réel des mécanismes (`user_state`, les deux outbox, le canal realtime, le beacon), ce qui **n'existe pas** dans le dépôt, les défauts nommés et la liste d'idempotence : [`mecanismes.md`](references/mecanismes.md).

⚠️ **Défaut d'autorité d'horloge, réel et non encore déclenché** : `supaSaveUserState` écrit `updated_at` avec **l'horloge du client**, et c'est elle qui arbitre la fusion — un appareil en avance gagne définitivement, les modifications de l'autre sont perdues en silence. Enchaînement et requête de dérive : [`horloge.md`](references/horloge.md).

## Les questions à poser à chaque flux

Pour toute donnée qui voyage `CLIENT A → SERVEUR → BASE → REALTIME → CLIENT B` :

1. **Émission** — l'intention part-elle ? (l'**intention locale**, jamais un état re-déduit d'un `select` préalable)
2. **Acceptation** — le `{ error }` est-il **lu** ? Le SDK ne lève pas sur un refus RLS.
3. **Persistance** — la ligne existe-t-elle en base ? Un UPDATE/DELETE qui touche 0 ligne est un refus RLS déguisé en succès.
4. **Diffusion** — la table est-elle dans la publication realtime ?
5. **Réception** — B a-t-il un abonnement vivant, et autorisé ?
6. **Application** — le handler écrit-il dans le **bon tableau d'état** ?
7. **Convergence** — A et B affichent-ils la même chose après stabilisation ?

Une étape manquante = anomalie, même si l'écran a l'air correct.

## Détecter les ABSENCES

Le plus dur n'est pas l'erreur, c'est le silence. Chercher : une mutation en base **sans** événement realtime · un événement diffusé **sans** réception · une réception **sans** application · un appareil qui ne reçoit plus rien depuis N minutes · une file d'outbox qui n'avance plus · un abonnement mort (canal jamais repassé à `SUBSCRIBED`).

## Tester

```bash
PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite
npx playwright test tests/e2e/feed-realtime-course.spec.js tests/e2e/etat-sync-base64.spec.js tests/e2e/conv-suppression.spec.js
```

⚠️ Les tests « multi-appareils » utilisent **deux contextes de navigateur**, pas deux appareils : horloge, réseau et service worker y sont partagés. Ils ne prouvent ni la dérive d'horloge, ni le comportement d'une PWA suspendue — le dire dans tout rapport plutôt que laisser croire à une preuve multi-appareils.

## Réussite / échec

✅ Chaque étape du trajet **observée**, pas déduite de l'affichage · convergence vérifiée **en base**, pas à l'écran · idempotence appuyée sur une **contrainte**, pas sur une politesse du client · aucune décision de fusion reposant sur une horloge client.

🛑 « Ça s'affiche sur B » présenté comme preuve de convergence · une écriture jugée réussie sans lecture de `{ error }` · un test mono-contexte présenté comme multi-appareils.

Format de résultat d'un audit de flux : [`mecanismes.md`](references/mecanismes.md).
