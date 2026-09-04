# Preuves nécessaires — contrôles BLOQUÉS et non réalisés — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf`. Ce rapport liste tout ce que l'audit N'A PAS PU prouver, avec la raison et ce qu'il faudrait pour trancher. Un contrôle BLOQUÉ n'est ni vert ni rouge : la contre-revue et Benjamin ne doivent pas le lire comme un succès. Les mesures faites en émulation Chromium ne valent jamais pour un appareil réel.

## 1. Les sept preuves qui pèsent sur le verdict

| # | Preuve manquante | Pourquoi bloquée ici | Ce qu'il faut | Qui peut le faire |
|---|---|---|---|---|
| 1 | **Restauration complète** (base + auth + Storage + schéma) exercée, avec RTO/RPO | Aucune restauration jamais faite ; plan Supabase non lisible ; aucun projet cible | Créer un projet Supabase jetable, y restaurer la dernière sauvegarde (ou une sauvegarde Supabase), rejouer les migrations, mesurer le temps, documenter | Benjamin (Dashboard Supabase + `npm run sauvegarde`) |
| 2 | **Capacité mesurée** à 1 000 / 10 000 / 100 000 | Aucun staging ; charge sur la production interdite | Staging + campagne k6 (fil, publication, messagerie, Realtime) à 100 / 1 000 / 5 000 clients virtuels | Benjamin + un agent sur staging |
| 3 | **Isolation des comptes prouvée sous rôle** (anon, authenticated) | `SET LOCAL ROLE` refusé au rôle du connecteur (42501) ; REST direct vers supabase.co bloqué par le proxy | Un poste hors proxy : `curl` avec la clé anon sur chaque table (count=exact attendu 0 ou public), et le job « Suites production » (authz-critical) lu en détail | Benjamin ou GPT-6 Astra depuis Codex (réseau ouvert) |
| 4 | **Fichier réellement servi en production** = SHA c8cb8e99 | `netlify.app` refusé par le proxy (403) | `curl -sI https://passio-app.netlify.app/release.json` et comparaison du hash d'app.js | N'importe quel poste |
| 5 | **Plans et quotas** Supabase (compute, connexions, Realtime, sauvegardes, PITR), Netlify (bande passante), Brevo (e-mails/jour) | Non lisibles par le connecteur en lecture seule | Captures d'écran des pages Billing / Backups / Auth Rate limits / Attack protection | Benjamin |
| 6 | **Appareils et navigateurs réels** (iPhone Safari, Android Chrome, Samsung Internet, iPad, PWA installée, Firefox, Edge) | Chromium seul dans l'environnement | Session de recette sur 1 iPhone + 1 Android + 1 tablette avec la grille du rapport 09 | Benjamin ou testeur |
| 7 | **Réglages Auth** (captcha, limites de tentatives, longueur de mot de passe, provider anonyme et Google, HIBP, MFA, durée de session) | Non exposés en SQL | Captures Dashboard → Authentication → Providers / Rate limits / Attack protection / Sessions | Benjamin |

## 2. Tous les contrôles BLOQUÉS ou non réalisés, par domaine

