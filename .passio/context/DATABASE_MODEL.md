# Modèle de données PASSIO (Supabase / Postgres)

> **Le repo n'est PAS la source de vérité SQL.** La prod fait autorité (schéma prod ≠ `migrations/`). Toujours vérifier via `schema` / `migration-checker` avant de coder une requête.

## Tables (par domaine)
- **Identité** : `profiles` (UNE ligne par compte — l'unique identité publique, cf. ADR-010), `follows` (entre COMPTES), `blocks`, `push_subscriptions`, `user_state` (sync cross-appareil). Les passions d'un compte vivent dans la colonne jsonb `profiles.passions`, pas dans une table. ⚠️ Ce document a longtemps listé une table `profile_passions` : **elle n'existe pas et n'a jamais existé**. Le nom du fichier `migrations/migration_profile_passions.sql` prête à confusion — il ne fait qu'un `ALTER TABLE profiles ADD COLUMN passions jsonb`.
- **Contenu** : `posts`, `post_likes`, `post_comments`, `comment_interactions`, `stories`, `story_views`.
- **Messagerie** : `conversations`, `conv_members`, `conv_messages`, `conv_reads`.
- **IRL** : `events`, `event_attendees`, `event_comments`, `event_reactions`, `event_feedback`.
- **CDV** : `cdv_*` (lives, steps, collaborators, step_interactions).
- **Système** : `notifications`, `reports`, `client_errors`, `telemetry_events`.

## Règles dures
1. **RLS par propriétaire** (`auth.uid()::text`). UPDATE/DELETE 0-ligne = RLS manquante.
2. **`timestamp` vs `timestamptz` mixés** → `supaTs(s)` obligatoire (liste dans `PASSIO_SYSTEM_MODEL.md`).
3. **Jamais base64 en DB** → Supabase Storage.
4. **Embed `profiles(...)` = 400** sans FK réelle → jointure manuelle.
5. **Realtime** : la table doit être dans la publication realtime ; livraison respecte la RLS (prouvée par tests multi-comptes).
6. **Migration** = additive par défaut, jamais destructive sans stratégie + rollback (playbook `database-migration`).

## Accès prod (opérateur)
CLI liée : `supabase db query --linked "SQL"` (lecture/monitoring `client_errors`, `reports` ; purge comptes de test). Migrations réelles : voir skill `migration`.

## Détail & pièges
`../../docs/PIEGES_CONNUS.md` (Supabase/realtime), `../../migrations/`, `../../docs/SCALE_RUNBOOK.md` (index & scale).

Lié : [[PASSIO_SYSTEM_MODEL]], `SECURITY_MODEL.md`.
