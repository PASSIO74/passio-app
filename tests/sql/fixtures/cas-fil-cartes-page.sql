-- Base jetable vide ; les deux migrations successives vérifient le rejeu.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id text primary key, username text, emoji text, color text,
  avatar_url text, is_private boolean, interne text);
create table public.posts (id text primary key, author_id text references public.profiles(id), passion_id text,
  mood text, content text, media_url text, created_at timestamptz, edited_at timestamptz,
  is_reel boolean, overlays jsonb, vlog jsonb, shared_from_post_id text, shared_data jsonb, event_id text, interne text);
grant usage on schema public,auth to authenticated;
grant select on public.profiles,public.posts to authenticated;
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
create policy lecture_profil on public.profiles for select to authenticated
  using (not is_private or id=(select auth.uid())::text);
create policy lecture_post on public.posts for select to authenticated
  using (id <> 'prive' or author_id=(select auth.uid())::text);
insert into public.profiles (id,username,is_private,interne) values
  ('11111111-1111-1111-1111-111111111111','Auteur public',false,'champ interne'),
  ('22222222-2222-2222-2222-222222222222','Auteur privé',true,'champ interne');
insert into public.posts (id,author_id,content,created_at,interne)
  select 'post_'||lpad(i::text,2,'0'),'11111111-1111-1111-1111-111111111111','texte','2026-01-01','champ interne'
  from generate_series(1,24) i;
insert into public.posts (id,author_id,created_at) values
  ('profil_masque','22222222-2222-2222-2222-222222222222','2026-02-01'),
  ('prive','22222222-2222-2222-2222-222222222222','2026-03-01');
\ir ../../../migrations/migration_fil_cartes_page_2026-11-25.sql
\ir ../../../migrations/migration_fil_cartes_page_2026-11-25.sql
do $$ begin
  if has_function_privilege('anon','public.fil_cartes_page(jsonb)','execute')
    or has_function_privilege('service_role','public.fil_cartes_page(jsonb)','execute')
    then raise exception 'droit de lecture inattendu'; end if;
end $$;
set role authenticated;
do $$ begin
  if exists(select from public.fil_cartes_page('{}')) then raise exception 'session sans identité'; end if;
end $$;
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
do $$
declare attendus text[]; recus text[]; connues jsonb;
begin
  select array(select id from public.posts order by created_at desc,id desc limit 20) into attendus;
  select array_agg(post_id order by ordre),jsonb_object_agg(post_id,version) into recus,connues
    from public.fil_cartes_page('{}') with ordinality f(post_id,version,carte,ordre);
  if recus is distinct from attendus or cardinality(recus) <> 20 then raise exception 'visibilité ou ordre incorrect'; end if;
  if exists(select from public.fil_cartes_page('{}') where carte is null or carte ? 'interne' or (carte->'profiles') ? 'interne'
    or (post_id='profil_masque' and carte->'profiles' <> 'null'::jsonb)) then raise exception 'projection incorrecte'; end if;
  if exists(select from public.fil_cartes_page(connues) where carte is not null) then raise exception 'cartes relues à tort'; end if;
  perform set_config('passio_test.versions',connues::text,false);
end $$;
reset role;
update public.posts set content='édition' where id='post_24';
delete from public.posts where id='post_23';
set role authenticated;
do $$ declare connues jsonb := current_setting('passio_test.versions')::jsonb;
begin
  if not exists(select from public.fil_cartes_page(connues) where post_id='post_24' and carte->>'content'='édition')
    or exists(select from public.fil_cartes_page(connues) where post_id in ('post_23','prive'))
    or (select count(*) from public.fil_cartes_page(connues) where carte is not null) <> 2
    then raise exception 'édition, suppression ou frontière incorrectes'; end if;
end $$;
reset role;
update public.profiles set username='Profil mis à jour' where not is_private;
set role authenticated;
do $$ begin
  if exists(select from public.fil_cartes_page(current_setting('passio_test.versions')::jsonb)
    where post_id like 'post_%' and (carte->'profiles'->>'username') is distinct from 'Profil mis à jour')
    then raise exception 'changement de profil ignoré'; end if;
end $$;
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
do $$ begin
  if not exists(select from public.fil_cartes_page(current_setting('passio_test.versions')::jsonb) where post_id='prive' and carte is not null)
    or not exists(select from public.fil_cartes_page(current_setting('passio_test.versions')::jsonb)
      where post_id='profil_masque' and carte->'profiles'->>'username'='Auteur privé')
    then raise exception 'changement de lecteur ignoré'; end if;
end $$;
reset role;
