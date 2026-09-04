# Fonctions, Realtime, Storage, clés, staging — relevés bruts (2026-09-04)

## Fonctions public (pg_proc) — 20 maison
| fonction | secdef | search_path | EXECUTE anon/auth | remarque |
|---|---|---|---|---|
| can_edit_post(pid) | oui | public | anon, authenticated | lit auth.uid() → false pour anon ; oracle nul |
| comment_target_visible(cid) | oui | public | anon, authenticated | cid inconnu → TRUE ; post privé → false : oracle d'existence d'un post caché |
| post_is_visible(pid) | oui | public | anon, authenticated | pid inexistant → TRUE, post d'un compte privé non suivi → FALSE : oracle |
| is_conv_member(_conv_id,_uid) | oui | "" | anon, authenticated | **oracle d'appartenance** : (conv, uid) → bool sans aucune restriction sur l'appelant |
| is_blocked_with(_other) | oui | "" | authenticated | révèle à l'appelant s'il est bloqué par _other (symétrique) |
| irl_interaction_allowed(_other) | oui | "" | authenticated | révèle la majorité de _other |
| can_join_event_conversation / is_conversation_creator | oui | "" | authenticated | bornées à auth.uid() |
| declare_birth_year(_birth_year) | oui | "" | authenticated | ON CONFLICT … WHERE majority_at IS NULL OR EXCLUDED > s.majority_at ; trigger BEFORE UPDATE user_safety refuse tout recul ; première déclaration libre (auto-déclaration) |
| rechercher_passions(q,lim) | non | (mutable) | anon, authenticated | SECURITY INVOKER ; anon/authenticated n'ont pas CREATE sur public (has_schema_privilege=false) → usurpation de search_path non exploitable |
| storage_chemin_autorise(_bucket,_name) | non | (mutable) | anon, authenticated | SECURITY INVOKER, toutes références qualifiées (storage.foldername, public.is_conv_member, auth.uid) → risque théorique nul, WARN advisor |
| unaccent_immutable | non | (mutable) | anon, authenticated | pure |
| broadcast_conv_message_to_users / identite_affichage_canonique / propager_identite_affichage / rate_limit_insert / purge_telemetry | oui | épinglé | aucun (révoqué) | triggers/maintenance |
| posts_freeze_author / user_safety_majorite_non_avancable / user_state_horodatage_serveur | non | épinglé | — / — / anon,auth (trigger, inoffensif) | |

Triggers actifs (12) : rate_limit sur comment_interactions(60/min), event_reactions(30/min), reports(10/min) ; freeze author posts ; identité canonique sur video_lives/event_comments/cdv_live_comments/step_interactions ; propagation profil ; horodatage user_state ; majorité non avançable ; broadcast conv_messages (AFTER INSERT seulement). **Aucun rate-limit** sur notifications, conv_messages, posts, telemetry_events, client_errors.

## Realtime
- Publication supabase_realtime : 25 tables (dont profiles, posts, telemetry_events, conv_reads, comment_interactions…). postgres_changes respecte la RLS du souscripteur (JWT) ; `conv_reads` étant SELECT true, TOUT client reçoit TOUS les accusés de lecture de tout le monde (app-08 `dbChan.on("postgres_changes", …table: "conv_reads")`).
- realtime.messages : RLS activée, 2 policies identiques (« recoit » / « reçoit ») : topic `user:<auth.uid()>` seulement, rôle authenticated. Le canal v2 `conv:<id>` (private) n'a AUCUNE policy → v2 est mort (par défaut v3 actif, app-08:4833).
- Canaux BROADCAST PUBLICS (aucune RLS, `private` absent) : `ring:<uid>` (invitation d'appel, `from` choisi par l'émetteur, app-05:556-564 ; le destinataire ne filtre que `isBlocked(payload.from)` app-05:832), `call:<callId>` avec callId = MY_UID + Date.now().toString(36) (app-05:531) → devinable, SDP/ICE injectables ; `typing:<convId>` (app-04:4755) ; `vlive:<id>` avec presence keyed MY_UID ; `realtime:db`.
- Fonction trigger broadcast_conv_message_to_users : boucle sur conv_members → `realtime.broadcast_changes('user:'||user_id, …)` : payload = ligne complète (NEW), un topic par membre. OK.
- Limites du plan (connexions simultanées, msgs/s) : plan Supabase NON LISIBLE ici → capacité non prouvée.

