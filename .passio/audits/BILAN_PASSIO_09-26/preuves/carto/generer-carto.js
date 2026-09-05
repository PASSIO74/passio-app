// Génère CARTOGRAPHIE.md à partir d'inventaire.json + emulation-ecrans.json + tests-par-spec.txt + specs-ecrans.txt
"use strict";
const fs = require("fs");
const path = require("path");
const D = __dirname;
const inv = JSON.parse(fs.readFileSync(path.join(D, "inventaire.json"), "utf8"));
const emu = JSON.parse(fs.readFileSync(path.join(D, "emulation-ecrans.json"), "utf8"));
const testsParSpec = fs.readFileSync(path.join(D, "tests-par-spec.txt"), "utf8").trim().split("\n").map((l) => { const [n, f] = l.trim().split(/\s+/); return { n: +n, f }; });
const specsEcrans = fs.readFileSync(path.join(D, "specs-ecrans.txt"), "utf8").trim().split("\n").map((l) => { const [f, e] = l.split(":"); return { f: f.trim(), ecrans: (e || "").trim().split(/\s+/).filter(Boolean) }; });
const nTests = (f) => { const t = testsParSpec.find((x) => x.f === f + ".spec.js"); return t ? t.n : 0; };
const specsPour = (e) => specsEcrans.filter((s) => s.ecrans.includes(e)).map((s) => s.f);
const L = [];
const p = (s = "") => L.push(s);

