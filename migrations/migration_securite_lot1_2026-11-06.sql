-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- AUDIT DE SÉCURITÉ 2026-11-06 — LOT 1 : MESSAGERIE, ACTIVITÉS, VIE PRIVÉE, CHAMPS LIBRES, PLAFONDS
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Serveur seul : le client déployé
-- vit avec ou sans ce lot. NON APPLIQUÉE : contre-revue, attestation, puis mesure au canal ①.
-- Banc : tests/sql/migration-securite-2026-11-06.test.sh (défaut mesuré AVANT, corrigé APRÈS).
--
-- LES DÉFAUTS (rapport B de l'audit, rejoués au banc sur la structure de production) :
--   ① Un tiers entrait dans une conversation 1:1 d'autrui : `conversations_insert_creator` ne
--     regarde que `created_by`, et le créateur inscrit qui il veut. Le client cherchant un 1:1
--     par appartenance commune, A et B écrivaient ensuite dans la conversation préparée par M,
--     qui lisait et répondait, sans nom affiché, comme l'autre partie. Aucun cas en production.
--   ② `is_conv_member('evgrp_<activité>', <compte>)` rendait la liste nominative des venants à
--     tout connecté. FERMÉ EN PRODUCTION le 06/11 par migration_discussions_activite_2026-11-06.sql
--     (id 33, C-02 / R41). Ce lot ne réécrit plus la fonction : il exige qu'elle soit fermée.
--   ③ `evgrp_<activité>` se squattait : la discussion d'une activité d'autrui bloquée ou détournée.
--   ④ Une activité s'attribuait à n'importe qui (`organizer_id`, puis `author_id`).
--   ⑤ Abonnements des comptes privés lisibles sans compte ; seau `content` listable sans compte.
--   ⑥ Un compte suspendu écrivait jusqu'à l'expiration de son jeton ; `reports` et `creer_passion`
--     échappaient à la barrière de suppression.
--   ⑦ Notifications d'un genre libre (« moderation » compris), sans borne de taille ni plafond
--     par destinataire ; `notifier_mentions` poussait vers qui on voulait, sans mention.
--   ⑧ Champs libres relus en HTML par le client (`profiles.emoji`, identifiants) sans aucune
--     contrainte : le client est corrigé, la base ne doit plus accepter ces formes.
--   ⑨ `push_subscriptions.endpoint` libre : le serveur POSTait vers une URL choisie par un compte.
--   ⑩ Plafonds des Edge Functions non atomiques (lire puis écrire) : 1 653 passes de la veille
--     sous la minute en production pour un plafond de 1/min, une salve anonyme la faisait taire.
--   ⑪ Tout futur objet de `public` naissait ouvert à `anon` (privilèges par défaut).
--
-- CE QUE CE LOT NE FAIT PAS : consentement aux ajouts de groupe (décision produit), coordonnées
-- exactes des activités (client d'abord), `contenus_masques` du 04/11 (question à l'éditeur).
--
-- ÉTAT D'ARRIVÉE À MESURER AU CANAL ① : voir le tableau de verdict.
--
-- RETOUR ARRIÈRE (éditeur SQL). Les corps d'origine des fonctions réécrites et les policies
-- d'origine sont dans tests/sql/fixtures/socle-production-2026-11-06.sql :
--| begin;
--| drop trigger if exists aa_conv_members_garde on public.conv_members;
--| drop function if exists public.conv_members_garde();
--| drop trigger if exists trg_rate_limit on public.conversations;
--| drop trigger if exists trg_push_limite on public.push_subscriptions;
--| drop function if exists public.push_limite_par_compte();
--| drop function if exists public.plafond_consommer(text, text, integer, integer);
--| alter table public.events drop constraint if exists events_organisateur_est_auteur,
--|   drop constraint if exists events_co_organizers_tableau, drop constraint if exists events_conv_id_forme,
--|   drop constraint if exists events_emoji_forme, drop constraint if exists events_cover_url_forme,
--|   drop constraint if exists events_id_forme;
--| alter table public.profiles drop constraint if exists profiles_emoji_forme, drop constraint if exists profiles_color_forme,
--|   drop constraint if exists profiles_urls_forme, drop constraint if exists profiles_username_forme;
--| alter table public.push_subscriptions drop constraint if exists push_endpoint_service_connu;
--| alter table public.notifications drop constraint if exists notifications_content_borne, drop constraint if exists notifications_id_forme;
--| alter table public.client_errors drop constraint if exists client_errors_borne;
--| alter table public.posts drop constraint if exists posts_id_forme, drop constraint if exists posts_media_url_forme;
--| alter table public.post_comments drop constraint if exists post_comments_id_forme;
--| alter table public.stories drop constraint if exists stories_id_forme, drop constraint if exists stories_media_url_forme;
--| alter table public.conversations drop constraint if exists conversations_id_forme;
--| alter table public.conv_messages drop constraint if exists conv_messages_id_forme;
--| alter table public.comment_interactions drop constraint if exists ci_identifiants_forme;
--| update storage.buckets set allowed_mime_types = null where id = 'content';
--| -- puis recréer les 6 policies et les 6 fonctions depuis le socle (jamais is_conv_member : hors de ce lot), et rétablir les droits par défaut :
--| alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
--| alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
--| alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated;
--| commit;
-- Après les fonctions et policies d'origine (lot 2, plus bas dans son en-tête) :
--|| drop function if exists public.graphe_visible(text);
--|| drop function if exists public.quota_stockage_ok();
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── Préalable : rien de ce que ce lot interdit n'existe déjà ─────────────────────────────────
do $v$ begin
  if exists (select 1 from public.conv_members m join public.conversations c on c.id = m.conv_id
              where not coalesce(c.is_group, false) group by m.conv_id having count(*) > 2) then
    raise exception 'une conversation 1:1 a déjà plus de deux membres : enquêter avant d''appliquer';
  end if;
end $v$;

-- ── ② L'oracle : exigé, pas réécrit ───────────────────────────────────────────────
-- migration_discussions_activite_2026-11-06.sql l'a fermée en production, l'égalité en tête pour le
-- coût des policies (mesuré dans ce lot-là). La réécrire ici perdrait ce gain : appliquer l'autre
-- d'abord sur une base qui ne l'a pas, le staging par exemple.
do $v$ begin
  if (select prosrc from pg_proc where oid = 'public.is_conv_member(text,text)'::regprocedure)
       not like '%_uid = (auth.uid())::text or auth.uid() is null%' then
    raise exception 'is_conv_member répond encore sur autrui : appliquer d''abord migration_discussions_activite_2026-11-06.sql';
  end if;
end $v$;

-- ── ① ③ Une conversation : qui la crée, qui y entre ─────────────────────────────────────────
drop policy if exists conversations_insert_creator on public.conversations;
create policy conversations_insert_creator on public.conversations
  for insert to authenticated
  with check (created_by = (select auth.uid())::text
              and not public.suppression_de_mon_compte()
              -- Le préfixe d'une discussion d'activité appartient à son organisation.
              and (left(id, 6) <> 'evgrp_' or public.organise_activite(substr(id, 7))));

-- Le créateur lit sa ligne : la policy de suppression d'une orpheline redevient effective
-- (elle filtrait sur une ligne invisible : 156 conversations sans membre en production).
drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated
  using (public.is_conv_member(id, (select auth.uid())::text)
         or created_by = (select auth.uid())::text);

-- Date serveur et 10 créations par minute.
drop trigger if exists trg_rate_limit on public.conversations;
create trigger trg_rate_limit before insert on public.conversations
  for each row execute function public.rate_limit_insert('created_by', '10');

-- Une conversation 1:1 a deux membres au plus, et le créateur en est : c'est la cardinalité que
-- la RLS ne peut pas dire. Le client insère le créateur d'abord (`supaCreateConversation`).
create or replace function public.conv_members_garde() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare moi text := (auth.uid())::text; c record; autres integer;
begin
  if moi is null then return new; end if;              -- service_role, purge, restauration
  select id, is_group, created_by into c from public.conversations where id = new.conv_id;
  if not found or c.created_by is distinct from moi then return new; end if;  -- FK et RLS tranchent
  perform 1 from public.conversations where id = new.conv_id for update;      -- ajouts concurrents
  select count(*) into autres from public.conv_members m
   where m.conv_id = new.conv_id and m.user_id <> new.user_id;
  if coalesce(c.is_group, false) then
    if left(c.id, 6) <> 'evgrp_' and autres >= 256 then
      raise exception 'new row violates row-level security policy for table "conv_members"'
        using errcode = '42501', hint = 'groupe complet';
    end if;
    return new;
  end if;
  if autres >= 2 or (new.user_id <> moi and not exists (
        select 1 from public.conv_members m where m.conv_id = new.conv_id and m.user_id = moi)) then
    raise exception 'new row violates row-level security policy for table "conv_members"'
      using errcode = '42501', hint = 'conversation privée : deux membres, créateur compris';
  end if;
  return new;
end $fn$;
revoke all on function public.conv_members_garde() from public, anon, authenticated;
drop trigger if exists aa_conv_members_garde on public.conv_members;
create trigger aa_conv_members_garde before insert on public.conv_members
  for each row execute function public.conv_members_garde();

-- ── ④ On ne publie pas au nom d'autrui ───────────────────────────────────────────────────────
-- `_eventRow` n'envoie jamais `author_id` ni `organizer_id` à l'UPDATE.
create or replace function public.events_admission_gardee() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then return new; end if;
  if new.author_id is distinct from old.author_id
     or new.organizer_id is distinct from old.organizer_id
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'events : auteur, organisateur, identifiant et date de création sont figés'
      using errcode = 'check_violation';
  end if;
  if public.adult_access_allowed() then return new; end if;
  if new.status = 'cancelled' and old.author_id = (auth.uid())::text then return new; end if;
  raise exception 'modification d''un événement refusée : admission requise' using errcode = 'check_violation';
end $fn$;
alter table public.events drop constraint if exists events_organisateur_est_auteur;
alter table public.events add constraint events_organisateur_est_auteur
  check (organizer_id is null or organizer_id = author_id) not valid;
alter table public.events validate constraint events_organisateur_est_auteur;
alter table public.events drop constraint if exists events_co_organizers_tableau;
alter table public.events add constraint events_co_organizers_tableau
  check (jsonb_typeof(co_organizers) = 'array') not valid;
alter table public.events validate constraint events_co_organizers_tableau;
alter table public.events drop constraint if exists events_conv_id_forme;
alter table public.events add constraint events_conv_id_forme
  check (conv_id is null or conv_id = 'evgrp_' || id) not valid;
alter table public.events validate constraint events_conv_id_forme;

-- ── ⑤ Le graphe d'un compte privé, le seau public ────────────────────────────────────────────
create or replace function public.graphe_visible(_compte text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select not exists (select 1 from public.profiles p where p.id = _compte and p.is_private)
      or public.abonne_accepte_non_bloque(_compte)
$fn$;
revoke all on function public.graphe_visible(text) from public;
grant execute on function public.graphe_visible(text) to anon, authenticated, service_role;
drop policy if exists follows_lecture on public.follows;
create policy follows_lecture on public.follows for select to anon, authenticated
  using (follower_id = (select auth.uid())::text
         or following_id = (select auth.uid())::text
         or (status = 'accepted' and public.graphe_visible(follower_id) and public.graphe_visible(following_id)));

-- Les lectures passent par l'URL publique ou /media/* : lister le seau ne sert qu'à énumérer.
drop policy if exists passio_content_read on storage.objects;
create policy passio_content_read on storage.objects for select to authenticated
  using (bucket_id = 'content' and owner = (select auth.uid()));

-- Types admis dans le seau public, et plafond par compte.
update storage.buckets set allowed_mime_types = array[
  'image/jpeg','image/jpg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','image/bmp',
  'video/mp4','video/webm','video/quicktime','video/3gpp','video/x-m4v',
  'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/webm','audio/ogg','audio/wav','audio/x-wav','audio/flac'
] where id = 'content';
create or replace function public.quota_stockage_ok() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select (select count(*) from storage.objects o
           where o.owner = (select auth.uid()) and o.created_at > now() - interval '1 hour') < 120
     and (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
           where o.owner = (select auth.uid())) < 2147483648
$fn$;
revoke all on function public.quota_stockage_ok() from public, anon;
grant execute on function public.quota_stockage_ok() to authenticated, service_role;
drop policy if exists passio_media_insert_cloisonne on storage.objects;
create policy passio_media_insert_cloisonne on storage.objects for insert to authenticated
  with check (public.storage_chemin_autorise(bucket_id, name)
              and not public.suppression_de_mon_compte()
              and public.quota_stockage_ok());

-- ── ⑥ Suspension et barrière de suppression ─────────────────────────────────────────────────
-- Un seul point à changer : les 53 policies d'écriture qui appellent ce prédicat se ferment d'un coup.
create or replace function public.suppression_de_mon_compte() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null then false
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text and c.statut in ('en_cours','purgee','supprimee'))
      or exists (select 1 from auth.users u
                  where u.id = auth.uid() and u.banned_until is not null and u.banned_until > now())
  end
$fn$;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid())::text and not public.suppression_de_mon_compte());

