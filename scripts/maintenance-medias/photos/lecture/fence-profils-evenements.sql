WITH fonction AS (
  SELECT p.oid
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.media_heritage_profils_evenements()')
    AND pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) = '7667d4c981e4ff03170957d5e5d63642'
    AND NOT p.prosecdef AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
), cibles(nom, empreinte) AS (
  VALUES ('public.profiles', '9bb52d4cf751390f68ce12ab21271c54'), ('public.events', 'cb0e4d28e0fe5b35db05706547c562d1')
)
SELECT pg_catalog.current_setting('transaction_read_only') = 'on' AS lecture_seule,
  EXISTS (SELECT 1 FROM fonction)
  AND NOT EXISTS (
    SELECT 1 FROM cibles AS c
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS t
      JOIN pg_catalog.pg_class AS r ON r.oid = t.tgrelid
      JOIN fonction AS f ON f.oid = t.tgfoid
      WHERE r.oid = pg_catalog.to_regclass(c.nom) AND r.relkind = 'r'
        AND NOT r.relispartition
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhparent = r.oid)
        AND t.tgname = 'media_heritage_profils_evenements'
        AND NOT t.tgisinternal AND t.tgenabled = 'A'
        AND pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid)) = c.empreinte
    )
  ) AS cloture_exacte,
  pg_catalog.has_table_privilege(current_user, 'public.migrations_appliquees', 'SELECT')
  AND NOT pg_catalog.row_security_active('public.migrations_appliquees'::pg_catalog.regclass)
  AND (SELECT count(*) = 1 AND bool_and(
    j.empreinte = '816b291538d8235bb9f4179d016a34459d742b82686e2b825dcb35dc2a53545e'
    AND j.outil = 'appliquer-migration.mjs' AND j.statut = 'applique')
    FROM public.migrations_appliquees AS j
    WHERE j.cible = 'njkiyoklssvefstljemx'
      AND j.fichier = 'migrations/migration_cloture_references_profils_evenements_2026-11-19.sql') AS journal_cible
