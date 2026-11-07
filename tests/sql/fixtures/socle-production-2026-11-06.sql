-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE DE BANC — structure de la production lue au catalogue le 2026-11-06, révision 02d76757, puis
-- complétée des migrations 33 et 34 : empreintes égales à la production le 2026-11-07 (bloc final).
-- Tables, contraintes, fonctions, déclencheurs, policies et droits de `public`, policies de
-- `storage.objects` et `realtime.messages`. AUCUNE DONNÉE, aucun secret, aucune adresse.
-- Fichier GÉNÉRÉ, pour jouer une migration et des identités simulées sur un PostgreSQL jetable :
-- ne s'applique JAMAIS à un projet. Auth, Storage et Realtime sont des bouchons minimaux.
-- ═══════════════════════════════════════════════════════════════════════════
set client_min_messages = warning;
set check_function_bodies = off;
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema auth; create schema storage; create schema realtime; create schema extensions;
create schema net; create schema cron; create schema vault;
grant usage on schema public, auth, storage, realtime, extensions to anon, authenticated, service_role;
grant usage on schema net, cron, vault to service_role;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto schema extensions;
create extension if not exists "uuid-ossp" schema extensions;

-- ── auth ──
create table auth.users (
  id uuid primary key, email text, created_at timestamptz not null default now(),
  email_confirmed_at timestamptz, confirmed_at timestamptz, banned_until timestamptz, deleted_at timestamptz,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $f$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$f$;
create function auth.role() returns text language sql stable as $f$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$f$;
create function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$f$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ── storage ──
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null,
  owner uuid, owner_id text, metadata jsonb, created_at timestamptz not null default now(), updated_at timestamptz default now(),
  unique (bucket_id, name)
);
create function storage.foldername(name text) returns text[] language plpgsql immutable as $f$
declare parties text[];
begin
  parties := string_to_array(name, '/');
  return parties[1:array_length(parties, 1) - 1];
end $f$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant update on storage.buckets to service_role;
insert into storage.buckets (id, name, public, file_size_limit) values
  ('attachments', 'attachments', false, 27262976), ('content', 'content', true, 27262976);

-- ── realtime ──
create table realtime.messages (
  id uuid primary key default gen_random_uuid(), topic text, extension text, payload jsonb, event text,
  private boolean, inserted_at timestamptz default now()
);
create table realtime.envois (id bigserial primary key, topic text, event text, payload jsonb, a timestamptz default now());
grant select on realtime.envois to service_role;
create function realtime.topic() returns text language sql stable as $f$ select current_setting('realtime.topic', true) $f$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql security definer as $f$ insert into realtime.envois (topic, event, payload) values (topic, event, payload) $f$;
grant execute on function realtime.topic() to anon, authenticated, service_role;
create function realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name name, table_schema name, new anyelement, old anyelement, level text default 'ROW') returns void
language sql security definer as $f$ insert into realtime.envois (topic, event) values (topic_name, event_name) $f$;
grant select, insert on realtime.messages to anon, authenticated, service_role;

-- ── pg_net, pg_cron : muets ──
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 2000) returns bigint language sql as $f$ select 0::bigint $f$;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(jobname text, schedule text, command text) returns bigint language sql as $f$
  insert into cron.job (jobname, schedule, command) values (jobname, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid
$f$;
create function cron.unschedule(jobname text) returns boolean language sql as $f$
  with x as (delete from cron.job j where j.jobname = unschedule.jobname returning 1) select exists (select 1 from x)
$f$;
create publication supabase_realtime;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;
create table public."access_policies" (
  "key" text not null,
  "enabled" boolean not null default false,
  "note" text,
  "updated_at" timestamp with time zone not null default now()
);
create table public."activite_jour" (
  "jour" date not null,
  "uid" uuid not null
);
create table public."analytics_events" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" text not null,
  "event" text not null,
  "properties" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone not null default now()
);
create table public."blocks" (
  "blocker_id" text not null,
  "blocked_id" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."call_invites" (
  "id" text not null,
  "from_id" text not null,
  "to_id" text not null,
  "kind" text not null default 'voice'::text,
  "created_at" timestamp with time zone not null default now(),
  "repete_le" timestamp with time zone not null default now()
);
create table public."cdv_live_collaborators" (
  "live_id" text not null,
  "user_id" text not null,
  "added_by" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."cdv_live_comments" (
  "id" text not null,
  "live_id" text not null,
  "author_id" text not null,
  "author_name" text,
  "text" text,
  "created_at" timestamp with time zone default now()
);
create table public."cdv_live_followers" (
  "live_id" text not null,
  "user_id" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."cdv_live_reactions" (
  "id" text not null,
  "live_id" text not null,
  "user_id" text not null,
  "emoji" text,
  "created_at" timestamp with time zone default now()
);
create table public."cdv_live_steps" (
  "id" text not null,
  "live_id" text not null,
  "author_id" text not null,
  "city" text,
  "emoji" text,
  "content" text,
  "photos" jsonb default '[]'::jsonb,
  "rating" integer default 0,
  "budget" text,
  "created_at" timestamp with time zone default now(),
  "lat" double precision,
  "lng" double precision,
  "video" text
);
create table public."cdv_lives" (
  "id" text not null,
  "author_id" text not null,
  "destination" text,
  "description" text,
  "duration" text,
  "visibility" text default 'public'::text,
  "status" text default 'live'::text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."client_errors" (
  "id" bigint not null generated by default as identity,
  "message" text,
  "source" text,
  "line" integer,
  "stack" text,
  "url" text,
  "ua" text,
  "uid" text,
  "created_at" timestamp with time zone default now(),
  "auth_uid" uuid
);
create table public."client_errors_par_heure" (
  "heure" timestamp with time zone,
  "erreurs" bigint
);
create table public."client_errors_top_24h" (
  "message" text,
  "occurrences" bigint,
  "utilisateurs" bigint,
  "derniere_occurrence" timestamp with time zone
);
create table public."comment_interactions" (
  "id" text not null,
  "comment_id" text not null,
  "post_id" text,
  "user_id" text not null,
  "kind" text not null,
  "payload" text,
  "created_at" timestamp with time zone not null default now()
);
create table public."comment_likes" (
  "comment_id" text not null,
  "user_id" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."comptes_en_suppression" (
  "user_id" text not null,
  "demandee_le" timestamp with time zone not null default now(),
  "motif" text,
  "statut" text not null default 'en_cours'::text,
  "jeton" uuid,
  "tentatives" integer not null default 0,
  "tentative_debut" timestamp with time zone,
  "tentative_fin" timestamp with time zone,
  "purge_terminee_le" timestamp with time zone,
  "supprimee_le" timestamp with time zone,
  "derniere_erreur" jsonb,
  "tentative_vivante" boolean not null default false
);
create table public."contenus_masques" (
  "target_type" text not null,
  "target_id" text not null,
  "signaleurs" integer not null,
  "masque_le" timestamp with time zone not null default now(),
  "decision" text,
  "decide_le" timestamp with time zone
);
create table public."conv_members" (
  "conv_id" text not null,
  "user_id" text not null,
  "rid" bigint not null default (((('x'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 17, 16)))::bit(64))::bigint & '9007199254740991'::bigint)
);
create table public."conv_messages" (
  "id" text not null,
  "conv_id" text,
  "from_id" text,
  "content" text,
  "created_at" timestamp without time zone default now()
);
create table public."conv_reads" (
  "conv_id" text not null,
  "user_id" text not null,
  "last_read_at" timestamp with time zone not null default now(),
  "rid" bigint not null default (((('x'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 17, 16)))::bit(64))::bigint & '9007199254740991'::bigint)
);
create table public."conversations" (
  "id" text not null,
  "is_group" boolean default false,
  "group_name" text,
  "passion_id" text,
  "created_by" text,
  "created_at" timestamp without time zone default now(),
  "description" text
);
create table public."croissance_jour" (
  "jour" date not null,
  "mesure" text not null,
  "valeur" text not null,
  "n" integer not null default 0
);
create table public."event_attendees" (
  "event_id" text not null,
  "user_id" text not null,
  "created_at" timestamp with time zone default now(),
  "rsvp" text not null default 'going'::text,
  "checked_in_at" timestamp without time zone,
  "rating" smallint,
  "feedback" text,
  "rated_at" timestamp with time zone
);
create table public."event_checkin_secrets" (
  "event_id" text not null,
  "secret" text not null,
  "created_at" timestamp with time zone not null default now()
);
create table public."event_comments" (
  "id" text not null,
  "event_id" text not null,
  "author_id" text not null,
  "author_name" text,
  "text" text,
  "created_at" timestamp with time zone default now()
);
create table public."event_reactions" (
  "event_id" text not null,
  "user_id" text not null,
  "emoji" text not null,
  "created_at" timestamp with time zone not null default now()
);
create table public."events" (
  "id" text not null,
  "author_id" text,
  "title" text,
  "passion_id" text,
  "lat" double precision,
  "lng" double precision,
  "city" text,
  "description" text,
  "emoji" text default '📍'::text,
  "max_attendees" integer,
  "date_at" timestamp without time zone,
  "created_at" timestamp without time zone default now(),
  "venue" text,
  "address" text,
  "postal_code" text,
  "price" double precision default 0,
  "contact" text,
  "external_link" text,
  "event_type" text default 'Autre'::text,
  "cover_url" text,
  "organizer_id" text,
  "end_at" timestamp without time zone,
  "status" text not null default 'active'::text,
  "updated_at" timestamp without time zone,
  "co_organizers" jsonb not null default '[]'::jsonb,
  "series_id" text,
  "recurrence" text not null default 'none'::text,
  "conv_id" text
);
create table public."follows" (
  "follower_id" text not null,
  "following_id" text not null,
  "created_at" timestamp with time zone not null default now(),
  "status" text not null default 'accepted'::text
);
create table public."migrations_appliquees" (
  "id" bigint not null generated by default as identity,
  "fichier" text not null,
  "empreinte" text not null,
  "verdict" jsonb,
  "applique_le" timestamp with time zone not null default now(),
  "outil" text not null default 'appliquer-migration.mjs'::text,
  "cible" text,
  "attestation" jsonb,
  "statut" text not null default 'applique'::text
);
create table public."moderation_actions" (
  "id" text not null default ('ma_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)),
  "report_id" text,
  "action" text not null,
  "target_type" text,
  "target_id" text,
  "note" text,
  "created_at" timestamp with time zone not null default now()
);
create table public."notifications" (
  "id" text not null,
  "user_id" text,
  "kind" text,
  "from_id" text,
  "ref_id" text,
  "content" text,
  "seen" boolean default false,
  "created_at" timestamp without time zone default now(),
  "origine" text not null default 'client'::text,
  "rid" bigint not null default (((('x'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 17, 16)))::bit(64))::bigint & '9007199254740991'::bigint)
);
create table public."passion_quotas" (
  "user_id" uuid not null,
  "creations_max" integer,
  "note" text,
  "created_at" timestamp with time zone not null default now()
);
create table public."passion_relations" (
  "source_passion_id" text not null,
  "target_passion_id" text not null,
  "relation_type" text not null,
  "weight" integer not null default 1,
  "created_at" timestamp with time zone not null default now()
);
create table public."passion_requests" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" text not null,
  "label" text not null,
  "normalized_label" text not null,
  "status" text not null default 'pending'::text,
  "resolved_passion_id" text,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);
create table public."passions" (
  "id" text not null,
  "emoji" text not null default '✨'::text,
  "label" text not null,
  "color" text,
  "sort_order" integer not null default 0,
  "normalized_label" text,
  "aliases" text[] not null default '{}'::text[],
  "status" text not null default 'active'::text,
  "source" text not null default 'legacy'::text,
  "is_broad" boolean not null default false,
  "popularity" integer not null default 0,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  "created_by" uuid,
  "recherche" text
);
create table public."post_collaborators" (
  "post_id" text not null,
  "user_id" text not null,
  "added_by" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."post_comments" (
  "id" text not null,
  "post_id" text,
  "author_id" text,
  "content" text,
  "created_at" timestamp without time zone default now()
);
create table public."post_likes" (
  "post_id" text not null,
  "user_id" text not null,
  "rid" bigint not null default (((('x'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 17, 16)))::bit(64))::bigint & '9007199254740991'::bigint)
);
create table public."posts" (
  "id" text not null,
  "author_id" text,
  "passion_id" text,
  "mood" text,
  "content" text,
  "media_url" text,
  "likes" integer default 0,
  "created_at" timestamp without time zone default now(),
  "shared_from_post_id" text,
  "shared_data" text,
  "is_reel" boolean default false,
  "overlays" jsonb,
  "vlog" jsonb,
  "event_id" text
);
create table public."profiles" (
  "id" text not null,
  "username" text not null,
  "emoji" text default '✨'::text,
  "color" text default '#8b5cf6'::text,
  "passion_id" text,
  "bio" text,
  "created_at" timestamp without time zone default now(),
  "avatar_url" text,
  "cover_url" text,
  "passions" jsonb default '[]'::jsonb,
  "is_private" boolean not null default false,
  "rs_links" jsonb
);
create table public."push_subscriptions" (
  "endpoint" text not null,
  "user_id" text not null,
  "subscription" jsonb not null,
  "created_at" timestamp with time zone default now()
);
create table public."reglages_distants" (
  "cle" text not null,
  "valeur" jsonb not null,
  "pose_par" text not null,
  "motif" text,
  "maj" timestamp with time zone not null default now()
);
create table public."reports" (
  "id" text not null,
  "reporter_id" text,
  "target_type" text,
  "target_id" text,
  "reason" text,
  "created_at" timestamp with time zone default now(),
  "status" text not null default 'open'::text,
  "handled_at" timestamp with time zone,
  "handled_note" text
);
create table public."signalements_preuves" (
  "report_id" text not null,
  "message_id" text not null,
  "conv_id" text,
  "auteur_id" text,
  "contenu" text,
  "envoye_le" timestamp without time zone,
  "copie_le" timestamp with time zone not null default now()
);
create table public."step_interactions" (
  "id" text not null,
  "thread_id" text not null,
  "user_id" text not null,
  "kind" text not null,
  "content" text,
  "author_name" text,
  "author_emoji" text,
  "created_at" timestamp with time zone not null default now()
);
create table public."stories" (
  "id" text not null,
  "author_id" text,
  "passion_id" text,
  "content" text,
  "emoji" text default '✨'::text,
  "created_at" timestamp without time zone default now(),
  "media_url" text,
  "media_type" text,
  "overlays" jsonb
);
create table public."story_views" (
  "story_id" text not null,
  "user_id" text not null,
  "seen_at" timestamp with time zone not null default now()
);
create table public."telemetrie_debit" (
  "minute" timestamp with time zone not null,
  "reservoir" text not null,
  "source" text not null,
  "n" integer not null
);
create table public."telemetry_events" (
  "id" uuid not null default gen_random_uuid(),
  "event_id" text,
  "received_at" timestamp with time zone not null default now(),
  "client_ts" timestamp with time zone,
  "env" text not null default 'production'::text,
  "type" text not null,
  "action" text,
  "screen" text,
  "status" text,
  "severity" text not null default 'info'::text,
  "duration_ms" integer,
  "user_id" text,
  "user_label" text,
  "session_id" text,
  "device_id" text,
  "platform" text,
  "browser" text,
  "app_version" text,
  "screen_size" text,
  "connection" text,
  "endpoint" text,
  "http_status" integer,
  "correlation_id" text,
  "message" text,
  "stack" text,
  "meta" jsonb not null default '{}'::jsonb,
  "auth_uid" uuid
);
create table public."telemetry_last24h" (
  "type" text,
  "severity" text,
  "n" bigint,
  "last_seen" timestamp with time zone
);
create table public."user_passions" (
  "user_id" text not null,
  "passion_id" text not null,
  "position" integer not null default 0,
  "archived" boolean not null default false,
  "created_at" timestamp with time zone not null default now()
);
create table public."user_safety" (
  "user_id" text not null,
  "majority_at" date,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);
create table public."user_state" (
  "user_id" text not null,
  "data" jsonb not null default '{}'::jsonb,
  "updated_at" timestamp with time zone not null default now()
);
create table public."video_lives" (
  "id" text not null,
  "author_id" text not null,
  "author_name" text,
  "author_emoji" text,
  "author_photo" text,
  "title" text,
  "status" text not null default 'live'::text,
  "started_at" timestamp with time zone not null default now(),
  "last_seen" timestamp with time zone not null default now(),
  "ended_at" timestamp with time zone
);
alter table public."access_policies" add constraint "access_policies_pkey" PRIMARY KEY (key);
alter table public."activite_jour" add constraint "activite_jour_pkey" PRIMARY KEY (jour, uid);
alter table public."analytics_events" add constraint "analytics_events_pkey" PRIMARY KEY (id);
alter table public."blocks" add constraint "blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);
alter table public."call_invites" add constraint "call_invites_pkey" PRIMARY KEY (id);
alter table public."cdv_live_collaborators" add constraint "cdv_live_collaborators_pkey" PRIMARY KEY (live_id, user_id);
alter table public."cdv_live_comments" add constraint "cdv_live_comments_pkey" PRIMARY KEY (id);
alter table public."cdv_live_followers" add constraint "cdv_live_followers_pkey" PRIMARY KEY (live_id, user_id);
alter table public."cdv_live_reactions" add constraint "cdv_live_reactions_pkey" PRIMARY KEY (id);
alter table public."cdv_live_steps" add constraint "cdv_live_steps_pkey" PRIMARY KEY (id);
alter table public."cdv_lives" add constraint "cdv_lives_pkey" PRIMARY KEY (id);
alter table public."client_errors" add constraint "client_errors_pkey" PRIMARY KEY (id);
alter table public."comment_interactions" add constraint "comment_interactions_pkey" PRIMARY KEY (id);
alter table public."comment_likes" add constraint "comment_likes_pkey" PRIMARY KEY (comment_id, user_id);
alter table public."comptes_en_suppression" add constraint "comptes_en_suppression_pkey" PRIMARY KEY (user_id);
alter table public."contenus_masques" add constraint "contenus_masques_pkey" PRIMARY KEY (target_type, target_id);
alter table public."conv_members" add constraint "conv_members_pkey" PRIMARY KEY (conv_id, user_id);
alter table public."conv_messages" add constraint "conv_messages_pkey" PRIMARY KEY (id);
alter table public."conv_reads" add constraint "conv_reads_pkey" PRIMARY KEY (conv_id, user_id);
alter table public."conversations" add constraint "conversations_pkey" PRIMARY KEY (id);
alter table public."croissance_jour" add constraint "croissance_jour_pkey" PRIMARY KEY (jour, mesure, valeur);
alter table public."event_attendees" add constraint "event_attendees_pkey" PRIMARY KEY (event_id, user_id);
alter table public."event_checkin_secrets" add constraint "event_checkin_secrets_pkey" PRIMARY KEY (event_id);
alter table public."event_comments" add constraint "event_comments_pkey" PRIMARY KEY (id);
alter table public."event_reactions" add constraint "event_reactions_pkey" PRIMARY KEY (event_id, user_id, emoji);
alter table public."events" add constraint "events_pkey" PRIMARY KEY (id);
alter table public."follows" add constraint "follows_pkey" PRIMARY KEY (follower_id, following_id);
alter table public."migrations_appliquees" add constraint "migrations_appliquees_pkey" PRIMARY KEY (id);
alter table public."moderation_actions" add constraint "moderation_actions_pkey" PRIMARY KEY (id);
alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);
alter table public."passion_quotas" add constraint "passion_quotas_pkey" PRIMARY KEY (user_id);
alter table public."passion_relations" add constraint "passion_relations_pkey" PRIMARY KEY (source_passion_id, target_passion_id, relation_type);
alter table public."passion_requests" add constraint "passion_requests_pkey" PRIMARY KEY (id);
alter table public."passions" add constraint "passions_pkey" PRIMARY KEY (id);
alter table public."post_collaborators" add constraint "post_collaborators_pkey" PRIMARY KEY (post_id, user_id);
alter table public."post_comments" add constraint "post_comments_pkey" PRIMARY KEY (id);
alter table public."post_likes" add constraint "post_likes_pkey" PRIMARY KEY (post_id, user_id);
alter table public."posts" add constraint "posts_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."push_subscriptions" add constraint "push_subscriptions_pkey" PRIMARY KEY (endpoint);
alter table public."reglages_distants" add constraint "reglages_distants_pkey" PRIMARY KEY (cle);
alter table public."reports" add constraint "reports_pkey" PRIMARY KEY (id);
alter table public."signalements_preuves" add constraint "signalements_preuves_pkey" PRIMARY KEY (report_id);
alter table public."step_interactions" add constraint "step_interactions_pkey" PRIMARY KEY (id);
alter table public."stories" add constraint "stories_pkey" PRIMARY KEY (id);
alter table public."story_views" add constraint "story_views_pkey" PRIMARY KEY (story_id, user_id);
alter table public."telemetrie_debit" add constraint "telemetrie_debit_pkey" PRIMARY KEY (minute, reservoir, source);
alter table public."telemetry_events" add constraint "telemetry_events_pkey" PRIMARY KEY (id);
alter table public."user_passions" add constraint "user_passions_pkey" PRIMARY KEY (user_id, passion_id);
alter table public."user_safety" add constraint "user_safety_pkey" PRIMARY KEY (user_id);
alter table public."user_state" add constraint "user_state_pkey" PRIMARY KEY (user_id);
alter table public."video_lives" add constraint "video_lives_pkey" PRIMARY KEY (id);
CREATE UNIQUE INDEX conv_members_rid_key ON public.conv_members USING btree (rid);
CREATE UNIQUE INDEX conv_reads_rid_key ON public.conv_reads USING btree (rid);
CREATE UNIQUE INDEX notifications_rid_key ON public.notifications USING btree (rid);
CREATE UNIQUE INDEX passion_requests_unique_par_personne ON public.passion_requests USING btree (user_id, normalized_label);
CREATE UNIQUE INDEX post_likes_rid_key ON public.post_likes USING btree (rid);
CREATE UNIQUE INDEX reports_passion_unique_par_personne ON public.reports USING btree (reporter_id, target_id) WHERE (target_type = 'passion'::text);
alter table public."call_invites" add constraint "call_invites_id_check" CHECK (((char_length(id) >= 8) AND (char_length(id) <= 80)));
alter table public."call_invites" add constraint "call_invites_kind_check" CHECK ((kind = ANY (ARRAY['voice'::text, 'video'::text])));
alter table public."call_invites" add constraint "call_invites_to_id_check" CHECK ((to_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text));
alter table public."comment_interactions" add constraint "ci_ids_len_check" CHECK (((char_length(id) <= 120) AND (char_length(comment_id) <= 120) AND ((post_id IS NULL) OR (char_length(post_id) <= 120)) AND (char_length(user_id) <= 120)));
alter table public."comment_interactions" add constraint "ci_kind_check" CHECK ((kind = ANY (ARRAY['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text])));
alter table public."comment_interactions" add constraint "ci_payload_len_check" CHECK (((payload IS NULL) OR (char_length(payload) <= 500)));
alter table public."comptes_en_suppression" add constraint "comptes_en_suppression_statut_check" CHECK ((statut = ANY (ARRAY['en_cours'::text, 'echec'::text, 'purgee'::text, 'supprimee'::text])));
alter table public."contenus_masques" add constraint "contenus_masques_decision_check" CHECK ((decision = ANY (ARRAY['retabli'::text, 'garde'::text])));
alter table public."event_attendees" add constraint "event_attendees_rating_range" CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))));
alter table public."event_attendees" add constraint "event_attendees_rsvp_valeurs" CHECK ((rsvp = ANY (ARRAY['going'::text, 'maybe'::text, 'declined'::text, 'waitlist'::text])));
alter table public."event_reactions" add constraint "evr_emoji_len_check" CHECK ((char_length(emoji) <= 500));
alter table public."event_reactions" add constraint "evr_ids_len_check" CHECK (((char_length(event_id) <= 120) AND (char_length(user_id) <= 120)));
alter table public."events" add constraint "events_max_attendees_min1" CHECK (((max_attendees IS NULL) OR (max_attendees >= 1)));
alter table public."events" add constraint "events_price_positif" CHECK (((price IS NULL) OR (price >= (0)::double precision)));
alter table public."follows" add constraint "follows_status_chk" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])));
alter table public."migrations_appliquees" add constraint "migrations_appliquees_empreinte_check" CHECK ((empreinte ~ '^[0-9a-f]{64}$'::text));
alter table public."moderation_actions" add constraint "moderation_actions_action_check" CHECK ((action = ANY (ARRAY['retrait'::text, 'rejet'::text, 'note'::text, 'suspension'::text, 'levee'::text])));
alter table public."moderation_actions" add constraint "moderation_actions_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 500)));
alter table public."moderation_actions" add constraint "moderation_actions_target_id_check" CHECK (((target_id IS NULL) OR (char_length(target_id) <= 120)));
alter table public."moderation_actions" add constraint "moderation_actions_target_type_check" CHECK (((target_type IS NULL) OR (char_length(target_type) <= 40)));
alter table public."notifications" add constraint "notifications_origine_check" CHECK ((origine = ANY (ARRAY['client'::text, 'serveur'::text])));
alter table public."passion_relations" add constraint "passion_relations_pas_reflexive" CHECK ((source_passion_id <> target_passion_id));
alter table public."passion_relations" add constraint "passion_relations_type_chk" CHECK ((relation_type = ANY (ARRAY['related'::text, 'broader'::text, 'narrower'::text])));
alter table public."passion_requests" add constraint "passion_requests_label_chk" CHECK (((char_length(label) >= 2) AND (char_length(label) <= 60)));
alter table public."passion_requests" add constraint "passion_requests_status_chk" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'duplicate'::text])));
alter table public."passions" add constraint "passions_source_chk" CHECK ((source = ANY (ARRAY['legacy'::text, 'curated'::text, 'imported'::text, 'user_suggested'::text])));
alter table public."passions" add constraint "passions_status_chk" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'pending'::text])));
alter table public."reglages_distants" add constraint "reglages_distants_cle_check" CHECK ((cle = ANY (ARRAY['delestage'::text, 'coupures'::text, 'bandeau'::text])));
alter table public."reglages_distants" add constraint "reglages_distants_motif_check" CHECK (((motif IS NULL) OR (char_length(motif) <= 300)));
alter table public."reglages_distants" add constraint "reglages_distants_pose_par_check" CHECK ((pose_par = ANY (ARRAY['pilote'::text, 'veille'::text])));
alter table public."reglages_distants" add constraint "reglages_distants_valeur_check" CHECK (((jsonb_typeof(valeur) = 'object'::text) AND (octet_length((valeur)::text) <= 4096)));
alter table public."reports" add constraint "rep_ids_len_check" CHECK (((char_length(id) <= 120) AND ((target_type IS NULL) OR (char_length(target_type) <= 40)) AND ((target_id IS NULL) OR (char_length(target_id) <= 120)) AND ((reporter_id IS NULL) OR (char_length(reporter_id) <= 120))));
alter table public."reports" add constraint "rep_reason_len_check" CHECK (((reason IS NULL) OR (char_length(reason) <= 500)));
alter table public."reports" add constraint "reports_status_chk" CHECK ((status = ANY (ARRAY['open'::text, 'handled'::text, 'dismissed'::text])));
alter table public."reports" add constraint "reports_target_type_chk" CHECK (((target_type IS NULL) OR (target_type = ANY (ARRAY['user'::text, 'post'::text, 'comment'::text, 'event'::text, 'passion'::text, 'message'::text, 'story'::text]))));
alter table public."telemetrie_debit" add constraint "telemetrie_debit_n_check" CHECK ((n >= 0));
alter table public."telemetrie_debit" add constraint "telemetrie_debit_reservoir_check" CHECK ((reservoir = ANY (ARRAY['anciens'::text, 'neufs'::text, 'anonymes'::text])));
alter table public."telemetrie_debit" add constraint "telemetrie_debit_source_check" CHECK (((source = '*'::text) OR (source ~ '^u:[0-9a-f-]{36}$'::text)));
alter table public."activite_jour" add constraint "activite_jour_uid_fkey" FOREIGN KEY (uid) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."cdv_live_comments" add constraint "fk_cdv_comments_live" FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;
alter table public."cdv_live_followers" add constraint "fk_cdv_followers_live" FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;
alter table public."cdv_live_reactions" add constraint "fk_cdv_reactions_live" FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;
alter table public."cdv_live_steps" add constraint "fk_cdv_steps_live" FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;
alter table public."conv_members" add constraint "conv_members_conv_id_fkey" FOREIGN KEY (conv_id) REFERENCES conversations(id);
alter table public."conv_members" add constraint "conv_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public."conv_messages" add constraint "conv_messages_conv_id_fkey" FOREIGN KEY (conv_id) REFERENCES conversations(id);
alter table public."conv_messages" add constraint "conv_messages_from_id_fkey" FOREIGN KEY (from_id) REFERENCES profiles(id);
alter table public."conversations" add constraint "conversations_passion_fk" FOREIGN KEY (passion_id) REFERENCES passions(id);
alter table public."event_attendees" add constraint "event_attendees_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_checkin_secrets" add constraint "event_checkin_secrets_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_comments" add constraint "event_comments_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_reactions" add constraint "event_reactions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."events" add constraint "events_passion_fk" FOREIGN KEY (passion_id) REFERENCES passions(id);
alter table public."moderation_actions" add constraint "moderation_actions_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;
alter table public."passion_relations" add constraint "passion_relations_source_passion_id_fkey" FOREIGN KEY (source_passion_id) REFERENCES passions(id) ON DELETE CASCADE;
alter table public."passion_relations" add constraint "passion_relations_target_passion_id_fkey" FOREIGN KEY (target_passion_id) REFERENCES passions(id) ON DELETE CASCADE;
alter table public."passion_requests" add constraint "passion_requests_resolved_passion_id_fkey" FOREIGN KEY (resolved_passion_id) REFERENCES passions(id) ON DELETE SET NULL;
alter table public."post_comments" add constraint "post_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id);
alter table public."posts" add constraint "posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id);
alter table public."posts" add constraint "posts_passion_fk" FOREIGN KEY (passion_id) REFERENCES passions(id);
alter table public."profiles" add constraint "profiles_passion_fk" FOREIGN KEY (passion_id) REFERENCES passions(id);
alter table public."signalements_preuves" add constraint "signalements_preuves_report_id_fkey" FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;
alter table public."stories" add constraint "stories_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id);
alter table public."stories" add constraint "stories_passion_fk" FOREIGN KEY (passion_id) REFERENCES passions(id);
alter table public."user_passions" add constraint "user_passions_passion_id_fkey" FOREIGN KEY (passion_id) REFERENCES passions(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.abonne_accepte_non_bloque(_auteur text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null or _auteur is null then false
    else exists (
      select 1 from public.follows f
      where f.follower_id = (auth.uid())::text
        and f.following_id = _auteur
        and f.status = 'accepted'
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = _auteur and b.blocked_id = (auth.uid())::text)
         or (b.blocker_id = (auth.uid())::text and b.blocked_id = _auteur)
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.adult_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    WHEN NOT public.adult_access_enforced() THEN TRUE
    ELSE public.is_adult_declared()
  END
$function$;
CREATE OR REPLACE FUNCTION public.adult_access_enforced()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT p.enabled FROM public.access_policies p WHERE p.key = 'irl_adult_only'
  ), TRUE)
