
COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERDICT — chaque ligne doit dire OK
-- ═══════════════════════════════════════════════════════════════════════════
SELECT * FROM (
  SELECT 1 AS n, '① Pièces jointes' AS correctif,
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='storage' AND tablename='objects'
                              AND policyname='passio_attachments_read_membre')
               AND NOT EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='storage' AND tablename='objects'
                              AND policyname='passio_media_read')
              THEN 'OK' ELSE 'ECHEC' END AS verdict,
         'La lecture des conversations privées suit enfin l''appartenance.' AS detail
  UNION ALL
  SELECT 2, '② Rencontres',
         CASE WHEN NOT has_column_privilege('anon','public.events','address','SELECT')
               AND NOT has_column_privilege('anon','public.events','contact','SELECT')
               AND NOT has_table_privilege('anon','public.event_attendees','SELECT')
               AND has_column_privilege('anon','public.events','title','SELECT')
              THEN 'OK' ELSE 'ECHEC' END,
         'Adresse, téléphone et participants fermés ; titre et carte toujours visibles.'
  UNION ALL
  SELECT 3, '③ Admission 18+',
         CASE WHEN to_regclass('public.access_policies') IS NOT NULL
               AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                            WHERE ns.nspname='public' AND p.proname='adult_access_allowed')
               AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                            WHERE c.relname='event_attendees' AND t.tgname='trg_event_attendees_admission')
              THEN 'OK' ELSE 'ECHEC' END,
         'La garde de majorité est branchée sur les écritures IRL.'
  UNION ALL
  SELECT 4, '   Interrupteur 18+',
         COALESCE((SELECT CASE WHEN enabled THEN 'ALLUME' ELSE 'eteint (normal)' END
                     FROM public.access_policies WHERE key='irl_adult_only'), 'ABSENT'),
         'Doit dire « eteint » : on l''allume APRÈS le déploiement du client.'
  UNION ALL
  SELECT 5, '   Comptes à faire passer',
         (SELECT count(*)::text FROM auth.users)
         || ' comptes, dont '
         || (SELECT count(*)::text FROM public.user_safety WHERE majority_at IS NOT NULL)
         || ' avec année déclarée',
         'Chaque compte doit ouvrir l''app UNE fois avant l''allumage, sinon il perdra l''accès aux rencontres.'
) v ORDER BY n;

-- ═══════════════════════════════════════════════════════════════════════════
-- APRÈS, ET SEULEMENT APRÈS le déploiement du client + un passage de chaque
-- compte dans l'application, allumer l'accès 18+ :
--
--   UPDATE public.access_policies SET enabled = TRUE, updated_at = NOW()
--    WHERE key = 'irl_adult_only';
--
-- Pour éteindre à tout moment, la même requête avec FALSE.
-- ⚠️ Ne JAMAIS supprimer la ligne pour éteindre : ligne absente = règle EXIGÉE.
-- ═══════════════════════════════════════════════════════════════════════════
