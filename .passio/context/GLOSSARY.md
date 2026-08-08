# Glossaire PASSIO

- **Passion profile / multi-profil** : identités passionnelles multiples d'un même compte. Concept produit central.
- **CDV** : Carnets De Voyage — carnets collaboratifs (lives, étapes, budget, passeport, rétrospective).
- **IRL** : événements réels (RSVP 3 états, liste d'attente, check-in QR, badges, preuve sociale).
- **Bobines / stories** : contenus éphémères + reels.
- **Gate** : verrou d'accès beta par code (`js/access-gate.js`, `2125`).
- **Seed** : données de démo initiales (`app-01`).
- **`findPostAnywhere(id)`** : accès canonique à un post (seed + userPosts + supabasePosts).
- **`supaTs(s)`** : parsing de timestamp Supabase (gère `timestamp` et `timestamptz`).
- **3 helpers** : `escapeHtml` / `escapeJsArg` / `safeUrlAttr` (échappement contextuel).
- **`STATE_KEY`** : `passio_mvp_state_v1` (état local).
- **`MY_UID`** : id Supabase de l'utilisateur authentifié.
- **`ensureSupabase()` / `supa`** : accès paresseux au SDK Supabase (jamais le global `supabase` au top-level).
- **Centre de pilotage** : dashboard de supervision temps réel (`dashboard/`), alimenté par `telemetry_events`.
- **audit-passio / migration-checker / growth-analyst** : subagents locaux spécialisés.
- **Scale trigger** : métrique qui autorise l'introduction d'une techno complexe (bundler, ranking serveur…).
