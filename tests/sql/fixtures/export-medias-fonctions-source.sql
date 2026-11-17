-- Définitions de code, sans données, relevées readonly PROD/STAGING le16/11.
CREATE OR REPLACE FUNCTION rencontres_prive.export_compte_socle(p_uid text, p_plafond integer DEFAULT 5000, p_verrou bigint DEFAULT NULL::bigint)
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
CREATE OR REPLACE FUNCTION public.export_compte_instantane(p_uid text, p_plafond integer DEFAULT 5000, p_verrou bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare resultat jsonb; t text; filtre text; attendu bigint; lignes jsonb;
 plafond integer := greatest(coalesce(p_plafond,5000),1);
begin
 resultat := rencontres_prive.export_compte_socle(p_uid,p_plafond,p_verrou);
 foreach t in array array['inscriptions','accords','decisions','coorganisations_anterieures'] loop
   filtre := case t when 'coorganisations_anterieures' then 'valeur ? $1'
      when 'decisions' then 'user_id = $1 or decideur_id = $1' else 'user_id = $1' end;
   execute format('select count(*) from rencontres_prive.%I where %s',t,filtre) into attendu using p_uid;
   -- L'archive d'une coorganisation n'exporte jamais les identifiants des tiers.
   execute format('select coalesce(jsonb_agg(x),''[]''::jsonb) from
     (select %s from rencontres_prive.%I where %s order by %s limit $2) x',
     case t when 'coorganisations_anterieures' then 'event_id, jsonb_build_array($1::text) as valeur, created_at'
       else '*' end,t,filtre,case t when 'accords' then 'event_id,user_id'
       when 'coorganisations_anterieures' then 'created_at,event_id' else 'created_at,id' end)
     into lignes using p_uid,plafond;
   resultat := jsonb_set(resultat,array['tables'],(resultat->'tables') || jsonb_build_object(
     'rencontres_prive.' || t,jsonb_build_object('lignes',lignes,'attendu',attendu,
       'tronque',attendu > plafond,'ordre_total',true)));
 end loop;
 return resultat || jsonb_build_object('rencontres_prive',1);
end $function$;
revoke all on function public.export_compte_instantane(text,integer,bigint),rencontres_prive.export_compte_socle(text,integer,bigint) from public,anon,authenticated;
grant execute on function public.export_compte_instantane(text,integer,bigint) to service_role;
