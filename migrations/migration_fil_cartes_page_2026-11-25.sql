-- Tête du fil, mêmes colonnes et même ordre que le GET posts du client.
-- Retour arrière après repli du client vers ce GET :
--| begin;
--| drop function if exists public.fil_cartes_page(jsonb);
--| commit;
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.fil_cartes_page(_versions jsonb)
returns table(post_id text, version text, carte jsonb)
language sql stable security invoker set search_path = ''
as $fonction$
  with tete as (
    select p.id, p.author_id, p.passion_id, p.mood, p.content, p.media_url,
           p.created_at, p.edited_at, p.is_reel, p.overlays, p.vlog,
           p.shared_from_post_id, p.shared_data, p.event_id, p.xmin::text as revision
      from public.posts p
     where (select auth.uid()) is not null
     order by p.created_at desc, p.id desc
     limit 20
  ),
  versions as (
    select case when pg_column_size(_versions) <= 16384 and jsonb_typeof(_versions) = 'object'
                then _versions else '{}'::jsonb end as connues
  )
  select t.id, v.revision,
         case when versions.connues ->> t.id = v.revision then null else
           jsonb_build_object('id',t.id, 'xmin',t.revision, 'author_id',t.author_id,
             'passion_id',t.passion_id, 'mood',t.mood, 'content',t.content, 'media_url',t.media_url,
             'created_at',t.created_at, 'edited_at',t.edited_at, 'is_reel',t.is_reel,
             'overlays',t.overlays, 'vlog',t.vlog, 'shared_from_post_id',t.shared_from_post_id,
             'shared_data',t.shared_data, 'event_id',t.event_id,
             'profiles',case when a.id is not null then jsonb_build_object(
               'xmin',a.xmin::text, 'username',a.username, 'emoji',a.emoji, 'color',a.color,
               'avatar_url',a.avatar_url, 'is_private',a.is_private) end)
         end
    from tete t
    left join public.profiles a on a.id = t.author_id
    cross join versions
    cross join lateral (values (t.revision || '.' || coalesce(a.xmin::text,'-'))) v(revision)
   order by t.created_at desc, t.id desc;
$fonction$;

revoke all on function public.fil_cartes_page(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.fil_cartes_page(jsonb) to authenticated;

do $garde$
begin
  if not (select bool_and(relrowsecurity) from pg_catalog.pg_class
           where oid in ('public.posts'::regclass,'public.profiles'::regclass))
    or not has_function_privilege('authenticated','public.fil_cartes_page(jsonb)','execute')
    or has_function_privilege('anon','public.fil_cartes_page(jsonb)','execute')
    or has_function_privilege('service_role','public.fil_cartes_page(jsonb)','execute')
    or exists (select from pg_catalog.pg_proc p,
                      lateral pg_catalog.aclexplode(p.proacl) a
                where p.oid = 'public.fil_cartes_page(jsonb)'::regprocedure
                  and a.grantee not in (p.proowner,'authenticated'::regrole::oid))
    or not (select not p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']
              from pg_catalog.pg_proc p where p.oid = 'public.fil_cartes_page(jsonb)'::regprocedure)
    then raise exception 'La lecture du fil exige RLS, SECURITY INVOKER et les seuls droits prévus'; end if;
end $garde$;

select 'fonction de lecture stable, invoker et search_path vide' as controle,
       case when (select not p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']
                    from pg_catalog.pg_proc p where p.oid = 'public.fil_cartes_page(jsonb)'::regprocedure)
            then 'OK' else 'ECHEC' end as valeur
union all select 'lecture réservée aux comptes authentifiés',
       case when has_function_privilege('authenticated', 'public.fil_cartes_page(jsonb)', 'execute')
             and not has_function_privilege('anon', 'public.fil_cartes_page(jsonb)', 'execute')
             and not has_function_privilege('service_role', 'public.fil_cartes_page(jsonb)', 'execute')
            then 'OK' else 'ECHEC' end;
commit;
