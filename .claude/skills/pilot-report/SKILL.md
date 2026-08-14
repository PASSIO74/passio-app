---
name: pilot-report
description: Génère un rapport de supervision temps réel de PASSIO depuis le centre de pilotage (activité, KPI, erreurs, signalements, tests, santé) — la vue "salle de contrôle". À utiliser quand Benjamin veut un point de situation global, un état des lieux de la beta, ou dit "rapport de pilotage", "état de la beta", "point de situation", "comment va l'app".
---

# /pilot-report — Rapport de supervision PASSIO

La vue « salle de contrôle » : agrège tout ce qui dit si la beta va bien, en direct.

## Sources à agréger
1. **Activité live** (télémétrie) : actifs du jour, actions récentes par type, écrans chauds :
   ```
   supabase db query --linked "SELECT type, action, count(*) FROM telemetry_events WHERE created_at > now()-interval '24 hours' GROUP BY type, action ORDER BY count DESC LIMIT 30"
   ```
2. **KPI** (skill `/kpi`) : DAU/WAU, nouveaux comptes, rétention, engagement — avec tendance vs veille/semaine passée.
3. **Santé technique** (skill `/prod-errors`) : erreurs `client_errors`, latence API, signalements `reports`.
4. **Tests & CI** : dernier run (`gh run list --limit 3`), état des suites.
5. **Contenu** : volume de posts/carnets/événements/lives créés, ratio créateurs/consommateurs.
6. **État du dashboard** : si lancé (`cd dashboard && npm start` → :4610), pointer vers les panneaux live (SSE).

## Format du rapport
Structurer comme un cockpit :
- 🟢/🟡/🔴 **Santé globale** en une ligne.
- **Activité** : actifs, actions clés, tendance.
- **Croissance** : nouveaux, partages, K-factor.
- **Alertes** : erreurs en hausse, signalements en attente, tests rouges.
- **Top 3 actions** recommandées cette semaine.

Pour un rendu visuel partageable, générer un **Artifact** HTML (charger `artifact-design` + `dataviz` pour les graphes). Sinon, un résumé texte dense.

## Cadence
Peut se planifier en récurrent (skill `schedule`/`loop`) pour un point quotidien automatique. Toujours donner la **tendance** et l'**action**, pas juste des chiffres bruts.