-- ── ⑦ Notifications ─────────────────────────────────────────────────────────────────────────
-- Liste FERMÉE des genres qu'un client écrit (relevés dans js/ et en production). Le reste,
-- `moderation` compris, est réservé au serveur.
create or replace function public.genres_reserves_au_serveur(p_kind text) returns boolean
language sql immutable set search_path = '' as $fn$
  select p_kind is null or p_kind not in (
    'like','comment','reaction','message','event_join','event_comment','event_update',
    'event_cancelled','event_reminder','event_invite','event_feedback','live_video','cdv_live_step')
$fn$;
create or replace function public.notifications_origine() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  if new.origine = 'client' and auth.uid() is not null then
    -- Le plafond de `trg_rate_limit` est par émetteur : une cible se noie sous 60 lignes par minute.
    if (select count(*) from public.notifications n
         where n.from_id = new.from_id and n.user_id = new.user_id
           and n.created_at > now() - interval '1 minute') >= 10 then
      raise exception 'rate limit: max 10 notifications/minute vers un même compte' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $fn$;
alter table public.notifications drop constraint if exists notifications_content_borne;
alter table public.notifications add constraint notifications_content_borne
  check (content is null or char_length(content) <= 600) not valid;
alter table public.notifications validate constraint notifications_content_borne;

