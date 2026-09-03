# Détection, corrélation, empreinte, sévérité

Détail des étapes 1 à 3 du pipeline `/passio-autoheal`.

## 1. DÉTECTER — partir d'un fait, pas d'une impression

```
# erreurs client de production
execute_sql  (connecteur supabase-passio-readonly)
select message, count(*) n, max(created_at) dernier from client_errors where created_at > now() - interval '7 days' group by 1 order by n desc limit 20;
```

Sources : `client_errors`, `telemetry_events` (type `error`), onglet Sentinelle, `/api/diagnose`.

⚠️ **Angle mort structurel de la Sentinelle** : elle ne voit que ce qui déclenche une alerte. « Aucun diagnostic » ne veut jamais dire « tout va bien » — une panne silencieuse ou une télémétrie interrompue ne produit aucun signal. Chercher aussi les **absences** (§ `passio-sync-audit`).

## 2. CORRÉLER puis EMPREINDRE

Un défaut qui touche 100 personnes doit produire **un** incident, pas 100. L'empreinte se compose de : message d'erreur normalisé (nombres et ids retirés) + endpoint + action + code DB + version applicative. Garder le **décompte réel** d'utilisateurs et d'appareils distincts — c'est lui qui donne la sévérité, pas le nombre de lignes.

## 3. CLASSIFIER et MESURER L'IMPACT

| Sévérité | Critère |
|---|---|
| **critical** | perte de données, fuite cross-compte, écriture sous identité d'autrui |
| **high** | action utilisateur perdue en silence, convergence jamais atteinte |
| **medium** | dégradation visible mais récupérable au rechargement |
| **low** | cosmétique, ou auto-réparant au cycle suivant |

⚠️ Un défaut **auto-réparant au cycle suivant** est le plus dangereux à classer : il ne se signale jamais comme une perte. `FEED-RT-007` (post temps réel affiché puis effacé) est resté invisible pour cette raison exacte.
