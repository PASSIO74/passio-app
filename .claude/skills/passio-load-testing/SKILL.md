---
name: passio-load-testing
description: "Charge, stress, endurance : 100 utilisateurs concurrents, P50/P95/P99, saturation, fuite mémoire."
---

# /passio-load-testing — Ce qui ne tient pas à 100

## Le blocage à énoncer en premier

**PASSIO n'a qu'une base Supabase**, qui sert la production. Un test à 100 utilisateurs concurrents contre elle : ① pollue les données réelles, ② fausse toute la télémétrie (79 % de la table était déjà du bruit de test avant la purge du 2026-08-16), ③ consomme le quota du projet, ④ peut dégrader l'app pour un vrai utilisateur.

Donc : **le test de charge complet exige une base cible non-prod** — second projet Supabase gratuit, ou Docker. C'est la même dépendance qui bloque la restauration de sauvegarde et le test à volume. Tant qu'elle n'existe pas, ce skill produit :

- ce qui **est** mesurable sans elle (voir ci-dessous) ;
- et une déclaration explicite de ce qui ne l'est pas. **Jamais un chiffre extrapolé.**

## Mesurable sans base non-prod

| Mesure | Comment | Risque |
|---|---|---|
| Plans d'exécution sur volume simulé | `scripts/test-volume.sql` — transaction **annulée** | nul (ROLLBACK) |
| Latences API réelles | `telemetry_events`, trafic de production | nul (lecture) |
| Coût CPU de démarrage | bridage ×4, machine au repos, **médiane de 3** | nul |
| Concurrence à petite échelle | 2–5 contextes Playwright | faible |
| Fuites côté client | endurance sur un contexte, heap + compteurs | nul |

Latences de production dépouillées ainsi :

```bash
supabase db query --linked "select meta->>'endpoint' ep, count(*) n,
  percentile_disc(0.5) within group (order by (meta->>'ms')::numeric) p50,
  percentile_disc(0.95) within group (order by (meta->>'ms')::numeric) p95,
  max((meta->>'ms')::numeric) max
from telemetry_events where env='production' and type='fetch' and meta ? 'ms'
  and created_at > now() - interval '7 days' group by 1 having count(*) > 20 order by p95 desc limit 15;"
```

C'est cette requête qui a désigné `SYNC-B64-005` : `user_state` à p95 = 2 844 ms, max 43 199 ms.

## Le mix réaliste — 100 utilisateurs, pas 100 connexions dormantes

Une charge de 100 sessions inactives ne mesure rien. Répartition à respecter :

| Part | Comportement |
|---|---|
| 40 % | lecture du fil, défilement, ouverture de profils |
| 20 % | likes et réactions |
| 15 % | commentaires |
| 10 % | messages (avec realtime actif) |
| 5 % | publication de post |
| 5 % | RSVP / événements IRL |
| 5 % | reconnexion, hors-ligne puis retour |

Dont **une fraction sur deux sessions du même compte** — c'est là qu'apparaissent les défauts de convergence, invisibles en mono-session.

## Ce qu'il faut mesurer

Latences P50/P95/P99 par endpoint · temps d'écriture serveur · délai événement realtime · délai de réception · délai d'application · **temps de convergence** · taux de retry · backlog maximum · événements perdus · dupliqués · hors séquence · reconnexions · erreurs visibles · **erreurs silencieuses**.

Les erreurs silencieuses sont prioritaires : sous charge, une écriture refusée sans lecture de `{ error }` reste invisible à l'écran **et** dans les logs.

## Stress et endurance

**Stress** : monter par paliers (25 → 50 → 100 → 150 → 200) et noter la **première dégradation**, pas seulement le point de rupture. Identifier le goulot : base, realtime, frontend, quota Supabase.

**Endurance** : une session prolongée sur un seul contexte suffit à trouver l'essentiel des fuites côté client — abonnement realtime jamais désabonné, timers accumulés, file qui n'avance plus, reconnexions en boucle, croissance du heap.

```js
// à échantillonner périodiquement
await page.evaluate(() => ({
  heap: performance.memory && performance.memory.usedJSHeapSize,
  canaux: (window.supa && supa.getChannels && supa.getChannels().length) || 0,
  outbox: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length,
}));
```

Un nombre de canaux qui croît sans fin est un défaut, même si rien ne casse pendant le test.

## Règles de mesure — apprises à ses dépens

**Une mesure de performance n'a de valeur que sur machine au repos, répétée, et médiane.** Une baseline publiée ici a été gonflée **3,5×** parce qu'elle tournait pendant que la suite de tests s'exécutait en arrière-plan : elle mesurait la charge de la machine autant que celle de l'application. Deux investigations complètes ont été menées sur cette prémisse fausse.

Corollaire : **toujours mesurer la référence dans les mêmes conditions** avant de conclure à une régression.

## Critères de réussite

- Le mix est réaliste et documenté.
- Convergence vérifiée **en base** sous charge, pas à l'écran.
- Première dégradation identifiée, pas seulement la rupture.
- Chaque chiffre est reproductible par une commande citée.

## Critères d'échec

- Une charge lancée contre la base de production.
- Un P95 extrapolé depuis une charge plus faible.
- 100 sessions dormantes présentées comme 100 utilisateurs.
- Une mesure unique présentée comme une baseline.

## Format de résultat

```
CHARGE — <n> utilisateurs, <durée>, cible <environnement>
Mix              : <répartition réelle>
P50 / P95 / P99  : <par endpoint>
Convergence      : <taux, méthode de vérification>
Backlog max      : <n>
Perdus / dupliqués / hors séquence : <n> / <n> / <n>
Erreurs silencieuses : <n>
Première dégradation : <palier> — <goulot>
NON MESURÉ       : <ce qui exigeait une base non-prod>
```
