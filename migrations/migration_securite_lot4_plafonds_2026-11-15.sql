-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ 2026-11-15 — LOT 4 « ABUS, PLAFONDS, CAPACITÉ » : PLAFONDS JOURNALIERS ET FORMES DES MÉDIAS
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Se joue APRÈS les lots du 2026-11-06.
-- PREREQUIS-CLIENT: video_lives:photo-https
-- Banc : tests/sql/migration-securite-2026-11-06.test.sh (étape « lot du 2026-11-15 »),
--        cas dans tests/sql/fixtures/cas-securite-lot5-2026-11-15.sql.
--
-- CE QUI MANQUAIT :
--   ① Les plafonds d'écriture étaient tous « par minute » : rien ne bornait ce qu'un compte écrit sur
--     une journée, et un compte de quelques minutes avait les mêmes plafonds qu'un ancien.
--   ② Le budget d'octets par minute ne couvrait pas `analytics_events`.
--   ③ Les colonnes d'adresse de média acceptaient une URI `data:` (jusqu'à la borne de la ligne).
--   ④ Le contrôle de quota de stockage relisait toute la table des fichiers à chaque dépôt.
--
-- CE QUI CHANGE :
--   ① `debit_compter` (le compteur commun de `rate_limit_insert`, `debit_par_compte` et
--     `debit_maj_par_compte`) tient AUSSI un compteur par jour (UTC), table `debit_jour` :
--     plafond journalier = plafond par minute × 60 pour un compte de plus de 7 jours, × 15 avant.
--     Exemple, publications (10/min) : 600 par jour, 150 la première semaine.
--   ② `debit_octets_par_compte` tient un budget d'octets par jour pour ce qui S'ACCUMULE (insertions,
--     hors `profiles` et `user_state`, qui se réécrivent sur une ligne) : 64 Mio par jour, 16 Mio la
--     première semaine. `analytics_events` entre dans le budget par minute et par jour.
--   Ces plafonds journaliers ne valent que pour les rôles `anon` et `authenticated` : les écritures de
--   service (restauration, tâches) gardent les plafonds par minute d'avant.
--   ③ Les colonnes d'adresse de média n'acceptent plus que `https://`, 2 048 caractères au plus. La
--     production n'en porte aucune autre (relu le 2026-11-15). Le client retire déjà toute URI `data:`
--     avant d'écrire ; le seul chemin qui pouvait en porter (photo d'un direct) est corrigé dans la
--     même PR : d'où le PREREQUIS-CLIENT.
--   ④ Le quota Storage existant est conservé : cache retiré, sans altérer le schéma géré.
--
-- RETOUR ARRIÈRE (éditeur SQL) : corps d'origine de `debit_compter`, `debit_octets_par_compte` et
-- dans tests/sql/fixtures/socle-production-2026-11-06.sql (lots 2 et 3). Quota Storage inchangé.
--| begin;
--| drop trigger if exists ab_debit_octets on public.analytics_events;
--| alter table public.posts drop constraint if exists posts_media_url_forme;
--| alter table public.posts add constraint posts_media_url_forme check (media_url is null or media_url ~ '^(https://|data:(image|video|audio)/)') not valid;
--| alter table public.stories drop constraint if exists stories_media_url_forme;
--| alter table public.stories add constraint stories_media_url_forme check (media_url is null or media_url ~ '^(https://|data:(image|video|audio)/)') not valid;
--| alter table public.events drop constraint if exists events_cover_url_forme;
--| alter table public.events add constraint events_cover_url_forme check (cover_url is null or cover_url ~ '^(https://|data:image/)') not valid;
--| alter table public.profiles drop constraint if exists profiles_urls_forme;
--| alter table public.profiles add constraint profiles_urls_forme check ((avatar_url is null or avatar_url ~ '^(https://|data:image/)') and (cover_url is null or cover_url ~ '^(https://|data:image/)')) not valid;
--| alter table public.video_lives drop constraint if exists video_lives_author_photo_forme;
--| select cron.unschedule('purge_debit_jour');
--| -- puis recréer debit_compter et debit_octets_par_compte depuis le socle ;
--| drop function if exists public.debit_jour_compter(text, text, bigint, bigint);
--| drop function if exists public.compte_recent(text);
--| drop table if exists public.debit_jour;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $g$ begin
  if to_regprocedure('public.debit_compter(text,text,integer)') is null
     or to_regprocedure('public.debit_octets_par_compte()') is null
     or to_regprocedure('public.quota_stockage_ok()') is null then
    raise exception 'les lots de sécurité du 2026-11-06 sont requis avant celui-ci';
  end if;
end $g$;

-- ── ① Un compteur par jour, à côté du compteur par minute ──────────────────────────────────────
create table if not exists public.debit_jour (
  jour date not null, cle text not null, source text not null, n bigint not null,
  primary key (jour, cle, source));
alter table public.debit_jour enable row level security;
revoke all on public.debit_jour from public, anon, authenticated;
grant select, insert, update, delete on public.debit_jour to service_role;

-- Un compte de moins de 7 jours. Une source qui n'est pas un identifiant de compte n'est pas
-- « récente » ; un identifiant de compte INCONNU l'est (le plafond le plus strict).
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
revoke all on function public.compte_recent(text) from public, anon, authenticated;

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
revoke all on function public.debit_jour_compter(text, text, bigint, bigint) from public, anon, authenticated;

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
revoke all on function public.debit_compter(text, text, integer) from public, anon, authenticated;

