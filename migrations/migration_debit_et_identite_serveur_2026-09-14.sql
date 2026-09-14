-- ═══════════════════════════════════════════════════════════════════════════
-- DÉBIT ET IDENTITÉ POSÉS PAR LE SERVEUR (ASTRA-02 / ASTRA-06, contre-revue
-- Astra, 2026-09-14)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012),
-- UNE transaction, REJOUABLE, tableau de verdict en fin (4 lignes).
-- Aucun ordre de déploiement : le client ne change pas, les deux gardes sont
-- transparentes pour un client honnête.
--
-- ① ASTRA-02 — LE PLAFOND GLOBAL COMPTAIT DES DATES FOURNIES PAR LE CLIENT.
--    `limiter_debit_global` (ouverture publique) compte les lignes dont la
--    colonne de temps est dans la dernière minute — mais cette colonne
--    (`client_errors.created_at`, `telemetry_events.received_at`) a un DEFAULT
--    now(), pas une valeur imposée : un client qui l'ANTIDATE sort ses lignes
--    de la fenêtre au moment même où elles entrent, et le plafond ne borne
--    plus rien. Le trigger POSE désormais la date lui-même avant de compter.
--
-- ② ASTRA-06 — LA TÉLÉMÉTRIE N'AVAIT PAS D'IDENTITÉ SERVEUR.
--    `client_errors.auth_uid` est posé par un trigger depuis le 2026-09-10 ;
--    `telemetry_events` n'a que `user_id`, écrit par le client — et la
--    Sentinelle (famille API) s'en servait pour compter des « comptes ».
--    Même mécanique : colonne `auth_uid`, posée par le serveur, non écrivable
--    par le client (un trigger voit la ligne avant qu'elle n'existe et ne se
--    contourne par aucun grant). NULL pour un visiteur.
--
-- Le détecteur (`scripts/sentinelle-detecter.mjs`, `lireApi`) préfère
-- `auth_uid` dès que la colonne existe et retombe sur `user_id` sinon — il
-- est déployable AVANT ce coller, et ce coller est collable AVANT lui.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── ① le plafond global compte l'heure du SERVEUR ────────────────────────
create or replace function public.limiter_debit_global()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  col_temps   text := TG_ARGV[0];
  max_par_min int  := TG_ARGV[1]::int;
  cnt         int;
begin
  -- ASTRA-02 : la date est celle du serveur, quoi que le client ait envoyé.
  -- `json_populate_record` réécrit UNE colonne de NEW sans connaître la table.
  new := json_populate_record(new, json_build_object(col_temps, now()));
  execute format('select count(*) from %I.%I where %I > now() - interval ''1 minute''',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME, col_temps) into cnt;
  if cnt >= max_par_min then
    raise exception 'rate limit: plafond global de % insertions/minute atteint sur %', max_par_min, TG_TABLE_NAME
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.limiter_debit_global() from public, anon, authenticated;

-- ── ② la télémétrie porte l'identité que le serveur connaît ─────────────
alter table public.telemetry_events add column if not exists auth_uid uuid;
create or replace function public.telemetry_pose_identite()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.auth_uid := auth.uid();   -- NULL pour un visiteur, l'identité réelle sinon
  return new;
end $$;
revoke execute on function public.telemetry_pose_identite() from public, anon, authenticated;
drop trigger if exists trg_telemetry_identite on public.telemetry_events;
create trigger trg_telemetry_identite
  before insert on public.telemetry_events
  for each row execute function public.telemetry_pose_identite();
comment on column public.telemetry_events.auth_uid is
  'Identité posée par le serveur (trigger), jamais par le client. NULL = visiteur. Seule colonne d''identité fiable pour la Sentinelle (ASTRA-06).';
-- La colonne n'est pas modifiable par le client : aucune policy UPDATE n'existe
-- sur cette table pour anon/authenticated (mesuré le 2026-09-14) ; le trigger
-- l'écrase de toute façon à l'insertion.

-- ── VERDICT ───────────────────────────────────────────────────────────────
with v(ordre, correctif, ok) as (
  select 1, '① limiter_debit_global pose la date serveur avant de compter',
         pg_get_functiondef('public.limiter_debit_global()'::regprocedure) like '%json_populate_record(new, json_build_object(col_temps, now()))%'
  union all select 2, '① les deux triggers de débit sont toujours en place',
         (select count(*) from pg_trigger where tgname = 'trg_debit_global' and not tgisinternal) = 2
  union all select 3, '② telemetry_events.auth_uid existe',
         exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'telemetry_events' and column_name = 'auth_uid')
  union all select 4, '② trigger d''identité posé sur telemetry_events',
         exists (select 1 from pg_trigger where tgname = 'trg_telemetry_identite' and not tgisinternal)
)
select ordre, correctif, case when ok then 'OK' else 'ECHEC' end as verdict
from v order by ordre;

commit;