$function$;
CREATE OR REPLACE FUNCTION public.adult_access_status()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'undeclared'
    WHEN NOT public.adult_access_enforced() THEN 'off'
    WHEN NOT EXISTS (SELECT 1 FROM public.user_safety s
                      WHERE s.user_id = (auth.uid())::text AND s.majority_at IS NOT NULL)
      THEN 'undeclared'
    WHEN public.is_adult_declared() THEN 'admitted'
    ELSE 'minor'
  END
$function$;
CREATE OR REPLACE FUNCTION public.agreger_croissance_recente()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer := 0;
begin
  if extract(hour from now() at time zone 'UTC') < 2 then
    n := n + public.agreger_croissance(((now() at time zone 'UTC')::date) - 1);
  end if;
  n := n + public.agreger_croissance((now() at time zone 'UTC')::date);
  return n;
end $function$;
CREATE OR REPLACE FUNCTION public.agreger_croissance(p_jour date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  debut timestamptz := (p_jour::timestamp at time zone 'UTC');
  fin timestamptz := (p_jour::timestamp at time zone 'UTC') + interval '1 day';
  n integer;
begin
  if p_jour is null then return 0; end if;

  insert into public.activite_jour (jour, uid)
  select distinct p_jour, t.auth_uid
    from public.telemetry_events t
   where t.received_at >= debut and t.received_at < fin
     and t.auth_uid is not null
     and coalesce(t.env, '') <> 'development'
     and (t.meta ->> 'trafic') is null
     -- Un compte qui EXISTE encore (clé étrangère) : la télémétrie d'un compte
     -- supprimé depuis ferait échouer l'agrégation de toute la journée.
     and exists (select 1 from auth.users u where u.id = t.auth_uid
                  and lower(coalesce(u.email, '')) not like '%@passio-e2e.test'
                  and lower(coalesce(u.email, '')) <> '<adresse-du-compte-editeur-expurgee>')
  on conflict do nothing;

  delete from public.croissance_jour where jour = p_jour;
  -- Une ligne par (mesure, valeur). `cle` dédoublonne : un appareil par
  -- visite, un lien par création, un (lien, appareil) par ouverture. Les
  -- valeurs sont réduites à [a-z0-9_.-] : rien d'arbitraire n'entre ici.
  insert into public.croissance_jour (jour, mesure, valeur, n)
  select p_jour, x.mesure, x.valeur, count(distinct x.cle)::integer
    from (
      select m.mesure,
             coalesce(nullif(left(regexp_replace(lower(coalesce(m.valeur, '')), '[^a-z0-9_.-]', '', 'g'), 40), ''), '?') as valeur,
             m.cle
        from public.telemetry_events t
        cross join lateral (values
          (case when t.type = 'session' and t.action = 'start' then 'visite' end,
           coalesce(t.meta ->> 'src', t.meta ->> 'referrer'), coalesce(t.device_id, t.session_id, t.id::text)),
          (case when t.action = 'link_create' then 'lien_cree' end,
           t.meta ->> 'link_kind', coalesce(t.correlation_id, t.id::text)),
          (case when t.action = 'link_share' then 'lien_partage' end,
           t.meta ->> 'link_channel', coalesce(t.correlation_id, t.id::text) || ':' || coalesce(t.meta ->> 'link_channel', '')),
          (case when t.action = 'link_open' then 'lien_ouvert' end,
           t.meta ->> 'referrer', coalesce(t.correlation_id, '') || ':' || coalesce(t.device_id, t.id::text)),
          (case when t.action = 'link_signup' then 'inscription_lien' end,
           t.meta ->> 'voie', coalesce(t.correlation_id, '') || ':' || coalesce(t.device_id, t.id::text)),
          (case when t.action = 'acq_signup' then 'inscription' end,
           t.meta ->> 'src', coalesce(t.device_id, t.id::text)),
          (case when t.action = 'acq_signup' and (t.meta ->> 'camp') is not null then 'campagne' end,
           t.meta ->> 'camp', coalesce(t.device_id, t.id::text))
        ) as m (mesure, valeur, cle)
       where t.received_at >= debut and t.received_at < fin
         and coalesce(t.env, '') <> 'development'
         and (t.meta ->> 'trafic') is null
         and (t.type in ('session', 'link') or t.action = 'acq_signup')
         and m.mesure is not null
    ) x
   group by x.mesure, x.valeur;
  get diagnostics n = row_count;
  return n;
end $function$;
CREATE OR REPLACE FUNCTION public.ajouter_passion_utilisateur(p_passion_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_pos int;
begin
  if v_uid is null then
    raise exception 'auth_requise' using errcode = '42501';
  end if;

  if not exists (select 1 from public.passions
                  where id = p_passion_id and status = 'active') then
    raise exception 'passion_inconnue' using errcode = '22023';
  end if;

  select coalesce(max(up.position), -1) + 1 into v_pos
    from public.user_passions up where up.user_id = v_uid::text;

  insert into public.user_passions (user_id, passion_id, position, archived)
  values (v_uid::text, p_passion_id, v_pos, false)
  on conflict (user_id, passion_id) do update set archived = false;
end $function$;
CREATE OR REPLACE FUNCTION public.appel_autorise(_to text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null
     and _to is distinct from (select auth.uid())::text
     and not public.is_blocked_with(_to)
     and exists (
       select 1 from public.conv_members a
       join public.conv_members b on b.conv_id = a.conv_id
       join public.conversations c on c.id = a.conv_id
       where a.user_id = (select auth.uid())::text
         and b.user_id = _to
         and coalesce(c.is_group, false) = false);
$function$;
CREATE OR REPLACE FUNCTION public.attendre_ecritures_en_vol(p_max_ms integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  snap      pg_snapshot := pg_current_snapshot();
  -- ⚠️ `xip` NE SUFFIT PAS. Il ne liste que les transactions en cours
  -- ANTÉRIEURES à `xmax`, et `xmax` est « dernier xid VALIDÉ + 1 » : une
  -- transaction en vol plus récente que tout ce qui a validé n'y figure pas.
  -- Mesuré sur PostgreSQL 17 (banc ⑥) : une écriture ouverte, `xip` vide.
  -- On s'attribue donc un xid (`pg_current_xact_id`) : tout xid déjà attribué
  -- lui est inférieur, et [xmax, moi) complète la liste.
  moi       xid8 := pg_current_xact_id();
  candidats xid8[] := array(select pg_snapshot_xip(snap))
                   || array(select x::text::xid8 from generate_series(pg_snapshot_xmax(snap)::text::bigint,
                                                                       least(moi::text::bigint - 1, pg_snapshot_xmax(snap)::text::bigint + 100000)) g(x));
  xids      xid8[];
  debut     timestamptz := clock_timestamp();
  restantes integer := 0;
begin
  -- Parmi les candidats, seuls ceux qui sont RÉELLEMENT en cours comptent
  -- (un xid de la plage peut être déjà validé ou annulé).
  xids := array(select x from unnest(candidats) x where pg_xact_status(x) = 'in progress');
  loop
    select count(*) into restantes from unnest(xids) x where pg_xact_status(x) = 'in progress';
    exit when restantes = 0 or clock_timestamp() >= debut + make_interval(secs => greatest(p_max_ms, 0) / 1000.0);
    perform pg_sleep(0.05);
  end loop;
  return jsonb_build_object('en_vol_initial', coalesce(array_length(xids, 1), 0), 'restantes', restantes,
                            'attendu_ms', (extract(epoch from clock_timestamp() - debut) * 1000)::integer);
end $function$;
CREATE OR REPLACE FUNCTION public.blocage_entre(_a text, _b text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when _a is null or _b is null or _a = _b then false
    else exists (
      select 1 from public.blocks b
       where (b.blocker_id = _a and b.blocked_id = _b)
          or (b.blocker_id = _b and b.blocked_id = _a)
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.broadcast_conv_message_to_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'realtime'
AS $function$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
    -- ⚠️ LE COUPLE EXPLICITE (auteur, destinataire), et aucun état de session :
    -- voir l'en-tête pour ce que l'autre aide perd sur les chemins serveur.
    IF NOT public.blocage_entre(NEW.from_id, m.user_id) THEN
      PERFORM realtime.broadcast_changes(
        'user:' || m.user_id,
        TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.call_invites_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.from_id is distinct from old.from_id or new.to_id is distinct from old.to_id then
    raise exception 'call_invites : from_id et to_id sont figés';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.call_invites_sonner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform realtime.send(
    jsonb_build_object('callId', new.id, 'from', new.from_id, 'kind', new.kind, 'atteste', true),
    'invite',
    'ring:' || new.to_id,
    true);
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.can_edit_post(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = pid AND p.author_id = auth.uid()::text)
      OR EXISTS (SELECT 1 FROM post_collaborators c WHERE c.post_id = pid AND c.user_id = auth.uid()::text);
$function$;
CREATE OR REPLACE FUNCTION public.can_join_event_conversation(_conv_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.events e
        JOIN public.event_attendees a
          ON a.event_id = e.id
         AND a.user_id = (auth.uid())::text
        JOIN public.conversations c
          ON c.id = e.conv_id
       WHERE e.conv_id = _conv_id
         AND e.conv_id = ('evgrp_' || e.id)
         -- IRL-10 : l'auteur OU un co-organisateur a pu créer la discussion.
         AND (c.created_by = e.author_id
              OR (e.co_organizers IS NOT NULL
                  AND jsonb_typeof(e.co_organizers) = 'array'
                  AND e.co_organizers ? c.created_by))
         AND e.status = 'active'
         -- C-04 : « going » seul, ou l'organisation — jamais « maybe ».
         AND (a.rsvp = 'going' OR public.organise_activite(e.id))
         AND NOT public.is_blocked_with(e.author_id)
         AND public.adult_access_allowed()
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.checkin_secret_generer()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  octets bytea := extensions.gen_random_bytes(6);
  out text := '';
  i integer;
begin
  for i in 0..5 loop
    out := out || substr(alphabet, (get_byte(octets, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end
$function$;
CREATE OR REPLACE FUNCTION public.client_errors_pose_identite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.auth_uid := auth.uid();   -- NULL pour un visiteur, l'identité réelle sinon
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text, pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Une interaction se lit comme son FIL : `post_id`, que le client pose toujours — la
  -- publication ou l'activité où elle a été écrite. Lui seul rattache une réaction à une
  -- RÉPONSE (`comment_id = srep_<date>`, une cible qu'aucune table ne porte).
  select case
    when pid is null then public.comment_target_visible(cid)
    when exists (select 1 from posts where id = pid) then public.post_is_visible(pid)
    -- Une activité : publique, comme `events` et `event_comments`.
    when exists (select 1 from events where id = pid) then true
    -- Un fil d'exemple reste public ; un fil supprimé ou inconnu n'est lisible par personne.
    else public.est_identifiant_exemple(pid)
  end
$function$;
CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- La CIBLE seule, pour une interaction sans fil (`post_id` nul : aucune ligne aujourd'hui,
  -- le client le pose toujours). Avec un fil, comment_target_visible(cid, pid) décide.
  select case
    when cid is null then false
    when exists (select 1 from posts where id = cid)
      then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid)
      then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    -- Un commentaire d'activité : public, comme `event_comments` (lecture : true).
    when exists (select 1 from event_comments where id = cid) then true
    -- Un exemple reste public ; une cible supprimée ou inconnue, personne (R31 : rendait VRAI).
    else public.est_identifiant_exemple(cid)
  end
$function$;
CREATE OR REPLACE FUNCTION public.conv_1a1_bloquee(_conv_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.conv_members m
    join public.conversations c on c.id = m.conv_id
    where m.conv_id = _conv_id
      and coalesce(c.is_group, false) = false
      and m.user_id <> (select auth.uid())::text
      and public.is_blocked_with(m.user_id));
$function$;
CREATE OR REPLACE FUNCTION public.creer_et_ajouter_passion(p_label text, p_emoji text DEFAULT NULL::text)
 RETURNS TABLE(id text, label text, emoji text, color text, cree boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_p   record;
  v_pos int;
begin
  if v_uid is null then
    raise exception 'auth_requise' using errcode = '42501';
  end if;

  select * into v_p from public.creer_passion(p_label, p_emoji);

  select coalesce(max(up.position), -1) + 1 into v_pos
    from public.user_passions up where up.user_id = v_uid::text;

  insert into public.user_passions (user_id, passion_id, position, archived)
  values (v_uid::text, v_p.id, v_pos, false)
  on conflict (user_id, passion_id) do update set archived = false;

  return query select v_p.id, v_p.label, v_p.emoji, v_p.color, v_p.cree;
end $function$;
CREATE OR REPLACE FUNCTION public.creer_passion(p_label text, p_emoji text, p_aliases text[])
 RETURNS TABLE(id text, label text, emoji text, color text, cree boolean, aliases text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_brut    text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_norme   text;
  v_slug    text;
  v_essai   text;
  v_i       int := 1;
  v_emoji   text;
  v_exist   public.passions%rowtype;
  v_total   int;
  v_max     int;
  v_a       text;
  v_an      text;
  v_gardes  text[] := '{}';
  v_plies   text[] := '{}';
begin
  if v_uid is null then
    raise exception 'auth_requise' using errcode = '42501';
  end if;

  v_brut  := left(v_brut, 60);
  v_norme := public.passion_plier(v_brut);

  if char_length(v_norme) < 2 or char_length(v_norme) > 60 then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if v_norme !~ '[a-z]' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if array_length(regexp_split_to_array(v_norme, ' '), 1) > 6 then
    raise exception 'nom_trop_long' using errcode = '22023';
  end if;
  if v_brut ~* '(https?:|www\.|@|\.[a-z]{2,4}/)' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if v_brut ~ '[<>&"\\`]' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;

  -- ── Déjà là ? On rend l'existante ───────────────────────────────────────
  -- ⚠️ Le LIBELLÉ seul est interrogé ici, et les alias de l'EXISTANT. Les
  -- alias PROPOSÉS n'entrent pas dans ce test : voir l'en-tête.
  select * into v_exist from public.passions p
   where p.normalized_label = v_norme
      or exists (select 1 from unnest(p.aliases) a
                  where public.passion_plier(a) = v_norme)
   order by (p.status = 'active') desc, p.popularity desc
   limit 1;

  if found then
    if v_exist.status <> 'active' then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
    return query select v_exist.id, v_exist.label, v_exist.emoji, v_exist.color,
                        false, v_exist.aliases;
    return;
  end if;

  -- ── Plafond de créations par compte ─────────────────────────────────────
  -- `passion_quotas` : aucune ligne = le défaut (3) ; une ligne à NULL =
  -- illimité. On tranche sur `found`, JAMAIS sur un coalesce de la valeur —
  -- sinon la table donnerait l'illimité à tout le monde par le seul fait
  -- d'exister.
  -- ⚠️ ASTRA-04 (2026-09-15) : le plafond se lisait puis s'insérait SANS
  -- sérialisation — deux créations simultanées du même compte lisaient toutes
  -- deux « 2 sur 3 » et passaient toutes deux. Un verrou consultatif par compte,
  -- tenu jusqu'à la fin de la transaction, met la seconde en attente derrière
  -- la première : elle relit alors « 3 sur 3 » et est refusée. Le verrou est
  -- par COMPTE (hashtext de l'uid) : deux comptes différents ne s'attendent pas.
  perform pg_advisory_xact_lock(hashtext('creer_passion:' || v_uid::text));
  select q.creations_max into v_max from public.passion_quotas q where q.user_id = v_uid;
  if not found then v_max := 3; end if;
  if v_max is not null then
    select count(*) into v_total from public.passions where created_by = v_uid;
    if v_total >= v_max then
      raise exception 'quota_creation' using errcode = '53400';
    end if;
  end if;

  -- ── Identifiant ─────────────────────────────────────────────────────────
  v_slug  := replace(v_norme, ' ', '-');
  v_essai := v_slug;
  while exists (select 1 from public.passions p where p.id = v_essai) loop
    v_i := v_i + 1;
    v_essai := v_slug || '-' || v_i::text;
    if v_i > 50 then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
  end loop;

  -- ── Emoji ───────────────────────────────────────────────────────────────
  v_emoji := btrim(coalesce(p_emoji, ''));
  if v_emoji = '' or char_length(v_emoji) > 4 or v_emoji ~ '[a-zA-Z0-9<>&"''/\\]' then
    v_emoji := '✨';
  end if;

  -- ── Alias : on garde ce qui sert, on écarte le reste ────────────────────
  -- Cinq au plus. Au-delà, ce n'est plus un synonyme, c'est du référencement.
  foreach v_a in array coalesce(p_aliases, '{}'::text[]) loop
    exit when cardinality(v_gardes) >= 5;
    v_a  := left(regexp_replace(btrim(coalesce(v_a, '')), '\s+', ' ', 'g'), 60);
    v_an := public.passion_plier(v_a);

    continue when char_length(v_an) < 2;          -- vide ou trop court
    continue when v_an !~ '[a-z]';                -- « 2025 » n'aide personne
    continue when v_a ~ '[<>&"\\`]';              -- même refus que le libellé
    continue when v_a ~* '(https?:|www\.|@|\.[a-z]{2,4}/)';
    continue when v_an = v_norme;                 -- l'alias de son propre nom
    continue when v_an = any (v_plies);           -- doublon dans la liste
    -- ⚠️ LE CONTRÔLE QUI COMPTE : un alias qui est déjà le LIBELLÉ ou l'ALIAS
    -- d'une autre passion ferait remonter deux entrées pour le même mot.
    continue when exists (
      select 1 from public.passions p
       where p.normalized_label = v_an
          or exists (select 1 from unnest(p.aliases) x
                      where public.passion_plier(x) = v_an));

    v_gardes := v_gardes || v_a;
    v_plies  := v_plies  || v_an;
  end loop;

  insert into public.passions
    (id, label, emoji, color, sort_order, normalized_label, aliases,
     status, source, is_broad, popularity, created_by)
  values
    (v_essai,
     upper(left(v_brut, 1)) || substr(v_brut, 2),
     v_emoji, '#7c3aed', 5000, v_norme, v_gardes,
     'active', 'user_suggested', false, 0, v_uid);

  update public.passion_requests r
     set status = 'approved'
   where r.normalized_label = v_norme and r.status = 'pending';

  return query
    select p.id, p.label, p.emoji, p.color, true, p.aliases
      from public.passions p where p.id = v_essai;
end $function$;
CREATE OR REPLACE FUNCTION public.creer_passion(p_label text, p_emoji text DEFAULT NULL::text)
 RETURNS TABLE(id text, label text, emoji text, color text, cree boolean, aliases text[])
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.creer_passion(p_label, p_emoji, null::text[]);
$function$;
CREATE OR REPLACE FUNCTION public.declare_birth_year(_birth_year integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid       TEXT;
  v_candidate DATE;
  v_applied   BOOLEAN;
BEGIN
  v_uid := (auth.uid())::text;
  IF v_uid IS NULL OR _birth_year IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _birth_year < 1900
     OR _birth_year > EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN
    RETURN FALSE;
  END IF;

  v_candidate := make_date(_birth_year + 18, 12, 31);

  INSERT INTO public.user_safety AS s (user_id, majority_at)
  VALUES (v_uid, v_candidate)
  ON CONFLICT (user_id) DO UPDATE
    SET majority_at = EXCLUDED.majority_at,
        updated_at = NOW()
    WHERE s.majority_at IS NULL
       OR EXCLUDED.majority_at > s.majority_at
  RETURNING TRUE INTO v_applied;

  RETURN COALESCE(v_applied, FALSE);
END
$function$;
CREATE OR REPLACE FUNCTION public.diffuser_ajout_membre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.user_id is null
     or new.user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', 'conv_members',
        'operation', 'INSERT',
        'record', jsonb_build_object('conv_id', new.conv_id, 'user_id', new.user_id)
      ),
      'conv_members:INSERT',
      'user:' || new.user_id,
      true
    );
  exception when others then
    raise warning 'diffuser_ajout_membre : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.diffuser_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.user_id is null
     or new.user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', 'notifications',
        'operation', 'INSERT',
        'record', jsonb_build_object(
          'id', new.id,
          'user_id', new.user_id,
          'kind', new.kind,
          'from_id', new.from_id,
          'ref_id', new.ref_id,
          'content', left(new.content, 500),
          'seen', new.seen,
          'created_at', new.created_at
        )
      ),
      'notifications:INSERT',
      'user:' || new.user_id,
      true
    );
  exception when others then
    raise warning 'diffuser_notification : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.est_identifiant_exemple(_id text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  -- Le contenu de DÉMONSTRATION que le client fabrique et qu'aucune table ne porte :
  -- `buildSeed()` (app-01) et `getSeedReelPostsWithComments()` (app-05). Publications
  -- p<n>, pm|pp|pv<n>, pn_<thème>_<n>, pac_<thème>, p_ev_<thème>, p_ev<n>_e<n> ;
  -- bobines reel_seed_<thème>_<n> ; activités e<n>. Liste FERMÉE et ancrée :
  -- tests/unit/identifiants-exemple.test.mjs la confronte à buildSeed() et aux
  -- générateurs du contenu réel. Un exemple nouveau qui n'y entre pas a ses
  -- commentaires lisibles par leur seul auteur — le test le dit avant la mise en ligne.
  select coalesce(_id ~ '^(p[0-9]+|p[mpv][0-9]+|pn_[a-z0-9]+_[0-9]+|pac_[a-z]+|p_ev_[a-z]+|p_ev[0-9]+_e[0-9]+|reel_seed_[a-z0-9_]+|e[0-9]+)$', false)
$function$;
CREATE OR REPLACE FUNCTION public.event_attendees_admission_gardee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Aucune session (postgres, service_role, tâches d'administration) : la règle
  -- ne s'applique pas. Sans cette sortie, une purge ou une mesure administrative
  -- se ferait effacer ses colonnes en silence.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.adult_access_allowed() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.checked_in_at := NULL;
    NEW.rating        := NULL;
    NEW.feedback      := NULL;
    NEW.rated_at      := NULL;
  ELSE
    NEW.checked_in_at := OLD.checked_in_at;
    NEW.rating        := OLD.rating;
    NEW.feedback      := OLD.feedback;
    NEW.rated_at      := OLD.rated_at;
    -- Ni déplacer sa ligne vers un autre événement, ni vers un autre compte.
    NEW.event_id      := OLD.event_id;
    NEW.user_id       := OLD.user_id;
    NEW.created_at    := OLD.created_at;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.event_attendees_capacite_gardee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ev record;
  inscrits integer;
begin
  -- Aucune session (postgres, service_role, tâches d'administration) : la règle
  -- ne s'applique pas — même sortie que `event_attendees_admission_gardee`.
  if auth.uid() is null then return new; end if;
  -- Seul le PASSAGE à « going » est gardé : rester inscrit (pointage, note),
  -- passer en « peut-être », en attente ou se retirer ne consomment rien.
  if new.rsvp is distinct from 'going' then return new; end if;
  if tg_op = 'UPDATE' and old.rsvp = 'going' then return new; end if;

  -- Verrou de la ligne parente : deux inscriptions concurrentes se suivent,
  -- la seconde compte APRÈS la première (READ COMMITTED : nouvel instantané
  -- par instruction une fois le verrou obtenu).
  select id, status, max_attendees, end_at, date_at into ev
    from public.events where id = new.event_id for update;
  if not found then
    raise exception 'activite_introuvable' using errcode = 'P0001';
  end if;
  if ev.status = 'cancelled' then
    raise exception 'activite_annulee' using errcode = 'P0001';
  end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then
    raise exception 'activite_passee' using errcode = 'P0001';
  end if;
  if ev.max_attendees is not null then
    select count(*) into inscrits from public.event_attendees a
      where a.event_id = new.event_id and a.rsvp = 'going' and a.user_id <> new.user_id;
    if inscrits >= ev.max_attendees then
      raise exception 'activite_complete' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.event_attendees_etat_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ev record;
begin
  -- Aucune session (postgres, service_role, tâches d'administration) : la règle
  -- ne s'applique pas — même sortie que `event_attendees_capacite_gardee`.
  if auth.uid() is null then return new; end if;
  if new.rsvp = 'declined' then return new; end if;
  -- ⚠️ « rsvp inchangé » ne suffit pas : déplacer une ligne « going » vers une
  -- autre activité (passée, annulée) garde son rsvp. C'est une inscription à
  -- l'activité d'arrivée, jugée comme telle — sans compter sur la seule garde
  -- `trg_event_attendees_figes` (exigée au verdict, voir plus bas).
  if tg_op = 'UPDATE' and new.rsvp is not distinct from old.rsvp
     and new.event_id is not distinct from old.event_id then return new; end if;

  select status, date_at, end_at into ev from public.events where id = new.event_id;
  -- Activité inconnue : la clé étrangère tranche (23503), pas cette garde.
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'activite_annulee' using errcode = 'P0001';
  end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then
    raise exception 'activite_passee' using errcode = 'P0001';
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.event_attendees_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then return new; end if;
  if new.event_id is distinct from old.event_id then
    raise exception 'inscription_activite_figee' using errcode = 'P0001',
      hint = 'Une inscription ne se déplace pas : se désinscrire, puis s''inscrire à l''autre activité.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'inscription_compte_fige' using errcode = 'P0001',
      hint = 'Une inscription ne change pas de compte.';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.event_attendees_pointage_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ev record;
begin
  if auth.uid() is null then return new; end if;
  if new.checked_in_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.checked_in_at is not null then return new; end if;
  select status, date_at, end_at into ev from public.events where id = new.event_id;
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'pointage_annulee' using errcode = 'P0001';
  end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then
    raise exception 'pointage_hors_fenetre' using errcode = 'P0001';
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.event_auteur_bloque(_event_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.events e
                 where e.id = _event_id and public.is_blocked_with(e.author_id));
$function$;
CREATE OR REPLACE FUNCTION public.events_admission_gardee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     AND OLD.author_id IS DISTINCT FROM (auth.uid())::text THEN
    RAISE EXCEPTION 'author_id ne peut etre reassigne que par l''auteur courant'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.adult_access_allowed() THEN RETURN NEW; END IF;

  IF NEW.status = 'cancelled' AND OLD.author_id = (auth.uid())::text THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'modification d''un evenement refusee : admission requise'
    USING ERRCODE = 'check_violation';
END
$function$;
CREATE OR REPLACE FUNCTION public.events_poser_secret_pointage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.event_checkin_secrets (event_id, secret)
    values (new.id, public.checkin_secret_generer())
    on conflict (event_id) do nothing;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.export_compte_instantane(p_uid text, p_plafond integer DEFAULT 5000, p_verrou bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  paires   text[][] := array[
    ['posts', 'author_id'],
    ['post_likes', 'user_id'],
    ['post_comments', 'author_id'],
    ['post_collaborators', 'user_id'],
    ['comment_interactions', 'user_id'],
    ['comment_likes', 'user_id'],
    ['stories', 'author_id'],
    ['story_views', 'user_id'],
    ['events', 'author_id'],
    ['event_attendees', 'user_id'],
    ['event_comments', 'author_id'],
    ['event_reactions', 'user_id'],
    ['conv_messages', 'from_id'],
    ['conv_members', 'user_id'],
    ['conv_reads', 'user_id'],
    ['call_invites', 'from_id'],
    ['call_invites', 'to_id'],
    ['notifications', 'user_id'],
    ['follows', 'follower_id'],
    ['blocks', 'blocker_id'],
    ['push_subscriptions', 'user_id'],
    ['user_state', 'user_id'],
    ['user_safety', 'user_id'],
    ['user_passions', 'user_id'],
    ['passion_quotas', 'user_id'],
    ['passion_requests', 'user_id'],
    ['step_interactions', 'user_id'],
    ['video_lives', 'author_id'],
    ['cdv_lives', 'author_id'],
    ['cdv_live_steps', 'author_id'],
    ['cdv_live_comments', 'author_id'],
    ['cdv_live_reactions', 'user_id'],
    ['cdv_live_followers', 'user_id'],
    ['cdv_live_collaborators', 'user_id'],
    ['profiles', 'id']
  ];
  i         integer;
  t         text;
  c         text;
  a_created boolean;
  a_id      boolean;
  ordre     text;
  lignes    jsonb;
  attendu   bigint;
  tables    jsonb := '{}'::jsonb;
  absentes  text[] := '{}';
  plafond   integer := greatest(coalesce(p_plafond, 5000), 1);
begin
  if p_uid is null or p_uid = '' then raise exception 'export_compte_instantane : uid obligatoire'; end if;
  for i in 1 .. array_length(paires, 1) loop
    t := paires[i][1]; c := paires[i][2];
    if to_regclass('public.' || t) is null then
      absentes := absentes || (t || '.' || c);
      continue;
    end if;
    if not exists (select 1 from pg_attribute where attrelid = to_regclass('public.' || t) and attname = c and not attisdropped) then
      absentes := absentes || (t || '.' || c);
      continue;
    end if;
    a_created := exists (select 1 from pg_attribute where attrelid = to_regclass('public.' || t) and attname = 'created_at' and not attisdropped);
    a_id      := exists (select 1 from pg_attribute where attrelid = to_regclass('public.' || t) and attname = 'id' and not attisdropped);
    ordre := case when a_created and a_id then 'created_at, id' when a_id then 'id' when a_created then 'created_at' else null end;
    -- Le compte et les lignes viennent du MÊME snapshot : ils ne peuvent pas
    -- diverger. `attendu` est rendu quand même, pour que le client le confronte.
    execute format('select count(*) from public.%I where %I::text = $1', t, c) into attendu using p_uid;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select * from public.%I where %I::text = $1 %s limit $2) x',
      t, c, case when ordre is null then '' else 'order by ' || ordre end)
      into lignes using p_uid, plafond;
    tables := tables || jsonb_build_object(t || '.' || c, jsonb_build_object(
      'lignes', lignes,
      'attendu', attendu,
      'tronque', attendu > plafond,
      'ordre', ordre,
      'ordre_total', a_id));
    -- La prise du banc : après la PREMIÈRE table lue, on attend le verrou. Le
    -- snapshot, lui, est déjà pris depuis le début de l'ordre appelant.
    if p_verrou is not null and i = 1 then perform pg_advisory_xact_lock(p_verrou); end if;
  end loop;
  return jsonb_build_object(
    'instantane', pg_current_snapshot()::text,
    'prise_le', now(),
    'plafond', plafond,
    'tables', tables,
    'absentes', absentes);
end $function$;
CREATE OR REPLACE FUNCTION public.fil_compteurs(_post_ids text[])
 RETURNS TABLE(post_id text, likes integer, aime boolean, commentaires integer, apercus jsonb, reactions jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cibles as (
    -- 60 identifiants au plus, dédupliqués, sans NULL : la borne est celle de
    -- la plus grande page du produit (profil visité). Au-delà, on ignore.
    -- ⚠️ Bornée APRÈS aplatissement : une tranche [1:60] posée avant `unnest`
    -- ne bornait que la première dimension — un tableau imbriqué (accepté par
    -- la conversion JSON → text[] de PostgREST) passait entier (contre-revue).
    select distinct s.pid
      from (
        select u.pid
          from unnest(coalesce(_post_ids, '{}'::text[])) with ordinality as u(pid, n)
         where u.pid is not null
         order by u.n
         limit 60
      ) s
  )
  select
    c.pid as post_id,
    (select count(*)::integer from public.post_likes l where l.post_id = c.pid) as likes,
    exists (
      select 1 from public.post_likes l
       where l.post_id = c.pid and l.user_id = (select auth.uid())::text
    ) as aime,
    (select count(*)::integer from public.post_comments k where k.post_id = c.pid) as commentaires,
    -- Les deux plus récents, SANS le profil de l'auteur : `profiles.passions`
    -- pèse ~1 Ko par ligne (mesuré, jusqu'à 2,9 Ko) et le client tient déjà un
    -- cache de profils (`_resolveProfilesByIds`) qui ne redemande que les
    -- manquants. Recopier l'identité ici doublerait ce que le cache évite.
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', a.id,
                 'author_id', a.author_id,
                 'content', a.content,
                 'created_at', a.created_at)
               order by a.created_at desc, a.id desc)
        from (
          select k.id, k.author_id, k.content, k.created_at
            from public.post_comments k
           where k.post_id = c.pid
           order by k.created_at desc, k.id desc
           limit 2
        ) a
    ), '[]'::jsonb) as apercus,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', i.user_id, 'kind', i.kind,
                 'payload', i.payload, 'created_at', i.created_at)
               order by i.created_at)
        from public.comment_interactions i
       where i.comment_id = c.pid
         and i.kind in ('emoji', 'gif')
         and i.payload is not null
    ), '[]'::jsonb) as reactions
  from cibles c;
$function$;
CREATE OR REPLACE FUNCTION public.follows_identifiants_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.follower_id <> old.follower_id or new.following_id <> old.following_id then
    raise exception 'follows : les identifiants d''un abonnement ne se modifient pas' using errcode = '42501';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.follows_notifier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare acteur text; cible text; genre text; texte text; ident text; nom text;
begin
  if TG_OP = 'INSERT' then
    if new.follower_id = new.following_id then return new; end if;
    acteur := new.follower_id; cible := new.following_id;
    if new.status = 'pending' then
      genre := 'follow_request'; texte := 'souhaite s''abonner à ton compte privé';
      ident := 'n_fr_' || left(acteur, 8) || '_' || left(cible, 8);
    else
      genre := 'follow'; texte := 'a commencé à te suivre';
      ident := 'n_fw_' || left(acteur, 8) || '_' || left(cible, 8);
    end if;
  elsif TG_OP = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    acteur := new.following_id; cible := new.follower_id;
    genre := 'follow'; texte := 'a accepté ta demande d''abonnement';
    ident := 'n_fa_' || left(acteur, 8) || '_' || left(cible, 8);
  else
    return new;
  end if;
  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = acteur;
  -- Notification d'origine serveur (`trg_notifications_origine` lit ce réglage),
  -- comme `notifier_mentions` et `promouvoir_attente` (revue du 2026-11-03).
  perform set_config('passio.notification_serveur', '1', true);
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values (ident, cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now())
    on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now()
      -- Garde par destinataire ET émetteur (revue du 2026-11-03) : une ligne d'autrui
      -- sous cet identifiant (squat, collision de préfixes) n'est jamais réécrite.
      where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id;
    -- Repli (revue du 2026-11-03), celui de `notifier_mentions` : la ligne en place est
    -- d'autrui (deux comptes dont les uuid partagent leurs 8 premiers caractères) —
    -- la notification s'écrit sous un identifiant neuf plutôt que de se perdre.
    if not found then
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values (left(ident, 5) || left(md5(ident || '|' || clock_timestamp()::text || '|' || random()::text), 20),
              cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now());
    end if;
  exception when others then
    raise warning 'follows_notifier : notification non écrite (%) — l''abonnement est conservé', sqlerrm;
  end;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.follows_statut_initial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.follower_id <> new.following_id
     and exists (select 1 from public.profiles p where p.id = new.following_id and p.is_private = true) then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.genres_reserves_au_serveur(p_kind text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select p_kind in ('mention', 'follow', 'follow_request', 'follow_accept') $function$;
CREATE OR REPLACE FUNCTION public.identifiant_reserve_au_serveur(p_id text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_id like 'n\_m\_%'
      or p_id like 'n\_pa\_%'
      or p_id like 'n\_fw\_%'
      or p_id like 'n\_fr\_%'
      or p_id like 'n\_fa\_%'
$function$;
CREATE OR REPLACE FUNCTION public.identifiants_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare col text; avant text; apres text;
begin
  foreach col in array TG_ARGV loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into avant, apres using old, new;
    if avant is distinct from apres then
      raise exception '% : la colonne % ne se modifie pas', TG_TABLE_NAME, col using errcode = '42501';
    end if;
  end loop;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.identite_affichage_canonique()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  proprietaire text;
  p            record;
begin
  -- Le propriétaire est `author_id` partout, sauf step_interactions (`user_id`).
  proprietaire := coalesce(to_jsonb(new) ->> 'author_id', to_jsonb(new) ->> 'user_id');
  if proprietaire is null then
    return new;                       -- rien à rattacher : on laisse la RLS trancher
  end if;

  select username, avatar_url, emoji into p from public.profiles where id = proprietaire;
  if not found then
    return new;                       -- pas de profil (compte incomplet) : on ne fabrique rien
  end if;

  -- Inconditionnel : ce que le client a proposé n'est jamais retenu.
  if to_jsonb(new) ? 'author_name'  then new.author_name  := p.username;   end if;
  if to_jsonb(new) ? 'author_photo' then new.author_photo := p.avatar_url; end if;
  if to_jsonb(new) ? 'author_emoji' then new.author_emoji := p.emoji;      end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.irl_interaction_allowed(_other text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    WHEN public.is_blocked_with(_other) THEN FALSE
    ELSE (
      COALESCE((
        SELECT s.majority_at <= CURRENT_DATE
          FROM public.user_safety s
         WHERE s.user_id = (auth.uid())::text
      ), FALSE)
      AND
      COALESCE((
        SELECT s.majority_at <= CURRENT_DATE
          FROM public.user_safety s
         WHERE s.user_id = _other
      ), FALSE)
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.is_adult_declared()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    ELSE COALESCE((
      SELECT s.majority_at <= CURRENT_DATE
        FROM public.user_safety s
       WHERE s.user_id = (auth.uid())::text
    ), FALSE)
  END
$function$;
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.blocks b
       WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
          OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.is_conv_member(_conv_id text, _uid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $function$;
CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conv_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.conversations c
       WHERE c.id = _conv_id
         AND c.created_by = (auth.uid())::text
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.limiter_debit_global()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  col_temps   text := TG_ARGV[0];
  max_par_min int  := TG_ARGV[1]::int;
  cnt         int;
begin
  -- ASTRA-02 : la date est celle du serveur, quoi que le client ait envoyé.
  -- `json_populate_record` réécrit UNE colonne de NEW sans connaître la table.
  new := json_populate_record(new, json_build_object(col_temps, now()));
  execute format('select count(*) from %I.%I where %I > now() - interval ''1 minute''',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME, col_temps) into cnt;
  if cnt >= max_par_min then
    raise exception 'rate limit: plafond global de % insertions/minute atteint sur %', max_par_min, TG_TABLE_NAME
      using errcode = 'P0001';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.notes_evenement(p_event_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when auth.uid() is null then null
    else (
      select jsonb_build_object(
        'avg', case when n.nb >= 3 or public.organise_activite(p_event_id) then n.moyenne end,
        'count', n.nb)
      from (
        select count(*)::integer as nb, avg(a.rating)::numeric(4,2) as moyenne
        from public.event_attendees a
        where a.event_id = p_event_id
          and a.rating is not null
          and (a.rsvp = 'going' or a.checked_in_at is not null)
      ) n)
  end;
$function$;
CREATE OR REPLACE FUNCTION public.notifications_origine()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Le réglage n'est posé que par les fonctions du serveur, dans LEUR
  -- transaction ; un client (PostgREST) ne peut pas l'atteindre.
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.notifier_mentions(p_genre text, p_ref_id text, p_mentionnes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  moi        text := (auth.uid())::text;
  nom        text;
  contexte   text;
  cible      text;
  ids        text[];
  notifiees  integer := 0;
  ident      text;
begin
  if moi is null then raise exception 'notifier_mentions : session requise' using errcode = '42501'; end if;
  if p_genre not in ('commentaire', 'message') then raise exception 'notifier_mentions : genre inconnu' using errcode = '22023'; end if;
  if p_ref_id is null or p_ref_id = '' then raise exception 'notifier_mentions : référence requise' using errcode = '22023'; end if;
  ids := array(select distinct x from unnest(coalesce(p_mentionnes, '{}')) x where x is not null and x <> moi);
  if coalesce(array_length(ids, 1), 0) > 20 then raise exception 'notifier_mentions : au plus 20 mentions' using errcode = '22023'; end if;

  -- L'ÉVÉNEMENT MÉTIER : un commentaire / un message RÉCENT de l'appelant, ici.
  if p_genre = 'commentaire' then
    if not exists (select 1 from public.post_comments c where c.post_id = p_ref_id and c.author_id = moi and c.created_at > now() - interval '10 minutes') then
      raise exception 'notifier_mentions : aucun commentaire récent de l''appelant sur cette publication' using errcode = 'P0002';
    end if;
    contexte := 'un commentaire';
  else
    if not exists (select 1 from public.conv_messages m where m.conv_id = p_ref_id and m.from_id = moi and m.created_at > now() - interval '10 minutes') then
      raise exception 'notifier_mentions : aucun message récent de l''appelant dans cette conversation' using errcode = 'P0002';
    end if;
    select case when c.is_group then '« ' || coalesce(nullif(btrim(c.name), ''), 'un groupe') || ' »' else 'une conversation' end
      into contexte from public.conversations c where c.id = p_ref_id;
    contexte := coalesce(contexte, 'une conversation');
  end if;

  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = moi;
  perform set_config('passio.notification_serveur', '1', true);

  foreach cible in array ids loop
    -- AUTORISÉ ? compte existant, non bloqué (dans les deux sens), membre pour un message.
    if not exists (select 1 from public.profiles p where p.id = cible) then continue; end if;
    if public.is_blocked_with(cible) then continue; end if;
    if p_genre = 'message' and not exists (select 1 from public.conv_members cm where cm.conv_id = p_ref_id and cm.user_id = cible) then continue; end if;
    ident := 'n_m_' || left(md5(p_genre || '|' || p_ref_id || '|' || moi || '|' || cible), 20);
    -- ⚠️ ON CONFLICT GARDÉ PAR DESTINATAIRE (sixième contre-revue, 16/09) : la
    -- mise à jour ne touche la ligne existante QUE si c'est bien la mention de
    -- CE destinataire par CET émetteur. Une ligne préexistante sous cet
    -- identifiant qui appartient à quelqu'un d'autre (squat, collision) n'est
    -- ni réécrite ni comptée : on écrit alors la mention sous un identifiant
    -- neuf, pour que la personne mentionnée la reçoive quand même.
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values (ident, cible, 'mention', moi, p_ref_id, coalesce(nom, 'Quelqu''un') || ' t''a mentionné dans ' || contexte, false, now())
    on conflict (id) do update set content = excluded.content, seen = false, created_at = now()
      where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id and public.notifications.kind = 'mention';
    if not found then
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values ('n_m_' || left(md5(ident || '|' || clock_timestamp()::text || '|' || random()::text), 20), cible, 'mention', moi, p_ref_id,
              coalesce(nom, 'Quelqu''un') || ' t''a mentionné dans ' || contexte, false, now());
    end if;
    notifiees := notifiees + 1;
  end loop;
  -- Un COMPTE, jamais la liste : dire qui a été écarté révélerait un blocage.
  return jsonb_build_object('demandees', coalesce(array_length(ids, 1), 0), 'notifiees', notifiees);
end $function$;
CREATE OR REPLACE FUNCTION public.objets_stockage_du_compte(p_uid uuid)
 RETURNS TABLE(bucket_id text, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.bucket_id, o.name
  from storage.objects o
  where o.owner = p_uid
     or o.owner_id = p_uid::text
  order by o.bucket_id, o.name
$function$;
CREATE OR REPLACE FUNCTION public.organise_activite(p_event_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text))
  );
$function$;
CREATE OR REPLACE FUNCTION public.participants_compte(p_event_ids text[])
 RETURNS TABLE(event_id text, going integer, maybe integer, waitlist integer, checked_in integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.event_id,
         count(*) filter (where coalesce(a.rsvp, 'going') not in ('maybe', 'waitlist', 'declined'))::integer,
         count(*) filter (where a.rsvp = 'maybe')::integer,
         count(*) filter (where a.rsvp = 'waitlist')::integer,
         count(*) filter (where a.checked_in_at is not null)::integer
  from public.event_attendees a
  where auth.uid() is not null
    and a.event_id = any (p_event_ids[1:200])
  group by a.event_id;
$function$;
CREATE OR REPLACE FUNCTION public.passion_plier(p_texte text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select btrim(regexp_replace(
    public.unaccent_immutable(coalesce(p_texte, '')), '[^a-z0-9]+', ' ', 'g'));
$function$;
CREATE OR REPLACE FUNCTION public.passion_request_auto_creer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p   record;
  v_pos int;
begin
  -- creer_passion() garde ses garde-fous : nom valide, déduplication
  -- (accents / casse / alias), 5 créations / 24 h, 30 au total.
  -- Si le nom existe déjà, elle renvoie la passion existante.
  select * into v_p from public.creer_passion(new.label, null);

  select coalesce(max(up.position), -1) + 1 into v_pos
    from public.user_passions up
   where up.user_id = new.user_id;

  insert into public.user_passions (user_id, passion_id, position, archived)
  values (new.user_id, v_p.id, v_pos, false)
  on conflict (user_id, passion_id) do update set archived = false;
  -- trg_user_passions_sync répercute dans profiles.passions

  new.status              := 'approved';
  new.resolved_passion_id := v_p.id;
  new.updated_at          := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.passion_requests_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  moi      text := (auth.uid())::text;
  recentes integer;
begin
  -- Sans identité : un rôle CLIENT (un visiteur, ou un jeton sans compte) est
  -- refusé ICI — la garde ne dépend d'aucune autre fonction pour le visiteur, et
  -- le refus ne dit rien du compte visé. L'administration (rôle « none » d'une
  -- migration, service_role, restauration) n'est pas jugée.
  if moi is null then
    if pg_catalog.current_setting('role', true) in ('anon', 'authenticated') then
      raise exception 'new row violates row-level security policy for table "passion_requests"'
        using errcode = '42501';
    end if;
    return new;
  end if;
  -- Ce que le CLIENT dépose : une demande à SON nom, en attente, non résolue.
  -- Jugé ICI, sur SES valeurs : la policy ne voit la ligne qu'après
  -- trg_passion_request_auto, qui la pose « approved » et résolue — et qui
  -- écrit dans user_passions pour new.user_id : refusée plus tard, une demande
  -- au nom d'autrui laissait l'erreur dire si ce compte est en suppression.
  if new.user_id is distinct from moi
     or new.status is distinct from 'pending'
     or new.resolved_passion_id is not null then
    raise exception 'new row violates row-level security policy for table "passion_requests"'
      using errcode = '42501';
  end if;
  -- Ce que le serveur pose : l'identifiant, l'heure (une date fournie ne fait
  -- plus sortir la demande de la fenêtre de 24 h) et le libellé replié — la
  -- seule colonne de l'index unique avec user_id, et la seule que lisent les
  -- outils d'opérateur.
  new.id               := pg_catalog.gen_random_uuid();
  new.created_at       := pg_catalog.now();
  new.updated_at       := pg_catalog.now();
  new.normalized_label := public.passion_plier(new.label);
  -- Le verrou consultatif du compte, de TRANSACTION : il sérialise deux dépôts
  -- simultanés (le second compte APRÈS le premier — READ COMMITTED : chaque
  -- instruction prend un nouvel instantané) et tombe au commit comme à
  -- l'annulation, quelle que soit la connexion qui le portait.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('passion_requests:' || moi));
  -- Une demande en DOUBLE est refusée ici, avant trg_passion_request_auto : un
  -- ON CONFLICT DO NOTHING (Prefer: resolution=ignore-duplicates) n'écarte la
  -- ligne qu'APRÈS les déclencheurs BEFORE — creer_passion aurait tourné, la
  -- passion aurait été rattachée, et le quota n'aurait jamais compté le dépôt.
  if exists (select 1 from public.passion_requests r
              where r.user_id = moi and r.normalized_label = new.normalized_label) then
    raise exception 'duplicate key value violates unique constraint "passion_requests_unique_par_personne"'
      using errcode = '23505';
  end if;
  -- Cinq demandes par compte et par 24 h.
  select count(*) into recentes
    from public.passion_requests r
   where r.user_id = moi
     and r.created_at > pg_catalog.now() - interval '24 hours';
  if recentes >= 5 then
    raise exception 'new row violates row-level security policy for table "passion_requests"'
      using errcode = '42501', hint = 'quota : 5 demandes par compte et par 24 h';
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.passions_recherche_calculer(p_label text, p_aliases text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select trim(regexp_replace(
    public.unaccent_immutable(coalesce(p_label, '')) || ' ' ||
    coalesce((select string_agg(public.unaccent_immutable(a), ' ') from unnest(coalesce(p_aliases, '{}'::text[])) a), ''),
    '[^a-z0-9 ]+', ' ', 'g'));
$function$;
CREATE OR REPLACE FUNCTION public.pilotage_audience(p_secondes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  v_s      integer     := greatest(60, least(coalesce(p_secondes, 300), 86400));
  v_depuis timestamptz := now() - make_interval(secs => v_s);
  v_out    jsonb;
  v_sat    integer;
  v_aveugle integer;
  v_plafond integer;
begin
  with l as (
    -- `hors` ne vaut jamais NULL : une ligne `platform` NULL est du public,
    -- comme dans traficHorsPublic (logique à trois valeurs, contre-revue).
    select nullif(t.user_id, '') as user_id, nullif(t.device_id, '') as device_id,
           (coalesce(t.meta->>'trafic', '') in ('robot', 'emulation', 'equipe')
             or (coalesce(t.platform = 'ios', false) and coalesce(t.connection, '') <> '')) as hors
      from public.telemetry_events t
     where t.env = 'production' and t.received_at >= v_depuis
  ),
  hp as (
    select distinct device_id from l where hors and device_id is not null
  ),
  pub as (
    select l.user_id, l.device_id from l
     where not l.hors
       and (l.device_id is null or not exists (select 1 from hp where hp.device_id = l.device_id))
  )
  select jsonb_build_object(
    'comptes',     (select count(distinct user_id) from pub),
    'appareils',   (select count(distinct device_id) from pub),
    'hors_public', (select count(*) from hp),
    'secondes',    v_s
  ) into v_out;

  if v_s > 900 then
    return v_out || jsonb_build_object('comptes_connectes', null, 'comptes_5xx_15min', null,
                                       'comptes_echecs_30min', null, 'saturation_minute_max', null,
                                       'saturation_aveugle', null, 'saturation_plafond', null);
  end if;

  -- TOUTES les lignes, tous environnements : la jauge, et le mur de trg_debit_global.
  select coalesce(max(c), 0) into v_sat from (
    select count(*) as c from public.telemetry_events t
     where t.received_at >= now() - interval '5 minutes'
     group by date_trunc('minute', t.received_at)) m;
  if to_regclass('public.telemetrie_debit') is not null
     and exists (select 1 from pg_trigger g
                  where g.tgrelid = 'public.telemetry_events'::regclass
                    and g.tgname = 'trg_debit_lot' and not g.tgisinternal and g.tgenabled = 'O') then
    select coalesce(max(d.n), 0) into v_aveugle from public.telemetrie_debit d
     where d.reservoir = 'anciens' and d.source = '*'
       and d.minute >= date_trunc('minute', now() - interval '5 minutes');
    v_plafond := public.telemetrie_plafond('anciens');
    -- Les DEUX murs à la fois (une migration d'avant rejouée) : le pire des deux.
    if exists (select 1 from pg_trigger g
                where g.tgrelid = 'public.telemetry_events'::regclass
                  and g.tgname = 'trg_debit_global' and not g.tgisinternal and g.tgenabled = 'O')
       and v_sat::numeric / 3000 > v_aveugle::numeric / v_plafond then
      v_aveugle := v_sat;
      v_plafond := 3000;
    end if;
  else
    v_aveugle := v_sat;
    v_plafond := 3000;
  end if;

  return v_out || jsonb_build_object(
    'comptes_connectes', (
      select count(distinct t.auth_uid) from public.telemetry_events t
       where t.env = 'production' and t.auth_uid is not null and t.received_at >= v_depuis),
    'comptes_5xx_15min', (
      select count(distinct t.auth_uid) from public.telemetry_events t
        join auth.users u on u.id = t.auth_uid
       where t.env = 'production' and t.type = 'api' and t.http_status >= 500
         and t.received_at >= now() - interval '15 minutes'
         and u.created_at < now() - interval '7 days'
         and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)),
    'comptes_echecs_30min', (
      select count(distinct t.auth_uid) from public.telemetry_events t
        join auth.users u on u.id = t.auth_uid
       where t.env = 'production' and t.type in ('error', 'api')
         and t.received_at >= now() - interval '30 minutes'
         and public.pilotage_famille_echec(t.type, t.status, t.http_status, t.endpoint, t.message, t.meta) is not null
         and u.created_at < now() - interval '24 hours'
         and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)),
    'saturation_minute_max', v_sat,
    'saturation_aveugle', v_aveugle,
    'saturation_plafond', v_plafond
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.pilotage_croissance(p_jours integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with bornes as (
    select greatest(1, least(coalesce(p_jours, 30), 120)) as j, (now() at time zone 'UTC')::date as auj
  ),
  cumul as (
    select c.mesure, c.valeur, sum(c.n)::integer as n
      from public.croissance_jour c, bornes b
     where c.jour > b.auj - b.j
     group by c.mesure, c.valeur
  ),
  actifs as (
    select a.jour, count(*)::integer as n
      from public.activite_jour a, bornes b
     where a.jour > b.auj - b.j
     group by a.jour
  ),
  comptes as (
    select u.id, (u.created_at at time zone 'UTC')::date as cree
      from auth.users u
     where u.deleted_at is null
       and coalesce(u.is_anonymous, false) = false
       and u.email_confirmed_at is not null
       and lower(coalesce(u.email, '')) not like '%@passio-e2e.test'
       and lower(coalesce(u.email, '')) <> '<adresse-du-compte-editeur-expurgee>'
       and u.created_at > now() - interval '70 days'
  ),
  cohortes as (
    select date_trunc('week', c.cree)::date as semaine,
           count(*)::integer as taille,
           count(*) filter (where exists (select 1 from public.activite_jour a where a.uid = c.id and a.jour = c.cree + 1))::integer as j1,
           count(*) filter (where exists (select 1 from public.activite_jour a where a.uid = c.id and a.jour between c.cree + 7 and c.cree + 13))::integer as j7,
           count(*) filter (where exists (select 1 from public.activite_jour a where a.uid = c.id and a.jour between c.cree + 30 and c.cree + 36))::integer as j30,
           max(c.cree) as dernier
      from comptes c
     group by 1
  )
  select jsonb_build_object(
    'jours', (select j from bornes),
    'cumul', coalesce((select jsonb_agg(jsonb_build_object('mesure', mesure, 'valeur', valeur, 'n', n) order by mesure, n desc) from cumul), '[]'::jsonb),
    'actifs', coalesce((select jsonb_agg(jsonb_build_object('jour', jour, 'n', n) order by jour) from actifs), '[]'::jsonb),
    'cohortes', coalesce((select jsonb_agg(jsonb_build_object('semaine', semaine, 'taille', taille, 'j1', j1, 'j7', j7, 'j30', j30, 'dernier', dernier) order by semaine desc) from cohortes), '[]'::jsonb),
    'agrege_le', (select max(jour) from public.croissance_jour)
  );
$function$;
CREATE OR REPLACE FUNCTION public.pilotage_famille_echec(p_type text, p_status text, p_http integer, p_endpoint text, p_message text, p_meta jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select case
    when p_type = 'error' and coalesce(p_message, '') <> '' then 'error:' || left(p_message, 500)
    when p_type = 'api' and p_status = 'error' and p_http between 400 and 599
         and not (p_http < 500 and coalesce(p_meta->>'refus_attendu', '') = 'true')
         and not (p_http < 500 and coalesce(p_endpoint, '') like '%/auth/v1/token%')
      then 'api:' || p_http || ' ' || coalesce(nullif(regexp_replace(split_part(coalesce(p_endpoint, ''), '?', 1), '^[^/]*', ''), ''), '/')
  end
$function$;
CREATE OR REPLACE FUNCTION public.pilotage_familles_erreurs(p_version text, p_depuis timestamp with time zone)
 RETURNS TABLE(famille text, comptes integer, n integer, comptes_ailleurs integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  -- Jamais plus de 24 h en arrière, jamais dans le futur.
  v_depuis timestamptz := least(now(), greatest(coalesce(p_depuis, now()), now() - interval '24 hours'));
  -- Comptes créés 7 jours au moins AVANT la mise en ligne.
  v_avant  timestamptz := v_depuis - interval '7 days';
begin
  if p_version is null or p_version !~ '^[0-9a-f]{7,40}$' then
    return;
  end if;
  return query
  with ici as (
    select public.pilotage_famille_echec(t.type, t.status, t.http_status, t.endpoint, t.message, t.meta) as f, t.auth_uid
      from public.telemetry_events t
      join auth.users u on u.id = t.auth_uid
     where t.env = 'production' and t.type in ('error', 'api')
       and t.app_version = p_version and t.received_at >= v_depuis
       and u.created_at < v_avant and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
  ),
  g as (
    select ici.f, count(distinct ici.auth_uid)::integer as c, count(*)::integer as k
      from ici where ici.f is not null
     group by ici.f
    having count(distinct ici.auth_uid) >= 2
  ),
  ailleurs as (
    select x.f, count(distinct x.auth_uid)::integer as c from (
      select public.pilotage_famille_echec(t.type, t.status, t.http_status, t.endpoint, t.message, t.meta) as f, t.auth_uid
        from public.telemetry_events t
        join auth.users u on u.id = t.auth_uid
       where t.env = 'production' and t.type in ('error', 'api')
         and t.received_at >= now() - interval '24 hours'
         and t.app_version is distinct from p_version
         and u.created_at < v_avant and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    ) x
     where x.f in (select g.f from g)
     group by x.f
  )
  -- Les familles NOUVELLES d'abord : une régression partielle ne se cache pas
  -- derrière le bruit de fond déjà vu sur les autres versions.
  select g.f, g.c, g.k, coalesce(a.c, 0)
    from g left join ailleurs a on a.f = g.f
   order by (coalesce(a.c, 0) >= 2), g.c desc, g.k desc
   limit 20;
end
$function$;
CREATE OR REPLACE FUNCTION public.pilotage_mesures()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'base_octets', pg_database_size(current_database()),
    'stockage', coalesce((
      select jsonb_object_agg(s.bucket_id, s.octets)
        from (select o.bucket_id, sum(coalesce((o.metadata->>'size')::bigint, 0)) as octets
                from storage.objects o group by o.bucket_id) s
    ), '{}'::jsonb)
  );
$function$;
CREATE OR REPLACE FUNCTION public.planifier_croissance()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('purge_telemetry_7j', 'purge_telemetrie_paliers', 'agreger_croissance');
  perform cron.schedule('agreger_croissance', '7 * * * *', $q$select public.agreger_croissance_recente()$q$);
  perform cron.schedule('purge_telemetrie_paliers', '0 4 * * *', $q$select public.purge_telemetrie_paliers()$q$);
  return 'agreger_croissance : chaque heure à :07 ; purge_telemetrie_paliers : chaque jour à 04:00 UTC (échecs 7 j, reste 3 j)';
end $function$;
CREATE OR REPLACE FUNCTION public.planifier_purge_marqueurs()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'purge_marqueurs_suppression';
  perform cron.schedule('purge_marqueurs_suppression', '41 3 * * *',
    $q$select public.purger_marqueurs_suppression(interval '45 days')$q$);
  return 'purge_marqueurs_suppression : chaque jour à 03:41 UTC, rétention 45 jours';
end $function$;
CREATE OR REPLACE FUNCTION public.pointer_par_code(p_event_id text, p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  moi text := (auth.uid())::text;
  ev record;
  secret_att text;
  ligne record;
begin
  if auth.uid() is null then return 'non_connecte'; end if;
  select id, status, date_at, end_at into ev from public.events where id = p_event_id;
  if not found then return 'introuvable'; end if;
  select secret into secret_att from public.event_checkin_secrets where event_id = p_event_id;
  if secret_att is null or upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')) <> secret_att then return 'code_incorrect'; end if;
  if ev.status = 'cancelled' then return 'annulee'; end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then return 'hors_fenetre'; end if;
  select rsvp, checked_in_at into ligne from public.event_attendees where event_id = p_event_id and user_id = moi;
  if not found then return 'non_inscrit'; end if;
  if ligne.checked_in_at is not null then return 'deja_pointe'; end if;
  if ligne.rsvp = 'waitlist' or ligne.rsvp = 'declined' then return 'liste_attente'; end if;
  update public.event_attendees set checked_in_at = now() where event_id = p_event_id and user_id = moi;
  if ligne.rsvp = 'maybe' then
    -- Un « peut-être » présent devient inscrit si une place reste (le trigger de
    -- capacité tranche) ; sinon il reste pointé en « peut-être ».
    begin
      update public.event_attendees set rsvp = 'going' where event_id = p_event_id and user_id = moi;
    exception when others then null;
    end;
  end if;
  return 'ok';
end
$function$;
CREATE OR REPLACE FUNCTION public.post_auteur_bloque(_post_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.posts p
                 where p.id = _post_id and public.is_blocked_with(p.author_id));
$function$;
CREATE OR REPLACE FUNCTION public.post_is_visible(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when pid is null then false
    -- Pas de ligne posts : PUBLIC seulement pour un identifiant d'EXEMPLE (le contenu de
    -- démonstration du client n'est dans aucune table). Une publication SUPPRIMÉE, ou un
    -- identifiant inconnu, n'est visible par personne (R31, 2026-11-04 : rendait VRAI).
    when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or public.abonne_accepte_non_bloque(p.author_id)
      )
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.post_masque(p_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.contenus_masques m
     where m.target_type = 'post' and m.target_id = p_id
       and m.decision is distinct from 'retabli'
  );
$function$;
CREATE OR REPLACE FUNCTION public.posts_freeze_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    NEW.author_id := OLD.author_id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.promouvoir_attente(p_event_id text, p_user_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  moi      text := (auth.uid())::text;
  ev       record;
  inscrits integer;
  cible    text;
  nb       integer;
  orga     boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'motif', 'non_connecte'); end if;
  -- Verrou de l'activité : deux promotions (ou une promotion et une inscription)
  -- concurrentes se suivent, la seconde compte APRÈS la première.
  select id, status, max_attendees, date_at, end_at, author_id, title
    into ev from public.events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
  if ev.status = 'cancelled' then return jsonb_build_object('ok', false, 'motif', 'annulee'); end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then return jsonb_build_object('ok', false, 'motif', 'passee'); end if;
  if ev.max_attendees is null then return jsonb_build_object('ok', false, 'motif', 'sans_capacite'); end if;

  -- L'ORGANISATION A UNE DÉFINITION (R24, 2026-11-03) : auteur, organisateur
  -- (`organizer_id`) ou co-organisateur — celle de la liste des participants et
  -- de la discussion d'activité (C-04), lue sous le verrou ci-dessus. La
  -- comparaison qu'on faisait ici oubliait `organizer_id`, et laissait passer
  -- n'importe qui sur une activité sans auteur (`moi <> null` n'est jamais vrai).
  orga := coalesce(public.organise_activite(p_event_id), false);

  if p_user_id is not null then
    -- Promotion CHOISIE : réservée à l'organisation.
    if not orga then
      return jsonb_build_object('ok', false, 'motif', 'non_autorise');
    end if;
    cible := p_user_id;
  end if;

  select count(*) into inscrits from public.event_attendees a
    where a.event_id = p_event_id and a.rsvp = 'going';
  if inscrits >= ev.max_attendees then return jsonb_build_object('ok', false, 'motif', 'complete'); end if;

  if cible is null then
    -- Premier arrivé, premier servi.
    select a.user_id into cible from public.event_attendees a
      where a.event_id = p_event_id and a.rsvp = 'waitlist'
      order by a.created_at asc, a.user_id asc limit 1;
    if cible is null then return jsonb_build_object('ok', false, 'motif', 'personne_en_attente'); end if;
  end if;

  begin
    update public.event_attendees set rsvp = 'going'
      where event_id = p_event_id and user_id = cible and rsvp = 'waitlist';
    get diagnostics nb = row_count;
  exception when others then
    -- Capacité tranchée par le trigger entre-temps, compte en suppression,
    -- admission : le refus est un verdict, pas une erreur.
    return jsonb_build_object('ok', false, 'motif', 'refuse', 'detail', left(sqlerrm, 80));
  end;
  if nb = 0 then return jsonb_build_object('ok', false, 'motif', 'pas_en_attente'); end if;

  -- Notification d'origine serveur, identifiant déterministe (rejeu sans doublon).
  -- ⚠️ `n_pa_` n'est PAS réservé au serveur : un compte peut pré-insérer cet
  -- identifiant à SON nom (policy client : `from_id = auth.uid()` seulement) —
  -- le piège de la 6ᵉ contre-revue du 16/09 sur `n_m_`. Le `on conflict` ne
  -- met donc à jour que la ligne du VRAI destinataire ; sinon on ré-insère sous
  -- un identifiant neuf (revue indépendante du 2026-11-02, point 3e).
  perform set_config('passio.notification_serveur', '1', true);
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values ('n_pa_' || left(p_event_id, 12) || '_' || left(cible, 8), cible, 'event_update', ev.author_id, p_event_id,
            'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
            false, now())
    on conflict (id) do update set content = excluded.content, seen = false, created_at = now()
      where public.notifications.user_id = excluded.user_id and public.notifications.kind = 'event_update';
    if not found then
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values ('n_pa_' || left(md5(p_event_id || '|' || cible || '|' || clock_timestamp()::text), 20), cible, 'event_update', ev.author_id, p_event_id,
              'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
              false, now());
    end if;
  exception when others then
    raise warning 'promouvoir_attente : notification non écrite (%) — la promotion est conservée', sqlerrm;
  end;
  -- QUI a été promu ne se dit qu'à l'organisation, ou à la personne promue
  -- (R24, 2026-11-03). La promotion automatique est ouverte à tout compte
  -- connecté — celui qui libère une place n'a plus de lien avec l'activité une
  -- fois parti (C-04) — et rendre le nom à n'importe quel appelant lui livrait,
  -- un appel à la fois et sans s'inscrire, qui vient. Les autres apprennent que
  -- la place est donnée, pas à qui.
  if orga or cible = moi then
    return jsonb_build_object('ok', true, 'user_id', cible);
  end if;
  return jsonb_build_object('ok', true);
end
$function$;
CREATE OR REPLACE FUNCTION public.propager_identite_affichage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.video_lives
     set author_name = new.username, author_photo = new.avatar_url, author_emoji = new.emoji
   where author_id = new.id;

  update public.event_comments   set author_name = new.username where author_id = new.id;
  update public.cdv_live_comments set author_name = new.username where author_id = new.id;

  update public.step_interactions
     set author_name = new.username, author_emoji = new.emoji
   where user_id = new.id;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.proprietaires_objets_stockage()
 RETURNS TABLE(bucket_id text, name text, owner uuid, owner_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.bucket_id, o.name, o.owner, o.owner_id
  from storage.objects o
  where o.metadata is not null
  order by o.bucket_id, o.name
$function$;
CREATE OR REPLACE FUNCTION public.purge_telemetrie_paliers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer := 0; k integer;
begin
  -- Agréger AVANT de purger : jamais une ligne ne part sans avoir été comptée.
  perform public.agreger_croissance(((now() at time zone 'UTC')::date) - 3);
  perform public.agreger_croissance(((now() at time zone 'UTC')::date) - 2);
  perform public.agreger_croissance(((now() at time zone 'UTC')::date) - 1);
  delete from public.telemetry_events where received_at < now() - interval '7 days';
  get diagnostics k = row_count; n := n + k;
  delete from public.telemetry_events
   where received_at < now() - interval '3 days'
     and coalesce(type, '') <> 'error'
     and coalesce(status, '') <> 'error'
     and coalesce(severity, '') not in ('error', 'fatal', 'warn', 'warning')
     and coalesce(http_status, 0) < 400;
  get diagnostics k = row_count; n := n + k;
  delete from public.activite_jour where jour < ((now() at time zone 'UTC')::date) - 400;
  delete from public.croissance_jour where jour < ((now() at time zone 'UTC')::date) - 400;
  return n;
end $function$;
CREATE OR REPLACE FUNCTION public.purge_telemetry(keep_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.telemetry_events
  WHERE received_at < now() - (keep_days || ' days')::interval;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END
$function$;
CREATE OR REPLACE FUNCTION public.purger_cibles_commentaires()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Les réponses et réactions des commentaires supprimés, de QUI qu'elles soient
  -- (la RLS ne laissait au client effacer que les siennes).
  -- ⚠️ L'identifiant est CHOISI par le client. Un commentaire posé sous le nom d'une
  -- publication, d'un commentaire d'activité, d'un exemple ou d'une réponse ne vise pas
  -- ces réactions-là, et une interaction n'appartient qu'à son FIL. Dans un fil d'exemple,
  -- seul un commentaire au format du client (`c_<uid>`) compte : `c1`, `cp1_1`… sont les
  -- commentaires de démonstration, qu'aucune table ne porte.
  delete from public.comment_interactions i
   using commentaires_supprimes s
   where i.comment_id = s.id
     and (i.post_id is null or i.post_id = s.post_id)
     and s.id !~ '^srep_'
     and not public.est_identifiant_exemple(s.id)
     and (not public.est_identifiant_exemple(s.post_id) or s.id ~ '^c_[0-9a-z]{8,17}$')
     and not exists (select 1 from public.posts p where p.id = s.id)
     and not exists (select 1 from public.event_comments ec where ec.id = s.id);
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.purger_cibles_publications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ids text[];
begin
  -- ⚠️ L'identifiant est CHOISI par le client, et cette fonction efface pour tout le monde.
  -- Une publication créée sous l'identifiant d'une ACTIVITÉ ou d'un EXEMPLE n'est pas le
  -- fil de ce qui s'y écrit : la supprimer n'emporte rien.
  select coalesce(array_agg(s.id), '{}') into ids
    from publications_supprimees s
   where not public.est_identifiant_exemple(s.id)
     and not exists (select 1 from public.events e where e.id = s.id);
  if cardinality(ids) = 0 then return null; end if;
  -- Les commentaires des publications supprimées ; leur propre déclencheur
  -- (`trg_purger_cibles_commentaire`) emporte leurs réponses et réactions.
  delete from public.post_comments c where c.post_id = any (ids);
  delete from public.post_likes l where l.post_id = any (ids);
  delete from public.post_collaborators k where k.post_id = any (ids);
  -- Les interactions dont la publication est le FIL (réactions, réponses, réactions aux
  -- réponses). La CIBLE seule ne vaut que SANS fil, et sans commentaire du même nom : une
  -- ligne qui a un fil appartient à ce fil.
  delete from public.comment_interactions i
   where i.post_id = any (ids)
      or (i.post_id is null and i.comment_id = any (ids)
          and not exists (select 1 from public.post_comments c where c.id = i.comment_id)
          and not exists (select 1 from public.event_comments ec where ec.id = i.comment_id));
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.purger_marqueurs_suppression(p_retention interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  if p_retention < interval '30 days' then
    raise exception 'purger_marqueurs_suppression : rétention < 30 jours refusée (les sauvegardes vivent 30 jours)';
  end if;
  delete from public.comptes_en_suppression where statut = 'supprimee' and supprimee_le < now() - p_retention;
  get diagnostics n = row_count;
  return n;
end $function$;
CREATE OR REPLACE FUNCTION public.rate_limit_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  user_col    text := TG_ARGV[0];
  max_per_min int  := TG_ARGV[1]::int;
  uid         text;
  cnt         int;
BEGIN
  NEW.created_at := now();
  EXECUTE format('SELECT ($1).%I', user_col) INTO uid USING NEW;
  IF uid IS NULL THEN RETURN NEW; END IF;
  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - interval ''1 minute''',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, user_col
  ) INTO cnt USING uid;
  IF cnt >= max_per_min THEN
    RAISE EXCEPTION 'rate limit: max % insertions/minute sur %', max_per_min, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.rechercher_passions(q text, lim integer DEFAULT 20)
 RETURNS TABLE(id text, label text, emoji text, color text, popularity integer, score integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
begin
  if n = '' then
    return query
      select p.id, p.label, p.emoji, p.color, p.popularity, 0
        from public.passions p
       where p.status = 'active'
       order by p.popularity desc, p.sort_order
       limit least(greatest(coalesce(lim, 20), 1), 50);
    return;
  end if;
  return query
    select p.id, p.label, p.emoji, p.color, p.popularity,
           (case
              when p.normalized_label = n then 0
              when p.normalized_label like n || '%' then 10
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) = n) then 20
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) like n || '%') then 30
              when p.normalized_label like '%' || n || '%' then 40
              else 60
            end + case when p.is_broad then 5 else 0 end)::int as score
      from public.passions p
     where p.status = 'active'
       -- `%` = l'opérateur de similarité de pg_trgm (seuil 0,3 par défaut, le même
       -- que l'ancien `similarity() > 0.3`) : lui SEUL lit l'index, la fonction non.
       and (p.recherche like '%' || n || '%' or p.normalized_label % n)
     order by score, p.popularity desc, p.sort_order
     limit least(greatest(coalesce(lim, 20), 1), 50);
end $function$;
CREATE OR REPLACE FUNCTION public.reclamer_suppression(p_uid text, p_jeton uuid, p_motif text DEFAULT 'delete-account'::text, p_perime interval DEFAULT '00:15:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c       public.comptes_en_suppression%rowtype;
  acquise boolean := false;
  motif   text := null;
begin
  if p_uid is null or p_jeton is null then raise exception 'reclamer_suppression : uid et jeton obligatoires'; end if;
  perform pg_advisory_xact_lock(hashtext('comptes_en_suppression:' || p_uid));
  select * into c from public.comptes_en_suppression where user_id = p_uid;
  if not found then
    insert into public.comptes_en_suppression (user_id, motif, statut, jeton, tentatives, tentative_debut, tentative_vivante)
    values (p_uid, p_motif, 'en_cours', p_jeton, 1, now(), true)
    returning * into c;
    acquise := true;
  elsif c.statut = 'supprimee' then
    acquise := false; motif := 'supprimee';
  elsif c.statut in ('en_cours', 'purgee') and c.jeton is distinct from p_jeton
        and c.tentative_vivante and c.tentative_debut > now() - p_perime then
    acquise := false; motif := 'vivante';                -- une autre tentative est VIVANTE (purge ou Auth en cours)
  else
    update public.comptes_en_suppression
       set statut = 'en_cours', jeton = p_jeton, motif = p_motif, tentatives = tentatives + 1,
           tentative_debut = now(), tentative_fin = null, tentative_vivante = true, derniere_erreur = null
     where user_id = p_uid
    returning * into c;
    acquise := true;
  end if;
  return jsonb_build_object('acquise', acquise, 'motif', motif, 'statut', c.statut, 'jeton', c.jeton, 'tentatives', c.tentatives,
                            'tentative_debut', c.tentative_debut, 'purge_terminee_le', c.purge_terminee_le,
                            'donnees_deja_purgees', c.purge_terminee_le is not null);
end $function$;
CREATE OR REPLACE FUNCTION public.refuser_ecriture_compte_en_suppression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  col   text;
  val   text;
  ligne jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := ligne ->> col;
    if val is not null and exists (
         select 1 from public.comptes_en_suppression c
          where c.user_id = val and c.statut in ('en_cours', 'purgee', 'supprimee'))
    then
      raise exception 'new row violates row-level security policy for table "%"', tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.reports_statut_initial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.status := 'open';
  new.handled_at := null;
  new.handled_note := null;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.retours_evenement(p_event_id text)
 RETURNS TABLE(user_id text, rating smallint, feedback text, rated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.user_id, a.rating, a.feedback, a.rated_at
  from public.event_attendees a
  where public.organise_activite(p_event_id)
    and a.event_id = p_event_id
    and (a.rating is not null or nullif(btrim(a.feedback), '') is not null)
  order by a.rated_at desc nulls last;
$function$;
CREATE OR REPLACE FUNCTION public.rid_opaque_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- `rid` n'appartient qu'à la base. Un INSERT reçoit TOUJOURS une valeur
  -- aléatoire neuve — l'expression du défaut de colonne, recopiée : une valeur
  -- fournie par l'appelant (client, upsert, PostgREST) est ignorée, aucun
  -- appelant ne connaît le rid d'une ligne qu'il ne lit pas. Un UPDATE ne le
  -- change jamais.
  if tg_op = 'INSERT' then
    new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
  else
    new.rid := old.rid;
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.storage_chemin_autorise(_bucket text, _name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    (_bucket = 'content'
      and (storage.foldername(_name))[2] = (select auth.uid())::text)
    or
    -- `is_conv_member` est SECURITY DEFINER (vérifié). Un `select … from
    -- conv_members` serait soumis à la RLS de cette table DANS la sous-requête :
    -- une policy de lecture plus stricte demain renverrait un ensemble vide,
    -- c'est-à-dire les pièces jointes cassées pour tous, sans un mot en journal.
    (_bucket = 'attachments'
      and public.is_conv_member((storage.foldername(_name))[2], (select auth.uid())::text));
$function$;
CREATE OR REPLACE FUNCTION public.suppression_de_mon_compte()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then false          -- postgres, service_role, purge, restauration
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text
                    and c.statut in ('en_cours', 'purgee', 'supprimee'))
  end
$function$;
CREATE OR REPLACE FUNCTION public.sync_profil_passions(p_uid text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles pr
     set passions = coalesce((
           select jsonb_agg(
                    jsonb_build_object(
                      'id',       p.id,
                      'label',    p.label,
                      'emoji',    p.emoji,
                      'color',    coalesce(p.color, '#7c3aed'),
                      'bio',      coalesce(anc->>'bio', ''),
                      'archived', up.archived,
                      'coverUrl', anc->'coverUrl',
                      'photoUrl', anc->'photoUrl'
                    )
                    order by up.position, p.label)
             from public.user_passions up
             join public.passions p on p.id = up.passion_id
             left join lateral (
                    select e
                      from jsonb_array_elements(coalesce(pr.passions, '[]'::jsonb)) e
                     where e->>'id' = up.passion_id
                     limit 1
                  ) a(anc) on true
            where up.user_id = p_uid
         ), '[]'::jsonb)
   where pr.id = p_uid;
end $function$;
CREATE OR REPLACE FUNCTION public.telemetrie_debit_avant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  res text;
  m   timestamptz := date_trunc('minute', now());
  v_n integer;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return null;
  end if;
  res := public.telemetrie_reservoir();
  select d.n into v_n from public.telemetrie_debit d where d.minute = m and d.reservoir = res and d.source = '*';
  if coalesce(v_n, 0) >= public.telemetrie_plafond(res) then
    perform public.telemetrie_refuser(res, public.telemetrie_plafond(res));
  end if;
  if res <> 'anciens' then
    select coalesce(sum(d.n), 0) into v_n from public.telemetrie_debit d
     where d.minute = m and d.reservoir in ('neufs', 'anonymes') and d.source = '*';
    if v_n >= public.telemetrie_plafond('autres') then
      perform public.telemetrie_refuser('neufs + anonymes', public.telemetrie_plafond('autres'));
    end if;
  end if;
  if auth.uid() is not null then
    select d.n into v_n from public.telemetrie_debit d
     where d.minute = m and d.reservoir = res and d.source = 'u:' || auth.uid()::text;
    if coalesce(v_n, 0) >= public.telemetrie_plafond('compte') then
      perform public.telemetrie_refuser('compte', public.telemetrie_plafond('compte'));
    end if;
  end if;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.telemetrie_debit_lot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  k   integer;
  res text;
  m   timestamptz := date_trunc('minute', now());
  v_n integer;
begin
  -- La clé service_role (fonctions Edge, scripts d'exploitation) n'est pas limitée.
  if coalesce(auth.role(), '') = 'service_role' then
    return null;
  end if;
  select count(*) into k from nouvelles;
  if k = 0 then
    return null;
  end if;
  res := public.telemetrie_reservoir();

  insert into public.telemetrie_debit as d (minute, reservoir, source, n) values (m, res, '*', k)
    on conflict (minute, reservoir, source) do update set n = d.n + excluded.n
    returning d.n into v_n;
  if v_n > public.telemetrie_plafond(res) then
    perform public.telemetrie_refuser(res, public.telemetrie_plafond(res));
  end if;
  if res <> 'anciens' then
    select coalesce(sum(d.n), 0) into v_n from public.telemetrie_debit d
     where d.minute = m and d.reservoir in ('neufs', 'anonymes') and d.source = '*';
    if v_n > public.telemetrie_plafond('autres') then
      perform public.telemetrie_refuser('neufs + anonymes', public.telemetrie_plafond('autres'));
    end if;
  end if;
  if auth.uid() is not null then
    insert into public.telemetrie_debit as d (minute, reservoir, source, n) values (m, res, 'u:' || auth.uid()::text, k)
      on conflict (minute, reservoir, source) do update set n = d.n + excluded.n
      returning d.n into v_n;
    if v_n > public.telemetrie_plafond('compte') then
      perform public.telemetrie_refuser('compte', public.telemetrie_plafond('compte'));
    end if;
  end if;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.telemetrie_plafond(p_quoi text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_quoi
    when 'anciens'  then 1800   -- réservoir des comptes anciens, à eux seuls
    when 'neufs'    then 1600   -- au plus, pour les comptes neufs…
    when 'anonymes' then 1600   -- … au plus, pour la clé anon…
    when 'autres'   then 2400   -- … et les deux ensemble
    when 'compte'   then 150    -- par compte, quel qu'il soit
    when 'lot'      then 120    -- lignes par instruction (le client en envoie 60 au plus)
  end
$function$;
CREATE OR REPLACE FUNCTION public.telemetrie_refuser(p_quoi text, p_plafond integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'rate limit: % plein (% lignes/minute)', p_quoi, p_plafond
    using errcode = 'PT429', hint = (60 - floor(extract(second from now())))::integer::text;
end $function$;
CREATE OR REPLACE FUNCTION public.telemetrie_reservoir()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then 'anonymes'
    when exists (select 1 from auth.users u
                  where u.id = auth.uid()
                    and u.created_at < now() - interval '7 days'
                    and u.email_confirmed_at is not null
                    and not coalesce(u.is_anonymous, false)) then 'anciens'
    else 'neufs'
  end
$function$;
CREATE OR REPLACE FUNCTION public.telemetrie_taille_lot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k integer;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  k := coalesce(nullif(current_setting('passio.telemetrie_lot', true), ''), '0')::integer + 1;
  perform set_config('passio.telemetrie_lot', k::text, true);
  if k > public.telemetrie_plafond('lot') then
    raise exception 'lot de télémétrie trop gros (plus de % lignes)', public.telemetrie_plafond('lot')
      using errcode = 'PT413';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.telemetry_pose_identite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.auth_uid := auth.uid();   -- NULL pour un visiteur, l'identité réelle sinon
  new.received_at := now();     -- ASTRA-02 : jamais l'heure du client
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.terminer_suppression(p_uid text, p_jeton uuid, p_statut text, p_detail jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.comptes_en_suppression%rowtype;
begin
  if p_statut not in ('echec', 'purgee', 'auth_echec', 'supprimee') then raise exception 'terminer_suppression : statut % inconnu', p_statut; end if;
  update public.comptes_en_suppression
     set statut = case when p_statut = 'supprimee' then 'supprimee'
                       when p_statut = 'echec' and purge_terminee_le is null then 'echec'
                       else 'purgee' end,
         tentative_vivante = (p_statut = 'purgee'),
         tentative_fin = case when p_statut = 'purgee' then null else now() end,
         derniere_erreur = case when p_statut in ('echec', 'auth_echec') then p_detail else null end,
         purge_terminee_le = case when p_statut in ('purgee', 'auth_echec', 'supprimee') then coalesce(purge_terminee_le, now()) else purge_terminee_le end,
         supprimee_le = case when p_statut = 'supprimee' then now() else supprimee_le end
   where user_id = p_uid and jeton = p_jeton and statut in ('en_cours', 'purgee')
  returning * into c;
  if not found then
    select * into c from public.comptes_en_suppression where user_id = p_uid;
    return jsonb_build_object('ok', false, 'motif', case when found then 'jeton_perime' else 'inconnu' end,
                              'statut', c.statut, 'jeton', c.jeton,
                              'protection', found and c.statut in ('en_cours', 'purgee', 'supprimee'),
                              'donnees_deja_purgees', found and c.purge_terminee_le is not null);
  end if;
  return jsonb_build_object('ok', true, 'demande', p_statut, 'statut', c.statut, 'jeton', c.jeton, 'supprimee_le', c.supprimee_le,
                            'protection', c.statut in ('en_cours', 'purgee', 'supprimee'),
                            'donnees_deja_purgees', c.purge_terminee_le is not null);
end $function$;
CREATE OR REPLACE FUNCTION public.trg_passions_recherche()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.recherche := public.passions_recherche_calculer(new.label, new.aliases);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_reports_pretri()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  auteur text;
  n integer;
begin
  if new.target_type is distinct from 'post' then return new; end if;
  select p.author_id into auteur from public.posts p where p.id = new.target_id;
  if auteur is null then return new; end if;
  select count(distinct r.reporter_id) into n
    from public.reports r
    join auth.users u on u.id::text = r.reporter_id
   where r.target_type = 'post' and r.target_id = new.target_id
     and coalesce(r.status, 'open') = 'open'
     and r.reporter_id is distinct from auteur
     and u.deleted_at is null
     and u.email_confirmed_at is not null
     and u.created_at < now() - interval '7 days';
  if n >= 3 then
    insert into public.contenus_masques (target_type, target_id, signaleurs)
    values ('post', new.target_id, n)
    on conflict (target_type, target_id) do update
      set signaleurs = excluded.signaleurs
      where public.contenus_masques.decision is null;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_reports_preuve_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  begin
    insert into public.signalements_preuves (report_id, message_id, conv_id, auteur_id, contenu, envoye_le)
    select new.id, m.id, m.conv_id, m.from_id, m.content, m.created_at
      from public.conv_messages m
     where m.id = new.target_id
       and new.reporter_id is not null
       and public.is_conv_member(m.conv_id, new.reporter_id)
    on conflict (report_id) do nothing;
  exception when others then
    -- Le signalement passe quoi qu'il arrive ; l'absence de preuve, elle, se DIT.
    raise warning 'signalements_preuves : preuve non copiée pour le signalement % (SQLSTATE %, %)', new.id, sqlstate, sqlerrm;
  end;
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.trg_sync_profil_passions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.sync_profil_passions(coalesce(new.user_id, old.user_id));
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.unaccent_immutable(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  select translate(
    lower(txt),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
    'aaaaaaceeeeiiiinooooouuuuyyoa'
  );
$function$;
CREATE OR REPLACE FUNCTION public.user_safety_majorite_non_avancable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.majority_at IS NOT NULL
     AND (NEW.majority_at IS NULL OR NEW.majority_at < OLD.majority_at) THEN
    RAISE EXCEPTION 'majority_at ne peut pas etre avancee (%->%)', OLD.majority_at, NEW.majority_at
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.user_state_horodatage_serveur()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.vient_a_activite(p_event_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.event_attendees a
    where a.event_id = p_event_id
      and a.user_id = (select auth.uid())::text
      and a.rsvp = 'going'
  );
$function$;
revoke all on function public.abonne_accepte_non_bloque(text) from public, anon, authenticated, service_role;
grant execute on function public.abonne_accepte_non_bloque(text) to anon;
grant execute on function public.abonne_accepte_non_bloque(text) to authenticated;
grant execute on function public.abonne_accepte_non_bloque(text) to service_role;
revoke all on function public.adult_access_allowed() from public, anon, authenticated, service_role;
grant execute on function public.adult_access_allowed() to service_role;
grant execute on function public.adult_access_allowed() to authenticated;
revoke all on function public.adult_access_enforced() from public, anon, authenticated, service_role;
grant execute on function public.adult_access_enforced() to service_role;
revoke all on function public.adult_access_status() from public, anon, authenticated, service_role;
grant execute on function public.adult_access_status() to service_role;
grant execute on function public.adult_access_status() to authenticated;
revoke all on function public.agreger_croissance_recente() from public, anon, authenticated, service_role;
grant execute on function public.agreger_croissance_recente() to service_role;
revoke all on function public.agreger_croissance(date) from public, anon, authenticated, service_role;
grant execute on function public.agreger_croissance(date) to service_role;
revoke all on function public.ajouter_passion_utilisateur(text) from public, anon, authenticated, service_role;
grant execute on function public.ajouter_passion_utilisateur(text) to authenticated;
grant execute on function public.ajouter_passion_utilisateur(text) to service_role;
revoke all on function public.appel_autorise(text) from public, anon, authenticated, service_role;
grant execute on function public.appel_autorise(text) to authenticated;
grant execute on function public.appel_autorise(text) to service_role;
revoke all on function public.attendre_ecritures_en_vol(integer) from public, anon, authenticated, service_role;
grant execute on function public.attendre_ecritures_en_vol(integer) to service_role;
revoke all on function public.blocage_entre(text,text) from public, anon, authenticated, service_role;
grant execute on function public.blocage_entre(text,text) to service_role;
revoke all on function public.broadcast_conv_message_to_users() from public, anon, authenticated, service_role;
grant execute on function public.broadcast_conv_message_to_users() to service_role;
revoke all on function public.call_invites_figes() from public, anon, authenticated, service_role;
grant execute on function public.call_invites_figes() to public;
grant execute on function public.call_invites_figes() to anon;
grant execute on function public.call_invites_figes() to authenticated;
grant execute on function public.call_invites_figes() to service_role;
revoke all on function public.call_invites_sonner() from public, anon, authenticated, service_role;
grant execute on function public.call_invites_sonner() to service_role;
revoke all on function public.can_edit_post(text) from public, anon, authenticated, service_role;
grant execute on function public.can_edit_post(text) to authenticated;
grant execute on function public.can_edit_post(text) to service_role;
revoke all on function public.can_join_event_conversation(text) from public, anon, authenticated, service_role;
grant execute on function public.can_join_event_conversation(text) to service_role;
grant execute on function public.can_join_event_conversation(text) to authenticated;
revoke all on function public.checkin_secret_generer() from public, anon, authenticated, service_role;
grant execute on function public.checkin_secret_generer() to service_role;
revoke all on function public.client_errors_pose_identite() from public, anon, authenticated, service_role;
grant execute on function public.client_errors_pose_identite() to service_role;
revoke all on function public.comment_target_visible(text,text) from public, anon, authenticated, service_role;
grant execute on function public.comment_target_visible(text,text) to anon;
grant execute on function public.comment_target_visible(text,text) to authenticated;
grant execute on function public.comment_target_visible(text,text) to service_role;
revoke all on function public.comment_target_visible(text) from public, anon, authenticated, service_role;
grant execute on function public.comment_target_visible(text) to public;
grant execute on function public.comment_target_visible(text) to anon;
grant execute on function public.comment_target_visible(text) to authenticated;
grant execute on function public.comment_target_visible(text) to service_role;
revoke all on function public.conv_1a1_bloquee(text) from public, anon, authenticated, service_role;
grant execute on function public.conv_1a1_bloquee(text) to authenticated;
grant execute on function public.conv_1a1_bloquee(text) to service_role;
revoke all on function public.creer_et_ajouter_passion(text,text) from public, anon, authenticated, service_role;
grant execute on function public.creer_et_ajouter_passion(text,text) to authenticated;
grant execute on function public.creer_et_ajouter_passion(text,text) to service_role;
revoke all on function public.creer_passion(text,text,text[]) from public, anon, authenticated, service_role;
grant execute on function public.creer_passion(text,text,text[]) to authenticated;
grant execute on function public.creer_passion(text,text,text[]) to service_role;
revoke all on function public.creer_passion(text,text) from public, anon, authenticated, service_role;
grant execute on function public.creer_passion(text,text) to authenticated;
grant execute on function public.creer_passion(text,text) to service_role;
revoke all on function public.declare_birth_year(integer) from public, anon, authenticated, service_role;
grant execute on function public.declare_birth_year(integer) to service_role;
grant execute on function public.declare_birth_year(integer) to authenticated;
revoke all on function public.diffuser_ajout_membre() from public, anon, authenticated, service_role;
grant execute on function public.diffuser_ajout_membre() to service_role;
revoke all on function public.diffuser_notification() from public, anon, authenticated, service_role;
grant execute on function public.diffuser_notification() to service_role;
revoke all on function public.est_identifiant_exemple(text) from public, anon, authenticated, service_role;
grant execute on function public.est_identifiant_exemple(text) to service_role;
revoke all on function public.event_attendees_admission_gardee() from public, anon, authenticated, service_role;
grant execute on function public.event_attendees_admission_gardee() to service_role;
revoke all on function public.event_attendees_capacite_gardee() from public, anon, authenticated, service_role;
grant execute on function public.event_attendees_capacite_gardee() to service_role;
revoke all on function public.event_attendees_etat_garde() from public, anon, authenticated, service_role;
grant execute on function public.event_attendees_etat_garde() to service_role;
revoke all on function public.event_attendees_figes() from public, anon, authenticated, service_role;
grant execute on function public.event_attendees_figes() to service_role;
revoke all on function public.event_attendees_pointage_garde() from public, anon, authenticated, service_role;
grant execute on function public.event_attendees_pointage_garde() to service_role;
revoke all on function public.event_auteur_bloque(text) from public, anon, authenticated, service_role;
grant execute on function public.event_auteur_bloque(text) to authenticated;
grant execute on function public.event_auteur_bloque(text) to service_role;
revoke all on function public.events_admission_gardee() from public, anon, authenticated, service_role;
grant execute on function public.events_admission_gardee() to service_role;
revoke all on function public.events_poser_secret_pointage() from public, anon, authenticated, service_role;
grant execute on function public.events_poser_secret_pointage() to service_role;
revoke all on function public.export_compte_instantane(text,integer,bigint) from public, anon, authenticated, service_role;
grant execute on function public.export_compte_instantane(text,integer,bigint) to service_role;
revoke all on function public.fil_compteurs(text[]) from public, anon, authenticated, service_role;
grant execute on function public.fil_compteurs(text[]) to anon;
grant execute on function public.fil_compteurs(text[]) to authenticated;
grant execute on function public.fil_compteurs(text[]) to service_role;
revoke all on function public.follows_identifiants_figes() from public, anon, authenticated, service_role;
grant execute on function public.follows_identifiants_figes() to service_role;
revoke all on function public.follows_notifier() from public, anon, authenticated, service_role;
grant execute on function public.follows_notifier() to service_role;
revoke all on function public.follows_statut_initial() from public, anon, authenticated, service_role;
grant execute on function public.follows_statut_initial() to service_role;
revoke all on function public.genres_reserves_au_serveur(text) from public, anon, authenticated, service_role;
grant execute on function public.genres_reserves_au_serveur(text) to public;
grant execute on function public.genres_reserves_au_serveur(text) to anon;
grant execute on function public.genres_reserves_au_serveur(text) to authenticated;
grant execute on function public.genres_reserves_au_serveur(text) to service_role;
revoke all on function public.identifiant_reserve_au_serveur(text) from public, anon, authenticated, service_role;
grant execute on function public.identifiant_reserve_au_serveur(text) to public;
grant execute on function public.identifiant_reserve_au_serveur(text) to anon;
grant execute on function public.identifiant_reserve_au_serveur(text) to authenticated;
grant execute on function public.identifiant_reserve_au_serveur(text) to service_role;
revoke all on function public.identifiants_figes() from public, anon, authenticated, service_role;
grant execute on function public.identifiants_figes() to service_role;
revoke all on function public.identite_affichage_canonique() from public, anon, authenticated, service_role;
grant execute on function public.identite_affichage_canonique() to service_role;
revoke all on function public.irl_interaction_allowed(text) from public, anon, authenticated, service_role;
grant execute on function public.irl_interaction_allowed(text) to service_role;
grant execute on function public.irl_interaction_allowed(text) to authenticated;
revoke all on function public.is_adult_declared() from public, anon, authenticated, service_role;
grant execute on function public.is_adult_declared() to service_role;
revoke all on function public.is_blocked_with(text) from public, anon, authenticated, service_role;
grant execute on function public.is_blocked_with(text) to service_role;
grant execute on function public.is_blocked_with(text) to authenticated;
revoke all on function public.is_conv_member(text,text) from public, anon, authenticated, service_role;
grant execute on function public.is_conv_member(text,text) to authenticated;
grant execute on function public.is_conv_member(text,text) to service_role;
revoke all on function public.is_conversation_creator(text) from public, anon, authenticated, service_role;
grant execute on function public.is_conversation_creator(text) to service_role;
grant execute on function public.is_conversation_creator(text) to authenticated;
revoke all on function public.limiter_debit_global() from public, anon, authenticated, service_role;
grant execute on function public.limiter_debit_global() to service_role;
revoke all on function public.notes_evenement(text) from public, anon, authenticated, service_role;
grant execute on function public.notes_evenement(text) to authenticated;
grant execute on function public.notes_evenement(text) to service_role;
revoke all on function public.notifications_origine() from public, anon, authenticated, service_role;
grant execute on function public.notifications_origine() to service_role;
revoke all on function public.notifier_mentions(text,text,text[]) from public, anon, authenticated, service_role;
grant execute on function public.notifier_mentions(text,text,text[]) to authenticated;
grant execute on function public.notifier_mentions(text,text,text[]) to service_role;
revoke all on function public.objets_stockage_du_compte(uuid) from public, anon, authenticated, service_role;
grant execute on function public.objets_stockage_du_compte(uuid) to service_role;
revoke all on function public.organise_activite(text) from public, anon, authenticated, service_role;
grant execute on function public.organise_activite(text) to authenticated;
grant execute on function public.organise_activite(text) to service_role;
revoke all on function public.participants_compte(text[]) from public, anon, authenticated, service_role;
grant execute on function public.participants_compte(text[]) to authenticated;
grant execute on function public.participants_compte(text[]) to service_role;
revoke all on function public.passion_plier(text) from public, anon, authenticated, service_role;
grant execute on function public.passion_plier(text) to authenticated;
grant execute on function public.passion_plier(text) to service_role;
revoke all on function public.passion_request_auto_creer() from public, anon, authenticated, service_role;
grant execute on function public.passion_request_auto_creer() to service_role;
revoke all on function public.passion_requests_garde() from public, anon, authenticated, service_role;
grant execute on function public.passion_requests_garde() to service_role;
revoke all on function public.passions_recherche_calculer(text,text[]) from public, anon, authenticated, service_role;
grant execute on function public.passions_recherche_calculer(text,text[]) to public;
grant execute on function public.passions_recherche_calculer(text,text[]) to anon;
grant execute on function public.passions_recherche_calculer(text,text[]) to authenticated;
grant execute on function public.passions_recherche_calculer(text,text[]) to service_role;
revoke all on function public.pilotage_audience(integer) from public, anon, authenticated, service_role;
grant execute on function public.pilotage_audience(integer) to service_role;
revoke all on function public.pilotage_croissance(integer) from public, anon, authenticated, service_role;
grant execute on function public.pilotage_croissance(integer) to service_role;
revoke all on function public.pilotage_famille_echec(text,text,integer,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pilotage_famille_echec(text,text,integer,text,text,jsonb) to service_role;
revoke all on function public.pilotage_familles_erreurs(text,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.pilotage_familles_erreurs(text,timestamp with time zone) to service_role;
revoke all on function public.pilotage_mesures() from public, anon, authenticated, service_role;
grant execute on function public.pilotage_mesures() to service_role;
revoke all on function public.planifier_croissance() from public, anon, authenticated, service_role;
grant execute on function public.planifier_croissance() to service_role;
revoke all on function public.planifier_purge_marqueurs() from public, anon, authenticated, service_role;
grant execute on function public.planifier_purge_marqueurs() to service_role;
revoke all on function public.pointer_par_code(text,text) from public, anon, authenticated, service_role;
grant execute on function public.pointer_par_code(text,text) to authenticated;
grant execute on function public.pointer_par_code(text,text) to service_role;
revoke all on function public.post_auteur_bloque(text) from public, anon, authenticated, service_role;
grant execute on function public.post_auteur_bloque(text) to authenticated;
grant execute on function public.post_auteur_bloque(text) to service_role;
revoke all on function public.post_is_visible(text) from public, anon, authenticated, service_role;
grant execute on function public.post_is_visible(text) to public;
grant execute on function public.post_is_visible(text) to anon;
grant execute on function public.post_is_visible(text) to authenticated;
grant execute on function public.post_is_visible(text) to service_role;
revoke all on function public.post_masque(text) from public, anon, authenticated, service_role;
grant execute on function public.post_masque(text) to public;
grant execute on function public.post_masque(text) to anon;
grant execute on function public.post_masque(text) to authenticated;
grant execute on function public.post_masque(text) to service_role;
revoke all on function public.posts_freeze_author() from public, anon, authenticated, service_role;
grant execute on function public.posts_freeze_author() to service_role;
revoke all on function public.promouvoir_attente(text,text) from public, anon, authenticated, service_role;
grant execute on function public.promouvoir_attente(text,text) to authenticated;
grant execute on function public.promouvoir_attente(text,text) to service_role;
revoke all on function public.propager_identite_affichage() from public, anon, authenticated, service_role;
grant execute on function public.propager_identite_affichage() to service_role;
revoke all on function public.proprietaires_objets_stockage() from public, anon, authenticated, service_role;
grant execute on function public.proprietaires_objets_stockage() to service_role;
revoke all on function public.purge_telemetrie_paliers() from public, anon, authenticated, service_role;
grant execute on function public.purge_telemetrie_paliers() to service_role;
revoke all on function public.purge_telemetry(integer) from public, anon, authenticated, service_role;
grant execute on function public.purge_telemetry(integer) to service_role;
revoke all on function public.purger_cibles_commentaires() from public, anon, authenticated, service_role;
grant execute on function public.purger_cibles_commentaires() to service_role;
revoke all on function public.purger_cibles_publications() from public, anon, authenticated, service_role;
grant execute on function public.purger_cibles_publications() to service_role;
revoke all on function public.purger_marqueurs_suppression(interval) from public, anon, authenticated, service_role;
grant execute on function public.purger_marqueurs_suppression(interval) to service_role;
revoke all on function public.rate_limit_insert() from public, anon, authenticated, service_role;
grant execute on function public.rate_limit_insert() to service_role;
revoke all on function public.rechercher_passions(text,integer) from public, anon, authenticated, service_role;
grant execute on function public.rechercher_passions(text,integer) to public;
grant execute on function public.rechercher_passions(text,integer) to anon;
grant execute on function public.rechercher_passions(text,integer) to authenticated;
grant execute on function public.rechercher_passions(text,integer) to service_role;
revoke all on function public.reclamer_suppression(text,uuid,text,interval) from public, anon, authenticated, service_role;
grant execute on function public.reclamer_suppression(text,uuid,text,interval) to service_role;
revoke all on function public.refuser_ecriture_compte_en_suppression() from public, anon, authenticated, service_role;
grant execute on function public.refuser_ecriture_compte_en_suppression() to service_role;
revoke all on function public.reports_statut_initial() from public, anon, authenticated, service_role;
grant execute on function public.reports_statut_initial() to service_role;
revoke all on function public.retours_evenement(text) from public, anon, authenticated, service_role;
grant execute on function public.retours_evenement(text) to authenticated;
grant execute on function public.retours_evenement(text) to service_role;
revoke all on function public.rid_opaque_garde() from public, anon, authenticated, service_role;
grant execute on function public.rid_opaque_garde() to service_role;
revoke all on function public.storage_chemin_autorise(text,text) from public, anon, authenticated, service_role;
grant execute on function public.storage_chemin_autorise(text,text) to public;
grant execute on function public.storage_chemin_autorise(text,text) to anon;
grant execute on function public.storage_chemin_autorise(text,text) to authenticated;
grant execute on function public.storage_chemin_autorise(text,text) to service_role;
revoke all on function public.suppression_de_mon_compte() from public, anon, authenticated, service_role;
grant execute on function public.suppression_de_mon_compte() to anon;
grant execute on function public.suppression_de_mon_compte() to authenticated;
grant execute on function public.suppression_de_mon_compte() to service_role;
revoke all on function public.sync_profil_passions(text) from public, anon, authenticated, service_role;
grant execute on function public.sync_profil_passions(text) to service_role;
revoke all on function public.telemetrie_debit_avant() from public, anon, authenticated, service_role;
grant execute on function public.telemetrie_debit_avant() to service_role;
revoke all on function public.telemetrie_debit_lot() from public, anon, authenticated, service_role;
grant execute on function public.telemetrie_debit_lot() to service_role;
revoke all on function public.telemetrie_plafond(text) from public, anon, authenticated, service_role;
grant execute on function public.telemetrie_plafond(text) to service_role;
revoke all on function public.telemetrie_refuser(text,integer) from public, anon, authenticated, service_role;
grant execute on function public.telemetrie_refuser(text,integer) to service_role;
revoke all on function public.telemetrie_reservoir() from public, anon, authenticated, service_role;
grant execute on function public.telemetrie_reservoir() to service_role;
revoke all on function public.telemetrie_taille_lot() from public, anon, authenticated, service_role;
grant execute on function public.telemetrie_taille_lot() to service_role;
revoke all on function public.telemetry_pose_identite() from public, anon, authenticated, service_role;
grant execute on function public.telemetry_pose_identite() to service_role;
revoke all on function public.terminer_suppression(text,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.terminer_suppression(text,uuid,text,jsonb) to service_role;
revoke all on function public.trg_passions_recherche() from public, anon, authenticated, service_role;
grant execute on function public.trg_passions_recherche() to public;
grant execute on function public.trg_passions_recherche() to anon;
grant execute on function public.trg_passions_recherche() to authenticated;
grant execute on function public.trg_passions_recherche() to service_role;
revoke all on function public.trg_reports_pretri() from public, anon, authenticated, service_role;
grant execute on function public.trg_reports_pretri() to service_role;
revoke all on function public.trg_reports_preuve_message() from public, anon, authenticated, service_role;
grant execute on function public.trg_reports_preuve_message() to service_role;
revoke all on function public.trg_sync_profil_passions() from public, anon, authenticated, service_role;
grant execute on function public.trg_sync_profil_passions() to service_role;
revoke all on function public.unaccent_immutable(text) from public, anon, authenticated, service_role;
grant execute on function public.unaccent_immutable(text) to public;
grant execute on function public.unaccent_immutable(text) to anon;
grant execute on function public.unaccent_immutable(text) to authenticated;
grant execute on function public.unaccent_immutable(text) to service_role;
revoke all on function public.user_safety_majorite_non_avancable() from public, anon, authenticated, service_role;
grant execute on function public.user_safety_majorite_non_avancable() to service_role;
revoke all on function public.user_state_horodatage_serveur() from public, anon, authenticated, service_role;
grant execute on function public.user_state_horodatage_serveur() to public;
grant execute on function public.user_state_horodatage_serveur() to anon;
grant execute on function public.user_state_horodatage_serveur() to authenticated;
grant execute on function public.user_state_horodatage_serveur() to service_role;
revoke all on function public.vient_a_activite(text) from public, anon, authenticated, service_role;
grant execute on function public.vient_a_activite(text) to authenticated;
grant execute on function public.vient_a_activite(text) to service_role;
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('user_id', '120');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.blocks FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('blocked_id', 'blocker_id');
CREATE TRIGGER trg_call_invites_figes BEFORE UPDATE ON public.call_invites FOR EACH ROW EXECUTE FUNCTION call_invites_figes();
CREATE TRIGGER trg_call_invites_sonner AFTER INSERT OR UPDATE ON public.call_invites FOR EACH ROW EXECUTE FUNCTION call_invites_sonner();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.call_invites FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('from_id', 'to_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.cdv_live_collaborators FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('added_by', 'user_id');
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.cdv_live_comments FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.cdv_live_comments FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.cdv_live_followers FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.cdv_live_reactions FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.cdv_live_steps FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.cdv_lives FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER trg_client_errors_identite BEFORE INSERT ON public.client_errors FOR EACH ROW EXECUTE FUNCTION client_errors_pose_identite();
CREATE TRIGGER trg_debit_global BEFORE INSERT ON public.client_errors FOR EACH ROW EXECUTE FUNCTION limiter_debit_global('created_at', '120');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.client_errors FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('auth_uid', 'uid');
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.comment_interactions FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('user_id', '60');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.comment_interactions FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_diffuser_ajout_membre AFTER INSERT ON public.conv_members FOR EACH ROW EXECUTE FUNCTION diffuser_ajout_membre();
CREATE TRIGGER trg_rid_opaque BEFORE INSERT OR UPDATE OF rid ON public.conv_members FOR EACH ROW EXECUTE FUNCTION rid_opaque_garde();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.conv_members FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER broadcast_conv_message_users_trigger AFTER INSERT ON public.conv_messages FOR EACH ROW EXECUTE FUNCTION broadcast_conv_message_to_users();
CREATE TRIGGER trg_identifiants_figes BEFORE UPDATE ON public.conv_messages FOR EACH ROW EXECUTE FUNCTION identifiants_figes('conv_id', 'from_id');
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.conv_messages FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('from_id', '60');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.conv_messages FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('from_id');
CREATE TRIGGER trg_rid_opaque BEFORE INSERT OR UPDATE OF rid ON public.conv_reads FOR EACH ROW EXECUTE FUNCTION rid_opaque_garde();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.conv_reads FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_event_attendees_admission BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_admission_gardee();
CREATE TRIGGER trg_event_attendees_capacite BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_capacite_gardee();
CREATE TRIGGER trg_event_attendees_etat BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_etat_garde();
CREATE TRIGGER trg_event_attendees_figes BEFORE UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_figes();
CREATE TRIGGER trg_event_attendees_pointage BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_pointage_garde();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.event_comments FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.event_comments FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('author_id', '30');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.event_comments FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.event_reactions FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('user_id', '30');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.event_reactions FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_events_admission BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION events_admission_gardee();
CREATE TRIGGER trg_events_secret_pointage AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION events_poser_secret_pointage();
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('author_id', '15');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER trg_follows_figes BEFORE UPDATE ON public.follows FOR EACH ROW EXECUTE FUNCTION follows_identifiants_figes();
CREATE TRIGGER trg_follows_notifier AFTER INSERT OR UPDATE OF status ON public.follows FOR EACH ROW EXECUTE FUNCTION follows_notifier();
CREATE TRIGGER trg_follows_statut BEFORE INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION follows_statut_initial();
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('follower_id', '30');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.follows FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('follower_id', 'following_id');
CREATE TRIGGER trg_diffuser_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION diffuser_notification();
CREATE TRIGGER trg_notifications_origine BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION notifications_origine();
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('from_id', '60');
CREATE TRIGGER trg_rid_opaque BEFORE INSERT OR UPDATE OF rid ON public.notifications FOR EACH ROW EXECUTE FUNCTION rid_opaque_garde();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('from_id', 'user_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.passion_quotas FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER aa_passion_requests_garde BEFORE INSERT ON public.passion_requests FOR EACH ROW EXECUTE FUNCTION passion_requests_garde();
CREATE TRIGGER trg_passion_request_auto BEFORE INSERT ON public.passion_requests FOR EACH ROW EXECUTE FUNCTION passion_request_auto_creer();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.passion_requests FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_passions_recherche BEFORE INSERT OR UPDATE OF label, aliases ON public.passions FOR EACH ROW EXECUTE FUNCTION trg_passions_recherche();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.post_collaborators FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('added_by', 'user_id');
CREATE TRIGGER trg_identifiants_figes BEFORE UPDATE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION identifiants_figes('post_id', 'author_id');
CREATE TRIGGER trg_purger_cibles_commentaire AFTER DELETE ON public.post_comments REFERENCING OLD TABLE AS commentaires_supprimes FOR EACH STATEMENT EXECUTE FUNCTION purger_cibles_commentaires();
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.post_comments FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('author_id', '30');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER trg_rid_opaque BEFORE INSERT OR UPDATE OF rid ON public.post_likes FOR EACH ROW EXECUTE FUNCTION rid_opaque_garde();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.post_likes FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_posts_freeze_author BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION posts_freeze_author();
CREATE TRIGGER trg_purger_cibles_publication AFTER DELETE ON public.posts REFERENCING OLD TABLE AS publications_supprimees FOR EACH STATEMENT EXECUTE FUNCTION purger_cibles_publications();
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('author_id', '10');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER trg_propager_identite AFTER UPDATE OF username, avatar_url, emoji ON public.profiles FOR EACH ROW WHEN (((old.username IS DISTINCT FROM new.username) OR (old.avatar_url IS DISTINCT FROM new.avatar_url) OR (old.emoji IS DISTINCT FROM new.emoji))) EXECUTE FUNCTION propager_identite_affichage();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('reporter_id', '10');
CREATE TRIGGER trg_reports_pretri AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION trg_reports_pretri();
CREATE TRIGGER trg_reports_preuve_message AFTER INSERT ON public.reports FOR EACH ROW WHEN ((new.target_type = 'message'::text)) EXECUTE FUNCTION trg_reports_preuve_message();
CREATE TRIGGER trg_reports_statut_initial BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION reports_statut_initial();
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.step_interactions FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.step_interactions FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.stories FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('author_id', '10');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.stories FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.story_views FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_debit_avant BEFORE INSERT ON public.telemetry_events FOR EACH STATEMENT EXECUTE FUNCTION telemetrie_debit_avant();
CREATE TRIGGER trg_debit_lot AFTER INSERT ON public.telemetry_events REFERENCING NEW TABLE AS nouvelles FOR EACH STATEMENT EXECUTE FUNCTION telemetrie_debit_lot();
CREATE TRIGGER trg_debit_taille BEFORE INSERT ON public.telemetry_events FOR EACH ROW EXECUTE FUNCTION telemetrie_taille_lot();
CREATE TRIGGER trg_telemetry_identite BEFORE INSERT ON public.telemetry_events FOR EACH ROW EXECUTE FUNCTION telemetry_pose_identite();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.telemetry_events FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('auth_uid', 'user_id');
CREATE TRIGGER trg_user_passions_sync AFTER INSERT OR DELETE OR UPDATE ON public.user_passions FOR EACH ROW EXECUTE FUNCTION trg_sync_profil_passions();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.user_passions FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_user_safety_majorite BEFORE UPDATE ON public.user_safety FOR EACH ROW EXECUTE FUNCTION user_safety_majorite_non_avancable();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.user_safety FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_user_state_horodatage BEFORE INSERT OR UPDATE ON public.user_state FOR EACH ROW EXECUTE FUNCTION user_state_horodatage_serveur();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.user_state FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('user_id');
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.video_lives FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER zz_barriere_suppression BEFORE INSERT OR UPDATE ON public.video_lives FOR EACH ROW EXECUTE FUNCTION refuser_ecriture_compte_en_suppression('author_id');
grant select, insert, update, delete on all tables in schema public to service_role;
grant select ("id", "user_id", "event", "properties", "created_at") on public."analytics_events" to anon;
grant insert ("id", "user_id", "event", "properties", "created_at") on public."analytics_events" to anon;
grant update ("id", "user_id", "event", "properties", "created_at") on public."analytics_events" to anon;
grant delete on public."analytics_events" to anon;
grant select ("id", "user_id", "event", "properties", "created_at") on public."analytics_events" to authenticated;
grant insert ("id", "user_id", "event", "properties", "created_at") on public."analytics_events" to authenticated;
grant update ("id", "user_id", "event", "properties", "created_at") on public."analytics_events" to authenticated;
grant delete on public."analytics_events" to authenticated;
grant select ("blocker_id", "blocked_id", "created_at") on public."blocks" to anon;
grant insert ("blocker_id", "blocked_id", "created_at") on public."blocks" to anon;
grant update ("blocker_id", "blocked_id", "created_at") on public."blocks" to anon;
grant delete on public."blocks" to anon;
grant select ("blocker_id", "blocked_id", "created_at") on public."blocks" to authenticated;
grant insert ("blocker_id", "blocked_id", "created_at") on public."blocks" to authenticated;
grant update ("blocker_id", "blocked_id", "created_at") on public."blocks" to authenticated;
grant delete on public."blocks" to authenticated;
grant select ("id", "from_id", "to_id", "kind", "created_at", "repete_le") on public."call_invites" to authenticated;
grant insert ("id", "from_id", "to_id", "kind", "created_at", "repete_le") on public."call_invites" to authenticated;
grant update ("id", "from_id", "to_id", "kind", "created_at", "repete_le") on public."call_invites" to authenticated;
grant delete on public."call_invites" to authenticated;
grant select ("live_id", "user_id", "added_by", "created_at") on public."cdv_live_collaborators" to anon;
grant insert ("live_id", "user_id", "added_by", "created_at") on public."cdv_live_collaborators" to anon;
grant update ("live_id", "user_id", "added_by", "created_at") on public."cdv_live_collaborators" to anon;
grant delete on public."cdv_live_collaborators" to anon;
grant select ("live_id", "user_id", "added_by", "created_at") on public."cdv_live_collaborators" to authenticated;
grant insert ("live_id", "user_id", "added_by", "created_at") on public."cdv_live_collaborators" to authenticated;
grant update ("live_id", "user_id", "added_by", "created_at") on public."cdv_live_collaborators" to authenticated;
grant delete on public."cdv_live_collaborators" to authenticated;
grant select ("id", "live_id", "author_id", "author_name", "text", "created_at") on public."cdv_live_comments" to anon;
grant insert ("id", "live_id", "author_id", "author_name", "text", "created_at") on public."cdv_live_comments" to anon;
grant update ("id", "live_id", "author_id", "author_name", "text", "created_at") on public."cdv_live_comments" to anon;
grant delete on public."cdv_live_comments" to anon;
grant select ("id", "live_id", "author_id", "author_name", "text", "created_at") on public."cdv_live_comments" to authenticated;
grant insert ("id", "live_id", "author_id", "author_name", "text", "created_at") on public."cdv_live_comments" to authenticated;
grant update ("id", "live_id", "author_id", "author_name", "text", "created_at") on public."cdv_live_comments" to authenticated;
grant delete on public."cdv_live_comments" to authenticated;
grant select ("live_id", "user_id", "created_at") on public."cdv_live_followers" to anon;
grant insert ("live_id", "user_id", "created_at") on public."cdv_live_followers" to anon;
grant update ("live_id", "user_id", "created_at") on public."cdv_live_followers" to anon;
grant delete on public."cdv_live_followers" to anon;
grant select ("live_id", "user_id", "created_at") on public."cdv_live_followers" to authenticated;
grant insert ("live_id", "user_id", "created_at") on public."cdv_live_followers" to authenticated;
grant update ("live_id", "user_id", "created_at") on public."cdv_live_followers" to authenticated;
grant delete on public."cdv_live_followers" to authenticated;
grant select ("id", "live_id", "user_id", "emoji", "created_at") on public."cdv_live_reactions" to anon;
grant insert ("id", "live_id", "user_id", "emoji", "created_at") on public."cdv_live_reactions" to anon;
grant update ("id", "live_id", "user_id", "emoji", "created_at") on public."cdv_live_reactions" to anon;
grant delete on public."cdv_live_reactions" to anon;
grant select ("id", "live_id", "user_id", "emoji", "created_at") on public."cdv_live_reactions" to authenticated;
grant insert ("id", "live_id", "user_id", "emoji", "created_at") on public."cdv_live_reactions" to authenticated;
grant update ("id", "live_id", "user_id", "emoji", "created_at") on public."cdv_live_reactions" to authenticated;
grant delete on public."cdv_live_reactions" to authenticated;
grant select ("id", "live_id", "author_id", "city", "emoji", "content", "photos", "rating", "budget", "created_at", "lat", "lng", "video") on public."cdv_live_steps" to anon;
grant insert ("id", "live_id", "author_id", "city", "emoji", "content", "photos", "rating", "budget", "created_at", "lat", "lng", "video") on public."cdv_live_steps" to anon;
grant update ("id", "live_id", "author_id", "city", "emoji", "content", "photos", "rating", "budget", "created_at", "lat", "lng", "video") on public."cdv_live_steps" to anon;
grant delete on public."cdv_live_steps" to anon;
grant select ("id", "live_id", "author_id", "city", "emoji", "content", "photos", "rating", "budget", "created_at", "lat", "lng", "video") on public."cdv_live_steps" to authenticated;
grant insert ("id", "live_id", "author_id", "city", "emoji", "content", "photos", "rating", "budget", "created_at", "lat", "lng", "video") on public."cdv_live_steps" to authenticated;
grant update ("id", "live_id", "author_id", "city", "emoji", "content", "photos", "rating", "budget", "created_at", "lat", "lng", "video") on public."cdv_live_steps" to authenticated;
grant delete on public."cdv_live_steps" to authenticated;
grant select ("id", "author_id", "destination", "description", "duration", "visibility", "status", "created_at", "updated_at") on public."cdv_lives" to anon;
grant insert ("id", "author_id", "destination", "description", "duration", "visibility", "status", "created_at", "updated_at") on public."cdv_lives" to anon;
grant update ("id", "author_id", "destination", "description", "duration", "visibility", "status", "created_at", "updated_at") on public."cdv_lives" to anon;
grant delete on public."cdv_lives" to anon;
grant select ("id", "author_id", "destination", "description", "duration", "visibility", "status", "created_at", "updated_at") on public."cdv_lives" to authenticated;
grant insert ("id", "author_id", "destination", "description", "duration", "visibility", "status", "created_at", "updated_at") on public."cdv_lives" to authenticated;
grant update ("id", "author_id", "destination", "description", "duration", "visibility", "status", "created_at", "updated_at") on public."cdv_lives" to authenticated;
grant delete on public."cdv_lives" to authenticated;
grant select ("id", "message", "source", "line", "stack", "url", "ua", "uid", "created_at", "auth_uid") on public."client_errors" to anon;
grant insert ("id", "message", "source", "line", "stack", "url", "ua", "uid", "created_at", "auth_uid") on public."client_errors" to anon;
grant update ("id", "message", "source", "line", "stack", "url", "ua", "uid", "created_at", "auth_uid") on public."client_errors" to anon;
grant delete on public."client_errors" to anon;
grant select ("id", "message", "source", "line", "stack", "url", "ua", "uid", "created_at", "auth_uid") on public."client_errors" to authenticated;
grant insert ("id", "message", "source", "line", "stack", "url", "ua", "uid", "created_at", "auth_uid") on public."client_errors" to authenticated;
grant update ("id", "message", "source", "line", "stack", "url", "ua", "uid", "created_at", "auth_uid") on public."client_errors" to authenticated;
grant delete on public."client_errors" to authenticated;
grant select ("heure", "erreurs") on public."client_errors_par_heure" to anon;
grant insert ("heure", "erreurs") on public."client_errors_par_heure" to anon;
grant update ("heure", "erreurs") on public."client_errors_par_heure" to anon;
grant delete on public."client_errors_par_heure" to anon;
grant select ("heure", "erreurs") on public."client_errors_par_heure" to authenticated;
grant insert ("heure", "erreurs") on public."client_errors_par_heure" to authenticated;
grant update ("heure", "erreurs") on public."client_errors_par_heure" to authenticated;
grant delete on public."client_errors_par_heure" to authenticated;
grant select ("message", "occurrences", "utilisateurs", "derniere_occurrence") on public."client_errors_top_24h" to anon;
grant insert ("message", "occurrences", "utilisateurs", "derniere_occurrence") on public."client_errors_top_24h" to anon;
grant update ("message", "occurrences", "utilisateurs", "derniere_occurrence") on public."client_errors_top_24h" to anon;
grant delete on public."client_errors_top_24h" to anon;
grant select ("message", "occurrences", "utilisateurs", "derniere_occurrence") on public."client_errors_top_24h" to authenticated;
grant insert ("message", "occurrences", "utilisateurs", "derniere_occurrence") on public."client_errors_top_24h" to authenticated;
grant update ("message", "occurrences", "utilisateurs", "derniere_occurrence") on public."client_errors_top_24h" to authenticated;
grant delete on public."client_errors_top_24h" to authenticated;
grant select ("id", "comment_id", "post_id", "user_id", "kind", "payload", "created_at") on public."comment_interactions" to anon;
grant insert ("id", "comment_id", "post_id", "user_id", "kind", "payload", "created_at") on public."comment_interactions" to anon;
grant update ("id", "comment_id", "post_id", "user_id", "kind", "payload", "created_at") on public."comment_interactions" to anon;
grant delete on public."comment_interactions" to anon;
grant select ("id", "comment_id", "post_id", "user_id", "kind", "payload", "created_at") on public."comment_interactions" to authenticated;
grant insert ("id", "comment_id", "post_id", "user_id", "kind", "payload", "created_at") on public."comment_interactions" to authenticated;
grant update ("id", "comment_id", "post_id", "user_id", "kind", "payload", "created_at") on public."comment_interactions" to authenticated;
grant delete on public."comment_interactions" to authenticated;
grant select ("comment_id", "user_id", "created_at") on public."comment_likes" to anon;
grant insert ("comment_id", "user_id", "created_at") on public."comment_likes" to anon;
grant update ("comment_id", "user_id", "created_at") on public."comment_likes" to anon;
grant delete on public."comment_likes" to anon;
grant select ("comment_id", "user_id", "created_at") on public."comment_likes" to authenticated;
grant insert ("comment_id", "user_id", "created_at") on public."comment_likes" to authenticated;
grant update ("comment_id", "user_id", "created_at") on public."comment_likes" to authenticated;
grant delete on public."comment_likes" to authenticated;
grant select ("conv_id", "user_id", "rid") on public."conv_members" to anon;
grant update ("conv_id", "user_id", "rid") on public."conv_members" to anon;
grant delete on public."conv_members" to anon;
grant select ("conv_id", "user_id", "rid") on public."conv_members" to authenticated;
grant insert ("conv_id", "user_id", "rid") on public."conv_members" to authenticated;
grant update ("conv_id", "user_id", "rid") on public."conv_members" to authenticated;
grant delete on public."conv_members" to authenticated;
grant select ("id", "conv_id", "from_id", "content", "created_at") on public."conv_messages" to anon;
grant update ("id", "conv_id", "from_id", "content", "created_at") on public."conv_messages" to anon;
grant delete on public."conv_messages" to anon;
grant select ("id", "conv_id", "from_id", "content", "created_at") on public."conv_messages" to authenticated;
grant insert ("id", "conv_id", "from_id", "content", "created_at") on public."conv_messages" to authenticated;
grant update ("id", "conv_id", "from_id", "content", "created_at") on public."conv_messages" to authenticated;
grant delete on public."conv_messages" to authenticated;
grant select ("conv_id", "user_id", "last_read_at", "rid") on public."conv_reads" to anon;
grant insert ("conv_id", "user_id", "last_read_at", "rid") on public."conv_reads" to anon;
grant update ("conv_id", "user_id", "last_read_at", "rid") on public."conv_reads" to anon;
grant delete on public."conv_reads" to anon;
grant select ("conv_id", "user_id", "last_read_at", "rid") on public."conv_reads" to authenticated;
grant insert ("conv_id", "user_id", "last_read_at", "rid") on public."conv_reads" to authenticated;
grant update ("conv_id", "user_id", "last_read_at", "rid") on public."conv_reads" to authenticated;
grant delete on public."conv_reads" to authenticated;
grant select ("id", "is_group", "group_name", "passion_id", "created_by", "created_at", "description") on public."conversations" to anon;
grant update ("id", "is_group", "group_name", "passion_id", "created_by", "created_at", "description") on public."conversations" to anon;
grant delete on public."conversations" to anon;
grant select ("id", "is_group", "group_name", "passion_id", "created_by", "created_at", "description") on public."conversations" to authenticated;
grant insert ("id", "is_group", "group_name", "passion_id", "created_by", "created_at", "description") on public."conversations" to authenticated;
grant update ("id", "is_group", "group_name", "passion_id", "created_by", "created_at", "description") on public."conversations" to authenticated;
grant delete on public."conversations" to authenticated;
grant select ("event_id", "user_id", "created_at", "rsvp", "checked_in_at") on public."event_attendees" to authenticated;
grant insert ("event_id", "user_id", "created_at", "rsvp", "checked_in_at", "rating", "feedback", "rated_at") on public."event_attendees" to authenticated;
grant update ("event_id", "user_id", "created_at", "rsvp", "checked_in_at", "rating", "feedback", "rated_at") on public."event_attendees" to authenticated;
grant delete on public."event_attendees" to authenticated;
grant select ("event_id", "secret", "created_at") on public."event_checkin_secrets" to authenticated;
grant insert ("event_id", "secret", "created_at") on public."event_checkin_secrets" to authenticated;
grant update ("event_id", "secret", "created_at") on public."event_checkin_secrets" to authenticated;
grant delete on public."event_checkin_secrets" to authenticated;
grant select ("id", "event_id", "author_id", "author_name", "text", "created_at") on public."event_comments" to anon;
grant insert ("id", "event_id", "author_id", "author_name", "text", "created_at") on public."event_comments" to anon;
grant update ("id", "event_id", "author_id", "author_name", "text", "created_at") on public."event_comments" to anon;
grant delete on public."event_comments" to anon;
grant select ("id", "event_id", "author_id", "author_name", "text", "created_at") on public."event_comments" to authenticated;
grant insert ("id", "event_id", "author_id", "author_name", "text", "created_at") on public."event_comments" to authenticated;
grant update ("id", "event_id", "author_id", "author_name", "text", "created_at") on public."event_comments" to authenticated;
grant delete on public."event_comments" to authenticated;
grant select ("event_id", "user_id", "emoji", "created_at") on public."event_reactions" to anon;
grant insert ("event_id", "user_id", "emoji", "created_at") on public."event_reactions" to anon;
grant update ("event_id", "user_id", "emoji", "created_at") on public."event_reactions" to anon;
grant delete on public."event_reactions" to anon;
grant select ("event_id", "user_id", "emoji", "created_at") on public."event_reactions" to authenticated;
grant insert ("event_id", "user_id", "emoji", "created_at") on public."event_reactions" to authenticated;
grant update ("event_id", "user_id", "emoji", "created_at") on public."event_reactions" to authenticated;
grant delete on public."event_reactions" to authenticated;
grant select ("id", "author_id", "title", "passion_id", "lat", "lng", "city", "description", "emoji", "max_attendees", "date_at", "created_at", "venue", "postal_code", "price", "external_link", "event_type", "cover_url", "organizer_id", "end_at", "status", "updated_at", "co_organizers", "series_id", "recurrence") on public."events" to anon;
grant update ("id", "author_id", "title", "passion_id", "lat", "lng", "city", "description", "emoji", "max_attendees", "date_at", "created_at", "venue", "address", "postal_code", "price", "contact", "external_link", "event_type", "cover_url", "organizer_id", "end_at", "status", "updated_at", "co_organizers", "series_id", "recurrence", "conv_id") on public."events" to anon;
grant delete on public."events" to anon;
grant select ("id", "author_id", "title", "passion_id", "lat", "lng", "city", "description", "emoji", "max_attendees", "date_at", "created_at", "venue", "address", "postal_code", "price", "contact", "external_link", "event_type", "cover_url", "organizer_id", "end_at", "status", "updated_at", "co_organizers", "series_id", "recurrence", "conv_id") on public."events" to authenticated;
grant insert ("id", "author_id", "title", "passion_id", "lat", "lng", "city", "description", "emoji", "max_attendees", "date_at", "created_at", "venue", "address", "postal_code", "price", "contact", "external_link", "event_type", "cover_url", "organizer_id", "end_at", "status", "updated_at", "co_organizers", "series_id", "recurrence", "conv_id") on public."events" to authenticated;
grant update ("id", "author_id", "title", "passion_id", "lat", "lng", "city", "description", "emoji", "max_attendees", "date_at", "created_at", "venue", "address", "postal_code", "price", "contact", "external_link", "event_type", "cover_url", "organizer_id", "end_at", "status", "updated_at", "co_organizers", "series_id", "recurrence", "conv_id") on public."events" to authenticated;
grant delete on public."events" to authenticated;
grant select ("follower_id", "following_id", "created_at", "status") on public."follows" to anon;
grant insert ("follower_id", "following_id", "created_at", "status") on public."follows" to anon;
grant update ("follower_id", "following_id", "created_at", "status") on public."follows" to anon;
grant delete on public."follows" to anon;
grant select ("follower_id", "following_id", "created_at", "status") on public."follows" to authenticated;
grant insert ("follower_id", "following_id", "created_at", "status") on public."follows" to authenticated;
grant update ("follower_id", "following_id", "created_at", "status") on public."follows" to authenticated;
grant delete on public."follows" to authenticated;
grant select ("id", "user_id", "kind", "from_id", "ref_id", "content", "seen", "created_at", "origine", "rid") on public."notifications" to anon;
grant select ("id", "user_id", "kind", "from_id", "ref_id", "content", "seen", "created_at", "origine", "rid") on public."notifications" to authenticated;
grant insert ("id", "user_id", "kind", "from_id", "ref_id", "content", "seen", "created_at", "origine", "rid") on public."notifications" to authenticated;
grant update ("seen") on public."notifications" to authenticated;
grant delete on public."notifications" to authenticated;
grant select ("user_id", "creations_max", "note", "created_at") on public."passion_quotas" to anon;
grant insert ("user_id", "creations_max", "note", "created_at") on public."passion_quotas" to anon;
grant update ("user_id", "creations_max", "note", "created_at") on public."passion_quotas" to anon;
grant delete on public."passion_quotas" to anon;
grant select ("user_id", "creations_max", "note", "created_at") on public."passion_quotas" to authenticated;
grant insert ("user_id", "creations_max", "note", "created_at") on public."passion_quotas" to authenticated;
grant update ("user_id", "creations_max", "note", "created_at") on public."passion_quotas" to authenticated;
grant delete on public."passion_quotas" to authenticated;
grant select ("source_passion_id", "target_passion_id", "relation_type", "weight", "created_at") on public."passion_relations" to anon;
grant insert ("source_passion_id", "target_passion_id", "relation_type", "weight", "created_at") on public."passion_relations" to anon;
grant update ("source_passion_id", "target_passion_id", "relation_type", "weight", "created_at") on public."passion_relations" to anon;
grant delete on public."passion_relations" to anon;
grant select ("source_passion_id", "target_passion_id", "relation_type", "weight", "created_at") on public."passion_relations" to authenticated;
grant insert ("source_passion_id", "target_passion_id", "relation_type", "weight", "created_at") on public."passion_relations" to authenticated;
grant update ("source_passion_id", "target_passion_id", "relation_type", "weight", "created_at") on public."passion_relations" to authenticated;
grant delete on public."passion_relations" to authenticated;
grant select ("id", "user_id", "label", "normalized_label", "status", "resolved_passion_id", "created_at", "updated_at") on public."passion_requests" to anon;
grant insert ("id", "user_id", "label", "normalized_label", "status", "resolved_passion_id", "created_at", "updated_at") on public."passion_requests" to anon;
grant update ("id", "user_id", "label", "normalized_label", "status", "resolved_passion_id", "created_at", "updated_at") on public."passion_requests" to anon;
grant delete on public."passion_requests" to anon;
grant select ("id", "user_id", "label", "normalized_label", "status", "resolved_passion_id", "created_at", "updated_at") on public."passion_requests" to authenticated;
grant insert ("id", "user_id", "label", "normalized_label", "status", "resolved_passion_id", "created_at", "updated_at") on public."passion_requests" to authenticated;
grant update ("id", "user_id", "label", "normalized_label", "status", "resolved_passion_id", "created_at", "updated_at") on public."passion_requests" to authenticated;
grant delete on public."passion_requests" to authenticated;
grant select ("id", "emoji", "label", "color", "sort_order", "normalized_label", "aliases", "status", "source", "is_broad", "popularity", "created_at", "updated_at", "created_by", "recherche") on public."passions" to anon;
grant insert ("id", "emoji", "label", "color", "sort_order", "normalized_label", "aliases", "status", "source", "is_broad", "popularity", "created_at", "updated_at", "created_by", "recherche") on public."passions" to anon;
grant update ("id", "emoji", "label", "color", "sort_order", "normalized_label", "aliases", "status", "source", "is_broad", "popularity", "created_at", "updated_at", "created_by", "recherche") on public."passions" to anon;
grant delete on public."passions" to anon;
grant select ("id", "emoji", "label", "color", "sort_order", "normalized_label", "aliases", "status", "source", "is_broad", "popularity", "created_at", "updated_at", "created_by", "recherche") on public."passions" to authenticated;
grant insert ("id", "emoji", "label", "color", "sort_order", "normalized_label", "aliases", "status", "source", "is_broad", "popularity", "created_at", "updated_at", "created_by", "recherche") on public."passions" to authenticated;
grant update ("id", "emoji", "label", "color", "sort_order", "normalized_label", "aliases", "status", "source", "is_broad", "popularity", "created_at", "updated_at", "created_by", "recherche") on public."passions" to authenticated;
grant delete on public."passions" to authenticated;
grant select ("post_id", "user_id", "added_by", "created_at") on public."post_collaborators" to anon;
grant insert ("post_id", "user_id", "added_by", "created_at") on public."post_collaborators" to anon;
grant update ("post_id", "user_id", "added_by", "created_at") on public."post_collaborators" to anon;
grant delete on public."post_collaborators" to anon;
grant select ("post_id", "user_id", "added_by", "created_at") on public."post_collaborators" to authenticated;
grant insert ("post_id", "user_id", "added_by", "created_at") on public."post_collaborators" to authenticated;
grant update ("post_id", "user_id", "added_by", "created_at") on public."post_collaborators" to authenticated;
grant delete on public."post_collaborators" to authenticated;
grant select ("id", "post_id", "author_id", "content", "created_at") on public."post_comments" to anon;
grant insert ("id", "post_id", "author_id", "content", "created_at") on public."post_comments" to anon;
grant update ("id", "post_id", "author_id", "content", "created_at") on public."post_comments" to anon;
grant delete on public."post_comments" to anon;
grant select ("id", "post_id", "author_id", "content", "created_at") on public."post_comments" to authenticated;
grant insert ("id", "post_id", "author_id", "content", "created_at") on public."post_comments" to authenticated;
grant update ("id", "post_id", "author_id", "content", "created_at") on public."post_comments" to authenticated;
grant delete on public."post_comments" to authenticated;
grant select ("post_id", "user_id", "rid") on public."post_likes" to anon;
grant insert ("post_id", "user_id", "rid") on public."post_likes" to anon;
grant update ("post_id", "user_id", "rid") on public."post_likes" to anon;
grant delete on public."post_likes" to anon;
grant select ("post_id", "user_id", "rid") on public."post_likes" to authenticated;
grant insert ("post_id", "user_id", "rid") on public."post_likes" to authenticated;
grant update ("post_id", "user_id", "rid") on public."post_likes" to authenticated;
grant delete on public."post_likes" to authenticated;
grant select ("id", "author_id", "passion_id", "mood", "content", "media_url", "likes", "created_at", "shared_from_post_id", "shared_data", "is_reel", "overlays", "vlog", "event_id") on public."posts" to anon;
grant insert ("id", "author_id", "passion_id", "mood", "content", "media_url", "likes", "created_at", "shared_from_post_id", "shared_data", "is_reel", "overlays", "vlog", "event_id") on public."posts" to anon;
grant update ("id", "author_id", "passion_id", "mood", "content", "media_url", "likes", "created_at", "shared_from_post_id", "shared_data", "is_reel", "overlays", "vlog", "event_id") on public."posts" to anon;
grant delete on public."posts" to anon;
grant select ("id", "author_id", "passion_id", "mood", "content", "media_url", "likes", "created_at", "shared_from_post_id", "shared_data", "is_reel", "overlays", "vlog", "event_id") on public."posts" to authenticated;
grant insert ("id", "author_id", "passion_id", "mood", "content", "media_url", "likes", "created_at", "shared_from_post_id", "shared_data", "is_reel", "overlays", "vlog", "event_id") on public."posts" to authenticated;
grant update ("id", "author_id", "passion_id", "mood", "content", "media_url", "likes", "created_at", "shared_from_post_id", "shared_data", "is_reel", "overlays", "vlog", "event_id") on public."posts" to authenticated;
grant delete on public."posts" to authenticated;
grant select ("id", "username", "emoji", "color", "passion_id", "bio", "created_at", "avatar_url", "cover_url", "passions", "is_private", "rs_links") on public."profiles" to anon;
grant insert ("id", "username", "emoji", "color", "passion_id", "bio", "created_at", "avatar_url", "cover_url", "passions", "is_private", "rs_links") on public."profiles" to anon;
grant update ("id", "username", "emoji", "color", "passion_id", "bio", "created_at", "avatar_url", "cover_url", "passions", "is_private", "rs_links") on public."profiles" to anon;
grant delete on public."profiles" to anon;
grant select ("id", "username", "emoji", "color", "passion_id", "bio", "created_at", "avatar_url", "cover_url", "passions", "is_private", "rs_links") on public."profiles" to authenticated;
grant insert ("id", "username", "emoji", "color", "passion_id", "bio", "created_at", "avatar_url", "cover_url", "passions", "is_private", "rs_links") on public."profiles" to authenticated;
grant update ("id", "username", "emoji", "color", "passion_id", "bio", "created_at", "avatar_url", "cover_url", "passions", "is_private", "rs_links") on public."profiles" to authenticated;
grant delete on public."profiles" to authenticated;
grant select ("endpoint", "user_id", "subscription", "created_at") on public."push_subscriptions" to anon;
grant insert ("endpoint", "user_id", "subscription", "created_at") on public."push_subscriptions" to anon;
grant update ("endpoint", "user_id", "subscription", "created_at") on public."push_subscriptions" to anon;
grant delete on public."push_subscriptions" to anon;
grant select ("endpoint", "user_id", "subscription", "created_at") on public."push_subscriptions" to authenticated;
grant insert ("endpoint", "user_id", "subscription", "created_at") on public."push_subscriptions" to authenticated;
grant update ("endpoint", "user_id", "subscription", "created_at") on public."push_subscriptions" to authenticated;
grant delete on public."push_subscriptions" to authenticated;
grant select ("cle", "valeur", "maj") on public."reglages_distants" to anon;
grant select ("cle", "valeur", "maj") on public."reglages_distants" to authenticated;
grant select ("id", "reporter_id", "target_type", "target_id", "reason", "created_at", "status", "handled_at", "handled_note") on public."reports" to anon;
grant insert ("id", "reporter_id", "target_type", "target_id", "reason", "created_at", "status", "handled_at", "handled_note") on public."reports" to anon;
grant update ("id", "reporter_id", "target_type", "target_id", "reason", "created_at", "status", "handled_at", "handled_note") on public."reports" to anon;
grant delete on public."reports" to anon;
grant select ("id", "reporter_id", "target_type", "target_id", "reason", "created_at", "status", "handled_at", "handled_note") on public."reports" to authenticated;
grant insert ("id", "reporter_id", "target_type", "target_id", "reason", "created_at", "status", "handled_at", "handled_note") on public."reports" to authenticated;
grant update ("id", "reporter_id", "target_type", "target_id", "reason", "created_at", "status", "handled_at", "handled_note") on public."reports" to authenticated;
grant delete on public."reports" to authenticated;
grant select ("id", "thread_id", "user_id", "kind", "content", "author_name", "author_emoji", "created_at") on public."step_interactions" to anon;
grant insert ("id", "thread_id", "user_id", "kind", "content", "author_name", "author_emoji", "created_at") on public."step_interactions" to anon;
grant update ("id", "thread_id", "user_id", "kind", "content", "author_name", "author_emoji", "created_at") on public."step_interactions" to anon;
grant delete on public."step_interactions" to anon;
grant select ("id", "thread_id", "user_id", "kind", "content", "author_name", "author_emoji", "created_at") on public."step_interactions" to authenticated;
grant insert ("id", "thread_id", "user_id", "kind", "content", "author_name", "author_emoji", "created_at") on public."step_interactions" to authenticated;
grant update ("id", "thread_id", "user_id", "kind", "content", "author_name", "author_emoji", "created_at") on public."step_interactions" to authenticated;
grant delete on public."step_interactions" to authenticated;
grant select ("id", "author_id", "passion_id", "content", "emoji", "created_at", "media_url", "media_type", "overlays") on public."stories" to anon;
grant insert ("id", "author_id", "passion_id", "content", "emoji", "created_at", "media_url", "media_type", "overlays") on public."stories" to anon;
grant update ("id", "author_id", "passion_id", "content", "emoji", "created_at", "media_url", "media_type", "overlays") on public."stories" to anon;
grant delete on public."stories" to anon;
grant select ("id", "author_id", "passion_id", "content", "emoji", "created_at", "media_url", "media_type", "overlays") on public."stories" to authenticated;
grant insert ("id", "author_id", "passion_id", "content", "emoji", "created_at", "media_url", "media_type", "overlays") on public."stories" to authenticated;
grant update ("id", "author_id", "passion_id", "content", "emoji", "created_at", "media_url", "media_type", "overlays") on public."stories" to authenticated;
grant delete on public."stories" to authenticated;
grant select ("story_id", "user_id", "seen_at") on public."story_views" to anon;
grant insert ("story_id", "user_id", "seen_at") on public."story_views" to anon;
grant update ("story_id", "user_id", "seen_at") on public."story_views" to anon;
grant delete on public."story_views" to anon;
grant select ("story_id", "user_id", "seen_at") on public."story_views" to authenticated;
grant insert ("story_id", "user_id", "seen_at") on public."story_views" to authenticated;
grant update ("story_id", "user_id", "seen_at") on public."story_views" to authenticated;
grant delete on public."story_views" to authenticated;
grant select ("id", "event_id", "received_at", "client_ts", "env", "type", "action", "screen", "status", "severity", "duration_ms", "user_id", "user_label", "session_id", "device_id", "platform", "browser", "app_version", "screen_size", "connection", "endpoint", "http_status", "correlation_id", "message", "stack", "meta", "auth_uid") on public."telemetry_events" to anon;
grant insert ("id", "event_id", "received_at", "client_ts", "env", "type", "action", "screen", "status", "severity", "duration_ms", "user_id", "user_label", "session_id", "device_id", "platform", "browser", "app_version", "screen_size", "connection", "endpoint", "http_status", "correlation_id", "message", "stack", "meta", "auth_uid") on public."telemetry_events" to anon;
grant update ("id", "event_id", "received_at", "client_ts", "env", "type", "action", "screen", "status", "severity", "duration_ms", "user_id", "user_label", "session_id", "device_id", "platform", "browser", "app_version", "screen_size", "connection", "endpoint", "http_status", "correlation_id", "message", "stack", "meta", "auth_uid") on public."telemetry_events" to anon;
grant delete on public."telemetry_events" to anon;
grant select ("id", "event_id", "received_at", "client_ts", "env", "type", "action", "screen", "status", "severity", "duration_ms", "user_id", "user_label", "session_id", "device_id", "platform", "browser", "app_version", "screen_size", "connection", "endpoint", "http_status", "correlation_id", "message", "stack", "meta", "auth_uid") on public."telemetry_events" to authenticated;
grant insert ("id", "event_id", "received_at", "client_ts", "env", "type", "action", "screen", "status", "severity", "duration_ms", "user_id", "user_label", "session_id", "device_id", "platform", "browser", "app_version", "screen_size", "connection", "endpoint", "http_status", "correlation_id", "message", "stack", "meta", "auth_uid") on public."telemetry_events" to authenticated;
grant update ("id", "event_id", "received_at", "client_ts", "env", "type", "action", "screen", "status", "severity", "duration_ms", "user_id", "user_label", "session_id", "device_id", "platform", "browser", "app_version", "screen_size", "connection", "endpoint", "http_status", "correlation_id", "message", "stack", "meta", "auth_uid") on public."telemetry_events" to authenticated;
grant delete on public."telemetry_events" to authenticated;
grant select ("type", "severity", "n", "last_seen") on public."telemetry_last24h" to anon;
grant insert ("type", "severity", "n", "last_seen") on public."telemetry_last24h" to anon;
grant update ("type", "severity", "n", "last_seen") on public."telemetry_last24h" to anon;
grant delete on public."telemetry_last24h" to anon;
grant select ("type", "severity", "n", "last_seen") on public."telemetry_last24h" to authenticated;
grant insert ("type", "severity", "n", "last_seen") on public."telemetry_last24h" to authenticated;
grant update ("type", "severity", "n", "last_seen") on public."telemetry_last24h" to authenticated;
grant delete on public."telemetry_last24h" to authenticated;
grant select ("user_id", "passion_id", "position", "archived", "created_at") on public."user_passions" to anon;
grant insert ("user_id", "passion_id", "position", "archived", "created_at") on public."user_passions" to anon;
grant update ("user_id", "passion_id", "position", "archived", "created_at") on public."user_passions" to anon;
grant delete on public."user_passions" to anon;
grant select ("user_id", "passion_id", "position", "archived", "created_at") on public."user_passions" to authenticated;
grant insert ("user_id", "passion_id", "position", "archived", "created_at") on public."user_passions" to authenticated;
grant update ("user_id", "passion_id", "position", "archived", "created_at") on public."user_passions" to authenticated;
grant delete on public."user_passions" to authenticated;
grant select ("user_id", "majority_at", "created_at", "updated_at") on public."user_safety" to authenticated;
grant select ("user_id", "data", "updated_at") on public."user_state" to anon;
grant insert ("user_id", "data", "updated_at") on public."user_state" to anon;
grant update ("user_id", "data", "updated_at") on public."user_state" to anon;
grant delete on public."user_state" to anon;
grant select ("user_id", "data", "updated_at") on public."user_state" to authenticated;
grant insert ("user_id", "data", "updated_at") on public."user_state" to authenticated;
grant update ("user_id", "data", "updated_at") on public."user_state" to authenticated;
grant delete on public."user_state" to authenticated;
grant select ("id", "author_id", "author_name", "author_emoji", "author_photo", "title", "status", "started_at", "last_seen", "ended_at") on public."video_lives" to anon;
grant insert ("id", "author_id", "author_name", "author_emoji", "author_photo", "title", "status", "started_at", "last_seen", "ended_at") on public."video_lives" to anon;
grant update ("id", "author_id", "author_name", "author_emoji", "author_photo", "title", "status", "started_at", "last_seen", "ended_at") on public."video_lives" to anon;
grant delete on public."video_lives" to anon;
grant select ("id", "author_id", "author_name", "author_emoji", "author_photo", "title", "status", "started_at", "last_seen", "ended_at") on public."video_lives" to authenticated;
grant insert ("id", "author_id", "author_name", "author_emoji", "author_photo", "title", "status", "started_at", "last_seen", "ended_at") on public."video_lives" to authenticated;
grant update ("id", "author_id", "author_name", "author_emoji", "author_photo", "title", "status", "started_at", "last_seen", "ended_at") on public."video_lives" to authenticated;
grant delete on public."video_lives" to authenticated;
alter table public."access_policies" enable row level security;
alter table public."activite_jour" enable row level security;
alter table public."analytics_events" enable row level security;
alter table public."blocks" enable row level security;
alter table public."call_invites" enable row level security;
alter table public."cdv_live_collaborators" enable row level security;
alter table public."cdv_live_comments" enable row level security;
alter table public."cdv_live_followers" enable row level security;
alter table public."cdv_live_reactions" enable row level security;
alter table public."cdv_live_steps" enable row level security;
alter table public."cdv_lives" enable row level security;
alter table public."client_errors" enable row level security;
alter table public."client_errors_par_heure" enable row level security;
alter table public."client_errors_top_24h" enable row level security;
alter table public."comment_interactions" enable row level security;
alter table public."comment_likes" enable row level security;
alter table public."comptes_en_suppression" enable row level security;
alter table public."contenus_masques" enable row level security;
alter table public."conv_members" enable row level security;
alter table public."conv_messages" enable row level security;
alter table public."conv_reads" enable row level security;
alter table public."conversations" enable row level security;
alter table public."croissance_jour" enable row level security;
alter table public."event_attendees" enable row level security;
alter table public."event_checkin_secrets" enable row level security;
alter table public."event_comments" enable row level security;
alter table public."event_reactions" enable row level security;
alter table public."events" enable row level security;
alter table public."follows" enable row level security;
alter table public."migrations_appliquees" enable row level security;
alter table public."moderation_actions" enable row level security;
alter table public."notifications" enable row level security;
alter table public."passion_quotas" enable row level security;
alter table public."passion_relations" enable row level security;
alter table public."passion_requests" enable row level security;
alter table public."passions" enable row level security;
alter table public."post_collaborators" enable row level security;
alter table public."post_comments" enable row level security;
alter table public."post_likes" enable row level security;
alter table public."posts" enable row level security;
alter table public."profiles" enable row level security;
alter table public."push_subscriptions" enable row level security;
alter table public."reglages_distants" enable row level security;
alter table public."reports" enable row level security;
alter table public."signalements_preuves" enable row level security;
alter table public."step_interactions" enable row level security;
alter table public."stories" enable row level security;
alter table public."story_views" enable row level security;
alter table public."telemetrie_debit" enable row level security;
alter table public."telemetry_events" enable row level security;
alter table public."telemetry_last24h" enable row level security;
alter table public."user_passions" enable row level security;
alter table public."user_safety" enable row level security;
alter table public."user_state" enable row level security;
alter table public."video_lives" enable row level security;
alter table storage.objects enable row level security;
alter table realtime.messages enable row level security;
create policy "analytics_insert_own" on "public"."analytics_events" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "blocks_delete_own" on "public"."blocks" for DELETE to public using ((blocker_id = (( SELECT auth.uid() AS uid))::text));
create policy "blocks_insert_own" on "public"."blocks" for INSERT to public with check (((blocker_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "blocks_select_own" on "public"."blocks" for SELECT to public using ((blocker_id = (( SELECT auth.uid() AS uid))::text));
create policy "call_invites_insert_propre" on "public"."call_invites" for INSERT to authenticated with check (((from_id = (( SELECT auth.uid() AS uid))::text) AND appel_autorise(to_id) AND (NOT suppression_de_mon_compte())));
create policy "call_invites_select_siennes" on "public"."call_invites" for SELECT to authenticated using (((from_id = (( SELECT auth.uid() AS uid))::text) OR (to_id = (( SELECT auth.uid() AS uid))::text)));
create policy "call_invites_update_propre" on "public"."call_invites" for UPDATE to authenticated using ((from_id = (( SELECT auth.uid() AS uid))::text)) with check (((from_id = (( SELECT auth.uid() AS uid))::text) AND appel_autorise(to_id) AND (NOT suppression_de_mon_compte())));
create policy "cdv_collab_delete" on "public"."cdv_live_collaborators" for DELETE to public using (((user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM cdv_lives l
  WHERE ((l.id = cdv_live_collaborators.live_id) AND (l.author_id = (( SELECT auth.uid() AS uid))::text))))));
create policy "cdv_collab_insert_owner" on "public"."cdv_live_collaborators" for INSERT to public with check (((added_by = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM cdv_lives l
  WHERE ((l.id = cdv_live_collaborators.live_id) AND (l.author_id = (( SELECT auth.uid() AS uid))::text)))) AND (NOT suppression_de_mon_compte())));
create policy "cdv_collab_select" on "public"."cdv_live_collaborators" for SELECT to public using (true);
create policy "cdv_comments_delete_own" on "public"."cdv_live_comments" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "cdv_comments_insert_own" on "public"."cdv_live_comments" for INSERT to public with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "cdv_comments_select" on "public"."cdv_live_comments" for SELECT to public using (true);
create policy "cdv_followers_delete_own" on "public"."cdv_live_followers" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "cdv_followers_insert_own" on "public"."cdv_live_followers" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "cdv_followers_select" on "public"."cdv_live_followers" for SELECT to public using (true);
create policy "cdv_reactions_delete_own" on "public"."cdv_live_reactions" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "cdv_reactions_insert_own" on "public"."cdv_live_reactions" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "cdv_reactions_select" on "public"."cdv_live_reactions" for SELECT to public using (true);
create policy "cdv_steps_delete_own" on "public"."cdv_live_steps" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "cdv_steps_insert_own" on "public"."cdv_live_steps" for INSERT to public with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "cdv_steps_select" on "public"."cdv_live_steps" for SELECT to public using (true);
create policy "cdv_steps_update_own" on "public"."cdv_live_steps" for UPDATE to public using ((author_id = (( SELECT auth.uid() AS uid))::text)) with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "cdv_lives_delete_own" on "public"."cdv_lives" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "cdv_lives_insert_own" on "public"."cdv_lives" for INSERT to public with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "cdv_lives_select" on "public"."cdv_lives" for SELECT to public using (((visibility <> 'private'::text) OR (author_id = (( SELECT auth.uid() AS uid))::text)));
create policy "cdv_lives_update_own" on "public"."cdv_lives" for UPDATE to public using ((author_id = (( SELECT auth.uid() AS uid))::text)) with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "Insert erreurs" on "public"."client_errors" for INSERT to public with check ((true AND (NOT suppression_de_mon_compte())));
create policy "Lecture selon visibilite de la cible" on "public"."comment_interactions" for SELECT to public using (((user_id = (( SELECT auth.uid() AS uid))::text) OR comment_target_visible(comment_id, post_id)));
create policy "ci_delete" on "public"."comment_interactions" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "ci_insert" on "public"."comment_interactions" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "comment_likes_delete_own" on "public"."comment_likes" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "comment_likes_insert_own" on "public"."comment_likes" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "comment_likes_select" on "public"."comment_likes" for SELECT to public using (true);
create policy "Ecriture propre" on "public"."conv_members" for INSERT to authenticated with check (((is_conversation_creator(conv_id) OR ((user_id = (( SELECT auth.uid() AS uid))::text) AND can_join_event_conversation(conv_id))) AND (NOT is_blocked_with(user_id)) AND (NOT suppression_de_mon_compte())));
create policy "Suppression admin" on "public"."conv_members" for DELETE to public using (((user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conv_members.conv_id) AND (c.created_by = (( SELECT auth.uid() AS uid))::text))))));
create policy "conv_members_select_member" on "public"."conv_members" for SELECT to authenticated using ((is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (("left"(conv_id, 6) <> 'evgrp_'::text) OR (user_id = (( SELECT auth.uid() AS uid))::text) OR (NOT is_blocked_with(user_id)))));
create policy "Suppression propre" on "public"."conv_messages" for DELETE to public using ((from_id = (( SELECT auth.uid() AS uid))::text));
create policy "Update propre" on "public"."conv_messages" for UPDATE to authenticated using ((from_id = (( SELECT auth.uid() AS uid))::text)) with check (((from_id = (( SELECT auth.uid() AS uid))::text) AND is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (NOT conv_1a1_bloquee(conv_id)) AND (NOT suppression_de_mon_compte())));
create policy "conv_messages_insert_member" on "public"."conv_messages" for INSERT to authenticated with check (((from_id = (( SELECT auth.uid() AS uid))::text) AND is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (NOT conv_1a1_bloquee(conv_id)) AND (NOT suppression_de_mon_compte())));
create policy "conv_messages_select_member" on "public"."conv_messages" for SELECT to authenticated using ((is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (NOT is_blocked_with(from_id))));
create policy "reads_select" on "public"."conv_reads" for SELECT to authenticated using (is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text));
create policy "reads_update" on "public"."conv_reads" for UPDATE to authenticated using ((user_id = (( SELECT auth.uid() AS uid))::text)) with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "reads_upsert" on "public"."conv_reads" for INSERT to authenticated with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "Suppression conversation orpheline" on "public"."conversations" for DELETE to public using (((created_by = (( SELECT auth.uid() AS uid))::text) AND (NOT (EXISTS ( SELECT 1
   FROM conv_members m
  WHERE (m.conv_id = conversations.id))))));
create policy "conversations_insert_creator" on "public"."conversations" for INSERT to authenticated with check ((created_by = (( SELECT auth.uid() AS uid))::text));
create policy "conversations_select_member" on "public"."conversations" for SELECT to authenticated using (is_conv_member(id, (( SELECT auth.uid() AS uid))::text));
create policy "Suppression propre" on "public"."event_attendees" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "event_attendees_insert_own_adult" on "public"."event_attendees" for INSERT to authenticated with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (adult_access_allowed() OR (rsvp = 'declined'::text)) AND (NOT suppression_de_mon_compte())));
create policy "event_attendees_select_lien" on "public"."event_attendees" for SELECT to authenticated using (((user_id = (( SELECT auth.uid() AS uid))::text) OR organise_activite(event_id) OR ((rsvp IS DISTINCT FROM 'declined'::text) AND (NOT is_blocked_with(user_id)) AND (vient_a_activite(event_id) OR ((EXISTS ( SELECT 1
   FROM follows f
  WHERE ((f.follower_id = (( SELECT auth.uid() AS uid))::text) AND (f.following_id = event_attendees.user_id) AND (f.status = 'accepted'::text)))) AND (EXISTS ( SELECT 1
   FROM follows r
  WHERE ((r.follower_id = event_attendees.user_id) AND (r.following_id = (( SELECT auth.uid() AS uid))::text) AND (r.status = 'accepted'::text)))))))));
create policy "event_attendees_update_own_adult" on "public"."event_attendees" for UPDATE to authenticated using ((user_id = (( SELECT auth.uid() AS uid))::text)) with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (adult_access_allowed() OR (rsvp = 'declined'::text)) AND (NOT suppression_de_mon_compte())));
create policy "secret_lisible_par_organisateurs" on "public"."event_checkin_secrets" for SELECT to public using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_checkin_secrets.event_id) AND ((e.author_id = (( SELECT auth.uid() AS uid))::text) OR ((e.co_organizers IS NOT NULL) AND (jsonb_typeof(e.co_organizers) = 'array'::text) AND (e.co_organizers ? (( SELECT auth.uid() AS uid))::text)))))));
create policy "event_comments_delete_own" on "public"."event_comments" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "event_comments_insert_own" on "public"."event_comments" for INSERT to authenticated with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT event_auteur_bloque(event_id)) AND (NOT suppression_de_mon_compte())));
create policy "event_comments_select" on "public"."event_comments" for SELECT to public using (true);
create policy "event_reactions_delete" on "public"."event_reactions" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "event_reactions_insert" on "public"."event_reactions" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "event_reactions_select" on "public"."event_reactions" for SELECT to public using (true);
create policy "Lecture publique" on "public"."events" for SELECT to public using (true);
create policy "Suppression propre" on "public"."events" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "Update organisateurs" on "public"."events" for UPDATE to public using (((author_id = (( SELECT auth.uid() AS uid))::text) OR jsonb_exists(co_organizers, (( SELECT auth.uid() AS uid))::text))) with check ((((author_id = (( SELECT auth.uid() AS uid))::text) OR jsonb_exists(co_organizers, (( SELECT auth.uid() AS uid))::text)) AND (NOT suppression_de_mon_compte())));
create policy "events_insert_author_adult" on "public"."events" for INSERT to authenticated with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND adult_access_allowed() AND (NOT suppression_de_mon_compte())));
create policy "Ecriture propre" on "public"."follows" for INSERT to authenticated with check (((follower_id = (( SELECT auth.uid() AS uid))::text) AND (NOT is_blocked_with(following_id)) AND (NOT suppression_de_mon_compte())));
create policy "Suppression propre" on "public"."follows" for DELETE to public using (((follower_id = (( SELECT auth.uid() AS uid))::text) OR (following_id = (( SELECT auth.uid() AS uid))::text)));
create policy "follows_accepter" on "public"."follows" for UPDATE to authenticated using ((following_id = (( SELECT auth.uid() AS uid))::text)) with check (((following_id = (( SELECT auth.uid() AS uid))::text) AND (status = 'accepted'::text) AND (NOT suppression_de_mon_compte())));
create policy "follows_lecture" on "public"."follows" for SELECT to anon, authenticated using (((status = 'accepted'::text) OR (follower_id = (( SELECT auth.uid() AS uid))::text) OR (following_id = (( SELECT auth.uid() AS uid))::text)));
create policy "Lecture propre" on "public"."notifications" for SELECT to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "Suppression propre" on "public"."notifications" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "Update propre" on "public"."notifications" for UPDATE to public using ((user_id = (( SELECT auth.uid() AS uid))::text)) with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "notifications_insert_own_author" on "public"."notifications" for INSERT to authenticated with check (((from_id = (( SELECT auth.uid() AS uid))::text) AND (NOT is_blocked_with(user_id)) AND (NOT suppression_de_mon_compte()) AND (NOT genres_reserves_au_serveur(kind)) AND (NOT identifiant_reserve_au_serveur(id))));
create policy "passion_quotas_select_own" on "public"."passion_quotas" for SELECT to public using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "passion_relations_select_all" on "public"."passion_relations" for SELECT to public using (true);
create policy "passion_requests_insert_own" on "public"."passion_requests" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "passion_requests_select_own" on "public"."passion_requests" for SELECT to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "passions_select_all" on "public"."passions" for SELECT to public using (true);
create policy "post_collab_delete" on "public"."post_collaborators" for DELETE to public using (((user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_collaborators.post_id) AND (p.author_id = (( SELECT auth.uid() AS uid))::text))))));
create policy "post_collab_insert_owner" on "public"."post_collaborators" for INSERT to public with check (((added_by = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_collaborators.post_id) AND (p.author_id = (( SELECT auth.uid() AS uid))::text)))) AND (NOT suppression_de_mon_compte())));
create policy "post_collab_select" on "public"."post_collaborators" for SELECT to public using (true);
create policy "Ecriture propre" on "public"."post_comments" for INSERT to authenticated with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT post_auteur_bloque(post_id)) AND (NOT suppression_de_mon_compte())));
create policy "Lecture selon visibilite du post" on "public"."post_comments" for SELECT to public using (((author_id = (( SELECT auth.uid() AS uid))::text) OR post_is_visible(post_id)));
create policy "Suppression propre" on "public"."post_comments" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "Update propre" on "public"."post_comments" for UPDATE to authenticated using ((author_id = (( SELECT auth.uid() AS uid))::text)) with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT post_auteur_bloque(post_id)) AND (NOT suppression_de_mon_compte())));
create policy "Ecriture propre" on "public"."post_likes" for INSERT to authenticated with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT post_auteur_bloque(post_id)) AND (NOT suppression_de_mon_compte())));
create policy "Lecture selon visibilite du post" on "public"."post_likes" for SELECT to public using (((user_id = (( SELECT auth.uid() AS uid))::text) OR post_is_visible(post_id)));
create policy "Suppression propre" on "public"."post_likes" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "Ecriture propre" on "public"."posts" for INSERT to public with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "Lecture respectant les comptes prives" on "public"."posts" for SELECT to public using (((author_id = (( SELECT auth.uid() AS uid))::text) OR (NOT (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = posts.author_id) AND (pr.is_private = true))))) OR abonne_accepte_non_bloque(author_id)));
create policy "Masquage apres signalements" on "public"."posts" as restrictive for SELECT to public using (((author_id = (( SELECT auth.uid() AS uid))::text) OR (NOT post_masque(id))));
create policy "Suppression propre" on "public"."posts" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "Update propre" on "public"."posts" for UPDATE to authenticated using (can_edit_post(id)) with check ((can_edit_post(id) AND (NOT suppression_de_mon_compte())));
create policy "Lecture publique" on "public"."profiles" for SELECT to public using (true);
create policy "Suppression propre" on "public"."profiles" for DELETE to public using ((id = (( SELECT auth.uid() AS uid))::text));
create policy "Update propre" on "public"."profiles" for UPDATE to public using ((id = (( SELECT auth.uid() AS uid))::text)) with check (((id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "Upsert propre" on "public"."profiles" for INSERT to public with check (((id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "push_delete_own" on "public"."push_subscriptions" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "push_insert_own" on "public"."push_subscriptions" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "push_select_own" on "public"."push_subscriptions" for SELECT to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "push_update_own" on "public"."push_subscriptions" for UPDATE to public using ((user_id = (( SELECT auth.uid() AS uid))::text)) with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "reglages_distants_lecture" on "public"."reglages_distants" for SELECT to anon, authenticated using (true);
create policy "reports_insert" on "public"."reports" for INSERT to public with check ((reporter_id = (( SELECT auth.uid() AS uid))::text));
create policy "si_delete" on "public"."step_interactions" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "si_insert" on "public"."step_interactions" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "si_select" on "public"."step_interactions" for SELECT to public using (true);
create policy "Ecriture propre" on "public"."stories" for INSERT to public with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "Lecture stories respectant les comptes prives" on "public"."stories" for SELECT to public using (((author_id = (( SELECT auth.uid() AS uid))::text) OR (NOT (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = stories.author_id) AND (pr.is_private = true))))) OR abonne_accepte_non_bloque(author_id)));
create policy "Suppression propre" on "public"."stories" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "story_views_delete_own" on "public"."story_views" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "story_views_insert_own" on "public"."story_views" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "story_views_select_own" on "public"."story_views" for SELECT to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "telemetry_insert_own" on "public"."telemetry_events" for INSERT to public with check ((((user_id IS NULL) OR (user_id = (( SELECT auth.uid() AS uid))::text)) AND (NOT suppression_de_mon_compte())));
create policy "user_passions_delete_own" on "public"."user_passions" for DELETE to public using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "user_passions_insert_own" on "public"."user_passions" for INSERT to public with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "user_passions_select_all" on "public"."user_passions" for SELECT to public using (true);
create policy "user_passions_update_own" on "public"."user_passions" for UPDATE to public using ((user_id = (( SELECT auth.uid() AS uid))::text)) with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "user_safety_select_own" on "public"."user_safety" for SELECT to authenticated using ((user_id = (( SELECT auth.uid() AS uid))::text));
create policy "user_state_delete_own" on "public"."user_state" for DELETE to public using (((( SELECT auth.uid() AS uid))::text = user_id));
create policy "user_state_insert_own" on "public"."user_state" for INSERT to public with check ((((( SELECT auth.uid() AS uid))::text = user_id) AND (NOT suppression_de_mon_compte())));
create policy "user_state_select_own" on "public"."user_state" for SELECT to public using (((( SELECT auth.uid() AS uid))::text = user_id));
create policy "user_state_update_own" on "public"."user_state" for UPDATE to public using (((( SELECT auth.uid() AS uid))::text = user_id)) with check ((((( SELECT auth.uid() AS uid))::text = user_id) AND (NOT suppression_de_mon_compte())));
create policy "video_lives_delete" on "public"."video_lives" for DELETE to public using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "video_lives_insert" on "public"."video_lives" for INSERT to public with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "video_lives_select" on "public"."video_lives" for SELECT to public using (true);
create policy "video_lives_update" on "public"."video_lives" for UPDATE to public using ((author_id = (( SELECT auth.uid() AS uid))::text)) with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte())));
create policy "Utilisateur reçoit ses messages" on "realtime"."messages" for SELECT to authenticated using ((realtime.topic() = ('user:'::text || (( SELECT auth.uid() AS uid))::text)));
create policy "passio_rt_emettre" on "realtime"."messages" for INSERT to authenticated with check (((realtime.topic() ~~ 'call:%'::text) OR (realtime.topic() ~~ 'vlive:%'::text) OR ((realtime.topic() ~~ 'typing:%'::text) AND is_conv_member(substr(realtime.topic(), 8), (( SELECT auth.uid() AS uid))::text)) OR ((realtime.topic() ~~ 'conv:%'::text) AND is_conv_member(substr(realtime.topic(), 6), (( SELECT auth.uid() AS uid))::text))));
create policy "passio_rt_recevoir" on "realtime"."messages" for SELECT to authenticated using ((((realtime.topic() ~~ 'ring:%'::text) AND (substr(realtime.topic(), 6) = (( SELECT auth.uid() AS uid))::text)) OR (realtime.topic() ~~ 'call:%'::text) OR (realtime.topic() ~~ 'vlive:%'::text) OR (realtime.topic() = 'realtime:db'::text) OR ((realtime.topic() ~~ 'typing:%'::text) AND is_conv_member(substr(realtime.topic(), 8), (( SELECT auth.uid() AS uid))::text)) OR ((realtime.topic() ~~ 'conv:%'::text) AND is_conv_member(substr(realtime.topic(), 6), (( SELECT auth.uid() AS uid))::text)) OR ((realtime.topic() ~~ 'conv_specific:%'::text) AND is_conv_member(substr(realtime.topic(), 15), (( SELECT auth.uid() AS uid))::text))));
create policy "passio_rt_recevoir_visiteur" on "realtime"."messages" for SELECT to anon using ((realtime.topic() = 'realtime:db'::text));
create policy "passio_attachments_read_membre" on "storage"."objects" for SELECT to authenticated using (((bucket_id = 'attachments'::text) AND is_conv_member((storage.foldername(name))[2], (( SELECT auth.uid() AS uid))::text)));
create policy "passio_content_read" on "storage"."objects" for SELECT to public using ((bucket_id = 'content'::text));
create policy "passio_media_delete" on "storage"."objects" for DELETE to authenticated using (((bucket_id = ANY (ARRAY['content'::text, 'attachments'::text])) AND (owner = auth.uid())));
create policy "passio_media_insert_cloisonne" on "storage"."objects" for INSERT to authenticated with check ((storage_chemin_autorise(bucket_id, name) AND (NOT suppression_de_mon_compte())));
create policy "passio_media_update_cloisonne" on "storage"."objects" for UPDATE to authenticated using (((bucket_id = ANY (ARRAY['content'::text, 'attachments'::text])) AND (owner = ( SELECT auth.uid() AS uid)))) with check ((storage_chemin_autorise(bucket_id, name) AND (NOT suppression_de_mon_compte())));
-- Comme Supabase : tout objet futur de public naît ouvert (ce que le lot 1 retire).
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
reset client_min_messages;

-- ── Après la lecture du catalogue ──
-- Structure des deux migrations appliquées ensuite en production : id 33 (06/11 21:38 UTC,
-- migration_discussions_activite_2026-11-06.sql) et id 34 (07/11 08:33 UTC,
-- migration_epingle_commentaire_2026-11-05.sql). Sans leurs verdicts. Le résultat est comparé à
-- la production par empreintes de fonctions, policies, contraintes, déclencheurs et colonnes.
create or replace function public.is_conv_member(_conv_id text, _uid text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  -- C-02 / R41 (2026-11-06) : avec une session, l'appartenance ne se lit que
  -- sur l'appelant ; sans session (postgres, service_role, déclencheur hors
  -- requête cliente), inchangée. L'appelant est contrôlé AVANT la lecture : sur
  -- autrui, conv_members n'est pas lu ; et l'égalité vient en tête : les
  -- policies, qui passent l'appelant, n'évaluent auth.uid() qu'une fois.
  -- migrations/migration_discussions_activite_2026-11-06.sql
  select (_uid = (auth.uid())::text or auth.uid() is null)
     and exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)
$fn$;
revoke all on function public.is_conv_member(text, text) from public, anon;
grant execute on function public.is_conv_member(text, text) to authenticated, service_role;


drop policy if exists conv_members_select_member on public.conv_members;
create policy conv_members_select_member on public.conv_members
  for select to authenticated
  using (
    public.is_conv_member(conv_id, (select auth.uid())::text)
    and (
      left(conv_id, 6) <> 'evgrp_'
      or user_id = (select auth.uid())::text
      or not public.is_blocked_with(conv_members.user_id)
      -- RV-44 : le créateur voit tous ses membres, bloqués compris — il peut les
      -- retirer (« Suppression admin »), comme l'organisation voit toute la liste.
      or public.is_conversation_creator(conv_id)
    )
  );

-- Le verrou ACCESS EXCLUSIVE de conv_members est TENU depuis le DROP POLICY :
-- toute attente qui suit le prolongerait d'autant — et realtime.send, que le décor
-- déclenche, AVALE 55P03 (sept attentes de 3 s : 27 s de messagerie gelée,
-- mesurées à la contre-revue du 06/11). Désormais chaque attente est bornée à
-- 200 ms ; une vraie contention fait échouer la migration ENTIÈRE, sans rien
-- appliquer (banc § ⑩).
set local lock_timeout = '200ms';


alter table public.comment_interactions
  drop constraint if exists ci_kind_check,
  add constraint ci_kind_check check (kind = any (array['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text, 'pin'::text])),
  drop constraint if exists ci_pin_payload_check,
  add constraint ci_pin_payload_check check (kind <> 'pin'::text or (payload is not null and payload = any (array['0'::text, '1'::text])));


create or replace function public.ci_epingle_garde()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  moi              text := (auth.uid())::text;
  publication      boolean;
  activite         boolean;
  proprio_pub      text;
  proprio_activite text;
begin
  -- L'administration n'est pas jugée : le rôle « none » d'une migration,
  -- service_role, une restauration ou une purge reprennent des lignes déjà
  -- jugées à leur écriture. Seuls les rôles CLIENTS le sont.
  if coalesce(pg_catalog.current_setting('role', true), 'none') not in ('anon', 'authenticated') then
    return new;
  end if;
  if moi is not null
     and new.user_id is not distinct from moi
     and new.post_id is not null
     and new.payload is not null and new.payload in ('0', '1') then
    -- Le GENRE du fil se lit dans post_id ; le commentaire doit être de CE fil,
    -- dans la table de CE genre. Un identifiant présent dans les DEUX tables de
    -- fils est un fil HOMONYME.
    publication := exists (select 1 from public.posts p where p.id = new.post_id);
    activite := exists (select 1 from public.events e where e.id = new.post_id);
    if publication then
      select p.author_id into proprio_pub from public.posts p
       where p.id = new.post_id
         and exists (select 1 from public.post_comments c
                      where c.id = new.comment_id and c.post_id = new.post_id);
    end if;
    if activite then
      select coalesce(nullif(e.organizer_id, ''), e.author_id) into proprio_activite from public.events e
       where e.id = new.post_id
         and exists (select 1 from public.event_comments ec
                      where ec.id = new.comment_id and ec.event_id = new.post_id);
    end if;
    -- Le propriétaire de CE fil, sur un commentaire de CE fil ; un « 1 » hors
    -- d'un fil homonyme. Un « 0 » n'affiche rien : il passe, homonyme ou non.
    if (proprio_pub is not distinct from moi or proprio_activite is not distinct from moi)
       and (new.payload = '0' or not (publication and activite)) then
      return new;
    end if;
  end if;
  -- UN SEUL REFUS, au mot près, quelle que soit la raison — sans identité, au nom
  -- d'autrui, sans fil, charge invalide, commentaire d'un autre fil ou inconnu,
  -- fil homonyme, appelant qui n'en est pas le propriétaire.
  raise exception 'new row violates row-level security policy for table "comment_interactions"'
    using errcode = '42501',
          hint = 'épingle : réservée au propriétaire du fil, sur un commentaire de ce fil';
end
$fn$;
comment on function public.ci_epingle_garde() is
  'RV-38 (2026-11-05, révisée le 06/11) : déclencheur BEFORE INSERT OR UPDATE de comment_interactions, WHEN kind = pin — seul le propriétaire du fil (auteur de la publication, organisateur de l''activité) épingle un commentaire de ce fil ; genre du fil lu dans post_id ; aucun « 1 » dans un fil homonyme ; charge « 0 »/« 1 » ; un refus unique (42501). L''administration n''est pas jugée.';
-- Les droits par défaut de `public` donnent EXECUTE à anon et authenticated :
-- retirés. Un déclencheur s'exécute sans que l'écrivain tienne ce droit.
revoke all on function public.ci_epingle_garde() from public, anon, authenticated;

create or replace trigger trg_ci_epingle_garde
  before insert or update on public.comment_interactions
  for each row
  when (new.kind = 'pin')
  execute function public.ci_epingle_garde();

