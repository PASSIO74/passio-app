# D — Frontend, accessibilité et fluidité — audit PASSIO 2026-11-02

Dépôt `/home/claude/passio-app` (HEAD 6ea94e1). Banc : Playwright + `/usr/bin/google-chrome`, projet `local`, `--workers=1`, port 8104, gabarit 390×844. **Tout est mesuré sur le stub local** (`bootOnboarded` : REST des tables isolé, WebSocket coupé, médias remplacés par un PNG 1×1). Supabase, Netlify et les CDN sont injoignables depuis ce conteneur (403 du proxy) : aucune mesure ci-dessous n'est une mesure de production.

Captures PNG (37) : `/tmp/claude-0/-home-claude/8b869e5f-a0ce-5ebd-84c5-c10fb0d9acb3/scratchpad/audit/screens/` · relevés bruts : `…/audit/a11y-releves.json` (cibles, contrastes, champs, noms, focus, Échap, toasts) et `…/audit/fluidite.json` · journaux d'exécution : `…/audit/D-logs/`.

## 1. Rôle réel de ce qui a été audité

Le client PWA vanilla : `index.html` (6 écrans `#screen-*`, ~25 modales via `openModal`, 3 pages plein écran `position:fixed` — détail de publication, fiche d'activité, conversation — plus le lecteur de bobines), `styles.css` (CRLF, 12 165 lignes), les 9 `app-0X` et les modules UI. Les chemins d'écriture mesurés sont ceux de l'app (SDK supabase-js 2.116 **réel** devant un faux serveur `page.route`), pas des stubs de fonctions.

## 2. Matrice de couverture (écran → actions → états)

Statuts : **V** vérifié · **C** corrigé et retesté · **P** partiellement vérifié · **NV** non vérifié · **B** bloqué (environnement).

| Fonctionnalité | Écran / fichier | Scénario → attendu | Observé | Preuve | Statut |
|---|---|---|---|---|---|
| Fil — rendu, 20 cartes, bouton « Charger plus » | `#screen-feed`, app-02 `renderFeed` | 200 posts stubbés : rendu + défilement sans tâche longue | 20 cartes en 5 ms, 80 après 3 « Charger plus », 0 longtask, frames P95 17 ms | `fluidite.json` · `audit-2026-11-fluidite.spec.js` ① | V |
| Fil — chargement serveur 500 | app-08 `supaLoadPosts`, sonde app-02 | fil local conservé, bandeau après 3 échecs | 20 cartes restent, bandeau « Serveur indisponible » | `etats-degrades` « fil · 500 » | V |
| Fil — deux lectures de tête qui se croisent | app-08 `supaLoadPosts` + 5 appelants sans génération | la lecture la plus RÉCENTE gagne | **AVANT** : « ANCIENNE page » écrasait la nouvelle (D-06) ; **APRÈS** : `p_neuf` conservé | `etats-degrades` « DÉSORDRE » rouge→vert | **C** |
| Like — 500 / coupure réseau / double clic | app-03 `likePost`, `supaSetPostLike` | optimiste annulé, toast, état local propre, 1 écriture | annulé en < 1 s, toast « n'a pas pu être enregistré », `likedPosts` vide, 1 POST | `etats-degrades` like ×3 | V |
| RSVP — 500 / double clic | app-07 `setEventRsvp`, app-08 `supaSetEventRsvp` | annulation + « non enregistrée » ; écran = serveur | annulé, toast, `joinedEvents` vide ; double tap = PATCH→INSERT, état « going » cohérent | `etats-degrades` RSVP ×2 | V |
| Commentaire — 500 / double clic | app-04 `submitComment`, file `_cmtOb*` | « Non envoyé · Réessayer », 1 commentaire, 1–2 envois (rejeu 15 s) | conforme ; double clic = 1 commentaire, 1 POST | `etats-degrades` commentaire ×2 | V |
| Message — 500 / latence 8 s / double clic | app-04 `sendMessageFp`, `_sendTextToSupa` | échec visible + « réessayer », file sous MON compte ; 🕓 pendant l'attente ; 1 écriture | conforme (file `owner` = uuid du banc) | `etats-degrades` message ×3 | V |
| Publication — 500 / double clic | app-06 `publishPost`, app-08 `supaPublishPostWithRetry` | post local « renvoi automatique », toast, verrou libéré, 1 POST | conforme : `syncStatus` offline/syncing, toast « Post en local », `_publishInProgress=false` | `etats-degrades` publication ×2 | V |
| Suivre — 500 / double clic | app-04 `toggleFollowUser` | annulé + « Impossible de suivre » ; 2e tap ignoré en vol | conforme, 1 POST | `etats-degrades` suivre ×2 | V |
| Lien profond `#post-<id>` | app-06 `_ouvrirLienPartage` | page détail ouverte, hash nettoyé ; id inconnu → « introuvable », écran actif | conforme ; sans session SDK la landing BLOQUE le routeur (règle ⑤ du routeur, limite de banc) | `navigation` ① ① bis | V |
| `goTo('wallet'/'shop'/'cdv')`, hash `#wallet` au boot | app-02 `goTo` | toujours un écran actif | profiles / profiles / feed, 1 seul `.screen.active` | `navigation` ② | V |
| Retour arrière (écran, modale, conversation) | app-02 `popstate`, `releaseOverlayHistory` | une entrée par overlay, pas de double recul | conforme | `navigation` ③ | V |
| Rafraîchir en pleine conversation | boot, IDB `hydrateConvsFromIDB` | conversation conservée, écran utilisable | conversation conservée ; landing affichée **parce que le banc n'a pas de session SDK** (limite) | `navigation` ④ | P |
| Changement de compte | app-02 `doLogout` → `purgeAccountScopedData` | rien du compte A ne réapparaît | **AVANT** : messages privés de A réécrits dans localStorage + IndexedDB + mémoire après rechargement (D-01) ; **APRÈS** : purgés | `navigation` ⑤ rouge→vert | **C** |
| Deux onglets, même contexte | app-02 `saveState` | cohérence | pas de canal entre onglets : le dernier `saveState` ÉCRASE (D-07, consigné) | `navigation` ⑥ | V (défaut consigné) |
| Écrans × modales — Échap | app-08 `keydown` | Échap ferme la modale | 25/25 modales fermées ; fiche d'activité fermée (ui-v4b) ; **conversation plein écran et panneau Paramètres NON fermés par Échap** (D-11) ; page Filtre IRL non fermée | `a11y-releves.json` `echap` | V |
| Piège de focus des modales | `#modalContent[role=dialog]` | Tab reste dans la modale, fond inerte, focus rendu | **Tab SORT de la modale** vers la conversation cachée (`.conv-fp-back`), fond sans `inert`/`aria-hidden`, focus rendu à `body`, dialogue sans `aria-labelledby` (D-08) | `trap` dans `a11y-releves.json` | V (défaut) |
| Focus visible au clavier | styles.css `:focus-visible` 3 px | anneau sur les 12 premiers Tab | 11/12 avec outline ; **les 3 premiers Tab vont dans la conversation plein écran MASQUÉE** (translateX hors champ, sans `visibility:hidden`) (D-09) | `focusTrace` | V (défaut) |
| Toasts | `#toastStack[aria-live=polite]` | région live | conforme (`polite`, 3 s, 13 px) | `toasts` | V |
| Cibles tactiles < 44 px | tous écrans | 44 px (`elementFromPoint`) | 120 cibles distinctes < 44 (après correction des 8 catégories traitées : voir D-02 et §3) | `a11y-releves.json` `cibles` | **C partiel** |
| Champs < 16 px (zoom iOS) | « Modifier le profil » | ≥ 16 px | 7 `input.rs-link-input` à 12 px (D-03) → 16 px | `correctifs` D-03 rouge→vert | **C** |
| Boutons-icônes sans nom | bouton Envoyer, pastille 📷, 9 `span.modal-close` | nom accessible | nommés (D-04) | `correctifs` D-04 rouge→vert | **C** |
| Images sans `alt` | 37 surfaces | 0 | 0 | relevés | V |
| Contraste AA (CDP `CSS.getBackgroundColors` + pixels) | 37 surfaces | ≥ 4,5:1 | voir D-10 (rouge `#ef4444` 3,76:1 ; dégradé v2 iris 2,84:1 au bord clair ; `--muted` sur lavande 4,39:1) | `contrastes.echecs` + sonde pixel | V (défauts) |
| Ordre des titres | 37 surfaces | hiérarchie | 29 surfaces sans `h1–h6` (modales et fil : `.modal-title` en `div`) ; Rencontrer/Messages ont un `h1`, Rechercher saute à `h3` (D-12) | `titres` | V (défaut P3) |
| XSS stockées (payloads d'autrui) | fil, détail, discussion, réactions, repartage, profil visité, bio, liens RS, mentions, messagerie (texte/GIF/média/fichier/position/vocal/citation/réactions), groupe, Rencontrer, commentaires/réactions d'activité, notifications, bobines, Rechercher | `window.__xss` indéfini, aucun `alert`, aucun `javascript:` en `href/src/poster`, aucune `url(javascript:)` en `style`, aucun `<script>` | **1 défaut** : `groupPhoto` d'un groupe dans la liste Messages dans `url(` sans `_cssUrl` (D-05) ; tout le reste tient | `audit-2026-11-xss.spec.js` ①–⑤ (③ rouge→vert) | **C** |
| Mémoire (30 allers-retours + 20 conversations, GC forcé) | app | pas de croissance monotone | 11,3 → 16,6 Mo au 1er palier puis **plateau** (16,5–16,8 Mo) : pas de fuite | `fluidite.json` `memoire` | V |
| Minuteurs / canaux vivants | app | peu | 2 `setInterval` (jeton SDK 30 s, `majSilenci…` 60 s) ; 0 canal realtime (visiteur) | `fluidite.json` `minuteurs` | V |
| Gates statiques | scripts | tous verts | handlers 0 fantôme · globals 0 collision · échappement 60/60 au socle · CSS sain · `npm run verif` vert (2×) | `D-logs/verif*.log` | V |
| Tests existants a11y | `accessibilite-cibles` (7), `clavier-cliquables` (8) | verts | 15/15 verts | `D-logs/existing-a11y.log` | V |

Non couvert par ce banc : hors-ligne au BOOT (le service worker n'est pas exercé), permission refusée (géolocalisation, caméra, micro : non simulées), données volumineuses au-delà de 200 posts, WebKit (Chromium seul ici).

## 3. Registre des anomalies (D-NN)

### D-01 — P1 · Les conversations du compte sortant survivent à la déconnexion (messages privés lisibles par le compte suivant) — **corrigé**
- **Reproduction** : état onboardé, une conversation avec « Message privé de A », `doLogout("signin")`, attendre le rechargement : `localStorage.passio_conversations_v1`, IndexedDB `conversations_v1` et `getConversations()` portent encore le message (sonde `D-logs`, `navigation` ⑤ rouge sur HEAD).
- **Cause** : `doLogout` purge les deux stores puis `location.reload()` 1,2 s plus tard → `beforeunload` → `saveConversationsNow` (branché par `supaInit`, app-08) réécrit `conversationsState`, encore en mémoire. `saveState` consulte `_accountPurged` depuis le 2026-08-12 ; `saveConversations`/`saveConversationsNow` ne le faisaient pas — la fiche de `sortirCompteSansSession` (app-08) l'écrivait déjà sans que personne ne le ferme. Trace : écritures après purge = `passio_conversations_v1 ← saveConversationsNow ← doLogout`.
- **Correctif** : `js/app-04-comments-shop.js` — `_conversationsPurgees()` lit le verrou `_accountPurged` (app-02, portée script partagée) ; `saveConversations` et `saveConversationsNow` sortent quand il est levé.
- **Test** : `tests/e2e/audit-2026-11-navigation.spec.js` ⑤ — rouge sur HEAD (prouvé en restaurant HEAD), vert après. Voisins verts : `audit-identite-emoji`, `conv-ouverture-fil`, `conv-suppression`, `file-messages-par-compte`, `exploration-anonyme-vs-compte`, `connexion-compte-existant` (57/58 ; le rouge restant, `état d'un AUTRE compte`, repasse vert seul : instabilité de prémisse réseau du banc, pas liée).
- Impact P1 (pas P0) : il faut un appareil partagé ET une déconnexion volontaire ; la fuite est locale à l'appareil.

### D-05 — P2 (sécurité, surface étroite) · `groupPhoto` injectée dans `background:url(` sans désinfectant — **corrigé**
- **Reproduction** : conversation de groupe avec `groupPhoto: "javascript:window.__xss=2"` → liste Messages : `DIV.msg-avatar style="background:url(javascript:…)"` (`xss` ③ rouge sur HEAD). Aucune exécution dans Chromium moderne (les `url(javascript:)` CSS ne s'exécutent plus), mais le contexte est faux et le socle de `audit-echappement` créditait cette ligne de `safeUrlAttr` à tort (« url() par safeUrlAttr » — c'était `passioThumb`, qui ne désinfecte pas).
- **Exposition réelle** : aujourd'hui `groupPhoto` n'est écrit que par l'appareil de son créateur (data URL, app-05) ; une colonne serveur ou une fusion multi-appareils en ferait une donnée d'autrui. Corrigé par principe (« le contexte décide »).
- **Correctif** : `js/app-04-comments-shop.js` l.4305 → `_cssUrl(passioThumb(...))`, comme l'en-tête (l.4394) et app-05 l.1911 le font déjà.
- **Test** : `audit-2026-11-xss.spec.js` ③ (rouge→vert) + `audit-2026-11-correctifs.spec.js` D-05 (source). Gate `audit-echappement --ci` toujours vert. ⚠️ Proposition hors périmètre : réécrire la raison de la clé `js/app-04-comments-shop.js | style | avatarStyle` dans `scripts/echappement-socle.json` (« url() par _cssUrl »).

### D-06 — P2 · Deux lectures de la tête du fil qui se croisent : la plus ANCIENNE gagnait — **corrigé**
- **Reproduction** : faux serveur qui répond à la 1ʳᵉ requête `GET posts` APRÈS la 2ᵉ ; deux tirer-pour-rafraîchir à 60 ms (chemin exact d'app-02 `touchend`) → `state.supabasePosts = ["p_vieux"]`, « p_neuf » perdu jusqu'au filet suivant (`etats-degrades` « DÉSORDRE » rouge sur HEAD).
- **Cause** : cinq appelants relisent la première page sans génération (tirer-pour-rafraîchir app-02 ; retour `online` app-09 ; `chargerContenuPublic` first-run ; rechargement après publication app-06 ; démarrage app-08) et remplacent `supabasePosts` à la réponse. Seul le filet de 60 s se protège (`generation`).
- **Correctif** : `js/app-08-ui-modals-tour.js` — compteur `_feedTeteSeq` / `_feedTeteDerniereServie` dans `supaLoadPosts` : une lecture de tête (offset 0, sans curseur ni auteur) dépassée par une plus récente rend `[]`, valeur que tous les appelants traitent déjà comme « rien à remplacer ». Pages suivantes et profils non concernés.
- **Test** : `etats-degrades` « DÉSORDRE » rouge→vert. Voisins verts (168 cas) : `capacite-fil-cache`, `fil-reel-dabord`, `feed-realtime-course`, `reprise-lectures-boot`, `suppression-durable`, `feed-premier-rendu`, `fil-chronologique`, `feed-window`, `first-run`, `rechargement-imminent`, `capacite-fil-compteurs`, `feed-malformed-post`.

### D-02 — P2 · Cibles tactiles < 44 px (120 distinctes relevées ; 8 catégories corrigées) — **corrigé partiellement**
- **Mesure** (`elementFromPoint`, 37 surfaces) : « ⋯ » Paramètres 34×34 (8 écrans) ; « ← » conversation 36×36, actions d'en-tête 34×34, Envoyer 40×40 ; outil 😊 du composeur 38×38 ; « × » bobines 38×38 ; 🔇 des bobines 42×26 ; pastille 📷 d'une passion 20×20 ; avatars de commentaires 30×30 ; `.comment-action` 27–37 px de LARGE (hauteur ok) ; boutons `.btn` 40 px de haut (toutes modales : « Sauvegarder », « Annuler », « OK »… 61 occurrences) ; pilules du Studio 40 px ; « Suivre » de Rechercher 56×28 ; choix de « Temps d'écran » 28 px ; onglets du profil 27–30 px tapables (visuel 46) ; `.cmt-sort` 33 px ; `.ev-react-chip` 24 px ; stats du profil 36 px ; liens « Voir sur Google Maps » 16 px.
- **Correctif appliqué** (`styles.css`, bloc ajouté en fin de feuille, CRLF, 61 LF nus préexistants inchangés) : `::after` transparent de 44 px sur `.hamburger`, `.conv-fp-back`, `.conv-action-btn`, `.conv-send-btn`, `.cmt-tool-btn`, `.reels-close`, `.reel-sound-btn`, `.passion-photo-badge` ; taille visible inchangée, aucun décalage (mesuré). `.passion-photo-badge` reste `absolute` (leçon `.modal-close`).
- **Test** : `audit-2026-11-correctifs.spec.js` D-02 ①–④ rouge sur HEAD → vert. `accessibilite-cibles` (7), `cadrage` (5), `ios-zones-sures` (15), `mes-passions-page` (31), `profil-entete-passions` (11), `ui-v8-passions`, `carte-passion-photo`, `ui-v6b-profil` verts.
- **Reste à faire (proposition)** : `.btn` à `min-height: 44px` (toutes modales ; attention aux 128 occurrences et aux rangées à deux boutons), `.comment-action` en largeur (`min-width: 44px` comme `.post-action`), `.avatar.sm` des commentaires (zone `::after`), `.ev-react-chip`, `.cmt-sort`, « Temps d'écran ». Ce sont des changements de mise en page à valider visuellement : non appliqués ici.

### D-03 — P2 · 7 champs à 12 px dans « Modifier le profil » (zoom iOS à la saisie) — **corrigé**
- `js/app-06-reels-partage.js` `.rs-link-input` `font-size:12px` → `16px`. Test `correctifs` D-03 rouge→vert ; `biographie-multiligne`, `avatar-public-stable`, `profil-confidentialite-interface` verts. Aucun autre champ < 16 px sur les 37 surfaces.

### D-04 — P2 · Boutons-icônes sans nom accessible — **corrigé**
- Bouton d'envoi d'un message (`#convFpSendBtn`, `title` seul) → `aria-label="Envoyer le message"` (`index.html`, structure `html.parser` inchangée : 195 erreurs avant/après, 6/6 section, 3/1 main, 366/367 div, 128/128 button). Pastille 📷 d'une passion → `role="button" tabindex="0" aria-label` (app-06, 2 gabarits). Les 9 `span.modal-close` dupliqués (app-04 ×3, app-05 ×2, app-06 ×1, app-07 ×4 ; ils doublent le `×` injecté par `openModal`) → `aria-label="Fermer"`. Test `correctifs` D-04 rouge→vert.

### D-07 — P2 · Deux onglets : le dernier qui sauvegarde écrase l'autre — **consigné, non corrigé**
- Mesuré : like dans l'onglet 1 → `localStorage` ok ; l'onglet 2 (en mémoire) ne le voit pas (aucun écouteur `storage` sauf l'invitation, app-06) ; son prochain `saveState()` réécrit SON état complet → le like disparaît (`navigation` ⑥, annotation « ÉCRASEMENT »). Même chose pour `conversationsState`. Hors périmètre d'un patch ciblé : il faut un canal entre onglets (écouter `storage` sur `STATE_KEY` et fusionner, ou `BroadcastChannel`) — proposition pour le lot « multi-appareils » (agent sync).

### D-08 — P2 (a11y) · Les modales n'ont pas de piège de focus ni de fond inerte, et ne rendent pas le focus — **consigné**
- Mesuré sur « Se déconnecter » (3 commandes) : 4 Tab → `.conv-fp-back`, `.conv-fp-head-avatar`… c'est-à-dire la conversation plein écran **masquée** derrière ; `#appMain` sans `inert`/`aria-hidden` ; à la fermeture le focus retombe sur `body` ; `#modalContent[role=dialog]` sans `aria-labelledby` (le `.modal-title` est un `div`). Proposition (app-08 `openModal`/`closeModal`) : mémoriser `document.activeElement`, poser `inert` sur `#appMain`/`.app-nav`, piéger Tab/Shift+Tab dans `#modalContent`, rendre le focus à la fermeture, `aria-labelledby` vers le premier `.modal-title`. Non appliqué : touche toutes les modales, à valider avec les suites `clavier-cliquables` ⑤ (ASTRA-13) qui dépendent du comportement du fond.

### D-09 — P2 (a11y) · La conversation plein écran fermée reste tabulable — **consigné**
- `#conv-fullpage` est masquée par `transform: translateX(100%)` seulement : les 3 premiers Tab depuis le fil vont dans ses outils (GIF, micro, Envoyer) hors champ. Proposition (`styles.css`) : `#conv-fullpage:not(.active) { visibility: hidden; }` avec transition `visibility 0s 280ms` — à valider contre `conv-ouverture-fil.spec.js` (4) qui mesure l'ordre « contenu avant révélation ». Non appliqué.

### D-10 — P2 (a11y) · Contrastes AA — **consigné, non corrigé** (choix de charte)
Mesures CDP (`CSS.getBackgroundColors`) confirmées au pixel sur les captures :
- Rouge `#ef4444` sur blanc et blanc sur `#ef4444` : **3,76:1** (« Se déconnecter », « Supprimer mon compte » et son titre, bouton « Supprimer définitivement ») ; le jeton `--danger: #dc2626` (4,83:1) existe et n'a **aucun consommateur** (18 `#ef4444` en dur dans styles.css, 22 dans les app-0X). Proposition : `#ef4444` → `var(--danger)` sur le texte et les fonds de ces commandes.
- `--grad-hero` v2 (`#a784ff` → `#6d32f4`) : le bord clair est à **2,84:1** sous du texte blanc ; mesuré au pixel sous la ligne de texte de « Créer un post » : 3,35:1 à gauche, 5,66:1 à droite (bulles « à moi » de la messagerie : 2,84 au bord, 5,94 au centre). Proposition : `--v2-iris` ne devrait pas être l'arrêt de départ d'un fond porteur de texte (ex. `#8a55ff` donne 4,58:1) — décision de charte (fiche 03), non prise ici.
- `--muted #6e6987` sur le fond lavande des pages détail (`#ede9fe`) : **4,39:1** (méta des commentaires 10 px, tri « Pertinents », titres de section d'une activité, « Signaler cet événement ») ; sur blanc 5,21:1. `tag-hot` 10 px 4,67:1 (ok). `.beta-chip` 8,5 px : 6,0:1 (ok, mais 8,5 px).
- Faux positifs écartés : `span « AQ »` (blanc sur dégradé de l'avatar, 4–6:1 au pixel), avatars emoji (le texte est un emoji).

### D-11 — P3 · Échap ne ferme ni la conversation plein écran, ni le panneau Paramètres, ni la page Filtre de Rencontrer — **consigné**
`closeCurrentOverlay` (retour arrière) sait les fermer ; seul `keydown Escape` d'app-08 ne vise que `#modalBackdrop`. Proposition : brancher Échap sur `closeCurrentOverlay()` quand aucune modale n'est ouverte (après le garde ASTRA-13 des champs).

### D-12 — P3 · Hiérarchie des titres absente sur 29 surfaces (`.modal-title` est un `div`), Rechercher commence à `h3` — **consigné**
Proposition : `.modal-title` en `h2` (+ `aria-labelledby`, cf. D-08) ; `h2` « Explorer par passion ».

### D-13 — P3 · Règle « UI-4A5 reste le DERNIER bloc de styles.css » non tenue depuis le 2026-10-23 — **constat**
Le bloc « Changer de lieu » (2026-10-23) suit déjà UI-4A5 ; mon bloc est après lui. Aucune gate ne vérifie l'ordre (`audit-css-structure` ne juge que l'équilibre). À trancher par le mainteneur de la fiche 20.

### Observations sans anomalie (vérifiées)
- Optimisme/annulation : like, RSVP, suivi, message, commentaire, publication **tous** annulent ou signalent un échec réel, lisent `{error}`, et gardent une file sous le compte propriétaire. Aucune double soumission sur 6 gestes (verrous `_likePending` 800 ms, `_ecritureSuiviEnCours`, `_publishInProgress`, `_msgEnVol`, bouton « Publier » désactivé sur champ vide).
- Isolation d'identité à la déconnexion : `state`, `passio_uid`, files `outbox`/`cmt_outbox` purgés (hors D-01).
- XSS : `escapeHtml`/`escapeJsArg`/`safeUrlAttr`/`_cssUrl` tiennent sur toutes les surfaces attaquées (6 payloads × ~40 champs d'autrui, 20 surfaces rendues, mentions/hashtags/liens cliqués, réacteurs, paramètres de groupe). `applyMsgContentData` borne le persona (`_reactionKeySure`, couleur hex). Le serveur refuse un emoji de passion non emoji (`creer_passion`).
- Débordement horizontal : aucun (37 surfaces, `scrollWidth = clientWidth = 390`) ; les seuls éléments hors cadre sont dans les rails `overflow-x:auto` (stories, bulles), par conception.
- Images sans `alt` : 0.

## 4. Résultats techniques et mesures

**Gates** : `node scripts/audit-handlers.js` ✅ (683 handlers, 0 fantôme) · `audit-globals` ✅ (2036 uniques) · `audit-echappement --ci` ✅ (60/60 au socle) · `audit-css-structure` ✅ (12 202 lignes CRLF après ajout) · `npm run verif` ✅ (2 passages, `D-logs/verif.log`, `verif2.log`) · `audit-tests-isolation --ci` ✅ et `audit-tests-creux --ci` ✅ avec les 6 nouveaux specs.

**Tests exécutés** (projet `local`, workers 1, port 8104) :
- Nouveaux : `audit-2026-11-a11y` 1/1 · `audit-2026-11-etats-degrades` 16/16 · `audit-2026-11-navigation` 7/7 · `audit-2026-11-xss` 5/5 · `audit-2026-11-fluidite` 2/2 · `audit-2026-11-correctifs` 7/7 — **38/38 verts** ; et **9 rouges prouvés sur HEAD** (`correctifs` ×7, `navigation` ⑤, `xss` ③) en restaurant les fichiers d'origine (`D-01`, `D-02`, `D-03`, `D-04`, `D-05`) + `etats-degrades` « DÉSORDRE » rouge avant le patch D-06.
- Existants : `accessibilite-cibles` 7/7, `clavier-cliquables` 8/8 ; voisins des fichiers modifiés : 57/58 (conversations/identité), 168/168 (fil), 68/68 (profil/markup), 28/28 (messages/avatars), `cadrage` 5, `ios-zones-sures` 15, `mes-passions-page` 31, `profil-entete-passions` 11. **`profil-visite-options` 5 rouges : préexistant et documenté** (`docs/journal/social-messagerie.md` : « ROUGE en local … à l'identique sur origin/main pur ») — la modale attend 4 lectures `profiles` qui échouent en `ERR_TUNNEL` (~17 s) ; reproduit sur HEAD restauré.

**Fluidité (stub local, CPU ×4, latence 400 ms, 1,6 Mb/s — PAS la production)** :
- Démarrage dev (45 scripts séparés, 4,1 Mo de JS non minifié) : FCP 12,9 s, DOMContentLoaded 22,7 s, `load` 24,3 s, 1–3 tâches longues (max 90 ms). Ordre de grandeur de l'artefact prod : `dist/app.js` 3,0 Mo → terser 1,48 Mo → gzip **422 Ko**, + supabase-js 55 Ko gz, + `styles.css` 112 Ko gz, + `index.html` 329 Ko gz (1,1 Mo brut : first-run + legal inlinés) ≈ **0,9 Mo compressés avant tout rendu** — c'est le poste à surveiller (hors périmètre de correction D).
- Ouverture d'écran (médiane de 3, `goTo` → 2 frames) : profil 67 ms · studio 37 · rechercher 94 · rencontrer 163 · messages 70 · fil 83 (premier passage jusqu'à 293 ms sur Rencontrer).
- 200 publications : rendu initial 20 cartes en 5 ms ; défilement + 3 « Charger plus » → 80 cartes, **0 tâche longue**, frames P50/P95 17/17 ms, 0 frame > 50 ms.
- Mémoire (GC forcé) : 11,3 Mo → 16,6 (1er tour d'écrans) → 16,6 → 16,8 → 16,6 → 16,6 Mo : plateau, **pas de fuite**.
- Minuteurs vivants : 2 `setInterval` (SDK auth 30 s ; `majSilenci…` 60 s) ; 0 canal realtime pour un visiteur ; le filet du fil est un `setTimeout` récursif (non compté ici).

## 5. Fichiers modifiés (périmètre D) et tests ajoutés

- `js/app-04-comments-shop.js` : verrou `_accountPurged` dans `saveConversations`/`saveConversationsNow` (D-01) ; `_cssUrl` sur `groupPhoto` (D-05) ; `aria-label="Fermer"` ×3 (D-04).
- `js/app-08-ui-modals-tour.js` : séquence de lecture de tête dans `supaLoadPosts` (D-06).
- `js/app-06-reels-partage.js` : pastille 📷 nommée/tabulable ×2, `.rs-link-input` 16 px, `aria-label` ×1 (D-03, D-04).
- `js/app-05-config-profil.js` ×2, `js/app-07-ia-explore-irl.js` ×4 : `aria-label="Fermer"` (D-04).
- `index.html` : `aria-label` sur `#convFpSendBtn` (structure identique).
- `styles.css` : bloc « AUDIT D — cibles tactiles » ajouté en fin, en binaire CRLF (D-02).
- Tests : `tests/e2e/audit-2026-11-a11y.spec.js` (captures + relevés), `audit-2026-11-etats-degrades.spec.js` (16), `audit-2026-11-navigation.spec.js` (7), `audit-2026-11-xss.spec.js` (5), `audit-2026-11-fluidite.spec.js` (2), `audit-2026-11-correctifs.spec.js` (7).
- Non touché (hors périmètre, diff d'un autre agent constaté dans l'arbre) : `js/telemetry.js`, `scripts/veille-production.mjs`, `tests/unit/*`, `supabase/functions/*`, `migrations/*`.
- Aucun commit, aucun push.

## 6. Non vérifié / bloqué — prochaine action

- **Production injoignable** : rien n'a été mesuré contre Supabase/Netlify (403 du proxy) ; les temps de démarrage prod (payload ≈ 0,9 Mo gz) restent à mesurer avec `?equipe=1` depuis un vrai téléphone (Lighthouse mobile).
- **WebKit** non exercé (Chromium seul) : rejouer `audit-2026-11-correctifs` et `-a11y` avec `PASSIO_WEBKIT=1` en CI (les `::after` de 44 px s'y comportent comme DEV-01, mais à prouver).
- **Hors-ligne au boot / service worker, permissions refusées (géoloc, caméra, micro)** : non simulés ; prochain pas = `page.context().setOffline(true)` après un premier chargement + `context.grantPermissions([])` avec stub `navigator.mediaDevices`.
- **D-07 (deux onglets), D-08/D-09 (focus), D-10 (contrastes), D-11 (Échap), D-12 (titres)** : consignés avec proposition, non appliqués — chacun demande un arbitrage de charte ou touche toutes les modales ; à planifier comme lots UI avec leur verrou.
- **`profil-visite-options`** rouge en local : limite d'environnement documentée (réseau), verte en CI.
- La CI (`deploy.yml`) exécutera les 6 nouveaux specs dans le projet `local` : ils n'écrivent rien en base (stub) et passent les gates `isolation`/`creux`.