p("# CARTOGRAPHIE PASSIO — BILAN 09/26 (domaine carto)");
p();
p(`SHA audité : \`${inv.sha}\` · généré le 2026-09-04 par \`node generer-carto.js\` (sources : \`inventaire.js\`, \`emulation-ecrans.js\`, greps cités). Toute mesure navigateur = ÉMULATION Chromium 1194 (390×844), jamais un appareil réel.`);
p();
p("## 0. Chiffres reproductibles (commande → valeur)");
p();
p("| Mesure | Valeur | Commande |");
p("|---|---|---|");
p(`| Écrans \`id="screen-*"\` | **${inv.index.ecrans}** (${inv.ecrans.map((e) => e.ecran).join(", ")}) | \`grep -c 'id="screen-' index.html\` |`);
p(`| index.html | ${inv.index.lignes} lignes ; ${inv.index.handlersTotal} handlers inline | \`node inventaire.js\` |`);
p(`| Fichiers js/ | ${inv.js.fichiers} (${inv.js.charges} chargés par index.html en dev ; 3 injectés au build seulement : ${inv.js.nonChargesParIndex.join(", ")}) | \`ls js/*.js \\| wc -l\` ; \`grep -c '<script src="js/' index.html\` |`);
p(`| Fonctions \`function X\` top-level (js/) | **${inv.js.fnTopLevelTotal}** (+ ${emu.globals.fonctionsWindow} fonctions sur \`window\` à l'exécution, namespaces IIFE inclus) | \`grep -hE '^(async )?function [A-Za-z_$]' js/*.js \\| wc -l\` |`);
p(`| Handlers inline dans les templates JS | ${inv.js.handlersTotal} ${JSON.stringify(inv.js.handlersParAttr)} | \`node inventaire.js\` |`);
p(`| Handlers inline TOTAL (html + js) | **${inv.index.handlersTotal + inv.js.handlersTotal}** | idem |`);
p(`| Interactions distinctes (fonctions appelées depuis un handler) | **366** sur 42 fichiers (115 depuis index.html seul) ; le script du dépôt \`node scripts/couverture-interactions.js\` (index + 9 app-*) rend **355 sur 601 handlers** | cf. § 8 |`);
p(`| Tables Supabase touchées par \`.from()\` côté client | **${Object.keys(inv.tables).filter((t) => !["attachments", "content"].includes(t)).length}** tables (+ 2 buckets Storage \`content\`, \`attachments\`) sur **39** tables prod | \`grep -ohE "\\.from\\(['\\"][a-z_]+['\\"]" js/*.js \\| sort -u\` ; \`list_tables\` |`);
p(`| RPC | ${Object.keys(inv.rpc).length} (${Object.keys(inv.rpc).join(", ")}) | \`grep -ohE "\\.rpc\\(['\\"][a-z_]+" js/*.js\` |`);
p(`| Edge Functions appelées | ${Object.keys(inv.edgeAppelees).length} (${Object.keys(inv.edgeAppelees).join(", ")}) ; définies : ${Object.keys(inv.edgeFunctions).join(", ")} | \`ls supabase/functions\` |`);
p(`| Clés localStorage/sessionStorage littérales | ${Object.keys(inv.storageKeys).length} motifs (+ constantes STATE_KEY, AUTH_INTENT_KEY, OUTBOX_KEY, _DEL_OUTBOX_KEY, _CMT_OUTBOX_KEY, CONV_TOMB_KEY, GEO_CACHE_KEY, IRL_DIGEST_KEY, EVENT_COMMENTS_LS_KEY) ; après boot onboardé : ${emu.storage.localStorage.length} clés localStorage, ${emu.storage.sessionStorage.length} sessionStorage | \`node inventaire.js\` ; \`emulation-ecrans.json\` |`);
p(`| IndexedDB | 1 base \`passio_store\`, store \`kv\`, v1 (js/idb-store.js:10) | \`grep -n DB_NAME js/idb-store.js\` |`);
p(`| Canaux realtime | ${Object.keys(inv.canauxRealtime).length} préfixes (${Object.keys(inv.canauxRealtime).join(", ")}) | \`grep -ohE "\\.channel\\(['\\"][^'\\"]+" js/*.js\` |`);
p(`| Specs e2e / tests \`test(\` | **131 specs / 1 060 tests** (7 specs projet \`prod\`, 124 \`local\`) | \`ls tests/e2e/*.spec.js \\| wc -l\` ; \`grep -c '^\\s*test(' tests/e2e/*.spec.js\` |`);
p(`| Modules UI sous drapeau | 16 fichiers \`ui-v*.js\` (${Object.keys(inv.js.parFichier).filter((f) => f.startsWith("ui-v")).length} mesurés) | \`ls js/ui-v*.js\` |`);
p();
p("## 1. Navigation (mesurée en émulation, état onboardé 3 passions)");
p();
p("Deux barres de navigation coexistent dans le DOM :");
p();
p("| Barre | Entrées | Visible | Source |");
p("|---|---|---|---|");
const navLegacy = emu.nav.filter((n) => n.nav === "appNav");
const navV2 = emu.nav.filter((n) => n.nav === "appNavV2");
p(`| \`#appNav\` (balisage statique, index.html:1331) | ${navLegacy.map((n) => `${n.label}→${n.screen}`).join(" · ")} | ${navLegacy.every((n) => !n.visible) ? "NON (masquée par UI-1)" : "partiel"} | index.html |`);
p(`| \`#appNavV2\` (créée par \`js/ui-v2-shell.js:210-230\`) | ${navV2.map((n) => `${n.label.replace(/\d+$/, "")}→${n.screen || "action:" + n.action}`).join(" · ")} | OUI | ui-v2-shell.js |`);
p();
p("Barre haute (index.html:359-383) : logo → `goTo('profiles')` ; loupe → `goTo('explore')` ; enveloppe `#topbarMessages` → `goTo('messages')` ; cloche → `openNotifications()` ; « ⋯ » → `toggleDevPanel()`. **Bobines** : aucune entrée dans la barre V2 (l'entrée `data-screen=\"bobines\"` de la barre legacy est masquée) ; le viewer `#reelsViewer` (z-index 9999) s'ouvre par `openReels()` depuis les cartes du fil, le rail de stories, `#reel=` (deep link) et `#reelsViewer` a été ouvert en émulation avec 20 bobines de démonstration (capture `overlay-bobines.jpg`).");
p();
p("`goTo()` (app-02:1969) : `wallet`/`shop` → `profiles` (ADR-009), `cdv` → `feed` (ADR-011). `bobines` n'est pas un écran : intercepté dans le listener nav (app-08:2076).");
p();
p("## 2. Écrans → onglets → actions → fonctions → tables → tests");
p();
const meta = {
  feed: { onglets: "Rail « Suivis + passions » (`#profileStrip`, bulles `passionTileHTML`) · rail d'intentions `#feedIntents` (`data-intent` discover/learn/create/meet, libellés Explorer/Apprendre/Idées/Rencontrer) · rail legacy `#moodSelector` (`data-mood` creation/learn/chill/actu, GELÉ, sans bouton visible) · stories `#storiesRowFeed`", tables: "posts, post_likes, post_comments, comment_interactions, comment_likes, stories, story_views, follows, profiles, notifications", fnCles: "renderFeed (app-02:6000), renderPostHTML (app-02:6553), rankFeedPosts, openPost (app-02:6782), likePost, sharePost (app-03:10), supaLoadPosts (app-08:3615), renderStories (app-08:420), renderProfileStrip (app-06:2882), openReels (app-05:2207)" },
  profiles: { onglets: "`.profile-tabs` multi-sélection `data-tab` posts/photos/videos/bobines/audio (`PROFILE_TAB_KEYS`, app-06:507) · rail `#v9ProfilePassions` (UI-8/V9) · page plein écran `#passionManager` (« Mes passions », classe `passions-page-open`) · menu « ⋯ » `openVisitedProfileMenu` sur profil visité", tables: "profiles, posts, follows, blocks, reports, user_passions, passion_requests, user_state", fnCles: "renderProfilesScreen (app-06:2449), openPassionManager (app-06:1854), openCreateProfile (app-06:3587), ajouterPassionAuCompte (app-06:3677), archiverPassion/restaurerPassion (app-06:1994/2054), switchToProfile (app-06:2671), openPassionPaywall (app-06:3386), toggleFollowUser (app-04:3280), openFollowersList (app-06:472), shareMyProfile (app-06:771)" },
  studio: { onglets: "`.studio-type-tabs` (format, source de vérité `studioType`) · moods `creation/learn/irl/all` (`PASSIO_MOOD_LABELS`) · feuille « Créer » `#v2CreateSheet` (UI-1) : Publication, Bobine, Activité, Story, Live vidéo, Audio/podcast", tables: "posts, stories, events, video_lives, passions (via `estPassionCanonique`) + bucket content", fnCles: "publishPost / supaPublishPostWithRetry, openMediaEditor, ouvrirRecherchePassionStudio (app-06:3502), PassionSearchSelector (passion-selector.js), createEvent (app-07), supaUploadMedia" },
  explore: { onglets: "`.explore-tabs` : Recherche (`#exPanel_search`) / Assistant IA (`#exPanel_ai`, Edge `ask-ai`) · grille `.passion-grid` (aperçu `PassioPassions.suggestions()`), tendances, `#pexCreators`, `#suggestedCreators`", tables: "passions (rpc rechercher_passions), profiles, posts, follows", fnCles: "filterExplore (app-07:152), _exSearchLancer (app-07:207), openPassionExplorer, discoverPeople, supaSearchUsers (app-08:4423), askAI (app-07:28-34)" },
  irl: { onglets: "Vue Liste / Carte (`ui-v4a3-vue.js`) · vue « Filtre » (`ui-v4a5-filtres.js` : Quand ? · Où ? · Quelles passions ? · Horaire) · onglets filtres legacy `.irl-ftabs` Date/Distance/Horaire (`setIrlFilterTab`) · tête UI-4A0 + intentions UI-4A1 · `ContextualTools` (contextual-nav.js)", tables: "events, event_attendees, event_comments, event_reactions, comment_interactions, profiles, notifications, user_safety (rpc declare_birth_year, irl_interaction_allowed)", fnCles: "renderIRL, _filterIrlEvents (app-07:2395), initIrlMap (app-07:1377, `L.map` via MapShim MapLibre), updateIrlMapMarkers (app-07:1520), openEventDetail, openEventRsvpSheet (app-07:3478), supaLoadEvents (app-08:4178), passioGeocode (app-07:1075, BAN+Photon), shareEvent (app-07:4328)" },
  messages: { onglets: "Inbox UI-6A (filtre lu/non-lu `msgReadFilter`, recherche globale `_globalMsgSearch`) · conversation plein écran `#conv-fullpage` (panneaux `#convSettingsPanel`, `#convFilesPanel`, `#convEmojiPanel`) · « Proposer un IRL » (UI-6C) · appels WebRTC (`vlive:` / `notify-call`)", tables: "conversations, conv_members, conv_messages, conv_reads, profiles, push_subscriptions (Edge notify-call) + bucket attachments", fnCles: "renderMessages (app-04:3390), openConversation, sendMessage, renderConvFpThread (app-04:3788), supaLoadMyConversations (app-08:4678), supaLoadMessages (app-08:4560), searchUsers (app-04:2503), _nmDoSearch (app-04:2421), hydrateConvsFromIDB (idb-store.js)" },
};
for (const e of inv.ecrans) {
  const m = emu.ecrans[e.ecran] || {};
  const md = meta[e.ecran];
  p(`### screen-${e.ecran} (index.html:${e.ligne}, ${e.lignes} lignes de balisage)`);
  p();
  p(`- **Statique** : ${e.handlers} handlers inline ${JSON.stringify(e.parAttr)} ; formulaire ${JSON.stringify(e.formulaire)} ; ${e.ids} ids.`);
  p(`- **Émulation** (\`emulation-ecrans.json\`) : écran actif attendu = ${m.ok ? "OUI" : "NON"} ; ${m.commandesVisibles} commandes visibles ([onclick], button, [role=button], a[href]) ; ${m.champsVisibles} champs visibles ; ${m.noeudsTotal} nœuds ; capture \`ecran-${e.ecran}.jpg\`.`);
  p(`- **Onglets / rails** : ${md.onglets}`);
  p(`- **Fonctions appelées par les handlers statiques** : ${e.fonctions.join(", ") || "(aucune : tout le contenu est rendu en JS)"}`);
  p(`- **Fonctions clés (rendu en JS)** : ${md.fnCles}`);
  p(`- **Tables** : ${md.tables}`);
  const sp = specsPour(e.ecran);
  p(`- **Specs e2e qui y naviguent** (${sp.length}, grep \`goTo('${e.ecran}')|screen-${e.ecran}\`) : ${sp.map((f) => `${f} (${nTests(f)})`).join(", ")}`);
  p();
}
p("### Surfaces hors écrans");
p();
p(`- **Avant \`<main>\`** (landing, onboarding \`#onb*\`, gate, barre haute, \`#devPanel\`) : ${inv.horsEcrans.avantMain.handlers} handlers, ${inv.horsEcrans.avantMain.fonctions.length} fonctions distinctes, formulaire ${JSON.stringify(inv.horsEcrans.avantMain.formulaire)}.`);
p(`- **Après \`</main>\`** (nav, \`#modalBackdrop/#modalContent\`, \`#tourOverlay\`, \`#conv-fullpage\`, \`#reelsViewer\`, \`#reelCommentsPanel\`, \`#convEmojiPanel\`) : ${inv.horsEcrans.apresMain.handlers} handlers, ${inv.horsEcrans.apresMain.fonctions.length} fonctions, formulaire ${JSON.stringify(inv.horsEcrans.apresMain.formulaire)}.`);
p(`- Bobines : specs ${specsPour("bobines").length} ; première visite : ${specsPour("first-run").length} ; modales (\`openModal\`/\`#modalContent\`) : ${specsPour("modales").length} ; ${specsEcrans.filter((s) => !s.ecrans.length).length} specs sans écran identifiable par grep (gates statiques, build, CSP, télémétrie, projets Playwright…).`);
p();
p("## 3. Modales, feuilles basses, pages plein écran, viewers");
p();
p("| Surface | Type | Créée par | État après boot (émulation) |");
p("|---|---|---|---|");
p("| `#modalBackdrop` + `#modalContent` | modale unique (`openModal(html)` app-08:15, n'empile pas, injecte un `×`) | index.html:1354 | présent-masqué ; 64 appels `openModal(` dans js/ (app-02 17, app-07 14, app-04 9, app-06 8, app-05 6, app-08 5, first-run 2, app-03/app-09/passion-selector 1) |");
p("| `#v2CreateSheet` | feuille basse « Créer » (6 cases en grille) | ui-v2-shell.js (`.id = \"v2CreateSheet\"`) | ABSENT jusqu'au premier tap sur « Créer » ; ouverte en émulation (`overlay-creer.jpg`) |");
p("| `#v3PassioSheet` | feuille « Trouver une expérience » | ui-v3-passerelle.js | ABSENT jusqu'à l'ouverture |");
p("| `#reelsViewer` | viewer Bobines plein écran, z-index 9999 | index.html:1273, `openReels` app-05:2207 | présent ; ouvert en émulation : classe `reels-viewer open`, 1/20 |");
p("| `#reelCommentsPanel` | panneau commentaires du viewer | index.html:1286 | présent-masqué |");
p("| `#passionManager` | PAGE plein écran « Mes passions » dans `#screen-profiles` (`passions-page-open`, masque ses 5 frères) | index.html:630, `openPassionManager` app-06:1854 | ouvert en émulation : 5/5 frères masqués, 12 portes visibles dont `#nouveauProfilLien→openCreateProfile()` |");
p("| `#conv-fullpage` | conversation plein écran (glissante) + `#convSettingsPanel`, `#convFilesPanel`, `#convEmojiPanel` | index.html:1381-1396, 1698 | présent (hors champ) |");
p("| `#irlFiltersPanel` | panneau filtres IRL (legacy, remplacé par la vue Filtre UI-4A5) | index.html:1105 | présent-masqué |");
p("| `#tourOverlay` | tour de démonstration 5 étapes (`startTour` app-08:120, bouton « Tour démo » du `#devPanel`) | index.html:1359 | ouvert en émulation sans erreur JS (`overlay-tour.jpg`) ; sa carte IRL charge MapLibre via `ensureLeaflet` (alias map-loader.js:279) |");
p("| `#devPanel` | panneau développeur (« ⋯ ») | index.html:392 | présent-masqué |");
p("| `#postDetailPage` | page détail d'un post (z 200) | index.html | présent-masqué |");
p("| `#storyViewer` | viewer stories | index.html | présent-masqué |");
p("| `#ctxToolsRoot` | panneau d'outils contextuel (contextual-nav.js, dialog) | créé à la demande | ABSENT |");
p("| Ad hoc créés en JS | `cmtSheet` (openCommentSheet app-04:1535), `profileDotsMenu`, `fullImgViewer`, `pwdRecoveryOverlay`, `vliveOverlay`, `emoji-react-panel`, `react-popover`, `mention-box`, `passioGate`, `irlExtraPanel`, `#v7Pan-*` | `.id = \"…\"` dans js/ (grep) | 29 `position:fixed` en ligne dans js/ (app-04 6, app-02 5, emoji-misc 5, ui-v3 4, …) |");
p();
p("## 4. Fonctions globales par fichier (top-level `function X`) et handlers dans les templates");
p();
p("| Fichier | Lignes | Chargé (dev) | `function X` top-level | `window.X = fn` | Handlers inline | Tables `.from()` |");
p("|---|---|---|---|---|---|---|");
for (const [f, v] of Object.entries(inv.js.parFichier)) p(`| ${f} | ${v.lignes} | ${v.charge ? "oui" : "**non (build seulement)**"} | ${v.fnTopLevel} | ${v.windowAssignFn} | ${v.handlers} | ${v.tables.filter((t) => !["content", "attachments"].includes(t)).join(", ")} |`);
p(`| **Total** | ${Object.values(inv.js.parFichier).reduce((a, v) => a + v.lignes, 0)} | ${inv.js.charges}/${inv.js.fichiers} | **${inv.js.fnTopLevelTotal}** | | **${inv.js.handlersTotal}** | |`);
p();
p("Doublon de nom top-level : 1 seul, `$` (app-01:7 `getElementById` écrasé par app-02:1094 `querySelector`), allowlisté dans `scripts/audit-globals.js:22`.");
p();
p("## 5. Matrice fichier × table Supabase (nombre d'occurrences `.from(\"table\")`)");
p();
const files = Object.keys(inv.js.parFichier).filter((f) => Object.values(inv.tables).some((m) => m[f]));
p("| Table | " + files.map((f) => f.replace(/-.*\.js$/, "").replace(".js", "")).join(" | ") + " | Total |");
p("|---|" + files.map(() => "---").join("|") + "|---|");
for (const [t, m] of Object.entries(inv.tables)) {
  const tot = Object.values(m).reduce((a, b) => a + b, 0);
  p(`| ${["content", "attachments"].includes(t) ? t + " (bucket)" : t} | ` + files.map((f) => m[f] || "") .join(" | ") + ` | ${tot} |`);
}
p();
p("**Tables prod (39) sans aucun `.from()` client** : cdv_lives, cdv_live_steps, cdv_live_comments, cdv_live_reactions, cdv_live_followers, cdv_live_collaborators (ADR-011, données conservées), post_collaborators, step_interactions, passion_relations (lue par la fonction SQL `rechercher_passions`), user_safety (rpc `declare_birth_year` / `irl_interaction_allowed`), telemetry_events (POST REST direct dans `js/telemetry.js`, lu par le dashboard : 7 `.from(\"telemetry_events\")` dans `dashboard/server`). Le dashboard touche aussi `profiles` (4) et `posts` (1). Edge Functions : `notify-call` → push_subscriptions ; `delete-account` → bucket `content` + `auth.admin.deleteUser` ; `ask-ai` → api.anthropic.com (aucune table).");
p();
p("Colonnes `passion_id` en prod (requête `information_schema.columns`) : conversations, events, posts, profiles, stories, **user_passions** → 6 tables (PASSIO_FUNCTIONAL_MAP en annonçait 5). `author_id` : posts, stories, events, post_comments, event_comments, video_lives, cdv_lives, cdv_live_steps, cdv_live_comments.");
p();
p("## 6. Stockage local");
p();
p("| Clé | Portée | Fichiers |");
p("|---|---|---|");
for (const [k, v] of Object.entries(inv.storageKeys)) p(`| \`${k}\` | ${k.startsWith("session") ? "session" : "appareil/compte"} | ${v.join(", ")} |`);
p("| `passio_mvp_state_v1` (STATE_KEY app-01:109) · `passio_auth_intent_v1` (AUTH_INTENT_KEY, clé d'APPAREIL horodatée) · `passio_outbox_v1` · `passio_post_delete_outbox_v1` · `passio_cmt_outbox_v1` · `passio_conv_deleted_v1` · `passio_geo_cache_v1` · `passio_irl_digest_week` · `passio_event_comments_v1` | constantes | app-01, app-02, app-04, app-07 |");
p("| `ACCOUNT_SCOPED_KEYS` (app-02:2711) | liste des clés purgées à la déconnexion (`purgeAccountScopedData`, app-02:2756) | app-02 |");
p("| IndexedDB `passio_store`/`kv` | conversations (write-through, hydratation au boot) | idb-store.js |");
p();
p(`Après boot onboardé (émulation) : localStorage = ${emu.storage.localStorage.join(", ")} ; sessionStorage = ${emu.storage.sessionStorage.join(", ")}.`);
p();
p("## 7. Services externes");
p();
p("| Service | Usage | Fichiers | CSP (`_headers` = `netlify.toml`) |");
p("|---|---|---|---|");
p("| Supabase `njkiyoklssvefstljemx.supabase.co` (REST, Auth, Realtime wss, Storage, Edge Functions) | backend | app-08:2552 (URL + clé anon), supabase-loader.js (SDK via cdn.jsdelivr.net) | connect-src https + wss ; script-src cdn.jsdelivr.net |");
p("| Netlify `passio-app.netlify.app` | hébergement prod, `_headers` (cache, CSP), `netlify.toml` (CSP dupliquée + X-Frame-Options) | platform.js, app-03, app-09 | — |");
p("| Brevo SMTP | confirmation d'e-mail (config côté Supabase Auth, aucun code client) | docs/SETUP_SMTP_AUTH.md | NON APPLICABLE |");
p("| MapLibre GL (unpkg.com) + OpenFreeMap `tiles.openfreemap.org` | cartes IRL et tour (shim `window.L` compatible Leaflet, map-loader.js:251) | map-loader.js, app-07:1400, app-08:179 | script/style-src unpkg.com ; connect-src tiles.openfreemap.org |");
p("| BAN `api-adresse.data.gouv.fr` + Photon `photon.komoot.io` | géocodage (`passioGeoSuggest`/`passioGeocode`/`passioReverseGeocode`) | app-07:1075-1095 | connect-src |");
p("| Tenor `tenor.googleapis.com`, Giphy `api.giphy.com`/`media.giphy.com` | GIF dans commentaires/messages | emoji-misc.js | connect-src |");
p("| Edge Functions `ask-ai` (Claude, api.anthropic.com), `notify-call` (web-push), `delete-account` (auth.admin + Storage) | IA Explore, appels, suppression de compte | app-07:34, app-05/app-08, app-02 | connect-src supabase |");
p("| Web Push | `push_subscriptions`, `sw.js` (`push`, `notificationclick`, cache `caches.open`) | app-09, sw.js, pwa-detect.js:11 (`register('./sw.js')`) | worker-src 'self' |");
p("| Cloudflare Worker `cloudflare/passio-cdn-worker.js` | cache de bord des buckets publics — **INACTIF** : `PASSIO_CDN_BASE = \"\"` (app-08:2564) | app-08 | non listé (img-src `https:` l'admettrait) |");
p("| STUN Google / TURN openrelay.metered.ca | WebRTC appels | app-05 | connect-src stun:/turn: |");
p("| Google Fonts | police | index.html, app-04 | style-src/font-src |");
p("| Médias de démonstration : images.unsplash.com, picsum.photos, loremflickr.com, videos.pexels.com, commondatastorage.googleapis.com, galerielapetite.fr | seed | app-01, app-02, app-05, app-06, app-08 | img/media-src `https:` |");
p("| Partage sortant : wa.me, t.me, twitter.com, www.facebook.com, instagram.com, maps.google.com, www.openstreetmap.org | liens | app-06:183-231, app-04, app-07, app-09 | navigation, hors CSP |");
p();
p("## 8. Modules UI sous drapeau (`ui-v*.js` + apparentés) — ce qu'ils décorent");
p();
p("| Module | Lignes | Drapeau (ne sait qu'ENLEVER, `\"0\"`) | Décore |");
p("|---|---|---|---|");
const modules = [
  ["ui-v2-shell.js", "passio_ui_v2 / PASSIO_UI_V2", "UI-1 cadre + nav `#appNavV2` (remplace `#appNav`), feuille « Créer » `#v2CreateSheet`, UI-2 fil"],
  ["ui-v3-passerelle.js", "passio_ui_3 / PASSIO_UI_3", "passerelle Feed→IRL « Trouver une expérience » `#v3PassioSheet`"],
  ["ui-v4a0-tete.js", "passio_ui_4a0", "tête de l'écran Rencontrer"],
  ["ui-v4a1-intentions.js", "passio_ui_4a1", "intentions de Rencontrer (Tous · Cette semaine · Ma ville · Mes passions)"],
  ["ui-v4a2-cartes.js", "passio_ui_4a2", "carte d'activité V2 dans la liste IRL (`data-v4a2`)"],
  ["ui-v4a3-vue.js", "passio_ui_4a3", "commutateur Liste / Carte (déplace `#irlMapWrap` vers `#eventList`)"],
  ["ui-v4a4-outils.js", "passio_ui_4a4", "trois onglets de Rencontrer, Outils"],
  ["ui-v4a5-filtres.js", "passio_ui_4a5", "vue « Filtre » (Quand/Où/Passions/Horaire, pied fixe) — bloc CSS DERNIER de styles.css"],
  ["ui-v4b-fiche.js", "passio_ui_4b", "fiche activité V2 (`#eventDetailCta`)"],
  ["ui-v5-bobines.js", "passio_ui_5", "bobines connectées au réel (MutationObserver sur `#reelsList`)"],
  ["ui-v6-composer.js", "passio_ui_6 (+ passio_ui_8)", "composer de publication (formats masqués, `studioType` reste la vérité)"],
  ["ui-v6a-messages.js", "passio_ui_6a", "inbox Messages (recherche globale, filtres)"],
  ["ui-v6b-profil.js", "passio_ui_6b (+ passio_ui_8)", "profil (`#v6bModifier`, sections)"],
  ["ui-v6c-proposer-irl.js", "passio_ui_6c", "« Proposer un IRL » depuis une conversation"],
  ["ui-v7-lot.js", "passio_ui_7", "cohérence des interfaces validées (déplace 4 nœuds du profil, `#v7Pan-*`)"],
  ["first-run.js", "passio_first_run_experience_v1 / PASSIO_FIRST_RUN_V1", "première visite sans compte, `requireAuthentication(ctx)`, `allerConnexion`"],
  ["passions-flat.js / passion-selector.js / passions-flat-ui.js", "flat_passions_v1 / PASSIO_FLAT_PASSIONS", "référentiel plat (1 908), sélecteur unique des 7 surfaces, colle"],
  ["contextual-nav.js", "—", "`ContextualTools` (dialog d'outils secondaires, IRL)"],
  ["perf-ios.js", "—", "instrumentation PERF-IOS"],
  ["release-guard.js / identity-transition.js / passion-context.js", "PASSIO_VERSION_SKEW / — / —", "**injectés par `scripts/build.js` uniquement** (prod) : garde de version, purge de la file télémétrie à la déconnexion, contexte passionnel télémétrie"],
];
for (const [f, flag, d] of modules) { const v = inv.js.parFichier[f.split(" ")[0]]; p(`| ${f} | ${v ? v.lignes : "—"} | ${flag} | ${d} |`); }
p(`Namespaces présents sur \`window\` à l'exécution : ${emu.globals.passioNamespaces.join(", ")}.`);
p();
p("## 9. Écart avec PASSIO_FUNCTIONAL_MAP.md (2026-08-16)");
p();
p("| Affirmation | Aujourd'hui (SHA c8cb8e99) | Verdict |");
p("|---|---|---|");
p("| 8 écrans dont `cdv` et `wallet` | 6 écrans (feed, profiles, studio, explore, irl, messages) ; `goTo('cdv'|'wallet'|'shop')` redirigés | FAUX (ADR-009, ADR-011) |");
p("| 435 interactions sur 757 handlers | `node scripts/couverture-interactions.js` → 355 sur 601 (index + 9 app) ; 42 fichiers → 366 sur 626 | FAUX (chiffres périmés) |");
p("| 34 tables en production | 39 (`list_tables`) | FAUX |");
p("| 25 specs / 175 tests | 131 specs / 1 060 `test(` | FAUX |");
p("| couverture 66/435 = 15,2 % | non re-mesurée ici (exige la suite complète sous `PASSIO_COUVERTURE=1`) | NON VÉRIFIABLE |");
p("| « cdv 52 tests » | 0 spec `cdv*` dans tests/e2e | FAUX |");
p("| `passion_id` sur 5 tables et sur aucune table d'interaction | 6 tables (user_passions ajoutée) ; toujours aucune table d'interaction | PARTIELLEMENT VRAI |");
p("| toutes les tables sous RLS | 39/39 `rls_enabled=true` | TOUJOURS VRAI |");
fs.writeFileSync(path.join(D, "CARTOGRAPHIE.md"), L.join("\n") + "\n");
console.log("CARTOGRAPHIE.md :", L.length, "lignes");
