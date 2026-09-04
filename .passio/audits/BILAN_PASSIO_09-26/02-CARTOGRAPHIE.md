# Cartographie des fonctionnalités — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (main, 2026-09-04). Modèle : Claude Fable 5.1 (auditeurs de domaine et relecteurs adversariaux). Statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE. Priorités : P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future. Chaque problème a été soumis à une relecture adversariale indépendante (angles reproduction / impact / contexte) ; la priorité retenue est celle de la relecture quand elle diffère.


## Domaine « carto »

Cartographie mesurée sur le SHA c8cb8e99 par un inventaire statique reproductible (scratchpad/preuves/carto/inventaire.js → inventaire.json), une émulation Chromium 1194 (emulation-ecrans.js : parcours des 6 écrans, viewer Bobines, page « Mes passions », feuille « Créer », tour démo, captures 390×844), deux suites e2e exécutées (smoke + contextual-nav : 11/11 verts sur le port 8100 via un wrapper de config qui force le Chromium 1194 présent — le paquet 1.60 attend le build 1223, absent), et trois requêtes en lecture seule sur la prod (list_tables, information_schema.columns, pg_constraint).
Chiffres actuels : 6 écrans (feed, profiles, studio, explore, irl, messages) ; 42 fichiers js/ (40 chargés en dev, 3 injectés au build seulement) ; 1 285 fonctions `function X` top-level (1 338 fonctions sur window à l'exécution) ; 626 handlers inline (167 index.html + 459 templates JS) pour 366 interactions distinctes (le script du dépôt donne 355/601 sur 10 fichiers) ; 28 tables + 2 buckets touchés par le client sur 39 tables prod ; 3 RPC ; 3 Edge Functions ; 37 motifs de clés de stockage + 9 constantes ; 1 base IndexedDB ; 6 préfixes de canaux realtime ; 131 specs / 1 060 tests ; 15 modules ui-v*.js.
Verdict du domaine : la surface est cartographiable et cohérente avec les ADR-009/011 (aucun écran wallet/cdv, redirections en place), mais PASSIO_FUNCTIONAL_MAP.md est périmé sur tous ses chiffres. Placement : deux barres de navigation coexistent dans le DOM (legacy masquée), Bobines n'a plus d'entrée de navigation, trois vocabulaires de « mood/intention » cohabitent dans le balisage, et un doublon local vérifié : trois recherches de post à la main (openPost, shareReelInFeed, findPostAnywhere) et deux formateurs de temps relatif. Aucun doublon ne crée un défaut reproduit ; findings en P2/P3 uniquement.

### Contrôles (26)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| CARTO-C01 | Inventaire des écrans id="screen-*" d'index.html | **PROUVÉ** | test exécuté | grep -n 'id="screen-' index.html → 6 (l.508 feed, 565 profiles, 772 studio, 869 explore, 1052 irl, 1227 messages) ; émulation : goTo(x) rend .screen.active = screen-x pour les 6 (emulation-ecrans.json, captures ecran-*.jpg) |
| CARTO-C02 | Barres de navigation et onglets internes (rails d'intentions, onglets profil/explore/IRL) | **PROUVÉ** | émulation | emulation-ecrans.json.nav : #appNav (index.html:1331, 4 entrées Fil/Bobines/Créer/IRL) toutes invisibles ; #appNavV2 (ui-v2-shell.js:210-230) 5 entrées visibles Découvrir/Rencontrer/Créer/Messages/Profil ; onglets : .profile-tabs data-tab posts/photos/videos/bobines/audio (index.html:742-760), .explore-tabs Recherche/Assistant IA (872-874), .irl-ftabs Date/Distance/Horaire (1114-1132), #feedIntents data-intent discover/learn/create/meet (546-549), #moodSelector data-mood creation/learn/chill/actu gelé (532-536) |
| CARTO-C03 | Comptage des handlers inline par écran et par fichier (onclick/onchange/oninput/onkeydown/onsubmit/onkeyup/onblur/onfocus) | **PROUVÉ** | test exécuté | node inventaire.js : index.html 167 (feed 0, profiles 18, studio 5, explore 15, irl 23, messages 3, avant <main> 66, après </main> 36) ; js/ 459 {onclick 431, oninput 15, onchange 9, onkeydown 4} ; total 626 ; interactions distinctes 366 (115 depuis index.html) ; scripts/couverture-interactions.js → 601 handlers / 355 interactions sur 10 fichiers |
| CARTO-C04 | Modales, feuilles basses, viewers et pages plein écran | **PROUVÉ** | émulation | emulation-ecrans.json.overlays : #modalBackdrop présent-masqué (64 appels openModal( dans js/) ; #v2CreateSheet créé au premier tap (6 cases Publication/Bobine/Activité/Story/Live vidéo/Audio, overlay-creer.jpg) ; #reelsViewer ouvert 'reels-viewer open' 1/20, z-index 9999 (overlay-bobines.jpg) ; #passionManager ouvert : classe passions-page-open, 5/5 frères masqués, 12 portes (overlay-mes-passions.jpg) ; #tourOverlay ouvert sans erreur JS (overlay-tour.jpg) ; 29 'position:fixed' en ligne dans js/ (overlays ad hoc) |
| CARTO-C05 | Formulaires (input/textarea/select) par écran | **PROUVÉ** | inspection code | inventaire.json.ecrans[].formulaire : profiles 2 input ; studio 3 input/1 textarea/2 select ; explore 3 input ; irl 2 input/3 select ; messages 1 input ; feed 0 ; avant <main> 8 input ; après </main> 5 input/2 textarea. Émulation : champs visibles studio 1, explore 1, irl 1, messages 1 |
| CARTO-C06 | Fonctions globales par fichier js/ et total ; doublons de nom | **PROUVÉ** | test exécuté | inventaire.json.js.parFichier : total 1 285 `function X` top-level (app-02 : cf. tableau §4 de CARTOGRAPHIE.md) ; 1 338 fonctions sur window à l'exécution ; 1 seul nom déclaré 2× : `$` (app-01:7 vs app-02:1094), allowlisté scripts/audit-globals.js:22 |
| CARTO-C07 | Matrice fichier × table Supabase (.from) + RPC + buckets + Edge Functions | **PROUVÉ** | test exécuté | inventaire.json.tables : 28 tables + buckets content (app-04, app-08) et attachments (app-09) ; rpc declare_birth_year, irl_interaction_allowed (app-07:5024/5050), rechercher_passions (passions-flat.js) ; edge delete-account (app-02), notify-call (app-05, app-08), ask-ai (app-07:34) ; dashboard/server : telemetry_events 7, profiles 4, posts 1 |
| CARTO-C08 | Tables de production et tables jamais touchées par le client | **PROUVÉ** | requête base | list_tables(public) → 39 tables, toutes rls_enabled=true ; 11 sans .from() client : cdv_lives, cdv_live_steps, cdv_live_comments, cdv_live_reactions, cdv_live_followers, cdv_live_collaborators, post_collaborators, step_interactions, passion_relations (lue par la fonction SQL rechercher_passions), user_safety (via RPC), telemetry_events (POST REST telemetry.js + dashboard) |
| CARTO-C09 | Clés localStorage/sessionStorage/IndexedDB | **PROUVÉ** | test exécuté | inventaire.json.storageKeys : 37 motifs littéraux ; constantes STATE_KEY=passio_mvp_state_v1 (app-01:109), AUTH_INTENT_KEY (app-02:2588), ACCOUNT_SCOPED_KEYS (app-02:2711), OUTBOX_KEY (app-04:4580), _DEL_OUTBOX_KEY (app-04:64), _CMT_OUTBOX_KEY (app-04:462), CONV_TOMB_KEY (app-04:2211), GEO_CACHE_KEY (app-07:958), IRL_DIGEST_KEY (app-07:4127), EVENT_COMMENTS_LS_KEY (app-07:4458) ; IndexedDB passio_store/kv v1 (idb-store.js:10) ; après boot onboardé : 6 clés localStorage, 2 sessionStorage (emulation-ecrans.json.storage) |
| CARTO-C10 | Services externes et CSP (_headers / netlify.toml) | **CONFORME PAR INSPECTION** | inspection code | inventaire.json.hosts (28 hôtes) ; _headers et netlify.toml portent la MÊME CSP (connect-src supabase https+wss, tiles.openfreemap.org, api-adresse.data.gouv.fr, photon.komoot.io, tenor, giphy, stun/turn) ; MapLibre via unpkg (map-loader.js), SDK Supabase via cdn.jsdelivr.net (supabase-loader.js) ; Brevo = config Supabase, aucun code client ; Cloudflare Worker cloudflare/passio-cdn-worker.js INACTIF (PASSIO_CDN_BASE = "" app-08:2564) ; sw.js : push + notificationclick + cache (l.15,31,48,88), enregistré par pwa-detect.js:11 |
| CARTO-C11 | Modules ui-v*.js sous drapeau et ce qu'ils décorent | **CONFORME PAR INSPECTION** | inspection code | 15 fichiers ui-v*.js (CARTOGRAPHIE.md §8) ; drapeaux passio_ui_v2\|3\|4a0..4a5\|4b\|5\|6\|6a\|6b\|6c\|7 lus en tête de chaque module ; namespaces window PassioUIV2…PassioUIV7 constatés à l'exécution (emulation-ecrans.json.globals.passioNamespaces) |
| CARTO-C12 | Fichiers js/ non chargés par index.html en dev mais injectés au build | **DÉFAILLANT** | inspection code | index.html charge 40 scripts js/ ; identity-transition.js, release-guard.js injectés par scripts/build.js:96-102 après telemetry.js ; passion-context.js concaténé dans app.js (build.js:32) ; aucune balise dans index.html → le dev et les 124 suites `local` ne les exécutent pas (seule release-integrity.spec.js / passion-context.spec.js sous PASSIO_CIBLE=dist, deploy.yml:421) |
| CARTO-C13 | Spec e2e → écrans couverts (matrice) | **PROUVÉ** | test exécuté | specs-ecrans.txt (grep goTo/screen-/bootOnboarded par spec) : feed 33, profiles 21, irl 21, bobines 23, modales 17, studio 14, messages 13, explore 8, first-run 4, 48 specs sans écran identifiable ; tests-par-spec.txt : 131 specs, 1 060 `test(` ; smoke + contextual-nav exécutées : 11 passed (smoke-run.txt) |
| CARTO-C14 | Affirmations de PASSIO_FUNCTIONAL_MAP.md confrontées au code | **DÉFAILLANT** | test exécuté | 8 écrans → 6 ; 435/757 → 355/601 (script du dépôt) ou 366/626 (42 fichiers) ; 34 tables → 39 ; 25 specs/175 tests → 131/1 060 ; « cdv 52 tests » → 0 spec cdv ; passion_id sur 5 tables → 6 (user_passions) ; RLS partout → toujours vrai (39/39) |
| CARTO-C15 | Placement : portes d'ajout de passion (unicité du moteur d'écriture) | **CONFORME PAR INSPECTION** | inspection code | 4 portes (openCreateProfile app-06:3587, quickCreateProfile app-07:524, ouvrirRecherchePassionStudio app-06:3502, ouvrirRecherchePassionIRL app-07:1767) convergent vers ajouterPassionAuCompte (app-06:3677) ; quickCreateProfile appelle ajouterPassionAuCompte (app-07:527) ; en émulation la page Mes passions expose 1 seule porte d'ajout #nouveauProfilLien→openCreateProfile() |
| CARTO-C16 | Placement : boutons « Suivre » (3 surfaces) et moteur unique | **CONFORME PAR INSPECTION** | inspection code | émetteurs data-follow-uid : app-06:4674, app-07:364, app-07:464 ; toggleFollowUser (app-04:3280) retourne TOUS les boutons (app-04:3273) ; _vliveToggleFollow (app-05:4013) délègue à supaFollowUser (app-08:5293) |
| CARTO-C17 | Duplication : moteurs de recherche (utilisateurs, passions, messages) | **CONFORME PAR INSPECTION** | inspection code | searchUsers (app-04:2503) = seed local + supaSearchUsers (app-08:4423, borne + neutralisation PostgREST) : deux couches, un seul accès base ; _nmDoSearch (app-04:2421) et _globalMsgSearch (app-04:3542) = deux surfaces distinctes (nouveau message / inbox) ; passions : PassioPassions (passions-flat.js) + PassionSearchSelector unique (passion-selector.js) |
| CARTO-C18 | Duplication : rendus de carte (MapLibre/Leaflet) | **CONFORME PAR INSPECTION** | inspection code | un seul chargeur map-loader.js (shim window.L l.251-260, ensureMapLibre = ensureLeaflet l.279) ; 2 instances : initIrlMap app-07:1400 et tour démo app-08:179 (L.tileLayer no-op du shim l.255 ; tour ouvert en émulation sans erreur, tourMap 0 enfant car L chargé paresseusement) |
| CARTO-C19 | Duplication : recherche d'un post (findPostAnywhere) et formatage du temps | **DÉFAILLANT** | inspection code | grep 'state.seed.posts.find(' js/*.js → openPost app-02:6783-6785 et shareReelInFeed app-05:2964-2966 refont à la main les 3 tableaux de findPostAnywhere (app-02:4428) ; fmtTime (app-02:1116, via supaTs) vs fmtMsgTime (app-04:2370, ms seulement, appelé app-04:3525) ; escape : 3 helpers seulement (app-02:1156-1175) ; géocodage : _geocodeAddress (app-07:5743) n'est qu'un adaptateur de passioGeocode (app-07:1075) |
| CARTO-C20 | Duplication : gardes d'authentification à la main vs requireAuthentication | **PROBABLE** | inspection code | 19 appels requireAuthentication( contre 32 gardes manuelles `typeof MY_UID === "undefined" \|\| !MY_UID` / `!MY_UID)` dans js/ (grep), et 3 comptePassioReel() — CLAUDE.md : « MY_UID ne prouve PAS qu'un compte existe » ; non reproduit en émulation (hors périmètre carto, signalé) |
| CARTO-C21 | Résidus ADR-011 (Carnet de voyage) dans le code client | **CONFORME PAR INSPECTION** | inspection code | app-04:1452 et :1504 (branche `lc_` → cdv_live_comments), app-08:2012 et :5608 (kind cdv_live_step), app-02:2722 (clé passio_cdv_lives conservée volontairement) — branches mortes sans appelant vivant, aucune requête émise |
| CARTO-C22 | Clés étrangères réelles (author_id → profiles, passion_id → passions) | **PROUVÉ** | requête base | pg_constraint contype='f' → 20 FK ; posts.author_id→profiles OK ; passion_id→passions sur profiles, posts, stories, events, conversations, user_passions ; SANS FK : events.author_id, event_comments.author_id, video_lives.author_id (signalé au domaine données) |
| CARTO-C23 | Vérification directe de la prod Netlify (fichier servi) | **BLOQUÉ** | non réalisé | proxy réseau de l'environnement : accès HTTP sortant vers netlify.app refusé (403) — fait établi par l'orchestrateur, non retenté ; SHA prod = c8cb8e99 par le job « Déploiement production » vert du run 33861671142 |
| CARTO-C24 | Mesure de couverture fonctionnelle (PASSIO_COUVERTURE=1, suite complète) | **BLOQUÉ** | non réalisé | exige la suite complète (interdite au sous-agent : l'orchestrateur la lance une fois) et le Chromium 1223 attendu par @playwright/test 1.60 (seul 1194 présent, playwright install interdit) ; il faudrait `PASSIO_COUVERTURE=1 npm run couverture:mesure` sur un poste avec le navigateur aligné |
| CARTO-C25 | Suites du projet prod (comptes réels) | **BLOQUÉ** | non réalisé | authz-critical, blocage-acces, user-state-horodatage, multi-comptes, confidentialite, qa-campaign, suppression-compte exigent SUPABASE_SERVICE_ROLE_KEY et écrivent en prod ; job « Suites production (comptes réels) » vert au run CI 33861671142 |
| CARTO-C26 | Propreté du dépôt en fin d'audit | **PROUVÉ** | test exécuté | git status --short → 0 ligne ; serveur http-server 8100 arrêté (ss -ltn : 0 écoute) |

### Problèmes (9)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| CARTO-01 | **P3** | CONFIRMÉ par la relecture | PASSIO_FUNCTIONAL_MAP.md est périmé sur tous ses chiffres et décrit deux écrans retirés |
| CARTO-02 | **P3** | CONFIRMÉ par la relecture | Trois modules de garde ne tournent qu'en production : identity-transition.js, release-guard.js, passion-context.js sont absents d'index.html |
| CARTO-03 | **P3** | CONFIRMÉ par la relecture | Deux barres de navigation dans le DOM : #appNav (legacy, masquée) et #appNavV2 ; « Bobines » n'a plus d'entrée de navigation |
| CARTO-04 | **P3** | CONFIRMÉ par la relecture | Trois vocabulaires d'intention/mood coexistent dans le balisage et le code du fil |
| CARTO-05 | **P3** | CONFIRMÉ par la relecture | Recherche d'un post refaite à la main dans openPost et shareReelInFeed au lieu de findPostAnywhere |
| CARTO-06 | **P3** | CONFIRMÉ par la relecture | Deux formateurs de temps relatif : fmtTime (supaTs) et fmtMsgTime (millisecondes seulement) |
| CARTO-07 | **P3** | CONFIRMÉ par la relecture | Résidus du Carnet de voyage (ADR-011) : branches mortes vers cdv_live_comments / cdv_live_step et cloud de 11 tables prod sans usage client |
| CARTO-08 | **P3** | RÉFUTÉ par la relecture | Cloudflare CDN worker versionné mais inactif (PASSIO_CDN_BASE vide) |
| CARTO-09 | **P2** | CONFIRMÉ par la relecture | 32 gardes d'authentification manuelles (MY_UID) contre 19 requireAuthentication : deux définitions du mot « connecté » |

### CARTO-01 — PASSIO_FUNCTIONAL_MAP.md est périmé sur tous ses chiffres et décrit deux écrans retirés

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-01 |
| Priorité retenue | **P3** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Documentation de référence de la surface applicative (racine du dépôt) |
| Résultat attendu | Un document d'inventaire « mesuré » dont les chiffres se reproduisent sur main |
| Résultat observé | 8 écrans dont cdv et wallet (6 réels, ADR-009/011), 435 interactions sur 757 handlers (355/601 par le script du dépôt, 366/626 sur 42 fichiers), 34 tables (39), 25 specs/175 tests (131/1 060), « cdv 52 tests » (0 spec cdv), passion_id sur 5 tables (6) |
| Reproduction | grep -c 'id="screen-' index.html ; node scripts/couverture-interactions.js ; ls tests/e2e/*.spec.js \| wc -l ; grep -c '^\s*test(' tests/e2e/*.spec.js \| awk -F: '{s+=$2}END{print s}' ; list_tables public |
| Preuve | PASSIO_FUNCTIONAL_MAP.md:12-20 vs preuves/carto/inventaire.json, tests-par-spec.txt, list_tables ; CARTOGRAPHIE.md §9 |
| Impact utilisateur et commercial | Tout audit ou investisseur qui s'appuie sur ce document raisonne sur une application qui n'existe plus (économie interne, carnet de voyage) ; crédibilité de la qualification commerciale |
| Visibilité dans le Centre de pilotage | non — le dashboard ne surveille pas la documentation |
| Détection par la Sentinelle | non — aucune règle ne compare la doc au code |
| Proposition de correction | Régénérer les sections 1, 2 et 4 depuis les scripts (couverture-interactions.js, inventaire.js) et dater ; marquer les tableaux comme générés |
| Risque de régression | nul (documentation) |
| Effort estimé | 2 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur c8cb8e99 (ancêtre direct de la branche d'audit ; `git diff c8cb8e99..HEAD` vide sur PASSIO_FUNCTIONAL_MAP.md, index.html, tests/e2e, scripts/couverture-interactions.js, migrations/SCHEMA_PROD_REFERENCE.sql). - Écrans : `git show c8cb8e99:index.html | grep -c 'id="screen-'` → 6 (feed, profiles, studio, explore, irl, messages) ; PASSIO_FUNCTIONAL_MAP.md:10 et :18 annoncent 8 dont `cdv` et `wallet` — FAUX (ADR-009/011). - Interactions : `node scripts/couverture-interactions.js` → 601 handlers / 355 interactions ; le document (:12) dit 435 sur 757 — FAUX. - Specs : `git ls-tree c8cb8e99 tests/e2e | grep -c '.spec.js'` → 131 ; aucun fichier `cdv*` ; le document dit 25 specs (:15) et « cdv 52 tests » (:66) — FAUX. - Tests : `grep -c '^\s*test('` → 1 053 (1 088 avec `test(` non ancré ; le finding cite 1 060 selon sa propre méthode) — dans tous les cas très loin des 175 annoncés (:16). - Tables : fait établi par l'orchestrateur (list_tables → 39, toutes RLS) contre 34 (:14) ; `passion_id` : SCHEMA_PROD_REFERENCE.sql:117-255 montre 5 tables + la FK `user_passions.passion_id` citée dans les advisors (unindexed_foreign_keys) → 6 contre « 5 tables » (:70). - Le document se présente comme « Inventaire mesuré… Aucun chiffre n'est estimé » (:3) sans date de péremption ni mention des ADR : l'impact décrit (lecteur externe raisonnant sur wallet/CDV) est réel. git status --short : vide. — Correction de formulation : Formulation juste dans l'ensemble. Deux précisions : (1) indiquer la commande exacte de comptage des tests (le total varie de 1 053 à 1 088 selon l'ancrage du motif `test(`), ou citer simplement « > 1 000 » ; (2) la ligne « couverture 66/435 = 15,2 % » du document n'est pas réfutée mais rendue caduque (dénominateur 435 périmé) — le finding pourrait le dire explicitement plutôt que de laisser le chiffre hors périmètre. La priorité P2 tient : document de référence à la racine, cité comme « mesuré », sans date d'obsolescence ; risque de régression nul.
- **impact** → CONFIRMÉ (priorité proposée P3). Le défaut est réel : PASSIO_FUNCTIONAL_MAP.md:12-20 annonce 8 écrans dont `cdv` et `wallet`, 435 interactions/757 handlers, 34 tables, 25 specs, 175 tests ; sur le SHA audité `grep -c 'id="screen-' index.html` → 6, `ls tests/e2e/*.spec.js | wc -l` → 131 (cohérent avec preuves/carto/inventaire.json et tests-par-spec.txt). Aucune ADR ni fiche docs/lots-ui ne documente ce document comme volontairement figé. Mais la priorité P2 est surévaluée au regard des définitions : ce n'est ni un blocage de commercialisation ni un prérequis du lancement public, et AUCUN des sept critères d'interdiction du GO (P0 ouvert, isolation, restauration, capacité, pilotage/Sentinelle sur une fonction critique, sécurité IRL/modération, staging/prod) ne concerne la documentation. Le document se DATE lui-même (ligne 3 : « Inventaire mesuré du 2026-08-16 ») : un lecteur n'est pas trompé sur la fraîcheur, seulement sur la surface actuelle. `git log -- PASSIO_FUNCTIONAL_MAP.md` : un seul commit, 43b8ffa (PR #226, 2026-08-31) — le fichier a été versionné DÉJÀ périmé (ADR-009 du 08-29 avait retiré wallet ; ADR-011 du 08-31 retire cdv le même jour). CLAUDE.md et AGENTS.md ne le citent pas ; seuls PASSIO_PRODUCTION_READINESS.md:4 (lui aussi du 2026-08-16) et PASSIO_MASTER_CONTROL.md:90/218 y renvoient. Le risque réel est donc borné : un dossier de readiness de la même date qui fonde son « 15,2 % de couverture » (README:34) sur cet inventaire — et le présent bilan produit CARTOGRAPHIE.md qui le supplante. Effort réel d'atténuation : 10 min (bandeau d'obsolescence renvoyant à la cartographie du bilan), 2 h pour la régénération ; risque de régression nul. → P3 « optimisation future », à traiter avec la mise à jour globale du dossier de readiness. git status --short : vide. — Correction de formulation : Priorité : P2 → P3 (documentation datée, hors de tout critère d'interdiction du GO). Attendu : reformuler — un document qui se date du 2026-08-16 n'a pas à « se reproduire sur main », le manquement est l'ABSENCE de bandeau d'obsolescence et le fait d'avoir été versionné déjà périmé (43b8ffa, 2026-08-31, après ADR-009) alors que PASSIO_PRODUCTION_READINESS.md:4 le présente encore comme « l'inventaire ». Impact : à borner — « crédibilité de la qualification commerciale » n'est vraie que via le dossier de readiness de la même date qui fonde son 15,2 % de couverture dessus ; ce bilan produit CARTOGRAPHIE.md qui le supplante. Correction : ajouter en tête un bandeau « périmé, remplacé par .passio/audits/BILAN_PASSIO_09-26/… » (10 min) plutôt qu'une régénération manuelle qui se périmera au prochain lot ; si régénération, la faire par script (inventaire.js / couverture-interactions.js) et marquer les tableaux comme générés, comme proposé. Effort : 10 min (bandeau) / 2 h (régénération scriptée).

### CARTO-02 — Trois modules de garde ne tournent qu'en production : identity-transition.js, release-guard.js, passion-context.js sont absents d'index.html

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-02 |
| Priorité retenue | **P3** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Chargement des scripts (index.html) vs artefact de production (scripts/build.js) |
| Résultat attendu | Le programme testé par les 124 suites `local` est celui qui est déployé ; tout module vivant est chargé en dev |
| Résultat observé | index.html charge 40 des 42 fichiers js/ ; build.js:96-102 injecte identity-transition.js et release-guard.js après telemetry.js, build.js:32 concatène passion-context.js dans app.js. En dev et dans tout test `local`, ces trois modules n'existent pas ; seules release-integrity.spec.js et passion-context.spec.js les exercent, sous PASSIO_CIBLE=dist (deploy.yml:421) |
| Reproduction | grep -c '<script src="js/' index.html (40) ; ls js/*.js \| wc -l (42) ; grep -n 'identity-transition\\|release-guard\\|passion-context' scripts/build.js |
| Preuve | scripts/build.js:21-32 et :94-102 ; inventaire.json.js.nonChargesParIndex |
| Impact utilisateur et commercial | Une régression dans la purge de la file télémétrie à la déconnexion ou dans la garde de version n'est visible qu'en prod ; un développeur local ne voit jamais leur comportement (ordre de chargement, collisions de globals non couvertes par audit:globals sur ce chemin) |
| Visibilité dans le Centre de pilotage | partiel — le dashboard lit telemetry_events, pas l'absence d'un module |
| Détection par la Sentinelle | non |
| Proposition de correction | Charger les trois fichiers dans index.html à la place que le build leur donne (release-guard peut se contenter d'un PASSIO_RELEASE absent) et faire du build une simple inline ; ou documenter explicitement dans CLAUDE.md « modules prod-only » avec leur verrou dist |
| Risque de régression | faible (ordre de chargement à respecter : après telemetry.js, avant BUILD:APP) |
| Effort estimé | 0,5 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur la branche d'audit (HEAD f501fb7, dont c8cb8e99 est l'ancêtre ; `git diff --stat c8cb8e9 HEAD -- index.html scripts/build.js js/ tests/ .github/ playwright.config.js` est VIDE, donc l'état audité est bien celui du SHA). - `grep -c '<script src="js/' index.html` → 40 ; `ls js/*.js | wc -l` → 42 ; les noms absents d'index.html sont exactement identity-transition.js, release-guard.js, passion-context.js (aucune balise, aucun chargement dynamique : `grep` de ces noms dans js/*.js hors eux-mêmes → 0). - scripts/build.js:32 : `appJs = appFiles… + read("js/emoji-misc.js") + read("js/passion-context.js")` ; build.js:94-102 : injection de `<script src="js/identity-transition.js">` et `release-guard.js` juste après telemetry.js (index.html:53), donc avant first-run.js (l.1489) et le bloc BUILD:APP (l.1491). - Seules tests/e2e/release-integrity.spec.js:7 et passion-context.spec.js:5 référencent leurs globals, et toutes deux `test.skip(process.env.PASSIO_CIBLE !== "dist")` ; deploy.yml:416-421 les lance sous PASSIO_CIBLE=dist ; scripts/tests-isolation-socle.json:6-8 documente cette exception. - Divergence de comportement réelle et non couverte en local : js/identity-transition.js:101-116 REMPLACE `window.doLogout` (défini app-02:2945) par une enveloppe async qui attend `drain(2800)` (+400 ms de filet, l.91-95) avant d'appeler l'original, et l.54 remplace `window.fetch`. Toute suite `local` qui exerce la déconnexion (connexion-compte-existant, exploration-anonyme-vs-compte…) mesure donc un doLogout synchrone que la production n'exécute pas. — Correction de formulation : Deux retouches de formulation : (1) « collisions de globals non couvertes par audit:globals sur ce chemin » est inexact — scripts/audit-globals.js:16 lit TOUS les fichiers de js/ par readdirSync, donc les trois modules sont scannés statiquement ; ce que l'audit ne peut pas voir, c'est la substitution À L'EXÉCUTION de `window.doLogout` (identity-transition.js:115) et de `window.fetch` (l.54), qui n'existe qu'en prod. Reformuler l'impact ainsi : « la déconnexion de production est une enveloppe asynchrone (attente de drain jusqu'à ~3,2 s) que ni le dev ni les suites `local` n'exécutent ». (2) Citer deploy.yml:416-421 (env PASSIO_CIBLE=dist l.418, commande l.421) plutôt que la seule l.421. La priorité P2 est justifiée : divergence dev/prod réelle mais délibérée, documentée dans build.js et tests-isolation-socle.json, et exercée par deux specs sur l'artefact dist en CI.
- **impact** → CONFIRMÉ (priorité proposée P3). Faits exacts sur le SHA audité (c8cb8e99, ancêtre de HEAD, seuls 3 fichiers d'audit ajoutés depuis) : index.html charge 40 balises `<script src="js/`, js/ compte 42 fichiers ; scripts/build.js:32 concatène passion-context.js en queue d'app.js et build.js:96-102 injecte identity-transition.js + release-guard.js après telemetry.js ; tests/e2e/release-integrity.spec.js:7 et passion-context.spec.js:5 font `test.skip(PASSIO_CIBLE !== "dist")`. Le défaut « dev ≠ prod » est donc réel. Mais ce n'est PAS un angle mort : c'est une décision de conception explicitement commentée (build.js:17-24 et :93-95 — release-guard doit lire PASSIO_RELEASE, que seul le build fabrique ; passion-context doit s'exécuter après state/currentProfile) et couverte par un job CI DÉDIÉ sur l'artefact réel à chaque push (« Gates artefact production (dist) », deploy.yml:397-421, vert dans le run 33861671142), placé avant le job « Déploiement production ». La régression redoutée dans le finding est donc détectée avant mise en ligne, pas « uniquement en prod ». Périmètre fonctionnel des trois modules : drain de la file télémétrie au logout, signal de version skew (sans reload forcé), contexte passionnel télémétrique — aucune fonction utilisateur, aucun critère d'interdiction du GO (ni isolation des comptes, ni restauration, ni capacité, ni IRL/modération, ni staging/prod). Une fonction « invisible du pilotage ET de la Sentinelle » ne s'applique pas : ces modules SONT la source d'événements du pilotage, et leur absence en dev ne touche pas la prod. Affirmation fausse du finding : « collisions de globals non couvertes par audit:globals sur ce chemin » — scripts/audit-globals.js:16 lit TOUT js/ par readdirSync, donc les 42 fichiers, et les trois modules sont des IIFE avec garde `if (window.PassioX) return;` sans `function X` top-level (grep vide). Reste vrai : CLAUDE.md ne documente pas ces « modules prod-only » (aucune mention dans docs/, .passio/ ni CLAUDE.md — grep vide), et un développeur local ne les voit jamais. C'est une dette de documentation/ergonomie de dev, sans impact utilisateur ni commercial → P3 (optimisation future), pas P2. — Correction de formulation : Priorité : P2 → P3. Attendu : remplacer « tout module vivant est chargé en dev » par « tout module prod-only est documenté et verrouillé par un gate CI sur l'artefact » (ce second point est déjà satisfait). Observé : ajouter que la conception est documentée dans build.js:17-24/:93-95 et vérifiée par le job « Gates artefact production (dist) » (deploy.yml:397-421) AVANT tout déploiement — supprimer « n'est visible qu'en prod ». Impact : retirer la mention « collisions de globals non couvertes par audit:globals » (faux : audit-globals.js:16 scanne tout js/ ; les trois modules sont des IIFE sans function top-level) ; réduire l'impact à « divergence dev/prod non documentée dans CLAUDE.md, ergonomie de développement ». Correction : privilégier la seconde option (documenter les modules prod-only dans CLAUDE.md §Build avec leur verrou dist) plutôt que de les charger en dev — release-guard n'a rien à comparer sans PASSIO_RELEASE et passion-context exige d'être en queue du bloc app. Effort : 0,5 j → 1 h pour la documentation.

### CARTO-03 — Deux barres de navigation dans le DOM : #appNav (legacy, masquée) et #appNavV2 ; « Bobines » n'a plus d'entrée de navigation

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-03 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Navigation principale (UI-1) et accès aux Bobines |
| Résultat attendu | Une seule barre ; chaque surface majeure a une porte de navigation |
| Résultat observé | #appNav (index.html:1331, Fil/Bobines/Créer/IRL) reste dans le DOM avec ses listeners (app-08:2073-2083) mais aucune entrée n'est visible ; #appNavV2 (ui-v2-shell.js:214-230) porte Découvrir/Rencontrer/Créer/Messages/Profil. Bobines s'ouvre uniquement par les cartes, le rail de stories, la feuille « Créer » et le deep link #reel= (20 bobines de démo chargées en émulation) |
| Reproduction | node preuves/carto/emulation-ecrans.js → rapport.nav ; capture ecran-feed.jpg |
| Preuve | emulation-ecrans.json.nav (4 entrées visible:false, 5 entrées visible:true) ; index.html:1331-1352 ; ui-v2-shell.js:210-230 |
| Impact utilisateur et commercial | Dette : deux jeux de listeners clavier/clic (app-08 et ui-v2), 4 nœuds role=button masqués mais focusables selon la coupure ; produit : Bobines n'est atteignable qu'indirectement, découvrabilité réduite |
| Visibilité dans le Centre de pilotage | partiel — tel.action bobine_open (perf-ios.js:438) mesure les ouvertures, pas l'absence de porte |
| Détection par la Sentinelle | non |
| Proposition de correction | Sous drapeau UI-1 actif par défaut depuis le 2026-08-26 : décider de retirer le balisage legacy (avec le kill switch) ou de l'y confiner, et arbitrer une entrée Bobines (produit) |
| Risque de régression | moyen si retrait : kill switch passio_ui_v2="0" repose sur #appNav (ui-v2-shell.js:773-781) |
| Effort estimé | 0,5 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). SHA : HEAD f501fb7 est c8cb8e9 + 2 commits d'audit ; `git diff --stat c8cb8e9 HEAD -- index.html js styles.css` est vide, le code lu est celui du SHA audité. - index.html:1331-1352 : `<nav id="appNav">` avec 4 `.nav-item` role=button tabindex=0 (Fil, Bobines, Créer, IRL) — exact. - js/ui-v2-shell.js:209-235 (buildNav) crée `#appNavV2` à côté du legacy ; apply() l.795-796 : `legacy.hidden = true; aria-hidden="true"` (masqué, jamais retiré, commentaire l.792-794) ; kill switch l.777-781 remet `legacy.hidden=false` et retire `#appNavV2` — la dépendance au balisage legacy est réelle. - js/app-08-ui-modals-tour.js:2073-2085 : `$$(".nav-item").forEach` pose click+keydown (Enter/Espace) sur tous les nav-item, dont `bobines → openReels()` — exact. - preuves/carto/emulation-ecrans.json.nav : 4 entrées appNav visible:false, 5 entrées appNavV2 visible:true ; aucune entrée « Bobines » dans la V2 (DESTINATIONS = discover/meet/create/messages/profil) — reproduit par lecture de la preuve et du code. - ui-v2-shell.js:59-61 : la sortie de Bobines de la barre est une décision documentée (« ne sont simplement plus des raccourcis permanents ») : dette/arbitrage produit, pas un défaut fonctionnel → P3 tenu. git status --short : vide. — Correction de formulation : Deux précisions de formulation : ① « 4 nœuds role=button masqués mais focusables » est faux sous UI-1 actif — `hidden=true` + `display:none` (styles.css:7606) rend ces nœuds non focusables ; ils ne sont focusables que sous le kill switch, où ils sont VISIBLES (état voulu). Reformuler : « 4 nœuds legacy conservés avec leurs listeners, inertes tant que UI-1 est actif ». ② La liste des portes vers Bobines est incomplète : ajouter le module de fil « Bobines à découvrir » (ui-v2-shell.js:578, après la 2e carte) et l'onglet « Bobines » du profil (app-06:737) ; « découvrabilité réduite » est donc à nuancer — l'absence d'entrée de navigation est un choix documenté (ui-v2-shell.js:59-61), à traiter comme arbitrage produit, pas comme défaut.

### CARTO-04 — Trois vocabulaires d'intention/mood coexistent dans le balisage et le code du fil

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-04 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Fil : rail d'intentions, moods du Studio, rail legacy #moodSelector |
| Résultat attendu | Un vocabulaire d'affichage (PASSIO_MOOD_LABELS) et un rail |
| Résultat observé | #moodSelector (index.html:532-536) porte data-mood creation/learn/chill/actu (gelé, sans bouton) ; #feedIntents (546-549) porte data-intent discover/learn/create/meet (Explorer/Apprendre/Idées/Rencontrer) ; PASSIO_MOOD_LABELS (app-02:4780) affiche creation/learn/irl et PASSIO_MOODS_ADMIS (app-02:4818) en admet 5 ; legacyMoodToFeedIntent fait la passerelle |
| Reproduction | sed -n 532,551p index.html ; grep -n 'PASSIO_MOOD_LABELS\s*=' js/app-02-state-utils.js |
| Preuve | index.html:532-549 ; app-02:4780-4830 ; CLAUDE.md fiche 17 (« deux tables ») et 07 (« rail historique gelé ») |
| Impact utilisateur et commercial | Complexité de lecture et de test (trois clés pour une même notion), risque de régression documenté par les fiches 07/14/17 à chaque retouche du fil |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Ne rien retirer sans rouvrir le drapeau passio_feed_intents_v1 ; consolider la documentation dans une seule fiche « vocabulaire du fil » et retirer #moodSelector quand le drapeau sera supprimé |
| Risque de régression | moyen (les valeurs sont écrites dans posts.mood) |
| Effort estimé | 1 j après suppression du drapeau |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit sur le dépôt : `git diff --stat c8cb8e99 HEAD -- index.html js/app-02-state-utils.js` est vide (les deux commits d'audit au-dessus du SHA audité ne touchent que .passio/), donc les lignes lues sont celles du SHA c8cb8e99. - index.html:532-536 : `#moodSelector` avec 4 `.mood-btn` data-mood creation/learn/chill/actu (Création/Apprendre/Chill/Actu) — vocabulaire ①. - index.html:538-549 : `#feedIntentSelector` (et non `#feedIntents`) avec data-intent discover/learn/create/meet (Explorer/Apprendre/Idées/Rencontrer) — vocabulaire ②. - js/app-02-state-utils.js:4780-4784 : `PASSIO_MOOD_LABELS = {creation, learn, irl}` (Idées/Apprendre/Rencontrer) ; 4818-4825 : `PASSIO_MOODS_ADMIS` = ces 3 + chill + actu (5) — vocabulaire ③ (valeurs `posts.mood`). - app-02:4746-4751 : `legacyMoodToFeedIntent` fait la passerelle creation→create, learn→learn, irl→meet, reste→"generic". - app-02:4886-4891 `syncFeedIntentUi` : le rail legacy est masqué (`legacy.hidden = enabled`) mais reste dans le DOM et garde son écouteur (`setupMoodDelegation`, 4966-4988, `toggleMood`) ; kill switch `passio_feed_intents_v1="0"` (4666) le réactive. Le constat (trois clés pour une même notion, passerelle, rail gelé toujours câblé) est réel. C'est une dette de lisibilité documentée par CLAUDE.md fiches 07/14/17, sans défaut fonctionnel reproduit : P3 justifié. — Correction de formulation : Deux imprécisions de formulation dans « observé » : (1) le rail d'intentions a pour id `#feedIntentSelector` (index.html:538), pas `#feedIntents` — `feedIntents` est le champ d'état `state.feedIntents` (app-02:76) ; (2) `#moodSelector` n'est pas « sans bouton » : il porte 4 boutons (Création/Apprendre/Chill/Actu) et un écouteur de délégation actif (`setupMoodDelegation`, app-02:4966), il est seulement masqué par `syncFeedIntentUi` (app-02:4889) tant que le drapeau `passio_feed_intents_v1` n'est pas à "0" — ce qui est plutôt « masqué mais toujours câblé » (ce qu'on voulait sans doute dire par « sans bouton Tous »). Les autres champs (preuve, impact, effort, risque) sont exacts.

### CARTO-05 — Recherche d'un post refaite à la main dans openPost et shareReelInFeed au lieu de findPostAnywhere

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-05 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Détail d'un post (app-02) et partage d'une bobine dans le fil (app-05) |
| Résultat attendu | Invariant CLAUDE.md : toujours findPostAnywhere(id) |
| Résultat observé | openPost (app-02:6783-6785) et shareReelInFeed (app-05:2964-2966) enchaînent seed.posts.find \|\| userPosts.find \|\| supabasePosts.find ; findPostAnywhere (app-02:4428) couvre les mêmes trois tableaux, donc aucun défaut fonctionnel aujourd'hui, mais tout élargissement de findPostAnywhere (ex. _feedExtraPosts) laisserait ces deux copies derrière |
| Reproduction | grep -n 'state.seed.posts.find(' js/*.js |
| Preuve | js/app-02-state-utils.js:6783 ; js/app-05-config-profil.js:2964 ; js/app-02-state-utils.js:4428 |
| Impact utilisateur et commercial | Dette et contradiction avec l'invariant écrit ; un post trouvé par le fil mais pas par la copie donnerait « Le contenu original n'est plus disponible » |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non — audit-passio ne grep pas ce motif |
| Proposition de correction | Remplacer les deux chaînes par findPostAnywhere(id) ; ajouter le motif à scripts/audit-*.js |
| Risque de régression | nul |
| Effort estimé | 0,5 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit sur le SHA audité c8cb8e99 (git show c8cb8e99:js/app-02-state-utils.js | sed -n '4428p;6783,6785p' et git show c8cb8e99:js/app-05-config-profil.js | sed -n '2964,2966p') : les lignes citées sont exactes et identiques au worktree courant. - app-02:4428 `function findPostAnywhere(id)` couvre seed.posts → userPosts → supabasePosts (4429-4432), et ne connaît PAS `window._feedExtraPosts` (qui n'entre dans le fil qu'à app-02:5089). - app-02:6783-6785 `openPost` et app-05:2964-2966 `shareReelInFeed` refont la même chaîne à la main (grep -n 'seed.posts.find(' js/*.js rend exactement ces 2 occurrences). - Les trois tableaux étant les mêmes, aucun défaut fonctionnel aujourd'hui : le finding le dit lui-même, c'est une dette/contradiction avec l'invariant CLAUDE.md « toujours findPostAnywhere(id) ». P3 justifié. - Nuance sur la détection : le motif EST déjà connu de l'outillage de revue — `.claude/agents/audit-passio.md:13` demande de signaler `seed.posts.find || userPosts.find`, et `scripts/dossier-revue.js:128-131` porte une règle `recherche-post` (motif /(seed\.posts\.find|userPosts\.find|supabasePosts\.find)/, gravité haute). Ces outils ne s'exercent que sur un DIFF (revue/`npm run revue`), pas sur le code existant ni en CI : c'est pour cela que les deux copies historiques survivent. La Sentinelle (dashboard) n'observe pas le code source : « non » reste juste pour elle. git status --short : vide. — Correction de formulation : Champ « detection_sentinelle » à reformuler : « non par la Sentinelle (elle n'analyse pas le code source) ; le motif est déjà connu de la revue de diff (.claude/agents/audit-passio.md:13 et règle `recherche-post` de scripts/dossier-revue.js:128-131) mais ces outils ne balaient que les diffs, jamais le code existant ni la CI » — au lieu de « audit-passio ne grep pas ce motif », qui est faux. Proposition de correction à préciser : ajouter la règle `recherche-post` à un gate CI sur tout js/app-*.js (ex. scripts/audit-*.js exécuté par `npm run verif`), avec une exemption pour la définition de findPostAnywhere/allPostCopies elle-même. Impact à nuancer : purement dette aujourd'hui, la couverture des deux copies est identique à celle de findPostAnywhere.

### CARTO-06 — Deux formateurs de temps relatif : fmtTime (supaTs) et fmtMsgTime (millisecondes seulement)

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-06 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Affichage des horodatages (fil vs inbox Messages) |
| Résultat attendu | Un seul formateur passant par supaTs |
| Résultat observé | fmtTime (app-02:1116) normalise par supaTs et rend « à l'instant / N min / HH:MM / N j / date » ; fmtMsgTime (app-04:2370) suppose un nombre en ms et rend « à l'instant / N min / N h / N j / date » ; règles différentes (« N h » vs « HH:MM ») ; un seul appelant app-04:3525 avec c.lastAt (ms locales, donc pas de NaN reproduit) |
| Reproduction | grep -n 'function fmtTime\\|function fmtMsgTime\\|fmtMsgTime(' js/*.js |
| Preuve | js/app-02-state-utils.js:1116-1134 ; js/app-04-comments-shop.js:2370-2380, :3525 |
| Impact utilisateur et commercial | Incohérence visible entre inbox et fil pour un même âge ; risque futur si lastAt devient une chaîne Supabase (Invalid Date) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Faire de fmtMsgTime un alias de fmtTime (ou un paramètre de style), ou passer lastAt par supaTs |
| Risque de régression | faible (libellés de l'inbox changent, 1 suite à ajuster) |
| Effort estimé | 1 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit sur l'arbre de travail de la branche d'audit (HEAD f501fb7 ne diffère de c8cb8e99 que par 3 fichiers .passio/, aucun js/). `grep -n 'function fmtTime\|function fmtMsgTime\|fmtMsgTime('` rend exactement les trois lignes citées : js/app-02-state-utils.js:1116 (fmtTime, normalise par supaTs si chaîne, rend « à l'instant / N min / HH:MM / N j / date »), js/app-04-comments-shop.js:2370 (fmtMsgTime, soustraction brute `Date.now() - ts`, rend « à l'instant / N min / N h / N j / date »), et un seul appelant js/app-04-comments-shop.js:3525 (`fmtMsgTime(c.lastAt)` dans la carte de l'inbox). Exécution Node des deux corps copiés à l'identique sur un même horodatage (maintenant − 3 h) : fmtTime → « 10:11 », fmtMsgTime → « 3 h » — l'incohérence de libellé entre fil et inbox est réelle. Tous les points d'écriture de `lastAt` (30 occurrences, app-04/05/07/08/09) fournissent des ms (`Date.now()`, `supaTs(...)`, `newMsg.at` = ms via `msgAt = supaTs(r.created_at)` app-08:4916), donc aucun « Invalid Date » à ce SHA, comme le finding l'admet lui-même. Nuance : sur une chaîne ISO, fmtMsgTime ne rend pas « Invalid Date » mais tombe dans la branche `toLocaleDateString` (NaN < 1 est faux à chaque étage) → affiche la date du jour (« 4 sept. ») au lieu d'un âge relatif : le risque futur est une erreur silencieuse, pas un « Invalid Date ». git status --short : vide. — Correction de formulation : Dans « impact », remplacer « (Invalid Date) » par : si lastAt devenait une chaîne ISO, fmtMsgTime afficherait silencieusement la date du jour (branche finale toLocaleDateString, NaN échouant à tous les seuils) au lieu de l'âge relatif — défaut invisible, pas une chaîne « Invalid Date ». Le reste (lignes, appelant unique, règles divergentes « N h » vs « HH:MM », absence de défaut reproduit, P3) est exact.

### CARTO-07 — Résidus du Carnet de voyage (ADR-011) : branches mortes vers cdv_live_comments / cdv_live_step et cloud de 11 tables prod sans usage client

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-07 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Commentaires (app-04), notifications (app-08), schéma prod |
| Résultat attendu | Cible supprimée = tout ce qui la vise part avec (CLAUDE.md) |
| Résultat observé | app-04:1452 et :1504 routent un id `lc_` vers cdv_live_comments ; app-08:2012 et :5608 gardent le kind cdv_live_step ; en prod, 6 tables cdv_* + post_collaborators + step_interactions n'ont aucun .from() client (données conservées volontairement, ADR-011 §6) |
| Reproduction | grep -n 'cdv_live\\|step_interactions' js/*.js \| grep -v '//' ; list_tables |
| Preuve | js/app-04-comments-shop.js:1452,1504 ; js/app-08-ui-modals-tour.js:2012,5608 ; list_tables (39) vs inventaire.json.tables (28) |
| Impact utilisateur et commercial | Lecture du code trompeuse ; 25 tables dans la publication realtime dont des tables mortes ; coût nul aujourd'hui (13 lignes au total dans cdv_*) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Retirer les branches `lc_` et le kind cdv_live_step (ou les documenter comme lecture-seule d'anciennes notifications) ; décision produit sur l'archivage des tables cdv_* hors publication realtime |
| Risque de régression | faible ; les anciennes notifications cdv_live_step perdraient leur icône |
| Effort estimé | 2 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). SHA : HEAD f501fb7 = c8cb8e9 + 2 commits d'audit ; `git diff --stat c8cb8e9 HEAD -- js index.html migrations` est vide, le code lu EST le code audité. - js/app-04-comments-shop.js:1452 `else if (/^lc_/.test(commentId)) table = "cdv_live_comments";` et :1504 (même ternaire dans `_supaUpdateCommentRow`) : présents. `grep -n '"lc_\|`lc_' js/*.js` ne trouve AUCUN producteur d'identifiant `lc_` → ces deux branches sont bien mortes (jamais atteignables). - js/app-08-ui-modals-tour.js:2012 `case "cdv_live_step": goTo("feed")` et :5608 `cdv_live_step: "📍"` dans `_notifEmoji` : présents. MAIS la branche 2012 est déjà DOCUMENTÉE comme volontaire (commentaire :2008-2011 « les notifications déjà reçues restent affichées… ramène au fil »). - Tables : preuves/supabase-isolation/policies.json et fonctions_realtime_storage_staging.md montrent les 6 `cdv_*`, `post_collaborators` et `step_interactions` avec RLS et DANS la publication `supabase_realtime` ; preuves/carto/inventaire.json liste 30 cibles `.from()` (28 tables + 2 buckets) sans aucune de ces 8 → cohérent avec app-08:5268-5276 (« restent dans la publication realtime »). - Le chiffre « 13 lignes dans cdv_* » n'est étayé par aucune preuve déposée (requête SQL nécessaire), mais il n'affecte pas le fond (P3 quelle que soit la volumétrie). Défaut réel, de dette/lisibilité uniquement, aucun comportement utilisateur cassé. — Correction de formulation : Titre : « 11 tables prod sans usage client » est inexact — CARTOGRAPHIE.md:210 en compte 11 sans `.from()` mais 3 d'entre elles SONT utilisées (passion_relations via la fonction SQL `rechercher_passions`, user_safety via RPC, telemetry_events via POST REST + dashboard) ; écrire « 8 tables sans aucun usage client » (6 cdv_* + post_collaborators + step_interactions), comme le champ `observe` le fait déjà. Observé/correction : le kind `cdv_live_step` d'app-08:2012 est DÉJÀ documenté comme conservé volontairement (commentaire :2008-2011) — l'option « ou les documenter » de la correction est donc déjà satisfaite pour cette branche ; seules les branches `lc_` d'app-04:1452/1504 sont un vrai code mort non documenté (aucun producteur d'id `lc_` dans js/). Preuve : « list_tables (39) » n'est pas dans preuves/ — remplacer par preuves/supabase-isolation/policies.json et fonctions_realtime_storage_staging.md (publication realtime). Impact : « 13 lignes au total » non prouvé par une preuve déposée, à marquer PROBABLE ou à étayer par la requête ci-dessus.

### CARTO-08 — Cloudflare CDN worker versionné mais inactif (PASSIO_CDN_BASE vide)

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-08 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | RÉFUTÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Cache de bord des médias Storage (cloudflare/passio-cdn-worker.js) |
| Résultat attendu | Un composant versionné est soit déployé et référencé, soit clairement marqué optionnel |
| Résultat observé | cloudflare/passio-cdn-worker.js proxifie les buckets content/attachments ; app-08:2564 `const PASSIO_CDN_BASE = ""` → jamais utilisé ; l'hôte d'exemple passio-cdn.toncompte.workers.dev n'apparaît qu'en commentaire ; egress Supabase non soulagé (buckets publics 171 Mo) |
| Reproduction | grep -n 'PASSIO_CDN_BASE' js/app-08-ui-modals-tour.js ; sed -n 1,25p cloudflare/passio-cdn-worker.js |
| Preuve | js/app-08-ui-modals-tour.js:2561-2564 ; cloudflare/passio-cdn-worker.js:1-24 ; docs/CDN_CLOUDFLARE.md |
| Impact utilisateur et commercial | Coût : egress Supabase facturé au-delà du forfait ; capacité non prouvée du CDN (jamais déployé) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Décider : déployer (et ajouter le domaine à la CSP img/media-src, déjà `https:`) ou retirer le dossier et la constante |
| Risque de régression | nul tant qu'inactif |
| Effort estimé | 0,5 j pour activer, 15 min pour retirer |

Relecture (angles indépendants) :

- **reproduction** → RÉFUTÉ (priorité proposée P3). Les FAITS du finding sont reproduits sur le SHA c8cb8e99 : `git show c8cb8e99:js/app-08-ui-modals-tour.js | sed -n 2559,2564p` → `const PASSIO_CDN_BASE = "";` ; `cloudflare/passio-cdn-worker.js:1-24` proxifie les buckets content/attachments ; `git diff --stat c8cb8e99 HEAD` sur ces fichiers = vide ; `grep -rn workers.dev` ne trouve l'hôte qu'en commentaire (app-08:2562) et dans docs/CDN_CLOUDFLARE.md:31,37. Mais le DÉFAUT annoncé n'existe pas au regard du critère « attendu » posé par le finding lui-même (« soit déployé et référencé, soit CLAIREMENT MARQUÉ OPTIONNEL ») : le composant est explicitement marqué optionnel aux deux endroits cités — app-08:2559-2563 (« CDN optionnel … VIDE = désactivé (URL Supabase directe, comportement actuel) ») et docs/CDN_CLOUDFLARE.md:11-25 (« Ce qui est déjà fait côté code », « Ce qu'il reste à faire (≈ 5 min, dans TON compte Cloudflare) », retour arrière l.58). La seconde branche de l'attendu est donc satisfaite : ce n'est pas un composant orphelin mais une fonctionnalité documentée, en attente d'activation manuelle hors dépôt. Deux inexactitudes de formulation : (1) « jamais utilisé » est faux — `cdnUrl()` est câblé sur les deux chemins d'upload (app-08:3594 `_obtenue = cdnUrl(publicUrl.publicUrl)` ; app-09:886), il est simplement un no-op tant que la base est vide (app-08:2566) ; (2) la correction proposée « ajouter le domaine à la CSP » contredit le finding lui-même (« déjà `https:` ») et la doc (l.22-23) : `_headers:40` et `netlify.toml:19` ont `img-src`/`media-src … https:` → aucune modif CSP requise. L'impact « egress facturé au-delà du forfait » n'est étayé par aucune mesure (aucune preuve d'egress dans preuves/ ; 171 Mo stockés, 5 comptes) : c'est une capacité non prouvée dans les deux sens. Reste un simple point de décision produit/backlog, pas un défaut du SHA audité. `git status --short` → vide. — Correction de formulation : Reclasser en observation/backlog (« décision à prendre : activer ou retirer ») plutôt qu'en défaut : l'attendu « clairement marqué optionnel » est déjà rempli (app-08:2559-2563, docs/CDN_CLOUDFLARE.md:11-25). Remplacer « jamais utilisé » par « câblé (app-08:3594, app-09:886) mais no-op tant que PASSIO_CDN_BASE est vide ». Retirer de la correction « ajouter le domaine à la CSP » (img-src/media-src acceptent déjà https:, _headers:40, netlify.toml:19). Requalifier l'impact en « capacité non prouvée » : aucune mesure d'egress ne montre un dépassement de forfait.

### CARTO-09 — 32 gardes d'authentification manuelles (MY_UID) contre 19 requireAuthentication : deux définitions du mot « connecté »

| Champ | Valeur |
|---|---|
| Identifiant | CARTO-09 |
| Priorité retenue | **P2** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | Portes d'action engageante (partage, like, publication, RSVP…) |
| Résultat attendu | Une seule porte (requireAuthentication / comptePassioReel), CLAUDE.md : « MY_UID ne prouve PAS qu'un compte existe » |
| Résultat observé | grep : 32 occurrences de `typeof MY_UID === "undefined" \|\| !MY_UID` ou `!MY_UID)` dans js/, 19 appels requireAuthentication(, 3 comptePassioReel() ; ex. sharePostInFeed app-03:49, shareEventInFeed app-07:4367 refusent sur MY_UID |
| Reproduction | grep -c 'typeof MY_UID === "undefined" \|\| !MY_UID\\|!MY_UID)' js/*.js ; grep -o 'requireAuthentication(' js/*.js \| wc -l |
| Preuve | js/app-03-posts-vlogs.js:49 ; js/app-07-ia-explore-irl.js:4367 ; js/first-run.js (requireAuthentication) |
| Impact utilisateur et commercial | Un visiteur du parcours première visite peut voir une porte refuser (« Connexion requise ») au lieu d'ouvrir l'inscription contextuelle, selon la surface ; incohérence de conversion |
| Visibilité dans le Centre de pilotage | partiel — tel.action des portes first-run |
| Détection par la Sentinelle | non |
| Proposition de correction | Inventorier les 32 gardes et les faire passer par requireAuthentication(ctx) quand l'action est engageante (hors périmètre carto : à instruire par le domaine UX/onboarding) |
| Risque de régression | moyen (parcours d'inscription contextuelle) |
| Effort estimé | 1 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur le SHA audité (js/ et index.html identiques à c8cb8e99 : `git diff --stat c8cb8e99 HEAD -- js/ index.html` vide). Comptages exacts : `grep -c 'typeof MY_UID === "undefined" || !MY_UID\|!MY_UID)' js/*.js` = 6+2+4+5+2+3+9+1 = 32 ; `requireAuthentication(` = 19 ; `comptePassioReel()` = 3. Les deux gardes citées existent : js/app-03-posts-vlogs.js:49 (sharePostInFeed) et js/app-07-ia-explore-irl.js:4367 (shareEventInFeed), et AUCUN appel à requireAuthentication n'existe sur le chemin sharePost → sharePostInFeed ni shareEvent → shareEventInFeed (liste complète des 15 sites d'appel hors first-run.js : app-03:295, app-04:1080/1576/3284/4533, app-05:1634/2432/2618/2700, app-06:4205, app-07:3273/5154/5572, app-08:593/1289 — aucun partage). MAIS le comportement observé décrit par le finding est INVERSÉ. Test exécuté (émulation Chromium, port 8120, bootVisiteur de tests/e2e/first-run-helper.js, script scratchpad/preuves/verif-carto09/repro.spec.js et repro2.spec.js) : pour un visiteur première visite, `MY_UID` vaut un id LOCAL (`u_yoeajlo4`, cf. app-02:2812 « id local u_xxxxxxxx pour tout le monde »), donc la garde `!MY_UID` PASSE. Résultat : toasts « Publication partagée avec succès. » puis « Événement partagé dans ton feed. », `.fr-gate-title` absent, `state.userPosts` 0 → 1, `estVisiteur()` = true, aucune requête non-GET vers supabase.co (pas de session). Le visiteur ne voit jamais « Connexion requise » : l'action engageante est FAITE localement sans porte d'inscription — exactement le cas que first-run.spec.js « TOUTES les portes d'écriture sont gardées » prétend couvrir, et sa liste ne contient ni sharePostInFeed, ni shareEventInFeed, ni shareReelInFeed (grep = 0 occurrence). — Correction de formulation : Observé/impact à réécrire : la garde MY_UID ne REFUSE PAS le visiteur (MY_UID est un id local `u_…` en mode invité), elle le laisse PASSER — sharePostInFeed et shareEventInFeed créent un repost dans `state.userPosts` d'un visiteur sans ouvrir la porte d'inscription contextuelle, toast de succès à l'appui (aucune écriture serveur faute de session). Le défaut n'est donc pas « Connexion requise au lieu de l'inscription contextuelle » mais « action engageante accomplie SANS aucune porte », contraire à l'invariant first-run (« TOUTES les portes d'écriture sont gardées ») et à CLAUDE.md (« MY_UID ne prouve PAS qu'un compte existe »). Preuve : test exécuté ci-dessus, pas seulement un grep. Impact : occasion de conversion perdue sur le geste de partage + état local d'un visiteur portant des reposts qui seront adoptés par le compte à l'inscription (attribuerEtatLocalAuCompte ne purge pas). Correction : ajouter `if (window.requireAuthentication && !requireAuthentication("publier")) return;` en tête de sharePost/shareEvent (ou des *InFeed) et de shareReelInFeed, et ajouter ces trois fonctions à la liste du verrou first-run.spec.js. Effort : 2 h, pas 1 j (les 29 autres gardes MY_UID sont majoritairement des gardes de synchro serveur, pas des portes d'action). Priorité P2 plutôt que P3 : porte d'écriture non gardée sur le parcours d'acquisition actif par défaut.

### Surfaces saines

- Écrans : les 6 écrans répondent à goTo() et deviennent .active (émulation, 0 erreur JS, 0 erreur console applicative)
- Redirections d'anciens deep links : goTo('wallet'|'shop') → profiles, goTo('cdv') → feed (app-02:1969 ; ADR-009/011) — aucun écran orphelin
- Porte d'ajout de passion : 4 portes, un seul point d'écriture ajouterPassionAuCompte (app-06:3677) ; en émulation la page Mes passions n'expose qu'un #nouveauProfilLien
- Boutons « Suivre » : 3 surfaces émettrices, un seul moteur toggleFollowUser → supaFollowUser/supaUnfollowUser, retour de TOUS les boutons data-follow-uid (app-04:3273)
- Cartes : un seul chargeur (map-loader.js, shim L compatible), deux instances (IRL, tour démo) sans double initialisation
- Échappement : exactement 3 helpers (escapeHtml, escapeJsArg, safeUrlAttr, app-02:1156-1175), aucun doublon
- Chargement des posts serveur : un seul chemin supaLoadPosts (app-08:3615) ; 25 supaLoad* distincts sans doublon de cible
- Modale principale : un seul openModal/closeModal (app-08:15-41) pour 64 appels
- Globals : 1 seul nom top-level redéclaré ($), documenté et allowlisté ; audit:globals vert
- CSP identique dans _headers et netlify.toml, hôtes externes du code tous couverts (sauf CDN inactif)
- Sélecteur de passion unique PassionSearchSelector pour les 7 surfaces, référentiel plat via PassioPassions
- Suites smoke + contextual-nav : 11/11 verts en local (port 8100, Chromium 1194)

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Fichier réellement servi par https://passio-app.netlify.app (BLOQUÉ : proxy 403 vers netlify.app ; il faudrait un accès réseau direct ou un poste de Benjamin) — SHA prod tenu pour c8cb8e99 par le job vert 33861671142
- Couverture fonctionnelle 66/435 = 15,2 % de PASSIO_FUNCTIONAL_MAP (BLOQUÉ : suite complète interdite au sous-agent et Chromium 1223 absent ; il faudrait `PASSIO_COUVERTURE=1 npm run couverture:mesure` sur un poste avec le navigateur aligné)
- Suites du projet prod (authz-critical, blocage-acces, user-state-horodatage, multi-comptes, confidentialite, qa-campaign, suppression-compte) — BLOQUÉ (comptes réels + service_role) ; job « Suites production (comptes réels) » vert au run 33861671142
- Rendu sur WebKit/Firefox/Safari/Samsung Internet et appareil réel — NON RÉALISÉ (Chromium seul, émulation)
- Comptage exact des interactions atteignables dans les feuilles créées dynamiquement (#v2CreateSheet, #v3PassioSheet) : mesuré à l'ouverture pour « Créer » (6 cases) mais pas pour « Trouver une expérience » ni pour les panneaux ContextualTools
- Chemins réseau externes (images unsplash/picsum, Supabase) coupés par le proxy de l'environnement : 111 erreurs réseau en émulation, non imputables au code

### Affirmations des anciens rapports confrontées au code actuel

- PASSIO_FUNCTIONAL_MAP.md : « 8 écrans : feed, profiles, studio, explore, irl, messages, cdv, wallet » → FAUSSE : 6 écrans (grep id="screen- index.html ; ADR-009 et ADR-011)
- PASSIO_FUNCTIONAL_MAP.md : « 435 interactions distinctes sur 757 handlers » → FAUSSE : node scripts/couverture-interactions.js rend 355 sur 601 (index + 9 app) ; 366 sur 626 en comptant les 42 fichiers js/
- PASSIO_FUNCTIONAL_MAP.md : « 34 tables en production, toutes sous RLS » → FAUSSE sur le nombre (39, list_tables), TOUJOURS VRAIE sur le RLS (39/39 rls_enabled)
- PASSIO_FUNCTIONAL_MAP.md : « 25 specs e2e / 175 tests déclarés » → FAUSSE : 131 specs / 1 060 test( (tests-par-spec.txt)
- PASSIO_FUNCTIONAL_MAP.md : « couverture par domaine : cdv 52 » → FAUSSE : 0 spec cdv* dans tests/e2e (ls)
- PASSIO_FUNCTIONAL_MAP.md : « 66 interactions sur 435 = 15,2 % » → NON VÉRIFIABLE ici (suite complète + PASSIO_COUVERTURE=1 requis)
- PASSIO_FUNCTIONAL_MAP.md §4 : « passion_id présent sur posts, stories, events, conversations, profiles — et sur aucune table d'interaction » → PARTIELLEMENT VRAIE : 6 tables aujourd'hui (user_passions ajoutée, FK vers passions), toujours aucune table d'interaction (information_schema.columns)
- PASSIO_FUNCTIONAL_MAP.md §4 : « posts.author_id → profiles(id) » → TOUJOURS VRAIE (pg_constraint)
- CLAUDE.md : « exactement 9 fichiers app-*.js entre les marqueurs BUILD:APP » → TOUJOURS VRAIE (index.html:1491-1500)
- CLAUDE.md : « js/first-run.js chargé AVANT le bloc BUILD:APP » → TOUJOURS VRAIE (index.html:1489 vs 1491)
- CLAUDE.md : « Les 3 portes d'ajout convergent vers un moteur unique, plafond gardé aux points d'écriture » → TOUJOURS VRAIE (ajouterPassionAuCompte app-06:3677 ; quickCreateProfile app-07:527)
- CLAUDE.md fiche 20 : « followBtn_<uid> émis par TROIS surfaces, boutons portant data-follow-uid, toggleFollowUser les retourne TOUS » → TOUJOURS VRAIE (app-06:4674, app-07:364, app-07:464 ; app-04:3273)
- CONTEXTE_AUDIT (orchestrateur) : « 30 fichiers js/ » → INEXACTE : 42 fichiers js/ (ls js/*.js | wc -l), 55 011 lignes confirmées

### Fichiers de preuve

- `preuves/carto/CARTOGRAPHIE.md`
- `preuves/carto/inventaire.js`
- `preuves/carto/inventaire.json`
- `preuves/carto/generer-carto.js`
- `preuves/carto/emulation-ecrans.js`
- `preuves/carto/emulation-ecrans.json`
- `preuves/carto/emulation-ecrans.log`
- `preuves/carto/ecran-feed.jpg`
- `preuves/carto/ecran-profiles.jpg`
- `preuves/carto/ecran-studio.jpg`
- `preuves/carto/ecran-explore.jpg`
- `preuves/carto/ecran-irl.jpg`
- `preuves/carto/ecran-messages.jpg`
- `preuves/carto/overlay-bobines.jpg`
- `preuves/carto/overlay-creer.jpg`
- `preuves/carto/overlay-mes-passions.jpg`
- `preuves/carto/overlay-tour.jpg`
- `preuves/carto/tests-par-spec.txt`
- `preuves/carto/specs-ecrans.txt`
- `preuves/carto/smoke-run.txt`
- `preuves/carto/pw.config.js`

### Notes de l'auditeur

Méthode reproductible : `cd /home/user/passio-app && node <scratchpad>/preuves/carto/inventaire.js` (inventaire statique) ; `npx http-server -p 8100 -a 127.0.0.1 -c-1 . &` puis `PASSIO_PORT=8100 node <scratchpad>/preuves/carto/emulation-ecrans.js` (parcours) ; `node <scratchpad>/preuves/carto/generer-carto.js` (CARTOGRAPHIE.md). Serveur arrêté et `git status --short` vide en fin d'audit ; test-results/ (ignoré par git) a reçu les traces des premiers essais Playwright.
Environnement : @playwright/test 1.60 attend le Chromium 1223 ; seul 1194 est présent dans /opt/pw-browsers → les suites ne tournent qu'avec un wrapper de config (pw.config.js : executablePath forcé + webServer.cwd). À signaler à l'orchestrateur avant la suite complète : sans ce wrapper, 100 % des suites navigateur échouent au lancement (« Executable doesn't exist ») et ce rouge n'est pas imputable au code.
Recommandations de placement (pour Benjamin) : conserver — le moteur unique des passions, toggleFollowUser, map-loader, findPostAnywhere ; refactoriser — openPost/shareReelInFeed → findPostAnywhere, fmtMsgTime → fmtTime, les 32 gardes MY_UID → requireAuthentication ; supprimer ou documenter — #appNav legacy (lié au kill switch UI-1), #moodSelector (lié à passio_feed_intents_v1), branches cdv_live_comments/cdv_live_step, dossier cloudflare/ si le CDN n'est pas déployé ; soumettre à Benjamin — l'entrée de navigation des Bobines (aucune porte directe dans la barre V2) et l'archivage des 8 tables prod sans usage client (6 cdv_*, post_collaborators, step_interactions) hors publication realtime.
Hors périmètre carto mais constaté : events.author_id, event_comments.author_id, video_lives.author_id, post_likes, follows, blocks, reports, notifications n'ont AUCUNE FK vers profiles (pg_constraint : 20 FK seulement) — à instruire par le domaine sécurité/données. Explore garde un onglet « Assistant IA » (Edge ask-ai → api.anthropic.com) : ce n'est pas Passia (ADR-009) mais un service payant à l'appel, à compter dans les coûts. Capacité du CDN Cloudflare : non prouvée (jamais déployé).
