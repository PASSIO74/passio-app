-- SOCLE RÉDUIT JETABLE du banc tests/sql/migration-securite-p1-2026-11-20.test.sh.
-- Se charge APRÈS tests/sql/fixtures/cas-realtime-budget-socle.sql (messagerie et diffuseurs du
-- catalogue). Ajoute, avec les noms et les corps relus en production le 2026-11-20 : le compte
-- d'authentification, la suppression de son propre profil, les plafonds d'écriture (lot du
-- 2026-11-15), quatre tables réécrites, Storage réduit à sa table et ses policies PASSIO, le
-- référentiel des passions et `rechercher_passions`. Aucune donnée réelle, aucune cible distante.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'passio_test_realtime_budget' or to_regclass('public.conv_messages') is null
 or to_regclass('public.posts') is not null then
  raise exception 'charger d''abord cas-realtime-budget-socle.sql dans une base jetable';
 end if;
end $$;
create extension if not exists pg_trgm;

-- ── Comptes d'authentification ; un compte supprime et recrée son propre profil ──────────────
create table auth.users(id uuid primary key, created_at timestamptz not null default now() - interval '30 days',
 banned_until timestamptz);
insert into auth.users(id) select id::uuid from public.profiles;
alter table public.profiles enable row level security;
create policy profils_lire on public.profiles for select to anon, authenticated using (true);
create policy profils_creer on public.profiles for insert to authenticated with check (id = auth.uid()::text);
create policy profils_supprimer on public.profiles for delete to authenticated using (id = auth.uid()::text);
grant select on public.profiles to anon;
grant select, insert, delete on public.profiles to authenticated;

-- ── pg_cron réduit : la table des tâches et l'upsert par nom ──────────────────────────────────
create schema cron;
create table cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(p_nom text, p_horaire text, p_commande text) returns bigint
language sql as $$
 insert into cron.job(jobname, schedule, command) values (p_nom, p_horaire, p_commande)
 on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
 returning jobid $$;

-- ── Plafonds d'écriture (corps du lot du 2026-11-15, debit_maj_par_compte relu en production) ─
create table public.debit_ecritures(minute timestamptz not null, table_nom text not null, source text not null,
 n integer not null, primary key (minute, table_nom, source));
create table public.debit_jour(jour date not null, cle text not null, source text not null, n bigint not null,
 primary key (jour, cle, source));
alter table public.debit_ecritures enable row level security;
alter table public.debit_jour enable row level security;
revoke all on public.debit_ecritures, public.debit_jour from public, anon, authenticated;
create or replace function public.compte_recent(p_source text) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare cree timestamptz;
begin
  if p_source is null or p_source !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  select u.created_at into cree from auth.users u where u.id = p_source::uuid;
  return cree is null or cree > pg_catalog.now() - interval '7 days';
end $fn$;
create or replace function public.debit_jour_compter(p_cle text, p_source text, p_n bigint, p_plafond bigint) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v bigint;
begin
  insert into public.debit_jour as d (jour, cle, source, n)
  values ((pg_catalog.now() at time zone 'UTC')::date, p_cle, p_source, p_n)
  on conflict (jour, cle, source) do update set n = d.n + excluded.n
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: plafond journalier atteint sur %', p_cle using errcode = 'P0001';
  end if;
end $fn$;
create or replace function public.debit_compter(p_table text, p_source text, p_plafond integer) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v integer;
begin
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (pg_catalog.date_trunc('minute', pg_catalog.now()), p_table, p_source, 1)
  on conflict (minute, table_nom, source) do update set n = d.n + 1
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: max % insertions/minute sur %', p_plafond, p_table using errcode = 'P0001';
  end if;
  -- Le plafond du jour : × 60 pour un compte installé, × 15 la première semaine.
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated') then
    perform public.debit_jour_compter(p_table, p_source, 1,
      p_plafond::bigint * case when public.compte_recent(p_source) then 15 else 60 end);
  end if;
end $fn$;
revoke all on function public.compte_recent(text) from public, anon, authenticated;
revoke all on function public.debit_jour_compter(text, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.debit_compter(text, text, integer) from public, anon, authenticated;
create or replace function public.debit_maj_par_compte() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare moi text := (auth.uid())::text;
begin
  if moi is not null then
    if pg_catalog.pg_trigger_depth() > 1 then
      perform public.debit_compter(tg_table_name || ':maj:chaine', moi, 150);
    else
      perform public.debit_compter(tg_table_name || ':maj', moi, tg_argv[0]::int);
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $fn$;
revoke all on function public.debit_maj_par_compte() from public, anon, authenticated;

-- ── Quatre tables réécrites par leur auteur ──────────────────────────────────────────────────
create table public.posts(id text primary key, author_id text not null, content text);
create table public.post_comments(id text primary key, author_id text not null, content text);
create table public.events(id text primary key, author_id text not null, title text);
create table public.user_state(user_id text primary key, data jsonb not null default '{}'::jsonb);
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.events enable row level security;
alter table public.user_state enable row level security;
create policy posts_lire on public.posts for select to authenticated using (true);
create policy posts_maj on public.posts for update to authenticated
 using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);
create policy commentaires_lire on public.post_comments for select to authenticated using (true);
create policy commentaires_maj on public.post_comments for update to authenticated
 using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);
