# PASSIO — Guide pour Claude Code

Réseau social des passions. PWA vanilla JS (pas de framework, pas de bundler) + Supabase. Beta privée protégée par code d'accès.

## Architecture

- `index.html` : markup complet de l'app (landing, onboarding, 8 écrans, modals). En dev les 15 fichiers JS sont chargés séparément ; en prod `scripts/build.js` ré-assemble un monolithe dans `dist/`.
- `js/app-01` à `app-09` : logique applicative (ordre de chargement = dépendances par hoisting, NE PAS réordonner). 01=diag/seed, 02=state/utils/goTo, 03=posts/carnets, 04=commentaires/conversations rendering, 05=config/profils/reels, 06=profil principal/studio/partage, 07=IA/explore/IRL, 08=modals/tour/boot()/Supabase client, 09=PWA/emoji/pièces jointes/wrappers messagerie.
- `js/access-gate.js` : verrouillage par code (2125) — chargé en PREMIER dans <head>. Voir `docs/SECURITE_CODE_ACCES.md` pour changer le code.
- `styles.css` : 6300 lignes, thème violet (#7c3aed), variables CSS (--bg-card, --border, --muted, --accent…).
- Backend : Supabase (URL/clé anon dans app-08). Tables : profiles, posts, post_likes, post_comments, stories, events, event_attendees, conversations, conv_members, conv_messages, notifications, follows, client_errors. RLS par propriétaire (`auth.uid()::text`). Migrations dans `migrations/`.
- État local : `localStorage.passio_state` (profils, posts perso, conversations…). `MY_UID` = id Supabase auth.

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

1. Tests utilisateur multi-comptes (inscription → publication → messages entre 2 comptes réels).
2. ~~Réception des messages vocaux côté destinataire~~ — fait le 2026-06-11 : décodage unifié via `applyMsgContentData()` (app-04), utilisé par renderConvFpThread, supaLoadMessages, le handler realtime et l'aperçu de conversation. Reste à valider avec 2 comptes réels (point 1).
3. ~~Galerie "Pièces jointes" d'une conversation~~ — fait le 2026-06-11 : panneau `#convFilesPanel` (médias / vocaux / fichiers, état vide), `openConvFiles()`/`closeConvFiles()` (app-09).
4. Edge Function Supabase `delete-account` (suppression auth.users — le client ne peut pas).
5. Remplacer les GIFs Giphy hardcodés (emoji-misc.js, 4 listes) par l'API Giphy/Tenor.
6. Redesign écran par écran (états vides, transitions, hiérarchie) — comparer avec Instagram/TikTok.
7. ~~Accessibilité~~ — fait le 2026-06-11 : `user-scalable=no`/`maximum-scale` retirés, champs < 16px passés à 16px (anti auto-zoom iOS), `--muted` assombri (#6e6987, AA), zone tactile 44px sur `.conv-tool-btn`. Reste : audit complet écran par écran (avec le redesign, point 6).
8. Perf : audit de couverture CSS (styles.css 191 Ko), pagination des conversations.

## Pièges connus

- Le build exige EXACTEMENT 9 fichiers app-*.js entre les marqueurs BUILD:APP dans index.html.
- `tests/e2e/access-gate.spec.js` dépend du hash dans gate-helper.js — à mettre à jour si le code d'accès change.
- Les messages média Supabase encodent le contenu en JSON dans `content` (type gif/media/audio/doc/location) — décodage centralisé dans `applyMsgContentData()` (app-04) : vocaux (audio/webm ou "Message vocal (Xs)") → lecteur intégré, autres audios → carte téléchargement.
- Insert conv_messages : d'abord SANS from_id, fallback AVEC (contrainte historique).