-- `notifier_mentions` : `c.name` n'existe pas (42703, R36), et une mention exige désormais un
-- commentaire qui la porte. Réécriture ciblée : un marqueur absent fait échouer la transaction.
do $m$
declare src text; ligne text := 'if public.is_blocked_with(cible) then continue; end if;';
begin
  select pg_get_functiondef('public.notifier_mentions(text,text,text[])'::regprocedure) into src;
  src := replace(src, E'\r\n', E'\n');
  -- Rejouable : déjà réécrite, on ne repasse pas.
  if position('btrim(c.group_name)' in src) > 0 and position('position(''@''' in src) > 0 then return; end if;
  if position('btrim(c.name)' in src) = 0 or position(ligne in src) = 0 then
    raise exception 'notifier_mentions : la forme attendue a changé, relire la fonction';
  end if;
  src := replace(src, 'btrim(c.name)', 'btrim(c.group_name)');
  src := replace(src, ligne, ligne || $add$
    if p_genre = 'commentaire' and not exists (
         select 1 from public.post_comments c join public.profiles p on p.id = cible
          where c.post_id = p_ref_id and c.author_id = moi
            and c.created_at > now() - interval '10 minutes'
            and position('@' || lower(btrim(p.username)) in lower(c.content)) > 0) then
      continue;
    end if;$add$);
  execute src;
