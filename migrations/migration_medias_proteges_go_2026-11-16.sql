-- Lot serveur LOCAL en revue : ne convertit aucun ancien média, ne ferme pas content.
-- Référence catalogue read-only 16/11 19:06 UTC, SHA256 68a80f738e93953974392fbecae7fd54c05ca1f0f3a33a6ae26f0538c8feffc8.
-- Correction vérifiée des empreintes BRUTES : annexe read-only PROD/STAGE SHA256 34cbc3d5eefb9476bf2b165cf73aafa4f3e1940360e437ab2e9d003d24ff6687.
-- L'ancien JSON normalisait les blancs des 5 fonctions ; ici md5(pg_get_functiondef) reste BRUT.
-- Application distante interdite avant contre-revue et recette hébergée synthétique.
begin;

do $prerequis$
declare f record; p record; existantes integer;
begin
  select count(*) into existantes from unnest(array['public.media_reservations','public.media_assets','public.media_objects']) nom where to_regclass(nom) is not null;
  if existantes>0 and (existantes<>3 or exists(select 1 from pg_class where oid=any(array[
    to_regclass('public.media_reservations'),to_regclass('public.media_assets'),to_regclass('public.media_objects')])
    and (relkind<>'r' or obj_description(oid,'pg_class') is distinct from 'PASSIO protected-media v1 2026-11-16'))) then
    raise exception 'Registre medias preexistant non reconnu';
  end if;
  if existantes=0 and exists(select 1 from storage.buckets where id='content-protected') then
    raise exception 'Bucket protege preexistant non reconnu';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Roles clients incompatibles';
  end if;
  -- Catalogue read-only PROD/STAGING : SHA256 69f3d0ebcc62901f1d70d63555b15af04cf3eda4f7940900c52afa3f1cfa6626.
  if not exists(select 1 from pg_constraint where conrelid='public.reglages_distants'::regclass
    and conname='reglages_distants_cle_check' and contype='c' and convalidated
    and (md5(pg_get_constraintdef(oid))='faf831e36444b21d841f602f6c4b736c'
      or (existantes=3 and pg_get_constraintdef(oid)=$check$CHECK ((cle = ANY (ARRAY['delestage'::text, 'coupures'::text, 'bandeau'::text, 'medias_proteges'::text])))$check$)))
    or exists(select 1 from pg_trigger where tgrelid='public.reglages_distants'::regclass and not tgisinternal)
    or not (select relrowsecurity from pg_class where oid='public.reglages_distants'::regclass) then
    raise exception 'Autorite reglages incompatible';
  end if;
  for f in select rolname from pg_roles where rolname in ('anon','authenticated') loop
    if not has_column_privilege(f.rolname,'public.reglages_distants','cle','SELECT')
      or not has_column_privilege(f.rolname,'public.reglages_distants','valeur','SELECT')
      or has_any_column_privilege(f.rolname,'public.reglages_distants','INSERT')
      or has_any_column_privilege(f.rolname,'public.reglages_distants','UPDATE')
      or has_table_privilege(f.rolname,'public.reglages_distants','DELETE') then
      raise exception 'Droits reglages incompatibles';
    end if;
  end loop;
  for f in select * from (values
    ('public.abonne_accepte_non_bloque(text)','b30e8afcff6f06e4b98b80d5234aae12'),
    ('public.post_masque(text)','d5590c6c97d59ec9a720bb1e7db5b026'),
    ('public.is_blocked_with(text)','234b3c614e8a368ed413928067004d88'),
    ('public.quota_stockage_ok()','5b033c8abd2c9b007f2d766ea1deb2ee'),
    ('public.suppression_de_mon_compte()','4037c1c1536f9da3d11fb14fc225badb')
  ) as x(signature,empreinte) loop
    if to_regprocedure(f.signature) is null or md5(pg_get_functiondef(to_regprocedure(f.signature))) <> f.empreinte then
      raise exception 'Corps prerequisite different : %',f.signature;
    end if;
  end loop;
  for p in select * from (values
    ('posts','Lecture respectant les comptes prives','e4d8f7d8f6346c8a886e1e4c989809ca',true),
    ('posts','Masquage apres signalements','aea571ea9f5bb0efdbd7b92eb5bf4b4e',false),
    ('stories','Lecture stories respectant les comptes prives','111ac554780891654f2632a1b469f676',true)
  ) as x(tableau,nom,empreinte,permissive) loop
    if not exists (select 1 from pg_policy q where q.polrelid=to_regclass('public.'||p.tableau)
      and q.polname=p.nom and q.polcmd='r' and q.polpermissive=p.permissive and q.polroles='{0}'::oid[]
      and md5(pg_get_expr(q.polqual,q.polrelid))=p.empreinte) then
      raise exception 'Policy prerequisite differente : %.%',p.tableau,p.nom;
    end if;
  end loop;
  if (select count(*) from pg_policy where polrelid in ('public.posts'::regclass,'public.stories'::regclass) and polcmd in ('r','*')) <> 3 then
    raise exception 'Policies source supplementaires : revue requise';
  end if;
  if exists (select 1 from pg_class where oid in ('public.posts'::regclass,'public.stories'::regclass,'storage.objects'::regclass) and not relrowsecurity)
     or to_regprocedure('auth.jwt()') is null
     or not exists (select 1 from pg_attribute where attrelid='auth.sessions'::regclass and attname='id' and atttypid='uuid'::regtype and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid='auth.sessions'::regclass and attname='user_id' and atttypid='uuid'::regtype and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid='auth.sessions'::regclass and attname='not_after' and atttypid='timestamptz'::regtype and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner' and atttypid='uuid'::regtype and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner_id' and atttypid='text'::regtype and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='metadata' and atttypid='jsonb'::regtype and not attisdropped)
     or has_table_privilege('anon','auth.sessions','SELECT') or has_any_column_privilege('anon','auth.sessions','SELECT')
     or has_table_privilege('authenticated','auth.sessions','SELECT') or has_any_column_privilege('authenticated','auth.sessions','SELECT') then
    raise exception 'Schema prerequisite incompatible';
  end if;
  if exists (select 1 from storage.buckets where id='content-protected' and
    (public or file_size_limit is distinct from 27262976::bigint or allowed_mime_types is distinct from
      array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mp4','audio/webm','audio/ogg','audio/mpeg'])) then
    raise exception 'Bucket protege incompatible';
  end if;
end $prerequis$;

alter table public.reglages_distants drop constraint reglages_distants_cle_check;
alter table public.reglages_distants add constraint reglages_distants_cle_check
  check(cle=any(array['delestage'::text,'coupures'::text,'bandeau'::text,'medias_proteges'::text]));
insert into public.reglages_distants(cle,valeur,pose_par,motif,maj)
  values('medias_proteges','{"actif":false}','pilote','Desactive avant recette et revue',clock_timestamp()) on conflict(cle) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('content-protected','content-protected',false,27262976,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mp4','audio/webm','audio/ogg','audio/mpeg'])
on conflict(id) do nothing;

create table if not exists public.media_reservations (
  id uuid primary key,
  owner_id text not null references public.profiles(id) on delete cascade,
  source_type text not null check(source_type in ('posts','stories')),
  source_id text not null check(source_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  variants jsonb not null check(jsonb_typeof(variants)='array' and jsonb_array_length(variants) between 1 and 3),
  created_at timestamptz not null,
  expires_at timestamptz not null check(expires_at=created_at+interval '15 minutes'),
  linked_at timestamptz
);
create index if not exists media_reservations_owner_created on public.media_reservations(owner_id,created_at);
create table if not exists public.media_assets (
  id uuid primary key references public.media_reservations(id) on delete cascade,
  owner_id text not null references public.profiles(id) on delete cascade,
  post_id text unique references public.posts(id) on delete cascade,
  story_id text unique references public.stories(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  constraint media_assets_source_unique check(num_nonnulls(post_id,story_id)=1)
);
create index if not exists media_assets_owner on public.media_assets(owner_id);
create table if not exists public.media_objects (
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  variant text not null check(variant in ('original','v720','poster')),
  storage_object_id uuid not null unique,
  bucket_id text not null default 'content-protected' check(bucket_id='content-protected'),
  object_key text not null unique,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mp4','audio/webm','audio/ogg','audio/mpeg')),
  byte_size bigint not null check(byte_size between 1 and 27262976),
  primary key(asset_id,variant),
  check(variant='original' or mime_type like 'image/%'),
  check(object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(original|v720|poster)\.(jpg|png|webp|gif|mp4|webm|m4a|ogg|mp3)$')
);
comment on table public.media_reservations is 'PASSIO protected-media v1 2026-11-16';
comment on table public.media_assets is 'PASSIO protected-media v1 2026-11-16';
comment on table public.media_objects is 'PASSIO protected-media v1 2026-11-16';

alter table public.media_reservations enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_objects enable row level security;
revoke all on public.media_reservations,public.media_assets,public.media_objects from public,anon,authenticated;
grant select on public.media_reservations to authenticated;
grant select on public.media_assets,public.media_objects to anon,authenticated;
grant all on public.media_reservations,public.media_assets,public.media_objects to service_role;

-- Seul accès à auth.sessions : booléen de la session propre, sans paramètre libre.
create or replace function public.media_session_active() returns boolean
language plpgsql stable security definer set search_path='' as $fn$
declare sujet text := auth.jwt()->>'sub'; session_id text := auth.jwt()->>'session_id';
begin
  if public.suppression_de_mon_compte() or sujet is null or session_id is null
     or sujet !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists(select 1 from auth.sessions s where s.id=session_id::uuid and s.user_id=sujet::uuid
    and (s.not_after is null or s.not_after>statement_timestamp()));
end $fn$;
revoke all on function public.media_session_active() from public,anon;
grant execute on function public.media_session_active() to authenticated;

-- Lecture invoker des seules colonnes publiques ; absence/mauvais type = coupure.
create or replace function public.media_proteges_actifs() returns boolean
language sql stable security invoker set search_path='' as $fn$
  select coalesce((select valeur->'actif'='true'::jsonb from public.reglages_distants where cle='medias_proteges'),false)
$fn$;
revoke all on function public.media_proteges_actifs() from public;
grant execute on function public.media_proteges_actifs() to anon,authenticated;

create or replace function public.media_mime_extension(p_mime text) returns text
language sql immutable set search_path='' as $fn$
  select case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'image/gif' then 'gif' when 'video/mp4' then 'mp4' when 'video/webm' then 'webm'
    when 'audio/mp4' then 'm4a' when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' when 'audio/mpeg' then 'mp3' end
$fn$;
revoke all on function public.media_mime_extension(text) from public,anon,authenticated;

-- Réservation = seulement son propriétaire, avec session active. Aucun DML client direct.
drop policy if exists media_reservations_own on public.media_reservations;
create policy media_reservations_own on public.media_reservations as restrictive for select to authenticated
  using((select public.media_proteges_actifs()) and owner_id=(select auth.uid())::text and (select public.media_session_active()));
drop policy if exists media_reservations_select on public.media_reservations;
create policy media_reservations_select on public.media_reservations for select to authenticated using(true);
drop policy if exists media_assets_anon on public.media_assets;
create policy media_assets_anon on public.media_assets as restrictive for select to anon using(
  (select public.media_proteges_actifs()) and ((post_id is not null and exists(select 1 from public.posts p where p.id=post_id and p.author_id=owner_id and (p.vlog is null or p.vlog='null'::jsonb)))
  or (story_id is not null and created_at>statement_timestamp()-interval '24 hours' and exists(select 1 from public.stories s
    where s.id=story_id and s.author_id=owner_id and s.created_at at time zone 'UTC'>statement_timestamp()-interval '24 hours'
      and s.created_at at time zone 'UTC'<=statement_timestamp()+interval '5 minutes'))));
drop policy if exists media_assets_user on public.media_assets;
create policy media_assets_user on public.media_assets as restrictive for select to authenticated using(
  (select public.media_proteges_actifs()) and (select public.media_session_active()) and not public.is_blocked_with(owner_id) and (
  (post_id is not null and exists(select 1 from public.posts p where p.id=post_id and p.author_id=owner_id and (p.vlog is null or p.vlog='null'::jsonb)))
  or (story_id is not null and created_at>statement_timestamp()-interval '24 hours' and exists(select 1 from public.stories s
    where s.id=story_id and s.author_id=owner_id and s.created_at at time zone 'UTC'>statement_timestamp()-interval '24 hours'
      and s.created_at at time zone 'UTC'<=statement_timestamp()+interval '5 minutes'))));
drop policy if exists media_assets_select on public.media_assets;
create policy media_assets_select on public.media_assets for select to anon,authenticated using(true);
drop policy if exists media_objects_source on public.media_objects;
create policy media_objects_source on public.media_objects as restrictive for select to anon,authenticated
  using(exists(select 1 from public.media_assets a where a.id=asset_id));
drop policy if exists media_objects_select on public.media_objects;
create policy media_objects_select on public.media_objects for select to anon,authenticated using(true);

-- Cout fournisseur avant flux : contentLength n'est JAMAIS une preuve de taille finale.
-- Une variante incomplete, expiree ou incompatible conserve au moins 26 MiB de provision.
-- Les lignes provider sans size comptent deja 26 MiB ; le complement evite le double compte.
create or replace function public.media_budget_occupe(p_owner text) returns numeric
language sql stable security definer set search_path='' as $fn$
  with objets as (
    select o.*,case when coalesce(o.metadata->>'size','') ~ '^[0-9]{1,18}$'
      then (o.metadata->>'size')::numeric else 27262976::numeric end as cout
    from storage.objects o where o.owner_id=p_owner or o.owner=p_owner::uuid
  ), complements as (
    select case when exists(select 1 from objets o where o.bucket_id='content-protected'
        and o.name=p_owner||'/'||r.id::text||'/'||(v.value->>'variant')||'.'||public.media_mime_extension(v.value->>'mime_type')
        and o.archived_at is null and not o.is_delete_marker
        and (o.owner is not null or o.owner_id is not null)
        and (o.owner is null or o.owner=p_owner::uuid) and (o.owner_id is null or o.owner_id=p_owner)
        and o.metadata->>'mimetype'=v.value->>'mime_type'
        and o.metadata->>'size'=v.value->>'byte_size') then 0::numeric
      else greatest(0::numeric,27262976-coalesce((select sum(o.cout) from objets o where o.bucket_id='content-protected'
        and o.name=p_owner||'/'||r.id::text||'/'||(v.value->>'variant')||'.'||public.media_mime_extension(v.value->>'mime_type')
        and o.archived_at is null and not o.is_delete_marker
        and (o.owner is null or o.owner=p_owner::uuid) and (o.owner_id is null or o.owner_id=p_owner)),0)) end as cout
    from public.media_reservations r cross join lateral jsonb_array_elements(r.variants) v where r.owner_id=p_owner
  ) select coalesce((select sum(cout) from objets),0)+coalesce((select sum(cout) from complements),0)
$fn$;
revoke all on function public.media_budget_occupe(text) from public,anon,authenticated;

create or replace function public.media_reserver(p_type text,p_source_id text,p_variantes jsonb,p_cle_idempotence uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare acteur text := auth.uid()::text; t timestamptz := clock_timestamp(); r public.media_reservations%rowtype;
  v jsonb; propre jsonb; taille bigint; n integer; presents bigint;
begin
  if not public.media_proteges_actifs() or not public.media_session_active() or acteur is null
     or p_type is null or p_type not in ('posts','stories') or p_source_id is null or p_source_id !~ '^[A-Za-z0-9_-]{1,120}$'
     or p_cle_idempotence is null or jsonb_typeof(p_variantes) is distinct from 'array' then
    raise exception using errcode='42501',message='Reservation refusee';
  end if;
  n:=jsonb_array_length(p_variantes);
  if n<1 or n>3 then raise exception using errcode='22023',message='Variantes invalides'; end if;
  for v in select value from jsonb_array_elements(p_variantes) loop
    if jsonb_typeof(v) is distinct from 'object' or (v-array['variant','mime_type','byte_size'])<>'{}'::jsonb
       or coalesce(v->>'variant','') not in ('original','v720','poster')
       or public.media_mime_extension(v->>'mime_type') is null or jsonb_typeof(v->'byte_size') is distinct from 'number'
       or coalesce(v->>'byte_size','') !~ '^[0-9]{1,8}$' then raise exception using errcode='22023',message='Variantes invalides'; end if;
    taille:=(v->>'byte_size')::bigint;
    if taille<1 or taille>27262976 or (v->>'variant'<>'original' and v->>'mime_type' not like 'image/%') then
      raise exception using errcode='22023',message='Variantes invalides'; end if;
  end loop;
  if (select count(distinct value->>'variant') from jsonb_array_elements(p_variantes))<>n
     or not exists(select 1 from jsonb_array_elements(p_variantes) where value->>'variant'='original') then
    raise exception using errcode='22023',message='Variantes invalides'; end if;
  select jsonb_agg(jsonb_build_object('variant',value->>'variant','mime_type',value->>'mime_type','byte_size',(value->>'byte_size')::bigint) order by value->>'variant')
    into propre from jsonb_array_elements(p_variantes);
  perform pg_advisory_xact_lock(hashtextextended('passio.media:'||acteur,0));
  select * into r from public.media_reservations where id=p_cle_idempotence for update;
  if found then
    if r.owner_id<>acteur or r.source_type<>p_type or r.source_id<>p_source_id or r.variants<>propre
       or (r.linked_at is null and r.expires_at<=t)
       or (r.linked_at is not null and not exists(select 1 from public.media_assets where id=r.id and owner_id=acteur)) then
      raise exception using errcode='42501',message='Reservation refusee'; end if;
  else
    if not public.quota_stockage_ok()
       or (select count(*) from public.media_reservations where owner_id=acteur and linked_at is null and expires_at>t)>=8
       or (select coalesce(sum(jsonb_array_length(variants)),0) from public.media_reservations where owner_id=acteur and created_at>t-interval '1 hour')+n>120 then
      raise exception using errcode='54000',message='Quota medias atteint'; end if;
    select count(*) filter(where created_at>t-interval '1 hour')
      into presents from storage.objects where owner=acteur::uuid or owner_id=acteur;
    if presents>=120 then raise exception using errcode='54000',message='Quota medias atteint'; end if;
    if public.media_budget_occupe(acteur)+n::numeric*27262976>2147483648 then
      raise exception using errcode='54000',message='Quota medias atteint'; end if;
    insert into public.media_reservations(id,owner_id,source_type,source_id,variants,created_at,expires_at)
      values(p_cle_idempotence,acteur,p_type,p_source_id,propre,t,t+interval '15 minutes') returning * into r;
  end if;
  return jsonb_build_object('asset_id',r.id,'bucket_id','content-protected','expires_at',r.expires_at,'linked',r.linked_at is not null,
    'objects',(select jsonb_agg(jsonb_build_object('variant',value->>'variant','mime_type',value->>'mime_type','byte_size',(value->>'byte_size')::bigint,
      'object_key',acteur||'/'||r.id::text||'/'||(value->>'variant')||'.'||public.media_mime_extension(value->>'mime_type'),
      'reference','https://media.passio.invalid/private-media/'||p_type||'/'||p_source_id||'/'||r.id::text||'/'||(value->>'variant')) order by value->>'variant')
      from jsonb_array_elements(r.variants)));
end $fn$;
revoke all on function public.media_reserver(text,text,jsonb,uuid) from public,anon;
grant execute on function public.media_reserver(text,text,jsonb,uuid) to authenticated;

-- Policy INSERT, pas un droit de lecture : owner/chemin/MIME/taille et réservation actifs.
create or replace function public.media_upload_autorise(p_name text,p_owner uuid,p_owner_id text,p_metadata jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $fn$
declare acteur text:=auth.uid()::text; morceaux text[]; r public.media_reservations%rowtype; v jsonb;
begin
  if not public.media_proteges_actifs() or not public.media_session_active()
    or (p_owner is null and p_owner_id is null) or (p_owner is not null and p_owner is distinct from auth.uid())
    or (p_owner_id is not null and p_owner_id is distinct from acteur) or p_name is null
    or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(original|v720|poster)\.(jpg|png|webp|gif|mp4|webm|m4a|ogg|mp3)$'
    or jsonb_typeof(p_metadata) is distinct from 'object' then return false; end if;
  -- Deux formes fournisseur : preautorisation sans size, puis objet final avec size.
  -- Le poids declare n'affecte jamais la provision pessimiste deja prise sous verrou.
  if p_metadata ? 'size' then
    if coalesce(p_metadata->>'size','') !~ '^[0-9]{1,8}$' then return false; end if;
  elsif coalesce(p_metadata->>'contentLength','') !~ '^[0-9]{1,8}$'
    or (p_metadata->>'contentLength')::bigint not between 1 and 27262976 then return false; end if;
  morceaux:=string_to_array(p_name,'/');
  if morceaux[1]<>acteur or morceaux[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('passio.media:'||acteur,0));
  select * into r from public.media_reservations where id=morceaux[2]::uuid and owner_id=acteur for share;
  if not found or r.linked_at is not null or r.expires_at<=clock_timestamp() or not public.quota_stockage_ok() then return false; end if;
  for v in select value from jsonb_array_elements(r.variants) loop
    if morceaux[3]=(v->>'variant')||'.'||public.media_mime_extension(v->>'mime_type')
      and p_metadata->>'mimetype'=v->>'mime_type'
      and (not (p_metadata ? 'size') or (p_metadata->>'size')::bigint=(v->>'byte_size')::bigint) then
      return (select count(*) from storage.objects where (owner=acteur::uuid or owner_id=acteur) and created_at>clock_timestamp()-interval '1 hour')<120
        and public.media_budget_occupe(acteur)<=2147483648;
    end if;
  end loop;
  return false;
end $fn$;
revoke all on function public.media_upload_autorise(text,uuid,text,jsonb) from public,anon;
grant execute on function public.media_upload_autorise(text,uuid,text,jsonb) to authenticated;

drop policy if exists media_protected_select_closed on storage.objects;
create policy media_protected_select_closed on storage.objects as restrictive for select to anon,authenticated
  using(bucket_id is distinct from 'content-protected');
drop policy if exists media_protected_update_closed on storage.objects;
create policy media_protected_update_closed on storage.objects as restrictive for update to anon,authenticated
  using(bucket_id is distinct from 'content-protected') with check(bucket_id is distinct from 'content-protected');
drop policy if exists media_protected_delete_closed on storage.objects;
create policy media_protected_delete_closed on storage.objects as restrictive for delete to anon,authenticated
  using(bucket_id is distinct from 'content-protected');
drop policy if exists media_protected_insert_guard on storage.objects;
create policy media_protected_insert_guard on storage.objects as restrictive for insert to authenticated with check(
  bucket_id is distinct from 'content-protected' or public.media_upload_autorise(name,owner,owner_id,metadata));
drop policy if exists media_protected_insert_anon_closed on storage.objects;
create policy media_protected_insert_anon_closed on storage.objects as restrictive for insert to anon
  with check(bucket_id is distinct from 'content-protected');
drop policy if exists media_protected_insert on storage.objects;
create policy media_protected_insert on storage.objects for insert to authenticated with check(
  bucket_id='content-protected' and public.media_upload_autorise(name,owner,owner_id,metadata));

-- Trigger seul : la ligne source a passe SON vrai INSERT/RLS/triggers ; aucune finalisation RPC tardive.
create or replace function public.media_lier_source() returns trigger
language plpgsql volatile security definer set search_path='' as $fn$
declare champs text[]; acteur text:=auth.uid()::text; r public.media_reservations%rowtype; a public.media_assets%rowtype;
  v jsonb; o storage.objects%rowtype; cle text; compte integer; genre text:=TG_TABLE_NAME;
begin
  if new.media_url is null or new.media_url not like 'https://media.passio.invalid/%' then return new; end if;
  champs:=regexp_match(new.media_url,'^https://media\.passio\.invalid/private-media/(posts|stories)/([A-Za-z0-9_-]{1,120})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(original|v720|poster)$');
  if champs is null or champs[1]<>genre or champs[2]<>new.id or new.author_id is distinct from acteur
    or not public.media_proteges_actifs() or not public.media_session_active() then
    raise exception using errcode='42501',message='Liaison media refusee'; end if;
  perform pg_advisory_xact_lock(hashtextextended('passio.media:'||acteur,0));
  select * into r from public.media_reservations where id=champs[3]::uuid for update;
  if not found or r.owner_id<>acteur or r.source_type<>genre or r.source_id<>new.id then
    raise exception using errcode='42501',message='Liaison media refusee'; end if;
  select * into a from public.media_assets where id=r.id;
  if found then
    if a.owner_id<>acteur or (genre='posts' and a.post_id is distinct from new.id) or (genre='stories' and a.story_id is distinct from new.id)
      or not exists(select 1 from public.media_objects where asset_id=a.id and variant=champs[4]) then
      raise exception using errcode='42501',message='Liaison media refusee'; end if;
    return new;
  end if;
  if TG_OP<>'INSERT' or r.linked_at is not null or r.expires_at<=clock_timestamp()
    or (genre='posts' and (to_jsonb(new)->>'shared_from_post_id' is not null or (to_jsonb(new)->'vlog' is not null and to_jsonb(new)->'vlog'<>'null'::jsonb)))
    or (genre='stories' and (new.created_at is null or new.created_at at time zone 'UTC'<statement_timestamp()-interval '24 hours'
      or new.created_at at time zone 'UTC'>statement_timestamp()+interval '5 minutes')) then
    raise exception using errcode='42501',message='Liaison media refusee'; end if;
  for v in select value from jsonb_array_elements(r.variants) loop
    cle:=acteur||'/'||r.id::text||'/'||(v->>'variant')||'.'||public.media_mime_extension(v->>'mime_type');
    select count(*) into compte from storage.objects where bucket_id='content-protected' and name=cle and archived_at is null and not is_delete_marker;
    if compte<>1 then raise exception using errcode='42501',message='Objet media absent ou ambigu'; end if;
    select * into o from storage.objects where bucket_id='content-protected' and name=cle and archived_at is null and not is_delete_marker;
    if (o.owner is null and o.owner_id is null) or (o.owner is not null and o.owner is distinct from acteur::uuid) or (o.owner_id is not null and o.owner_id<>acteur)
      or o.metadata->>'mimetype' is distinct from v->>'mime_type'
      or coalesce(o.metadata->>'size','') !~ '^[0-9]{1,8}$'
      or (o.metadata->>'size')::bigint<>(v->>'byte_size')::bigint then
      raise exception using errcode='42501',message='Objet media incompatible'; end if;
  end loop;
  insert into public.media_assets(id,owner_id,post_id,story_id) values(r.id,acteur,case when genre='posts' then new.id end,case when genre='stories' then new.id end);
  for v in select value from jsonb_array_elements(r.variants) loop
    cle:=acteur||'/'||r.id::text||'/'||(v->>'variant')||'.'||public.media_mime_extension(v->>'mime_type');
    select * into strict o from storage.objects where bucket_id='content-protected' and name=cle and archived_at is null and not is_delete_marker;
    insert into public.media_objects(asset_id,variant,storage_object_id,object_key,mime_type,byte_size)
      values(r.id,v->>'variant',o.id,cle,v->>'mime_type',(v->>'byte_size')::bigint);
  end loop;
  if not exists(select 1 from public.media_objects where asset_id=r.id and variant=champs[4]) then
    raise exception using errcode='42501',message='Variante media absente'; end if;
  update public.media_reservations set linked_at=clock_timestamp() where id=r.id;
  return new;
end $fn$;
revoke all on function public.media_lier_source() from public,anon,authenticated,service_role;
drop trigger if exists media_lier_source on public.posts;
create trigger media_lier_source after insert or update of media_url on public.posts for each row execute function public.media_lier_source();
drop trigger if exists media_lier_source on public.stories;
create trigger media_lier_source after insert or update of media_url on public.stories for each row execute function public.media_lier_source();

create or replace function public.media_resoudre(p_type text,p_affichant_id text,p_asset_id uuid,p_variante text)
returns table(bucket_id text,object_key text,mime_type text,byte_size bigint)
language plpgsql stable security invoker set search_path='' as $fn$
declare a public.media_assets%rowtype; p record; courant text:=p_affichant_id; vus text[]:='{}'; i integer;
begin
  if not public.media_proteges_actifs() or p_type is null or p_type not in ('posts','stories') or p_affichant_id is null or p_affichant_id !~ '^[A-Za-z0-9_-]{1,120}$'
    or p_asset_id is null or p_variante is null or p_variante not in ('original','v720','poster') then return; end if;
  -- Deux instructions : anon ne planifie/exécute jamais un helper réservé à authenticated.
  if auth.uid() is not null then
    if not public.media_session_active() then return; end if;
  end if;
  -- Ce SELECT et ceux des sources s'executent sous le role de l'appelant, jamais postgres.
  select * into a from public.media_assets where id=p_asset_id;
  if not found then return; end if;
  if p_type='stories' then
    if a.story_id is distinct from p_affichant_id then return; end if;
  else
    if a.post_id is null then return; end if;
    for i in 1..8 loop
      if courant=any(vus) then return; end if;
      vus:=array_append(vus,courant);
      select id,author_id,shared_from_post_id,vlog into p from public.posts where id=courant;
      if not found or (p.vlog is not null and p.vlog<>'null'::jsonb) then return; end if;
      if auth.uid() is not null then
        if public.is_blocked_with(p.author_id) then return; end if;
      end if;
      if p.shared_from_post_id is null then
        if p.id is distinct from a.post_id or p.author_id is distinct from a.owner_id then return; end if;
        return query select o.bucket_id,o.object_key,o.mime_type,o.byte_size from public.media_objects o where o.asset_id=a.id and o.variant=p_variante;
        return;
      end if;
      courant:=p.shared_from_post_id;
    end loop;
    return;
  end if;
  return query select o.bucket_id,o.object_key,o.mime_type,o.byte_size from public.media_objects o where o.asset_id=a.id and o.variant=p_variante;
end $fn$;
revoke all on function public.media_resoudre(text,text,uuid,text) from public;
grant execute on function public.media_resoudre(text,text,uuid,text) to anon,authenticated;

select 'media serveur protege : bucket prive, clients Storage fermes, liaison atomique, resolver invoker' as controle,
  case when not (select public from storage.buckets where id='content-protected')
    and not (select prosecdef from pg_proc where oid='public.media_resoudre(text,text,uuid,text)'::regprocedure)
    and not has_function_privilege('anon','public.media_session_active()','EXECUTE')
    and not has_function_privilege('authenticated','public.media_lier_source()','EXECUTE') then 'OK' else 'ECHEC' end as verdict;
commit;
