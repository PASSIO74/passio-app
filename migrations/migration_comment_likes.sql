-- ════════════════════════════════════════════════════════════════════════
-- COMMENT LIKES : likes cross-compte sur les commentaires IRL et CDV.
-- Une seule table générique : comment_id est un id unique de commentaire
-- (event_comments.id = "ec_…" ou cdv_live_comments.id = "lc_…"). Visible par
-- tous (select=true) ; un compte ne peut liker qu'en son nom (PK + RLS).
-- À appliquer en prod via `supabase db query --linked --file ...`.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select" ON comment_likes;
CREATE POLICY "comment_likes_select" ON comment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "comment_likes_insert_own" ON comment_likes;
CREATE POLICY "comment_likes_insert_own" ON comment_likes FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "comment_likes_delete_own" ON comment_likes;
CREATE POLICY "comment_likes_delete_own" ON comment_likes FOR DELETE
  USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

-- Realtime (mise à jour instantanée des compteurs si une vue est ouverte).
ALTER PUBLICATION supabase_realtime ADD TABLE comment_likes;
