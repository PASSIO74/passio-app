# PASSIO — Guide pour Claude Code

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
- HTML généré par template literals + `escapeHtml()` pour tout contenu utilisateur (XSS).
- Navigation : `goTo('feed'|'profiles'|'studio'|'explore'|'irl'|'wallet'|'messages'|'cdv')` — écrans = `#screen-<nom>`.
- Toasts via `toast()`, jamais `alert()`.
- Les onclick inline doivent référencer des fonctions globales EXISTANTES (l'audit du 2026-06-10 a trouvé 7 fonctions fantômes — vérifier avant d'ajouter un handler).

## État au 2026-06-11 (voir docs/RAPPORT_SESSION_2026-06-10.md pour le détail)

Fait : access gate en prod, 14 bugs corrigés, RGPD (suppression de compte réelle + politique de confidentialité), policies DELETE appliquées en prod Supabase, suite E2E gate.

## Backlog prioritaire

1. ~~Tests utilisateur multi-comptes~~ — **fait le 2026-06-12, test E2E vert de bout en bout** (`tests/e2e/multi-comptes.spec.js`, opt-in : `PASSIO_E2E_MULTI=1 npm test` ; inscription réelle × 2, conversation, texte dans les deux sens, vocal rendu dans le lecteur intégré, réception realtime ~1 s). **4 bugs critiques de prod trouvés et corrigés** : (a) RLS conv_members — migration `migration_fix_conv_members_insert.sql` appliquée en prod le 2026-06-11 ; (b) `initApp()` (emoji-misc) écrasait l'onboarding des nouveaux utilisateurs ~1,4 s après le chargement (tour lancé de force) ; (c) deadlock verrou auth supabase-js (`onAuthStateChange` → supaInit, et `onbSkipAuth` qui dépendait de la résolution de `signInAnonymously`) ; (d) `supaSubscribe()` + chargement des conversations Supabase étaient dans du code mort après un `return` dans `supaInit` → **aucun destinataire ne recevait jamais rien**.
2. ~~Réception des messages vocaux côté destinataire~~ — fait le 2026-06-11 : décodage unifié via `applyMsgContentData()` (app-04), utilisé par renderConvFpThread, supaLoadMessages, le handler realtime et l'aperçu de conversation. Reste à valider avec 2 comptes réels (point 1).
3. ~~Galerie "Pièces jointes" d'une conversation~~ — fait le 2026-06-11 : panneau `#convFilesPanel` (médias / vocaux / fichiers, état vide), `openConvFiles()`/`closeConvFiles()` (app-09).
4. ~~Edge Function Supabase `delete-account`~~ — fait le 2026-06-11 : code (`supabase/functions/delete-account/index.ts`), appel branché dans `doDeleteAccount` (app-02), **déployée en prod via le Dashboard** et testée (compte jetable supprimé, auth comprise).
5. ~~GIFs hardcodés~~ — fait le 2026-06-12 : API Tenor/Giphy via `passioFetchGifs`/`passioGifPanel` (emoji-misc.js), recherche + cache 10 min + fallback liste locale. Clé à coller dans `PASSIO_GIF_API` (1 endroit). CSP mise à jour (tenor/giphy).
6. ~~Redesign / audit visuel~~ — fait le 2026-06-12 : `scripts/capture-screens.js` (16 captures `docs/screenshots/`), UI jugée qualité commerciale ; seul fix : `.demo-ribbon` (MVP BETA) → watermark non-bloquant. Redesign approfondi écran par écran = amélioration continue.
7. ~~Accessibilité~~ — fait le 2026-06-11/12 : `user-scalable=no`/`maximum-scale` retirés, champs à 16px, `--muted` AA, touch 44px. Audit aria complet = amélioration continue.
8. ~~Perf~~ — fait : transfert prod 201 Ko brotli (<500), `loading="lazy"` partout, **pagination des conversations** (30/page + `_loadMoreConvs`, app-04) en plus du fil et des messages. Reste (humain) : Lighthouse mobile formel.

**Contrôle qualité des 16 missions** : voir `docs/CONTROLE_16_MISSIONS.md` (audit 2026-06-12, 14 ✅ / 1 ⚠️ m6 / 0 ❌, verdict « prêt à commercialiser en beta ») et `docs/CHECKLIST_COMMERCIALISATION.md`. Tests : `npm run test:all` (18 verts). Audit handlers : `npm run audit:handlers`.

## Pièges connus

- Le build exige EXACTEMENT 9 fichiers app-*.js entre les marqueurs BUILD:APP dans index.html.
- `tests/e2e/access-gate.spec.js` dépend du hash dans gate-helper.js — à mettre à jour si le code d'accès change.
- Les messages média Supabase encodent le contenu en JSON dans `content` (type gif/media/audio/doc/location) — décodage centralisé dans `applyMsgContentData()` (app-04) : vocaux (audio/webm ou "Message vocal (Xs)") → lecteur intégré, autres audios → carte téléchargement.
- Insert conv_messages : AVEC from_id d'abord (la RLS v2 exige from_id = auth.uid()), fallback sans from_id. (Inversé le 2026-06-11 — l'ancien ordre « sans d'abord » échouait systématiquement et gaspillait une requête par message.)
- `from_id` et `conv_members.user_id` ont une FK vers `profiles` : `supaUpsertProfile()` doit être passé avant (fait au boot et dans supaCreateConversation).
- La prod a une FK `conv_messages.conv_id → conversations` qui n'apparaît pas dans `migrations/supabase_tables.sql` (constaté le 2026-06-11) : la ligne `conversations` doit exister avant tout message. Le schéma du repo n'est pas la source de vérité exacte de la prod.
- Realtime : **v2 par défaut depuis le 2026-06-15** (`window.PASSIO_REALTIME_V2`, app-08). Chaque client s'abonne à UN canal **privé par conversation** (`conv:<id>`, Broadcast-from-Database) au lieu du canal global qui recevait TOUS les messages → scalable + scoping par membership via RLS sur `realtime.messages`. Nécessite `migration_realtime_authorization.sql` (trigger + policy, appliquée en prod). Handler de réception factorisé : `_handleIncomingConvMessage(r)` (commun v1/v2) ; abonnement : `_subscribePrivateConv(convId)` (boot + ouverture de conv + ajout à une conv). Soupape de secours par device : `localStorage.passio_realtime_v2 = "0"` → revient au canal global v1 (code conservé dans le `else`). Garde `window._supaSubscribed` contre le double abonnement (supaInit appelable 2×).
- supabase-js : ne JAMAIS faire de requête Supabase directement dans un callback `onAuthStateChange` (verrou auth interne → deadlock, la promesse du sign-in ne résout jamais) — différer avec `setTimeout(..., 0)`. Et ne pas faire dépendre l'avancement de l'UI de la résolution de `signInAnonymously()` (cf. `onbSkipAuth`).
- `supaInit` (app-08) contient un GROS bloc de code mort après `return;` (reliquat du « FIX Promise.all », variables non définies) — ne rien y ajouter, il ne s'exécute pas. Les conversations + `supaSubscribe()` en ont été extraits le 2026-06-12.
- `initApp()` (appelée par emoji-misc ~600 ms après chargement) ne doit JAMAIS tourner pour un utilisateur non onboardé — elle lançait le tour qui écrasait l'onboarding (corrigé par un garde `state.onboarded`).
