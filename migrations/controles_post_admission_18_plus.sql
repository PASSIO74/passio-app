-- CONTROLES POST-MIGRATION de migration_admission_18_plus.sql (admission 18+)
--
-- LECTURE SEULE. A executer dans l'editeur SQL Supabase APRES la migration,
-- et a nouveau apres chaque bascule de l'interrupteur.
--
-- Ce fichier verifie l'ETAT ATTEINT, pas le fait que la migration ait affiche
-- « Success ». Chaque ligne est une frontiere que le lot pretend avoir posee :
-- si l'une sort en ECHEC, la frontiere correspondante n'existe pas.
--
-- Attendu : toutes les lignes en OK, plus une ligne INFO qui dit si
-- l'interrupteur est allume. Toute ligne ECHEC = ne pas allumer.
--
-- Memes lecons que les controles de #136 (contre-revue PR #147) : la SIGNATURE
-- fait partie de l'attendu ; le NOM d'une policy ne prouve rien de ce qu'elle
-- autorise, on lit ses predicats ; `search_path` doit valoir la chaine VIDE.
WITH attendus (nom, args, exec_auth) AS (
  VALUES ('adult_access_enforced', '', FALSE),
         ('is_adult_declared', '', FALSE),
         ('adult_access_allowed', '', TRUE),
         ('adult_access_status', '', TRUE),
         ('can_join_event_conversation', '_conv_id text', TRUE)
),
fn AS (
  SELECT att.nom, att.exec_auth, p.oid, p.prosecdef, p.proconfig, p.provolatile
    FROM attendus att
    JOIN pg_catalog.pg_proc p ON p.proname = att.nom
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = att.args
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
),
policies_finales AS (
  SELECT tablename, cmd, policyname, permissive, roles::text AS roles,
         COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS with_check
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('events', 'event_attendees', 'access_policies')
),
-- Les predicats porteurs de la frontiere. Chaque jeton doit etre PRESENT dans
-- l'expression normalisee par PostgreSQL ; un `true` isole les annulerait tous.
-- ⚠️ La colonne `cible` dit DANS QUELLE expression chercher : tout chercher dans
-- `with_check` laissait le `USING` deriver sans qu'aucune ligne ne le dise — et
-- un `USING (true)` sur l'UPDATE d'`event_attendees` permettrait de s'APPROPRIER
-- l'inscription d'autrui (releve en revue adversariale, 2026-09-08).
exigences (tablename, cmd, policyname, cible, jeton) AS (
  VALUES ('events', 'INSERT', 'events_insert_author_adult', 'check', 'author_id ='),
         ('events', 'INSERT', 'events_insert_author_adult', 'check', 'auth.uid()'),
         ('events', 'INSERT', 'events_insert_author_adult', 'check', 'adult_access_allowed()'),
         ('event_attendees', 'INSERT', 'event_attendees_insert_own_adult', 'check', 'user_id ='),
         ('event_attendees', 'INSERT', 'event_attendees_insert_own_adult', 'check', 'auth.uid()'),
         ('event_attendees', 'INSERT', 'event_attendees_insert_own_adult', 'check', 'adult_access_allowed()'),
         ('event_attendees', 'INSERT', 'event_attendees_insert_own_adult', 'check', '''declined'''),
         ('event_attendees', 'UPDATE', 'event_attendees_update_own_adult', 'check', 'user_id ='),
         ('event_attendees', 'UPDATE', 'event_attendees_update_own_adult', 'check', 'adult_access_allowed()'),
         ('event_attendees', 'UPDATE', 'event_attendees_update_own_adult', 'check', '''declined'''),
         ('event_attendees', 'UPDATE', 'event_attendees_update_own_adult', 'using', 'user_id ='),
         ('event_attendees', 'UPDATE', 'event_attendees_update_own_adult', 'using', 'auth.uid()')
),
-- Les triggers sans lesquels l'exception « declined » devient une porte : un
-- WITH CHECK ne voit que la ligne FINALE, jamais l'ancienne.
triggers_attendus (tbl, trg, fonction) AS (
  VALUES ('event_attendees', 'trg_event_attendees_admission', 'event_attendees_admission_gardee'),
         ('events', 'trg_events_admission', 'events_admission_gardee')
)

-- A. L'interrupteur : present, prive, une ligne, et son etat (INFO).
SELECT 'A. interrupteur' AS bloc,
       CASE WHEN to_regclass('public.access_policies') IS NOT NULL THEN 'OK' ELSE 'ECHEC' END AS verdict,
       'table public.access_policies' AS point,
       'Doit exister.' AS detail
