-- Corps de rencontres_prive.purger_socle() relu en PRODUCTION le 2026-11-26 (canal ①, md5 brut a73992a8c1628a71e33d6f39b1fbe10a).
-- Banc tests/sql/migration-stories-proches-une.test.sh : la migration remplace CE corps, et refuse tout autre.
create schema if not exists rencontres_prive;
CREATE OR REPLACE FUNCTION rencontres_prive.purger_socle()
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
