# CARTOGRAPHIE PASSIO — BILAN 09/26 (domaine carto)

SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` · généré le 2026-09-04 par `node generer-carto.js` (sources : `inventaire.js`, `emulation-ecrans.js`, greps cités). Toute mesure navigateur = ÉMULATION Chromium 1194 (390×844), jamais un appareil réel.

## 0. Chiffres reproductibles (commande → valeur)

| Mesure | Valeur | Commande |
|---|---|---|
| Écrans `id="screen-*"` | **6** (feed, profiles, studio, explore, irl, messages) | `grep -c 'id="screen-' index.html` |
| index.html | 1737 lignes ; 167 handlers inline | `node inventaire.js` |
| Fichiers js/ | 42 (40 chargés par index.html en dev ; 3 injectés au build seulement : identity-transition.js, passion-context.js, release-guard.js) | `ls js/*.js \| wc -l` ; `grep -c '<script src="js/' index.html` |
| Fonctions `function X` top-level (js/) | **1285** (+ 1338 fonctions sur `window` à l'exécution, namespaces IIFE inclus) | `grep -hE '^(async )?function [A-Za-z_$]' js/*.js \| wc -l` |
| Handlers inline dans les templates JS | 459 {"onclick":431,"oninput":15,"onkeydown":4,"onchange":9} | `node inventaire.js` |
| Handlers inline TOTAL (html + js) | **626** | idem |
| Interactions distinctes (fonctions appelées depuis un handler) | **366** sur 42 fichiers (115 depuis index.html seul) ; le script du dépôt `node scripts/couverture-interactions.js` (index + 9 app-*) rend **355 sur 601 handlers** | cf. § 8 |
| Tables Supabase touchées par `.from()` côté client | **28** tables (+ 2 buckets Storage `content`, `attachments`) sur **39** tables prod | `grep -ohE "\.from\(['\"][a-z_]+['\"]" js/*.js \| sort -u` ; `list_tables` |
| RPC | 3 (declare_birth_year, irl_interaction_allowed, rechercher_passions) | `grep -ohE "\.rpc\(['\"][a-z_]+" js/*.js` |
| Edge Functions appelées | 3 (delete-account, notify-call, ask-ai) ; définies : ask-ai, delete-account, notify-call | `ls supabase/functions` |
| Clés localStorage/sessionStorage littérales | 37 motifs (+ constantes STATE_KEY, AUTH_INTENT_KEY, OUTBOX_KEY, _DEL_OUTBOX_KEY, _CMT_OUTBOX_KEY, CONV_TOMB_KEY, GEO_CACHE_KEY, IRL_DIGEST_KEY, EVENT_COMMENTS_LS_KEY) ; après boot onboardé : 6 clés localStorage, 2 sessionStorage | `node inventaire.js` ; `emulation-ecrans.json` |
| IndexedDB | 1 base `passio_store`, store `kv`, v1 (js/idb-store.js:10) | `grep -n DB_NAME js/idb-store.js` |
| Canaux realtime | 6 préfixes (typing:, conv_specific:, vlive:, conv:, user:, realtime:db) | `grep -ohE "\.channel\(['\"][^'\"]+" js/*.js` |
| Specs e2e / tests `test(` | **131 specs / 1 060 tests** (7 specs projet `prod`, 124 `local`) | `ls tests/e2e/*.spec.js \| wc -l` ; `grep -c '^\s*test(' tests/e2e/*.spec.js` |
| Modules UI sous drapeau | 15 fichiers `ui-v*.js` | `ls js/ui-v*.js` |

## 1. Navigation (mesurée en émulation, état onboardé 3 passions)

Deux barres de navigation coexistent dans le DOM :

| Barre | Entrées | Visible | Source |
|---|---|---|---|
| `#appNav` (balisage statique, index.html:1331) | Fil→feed · Bobines→bobines · Créer→studio · IRL→irl | NON (masquée par UI-1) | index.html |
| `#appNavV2` (créée par `js/ui-v2-shell.js:210-230`) | Découvrir→feed · Rencontrer→irl · Créer→action:create · Messages→messages · Profil→profiles | OUI | ui-v2-shell.js |

Barre haute (index.html:359-383) : logo → `goTo('profiles')` ; loupe → `goTo('explore')` ; enveloppe `#topbarMessages` → `goTo('messages')` ; cloche → `openNotifications()` ; « ⋯ » → `toggleDevPanel()`. **Bobines** : aucune entrée dans la barre V2 (l'entrée `data-screen="bobines"` de la barre legacy est masquée) ; le viewer `#reelsViewer` (z-index 9999) s'ouvre par `openReels()` depuis les cartes du fil, le rail de stories, `#reel=` (deep link) et `#reelsViewer` a été ouvert en émulation avec 20 bobines de démonstration (capture `overlay-bobines.jpg`).

`goTo()` (app-02:1969) : `wallet`/`shop` → `profiles` (ADR-009), `cdv` → `feed` (ADR-011). `bobines` n'est pas un écran : intercepté dans le listener nav (app-08:2076).

## 2. Écrans → onglets → actions → fonctions → tables → tests

### screen-feed (index.html:508, 58 lignes de balisage)

- **Statique** : 0 handlers inline {} ; formulaire {"input":0,"textarea":0,"select":0,"button":8,"roleButton":0} ; 10 ids.
- **Émulation** (`emulation-ecrans.json`) : écran actif attendu = OUI ; 311 commandes visibles ([onclick], button, [role=button], a[href]) ; 0 champs visibles ; 953 nœuds ; capture `ecran-feed.jpg`.
- **Onglets / rails** : Rail « Suivis + passions » (`#profileStrip`, bulles `passionTileHTML`) · rail d'intentions `#feedIntents` (`data-intent` discover/learn/create/meet, libellés Explorer/Apprendre/Idées/Rencontrer) · rail legacy `#moodSelector` (`data-mood` creation/learn/chill/actu, GELÉ, sans bouton visible) · stories `#storiesRowFeed`
- **Fonctions appelées par les handlers statiques** : (aucune : tout le contenu est rendu en JS)
- **Fonctions clés (rendu en JS)** : renderFeed (app-02:6000), renderPostHTML (app-02:6553), rankFeedPosts, openPost (app-02:6782), likePost, sharePost (app-03:10), supaLoadPosts (app-08:3615), renderStories (app-08:420), renderProfileStrip (app-06:2882), openReels (app-05:2207)
- **Tables** : posts, post_likes, post_comments, comment_interactions, comment_likes, stories, story_views, follows, profiles, notifications
- **Specs e2e qui y naviguent** (33, grep `goTo('feed')|screen-feed`) : adr-009-retrait-economie (7), connexion-compte-existant (15), contenu-passion-mood (8), entete-fil-permanent (2), exploration-moods (4), feed-vues-adr010 (18), feed-window (20), first-run (41), gate-sans-app (3), ios-navigation-et-zoom (11), mes-passions-page (25), multi-passion-audit-restant (5), navigation (2), onboarding-acceptation (8), onboarding-passions-v2 (9), parcours-suivre (2), partage-bobine (3), partage-experience-passion (3), passions-plates (36), pastille-mood (3), profil-entete-passions (30), profils-types (8), refonte-multi-passion (22), release-integrity (5), ui-v2-feed (14), ui-v2-shell (11), ui-v3-passerelle (23), ui-v3b-activite (12), ui-v4a3-vue (10), ui-v4a5-filtres (23), ui-v4b-fiche (14), ui-v7-lot (17), ui-v8-passions (26)

### screen-profiles (index.html:565, 208 lignes de balisage)

- **Statique** : 18 handlers inline {"onclick":15,"onchange":2,"onkeydown":1} ; formulaire {"input":2,"textarea":0,"select":0,"button":8,"roleButton":3} ; 28 ids.
- **Émulation** (`emulation-ecrans.json`) : écran actif attendu = OUI ; 16 commandes visibles ([onclick], button, [role=button], a[href]) ; 0 champs visibles ; 159 nœuds ; capture `ecran-profiles.jpg`.
- **Onglets / rails** : `.profile-tabs` multi-sélection `data-tab` posts/photos/videos/bobines/audio (`PROFILE_TAB_KEYS`, app-06:507) · rail `#v9ProfilePassions` (UI-8/V9) · page plein écran `#passionManager` (« Mes passions », classe `passions-page-open`) · menu « ⋯ » `openVisitedProfileMenu` sur profil visité
- **Fonctions appelées par les handlers statiques** : changeAvatarPhoto, changeCoverPhoto, closePassionManager, openCreateProfile, openEditMainProfile, openFollowersList, openFollowingList, openMainProfileMenu, openMyPostsTab, openPassionsAide, ouvrirGestionPassions, switchProfileTab
- **Fonctions clés (rendu en JS)** : renderProfilesScreen (app-06:2449), openPassionManager (app-06:1854), openCreateProfile (app-06:3587), ajouterPassionAuCompte (app-06:3677), archiverPassion/restaurerPassion (app-06:1994/2054), switchToProfile (app-06:2671), openPassionPaywall (app-06:3386), toggleFollowUser (app-04:3280), openFollowersList (app-06:472), shareMyProfile (app-06:771)
- **Tables** : profiles, posts, follows, blocks, reports, user_passions, passion_requests, user_state
- **Specs e2e qui y naviguent** (21, grep `goTo('profiles')|screen-profiles`) : adr-009-retrait-economie (7), aides-contextuelles (10), biographie-multiligne (9), carte-passion-photo (2), contextual-nav (6), feed-premier-rendu (9), feed-window (20), first-run (41), mes-passions-page (25), multi-passion-integrite (11), passions-archive-quota (29), passions-plates (36), profil-badges-visibles (3), profil-entete-passions (30), profils-types (8), refonte-multi-passion (22), ui-v2-shell (11), ui-v6-composer (10), ui-v6b-profil (10), ui-v7-lot (17), ui-v8-passions (26)

### screen-studio (index.html:772, 98 lignes de balisage)

- **Statique** : 5 handlers inline {"onclick":4,"onchange":1} ; formulaire {"input":3,"textarea":1,"select":2,"button":6,"roleButton":0} ; 24 ids.
- **Émulation** (`emulation-ecrans.json`) : écran actif attendu = OUI ; 8 commandes visibles ([onclick], button, [role=button], a[href]) ; 1 champs visibles ; 94 nœuds ; capture `ecran-studio.jpg`.
- **Onglets / rails** : `.studio-type-tabs` (format, source de vérité `studioType`) · moods `creation/learn/irl/all` (`PASSIO_MOOD_LABELS`) · feuille « Créer » `#v2CreateSheet` (UI-1) : Publication, Bobine, Activité, Story, Live vidéo, Audio/podcast
- **Fonctions appelées par les handlers statiques** : onStudioPassionChange, ouvrirRecherchePassionStudio, publishPost, toggleRecording
- **Fonctions clés (rendu en JS)** : publishPost / supaPublishPostWithRetry, openMediaEditor, ouvrirRecherchePassionStudio (app-06:3502), PassionSearchSelector (passion-selector.js), createEvent (app-07), supaUploadMedia
- **Tables** : posts, stories, events, video_lives, passions (via `estPassionCanonique`) + bucket content
- **Specs e2e qui y naviguent** (14, grep `goTo('studio')|screen-studio`) : feed-premier-rendu (9), partage-experience-passion (3), passion-personnalisee-fk (4), passion-politiques-ecriture (15), passions-plates (36), profils-types (8), refonte-multi-passion (22), studio-moods (9), suppression-durable (8), ui-v2-shell (11), ui-v6-composer (10), ui-v7-lot (17), ui-v7-parcours (9), ui-v8-passions (26)

### screen-explore (index.html:869, 184 lignes de balisage)

- **Statique** : 15 handlers inline {"onclick":14,"oninput":1} ; formulaire {"input":3,"textarea":0,"select":0,"button":15,"roleButton":0} ; 27 ids.
- **Émulation** (`emulation-ecrans.json`) : écran actif attendu = OUI ; 41 commandes visibles ([onclick], button, [role=button], a[href]) ; 1 champs visibles ; 214 nœuds ; capture `ecran-explore.jpg`.
- **Onglets / rails** : `.explore-tabs` : Recherche (`#exPanel_search`) / Assistant IA (`#exPanel_ai`, Edge `ask-ai`) · grille `.passion-grid` (aperçu `PassioPassions.suggestions()`), tendances, `#pexCreators`, `#suggestedCreators`
- **Fonctions appelées par les handlers statiques** : closeEventDetail, closePost, filterExplore, sendAIQuery, switchExploreTab
- **Fonctions clés (rendu en JS)** : filterExplore (app-07:152), _exSearchLancer (app-07:207), openPassionExplorer, discoverPeople, supaSearchUsers (app-08:4423), askAI (app-07:28-34)
- **Tables** : passions (rpc rechercher_passions), profiles, posts, follows
- **Specs e2e qui y naviguent** (8, grep `goTo('explore')|screen-explore`) : feed-premier-rendu (9), feed-window (20), interactions (13), navigation (2), profils-types (8), recherche-referentiel (13), ui-v2-feed (14), ui-v2-shell (11)

### screen-irl (index.html:1052, 176 lignes de balisage)

- **Statique** : 23 handlers inline {"onclick":19,"onchange":2,"oninput":2} ; formulaire {"input":2,"textarea":0,"select":3,"button":19,"roleButton":0} ; 38 ids.
- **Émulation** (`emulation-ecrans.json`) : écran actif attendu = OUI ; 42 commandes visibles ([onclick], button, [role=button], a[href]) ; 1 champs visibles ; 888 nœuds ; capture `ecran-irl.jpg`.
- **Onglets / rails** : Vue Liste / Carte (`ui-v4a3-vue.js`) · vue « Filtre » (`ui-v4a5-filtres.js` : Quand ? · Où ? · Quelles passions ? · Horaire) · onglets filtres legacy `.irl-ftabs` Date/Distance/Horaire (`setIrlFilterTab`) · tête UI-4A0 + intentions UI-4A1 · `ContextualTools` (contextual-nav.js)
- **Fonctions appelées par les handlers statiques** : ContextualTools.open, clearAllIrlFilters, clearIrlDateFilter, clearIrlDistanceFilter, clearIrlTimeFilter, closeIrlFiltersPanel, filterIrlByCity, irlCalNavMonth, irlSetQuick, irlUpdateTime, openCreateEvent, setIrlDistanceFromRange, setIrlFilterTab, toggleIrlMapFullscreen, toggleIrlMapPeek
- **Fonctions clés (rendu en JS)** : renderIRL, _filterIrlEvents (app-07:2395), initIrlMap (app-07:1377, `L.map` via MapShim MapLibre), updateIrlMapMarkers (app-07:1520), openEventDetail, openEventRsvpSheet (app-07:3478), supaLoadEvents (app-08:4178), passioGeocode (app-07:1075, BAN+Photon), shareEvent (app-07:4328)
- **Tables** : events, event_attendees, event_comments, event_reactions, comment_interactions, profiles, notifications, user_safety (rpc declare_birth_year, irl_interaction_allowed)
- **Specs e2e qui y naviguent** (21, grep `goTo('irl')|screen-irl`) : cases-violet-leger (2), contextual-nav (6), feed-window (20), first-run (41), interactions (13), ios-navigation-et-zoom (11), irl-changement-ville (2), irl-funnel (13), irl-passion-archivee (3), irl (29), navigation (2), prix-euros (4), ui-v3-passerelle (23), ui-v4a0-tete (9), ui-v4a1-intentions (12), ui-v4a2-cartes (12), ui-v4a3-vue (10), ui-v4a4-outils (9), ui-v4a5-filtres (23), ui-v5-bobines (13), ui-v7-lot (17)

### screen-messages (index.html:1227, 42 lignes de balisage)

- **Statique** : 3 handlers inline {"onclick":2,"oninput":1} ; formulaire {"input":1,"textarea":0,"select":0,"button":2,"roleButton":0} ; 8 ids.
- **Émulation** (`emulation-ecrans.json`) : écran actif attendu = OUI ; 6 commandes visibles ([onclick], button, [role=button], a[href]) ; 1 champs visibles ; 60 nœuds ; capture `ecran-messages.jpg`.
- **Onglets / rails** : Inbox UI-6A (filtre lu/non-lu `msgReadFilter`, recherche globale `_globalMsgSearch`) · conversation plein écran `#conv-fullpage` (panneaux `#convSettingsPanel`, `#convFilesPanel`, `#convEmojiPanel`) · « Proposer un IRL » (UI-6C) · appels WebRTC (`vlive:` / `notify-call`)
- **Fonctions appelées par les handlers statiques** : _globalMsgSearch, openCreateGroup, openNewMessage
- **Fonctions clés (rendu en JS)** : renderMessages (app-04:3390), openConversation, sendMessage, renderConvFpThread (app-04:3788), supaLoadMyConversations (app-08:4678), supaLoadMessages (app-08:4560), searchUsers (app-04:2503), _nmDoSearch (app-04:2421), hydrateConvsFromIDB (idb-store.js)
- **Tables** : conversations, conv_members, conv_messages, conv_reads, profiles, push_subscriptions (Edge notify-call) + bucket attachments
- **Specs e2e qui y naviguent** (13, grep `goTo('messages')|screen-messages`) : aides-contextuelles (10), badge-messages (6), conv-clavier-ouverture (4), conv-ouverture-fil (4), feed-window (20), ios-navigation-et-zoom (11), navigation (2), ui-v3-passerelle (23), ui-v6a-boucle (3), ui-v6a-messages (9), ui-v6c-proposer-irl (8), ui-v7-lot (17), ui-v8-passions (26)

### Surfaces hors écrans

- **Avant `<main>`** (landing, onboarding `#onb*`, gate, barre haute, `#devPanel`) : 66 handlers, 51 fonctions distinctes, formulaire {"input":8,"textarea":0,"select":0,"button":50,"roleButton":5}.
- **Après `</main>`** (nav, `#modalBackdrop/#modalContent`, `#tourOverlay`, `#conv-fullpage`, `#reelsViewer`, `#reelCommentsPanel`, `#convEmojiPanel`) : 36 handlers, 26 fonctions, formulaire {"input":5,"textarea":2,"select":0,"button":24,"roleButton":4}.
- Bobines : specs 23 ; première visite : 4 ; modales (`openModal`/`#modalContent`) : 17 ; 48 specs sans écran identifiable par grep (gates statiques, build, CSP, télémétrie, projets Playwright…).

## 3. Modales, feuilles basses, pages plein écran, viewers

| Surface | Type | Créée par | État après boot (émulation) |
|---|---|---|---|
| `#modalBackdrop` + `#modalContent` | modale unique (`openModal(html)` app-08:15, n'empile pas, injecte un `×`) | index.html:1354 | présent-masqué ; 64 appels `openModal(` dans js/ (app-02 17, app-07 14, app-04 9, app-06 8, app-05 6, app-08 5, first-run 2, app-03/app-09/passion-selector 1) |
| `#v2CreateSheet` | feuille basse « Créer » (6 cases en grille) | ui-v2-shell.js (`.id = "v2CreateSheet"`) | ABSENT jusqu'au premier tap sur « Créer » ; ouverte en émulation (`overlay-creer.jpg`) |
| `#v3PassioSheet` | feuille « Trouver une expérience » | ui-v3-passerelle.js | ABSENT jusqu'à l'ouverture |
| `#reelsViewer` | viewer Bobines plein écran, z-index 9999 | index.html:1273, `openReels` app-05:2207 | présent ; ouvert en émulation : classe `reels-viewer open`, 1/20 |
| `#reelCommentsPanel` | panneau commentaires du viewer | index.html:1286 | présent-masqué |
| `#passionManager` | PAGE plein écran « Mes passions » dans `#screen-profiles` (`passions-page-open`, masque ses 5 frères) | index.html:630, `openPassionManager` app-06:1854 | ouvert en émulation : 5/5 frères masqués, 12 portes visibles dont `#nouveauProfilLien→openCreateProfile()` |
| `#conv-fullpage` | conversation plein écran (glissante) + `#convSettingsPanel`, `#convFilesPanel`, `#convEmojiPanel` | index.html:1381-1396, 1698 | présent (hors champ) |
| `#irlFiltersPanel` | panneau filtres IRL (legacy, remplacé par la vue Filtre UI-4A5) | index.html:1105 | présent-masqué |
| `#tourOverlay` | tour de démonstration 5 étapes (`startTour` app-08:120, bouton « Tour démo » du `#devPanel`) | index.html:1359 | ouvert en émulation sans erreur JS (`overlay-tour.jpg`) ; sa carte IRL charge MapLibre via `ensureLeaflet` (alias map-loader.js:279) |
| `#devPanel` | panneau développeur (« ⋯ ») | index.html:392 | présent-masqué |
| `#postDetailPage` | page détail d'un post (z 200) | index.html | présent-masqué |
| `#storyViewer` | viewer stories | index.html | présent-masqué |
| `#ctxToolsRoot` | panneau d'outils contextuel (contextual-nav.js, dialog) | créé à la demande | ABSENT |
| Ad hoc créés en JS | `cmtSheet` (openCommentSheet app-04:1535), `profileDotsMenu`, `fullImgViewer`, `pwdRecoveryOverlay`, `vliveOverlay`, `emoji-react-panel`, `react-popover`, `mention-box`, `passioGate`, `irlExtraPanel`, `#v7Pan-*` | `.id = "…"` dans js/ (grep) | 29 `position:fixed` en ligne dans js/ (app-04 6, app-02 5, emoji-misc 5, ui-v3 4, …) |

## 4. Fonctions globales par fichier (top-level `function X`) et handlers dans les templates

| Fichier | Lignes | Chargé (dev) | `function X` top-level | `window.X = fn` | Handlers inline | Tables `.from()` |
|---|---|---|---|---|---|---|
| access-gate.js | 290 | oui | 0 | 0 | 0 |  |
| app-01-diag-seed.js | 2233 | oui | 6 | 0 | 0 |  |
| app-02-state-utils.js | 6915 | oui | 239 | 1 | 76 | blocks, follows, passion_requests, passions, user_state |
| app-03-posts-vlogs.js | 400 | oui | 11 | 0 | 1 | post_likes, profiles |
| app-04-comments-shop.js | 4865 | oui | 182 | 1 | 75 | comment_interactions, conv_members, conv_messages, conversations, follows, posts, profiles |
| app-05-config-profil.js | 4053 | oui | 148 | 2 | 67 | conv_members, conv_messages, conversations, follows, profiles, push_subscriptions, video_lives |
| app-06-reels-partage.js | 5052 | oui | 150 | 1 | 64 | follows, profiles |
| app-07-ia-explore-irl.js | 6670 | oui | 273 | 1 | 103 | profiles |
| app-08-ui-modals-tour.js | 6148 | oui | 211 | 8 | 13 | analytics_events, blocks, comment_interactions, comment_likes, conv_members, conv_messages, conv_reads, conversations, event_attendees, event_comments, event_reactions, events, follows, notifications, post_comments, post_likes, posts, profiles, reports, stories, story_views, user_passions |
| app-09-boot-pwa.js | 1723 | oui | 44 | 0 | 35 | conv_messages |
| contextual-nav.js | 268 | oui | 0 | 0 | 1 |  |
| emoji-misc.js | 1099 | oui | 21 | 10 | 6 | posts |
| first-run.js | 2086 | oui | 0 | 0 | 15 |  |
| idb-store.js | 119 | oui | 0 | 3 | 0 |  |
| identity-transition.js | 135 | **non (build seulement)** | 0 | 0 | 0 |  |
| map-loader.js | 297 | oui | 0 | 1 | 0 |  |
| passion-context.js | 90 | **non (build seulement)** | 0 | 0 | 0 |  |
| passion-selector.js | 474 | oui | 0 | 0 | 0 |  |
| passions-flat-ui.js | 309 | oui | 0 | 0 | 0 |  |
| passions-flat.js | 930 | oui | 0 | 0 | 0 | passion_requests |
| perf-ios.js | 492 | oui | 0 | 0 | 0 |  |
| platform.js | 203 | oui | 0 | 0 | 0 | client_errors |
| pwa-detect.js | 43 | oui | 0 | 0 | 0 |  |
| pwa-landing.js | 8 | oui | 0 | 0 | 0 |  |
| release-guard.js | 121 | **non (build seulement)** | 0 | 0 | 0 |  |
| supabase-loader.js | 18 | oui | 0 | 1 | 0 |  |
| telemetry.js | 882 | oui | 0 | 2 | 0 |  |
| ui-v2-shell.js | 843 | oui | 0 | 0 | 0 |  |
| ui-v3-passerelle.js | 1359 | oui | 0 | 0 | 0 |  |
| ui-v4a0-tete.js | 492 | oui | 0 | 0 | 0 |  |
| ui-v4a1-intentions.js | 553 | oui | 0 | 0 | 0 |  |
| ui-v4a2-cartes.js | 775 | oui | 0 | 0 | 0 |  |
| ui-v4a3-vue.js | 437 | oui | 0 | 0 | 0 |  |
| ui-v4a4-outils.js | 263 | oui | 0 | 0 | 0 |  |
| ui-v4a5-filtres.js | 1017 | oui | 0 | 0 | 0 |  |
| ui-v4b-fiche.js | 921 | oui | 0 | 0 | 0 |  |
| ui-v5-bobines.js | 423 | oui | 0 | 0 | 0 |  |
| ui-v6-composer.js | 363 | oui | 0 | 0 | 1 |  |
| ui-v6a-messages.js | 365 | oui | 0 | 0 | 1 |  |
| ui-v6b-profil.js | 323 | oui | 0 | 0 | 1 |  |
| ui-v6c-proposer-irl.js | 277 | oui | 0 | 0 | 0 |  |
| ui-v7-lot.js | 719 | oui | 0 | 0 | 0 |  |
| **Total** | 55053 | 40/42 | **1285** | | **459** | |

Doublon de nom top-level : 1 seul, `$` (app-01:7 `getElementById` écrasé par app-02:1094 `querySelector`), allowlisté dans `scripts/audit-globals.js:22`.

## 5. Matrice fichier × table Supabase (nombre d'occurrences `.from("table")`)

| Table | app | app | app | app | app | app | app | app | emoji | passions | platform | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| analytics_events |  |  |  |  |  |  | 1 |  |  |  |  | 1 |
| attachments (bucket) |  |  |  |  |  |  |  | 5 |  |  |  | 5 |
| blocks | 2 |  |  |  |  |  | 3 |  |  |  |  | 5 |
| client_errors |  |  |  |  |  |  |  |  |  |  | 1 | 1 |
| comment_interactions |  |  | 1 |  |  |  | 5 |  |  |  |  | 6 |
| comment_likes |  |  |  |  |  |  | 3 |  |  |  |  | 3 |
| content (bucket) |  |  | 1 |  |  |  | 4 |  |  |  |  | 5 |
| conv_members |  |  | 2 | 3 |  |  | 12 |  |  |  |  | 17 |
| conv_messages |  |  | 5 | 1 |  |  | 3 | 6 |  |  |  | 15 |
| conv_reads |  |  |  |  |  |  | 2 |  |  |  |  | 2 |
| conversations |  |  | 1 | 1 |  |  | 7 |  |  |  |  | 9 |
| event_attendees |  |  |  |  |  |  | 14 |  |  |  |  | 14 |
| event_comments |  |  |  |  |  |  | 4 |  |  |  |  | 4 |
| event_reactions |  |  |  |  |  |  | 6 |  |  |  |  | 6 |
| events |  |  |  |  |  |  | 5 |  |  |  |  | 5 |
| follows | 2 |  | 2 | 1 | 2 |  | 4 |  |  |  |  | 11 |
| notifications |  |  |  |  |  |  | 4 |  |  |  |  | 4 |
| passion_requests | 1 |  |  |  |  |  |  |  |  | 1 |  | 2 |
| passions | 1 |  |  |  |  |  |  |  |  |  |  | 1 |
| post_comments |  |  |  |  |  |  | 3 |  |  |  |  | 3 |
| post_likes |  | 3 |  |  |  |  | 2 |  |  |  |  | 5 |
| posts |  |  | 2 |  |  |  | 4 |  | 4 |  |  | 10 |
| profiles |  | 1 | 4 | 1 | 3 | 2 | 14 |  |  |  |  | 25 |
| push_subscriptions |  |  |  | 1 |  |  |  |  |  |  |  | 1 |
| reports |  |  |  |  |  |  | 1 |  |  |  |  | 1 |
| stories |  |  |  |  |  |  | 2 |  |  |  |  | 2 |
| story_views |  |  |  |  |  |  | 2 |  |  |  |  | 2 |
| user_passions |  |  |  |  |  |  | 2 |  |  |  |  | 2 |
| user_state | 5 |  |  |  |  |  |  |  |  |  |  | 5 |
| video_lives |  |  |  | 5 |  |  |  |  |  |  |  | 5 |

**Tables prod (39) sans aucun `.from()` client** : cdv_lives, cdv_live_steps, cdv_live_comments, cdv_live_reactions, cdv_live_followers, cdv_live_collaborators (ADR-011, données conservées), post_collaborators, step_interactions, passion_relations (lue par la fonction SQL `rechercher_passions`), user_safety (rpc `declare_birth_year` / `irl_interaction_allowed`), telemetry_events (POST REST direct dans `js/telemetry.js`, lu par le dashboard : 7 `.from("telemetry_events")` dans `dashboard/server`). Le dashboard touche aussi `profiles` (4) et `posts` (1). Edge Functions : `notify-call` → push_subscriptions ; `delete-account` → bucket `content` + `auth.admin.deleteUser` ; `ask-ai` → api.anthropic.com (aucune table).

Colonnes `passion_id` en prod (requête `information_schema.columns`) : conversations, events, posts, profiles, stories, **user_passions** → 6 tables (PASSIO_FUNCTIONAL_MAP en annonçait 5). `author_id` : posts, stories, events, post_comments, event_comments, video_lives, cdv_lives, cdv_live_steps, cdv_live_comments.

## 6. Stockage local

| Clé | Portée | Fichiers |
|---|---|---|
| `localStorage:passio_mvp_state_v1` | appareil/compte | access-gate.js |
| `localStorage:passio_state` | appareil/compte | access-gate.js |
| `localStorage:passio_logo_variant` | appareil/compte | app-01-diag-seed.js |
| `localStorage:sb-` | appareil/compte | app-02-state-utils.js, telemetry.js |
| `localStorage:passio_usage_min` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_limit_sec` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_parental_code` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_uid` | appareil/compte | app-02-state-utils.js, app-06-reels-partage.js, app-08-ui-modals-tour.js, emoji-misc.js, first-run.js |
| `localStorage:passio_oauth_pending` | appareil/compte | app-02-state-utils.js, app-08-ui-modals-tour.js |
| `localStorage:passio_passion_requests` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_feed_intents_v1` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_ui_v2` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_feed_rank` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_feed_window_v1` | appareil/compte | app-02-state-utils.js |
| `localStorage:passio_cdv_lives` | appareil/compte | app-03-posts-vlogs.js |
| `localStorage:passio_conversations_v1` | appareil/compte | app-04-comments-shop.js |
| `localStorage:passio_config` | appareil/compte | app-05-config-profil.js |
| `localStorage:passio_ui_8` | appareil/compte | app-06-reels-partage.js, ui-v6-composer.js, ui-v6b-profil.js |
| `localStorage:passio_irl_map_peek` | appareil/compte | app-07-ia-explore-irl.js |
| `localStorage:passio_event_reminded` | appareil/compte | app-07-ia-explore-irl.js |
| `localStorage:passio_feed_irl_bridge_v1` | appareil/compte | app-07-ia-explore-irl.js |
| `localStorage:passio_irl_proposal_v1` | appareil/compte | app-07-ia-explore-irl.js |
| `localStorage:passio_realtime_v2` | appareil/compte | app-08-ui-modals-tour.js |
| `localStorage:passio_realtime_v3` | appareil/compte | app-08-ui-modals-tour.js |
| `localStorage:passio_ai_history` | appareil/compte | app-08-ui-modals-tour.js |
| `sessionStorage:passio_pwa_dismissed` | session | app-09-boot-pwa.js |
| `localStorage:passio_debug` | appareil/compte | platform.js |
| `localStorage:passio_pwa_installed` | appareil/compte | platform.js |
| `localStorage:passio_device_id` | appareil/compte | telemetry.js |
| `localStorage:passio_telemetry` | appareil/compte | telemetry.js |
| `localStorage:passio_ui_4a4` | appareil/compte | ui-v4a4-outils.js |
| `localStorage:passio_ui_5` | appareil/compte | ui-v5-bobines.js |
| `localStorage:passio_ui_6` | appareil/compte | ui-v6-composer.js |
| `localStorage:passio_ui_6a` | appareil/compte | ui-v6a-messages.js |
| `localStorage:passio_ui_6b` | appareil/compte | ui-v6b-profil.js |
| `localStorage:passio_ui_6c` | appareil/compte | ui-v6c-proposer-irl.js |
| `localStorage:passio_ui_7` | appareil/compte | ui-v7-lot.js |
| `passio_mvp_state_v1` (STATE_KEY app-01:109) · `passio_auth_intent_v1` (AUTH_INTENT_KEY, clé d'APPAREIL horodatée) · `passio_outbox_v1` · `passio_post_delete_outbox_v1` · `passio_cmt_outbox_v1` · `passio_conv_deleted_v1` · `passio_geo_cache_v1` · `passio_irl_digest_week` · `passio_event_comments_v1` | constantes | app-01, app-02, app-04, app-07 |
| `ACCOUNT_SCOPED_KEYS` (app-02:2711) | liste des clés purgées à la déconnexion (`purgeAccountScopedData`, app-02:2756) | app-02 |
| IndexedDB `passio_store`/`kv` | conversations (write-through, hydratation au boot) | idb-store.js |

Après boot onboardé (émulation) : localStorage = passio_conversations_v1, passio_device_id, passio_irl_digest_week, passio_mvp_state_v1, passio_post_delete_outbox_v1, passio_uid ; sessionStorage = passio_gate_v1, passio_pwa_dismissed.

## 7. Services externes

| Service | Usage | Fichiers | CSP (`_headers` = `netlify.toml`) |
|---|---|---|---|
| Supabase `njkiyoklssvefstljemx.supabase.co` (REST, Auth, Realtime wss, Storage, Edge Functions) | backend | app-08:2552 (URL + clé anon), supabase-loader.js (SDK via cdn.jsdelivr.net) | connect-src https + wss ; script-src cdn.jsdelivr.net |
| Netlify `passio-app.netlify.app` | hébergement prod, `_headers` (cache, CSP), `netlify.toml` (CSP dupliquée + X-Frame-Options) | platform.js, app-03, app-09 | — |
| Brevo SMTP | confirmation d'e-mail (config côté Supabase Auth, aucun code client) | docs/SETUP_SMTP_AUTH.md | NON APPLICABLE |
| MapLibre GL (unpkg.com) + OpenFreeMap `tiles.openfreemap.org` | cartes IRL et tour (shim `window.L` compatible Leaflet, map-loader.js:251) | map-loader.js, app-07:1400, app-08:179 | script/style-src unpkg.com ; connect-src tiles.openfreemap.org |
| BAN `api-adresse.data.gouv.fr` + Photon `photon.komoot.io` | géocodage (`passioGeoSuggest`/`passioGeocode`/`passioReverseGeocode`) | app-07:1075-1095 | connect-src |
| Tenor `tenor.googleapis.com`, Giphy `api.giphy.com`/`media.giphy.com` | GIF dans commentaires/messages | emoji-misc.js | connect-src |
| Edge Functions `ask-ai` (Claude, api.anthropic.com), `notify-call` (web-push), `delete-account` (auth.admin + Storage) | IA Explore, appels, suppression de compte | app-07:34, app-05/app-08, app-02 | connect-src supabase |
| Web Push | `push_subscriptions`, `sw.js` (`push`, `notificationclick`, cache `caches.open`) | app-09, sw.js, pwa-detect.js:11 (`register('./sw.js')`) | worker-src 'self' |
| Cloudflare Worker `cloudflare/passio-cdn-worker.js` | cache de bord des buckets publics — **INACTIF** : `PASSIO_CDN_BASE = ""` (app-08:2564) | app-08 | non listé (img-src `https:` l'admettrait) |
| STUN Google / TURN openrelay.metered.ca | WebRTC appels | app-05 | connect-src stun:/turn: |
| Google Fonts | police | index.html, app-04 | style-src/font-src |
| Médias de démonstration : images.unsplash.com, picsum.photos, loremflickr.com, videos.pexels.com, commondatastorage.googleapis.com, galerielapetite.fr | seed | app-01, app-02, app-05, app-06, app-08 | img/media-src `https:` |
| Partage sortant : wa.me, t.me, twitter.com, www.facebook.com, instagram.com, maps.google.com, www.openstreetmap.org | liens | app-06:183-231, app-04, app-07, app-09 | navigation, hors CSP |

## 8. Modules UI sous drapeau (`ui-v*.js` + apparentés) — ce qu'ils décorent

| Module | Lignes | Drapeau (ne sait qu'ENLEVER, `"0"`) | Décore |
|---|---|---|---|
| ui-v2-shell.js | 843 | passio_ui_v2 / PASSIO_UI_V2 | UI-1 cadre + nav `#appNavV2` (remplace `#appNav`), feuille « Créer » `#v2CreateSheet`, UI-2 fil |
| ui-v3-passerelle.js | 1359 | passio_ui_3 / PASSIO_UI_3 | passerelle Feed→IRL « Trouver une expérience » `#v3PassioSheet` |
| ui-v4a0-tete.js | 492 | passio_ui_4a0 | tête de l'écran Rencontrer |
| ui-v4a1-intentions.js | 553 | passio_ui_4a1 | intentions de Rencontrer (Tous · Cette semaine · Ma ville · Mes passions) |
| ui-v4a2-cartes.js | 775 | passio_ui_4a2 | carte d'activité V2 dans la liste IRL (`data-v4a2`) |
| ui-v4a3-vue.js | 437 | passio_ui_4a3 | commutateur Liste / Carte (déplace `#irlMapWrap` vers `#eventList`) |
| ui-v4a4-outils.js | 263 | passio_ui_4a4 | trois onglets de Rencontrer, Outils |
| ui-v4a5-filtres.js | 1017 | passio_ui_4a5 | vue « Filtre » (Quand/Où/Passions/Horaire, pied fixe) — bloc CSS DERNIER de styles.css |
| ui-v4b-fiche.js | 921 | passio_ui_4b | fiche activité V2 (`#eventDetailCta`) |
| ui-v5-bobines.js | 423 | passio_ui_5 | bobines connectées au réel (MutationObserver sur `#reelsList`) |
| ui-v6-composer.js | 363 | passio_ui_6 (+ passio_ui_8) | composer de publication (formats masqués, `studioType` reste la vérité) |
| ui-v6a-messages.js | 365 | passio_ui_6a | inbox Messages (recherche globale, filtres) |
| ui-v6b-profil.js | 323 | passio_ui_6b (+ passio_ui_8) | profil (`#v6bModifier`, sections) |
| ui-v6c-proposer-irl.js | 277 | passio_ui_6c | « Proposer un IRL » depuis une conversation |
| ui-v7-lot.js | 719 | passio_ui_7 | cohérence des interfaces validées (déplace 4 nœuds du profil, `#v7Pan-*`) |
| first-run.js | 2086 | passio_first_run_experience_v1 / PASSIO_FIRST_RUN_V1 | première visite sans compte, `requireAuthentication(ctx)`, `allerConnexion` |
| passions-flat.js / passion-selector.js / passions-flat-ui.js | 930 | flat_passions_v1 / PASSIO_FLAT_PASSIONS | référentiel plat (1 908), sélecteur unique des 7 surfaces, colle |
| contextual-nav.js | 268 | — | `ContextualTools` (dialog d'outils secondaires, IRL) |
| perf-ios.js | 492 | — | instrumentation PERF-IOS |
| release-guard.js / identity-transition.js / passion-context.js | 121 | PASSIO_VERSION_SKEW / — / — | **injectés par `scripts/build.js` uniquement** (prod) : garde de version, purge de la file télémétrie à la déconnexion, contexte passionnel télémétrie |
Namespaces présents sur `window` à l'exécution : PASSIO_DEBUG, PassioTelemetry, tel, PassioPerf, PassioFirstRun, PASSIO_MOOD_LABELS, PASSIO_MOODS_ADMIS, PASSIONS_PAGE_CLASSE, PASSION_REACTIVATION_MOTIF, PASSIO_BADGES, PASSIO_SUPABASE, PASSIO_REALTIME_V2, PASSIO_REALTIME_V3, ContextualTools, PassioUIV2, PassioUIV3, PassioUIV4B, PassioUIV4A0, PassioUIV4A1, PassioUIV4A2, PassioUIV4A3, PassioUIV5, PassioUIV4A4, PassioUIV4A5, PassioUIV6, PassioUIV6A, PassioUIV6B, PassioUIV6C, PassioUIV7, PassioPassions, PassionSearchSelector, PassioFlatUI, PASSIO_DEFAULT_GIFS, PASSIO_GIF_API.

## 9. Écart avec PASSIO_FUNCTIONAL_MAP.md (2026-08-16)

| Affirmation | Aujourd'hui (SHA c8cb8e99) | Verdict |
|---|---|---|
| 8 écrans dont `cdv` et `wallet` | 6 écrans (feed, profiles, studio, explore, irl, messages) ; `goTo('cdv'|'wallet'|'shop')` redirigés | FAUX (ADR-009, ADR-011) |
| 435 interactions sur 757 handlers | `node scripts/couverture-interactions.js` → 355 sur 601 (index + 9 app) ; 42 fichiers → 366 sur 626 | FAUX (chiffres périmés) |
| 34 tables en production | 39 (`list_tables`) | FAUX |
| 25 specs / 175 tests | 131 specs / 1 060 `test(` | FAUX |
| couverture 66/435 = 15,2 % | non re-mesurée ici (exige la suite complète sous `PASSIO_COUVERTURE=1`) | NON VÉRIFIABLE |
| « cdv 52 tests » | 0 spec `cdv*` dans tests/e2e | FAUX |
| `passion_id` sur 5 tables et sur aucune table d'interaction | 6 tables (user_passions ajoutée) ; toujours aucune table d'interaction | PARTIELLEMENT VRAI |
| toutes les tables sous RLS | 39/39 `rls_enabled=true` | TOUJOURS VRAI |

## 10. Clés étrangères réelles en prod (requête `pg_constraint`, 20 FK)

profiles.passion_id→passions · posts.author_id→profiles · posts.passion_id→passions · stories.author_id→profiles · stories.passion_id→passions · events.passion_id→passions · conversations.passion_id→passions · conv_members.conv_id→conversations · conv_members.user_id→profiles · conv_messages.conv_id→conversations · conv_messages.from_id→profiles · post_comments.author_id→profiles · cdv_live_steps/comments/reactions/followers.live_id→cdv_lives · passion_relations.source/target_passion_id→passions · user_passions.passion_id→passions · passion_requests.resolved_passion_id→passions.
Sans FK vers `profiles` : `events.author_id`, `event_comments.author_id`, `video_lives.author_id`, `post_likes`, `follows`, `blocks`, `reports`, `notifications` (hors périmètre carto, signalé au domaine données).

## 11. Fichiers de preuve

`inventaire.js` / `inventaire.json` (inventaire statique reproductible) · `emulation-ecrans.js` / `emulation-ecrans.json` / `emulation-ecrans.log` (parcours Chromium) · `ecran-*.jpg`, `overlay-*.jpg` (captures 390×844, < 30 Ko) · `tests-par-spec.txt`, `specs-ecrans.txt` · `smoke-run.txt` (smoke + contextual-nav : 11/11 verts) · `pw.config.js` (wrapper config, Chromium 1194).
