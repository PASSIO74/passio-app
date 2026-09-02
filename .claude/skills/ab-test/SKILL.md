---
name: ab-test
description: "Expérimentation : feature flag, variante, rollout progressif, mesure. Dire : A/B test, feature flag."
---

# /ab-test — Expérimentation PASSIO

FB/IG ne lancent rien sans mesurer. Un flag + un objectif + la télémétrie = décision par la donnée, pas à l'instinct.

## Briques disponibles
- **Feature flags dashboard** : `dashboard/data/flags.json` + `dashboard/server/flags` (le centre de pilotage gère déjà des flags). Les exposer/piloter côté app.
- **Curseur d'échantillonnage stable par appareil** : `window.PASSIO_TELEMETRY_SAMPLE`, `_sampledIn(frac)` (télémétrie) — même mécanique pour assigner un appareil à une variante de façon **stable** (hash de `device_id` → bucket).
- **Télémétrie** (`telemetry_events`) pour mesurer l'effet de chaque variante.
- Soupapes localStorage existantes (`passio_feed_rank`, `passio_realtime_v3`…) = pattern d'override par appareil.

## Monter une expérience
1. **Hypothèse + métrique** : « la variante B augmente le taux de commentaire de X % ». UNE métrique primaire.
2. **Assignation stable** : bucket l'appareil par hash de `device_id` (même user = toujours même variante). Fraction contrôlée par flag.
3. **Instrumenter** (`/telemetry-event`) : envoyer la **variante** dans `meta` (ex. `tel.action("exp_feed_v2", {variant})`) + l'événement de conversion. ⚠️ Respecter le filtre PII (identifiants/mesures, pas de contenu).
4. **Rollout progressif** : 5 % → 25 % → 50 % → 100 % via le flag, en surveillant erreurs (`/prod-errors`) et métrique.
5. **Analyser** : comparer la métrique par variante sur une durée suffisante (skill `/kpi`), regarder la significativité (taille d'échantillon).

## Décider
Gagnant clair → généraliser + retirer le flag. Neutre/perdant → retirer la variante. Documenter la décision.

## Garde-fou
Toujours une soupape de retour arrière (le flag). Ne pas empiler 10 expériences concurrentes qui se polluent. Kill switch si les erreurs montent.
