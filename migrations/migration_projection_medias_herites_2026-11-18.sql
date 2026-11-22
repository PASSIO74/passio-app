-- PROPOSITION INERTE : aucune application distante autorisée.
-- Lecture invoker ; aucune modification de validateur/trigger/identité.
begin;
-- Une migration à usage unique : aucun homonyme adopté ou écrasé au rejeu.
do $absence$
begin
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='public.media_assets'::pg_catalog.regclass
  and attname='heritage_ref_sha256' and not attisdropped)
  or pg_catalog.to_regprocedure('public.media_projeter_heritage(jsonb)') is not null then
  raise exception using errcode='42501',message='heritage_projection_preexistante';
 end if;
end $absence$;
alter table public.media_assets add column heritage_ref_sha256 text
 check(heritage_ref_sha256 is null or heritage_ref_sha256 ~ '^[0-9a-f]{64}$');
do $garde$
begin
 if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.media_assets'::pg_catalog.regclass
  and attname='heritage_ref_sha256' and atttypid='pg_catalog.text'::pg_catalog.regtype and not attisdropped)
  or exists(select 1 from pg_catalog.pg_roles where rolname in('anon','authenticated') and (rolsuper or rolbypassrls))
  or not exists(select 1 from pg_catalog.pg_class where oid='public.media_assets'::pg_catalog.regclass and relrowsecurity)
  or pg_catalog.has_any_column_privilege('anon','public.media_assets','INSERT')
  or pg_catalog.has_any_column_privilege('authenticated','public.media_assets','INSERT')
  or pg_catalog.has_any_column_privilege('anon','public.media_assets','UPDATE')
  or pg_catalog.has_any_column_privilege('authenticated','public.media_assets','UPDATE') then
  raise exception using errcode='42501',message='heritage_projection_prerequis';
 end if;
 if exists(select 1 from public.media_assets where heritage_ref_sha256 is not null
  and heritage_ref_sha256 !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='42501',message='heritage_projection_catalogue';
 end if;
end $garde$;
comment on column public.media_assets.heritage_ref_sha256 is 'PASSIO heritage association v1: server-owned SHA256 of exact legacy media_url';

create function public.media_projeter_heritage(p_references jsonb)
returns table(post_id text,reference text)
language plpgsql stable security invoker set search_path='' as $fn$
declare x jsonb; n integer;
begin
 if pg_catalog.jsonb_typeof(p_references) is distinct from 'array' then
  raise exception using errcode='22023',message='heritage_projection_forme';
 end if;
 n:=pg_catalog.jsonb_array_length(p_references);
 if n<1 or n>100 then raise exception using errcode='22023',message='heritage_projection_borne'; end if;
 for x in select value from pg_catalog.jsonb_array_elements(p_references) loop
  if pg_catalog.jsonb_typeof(x) is distinct from 'object' or (x-array['id','reference_sha256'])<>'{}'::jsonb
   or pg_catalog.jsonb_typeof(x->'id') is distinct from 'string'
   or pg_catalog.jsonb_typeof(x->'reference_sha256') is distinct from 'string'
   or coalesce(x->>'id','') !~ '^[A-Za-z0-9_-]{1,120}$'
   or coalesce(x->>'reference_sha256','') !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='heritage_projection_forme';
  end if;
 end loop;
 if (select pg_catalog.count(distinct value->>'id') from pg_catalog.jsonb_array_elements(p_references))<>n then
  raise exception using errcode='22023',message='heritage_projection_doublon';
 end if;
 return query
 select p.id,'https://media.passio.invalid/private-media/posts/'||p.id||'/'||a.id::text||'/original'
 from pg_catalog.jsonb_array_elements(p_references) r
 join public.posts p on p.id=r.value->>'id'
 join public.media_assets a on a.post_id=p.id and a.owner_id=p.author_id
 join public.media_objects o on o.asset_id=a.id and o.variant='original' and o.bucket_id='content-protected'
 cross join lateral public.media_resoudre('posts',p.id,a.id,'original') autorise
 where p.shared_from_post_id is null and (p.vlog is null or p.vlog='null'::jsonb)
  and a.heritage_ref_sha256=r.value->>'reference_sha256'
  and a.heritage_ref_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.media_url,'UTF8')),'hex')
  and autorise.bucket_id=o.bucket_id and autorise.object_key=o.object_key
  and autorise.mime_type=o.mime_type and autorise.byte_size=o.byte_size
  and o.mime_type in('image/jpeg','image/png','image/webp','image/gif');
end $fn$;
revoke all on function public.media_projeter_heritage(jsonb) from public;
grant execute on function public.media_projeter_heritage(jsonb) to anon,authenticated;
comment on function public.media_projeter_heritage(jsonb) is 'PASSIO heritage association v1: invoker read, parent and exact legacy-reference bound';
do $verdict$
begin
 if not (exists (
   select 1 from pg_catalog.pg_attribute a
   where a.attrelid='public.media_assets'::regclass and a.attname='heritage_ref_sha256' and not a.attisdropped
    and pg_catalog.col_description(a.attrelid,a.attnum)='PASSIO heritage association v1: server-owned SHA256 of exact legacy media_url'
 ) and exists (
   select 1 from pg_catalog.pg_proc p
   where p.oid='public.media_projeter_heritage(jsonb)'::regprocedure and not p.prosecdef
    and pg_catalog.obj_description(p.oid,'pg_proc')='PASSIO heritage association v1: invoker read, parent and exact legacy-reference bound'
    and not exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
                    where acl.grantee=0 and acl.privilege_type='EXECUTE')
 ) and not exists (
   select 1 from (values ('anon'::name),('authenticated'::name)) roles(nom)
   where not pg_catalog.has_function_privilege(nom,'public.media_projeter_heritage(jsonb)','EXECUTE')
      or not pg_catalog.has_column_privilege(nom,'public.media_assets','heritage_ref_sha256','SELECT')
      or pg_catalog.has_column_privilege(nom,'public.media_assets','heritage_ref_sha256','INSERT')
      or pg_catalog.has_column_privilege(nom,'public.media_assets','heritage_ref_sha256','UPDATE')
 )) then
  raise exception using errcode='42501',message='heritage_projection_verdict';
 end if;
end $verdict$;
select 'projection heritage' as controle, 'OK' as valeur;
commit;