### appareils-a11y

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| DEV-C04 | Encoches / safe-area, clavier virtuel, souris + clavier physique | BLOQUÉ / non réalisé | Non émulable fidèlement : `env(safe-area-inset-bottom)` présent dans le CSS (pied de la vue Filtre, `.app-nav`) ; clavier virtuel non simulé |
| DEV-C05 | Zoom 200 % et texte agrandi 200 % | BLOQUÉ / émulation | captures 390x844-texte200-feed/irl.jpg produites (non analysées avant l'interruption) ; captures zoom200 vides (2,8 Ko) → mesure échouée |
| DEV-C06 | Navigateurs : Safari/WebKit, Firefox, Edge, Samsung Internet, PWA installée iOS/Android | BLOQUÉ / non réalisé | Seul Chromium 1223 (Playwright) est disponible ; aucune installation possible |
| DEV-C13 | Focus à l'ouverture/fermeture des modales (2.4.3), animations réduites (prefers-reduced-motion) | BLOQUÉ / non réalisé | Lecture d'`openModal`/`closeModal` commencée par le sous-agent, conclusion non déposée |
| DEV-C14 | Lecteur d'écran (VoiceOver, TalkBack) | BLOQUÉ / non réalisé | Aucun appareil réel |

### auth-rgpd

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| AUTH-C05 | Sessions : jeton sb-<ref>-auth-token en localStorage, persistSession/autoRefreshToken (défauts SDK), durée du JWT et du refresh token | BLOQUÉ / inspection code | app-08:2688 createClient(SUPABASE_URL, SUPABASE_KEY) sans option → défauts du SDK (persistSession=true, autoRefreshToken=true, storage localStorage). La durée du JWT (défaut 3600 s) et la rotation du refresh token sont des réglages du Dashboard Supabase (Authentication → Sessions), non lisibles ici. Il faudrait une capture du Dashboard ou `get_project_config`. |
| AUTH-C13 | Verrouillage / rate-limit des tentatives de connexion (GoTrue) | BLOQUÉ / non réalisé | Aucun compteur côté client (onbDoAuth). Les limites GoTrue (Authentication → Rate Limits) ne sont pas lisibles ici et un test de charge contre la prod est interdit. Il faudrait la capture du Dashboard « Rate Limits ». |
| AUTH-C14 | OAuth social (Google) : présence, activation du provider, couverture de test | BLOQUÉ / inspection code | index.html:294-297 bouton « Continuer avec Google » visible ; app-02:3305-3322 signInWithOAuth ; grep tests/e2e → aucune suite ; activation du provider = Dashboard Supabase, non vérifiable ici |
| AUTH-C20 | Edge Function déployée et identique au dépôt ; suite suppression-compte en CI | BLOQUÉ / inspection code | docs/EDGE_FUNCTION_DELETE_ACCOUNT.md:3 « déployée le 2026-06-11 via le Dashboard » ; le fichier du dépôt date du 2026-08-31 (git log 43b8ffa) ; tests/e2e/suppression-compte.spec.js:28 `test.skip(!process.env.PASSIO_E2E_MULTI)` et PASSIO_E2E_MULTI n'est posé dans AUCUN workflow (grep .github/workflows → seulement un commentaire deploy.yml:155) → le job « Suites production » vert du run 33861671142 NE prouve PAS la fonction. Il faudrait un run manuel PASSIO_E2E_MULTI=1 ou les logs Edge Functions du Dashboard. |
| AUTH-C33 | Transferts hors UE et sous-traitants | BLOQUÉ / inspection code | Région Supabase : aucun indice dans le dépôt (grep region/eu-west/frankfurt → 0), non vérifiable sans Dashboard ; Netlify (CDN mondial), Tenor (Google, US), Giphy (US), Google Fonts (fonts.googleapis.com, index.html), TURN openrelay.metered.ca (relais des flux WebRTC), Photon komoot (DE) — netlify.toml:19 ; aucun DPA ni liste dans le dépôt |
| AUTH-C34 | Registre des traitements, DPO, analyse d'impact | BLOQUÉ / inspection code | grep -ri 'registre des traitements\|DPO\|délégué à la protection\|AIPD\|DPIA' docs/ .passio/ → 0 ; documents hors dépôt possibles, non fournis |
| AUTH-C43 | Suites à comptes réels (suppression-compte, user-state-horodatage) | BLOQUÉ / non réalisé | Interdites ici (écriture en base réelle, SUPABASE_SERVICE_ROLE_KEY). user-state-horodatage : dans le projet prod, job « Suites production (comptes réels) » vert au run 33861671142. suppression-compte : SKIPPÉE même en CI (C20). |

### carto

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| CARTO-C23 | Vérification directe de la prod Netlify (fichier servi) | BLOQUÉ / non réalisé | proxy réseau de l'environnement : accès HTTP sortant vers netlify.app refusé (403) — fait établi par l'orchestrateur, non retenté ; SHA prod = c8cb8e99 par le job « Déploiement production » vert du run 33861671142 |
| CARTO-C24 | Mesure de couverture fonctionnelle (PASSIO_COUVERTURE=1, suite complète) | BLOQUÉ / non réalisé | exige la suite complète (interdite au sous-agent : l'orchestrateur la lance une fois) et le Chromium 1223 attendu par @playwright/test 1.60 (seul 1194 présent, playwright install interdit) ; il faudrait `PASSIO_COUVERTURE=1 npm run couverture:mesure` sur un poste avec le navigateur aligné |
| CARTO-C25 | Suites du projet prod (comptes réels) | BLOQUÉ / non réalisé | authz-critical, blocage-acces, user-state-horodatage, multi-comptes, confidentialite, qa-campaign, suppression-compte exigent SUPABASE_SERVICE_ROLE_KEY et écrivent en prod ; job « Suites production (comptes réels) » vert au run CI 33861671142 |

### code-nettoyage

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| NET-C24 | Suites du projet prod (comptes réels) et dist (PASSIO_CIBLE=dist) | BLOQUÉ / non réalisé | Interdit par le cadre (SUPABASE_SERVICE_ROLE_KEY, écritures prod) ; run CI 33861671142 job « Suites production (comptes réels) » vert sur le SHA. Les 4 cas release-integrity réservés à dist n'ont pas été lancés (build dist non exécuté ici). |
| NET-C25 | Vérification directe de la prod (fichier servi, SW actif, en-têtes Netlify) | BLOQUÉ / non réalisé | Accès HTTP sortant vers passio-app.netlify.app refusé (403 proxy) — fait établi par l'orchestrateur, non retenté. |

### contenu

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| CT-34 | Comportement sur appareils réels (iOS/Android/Safari) pour vidéo/audio | BLOQUÉ / non réalisé | Chromium seul ; le code porte des reprises iOS (mp4/m4a, app-06:4110-4125, app-08:736-760) non vérifiables ici. Il faudrait un iPhone et un Android réels |

### exploitation-continuite

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| EXP-C04 | Sauvegardes Supabase (PITR / backups quotidiens selon le plan) | BLOQUÉ / non réalisé | Le plan Supabase n'est lisible ni dans le dépôt (grep PITR/point-in-time/plan pro : néant ; SCALE_RUNBOOK.md:152 mentionne seulement une compute « Nano ») ni par le connecteur (interdit). À vérifier : Dashboard Supabase → Project Settings → Billing (plan) et Database → Backups (liste des sauvegardes, PITR activé ou non, et un essai de restauration sur un projet jetable). |
| EXP-C40 | Production servie (SHA en ligne, page de statut Netlify, UI de rollback) | BLOQUÉ / non réalisé | https://passio-app.netlify.app et passio74.github.io → 403 CONNECT du proxy ; API GitHub /pages → 403 proxy. Preuve indirecte : job « Déploiement production » vert sur 33861671142 (fait orchestrateur). |

### irl

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| IRL-C07 | Carte (MapLibre GL + OpenFreeMap) : affichage, repli sans WebGL | BLOQUÉ / émulation | emulation-resultats.json « carte » : unpkg/openfreemap injoignables derrière le proxy → repli « La carte n'est pas disponible sur cet appareil » affiché correctement ; 1 test e2e irl.spec.js:354 échoue pour la même raison (getZoom sur carte nulle) — vert en CI (run 2494) |

### messagerie-notifs

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| C36 | multi-comptes.spec.js et confidentialite.spec.js (comptes réels) | BLOQUÉ / non réalisé | exigent SUPABASE_SERVICE_ROLE_KEY et des comptes réels ; job « Suites production (comptes réels) » vert dans le run CI 33861671142 (get_workflow_run : conclusion success, head_sha c8cb8e99, terminé 10:44 UTC) |
| C38 | Vérification directe de la production (REST anon, listing Storage, HEAD objet public) | BLOQUÉ / non réalisé | preuves/anon-rest-storage-probe.json : 7 requêtes, toutes 403 « Host not in allowlist » (proxy de l'environnement) ; il faudrait un poste hors proxy et la clé anon publique du bundle |

### moderation

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| MOD-C17 | Faux comptes — captcha Supabase Auth (hCaptcha/Turnstile) | BLOQUÉ / non réalisé | grep -rni captcha\|turnstile js index.html supabase docs .github = 0 occurrence : aucun jeton captcha n'est passé à signUp/signInWithPassword (app-08), donc s'il était activé côté Supabase, l'inscription échouerait — indice fort qu'il est DÉSACTIVÉ. Vérification : Supabase Dashboard → Authentication → Attack Protection (Bot and Abuse Protection / Enable Captcha) — non lisible via execute_sql. |
| MOD-C18 | Faux comptes — limite d'inscriptions par heure / rate limits Auth | BLOQUÉ / non réalisé | Aucun paramètre Auth dans le dépôt (pas de supabase/config.toml, dossier supabase/ = functions seulement). Aucune gestion du code over_email_send_rate_limit / 429 côté client (grep vide dans app-08, first-run.js, docs SMTP). À lire : Supabase Dashboard → Authentication → Rate Limits (sign-ups, email sent per hour, token refresh). Le plafond Auth « 10 connexions absolues » (advisor) est une limite de pool, pas d'inscriptions. |
| MOD-C29 | Suite blocage-acces.spec.js (comptes réels) | BLOQUÉ / non réalisé | Projet prod, exige SUPABASE_SERVICE_ROLE_KEY et écrit en base de production : interdit ici. Vert au run CI 33861671142 (job « Suites production (comptes réels) »). Un seul cas (l.30 « bloquer un abonné lui retire l'accès à un compte privé ») — le re-follow (MOD-04) n'est pas couvert. |
| MOD-C30 | Suite irl-trust-safety.spec.js (garde IRL, blocage DM) | BLOQUÉ / non réalisé | Hors de la liste demandée ; non exécutée pour rester dans le périmètre (suite locale, exécutable par l'orchestrateur : PASSIO_PORT=8106 npx playwright test --project=local tests/e2e/irl-trust-safety.spec.js --workers=1). Son en-tête précise que le lot est sous drapeau OFF par défaut. |

### perf-capacite-couts

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| PERF-C09 | Carte (MapLibre + tuiles OpenFreeMap) | BLOQUÉ / non réalisé | map_status « échec » : unpkg/openfreemap injoignables derrière le proxy |
| PERF-C13 | Capacité 1 000 / 10 000 / 100 000 utilisateurs | BLOQUÉ / non réalisé | Aucun outil de charge dans le dépôt (grep k6/artillery/autocannon : 0 hors docs), aucun staging (un seul projet Supabase), interdiction de charger la production → CAPACITÉ NON PROUVÉE ; `max_connections` = 60 (session orchestrateur) |
| PERF-C14 | Coûts (Supabase, Netlify, Storage, bande passante, e-mails, médias, carte) | BLOQUÉ / non réalisé | Plans et factures non lisibles par le connecteur. Volumes mesurés : base 92 Mo, Storage 171 Mo / 70 objets (2,4 Mo par objet en moyenne, buckets PUBLICS = sortie non plafonnée), telemetry_events 111 828 lignes / 54 Mo jamais purgées |
| PERF-C15 | Batterie, réseau lent réel, appareils réels | BLOQUÉ / non réalisé | Aucun appareil réel disponible |

### pilotage-sentinelle

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| CTL-11 | Exposition réseau (localhost vs Render public) | BLOQUÉ / non réalisé | render.yaml (racine) prévoit un service web public passio-pilotage (plan free, startCommand node server/index.js, DASH_ENV=production, clé service_role à saisir). curl https://passio-pilotage.onrender.com/api/health → code 000 (proxy sortant bloqué) : existence du déploiement NON VÉRIFIABLE ici. Il faudrait un accès réseau ou le tableau Render. |

### supabase-isolation

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| C10 | Preuve d'isolation par requête sous rôle anon (SET LOCAL ROLE anon ; count par table) | BLOQUÉ / requête base | begin; set local role anon; … → ERROR 42501 permission denied to set role "anon" (idem authenticated). Remplacé par l'émulation C12. Il faudrait un rôle de connecteur membre de anon/authenticated, ou une base jetable (docker postgres + tests/sql/socle-prod.sql) avec les policies réelles |
| C11 | Preuve d'isolation par API REST anon (clé anon publique, GET count=exact) | BLOQUÉ / non réalisé | curl https://njkiyoklssvefstljemx.supabase.co/rest/v1/ → « CONNECT tunnel failed, response 403 » (proxy de l'environnement). Le script rest_anon.sh a en outre été refusé par le classificateur de permissions. Il faudrait un poste avec accès réseau à supabase.co |
| C13 | UPDATE/DELETE ciblé sous rôle tiers dans une transaction annulée (update posts … returning id → 0 ligne) | BLOQUÉ / requête base | begin; set local role authenticated; set local request.jwt.claims=…; update … ; rollback → refusé dès le SET ROLE (42501) ; le connecteur est de plus en transaction_read_only=on (ADR-012). Émulation des USING : posts/profiles/conv_messages/notifications/events/user_state/conv_members/stories/storage → 0 ligne touchable par le tiers. Preuve exécutée réelle : authz-critical.spec.js blocs 2–3 (PATCH/DELETE cross-compte = 0 ligne), CI 33861671142 |
| C20 | Realtime : limites du plan (connexions simultanées, msgs/s) | BLOQUÉ / non réalisé | Le plan Supabase n'est pas lisible par le connecteur (features=database,debugging,docs). Capacité non prouvée. Il faudrait le tableau de bord Supabase (Settings → Billing) ; au repos l'app tient 3 canaux par client (app-08:5027-5029) |
| C31 | Anonymous sign-in (signInAnonymously appelé par app-02:3530) : provider activé côté Auth ? | BLOQUÉ / requête base | auth.users : 5 comptes, 0 is_anonymous, 5 confirmés, 0 avec phone. La configuration Auth (anonymous provider, MFA, captcha) n'est pas lisible via SQL/MCP ; il faudrait le tableau de bord Auth. first-run.js:35 affirme qu'aucun signInAnonymously n'est fait en mode invité |

### tests-ci

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| TCI-C04 | Flakiness dans les derniers runs (retries 2 en CI) | BLOQUÉ / non réalisé | GET /actions/jobs/{id}/logs → « CONNECT tunnel failed, response 403 » (proxy) ; MCP github en échec (AUTH_HEADER_REJECTED) ; gh CLI absent. Indice indirect : shards 2/6 et 6/6 durent 13,8 et 14,4 min contre 6–8 min pour les autres (retries ou suites lourdes, indiscernable). Il faudrait un jeton GitHub Actions:read ou l'accès aux logs |
| TCI-C22 | Suites prod exécutées | BLOQUÉ / non réalisé | Interdiction (comptes réels + SUPABASE_SERVICE_ROLE_KEY). Preuve de substitution : job « Suites production (comptes réels) » du run 33861671142 success, 10:09:47→10:15:35 |

### ux-onboarding

| Id | Contrôle | Statut / méthode | Raison et ce qu'il faudrait |
|---|---|---|---|
| C28 | Production Netlify (https://passio-app.netlify.app) : parcours réel sur l'artefact déployé | BLOQUÉ / non réalisé | Accès HTTP sortant vers netlify.app = 403 (proxy de l'environnement, fait établi par l'orchestrateur) ; le SHA de prod c8cb8e99 est attesté par le job « Déploiement production » du run 33861671142 |
| C29 | Appareil réel iOS Safari / Android Chrome / Samsung Internet, mode standalone (PWA installée) | BLOQUÉ / non réalisé | Chromium seul (r1194 via shim, Chromium 141) ; l'overlay iOS et la landing hors ligne sont mesurés en ÉMULATION (UA iPhone, SDK coupé) — il faudrait un iPhone en Safari puis en PWA installée, hors ligne, pour confirmer UXO-01 et UXO-02 sur le terrain |

## 3. Ce que chaque domaine déclare n'avoir pas vérifié

### appareils-a11y

- Appareils réels iPhone/iPad/Android/tablette/Windows/macOS : NON RÉALISÉ.
- Navigateurs Safari/WebKit, Firefox, Edge, Samsung Internet, PWA installée : NON RÉALISÉ (Chromium seul).
- Encoches, clavier virtuel, orientation réelle, souris/clavier physique, zoom 200 %, texte agrandi : NON RÉALISÉS ou non analysés.
- Lecteur d'écran, focus des modales, prefers-reduced-motion : NON RÉALISÉS.
- La barre de navigation n'a pas pu être mesurée par le script (nœud remplacé par un lot UI) : « nav visible NON » dans matrice.txt est un défaut de MESURE, pas de l'app (captures : barre visible).
- Relecture adversariale des 5 problèmes : NON FAITE.

### auth-rgpd

- Durée du JWT / rotation du refresh token / expiration d'inactivité (BLOQUÉ : réglages Dashboard Supabase → Authentication → Sessions ; il faudrait une capture ou l'API de configuration du projet)
- Limites de tentatives de connexion et d'envoi d'e-mails GoTrue (BLOQUÉ : Dashboard → Rate Limits ; test de charge contre la prod interdit)
- Activation réelle du provider Google OAuth (BLOQUÉ : Dashboard → Providers)
- Déploiement effectif et version de l'Edge Function delete-account, et purge réelle des médias (BLOQUÉ : suppression-compte.spec.js skippée en CI, comptes réels interdits ici ; il faudrait un run manuel PASSIO_E2E_MULTI=1 ou les logs Edge Functions)
- Région d'hébergement du projet Supabase et existence des DPA Supabase/Netlify/Brevo (BLOQUÉ : hors dépôt)
- Registre des traitements, DPO, AIPD (BLOQUÉ : documents hors dépôt, aucune trace dans docs/)
- Contenu réel servi par https://passio-app.netlify.app (BLOQUÉ : proxy 403, fait établi par l'orchestrateur)
- Décomptes de résidus par table après suppression et âge du plus ancien événement de télémétrie (BLOQUÉ : connecteur Supabase interdit à ce sous-agent — requêtes fournies dans notes)
- Suites prod user-state-horodatage / authz-critical (BLOQUÉ : comptes réels ; job « Suites production » vert au run 33861671142)
- Comportement sur WebKit/Firefox/Samsung (NON RÉALISÉ : Chromium seul)

### carto

- Fichier réellement servi par https://passio-app.netlify.app (BLOQUÉ : proxy 403 vers netlify.app ; il faudrait un accès réseau direct ou un poste de Benjamin) — SHA prod tenu pour c8cb8e99 par le job vert 33861671142
- Couverture fonctionnelle 66/435 = 15,2 % de PASSIO_FUNCTIONAL_MAP (BLOQUÉ : suite complète interdite au sous-agent et Chromium 1223 absent ; il faudrait `PASSIO_COUVERTURE=1 npm run couverture:mesure` sur un poste avec le navigateur aligné)
- Suites du projet prod (authz-critical, blocage-acces, user-state-horodatage, multi-comptes, confidentialite, qa-campaign, suppression-compte) — BLOQUÉ (comptes réels + service_role) ; job « Suites production (comptes réels) » vert au run 33861671142
- Rendu sur WebKit/Firefox/Safari/Samsung Internet et appareil réel — NON RÉALISÉ (Chromium seul, émulation)
- Comptage exact des interactions atteignables dans les feuilles créées dynamiquement (#v2CreateSheet, #v3PassioSheet) : mesuré à l'ouverture pour « Créer » (6 cases) mais pas pour « Trouver une expérience » ni pour les panneaux ContextualTools
- Chemins réseau externes (images unsplash/picsum, Supabase) coupés par le proxy de l'environnement : 111 erreurs réseau en émulation, non imputables au code

### code-nettoyage

- Contenu réellement servi par https://passio-app.netlify.app (SW actif, en-têtes, absence des .mp4) : BLOQUÉ par le proxy (403) — il faudrait un accès sortant ou une capture curl -I depuis un poste.
- Les 4 cas release-integrity réservés à PASSIO_CIBLE=dist : non lancés (build dist non exécuté dans cet audit) — `PASSIO_CIBLE=dist PASSIO_PORT=8109 npx playwright test tests/e2e/release-integrity.spec.js` sur un poste avec le Chromium attendu.
- Suites du projet prod (comptes réels, service_role) : interdites par le cadre ; s'appuyer sur le run CI 33861671142 (job « Suites production » vert).
- Usage réel de render.yaml (dashboard déployé sur Render ?) et du worker Cloudflare : non vérifiable depuis le dépôt (PASSIO_CDN_BASE vide → worker jamais utilisé par l'app) ; demander à Benjamin.
- Exhaustivité des 62 fonctions mortes : l'inventaire ne voit pas les appels par chaîne construite dynamiquement ni ceux depuis les Edge Functions/dashboard vers window.* ; 20 vérifiées à la main sur 62, 4 faux positifs identifiés.
- Classes CSS « sans émetteur » : approximation par mot entier (classes construites par concaténation et classes de bibliothèques non distinguées) ; 114 candidates, à confirmer une par une avant retrait.
- Date d'introduction des drapeaux : git log -S ne rend que le 2026-08-31 pour tous (réimport ou réécriture d'historique ce jour-là) ; les dates de lot viennent des docs, pas de git.
- Nombre de policies : 119 en public par pg_policies contre 128 annoncées par l'orchestrateur — écart non expliqué (schéma storage/realtime probablement compté), à trancher par le domaine sécurité/données.

### contenu

- BLOQUÉ — comportement réel iOS/Android (lecture mp4/m4a, MediaRecorder, Web Share natif) : Chromium seul ; il faudrait un iPhone et un Android physiques
- BLOQUÉ — upload réel d'un fichier 0 octet ou à MIME menteur jusqu'à Storage/insert (aucune écriture en prod autorisée) : mesuré jusqu'à l'appel de supaPublishPostWithRetry seulement ; il faudrait un projet Supabase de préproduction
- BLOQUÉ — suites du projet prod (authz-critical, multi-comptes, confidentialite…) : comptes réels et SUPABASE_SERVICE_ROLE_KEY requis ; le job « Suites production (comptes réels) » du run CI 33861671142 est vert sur le SHA audité
- BLOQUÉ — cohérence des compteurs abonnés/abonnements contre la base avec un compte réel (lecture seule sans session utilisateur)
- BLOQUÉ — vérification que https://passio-app.netlify.app sert bien le SHA audité (proxy réseau : 403 sur netlify.app)
- NON RÉALISÉ — listage anon effectif de storage.objects (CONT-11) : déduit de la policy, non exercé avec un client anon (aucune requête vers la prod hors connecteur lecture seule)
- NON RÉALISÉ — commentaire en aveugle sur un post privé par un non-abonné (CT-16) : déduit de la policy INSERT, non reproduit

### exploitation-continuite

- Plan Supabase et sauvegardes internes (PITR, backups quotidiens, rétention) : BLOQUÉ — connecteur interdit et information absente du dépôt. À lire dans Dashboard Supabase → Settings → Billing et Database → Backups ; puis tenter une restauration PITR sur un projet jetable.
- Existence et date de la dernière archive .passio/sauvegardes/ sur le poste de Benjamin : BLOQUÉ (dossier gitignoré, absent de ce clone). Demander `ls .passio/sauvegardes` et `npm run sauvegarde -- --verifier <dossier>`.
- Rollback Netlify (Deploys → Publish deploy) et durée réelle : BLOQUÉ (netlify.app → 403 proxy). À vérifier dans l'UI Netlify avec le compte propriétaire, et chronométrer une republication.
- Production servie (SHA en ligne, en-têtes réels) : BLOQUÉ (proxy 403) ; preuve indirecte = job « Déploiement production » vert sur le run 33861671142.
- GitHub Pages : has_pages = true mais l'API /pages et passio74.github.io sont bloqués par le proxy et aucune branche gh-pages n'existe ; à vérifier dans Settings → Pages (une seconde origine servant index.html sans les en-têtes Netlify serait un problème).
- Protection de main au-delà des checks (revues PR requises, force-push, suppression, contournement admin) : BLOQUÉ (GET /branches/main/protection → 403 « Resource not accessible by integration »). À lire dans Settings → Branches avec un jeton admin ou l'onglet Rules.
- Collaborateurs et second propriétaire GitHub : BLOQUÉ (API collaborators → 403). À lire dans Settings → Collaborators.
- Déploiement effectif du dashboard sur Render (render.yaml) : BLOQUÉ (aucune preuve dans le dépôt, réseau bloqué).
- Détention du domaine passio.app affiché dans À propos : BLOQUÉ (DNS non résolvable via le proxy). À vérifier chez le registrar.
- Contenu réel des 13 vidéos .mp4 et des PDF investisseurs (droits d'image, informations financières) : non visionnés (pas d'outil PDF, contenu hors périmètre d'audit du code) — seul l'en-tête LISEZ_MOI a été lu.
- Suites du projet prod (authz-critical, blocage-acces, user-state-horodatage, multi-comptes, confidentialite, qa-campaign, suppression-compte) : NON LANCÉES (comptes réels + service_role) ; vertes sur le run CI 33861671142.
- Appareils réels, WebKit/Firefox : NON RÉALISÉ (Chromium seul, émulation).

### irl

- Carte MapLibre/OpenFreeMap : tuiles et bibliothèque injoignables derrière le proxy → rendu, performance et recadrage non mesurés (1 test e2e rouge pour cette raison, vert en CI).
- Géocodage BAN/Photon : non exercé (réseau).
- Valeur réelle de `max_attendees` et comportements sur appareil réel (GPS, QR caméra) : non réalisés.
- Relecture adversariale des 13 problèmes : NON FAITE (crédits épuisés) — à confronter en contre-revue.

### messagerie-notifs

- Lecture/listing HTTP réels des pièces jointes en production (GET public, POST /object/list) : BLOQUÉ par le proxy de l'environnement (403 « Host not in allowlist » sur les 7 requêtes, preuves/anon-rest-storage-probe.json) — il faudrait un poste hors proxy ; la preuve retenue est la configuration (bucket public, policy, grants)
- Lecture anonyme de conv_reads par REST : même blocage ; preuve par pg_policies + has_table_privilege
- Simulation RLS par SET LOCAL ROLE anon/authenticated : refusée au rôle du connecteur (« permission denied to set role ») — vérifier avec authz-critical.spec.js (job prod vert) ou un rôle disposant de SET ROLE
- multi-comptes.spec.js (messagerie texte + vocal cross-compte, notifications) et confidentialite.spec.js (tiers bloqué / membre OK) : BLOQUÉ (comptes réels + SUPABASE_SERVICE_ROLE_KEY) — cité : run CI 33861671142 conclusion success sur c8cb8e99, job « Suites production (comptes réels) »
- Activation « Realtime Authorization » côté dashboard Supabase (nécessaire aux canaux privés) : non lisible en SQL ; la livraison cross-compte est couverte par multi-comptes (CI)
- Push Web de bout en bout (VAPID secrets posés, réception sur un vrai appareil, comportement iOS PWA) : non réalisé — il faudrait deux appareils réels abonnés
- Appels WebRTC réels (NAT symétrique, relais openrelay saturé, iOS) : non réalisé — deux appareils réels nécessaires
- Type MIME menteur servi par Storage (HTML/SVG rendu ou non en text/plain) : non re-mesuré (HTTP bloqué) ; s'appuie sur la mesure du 2026-08-17 de la migration
- Quota localStorage réel sur iOS/Safari (ITP 7 jours, IndexedDB sans onsuccess) : émulation Chromium seulement ; WebKit/Firefox non installés
- Rendu de 50 messages de 100 Ko : l'émulation a expiré pendant le rendu (S4 mesuré avec rendu neutralisé) — mesure de performance du rendu à refaire isolément

### moderation

- Captcha Supabase Auth et rate limits d'inscription/e-mail : non lisibles par SQL ; il faut ouvrir Supabase Dashboard → Authentication → Attack Protection et Rate Limits (BLOQUÉ, MOD-C17/C18).
- Contenu réel des 2 signalements en base (target_type, reason vide ?) et présence effective des 3 triggers trg_rate_limit / du prosrc prod de rate_limit_insert : connecteur interdit dans cette consigne — requêtes fournies dans notes pour l'orchestrateur.
- blocage-acces.spec.js (comptes réels, projet prod) : non exécutée (règle 7) ; vert au run CI 33861671142 ; ne couvre pas le re-follow (MOD-04).
- irl-trust-safety.spec.js : non exécutée (hors liste) ; commande fournie (MOD-C30).
- Reproduction en base des contournements MOD-04/05/06 (re-follow, RSVP d'un bloqué, flood) : exigerait des écritures sur la production → interdit ; conclusions fondées sur les policies exactes et le code (CONFIRMÉ par lecture).
- Parcours first-run → inscription sans étape d'âge : câblage non tracé jusqu'au bout (PLAUSIBLE dans MOD-08) ; à éprouver par un test local qui crée un compte via la première visite et lit state.user.birthYear.
- Aucun appareil réel, aucun autre navigateur que Chromium (émulation).

### perf-capacite-couts

- Capacité 1 000 / 10 000 / 100 000 : NON MESURÉE (capacité non prouvée).
- Plans, quotas et factures Supabase / Netlify / Brevo : BLOQUÉS (non lisibles).
- Carte et tuiles : BLOQUÉES (réseau).
- Batterie, réseau lent réel, appareils réels : non réalisés.
- Seconde passe de mesures (tas précis via CDP, CPU ×1) : le navigateur a planté 6 fois sur 6 (mesures-perf-2.json) pendant la saturation CPU de l'environnement — non exploitable.
- Relecture adversariale des 6 problèmes : NON FAITE.

### pilotage-sentinelle

- Déploiement Render (passio-pilotage.onrender.com) : existence, version, mot de passe fort, secret : BLOQUÉ — curl → code 000 (proxy sortant) ; il faudrait l'accès au tableau Render ou un réseau ouvert.
- Comportement RÉEL du CLI `claude` sous --tools TodoWrite / Read,Grep,Glob (liste blanche effective, lecture hors dépôt) : BLOQUÉ — non exécuté ici (consommerait l'abonnement et n'est pas reproductible sans le poste Windows) ; seules les mesures du 2026-08-16 (PASSIO_SENTINELLE_JOINT_AUDIT) existent.
- Sentinelle distante : résultats des runs horaires récents et issues « Santé rouge » : NON RÉALISÉ (accès GitHub Actions non exercé dans ce sous-audit ; le run CI 33861671142 vert est le seul fait établi).
- Runtime de la Sentinelle en conditions réelles (alerte → analyse → diagnostic → réparation) : BLOQUÉ — exige le poste avec `claude` connecté et DASH_ALLOW_MUTATIONS ; en sandbox le CLI était détecté « connecté » mais aucune alerte non manuelle n'a été provoquée pour ne pas consommer le quota.
- Insertion anonyme hostile dans telemetry_events (flood, severity critical) : NON RÉALISÉ (aucune écriture en base autorisée) — conclusion par policy + absence de trigger/contrainte (CONFIRMÉ par inspection).
- GRANT EXECUTE sur purge_telemetry (révocation affirmée par KNOWN_RISKS) : NON VÉRIFIÉ (pg_proc consulté, pas les ACL).
- Suites du projet prod (authz-critical, etc.) : NON LANCÉES (règle 7) — job « Suites production » vert dans le run 33861671142.
- Charge réelle d'ingestion du dashboard (100 lignes/s) : extrapolation calculée, non mesurée (aucun test de charge autorisé).

### profils-passions

- Valeur réelle de `max-rows` du projet Supabase : BLOQUÉE (REST direct refusé par le proxy, pg_settings ne l'expose pas) — l'émulation utilise la valeur par défaut Supabase (1 000).
- Relecture adversariale des 6 problèmes : NON FAITE (crédits épuisés).

### robustesse-pannes

- Rejeu des scénarios sur appareil réel (mise en veille, changement de réseau Wi-Fi→4G, bascule d'onglet) : non réalisé.
- Comportement sur 401 réel (jeton expiré après 1 h) : simulé par route Playwright, non vécu.
- Les 33 scénarios du banc n'ont pas tous produit d'observation exploitable avant l'interruption ; 20 observations horodatées sont déposées.
- Relecture adversariale des 6 problèmes : NON FAITE.

### supabase-isolation

- Isolation par requête SOUS LE MOTEUR RLS (SET LOCAL ROLE anon/authenticated) : refusé au rôle du connecteur (42501). Il faudrait un rôle de connecteur membre de anon/authenticated, ou une base jetable (Postgres Docker + policies réelles, comme tests/sql/socle-prod.sql) — ce que le banc CI « Banc Trust & Safety serveur (RLS, PostgreSQL jetable) » fait partiellement.
- Appels REST/Storage/RPC anon contre la production (counts, listing des buckets, oracles RPC) : proxy de l'environnement → CONNECT 403 sur supabase.co ; script rest_anon.sh également refusé par le classificateur. Il faudrait un poste avec accès réseau ; les étapes sont écrites dans les findings.
- UPDATE/DELETE ciblés sous rôle tiers dans une transaction annulée : impossible (SET ROLE refusé + transaction_read_only). Émulation des USING seulement ; la preuve exécutée reste authz-critical.spec.js en CI (run 33861671142 vert, non relancé ici : comptes réels + SUPABASE_SERVICE_ROLE_KEY).
- Compte privé : 0 profil is_private en prod → invisibilité d'un post privé non vérifiable sur données ; portée par la policy et par confidentialite.spec.js (projet prod, non lancé).
- Limites Realtime du plan (connexions simultanées, messages/s) et réglages Auth (provider anonyme, HIBP, captcha, MFA) : non lisibles par le connecteur (features=database,debugging,docs) ; il faudrait le tableau de bord Supabase.
- Suites du projet prod (authz-critical, confidentialite, multi-comptes, blocage-acces, user-state-horodatage, qa-campaign, suppression-compte) : NON LANCÉES (interdit : comptes réels en prod) ; citées via le job CI vert.
- Vérification que les previews Netlify pointent la prod : déduite de deploy.yml (même dist, même clé inlinée) — netlify.app inaccessible (403) donc non observée en ligne.

### tests-ci

- Flakiness réelle en CI (retries 2) : logs de jobs inaccessibles (proxy 403 vers l'hôte des logs, MCP github en AUTH_HEADER_REJECTED, gh absent). Il faudrait un jeton Actions:read ou les rapports Playwright en artefact (TCI-10).
- Exécution des 7 suites du projet prod (comptes réels, service_role) : interdite ici ; preuve de substitution = job « Suites production (comptes réels) » vert sur le run 33861671142 (5,8 min).
- Protection de branche main (reviews requis, status checks) : API GitHub 403 sans jeton admin.
- Scan de secrets GitHub natif (secret scanning / push protection) : état du dépôt non consultable sans droits admin.
- Re-mesure de la couverture fonctionnelle : exige la suite COMPLÈTE sous PASSIO_COUVERTURE=1 (interdite au sous-agent ; à lancer par l'orchestrateur : `PASSIO_COUVERTURE=1 PASSIO_PORT=<port> npx playwright test --project=local` puis `npm run couverture`).
- Suites opt-in multi-comptes/confidentialite/suppression-compte/qa-campaign : non lancées (écriture en prod) ; leur rupture sur le code actuel est établie par inspection (6 fonctions absentes), pas par exécution.
- Vérification directe de https://passio-app.netlify.app (artefact minifié servi) : BLOQUÉ par le proxy (403), comme indiqué par l'orchestrateur.
- Tests WebKit/Firefox : non réalisables (Chromium seul installé) — et de toute façon absents du dépôt.

### ux-onboarding

- Résultat FINAL des 8 suites e2e ciblées : run 2 à 25/103 (0 échec) au moment du rapport — lire la ligne « EXIT= » et le bilan « N passed / N failed » en fin de /tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/preuves/ux-onboarding/suites-ciblees.log ; le serveur `http-server -p 8101` lancé par moi est VOLONTAIREMENT laissé en vie pour ne pas tuer ce run (à arrêter ensuite : pkill -f 'http-server -p 8101')
- Inscription réelle, confirmation d'e-mail Brevo, migration des préférences du visiteur vers le compte, rappel par toast après authentification : NON exécutés (règle absolue : aucune création de compte) — couverts par inspection (first-run.js:1611-1714, 1796-1853) et par les cas « Transfert du mode invité » de first-run.spec.js (run 2 en cours)
- Appareil réel iOS Safari / PWA installée hors ligne / Android Chrome / Samsung Internet : NON RÉALISÉ (Chromium seul, r1194 via shim, version 141) ; UXO-01 et UXO-02 sont mesurés en émulation (UA iPhone, réseau SDK coupé) et devraient être reproduits sur un iPhone
- Production Netlify (SHA c8cb8e99) : BLOQUÉ (403 proxy) — tout le parcours est mesuré sur le serveur local (fichiers de dev, pas le monolithe dist/)
- Lien profond #reel=<id> pour un VISITEUR : mon détecteur (reelsState.open) était faux ; prouvé pour un compte connecté (capture 65) et par la garde d'appartenance buildReels (docs 02) — PROBABLE pour le visiteur
- Aide « conversation_irl » (app-07:5091) : non déclenchée (exige une conversation 1-1 avec targetUserId) — inspection seulement
- Fil VIDE et Rencontrer VIDE (aucune donnée) : non reproduits, le contenu de démonstration est embarqué ; textes des états vides lus dans le code
- Plafond de 3 passions atteint, « Réactiver », paywall : hors périmètre (suite mes-passions-page.spec.js non lancée)
- Suites du projet prod (comptes réels, SUPABASE_SERVICE_ROLE_KEY) : NON LANCÉES ; vertes dans le run CI 33861671142

## 4. Interruptions de l'audit lui-même

- Les crédits de session ont été épuisés trois fois (limites à 14:40 UTC et 19:40 UTC, puis « out of usage credits » vers 19:55 UTC). Les sous-agents des domaines irl, profils-passions, robustesse-pannes, perf-capacite-couts et appareils-a11y ont été interrompus à chaque tentative (trois par domaine) avant de rendre leur sortie structurée ; leurs preuves déposées ont été reprises par l'orchestrateur (rapports 04, 07, 09 : encadrés « Domaine reconstitué par l'orchestrateur »). Les domaines exploitation-continuite (20:33 UTC) et auth-rgpd (20:41 UTC) ont fini à la troisième tentative ; les reconstitutions provisoires de l'orchestrateur pour ces deux domaines sont conservées dans `donnees/resultats-orchestrateur-*.json` pour comparaison, mais ne comptent pas.
- La relecture adversariale n'a pas pu couvrir les problèmes de ces domaines ni ceux de tests-ci (81 problèmes « non relus » sur 192).
- Le plugin GitHub (`plugin:github:github`) n'a jamais pu se connecter (hôte `api.githubcopilot.com` hors liste blanche) ; les outils GitHub de la plateforme ont servi à la place. Les journaux de jobs GitHub Actions sont restés inaccessibles (403).
- Chromium : l'environnement ne portait que la révision 1194 alors que `@playwright/test` 1.60 attend la 1223 ; jusqu'à 14:50 UTC les sous-agents ont utilisé une configuration d'enveloppe (`executablePath`), ensuite un pont a rendu `npx playwright test` utilisable sans surcharge. Quelques mesures faites pendant la saturation CPU de l'environnement ont planté (perf, seconde passe) et sont écartées.