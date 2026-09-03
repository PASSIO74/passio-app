---
name: retention
description: Rétention via la télémétrie : DAU/WAU, cohortes, décrochage, habitude. Dire : churn, les gens reviennent pas, engagement.
---

# /retention — Rétention & engagement PASSIO

La croissance sans rétention est un seau percé. Objectif : transformer une visite en habitude (le « hook » IG/FB : trigger → action → récompense variable → investissement).

## Sources de données
- **Télémétrie** `telemetry_events` (types `nav`/`action`/`click`/`heartbeat`) :
  ```
  supabase db query --linked "SELECT type, action, count(*) FROM telemetry_events WHERE created_at > now() - interval '7 days' GROUP BY type, action ORDER BY count DESC LIMIT 40"
  ```
- **DAU / cohortes** (approx via `device_id`/session) et **rétention J1/J7** : croiser première vs dernière activité.
- Écrans les plus/moins visités (nav wrap de `goTo`), actions par utilisateur.

## Leviers de rétention (mécaniques réseaux sociaux)
1. **Récompense variable** : notifications de likes/commentaires/réactions/follows (déjà en place) — vérifier la latence realtime et que rien ne se perd (`supaLoadNotifications`).
2. **Boucle d'habitude** : stories (anneaux vus/non-vus), fil classé par pertinence (`rankFeedPosts`), lives → raisons de revenir chaque jour.
3. **Investissement** : plus un user crée (posts, carnets CDV, événements), plus il revient. Mesurer le taux de création et lever les frictions (skill `/onboarding`).
4. **Badges/étoiles** (`PASSIO_BADGES`, `score`/`RANKS`) : jalons d'assiduité → renforcement.
5. **Re-engagement** : digest hebdo, rappels d'événements — sans spammer (`/notifications-strategy`).

## Méthode
1. Identifier le **point de décrochage** dans la télémétrie (funnel : arrivée → onboarding → 1re action → J1 → J7).
2. Formuler UNE hypothèse ciblée sur ce point.
3. Instrumenter (`/telemetry-event`), implémenter, mesurer la cohorte avant/après.

## Rapport
DAU/WAU estimés, rétention J1/J7, top écrans, principal décrochage, et 1-3 actions priorisées avec l'impact attendu.
