-- ════════════════════════════════════════════════════════════════════
-- FIX CRITIQUE MESSAGERIE — 2026-06-11
-- À exécuter dans le SQL Editor Supabase (comme migration_rgpd_delete_policies.sql)
-- ════════════════════════════════════════════════════════════════════
--
-- Bug : depuis la RLS v2, l'INSERT sur conv_members est limité à
-- user_id = auth.uid() — le créateur d'une conversation ne peut donc plus
-- ajouter l'AUTRE membre (ni les membres d'un groupe). L'insert multi-lignes
-- de supaCreateConversation échoue atomiquement (même la ligne du créateur),
-- le destinataire n'est jamais membre : il ne voit ni la conversation ni les
-- messages (le handler realtime vérifie la membership et les ignore).
-- → La messagerie entre 2 comptes réels était cassée en prod.
--
-- Reproduit le 2026-06-11 avec 2 comptes anonymes :
--   insert conv_members (2 lignes) → "new row violates row-level security policy"
-- Test automatisé : tests/e2e/multi-comptes.spec.js (PASSIO_E2E_MULTI=1 npm test)
--
-- Fix : on peut s'ajouter soi-même, et le CRÉATEUR de la conversation peut
-- ajouter les autres membres.

DROP POLICY IF EXISTS "Ecriture propre" ON conv_members;
CREATE POLICY "Ecriture propre" ON conv_members FOR INSERT WITH CHECK (
  user_id = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conv_id
      AND c.created_by = auth.uid()::text
  )
);

-- Vérification (doit lister 1 policy INSERT sur conv_members avec la clause EXISTS) :
-- SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE tablename = 'conv_members' AND cmd = 'INSERT';
