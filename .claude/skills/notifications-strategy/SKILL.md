---
name: notifications-strategy
description: "Stratégie de notifications : push, cadence, anti-spam, ré-engagement. Dire : notifications, push, relancer les gens."
---

# /notifications-strategy — Stratégie de notifications PASSIO

Les notifications sont le moteur de ré-engagement n°1 des réseaux sociaux — mais mal dosées, elles font désinstaller. Équilibre pertinence/fréquence.

## Système existant
- **In-app** : `supaInsertNotif(toUserId, kind, refId, content)` (RLS insert cross-user OK), rendu `_notifListHtml`, emoji `_notifEmoji`, routage `openNotifTarget`, dédup/badge `mergeSupaNotifs`, anti-réapparition `state.user.seenNotifIds`. Kinds : like, comment, follow, event_join/invite/feedback, live_video, cdv_live_step, mention…
- **Push (app fermée)** : Web Push VAPID → Edge Function `notify-call` (appels), `push_subscriptions`. ⚠️ iOS = seulement si PWA installée.
- **Cadences** : rappels événement J-7/J-1/H-2 (`EVENT_REMINDER_TIERS`, dédup `<eventId>:<palier>`), digest IRL hebdo (dédup semaine ISO), rappel in-app J-1.

## Principes (FB/IG)
1. **Pertinence d'abord** : notifier une interaction sur MON contenu > contenu générique. Grouper (« Marie et 3 autres ont aimé ») plutôt que N notifs.
2. **Cadence maîtrisée** : jamais 2 push pour la même chose ; respecter les paliers ; jamais de prompt de permission non sollicité (demander sur un geste, ex. 1re ouverture de conversation).
3. **Ré-engagement intelligent** : cibler les inactifs avec du contenu qui les concerne (activité de leurs follows, événements de leurs passions près d'eux).
4. **Opt-out respecté** + télémétrie : mesurer taux d'ouverture par kind (`/kpi`), couper ce qui ne performe pas.

## Ajouter un type de notification
1. `supaInsertNotif(...)` au bon endroit (échapper le pseudo si dynamique).
2. Emoji dans `_notifEmoji`, routage dans `openNotifTarget`, éventuel push via `notify-call`.
3. Instrumenter l'envoi ET l'ouverture (`/telemetry-event`).

## Rapport
Cartographie des notifs actuelles, taux d'ouverture par kind, sur/sous-notification, et recommandations de cadence.