end $m$;

-- ── ⑥ bis `creer_passion` passe par la barrière ─────────────────────────────────────────────
do $m$
declare src text; ligne text := 'raise exception ''auth_requise'' using errcode = ''42501'';
  end if;';
begin
  select pg_get_functiondef('public.creer_passion(text,text,text[])'::regprocedure) into src;
  -- La production porte cette fonction en fins de ligne Windows : un motif sur deux lignes ne s'y retrouvait pas.
  src := replace(src, E'\r\n', E'\n');
  if position('suppression_de_mon_compte' in src) > 0 then return; end if;
  if position(ligne in src) = 0 then raise exception 'creer_passion : la forme attendue a changé, relire la fonction'; end if;
  src := replace(src, ligne, ligne || $add$
  if public.suppression_de_mon_compte() then
    raise exception 'auth_requise' using errcode = '42501';
  end if;$add$);
  execute src;
end $m$;

-- ── ⑧ Champs libres relus en HTML par le client ─────────────────────────────────────────────
-- Mesuré au canal ① le 2026-11-06 : aucune ligne hors de ces formes.
alter table public.profiles drop constraint if exists profiles_emoji_forme;
alter table public.profiles add constraint profiles_emoji_forme
  check (emoji is null or (char_length(emoji) <= 16 and emoji !~ '[<>&"''`\\]')) not valid;