-- ── ② Les octets du jour, pour ce qui s'accumule ───────────────────────────────────────────────
create or replace function public.debit_octets_par_compte() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare moi text := (auth.uid())::text; taille integer; v integer;
begin
  if moi is null then return new; end if;
  taille := pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text);
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (pg_catalog.date_trunc('minute', pg_catalog.now()), 'octets', moi, taille)
  on conflict (minute, table_nom, source) do update set n = d.n + excluded.n
  returning d.n into v;
  if v > tg_argv[0]::integer then
    raise exception 'trop de données écrites en une minute' using errcode = 'P0001';
  end if;
  -- `profiles` et `user_state` se réécrivent sur une ligne par compte : elles ne remplissent pas le disque.
  if tg_op = 'UPDATE' then
    taille := greatest(0, taille - pg_catalog.octet_length(pg_catalog.to_jsonb(old)::text));
  end if;
  if taille > 0 and tg_table_name not in ('profiles', 'user_state')
     and pg_catalog.current_setting('role', true) in ('anon', 'authenticated') then
    perform public.debit_jour_compter('octets', moi, taille,
      case when public.compte_recent(moi) then 16777216 else 67108864 end);
  end if;
  return new;
end $fn$;
revoke all on function public.debit_octets_par_compte() from public, anon, authenticated;

drop trigger if exists ab_debit_octets on public.analytics_events;
create trigger ab_debit_octets before insert or update on public.analytics_events
  for each row execute function public.debit_octets_par_compte('4194304');

do $c$ begin
  perform cron.schedule('purge_debit_jour', '29 2 * * *',
    $q$delete from public.debit_jour where jour < ((now() at time zone 'UTC')::date) - 2$q$);
end $c$;

-- ── ③ Une adresse de média est une adresse ─────────────────────────────────────────────────────
alter table public.posts drop constraint if exists posts_media_url_forme;
alter table public.posts add constraint posts_media_url_forme
  check (media_url is null or (media_url ~ '^https://' and char_length(media_url) <= 2048)) not valid;
alter table public.posts validate constraint posts_media_url_forme;
alter table public.stories drop constraint if exists stories_media_url_forme;
alter table public.stories add constraint stories_media_url_forme
  check (media_url is null or (media_url ~ '^https://' and char_length(media_url) <= 2048)) not valid;
alter table public.stories validate constraint stories_media_url_forme;
alter table public.events drop constraint if exists events_cover_url_forme;
alter table public.events add constraint events_cover_url_forme
  check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 2048)) not valid;
alter table public.events validate constraint events_cover_url_forme;
alter table public.profiles drop constraint if exists profiles_urls_forme;
alter table public.profiles add constraint profiles_urls_forme
  check ((avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048))
     and (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 2048))) not valid;
alter table public.profiles validate constraint profiles_urls_forme;
alter table public.video_lives drop constraint if exists video_lives_author_photo_forme;
alter table public.video_lives add constraint video_lives_author_photo_forme
  check (author_photo is null or (author_photo ~ '^https://' and char_length(author_photo) <= 2048)) not valid;
alter table public.video_lives validate constraint video_lives_author_photo_forme;

-- ④ Quota Storage inchangé : pas de cache permissif ni de DDL sur storage.

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'debit_jour : fermée aux clients' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.debit_jour'::regclass)
             and not has_table_privilege('anon', 'public.debit_jour', 'select')
             and not has_table_privilege('authenticated', 'public.debit_jour', 'insert') then 'OK' else 'ECHEC' end as valeur
union all select 'debit_compter : plafond journalier, rôles clients seulement',
       case when (select prosrc from pg_proc where oid = 'public.debit_compter(text,text,integer)'::regprocedure) like '%debit_jour_compter%'
             and (select prosrc from pg_proc where oid = 'public.debit_compter(text,text,integer)'::regprocedure) like '%compte_recent%' then 'OK' else 'ECHEC' end
union all select 'octets : budget du jour sur les insertions',
       case when (select prosrc from pg_proc where oid = 'public.debit_octets_par_compte()'::regprocedure) like '%debit_jour_compter(''octets''%' then 'OK' else 'ECHEC' end
union all select 'analytics_events : dans le budget d''octets',
       case when exists (select 1 from pg_trigger where tgname = 'ab_debit_octets' and tgrelid = 'public.analytics_events'::regclass and tgenabled = 'O') then 'OK' else 'ECHEC' end
union all select 'fonctions internes : aucun client',
       case when not has_function_privilege('anon', 'public.debit_jour_compter(text,text,bigint,bigint)', 'execute')
             and not has_function_privilege('authenticated', 'public.debit_jour_compter(text,text,bigint,bigint)', 'execute')
             and not has_function_privilege('authenticated', 'public.compte_recent(text)', 'execute') then 'OK' else 'ECHEC' end
union all select 'médias : https seulement, contraintes validées',
       case when (select count(*) from pg_constraint where convalidated and conname in
                   ('posts_media_url_forme', 'stories_media_url_forme', 'events_cover_url_forme', 'profiles_urls_forme', 'video_lives_author_photo_forme')
                   and pg_get_constraintdef(oid) not like '%data:%') = 5 then 'OK' else 'ECHEC' end
union all select 'quota de stockage : contrôle existant conservé',
       case when (select provolatile from pg_proc where oid = 'public.quota_stockage_ok()'::regprocedure) = 's' then 'OK' else 'ECHEC' end
union all select 'purge quotidienne des compteurs du jour',
       case when exists (select 1 from cron.job where jobname = 'purge_debit_jour') then 'OK' else 'ECHEC' end;

commit;