UNION ALL
SELECT 'A. interrupteur',
       CASE WHEN COALESCE((SELECT c.relrowsecurity FROM pg_catalog.pg_class c
                             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                            WHERE n.nspname = 'public' AND c.relname = 'access_policies'), FALSE)
            THEN 'OK' ELSE 'ECHEC' END,
       'RLS active sur access_policies', 'Defense en profondeur derriere les GRANTs.'
UNION ALL
SELECT 'A. interrupteur',
       CASE WHEN to_regclass('public.access_policies') IS NOT NULL
             AND NOT has_table_privilege('anon', 'public.access_policies', 'SELECT')
             AND NOT has_table_privilege('authenticated', 'public.access_policies', 'SELECT')
             AND NOT has_table_privilege('authenticated', 'public.access_policies', 'INSERT')
             AND NOT has_table_privilege('authenticated', 'public.access_policies', 'UPDATE')
             AND NOT has_table_privilege('authenticated', 'public.access_policies', 'DELETE')
            THEN 'OK' ELSE 'ECHEC' END,
       'anon et authenticated : aucun droit sur access_policies',
       'Le client ne BASCULE pas l''interrupteur, et n''en lit pas la table. Il en connait le verdict LE CONCERNANT par adult_access_status(), ce qui est voulu — l''etat de la regle n''est pas un secret.'
UNION ALL
SELECT 'A. interrupteur',
       CASE WHEN (SELECT COUNT(*) FROM policies_finales WHERE tablename = 'access_policies') = 0
            THEN 'OK' ELSE 'ECHEC' END,
       'aucune policy sur access_policies',
       'Une policy ouvrirait un chemin aux roles clients ; la table est reservee a postgres et service_role.'
UNION ALL
SELECT 'A. interrupteur',
       CASE WHEN EXISTS (SELECT 1 FROM public.access_policies p WHERE p.key = 'irl_adult_only')
            THEN 'OK' ELSE 'ECHEC' END,
       'ligne irl_adult_only presente',
       'Ligne absente = admission EXIGEE (fail-closed) : ce serait un allumage par accident, pas une extinction.'
UNION ALL
SELECT 'A. interrupteur', 'INFO',
       'irl_adult_only = ' || COALESCE((SELECT CASE WHEN p.enabled THEN 'ALLUME' ELSE 'eteint' END
                                          FROM public.access_policies p WHERE p.key = 'irl_adult_only'), 'ABSENT'),
       'Eteint : aucun changement pour les comptes. Allume : majorite declaree exigee pour organiser, s''inscrire, rejoindre la conversation.'

-- B. Les fonctions : presentes avec leur signature, SECURITY DEFINER, STABLE,
--    search_path vide, anon jamais, authenticated selon le contrat.
UNION ALL
SELECT 'B. fonctions', 'ECHEC', 'fonction absente : public.' || a.nom || '(' || a.args || ')',
       'La migration ne s''est pas appliquee entierement.'
  FROM attendus a
 WHERE NOT EXISTS (SELECT 1 FROM fn WHERE fn.nom = a.nom)
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN (SELECT COUNT(*) FROM fn) = 5 THEN 'OK' ELSE 'ECHEC' END,
       'les 5 fonctions du lot sont presentes',
       'adult_access_enforced, is_adult_declared, adult_access_allowed, adult_access_status, can_join_event_conversation.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (SELECT 1 FROM fn WHERE NOT fn.prosecdef) THEN 'OK' ELSE 'ECHEC' END,
       'toutes en SECURITY DEFINER',
       'Sans cela elles lisent avec les droits de l''appelant, qui ne voit ni user_safety d''autrui ni access_policies.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (SELECT 1 FROM fn WHERE fn.provolatile <> 's') THEN 'OK' ELSE 'ECHEC' END,
       'toutes STABLE',
       'Une policy appelee par ligne ne doit pas etre VOLATILE ; IMMUTABLE mentirait (elles lisent des tables).'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM fn
               WHERE fn.proconfig IS NULL
                  OR NOT ('search_path=""' = ANY(fn.proconfig) OR 'search_path=' = ANY(fn.proconfig))
            ) THEN 'OK' ELSE 'ECHEC' END,
       'search_path verrouille a la chaine VIDE sur chaque fonction',
       'Toute autre valeur laisse un schema tiers capturer les appels non qualifies.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (SELECT 1 FROM fn WHERE has_function_privilege('anon', fn.oid, 'EXECUTE'))
            THEN 'OK' ELSE 'ECHEC' END,
       'anon n''execute aucune de ces fonctions',
       'Un visiteur sans compte ne sonde ni l''interrupteur ni la majorite.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN NOT EXISTS (SELECT 1 FROM fn
                              WHERE has_function_privilege('authenticated', fn.oid, 'EXECUTE') <> fn.exec_auth)
            THEN 'OK' ELSE 'ECHEC' END,
       'authenticated : EXECUTE sur allowed/status/can_join seulement',
       'adult_access_enforced et is_adult_declared sont des aides internes : les policies les atteignent par le definer, pas le client.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'can_join_event_conversation'
                 AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%adult_access_allowed()%'
                 AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%is_blocked_with%'
                 AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%''evgrp_''%'
            ) THEN 'OK' ELSE 'ECHEC' END,
       'can_join_event_conversation exige l''admission ET garde les preuves de #136',
       'Un compte non admis ne rejoint pas la conversation d''une rencontre, meme inscrit avant l''allumage.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'adult_access_enforced'
                 AND pg_catalog.pg_get_functiondef(p.oid) ~* 'COALESCE\s*\(\(?\s*SELECT[^)]*\)\s*,\s*TRUE\s*\)'
            ) THEN 'OK' ELSE 'ECHEC' END,
       'adult_access_enforced est fail-closed (ligne absente = TRUE)',
       'Supprimer la ligne d''interrupteur doit EXIGER l''admission, jamais l''ouvrir.'
