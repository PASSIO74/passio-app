-- ═══════════════════════════════════════════════════════════════════════════
-- PILOTAGE — LA VEILLE QUI SONNE LE TÉLÉPHONE, ET LES MESURES DE CAPACITÉ
-- (2026-09-28)
--
-- ① `pg_cron` appelle toutes les 5 minutes la fonction Edge `pilotage` avec
--    { action: "veille" }. Elle évalue la production (erreurs, 5xx, enquêtes,
--    déploiement, disponibilité du site) et n'envoie une notification aux
--    appareils de l'éditeur QUE sur un changement qui compte (passage au rouge,
--    site injoignable, retour à la normale, rappel toutes les 6 h si ça dure).
--    Pourquoi pg_cron et pas GitHub : un cron GitHub est une DEMANDE servie à
--    41 % avec des trous de 4 à 5 h (mesuré le 2026-09-09) ; pg_cron tient la
--    minute. L'appel porte la clé ANON (publique, déjà dans l'application) :
--    la veille ne rend que des agrégats et est plafonnée à 1/min côté fonction.
--
-- ② `pilotage_mesures()` rend la taille de la base et du stockage par seau,
--    pour les jauges de capacité. SECURITY DEFINER, EXÉCUTABLE PAR service_role
--    SEULEMENT — ni anon ni authenticated (Supabase accorde EXECUTE par grants
--    NOMINATIFS : un `revoke … from public` seul ne fermerait rien).
--
-- ORDRE : la fonction Edge est déployée à la fusion (edge-functions.yml) ;
-- appliquer CE fichier ensuite (SQL Editor, canal ③ d'ADR-012). Dans l'autre
-- sens, pg_cron appellerait une fonction qui ne connaît pas « veille » : sans
-- danger (réponse 401/400), mais inutile.
--
-- REJOUABLE : l'ancienne planification est retirée avant d'être reposée.
-- RETOUR ARRIÈRE :
--   select cron.unschedule('pilotage_veille');
--   drop function if exists public.pilotage_mesures();
-- BANC : tests/sql/migration-pilotage-veille.test.sh
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.pilotage_mesures()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'base_octets', pg_database_size(current_database()),
    'stockage', coalesce((
      select jsonb_object_agg(s.bucket_id, s.octets)
        from (select o.bucket_id, sum(coalesce((o.metadata->>'size')::bigint, 0)) as octets
                from storage.objects o group by o.bucket_id) s
    ), '{}'::jsonb)
  );
$fn$;

revoke all on function public.pilotage_mesures() from public;
revoke all on function public.pilotage_mesures() from anon;
revoke all on function public.pilotage_mesures() from authenticated;
grant execute on function public.pilotage_mesures() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'pilotage_veille';
select cron.schedule(
  'pilotage_veille',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://njkiyoklssvefstljemx.supabase.co/functions/v1/pilotage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qa2l5b2tsc3N2ZWZzdGxqZW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTc3MDQsImV4cCI6MjA5NDI3MzcwNH0.wbFAexVW75vlXZ7mRRxeZ28zKevOAYYe0lda0F22dTM'
      ),
      body := jsonb_build_object('action', 'veille'),
      timeout_milliseconds := 30000
    );
  $job$
);

-- ─── Verdict : la transaction s'annule si l'état final n'est pas le bon ─────
do $v$
begin
  if (select count(*) from cron.job where jobname = 'pilotage_veille') <> 1 then
    raise exception 'ECHEC : la veille n''est pas planifiée une fois exactement';
  end if;
  if has_function_privilege('anon', 'public.pilotage_mesures()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.pilotage_mesures()', 'EXECUTE') then
    raise exception 'ECHEC : pilotage_mesures est exécutable hors service_role';
  end if;
end
$v$;

select 'OK' as verdict, 'veille planifiée toutes les 5 min, mesures réservées à service_role' as detail;

commit;