alter table public.profiles validate constraint profiles_emoji_forme;
alter table public.profiles drop constraint if exists profiles_color_forme;
alter table public.profiles add constraint profiles_color_forme
  check (color is null or (color ~ '^[#a-zA-Z0-9(),.% -]{1,64}$' and color !~* 'url|expression')) not valid;
alter table public.profiles validate constraint profiles_color_forme;
alter table public.profiles drop constraint if exists profiles_urls_forme;
alter table public.profiles add constraint profiles_urls_forme
  check ((avatar_url is null or avatar_url ~ '^(https://|data:image/)') and (cover_url is null or cover_url ~ '^(https://|data:image/)')) not valid;
alter table public.profiles validate constraint profiles_urls_forme;
alter table public.profiles drop constraint if exists profiles_username_forme;
alter table public.profiles add constraint profiles_username_forme check (
  char_length(username) between 1 and 40
  and username !~ '[[:cntrl:]]'
  and public.passion_plier(username) !~ '\m(passio|moderation|moderateur|administrateur|admin|support|securite)\M'
) not valid;
alter table public.profiles validate constraint profiles_username_forme;
alter table public.events drop constraint if exists events_emoji_forme;
alter table public.events add constraint events_emoji_forme
  check (emoji is null or (char_length(emoji) <= 16 and emoji !~ '[<>&"''`\\]')) not valid;
alter table public.events validate constraint events_emoji_forme;
alter table public.events drop constraint if exists events_cover_url_forme;
alter table public.events add constraint events_cover_url_forme
  check (cover_url is null or cover_url ~ '^(https://|data:image/)') not valid;
alter table public.events validate constraint events_cover_url_forme;
alter table public.posts drop constraint if exists posts_media_url_forme;
alter table public.posts add constraint posts_media_url_forme
  check (media_url is null or media_url ~ '^(https://|data:(image|video|audio)/)') not valid;
alter table public.posts validate constraint posts_media_url_forme;
alter table public.stories drop constraint if exists stories_media_url_forme;
alter table public.stories add constraint stories_media_url_forme
  check (media_url is null or media_url ~ '^(https://|data:(image|video|audio)/)') not valid;
alter table public.stories validate constraint stories_media_url_forme;

-- Identifiants choisis par le client : une seule forme, celle que le client fabrique.
alter table public.posts drop constraint if exists posts_id_forme;
alter table public.posts add constraint posts_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$') not valid;
alter table public.posts validate constraint posts_id_forme;
alter table public.post_comments drop constraint if exists post_comments_id_forme;
alter table public.post_comments add constraint post_comments_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$') not valid;
alter table public.post_comments validate constraint post_comments_id_forme;
alter table public.stories drop constraint if exists stories_id_forme;
alter table public.stories add constraint stories_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$') not valid;
alter table public.stories validate constraint stories_id_forme;
alter table public.events drop constraint if exists events_id_forme;
alter table public.events add constraint events_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$') not valid;
alter table public.events validate constraint events_id_forme;
alter table public.conversations drop constraint if exists conversations_id_forme;
alter table public.conversations add constraint conversations_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$') not valid;
alter table public.conversations validate constraint conversations_id_forme;
alter table public.conv_messages drop constraint if exists conv_messages_id_forme;
alter table public.conv_messages add constraint conv_messages_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$') not valid;
alter table public.conv_messages validate constraint conv_messages_id_forme;
alter table public.notifications drop constraint if exists notifications_id_forme;
alter table public.notifications add constraint notifications_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$') not valid;
alter table public.notifications validate constraint notifications_id_forme;
alter table public.comment_interactions drop constraint if exists ci_identifiants_forme;
alter table public.comment_interactions add constraint ci_identifiants_forme check (
  id ~ '^[A-Za-z0-9_-]{1,120}$'
  and comment_id ~ '^[A-Za-z0-9_:.+-]{1,120}$'
  and (post_id is null or post_id ~ '^[A-Za-z0-9_:.+-]{1,120}$')
) not valid;
alter table public.comment_interactions validate constraint ci_identifiants_forme;

