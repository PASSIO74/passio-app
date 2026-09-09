# Audit UX, onglets et onboarding — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (main, 2026-09-04). Modèle : Claude Fable 5.1 (auditeurs de domaine et relecteurs adversariaux). Statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE. Priorités : P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future. Chaque problème a été soumis à une relecture adversariale indépendante (angles reproduction / impact / contexte) ; la priorité retenue est celle de la relecture quand elle diffère.


## Domaine « ux-onboarding »

Audit UX / onglets / parcours / pitch / onboarding / tour / bulles sur le SHA c8cb8e99, en lecture seule. Méthode : (1) lecture de CLAUDE.md, AGENTS.md, docs/PREMIERE_VISITE.md, js/first-run.js, app-08 (tour, boot), app-02 (HINTS, goTo, onboarding), ui-v2-shell, sw.js, platform.js ; (2) trois parcours en émulation Chromium 390×844 (visiteur vierge, compte local sans session, compte connecté par client Supabase FACTICE hors réseau), 66 captures, journaux JSON, avec sondes sur geolocation / Notification / getUserMedia et réseau Supabase+CDN coupé ; (3) confrontation des anciens rapports ; (4) attaques : double clic sur le gate, hash hostile, id inexistant, SDK injoignable, nouvelle session ; (5) 8 suites e2e ciblées, workers=1. Verdict du domaine : la mécanique du parcours de première visite (entrée directe, gate à l'action engageante, 3 indications + 3 écrans + 3 aides au geste, carte de bienvenue par session, redirections goTo, liens profonds) est PROUVÉE et cohérente, aucune permission n'est demandée avant une action engageante (0 appel mesuré). Mais trois défauts P1 contredisent le pitch « l'application est elle-même le pitch » : (a) sur iPhone Safari un mur « Installer sur iPhone / iPad » recouvre le fil 1,5 s après le chargement, à chaque session (les suites first-run le neutralisent via passio_pwa_dismissed) ; (b) un compte local sans session (SDK Supabase injoignable — jamais mis en cache par le SW — ou jeton absent) retombe sur la landing historique qui promet le Carnet de voyage retiré, et y brûle l'aide feed_auteur ; (c) une messagerie de démonstration non étiquetée (5 conversations fictives, pastille « 3 » non lus) est servie aux visiteurs ET aux comptes connectés. S'y ajoutent deux culs-de-sac P2 (« Voir l'onboarding » et « Afficher le pitch » sans retour), l'allégation « contrôle d'âge IA » sans fondement, le téléphone obligatoire à l'inscription, une aide posée par-dessus la visionneuse de stories. Environnement de test : Playwright 1.60 attendait Chromium r1223, /opt/pw-browsers porte r1194 → shim par liens symboliques (Chromium 141) ; le run 1 des suites a été invalidé par la mort du serveur statique au cas 56/103 ; le run 2 sur mon propre serveur est à 25/103, 0 échec, au moment du rapport (résultat final en fin de suites-ciblees.log).

