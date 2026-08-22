# PERF-IOS — phase 1 : instrumentation et baseline iPhone

**État : l'appareil de mesure est posé. Aucune mesure iPhone réelle n'a encore
été relevée** — la baseline se capture sur un vrai appareil, pas dans un runner
CI. Les tableaux plus bas attendent leurs chiffres ; ils restent vides tant que
personne n'a fait le relevé. Un tableau pré-rempli « pour l'exemple » se lirait
comme une mesure et fausserait toute comparaison avant/après.

Ce document couvre **uniquement la phase 1** du chantier PERF-IOS (mesurer).
Les phases 2 à 8 (Feed P0, médias, chemin critique JS, CSS/GPU, IRL, travail
non critique, validation) sont des ordres distincts et n'ont rien changé ici :
le code de cette phase **n'optimise rien** et ne modifie aucun comportement.

## 1. Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `js/perf-ios.js` | Le mesureur. IIFE `"use strict"`, n'expose que `window.PassioPerf`. |
| `index.html` (`<head>`) | Une ligne : le chargement du mesureur, après `telemetry.js`. |
| `tests/e2e/perf-ios.spec.js` | Vérifie que la mesure existe, que les percentiles sont justes et que la baseline franchit le filtre PII. |

Rollback : supprimer la balise `<script src="js/perf-ios.js">` dans `index.html`.
L'application n'a aucune dépendance vers `PassioPerf` — rien d'autre ne casse.

## 2. Ce qui est mesuré

Chaque métrique est agrégée localement en **p50 / p95 / p99** sur un anneau des
120 derniers échantillons, puis publiée dans `telemetry_events`
(`type = "perf"`, `action = "ios_…"`, `duration_ms` = p95, `meta` = p50/p99/n).

**Parcours** (les 10 demandés par la spécification)

| Métrique | Ce qu'elle mesure |
|---|---|
| `gate_ready` | temps jusqu'au déverrouillage du code d'accès |
| `boot_feed` | du gate franchi à la **première vraie carte de post peinte** (le squelette ne compte pas) |
| `nav_<écran>` | changement d'écran → peinture (onglets, profil, IRL, bobines, studio…) |
| `feed_to_irl` | le parcours produit central, consigné à part |
| `tap_like`, `tap_comment_open`, `tap_follow`, `tap_post_open`, `tap_bobine_open`, `tap_tab` | du geste à la première image peinte |

**Fluidité et santé du rendu**

| Métrique | Ce qu'elle mesure |
|---|---|
| `scroll_fps` | FPS approximatif **pendant le scroll uniquement** (aucune boucle rAF permanente) |
| `frame_ms` | durée des frames > 16,7 ms pendant le scroll |
| `jank_n` (compteur) | frames > 50 ms — les saccades visibles |
| `longtask`, `longtask_n`, `tbt_ms` | tâches longues et temps de blocage — **absents de Safari** |
| `evt_<geste>` | Event Timing (seuil 64 ms) — **absent des Safari anciens** |
| `fcp`, `lcp` | premières peintures (`lcp` absent des Safari anciens) |
| `dom_nodes`, `feed_posts`, `medias` | volume DOM actif — la métrique de référence de la phase 2 |
| `heap_mb` | mémoire JS — **Chrome uniquement**, jamais rapportée à 0 sur Safari |

**Toutes** ces API sont détectées avant usage. Ce que l'appareil ne sait pas
mesurer est déclaré non supporté dans `report().support` et **absent** du
rapport — jamais rapporté à zéro. Un zéro se lirait « tout va bien ».

## 3. Relever la baseline sur iPhone

1. Ouvrir `https://passio-app.netlify.app/?telemetry=1` sur l'iPhone (Safari ou
   PWA installée), franchir le code d'accès.
2. Rejouer les parcours **dans cet ordre**, à reproduire à l'identique pour le
   relevé « après » : boot → scroll du fil (~30 s) → ouverture d'un post →
   commentaires → un j'aime → un suivi → changement d'onglet → profil →
   Bobines → ouverture IRL → retour au fil → **Feed → IRL**.
3. Laisser la page ouverte au moins 45 s : la première publication automatique
   part à 45 s, puis toutes les 3 min, et une dernière à la fermeture.
4. Relever le rapport :
   - **sur l'appareil** — via l'inspecteur Safari relié au Mac :
     `copy(PassioPerf.baseline())` ;
   - **sans câble** — les mêmes chiffres arrivent dans le centre de pilotage
     (événements `perf` dont l'action commence par `ios_`), consultables depuis
     un mobile.
5. Coller le JSON obtenu dans le tableau ci-dessous, en notant modèle d'iPhone,
   version d'iOS, Safari ou PWA, et type de réseau (`report().context.net`).

## 4. Baseline (avant optimisation)

> À remplir lors du premier relevé iPhone. Colonnes : p50 / p95 / p99 en ms,
> `n` = nombre d'échantillons. Une case vide signifie **non mesuré**, jamais
> « rapide ».

| Appareil / iOS / mode | Métrique | p50 | p95 | p99 | n |
|---|---|---|---|---|---|
| _(à relever)_ | | | | | |

## 5. Après optimisation

> Même appareil, même parcours, même réseau — sinon la comparaison ne vaut rien.
> À remplir à la fin de chaque phase d'optimisation, en indiquant la phase.

| Phase | Appareil | Métrique | p50 avant → après | p95 avant → après | p99 avant → après |
|---|---|---|---|---|---|
| _(à relever)_ | | | | | |

## 6. Centre de pilotage / Sentinelle — ce qui reste à faire

Les événements arrivent **déjà** dans `telemetry_events` et sont visibles dans le
flux du centre de pilotage (filtre de type « Perf »). En revanche, **ne sont pas
faits** dans cette phase, et relèvent d'un ordre ultérieur :

- un panneau dédié « Fluidité mobile » (p95/p99 par action et par écran) ;
- une règle Sentinelle de détection de dégradation p95/p99 avec identification de
  l'écran concerné ;
- le lien vers un rollback / feature flag / kill switch.

Le tableau existant « Performances » du dashboard agrège la latence **API**
(`type = "api"`) : il n'affiche pas ces nouvelles métriques d'interface.
