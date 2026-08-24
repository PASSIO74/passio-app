-- CONTROLES POST-MIGRATION de migration_ts_serveur_age_blocage.sql (#136)
--
-- LECTURE SEULE. A executer dans l'editeur SQL Supabase APRES la migration.
--
-- Ce fichier verifie l'ETAT ATTEINT, pas le fait que la migration ait affiche
-- « Success ». Chaque ligne est une frontiere que le lot pretend avoir fermee :
-- si l'une sort en ECHEC, la frontiere correspondante n'existe pas, quel qu'ait
-- ete le message de l'editeur.
--
-- Attendu : toutes les lignes en OK. Toute ligne ECHEC = ne pas activer
-- irl_proposal_v1.

WITH attendus (nom, args) AS (
  VALUES ('is_blocked_with','text'),
         ('irl_interaction_allowed','text'),
         ('is_conversation_creator','text'),
         ('can_join_event_conversation','text'),
         ('declare_birth_year','integer')
),
fn AS (
  SELECT p.proname, p.oid, p.prosecdef, p.proconfig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('is_blocked_with','irl_interaction_allowed','is_conversation_creator',
                       'can_join_event_conversation','declare_birth_year')
),
policies_finales AS (
  SELECT tablename, cmd, policyname
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('conversations','conv_members','conv_messages','user_safety')
)

-- A. La table d'age est privee et non ecrivable par le client.
SELECT 'A. age' AS bloc,
       CASE WHEN to_regclass('public.user_safety') IS NOT NULL THEN 'OK' ELSE 'ECHEC' END AS verdict,
       'table public.user_safety' AS point,
       'Doit exister.' AS detail
UNION ALL
SELECT 'A. age',
       CASE WHEN COALESCE((SELECT c.relrowsecurity FROM pg_catalog.pg_class c
                             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                            WHERE n.nspname='public' AND c.relname='user_safety'), FALSE)
            THEN 'OK' ELSE 'ECHEC' END,
       'RLS active sur user_safety',
       'Sans RLS, la policy SELECT ne filtre rien.'
UNION ALL
SELECT 'A. age',
       CASE WHEN (SELECT COUNT(*) FROM policies_finales
                   WHERE tablename='user_safety' AND cmd <> 'SELECT') = 0
            THEN 'OK' ELSE 'ECHEC' END,
       'aucune policy INSERT/UPDATE/DELETE sur user_safety',
       'L''ecriture ne doit passer que par declare_birth_year.'
UNION ALL
SELECT 'A. age',
       CASE WHEN has_table_privilege('authenticated','public.user_safety','SELECT')
             AND NOT has_table_privilege('authenticated','public.user_safety','INSERT')
             AND NOT has_table_privilege('authenticated','public.user_safety','UPDATE')
             AND NOT has_table_privilege('authenticated','public.user_safety','DELETE')
            THEN 'OK' ELSE 'ECHEC' END,
       'authenticated : SELECT seul sur user_safety',
       'Une policy filtre l''acces, elle ne l''accorde pas : le GRANT compte autant.'
UNION ALL
SELECT 'A. age',
       CASE WHEN NOT has_table_privilege('anon','public.user_safety','SELECT')
            THEN 'OK' ELSE 'ECHEC' END,
       'anon : aucun acces a user_safety',
       'La donnee d''age ne sort jamais vers un visiteur non authentifie.'
UNION ALL
SELECT 'A. age',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                               JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
                              WHERE n.nspname='public' AND p.proname='declare_majority')
            THEN 'OK' ELSE 'ECHEC' END,
       'declare_majority(DATE) supprimee',
       'Si elle survit, le chemin ou le client choisit sa date de majorite existe encore A COTE du nouveau.'