UNION ALL
SELECT 'B. fonctions',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'is_adult_declared'
                 AND pg_catalog.pg_get_functiondef(p.oid) ~* 'COALESCE\s*\(\(?\s*SELECT[^)]*majority_at\s*<=\s*CURRENT_DATE'
                 AND pg_catalog.pg_get_functiondef(p.oid) ~* 'FALSE\s*\)'
            ) THEN 'OK' ELSE 'ECHEC' END,
       'is_adult_declared est fail-closed (pas de ligne = FALSE)',
       'Age inconnu = non admis.'

-- C. Les policies IRL : exactement celles attendues, reservees a authenticated,
--    portant leurs predicats, sans `true`.
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM policies_finales
                   WHERE tablename = 'events' AND cmd = 'INSERT')
                 = ARRAY['events_insert_author_adult']
            THEN 'OK' ELSE 'ECHEC' END,
       'events : une seule policy INSERT',
       'Les policies permissives se combinent en OU : en laisser une seconde annule la garde.'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM policies_finales
                   WHERE tablename = 'event_attendees' AND cmd = 'INSERT')
                 = ARRAY['event_attendees_insert_own_adult']
            THEN 'OK' ELSE 'ECHEC' END,
       'event_attendees : une seule policy INSERT', 'Idem.'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM policies_finales
                   WHERE tablename = 'event_attendees' AND cmd = 'UPDATE')
                 = ARRAY['event_attendees_update_own_adult']
            THEN 'OK' ELSE 'ECHEC' END,
       'event_attendees : une seule policy UPDATE',
       'C''est par un UPDATE qu''une inscription retiree redeviendrait « going ».'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM policies_finales pf
               WHERE pf.policyname IN ('events_insert_author_adult', 'event_attendees_insert_own_adult', 'event_attendees_update_own_adult')
                 AND (pf.permissive <> 'PERMISSIVE' OR pf.roles <> '{authenticated}')
            ) THEN 'OK' ELSE 'ECHEC' END,
       'les trois policies sont permissives et reservees a authenticated',
       'Une policy ouverte a public s''applique aussi a anon.'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM policies_finales pf
               WHERE pf.policyname IN ('events_insert_author_adult', 'event_attendees_insert_own_adult', 'event_attendees_update_own_adult')
                 AND (pf.with_check = '' OR btrim(lower(pf.with_check), '() ') = 'true')
            ) THEN 'OK' ELSE 'ECHEC' END,
       'aucune policy d''admission n''a un WITH CHECK vide ou toujours vrai',
       'Le faux vert classique : meme nom, frontiere ouverte.'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM exigences e
               WHERE NOT EXISTS (
                 SELECT 1 FROM policies_finales pf
                  WHERE pf.tablename = e.tablename AND pf.cmd = e.cmd AND pf.policyname = e.policyname
                    AND position(e.jeton IN CASE WHEN e.cible = 'using' THEN pf.qual ELSE pf.with_check END) > 0)
            ) THEN 'OK' ELSE 'ECHEC' END,
       'chaque policy d''admission porte encore tous ses predicats (USING compris)',
       'auteur/titulaire = soi ET adult_access_allowed() ; l''exception « declined » vaut sur l''INSERT comme sur l''UPDATE (un upsert evalue le WITH CHECK d''INSERT).'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_policies
               WHERE schemaname = 'public' AND tablename IN ('events', 'event_attendees') AND cmd = 'ALL'
            ) THEN 'OK' ELSE 'ECHEC' END,
       'aucune policy FOR ALL sur events / event_attendees',
       'Une policy FOR ALL porte cmd = ''ALL'' : elle autorise INSERT et UPDATE tout en echappant a tout controle qui ne cherche que ''INSERT''/''UPDATE'' — le gabarit « Enable all operations » du tableau de bord.'

