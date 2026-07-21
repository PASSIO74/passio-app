-- ═══════════════════════════════════════════════════════════════════════════
-- CDV Lives — modification d'une étape + suppression de son propre commentaire
-- 2026-07-21
--
-- Contexte : migration_cdv_lives.sql donnait à cdv_live_steps un SELECT ouvert,
-- un INSERT et un DELETE « propriétaire »… mais AUCUNE policy UPDATE. Toute
-- tentative de correction d'une étape (faute de frappe, mauvaise photo) était
-- donc silencieusement bloquée par la RLS : 0 ligne modifiée, aucune erreur,
-- l'étape restait fausse pour tous les spectateurs.
--
-- Idem pour cdv_live_comments : pas de DELETE → impossible de retirer son propre
-- commentaire sur un live (alors que c'est possible partout ailleurs dans l'app).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Étapes : modification par l'auteur ──
DROP POLICY IF EXISTS "cdv_steps_update_own" ON cdv_live_steps;
CREATE POLICY "cdv_steps_update_own" ON cdv_live_steps FOR UPDATE
  USING (author_id = auth.uid()::text)
  WITH CHECK (author_id = auth.uid()::text);

-- ── Commentaires : suppression par leur auteur ──
DROP POLICY IF EXISTS "cdv_comments_delete_own" ON cdv_live_comments;
CREATE POLICY "cdv_comments_delete_own" ON cdv_live_comments FOR DELETE
  USING (author_id = auth.uid()::text);

-- Vérification :
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('cdv_live_steps','cdv_live_comments') ORDER BY 1,3;
