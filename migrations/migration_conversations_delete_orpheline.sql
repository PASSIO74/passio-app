-- ════════════════════════════════════════════════════════════════════
-- CONVERSATIONS ORPHELINES — le nettoyage ne pouvait pas s'exécuter
-- 2026-09-10 · À appliquer par psql ou le SQL Editor (canal ③, ADR-012)
-- ════════════════════════════════════════════════════════════════════
--
-- CE QUI EST MESURÉ EN PRODUCTION (2026-09-10) : 19 conversations sur 20
-- n'ont AUCUNE ligne `conv_members`. La policy d'insertion de `conv_messages`
-- exige `is_conv_member(conv_id, auth.uid())` : sans membre, TOUT message y est
-- refusé, pour toujours. C'est la cause des 798 refus HTTP 403 du 2026-09-09.
--
-- POURQUOI ELLES EXISTENT. `supaCreateConversation` (app-08) crée la
-- conversation, PUIS ses membres. Avant le correctif de policy du 2026-06-11
-- (`migration_fix_conv_members_insert.sql`), le créateur ne pouvait pas ajouter
-- l'AUTRE membre : l'ajout échouait, et le code prévoyait alors de nettoyer —
--     supa.from("conversations").delete().eq("id", convId)
-- ⚠️ SAUF QUE `conversations` N'A AUCUNE POLICY DELETE. Ce nettoyage touchait
-- donc 0 ligne, SANS ERREUR (PostgREST ne signale pas « 0 ligne » comme un
-- échec, et le SDK ne lève pas). La conversation restait, définitivement
-- incapable de porter un message. Le code croyait avoir nettoyé.
--
-- ⚠️ ON N'OUVRE PAS « LE CRÉATEUR PEUT SUPPRIMER SA CONVERSATION » : ce serait
-- donner à une seule personne le droit d'effacer un fil que d'autres ont écrit,
-- et les messages avec (FK). La policy ci-dessous n'autorise la suppression que
-- d'une conversation SANS AUCUN MEMBRE — donc d'une coquille que personne ne
-- voit et où personne ne peut écrire. Une conversation vivante reste
-- indestructible, exactement comme aujourd'hui.
--
-- ⚠️ ELLE NE NETTOIE PAS LE PASSÉ. Les 19 coquilles déjà en base restent : les
-- supprimer est une écriture de DONNÉES (canal ②), pas de structure, et le
-- client sait désormais les réparer lui-même (`_reparerAppartenanceConv`,
-- app-04) — réparer vaut mieux que supprimer, la conversation redevient
-- utilisable au lieu de disparaître.

DROP POLICY IF EXISTS "Suppression conversation orpheline" ON public.conversations;

CREATE POLICY "Suppression conversation orpheline" ON public.conversations
  FOR DELETE
  USING (
    created_by = (SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1 FROM public.conv_members m WHERE m.conv_id = conversations.id
    )
  );

-- ── Contrôle : la policy existe et porte bien les DEUX conditions ──
DO $$
DECLARE q text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO q
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'conversations' AND p.polname = 'Suppression conversation orpheline';
  IF q IS NULL THEN
    RAISE EXCEPTION 'ECHEC : la policy DELETE n''a pas été créée.';
  END IF;
  IF q NOT LIKE '%created_by%' OR q NOT LIKE '%conv_members%' THEN
    RAISE EXCEPTION 'ECHEC : la policy ne porte pas les deux conditions (createur ET aucun membre) : %', q;
  END IF;
  RAISE NOTICE 'OK — suppression limitée aux conversations orphelines de leur créateur.';
END $$;
