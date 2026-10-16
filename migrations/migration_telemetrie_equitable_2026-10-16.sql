-- ═══════════════════════════════════════════════════════════════════════════
-- TÉLÉMÉTRIE ÉQUITABLE : UN COMPTEUR PAR LOT, TROIS RÉSERVOIRS (2026-10-16)
--
-- P1 du plan docs/PASSIO_100K_AUTONOMIE.md (« télémétrie à l'échelle »).
--
-- CE QUI EXISTAIT : `trg_debit_global` (ouverture publique, 2026-09-11), un
-- déclencheur PAR LIGNE qui recompte toutes les lignes de la dernière minute
-- et refuse au-delà de 3 000, toutes origines confondues. Deux défauts :
--   ① le coût : chaque ligne relit jusqu'à 3 000 entrées d'index — un lot de
--     20 lignes en relit 60 000 au moment où la charge est la plus forte ;
--   ② l'aveuglement : la clé anon est publique. Une boucle anonyme qui tient
--     le compteur à 3 000 fait refuser TOUTE la télémétrie, celle des comptes
--     réels comprise — et la veille, qui décide du délestage, du réveil de la
--     Sentinelle et de la proposition de retour arrière sur ces comptes-là,
--     devient aveugle au moment où elle sert (mesuré par la contre-revue du
--     2026-10-13, constat « télémétrie aveuglée »).
--
-- CE QUI LE REMPLACE : un déclencheur PAR INSTRUCTION (un lot = une
-- instruction PostgREST) qui compte le lot une fois, dans un compteur par
-- minute (`telemetrie_debit`, upsert sur clé primaire : coût constant), et
-- le classe dans l'un de TROIS RÉSERVOIRS selon l'identité posée par le
-- serveur (auth.uid(), jamais une colonne du client) :
--   · `anciens`  : compte confirmé, non anonyme, créé depuis 7 jours — ce que
--                  lisent les signaux qui AGISSENT (pilotage_audience,
--                  pilotage_familles_erreurs) : 1 800 lignes/min ;
--   · `neufs`    : tout autre compte : 600 lignes/min ;
--   · `anonymes` : la clé anon : 600 lignes/min ;
-- et un plafond PAR COMPTE de 300 lignes/min (le client plafonne déjà à
-- 400/min par onglet, hors erreurs).
-- Total : 3 000/min, le plafond d'avant — la base ne grossit pas plus vite.
-- Un flot anonyme, ou une armée de comptes neufs, ne remplit plus que SON
-- réservoir : les comptes anciens gardent leurs 1 800 lignes/min.
--
-- Un lot refusé n'écrit rien (l'exception annule l'instruction ET son
-- compteur) : insister ne repousse pas la fenêtre. Le client jette déjà un
-- lot refusé en 4xx et le note (`connectivity/server_reject`).
-- La clé service_role (fonctions Edge, scripts) n'est pas limitée.
--
-- ⚠️ L'ANCIEN DÉCLENCHEUR IMPOSAIT AUSSI L'HEURE (ASTRA-02) : `received_at`
-- a un DEFAULT now(), pas une valeur forcée, et un client qui l'antidate sort
-- ses lignes de toute fenêtre. Le retirer sans reporter cette garde rouvrait
-- la faille : `telemetry_pose_identite` pose désormais `received_at` ET
-- `auth_uid`. `limiter_debit_global` reste en place pour `client_errors`.
--
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_telemetrie_equitable_2026-10-16.sql`
-- REJOUABLE. RETOUR ARRIÈRE :
--   drop trigger if exists trg_debit_lot on public.telemetry_events;
--   create trigger trg_debit_global before insert on public.telemetry_events
--     for each row execute function public.limiter_debit_global('received_at', '3000');
--   (telemetry_pose_identite peut garder la pose de l'heure : elle est inoffensive.)
-- BANC : tests/sql/migration-telemetrie-equitable.test.sh
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── ① l'identité ET l'heure sont posées par le serveur ──────────────────────
create or replace function public.telemetry_pose_identite()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.auth_uid := auth.uid();   -- NULL pour un visiteur, l'identité réelle sinon
  new.received_at := now();     -- ASTRA-02 : jamais l'heure du client
  return new;
end $$;
revoke execute on function public.telemetry_pose_identite() from public, anon, authenticated;
drop trigger if exists trg_telemetry_identite on public.telemetry_events;
create trigger trg_telemetry_identite
  before insert on public.telemetry_events
  for each row execute function public.telemetry_pose_identite();

-- ── ② le compteur par minute ────────────────────────────────────────────────
create table if not exists public.telemetrie_debit (
  minute    timestamptz not null,
  reservoir text        not null check (reservoir in ('anciens', 'neufs', 'anonymes', 'tous')),
  source    text        not null check (source = '*' or source = 'anon' or source ~ '^u:[0-9a-f-]{36}$'),
  n         integer     not null check (n >= 0),
  primary key (minute, reservoir, source)
);
alter table public.telemetrie_debit enable row level security;
revoke all on table public.telemetrie_debit from public, anon, authenticated;
grant select, insert, update, delete on table public.telemetrie_debit to service_role;
comment on table public.telemetrie_debit is
  'Lignes de télémétrie acceptées par minute, par réservoir et par source (u:<uid> | anon | *). Écrite par trg_debit_lot seulement ; lue par le pilotage (service_role). Purgée au-delà d''une heure.';

-- ── ③ le déclencheur par instruction ────────────────────────────────────────
create or replace function public.telemetrie_debit_lot()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  k     integer;
  uid   uuid := auth.uid();
  res   text;
  src   text;
  m     timestamptz := date_trunc('minute', now());
  n_src integer;
  n_res integer;
  plafond_res integer;
begin
  -- La clé service_role (fonctions Edge, scripts d'exploitation) n'est pas limitée.
  if coalesce(auth.role(), '') = 'service_role' then
    return null;
  end if;
  select count(*) into k from nouvelles;
  if k = 0 then
    return null;
  end if;
  if uid is null then
    res := 'anonymes'; src := 'anon';
  else
    select case when u.created_at < now() - interval '7 days'
                 and u.email_confirmed_at is not null
                 and not coalesce(u.is_anonymous, false)
                then 'anciens' else 'neufs' end
      into res
      from auth.users u where u.id = uid;
    res := coalesce(res, 'neufs');
    src := 'u:' || uid::text;
  end if;
  plafond_res := case res when 'anciens' then 1800 when 'neufs' then 600 else 600 end;

  insert into public.telemetrie_debit as d (minute, reservoir, source, n) values (m, res, src, k)
    on conflict (minute, reservoir, source) do update set n = d.n + excluded.n
    returning n into n_src;
  insert into public.telemetrie_debit as d (minute, reservoir, source, n) values (m, res, '*', k)
    on conflict (minute, reservoir, source) do update set n = d.n + excluded.n
    returning n into n_res;
  -- Le total de la minute, pour la jauge du pilotage (aucune décision ici).
  insert into public.telemetrie_debit as d (minute, reservoir, source, n) values (m, 'tous', '*', k)
    on conflict (minute, reservoir, source) do update set n = d.n + excluded.n;

  if (src <> 'anon' and n_src > 300) or n_res > plafond_res then
    raise exception 'rate limit: réservoir % plein (% lignes/minute)', res, plafond_res
      using errcode = 'P0001';
  end if;
  return null;
end $$;
revoke execute on function public.telemetrie_debit_lot() from public, anon, authenticated;

drop trigger if exists trg_debit_lot on public.telemetry_events;
create trigger trg_debit_lot
  after insert on public.telemetry_events
  referencing new table as nouvelles
  for each statement execute function public.telemetrie_debit_lot();
-- L'ancien plafond par ligne s'en va APRÈS que le nouveau est en place (même transaction).
drop trigger if exists trg_debit_global on public.telemetry_events;

-- ── ④ la purge des compteurs (une heure suffit à la jauge) ───────────────────
do $c$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge_telemetrie_debit';
    perform cron.schedule('purge_telemetrie_debit', '*/15 * * * *',
      $q$delete from public.telemetrie_debit where minute < now() - interval '1 hour'$q$);
  end if;
end
$c$;

-- ── VERDICT : la transaction s'annule si l'état final n'est pas le bon ──────
do $v$
declare r text;
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_debit_lot' and tgrelid = 'public.telemetry_events'::regclass and not tgisinternal) then
    raise exception 'ECHEC : trg_debit_lot absent';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_debit_global' and tgrelid = 'public.telemetry_events'::regclass) then
    raise exception 'ECHEC : l''ancien plafond par ligne est encore là';
  end if;
  if pg_get_functiondef('public.telemetry_pose_identite()'::regprocedure) not like '%new.received_at := now();%' then
    raise exception 'ECHEC : received_at n''est plus posé par le serveur (ASTRA-02)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.telemetrie_debit'::regclass) then
    raise exception 'ECHEC : RLS inactive sur telemetrie_debit';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_any_column_privilege(r, 'public.telemetrie_debit', 'SELECT')
       or has_any_column_privilege(r, 'public.telemetrie_debit', 'INSERT')
       or has_any_column_privilege(r, 'public.telemetrie_debit', 'UPDATE')
       or has_table_privilege(r, 'public.telemetrie_debit', 'DELETE')
       or has_table_privilege(r, 'public.telemetrie_debit', 'TRUNCATE') then
      raise exception 'ECHEC : % touche telemetrie_debit', r;
    end if;
    if has_function_privilege(r, 'public.telemetrie_debit_lot()', 'EXECUTE')
       or has_function_privilege(r, 'public.telemetry_pose_identite()', 'EXECUTE') then
      raise exception 'ECHEC : % exécute une fonction de déclencheur', r;
    end if;
  end loop;
end
$v$;

select 'trg_debit_lot' as controle, 'OK' as verdict, 'un compteur par lot, trois réservoirs (1 800 / 600 / 600), 300 par compte' as detail
union all
select 'received_at', 'OK', 'posé par le serveur (telemetry_pose_identite)'
union all
select 'telemetrie_debit', 'OK', 'service_role seul ; purge horaire';

commit;
