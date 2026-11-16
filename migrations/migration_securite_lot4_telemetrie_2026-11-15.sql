-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ 2026-11-15 — LOT 4 « ABUS, PLAFONDS, CAPACITÉ » : TÉLÉMÉTRIE BORNÉE QUI SE ROUVRE, PURGE PAR LOTS
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Indépendante du client (aucun
-- PREREQUIS-CLIENT) : le client de la même PR espace son battement, ce qui ne fait que réduire le
-- volume.
-- Banc : tests/sql/migration-securite-2026-11-06.test.sh (étape « lot du 2026-11-15 »),
--        cas dans tests/sql/fixtures/cas-securite-lot5-2026-11-15.sql.
--
-- CE QUI MANQUAIT :
--   ① La borne de `telemetry_events` portait sur la TAILLE PHYSIQUE de la table (2 Gio), qui ne
--     redescend pas après une purge : une fois atteinte, la table restait fermée des jours. Et elle
--     se fermait pour tout le monde à la fois, visiteurs comme comptes.
--   ② La purge quotidienne supprimait tout en une instruction, sous la coupure de 120 s.
--
-- CE QUI CHANGE :
--   ① `aa_table_bornee` (même nom, pour les verdicts des lots d'avant) appelle `telemetrie_bornee` :
--     la borne porte sur les LIGNES VIVANTES (statistiques du serveur), qui redescendent à la purge.
--     Les visiteurs (`anon`) sont refusés au-delà de 800 000 lignes, les comptes au-delà de
--     1 200 000 : réserve pour les comptes ; statistiques approximatives, pas quota dur.
--     Aucun plafond physique irréversible après DELETE.
--   ② La purge supprime par lots de 5 000, sous un budget de temps (75 s), et note jusqu'où elle a le
--     droit d'aller (`telemetrie_purge_etat`) APRÈS l'agrégation. Une tâche horaire
--     (`purge_telemetrie_rattrapage`) reprend les lots restants jusqu'à cette borne-là, jamais plus
--     loin : aucune ligne pas encore agrégée ne part, et le jour J-3 n'est jamais réagrégé amputé.
--
-- RETOUR ARRIÈRE (éditeur SQL) : corps d'origine de `purge_telemetrie_paliers` dans
-- tests/sql/fixtures/socle-production-2026-11-06.sql ; puis :
--| begin;
--| drop trigger if exists aa_table_bornee on public.telemetry_events;
--| create trigger aa_table_bornee before insert on public.telemetry_events for each statement execute function public.table_bornee('2147483648');
--| select cron.unschedule('purge_telemetrie_rattrapage');
--| drop function if exists public.purge_telemetrie_rattrapage();
--| drop function if exists public.telemetrie_purger_lots(timestamptz, timestamptz, interval);
--| drop function if exists public.telemetrie_bornee();
--| drop table if exists public.telemetrie_purge_etat;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $g$ begin
  if to_regprocedure('public.agreger_croissance(date)') is null
     or to_regprocedure('public.purge_telemetrie_paliers()') is null then
    raise exception 'agreger_croissance / purge_telemetrie_paliers absentes : relire le schéma';
  end if;
end $g$;

-- ── ① Une borne qui redescend, et une part réservée aux comptes ─────────────────────────────────
create or replace function public.telemetrie_bornee() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  r text := pg_catalog.current_setting('role', true);
  vivantes bigint;
begin
  if r is null or r not in ('anon', 'authenticated') then return null; end if;
  vivantes := pg_catalog.pg_stat_get_live_tuples(tg_relid);
  if vivantes > (case when r = 'anon' then tg_argv[0] else tg_argv[1] end)::bigint
     then
    raise exception 'table pleine : %', tg_table_name using errcode = 'PT429';
  end if;
  return null;
end $fn$;
revoke all on function public.telemetrie_bornee() from public, anon, authenticated;

drop trigger if exists aa_table_bornee on public.telemetry_events;
create trigger aa_table_bornee before insert on public.telemetry_events
  for each statement execute function public.telemetrie_bornee('800000', '1200000');

-- ── ② Purge par lots, sous un budget de temps ───────────────────────────────────────────────────
create table if not exists public.telemetrie_purge_etat (
  id smallint primary key default 1 check (id = 1),
  borne_courte timestamptz not null,
  borne_longue timestamptz not null,
  maj timestamptz not null default now());
alter table public.telemetrie_purge_etat enable row level security;
revoke all on public.telemetrie_purge_etat from public, anon, authenticated;
grant select on public.telemetrie_purge_etat to service_role;

-- Supprime, par lots de 5 000 (adresses physiques lues sur l'index de `received_at`), tout ce qui
-- précède `p_longue`, puis ce qui précède `p_courte` sans être une erreur. S'arrête au budget.
create or replace function public.telemetrie_purger_lots(p_courte timestamptz, p_longue timestamptz, p_budget interval)
returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  n integer := 0;
  k integer;
  lot constant integer := 5000;
  debut timestamptz := pg_catalog.clock_timestamp();
begin
  loop
    delete from public.telemetry_events t
     where t.ctid = any (array(
       select x.ctid from public.telemetry_events x
        where x.received_at < p_longue
        order by x.received_at
        limit lot));
    get diagnostics k = row_count; n := n + k;
    exit when k < lot or pg_catalog.clock_timestamp() - debut > p_budget;
  end loop;
  if pg_catalog.clock_timestamp() - debut > p_budget then return n; end if;
  loop
    delete from public.telemetry_events t
     where t.ctid = any (array(
       select x.ctid from public.telemetry_events x
        where x.received_at < p_courte
          and coalesce(x.type, '') <> 'error'
          and coalesce(x.status, '') <> 'error'
          and coalesce(x.severity, '') not in ('error', 'fatal', 'warn', 'warning')
          and coalesce(x.http_status, 0) < 400
        order by x.received_at
        limit lot));
    get diagnostics k = row_count; n := n + k;
    exit when k < lot or pg_catalog.clock_timestamp() - debut > p_budget;
  end loop;
  return n;
end $fn$;
revoke all on function public.telemetrie_purger_lots(timestamptz, timestamptz, interval) from public, anon, authenticated;

create or replace function public.purge_telemetrie_paliers()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  n integer;
  courte timestamptz := (((pg_catalog.now() at time zone 'UTC')::date - 3)::timestamp at time zone 'UTC');
  longue timestamptz := (((pg_catalog.now() at time zone 'UTC')::date - 7)::timestamp at time zone 'UTC');
begin
  -- Agréger AVANT de purger : jamais une ligne ne part sans avoir été comptée.
  perform public.agreger_croissance(((pg_catalog.now() at time zone 'UTC')::date) - 3);
  perform public.agreger_croissance(((pg_catalog.now() at time zone 'UTC')::date) - 2);
  perform public.agreger_croissance(((pg_catalog.now() at time zone 'UTC')::date) - 1);
  -- La borne n'avance qu'APRÈS l'agrégation : le rattrapage horaire ne va jamais plus loin.
  insert into public.telemetrie_purge_etat as e (id, borne_courte, borne_longue, maj)
  values (1, courte, longue, pg_catalog.now())
  on conflict (id) do update set borne_courte = excluded.borne_courte, borne_longue = excluded.borne_longue, maj = excluded.maj;
  n := public.telemetrie_purger_lots(courte, longue, interval '75 seconds');
  delete from public.activite_jour where jour < ((pg_catalog.now() at time zone 'UTC')::date) - 400;
  delete from public.croissance_jour where jour < ((pg_catalog.now() at time zone 'UTC')::date) - 400;
  return n;
end $function$;

create or replace function public.purge_telemetrie_rattrapage() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare e public.telemetrie_purge_etat%rowtype;
begin
  select * into e from public.telemetrie_purge_etat where id = 1;
  if not found then return 0; end if;
  return public.telemetrie_purger_lots(e.borne_courte, e.borne_longue, interval '60 seconds');
end $fn$;
revoke all on function public.purge_telemetrie_rattrapage() from public, anon, authenticated;
grant execute on function public.purge_telemetrie_rattrapage() to service_role;

do $c$ begin
  perform cron.schedule('purge_telemetrie_rattrapage', '37 * * * *', $q$select public.purge_telemetrie_rattrapage()$q$);
end $c$;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'télémétrie : borne sur les lignes vivantes, part réservée aux comptes' as controle,
       case when exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                          where t.tgname = 'aa_table_bornee' and t.tgrelid = 'public.telemetry_events'::regclass
                            and t.tgenabled = 'O' and p.proname = 'telemetrie_bornee') then 'OK' else 'ECHEC' end as valeur
union all select 'erreurs client : borne d''avant inchangée',
       case when exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                          where t.tgname = 'aa_table_bornee' and t.tgrelid = 'public.client_errors'::regclass
                            and p.proname = 'table_bornee') then 'OK' else 'ECHEC' end
union all select 'purge : par lots, sous budget, borne notée après l''agrégation',
       case when (select prosrc from pg_proc where oid = 'public.purge_telemetrie_paliers()'::regprocedure) like '%telemetrie_purger_lots%'
             and position('telemetrie_purge_etat' in (select prosrc from pg_proc where oid = 'public.purge_telemetrie_paliers()'::regprocedure))
               > position('agreger_croissance' in (select prosrc from pg_proc where oid = 'public.purge_telemetrie_paliers()'::regprocedure)) then 'OK' else 'ECHEC' end
union all select 'rattrapage horaire planifié',
       case when exists (select 1 from cron.job where jobname = 'purge_telemetrie_rattrapage')
             and exists (select 1 from cron.job where jobname = 'purge_telemetrie_paliers') then 'OK' else 'ECHEC' end
union all select 'fonctions internes : aucun client',
       case when not has_function_privilege('anon', 'public.telemetrie_purger_lots(timestamptz,timestamptz,interval)', 'execute')
             and not has_function_privilege('authenticated', 'public.purge_telemetrie_rattrapage()', 'execute')
             and not has_table_privilege('anon', 'public.telemetrie_purge_etat', 'select') then 'OK' else 'ECHEC' end;

commit;
