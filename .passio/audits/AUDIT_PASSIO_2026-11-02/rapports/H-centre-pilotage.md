# H — Centre de pilotage — audit PASSIO 2026-11-02

Agent H. Périmètre : `/pilotage/` (page + Edge Function `pilotage` + `_shared/pilotage.js`, `croissance.js`, `autonomie.js`, `reglages.js`), `js/telemetry.js`, `js/reglages-distants.js`, `dashboard/` (atelier du poste), tests associés. Base de production lue au canal ① (`execute_sql`, lecture seule, rôle `supabase_read_only_user`) ; journaux Supabase lus par `query_logs` ; GitHub lu par `gh api` (REST). Mesures prises le 2026-11-02 entre 17:05 et 18:30 UTC. **Agrégats seulement** : aucun nom, e-mail ni uid dans ce rapport (les appareils sont désignés par un hachage).

Fichiers annexes du dossier : `H-e2e.log` (premier passage e2e, rouge), `H-dashboard-test.log` / `-2` / `-3` (601 → 603 → 604 tests), `H-npm-verif.log`, `job-*.log` (6 shards CI du run #679).

---

## 1. Rôle réel des trois surfaces (sans inventer)

### 1.1 `/pilotage/` (nuage) — LE centre de pilotage
- **Page** `pilotage/index.html` + `pilotage.js` (737 lignes, IIFE, `textContent` partout, aucun `innerHTML`) + `sw.js`, copiée telle quelle dans `dist/`. Session = celle de PASSIO (SDK Supabase, même origine) ; **un seul appel réseau applicatif** : `POST {SUPABASE_URL}/functions/v1/pilotage` avec le JWT de la session (`appeler()`). Relecture toutes les 60 s si visible, au retour au premier plan (> 20 s), au `online`, et après chaque geste ; au-delà de 3 min sans lecture réussie, voyant grisé et bandeau `#perime` (vérifié : `majEtat`, `PERIME_MS = 180 000`).
- **Quatre onglets + une vue** : Accueil (voyant, tuile « inscrits au total », « À faire » (prio 0/1) + « Pour info » (prio 2), chiffres clés, 5 derniers comptes), Croissance, Détails, Réglages, et la vue « Inscrits » (hors barre, pages de 100, action `inscrits`).
- **Edge Function** `supabase/functions/pilotage/index.ts` (1 105 lignes) : deux familles — `veille` (pg_cron `pilotage_veille` toutes les 5 min, clé anon, pas de compte) et les actions du pilote (JWT, `autorise()`). Logique pure dans `_shared/*.js` (éprouvée en Node). La fonction porte `X-Passio-Revision` (`revision.js` = `dev` dans le dépôt ; la CI `edge-functions.yml` l'écrit au déploiement).
- **Ce que la veille FAIT seule** (lu dans `veille()`) : lit santé / signalements / GitHub / sonde `release.json` / rappels push / `pilotage_audience(300)` ; calcule le verdict ; mémorise un changement dans `analytics_events` (`pilotage_etat`) ; sonne les téléphones de l'éditeur (`decideAlerte`) ; **délestage automatique** (`delestageAuto` → `reglages_distants.delestage`) ; **réveil de la Sentinelle** (`workflow_dispatch`, plafonné 2/h, 12/j en base) ; **proposition de retour arrière** (issue `humain` + push ; jamais le retrait lui-même) ; canari serveur (clé anon, un passage sur trois).

### 1.2 `dashboard/` (poste) — l'atelier
Express + SPA (vanilla), hors build Netlify. Clé `service_role` dans `.env`, **lecture seule** de la base côté serveur (ingestion `telemetry_events` par polling 5 s, pas de realtime depuis le 20/09). Fournit : flux SSE `/api/stream`, 80+ routes REST (événements, traces, intégrité `reconcile`, KPI/rétention, signups, alertes, Sentinelle locale, réparation en worktree, tests, git, Release Guardian, Command Center). **Sentinelle locale** (`server/sentinel.js`) : analyse Claude en lecture seule sur alertes `critical/high`, **réparation** (`repair.js`) dans un worktree isolé → branche `sentinelle/<date>-<id>` jamais poussée (sauf mode `DASH_SENTINEL_PRODUCTION=true`, éteint par défaut : push de la branche + PR + auto-merge natif, jamais `PUT /merge`). Autopilote local (`sentinel-autopilot.js`) : `productionDeploy: false` en dur, désactivé par défaut. Canari synthétique toutes les 15 min avec la clé anon (`observation.js`). Le Pilot mobile est retiré (`mobile.html` = renvoi).

### 1.3 Sentinelle (chaîne GitHub) — hors périmètre, vue depuis le pilotage
`sentinelle-autonome.yml` (cron `23 * * * *`, servi 4–8×/jour), `veille-production.yml` (`*/30`), `digest.yml` (06:30). Le pilotage ne fait que les LIRE (issues à labels suivis, derniers runs) et les RELANCER (`workflow_dispatch`, liste blanche `RELANCES`).

### 1.4 Inventaire indicateur → source de vérité (ce que l'écran affiche réellement)

| Surface / onglet | Indicateur | Source de vérité (fonction → requête) |
|---|---|---|
| Accueil | Voyant (couleur, titre, raisons) | `verdict(out)` sur `sante`+`github`+`signalements`+`aveugle` ; `verdictAffiche` (jamais vert si une source du voyant manque) ; rouge forcé si `disponibilite.repond === false` |
| Accueil | « À faire » / « Pour info » | `aFaire(out)` côté serveur (`_shared/pilotage.js`) — la page ne recompose rien ; `aFaire: null` → « Liste indisponible » |
| Accueil | inscrits au total (tuile) | boucle `auth.admin.listUsers` (`lireActivation`), filtre `compteCree` (ni supprimé, ni anonyme, ni sans e-mail, ni `%@passio-e2e.test`, ni éditeur/`PILOTAGE_EMAILS`) ; `tronque` au-delà de 20 pages |
| Accueil | en ligne maintenant / visiteurs 24 h | `pilotage_audience(300)` / `(86400)` : appareils et comptes DISTINCTS du public (`meta.trafic` ∉ {robot, emulation, equipe} et pas iOS+connection), fenêtre glissante sur `received_at`, `env='production'` ; repli 1 000 lignes dit `tronque` |
| Accueil | inscriptions (7 j) + tendance | `count exact` sur **`profiles.created_at`** ≥ now−7 j, vs [now−14 j, now−7 j) |
| Accueil | erreurs (7 j) + tendance | `count exact` sur **`client_errors.created_at`** (7 j glissants vs 7 j d'avant) |
| Accueil | erreurs depuis la mise en ligne | `fenetreMiseEnLigne(runs.deploy)` (dernier run `deploy.yml` sur `main` **réussi**, borné 7 j) → `client_errors` comptées sur [le, now) vs la même durée avant |
| Accueil | nouveaux comptes activés (%) | `activation(pris, gestes)` : comptes `compteMesurable` des 30 j, premier geste parmi `GESTES_ACTIVATION` (8 tables) dans les 7 j ; taux sur les comptes MÛRS seulement, `null` → « — » |
| Accueil | nouveaux comptes (5 noms) | `comptesRecents` : `profiles.username` des 30 derniers comptes créés (lecture `in(id)`), `nomLu:false` si la lecture rate |
| Détails | Le site | `sonder()` : 2 × GET `release.json` (8 s) ; `depuis` lu dans `pilotage_etat.dispoDepuis` |
| Détails | Erreurs 7 j (série, détails) | série : 7 `count exact` par jour UTC (`bornesJours`) ; détails : 1 000 dernières lignes `client_errors` (`detailsPartiels` si plafond) |
| Détails | Utilisateurs (connectés, appareils, 24 h, hors public) | `pilotage_audience` 300 s / 86 400 s |
| Détails | Inscriptions aujourd'hui / 7 j / total | `profiles.created_at` ≥ now−24 h, ≥ now−7 j ; total = celui de la tuile (`auth.users`) |
| Détails | Activation + entonnoir | `crees` (`compteCree`, 30 j) → `cohorte` (confirmés) → actifs (`activesMures + enCoursActives`) |
| Détails | Machines (pause, 3 runs) | GitHub REST : issues ouvertes (50) filtrées `issueSuivie`, dernier run de chaque workflow sur `main` ; cache isolat 2 min |
| Détails | Capacité (jauges) | `pilotage_audience` (connexions = `auth_uid` distincts 5 min), `profiles` 24 h (e-mails), `pilotage_mesures()` (taille base, stockage), télémétrie = `saturation_aveugle` (réservoir `anciens`) ou total/min, bande passante estimée (appareils 24 h × 40 × 0,75 Mo) |
| Détails | Ce que ça coûte | `coutMensuel(jauges)` : forfaits fixes + gestes des jauges orange/rouge |
| Détails | Ce qui s'est passé (7 j) | `analytics_events` `event='pilotage_etat'`, 12 derniers changements |
| Croissance | visites/inscriptions/sources/liens/campagnes | `pilotage_croissance(30)` → `croissance_jour` (agrégé chaque heure à :07 par `agreger_croissance`, dédoublonné par appareil) |
| Croissance | actifs par jour, hier, moyenne 7 j | `activite_jour` (identité `auth_uid`, hors e2e/éditeur/`meta.trafic`/dev) |
| Croissance | rétention J1/J7/J30 par semaine | cohortes `auth.users` confirmés (70 j) × `activite_jour` ; `retentionCohorte` rend `null` → « … » tant que `dernier + fin + 1` jours n'est pas passé |
| Réglages | Protection (délestage, coupures, bandeau) | `reglages_distants` (3 lignes) via `resumerReglages` |
| Réglages | Réveil / Retour arrière | présence des secrets `PILOTAGE_GITHUB_TOKEN` / `PILOTAGE_NETLIFY_TOKEN` ; dernière proposition (`analytics_events` `retour_propose`, 24 h) |
| Réglages | Alertes | `push_subscriptions` des uids de l'éditeur (`count exact`) |

### 1.5 Inventaire des gestes (page → action → garde serveur)

| Geste (écran) | `action` | Validation serveur | Journal | Anti-répétition |
|---|---|---|---|---|
| Fusionner / Refuser une PR | `fusionner` / `fermer` | `numeroValide`, PR relue sur GitHub (ouverte, non brouillon), `JETON_GH` sinon 501 | GitHub seulement | GitHub (405 si non fusionnable) |
| Réparer / Relancer | `reparer` | cible relue dans `lireGithub().aReparer` (jamais crue du téléphone) ; `enCours` → `reconfier` (jamais deux ordres) ; `REPARATIONS_MAX = 3` | GitHub (issue `[RÉPARER]`, corps `@claude` fixe) | `estReparationDuPilote` + `reparationConfiee` + `dejaConfiee` (voir §2 ⑨) |
| Confier à la Sentinelle / Lancer | `relancer` | liste blanche `RELANCES` (3 workflows) | GitHub run | aucun (un dispatch = un run ; cron GitHub `concurrency` côté workflow) |
| Pause / Reprendre | `pause` / `reprendre` | issue `TITRE_PAUSE` de PASSIO74 seulement | GitHub | « déjà en pause » |
| Traité / Rejeter un signalement | `signalement` | `STATUTS_SIGNALEMENT`, `UPDATE … WHERE status IS NULL OR 'open'` → 404 si déjà traité | `reports.handled_note` | idempotent (0 ligne → 404) |
| Rétablir / Laisser masquée | `masquage` | `decision ∈ {retablir, garder}`, `UPDATE … WHERE decision IS NULL` → 409 sinon | `contenus_masques.decide_le` | idempotent |
| Délestage / Couper / Rallumer / Bandeau / Retirer | `reglages` | `CLES_REGLAGES`, `normaliserReglage` (niveau ∈ {0,1,2}, coupures ⊂ `COUPURES_AUTORISEES`, bandeau ≤ 200 car. nettoyé), 503 si table absente | `analytics_events` `reglage_pilote` (clé + valeur, jamais l'adresse) | upsert idempotent |
| Remettre la version précédente | `retour_apercu` puis `retour_arriere` | cible `^[0-9a-f]{24}$`, re-calcul de la cible et `cible_changee`, verrou 10 min, clé HMAC `idGeste` (23505 → `retour_en_cours`), relecture du déploiement courant avant `/restore` | `analytics_events` `retour_manuel` (marque AVANT le geste), `retour_echec`, `retour_incertain` | triple (10 min, clé HMAC, relecture) |
| Voir les inscrits | `inscrits` | porte éditeur + plafond ; `pageInscrits` borne la page | — | lecture |

Tout geste passe d'abord par : `OPTIONS`/`POST` seulement → `auth.getUser()` (401) → `autorise(user, PILOTAGE_EMAILS)` (403 : e-mail CONFIRMÉ dans la liste, `COMPTE_PILOTE` en dur + secret) → `verifierPlafondEnBase(uid, "pilotage", 30/min, 600/h)` (429, compteur en base, fail-closed). **Vérifié dans les journaux Edge** (`function_edge_logs`, 24 h) : 605 appels, tous 200 sauf **1 × 401** le 01/11 à 19 h ; les appels authentifiés viennent d'un seul UA Android (6 appels le 02/11 à 07:48) et d'un `curl` (1 appel 08:15, sans rôle JWT → 401 attendu, non logué en 401 dans cette fenêtre ; à relire).

---

## 2. Matrice indicateur → définition → recalcul indépendant → écart → statut

Convention : « fonction » = ce que la fonction `pilotage` calcule (lu dans le code, ou recalculé par sa requête exacte) ; « indépendant » = ma propre requête sur les tables sources.

| # | Indicateur | Définition exacte lue | Recalcul indépendant (canal ①) | Écart | Statut |
|---|---|---|---|---|---|
| ① | Inscrits au total | `auth.users` hors supprimés/anonymes/sans e-mail/e2e/éditeur | **13** (14 `auth.users` − 1 éditeur ; 0 supprimé, 0 anonyme, 0 e2e, 1 non confirmé compté) | 0 | vérifié |
| ② | « au total » de Détails (`utilisateurs.total`) | `count(profiles)` — calculé mais la page affiche `activation.inscrits.total` (même valeur que ①) | `profiles` = 13 (l'éditeur a un profil ; le compte non confirmé n'en a pas → coïncidence 13 = 13) | 0 aujourd'hui, **définitions différentes** (`profiles` compte l'éditeur, pas les non-confirmés) — `utilisateurs.total` n'est plus affiché, dette morte | vérifié |
| ③ | Inscriptions 7 j / 7 j d'avant / jour / série | `profiles.created_at` (colonne `timestamp` SANS fuseau, `default now()` = UTC) comparée à des ISO `Z` — cohérent | `profiles` : 7 j = **0**, 7 j d'avant = **3**, 24 h = **0** ; `auth.users` (`compteCree`) : 0 / 3 / 0 | 0 aujourd'hui. ⚠ Deux définitions dans la même tuile : « inscrits au total » exclut l'éditeur et compte le non-confirmé ; « inscriptions 7 j » compte `profiles` (éditeur inclus, non-confirmés exclus, et un profil peut naître **jusqu'à 9,2 j après le compte** — mesuré : 1 cas sur 13 > 1 j, 2 cas 5 min–1 j). Une inscription peut donc être comptée le jour où la personne remplit son profil, pas le jour de son inscription (H-07) | partiellement vérifié |
| ④ | Erreurs 7 j / tendance / 24 h / série / détails | `client_errors.created_at` (`timestamptz`), 7 j glissants ; `trafic` **jamais** filtré (règle respectée) | `client_errors` : **0 ligne** sur 30 j (table vide ; cron `purge_client_errors` 30 j actif) | 0 | vérifié — mais voir H-05 : la tuile ne lit QUE `client_errors` (moniteur `platform.js`, 5/session, localhost exclu), jamais `telemetry_events.type='error'` ni les `api` en échec que la veille/Sentinelle lisent |
| ⑤ | Erreurs depuis la mise en ligne | dernier run `deploy.yml` réussi sur `main` : #679 `6ea94e11`, `updated_at` 13:39:01 Z ; fenêtre [13:39, now) vs même durée avant | `client_errors` = 0 / 0 → « 0 · 0 sur les 4 h d'avant », tendance `stable` | 0 | vérifié |
| ⑥ | Activation 7 j | `activation()` sur `listUsers` + 8 tables ; `dateUtc` lit `timestamp` naïfs en UTC | Requête `sqlActivation()` générée : cohorte **4**, mûres 4, actives 2, en cours 0, **taux 50 %**. Requête indépendante (`least(min(...))` sur 8 tables, `timestamptz` natifs) : cohorte 4, actives 7 j 2, jamais 2, délais 3,1–8,7 min | 0 (et égal au digest #680 : « 2 / 4 … 50 % ») | vérifié |
| ⑦ | Entonnoir créés → confirmés → actifs | `crees` (compteCree 30 j) → `cohorte` → actifs | 4 → 4 → 2 (0 compte non confirmé créé ces 30 j) | 0 | vérifié |
| ⑧ | En ligne (5 min) / visiteurs 24 h / hors public | `pilotage_audience` : `exécution refusée au rôle read-only (42501)` → logique rejouée à la main | 24 h : comptes **1**, appareils **3**, hors public **2** ; bruts : 5 appareils | ⚠ Les 3 appareils « public » = 2 appareils de l'ÉDITEUR (compte `passioadmin`, 1 616 lignes) + **le canari** (`device_id NULL`, `md5('<null>')`, 164 lignes) : `count(distinct device_id)` ignore NULL donc appareils = 2 réels, **mais « comptes actifs 24 h = 1 » est l'éditeur lui-même**. L'audience n'exclut ni l'éditeur ni les canaris (H-03) | vérifié (écart de définition) |
| ⑨ | Connexions (jauge) | `count(distinct auth_uid)` 5 min, `env='production'` | 1 (éditeur) sur 500 | 0 | vérifié |
| ⑩ | Télémétrie / minute, saturation | pire minute des 5 dernières, réservoir `anciens` (`telemetrie_debit`) ; plafond `telemetrie_plafond('anciens')` | `telemetry_events` dernière minute : 0 ; `trg_debit_lot` actif, `trg_debit_global` absent (C l'a relu) | 0 | vérifié |
| ⑪ | Croissance — visites par source | `croissance_jour` (`session/start`, `meta.src` ou `referrer`, `distinct device_id`, hors dev/trafic) | Recalcul depuis `telemetry_events` (3 jours encore en base) : 02/11 direct 2 = 2 ; 01/11 direct 4 = 4, external 2 = 2 ; 30/10 direct 1 = 1, external 1 = 1 | 0 | vérifié |
| ⑫ | Croissance — actifs par jour | `activite_jour` (auth_uid, hors éditeur/e2e/trafic/dev) | 30/10 : 1 = 1 ; 01/11 et 02/11 : 0 (le seul compte actif est l'éditeur, exclu) = 0 | 0 | vérifié |
| ⑬ | Croissance — rétention | cohortes 70 j × `activite_jour` ; `…` si fenêtre non passée | Semaine du 19/10 : 3 comptes, j1 0, **j7 1**, j30 0 ; mais `activite_jour` ne commence que le **30/10** (migration appliquée le 01/11, télémétrie brute 3 j) : les J1 des 4 cohortes sont des **0 % mesurés sur une absence de données** (fenêtre « passée » mais source inexistante) (H-04) | écart de sens | partiellement vérifié |
| ⑭ | Ce qui s'est passé (7 j) | `pilotage_etat` ≤ 7 j | **3 lignes, toutes du 28/10** (12:55 `dispo:false`, 13:00 ×2 `dispo:true`) ; aucune depuis — cohérent : voyant orange stable (« la veille signale un problème ») | 0 | vérifié — mais voir H-06 (le voyant orange est PÉRIMÉ : #627 fermée le 31/10, la veille n'écrit un état qu'au CHANGEMENT et sa dernière raison date du 28/10) |
| ⑮ | Doublons de télémétrie | `pilotage_audience` compte des DISTINCT (insensible) ; `poidsEvenement` lit `ech` | 3 jours : **193 `event_id` en double (213 copies) sur 3 107 lignes prod = 6,2 %**, 151 à < 5 s, 0 critique ; 135 sont des `perf` `ios_stat_*`/`session end` rejoués au `pagehide` (exception VOULUE) ; max 3 copies | mesure, pas un écart | vérifié (la fiche du 11/10 annonçait 18 % → 6 %) |
| ⑯ | max-rows 1 000 | `tests/unit/pilotage.test.mjs` ⑳ interdit `.limit(5000)` ; `.length` restants : `liste.length` (signalements, bornée 20 — un COMPTE affiché « ouverts »), `ouvertes.length` (réparations ≤ 50 issues), `comptes.length` (cohorte, lue par pagination `listUsers`) | `signalements.ouverts` = longueur d'une liste `limit(20)` → **affiche au plus 20** (H-08) | écart au-delà de 20 signalements ouverts | vérifié |

**Fuseaux** : toutes les fenêtres du pilotage sont des **fenêtres glissantes UTC** (`ilYa`), les séries « par jour » sont des jours **UTC** (`bornesJours`), `croissance_jour`/`activite_jour` sont des jours **UTC** (`(now() at time zone 'UTC')::date`) — cohérent entre eux, mais l'écran ne dit nulle part « UTC » et la veille, elle, fait ses heures en **Europe/Paris** (`fluxHeures`). À 23 h 30 à Paris, « inscriptions aujourd'hui » du pilotage et « 24 h » du digest ne couvrent pas le même jour (H-09, P3).

---

## 3. Registre des anomalies (`H-NN`)

Aucun **P0** : pas de lecture non autorisée, la porte de la fonction `pilotage` est fermée (401/403 vérifiés dans le code et dans les journaux), `reglages_distants` n'est accessible aux clients qu'en SELECT sur 3 colonnes (`cle, valeur, maj`), `pilotage_audience`/`pilotage_croissance`/`pilotage_mesures` sont exécutables par `service_role` seul (42501 mesuré pour le rôle read-only), les secrets ne sortent jamais de la fonction.

| ID | Gravité | Constat (preuve) | Impact | Cause | Correctif | Retest |
|---|---|---|---|---|---|---|
| **H-01** | **P1** | `dashboard/server/repair.js` `validatePatch` ne soumettait à la liste blanche que les en-têtes `diff --git a/… b/…`. Or `git apply` écrit sur les chemins des lignes `---`/`+++`. **Mesuré** sur un dépôt jetable : patch `diff --git a/js/a.js b/js/a.js` + `+++ b/tests/e2e/x.spec.js` → `validatePatch` = `{ok:true, files:["js/a.js"]}`, `git apply --check` = 0, `git apply` **modifie `tests/e2e/x.spec.js`**. Le correctif automatique pouvait donc réécrire un test (ce que la liste blanche existe pour interdire), la CI, une migration — et `sentinel-production.js` re-vérifie `repair.files`, qui vient de `validatePatch` : la publication automatique héritait du trou | Un modèle (ou un diagnostic hostile qui l'oriente) pouvait faire passer un correctif qui se rend vert en réécrivant le test, ou toucher `.github/` ; borné par : mode éteint par défaut, auto-merge soumis à la CI, garde « Gouvernance critique » sur `.github/`/`migrations/` | Lecture d'étiquette au lieu du contenu appliqué | **Appliqué** : `validatePatch` lit AUSSI `---`/`+++` (`/dev/null` exclu, CRLF et `\t date` tolérés) ; après `git apply`, `git status --porcelain --untracked-files=all` relit ce qui a réellement changé et refuse tout fichier hors liste blanche / hors fichiers annoncés / créé. Test ajouté `dashboard/test/repair.test.js` « REFUSE un en-tête honnête qui cache un +++ » (5 cibles + traversée + CRLF + format GNU) ; `dashboard/docs/SECURITE.md` § 4 ter | mutation (lignes ---/+++ ignorées) → rouge ; `npm test` dashboard **604/604** (5 skipped navigateur) |
| **H-02** | **P2** | `dashboard/server/sse.js` : `broadcast()` écrivait CHAQUE message à TOUS les abonnés de `/api/stream` (garde `@auth` seulement). `broadcast("sentinel", record)` (`sentinel.js:518,535`) porte `analysis` (code du dépôt, ≤ 60 000 car.) et `repair` (branche, suites) — exactement ce que `/api/sentinel*` réserve à la capacité `claude`. Un `observer`/`tester` de `DASH_EXTRA_USERS` les recevait par la bande (même famille que la fuite `/api/diagnose`) ; `test` (sortie des suites) idem | Fuite d'information vers un rôle non autorisé (poste local, rôles secondaires rarement créés) | Flux non cloisonné par rôle | **Appliqué** : `CAPACITE_PAR_TYPE` (`sentinel*` → `claude`, `test` → `tests`), `addClient(res, role)`, `peutRecevoir` (= `can`), `index.js` passe `req.session.role`. Tests ajoutés dans `dashboard/test/sse.test.js` (2) ; `SECURITE.md` § 7 bis | mutation (garde retirée) → rouge ; suite dashboard verte |
| **H-03** | **P2** | Les chiffres d'AUDIENCE du pilotage (en ligne, visiteurs 24 h, comptes actifs 24 h, connexions) **comptent l'éditeur et le canari**. Mesuré 24 h : `appareils = 3` dont 2 appareils du compte éditeur et le canari (`device_id NULL` : le `count(distinct device_id)` l'ignore, mais il reste « public » dans `l`) ; `comptes = 1` = l'éditeur. L'onglet Croissance, la veille (`usage7j` : `filtreHumain` exclut le canari) et le digest excluent éditeur/canari ; `pilotage_audience` non | « 1 compte actif 24 h » affiché à Benjamin alors que c'est lui ; à 13 inscrits, chaque chiffre d'audience est faussé de 1 à 2 ; incohérent avec Croissance et le digest (« Appareils actifs 7 j : 5 » dont 2 sont ses appareils) | `pilotage_audience` filtre `meta.trafic` et iOS+connection, pas `auth_uid` éditeur / `action = canari` | **Proposition de migration** (agent C, `migrations/`) — §4.4 ; en attendant, ouvrir la prod avec `?equipe=1` (règle du dépôt) rend l'écart nul | non retesté (SQL non applicable d'ici) |
| **H-04** | **P2** | Rétention J1/J7/J30 : `retentionCohorte` juge une fenêtre « passée » par la date du dernier compte de la cohorte, jamais par la **disponibilité de `activite_jour`** (qui commence le 30/10). Les 4 cohortes affichées (07/09 → 19/10) montrent **J1 = 0 %** et J30 = 0 % calculés sur des jours où la table n'existait pas ; seule la cohorte du 19/10 (J7 = 1/3) touche la fenêtre couverte | « 0 % reviennent » affiché pour des cohortes dont la rétention est **inconnue** — contraire à la règle du dépôt « jamais 0 % pour une fenêtre non mesurable » (le dashboard `retention.js` le fait : « cohorte antérieure à la télémétrie → exclue ») | La fonction ne reçoit pas `min(activite_jour.jour)` | **Patch proposé** (§4.3) : `pilotage_croissance` rend `activite_depuis` ; `retentionCohorte` rend `null` quand `jourMs(c.dernier) + fin < activite_depuis` ; test unitaire à ajouter dans `croissance.test.mjs`. Côté `croissance.js` (mon périmètre) le patch est écrit mais **non appliqué** : sans le champ SQL il ne changerait rien ; à livrer avec la migration | non retesté |
| **H-05** | **P2** | Les « erreurs » du pilotage (7 j, tendance, depuis la mise en ligne, détails, « erreur du jour » de À faire, `erreurs24h` de santé) lisent **uniquement `client_errors`** (moniteur `platform.js` : 5/session, localhost exclu, `window.onerror`/rejections). La table est **vide depuis 30 j** (0 ligne). Pendant ce temps `telemetry_events` prod porte 8 `api` en `error` sur 7 j (tous `http_status=0`, réseau) et la veille/Sentinelle lisent les DEUX sources (`erreursHeures` = union). Seuls `erreursJs15`/`api5xx15` du voyant lisent la télémétrie | « 0 erreur » du pilotage ≠ « erreurs » de la veille et de la Sentinelle : deux définitions sous le même mot ; une erreur JS capturée par `telemetry.js` seulement (ex. `unhandledrejection` sans `platform.js`) ne monte jamais sur l'Accueil | Historique (le pilotage est né sur `client_errors`) | Proposition : compter `client_errors` ∪ `telemetry_events` (`type='error'`, `env='production'`, `meta.synthetic` null) comme `erreursHeures` de la veille, ou renommer la tuile « erreurs signalées par le moniteur » | non retesté (Edge non déployable d'ici) |
| **H-06** | **P2** | **Voyant orange périmé** : la veille mémorise un état seulement au CHANGEMENT ; le dernier (`pilotage_etat` 28/10 13:00) dit « la veille signale un problème » (issue #627). #627 a été **fermée le 31/10 16:15** ; depuis, chaque passage rend `couleur: orange` (48 réponses « trop tôt » + 24 réponses complètes orange dans les 6 h — `net._http_response`) sans écrire de nouvelle ligne. Cause probable : `tenirVerdict` garde l'orange si la lecture GitHub est incomplète (`incomplet`), ET la lecture GitHub **échoue probablement souvent** (`gh` sans jeton : `relancesPossibles` dépend de `JETON_GH` ; deux bases appellent la veille — `pg_net/0.20.0` depuis 52.48.43.176 et `pg_net/0.20.4` depuis 108.128.60.17, 141 + 140 appels/12 h, ce que la fiche du 23/10 avait déjà vu). Non tranché d'ici : les journaux `function_logs` ne contiennent que boot/shutdown (aucun `console.log` dans la fonction) | Le téléphone voit « À surveiller · la veille signale un problème » depuis 5 jours pour une issue fermée ; le vert n'arrive jamais ; « Ce qui s'est passé » est figé au 28/10 | ① une source illisible gèle le voyant pour toujours (voulu) sans jamais le dire dans `pilotage_etat` ; ② appelant en double (autre projet Supabase ?) ; ③ absence de journalisation de la raison dans la veille | Proposition : (a) écrire une ligne `pilotage_etat` avec `tenu:true` et la raison d'incomplétude quand `vt.tenu` dure > 1 h (visible dans « Ce qui s'est passé ») ; (b) `console.log` borné des `erreursLecture` dans `veille()` ; (c) côté exploitation : poser `PILOTAGE_GITHUB_TOKEN` et identifier le second `cron.job` (hors de ce projet) | non vérifié (besoin des logs de la fonction) |
| **H-07** | **P3** | « Inscriptions (7 j) » = `profiles.created_at` ; « inscrits au total » = `auth.users` (sans éditeur, avec non-confirmés). Mesuré : 1 profil créé **9,2 j après** son compte, 2 entre 5 min et 1 j ; l'éditeur a un profil (compté dans « 7 j » s'il se réinscrivait, pas dans le total) | Une inscription peut être datée du jour où la personne remplit son profil ; les deux tuiles ne parlent pas du même ensemble | Deux sources pour « une inscription » | Proposition (Edge, non déployable d'ici) : compter les inscriptions 7 j / 24 h / série dans la même boucle `listUsers` que le total (`compteCree`, `created_at` de `auth.users`) — déjà parcourue, aucune lecture en plus | non retesté |
| **H-08** | **P3** | `signalements.ouverts = liste.length` avec `.limit(20)` → le compte affiché et la raison du voyant (« N signalement(s) à traiter ») plafonnent à **20** (0 signalement ouvert aujourd'hui : 2 lignes `dismissed`) | Au-delà de 20 signalements, le pilotage en annonce 20 | Longueur d'une liste bornée (règle « un COMPTE se compte en base ») | Proposition : `count exact head` sur `reports` `status IS NULL OR 'open'` en parallèle de la liste | non retesté |
| **H-09** | **P3** | Jours UTC partout dans le pilotage (`bornesJours`, `croissance_jour`), Europe/Paris dans la veille (`fluxHeures`) ; l'écran n'indique pas le fuseau ; `dateCourte` affiche en heure locale du téléphone | À 23 h 30 Paris, « aujourd'hui » du pilotage = demain UTC déjà commencé ; comparaisons pilotage/digest décalées d'une heure (deux en été) | Choix non dit | Proposition : libellé « (jours UTC) » sous les graphes, ou `date_trunc` en `Europe/Paris` dans `agreger_croissance` (migration) | non retesté |
| **H-10** | **P3** | `js/telemetry.js` : un appelant qui passait `meta: { ech: 1000 }` sur une ligne NON échantillonnée (99 % des lignes) la voyait partir avec ce poids (`ech` n'est pas dans `DENY_KEY`, la valeur est numérique) ; `poidsEvenement` (dashboard) et `fluxHeures` (veille) multiplient par 1 000 au plus | Un client (clé anon publique) gonfle les compteurs pondérés du dashboard/veille par 1 000 par ligne ; aucun appelant du dépôt ne le fait (mesuré : aucun `meta.ech` hors `telemetry.js`) | Le commentaire disait « posé en dernier, il gagne » : vrai seulement si `_taux < 1` | **Appliqué** : `delete ev.meta.ech` avant la pose ; verrou `tests/unit/telemetrie-pii.test.mjs` ⑦ (mutation → rouge) | `npm run verif` vert ; e2e `capacite-sans-investir`, `telemetrie-doublons`, `telemetrie-trafic` **28/28** |
| **H-11** | **P3** | `tests/e2e/pilotage-nuage.spec.js` : `await import("../../supabase/functions/_shared/pilotage.js")` est compilé en CommonJS par le chargeur ESM de Playwright **1.60.0** (version du `package-lock`) → « SyntaxError: Unexpected token 'export' », **22 tests rouges en local** (passent en CI : `npm install --no-save @playwright/test` installe 1.64.1, pas la version verrouillée) | Un banc rouge localement sur du code juste ; la CI et le poste ne testent pas la même version de Playwright | `import()` + loader Babel + `.js` ESM sans `"type":"module"` | **Appliqué** : `require()` (Node 22 `require(esm)`, hors du chargeur Playwright) aux 3 endroits ; commentaire explicatif | `pilotage-nuage.spec.js` **22/22** sous 1.60 ; `npm run verif` vert |
| H-12 | P3 (dette) | `utilisateurs.total` (`count(profiles)`) est calculé à chaque `etat` mais plus affiché depuis le 24/10 | une requête inutile par relecture | — | retirer ou aligner sur ① | — |
| H-13 | P3 (exploitation) | `X-Passio-Revision` vide dans les journaux Edge (`response.headers.x_passio_revision = ""`) sur les 294 réponses du 02/11 ; `deployment_id` version **19** (01/11 19:43) = dernier run `edge-functions.yml` (8b46aa50). Le code de `pilotage/index.ts`/`_shared` n'a pas changé depuis (compare 8b46aa50…6ea94e11 : 0 fichier) → la fonction servie EST celle du dépôt, mais la preuve par en-tête manque (l'en-tête n'est pas exposé dans les logs, ou la CI écrit `REVISION` et le log ne le capture pas) | on ne peut pas prouver depuis les logs quelle révision sert | à vérifier avec `curl -sI -X OPTIONS …/functions/v1/pilotage` depuis le poste | — |
| H-14 | info | Télémétrie PII : `redactString` masque e-mail, JWT, hex ≥ 32, data-URI ; **ne masque pas** un numéro de téléphone ni un base64 non hex sous une clé neutre ; `action`/`screen`/`endpoint` ne sont que bornés. Aucun appelant du dépôt n'y met une saisie ; limites MESURÉES et écrites dans `telemetrie-pii.test.mjs` ⑥ ⑨ (un progrès du filtre les fera rougir volontairement) | — | — | documenté, pas de correctif (le risque est au point d'appel) | vérifié |

---

## 4. Résultats techniques

### 4.1 Tests exécutés
- `node --test tests/unit/{pilotage,croissance,autonomie,autonomie-seuils-sql,reglages,trafic-hors-public,activation,digest}.test.mjs` → **103/103 verts** (1,1 s).
- Nouveau `tests/unit/telemetrie-pii.test.mjs` → **9/9 verts** ; mutation H-10 (retrait du `delete ev.meta.ech`) → ⑦ rouge. Le VRAI `telemetry.js` tourne dans une VM (mesure active, `fetch` intercepté, `setInterval` inerte) ; e-mail, JWT, téléphone, URL `?plk=` forgée, base64, hex, data-URI, objets/tableaux, clés interdites, pseudo, `user_id` non-UUID, 30 clés, `ech`/`trafic` forgés — par champ.
- `npm run verif` → **vert** (37 suites `# fail 0`, 14 gates statiques), avant et après chaque correctif.
- Playwright (`PASSIO_CHROMIUM=/usr/bin/google-chrome`, `--workers=1`, port 8105/8106) : premier passage `pilotage-nuage` + `telemetrie-*` → **1 rouge + 21 non joués** (H-11), 48 verts ; après correctif H-11 : `pilotage-nuage.spec.js` **22/22** ; `telemetrie-*.spec.js` (11 suites) **48/48** ; voisins du correctif H-10 (`capacite-sans-investir`, `telemetrie-doublons`, `telemetrie-trafic`) **28/28**.
- `cd dashboard && npm test` → **601 → 603 → 604 tests, 0 rouge**, 5 skipped (« navigateur indisponible — aucun binaire Chromium » : `test/navigateur.test.js` ne lit pas `PASSIO_CHROMIUM`, limite d'environnement). Mutations H-01 et H-02 → rouge, puis vertes après restauration.
- CI de référence (run `41452850152`, #679) : 6 shards navigateur verts (345/344/343/339/347/336 ; 1 flaky shard 6), WebKit vert, gates artefact verts — lus dans `job-*.log`.

### 4.2 Fichiers modifiés (tous dans mon périmètre)
- `js/telemetry.js` — H-10 (retrait d'un `meta.ech` fourni par l'appelant).
- `tests/unit/telemetrie-pii.test.mjs` — **nouveau** (9 tests). Non ajouté à `npm run verif` (chaîne `package.json` hors périmètre) ; la CI le ramasse par `node --test "tests/unit/*.test.mjs"` (deploy.yml:531).
- `tests/e2e/pilotage-nuage.spec.js` — H-11 (`require` au lieu de `import()`, 3 endroits).
- `dashboard/server/repair.js` — H-01 (en-têtes ---/+++ soumis à la liste blanche ; relecture `git status` après `git apply`).
- `dashboard/server/sse.js`, `dashboard/server/index.js` — H-02 (cloisonnement SSE par capacité).
- `dashboard/test/repair.test.js` (+1 test), `dashboard/test/sse.test.js` (+2 tests), `dashboard/docs/SECURITE.md` (§ 4 ter, § 7 bis).
- ⚠ `dashboard/server/repair.js` est dans le **périmètre critique** de la garde « Gouvernance critique » (deploy.yml:224) : la PR qui le portera exigera la contre-revue de PASSIO74. Aucun commit, aucun push (règle du brief).

### 4.3 Patch proposé H-04 (`_shared/croissance.js` + `pilotage_croissance`) — NON appliqué
```js
// croissance.js — retentionCohorte(c, maintenant, activiteDepuis)
const debutMesure = jourMs(activiteDepuis);                 // 1er jour présent dans activite_jour
for (const f of FENETRES_RETENTION) {
  const mure = Number.isFinite(dernier) && maintenant >= dernier + (f.fin + 1) * 864e5;
  // Fenêtre entièrement ANTÉRIEURE aux données : inconnue, jamais 0 %.
  const mesurable = !Number.isFinite(debutMesure) || jourMs(c.premier) + f.fin * 864e5 >= debutMesure;
  out[f.cle] = mure && mesurable && taille ? pct(Number(c[f.cle]) || 0, taille) : null;
}
```
```sql
-- pilotage_croissance : ajouter dans le jsonb
'activite_depuis', (select min(jour) from public.activite_jour),
-- et dans `cohortes` : min(c.cree) as premier
```

### 4.4 Migration proposée H-03 (`pilotage_audience`, agent C)
```sql
-- dans le CTE `l` : écarter le canari et les comptes de l'équipe des chiffres d'AUDIENCE (jamais des erreurs)
where t.env = 'production' and t.received_at >= v_depuis
  and coalesce(t.action, '') <> 'sentinel_observation_canary' and (t.meta->>'synthetic') is null
  and (t.auth_uid is null or not exists (select 1 from auth.users u where u.id = t.auth_uid
        and (lower(coalesce(u.email,'')) = 'passioadmin@gmail.com' or lower(coalesce(u.email,'')) like '%@passio-e2e.test')))
-- `comptes_connectes` (charge brute, jauge) peut garder l'éditeur : c'est une connexion réelle.
```
Banc : `tests/sql/migration-reglages-distants.test.sh` (47) confronte déjà `pilotage_audience` à `compterAudience` — à étendre (canari + éditeur).

### 4.5 Mesures de production retenues (agrégats)
- 14 `auth.users` (13 inscrits selon `compteCree`, 12 confirmés mesurables), 13 `profiles` ; 0 e2e, 0 supprimé, 0 en suppression.
- `client_errors` : 0 ligne (30 j). `telemetry_events` : 11 321 lignes (30/10 20:23 → 02/11), dont 3 107 prod sur 3 j ; `development` 7 700 (local `?telemetry=1`) ; `preview` 556.
- 24 h prod : 5 appareils bruts, 2 hors public (`emulation`), 2 appareils de l'éditeur (1 616 lignes, 2 plateformes), 1 canari « appareil » (NULL, 164 lignes).
- Canaris : serveur 276 (depuis 31/10 14:00, toutes les 15 min), poste 52 (le PC est allumé aujourd'hui : dernier 17:02).
- `pilotage_etat` : 228 lignes depuis le 29/09, 3 sur 7 j (28/10) ; `edge_pilotage-veille` 11 377 (plafond 1/min), `edge_pilotage` (pilote) 250 ; `reglage_pilote`, `delestage_auto`, réveil, retour : **0** (aucun geste de protection jamais posé, aucune automatisation jamais déclenchée).
- `cron.job` `pilotage_veille` : 12/12 `succeeded` par heure ; réponses 6 h : 48 « trop tôt », 24 complètes (orange, dispo, 7 avec canari).
- Doublons `event_id` 3 j : 193 (6,2 % des lignes prod), 0 index unique sur `event_id` (toujours la dette du 11/10).

---

## 5. Cohérence des trois systèmes (§7 de la mission)

**Événement A — mise en ligne #679 (`6ea94e11`, 02/11 13:25 → 13:39 UTC)**
- GitHub : run `41452850152` `success`, 15 jobs verts (digest #680 : « Déploiements main : 6 succès, 2 échec(s) » sur 2 jours — cohérent avec la liste des runs : 5f3fe85d et 8b46aa50 en `failure`, 2 `cancelled` non comptés).
- Passio servie : **non vérifiable d'ici** (`release.json` injoignable : proxy 403). La télémétrie prod porte `app_version = 6ea94e11` dès 13:39 (appareil émulation 13:39:10, Android 14:44) → la version servie est bien #679.
- Pilotage : `fenetreMiseEnLigne` prend `runs.deploy.le` = `updated_at` 13:39:01 → « erreurs depuis la mise en ligne : 0 · 0 sur les ~4 h d'avant » ; cohérent. ⚠ Le `le` du run est `updated_at` du **workflow** (fin du dernier job « Retour sur l'issue »), pas l'instant où Netlify a publié (~13:37) : écart de l'ordre de 2 min, acceptable.
- Edge Function `pilotage` : version 19 déployée le 01/11 19:43 (8b46aa50) ; **aucune source de la fonction n'a changé depuis** (compare 8b46aa50…6ea94e11 vide sur `supabase/functions/` et `pilotage/`) → la fonction servie = le dépôt, mais `X-Passio-Revision` est vide dans les logs (H-13).

**Événement B — issue `[VEILLE] #627` (ouverte 22/10, fermée 31/10 16:15 par `github-actions[bot]`, `completed`)**
- Sentinelle/veille : fermée automatiquement au premier passage sans alerte après le correctif canari (7827a388), 1 commentaire.
- Digest #680 (02/11) : « issue [VEILLE] ouverte : non » — cohérent.
- Pilotage : **divergent** — le voyant est resté « orange · la veille signale un problème » (dernière ligne `pilotage_etat` 28/10 ; 24 réponses orange sur les 6 dernières heures) alors qu'aucune issue `veille`/`humain`/`sentinelle` n'est ouverte (`gh api issues?labels=…` depuis le 27/10 : seule #627, fermée). Soit la lecture GitHub échoue à chaque veille (`tenirVerdict` tient l'orange, et l'écran du téléphone dirait « non lu : GitHub »), soit une autre raison orange existe que je ne peux pas lire sans la réponse complète de `etat` (non appelable d'ici). Les deux hypothèses pointent la même absence : **la raison de l'orange n'est journalisée nulle part** (H-06). Le digest, lui, lit GitHub avec `GITHUB_TOKEN` et voit juste.

**Événement C — canari #627 (31/10)** : télémétrie (canaris serveur depuis 31/10 14:00, poste depuis 13:57), fiche du journal, issue fermée 16:15 → les trois récits concordent.

---

## 6. Non vérifié / bloqué — prochaine action
1. **Réponse réelle de `action: "etat"`** (le JSON complet que le téléphone affiche) : la fonction n'est pas appelable depuis ici (proxy) et exige le JWT de l'éditeur. → Depuis le poste : `curl -X POST …/functions/v1/pilotage -H "Authorization: Bearer <jeton session>" -d '{"action":"etat"}' | jq '.verdict, .nonLus, .erreursLecture, .utilisateurs, .activation.inscrits'` et comparer à §2 (attendu : 13 inscrits, 0 inscriptions 7 j vs 3, 0 erreurs, activation 50 % 2/4, visiteurs 24 h 3 → 2 après H-03).
2. **Cause de l'orange tenu (H-06)** : relire `erreursLecture.github` dans la réponse ci-dessus ; vérifier la présence du secret `PILOTAGE_GITHUB_TOKEN` (Supabase › Edge Functions › pilotage › Secrets) ; identifier l'appelant `pg_net/0.20.0` (52.48.43.176) qui n'est pas ce projet.
3. **`X-Passio-Revision` servie** (H-13) : `curl -sI -X OPTIONS https://njkiyoklssvefstljemx.supabase.co/functions/v1/pilotage | grep -i x-passio-revision` depuis le poste.
4. **Déploiement des correctifs** : `js/telemetry.js` + spec + dashboard partent par PR ordinaire (le dashboard et `tests/` ne sont pas déployés par Netlify ; `dashboard/server/repair.js` déclenche la contre-revue critique). Rien de ce rapport ne touche l'Edge Function ni une migration : H-03/H-04/H-05/H-07/H-08 restent des propositions (Edge : PR + `edge-functions.yml` ; SQL : agent C, canal ③).
5. **Tests dashboard navigateur** (5 skipped) : `test/navigateur.test.js` cherche `CHROMIUM_PATH`, pas `PASSIO_CHROMIUM` → `CHROMIUM_PATH=/usr/bin/google-chrome npm test` à rejouer (non fait : 2 CPU, suite de référence sur 8080).
6. **WebKit** : `pilotage-nuage.spec.js` reste hors du socle WebKit (④ ⑧ rouges en CI le 11/10 : un `confirm()` qui n'envoie rien) — non rejoué ici (pas de WebKit installé) ; si c'est un vrai défaut iPhone, **les gestes du pilotage ne partent pas sur iPhone**. Prochaine action : `PASSIO_WEBKIT=1 npx playwright install webkit` puis la suite seule.
7. **Charge** : aucun banc de charge possible d'ici (Supabase injoignable) ; les plafonds `max-rows`, échantillon 1 500 et pagination 50 pages sont vérifiés par lecture de code et par `tests/unit/pilotage.test.mjs` ⑳, pas par exécution à l'échelle.