### Contrôles (29)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| C01 | Barre de navigation V2 : 5 destinations (Découvrir, Rencontrer, Créer, Messages, Profil), un seul onglet actif à la fois, aria-current posé | **PROUVÉ** | émulation | parcours-visiteur.json étapes 01/08/15/16 : nbNavActifs=1 sur chaque écran, navV2 label+active ; js/ui-v2-shell.js:70-76 ; captures 01-fil-visiteur.png, 06-rencontrer.png, 13-messages-visiteur.png, 14-profil-visiteur.png |
| C02 | Onglets internes du Fil : rail Suivis / passions (bulles additives) / sélecteur d'envies (Explorer, Apprendre, Idées, Rencontrer) | **PROUVÉ** | émulation | parcours-visiteur-2.json P3 : rail [Suivis, Sport, Vélo et cyclisme] après choix Sport+cyclisme (spécialité canonique nommée) ; étape « sélecteur d'envies » : 4 boutons visibles ; capture 28-fil-personnalise.png |
| C03 | Profil : deux onglets Publications / Activité (role=tab, aria-selected), état vide de l'onglet Activité | **PROUVÉ** | émulation | parcours-compte.json A4/A5 : tabs [Publications sel=true, Activité sel=false] puis [false,true] ; texte vide « Aucune activité pour le moment — rejoins ou propose une sortie depuis « Rencontrer ». » ; captures 42-profil-compte.png, 43-profil-activite-vide.png |
| C04 | Rencontrer : onglets Liste / Carte / Filtre, vue Filtre = Quand ? · Où ? · Quelles passions ? · Horaire + pied « Afficher N résultats », « Filtre » au singulier | **PROUVÉ** | émulation | parcours-visiteur.json étapes 09/10 : data-v4a5-vue=filtres, titres [Quand ?, Où ?, Distance maximale, Quelles passions ?, Horaire], onglets [Liste, Carte] visibles, vue carte data-v4a3-vue=carte ; bouton aria-label « Filtre : quand, où, quelles passions, horaire » ; captures 07-rencontrer-filtre.png, 08-rencontrer-carte.png |
| C05 | Écran Messages : accessible, onglet actif, contenu | **DÉFAILLANT** | émulation | Écran et onglet OK (étape 15) mais contenu = 5 conversations de DÉMONSTRATION non étiquetées + pastille « 3 » pour un visiteur (13-messages-visiteur.png) ET pour un compte connecté (parcours-compte-session.json S2, 61-messages-compte-session.png) ; js/app-04-comments-shop.js:2187 (SEED_CONVERSATIONS sans condition) → finding UXO-03 |
| C06 | Écran Rechercher (loupe) : onglets Recherche / Assistant IA, compteur du référentiel, retour | **PROUVÉ** | émulation | parcours-visiteur.json étape 18 : exTabs [Recherche actif, Assistant IA], count « Un aperçu parmi 1 908 passions — cherche la tienne juste au-dessus. », nbNavActifs=0 (aucun onglet de la barre n'est actif sur cet écran → UXO-12) ; capture 16-rechercher.png |
| C07 | Retour arrière navigateur : goTo(irl) puis back → Fil ; modale puis back → fermée ; IRL → fiche → back → back | **PROUVÉ** | émulation | parcours-visiteur-2.json G2 {ecran:screen-feed, navActif:[discover]}, G3 {modal:false} ; parcours-compte-session.json S8 apresBack1 {screen-irl, fiche:false} apresBack2 {screen-feed, navActifs:1} |
| C08 | Liens profonds #irl-event-<id>, #reel=<id>, id inexistant, hash hostile | **PROUVÉ** | émulation | Boot frais : #irl-event-e1 → screen-irl + fiche ouverte, hash réécrit #event-e1 (visiteur D, compte S6, captures 31/66) ; #reel=reel_seed_cuisine_1 (compte connecté) → visionneuse ouverte 1/20 (65-lien-profond-reel-session.png), fermeture → Fil hash vide (S7) ; #reel=inexistant, #irl-event-inexistant, #post-p1, #profil-inexistant → Fil, aucun message (silence documenté fiche 17) ; #irl-event-%3Cimg onerror%3E → Fil, aucune exécution, 0 pageerror |
| C09 | goTo('wallet'\|'shop') → profiles, goTo('cdv') → feed ; anciens hash #wallet #cdv au boot | **PROUVÉ** | émulation | parcours-visiteur-2.json G1 : wallet→screen-profiles (hash #profiles), shop→screen-profiles, cdv→screen-feed, chacun 1 écran actif ; #wallet/#cdv/#shop au boot → screen-feed (D, S6) ; js/app-02-state-utils.js:1973-1978 |
| C10 | Visiteur sans compte : entrée DIRECTE dans le fil, sans landing ni formulaire ni mur | **DÉFAILLANT** | émulation | Chromium UA desktop : OK (01-fil-visiteur.png, racine passio-first-run, carte de bienvenue à 987-1028 ms). UA iPhone Safari sans passio_pwa_dismissed : overlay #pwa-overlay z-index 99999 « Installer sur iPhone / iPad … Fermer » par-dessus le fil (parcours-visiteur-3.json V, 70-premiere-visite-sans-pwa-dismissed.png) ; js/platform.js:157-160, js/app-09-boot-pwa.js:9-30 → UXO-01 |
| C11 | Première action engageante → gate requireAuthentication (like, commenter, suivre, message, publier, bobine, activité, rejoindre, story) | **PROUVÉ** | émulation | L1 like → « Crée ton compte pour aimer cette publication … Créer mon compte / J'ai déjà un compte / Continuer à explorer » (20-gate-aimer.png) ; E2 « Je participe » → gate rejoindre (10-gate-rejoindre.png) ; C2 Bobine, C3 Activité, C4 Story → gate ; 07 « Ta story » n'ouvre PAS la caméra (mediaEditor false, 0 getUserMedia) ; 16 points d'appel inspectés (grep requireAuthentication, app-03:295 … app-08:1289). Exceptions : C1 Publication et C6 Audio ouvrent le Studio sans gate (gate au moment de publier, app-06:4205), C5 Live vidéo → toast sans porte (UXO-10) |
| C12 | Compte existant : trois portes de connexion (carte de bienvenue, Paramètres → Compte, déconnexion volontaire) et « ← Continuer à explorer » sur le formulaire | **PROUVÉ** | émulation | Carte : « J'ai déjà un compte — me connecter » présent (étape 01) ; Paramètres visiteur : « J'ai déjà un compte — me connecter » visible, « Changer mon mot de passe / Se déconnecter / Supprimer mon compte » masqués (étape 19) ; compte : « Se connecter avec un autre compte » (A9) ; L2 : formulaire splash, onglet signup, authMsg « Crée ton compte pour aimer cette publication Tes passions et tes préférences seront conservées. », 1 seul bouton de sortie après DOUBLE clic ; L4 retour → Fil complet (racine posée, 20 cartes). Déconnexion : suite connexion-compte-existant.spec.js (15 cas) en cours de ré-exécution, 12 premiers verts |
| C13 | Onboarding : étapes âge (refus < 13 ans), prénom, passions (composant plat), panneau visiteur passions + spécialités, pré-remplissage | **PROUVÉ** | émulation | O1b année 2015 → toast « PASSIO est réservé aux 13 ans et plus. », étape inchangée ; O2 texte ; O3 « Qu'est-ce qui te passionne ? / Recherche et choisis directement ce que tu aimes. » grille avec recherche ; P1-P3 panneau : 13 tuiles, spécialités Sport [Course à pied, Escalade, Vélo et cyclisme, Musculation, Natation], bouton « Voir mon fil (1) », prefs {passions:[sport], specialites:[cyclisme]} ; captures 22-24, 26-28. Inscription réelle NON exécutée (aucune création de compte, règle absolue 2) |
| C14 | Tour de démonstration historique (5 étapes) : jamais automatique après inscription V2, lançable via Paramètres → Démo → Tour démo, sortie « Terminer » → Fil | **PROUVÉ** | émulation | parcours-compte.json A12 : 5 étapes, boutons [Quitter, Terminer ✨], fin → screen-feed ; app-02:4398-4401 pose tourSeen=true à onbFinish V2 ; A2 tourActif=false après rechargement ; textes obsolètes → UXO-06 |
| C15 | Tour contextuel de première visite : 3 indications (decouvrir, rencontrer, creer), 3 indications d'écran (profil, messages, studio), 3 aides au geste (passions, envies, stories), jamais deux à l'écran, jamais par-dessus la carte | **PROUVÉ** | émulation | parcours-visiteur.json : 02 aucune bulle tant que la carte parle ; 03 decouvrir 1,2 s après « Explorer d'abord » ; 04 rien ne suit « Compris » ; 05 passions au tap sur le rail ; 06 envies ; 08 rencontrer 1,3 s après goTo irl ; 15 messages ; 16 profil ; 21 creer au RETOUR sur le Fil (tour {decouvrir, passions, envies, rencontrer, studio, messages, profil, creer}) ; captures 02-05, 19. Réserve : aide stories posée sur la visionneuse (UXO-09) |
| C16 | Persistance et non-répétition : bulles mémorisées dans passio_first_run_v1 ; carte de bienvenue par SESSION ; hints historiques dans state.hintsVus ; « Revoir les repères » remet à zéro | **PROUVÉ** | émulation | R1 rechargement même session : carte null, tip null, tour conservé ; R2 nouvelle visite (sessionStorage vidé) : carte « Tes passions sont sur cet appareil … Modifier mes passions / Plus tard » ; R3 relancerTour → decouvrir réaffichée ; A2 hint feed_auteur absent après rechargement, hintsVus {feed_auteur:true} ; js/first-run.js:596-660, 1342-1368, 1495-1505 ; app-02:5480-5535 |
| C17 | Suites e2e ciblées (first-run, aides-contextuelles, onboarding-v2, onboarding-passions-v2, navigation, connexion-compte-existant, ui-v2-shell, smoke), --project=local --workers=1, PASSIO_PORT=8101 | **PROBABLE** | test exécuté | Run 0 : 100 % ECHEC environnement (Playwright 1.60 → chromium_headless_shell-1223 absent, /opt/pw-browsers = r1194 ; suites-ciblees-ECHEC-ENV-browsers-1194-vs-1223.log). Shim PLAYWRIGHT_BROWSERS_PATH (liens symboliques, Chromium 141.0.7390.37). Run 1 : 55 passed / 48 failed en 19 min, 100 % des échecs = ERR_CONNECTION_REFUSED après la mort du webServer au cas 56/103 (suites-ciblees-RUN1-serveur-mort-a-56-sur-103.log) — invalide. Run 2 sur mon propre http-server : 25/103 exécutés, 0 échec au moment du rapport ; résultat final ajouté en fin de suites-ciblees.log (ligne EXIT=). Comptes par suite : first-run 54 cas, aides-contextuelles 10, onboarding-v2 13, onboarding-passions-v2 19, navigation 4, connexion-compte-existant 15, ui-v2-shell 22, smoke 10 (=147 lignes dont 3 variantes de cadrage) |
| C18 | Aucune demande de permission (GPS, notifications, caméra/micro) avant une action engageante | **PROUVÉ** | émulation | Sondes sur geolocation.getCurrentPosition/watchPosition, Notification.requestPermission, mediaDevices.getUserMedia : 0 appel sur tout le parcours visiteur (Fil, stories, Rencontrer, Carte, Filtre, fiche, Créer ×6, Messages, Profil, Rechercher, rechargements) — parcours-visiteur.json permissions=[], parcours-visiteur-2.json PERMS 0 ; compte A8 Rencontrer perms=[] ; app-07:2759-2763 (_passioIrlSkipGeoOnce consommé avant requestUserLocation), first-run.js:1881, app-05:1151-1162 (notifications seulement à l'ouverture d'une conversation 1-1, app-04:3589) |
| C19 | États vides de chaque écran (fil, messages, activités, profil) | **CONFORME PAR INSPECTION** | inspection code | Fil : « Tu ne suis encore personne » app-02:6204 + fil de découverte visiteur (first-run.js:1918) ; IRL : « Aucun événement » app-07:2702 ; profil Activité : PROUVÉ A5 ; Messages : « Aucune conversation / Recherche un utilisateur ci-dessus… » app-04:3466 mais JAMAIS atteint sur un appareil neuf car SEED_CONVERSATIONS (app-04:2187) → UXO-03. Fil et IRL vides non reproduits (contenu de démonstration embarqué) |
| C20 | Libellés cohérents : vocabulaire Découvrir / Rencontrer / Créer, « Filtre » singulier, moods sans emoji décoratif | **PROUVÉ** | émulation | navV2 labels [Découvrir, Rencontrer, Créer, Messages, Profil] sans emoji (ui-v2-shell.js:70-76) ; PASSIO_MOOD_LABELS = Idées/Apprendre/Rencontrer sans emoji (app-02:4780-4784) ; bouton « Filtre » singulier (07-rencontrer-filtre.png, aria-label) ; « Partager » n'est pas un onglet (la valeur produit « Partager » est portée par « Créer ») ; survivances : contextual-nav.js:22 title « Filtres » (panneau hors UI-4A5), index.html:1114 aria-label « Filtres », emoji décoratifs conservés dans l'onboarding (🔒 👋 ✨), la landing et le tour |
| C21 | Cohérence des retours : toast() vs alert()/confirm() | **PROUVÉ** | inspection code | grep : 0 alert( dans js/ et index.html ; toast( ≈ 330 appels ; 8 confirm() natifs bloquants : app-05:1602, app-07:5487, 5509, 5525, app-08:266, app-09:1233, 1262, 1306 → UXO-14 |
| C22 | Culs-de-sac : bouton qui mène nulle part, porte qui refuse sans dire par où passer, écran sans retour | **DÉFAILLANT** | émulation | « Voir l'onboarding » (Paramètres → Compte) visiteur ET compte : onboarding plein écran, sortieExploration=false, history.back inopérant (étapes 20/20b, A10/A10b, S3 ; 18-voir-onboarding-visiteur.png, 48-voir-onboarding-compte.png) → UXO-04 ; « Afficher le pitch » compte connecté : landing sans retour (S5, S5b back, S5c Échap, S5d ; 63-pitch-connecte.png) → UXO-05 ; « Live vidéo » visiteur : toast sans porte (34-creer-5.png) → UXO-10. Vérifié SAIN : gate (3 issues), formulaire d'auth (« ← Continuer à explorer »), page Mes passions (flèche retour + goTo ferme la page, A6b), porte « Ajouter une passion » ouverte (data-passion-porte=ouverte, A6) |
| C23 | Attaques : double clic sur « Créer mon compte », hash hostile, id inexistant, SDK/CDN injoignable, nouvelle session | **PROUVÉ** | émulation | L2 double clic → 1 seul #frBackToExplore, 1 onboarding ; hash <img onerror> → inerte, 0 pageerror (parcours-compte-session.json erreurs=[]) ; SDK coupé : visiteur fonctionnel (275 erreurs console « Failed to load resource » = bruit réseau), mais compte local → landing (UXO-02) ; nouvelle session → carte de bienvenue revient (R2) |
| C24 | Page « Mes passions » : en-tête cohérent (compteur, quota), porte d'ajout qui répond, fermeture par l'onglet Profil | **PROUVÉ** | émulation | Visiteur : « 0 passion active sur 3 » + porte « Ajouter une passion » (15-mes-passions-visiteur.png) ; compte : « 1 passion active sur 3 / 3 changements de passion disponibles sur 3 », data-passion-quota=disponible, porte data-passion-porte=ouverte (A6, 44-mes-passions-compte.png) ; A6b onglet Profil → page fermée. Plafond atteint et « Réactiver » non exercés (suite mes-passions-page.spec.js hors périmètre) |
| C25 | Pitch : landing historique et tour démo décrivent le produit ACTUEL | **DÉFAILLANT** | inspection code | index.html:95-180 : « 📔 Documente tes voyages — Raconte tes périples avec étapes, photos, conseils et carte » (CDV retiré, ADR-011 §6, goTo('cdv') redirigé), « Choisis ton humeur du moment … de te détendre » (moods = Idées/Apprendre/Rencontrer), « podcast » ; app-08:58-116 tour : « Templates pour démarrer facilement », « envie de créer, d'apprendre ou de te détendre » ; capture 40-fil-compte.png / 52-pitch-landing.png → UXO-06 |
| C26 | Écran d'inscription : champs et validations (e-mail, mot de passe ≥ 6, confirmation, téléphone) | **PROUVÉ** | émulation | L2 : onglet signup montre « NUMÉRO DE TÉLÉPHONE » (21-auth-splash-visiteur.png) ; L3 soumission vide → « Adresse e-mail invalide. » ; app-02:3388-3402 : téléphone OBLIGATOIRE à la création (8-15 chiffres) → UXO-08 ; étape âge : « contrôle d'âge IA » sans mécanisme (app-02:3181-3196) → UXO-07 |
| C27 | Toast de mise à jour PWA et overlay d'installation à la première visite | **DÉFAILLANT** | émulation | 01-fil-visiteur.png : « ✨ Mise à jour disponible — recharge pour l'appliquer » sur un appareil VIERGE ; sw.js:29-38 poste SW_UPDATED à chaque activate (installation initiale comprise, includeUncontrolled), app-09:254-256 → UXO-11 ; overlay iOS → UXO-01 |
| C28 | Production Netlify (https://passio-app.netlify.app) : parcours réel sur l'artefact déployé | **BLOQUÉ** | non réalisé | Accès HTTP sortant vers netlify.app = 403 (proxy de l'environnement, fait établi par l'orchestrateur) ; le SHA de prod c8cb8e99 est attesté par le job « Déploiement production » du run 33861671142 |
| C29 | Appareil réel iOS Safari / Android Chrome / Samsung Internet, mode standalone (PWA installée) | **BLOQUÉ** | non réalisé | Chromium seul (r1194 via shim, Chromium 141) ; l'overlay iOS et la landing hors ligne sont mesurés en ÉMULATION (UA iPhone, SDK coupé) — il faudrait un iPhone en Safari puis en PWA installée, hors ligne, pour confirmer UXO-01 et UXO-02 sur le terrain |

### Problèmes (14)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| UXO-01 | **P1** | CONFIRMÉ par la relecture | iPhone Safari : un mur « Installer sur iPhone / iPad » recouvre le fil de première visite 1,5 s après le chargement, à chaque session |
| UXO-02 | **P1** | INCERTAIN après relecture | Compte local sans session (SDK Supabase injoignable ou jeton absent) : landing historique par-dessus le fil, aide feed_auteur brûlée, application inaccessible hors ligne |
| UXO-03 | **P1** | INCERTAIN après relecture | Messagerie de démonstration non étiquetée : 5 conversations fictives et une pastille « 3 » non lus servies au visiteur ET à un compte connecté |
| UXO-04 | **P2** | CONFIRMÉ par la relecture | « Voir l'onboarding » (Paramètres → Compte) est un cul-de-sac : onboarding plein écran sans retour, pour le visiteur comme pour le compte |
| UXO-05 | **P2** | CONFIRMÉ par la relecture | « Afficher le pitch » (Paramètres → Démo) enferme un compte connecté sur la landing, sans retour |
| UXO-06 | **P2** | CONFIRMÉ par la relecture | La landing/pitch et le tour démo promettent des fonctions retirées ou renommées (Carnet de voyage, humeurs « te détendre », templates) |
| UXO-07 | **P1** | CONFIRMÉ par la relecture | L'étape « Vérification d'âge » affirme un « contrôle d'âge IA » qui n'existe pas |
| UXO-08 | **P2** | CONFIRMÉ par la relecture | Numéro de téléphone OBLIGATOIRE à la création de compte, sans explication de son usage |
| UXO-09 | **P2** | CONFIRMÉ par la relecture | L'aide au geste « stories » se pose PAR-DESSUS la visionneuse de story ouverte |
| UXO-10 | **P2** | CONFIRMÉ par la relecture | Portes de création incohérentes pour un visiteur : « Live vidéo » refuse par un toast sans porte, « Publication » et « Audio » ouvrent le Studio sans gate |
| UXO-11 | **P3** | CONFIRMÉ par la relecture | Toast « ✨ Mise à jour disponible — recharge pour l'appliquer » à la PREMIÈRE visite |
| UXO-12 | **P3** | CONFIRMÉ par la relecture | Écran « Rechercher » sans onglet actif dans la barre de navigation |
| UXO-13 | **P3** | CONFIRMÉ par la relecture | L'aide « passions » se déclenche sur « Suivis », seule bulle du rail d'un visiteur, et parle de passions absentes |
| UXO-14 | **P3** | CONFIRMÉ par la relecture | Huit dialogues natifs confirm() bloquants malgré la convention « toasts, jamais alert() » |

### UXO-01 — iPhone Safari : un mur « Installer sur iPhone / iPad » recouvre le fil de première visite 1,5 s après le chargement, à chaque session

| Champ | Valeur |
|---|---|
| Identifiant | UXO-01 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Première visite (first-run) / installation PWA (platform.js, app-09) |
| Résultat attendu | « Un visiteur sans compte entre DIRECTEMENT dans le fil — aucune landing, aucun formulaire, aucune demande » (CLAUDE.md, docs/PREMIERE_VISITE.md) ; l'installation est proposée au moment où elle sert, jamais avant le pitch |
| Résultat observé | Avec un UA iPhone Safari (non standalone), #pwa-overlay (z-index 99999, plein écran) s'affiche 1,5 s après `load` par-dessus le fil : « PASSIO Le réseau de tes passions 📱 Installer sur iPhone / iPad 1️⃣ Appuie sur Partager ⬆️ … 2️⃣ Choisis « Sur l'écran d'accueil » puis Ajouter — Fermer ». Fermeture mémorisée en sessionStorage seulement → revient à chaque nouvelle session tant que l'app n'est pas installée. Les 54 cas de first-run.spec.js posent `passio_pwa_dismissed=1` (tests/e2e/first-run-helper.js:50) et ne peuvent donc pas le voir |
| Reproduction | Contexte Chromium 390×844, UA iPhone Safari, sessionStorage sans passio_pwa_dismissed, gate déverrouillé → /index.html → attendre 4 s → lire les nœuds fixed visibles (script parcours-visiteur-3.js, variante « sans-pwa-dismissed ») |
| Preuve | js/platform.js:157-160 (setTimeout(pwaShowOverlay,1500) si _isIOSSafari) ; js/app-09-boot-pwa.js:9-30 ; capture 70-premiere-visite-sans-pwa-dismissed.png ; parcours-visiteur-3.json V « overlays:[{id:pwa-overlay, z:99999, …}] » |
| Impact utilisateur et commercial | Le premier contact d'un visiteur iPhone venu d'un lien partagé est un tutoriel d'installation, pas le produit ; contredit le pitch « l'application est elle-même le pitch » et pèse sur la conversion du canal principal (mobile). Commercialement : premier écran = friction, pas valeur |
| Visibilité dans le Centre de pilotage | non — aucun événement de télémétrie n'est émis à l'affichage ni à la fermeture de #pwa-overlay (grep tel/track dans pwaShowOverlay : aucun) |
| Détection par la Sentinelle | non — aucune erreur, aucun événement ; seul un taux de first_run_started sans guest_content_opened pourrait le trahir, indirectement |
| Proposition de correction | Ne plus déclencher pwaShowOverlay automatiquement sur iOS Safari (platform.js:157-160) ; garder la porte manuelle (bouton « Installer l'application », entrée Paramètres) et, au plus, une bannière non bloquante après une action engageante ; retirer `passio_pwa_dismissed` du helper first-run pour que la suite mesure le vrai premier écran ; tracer `pwa_overlay_shown/dismissed` |
| Risque de régression | Faible : suppression d'un minuteur ; l'installation manuelle reste intacte (pwaInstall). Vérifier que les suites first-run restent vertes sans le drapeau helper |
| Effort estimé | 0,5 j (code + test + télémétrie) |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). 1. Code inchangé vs SHA audité : `git diff --stat c8cb8e99 HEAD -- js/ index.html styles.css tests/` = vide (les 2 commits au-dessus ne touchent que .passio/audits). 2. Chaîne de code relue : js/platform.js:113-115 (`_isSafari` = regex UA sans chrome/crios, `_isIOSSafari = _isIOS && _isSafari`) → :152-160 (`window.addEventListener('load', …)` puis `if (_isIOSSafari) setTimeout(pwaShowOverlay, 1500)`) → js/app-09-boot-pwa.js:9-14 (seule garde : `_isStandalone` et `sessionStorage.passio_pwa_dismissed === "1"`, aucune lecture de `_pwaInstalled` ni de localStorage) → :28-41 (CAS 2 iOS Safari, contenu « Installer sur iPhone / iPad … Fermer ») ; `pwaDismiss` app-09:1614-1623 n'écrit QUE `sessionStorage`. CSS styles.css:6283-6291 : `#pwa-overlay { position:fixed; inset:0; z-index:99999 }`. index.html:1675 balise présente, et `html.passio-locked` (access-gate.js:117) ne masque pas `#pwa-overlay`. 3. Preuve du finding vérifiée : parcours-visiteur-3.json étape « V sans-pwa-dismissed » (overlay id pwa-overlay z 99999, texte identique) et capture 70-premiere-visite-sans-pwa-dismissed.png (mur centré sur le fil flouté) concordent avec le script parcours-visiteur-3.js:9-16. 4. Reproduction indépendante (test exécuté, émulation Chromium 390×844, UA iPhone Safari 17, gate posé, réseau Supabase/CDN coupé, serveur http-server sur :8120) — preuves/relecture-reproduction/UXO-01/repro.js + repro.json + 4 captures : A (sans passio_pwa_dismissed) → `#pwa-overlay` passe en `display:flex` 1 520 ms après `load`, `position:fixed`, `z-index 99999`, 390×844, `elementFromPoint(195,600)` = pwa-overlay, écran actif = screen-feed avec racine `passio-first-run` et carte de bienvenue présente, 0 pageerror ; après « Fermer » : `sessionStorage=1`, `localStorage=null`. B (drapeau posé) → jamais affiché en 5 s. C (nouveau contexte = nouvelle session, sans drapeau) → réaffiché à 1 523 ms : « à chaque session » confirmé. D (UA desktop Chrome, sans prompt natif) → jamais affiché : le défaut est bien spécifique à iOS Safari. 5. tests/e2e/first-run-helper.js:50 pose bien `sessionStorage.setItem("passio_pwa_dismissed","1")` dans `bootVisiteur` : la suite first-run ne peut pas voir ce mur. Limite : émulation Chromium à UA usurpé, jamais un iPhone réel (WebKit non installé) ; mais la branche est pilotée uniquement par la regex UA, donc la reproduction est fidèle au code. — Correction de formulation : Formulation exacte ; deux précisions mineures : (1) la preuve cite js/platform.js:157-160, les lignes exactes sur ce SHA sont 152-160 (écouteur `load` à 152, garde `_isIOSSafari` à 157, setTimeout 1500 à 158-160) ; (2) préciser que `pwaShowOverlay` (app-09:9-14) ne consulte NI `_pwaInstalled` ni `localStorage.passio_pwa_installed` — Safari iOS n'émettant pas `appinstalled`, même ce drapeau n'arrêterait rien : « tant que l'app n'est pas installée » se lit en réalité « tant qu'on n'est pas en mode standalone ». Le champ « méthode » doit dire « émulation » (UA usurpé sous Chromium), jamais « appareil réel ».
- **impact** → CONFIRMÉ (priorité proposée P1). Code relu sur le SHA audité : js/platform.js:157-160 — `if (_isIOSSafari) setTimeout(pwaShowOverlay, 1500)` dans l'écouteur `load`, sans aucune condition d'état (visiteur, compte, action engageante) ; js/app-09-boot-pwa.js:9-14 — la seule garde est `sessionStorage.passio_pwa_dismissed`, donc retour à chaque session tant que non installé ; styles.css:6283 — `#pwa-overlay` en `position:fixed; inset:0; z-index:99999`, plein écran, fond flouté. Détection purement UA (`_isIOSSafari`, platform.js:114-115), donc l'émulation Chromium avec UA iPhone est représentative du chemin ; aucun appareil réel (à dire). Aucune décision documentée n'en fait un comportement attendu : docs/PREMIERE_VISITE.md et js/first-run.js ne contiennent pas une occurrence de « pwa » ; la seule trace est docs/RAPPORT_SESSION_2026-06-10.md:34 (défaut n° 9 : « re-proposé en boucle »), correctif qui a limité la boucle à une session sans revenir sur l'affichage automatique — antérieur de trois mois au parcours « l'application est elle-même le pitch » (2026-09-01) qu'il contredit. CLAUDE.md § PREMIÈRE VISITE : « entre DIRECTEMENT dans le fil — aucune landing, aucun formulaire ». Angle de test : 12 suites posent `passio_pwa_dismissed=1` (first-run-helper.js:49, first-run.spec.js:98, feed-premier-rendu:48, connexion-compte-existant:33…) — le vrai premier écran iOS n'est mesuré nulle part ; aucune télémétrie (`tel(`) dans pwaShowOverlay/pwaDismiss. Priorité : aucun critère d'interdiction du GO grande échelle n'est touché (ni isolation, ni restauration, ni capacité, ni fonction critique invisible, ni sécurité IRL, ni staging) → pas P0. Mais c'est le premier écran du canal principal (mobile iOS), récurrent à chaque session, invisible des tests, du pilotage et de la Sentinelle, et opposé à la stratégie d'acquisition documentée → P1 « avant lancement public » est juste ; P2 sous-estimerait un défaut qui se rejoue sur 100 % des sessions iPhone Safari non installées, comptes existants compris. git status --short : vide. — Correction de formulation : Observé : préciser que le mur n'est pas limité à la première visite — il frappe TOUTE session iPhone Safari non installée, comptes connectés compris (aucune condition d'état dans platform.js:157-160), ce qui élargit l'impact au-delà du parcours first-run ; et que sous le gate de beta il devient visible à la levée du gate (z-index 2147483647 > 99999), non 1,5 s après le load. Méthode : indiquer « émulation Chromium, UA iPhone ; appareil réel non réalisé » (la détection est UA-only, donc représentative). Preuve : ajouter styles.css:6283 (fixed/inset:0/99999) et docs/RAPPORT_SESSION_2026-06-10.md:34 comme seule trace de décision, antérieure au pitch. Effort 0,5 j plausible ; risque de régression faible confirmé (le chemin manuel pwaInstall reste, app-09:142/160/201).
- **contexte** → INCERTAIN (priorité proposée P1). agent sans résultat

### UXO-02 — Compte local sans session (SDK Supabase injoignable ou jeton absent) : landing historique par-dessus le fil, aide feed_auteur brûlée, application inaccessible hors ligne

| Champ | Valeur |
|---|---|
| Identifiant | UXO-02 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | INCERTAIN après relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | boot() (app-08) / landing / service worker |
| Résultat attendu | Un compte déjà onboardé retrouve son fil ; hors ligne, la PWA affiche « Mode hors-ligne — contenu en cache » (bannière index.html:502) et reste utilisable ; une aide ne se consomme que si elle est visible |
| Résultat observé | Sans session (ici : requêtes vers jsdelivr/supabase coupées), boot() atteint showLanding() : #landing.active recouvre un fil pourtant rendu, avec pour seules portes « Se connecter / Créer un compte / Installer l'application ». Le hint « Appuie sur l'auteur pour découvrir sa Passio » se pose PAR-DESSUS la landing (z 9000) et est marqué vu (hintsVus.feed_auteur=true) sans avoir pu servir. sw.js ignore toute origine étrangère (sw.js:131) donc le SDK CDN (supabase-loader.js:10) n'est jamais en cache : au lancement hors ligne de la PWA installée, `supa` reste le stub noop, getSession rend null → landing. Le helper de test app-helper.js:104 retire #landing.active à la main après le boot : les 88 suites onboardées masquent le comportement |
| Reproduction | État onboardé dans localStorage passio_mvp_state_v1 (fixture etatOnboarde), gate déverrouillé, routes supabase\|jsdelivr abortées → /index.html → attendre 3,5 s → #landing.classList.contains('active') = true, .passio-hint présent (script parcours-compte.js A1/A1b) |
| Preuve | js/app-08-ui-modals-tour.js:2183 (getSession), 2519-2540 (entreeDirecte false car compteExistant → showLanding()), 274-276 showLanding ; sw.js:126-131 ; js/supabase-loader.js:10 ; capture 40-fil-compte.png (landing + bulle d'aide par-dessus) ; parcours-compte.json A1 {landingActif:true, hint:feed_auteur, hintsVus:{feed_auteur:true}} ; tests/e2e/app-helper.js:104 |
| Impact utilisateur et commercial | Utilisateur connecté qui ouvre l'app hors ligne ou sur réseau dégradé (CDN lent/bloqué) : il voit le pitch au lieu de son fil et doit « se connecter » sans réseau ; cache vidé / session expirée → même écran. L'aide pédagogique de première carte est perdue. Commercialement : promesse PWA hors ligne non tenue, perception de « déconnexion » aléatoire |
| Visibilité dans le Centre de pilotage | partiel — screen_view n'est pas émis pour la landing ; un boot sans session n'émet rien de distinctif ; la télémétrie elle-même part par POST REST indépendant du SDK (telemetry.js) mais aucun événement « landing_after_local_account » n'existe |
| Détection par la Sentinelle | non — aucune erreur (console.warn « Supabase SDK load failed » seulement), aucun client_errors |
| Proposition de correction | ① Branche « état local onboardé + pas de session » : ne pas montrer la landing mais l'app en lecture seule + bannière « connexion en attente » (ou ouvrir directement le formulaire de connexion avec « ← Continuer » quand un jeton est absent) ; ② mettre en cache le SDK (copie locale vendorisée dans js/ inlinée par build.js, ou cache SW de l'URL CDN) ; ③ montrerHint doit refuser quand #landing/#onboarding est actif (même garde que ecranOccupe) ; ④ retirer le `landing.classList.remove('active')` d'app-helper.js et faire un test explicite du démarrage hors ligne |
| Risque de régression | Moyen : touche boot() et le SW (chemin critique) ; à protéger par un test « boot hors ligne avec état onboardé » et par la suite dist-build |
| Effort estimé | 1,5 à 2 j |

Relecture (angles indépendants) :

- **reproduction** → INCERTAIN (priorité proposée P1). agent sans résultat
- **impact** → INCERTAIN (priorité proposée P1). agent sans résultat
- **contexte** → INCERTAIN (priorité proposée P1). agent sans résultat

### UXO-03 — Messagerie de démonstration non étiquetée : 5 conversations fictives et une pastille « 3 » non lus servies au visiteur ET à un compte connecté

| Champ | Valeur |
|---|---|
| Identifiant | UXO-03 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | INCERTAIN après relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Messages (app-04 getConversations / SEED_CONVERSATIONS, app-08 renderMsgBadge) |
| Résultat attendu | Un contenu de démonstration est reconnaissable (le fil étiquette « Exemple PASSIO », first-run.js etiquetteDemo) ; un compte réel ne voit que ses conversations ; un compteur de non-lus ne compte que des messages réels |
| Résultat observé | Sans clé passio_conversations_v1, getConversations() charge SEED_CONVERSATIONS sans aucune condition (ni visiteur, ni _supaReal) : « Léa Moreau — J'ai un local sympa au sud de Lyon », « Théo Roussel — Toi : Trop bien, je m'inscris » (message attribué à l'utilisateur), etc. ; badge nav « 3 » ; la conversation s'ouvre en entier avec « Voir le profil » ; aucune mention Exemple/démo (regex sur le texte de l'écran : false). Reproduit avec le client Supabase factice (compte connecté, S2 : 5 conversations, badgeNav « 3 ») |
| Reproduction | Visiteur ou compte sans passio_conversations_v1 → onglet Messages (scripts parcours-visiteur-2.js M1/M2, parcours-compte-session.js S2) |
| Preuve | js/app-04-comments-shop.js:2031 (SEED_CONVERSATIONS), 2178-2189 (getConversations sans garde), 3485 ; js/app-08-ui-modals-tour.js:1724-1727 (badge = somme des unread, seed compris) ; captures 13-messages-visiteur.png, 33-conv-demo-visiteur.png, 61-messages-compte-session.png ; parcours-visiteur-2.json M1 {nbConvs:5, exemple:false} |
| Impact utilisateur et commercial | Un nouvel inscrit croit avoir reçu des messages, répond à des personnages fictifs (aucune erreur : écriture locale), et le badge « 3 » ment en permanence ; confiance et compréhension du produit atteintes dès le premier jour ; risque de signalements « faux comptes » |
| Visibilité dans le Centre de pilotage | non — aucun événement ne distingue une conversation de démo d'une vraie ; les ouvertures de conv de démo se comptent comme de l'usage réel |
| Détection par la Sentinelle | non |
| Proposition de correction | Ne charger SEED_CONVERSATIONS que pour le visiteur (PassioFirstRun.estVisiteur()) avec étiquette « Exemple PASSIO » et réponse désactivée, ou les retirer ; exclure les conversations seed de renderMsgBadge ; purger les seeds à la création/connexion d'un compte (déjà partiellement fait par purgeAccountScopedData à la déconnexion, mais pas à l'inscription) ; test : compte onboardé sans conversations → « Aucune conversation » |
| Risque de régression | Faible à moyen : des suites e2e de messagerie reposent sur les conversations seed (à recenser : grep « Léa Moreau » dans tests/e2e) |
| Effort estimé | 1 j (code + tests) |

Relecture (angles indépendants) :

- **reproduction** → INCERTAIN (priorité proposée P1). agent sans résultat
- **impact** → INCERTAIN (priorité proposée P1). agent sans résultat
- **contexte** → INCERTAIN (priorité proposée P1). agent sans résultat

### UXO-04 — « Voir l'onboarding » (Paramètres → Compte) est un cul-de-sac : onboarding plein écran sans retour, pour le visiteur comme pour le compte

| Champ | Valeur |
|---|---|
| Identifiant | UXO-04 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | resetOnboarding (app-08) / panneau Paramètres |
| Résultat attendu | Toute page plein écran a une sortie (règle fiche 19 : « une porte fermée doit dire par où passer », piège ⑦ de PREMIERE_VISITE : « l'onboarding est un cul-de-sac sans porte de sortie ») |
| Résultat observé | Le bouton est visible pour un visiteur (étape 19) et pour un compte (A9). Tap → #onboarding.active à l'étape splash (formulaire Se connecter), aucun écran actif, aucun « ← Continuer à explorer » (poserSortieExploration n'est pas appelée), history.back() ne ferme rien (20b, A10b), Échap non plus. Seul un rechargement sort ; resetOnboarding persiste state.onboarded=false (app-08:6124-6126) : après rechargement, un compte sans session est traité en visiteur (A11 : racine passio-first-run, carte de bienvenue) et un compte connecté est ré-onboardé par boot() |
| Reproduction | ⋯ → Compte → « Voir l'onboarding » → tenter retour arrière / Échap (scripts parcours-visiteur.js étapes 20/20b, parcours-compte.js A10/A11, parcours-compte-session.js S3/S4) |
| Preuve | js/app-08-ui-modals-tour.js:6122-6135 ; index.html:410 ; captures 18-voir-onboarding-visiteur.png, 48-voir-onboarding-compte.png, 49-apres-voir-onboarding-reload.png |
| Impact utilisateur et commercial | Une entrée de Paramètres, sans avertissement, enferme l'utilisateur dans un formulaire de connexion ; dans une PWA installée il n'y a pas de bouton recharger → fermeture forcée de l'app. Un compte connecté y perd son état « onboardé » local |
| Visibilité dans le Centre de pilotage | non — aucun événement à l'ouverture de resetOnboarding |
| Détection par la Sentinelle | non |
| Proposition de correction | Retirer l'entrée (elle date de la démo : `resetOnboarding` réinitialise l'état) ou la ranger dans « Démo » avec confirmation, et appeler PassioFirstRun.poserSortieExploration() / offrir un « ← Retour » ; ne jamais persister onboarded=false pour un compte existant |
| Risque de régression | Faible |
| Effort estimé | 0,25 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur le code audité (HEAD f501fb7 = c8cb8e99 + 2 commits d'audit hors js/ et index.html, `git diff --stat c8cb8e99 HEAD -- js/app-08… index.html js/first-run.js js/app-02…` vide). Serveur local http-server port 8120, Chromium 390×844, réseau Supabase/CDN coupé, script /tmp/…/scratchpad/preuves/verif-UXO-04/repro.js (log repro.log, capture apres-clic.png) : - ⋯ → section « Compte » → bouton « Voir l'onboarding » VISIBLE pour un visiteur (isVisible=true) ; index.html:411 le pose hors de `majSectionCompte()` (app-02:2241-2259 ne masque que settingsLogout/ChangePassword/DeleteAccount). - Clic → `#onboarding.active`, étape `splash`, `.screen.active` = null, `#frBackToExplore` absent, seuls boutons visibles : Se connecter / Créer un compte / 👁 / Continuer avec Google ; `localStorage.passio_mvp_state_v1.onboarded` = false (app-08:6122-6126 : `state.onboarded=false; saveState()`, aucun appel à `PassioFirstRun.poserSortieExploration`, contrairement à `openAuthScreen` app-02:2662-2668). - Escape : inchangé (app-08:46 ne ferme que `#modalBackdrop`). `history.back()` : l'URL passe à `#irl` et `screen-irl` devient actif SOUS l'onboarding toujours `.active` (popstate app-02:2177 → `closeCurrentOverlay()` app-02:2063-2170 ne connaît pas `#onboarding` → `goTo`). Appel direct `closeCurrentOverlay()` : inchangé. Seul `reload` sort (étape 6 : screen-feed, onboarding inactif). 0 pageerror. - Preuves déposées du domaine cohérentes : parcours-visiteur.json étapes 20/20b, parcours-compte.json A10/A10b/A11, parcours-compte-session.json S3/S4. — Correction de formulation : La phrase « un compte connecté est ré-onboardé par boot() » est FAUSSE et à retirer : avec une session Supabase valide, boot() repose `state.onboarded=true` avant et après `supaLoadUserState` (app-08:2279-2291) ; la preuve S4 du domaine le montre elle-même (rechargement connecté → screen-feed, onboarding inactif, racineFirstRun false). Le seul dégât persistant est celui d'A11 : un compte LOCAL sans session est traité en visiteur après rechargement (state.onboarded=false persisté). Préciser aussi dans « observé » que le retour arrière ne laisse pas « aucun écran actif » mais bascule l'écran sous l'onboarding resté affiché (screen-irl + #onboarding.active). Le reste (attendu, preuve, impact, effort 0,25 j, P2) tient.
- **impact** → INCERTAIN (priorité proposée P2). agent sans résultat

### UXO-05 — « Afficher le pitch » (Paramètres → Démo) enferme un compte connecté sur la landing, sans retour

| Champ | Valeur |
|---|---|
| Identifiant | UXO-05 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | showPitchLanding / showLanding (app-08) / landing (index.html) |
| Résultat attendu | Une démonstration du pitch se referme et rend l'application ; un compte connecté n'est jamais renvoyé à un formulaire de connexion |
| Résultat observé | La landing s'affiche avec pour seuls boutons « Se connecter », « Créer un compte », « Installer l'application » ; history.back() et Échap la laissent active (S5b, S5c) ; « Se connecter » ouvre le formulaire d'auth à un compte DÉJÀ connecté (S5d, MY_UID uuid présent) ; aucun « Retour / Entrer » |
| Reproduction | Compte connecté (client factice) → showPitchLanding() → back / Échap / « Se connecter » (script parcours-compte-session.js S5-S5d) |
| Preuve | js/app-08-ui-modals-tour.js:2089-2092, 274-276 ; index.html:172-181 (boutons de la landing) ; captures 63-pitch-connecte.png, 64-pitch-se-connecter-connecte.png |
| Impact utilisateur et commercial | Un utilisateur curieux du menu Démo est éjecté de son compte à l'écran (état local intact) ; il croit être déconnecté et se reconnecte (rechargement) — confusion et perte de confiance |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Ajouter un bouton « ← Revenir à l'application » sur la landing quand state.onboarded ou une session existe (exitLanding), fermer la landing sur Échap/back via closeCurrentOverlay, et masquer « Afficher le pitch » hors mode démo |
| Risque de régression | Faible |
| Effort estimé | 0,25 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). SHA : branche HEAD f501fb78 = c8cb8e99 + 2 commits d'audit ; `git diff --stat c8cb8e99 HEAD -- js/app-08-ui-modals-tour.js index.html` est vide, le code lu est celui du SHA audité. Code : js/app-08-ui-modals-tour.js:2089-2092 `showPitchLanding()` = `#devPanel` fermé + `showLanding()` ; :273-276 `showLanding()` ne fait qu'ajouter `.active` sur `#landing`, sans `pushState` ni test de `state.onboarded`/session. index.html:172-175 : les seuls `onclick` de `#landing` sont `exitLandingAsAuth('signin')`, `exitLandingAsAuth('signup')`, `pwaInstall()` (3 au total sur les lignes 95-180) — aucun « Retour ». :6138-6147 `exitLandingAsAuth` ouvre l'onboarding à l'étape 0 puis `switchAuthTab(mode)` sans aucune garde sur un compte existant. `closeCurrentOverlay` (app-02:2063-2130) ne connaît pas `#landing` ; l'écouteur Escape (app-08:44-46) ne vise que `#modalBackdrop` ; le handler `popstate` (app-02:2177) délègue à `closeCurrentOverlay`. index.html:470 : le bouton « Afficher le pitch » est du balisage statique de la section Démo, `majSectionCompte` ne le masque pas. Reproduction exécutée (émulation Chromium 390×844, serveur http-server port 8120, script preuves/relecture-uxo05/repro.js, état onboardé via `bootOnboarded` + `window.MY_UID` uuid) : après `showPitchLanding()` → landing active, boutons visibles [Se connecter, Créer un compte, Installer l'application] ; retour (pushState puis goBack) → landing toujours active ; popstate synthétique → active ; Escape → active ; `closeCurrentOverlay()` rend `false`, landing active ; clic « Se connecter » → onboarding actif, étape `splash`, formulaire e-mail visible, `state.onboarded` toujours true, MY_UID inchangé ; 0 erreur JS. Résultat : preuves/relecture-uxo05/resultat.txt, captures pitch-connecte.png et pitch-se-connecter.png. Les preuves de l'auditeur (parcours-compte-session.json S5–S5d, captures 63/64) décrivent exactement le même comportement. git status --short : vide. — Correction de formulation : Le finding est juste dans ses faits. Deux précisions de formulation : (1) « observé » — la preuve S5d de l'auditeur appelle `exitLandingAsAuth('signin')` par `page.evaluate` et non par un clic ; ma reproduction a cliqué le bouton réel avec le même résultat, la formulation « “Se connecter” ouvre le formulaire » tient. (2) « impact » — préciser qu'un rechargement suffit à revenir dans l'application (état et session locaux intacts, `landingSeen` = true) : l'utilisateur n'est pas éjecté de son compte, il est enfermé dans une vue sans sortie explicite ; « se reconnecte (rechargement) » est donc à lire comme « recharge la page », la saisie du mot de passe n'étant pas nécessaire. Priorité P2 maintenue (porte rangée sous « Démo », mais visible pour tout compte).
- **impact** → INCERTAIN (priorité proposée P2). agent sans résultat

### UXO-06 — La landing/pitch et le tour démo promettent des fonctions retirées ou renommées (Carnet de voyage, humeurs « te détendre », templates)

| Champ | Valeur |
|---|---|
| Identifiant | UXO-06 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Landing (index.html) / TOUR_STEPS (app-08) |
| Résultat attendu | Le pitch décrit le produit livré (ADR-011 : Carnet de voyage retiré ; moods = Idées / Apprendre / Rencontrer ; fiche 07) |
| Résultat observé | Landing : « 📔 Documente tes voyages — Raconte tes périples avec étapes, photos, conseils et carte. Un format unique… » ; « 🎨 Choisis ton humeur du moment — Envie d'apprendre, de créer, de te détendre ? » ; « podcast, vidéos courtes ». Tour démo : « Le contenu s'adapte à ton humeur … créer, d'apprendre ou de te détendre ? », « Templates pour démarrer facilement ». Cette landing reste atteinte par : drapeau first-run coupé, UXO-02 (compte sans session), UXO-05, et le bouton « Installer l'application » y est le seul chemin iOS |
| Reproduction | Lire index.html:95-180 ; Paramètres → Démo → Afficher le pitch / Tour démo (parcours-compte.json A12, A13) |
| Preuve | index.html:95-180 (texte extrait : « Documente tes voyages… ») ; js/app-08-ui-modals-tour.js:58-116 ; captures 40-fil-compte.png, 52-pitch-landing.png, 50-tour-demo-1.png, 51-tour-demo-4.png ; ADR-011 §6 ; docs/lots-ui/09-RETRAIT-CARNET-VOYAGE.md |
| Impact utilisateur et commercial | Promesse publique d'une fonction absente (voyages avec carte) = déception mesurable et argument de plainte ; incohérence de vocabulaire entre pitch et écrans |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Réécrire la landing sur les 3 valeurs (Découvrir / Partager / Rencontrer) et les moods actuels ; retirer la carte « voyages » ; aligner TOUR_STEPS ou retirer le tour historique (déjà manuel) ; ajouter un verrou de vocabulaire (grep « voyages » dans #landing) dans la suite adr-011 |
| Risque de régression | Nul (texte) |
| Effort estimé | 0,5 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur le SHA audité (git diff c8cb8e99..HEAD vide pour index.html, app-08, app-06, styles.css). index.html:136 « Documente tes voyages » + :137 « Raconte tes périples avec étapes, photos, conseils et carte » ; :123 « Envie d'apprendre, de créer, de te détendre ? » — alors que PASSIO_MOOD_LABELS (app-02:4780-4784) ne connaît que Idées/Apprendre/Rencontrer et qu'app-08:110-111 admet lui-même que l'étape « voyages » du tour a été retirée avec le Carnet (ADR-011 §6). Tour : app-08:76 « de te détendre ? » et :99 « Templates pour démarrer facilement » ; `applyTemplate`/`#fieldTemplates` (app-06:3853-3864) n'ont AUCUN appelant ni nœud dans index.html (grep : 0 résultat) → promesse sans fonction. Reachabilité prouvée : index.html:470-471 (Paramètres → Démo → « Afficher le pitch » = showPitchLanding → showLanding, app-08:2089-2092 ; « Tour démo » = startTour) ; parcours-compte.json A12 (texte du tour relu, étape 2 contient « te détendre ») et A13 (landing:true) ; capture 52-pitch-landing.png montre bien « Documente tes voyages » à 390 px. Impact et priorité P2 justifiés : texte visible, aucune donnée, correction triviale. — Correction de formulation : Deux retouches de formulation : (1) « observé » — retirer « podcast, vidéos courtes » de la liste des promesses fausses (le Studio a un type Podcast, index.html:780) ; ne garder que voyages/carte, « te détendre » et « Templates » (ce dernier est bien orphelin : applyTemplate sans appelant, #fieldTemplates absent du DOM). (2) préciser que sur les largeurs ≤ 420 px (tout mobile) la phrase « Raconte tes périples… carte » est masquée par styles.css:213 et que seul le titre « Documente tes voyages » est lu — la promesse reste, mais moins détaillée que citée. Ajouter la preuve de câblage exacte : index.html:470-471 et app-08:2089-2092.
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, vérifié sur le SHA audité (git diff --stat c8cb8e99 HEAD -- index.html js/app-08-ui-modals-tour.js : vide). index.html:122-123 « Choisis ton humeur du moment / Envie d'apprendre, de créer, de te détendre ? » ; index.html:130 « podcast, vidéos courtes » ; index.html:136-137 « Documente tes voyages — Raconte tes périples avec étapes, photos, conseils et carte ». js/app-08-ui-modals-tour.js:74-76 (« s'adapte à ton humeur… créer, d'apprendre ou de te détendre ») et :99 (« Templates pour démarrer facilement »). Ce n'est PAS une décision documentée : ADR-011 §5/§6 retire le Carnet de voyage ; le commentaire app-08:114-115 dit explicitement que l'étape « Raconte tes voyages » du tour a été retirée « parce qu'elle promettait un écran qui n'existe plus » — la landing porte exactement la même promesse et a été oubliée (aucune mention « landing »/« pitch » dans docs/lots-ui/09-RETRAIT-CARNET-VOYAGE.md ni dans l'ADR ; grep vide). Fiche 07 fixe les moods à Idées/Apprendre/Rencontrer : « te détendre » (ex-« Chill ») n'est plus affichable (PASSIO_MOOD_LABELS). Aucun verrou e2e (grep « voyages|détendre » dans tests/e2e/adr-011* : vide). Priorité : P2 est juste. Exposition limitée — le parcours par défaut (first-run actif, `entreeDirecte()` remplace `showLanding()`, first-run.js:1704-1707) n'affiche jamais la landing ; elle n'est atteinte que par des chemins secondaires ou dégradés (UXO-02 compte sans session, UXO-05 « Afficher le pitch », drapeau coupé) et le tour est manuel (index.html:471). Aucun critère d'interdiction du GO (isolation, restauration, capacité, pilotage/Sentinelle sur fonction critique, sécurité IRL/modération, staging) n'est touché ; c'est du texte, correction 0,5 j, régression nulle. Pas P1 : la promesse publique première (le fil lui-même) est cohérente ; le résiduel relève de la cohérence du discours, pas d'un blocage du lancement. git status --short : vide (0 ligne). — Correction de formulation : Formulation à préciser : (1) numéros de lignes réels — landing index.html:122-123 (humeur/détendre), :130 (podcast, vidéos courtes), :136-137 (voyages) plutôt que la plage 95-180 ; tour app-08:74-76 et :99 plutôt que 58-116. (2) Ajouter en preuve le commentaire app-08:114-115, qui prouve que le lot avait voulu retirer cette promesse (survivant, pas décision). (3) Nuancer l'impact : la landing n'est plus le chemin d'entrée par défaut (entreeDirecte, first-run.js:1704) ; l'exposition réelle dépend de UXO-02/UXO-05 et du drapeau coupé — l'impact commercial est donc « incohérence de discours sur chemins secondaires », ce qui justifie P2 et non P1. (4) Le verrou proposé (grep « voyages » dans #landing) devrait aussi couvrir « détendre » et « Templates » dans TOUR_STEPS.

### UXO-07 — L'étape « Vérification d'âge » affirme un « contrôle d'âge IA » qui n'existe pas

| Champ | Valeur |
|---|---|
| Identifiant | UXO-07 |
| Priorité retenue | **P1** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Onboarding, étape age (index.html / onbValidateAge app-02) |
| Résultat attendu | Une allégation de contrôle correspond à un mécanisme réel (exigence de loyauté commerciale ; risque DSA/consommateur) |
| Résultat observé | Texte : « PASSIO protège les mineurs avec un contrôle d'âge IA. L'expérience adulte est réservée aux +18 ans. » Le seul contrôle est l'année saisie (< 13 ans refusé, isMinor si < 18) ; aucune IA, aucune vérification documentaire ; l'input porte max=2020 alors que la règle est 13 ans (incohérence mineure) |
| Reproduction | Ouvrir l'onboarding → étape âge (capture 22-onb-age.png ; O1, O1b : 2015 → « PASSIO est réservé aux 13 ans et plus. ») |
| Preuve | index.html:308-321 ; js/app-02-state-utils.js:3181-3196 ; parcours-visiteur-2.json O1 |
| Impact utilisateur et commercial | Allégation trompeuse envers les parents/mineurs et les autorités ; expose à un reproche de pratique commerciale trompeuse ; « expérience adulte » suggère un contenu adulte inexistant |
| Visibilité dans le Centre de pilotage | non applicable |
| Détection par la Sentinelle | non applicable |
| Proposition de correction | Remplacer par une formulation exacte (« Indique ton année de naissance — PASSIO est réservé aux 13 ans et plus ») ; aligner max de l'input ; le jour où un vrai contrôle existe, le documenter |
| Risque de régression | Nul |
| Effort estimé | 0,1 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur le SHA audité c8cb8e99 (HEAD local f501fb78 diffère, mais `git diff --stat c8cb8e99 HEAD -- index.html js/app-02-state-utils.js` est VIDE : les deux fichiers sont identiques, et `git show c8cb8e99:index.html | sed -n 308,321p` rend exactement le texte cité). - index.html:311 (SHA c8cb8e99) : « PASSIO protège les mineurs avec un contrôle d'âge IA. L'expérience adulte est réservée aux +18 ans. » ; index.html:314 : `max="2020"` (2026−2020 = 6 ans, incohérent avec la règle 13 ans, qui exigerait max 2013). - js/app-02-state-utils.js:3179-3193 (SHA) : `onbValidateAge` = parseInt de l'année, refus si <1900 ou >2025, refus si `age < 13`, `state.user.isMinor = age < 18`. Aucun appel réseau, aucun modèle, aucune pièce justificative. Étape atteignable : `onbSteps = ["splash","age","name","passions"]` (app-02:3160). - Recherche de tout mécanisme « IA » d'âge dans js/, supabase/, migrations/ : néant. Le seul mécanisme serveur est `declare_birth_year` / `irl_interaction_allowed` (migrations/migration_ts_serveur_age_blocage.sql:71-154), explicitement AUTO-DÉCLARATIF (« Elle ne verifie pas legalement l'age », l.5-6) ; app-07:4952-4953 le dit aussi : « c'est une retenue, pas une vérification ». - Preuve déposée cohérente : parcours-visiteur-2.json etapes[14] (texte de l'écran identique) et etapes[15].toasts = « PASSIO est réservé aux 13 ans et plus. » ×2 ; 22-onb-age.png présent (137 Ko). Les CGU intégrées (app-02:3145) disent seulement « réservé aux 13 ans et plus ; l'inscription demande l'âge » — sans IA. - Aucune « expérience adulte » distincte dans le code : `isMinor` ne sert qu'à REFUSER la proposition IRL d'un mineur (app-07:4982 `self_minor`). git status --short : 0 ligne. — Correction de formulation : Fond exact ; deux précisions de formulation. (1) « Le seul contrôle est l'année saisie » est incomplet : il existe aussi une frontière SERVEUR auto-déclarative (`user_safety.majority_at` via `declare_birth_year`, garde `irl_interaction_allowed` + `self_minor` côté client) qui empêche un mineur déclaré de proposer un IRL — mais elle repose sur la même année saisie, sans IA ni justificatif, donc l'allégation reste infondée. (2) Le champ « preuve » cite app-02:3181-3196 ; la fonction commence ligne 3179 sur le SHA (3179-3193). Ajouter que la borne JS (`> 2025`) et la borne HTML (`max=2020`) divergent entre elles en plus de diverger de la règle 13 ans (2013).
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, vérifié sur le SHA audité : `git show c8cb8e99:index.html` lignes 309-314 porte bien « PASSIO protège les mineurs avec un contrôle d'âge IA. L'expérience adulte est réservée aux +18 ans. » (identique à HEAD f501fb78, index.html:311). Le seul mécanisme est `onbValidateAge` (js/app-02-state-utils.js:3179-3194) : `parseInt` de l'année, refus si age < 13, `isMinor = age < 18` — aucun appel IA, aucune vérification documentaire ; les CGU embarquées (app-02:3145) disent d'ailleurs la vérité (« l'inscription demande l'âge à l'onboarding »). Ce n'est PAS une décision produit documentée, c'est l'inverse : docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md:191 écrit noir sur blanc « Le texte actuel parlant de "contrôle d'âge IA" ne correspond donc pas au comportement réel et doit être retiré », avec la copy cible (l.196) — le défaut est connu depuis 15 jours et toujours en production. Aucun ADR ne le justifie ; l'« IA de contrôle d'âge renforcé » est listée dans docs/PASSIO_MVP_BETA_GUIDE.md:192 comme RESTANT À CONSTRUIRE. `isMinor` n'est consommé qu'à un endroit (app-07:4962/4980, refus `self_minor` des propositions IRL), explicitement commenté « auto-déclaratif : c'est une retenue, pas une vérification », et docs/PASSIO_IRL_TRUST_SAFETY_AUDIT_2026-08-20.md:446-456 constate qu'aucune garde mineur n'existe pour création d'événement/RSVP/check-in ni côté serveur. Priorité : P2 sous-estime. Un réseau ouvert aux 13-17 ans qui organise des rencontres physiques et affirme faussement aux parents/mineurs un « contrôle d'âge IA » relève de la pratique commerciale trompeuse (L.121-2 C. conso) et du DSA art. 28 (protection des mineurs) ; la fausse allégation MASQUE le niveau réel (auto-déclaration seule), ce qui touche le critère « sécurité IRL ou modération insuffisante » du GO. Une allégation de sécurité mensongère ne doit pas atteindre un public non averti → « avant lancement public » = P1. Pas P0 : ne bloque pas techniquement, aucune fuite de données, correction triviale (0,1 j, un `<p>` et un `max`). — Correction de formulation : Priorité P2 → P1 (allégation de sécurité mensongère envers des mineurs, à retirer avant tout public non averti ; correctif documenté depuis le 2026-08-20 et non appliqué). Compléter « preuve » par docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md:191 (le défaut est déjà reconnu par le projet, ce qui écarte toute lecture « décision produit »). Nuancer « observé » : `isMinor` a UN consommateur réel (refus des propositions IRL, app-07:4980), auto-déclaratif — cela ne rend pas l'allégation vraie mais évite de dire que le champ est sans effet. Ajouter à la correction la borne codée `val > 2025` (app-02:3181) à aligner sur `new Date().getFullYear()`. Le reste (attendu, impact, effort 0,1 j, régression nulle) est exact.

### UXO-08 — Numéro de téléphone OBLIGATOIRE à la création de compte, sans explication de son usage

| Champ | Valeur |
|---|---|
| Identifiant | UXO-08 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Inscription (onbDoAuth, app-02) |
| Résultat attendu | Minimisation des données et friction minimale au moment de l'inscription (first-run : « l'inscription au moment de l'action engageante ») ; toute donnée collectée a un usage affiché |
| Résultat observé | Onglet « Créer un compte » : champ « Numéro de téléphone » (index.html:277-280) et validation stricte 8-15 chiffres (« Numéro obligatoire à la création (demandé au même titre que l'e-mail) », app-02:3400-3402) ; aucun texte n'explique à quoi il sert ; la doc du lot (PREMIERE_VISITE.md) ne le mentionne pas |
| Reproduction | Gate → « Créer mon compte » → formulaire signup (capture 21-auth-splash-visiteur.png, L2 phone:true) |
| Preuve | index.html:277-280 ; js/app-02-state-utils.js:3393, 3400-3402 |
| Impact utilisateur et commercial | Abandon à l'inscription (un champ de plus, sensible), collecte d'une donnée personnelle sans finalité affichée (RGPD art. 5 minimisation / information) — non vérifié dans la politique de confidentialité |
| Visibilité dans le Centre de pilotage | partiel — signup_completed existe mais aucun événement d'abandon par champ |
| Détection par la Sentinelle | non |
| Proposition de correction | Rendre le téléphone facultatif ou le demander plus tard à l'usage qui l'exige (appels), et afficher la finalité ; mesurer l'abandon du formulaire |
| Risque de régression | Faible (vérifier les appels/notify-call qui liraient le téléphone) |
| Effort estimé | 0,5 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit par inspection du code AU SHA audité (git show c8cb8e99, identique à HEAD sur ces deux fichiers — les 2 commits postérieurs ne touchent que .passio/audits) : - index.html:276-279 (c8cb8e99) : `<label id="authPhoneWrap">` « Numéro de téléphone », input type=tel, sans aucun texte de finalité ; app-02:3222-3223 l'affiche uniquement en mode signup. - js/app-02-state-utils.js:3400-3406 (c8cb8e99) : commentaire « Numéro obligatoire à la création (demandé au même titre que l'e-mail) », garde `if (_authMode === "signup")` qui REFUSE la soumission si 8 > chiffres > 15 (« Numéro de téléphone invalide. ») → le numéro est bien bloquant pour la création par e-mail ; envoyé en `user_metadata.phone` (l.3418) et copié dans `state.user.general.phone` (l.3424). - Preuve du domaine bien lue : preuves/ux-onboarding/parcours-visiteur-2.json étape « L2 » (`onglet.phone: true`, texte rendu « ADRESSE E-MAIL NUMÉRO DE TÉLÉPHONE MOT DE PASSE … ») — concorde. - Aucun usage fonctionnel côté client : `grep general.phone|\.phone` sur js/*.js ne renvoie que l'écriture l.3424 ; seul lecteur = dashboard/server/accounts.js:20-38,83 (compteur `withPhone` du centre de pilotage). Aucune mention dans docs/PREMIERE_VISITE.md ni CONFIRMATION_EMAIL.md. - Aggravant vérifié : la politique de confidentialité intégrée (app-02:3140, `openPrivacyPolicy`) déclare « Lors de l'inscription : adresse e-mail et nom d'utilisateur » — le téléphone n'y figure PAS alors qu'il est collecté obligatoirement depuis le commit 43b8ffa (2026-08-31, PR #226). git status --short : vide. — Correction de formulation : Deux précisions à apporter, sans changer le verdict ni la priorité : (1) le champ « non vérifié dans la politique de confidentialité » devient VÉRIFIÉ : la politique intégrée (app-02:3140) omet le téléphone (« e-mail et nom d'utilisateur ») — la lacune d'information RGPD est donc établie, pas supposée ; (2) l'obligation ne vaut que pour le chemin e-mail/mot de passe : « Continuer avec Google » (`onbGoogleAuth`) ne demande aucun numéro, ce qui montre que le produit fonctionne sans lui et confirme l'absence de finalité technique (aucun lecteur côté client ; seul le compteur `withPhone` du dashboard le consomme). Mentionner aussi l'origine : introduit le 2026-08-31 par #226 (43b8ffa), donc récent et non documenté dans PREMIERE_VISITE.md / CONFIRMATION_EMAIL.md ; le test confirmation-email.spec.js:63 devra être adapté si le champ devient facultatif (risque de régression à ajouter).
- **impact** → INCERTAIN (priorité proposée P2). agent sans résultat

### UXO-09 — L'aide au geste « stories » se pose PAR-DESSUS la visionneuse de story ouverte

| Champ | Valeur |
|---|---|
| Identifiant | UXO-09 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Aides au geste de première visite (first-run.js montrerEtape / ecranOccupe) |
| Résultat attendu | « Ne jamais poser une bulle par-dessus une destination déjà ouverte » (piège ④ et ⑫ de PREMIERE_VISITE.md) ; ecranOccupe() doit refuser quand une visionneuse est ouverte |
| Résultat observé | Tap sur la story « Léa » (visiteur) : #storyViewer.active (z-index 200), puis 450 ms plus tard la bulle « Ce qui se passe maintenant — Des moments courts, publiés dans la journée. Ils disparaissent au bout de 24 h. » (z-index 9000) est peinte au milieu de la story et marquée vue (tour.stories=true). ecranOccupe() ne teste ni #storyViewer ni #mediaEditor |
| Reproduction | Visiteur, carte fermée, bulle decouvrir fermée → tap sur la 2e bulle de #storiesRowFeed → 1,2 s (script parcours-visiteur-3.js B) |
| Preuve | js/first-run.js:451-473 (ecranOccupe), 1330-1336 (ZONES_GESTE), 1451-1473 ; styles.css .story-viewer z-index:200 vs .fr-tip 9000 ; capture 71-aide-stories-sur-visionneuse.png ; parcours-visiteur-3.json B {viewerActif:true, viewerZ:200, tip:{id:stories, z:9000}} |
| Impact utilisateur et commercial | Une bulle de tutoriel qui recouvre le contenu regardé ; la seule occurrence de l'aide est consommée dans un contexte où elle gêne |
| Visibilité dans le Centre de pilotage | partiel — tour_step_seen {step:stories} est émis, sans contexte |
| Détection par la Sentinelle | non |
| Proposition de correction | Ajouter #storyViewer.active et #mediaEditor.open à ecranOccupe() ; poser l'aide à la FERMETURE de la visionneuse ou la retirer (même raisonnement que l'aide « bobines » retirée) ; verrou e2e « aucune bulle pendant qu'une visionneuse est ouverte » |
| Risque de régression | Faible |
| Effort estimé | 0,25 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit indépendamment sur le SHA audité (branche à c8cb8e9 + 2 commits d'audit ; `git diff c8cb8e99 -- js/first-run.js styles.css` vide) avec mon propre script Playwright (/tmp/claude-0/…/scratchpad/verif-uxo09/repro.js, serveur http-server sur PASSIO_PORT=8120, Chromium 390×844, visiteur vierge, réseau Supabase/CDN coupé, carte et bulle « decouvrir » fermées par leurs VRAIS boutons, tap réel sur la 2e bulle « Léa » de #storiesRowFeed). Résultat : t+100/300 ms → #storyViewer.active (display:flex, z-index 200, 390×844) et aucune .fr-tip ; t+600 ms → .fr-tip[data-fr-tip=stories] z-index 9000, elementFromPoint au centre de la bulle retombe DANS la bulle (auDessus:true, donc peinte par-dessus la story), et localStorage passio_first_run_v1.tour.stories=true (aide consommée). Capture verif-uxo09/repro-71.png : la bulle « Ce qui se passe maintenant … » est au milieu de la story de Léa. Après closeStoryViewer(), la bulle survit (tip:true) sur un fil désormais sans visionneuse. Code : js/first-run.js:451-473 ecranOccupe() teste lienProfond, reelsState.open, #modalBackdrop.active, #eventDetailPage.style.display, .ctx-tools-root.open / #conv-fullpage.active, #landing, #onboarding — jamais #storyViewer ni #mediaEditor (grep « storyViewer|mediaEditor » dans first-run.js : 0 occurrence). js/first-run.js:1330-1336 ZONES_GESTE contient ["#storiesRowFeed","stories"] ; 1451-1473 armerAidesAuGeste pose setTimeout(montrerEtape(id), 450) en phase capture ; montrerEtape (1370-1381) appelle ecranOccupe() puis exige seulement cible.offsetParent non nul — #storiesRowFeed reste en layout sous la visionneuse (position:absolute inset:0), donc la garde passe. styles.css:4157-4166 .story-viewer z-index:200 ; styles.css:10546-10548 .fr-tip z-index:9000. L'attendu cité (« ne jamais poser une bulle par-dessus une destination déjà ouverte ») est bien l'invariant écrit par le module lui-même (commentaire lignes 447-450 et 1320-1323, docs/PREMIERE_VISITE.md ④ et ⑫). Le finding est exact sur tous ses champs ; P2 est juste (gêne visuelle sur contenu de démo, aucune perte de données, aucune sécurité). — Correction de formulation : Formulation exacte ; deux précisions possibles : (1) le délai observé est ~450-600 ms (setTimeout 450 ms de armerAidesAuGeste), cohérent avec le « 450 ms » du finding ; (2) ajouter à « observé » que la bulle persiste après la fermeture de la visionneuse (mesuré), ce qui renforce la proposition « poser l'aide à la FERMETURE de la visionneuse ». La cause profonde est bien l'absence de #storyViewer.active (et #mediaEditor) dans ecranOccupe() — la seconde garde de montrerEtape (offsetParent) ne peut pas la rattraper puisque #storiesRowFeed reste en layout sous un panneau en position:absolute.
- **impact** → INCERTAIN (priorité proposée P2). agent sans résultat

### UXO-10 — Portes de création incohérentes pour un visiteur : « Live vidéo » refuse par un toast sans porte, « Publication » et « Audio » ouvrent le Studio sans gate

| Champ | Valeur |
|---|---|
| Identifiant | UXO-10 |
| Priorité retenue | **P2** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Feuille « Créer » (ui-v2-shell) / startVideoLive (app-05) / openStudioOnType |
| Résultat attendu | Toute porte d'action engageante mène au même gate qui dit par où passer (règle fiche 16) ; les 6 entrées de la feuille se comportent de façon homogène |
| Résultat observé | Bobine, Activité, Story → gate « Crée ton compte pour … » ; Live vidéo → toast « Connecte-toi pour lancer un live » (app-05:3204) sans bouton ; Publication et Audio / podcast → écran Studio complet, le gate n'apparaissant qu'au tap « Publier » (app-06:4205) |
| Reproduction | Visiteur → Créer → chaque entrée (script parcours-visiteur-2.js C1-C6) |
| Preuve | parcours-visiteur-2.json C1-C6 ; js/ui-v2-shell.js:146-152 ; js/app-05-config-profil.js:3204 ; capture 34-creer-5.png |
| Impact utilisateur et commercial | Un visiteur compose une publication entière avant d'apprendre qu'il doit créer un compte ; le live répond par un refus muet |
| Visibilité dans le Centre de pilotage | partiel — guest_auth_gate_shown ne couvre pas le toast du live |
| Détection par la Sentinelle | non |
| Proposition de correction | startVideoLive : appeler requireAuthentication('bobine'\|'publier') avant le toast ; décider si le Studio est une porte (gate à l'entrée, avec la mémorisation de retour) ou une vitrine (bandeau « pour publier, crée ton compte ») |
| Risque de régression | Faible |
| Effort estimé | 0,25 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Fichiers cités identiques entre c8cb8e99 et HEAD (`git diff --quiet c8cb8e99 HEAD -- js/ui-v2-shell.js js/app-05-config-profil.js js/app-06-reels-partage.js js/first-run.js js/app-08-ui-modals-tour.js` → aucun écart). Code : js/ui-v2-shell.js:124-152 — « Publication » → goToScreen("studio") et « Audio / podcast » → openStudioOnType("audio") sans gate ; Bobine/Story → meOpen (app-08:593, requireAuthentication) ; Activité → openCreateEvent (app-07:5154, requireAuthentication) ; Live → startVideoLive (app-05:3204) dont le seul refus visiteur est `toast("Connecte-toi pour lancer un live")` conditionné à `!window._supaReal || !MY_UID`, sans requireAuthentication. Le gate du Studio n'est posé que dans publishPost (app-06-reels-partage.js:4205). Preuve du domaine : parcours-visiteur-2.json étapes C1..C6 (C1/C6 → screen-studio sans modale ; C2/C3/C4 → modale « Crée ton compte… » ; C5 → screen-feed, modal null) — cohérente avec le code. Reproduction exécutée (Chromium, 390×844, serveur http-server port 8120, réseau Supabase/CDN coupé, visiteur vierge) : Live → toasts ["Connecte-toi pour lancer un live"], aucune modale de gate ; Publication → screen-studio, aucune modale ; publishPost() depuis le Studio → modale « Crée ton compte pour publier ta création ». Le finding est réel sur le SHA. Aggravation trouvée : `window._supaReal = true` est posé dès que le SDK se charge (app-08:2690), indépendamment de toute session, et MY_UID est truthy pour un visiteur (mesuré `string:10`). En production (SDK joignable), la condition du toast est donc FAUSSE et le visiteur passe : reproduction avec `_supaReal=true` simulé → invite « Passer en direct — Donne un titre à ton live » puis, au tap « Lancer », `getUserMedia({audio,video})` appelé (permission caméra/micro demandée AVANT tout gate), toast « Caméra/micro indisponible ou refusé », aucun gate. Le toast « sans porte » n'est observé que parce que la mesure du domaine coupait le réseau Supabase (reseauBloque=40). — Correction de formulation : Observé à corriger : hors réseau coupé, le Live vidéo ne rend PAS un toast pour un visiteur — en production (SDK chargé ⇒ `_supaReal=true`, MY_UID local truthy) il ouvre l'invite de titre puis demande la permission caméra/micro (getUserMedia) avant tout gate, ce qui viole la règle « aucune demande de permission avant une action engageante » de la première visite et l'invariant « MY_UID ne prouve pas qu'un compte existe ». Le toast n'apparaît que quand le SDK est injoignable. Impact à relever de P3 vers P2 (demande de permission système sans gate, puis insertion `video_lives` vouée à échouer sans session). Preuve : ajouter la reproduction `_supaReal=true` ci-dessus (la mesure C5 du domaine, réseau coupé, ne décrit pas la prod). Nuance sur Publication/Audio : l'entrée dans le Studio sans gate est un choix assumé par first-run.js (ETAPES_ECRAN.studio = indication « Publie ce que tu veux » destinée au visiteur) et le gate à « Publier » fonctionne (mesuré) — c'est une incohérence d'homogénéité, pas un défaut de garde ; la correction prioritaire est `startVideoLive` : `if (window.requireAuthentication && !requireAuthentication("bobine"|"publier")) return;` en tête, AVANT `_vlivePromptTitle` et getUserMedia. Effort 0,25 j inchangé ; ajouter un verrou e2e (visiteur + `_supaReal` simulé → gate, 0 appel getUserMedia).

### UXO-11 — Toast « ✨ Mise à jour disponible — recharge pour l'appliquer » à la PREMIÈRE visite

| Champ | Valeur |
|---|---|
| Identifiant | UXO-11 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Service worker (sw.js) / app-09 _setupOfflineBanner |
| Résultat attendu | Le message n'apparaît qu'à une mise à jour d'une version déjà installée |
| Résultat observé | sw.js poste SW_UPDATED à chaque `activate`, y compris l'installation initiale (clients.matchAll includeUncontrolled) ; app-09 le traduit en toast : sur un appareil vierge, le premier écran porte un toast qui demande de recharger |
| Reproduction | Appareil vierge → /index.html → attendre 3 s (capture 01-fil-visiteur.png, bas de l'écran) |
| Preuve | sw.js:29-38 ; js/app-09-boot-pwa.js:254-256 ; capture 01-fil-visiteur.png |
| Impact utilisateur et commercial | Bruit et doute dès le premier écran ; un visiteur qui obéit recharge et perd la carte de bienvenue (fermée ? non, mais le tour repart) ; contredit « aucune demande à l'entrée » |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Ne poster SW_UPDATED que si un contrôleur existait avant (self.registration.active précédent / vérifier navigator.serviceWorker.controller côté page avant le toast) |
| Risque de régression | Faible |
| Effort estimé | 0,1 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Code (SHA c8cb8e99) : sw.js:29-38 — le gestionnaire `activate` poste `{type:"SW_UPDATED"}` à TOUS les clients (`clients.matchAll({includeUncontrolled:true})`) sans distinguer première installation et mise à jour ; js/app-09-boot-pwa.js:254-256 — tout `SW_UPDATED` reçu devient `toast("✨ Mise à jour disponible — recharge pour l'appliquer","info")`, sans garde. Seul js/pwa-detect.js:10-21 porte une garde `hadController` (capturée AVANT `register`) — mais elle ne protège que le `reload`, pas le toast d'app-09. Test exécuté (émulation Chromium 390×844, contexte vierge, SW autorisé, gate posé, serveur http-server 127.0.0.1:8120, script preuves/relecture-uxo-11/repro2.js) : visite 1 → `controllerAtStart:false`, message `SW_UPDATED` reçu, toast `.toast` visible avec le texte exact, capture repro-premiere-toast.png ; visites 2 et 3 (même onglet, SW déjà contrôleur, même version) → aucun message, aucun toast. Le défaut est donc spécifique à la première installation, exactement comme décrit. La capture de l'auditeur (01-fil-visiteur.png) montre le même toast. Mécanique identique en prod : scripts/build.js:111-121 ne change que la valeur de `CACHE`, l'`activate` reste inconditionnel. Nuance : le toast disparaît de lui-même après 3 s (app-02:1728, `setTimeout(() => t.remove(), 3000)`), sans bouton — bruit bref, P3 justifié. git status --short : vide. — Correction de formulation : Formulation juste. Deux précisions à ajouter : (1) le toast est auto-fermé après 3 s (app-02:1728) et n'est pas cliquable — l'impact « le visiteur obéit et recharge » suppose qu'il le fasse lui-même à la main, la partie « perd la carte de bienvenue / le tour repart » reste une hypothèse non mesurée à retirer ou marquer PROBABLE ; (2) la garde `hadController` existe déjà dans js/pwa-detect.js:10-21 pour le reload — la correction proposée consiste simplement à l'étendre au toast d'app-09 (ou à faire porter par le SW un drapeau « mise à jour » dérivé de la présence d'un ancien cache dans `caches.keys()`), effort 0,1 j confirmé.

### UXO-12 — Écran « Rechercher » sans onglet actif dans la barre de navigation

| Champ | Valeur |
|---|---|
| Identifiant | UXO-12 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Navigation (goTo explore, barre V2) |
| Résultat attendu | Un état de navigation lisible : l'utilisateur sait où il est et comment revenir |
| Résultat observé | Sur #screen-explore, aucun .nav-item.active (0) ; le retour n'est possible que par un autre onglet ou le geste arrière |
| Reproduction | Loupe du bandeau → lire .app-nav-v2 .nav-item.active (parcours-visiteur.json étape 18 nbNavActifs:0) |
| Preuve | parcours-visiteur.json étape 18 ; js/app-02-state-utils.js:2000-2006 (toggle sur data-screen) ; capture 16-rechercher.png |
| Impact utilisateur et commercial | Désorientation légère ; cohérence de la barre (« un onglet actif à la fois » devient « aucun ») |
| Visibilité dans le Centre de pilotage | non applicable |
| Détection par la Sentinelle | non applicable |
| Proposition de correction | Considérer Rechercher comme une sous-vue de Découvrir (garder « Découvrir » actif) ou ajouter un en-tête avec « ← » |
| Risque de régression | Nul |
| Effort estimé | 0,1 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit sur le SHA audité (branche audit/bilan-passio-09-26-fable51 ; `git diff --stat c8cb8e99 HEAD -- js/app-02-state-utils.js js/ui-v2-shell.js index.html` = vide, les fichiers sont ceux de c8cb8e99). - Code : js/app-02-state-utils.js:2004-2010 — `$$(".nav-item").forEach(n => { const is = n.getAttribute("data-screen") === screen; n.classList.toggle("active", is); … })`. js/ui-v2-shell.js:74-80 — DESTINATIONS = feed, irl, create (sans data-screen), messages, profiles : aucune entrée `explore`. `grep data-screen="explore"` sur index.html et js/ : 0 résultat. Donc `goTo("explore")` désactive tous les onglets sans en activer aucun. - Émulation Chromium 390×844 sur http://127.0.0.1:8120 (script preuves/verif-uxo-12/repro.js, réseau Supabase/CDN coupé, gate posé) : sur `#screen-feed` → navActifs ["Découvrir"], aria-current="page" ; après clic loupe (`.topbar-bell[onclick="goTo('explore')"]`, index.html) → écran `screen-explore`, `.app-nav-v2 .nav-item.active` = 0, aucun `aria-current` sur les 5 onglets visibles. Capture : preuves/verif-uxo-12/explore-nav.png. - La preuve citée (parcours-visiteur.json étape « 18 Rechercher », nbNavActifs:0, nav:[]) existe et est bien lue. - index.html:873-892 (#screen-explore) : onglets Recherche/Assistant IA, champ de recherche, aucun bouton « ← » / retour dans l'en-tête de l'écran — le retour passe bien par un autre onglet ou le geste arrière. Impact limité (désorientation légère, incohérence aria-current), P3 justifié. `git status --short` : vide. — Correction de formulation : Aucune correction de fond. Précision utile : la cause est structurelle et non un bug de toggle — la barre V2 n'a par construction aucune destination `explore` (ui-v2-shell.js:74-80, commentaire « Cinq entrées exactement »), et la barre historique (index.html:1332-1347) n'en a pas non plus ; la ligne app-02:2004-2010 fait exactement ce qu'elle doit, elle n'a simplement aucun onglet à activer. Ajouter aussi que `aria-current` disparaît de tous les onglets (accessibilité), pas seulement la classe visuelle.

### UXO-13 — L'aide « passions » se déclenche sur « Suivis », seule bulle du rail d'un visiteur, et parle de passions absentes

| Champ | Valeur |
|---|---|
| Identifiant | UXO-13 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | Aides au geste (first-run.js ZONES_GESTE #profileStrip) |
| Résultat attendu | Une aide explique la commande touchée |
| Résultat observé | Avant tout choix, le rail ne contient que « Suivis » (PREMIERE_VISITE.md) ; le tap y déclenche « Tes passions filtrent le Fil — Touche-en plusieurs : elles s'ADDITIONNENT… » alors qu'aucune passion n'est affichée |
| Reproduction | Visiteur vierge → tap « Suivis » (parcours-visiteur.json étape 05 ; capture 03-aide-passions.png) |
| Preuve | js/first-run.js:1316-1320, 1330-1331 ; capture 03-aide-passions.png |
| Impact utilisateur et commercial | Explication hors contexte, consommée pour toujours (tour.passions=true) avant que des passions n'existent |
| Visibilité dans le Centre de pilotage | partiel (tour_step_seen) |
| Détection par la Sentinelle | non |
| Proposition de correction | Conditionner l'aide « passions » à la présence d'au moins une tuile de passion dans #profileStrip, ou l'ancrer à la tuile touchée |
| Risque de régression | Nul |
| Effort estimé | 0,1 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Code (js/first-run.js identique entre c8cb8e99 et HEAD, `git diff --stat` vide) : ZONES_GESTE lignes 1330-1335 mappe tout clic capturé dans `#profileStrip` sur l'aide « passions » (1294-1298 : « Tes passions filtrent le Fil — Touche-en plusieurs… »), sans distinguer la tuile touchée ; le handler 1451-1469 fait `t.closest("#profileStrip")` puis `montrerEtape("passions")` et 1423 pose `p.tour[id] = true` (persisté dans `passio_first_run_v1`). renderProfileStrip (js/app-06-reels-partage.js:2882-2890) rend `passionsVivantes()` = `state.user.profiles`, vide pour un visiteur ; docs/PREMIERE_VISITE.md:260 le confirme : « AVANT TOUT CHOIX, LE RAIL DU HAUT NE CONTIENT QUE “Suivis” ». Reproduction indépendante (émulation Chromium 390×844, http-server local port 8120, script preuves/verif-uxo13/repro.js) : visiteur vierge → « Explorer d'abord » → tip `decouvrir` → « Compris » → rail = [{txt:"👥👥Suivis", cls:"profile-tile active"}], `state.user.profiles` = [] → clic sur cette unique tuile → `.fr-tip[data-fr-tip="passions"]` affichée avec le texte cité. Capture preuves/verif-uxo13/uxo13-apres-tap-suivis.png. La preuve du finding (parcours-visiteur.json étape 05, tuiles ["👥👥Suivis"]) décrit exactement ce comportement. Défaut réel mais mineur (explication hors contexte, une seule fois) : P3 maintenu. — Correction de formulation : Précision de forme : la consommation « pour toujours » se lit dans `localStorage["passio_first_run_v1"].tour.passions` (js/first-run.js:57 et :1423), pas « tour.passions » tout court ; et la proposition « l'ancrer à la tuile touchée » est à nuancer : la tuile cliquée est DÉTACHÉE après le rendu (commentaire 1440-1449), d'où le mapping par zone — la correction praticable est de tester `ev.target.closest(".profile-tile")` hors tuile « Suivis » (ou `state.user.profiles.length > 0`) AVANT le setTimeout. Le reste du finding est exact.

### UXO-14 — Huit dialogues natifs confirm() bloquants malgré la convention « toasts, jamais alert() »

| Champ | Valeur |
|---|---|
| Identifiant | UXO-14 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Groupes, événements, réinitialisation, messagerie (confirmations) |
| Résultat attendu | Convention CLAUDE.md : retours non bloquants et cohérents (modale maison openModal pour confirmer, comme openLogoutConfirm) |
| Résultat observé | 0 alert() (conforme) mais confirm() natif dans : quitter un groupe, annuler une série/un événement, supprimer un événement, resetApp, effacer les messages, supprimer une conversation, bloquer un utilisateur |
| Reproduction | grep -n 'confirm(' js/*.js |
| Preuve | js/app-05-config-profil.js:1602 ; js/app-07-ia-explore-irl.js:5487, 5509, 5525 ; js/app-08-ui-modals-tour.js:266 ; js/app-09-boot-pwa.js:1233, 1262, 1306 |
| Impact utilisateur et commercial | Dialogues système hors charte, non stylés, parfois bloqués par le navigateur (iOS PWA les affiche sans titre d'origine) ; incohérence avec les confirmations maison |
| Visibilité dans le Centre de pilotage | non applicable |
| Détection par la Sentinelle | non applicable |
| Proposition de correction | Remplacer par une modale de confirmation maison (patron openLogoutConfirm) ; ajouter confirm( à l'audit statique qui interdit alert( |
| Risque de régression | Faible |
| Effort estimé | 0,5 j |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit sur le SHA audité c8cb8e99 (git show c8cb8e99:<fichier> | grep -n 'confirm(') : les 8 occurrences citées existent exactement aux lignes indiquées — js/app-05-config-profil.js:1602 (leaveGroup), js/app-07-ia-explore-irl.js:5487 (cancelEventSeries), 5509 (toggleCancelEvent), 5525 (deleteEventConfirm), js/app-08-ui-modals-tour.js:266 (resetApp), js/app-09-boot-pwa.js:1233 (_clearConvMessages), 1262 (_deleteConv), 1306 (_blockFromConv). `git diff --stat c8cb8e99 HEAD -- js/` est vide : le worktree audité est identique au SHA sur js/. 0 `alert(` dans js/*.js (conforme, comme dit le finding). CLAUDE.md:51 pose bien « Toasts via toast(), jamais alert() » ; le patron maison `openLogoutConfirm` existe (js/app-02-state-utils.js:2558). 7 des 8 fonctions ont un appelant (onclick/JS) ; `resetApp` n'a AUCUN appelant dans js/ ni index.html (code mort, sans impact utilisateur). Nuance : aucun gate statique n'interdit `alert(` — scripts/audit-handlers.js:29 ne liste alert/confirm que comme globals natifs tolérés, pas comme interdits ; la correction « ajouter confirm( à l'audit statique qui interdit alert( » suppose un gate qui n'existe pas. Défaut réel mais cosmétique/cohérence : P3 maintenu. git status --short vide. — Correction de formulation : Préciser : (1) `resetApp` (app-08:266) n'a aucun appelant sur le SHA audité — occurrence en code mort, à retirer du décompte d'impact utilisateur (7 dialogues réellement atteignables, 8 dans le code) ; (2) la proposition de correction mentionne « l'audit statique qui interdit alert( » : aucun tel gate n'existe dans `npm run verif` (audit-handlers.js:29 tolère alert/confirm/prompt comme globals natifs) — reformuler en « créer un gate statique interdisant alert(/confirm(/prompt( dans js/ ».

### Surfaces saines

- Entrée directe du visiteur (Chromium hors iOS Safari) : fil complet, racine passio-first-run, carte de bienvenue non bloquante à ~1 s, aucune landing ni formulaire (captures 01)
- Gate d'authentification : 9 contextes, texte clair (« Crée ton compte pour aimer cette publication / Tes passions et tes préférences seront conservées » + pitch), 3 issues dont « Continuer à explorer », mémorisation du retour {screen, hash, action, scroll}, idempotent au double clic
- Formulaire d'auth rouvert à l'étape splash avec « ← Continuer à explorer » ; retour → Fil COMPLET (20 cartes, racine posée) ; validation e-mail/mot de passe avec messages dans #authMsg
- Tour contextuel : trois indications indépendantes (decouvrir après la carte, rencontrer à la 1re ouverture de Rencontrer, creer au retour sur le Fil), trois indications d'écran (profil, messages, studio), toutes fermables (Compris / Ne plus afficher / Échap), jamais deux à l'écran, mémorisées dans passio_first_run_v1, jamais rejouées après rechargement, relançables par « Revoir les repères »
- Carte de bienvenue : fermée pour la session seulement, revient à la visite suivante avec un message adapté (« Tes passions sont sur cet appareil … Modifier mes passions / Plus tard »), porte « J'ai déjà un compte — me connecter »
- Panneau « Qu'est-ce qui te passionne ? » : 12 tuiles + « Voir toutes les passions », spécialités canoniques (Sport → Vélo et cyclisme), bouton « Voir mon fil (N) », rail du Fil qui NOMME la spécialité après validation
- Aucune demande de permission (GPS, notifications, caméra/micro) sur tout le parcours visiteur, y compris Rencontrer, vue Carte, vue Filtre, « Ta story » (0 appel mesuré)
- Barre V2 : un seul onglet actif, aria-current, libellés sans emoji ; retour arrière navigateur cohérent (écran, modale, fiche) ; goTo wallet/shop/cdv redirigés ; liens profonds #irl-event- et #reel= (compte) fonctionnels, id inconnu et hash hostile inertes sans erreur JS
- Rencontrer : Liste / Carte / Filtre, vue Filtre en quatre sections + pied « Afficher N résultats », « Filtre » au singulier
- Profil : deux onglets Publications / Activité avec état vide guidé ; page « Mes passions » avec en-tête cohérent (« N passion(s) active(s) sur 3 », quota), porte d'ajout qui répond, fermée par goTo
- Paramètres → Compte : libellés suivant l'état réel (visiteur : « J'ai déjà un compte — me connecter », entrées de compte masquées ; compte : « Se connecter avec un autre compte », déconnexion, suppression)
- Aides historiques (feed_auteur, profil_visite, second_profil) : affichées une fois, fermées à la navigation, persistées dans state.hintsVus, désactivées pendant le parcours visiteur
- 0 alert() dans le code ; échappement des textes de bulles (escapeHtml) ; hash hostile <img onerror> sans exécution

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Résultat FINAL des 8 suites e2e ciblées : run 2 à 25/103 (0 échec) au moment du rapport — lire la ligne « EXIT= » et le bilan « N passed / N failed » en fin de /tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/preuves/ux-onboarding/suites-ciblees.log ; le serveur `http-server -p 8101` lancé par moi est VOLONTAIREMENT laissé en vie pour ne pas tuer ce run (à arrêter ensuite : pkill -f 'http-server -p 8101')
- Inscription réelle, confirmation d'e-mail Brevo, migration des préférences du visiteur vers le compte, rappel par toast après authentification : NON exécutés (règle absolue : aucune création de compte) — couverts par inspection (first-run.js:1611-1714, 1796-1853) et par les cas « Transfert du mode invité » de first-run.spec.js (run 2 en cours)
- Appareil réel iOS Safari / PWA installée hors ligne / Android Chrome / Samsung Internet : NON RÉALISÉ (Chromium seul, r1194 via shim, version 141) ; UXO-01 et UXO-02 sont mesurés en émulation (UA iPhone, réseau SDK coupé) et devraient être reproduits sur un iPhone
- Production Netlify (SHA c8cb8e99) : BLOQUÉ (403 proxy) — tout le parcours est mesuré sur le serveur local (fichiers de dev, pas le monolithe dist/)
- Lien profond #reel=<id> pour un VISITEUR : mon détecteur (reelsState.open) était faux ; prouvé pour un compte connecté (capture 65) et par la garde d'appartenance buildReels (docs 02) — PROBABLE pour le visiteur
- Aide « conversation_irl » (app-07:5091) : non déclenchée (exige une conversation 1-1 avec targetUserId) — inspection seulement
- Fil VIDE et Rencontrer VIDE (aucune donnée) : non reproduits, le contenu de démonstration est embarqué ; textes des états vides lus dans le code
- Plafond de 3 passions atteint, « Réactiver », paywall : hors périmètre (suite mes-passions-page.spec.js non lancée)
- Suites du projet prod (comptes réels, SUPABASE_SERVICE_ROLE_KEY) : NON LANCÉES ; vertes dans le run CI 33861671142

### Affirmations des anciens rapports confrontées au code actuel

- docs/CHECKLIST_COMMERCIALISATION.md (2026-06-12) « Bottom-nav : 6 onglets + « + », libellés cohérents » → fausse aujourd'hui : barre V2 = 5 destinations Découvrir / Rencontrer / Créer / Messages / Profil (ui-v2-shell.js:70-76, mesuré)
- docs/CHECKLIST_COMMERCIALISATION.md « Bobines — overlay reels » dans la nav, « CDV — carnets, favoris, lives », « Wallet — score, Passia, quêtes, boutique » cochés → obsolètes : CDV et Wallet RETIRÉS (ADR-009, ADR-011), Bobines hors barre (atteignable par lien profond / profil) ; la checklist n'a pas été révisée depuis les retraits
- docs/CHECKLIST_COMMERCIALISATION.md « Fil — … états vides » → non vérifiable ici (contenu de démonstration embarqué) ; « Messages — liste paginée » → toujours vraie mais la liste est SEEDÉE pour tout appareil neuf (UXO-03)
- PASSIO_PRODUCTION_READINESS.md (2026-08-16) « FCP 296 ms, landing 1 501 ms » → non vérifiable et hors sujet : la landing n'est plus l'écran d'entrée d'un visiteur depuis le 2026-09-01 (first-run actif par défaut), elle ne l'est plus que par repli (UXO-02) ou drapeau coupé
- docs/PREMIERE_VISITE.md « Un visiteur sans compte entre DIRECTEMENT dans le fil (aucune landing, aucun carrousel, aucun formulaire) » → vraie sur Chromium, FAUSSE sur iPhone Safari où le guide d'installation recouvre le fil à 1,5 s (UXO-01)
- docs/PREMIERE_VISITE.md « Trois portes vers un compte existant » → toujours vraie (carte, Paramètres, déconnexion : mesuré pour les deux premières, la 3e par suite e2e en cours + inspection app-02 doLogout)
- docs/PREMIERE_VISITE.md ⑬ « meOpen n'ouvre plus la caméra à un visiteur » → toujours vraie (« Ta story » → gate, 0 getUserMedia)
- docs/PREMIERE_VISITE.md ⑫ « aucune aide n'est posée par-dessus une destination ouverte » (aide bobines retirée pour cette raison) → FAUSSE pour l'aide « stories » (UXO-09, capture 71)
- docs/PREMIERE_VISITE.md ⑦ « Continuer à explorer » est une des trois issues du formulaire → vraie par le gate, FAUSSE par « Voir l'onboarding » qui rouvre le même onboarding sans cette porte (UXO-04)
- CLAUDE.md « Toasts via toast(), jamais alert() » → vraie pour alert (0), incomplète : 8 confirm() natifs (UXO-14)
- CLAUDE.md « goTo('wallet') et goTo('shop') REDIRIGÉS vers profiles, goTo('cdv') vers feed » → toujours vraie (mesuré G1)
- CLAUDE.md « Contexte : Chromium seul est installé (/opt/pw-browsers) » (CONTEXTE_AUDIT) → partiellement vraie : r1194 installé alors que @playwright/test 1.60.0 (node_modules) exige r1223 ; sans shim, 100 % des suites échouent au lancement (log ECHEC-ENV)
- .passio/context/KNOWN_RISKS.md → aucun risque UX/onboarding/pitch inscrit ; UXO-01/02/03 mériteraient une ligne (R12+)
- PASSIO_FUNCTIONAL_MAP.md / PASSIO_CONTROL_CENTER_AUDIT.md → aucune affirmation sur l'onboarding ou les bulles à confronter

### Fichiers de preuve

- `preuves/ux-onboarding/parcours-visiteur.js`
- `preuves/ux-onboarding/parcours-visiteur.json`
- `preuves/ux-onboarding/parcours-visiteur-2.js`
- `preuves/ux-onboarding/parcours-visiteur-2.json`
- `preuves/ux-onboarding/parcours-visiteur-3.js`
- `preuves/ux-onboarding/parcours-visiteur-3.json`
- `preuves/ux-onboarding/parcours-compte.js`
- `preuves/ux-onboarding/parcours-compte.json`
- `preuves/ux-onboarding/parcours-compte-session.js`
- `preuves/ux-onboarding/parcours-compte-session.json`
- `preuves/ux-onboarding/suites-ciblees.log`
- `preuves/ux-onboarding/suites-ciblees-RUN1-serveur-mort-a-56-sur-103.log`
- `preuves/ux-onboarding/suites-ciblees-ECHEC-ENV-browsers-1194-vs-1223.log`
- `preuves/ux-onboarding/01-fil-visiteur.png`
- `preuves/ux-onboarding/02-tip-decouvrir.png`
- `preuves/ux-onboarding/03-aide-passions.png`
- `preuves/ux-onboarding/04-aide-envies.png`
- `preuves/ux-onboarding/06-rencontrer.png`
- `preuves/ux-onboarding/07-rencontrer-filtre.png`
- `preuves/ux-onboarding/08-rencontrer-carte.png`
- `preuves/ux-onboarding/10-gate-rejoindre.png`
- `preuves/ux-onboarding/11-creer-feuille.png`
- `preuves/ux-onboarding/13-messages-visiteur.png`
- `preuves/ux-onboarding/14-profil-visiteur.png`
- `preuves/ux-onboarding/15-mes-passions-visiteur.png`
- `preuves/ux-onboarding/16-rechercher.png`
- `preuves/ux-onboarding/17-parametres-visiteur.png`
- `preuves/ux-onboarding/18-voir-onboarding-visiteur.png`
- `preuves/ux-onboarding/19-tip-creer.png`
- `preuves/ux-onboarding/20-gate-aimer.png`
- `preuves/ux-onboarding/21-auth-splash-visiteur.png`
- `preuves/ux-onboarding/22-onb-age.png`
- `preuves/ux-onboarding/24-onb-passions.png`
- `preuves/ux-onboarding/26-panneau-passions.png`
- `preuves/ux-onboarding/27-panneau-specialites.png`
- `preuves/ux-onboarding/28-fil-personnalise.png`
- `preuves/ux-onboarding/30-nouvelle-visite.png`
- `preuves/ux-onboarding/31-lien-profond-irl-event.png`
- `preuves/ux-onboarding/33-conv-demo-visiteur.png`
- `preuves/ux-onboarding/34-creer-5.png`
- `preuves/ux-onboarding/40-fil-compte.png`
- `preuves/ux-onboarding/42-profil-compte.png`
- `preuves/ux-onboarding/43-profil-activite-vide.png`
- `preuves/ux-onboarding/44-mes-passions-compte.png`
- `preuves/ux-onboarding/48-voir-onboarding-compte.png`
- `preuves/ux-onboarding/50-tour-demo-1.png`
- `preuves/ux-onboarding/52-pitch-landing.png`
- `preuves/ux-onboarding/61-messages-compte-session.png`
- `preuves/ux-onboarding/63-pitch-connecte.png`
- `preuves/ux-onboarding/64-pitch-se-connecter-connecte.png`
- `preuves/ux-onboarding/65-lien-profond-reel-session.png`
- `preuves/ux-onboarding/66-lien-profond-event-session.png`
- `preuves/ux-onboarding/70-premiere-visite-sans-pwa-dismissed.png`
- `preuves/ux-onboarding/71-aide-stories-sur-visionneuse.png`

### Notes de l'auditeur

TABLEAU DES BULLES (déclencheur → contenu → fermeture → condition d'arrêt → mesure)
1. Carte de bienvenue #frWelcome (first-run.js:606-660) — planifierAccueil 600 ms après entreeDirecte, Fil actif, aucune modale/lien profond ; mesurée à 987-1028 ms — « Bienvenue sur PASSIO / Tout ce que tu aimes, au même endroit. / Personnaliser mon expérience / Explorer d'abord / J'ai déjà un compte — me connecter » ; variante passions choisies : « Tes passions sont sur cet appareil / Crée ton compte pour les garder, ou continue d'explorer. / Modifier mes passions / Plus tard » — fermeture ×, Explorer d'abord, Plus tard → sessionStorage passio_first_run_bienvenue_fermee — ne revient pas dans la session (R1), REVIENT à la session suivante (R2), disparaît quand un compte existe.
2. Indication « decouvrir » (.fr-tip) — planifierTour 700 ms après fermeture de la carte, Fil actif ; mesurée 1,2 s — « CE QUI T'INSPIRE / Un Fil construit autour de tes passions / Mélange tes passions, tes envies et les personnes que tu suis. / Ne plus afficher / Compris » — Compris, Échap, Ne plus afficher (=abandon de tout le tour) — prefs.tour.decouvrir (localStorage passio_first_run_v1), jamais rejouée (R1).
3. Indication « creer » — planifierTour au RETOUR sur le Fil (surNavigation feed) une fois decouvrir vue ; ne suit pas « Compris » (04 : rien pendant 2,5 s) ; mesurée à l'étape 21 — « CE QUE TU VEUX PARTAGER / À toi de créer / Publie une idée, une bobine ou propose une activité IRL. » ancrée au bouton Créer — idem.
4. Indication « rencontrer » — 700 ms après la 1re goTo('irl') ; mesurée 1,3 s — « CE QUE TU VEUX VIVRE / Passe du numérique au réel / Trouve des activités autour de toi, sans activer automatiquement ta position. » — idem.
5. Indication « profil » — 700 ms après la 1re goTo('profiles') — « TOUT CE QUI TE PASSIONNE / Ton profil réunit tes passions / Une seule identité publique, et autant de passions que tu veux. »
6. Indication « messages » — 1re goTo('messages') — « Tes conversations / Les échanges nés de tes passions se retrouvent ici. »
7. Indication « studio » — 1re goTo('studio') (Créer → Publication) — « Publie ce que tu veux / Un texte, une photo, une vidéo — la passion se choisit juste en dessous. »
8. Aide au geste « passions » — 1er clic (capture) dans #profileStrip +450 ms — « Tes passions filtrent le Fil / Touche-en plusieurs : elles s'ADDITIONNENT, elles ne se remplacent pas. » — déclenchée par « Suivis » (UXO-13).
9. Aide « envies » — 1er clic dans #feedIntentSelector — « Ton envie du moment / Explorer, Apprendre, Idées, Rencontrer — ça s'ajoute à tes passions, ça ne les remplace pas. »
10. Aide « stories » — 1er clic dans #storiesRowFeed — « Ce qui se passe maintenant / Des moments courts, publiés dans la journée. Ils disparaissent au bout de 24 h. » — sur « Ta story » : refusée (gate ouvert), sur une story : posée PAR-DESSUS la visionneuse (UXO-09).
11. Gate d'authentification (modale, requireAuthentication) — à chaque action engageante (like, commenter, suivre, message, publier, bobine, activité, rejoindre, story) — « Crée ton compte pour <action> / Tes passions et tes préférences seront conservées. / <pitch> / Créer mon compte / J'ai déjà un compte / Continuer à explorer » — fermeture ×, Échap, fond, Continuer à explorer — non mémorisée (revient à chaque action, par conception) ; télémétrie guest_auth_gate_shown.
12. « ← Continuer à explorer » (#frBackToExplore) — posé à l'ouverture du formulaire par le gate ou les portes de connexion ; ABSENT via « Voir l'onboarding » (UXO-04).
13. Rappel après authentification (toast RAPPELS, first-run.js:1783-1793) — « Tu peux aimer cette publication. » etc. — non mesuré (inscription non exécutée).
14. Toast « Ton fil est à toi ✨ » après validation du panneau (P3).
15. Hint feed_auteur (app-02:5462, montrerHint) — 400 ms après renderFeed d'un COMPTE, Fil actif ; mesuré à 3,9-4,3 s après boot — « Appuie sur l'auteur pour découvrir sa Passio / Compris » — fermeture Compris ou toute navigation (goTo → fermerHint) — state.hintsVus (STATE_KEY + user_state), jamais rejoué (A2) ; brûlé sous la landing (UXO-02).
16. Hint profil_visite — 350 ms après ouverture d'un profil visité — « Suis-le, ou envoie-lui un message » (A3).
17. Hint second_profil — 400 ms après renderProfilesScreen si 1 profil — « Ajoute une autre passion depuis « Gérer mes passions » » (A4).
18. Hint conversation_irl — à l'injection du bouton « Proposer un moment IRL » dans une conv 1-1 (app-07:5091) — « Quand vous êtes prêts, propose un moment IRL autour de votre passion » — non mesuré.
19. Tour démo historique (TOUR_STEPS, 5 étapes, overlay plein écran) — uniquement manuel (Paramètres → Démo → Tour démo) ; tourSeen=true posé à onbFinish V2 ; textes obsolètes (UXO-06).
20. Overlay d'installation iOS #pwa-overlay — automatique 1,5 s après load sur iOS Safari non standalone, à chaque session (UXO-01) ; sur Android/desktop seulement au clic « Installer ».
21. Toast « ✨ Mise à jour disponible — recharge pour l'appliquer » — à chaque activation du SW, première installation comprise (UXO-11).
22. Toasts de refus sans porte : « Connecte-toi pour lancer un live / rejoindre un live / passer un appel » (app-05:520, 3204, 3482) — UXO-10.

ENVIRONNEMENT DE TEST (à connaître pour la suite complète de l'orchestrateur) : @playwright/test 1.60.0 exige chromium r1223 ; /opt/pw-browsers ne porte que r1194 → sans PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/pw-browsers (liens symboliques vers r1194, Chromium 141.0.7390.37) toute suite échoue « Executable doesn't exist ». Le webServer lancé par Playwright (reuseExistingServer) est mort au cas 56/103 du run 1 (48 faux échecs ERR_CONNECTION_REFUSED) : lancer son propre http-server avant la suite est plus sûr. Un http-server -p 8101 est encore en vie (run 2 en cours) : pkill -f 'http-server -p 8101' une fois le log terminé.

RECOMMANDATIONS : conserver — le moteur first-run (gate, indications, carte par session, migration, télémétrie guest_*) est solide et bien verrouillé ; refactoriser — landing/pitch (texte et sortie), resetOnboarding/showPitchLanding (portes de démo à isoler), ecranOccupe (visionneuses), SEED_CONVERSATIONS (visiteur seulement + étiquette), SW (cache du SDK ou SDK vendorisé), platform.js (overlay iOS non automatique) ; supprimer — l'affirmation « contrôle d'âge IA », l'entrée « Voir l'onboarding » hors mode démo, le tour historique s'il n'est pas réécrit ; soumettre à Benjamin — (1) l'installation iOS doit-elle précéder le pitch ? (2) le téléphone obligatoire à l'inscription : quel usage ? (3) faut-il des conversations de démonstration pour un visiteur, et sous quelle étiquette ? (4) que doit voir un compte connecté hors ligne (fil en lecture seule vs landing) ? Les suites first-run ne mesurent ni l'overlay iOS ni la landing hors ligne parce que leurs helpers les neutralisent (first-run-helper.js:50, app-helper.js:104) : deux angles morts à ouvrir avant tout lancement public. git status : propre (aucun fichier suivi modifié).