## Storage
- Buckets `content` et `attachments` : public=true, 50 Mo, aucun filtre MIME (allowed_mime_types NULL), 70 objets, 70/70 avec owner.
- Policies : SELECT `bucket_id in (content, attachments)` pour {public} → listing `/storage/v1/object/list/<bucket>` possible avec la seule clé anon ; INSERT/UPDATE gardés par storage_chemin_autorise ; DELETE owner = auth.uid().
- Chemins : `photos|videos|audios|covers|avatars|passion_photos|passion_covers|cdv_steps/<uid>/<id>.<ext>` et `attachments/conv_<17 car. aléatoires>/<epoch_ms>_voice.webm`. Sans listing le chemin d'une pièce jointe est peu devinable (17 caractères + epoch ms) ; AVEC listing (autorisé à anon) il n'y a rien à deviner.
- createSignedUrl : aucun usage réel (js/app-08:2644 = stub hors-ligne) ; `getPublicUrl` partout (app-08:3593, app-09:886, app-09:1599). 5 messages en base portent une URL publique d'attachment.
- delete-account (Edge) ne purge que photos/videos/audios/<uid> — ni covers, avatars, passion_*, cdv_steps, ni attachments ; ni comment_interactions, event_comments/reactions, blocks, reports, user_state, user_safety, user_passions, analytics_events, telemetry_events, video_lives, cdv_*, conv_reads, comment_likes.

## Clés, secrets, API
- Clé anon : js/app-08-ui-modals-tour.js:2551-2552 (attendu, publique). Aucune valeur de clé service_role ni JWT service dans le dépôt (grep `service_role|eyJhbGciOi` hors node_modules : uniquement commentaires, docs, `.claude/scripts/compact-permissions.js:41` = regex de détection). `.mcp.json` absent.
- Secrets GitHub référencés (noms) : SUPABASE_SERVICE_ROLE_KEY (deploy.yml:108, 346, 357 ; sentinelle-distante.yml:108), NETLIFY_AUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, GITHUB_TOKEN, PASSIO (deploy.yml:6, concurrency/… à vérifier par le domaine CI). NETLIFY_SITE_ID en clair (deploy.yml:524, 583 — identifiant, pas un secret).
- dashboard/.env.example : SUPABASE_SERVICE_ROLE_KEY vide, jamais côté navigateur (serveur Express seulement).
- scripts/setup-storage.html et scripts/create-buckets-auto.html : pages locales demandant de COLLER la clé service_role dans un navigateur (hygiène).
- Edge Functions ask-ai / notify-call / delete-account : toutes vérifient le JWT via `userClient.auth.getUser()` avant tout ; service_role via Deno.env ; CORS `*` (acceptable avec JWT).
- CSP (_headers, netlify.toml) : connect-src limité au projet njkiyoklssvefstljemx (+ tuiles, BAN, Photon, Tenor, Giphy, STUN/TURN). `script-src 'unsafe-inline'` (hors périmètre).
- API exposée : toutes les tables public via PostgREST (grants arwdDxtm à anon sauf 4 tables), 3 vues security_invoker, RPC anon : can_edit_post, comment_target_visible, is_conv_member, post_is_visible, rechercher_passions, storage_chemin_autorise, unaccent_immutable, user_state_horodatage_serveur (trigger).

## Staging vs production
- UN SEUL project_ref partout : `njkiyoklssvefstljemx` dans js/app-08 (prod), index.html, _headers, netlify.toml, dashboard/.env.example, tests/e2e/*.js, scripts/*.html. Aucun autre `*.supabase.co`. Aucune variable `*_STAGING`.
- Previews Netlify de PR (deploy.yml:530-586) déploient le même `dist/` → même Supabase prod.
- CI « Suites production (comptes réels) » (deploy.yml:301-357, `--project=prod`, `PASSIO_E2E_PROD=1`) crée des comptes `%@passio-e2e.test` EN PROD puis les purge (scripts/purge-e2e-rest.js via service_role).
- Verdict : staging séparé = NON. PASSIO_PRODUCTION_READINESS.md:35-40 le reconnaît (« une base qui ne soit pas la production »).

## Migrations / schéma
- supabase_migrations : 4 (20260809182329, 20260809182411, 20260809183406, 20260824132958) vs 64 fichiers migrations/*.sql.
- SCHEMA_PROD_REFERENCE.sql daté 2026-08-17 (dernier commit 2026-08-31) : 36 relations identiques, 2 différentes (passions 5→13 colonnes, video_lives), 4 tables absentes (passion_relations, passion_requests, user_passions, user_safety), 116 policies vs 125 en prod (12 nouvelles, 3 disparues). Détail : schema_reference_vs_prod.txt.
