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
| Mise en ligne | `release.json` sert `a5d114f4` : deux fusions de retard. DEUX causes, une par échec (journaux relus) : à 14:31 le stockage du staging en 504 (panne passagère, 2 tests) ; à 14:47 le staging migré avant la fusion de #843 (42501 sur `events`, 3 tests) — troisième fois depuis le 07/11. Rétabli à 15:27 (§ 8) | EXISTANT VÉRIFIÉ — le second signalé sur #843, corrigé là-bas |
| Exécution de la fonction `pilotage` | Aucune suite n'exécutait `index.ts` (1 559 lignes) ; écart déclaré depuis le 09/11 | DÉFAUT REPRODUIT — corrigé au lot 1 |
| Parcours jugés | 5 flux en 7 jours (2 réactions, 2 publications, 1 abonnement), un compte chacun : tous les contrats sont « insuffisant » ou « non observé » | EXISTANT VÉRIFIÉ |
| Parcours hors contrat | Connexion, inscription, profil, pièce jointe, notification, appel, création de rencontre : recensés non instrumentés. Chargement du fil, synchronisation entre appareils, affichage des médias, export du compte : ni instrumentés ni recensés le 12/11 — recensés au lot 1 (l'écran « Couverture » les dit), toujours sans contrat | RISQUE À TESTER — lot 3 |
| Gestes autonomes (6 jours de battements) | Délestage : niveau 0 à chaque passage · réveil : « calme » 523 fois, suspendu par la pause 41 fois · retour arrière : « inactif » 564 fois (le secret `PILOTAGE_NETLIFY_TOKEN` n'est pas posé) | EXISTANT VÉRIFIÉ |
| Réparation B de bout en bout | Aucune enquête n'a tourné depuis #370 (13/09). La PR de l'agent naît sous `GITHUB_TOKEN` : sans CI, et son auto-fusion ne peut plus s'armer (`claude-code.yml` l.915, l.1093) | RISQUE À TESTER — lot 2 |
| Alerte de modération | `moderation-alerte.yml` l.73 : `node …; code=$?` sous `bash -e` — le code 3 d'alerte tue l'étape avant l'ouverture de l'issue (le piège corrigé dans `digest.yml` l.78). 60 passages verts sur 60 : la condition d'alerte ne s'est jamais présentée ; le jour où elle se présente, le run rougit et aucune issue `[MODÉRATION]` ne s'ouvre | DÉFAUT REPRODUIT (étape réelle rejouée sous `bash -e`) — corrigé, #849 |
| Échelle | 16 comptes (14 confirmés), base 130 Mo sur 8 Go, `telemetry_events` 49 Mo (21 354 lignes), `cron.job_run_details` 14 Mo jamais purgée | EXISTANT VÉRIFIÉ |
| Capacité éprouvée | 100 comptes simultanés pendant 60 à 90 s (staging, Micro) ; 200 jamais validé (rouge le 07/11) ; lecture anonyme ≈ 400 req/s pendant 40 s. Aucune campagne depuis le 09/11 | EXISTANT VÉRIFIÉ (documents, non rejoué) |
| Récupération | Sauvegarde chaque nuit, chiffrée (`age`) depuis le 07/11, médias le dimanche ; restaurations exercées sur le staging les 14/09, 15/09 et 21/10. Aucune archive chiffrée déchiffrée en CI. RPO de fait 24 h (7 jours pour les médias) ; RTO non chronométré | EXISTANT VÉRIFIÉ / NON MESURÉ |
| Coût de la supervision | Supabase Pro 25 $/mois ; une veille = 2 lignes `edge_*` (purgées à 2 h) et un battement par quart d'heure ; minutes GitHub Actions et consommation de l'agent | NON MESURÉ |
| Accusés de réception | Les 4 alertes des 3 derniers jours (la télémétrie brute ne vit pas plus) : 8 envois sur 8 acceptés ET affichés — Edge en 1 s, Chrome en 0 à 13 s | EXISTANT VÉRIFIÉ |
| Nature des alertes | 25 passages au rouge en 30 jours : 21 « dernier déploiement en échec », 4 « N erreurs dans l'app ». Un rouge dure 3 h 05 en médiane, 6 h 05 au P95. Les alertes disent surtout l'état de la chaîne de livraison, pas celui des utilisateurs | EXISTANT VÉRIFIÉ |
| « Résolu » avant la preuve | Le 12/11 à 15:25:05 le téléphone reçoit « Problème résolu » : la RELANCE du run en échec venait de DÉMARRER (15:20:55, tentative 2 — même identifiant, conclusion vidée : l'échec avait disparu de la liste). Elle a réussi à 15:27:38 — mais rien ne le prouvait à 15:25 | DÉFAUT REPRODUIT (pilotage-chemins ⑫ bis, ㉙ bis) — corrigé au lot 1, après la contre-revue |
| Sentinelle dite muette | Le 12/11 de 12:00 à 12:05, orange « la Sentinelle n'a pas tourné depuis plus de 8 h » : son cron était simplement servi tard | EXISTANT VÉRIFIÉ — P1-7 |

## 2. Priorités

**P0 — sécurité, supervision aveugle, action dangereuse**

| # | Sujet | État |
|---|---|---|
| P0-1 | Déploiement expiré, non démarré, annulé ou caché derrière un run en cours : écran vert | lot 1 — TESTÉ |
| P0-2 | GitHub lu en partie (exécutions illisibles) : écran vert ; un sujet `humain` ou la pause cachés derrière cent issues d'inconnus | lot 1 — TESTÉ |
| P0-3 | La fonction `pilotage` jamais exécutée par un test | lot 1 — TESTÉ |
| P0-4 | L'alerte parcourt tous les comptes pour trouver le pilote (ne passe pas 100 000 inscrits) | lot 1 — TESTÉ |
| P0-5 | Migration de #843 : création de rencontre refusée (42501) si appliquée en production ; staging cassé, `main` non déployé (second échec du 12/11 ; le premier venait du stockage du staging) | signalé sur #843, corrigé là-bas — hors de ce lot |
| P0-6 | `moderation-alerte.yml` : le jour d'une vraie alerte, l'étape mourait avant d'ouvrir l'issue (60 passages verts sur 60 : jamais survenu) | DÉFAUT REPRODUIT sur le banc des workflows, corrigé — #849 fusionnée le 12/11 à 20:56 UTC (`bf2c37bf`), DÉPLOYÉ ; OBSERVÉ : non (aucune vraie alerte depuis : il faut un signalement de plus de 24 h) |

**P1 — parcours essentiels, réparations bloquées, limites de capacité**

| # | Sujet | État |
|---|---|---|
| P1-1 | « Régler » fusionnait une version que l'écran n'avait pas montrée | lot 1 — TESTÉ pour la fusion directe ; pour l'auto-fusion armée (tests en cours), DÉTECTION à l'écran seulement — voir P1-1 bis |
| P1-1 bis | L'auto-fusion de GitHub suit la branche après l'armement : un commit poussé ensuite par un compte qui a le droit d'écrire part s'il passe les tests. Aujourd'hui : version armée notée, ligne en tête « a changé depuis ton “Régler” », rien ne sonne, rien ne désarme | lot 2 — décision humaine (dessin au § 3) |
| P1-2 | Deux touchers, deux réparations (deux agents) ; deux relances, deux runs. Observé en production le 09/11 : #806 et #807 ouvertes à une seconde d'écart (21:40:27, 21:40:28), deux agents partis | lot 1 — TESTÉ |
| P1-3 | Mémoire du voyant illisible prise pour « aucun état » | lot 1 — TESTÉ |
| P1-4 | Circuit B : depuis l'audit du 06/11 la PR de l'agent naît sans CI (`GITHUB_TOKEN`, choix de sécurité : « un humain la rouvre après l'avoir lue »). Depuis le téléphone, « Régler » arme alors une auto-fusion dont les tests ne partiront jamais, et l'écran dit « les tests tournent encore ». La politique (`correctif_sentinelle`) décrit encore une fusion par la CI | lot 2 — décision humaine : qui rouvre, et d'où |
| P1-4 bis | « Régler » sur une exécution en échec lance un agent qui ne peut PAS la diagnostiquer : sa consigne dit « lis son journal (`gh run view --log-failed`) », sa liste d'outils n'a ni `gh` ni réseau (`claude-code.yml` l.550). Quatre fois sur quatre (#757 le 07/11, #806 et #807 le 09/11, #844 le 12/11) : une PR « cause NON établie », sans CI | EXISTANT VÉRIFIÉ (PR #845) — lot 2, **#854** : le journal de l'exécution fourni comme DONNÉE par l'étape de confiance du workflow, jamais un outil de plus à l'agent. IMPLÉMENTÉ, TESTÉ, fusionné le 12/11 à 21:24 UTC (`56318cf0`) ; OBSERVÉ : non — critère : la première réparation d'une exécution en échec dont la PR établit la cause |
| P1-5 | Création de rencontre, connexion, inscription, chargement du fil : sans contrat. Export, synchronisation, affichage des médias, chargement du fil : absents de la couverture affichée — recensés au lot 1 (`PARCOURS_NON_INSTRUMENTES`) | lot 3 pour les contrats |
| P1-6 | Staging partagé : une migration non fusionnée bloque toutes les mises en ligne (07/11, 09/11, 12/11) | lot 2 — garde à écrire |
| P1-7 | Sentinelle dite muette à 8 h quand son cron est servi au P95 toutes les 8,9 h : fausses lignes | lot 2 — décision (réveil de cadence = politique) |
| P1-8 | `lireActivation` parcourt jusqu'à 20 000 comptes à chaque ouverture d'écran ; total faux au-delà. Depuis #850 (12/11), `lireSeuils` fait un second parcours des comptes (20 pages au plus) au même moment | lot 5 — migration `pilotage_inscrits` ; y joindre les seuils |
| P1-9 | `securite.yml` planifié en échec le 09/11, vu par personne ; la veille lit l'âge de la sauvegarde, pas sa conclusion ; expiration de `CLAUDE_CODE_OAUTH_TOKEN` non suivie ; six jobs de `deploy.yml` sans `timeout-minutes`. Mesuré le 12/11 sur les 100 dernières exécutions PLANIFIÉES de chaque workflow : deux échecs que rien n'a signalés — `securite.yml` (sa seule exécution planifiée, lundi 09/11, « Secrets dans le diff » ; la suivante le 16/11) et `sentinelle-distante.yml` (11/11 à 16:10, « Installer Chromium », une panne du runner) ; les sept autres (Sentinelle, veille, sonde, secours de la veille, sauvegarde, modération, digest) : aucune en échec | lot 2 — la veille juge la CONCLUSION des passages planifiés et l'âge du dernier réussi, le scan à part et plafonné à l'attention : **#863** — fusionnée le 13/11 à 07:48 UTC (`d41f09bc`), DÉPLOYÉE (contenue dans `2a5f4338`, run 43388655130 vert, version servie) ; OBSERVÉ sur des passages lancés à la main (09:22 et 09:37 UTC) : le [TABLEAU] #504 dit « [ATTENTION] scan — securite : dernier scan complet en échec (failure le 2026-11-09 13:50 UTC) — à trier par Benjamin ». La première veille PLANIFIÉE après la fusion n'avait pas encore tourné à 13:00 UTC (la dernière : 07:05 ; ce cron est servi toutes les 5 à 8 h, § 1) ; le scan n'entre jamais dans le corps d'une [VEILLE], que « Régler » confie à un agent. Le scan à l'écran du pilote, « à trier », jamais « Régler », ses passages planifiés ET manuels comptés, et `.gitleaksignore`/`.gitleaks.toml` interdits à l'agent : **#866** (fusionnée, déployée). La veille compte aussi les scans lancés à la main, et le corps des [VEILLE] n'omet que le scan : **#874** — relecture « confirmé », fusionnée le 13/11 à 09:35 UTC (`dbceaca4`), DÉPLOYÉE (la fonction `pilotage` sert `daf7ea37`, qui la contient), OBSERVÉE sur le passage lancé à la main à 09:37 UTC sur `dbceaca4` (run 43402924526, [TABLEAU] de 09:38). `CLAUDE_CODE_OAUTH_TOKEN` et les `timeout-minutes` de `deploy.yml` : à faire |
| P1-10 | `PILOTAGE_NETLIFY_TOKEN` absent : retour arrière d'un toucher et proposition inactifs | geste humain (§ 6) |
| P1-11 | Seconde relecture de #848 : dix exécutions de la PR d'un fork chassaient la Sentinelle de la lecture (plus d'orange « muette ») ; cinquante PR de forks faisaient sortir un correctif armé de la liste ; un défaut du code dans un geste se disait « GitHub n'a pas répondu » ; la note de version armée illisible laissait dire « part en ligne » ; la consigne de réparation renvoyait vers `gh run view` | **#866** — fusionnée le 13/11 à 08:08 UTC (`f5bbab8c`), DÉPLOYÉE (révision servie par la fonction = `f5bbab8c`), OBSERVÉE en marche (battements de 08:20 et 08:35 UTC sous cette révision, toutes lectures `ok`, voyant vert ; journaux de la fonction sans avertissement ni erreur) ; les scénarios corrigés eux-mêmes ne se sont pas présentés. Banc ㊴ à ㊹, 70 réinjections ; relecture indépendante « à corriger » traitée, puis « confirmé » sur `85430dcb` : un scan illisible FIGEAIT la veille (`RUNS_DU_VOYANT` : seules les exécutions que `verdict` lit la tiennent), ses passages manuels étaient ignorés, une SyntaxError de données se disait « défaut du code », 300 PR tout juste se disaient « plus de 300 », une page en échec jetait les pages lues |
| P1-12 | « [RÉPARER] #N » sur une issue qui ne se relit pas : `set -e` tuait la marche de confiance sans un mot | **#866** — DÉPLOYÉ (13/11) ; OBSERVÉ : non (il faut une réparation sur une issue illisible) ; l'erreur standard de `gh` ne sort plus dans le journal (le faux `gh` du banc l'écrit désormais, comme le vrai) ; l'annotation dit le geste qui débloque : refermer la réparation |
| P1-13 | Les tests du pilotage local tiraient le port de leurs serveurs au sort parmi 250 et se disaient prêts dès que `/api/health` répondait : deux tirages sur le même port, et sept tests tombaient en 429 sur une PR qui ne touchait pas `dashboard/` (#866, le 12/11) — reproduit à coup sûr | **#870** — fusionnée le 13/11 à 07:50 UTC (`2a5f4338`), en CI à chaque PR depuis (prêt = la ligne d'écoute de CE processus ; port donné par le système ; 5 réinjections sur 5) |
| P1-14 | Relecture de #866, hors diff : un agent peut encore taire une trouvaille NEUVE de son propre diff par un commentaire d'exception en ligne du scan (le marqueur de gitleaks) (il ne peut pas effacer les trouvailles passées) | **#875** — refus dans la marche de publication de `claude-code.yml`. En la lisant : la garde « aucun jeton » de la même marche (`git diff \| grep -qE` sous `pipefail`) échouait OUVERTE sur un gros diff — DÉFAUT REPRODUIT sur le runner Linux (SIGPIPE, run 43397080731 : un jeton au début d'un diff de 3 Mo partait ; sous Windows, rien). La gouvernance avait la même forme : FRAGILE, montrée avec un faux `gh` qui écrit ses labels un à un (le vrai n'est pas mesuré). Corrigé : lire d'abord, chercher ensuite ; le marqueur ajouté refusé ; le contenu « binaire » lu en texte ; `.gitattributes` interdit à l'agent ; une issue disparue se dit. Neuf relectures indépendantes ; la justesse des gardes est confirmée à partir de `94a1c975` (§ 7). Fusionnée le 13/11 à 19:05 UTC (`6e90d914`), DÉPLOYÉE : run 43488826499 vert, « Déploiement production » compris, et `release.json` sert `6e90d914`. OBSERVÉ : non. La garde de publication ne s'exerce qu'à la prochaine réparation publiée par l'agent, la gouvernance à la prochaine PR `claude/issue-N` |
| P1-14 bis | Relecture de #875 : les gardes de publication ne lisaient que le diff des EXTRÉMITÉS — un jeton ou un marqueur dans un commit intermédiaire puis retiré, l'auteur d'un commit ; bornées par la base relue (un `main` qui bouge pendant le run) ; `.gitleaks.json` et `.GitAttributes` permis ; une panne de `grep`/`awk` valait « rien trouvé » ; les noms imprimés avant la garde | **#903** — fusionnée le 14/11 à 07:37 UTC (`97e4f6d4`), DÉPLOYÉE (run 43571938928 vert, « Déploiement production » compris ; `release.json` sert `97e4f6d4`). OBSERVÉ : non — la garde ne s'exerce qu'à la prochaine réparation publiée par l'agent. Relue à trois lentilles (une RÉGRESSION relevée et fermée : les noms d'une fusion n'étaient pas lus), puis vérifiée deux fois ; le dernier delta (`5aa1d802`) n'a pas été relu |
| P1-16 | Relecture de #875 : « Signaler le résultat » importait le détecteur depuis l'arbre de l'agent, qui peut modifier `supabase/functions/_shared/*.js` qu'il importe — du code de l'agent tournait avec le jeton en écriture du job. Le vérificateur adverse a été coupé par un filtre de l'API ; confirmé à la lecture du code | **#903** — fusionnée le 14/11 à 07:37 UTC (`97e4f6d4`), DÉPLOYÉE (run 43571938928 vert, « Déploiement production » compris ; `release.json` sert `97e4f6d4`). OBSERVÉ : non — la garde ne s'exerce qu'à la prochaine réparation publiée par l'agent. Relue à trois lentilles (une RÉGRESSION relevée et fermée : les noms d'une fusion n'étaient pas lus), puis vérifiée deux fois ; le dernier delta (`5aa1d802`) n'a pas été relu |
| P1-15 | Relecture de #866 : cinq trous de tests non bloquants — la branche « n'a pas abouti » du scan, le seuil de 8 jours (4 passe), au-delà de 300 PR jeter les 300 lues, une page 2 ILLISIBLE qui jette la page 1, ㊴ bis qui ne voit ni `runs["x"]` ni une déstructuration | **#878** — fusionnée le 13/11 à 10:07 UTC (`2b3432ba`) ; exercices seuls, joués à chaque PR ; 76 réinjections sur 76 |

**P2 — rapidité, simplicité, couverture** : second canal d'alerte hors de Supabase ; sonde extérieure
(le chien de garde GitHub passe toutes les 5 h) ; délais de la chaîne en médiane et P95 à l'écran ;
version servie contre `main` (retard en fusions et en minutes) ; une ligne « à régler » sans voyant coloré (Sentinelle ou veille en échec : l'écran dit « Tout va bien » et « 1 chose à régler ») ; coût de la CI et des agents ; purge de
`cron.job_run_details` ; banc à 1 000 comptes ; déchiffrement d'une archive `age` ; RTO chronométré.

**P3** : la marche « preuve » de `claude-code.yml` compte les fichiers de l'agent contre `main` relu (quand `main` a
bougé, ses changements y passent pour ceux de l'agent) — préexistant, relevé par la relecture de #903, à corriger avec un
exercice ; son affichage, lui, est inerte depuis #903 ; trois assertions `printf … | grep -q` de `tests/ci/frontiere-confiance.sh` (l.430, 434, 511), sur une petite
chaîne écrite d'un seul coup — la forme qui échouait ouverte dans #875. Seule la l.430 (le cas « motif absent ») pourrait
échouer ouverte ; 434 et 511 échoueraient fermées. Risque faible ; sommaire du journal (5 fiches absentes) ; commentaires périmés (`deploy.yml` l.164,
`sentinelle-autonome.yml` l.461) ; assertion creuse de `pilotage.test.mjs` (la réponse de la veille, `indexOf` à −1 — corrigée au lot 1) ;
« ~2 s » de `npm run verif` (une soixantaine de suites aujourd'hui).

## 3. Lots

### Lot 1 — la vérité affichée, et la fonction exécutée (PR de ce fichier)

- **Résultat pour le pilote** : l'écran ne dit plus vert sur une mise en ligne qui n'a pas réussi ni sur
  un GitHub lu en partie ; « Régler » ne met en ligne que ce qui a été vu ; un double toucher ne lance
  qu'un agent ; l'alerte part encore à 100 000 inscrits.
- **Critères d'acceptation** : `tests/unit/pilotage-chemins.test.mjs` vert (46) ; rouge sur `main` pour
  ⑩ ⑪ ⑫ ⑯ ⑱ ㉒ ㉛ ; 46 réinjections sur 46 (`scripts/reinjections-pilotage.mjs`) ; suite unitaire
  complète et `npm run verif` verts ; `pilotage-nuage.spec.js` vert (49, dont ㉝ bis et ㉝ ter).
- **Périmètre** : `supabase/functions/pilotage/index.ts`, `_shared/pilotage.js`, `_shared/autonomie.js`,
  `_shared/battement.js`, `_shared/contrats-actions.js` (quatre parcours recensés « non instrumentés »),
  leurs bancs (`tests/unit/pilotage-chemins.test.mjs`, `tests/unit/lib/fausse-base.mjs`),
  `scripts/reinjections-pilotage.mjs`, `edge-functions.yml` (une ligne), `package.json` (une suite dans
  `verif`). **Hors périmètre** : la page `pilotage/` (elle relaie les gestes tels quels), la politique
  d'automatisation, toute migration.
- **Risque** : CRITIQUE (`supabase/`, `.github/`, `package.json`). Contre-revue de PASSIO74 exigée par
  « Gouvernance critique ». Implémenté par Claude (Fable 5.2) ; relu par un agent indépendant, sans le
  contexte de l'auteur : verdict « à corriger avant fusion », huit constats dont une régression
  introduite par le lot (la veille figée par des issues de tiers) — tous corrigés dans la même PR, avec
  leur exercice et leur réinjection (fiche 🧪 du journal).
- **Limites dites** : l'auto-fusion armée n'est que détectée à l'écran (P1-1 bis) ; `timed_out` n'a jamais
  été observé dans le dépôt (traité en échec par prudence, NON VÉRIFIÉ) ; au-delà de 300 issues sous un
  même label suivi, les plus anciennes ne sont pas listées (dit à l'écran) ; au-delà de 15 PR ouvertes,
  les chantiers en trop ne sont pas listés (comptés à l'écran ; les correctifs passent devant).
- **Instrumentation** : battement — `lectures.memoire`, `lectures.github = ko` sur une lecture en
  partie, `gestes.essai` ; marque `pilotage_pilote` ; créneaux `edge_pilotage-relance-*`,
  `edge_pilotage-reparer-*` (purgés à 2 h par `purge_analytics_courte`).
- **Récupération** : revert de la PR ; aucune donnée à défaire (les marques et créneaux sont des lignes
  `analytics_events` sous l'auteur système, sans effet si la fonction revient en arrière).
- **État** : IMPLÉMENTÉ, TESTÉ, DÉPLOYÉ (#848 fusionnée le 12/11 à 20:26 UTC, `f98d8969` ; déploiements des fonctions et du site verts), OBSERVÉ EN PRODUCTION le 12/11, au sens « la révision tourne » : révision servie par la fonction = `f98d8969` ; battement de la veille de 20:35 UTC sous cette révision (`lectures.memoire = ok`, `gestes.essai = pas_du`, voyant inchangé) ; journaux de la fonction depuis : aucune lecture incomplète, aucun geste interrompu, aucune erreur. Les scénarios corrigés eux-mêmes (une mise en ligne expirée, annulée ou cachée ; un « Régler » sur une version changée) ne se sont pas présentés : NON OBSERVÉS — critère plus faible que celui de #849 et #854, dit tel quel (relecture de #866). Les suites de sa seconde relecture (P1-11) : PR des suites, § 7.

### Lot 2 — la chaîne d'incident et la preuve de résolution (fusionnés : #849, #854, #863, #866, #870, #874, #875, #878, #903)

Circuit B éprouvé de bout en bout sur un cas contrôlé (P1-4) ; alerte de modération (P0-6, **#849**) ;
garde du staging (P1-6) ; cadence de la Sentinelle (P1-7) ; surveillance des workflows que rien ne suit
(P1-9) ; un identifiant d'incident stable, ses tentatives et sa preuve de rétablissement visibles à l'écran.
Tout ce lot touche `.github/` ou la politique : CRITIQUE, une PR par sujet, contre-revue.

**Auto-fusion armée (P1-1 bis) — dessin, à décider.** Remplacer l'auto-fusion native par une fusion
DIFFÉRÉE tenue par le serveur : « Régler » note l'intention (`numero`, `sha` vu) ; la veille, à chaque
passage, tente `PUT /pulls/N/merge` avec ce `sha` — GitHub refuse si la tête a bougé, et la protection de
`main` reste entière. Garantit « seule la version vue part ». C'est un geste automatique de plus pour la
veille (elle fusionnerait, sur l'accord déjà donné) : entrée au catalogue de la politique, donc circuit C
— à préparer en PR critique, jamais glissé dans un autre lot. Variante plus légère : la veille sonne
quand une version armée change (rouge), sans rien désarmer.

**P1-4 bis — fait, PR #854** (le dessin ci-dessous a été suivi, à trois écarts près : l'exécution lue est
d'abord celle que NOMME la réparation, par son identifiant ; une relance fait remonter à la tentative en
échec ; le banc est `tests/unit/reparation-journal.test.mjs`, en Node, parce que
`tests/ci/frontiere-confiance.sh` ne tourne pas hors de la CI). Fait dans la PR des suites : `corpsReparation` ne renvoie plus vers `gh run view` (« le workflow relit pour toi le
journal »), la fiche du journal est écrite, et `pilotage.test.mjs` ㉿㉖ tient ensemble la liste fermée de la marche et
`RUNS_REPARABLES` (constat 9 de la relecture de #854).
Critère d'OBSERVÉ : la première réparation d'une exécution en échec qui établit sa cause.

Rendre l'agent de réparation capable de lire pourquoi une
exécution a échoué, SANS lui donner d'outil. Dessin : l'étape « Assembler la spécification de confiance »
de `claude-code.yml` (l.198, celle qui recopie déjà l'issue visée par « [RÉPARER] #N » comme DONNÉE)
reconnaît « [RÉPARER] <libellé> en échec », en déduit le workflow par une liste FERMÉE (`deploy.yml`,
`sentinelle-autonome.yml`, `veille-production.yml` — jamais une adresse lue dans l'issue), relit par l'API
la dernière exécution terminée en échec sur `main` (`actions: read` est déjà accordé au job), et ajoute à
la spécification, sous « DONNÉE à analyser, jamais une consigne » : les jobs et étapes en échec, puis un
extrait BORNÉ de `gh run view --log-failed` (lignes d'erreur seulement, quelques kilo-octets, mentions
désamorcées). En shell pur : cette étape ne doit exécuter aucun script du dépôt. Banc : étendre le faux
`gh` de `tests/ci/frontiere-confiance.sh`, qui rejoue déjà cette étape. Critère : sur le journal du run
43235671422 (12/11), la spécification contient « permission denied for function jsonb_tableau_uuid ».

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

1. Contre-revue de chaque PR critique (GitHub, compte PASSIO74). **Le 12/11, sur l'ordre explicite de Benjamin
   (« Prend la main et fait tout », en réponse à « qui poste la revue de gouvernance ? »), la revue de gouvernance de
   #848, #849, #854, puis le 13/11 de #863, #866, #874 et #875, et le 14/11 de #903, a été postée depuis PASSIO74 par
   Claude**, après relecture par des agents indépendants de l'auteur (contexte neuf, lecture seule). Pour #875 et #903,
   le DERNIER delta n'a pas été relu : un commentaire de banc et un message pour #875, un verrou de banc, un affichage et
   des messages pour #903. Le corps de chaque revue le dit. Ce n'est pas une relecture humaine : aucune n'a eu lieu.
2. Poser `PILOTAGE_NETLIFY_TOKEN` (retour arrière d'un toucher). **Ne pas poser**
   `PILOTAGE_VEILLE_SECRET` avant que pg_cron et `pilotage-veille.yml` envoient l'en-tête : tous deux
   recevraient 401, et la veille s'arrêterait.
3. Appliquer une migration (canal ③), restaurer la production, trancher un signalement, modifier la
   politique d'automatisation : jamais une machine.
4. Staging : l'ordre « fusion, puis staging, puis production » — ou un projet jetable pour les essais
   d'une PR.
5. ~~Trier les 64 trouvailles du scan de sécurité du 09/11~~ — FAIT le 13/11 (`.gitleaks.toml`, aucune clé secrète ; journal télémétrie). Procédure pour la prochaine fois : trier les trouvailles (Actions › « Sécurité de la chaîne », artefact
   `gitleaks-results.sarif`) : une clé publique par conception s'inscrit dans `.gitleaksignore` ; une vraie clé se
   révoque d'abord, puis s'y inscrit aussi. Jamais un agent — et depuis #866, mécaniquement : `.gitleaksignore` et
   `.gitleaks.toml` sont des chemins interdits à l'agent de réparation. Trié, relance le scan (« Run workflow ») :
   un passage réussi efface la ligne du pilotage.
6. Deux décisions de politique relevées par les relectures de #875. Rien n'est changé sans Benjamin :
   - **GL-02** : les fichiers d'exception du scan (`.gitleaksignore`, `.gitleaks.toml`, `.gitleaks*`) sont interdits à
     l'AGENT, mais ne figurent pas dans la liste critique de « Gouvernance critique ». Une PR humaine qui les modifie
     passe donc sans contre-revue.
   - **GOV-02** : une réparation n'est reconnue comme telle que par sa branche `claude/issue-<n>-<run>` ET le label
     `sentinelle` de son issue. Une branche nommée autrement est jugée humaine : la contre-revue des fichiers
     critiques s'applique, mais pas le périmètre strict d'une réparation.

**Si le pilote est indisponible 24 à 72 h** — ce que le système tient seul : la veille (5 min), le
délestage automatique, les alertes et leur essai, les rappels d'activité, la sauvegarde nocturne. Ce
qu'il reporte : toute fusion (aucune ne part sans un toucher), tout correctif (la PR de l'agent attend),
toute décision de modération (le pré-tri masque, ne supprime pas). Ce qui reste risqué : une mise en
ligne bloquée le reste (comme le 12/11) ; un parcours hors contrat peut tomber sans rien colorer ;
personne n'est prévenu par un second canal si le téléphone ne reçoit pas.

## 7. Journal des lots

| Date | Lot | Branche · PR | État | Preuve |
|---|---|---|---|---|
| 2026-11-12 | 1 | `fix/pilotage-verite-chemins-executes` · #848 | DÉPLOYÉ, OBSERVÉ (§ 3) ; relu par deux agents indépendants (huit constats, puis une seconde lecture « fusionnable » dont les suites sont P1-11) ; fusionnée à 20:26 UTC | banc 46/46, réinjections 46/46, unitaires 1 103, `verif`, navigateur 49 (après fusion de `main` à `fa09eb43`) |
| 2026-11-12 | 2 (P1-4 bis) | `fix/reparation-journal-execution` · #854 | fusionnée à 21:24 UTC ; OBSERVÉ : non (critère au § 2) ; trois relectures indépendantes (dix constats, puis six, puis « confirmé ») ; 51 réinjections sur 51 rejouées seules | banc `reparation-journal` 11/11, 46 réinjections sur 46, unitaires 1 057 ; le programme d'extraction rend la cause sur les deux journaux réels du 12/11 ; relu par un agent indépendant (dix constats traités ; sa première lecture a montré que dix protections sur onze n'étaient pas verrouillées par le banc) ; deux défauts du lot attrapés par la CI (un caractère invisible brut qui rendait le workflow illisible pour un vrai lecteur YAML ; un verrou du dépôt sur les imports) |
| 2026-11-12 | 2 (premier sujet) | `fix/moderation-alerte-code-3` · #849 | fusionnée à 20:56 UTC ; OBSERVÉ : non | étape réelle rejouée sous `bash -e` : rouge sur `main`, verte ; relu par un agent indépendant (« fusionnable », puis « confirmé » : le balayage voit désormais la forme sur deux lignes et `PIPESTATUS`) ; deux constats hors diff ouverts : l'étape « Ouvrir ou mettre à jour l'issue » n'est verrouillée par aucun test, et « Refermer » avale un échec de `gh issue list` |
| 2026-11-12 | 2 (P1-9) | `fix/veille-conclusion-crons` · #863 | contre-revue « à corriger avant fusion » (C1 passage bloqué resté « ok », C2/C3 scan qui cache la sauvegarde et se « Règle » par un agent, C5 double « Régler »…) traitée ; seconde lecture « confirmé » sur les corrections, puis un constat (partagé avec la relecture de #866) : la ligne du scan entrait dans le corps de toute [VEILLE] — traité le 13/11 | veille 32/32, 25 réinjections sur 25 ; « confirmé » sur `4ba8c655`, fusionnée le 13/11 à 07:48 UTC (`d41f09bc`), DÉPLOYÉE avec `2a5f4338` — son propre run de déploiement a été REMPLACÉ dans la file, pas joué (GitHub ne garde qu'un run en attente par groupe de concurrence) ; ⚠️ le titre du commit de fusion dit « le scan de sécurité alerte(nt) dès le premier échec » : FAUX (c'était le titre d'avant la contre-revue ; le scan est plafonné à l'attention) — rectifié en commentaire sur la PR, le commit ne se réécrit pas ; C6 (une lecture en échec referme puis rouvre la [VEILLE]) laissé ouvert |
| 2026-11-12 | 2 (P1-11, P1-12, P1-9 écran) | `fix/reparation-suites-journal` · #866 | IMPLÉMENTÉ, TESTÉ ; relecture indépendante « à corriger » (six constats dans le diff, aucune faille de sécurité ; un hors diff : « jamais un agent » n'était pas une barrière mécanique) traitée le 13/11, « confirmé » sur `85430dcb` ; fusionnée le 13/11 à 08:08 UTC (`f5bbab8c`), DÉPLOYÉE et OBSERVÉE en marche (§ 2, P1-11) | banc de la fonction 52/52 (㊴ à ㊹), banc pur 90/90 (㊴ bis tient `verdict` et `RUNS_DU_VOYANT` ensemble), `reparation-journal` 12/12, 70 réinjections ; la CI du 12/11 est tombée sur sept tests du pilotage local (P1-13, sans rapport, relancée verte) |
| 2026-11-13 | 2 (P1-9, suite) | `fix/veille-scan-manuel` · #874 | relecture indépendante « à corriger » (un scan manuel comptait sur n'importe quelle branche), puis « confirmé » sur `66c2314b` ; fusionnée à 09:35 UTC (`dbceaca4`), DÉPLOYÉE, OBSERVÉE (§ 2, P1-9) | la veille compte les scans complets (planifiés ET manuels) ; le corps des [VEILLE] n'omet que le scan ; banc 34/34, 31 réinjections sur 31 |
| 2026-11-13 | CI (P1-13) | `fix/dashboard-tests-port-unique` · #870 | fusionnée à 07:50 UTC (`2a5f4338`), déploiement vert (run 43388655130) ; hors périmètre critique | reproduit à coup sûr (deux serveurs, même port, 429) ; 3 exercices, 5 réinjections sur 5 (un blocage n'est plus compté vert) ; suite du tableau de bord : 652 réussis, 0 échec, 6 sautés |
| 2026-11-13 | 2 (P1-15) | `test/pilotage-trous-866` · #878 | fusionnée à 10:07 UTC (`2b3432ba`) ; exercices seuls, hors périmètre critique | les cinq mutations restées vertes à la relecture de #866 rougissent ; 76 réinjections sur 76 ; `pilotage-chemins` 52/52, `pilotage.test` 90/90 |
| 2026-11-13 | 2 (P1-14) | `fix/publication-jetons-gitleaks` · #875 | la preuve d'abord : l'exercice seul, joué contre la garde d'avant, ROUGE sur le runner (run 43397080731). Neuf relectures indépendantes, de `d4f25f85` à `9720ab82` : la justesse des gardes est « confirmé » dès `94a1c975` ; les relectures d'honnêteté ont ensuite corrigé titre, messages et banc, jusqu'à des cas artificiels qui contredisaient les affirmations absolues du banc. Le dernier delta (`0ab0480b`, un commentaire et un message) n'a pas été relu. Fusionnée à 19:05 UTC (`6e90d914`), DÉPLOYÉE ; OBSERVÉ : non (§ 2) | `reparation-journal` ⑬ et l'exercice de gouvernance de `sentinelle-workflows` ; réinjections : 11 sur 11, puis 32 sur 33 sur les deltas suivants (la survivante est équivalente) ; unitaires 1 150 sur 1 150 en CI |
| 2026-11-13 | 2 (P1-14 bis, P1-16) | `fix/publication-tout-ce-qui-part` · #903 | **#903** — fusionnée le 14/11 à 07:37 UTC (`97e4f6d4`), DÉPLOYÉE (run 43571938928 vert, « Déploiement production » compris ; `release.json` sert `97e4f6d4`). OBSERVÉ : non — la garde ne s'exerce qu'à la prochaine réparation publiée par l'agent. Relue à trois lentilles (une RÉGRESSION relevée et fermée : les noms d'une fusion n'étaient pas lus), puis vérifiée deux fois ; le dernier delta (`5aa1d802`) n'a pas été relu | ⑬ réécrit, ⑫ étendu, ⑭ ⑮ ⑯ neufs ; 44 réinjections sur 45 (la survivante, S20, est équivalente) ; unitaires 1 153 |

## 8. L'incident du 12/11, chronométré (un exercice réel, pas un essai)

Heures UTC, relevées sur GitHub et au canal ①. C'est la chaîne telle qu'elle a tourné AVANT le lot 1.

| Étape | Heure | Délai |
|---|---|---|
| Premier déploiement en échec (run 43234813436) — stockage du staging en 504 au dépôt d'un média, 2 tests | 14:31 | — |
| Second déploiement en échec (run 43235671422, tentative 1) — migration de #843 appliquée au staging avant fusion, 3 tests | 14:47 | le premier est resté invisible 19 min (corrigé au lot 1) |
| Voyant rouge noté par la veille | 14:50:04 | 3 min après la fin du second run |
| Notification acceptée, puis affichée (Edge, Chrome) | 14:50:05 | 1 s, puis 1 s et 13 s |
| « Régler » touché depuis le pilotage (issue #844) | 14:50:38 | 33 s après la sonnerie |
| Agent parti (run 43241416806, `claude-opus-5`, abonnement) | 14:50:41 | 3 s |
| PR de l'agent (#845) : « cause NON établie », sans CI | 14:56:42 | 6 min — sans résultat : il ne peut pas lire le journal du run (P1-4 bis) |
| Cause du SECOND échec établie dans cette session, en lisant le journal, et signalée sur #843 (le premier, passager, n'a été distingué qu'en relisant les deux journaux le soir) | 14:54 | 4 min après la sonnerie |
| Correctif poussé par la session de #843 | 14:57 | 3 min après le signalement |
| Relance du second run (`gh run rerun`, tentative 2) | 15:20:55 | l'échec disparaît de la liste des exécutions |
| « Problème résolu » sonné | 15:25:05 | 2 min 33 s AVANT la première mise en ligne réussie (corrigé au lot 1 : la tentative d'avant est relue) |
| Première mise en ligne réussie (la relance aboutit) | 15:27:38 | 37 min après la sonnerie, 56 min après le premier échec |
| Version de `main` servie (`bea4fac1`, run 43248974244) | 16:01:48 | — |

Ce que l'exercice dit : la détection, l'alerte et le geste depuis le téléphone tiennent en moins d'une
minute ; ce qui a manqué, c'est un agent capable de lire pourquoi une exécution a échoué.
