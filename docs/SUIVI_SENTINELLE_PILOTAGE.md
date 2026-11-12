# Sentinelle et centre de pilotage — suivi de la mission de perfectionnement

> Ouvert le 2026-11-12 (mission « perfectionnement majeur de la Sentinelle et du centre de pilotage »).
> **À lire avant de reprendre** : ce fichier dit où en est chaque lot, ce qui a été MESURÉ et quand,
> et ce qui reste humain. Il se met à jour dans la PR de chaque lot. Le récit et les pièges vivent
> dans `docs/journal/telemetrie-pilotage-sentinelle.md` ; le système tel que le code l'applique,
> dans `docs/AUTONOMIE_EXPLOITATION.md`.
> Vocabulaire : **EXISTANT VÉRIFIÉ** (mesuré ou exécuté ce jour-là) · **DÉFAUT REPRODUIT** (un test
> rouge l'a montré) · **RISQUE À TESTER** (lu dans le code ou déduit, pas exécuté) · **NON MESURÉ**.
> État d'un lot : IMPLÉMENTÉ · TESTÉ · DÉPLOYÉ · OBSERVÉ EN PRODUCTION · NON VÉRIFIÉ.

## 1. Baseline du 2026-11-12 (`main` = `8fafb55d`)

Toutes les mesures : canal ① (lecture seule) et API GitHub, le 12/11 entre 14 h 30 et 15 h UTC.

| Sujet | Constat | Nature |
|---|---|---|
| Veille du pilotage (pg_cron, 5 min) | 288 exécutions sur 288 en 24 h ; 564 battements en 6 jours, écart médian et P95 de 15 min (max 15,7), aucun écart de plus de 35 min ; une veille dure 1,06 s en médiane, 2,08 s au P95, 4,5 s au pire ; aucune lecture manquée | EXISTANT VÉRIFIÉ |
| Crons GitHub (100 derniers runs planifiés) | Sentinelle (demandée chaque heure) : servie toutes les 5,7 h en médiane, 8,9 h au P95, 10,8 h au pire · veille de production (`*/30`) : 5,3 h · 8,2 h · 10,6 h · secours de la veille et sonde de disponibilité (`*/10`) : 5,0 h · 8,1 h · ≈ 10 h · sauvegarde : 61 sur 61, chaque jour, servie 5 à 7 h après l'heure demandée | EXISTANT VÉRIFIÉ |
| Chaîne d'alerte | 14:47 fin du run en échec → 14:50:04 voyant rouge → 14:50:05 notification acceptée par 2 appareils. 102 changements de voyant en 30 jours (39 verts, 38 oranges, 25 rouges), 41 avec alerte | EXISTANT VÉRIFIÉ |
| Faux vert de 19 min | Le run de 14:12 échoue à 14:31 ; le voyant reste vert jusqu'à 14:50 (le run suivant tournait) | DÉFAUT REPRODUIT — corrigé au lot 1 |
| Mise en ligne | `release.json` sert `a5d114f4` : deux fusions de retard. Cause : staging migré avant la fusion de #843 (42501 sur `events`), troisième fois depuis le 07/11 | EXISTANT VÉRIFIÉ — signalé sur #843 |
| Exécution de la fonction `pilotage` | Aucune suite n'exécutait `index.ts` (1 559 lignes) ; écart déclaré depuis le 09/11 | DÉFAUT REPRODUIT — corrigé au lot 1 |
| Parcours jugés | 5 flux en 7 jours (2 réactions, 2 publications, 1 abonnement), un compte chacun : tous les contrats sont « insuffisant » ou « non observé » | EXISTANT VÉRIFIÉ |
| Parcours hors contrat | Connexion, inscription, profil, pièce jointe, notification, appel, création de rencontre : recensés non instrumentés. Chargement du fil, synchronisation entre appareils, affichage des médias, export du compte : ni instrumentés ni recensés le 12/11 — recensés au lot 1 (l'écran « Couverture » les dit), toujours sans contrat | RISQUE À TESTER — lot 3 |
| Gestes autonomes (6 jours de battements) | Délestage : niveau 0 à chaque passage · réveil : « calme » 523 fois, suspendu par la pause 41 fois · retour arrière : « inactif » 564 fois (le secret `PILOTAGE_NETLIFY_TOKEN` n'est pas posé) | EXISTANT VÉRIFIÉ |
| Réparation B de bout en bout | Aucune enquête n'a tourné depuis #370 (13/09). La PR de l'agent naît sous `GITHUB_TOKEN` : sans CI, et son auto-fusion ne peut plus s'armer (`claude-code.yml` l.915, l.1093) | RISQUE À TESTER — lot 2 |
| Alerte de modération | `moderation-alerte.yml` l.73 : `node …; code=$?` sous `bash -e` — le code 3 d'alerte tue l'étape avant l'ouverture de l'issue (le piège corrigé dans `digest.yml` l.78). 60 passages verts sur 60 : la condition d'alerte ne s'est jamais présentée ; le jour où elle se présente, le run rougit et aucune issue `[MODÉRATION]` ne s'ouvre | RISQUE À TESTER — lot 2 |
| Échelle | 16 comptes (14 confirmés), base 130 Mo sur 8 Go, `telemetry_events` 49 Mo (21 354 lignes), `cron.job_run_details` 14 Mo jamais purgée | EXISTANT VÉRIFIÉ |
| Capacité éprouvée | 100 comptes simultanés pendant 60 à 90 s (staging, Micro) ; 200 jamais validé (rouge le 07/11) ; lecture anonyme ≈ 400 req/s pendant 40 s. Aucune campagne depuis le 09/11 | EXISTANT VÉRIFIÉ (documents, non rejoué) |
| Récupération | Sauvegarde chaque nuit, chiffrée (`age`) depuis le 07/11, médias le dimanche ; restaurations exercées sur le staging les 14/09, 15/09 et 21/10. Aucune archive chiffrée déchiffrée en CI. RPO de fait 24 h (7 jours pour les médias) ; RTO non chronométré | EXISTANT VÉRIFIÉ / NON MESURÉ |
| Coût de la supervision | Supabase Pro 25 $/mois ; une veille = 2 lignes `edge_*` (purgées à 2 h) et un battement par quart d'heure ; minutes GitHub Actions et consommation de l'agent | NON MESURÉ |
| Accusés de réception | Les 4 alertes des 3 derniers jours (la télémétrie brute ne vit pas plus) : 8 envois sur 8 acceptés ET affichés — Edge en 1 s, Chrome en 0 à 13 s | EXISTANT VÉRIFIÉ |
| Nature des alertes | 25 passages au rouge en 30 jours : 21 « dernier déploiement en échec », 4 « N erreurs dans l'app ». Un rouge dure 3 h 05 en médiane, 6 h 05 au P95. Les alertes disent surtout l'état de la chaîne de livraison, pas celui des utilisateurs | EXISTANT VÉRIFIÉ |
| « Résolu » avant la preuve | Le 12/11 à 15:25:05 le téléphone reçoit « Problème résolu » : le run de 15:21 venait de DÉMARRER (une exécution en cours ne disait rien, donc vert). Il a réussi ensuite — mais rien ne le prouvait à 15:25 | DÉFAUT REPRODUIT (pilotage-chemins ⑫) — corrigé au lot 1 |
| Sentinelle dite muette | Le 12/11 de 12:00 à 12:05, orange « la Sentinelle n'a pas tourné depuis plus de 8 h » : son cron était simplement servi tard | EXISTANT VÉRIFIÉ — P1-7 |

## 2. Priorités

**P0 — sécurité, supervision aveugle, action dangereuse**

| # | Sujet | État |
|---|---|---|
| P0-1 | Déploiement expiré, non démarré, annulé ou caché derrière un run en cours : écran vert | lot 1 — TESTÉ |
| P0-2 | GitHub lu en partie (exécutions illisibles, plus de 500 issues) : écran vert | lot 1 — TESTÉ |
| P0-3 | La fonction `pilotage` jamais exécutée par un test | lot 1 — TESTÉ |
| P0-4 | L'alerte parcourt tous les comptes pour trouver le pilote (ne passe pas 100 000 inscrits) | lot 1 — TESTÉ |
| P0-5 | Migration de #843 : création de rencontre refusée (42501) si appliquée en production ; staging cassé, `main` non déployé | signalé sur #843 — hors de ce lot |
| P0-6 | `moderation-alerte.yml` : le jour d'une vraie alerte, l'étape mourait avant d'ouvrir l'issue (60 passages verts sur 60 : jamais survenu) | DÉFAUT REPRODUIT sur le banc des workflows, corrigé — PR #849, TESTÉ |

**P1 — parcours essentiels, réparations bloquées, limites de capacité**

| # | Sujet | État |
|---|---|---|
| P1-1 | « Régler » fusionnait une version que l'écran n'avait pas montrée | lot 1 — TESTÉ |
| P1-2 | Deux touchers, deux réparations (deux agents) ; deux relances, deux runs. Observé en production le 09/11 : #806 et #807 ouvertes à une seconde d'écart (21:40:27, 21:40:28), deux agents partis | lot 1 — TESTÉ |
| P1-3 | Mémoire du voyant illisible prise pour « aucun état » | lot 1 — TESTÉ |
| P1-4 | Circuit B : depuis l'audit du 06/11 la PR de l'agent naît sans CI (`GITHUB_TOKEN`, choix de sécurité : « un humain la rouvre après l'avoir lue »). Depuis le téléphone, « Régler » arme alors une auto-fusion dont les tests ne partiront jamais, et l'écran dit « les tests tournent encore ». La politique (`correctif_sentinelle`) décrit encore une fusion par la CI | lot 2 — décision humaine : qui rouvre, et d'où |
| P1-4 bis | « Régler » sur une exécution en échec lance un agent qui ne peut PAS la diagnostiquer : sa consigne dit « lis son journal (`gh run view --log-failed`) », sa liste d'outils n'a ni `gh` ni réseau (`claude-code.yml` l.550). Quatre fois sur quatre (#757 le 07/11, #806 et #807 le 09/11, #844 le 12/11) : une PR « cause NON établie », sans CI | EXISTANT VÉRIFIÉ (PR #845) — lot 2 : le journal de l'exécution fourni comme DONNÉE par l'étape de confiance du workflow, jamais un outil de plus à l'agent |
| P1-5 | Création de rencontre, connexion, inscription, chargement du fil : sans contrat. Export, synchronisation, affichage des médias, chargement du fil : absents de la couverture affichée — recensés au lot 1 (`PARCOURS_NON_INSTRUMENTES`) | lot 3 pour les contrats |
| P1-6 | Staging partagé : une migration non fusionnée bloque toutes les mises en ligne (07/11, 09/11, 12/11) | lot 2 — garde à écrire |
| P1-7 | Sentinelle dite muette à 8 h quand son cron est servi au P95 toutes les 8,9 h : fausses lignes | lot 2 — décision (réveil de cadence = politique) |
| P1-8 | `lireActivation` parcourt jusqu'à 20 000 comptes à chaque ouverture d'écran ; total faux au-delà | lot 5 — migration `pilotage_inscrits` |
| P1-9 | `securite.yml` planifié en échec le 09/11, vu par personne ; la veille lit l'âge de la sauvegarde, pas sa conclusion ; expiration de `CLAUDE_CODE_OAUTH_TOKEN` non suivie ; six jobs de `deploy.yml` sans `timeout-minutes` | lot 2 |
| P1-10 | `PILOTAGE_NETLIFY_TOKEN` absent : retour arrière d'un toucher et proposition inactifs | geste humain (§ 6) |

**P2 — rapidité, simplicité, couverture** : second canal d'alerte hors de Supabase ; sonde extérieure
(le chien de garde GitHub passe toutes les 5 h) ; délais de la chaîne en médiane et P95 à l'écran ;
version servie contre `main` (retard en fusions et en minutes) ; une ligne « à régler » sans voyant coloré (Sentinelle ou veille en échec : l'écran dit « Tout va bien » et « 1 chose à régler ») ; coût de la CI et des agents ; purge de
`cron.job_run_details` ; banc à 1 000 comptes ; déchiffrement d'une archive `age` ; RTO chronométré.

**P3** : sommaire du journal (5 fiches absentes) ; commentaires périmés (`deploy.yml` l.164,
`sentinelle-autonome.yml` l.461) ; assertion creuse `pilotage.test.mjs` (« ⑳ », `indexOf` à −1) ;
« ~2 s » de `npm run verif` (une soixantaine de suites aujourd'hui).

## 3. Lots

### Lot 1 — la vérité affichée, et la fonction exécutée (PR de ce fichier)

- **Résultat pour le pilote** : l'écran ne dit plus vert sur une mise en ligne qui n'a pas réussi ni sur
  un GitHub lu en partie ; « Régler » ne met en ligne que ce qui a été vu ; un double toucher ne lance
  qu'un agent ; l'alerte part encore à 100 000 inscrits.
- **Critères d'acceptation** : `tests/unit/pilotage-chemins.test.mjs` vert (39) ; rouge sur `main` pour
  ⑩ ⑪ ⑫ ⑯ ⑱ ㉒ ㉛ ; 26 réinjections sur 26 (`scripts/reinjections-pilotage.mjs`) ; suite unitaire
  complète et `npm run verif` verts ; `pilotage-nuage.spec.js` vert (48).
- **Périmètre** : `supabase/functions/pilotage/index.ts`, `_shared/pilotage.js`, `_shared/autonomie.js`,
  `_shared/battement.js`, leurs bancs, `edge-functions.yml` (une ligne), `package.json` (une suite dans
  `verif`). **Hors périmètre** : la page `pilotage/` (elle relaie les gestes tels quels), la politique
  d'automatisation, toute migration.
- **Risque** : CRITIQUE (`supabase/`, `.github/`, `package.json`). Contre-revue de PASSIO74 exigée par
  « Gouvernance critique ». Implémenté par Claude (Fable 5.2) ; relu par un agent indépendant.
- **Instrumentation** : battement — `lectures.memoire`, `lectures.github = ko` sur une lecture en
  partie, `gestes.essai` ; marque `pilotage_pilote` ; créneaux `edge_pilotage-relance-*`,
  `edge_pilotage-reparer-*` (purgés à 2 h par `purge_analytics_courte`).
- **Récupération** : revert de la PR ; aucune donnée à défaire (les marques et créneaux sont des lignes
  `analytics_events` sous l'auteur système, sans effet si la fonction revient en arrière).
- **État** : IMPLÉMENTÉ, TESTÉ. DÉPLOYÉ et OBSERVÉ : non — voir § 7.

### Lot 2 — la chaîne d'incident et la preuve de résolution (à ouvrir)

Circuit B éprouvé de bout en bout sur un cas contrôlé (P1-4) ; alerte de modération (P0-6) ; garde du
staging (P1-6) ; cadence de la Sentinelle (P1-7) ; surveillance des workflows que rien ne suit (P1-9) ;
un identifiant d'incident stable, ses tentatives et sa preuve de rétablissement visibles à l'écran.
Tout ce lot touche `.github/` ou la politique : CRITIQUE, une PR par sujet, contre-revue.

### Lot 3 — couverture des parcours et erreurs silencieuses (à ouvrir)

Contrats pour : chargement du fil, connexion, inscription, création de rencontre, export du compte ;
recensement honnête de ce qui reste hors contrat (synchronisation entre appareils, affichage des
médias). Risque normal (client `js/`, `_shared/contrats-actions.js` critique par son dossier).

### Lot 4 — ergonomie mobile et gestes vérifiables · Lot 5 — capacité, coûts, charge · Lot 6 — récupération

Non commencés. Lot 5 : agrégat SQL des inscrits (P1-8), scénarios du § 5, banc à 1 000 comptes sur un
staging recalé. Lot 6 : restauration d'une archive `age`, RTO chronométré, exercice sans ordinateur.

## 4. Cibles (aucune n'est mesurée tant que ce n'est pas écrit ici)

| Indicateur | Cible | Mesuré |
|---|---|---|
| Événement → voyant (site, parcours, déploiement) | ≤ 5 min (une veille) | déploiement : 3 min le 12/11 (fin du run → voyant) ; les autres NON MESURÉ |
| Voyant → notification acceptée | ≤ 10 s | 1 s le 12/11 |
| Notification → affichée par un appareil | ≤ 10 min, ≥ 95 % | 8 sur 8 en 13 s au plus (4 alertes, 9 au 12/11) — trop peu pour un taux |
| Enquête ouverte → prise en charge par l'agent | médiane ≤ 30 min | 25 à 79 min en septembre ; rien depuis |
| Rétablissement prouvé après correctif | version servie + parcours rejugé | NON MESURÉ |
| Fausses alertes (alerte sans défaut réel derrière) | < 1 par semaine | NON MESURÉ — 25 rouges en 30 jours, dont 21 pour une mise en ligne en échec : à qualifier une par une (staging, test intermittent, vrai défaut) |
| Résolution autonome des incidents éligibles (circuit B) | à fixer après le lot 2 | 0 depuis le 13/09 |
| Temps humain hebdomadaire | à fixer après deux semaines de mesure | NON MESURÉ |
| Ouverture du pilotage sur mobile (état affiché) | ≤ 3 s en 4G | NON MESURÉ |

## 5. Montée en charge — hypothèses, à éprouver (rien n'est certifié au-delà de 100 comptes simultanés)

| Inscrits | Actifs par jour (20 à 30 %) | Simultanés en pointe (2 à 5 %) | Premier mur attendu |
|---|---|---|---|
| 100 000 | 20 000 à 30 000 | 2 000 à 5 000 | connexions temps réel (500, mur dur sous spend cap) ; e-mails d'inscription |
| 300 000 | 60 000 à 90 000 | 6 000 à 15 000 | calcul Micro (60 connexions Postgres) ; `screen_view` dans `analytics_events` |
| 500 000 | 100 000 à 150 000 | 10 000 à 25 000 | tout ce qui précède, plus la sortie réseau |

Ce que la supervision elle-même coûte à ces volumes — lectures brutes à remplacer par des agrégats :
`lireActivation` (tous les comptes à chaque écran), les parcours (5 pages de 1 000 lignes, puis
« lecture partielle »), les accusés (50 lectures séquentielles à 999 notes). Corrigé au lot 1 : la
recherche du pilote. Banc : `scripts/charge-realiste.mjs` (staging seul, plafonné à 200 comptes).

## 6. Ce qui reste humain

1. Contre-revue de chaque PR critique (GitHub, compte PASSIO74) — voir § 7 pour celle du lot 1.
2. Poser `PILOTAGE_NETLIFY_TOKEN` (retour arrière d'un toucher). **Ne pas poser**
   `PILOTAGE_VEILLE_SECRET` avant que pg_cron et `pilotage-veille.yml` envoient l'en-tête : tous deux
   recevraient 401, et la veille s'arrêterait.
3. Appliquer une migration (canal ③), restaurer la production, trancher un signalement, modifier la
   politique d'automatisation : jamais une machine.
4. Staging : l'ordre « fusion, puis staging, puis production » — ou un projet jetable pour les essais
   d'une PR.

**Si le pilote est indisponible 24 à 72 h** — ce que le système tient seul : la veille (5 min), le
délestage automatique, les alertes et leur essai, les rappels d'activité, la sauvegarde nocturne. Ce
qu'il reporte : toute fusion (aucune ne part sans un toucher), tout correctif (la PR de l'agent attend),
toute décision de modération (le pré-tri masque, ne supprime pas). Ce qui reste risqué : une mise en
ligne bloquée le reste (comme le 12/11) ; un parcours hors contrat peut tomber sans rien colorer ;
personne n'est prévenu par un second canal si le téléphone ne reçoit pas.

## 7. Journal des lots

| Date | Lot | Branche · PR | État | Preuve |
|---|---|---|---|---|
| 2026-11-12 | 1 | `fix/pilotage-verite-chemins-executes` · #848 | IMPLÉMENTÉ, TESTÉ ; en attente de la contre-revue de PASSIO74 | banc 39/39, réinjections 26/26, unitaires 1 088, `verif`, navigateur 48 ; CI : audits, bancs serveur et suites à comptes réels verts |
| 2026-11-12 | 2 (premier sujet) | `fix/moderation-alerte-code-3` · #849 | IMPLÉMENTÉ, TESTÉ ; en attente de la contre-revue de PASSIO74 | étape réelle rejouée sous `bash -e` : rouge sur `main`, verte ; unitaires 1 044 |

## 8. L'incident du 12/11, chronométré (un exercice réel, pas un essai)

Heures UTC, relevées sur GitHub et au canal ①. C'est la chaîne telle qu'elle a tourné AVANT le lot 1.

| Étape | Heure | Délai |
|---|---|---|
| Premier déploiement en échec (run 43234813436) | 14:31 | — |
| Second déploiement en échec (run 43235671422) | 14:47 | le premier est resté invisible 19 min (corrigé au lot 1) |
| Voyant rouge noté par la veille | 14:50:04 | 3 min après la fin du second run |
| Notification acceptée, puis affichée (Edge, Chrome) | 14:50:05 | 1 s, puis 1 s et 13 s |
| « Régler » touché depuis le pilotage (issue #844) | 14:50:38 | 33 s après la sonnerie |
| Agent parti (run 43241416806, `claude-opus-5`, abonnement) | 14:50:41 | 3 s |
| PR de l'agent (#845) : « cause NON établie », sans CI | 14:56:42 | 6 min — sans résultat : il ne peut pas lire le journal du run (P1-4 bis) |
| Cause établie dans cette session, en lisant le journal, et signalée sur #843 | 14:54 | 4 min après la sonnerie |
| Correctif poussé par la session de #843 | 14:57 | 3 min après le signalement |
| « Problème résolu » sonné | 15:25:05 | 2 min 33 s AVANT la première mise en ligne réussie (corrigé au lot 1) |
| Première mise en ligne réussie (relance du run 43235671422) | 15:27:38 | 37 min après la sonnerie, 56 min après le premier échec |
| Version de `main` servie (`bea4fac1`, run 43248974244) | 16:01:48 | — |

Ce que l'exercice dit : la détection, l'alerte et le geste depuis le téléphone tiennent en moins d'une
minute ; ce qui a manqué, c'est un agent capable de lire pourquoi une exécution a échoué.
