-- Interactions cross-compte sur les COMMENTAIRES : like, réponse, réaction emoji.
-- (Le like/réponse/emoji d'un commentaire n'étaient stockés qu'en local → invisibles
-- pour les autres comptes.) Lecture publique, écriture/suppression réservées au
-- propriétaire. Ajoutée à la publication realtime.
-- ⚠️ Nécessite que l'id du commentaire soit ALIGNÉ local ⇄ post_comments
--    (submitComment génère « c_… » et le passe à supaAddComment).
CREATE TABLE IF NOT EXISTS comment_interactions (
  id         text PRIMARY KEY,
  comment_id text NOT NULL,
  post_id    text,
  user_id    text NOT NULL,
  kind       text NOT NULL,   -- 'like' | 'reply' | 'emoji'
  payload    text,            -- texte de réponse ou emoji
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE comment_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ci_select" ON comment_interactions;
CREATE POLICY "ci_select" ON comment_interactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "ci_insert" ON comment_interactions;
CREATE POLICY "ci_insert" ON comment_interactions FOR INSERT WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "ci_delete" ON comment_interactions;
CREATE POLICY "ci_delete" ON comment_interactions FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_ci_comment ON comment_interactions(comment_id);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE comment_interactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
