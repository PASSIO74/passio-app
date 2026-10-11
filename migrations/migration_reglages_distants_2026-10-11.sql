-- ═══════════════════════════════════════════════════════════════════════════
-- RÉGLAGES DISTANTS ET AUDIENCE EXACTE (2026-10-11)
--
-- ① `public.reglages_distants` — l'interrupteur que toute la production écoute.
--    Trois lignes au plus (`delestage`, `coupures`, `bandeau`), LUES par chaque
--    appareil toutes les 5 min (js/reglages-distants.js) et ÉCRITES par la
--    seule fonction `pilotage` (clé service_role) : à la main depuis le
--    téléphone, ou par la veille pg_cron quand la charge monte (délestage
--    automatique). Ferme EXP-03 : « aucun interrupteur serveur ne coupe une
--    fonctionnalité chez tout le monde » (docs/RECUPERATION.md).
--    · anon et authenticated : SELECT sur (cle, valeur, maj) SEULEMENT — le
--      motif et l'auteur du geste restent côté pilote ; aucune écriture.
--      ⚠️ Supabase accorde ALL par défaut sur toute nouvelle table de `public`
--      à anon et authenticated : on REVOKE la table, puis on GRANT colonne
--      par colonne (journal serveur-securite-base : on ne retire pas une
--      colonne d'un GRANT de table).
--    · les valeurs sont validées par la fonction (_shared/reglages.js) ET
--      revalidées par le client ; la base borne la forme (clé, auteur, motif).
--
-- ② `public.pilotage_audience(p_secondes)` — comptes, appareils et connexions
--    d'une fenêtre, comptés DISTINCTS en base. Le pilotage lisait des lignes
--    `.limit(5000)` que PostgREST plafonne à 1 000 (max-rows) : au-delà de
--    quelques centaines d'appareils, la jauge « connexions » se figeait sous le
--    mur des 500 qu'elle est censée annoncer. MÊME règle que `compterAudience`
--    (_shared/pilotage.js) pour `comptes` / `appareils` / `hors_public` : un
--    appareil marqué robot / émulation / équipe dans la fenêtre en sort
--    entièrement.
--    ⚠️ `comptes_connectes` et `comptes_5xx_15min` PILOTENT le délestage
--    automatique de TOUTE la production : ils comptent des `auth_uid`
--    distincts — l'identité posée par le trigger serveur depuis le jeton
--    (migration_debit_et_identite_serveur), jamais un `user_id` ni un
--    `device_id` écrits par le client. Un seul compte qui forgerait 500
--    appareils, ou n'importe qui qui forgerait des lignes « 500 » sous la clé
--    anon, n'y pèse donc qu'une fois, ou pas du tout.
--    SECURITY DEFINER, exécutable par service_role SEULEMENT.
--
-- ORDRE : le client et la fonction `pilotage` sont déjà en production et
-- tolèrent l'absence (404 mémorisé 1 h ; 503 nommant ce fichier ; repli par
-- lignes « tronqué »). Appliquer ce fichier les ALLUME, sans redéploiement.
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_reglages_distants_2026-10-11.sql`
--
-- REJOUABLE. RETOUR ARRIÈRE :
--   drop function if exists public.pilotage_audience(integer);
--   drop table if exists public.reglages_distants;
--   (les appareils retombent seuls sur « table absente » : aucun réglage.)
-- BANC : tests/sql/migration-reglages-distants.test.sh
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.reglages_distants (
  cle      text primary key check (cle in ('delestage', 'coupures', 'bandeau')),
  valeur   jsonb not null check (jsonb_typeof(valeur) = 'object' and octet_length(valeur::text) <= 4096),
  pose_par text not null check (pose_par in ('pilote', 'veille')),
  motif    text check (motif is null or char_length(motif) <= 300),
  maj      timestamptz not null default now()
);

alter table public.reglages_distants enable row level security;

revoke all on table public.reglages_distants from public;
revoke all on table public.reglages_distants from anon;
revoke all on table public.reglages_distants from authenticated;
grant select (cle, valeur, maj) on table public.reglages_distants to anon, authenticated;
grant select, insert, update, delete on table public.reglages_distants to service_role;

drop policy if exists reglages_distants_lecture on public.reglages_distants;
create policy reglages_distants_lecture on public.reglages_distants
  for select to anon, authenticated using (true);

create or replace function public.pilotage_audience(p_secondes integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  with f as (
    select greatest(60, least(coalesce(p_secondes, 300), 86400)) as s
  ),
  l as (
    select nullif(t.user_id, '') as user_id, nullif(t.device_id, '') as device_id,
           (coalesce(t.meta->>'trafic', '') in ('robot', 'emulation', 'equipe')
             or (t.platform = 'ios' and coalesce(t.connection, '') <> '')) as hors
      from public.telemetry_events t, f
     where t.env = 'production'
       and t.received_at >= now() - make_interval(secs => f.s)
  ),
  hp as (
    select distinct device_id from l where hors and device_id is not null
  ),
  pub as (
    select l.user_id, l.device_id from l
     where not l.hors
       and (l.device_id is null or not exists (select 1 from hp where hp.device_id = l.device_id))
  )
  select jsonb_build_object(
    'comptes',                (select count(distinct user_id) from pub),
    'appareils',              (select count(distinct device_id) from pub),
    'hors_public',            (select count(*) from hp),
    'comptes_connectes',      (select count(distinct t.auth_uid) from public.telemetry_events t, f
                                 where t.env = 'production' and t.auth_uid is not null
                                   and t.received_at >= now() - make_interval(secs => f.s)),
    'comptes_5xx_15min',      (select count(distinct t.auth_uid) from public.telemetry_events t
                                 where t.env = 'production' and t.type = 'api' and t.http_status >= 500
                                   and t.auth_uid is not null and t.received_at >= now() - interval '15 minutes'),
    'secondes',               (select s from f)
  );
$fn$;

revoke all on function public.pilotage_audience(integer) from public;
revoke all on function public.pilotage_audience(integer) from anon;
revoke all on function public.pilotage_audience(integer) from authenticated;
grant execute on function public.pilotage_audience(integer) to service_role;

-- ─── Verdict : la transaction s'annule si l'état final n'est pas le bon ─────
do $v$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.reglages_distants'::regclass) then
    raise exception 'ECHEC : RLS inactive sur reglages_distants';
  end if;
  if has_table_privilege('anon', 'public.reglages_distants', 'INSERT')
     or has_table_privilege('anon', 'public.reglages_distants', 'UPDATE')
     or has_table_privilege('anon', 'public.reglages_distants', 'DELETE')
     or has_table_privilege('authenticated', 'public.reglages_distants', 'INSERT')
     or has_table_privilege('authenticated', 'public.reglages_distants', 'UPDATE')
     or has_table_privilege('authenticated', 'public.reglages_distants', 'DELETE') then
    raise exception 'ECHEC : un client peut écrire dans reglages_distants';
  end if;
  if has_column_privilege('anon', 'public.reglages_distants', 'motif', 'SELECT')
     or has_column_privilege('authenticated', 'public.reglages_distants', 'pose_par', 'SELECT') then
    raise exception 'ECHEC : motif ou auteur lisible par un client';
  end if;
  if not has_column_privilege('anon', 'public.reglages_distants', 'valeur', 'SELECT') then
    raise exception 'ECHEC : les appareils ne peuvent pas lire les réglages';
  end if;
  if has_function_privilege('anon', 'public.pilotage_audience(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.pilotage_audience(integer)', 'EXECUTE') then
    raise exception 'ECHEC : pilotage_audience est exécutable hors service_role';
  end if;
end
$v$;

select 'reglages_distants' as controle, 'OK' as verdict, 'lecture (cle, valeur, maj) pour tous, écriture service_role seule' as detail
union all
select 'pilotage_audience', 'OK', 'comptage distinct exécutable par service_role seul';

commit;
