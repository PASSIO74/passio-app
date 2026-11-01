-- ═══════════════════════════════════════════════════════════════════════════
-- CROISSANCE ET CONSERVATION DE LA TÉLÉMÉTRIE PAR PALIERS (2026-11-01)
--
-- Demande de Benjamin : « me focaliser sur le commerce, trouver des
-- utilisateurs, monter à 10 000 puis 100 000 — et que l'app gère seule la
-- montée en puissance ». Deux trous de docs/PASSIO_100K_AUTONOMIE.md §5 :
--
-- ① LE PILOTAGE NE SAIT PAS D'OÙ VIENNENT LES INSCRITS NI LESQUELS RESTENT.
--    Les signaux existent (`session/start` porte la source depuis ce lot,
--    `link_*` depuis septembre, `acq_signup` depuis ce lot) mais vivent 7 jours
--    dans `telemetry_events`, et aucune rétention à J30 n'est mesurable sur 7
--    jours de données. On AGRÈGE donc, chaque heure :
--      · `croissance_jour` (jour, mesure, valeur, n) — visites par source,
--        liens créés / partagés / ouverts, inscriptions par source et par
--        campagne. Quelques dizaines de lignes par jour, quel que soit le trafic.
--      · `activite_jour` (jour, uid) — un compte actif ce jour-là. L'identité
--        est `auth_uid`, posée par le SERVEUR (telemetry_pose_identite), jamais
--        un `user_id` écrit par le client. ~30 000 lignes/jour à 100 000
--        inscrits (estimé) ; conservées 400 jours.
--    `pilotage_croissance(p_jours)` rend le tout en une lecture (fonction
--    `pilotage`, onglet Croissance). Le public seulement : `meta.trafic`
--    (robot, émulation, équipe) et les comptes e2e / éditeur sont écartés.
--
-- ② LA TÉLÉMÉTRIE BRUTE REMPLIRAIT LA BASE AVANT LES UTILISATEURS (§4 : 0,5 à
--    0,7 Go/jour à 30 000 actifs, estimé). Paliers : les ÉCHECS (erreur,
--    statut error, HTTP ≥ 400) gardent 7 jours — la Sentinelle, la veille et
--    « erreurs (7 j) » les lisent ; tout le reste part à 3 jours, APRÈS avoir
--    été agrégé (la purge agrège d'abord les deux jours qu'elle touche).
--    `purge_telemetry_7j` est remplacée par `purge_telemetrie_paliers`.
--
-- Aucune table ni fonction n'est ouverte aux clients : service_role seul.
--
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_croissance_2026-11-01.sql`
-- REJOUABLE. RETOUR ARRIÈRE :
--   select cron.unschedule('agreger_croissance'); select cron.unschedule('purge_telemetrie_paliers');
--   select cron.schedule('purge_telemetry_7j', '0 4 * * *', 'select public.purge_telemetry(7)');
--   drop function if exists public.pilotage_croissance(integer), public.agreger_croissance_recente(),
--     public.purge_telemetrie_paliers(), public.agreger_croissance(date);
--   drop table if exists public.croissance_jour, public.activite_jour;
-- BANC : tests/sql/migration-croissance-pretri.test.sh
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.activite_jour (
  jour date not null,
  -- Part avec le compte (audit-tables-compte : exception « cascade »).
  uid uuid not null references auth.users (id) on delete cascade,
  primary key (jour, uid)
);
create index if not exists idx_activite_jour_uid on public.activite_jour (uid, jour);
alter table public.activite_jour enable row level security;
revoke all on public.activite_jour from public, anon, authenticated;
grant select, insert, update, delete on public.activite_jour to service_role;

create table if not exists public.croissance_jour (
  jour date not null,
  mesure text not null,
  valeur text not null,
  n integer not null default 0,
  primary key (jour, mesure, valeur)
);
alter table public.croissance_jour enable row level security;
revoke all on public.croissance_jour from public, anon, authenticated;
grant select, insert, update, delete on public.croissance_jour to service_role;

-- ── L'agrégation d'UN jour (UTC). Rejouable : elle réécrit le jour entier. ──
create or replace function public.agreger_croissance(p_jour date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  debut timestamptz := (p_jour::timestamp at time zone 'UTC');
  fin timestamptz := (p_jour::timestamp at time zone 'UTC') + interval '1 day';
  n integer;
begin
  if p_jour is null then return 0; end if;

  insert into public.activite_jour (jour, uid)
  select distinct p_jour, t.auth_uid
    from public.telemetry_events t
   where t.received_at >= debut and t.received_at < fin
     and t.auth_uid is not null
     and coalesce(t.env, '') <> 'development'
     and (t.meta ->> 'trafic') is null
     -- Un compte qui EXISTE encore (clé étrangère) : la télémétrie d'un compte
     -- supprimé depuis ferait échouer l'agrégation de toute la journée.
     and exists (select 1 from auth.users u where u.id = t.auth_uid
                  and lower(coalesce(u.email, '')) not like '%@passio-e2e.test'
                  and lower(coalesce(u.email, '')) <> 'passioadmin@gmail.com')
  on conflict do nothing;

  delete from public.croissance_jour where jour = p_jour;
  -- Une ligne par (mesure, valeur). `cle` dédoublonne : un appareil par
  -- visite, un lien par création, un (lien, appareil) par ouverture. Les
  -- valeurs sont réduites à [a-z0-9_.-] : rien d'arbitraire n'entre ici.
  insert into public.croissance_jour (jour, mesure, valeur, n)
  select p_jour, x.mesure, x.valeur, count(distinct x.cle)::integer
    from (
      select m.mesure,
             coalesce(nullif(left(regexp_replace(lower(coalesce(m.valeur, '')), '[^a-z0-9_.-]', '', 'g'), 40), ''), '?') as valeur,
             m.cle
        from public.telemetry_events t
        cross join lateral (values
          (case when t.type = 'session' and t.action = 'start' then 'visite' end,
           coalesce(t.meta ->> 'src', t.meta ->> 'referrer'), coalesce(t.device_id, t.session_id, t.id::text)),
          (case when t.action = 'link_create' then 'lien_cree' end,
           t.meta ->> 'link_kind', coalesce(t.correlation_id, t.id::text)),
          (case when t.action = 'link_share' then 'lien_partage' end,
           t.meta ->> 'link_channel', coalesce(t.correlation_id, t.id::text) || ':' || coalesce(t.meta ->> 'link_channel', '')),
          (case when t.action = 'link_open' then 'lien_ouvert' end,
           t.meta ->> 'referrer', coalesce(t.correlation_id, '') || ':' || coalesce(t.device_id, t.id::text)),
          (case when t.action = 'link_signup' then 'inscription_lien' end,
           t.meta ->> 'voie', coalesce(t.correlation_id, '') || ':' || coalesce(t.device_id, t.id::text)),
          (case when t.action = 'acq_signup' then 'inscription' end,
           t.meta ->> 'src', coalesce(t.device_id, t.id::text)),
          (case when t.action = 'acq_signup' and (t.meta ->> 'camp') is not null then 'campagne' end,
           t.meta ->> 'camp', coalesce(t.device_id, t.id::text))
        ) as m (mesure, valeur, cle)
       where t.received_at >= debut and t.received_at < fin
         and coalesce(t.env, '') <> 'development'
         and (t.meta ->> 'trafic') is null
         and (t.type in ('session', 'link') or t.action = 'acq_signup')
         and m.mesure is not null
    ) x
   group by x.mesure, x.valeur;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.agreger_croissance(date) from public, anon, authenticated;
grant execute on function public.agreger_croissance(date) to service_role;

-- ── Chaque heure : aujourd'hui, et hier pendant les deux premières heures ──
create or replace function public.agreger_croissance_recente()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer := 0;
begin
  if extract(hour from now() at time zone 'UTC') < 2 then
    n := n + public.agreger_croissance(((now() at time zone 'UTC')::date) - 1);
  end if;
  n := n + public.agreger_croissance((now() at time zone 'UTC')::date);
  return n;
end $$;
revoke execute on function public.agreger_croissance_recente() from public, anon, authenticated;
grant execute on function public.agreger_croissance_recente() to service_role;

-- ── Conservation par paliers ──
create or replace function public.purge_telemetrie_paliers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer := 0; k integer;
begin
  -- Agréger AVANT de purger : jamais une ligne ne part sans avoir été comptée.
  perform public.agreger_croissance(((now() at time zone 'UTC')::date) - 3);
  perform public.agreger_croissance(((now() at time zone 'UTC')::date) - 2);
  perform public.agreger_croissance(((now() at time zone 'UTC')::date) - 1);
  delete from public.telemetry_events where received_at < now() - interval '7 days';
  get diagnostics k = row_count; n := n + k;
  delete from public.telemetry_events
   where received_at < now() - interval '3 days'
     and coalesce(type, '') <> 'error'
     and coalesce(status, '') <> 'error'
     and coalesce(severity, '') not in ('error', 'fatal', 'warn', 'warning')
     and coalesce(http_status, 0) < 400;
  get diagnostics k = row_count; n := n + k;
  delete from public.activite_jour where jour < ((now() at time zone 'UTC')::date) - 400;
  delete from public.croissance_jour where jour < ((now() at time zone 'UTC')::date) - 400;
  return n;
end $$;
revoke execute on function public.purge_telemetrie_paliers() from public, anon, authenticated;
grant execute on function public.purge_telemetrie_paliers() to service_role;

-- ── La lecture du pilotage, en une fois ──
create or replace function public.pilotage_croissance(p_jours integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bornes as (
    select greatest(1, least(coalesce(p_jours, 30), 120)) as j, (now() at time zone 'UTC')::date as auj
  ),
  cumul as (
    select c.mesure, c.valeur, sum(c.n)::integer as n
      from public.croissance_jour c, bornes b
     where c.jour > b.auj - b.j
     group by c.mesure, c.valeur
  ),
  actifs as (
    select a.jour, count(*)::integer as n
      from public.activite_jour a, bornes b
     where a.jour > b.auj - b.j
     group by a.jour
  ),
  comptes as (
    select u.id, (u.created_at at time zone 'UTC')::date as cree
      from auth.users u
     where u.deleted_at is null
       and coalesce(u.is_anonymous, false) = false
       and u.email_confirmed_at is not null
       and lower(coalesce(u.email, '')) not like '%@passio-e2e.test'
       and lower(coalesce(u.email, '')) <> 'passioadmin@gmail.com'
       and u.created_at > now() - interval '70 days'
  ),
  cohortes as (
    select date_trunc('week', c.cree)::date as semaine,
           count(*)::integer as taille,
           count(*) filter (where exists (select 1 from public.activite_jour a where a.uid = c.id and a.jour = c.cree + 1))::integer as j1,
           count(*) filter (where exists (select 1 from public.activite_jour a where a.uid = c.id and a.jour between c.cree + 7 and c.cree + 13))::integer as j7,
           count(*) filter (where exists (select 1 from public.activite_jour a where a.uid = c.id and a.jour between c.cree + 30 and c.cree + 36))::integer as j30,
           max(c.cree) as dernier
      from comptes c
     group by 1
  )
  select jsonb_build_object(
    'jours', (select j from bornes),
    'cumul', coalesce((select jsonb_agg(jsonb_build_object('mesure', mesure, 'valeur', valeur, 'n', n) order by mesure, n desc) from cumul), '[]'::jsonb),
    'actifs', coalesce((select jsonb_agg(jsonb_build_object('jour', jour, 'n', n) order by jour) from actifs), '[]'::jsonb),
    'cohortes', coalesce((select jsonb_agg(jsonb_build_object('semaine', semaine, 'taille', taille, 'j1', j1, 'j7', j7, 'j30', j30, 'dernier', dernier) order by semaine desc) from cohortes), '[]'::jsonb),
    'agrege_le', (select max(jour) from public.croissance_jour)
  );
$$;
revoke execute on function public.pilotage_croissance(integer) from public, anon, authenticated;
grant execute on function public.pilotage_croissance(integer) to service_role;

-- ── Planification ──
create or replace function public.planifier_croissance()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('purge_telemetry_7j', 'purge_telemetrie_paliers', 'agreger_croissance');
  perform cron.schedule('agreger_croissance', '7 * * * *', $q$select public.agreger_croissance_recente()$q$);
  perform cron.schedule('purge_telemetrie_paliers', '0 4 * * *', $q$select public.purge_telemetrie_paliers()$q$);
  return 'agreger_croissance : chaque heure à :07 ; purge_telemetrie_paliers : chaque jour à 04:00 UTC (échecs 7 j, reste 3 j)';
end $$;
revoke execute on function public.planifier_croissance() from public, anon, authenticated;
grant execute on function public.planifier_croissance() to service_role;

select public.planifier_croissance() as planification;

-- Rattrapage : les 7 jours encore présents dans la télémétrie.
select public.agreger_croissance(((now() at time zone 'UTC')::date) - k) from generate_series(0, 6) as k;

-- ── VERDICT ─────────────────────────────────────────────────────────────────
do $v$
begin
  if (select count(*) from cron.job where jobname = 'agreger_croissance') <> 1 then
    raise exception 'ECHEC : la tâche agreger_croissance n''est pas planifiée une fois';
  end if;
  if (select count(*) from cron.job where jobname = 'purge_telemetrie_paliers') <> 1 then
    raise exception 'ECHEC : la tâche purge_telemetrie_paliers n''est pas planifiée une fois';
  end if;
  if exists (select 1 from cron.job where jobname = 'purge_telemetry_7j') then
    raise exception 'ECHEC : purge_telemetry_7j tourne encore (deux purges concurrentes)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.activite_jour'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.croissance_jour'::regclass) then
    raise exception 'ECHEC : RLS absente sur activite_jour ou croissance_jour';
  end if;
  if has_table_privilege('anon', 'public.activite_jour', 'select')
     or has_table_privilege('authenticated', 'public.activite_jour', 'select')
     or has_table_privilege('anon', 'public.croissance_jour', 'select')
     or has_table_privilege('authenticated', 'public.croissance_jour', 'select') then
    raise exception 'ECHEC : un client peut lire les agrégats de croissance';
  end if;
  if has_function_privilege('anon', 'public.pilotage_croissance(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.pilotage_croissance(integer)', 'execute')
     or has_function_privilege('anon', 'public.purge_telemetrie_paliers()', 'execute')
     or has_function_privilege('authenticated', 'public.agreger_croissance(date)', 'execute') then
    raise exception 'ECHEC : une fonction de croissance est exécutable par un client';
  end if;
  if public.pilotage_croissance(30) ->> 'jours' <> '30' then
    raise exception 'ECHEC : pilotage_croissance ne rend pas la période demandée';
  end if;
  raise notice 'OK : croissance agrégée chaque heure, télémétrie conservée par paliers (échecs 7 j, reste 3 j)';
end $v$;

commit;
