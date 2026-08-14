# PASSIO — Guide pour Claude Code

## ⛔ RÈGLE ABSOLUE — ZÉRO DEMANDE D'AUTORISATION

Benjamin travaille en autonomie totale (`bypassPermissions` posé aux 3 niveaux : global, projet, local — la config n'est JAMAIS la cause d'un blocage). **Ne jamais lui demander d'autorisation, de confirmation ni d'arbitrage, pour quoi que ce soit.** Concrètement, INTERDIT :

- « veux-tu que je… ? », « je continue ? », « je pousse en prod ? », « tu préfères A ou B ? »
- l'outil `AskUserQuestion`, un plan mis en attente de validation, une liste d'options laissée ouverte
- s'arrêter en milieu de tâche pour faire valider une étape

À la place : choisir la meilleure option, l'appliquer, aller au bout (coder → tester → committer → pousser), puis rapporter le résultat fait. Un ordre = une exécution complète, sans interruption. Rappelé fermement le 2026-07-21 et le 2026-07-22.

---

Réseau social des passions. PWA vanilla JS (pas de framework, pas de bundler) + Supabase. Beta privée protégée par code d'accès.

## Architecture

- `index.html` : markup complet de l'app (landing, onboarding, 8 écrans, modals). En dev les 15 fichiers JS sont chargés séparément ; en prod `scripts/build.js` ré-assemble un monolithe dans `dist/`.
- `js/app-01` à `app-09` : logique applicative (ordre de chargement = dépendances par hoisting, NE PAS réordonner). 01=diag/seed, 02=state/utils/goTo, 03=posts/carnets, 04=commentaires/conversations rendering, 05=config/profils/reels, 06=profil principal/studio/partage, 07=IA/explore/IRL, 08=modals/tour/boot()/Supabase client, 09=PWA/emoji/pièces jointes/wrappers messagerie.
- `js/access-gate.js` : verrouillage par code (2125) — chargé en PREMIER dans <head>. Voir `docs/SECURITE_CODE_ACCES.md` pour changer le code.
- `styles.css` : 6300 lignes, thème violet (#7c3aed), variables CSS (--bg-card, --border, --muted, --accent…).
- Backend : Supabase (URL/clé anon dans app-08). Tables : profiles, posts, post_likes, post_comments, stories, events, event_attendees, conversations, conv_members, conv_messages, notifications, follows, client_errors. RLS par propriétaire (`auth.uid()::text`). Migrations dans `migrations/`.
- État local : `localStorage["passio_mvp_state_v1"]` (constante `STATE_KEY` dans app-02 — PAS `passio_state`). Contient profils, posts perso, notifs… `MY_UID` = id Supabase auth ; jeton du gate = `sessionStorage["passio_gate_v1"]`. **Les conversations** (le gros volume, vocaux base64 inclus) sont dans `localStorage["passio_conversations_v1"]` ET, depuis le 2026-06-15, dans **IndexedDB** (store durable sans limite ~5 Mo, `js/idb-store.js` : `idbConvLoad`/`idbConvSave`) : write-through à chaque `saveConversations`, hydratation+fusion sans perte au boot via `hydrateConvsFromIDB()` (tête de `boot()`). localStorage reste un cache sync toléré à échouer sur quota.

## Commandes

- Serveur local : `npm run serve` → http://localhost:8080 (code d'accès : 2125 ; http-server, plus besoin de Python)
- Tests : `npx playwright install chromium` puis `npm test` (smoke + access-gate ; le helper `tests/e2e/gate-helper.js` déverrouille le gate pour les tests)
- Build prod : `node scripts/build.js dist/index.html`
- Déploiement : `git push origin main` → GitHub Actions teste, build, minifie, déploie sur Netlify (https://passio-app.netlify.app)

## Conventions

- Vanilla JS, pas de modules ES (scripts classiques, fonctions globales).
- `$()` = querySelector (défini app-02), `$$()` = querySelectorAll. Toujours garder les guards `if (!el) return;`.
- HTML généré par template literals + `escapeHtml()` pour tout contenu utilisateur (XSS). **3 helpers d'échappement (app-02), choisir selon le CONTEXTE** : `escapeHtml(x)` = texte HTML ; `escapeJsArg(x)` = argument de chaîne JS simple-quotée DANS un attribut onclick (le HTML décode `&#39;` AVANT le parse JS → un pseudo avec apostrophe cassait le bouton avec escapeHtml seul) ; `safeUrlAttr(x)` = attribut src/href d'une URL fournie par un autre utilisateur (bloque `javascript:` & sortie d'attribut ; n'accepte que http(s)/data:image|audio|video/blob). ⚠️ Les payloads de `comment_interactions`/`event_reactions`/messages média sont librement insérables par tout compte authentifié → TOUJOURS échapper à l'affichage (XSS stockés corrigés le 2026-07-02).
- **Timestamps Supabase : TOUJOURS `supaTs(s)` (app-02), JAMAIS `new Date(x + "Z")`.** La prod mélange des colonnes `timestamp` (sans fuseau : posts, conv_messages, notifications, stories, events, profiles) et `timestamptz` (avec offset `+00:00` : comment_interactions, event_comments/reactions/attendees, tout cdv_*, blocks, reports…) — l'ancien pattern `+ "Z"` donnait NaN (« Invalid Date ») sur les timestamptz. `supaTs` gère les deux + le format realtime.
- Navigation : `goTo('feed'|'profiles'|'studio'|'explore'|'irl'|'wallet'|'messages'|'cdv')` — écrans = `#screen-<nom>`.
- Toasts via `toast()`, jamais `alert()`.
- Les onclick inline doivent référencer des fonctions globales EXISTANTES (l'audit du 2026-06-10 a trouvé 7 fonctions fantômes — vérifier avant d'ajouter un handler).


## ⚡ Invariants critiques (référence rapide — détail dans docs/PIEGES_CONNUS.md)

Ces règles transverses valent pour TOUTE modification. Le subagent `audit-passio` les vérifie.

- **Recherche de post** : toujours `findPostAnywhere(id)` (seed + userPosts + supabasePosts). Jamais `seed.posts.find || userPosts.find` (oublie les vrais posts réseau).
- **Timestamps** : toujours `supaTs(s)`, jamais `new Date(x+"Z")` (prod mélange timestamp/timestamptz).
- **Échappement (3 helpers selon le CONTEXTE)** : `escapeHtml` (texte HTML), `escapeJsArg` (arg JS dans onclick), `safeUrlAttr` (URL d’un autre utilisateur). Tout payload `comment_interactions`/`event_reactions`/média = échapper à l’affichage.
- **Collisions de globals** : 17 scripts partagent `window` ; une `function X` top-level redéclarée est écrasée en silence. `npm run audit:globals` (CI) est le filet. ⚠️ Ne pas nommer un Set d’état comme une fonction (`window._splStatusSel=new Set()` écrase la fonction).
- **Catch large** : un `catch(e){return [];}` masque les ReferenceError (bug diagLog = fil vide 6 j). Ne pas envelopper un chemin critique sans log.
- **onclick inline** : doit référencer une fonction globale EXISTANTE (`npm run audit:handlers`).
- **Supabase** : jamais de requête dans `onAuthStateChange` (deadlock → `setTimeout(...,0)`) ; jamais le global `supabase` (SDK) au top-level d’un app-*.js (chargement paresseux → `supa`/`ensureSupabase()`) ; un UPDATE/DELETE qui touche 0 ligne = RLS manquante ; jamais de base64 en DB (→ Storage) ; embed `profiles(...)` = 400 sans FK réelle.
- **Écritures qui échouent en silence** : le SDK ne LÈVE PAS sur un refus RLS → **toujours lire `{ error }`** (sinon l’action reste « réussie » à l’écran et disparaît au rechargement). Une écriture d’état (like, RSVP, follow…) envoie l’**INTENTION locale** ; ne jamais la re-déduire d’une lecture préalable (elle inverse l’action dès que local et base divergent — et le hook fetch prend alors cette LECTURE pour la confirmation d’écriture). Échec réel = annuler l’affichage optimiste.
- **Guards de rendu** : écrire dans `#feedList`/`#storiesRowFeed`/`#profileStrip` sans invalider `_feedDomSig`/`_lastHtml` fait sauter le prochain render.
- **Build** : exactement 9 fichiers app-*.js entre les marqueurs BUILD:APP. Prod = app.js + styles.css externalisés (hash de contenu).
- **openModal n’empile pas** : ouvrir une modale depuis une autre la REMPLACE (mémoriser d’où l’on vient) ; `openModal` injecte déjà un `×`.

## Hook d'indexation (`.claude/settings.json`)

Le hook `PostToolUse` (Edit|Write) exécute `.claude/stage-edited-file.js`, qui fait **uniquement** `git add <le fichier qui vient d'être modifié>`. Il remplace l'ancien `git add -A && git commit -m "auto: …" && git push origin main`, dangereux à deux titres : ① `git add -A` indexait TOUT le dépôt — quand deux sessions Claude travaillent en parallèle sur ce dossier, chacune ramassait les fichiers en cours de l'autre (le 2026-07-21, trois commits ont mélangé des travaux CDV et IRL distincts) ; ② le `push origin main` **déployait en production à chaque frappe**, seul le garde `commit-msg` (qui refuse les messages « auto: ») l'empêchant — une protection fragile et non intentionnelle. Le script ignore silencieusement tout fichier hors dépôt (scratchpad) et tout payload illisible. **Committer et pousser restent des gestes explicites.**

⚠️ **Une session démarrée AVANT ce correctif tourne encore avec l'ancienne configuration** (les réglages sont lus au démarrage) : elle continuera à faire `git add -A` jusqu'à sa relance. Le filet de dernier recours reste `.git/hooks/commit-msg` (**local, non versionné**), qui refuse tout message de commit commençant par « auto: » — il ne testait que la chaîne exacte « auto: mise à jour app », il couvre désormais toutes les variantes. Conséquence pratique tant qu'une vieille session tourne : **committer son propre travail au fil de l'eau** plutôt que de laisser des fichiers modifiés en attente, sinon ils partent dans le commit de l'autre session.

## Centre de pilotage (télémétrie + dashboard `dashboard/`, 2026-08-05)

App INDÉPENDANTE de supervision/test temps réel, dans `dashboard/` (Node/Express + SPA vanilla, sans bundler, thème violet). Elle NE fait PAS partie du build/déploiement Passio (Netlify ignore ce dossier). Pipeline : `js/telemetry.js` (chargé dans `<head>` après platform.js) → table Supabase **`telemetry_events`** (migration `migration_telemetry.sql`, **appliquée en prod le 2026-08-05**, dans la publication realtime, RLS insert-own + AUCUN select) → backend dashboard (clé **service_role** dans `dashboard/.env`, RLS bypassée, lecture SEULE côté serveur) → flux SSE → dashboard. **Activation** : depuis le 2026-08-05, ACTIVE par défaut en prod (suivi continu de la beta) avec **opt-out** — `?telemetry=0` (ou `PassioTelemetry.setEnabled(false)`) désactive durablement (`localStorage.passio_telemetry="0"`), `?telemetry=1` force la capture complète, localhost toujours actif. Curseur d'échantillonnage stable par appareil `window.PASSIO_TELEMETRY_SAMPLE` (1 = tous) ; `window.PASSIO_TELEMETRY_DEFAULT_ON=false` = repli opt-in strict. Données minimisées (aucun PII). `js/telemetry.js` masque le PII (liste blanche `meta`, redaction e-mail/JWT/hex, jamais de contenu de message ni base64) — **tout nouveau champ envoyé doit passer par ce filtre**. Instrumentation automatique : navigation (wrap de `goTo`), clics (délégation), fetch (timing API endpoint sans query), erreurs. Marqueurs sémantiques ajoutés (guardés `window.tel && tel.action(...)`) dans `supaPublishPostWithRetry`, `likePost`, `submitComment`, `sendMessageToSupabase`, `toggleJoinEvent`. ⚠️ `telemetry.js` est un IIFE `"use strict"` : il n'expose que `window.PassioTelemetry`/`window.tel` (aucun global top-level → `audit:globals` reste vert). Lancer le dashboard : `cd dashboard && npm install && cp .env.example .env` (renseigner `SUPABASE_SERVICE_ROLE_KEY`) `&& npm start` → http://localhost:4610. Tests backend : `cd dashboard && npm test` (77 verts). Mutations git du dashboard : désactivées en prod, jamais de push, branche dédiée + confirmation, tout audité. Doc : `dashboard/README.md`, `dashboard/docs/SECURITE.md`, `dashboard/docs/INTEGRATION_CLAUDE_CODE.md`.

### Traçage bout-en-bout & intégrité (2026-08-12/14)

**Traçage** (`dashboard/server/traces.js`, onglet « Traçage des actions ») : suit une action du clic au **résultat métier réel** via un `correlation_id`. API client `tel.flowStart(action, meta)` → cid, `tel.step(cid, key, status)`, `tel.flowEnd(cid, status)` ; le hook fetch tague **automatiquement** l'étape réseau du flow actif (fenêtre 4 s). Chaque action a un **contrat de résultat** (`CONTRACTS`) : soit « write = confirmation » (like/comment/cint/RSVP — l'écriture REST EST le résultat), soit une confirmation **explicite** (message, publication — plusieurs requêtes en jeu, l'auto-tag serait trompeur → step `saved` émis par le code). Verdicts : succès / partiel / échec / **clic mort** / non confirmé / en cours / lent + doublons. ⚠️ La livraison cross-device est **informative** et n'altère JAMAIS le verdict (sinon tout test mono-appareil produirait de faux « partiels »). Pour instrumenter une action : la wrapper avec `flowStart`, elle apparaît seule (contrat `_default` sinon). Couverture + dette : `/api/coverage`.

**Intégrité** (`dashboard/server/reconcile.js`, onglet « Intégrité des données », capacité `db`) : 9 règles d'anti-jointure/invariants (orphelins, base64 en base, bobines sans média…) en **lecture seule**, ancrées sur le schéma RÉEL de prod. Deux filtres indispensables, sans lesquels le tableau de bord crie au loup : ① les références au **contenu de démo** (`p1`, `u_lea`, `e1`, `reel_seed_*`, `me` — local, jamais en base) sont isolées, pas comptées en anomalie (133 fausses → 12 réelles) ; ② une anomalie **datée sans récidive sur 7 j** est rétrogradée en « résidu » (défaut déjà corrigé, seul le nettoyage reste utile). Une règle non vérifiable est remontée « non vérifiée », jamais « conforme ». Cache serveur 30 s (`?force=1` pour outrepasser). ⚠️ L'intégrité expose des identifiants de base : **toute route qui l'embarque doit vérifier la capacité `db`** (`/api/diagnose` a fuité une fois par cette bande).

**Diagnostic global** : bouton « Diagnostiquer toute la plateforme » → `/api/diagnose` assemble santé, chaînes cassées dédupliquées, livraison, intégrité, bugs et dette en un prompt Claude Code actionnable.


## 🗂️ Pièges connus — index (détail complet : docs/PIEGES_CONNUS.md)

56 fiches détaillées par domaine. **Lis la fiche concernée AVANT de modifier ce domaine.** Pour un audit de diff, lance le subagent `audit-passio`.

- **Cadrage / shell** : jamais 100dvh (var --app-vh mesurée en JS).
- **Feed** : classement par pertinence (rankFeedPosts), guards no-op.
- **Profil** : onglets multi-sélection, profil visité = même mécanique, compte privé (RLS).
- **CDV** (carnets/lives/voyages) : ~15 fiches — v2/v3, collaboratif, stats/passeport, Mes lieux, rétrospective, stories, création hors Studio, sync Supabase, modération.
- **IRL** (événements) : ~12 fiches — RSVP 3 états, liste d’attente, check-in QR, badges, preuve sociale, cycle de vie, ergonomie, suite de tests dédiée.
- **Bobines / stories / éditeur média** : publication vidéo fiabilisée, son, plein écran.
- **Appels / Live vidéo** : WebRTC P2P, push app fermée, anti-écho (mono).
- **Commentaires / réactions** : 1 réaction/personne, GIF=commentaire, fluidité (patch en place), UX IG/FB.
- **Cartes / géocodage** : MapLibre+OpenFreeMap, BAN+Photon (Nominatim retiré de la CSP).
- **Supabase / realtime** : SDK paresseux, embeds sans FK, notifications cross-compte, tests multi-comptes par e-mail.
- **Divers** : diagLog, monitoring client_errors, multi-profil centralisé, système d’étoiles, double-like.

## 🔍 Revue indépendante par un second modèle (2026-08-13)

Les **changements à risque** (auth/identité, RLS/migrations, affichage de contenu d'autrui, PII, paiement, modération) passent par une revue d'un modèle tiers **en lecture seule**. Répartition stricte : l'agent principal seul détient le dépôt, `main`, Supabase, les tests et le déploiement ; le relecteur n'a **aucun accès** — il reçoit un dossier, rien d'autre. Ses remarques sont examinées et vérifiées contre le code réel avant toute fusion, jamais appliquées telles quelles.

```bash
npm run revue -- --titre "Ce que fait le changement" --tests
```

`scripts/dossier-revue.js` produit dans `.passio/reviews/<date>-<slug>/` : spécification, `diff.patch`, **fichiers concernés en entier** (un relecteur qui ne voit que des hunks juge la forme, pas le fond), vérifications réellement exécutées avec leurs sorties brutes (un test rouge est rapporté rouge), migrations touchées, conventions du projet, et pièges connus détectés par motif. `DOSSIER-COMPLET.md` regroupe le tout en un fichier à coller dans un chat. Sans `--tests`, Playwright n'est PAS lancé et le dossier le dit — ça ne vaut alors pas validation de bout en bout.

Le script est en lecture seule sur le dépôt (il n'écrit que dans son dossier de sortie) et n'a aucun accès prod. Chaque piège a une **portée** : les invariants DOM/globals ne valent que pour `js/app-*.js`, pas pour les modules Node — sinon le rapport se noie dans les faux positifs. Détail : `.passio/reviews/README.md`.

⚠️ **`.claude/` est désormais versionné SÉLECTIVEMENT** (skills + subagents = savoir projet, ils doivent survivre à un changement de machine). `.claude/settings.local.json` reste exclu : il contient des JWT et une clé `sb_secret_…` en clair dans ses commandes autorisées. Ne jamais le committer.

## 📚 Références projet
- `docs/PIEGES_CONNUS.md` — les 56 fiches détaillées (extrait de ce fichier le 2026-08-07).
- `docs/HISTORIQUE_PROJET.md` — état 2026-06-11, backlog terminé, logs d’optimisation.
- `docs/ARCHITECTURE.md`, `docs/CONTROLE_16_MISSIONS.md`, `docs/CHECKLIST_COMMERCIALISATION.md`.
- Skills projet : `/ship`, `/migration`, `/e2e-multi`. Subagents : `audit-passio`, `migration-checker`.

