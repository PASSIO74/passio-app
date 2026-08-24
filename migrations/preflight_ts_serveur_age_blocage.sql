-- PREFLIGHT de migration_ts_serveur_age_blocage.sql (#136)
--
-- LECTURE SEULE. A executer dans l'editeur SQL Supabase AVANT la migration.
-- Aucune ecriture, aucune transaction : c'est un diagnostic.
--
-- Pourquoi ce fichier : la migration se REFUSE si une policy INSERT inconnue
-- subsiste sur conversations / conv_members / conv_messages, et elle depend de
-- colonnes que le client traite comme OPTIONNELLES (`_EVENT_OPTIONAL_COLS` dans
-- app-08 : `status` et `conv_id` sont retires de l'INSERT si la base ne les a
-- pas). Sans ce controle, on decouvre le probleme sous la forme d'une exception
-- brute au milieu d'un pave de 300 lignes.
--
-- Lecture du resultat :
--   BLOQUANT      -> la migration echouera (ou cassera une fonction). Corriger avant.
--   AVERTISSEMENT -> la migration passera, mais des donnees existantes seront
--                    refusees ensuite. A regarder, pas forcement a corriger.
--   OK / INFO     -> rien a faire.

WITH
policies_inconnues AS (
  SELECT 'conversations' AS tbl, policyname
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'conversations' AND cmd = 'INSERT'
     AND policyname NOT IN ('Ecriture propre', 'Insert conversations', 'conversations_insert_creator')
  UNION ALL
  SELECT 'conv_members', policyname
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'conv_members' AND cmd = 'INSERT'
     AND policyname <> 'Ecriture propre'
  UNION ALL
  SELECT 'conv_messages', policyname
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'conv_messages' AND cmd = 'INSERT'
     AND policyname NOT IN ('Ecriture propre', 'conv_messages_insert_member')
),
colonnes_requises (tbl, col) AS (
  VALUES ('events','id'), ('events','conv_id'), ('events','author_id'), ('events','status'),
         ('event_attendees','event_id'), ('event_attendees','user_id'), ('event_attendees','rsvp'),
         ('blocks','blocker_id'), ('blocks','blocked_id'),
         ('conversations','id'), ('conversations','created_by'),
         ('conv_members','conv_id'), ('conv_members','user_id'),
         ('conv_messages','conv_id'), ('conv_messages','from_id')
)

-- 1. Les trois gardes anti-derive : une seule ligne ici = migration refusee.
SELECT '1. gardes de derive' AS etape,
       'BLOQUANT' AS verdict,
       'policy INSERT inconnue sur ' || tbl AS point,
       'policy « ' || policyname || ' » : la migration leve une exception et annule tout. '
       || 'La supprimer, ou l''ajouter a la liste blanche du fichier de migration.' AS detail
  FROM policies_inconnues

UNION ALL
SELECT '1. gardes de derive', 'OK', 'aucune policy INSERT inconnue',
       'Les trois gardes passeront.'
 WHERE NOT EXISTS (SELECT 1 FROM policies_inconnues)

-- 2. Dependances de schema. `status` et `conv_id` sont OPTIONNELLES cote client
--    mais OBLIGATOIRES pour can_join_event_conversation : absentes, la migration
--    echoue des la creation de la fonction (rollback integral, mais echec brut).
UNION ALL
SELECT '2. dependances', 'BLOQUANT',
       'colonne absente : ' || r.tbl || '.' || r.col,
       'can_join_event_conversation / is_blocked_with ne peuvent pas etre creees sans elle.'
  FROM colonnes_requises r
 WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col
       )

UNION ALL
SELECT '2. dependances', 'BLOQUANT', 'fonction absente : public.is_conv_member(text, text)',
       'conv_messages_insert_member l''appelle. Verifier migration_fix_conv_members_insert.sql.'
 WHERE NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc p
           JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'is_conv_member'
            AND pg_catalog.pg_get_function_identity_arguments(p.oid) ILIKE '%text%text%'
       )

UNION ALL
SELECT '2. dependances', 'OK', 'schema complet',
       'Toutes les colonnes et fonctions attendues sont presentes.'
 WHERE NOT EXISTS (
         SELECT 1 FROM colonnes_requises r
          WHERE NOT EXISTS (
                  SELECT 1 FROM information_schema.columns c
                   WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col)
       )

-- 3. Donnees existantes que la migration rendra non conformes. La fonction exige
--    status = 'active', conv_id canonique et createur = auteur. Une ligne qui
--    manque a l'une des trois voit son self-join REFUSE apres migration --
--    silencieusement, puisque c'est un refus RLS et non une erreur.
UNION ALL
SELECT '3. donnees', 'AVERTISSEMENT',
       'evenements avec conversation mais status <> ''active'' : ' || COUNT(*)::text,
       'Leurs participants ne pourront plus rejoindre la conversation de groupe. '
       || 'Un status NULL compte ici : la comparaison vaut NULL, donc refus.'
  FROM public.events e
 WHERE e.conv_id IS NOT NULL AND (e.status IS DISTINCT FROM 'active')
HAVING COUNT(*) > 0

UNION ALL
SELECT '3. donnees', 'AVERTISSEMENT',
       'evenements dont conv_id n''est pas canonique : ' || COUNT(*)::text,
       'La fonction exige conv_id = ''evgrp_'' || id. Ces conversations deviennent non rejoignables.'
  FROM public.events e
 WHERE e.conv_id IS NOT NULL AND e.conv_id <> ('evgrp_' || e.id)
HAVING COUNT(*) > 0

UNION ALL
SELECT '3. donnees', 'AVERTISSEMENT',
       'conversations d''evenement dont created_by <> author_id : ' || COUNT(*)::text,
       'La fonction exige la coherence createur/auteur. Ces conversations deviennent non rejoignables.'
  FROM public.events e
  JOIN public.conversations c ON c.id = e.conv_id
 WHERE e.conv_id IS NOT NULL AND c.created_by IS DISTINCT FROM e.author_id
HAVING COUNT(*) > 0

-- 4. Idempotence : ce que la migration va reprendre plutot que creer.
UNION ALL
SELECT '4. idempotence', 'INFO', 'public.user_safety existe deja',
       'CREATE TABLE IF NOT EXISTS : la table est conservee, ses policies sont refaites.'
 WHERE to_regclass('public.user_safety') IS NOT NULL

UNION ALL
SELECT '4. idempotence', 'INFO', 'public.declare_majority(DATE) est encore presente',
       'La migration la supprime : c''est le chemin falsifiable ou le client choisissait sa date.'
 WHERE EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc p
           JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'declare_majority'
       )

ORDER BY 1, 2, 3;
