# Banc d'isolation sous rôle — PostgreSQL jetable, policies RÉELLES de production (2026-09-08)

Débloque les contrôles **C10** (isolation par requête sous rôle `anon`/`authenticated`) et **C13** (UPDATE/DELETE d'un tiers → 0 ligne) laissés BLOQUÉS par le rapport 13 (`SET LOCAL ROLE` refusé au connecteur, 42501). Méthode : « requête base » sur une **réplique** — pas sur la production elle-même.

## Ce que le banc reconstitue (relevé le 2026-09-08 par `execute_sql`, lecture seule)

- les **39 tables** du schéma `public` avec leurs colonnes réelles (`colonnes.txt`), clés primaires (`pk.txt`) et CHECK ;
- les **123 policies** réelles (`policies.json` : 119 `public` + 4 `storage.objects`, `pg_policies` du jour — l'empreinte du dump du 2026-09-04 dans `preuves/supabase-isolation/policies.json` ne correspondait plus, d'où ce nouveau relevé) ;
- les **16 fonctions maison** (`fonctions.sql`, `pg_get_functiondef`) avec leurs droits EXECUTE réels (`has_function_privilege`) et les **12 triggers** ;
- RLS activée sur les 39 tables (`relrowsecurity=true`, jamais forcée), grants par défaut Supabase (anon/authenticated : tous droits, la RLS est la seule barrière) ;
- un socle Supabase minimal : rôles `anon`/`authenticated`, `auth.uid()` lisant `request.jwt.claim.sub`, `storage.objects`/`buckets` (les deux buckets `public=true` comme en prod), `storage.foldername`.

Hors périmètre : Realtime (`realtime.messages`), Edge Functions, GoTrue. Le trigger `broadcast_conv_message_to_users` n'est pas rejoué.

## Jeu de données synthétique (`seed.sql`)

A (compte public, propriétaire de tout), C (compte **privé**, suivi par A), B (tiers authentifié, ne suit personne), D (figurant). Aucune donnée réelle.

## Résultat (`matrice.txt`, `sondes.txt`, `mutations.txt`)

`bash lancer.sh` → 123 policies créées, 240 mesures.

- **Écriture cross-compte : 0 ligne partout.** Pour chacune des 40 tables, `UPDATE` et `DELETE` lancés par B touchent 0 ligne d'autrui (la seule ligne touchée est son propre profil). Usurpation d'auteur (`insert posts author_id=A`), auto-invitation dans une conversation, message dans une conversation dont on n'est pas membre, notification signée par un autre, dépôt Storage dans la conversation d'autrui, télémétrie au nom d'autrui : **tous refusés** (`new row violates row-level security policy`).
- **Lecture propre** (0 ligne pour anon ET pour B) : analytics_events, blocks, client_errors, conv_members, conv_messages, conversations, notifications, passion_requests, push_subscriptions, reports, story_views, telemetry_events, user_safety, user_state.
- **Comptes privés** : le post et la story de C sont invisibles pour anon et pour B, visibles pour A (abonné) — `post_is_visible` et les policies `posts`/`stories`/`post_comments`/`post_likes`/`comment_interactions` tiennent.
- **Lecture PUBLIQUE prouvée sous rôle anon** (fuites du rapport 06/04 CONFIRMÉES sur réplique) : `conv_reads` (SUP-02/MSG-05 : 2 lignes, identifiant de conversation privée), `event_attendees` (IRL-03 : liste nominative + rsvp), `events` (IRL-01 : adresse exacte + téléphone), `storage.objects` du bucket `attachments` (SUP-01/MSG-03/CONT-11 : `conv/conv1/vocal-prive.webm` listé sans compte), `follows`, `user_passions`, `profiles` (bio + `rs_links`), `comment_likes`, `post_collaborators`, `event_comments`, `event_reactions`, `step_interactions`, `video_lives`, tout `cdv_*` (sauf `cdv_lives` privé), `passions`, `passion_relations`. `is_conv_member('conv1', A)` répond `true` à anon (oracle d'appartenance) ; `post_is_visible('post_C')` répond `false` à anon (oracle d'existence d'un post privé) et `true` pour un identifiant inconnu.
- **Mutations** (le banc doit changer de verdict quand on retire la garde) : sans « Lecture propre » A ne voit plus ses notifications (0) ; sans `reads_select` la fuite `conv_reads` disparaît (0) ; sans `passio_media_read` anon ne liste plus `attachments` (0). Le banc mesure donc bien les policies, pas un artefact.

## Statut des contrôles

| Contrôle | Statut | Méthode |
|---|---|---|
| C10 isolation par requête sous rôle | **PROUVÉ (sur réplique)** — aucune donnée « propre » lisible par un tiers ; les fuites sont exactement celles déjà rapportées | requête base (PostgreSQL 16 jetable, policies du 2026-09-08) |
| C13 UPDATE/DELETE sous rôle tiers | **PROUVÉ (sur réplique)** — 0 ligne sur 40 tables | requête base |
| C11 REST anon direct vers la prod | toujours BLOQUÉ (proxy) — mais le résultat attendu est désormais connu table par table | — |

Limite : une divergence entre cette réplique et la production ne peut venir que d'un élément non reconstitué (droits de schéma, Realtime, réglages GoTrue) ; les policies, fonctions, triggers et grants de fonctions sont ceux du jour. Rejouable : `bash lancer.sh` (PostgreSQL ≥ 14, aucune base réelle touchée).
