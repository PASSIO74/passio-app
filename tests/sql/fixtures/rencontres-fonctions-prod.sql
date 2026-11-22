-- Définitions seules, photographie fournie le 16/11/2026 ; aucune donnée de compte.
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
$function$
;
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
$function$
;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.purger_donnees_expirees()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n_conv int; n_stories int; n_vues_stories int; n_lives int; n_notifs int; n_reads int; n_vues_orph int;
begin
  -- ① conversations vides et anciennes
  with cibles as (
    select c.id from public.conversations c
     where c.created_at < now() - interval '7 days'
       and not exists (select 1 from public.conv_members m where m.conv_id = c.id)
       and not exists (select 1 from public.conv_messages x where x.conv_id = c.id)
       -- la discussion d'une activité reste, même vide : `events.conv_id` la vise
       and not exists (select 1 from public.events e where e.conv_id = c.id)
     limit 5000)
  delete from public.conversations c using cibles where c.id = cibles.id;
  get diagnostics n_conv = row_count;

  -- ② stories de plus de 48 h, et leurs vues
  with cibles as (
    select s.id from public.stories s where s.created_at < now() - interval '48 hours' limit 5000),
  vues as (
    delete from public.story_views v using cibles where v.story_id = cibles.id returning 1)
  select count(*) into n_vues_stories from vues;
  with cibles as (
    select s.id from public.stories s where s.created_at < now() - interval '48 hours' limit 5000)
  delete from public.stories s using cibles where s.id = cibles.id;
  get diagnostics n_stories = row_count;

  -- ③ directs abandonnés : clos, pas effacés
  update public.video_lives v set status = 'ended', ended_at = coalesce(v.ended_at, coalesce(v.last_seen, v.started_at))
   where v.status = 'live' and coalesce(v.last_seen, v.started_at) < now() - interval '1 hour';
  get diagnostics n_lives = row_count;

  -- ④ notifications LUES de plus de 90 jours
  with cibles as (
    select n.id from public.notifications n
     where n.seen and n.created_at < now() - interval '90 days' limit 5000)
  delete from public.notifications n using cibles where n.id = cibles.id;
  get diagnostics n_notifs = row_count;

  -- ⑤ restes sans cible
  delete from public.conv_reads r
   where not exists (select 1 from public.conv_members m where m.conv_id = r.conv_id and m.user_id = r.user_id);
  get diagnostics n_reads = row_count;
  delete from public.story_views v
   where not exists (select 1 from public.stories s where s.id = v.story_id);
  get diagnostics n_vues_orph = row_count;

  return jsonb_build_object('conversations', n_conv, 'stories', n_stories, 'vues_stories', n_vues_stories + n_vues_orph,
                            'lives_clos', n_lives, 'notifications', n_notifs, 'conv_reads', n_reads);
end
$function$
;
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
    raise exception 'inscription_compte_fige' using errcode = 'P0001', hint = 'Une inscription ne change pas de compte.';
  end if;
  new.created_at := old.created_at;
  return new;
end $function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.conv_members_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.events_admission_gardee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.event_attendees_sortie_discussion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ev text := coalesce(old.event_id, new.event_id); qui text := coalesce(old.user_id, new.user_id);
begin
  if tg_op = 'UPDATE' and (new.rsvp = 'going' or old.rsvp is distinct from 'going') then return null; end if;
  delete from public.conv_members m where m.conv_id = 'evgrp_' || ev and m.user_id = qui
     and not exists (select 1 from public.events e where e.id = ev
                      and (e.author_id = qui or e.organizer_id = qui or e.co_organizers ? qui));
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.retirer_co_organisateur(p_uid text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.events set co_organizers = co_organizers - p_uid where co_organizers ? p_uid;
$function$
;
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
$function$
;
CREATE TRIGGER aa_conv_members_garde BEFORE INSERT ON public.conv_members FOR EACH ROW EXECUTE FUNCTION conv_members_garde();
CREATE TRIGGER trg_event_attendees_admission BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_admission_gardee();
CREATE TRIGGER trg_event_attendees_capacite BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_capacite_gardee();
CREATE TRIGGER trg_event_attendees_etat BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_etat_garde();
CREATE TRIGGER trg_event_attendees_figes BEFORE UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_figes();
CREATE TRIGGER trg_event_attendees_pointage BEFORE INSERT OR UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_pointage_garde();
CREATE TRIGGER trg_event_attendees_sortie_discussion AFTER DELETE OR UPDATE OF rsvp ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION event_attendees_sortie_discussion();
CREATE TRIGGER trg_events_admission BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION events_admission_gardee();
