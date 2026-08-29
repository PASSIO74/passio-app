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

-- ⚠️ La SIGNATURE fait partie de l'attendu, pas seulement le nom. Filtrer sur
-- `proname` seul laisserait une surcharge de mauvais type -- disons
-- is_blocked_with(uuid) -- satisfaire « fonction presente » pendant que la
-- fonction reellement appelee par les policies, celle en (text), manque.
-- (Defaut releve en contre-revue independante, PR #147.)
WITH attendus (nom, args) AS (
  VALUES ('is_blocked_with','_other text'),
         ('irl_interaction_allowed','_other text'),
         ('is_conversation_creator','_conv_id text'),
         ('can_join_event_conversation','_conv_id text'),
         ('declare_birth_year','_birth_year integer')
),
fn AS (
  SELECT p.proname, p.oid, p.prosecdef, p.proconfig,
         pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN (VALUES ('is_blocked_with','_other text'),
                 ('irl_interaction_allowed','_other text'),
                 ('is_conversation_creator','_conv_id text'),
                 ('can_join_event_conversation','_conv_id text'),
                 ('declare_birth_year','_birth_year integer')) AS att(nom, args)
      ON att.nom = p.proname
     AND att.args = pg_catalog.pg_get_function_identity_arguments(p.oid)
   WHERE n.nspname = 'public'
),
-- ⚠️ Le NOM d'une policy ne prouve rien de ce qu'elle autorise : une policy
-- homonyme avec `WITH CHECK (true)` laisse le tableau des noms intact et ouvre
-- la frontiere en grand. On rapatrie donc aussi le mode, les roles et
-- l'expression, controles plus bas. (Defaut releve en contre-revue, PR #147.)
policies_finales AS (
  SELECT tablename, cmd, policyname, permissive, roles::text AS roles,
         COALESCE(with_check, '') AS with_check
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('conversations','conv_members','conv_messages','user_safety')
),
-- Ce que chaque policy INSERT doit REELLEMENT contenir. On ne compare pas la
-- chaine entiere : sa normalisation par PostgreSQL varie d'une version a
-- l'autre, et un controle qui rougit sur une prod saine finit par etre ignore.
-- On exige donc la presence de chaque predicat porteur de la frontiere, et
-- l'absence d'un `true` qui les annulerait tous.
exigences (tablename, policyname, jeton) AS (
  VALUES ('conversations','conversations_insert_creator','created_by ='),
         ('conversations','conversations_insert_creator','auth.uid()'),
         ('conv_members','Ecriture propre','is_conversation_creator'),
         ('conv_members','Ecriture propre','can_join_event_conversation'),
         ('conv_members','Ecriture propre','is_blocked_with'),
         ('conv_messages','conv_messages_insert_member','from_id ='),
         ('conv_messages','conv_messages_insert_member','is_conv_member')
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
       -- ⚠️ « un trigger utilisateur existe sur user_safety » ne prouve rien :
       -- n'importe quel trigger sans rapport satisfaisait ce controle. On exige
       -- LE trigger attendu, ACTIF (`tgenabled <> 'D'`), sur SA fonction, et
       -- pose BEFORE UPDATE FOR EACH ROW -- un AFTER ne peut rien refuser, et un
       -- trigger desactive ne s'execute jamais.
       -- (Defaut releve en contre-revue independante, PR #147.)
       CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                           JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
                           JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                           JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid
                          WHERE n.nspname='public' AND c.relname='user_safety'
                            AND NOT t.tgisinternal
                            AND t.tgname = 'trg_user_safety_majorite'
                            AND t.tgenabled <> 'D'
                            AND f.proname = 'user_safety_majorite_non_avancable'
                            AND (t.tgtype & 1) = 1     -- FOR EACH ROW
                            AND (t.tgtype & 2) = 2     -- BEFORE
                            AND (t.tgtype & 16) = 16)  -- UPDATE
            THEN 'OK' ELSE 'ECHEC' END,
       'trigger trg_user_safety_majorite actif, BEFORE UPDATE, sur sa fonction',
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
                  -- ⚠️ La VALEUR, pas la presence. `SET search_path = public` porte
                  -- lui aussi la chaine « search_path= » : le controle precedent le
                  -- declarait OK alors que c'est exactement la configuration
                  -- detournable qu'il pretendait exclure -- un schema tiers place
                  -- devant `public` capture les appels non qualifies. PostgreSQL
                  -- stocke `SET search_path = ''` sous la forme `search_path=""`.
                  -- (Defaut releve en contre-revue independante, PR #147.)
                  OR NOT ('search_path=""' = ANY(fn.proconfig) OR 'search_path=' = ANY(fn.proconfig))
            ) THEN 'OK' ELSE 'ECHEC' END,
       'search_path verrouille a la chaine VIDE sur chaque fonction',
       'Seul search_path = '''' convient : toute autre valeur laisse un schema tiers capturer les appels non qualifies.'
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
-- Le nom et le nombre etant acquis ci-dessus, on controle maintenant CE QUE LA
-- POLICY AUTORISE. Sans ces trois lignes, une policy homonyme en
-- `WITH CHECK (true)` -- ou ouverte a `public` -- laissait tout le bloc C en OK.
UNION ALL
SELECT 'C. conversations',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM policies_finales pf
               WHERE pf.cmd = 'INSERT'
                 AND pf.tablename IN ('conversations','conv_members','conv_messages')
                 AND (pf.permissive <> 'PERMISSIVE' OR pf.roles <> '{authenticated}')
            ) THEN 'OK' ELSE 'ECHEC' END,
       'les trois policies INSERT sont permissives et reservees a authenticated',
       'Une policy ouverte a public s''applique aussi a anon ; une restrictive change le sens du OU.'
UNION ALL
SELECT 'C. conversations',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM policies_finales pf
               WHERE pf.cmd = 'INSERT'
                 AND pf.tablename IN ('conversations','conv_members','conv_messages')
                 AND (pf.with_check = '' OR btrim(lower(pf.with_check), '() ') = 'true')
            ) THEN 'OK' ELSE 'ECHEC' END,
       'aucune policy INSERT n''a un WITH CHECK vide ou toujours vrai',
       'Le cas exact du faux vert : meme nom, meme compte, frontiere ouverte.'
UNION ALL
SELECT 'C. conversations',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM exigences e
               WHERE NOT EXISTS (
                 SELECT 1 FROM policies_finales pf
                  WHERE pf.cmd = 'INSERT'
                    AND pf.tablename = e.tablename
                    AND pf.policyname = e.policyname
                    AND position(e.jeton IN pf.with_check) > 0)
            ) THEN 'OK' ELSE 'ECHEC' END,
       'chaque policy INSERT porte encore tous ses predicats',
       'createur pour conversations ; createur/participant + non-blocage pour conv_members ; auteur + membre pour conv_messages.'
UNION ALL
SELECT 'C. conversations',
       CASE WHEN NOT has_table_privilege('anon','public.conversations','INSERT')
             AND NOT has_table_privilege('anon','public.conv_members','INSERT')
             AND NOT has_table_privilege('anon','public.conv_messages','INSERT')
            THEN 'OK' ELSE 'ECHEC' END,
       'anon n''ecrit dans aucune des trois tables',
       'Revoque explicitement par la migration.'

ORDER BY 1, 2 DESC, 3;