create policy evenements_lire on public.events for select to authenticated using (true);
create policy evenements_maj on public.events for update to authenticated
 using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);
create policy etat_lire on public.user_state for select to authenticated using (user_id = auth.uid()::text);
create policy etat_maj on public.user_state for update to authenticated
 using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
grant select, update on public.posts, public.post_comments, public.events, public.user_state to authenticated;
insert into public.posts values ('p1', '11111111-1111-4111-8111-111111111111', 'texte');
insert into public.post_comments values ('c1', '11111111-1111-4111-8111-111111111111', 'texte');
insert into public.events values ('e1', '11111111-1111-4111-8111-111111111111', 'titre');
insert into public.user_state values ('11111111-1111-4111-8111-111111111111', '{"v":0}');

-- ── Storage réduit : sa table, son horodatage, les fonctions et policies PASSIO de production ─
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text,
 owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
 archived_at timestamptz, is_delete_marker boolean not null default false);
create function storage.foldername(name text) returns text[] language sql immutable as
 $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.update_updated_at_column() returns trigger language plpgsql as
 $$ begin new.updated_at = now(); return new; end $$;
create trigger update_objects_updated_at before update on storage.objects
 for each row execute function storage.update_updated_at_column();
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create table public.comptes_en_suppression(user_id text primary key, statut text not null);
create or replace function public.storage_chemin_autorise(_bucket text, _name text) returns boolean
language sql stable set search_path = '' as $fn$
  select
    (_bucket = 'content'
      and (storage.foldername(_name))[2] = (select auth.uid())::text)
    or
    (_bucket = 'attachments'
      and public.is_conv_member((storage.foldername(_name))[2], (select auth.uid())::text));
$fn$;
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
create or replace function public.quota_stockage_ok() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select (select count(*) from storage.objects o
           where o.owner = (select auth.uid()) and o.created_at > now() - interval '1 hour') < 120
     and (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
           where o.owner = (select auth.uid())) < 2147483648
$fn$;
revoke all on function public.quota_stockage_ok() from public, anon;
grant execute on function public.quota_stockage_ok() to authenticated, service_role;
create policy passio_content_read on storage.objects for select to authenticated
 using (bucket_id = 'content' and owner = (select auth.uid()));
create policy passio_media_insert_cloisonne on storage.objects for insert to authenticated
 with check (public.storage_chemin_autorise(bucket_id, name) and not public.suppression_de_mon_compte()
   and public.quota_stockage_ok());
create policy passio_media_update_cloisonne on storage.objects for update to authenticated
 using (bucket_id = any (array['content', 'attachments']) and owner = (select auth.uid()))
 with check (public.storage_chemin_autorise(bucket_id, name) and not public.suppression_de_mon_compte());

-- ── Référentiel des passions ; `rechercher_passions` du lot du 2026-11-15 ─────────────────────
create table public.passions(id text primary key, label text not null, emoji text, color text,
 popularity integer not null default 0, sort_order integer not null default 0, status text not null default 'active',
 normalized_label text not null, aliases text[] not null default '{}', is_broad boolean not null default false,
 recherche text not null);
create table public.passion_relations(source_passion_id text references public.passions(id),
 target_passion_id text references public.passions(id), relation_type text, weight numeric);
alter table public.passions enable row level security;
alter table public.passion_relations enable row level security;
create policy passions_lire on public.passions for select using (true);
create policy passion_relations_select_all on public.passion_relations for select using (true);
grant select, insert, update, delete on public.passions, public.passion_relations to anon, authenticated;
grant all on public.passions, public.passion_relations to service_role;
create or replace function public.unaccent_immutable(t text) returns text language sql immutable as
 $$ select lower(t) $$;
create or replace function public.rechercher_passions(q text, lim integer default 20)
 returns table(id text, label text, emoji text, color text, popularity integer, score integer)
 language plpgsql stable
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(left(coalesce(q, ''), 100)), '[^a-z0-9]+', ' ', 'g'));
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
  -- Sous trois caractères, le terme retient presque tout le référentiel et la note se calcule sur
  -- chaque ligne : le client cherche localement ces frappes-là, le serveur ne répond rien.
  if char_length(n) < 3 then
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
-- « ion » : 350 libellés qui le CONTIENNENT, très populaires, et « yion » dont un alias EST « ion »,
-- impopulaire. « gui » : un préfixe impopulaire parmi 350 libellés populaires qui le contiennent.
insert into public.passions(id, label, popularity, normalized_label, aliases, recherche)
 select 'zion_'||i, 'Zion '||i, 1000, 'zion '||i, '{}', 'zion '||i from generate_series(1, 350) i;
insert into public.passions(id, label, popularity, normalized_label, aliases, recherche)
 values ('yion', 'Yion', 0, 'yion', array['ion'], 'yion ion'), ('guitare', 'Guitare', 0, 'guitare', '{}', 'guitare');
insert into public.passions(id, label, popularity, normalized_label, aliases, recherche)
 select 'xgui_'||i, 'Xgui '||i, 1000, 'xgui '||i, '{}', 'xgui '||i from generate_series(1, 350) i;
insert into public.passion_relations select 'zion_'||i, 'zion_'||(i % 350 + 1), 'proche', 1 from generate_series(1, 350) i;
