-- ═══════════════════════════════════════════════════════════════════════════
-- DURCISSEMENT SÉCURITÉ — issu des advisors Supabase (2026-08-09).
-- Sans changement de comportement applicatif :
--   • l'app ne fait AUCUN appel .rpc() (vérifié) → couper l'accès RPC anon/auth
--     aux fonctions trigger/maintenance ne casse rien (les triggers n'exigent pas
--     l'EXECUTE du rôle déclencheur) ;
--   • les 3 vues d'agrégation ne sont lues par AUCUN code applicatif (seulement le
--     dashboard en service_role, qui ignore la RLS) → security_invoker sûr ;
--   • search_path épinglé = anti-hijack de résolution de noms.
-- On NE TOUCHE PAS post_is_visible / can_edit_post / comment_target_visible :
-- elles sont appelées DANS des policies RLS → authenticated a besoin de l'EXECUTE.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Fonctions trigger / maintenance : plus d'exécution RPC par anon/authenticated.
--    ⚠️ Il faut révoquer PUBLIC aussi (sinon anon/authenticated héritent via PUBLIC).
--    Les triggers continuent de tourner : Postgres n'exige PAS l'EXECUTE du rôle
--    déclencheur. service_role garde purge_telemetry (maintenance/cron éventuel).
REVOKE EXECUTE ON FUNCTION public.purge_telemetry(integer)               FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_telemetry(integer)               TO service_role;
REVOKE EXECUTE ON FUNCTION public.rate_limit_insert()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_conv_message_to_users()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.posts_freeze_author()                  FROM PUBLIC, anon, authenticated;

-- 2) search_path épinglé (advisor 0011). posts_freeze_author ne référence aucune
--    table (NEW/OLD only) → search_path vide sûr.
ALTER FUNCTION public.posts_freeze_author() SET search_path = '';

--    purge_telemetry : on qualifie la table et on vide le search_path (forme sûre
--    pour une SECURITY DEFINER). CREATE OR REPLACE préserve les privilèges déjà
--    révoqués ci-dessus, mais on re-révoque par prudence.
CREATE OR REPLACE FUNCTION public.purge_telemetry(keep_days integer DEFAULT 30)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.telemetry_events
  WHERE received_at < now() - (keep_days || ' days')::interval;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END
$function$;
REVOKE EXECUTE ON FUNCTION public.purge_telemetry(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_telemetry(integer) TO service_role;

-- 3) Vues d'agrégation : SECURITY DEFINER → INVOKER (advisor 0010). Respectent la
--    RLS du lecteur ; le dashboard (service_role) reste inchangé.
ALTER VIEW public.telemetry_last24h      SET (security_invoker = on);
ALTER VIEW public.client_errors_top_24h  SET (security_invoker = on);
ALTER VIEW public.client_errors_par_heure SET (security_invoker = on);
