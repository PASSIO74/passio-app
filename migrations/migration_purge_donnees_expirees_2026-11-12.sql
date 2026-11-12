-- ═══════════════════════════════════════════════════════════
-- CE QUI A EXPIRÉ PART : UNE PURGE QUOTIDIENNE, BORNÉE, JOURNALISÉE (2026-11-12, SRV-05)
--
-- Une transaction, FERMÉE SUR ÉCHEC (SQLSTATE 55000 avant `commit;`).
--
-- LE DÉFAUT (audit de stabilisation du 10/11, SRV-05, P3). Dix tâches cron, aucune
-- sur ces tables. Mesuré au canal ① le 12/11 :
--   · 178 conversations sans aucun membre sur 190 (aucune n'a de message ; 153 ont
--     plus de 7 jours) — les restes de suppressions de comptes et des conversations
--     que `authz-critical` créait en production à chaque push jusqu'au 07/11 ;
--   · 8 stories sur 8 de plus de 48 h, toujours servies par l'API (l'application ne
--     lit que les 24 dernières heures, `supaLoadStories`) ;
--   · 9 `video_lives` encore « live », sans signe depuis le 30/08 ;
--   · 107 notifications LUES de plus de 90 jours (111 au total de plus de 90 jours) ;
--   · 9 `conv_reads` sans le membre correspondant, 10 `story_views` sans story.
-- Données personnelles gardées au-delà du besoin, données périmées servies en REST,
-- mesures faussées.
--
-- LE CORRECTIF : `purger_donnees_expirees()` (SECURITY DEFINER, exécutable par
-- PERSONNE d'autre que son propriétaire), appelée chaque nuit à 03:53 par pg_cron,
-- et une fois par cette migration. Chaque catégorie est bornée à 5 000 lignes par
-- passage ; la fonction rend ses comptes en jsonb.
--   ① conversations SANS membre ET SANS message, créées il y a plus de 7 jours ;
--   ② stories de plus de 48 h (et leurs vues) ;
--   ③ directs « live » sans signe depuis plus d'une heure → `ended` (rien d'effacé) ;
--   ④ notifications LUES de plus de 90 jours (une non lue est gardée) ;
--   ⑤ `conv_reads` d'un compte qui n'est plus membre ; `story_views` sans story.
-- CE QUI NE CHANGE PAS : toute conversation qui a un membre ou un message, toute
-- story de moins de 48 h, toute notification non lue. Les FICHIERS des stories
-- restent dans le stockage (le stockage refuse un DELETE en SQL) : la purge des
-- médias orphelins les retire (`npm run medias:orphelins`, clé de service).
--
-- Canal ③ d'ADR-012 : `node scripts/appliquer-migration.mjs migrations/migration_purge_donnees_expirees_2026-11-12.sql --projet <ref>`
-- RETOUR ARRIÈRE : ce qui est effacé ne revient pas en SQL (sauvegarde quotidienne
-- Supabase) ; arrêter la purge :
--   begin;
--   select cron.unschedule(jobid) from cron.job where jobname = 'purge_donnees_expirees';
--   drop function if exists public.purger_donnees_expirees();
--   commit;
-- ═══════════════════════════════════════════════════════════
begin;

create or replace function public.purger_donnees_expirees()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  n_conv int; n_stories int; n_vues_stories int; n_lives int; n_notifs int; n_reads int; n_vues_orph int;
begin
  -- ① conversations vides et anciennes
  with cibles as (
    select c.id from public.conversations c
     where c.created_at < now() - interval '7 days'
       and not exists (select 1 from public.conv_members m where m.conv_id = c.id)
       and not exists (select 1 from public.conv_messages x where x.conv_id = c.id)
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
$fn$;

revoke all on function public.purger_donnees_expirees() from public, anon, authenticated, service_role;

-- La tâche de nuit.
do $$
begin
  if to_regclass('cron.job') is null then
    raise exception 'pg_cron absent — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'purge_donnees_expirees';
  perform cron.schedule('purge_donnees_expirees', '53 3 * * *', 'select public.purger_donnees_expirees()');
end $$;

-- ── LE PREMIER PASSAGE, mesuré par IDENTIFIANTS (une ligne arrivée pendant la
--    migration ne fausse rien ; une ligne qui devait rester et manque se voit) ──
create temp table passio_srv05_garder on commit drop as
select 'conv' t, c.id from public.conversations c
 where exists (select 1 from public.conv_members m where m.conv_id = c.id)
    or exists (select 1 from public.conv_messages x where x.conv_id = c.id)
    or c.created_at >= now() - interval '7 days'
union all select 'story', s.id from public.stories s where s.created_at >= now() - interval '48 hours'
union all select 'notif', n.id from public.notifications n where not n.seen or n.created_at >= now() - interval '90 days';

create temp table passio_srv05_resultat on commit drop as select public.purger_donnees_expirees() r;

create temp table passio_srv05_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
insert into pg_temp.passio_srv05_verdict
select 1, true, 'aucune conversation, story ou notification qui devait rester n''a disparu (par identifiant)',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) || ' disparue(s) : ' || string_agg(distinct g.t, ',') end
          from pg_temp.passio_srv05_garder g
         where not exists (select 1 from public.conversations c where g.t = 'conv' and c.id = g.id)
           and not exists (select 1 from public.stories s where g.t = 'story' and s.id = g.id)
           and not exists (select 1 from public.notifications n where g.t = 'notif' and n.id = g.id))
union all select 2, true, 'plus aucune conversation vide de plus de 7 jours',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.conversations c
         where c.created_at < now() - interval '7 days'
           and not exists (select 1 from public.conv_members m where m.conv_id = c.id)
           and not exists (select 1 from public.conv_messages x where x.conv_id = c.id))
union all select 3, true, 'plus aucune story de plus de 48 h',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.stories where created_at < now() - interval '48 hours')
union all select 4, true, 'plus aucune notification LUE de plus de 90 jours',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.notifications where seen and created_at < now() - interval '90 days')
union all select 5, true, 'plus aucun direct « live » muet depuis plus d''une heure',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.video_lives v
         where v.status = 'live' and coalesce(v.last_seen, v.started_at) < now() - interval '1 hour')
union all select 6, true, 'la tâche de nuit est programmée, une seule fois',
       (select case when count(*) = 1 then 'OK' else 'ECHEC — ' || count(*) end from cron.job where jobname = 'purge_donnees_expirees')
union all select 7, true, 'personne d''autre ne peut appeler la purge',
       (select case when not has_function_privilege('authenticated', 'public.purger_donnees_expirees()', 'execute')
                     and not has_function_privilege('anon', 'public.purger_donnees_expirees()', 'execute')
                     and not has_function_privilege('service_role', 'public.purger_donnees_expirees()', 'execute')
                    then 'OK' else 'ECHEC' end)
union all select 8, false, 'information — ce premier passage',
       (select r::text from pg_temp.passio_srv05_resultat);

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_srv05_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'purge des données expirées : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_srv05_verdict order by n;

commit;
