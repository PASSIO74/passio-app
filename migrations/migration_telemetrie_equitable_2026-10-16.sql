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
-- CE QUI LE REMPLACE (v2 après contre-revue du 2026-10-16, débits mesurés en
-- production sur 7 jours par le canal ① : comptes anciens 107 lignes/min au
-- pire, un compte seul 107, visiteurs 228) :
--   · un compteur par minute (`telemetrie_debit`, upsert sur clé primaire :
--     coût constant), tenu par un déclencheur PAR INSTRUCTION (un lot
--     PostgREST = une instruction) ;
--   · trois réservoirs classés sur l'identité posée par le serveur
--     (auth.uid() et auth.users, jamais une colonne du client) :
--       `anciens`  : compte confirmé, non anonyme, créé depuis 7 jours — ce
--                    que lit le délestage (`comptes_5xx_15min`) : 1 800/min,
--                    à LUI SEUL — personne d'autre n'y puise ;
--       `neufs`    : tout autre compte ;
--       `anonymes` : la clé anon ;
--     neufs et anonymes partagent 2 400/min, 1 600 au plus chacun : l'un ne
--     peut jamais priver l'autre de 800. Une cloison fixe de 600 chacun
--     aurait étranglé le lancement — tout inscrit de la semaine est « neuf ».
--   · 150 lignes/min par compte (le pire mesuré est 107) : il faut douze
--     comptes de plus de 7 jours pour remplir le réservoir des anciens, et la
--     veille le voit (`saturation_aveugle`, pilotage_audience) ;
--   · 120 lignes au plus par instruction (le client en envoie 60 au plus).
-- Plafond total : 4 200/min au pire (3 000 avant), mais un flot anonyme
-- s'arrête à 1 600 (3 000 avant) et n'enlève plus rien aux comptes.
--
-- LE REFUS EST UN 429, PAS UN 400 (`PT429` : PostgREST répond HTTP 429). Un
-- 400 faisait jeter le lot au client, qui notait aussitôt un `server_reject`
-- et relançait : une boucle au rythme du réseau jusqu'à la minute suivante.
-- Sur 429, js/telemetry.js garde le lot et attend la minute suivante.
-- Un réservoir déjà plein refuse AVANT d'écrire (`trg_debit_avant`) ; sinon
-- le lot est compté après écriture (`trg_debit_lot`) et un dépassement annule
-- l'instruction ET son compteur : insister ne repousse pas la fenêtre.
-- La clé service_role (fonctions Edge, scripts) n'est pas limitée.
--
-- Signal de la Sentinelle (`comptes_echecs_30min`) : il compte les comptes de
-- plus de 24 h, donc aussi ceux de 1 à 7 jours, qui passent par `neufs`. Un
-- flot de comptes neufs peut lui cacher cette cohorte-là, jamais les anciens.
--
-- ⚠️ L'ANCIEN DÉCLENCHEUR IMPOSAIT AUSSI L'HEURE (ASTRA-02) : `received_at`
-- a un DEFAULT now(), pas une valeur forcée, et un client qui l'antidate sort
-- ses lignes de toute fenêtre. Le retirer sans reporter cette garde rouvrait
-- la faille : `telemetry_pose_identite` pose désormais `received_at` ET
-- `auth_uid`, et le verdict l'ÉPROUVE (une ligne antidatée, annulée).
-- `limiter_debit_global` reste en place pour `client_errors`.
--
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_telemetrie_equitable_2026-10-16.sql`
-- REJOUABLE. RETOUR ARRIÈRE :
--   drop trigger if exists trg_debit_avant on public.telemetry_events;
--   drop trigger if exists trg_debit_taille on public.telemetry_events;
--   drop trigger if exists trg_debit_lot on public.telemetry_events;
--   create trigger trg_debit_global before insert on public.telemetry_events
--     for each row execute function public.limiter_debit_global('received_at', '3000');
--   (telemetry_pose_identite garde la pose de l'heure : elle est inoffensive.)
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

-- ── ② les plafonds, en un seul endroit (lus aussi par pilotage_audience) ────
create or replace function public.telemetrie_plafond(p_quoi text)
returns integer language sql immutable set search_path = '' as $$
  select case p_quoi
    when 'anciens'  then 1800   -- réservoir des comptes anciens, à eux seuls
    when 'neufs'    then 1600   -- au plus, pour les comptes neufs…
    when 'anonymes' then 1600   -- … au plus, pour la clé anon…
    when 'autres'   then 2400   -- … et les deux ensemble
    when 'compte'   then 150    -- par compte, quel qu'il soit
    when 'lot'      then 120    -- lignes par instruction (le client en envoie 60 au plus)
  end
$$;
revoke execute on function public.telemetrie_plafond(text) from public, anon, authenticated;

-- Le réservoir de l'appelant, sur l'identité posée par le serveur.
create or replace function public.telemetrie_reservoir()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'anonymes'
    when exists (select 1 from auth.users u
                  where u.id = auth.uid()
                    and u.created_at < now() - interval '7 days'
                    and u.email_confirmed_at is not null
                    and not coalesce(u.is_anonymous, false)) then 'anciens'
    else 'neufs'
  end
$$;
revoke execute on function public.telemetrie_reservoir() from public, anon, authenticated;

-- Un refus de débit : HTTP 429 (PostgREST lit `PT429`), et en indice les
-- secondes qui restent avant la minute suivante.
create or replace function public.telemetrie_refuser(p_quoi text, p_plafond integer)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception 'rate limit: % plein (% lignes/minute)', p_quoi, p_plafond
    using errcode = 'PT429', hint = (60 - floor(extract(second from now())))::integer::text;
end $$;
revoke execute on function public.telemetrie_refuser(text, integer) from public, anon, authenticated;

-- ── ③ le compteur par minute ────────────────────────────────────────────────
create table if not exists public.telemetrie_debit (
  minute    timestamptz not null,
  reservoir text        not null check (reservoir in ('anciens', 'neufs', 'anonymes')),
  source    text        not null check (source = '*' or source ~ '^u:[0-9a-f-]{36}$'),
  n         integer     not null check (n >= 0),
  primary key (minute, reservoir, source)
);
alter table public.telemetrie_debit enable row level security;
revoke all on table public.telemetrie_debit from public, anon, authenticated;
grant select, insert, update, delete on table public.telemetrie_debit to service_role;
comment on table public.telemetrie_debit is
  'Lignes de télémétrie acceptées par minute, par réservoir (source *) et par compte (u:<uid>). Écrite par trg_debit_lot seulement ; lue par pilotage_audience. Purgée au-delà d''une heure (purge_telemetrie_debit).';

-- ── ④ avant toute écriture : un réservoir déjà plein refuse sans rien écrire ─
create or replace function public.telemetrie_debit_avant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  res text;
  m   timestamptz := date_trunc('minute', now());
  v_n integer;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return null;
  end if;
  res := public.telemetrie_reservoir();
  select d.n into v_n from public.telemetrie_debit d where d.minute = m and d.reservoir = res and d.source = '*';
  if coalesce(v_n, 0) >= public.telemetrie_plafond(res) then
    perform public.telemetrie_refuser(res, public.telemetrie_plafond(res));
  end if;
  if res <> 'anciens' then
    select coalesce(sum(d.n), 0) into v_n from public.telemetrie_debit d
     where d.minute = m and d.reservoir in ('neufs', 'anonymes') and d.source = '*';
    if v_n >= public.telemetrie_plafond('autres') then
      perform public.telemetrie_refuser('neufs + anonymes', public.telemetrie_plafond('autres'));
    end if;
  end if;
  if auth.uid() is not null then
    select d.n into v_n from public.telemetrie_debit d
     where d.minute = m and d.reservoir = res and d.source = 'u:' || auth.uid()::text;
    if coalesce(v_n, 0) >= public.telemetrie_plafond('compte') then
      perform public.telemetrie_refuser('compte', public.telemetrie_plafond('compte'));
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.telemetrie_debit_avant() from public, anon, authenticated;
drop trigger if exists trg_debit_avant on public.telemetry_events;
create trigger trg_debit_avant
  before insert on public.telemetry_events
  for each statement execute function public.telemetrie_debit_avant();

-- ── ⑤ une instruction ne dépasse pas 120 lignes ─────────────────────────────
-- Sans cette borne, un tableau de 50 000 lignes était écrit en entier (tas,
-- index, WAL) avant d'être refusé et annulé. Compteur local à la transaction
-- (une requête PostgREST = une transaction).
create or replace function public.telemetrie_taille_lot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k integer;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  k := coalesce(nullif(current_setting('passio.telemetrie_lot', true), ''), '0')::integer + 1;
  perform set_config('passio.telemetrie_lot', k::text, true);
  if k > public.telemetrie_plafond('lot') then
    raise exception 'lot de télémétrie trop gros (plus de % lignes)', public.telemetrie_plafond('lot')
      using errcode = 'PT413';
  end if;
  return new;
end $$;
revoke execute on function public.telemetrie_taille_lot() from public, anon, authenticated;
drop trigger if exists trg_debit_taille on public.telemetry_events;
create trigger trg_debit_taille
  before insert on public.telemetry_events
  for each row execute function public.telemetrie_taille_lot();

-- ── ⑥ après l'écriture : le décompte exact, une fois par instruction ────────
create or replace function public.telemetrie_debit_lot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  k   integer;
  res text;
  m   timestamptz := date_trunc('minute', now());
  v_n integer;
begin
  -- La clé service_role (fonctions Edge, scripts d'exploitation) n'est pas limitée.
  if coalesce(auth.role(), '') = 'service_role' then
    return null;
  end if;
  select count(*) into k from nouvelles;
  if k = 0 then
    return null;
  end if;
  res := public.telemetrie_reservoir();

  insert into public.telemetrie_debit as d (minute, reservoir, source, n) values (m, res, '*', k)
    on conflict (minute, reservoir, source) do update set n = d.n + excluded.n
    returning d.n into v_n;
  if v_n > public.telemetrie_plafond(res) then
    perform public.telemetrie_refuser(res, public.telemetrie_plafond(res));
  end if;
  if res <> 'anciens' then
    select coalesce(sum(d.n), 0) into v_n from public.telemetrie_debit d
     where d.minute = m and d.reservoir in ('neufs', 'anonymes') and d.source = '*';
    if v_n > public.telemetrie_plafond('autres') then
      perform public.telemetrie_refuser('neufs + anonymes', public.telemetrie_plafond('autres'));
    end if;
  end if;
  if auth.uid() is not null then
    insert into public.telemetrie_debit as d (minute, reservoir, source, n) values (m, res, 'u:' || auth.uid()::text, k)
      on conflict (minute, reservoir, source) do update set n = d.n + excluded.n
      returning d.n into v_n;
    if v_n > public.telemetrie_plafond('compte') then
      perform public.telemetrie_refuser('compte', public.telemetrie_plafond('compte'));
    end if;
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

-- ── ⑦ la purge des compteurs (une heure suffit à la veille) ─────────────────
-- Sans pg_cron, le verdict lève : un compteur jamais purgé grossit d'une ligne
-- par compte actif et par minute.
do $c$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'purge_telemetrie_debit';
    perform cron.schedule('purge_telemetrie_debit', '*/15 * * * *',
      $q$delete from public.telemetrie_debit where minute < now() - interval '1 hour'$q$);
  end if;
end
$c$;

-- ── VERDICT : la transaction s'annule si l'état final n'est pas le bon ──────
do $v$
declare
  r      text;
  v_recu timestamptz;
  v_uid  uuid;
  -- Les déclencheurs attendus : nom, type (pg_trigger.tgtype), fonction.
  -- 7 = BEFORE ROW INSERT ; 6 = BEFORE STATEMENT INSERT ; 4 = AFTER STATEMENT INSERT.
  attendu record;
begin
  for attendu in
    select * from (values
      ('trg_telemetry_identite', 7, 'public.telemetry_pose_identite()'),
      ('trg_debit_avant',        6, 'public.telemetrie_debit_avant()'),
      ('trg_debit_taille',       7, 'public.telemetrie_taille_lot()'),
      ('trg_debit_lot',          4, 'public.telemetrie_debit_lot()')
    ) as a(nom, typ, fonction)
  loop
    if not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.telemetry_events'::regclass and not t.tgisinternal
                      and t.tgname = attendu.nom and t.tgenabled = 'O' and t.tgtype = attendu.typ
                      and t.tgfoid = attendu.fonction::regprocedure) then
      raise exception 'ECHEC : déclencheur % absent, désactivé ou mal posé', attendu.nom;
    end if;
  end loop;
  if exists (select 1 from pg_trigger where tgname = 'trg_debit_global' and tgrelid = 'public.telemetry_events'::regclass) then
    raise exception 'ECHEC : l''ancien plafond par ligne est encore là';
  end if;

  -- Sonde : une ligne antidatée et attribuée à un tiers doit ressortir à l'heure
  -- du serveur et sans identité (ASTRA-02 / ASTRA-06). Écrite sous service_role
  -- pour ne pas dépendre de l'état des réservoirs, puis annulée.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    insert into public.telemetry_events (type, received_at, auth_uid)
      values ('verdict_migration', '2000-01-01', gen_random_uuid())
      returning received_at, auth_uid into v_recu, v_uid;
    raise exception using errcode = 'PV001';
  exception when sqlstate 'PV001' then
    null;
  end;
  perform set_config('request.jwt.claim.role', '', true);
  if v_recu is distinct from now() then
    raise exception 'ECHEC : received_at n''est plus posé par le serveur (ASTRA-02)';
  end if;
  if v_uid is not null then
    raise exception 'ECHEC : auth_uid n''est plus posé par le serveur (ASTRA-06)';
  end if;

  if to_regclass('cron.job') is null then
    raise exception 'ECHEC : pg_cron absent — les compteurs ne seraient jamais purgés';
  end if;
  if (select count(*) from cron.job j where j.jobname = 'purge_telemetrie_debit'
        and j.command like '%delete from public.telemetrie_debit where minute < now() - interval ''1 hour''%') <> 1 then
    raise exception 'ECHEC : la purge des compteurs n''est pas planifiée une fois';
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
       or has_function_privilege(r, 'public.telemetrie_debit_avant()', 'EXECUTE')
       or has_function_privilege(r, 'public.telemetrie_taille_lot()', 'EXECUTE')
       or has_function_privilege(r, 'public.telemetry_pose_identite()', 'EXECUTE')
       or has_function_privilege(r, 'public.telemetrie_reservoir()', 'EXECUTE')
       or has_function_privilege(r, 'public.telemetrie_refuser(text, integer)', 'EXECUTE')
       or has_function_privilege(r, 'public.telemetrie_plafond(text)', 'EXECUTE') then
      raise exception 'ECHEC : % exécute une fonction du limiteur', r;
    end if;
  end loop;
end
$v$;

select 'trg_debit_lot' as controle, 'OK' as verdict, 'anciens 1 800 à eux seuls ; neufs + anonymes 2 400 (1 600 chacun) ; 150 par compte ; refus en 429' as detail
union all
select 'trg_debit_avant / trg_debit_taille', 'OK', 'réservoir plein refusé avant écriture ; 120 lignes au plus par instruction'
union all
select 'received_at / auth_uid', 'OK', 'posés par le serveur, éprouvés par une ligne antidatée annulée'
union all
select 'purge_telemetrie_debit', 'OK', 'planifiée toutes les 15 min, rétention 1 h ; compteurs service_role seul';

commit;
