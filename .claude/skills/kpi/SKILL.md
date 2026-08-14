---
name: kpi
description: Définit, calcule et suit les KPI d'un réseau social pour PASSIO (DAU/WAU/MAU, rétention, K-factor, engagement, création de contenu) via la télémétrie. À utiliser quand Benjamin veut mesurer la santé produit, définir des métriques, un tableau de bord chiffré, ou dit "KPI", "métriques", "chiffres", "combien d'utilisateurs actifs".
---

# /kpi — KPI réseau social PASSIO

« Ce qui ne se mesure pas ne s'améliore pas. » Les métriques nord d'un réseau social, calculées sur `telemetry_events` + tables Supabase.

## Les KPI qui comptent (FB/IG)
1. **Actifs** : DAU / WAU / MAU (utilisateurs distincts avec ≥1 action par jour/semaine/mois). Ratio DAU/MAU = « stickiness » (cible > 20 %).
2. **Rétention** : J1 / J7 / J30 par cohorte d'inscription (skill `/retention`).
3. **Activation** : % de nouveaux qui font leur 1re action clé (post/like/follow) en J0 (skill `/onboarding`).
4. **Engagement** : actions par utilisateur actif (likes, commentaires, réactions, partages), temps de session (via `heartbeat`).
5. **Création** : % de créateurs (posts/carnets/événements) vs consommateurs (règle des 90-9-1).
6. **Croissance** : nouveaux comptes/jour, K-factor (invitations envoyées→acceptées), sources de partage (skill `/growth`).
7. **Santé** : erreurs (`client_errors`), signalements (`reports`), latence API (télémétrie `api`).

## Requêtes de base
```
supabase db query --linked "SELECT date_trunc('day', created_at) d, count(DISTINCT device_id) actifs FROM telemetry_events WHERE type='action' AND created_at > now() - interval '30 days' GROUP BY d ORDER BY d"
```
Nouveaux comptes :
```
supabase db query --linked "SELECT date_trunc('day', created_at) d, count(*) FROM profiles GROUP BY d ORDER BY d DESC LIMIT 30"
```
Actions par type :
```
supabase db query --linked "SELECT action, count(*) FROM telemetry_events WHERE type='action' AND created_at > now()-interval '7 days' GROUP BY action ORDER BY count DESC"
```

## Livrer
Exposer ces KPI en continu dans le centre de pilotage (skills `/dashboard-widget`, `/pilot-report`). Un chiffre isolé ne vaut rien — donner la **tendance** (vs période précédente) et le **contexte**.

## Rapport
Tableau des KPI avec valeur + tendance + cible, et le 1 chiffre à surveiller cette semaine.