-- ── ⑨ Abonnements push : les services des navigateurs, un nombre borné ───────────────────────
alter table public.push_subscriptions drop constraint if exists push_endpoint_service_connu;
alter table public.push_subscriptions add constraint push_endpoint_service_connu check (
  endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  and char_length(endpoint) <= 1024
  and subscription->>'endpoint' = endpoint
  and octet_length(subscription::text) <= 2048
) not valid;
alter table public.push_subscriptions validate constraint push_endpoint_service_connu;
create or replace function public.push_limite_par_compte() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform pg_advisory_xact_lock(hashtextextended('push:' || new.user_id, 0));
  if (select count(*) from public.push_subscriptions where user_id = new.user_id and endpoint <> new.endpoint) >= 10 then
    raise exception 'trop d''abonnements pour ce compte' using errcode = 'P0001';
  end if;
  return new;
end $fn$;
revoke all on function public.push_limite_par_compte() from public, anon, authenticated;
drop trigger if exists trg_push_limite on public.push_subscriptions;
create trigger trg_push_limite before insert on public.push_subscriptions
  for each row execute function public.push_limite_par_compte();

-- ── ⑩ Plafond atomique des Edge Functions ────────────────────────────────────────────────────
create or replace function public.plafond_consommer(p_uid text, p_fonction text, p_par_minute integer, p_par_heure integer)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_evt text := 'edge_' || p_fonction; v_h integer; v_m integer; v_a_h timestamptz; v_a_m timestamptz; v_fin timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_uid || '|' || v_evt, 0));
  select count(*), count(*) filter (where created_at > now() - interval '1 minute'), min(created_at),
         min(created_at) filter (where created_at > now() - interval '1 minute')
    into v_h, v_m, v_a_h, v_a_m
    from public.analytics_events
   where user_id = p_uid and event = v_evt and created_at > now() - interval '1 hour';
  if v_h >= p_par_heure then v_fin := v_a_h + interval '1 hour';
  elsif v_m >= p_par_minute then v_fin := v_a_m + interval '1 minute';
  end if;
  if v_fin is not null then
    return jsonb_build_object('ok', false, 'retry_after_s', greatest(1, ceil(extract(epoch from v_fin - now()))::integer));
  end if;
  insert into public.analytics_events (user_id, event, properties) values (p_uid, v_evt, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.plafond_consommer(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.plafond_consommer(text, text, integer, integer) to service_role;

alter table public.client_errors drop constraint if exists client_errors_borne;
alter table public.client_errors add constraint client_errors_borne
  check (char_length(message) <= 4000) not valid;
alter table public.client_errors validate constraint client_errors_borne;

-- ── ⑪ Privilèges par défaut ──────────────────────────────────────────────────────────────────
-- Toute migration ultérieure déclare ses droits : un oubli se voit (403), il n'ouvre rien.
alter default privileges for role postgres in schema public  revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────
select 'is_conv_member : ne parle que de l''appelant' as controle,
       case when (select prosrc from pg_proc where oid = 'public.is_conv_member(text,text)'::regprocedure) like '%_uid = (auth.uid())::text or auth.uid() is null%' then 'OK' else 'ECHEC' end as valeur
union all select 'conversations INSERT : créateur, barrière, préfixe evgrp_ réservé à l''organisation',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_insert_creator') like '%organise_activite%' then 'OK' else 'ECHEC' end
union all select 'conv_members : garde de cardinalité active, avant les autres déclencheurs',
       case when exists (select 1 from pg_trigger where tgrelid = 'public.conv_members'::regclass and tgname = 'aa_conv_members_garde' and tgenabled = 'O') then 'OK' else 'ECHEC' end
union all select 'conversations : déclencheur de plafond actif',
       case when exists (select 1 from pg_trigger where tgrelid = 'public.conversations'::regclass and tgname = 'trg_rate_limit' and tgenabled = 'O') then 'OK' else 'ECHEC' end
union all select 'aucune conversation 1:1 à plus de deux membres',
       case when not exists (select 1 from public.conv_members m join public.conversations c on c.id = m.conv_id where not coalesce(c.is_group, false) group by m.conv_id having count(*) > 2) then 'OK' else 'ECHEC' end
union all select 'events : auteur et organisateur figés, trois contraintes validées',
       case when (select count(*) from pg_constraint where conrelid = 'public.events'::regclass and convalidated and conname in ('events_organisateur_est_auteur','events_co_organizers_tableau','events_conv_id_forme')) = 3 then 'OK' else 'ECHEC' end
union all select 'follows_lecture : le graphe d''un compte privé n''est plus public',
       case when (select qual from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'follows_lecture') like '%graphe_visible%' then 'OK' else 'ECHEC' end
union all select 'seau content : lecture de ses seuls objets, liste de types posée',
       case when (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'passio_content_read') like '%owner%'
             and (select allowed_mime_types is not null from storage.buckets where id = 'content') then 'OK' else 'ECHEC' end
union all select 'barrière : un compte suspendu est refusé à l''écriture',
       case when (select prosrc from pg_proc where oid = 'public.suppression_de_mon_compte()'::regprocedure) like '%banned_until%' then 'OK' else 'ECHEC' end
union all select 'reports et creer_passion passent par la barrière',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_insert') like '%suppression_de_mon_compte%'
             and (select prosrc from pg_proc where oid = 'public.creer_passion(text,text,text[])'::regprocedure) like '%suppression_de_mon_compte%' then 'OK' else 'ECHEC' end
union all select 'notifications : genres fermés, bornes, plafond par destinataire',
       case when public.genres_reserves_au_serveur('moderation') and not public.genres_reserves_au_serveur('like')
             and (select prosrc from pg_proc where oid = 'public.notifications_origine()'::regprocedure) like '%10 notifications/minute%' then 'OK' else 'ECHEC' end
union all select 'notifier_mentions : group_name, mention exigée',
       case when (select prosrc from pg_proc where oid = 'public.notifier_mentions(text,text,text[])'::regprocedure) like '%c.group_name%'
             and (select prosrc from pg_proc where oid = 'public.notifier_mentions(text,text,text[])'::regprocedure) like '%position(''@''%' then 'OK' else 'ECHEC' end
union all select 'champs libres : contraintes validées (emoji, couleur, URL, pseudos, identifiants)',
       case when (select count(*) from pg_constraint where connamespace = 'public'::regnamespace and contype = 'c' and convalidated
                   and conname in ('profiles_emoji_forme','profiles_color_forme','profiles_urls_forme','profiles_username_forme','events_emoji_forme','events_cover_url_forme','posts_media_url_forme','stories_media_url_forme',
                                   'posts_id_forme','post_comments_id_forme','stories_id_forme','events_id_forme','conversations_id_forme','conv_messages_id_forme','notifications_id_forme','ci_identifiants_forme')) = 16 then 'OK' else 'ECHEC' end
union all select 'push : services connus seulement, plafond par compte',
       case when exists (select 1 from pg_constraint where conrelid = 'public.push_subscriptions'::regclass and conname = 'push_endpoint_service_connu' and convalidated)
             and exists (select 1 from pg_trigger where tgrelid = 'public.push_subscriptions'::regclass and tgname = 'trg_push_limite' and tgenabled = 'O') then 'OK' else 'ECHEC' end
union all select 'plafond_consommer : service_role seul',
       case when has_function_privilege('service_role', 'public.plafond_consommer(text,text,integer,integer)', 'execute')
             and not has_function_privilege('anon', 'public.plafond_consommer(text,text,integer,integer)', 'execute')
             and not has_function_privilege('authenticated', 'public.plafond_consommer(text,text,integer,integer)', 'execute') then 'OK' else 'ECHEC' end
union all select 'fonctions de garde : SECURITY DEFINER, search_path vide, aucun droit client',
       case when not exists (select 1 from pg_proc p where p.oid in ('public.conv_members_garde()'::regprocedure, 'public.push_limite_par_compte()'::regprocedure)
                              and (not p.prosecdef or array_to_string(p.proconfig, ';') <> 'search_path=""'
                                   or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) then 'OK' else 'ECHEC' end;

commit;
