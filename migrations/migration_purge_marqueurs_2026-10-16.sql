-- ═══════════════════════════════════════════════════════════════════════════
-- PURGE PLANIFIÉE DES MARQUEURS DE SUPPRESSION (RES-02, 2026-10-16)
--
-- `public.comptes_en_suppression` garde la trace de chaque suppression de
-- compte (uid, statut, jeton, dates) ; `purger_marqueurs_suppression(interval)`
-- (migration_barriere_suppression_2026-09-15) retire les marqueurs
-- `supprimee` plus vieux que l'intervalle et refuse tout intervalle < 30 jours
-- (les sauvegardes vivent 30 jours). Aucune planification ne l'appelait : un
-- uid supprimé restait lisible par service_role sans limite de temps.
--
-- La raison du maintien était « pg_cron non mesuré sur la cible » : mesuré le
-- 2026-10-16 par le canal ① — pg_cron 1.6.4 installé, cinq tâches en service
-- (purges de télémétrie, d'erreurs, d'analytics, d'invitations d'appel ; la
-- veille du pilotage).
--
-- Rétention : 45 jours = 30 jours de sauvegardes + marge (proposition de
-- docs/EDGE_FUNCTION_DELETE_ACCOUNT.md, « Rétention du marqueur »).
-- `planifier_purge_marqueurs()` (service_role seul) pose ou repose la tâche :
-- rejouable, et l'objet que le registre des résidus attendait (RES-02).
--
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_purge_marqueurs_2026-10-16.sql`
-- REJOUABLE. RETOUR ARRIÈRE :
--   select cron.unschedule('purge_marqueurs_suppression');
--   drop function if exists public.planifier_purge_marqueurs();
-- BANC : tests/sql/migration-purge-marqueurs.test.sh
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.planifier_purge_marqueurs()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'purge_marqueurs_suppression';
  perform cron.schedule('purge_marqueurs_suppression', '41 3 * * *',
    $q$select public.purger_marqueurs_suppression(interval '45 days')$q$);
  return 'purge_marqueurs_suppression : chaque jour à 03:41 UTC, rétention 45 jours';
end $$;
revoke execute on function public.planifier_purge_marqueurs() from public, anon, authenticated;
grant execute on function public.planifier_purge_marqueurs() to service_role;

select public.planifier_purge_marqueurs() as planification;

-- ── VERDICT ─────────────────────────────────────────────────────────────────
do $v$
begin
  -- pg_cron ne valide pas la commande à la planification : une fonction absente
  -- échouerait chaque nuit dans cron.job_run_details, que rien ne lit.
  if to_regprocedure('public.purger_marqueurs_suppression(interval)') is null then
    raise exception 'ECHEC : purger_marqueurs_suppression(interval) absente — migration_barriere_suppression non appliquée ?';
  end if;
  if (select count(*) from cron.job where jobname = 'purge_marqueurs_suppression') <> 1 then
    raise exception 'ECHEC : la tâche purge_marqueurs_suppression n''est pas planifiée une fois';
  end if;
  if (select command from cron.job where jobname = 'purge_marqueurs_suppression') not like '%purger_marqueurs_suppression(interval ''45 days'')%' then
    raise exception 'ECHEC : la tâche n''appelle pas purger_marqueurs_suppression(45 jours)';
  end if;
  if not (select j.active from cron.job j where j.jobname = 'purge_marqueurs_suppression') then
    raise exception 'ECHEC : la tâche purge_marqueurs_suppression est désactivée';
  end if;
  if has_function_privilege('anon', 'public.planifier_purge_marqueurs()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.planifier_purge_marqueurs()', 'EXECUTE') then
    raise exception 'ECHEC : un client peut replanifier la purge';
  end if;
end
$v$;

select 'purge_marqueurs_suppression' as controle, 'OK' as verdict, 'planifiée chaque jour, rétention 45 jours ; planification réservée à service_role' as detail;

commit;