-- D. Les triggers : un WITH CHECK ne voit que la ligne FINALE. Sans eux,
--    l'exception « declined » laisse ecrire pointage, note et avis.
UNION ALL
SELECT 'D. triggers', 'ECHEC',
       'trigger absent ou inactif : ' || t.trg || ' sur ' || t.tbl,
       'Sans lui, un compte non admis ecrit checked_in_at / rating / feedback en posant rsvp = ''declined'' dans la meme requete.'
  FROM triggers_attendus t
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_trigger g
     JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_catalog.pg_proc f ON f.oid = g.tgfoid
    WHERE n.nspname = 'public' AND c.relname = t.tbl AND NOT g.tgisinternal
      AND g.tgname = t.trg AND g.tgenabled <> 'D' AND f.proname = t.fonction
      AND (g.tgtype & 1) = 1 AND (g.tgtype & 2) = 2)
UNION ALL
SELECT 'D. triggers',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM triggers_attendus t WHERE NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_trigger g
             JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             JOIN pg_catalog.pg_proc f ON f.oid = g.tgfoid
            WHERE n.nspname = 'public' AND c.relname = t.tbl AND NOT g.tgisinternal
              AND g.tgname = t.trg AND g.tgenabled <> 'D' AND f.proname = t.fonction
              AND (g.tgtype & 1) = 1 AND (g.tgtype & 2) = 2)
       ) THEN 'OK' ELSE 'ECHEC' END,
       'les 2 triggers d''admission sont actifs, BEFORE, FOR EACH ROW',
       'Un AFTER ne peut rien corriger, un trigger desactive ne s''execute jamais.'
UNION ALL
SELECT 'D. triggers',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_catalog.pg_trigger g
           JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'event_attendees'
            AND g.tgname = 'trg_event_attendees_admission'
            AND (g.tgtype & 4) = 4 AND (g.tgtype & 16) = 16
       ) THEN 'OK' ELSE 'ECHEC' END,
       'le trigger d''inscription couvre INSERT ET UPDATE',
       'L''INSERT compte autant : un upsert peut poser checked_in_at des la creation de la ligne.'
UNION ALL
SELECT 'D. triggers',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'events_admission_gardee'
            AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%author_id%'
            AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%cancelled%'
       ) THEN 'OK' ELSE 'ECHEC' END,
       'le trigger d''evenement garde author_id et n''autorise que l''annulation',
       'La policy « Update organisateurs » n''a pas de WITH CHECK : sans ce trigger, un co-organisateur se declare auteur.'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN NOT has_table_privilege('anon', 'public.events', 'INSERT')
             AND NOT has_table_privilege('anon', 'public.event_attendees', 'INSERT')
             AND NOT has_table_privilege('anon', 'public.event_attendees', 'UPDATE')
            THEN 'OK' ELSE 'ECHEC' END,
       'anon n''ecrit ni dans events ni dans event_attendees',
       'Revoque explicitement par la migration.'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN has_table_privilege('authenticated', 'public.events', 'INSERT')
             AND has_table_privilege('authenticated', 'public.event_attendees', 'INSERT')
             AND has_table_privilege('authenticated', 'public.event_attendees', 'UPDATE')
            THEN 'OK' ELSE 'ECHEC' END,
       'authenticated garde ses droits d''ecriture (la policy decide, pas le GRANT)',
       'Premisse : sans ce droit, tout serait refuse — pour la mauvaise raison.'
UNION ALL
SELECT 'C. policies IRL',
       CASE WHEN EXISTS (SELECT 1 FROM policies_finales WHERE tablename = 'event_attendees' AND cmd = 'DELETE')
            THEN 'OK' ELSE 'ECHEC' END,
       'une policy DELETE subsiste sur event_attendees (se desinscrire)',
       'Le retrait ne doit jamais dependre de l''admission.'

ORDER BY 1, 2 DESC, 3;