UNION ALL
SELECT 'A. age',
       CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                           JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
                           JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                          WHERE n.nspname='public' AND c.relname='user_safety'
                            AND NOT t.tgisinternal)
            THEN 'OK' ELSE 'ECHEC' END,
       'trigger de non-regression de majority_at',
       'Interdit d''AVANCER la date de majorite, donc de se rendre majeur.'

-- B. Les fonctions de decision : presentes, SECURITY DEFINER, search_path verrouille,
--    et inexecutables par anon.
UNION ALL
SELECT 'B. fonctions', 'ECHEC', 'fonction absente : public.' || a.nom || '(' || a.args || ')',
       'La migration ne s''est pas appliquee entierement.'
  FROM attendus a
 WHERE NOT EXISTS (SELECT 1 FROM fn WHERE fn.proname = a.nom)
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN (SELECT COUNT(*) FROM fn) = 5 THEN 'OK' ELSE 'ECHEC' END,
       'les 5 fonctions du lot sont presentes',
       'is_blocked_with, irl_interaction_allowed, is_conversation_creator, can_join_event_conversation, declare_birth_year.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (SELECT 1 FROM fn WHERE NOT fn.prosecdef) THEN 'OK' ELSE 'ECHEC' END,
       'toutes en SECURITY DEFINER',
       'Sans cela, elles lisent avec les droits de l''appelant et ne peuvent rien decider.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM fn
               WHERE fn.proconfig IS NULL
                  OR NOT (fn.proconfig::text LIKE '%search_path=%')
            ) THEN 'OK' ELSE 'ECHEC' END,
       'search_path verrouille sur chaque fonction',
       'Une fonction SECURITY DEFINER sans search_path fixe est detournable par un schema tiers.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (SELECT 1 FROM fn WHERE has_function_privilege('anon', fn.oid, 'EXECUTE'))
            THEN 'OK' ELSE 'ECHEC' END,
       'anon ne peut executer aucune de ces fonctions',
       'Un visiteur non authentifie ne doit pas pouvoir sonder blocages ni majorite.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (SELECT 1 FROM fn WHERE NOT has_function_privilege('authenticated', fn.oid, 'EXECUTE'))
            THEN 'OK' ELSE 'ECHEC' END,
       'authenticated peut les executer',
       'Prémisse : sans ce droit, tout serait refuse -- pour la mauvaise raison.'

-- C. Les trois verrous de conversation, exactement ceux attendus.
UNION ALL
SELECT 'C. conversations',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM policies_finales
                   WHERE tablename='conversations' AND cmd='INSERT')
                 = ARRAY['conversations_insert_creator']
            THEN 'OK' ELSE 'ECHEC' END,
       'conversations : une seule policy INSERT',
       'Les policies permissives se combinent en OU : en laisser une seconde annule le verrou.'
UNION ALL
SELECT 'C. conversations',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM policies_finales
                   WHERE tablename='conv_members' AND cmd='INSERT')
                 = ARRAY['Ecriture propre']
            THEN 'OK' ELSE 'ECHEC' END,
       'conv_members : une seule policy INSERT',
       'Idem -- c''est le point par lequel on forcait un compte bloque dans une conversation.'
UNION ALL
SELECT 'C. conversations',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM policies_finales
                   WHERE tablename='conv_messages' AND cmd='INSERT')
                 = ARRAY['conv_messages_insert_member']
            THEN 'OK' ELSE 'ECHEC' END,
       'conv_messages : une seule policy INSERT',
       'Empeche l''injection de message par un non-membre qui connait conv_id.'
UNION ALL
SELECT 'C. conversations',
       CASE WHEN NOT has_table_privilege('anon','public.conversations','INSERT')
             AND NOT has_table_privilege('anon','public.conv_members','INSERT')
             AND NOT has_table_privilege('anon','public.conv_messages','INSERT')
            THEN 'OK' ELSE 'ECHEC' END,
       'anon n''ecrit dans aucune des trois tables',
       'Revoque explicitement par la migration.'

ORDER BY 1, 2 DESC, 3;
