-- PREFLIGHT de migration_admission_18_plus.sql (admission 18+, fondation serveur)
--
-- LECTURE SEULE. A executer dans l'editeur SQL Supabase AVANT la migration.
-- Aucune ecriture, aucune transaction : c'est un diagnostic.
--
-- Pourquoi ce fichier : la migration se REFUSE si une policy INSERT/UPDATE
-- inconnue subsiste sur events / event_attendees, et elle exige les objets de
-- #136 (user_safety, is_blocked_with, can_join_event_conversation). Elle ne
-- change RIEN au comportement tant que l'interrupteur reste eteint, mais
-- l'allumer coupera l'IRL aux comptes sans majorite declaree : ce fichier dit
-- COMBIEN, avant qu'on decide.
--
-- Lecture du resultat :
--   BLOQUANT      -> la migration echouera. Corriger avant.
--   AVERTISSEMENT -> la migration passera ; l'ALLUMAGE aura un effet a regarder.
--   OK / INFO     -> rien a faire.

WITH
policies_inconnues AS (
  SELECT 'events INSERT' AS point, policyname
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'events' AND cmd = 'INSERT'
     AND policyname NOT IN ('Ecriture propre', 'events_insert_author_adult')
  UNION ALL
  SELECT 'event_attendees INSERT', policyname
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'event_attendees' AND cmd = 'INSERT'
     AND policyname NOT IN ('Ecriture propre', 'event_attendees_insert_own_adult')
  UNION ALL
  SELECT 'event_attendees UPDATE', policyname
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'event_attendees' AND cmd = 'UPDATE'
     AND policyname NOT IN ('Maj de sa propre participation', 'event_attendees_update_own_adult')
),
prerequis (nom, args) AS (
  VALUES ('is_blocked_with', '_other text'),
         ('can_join_event_conversation', '_conv_id text'),
         ('declare_birth_year', '_birth_year integer')
),
colonnes_requises (tbl, col) AS (
  VALUES ('events','author_id'),
         ('event_attendees','user_id'), ('event_attendees','rsvp'),
         ('user_safety','user_id'), ('user_safety','majority_at')
),
comptes AS (
  SELECT (SELECT COUNT(*) FROM auth.users) AS total,
         (SELECT COUNT(*) FROM public.user_safety s WHERE s.majority_at IS NOT NULL) AS declares,
         (SELECT COUNT(*) FROM public.user_safety s WHERE s.majority_at <= CURRENT_DATE) AS majeurs
)

-- 1. Les trois gardes anti-derive : une seule ligne ici = migration refusee.
SELECT '1. gardes de derive' AS etape, 'BLOQUANT' AS verdict,
       'policy inconnue sur ' || point AS point,
       'policy « ' || policyname || ' » : la migration leve une exception et annule tout.' AS detail
  FROM policies_inconnues
UNION ALL
SELECT '1. gardes de derive', 'OK', 'aucune policy INSERT/UPDATE inconnue', 'Les trois gardes passeront.'
 WHERE NOT EXISTS (SELECT 1 FROM policies_inconnues)

-- 2. Prerequis #136 et colonnes.
UNION ALL
SELECT '2. prerequis', 'BLOQUANT', 'table absente : public.user_safety',
       'Appliquer migration_ts_serveur_age_blocage.sql (#136) d''abord.'
 WHERE to_regclass('public.user_safety') IS NULL
UNION ALL
SELECT '2. prerequis', 'BLOQUANT', 'fonction absente : public.' || p.nom || '(' || p.args || ')',
       'Objet de #136 requis par la migration.'
  FROM prerequis p
 WHERE NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
          WHERE n.nspname = 'public' AND f.proname = p.nom
            AND pg_catalog.pg_get_function_identity_arguments(f.oid) = p.args)
UNION ALL
SELECT '2. prerequis', 'BLOQUANT', 'colonne absente : ' || r.tbl || '.' || r.col,
       'Les policies et fonctions de la migration la referencent.'
  FROM colonnes_requises r
 WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col)
UNION ALL
SELECT '2. prerequis', 'OK', 'prerequis complets', '#136 en place, colonnes presentes.'
 WHERE to_regclass('public.user_safety') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM prerequis p WHERE NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid = f.pronamespace
          WHERE n.nspname = 'public' AND f.proname = p.nom
            AND pg_catalog.pg_get_function_identity_arguments(f.oid) = p.args))
   AND NOT EXISTS (SELECT 1 FROM colonnes_requises r WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col))

-- 3. Ce que l'ALLUMAGE coupera. La migration n'allume rien ; ces chiffres
--    disent l'effet du jour ou on allumera : tout compte sans majorite
--    declaree perd organisation, inscription et conversation d'evenement.
UNION ALL
SELECT '3. effet de l''allumage', 'AVERTISSEMENT',
       'comptes sans majorite declaree : ' || (total - declares)::text || ' sur ' || total::text,
       'Une fois l''interrupteur allume, ils devront declarer leur annee (declare_birth_year) avant tout geste IRL. '
       || 'Majeurs declares aujourd''hui : ' || majeurs::text || '.'
  FROM comptes
 WHERE total - declares > 0
UNION ALL
SELECT '3. effet de l''allumage', 'OK', 'tous les comptes ont une majorite declaree',
       'Majeurs declares : ' || majeurs::text || ' sur ' || total::text || '.'
  FROM comptes
 WHERE total - declares <= 0
UNION ALL
SELECT '3. effet de l''allumage', 'AVERTISSEMENT',
       'inscriptions actives portees par des comptes non admis : ' || COUNT(*)::text,
       'Ces lignes restent ; leurs titulaires pourront se retirer (declined / DELETE) mais ni revenir ni pointer.'
  FROM public.event_attendees a
 WHERE a.rsvp IN ('going', 'maybe')
   AND NOT EXISTS (SELECT 1 FROM public.user_safety s
                    WHERE s.user_id = a.user_id AND s.majority_at <= CURRENT_DATE)
HAVING COUNT(*) > 0

-- 4. Idempotence : ce que la migration va reprendre plutot que creer.
UNION ALL
SELECT '4. idempotence', 'INFO',
       'public.access_policies existe deja — irl_adult_only = ' || COALESCE((
         SELECT CASE WHEN p.enabled THEN 'ALLUME' ELSE 'eteint' END
           FROM public.access_policies p WHERE p.key = 'irl_adult_only'), 'LIGNE ABSENTE (= exige)'),
       'CREATE TABLE IF NOT EXISTS + INSERT ... DO NOTHING : l''etat de l''interrupteur est conserve.'
 WHERE to_regclass('public.access_policies') IS NOT NULL
UNION ALL
SELECT '4. idempotence', 'INFO', 'les policies d''admission existent deja',
       'Elles seront refaites a l''identique.'
 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_policies
                WHERE schemaname = 'public' AND policyname = 'events_insert_author_adult')

ORDER BY 1, 2, 3;
