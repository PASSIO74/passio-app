-- ════════════════════════════════════════════════════════════════════════
-- EVENT COMMENTS : commentaires sur les événements IRL, cross-compte.
-- Avant : un événement n'avait ni fil de commentaire (seulement participants).
-- Modèle (calqué sur cdv_live_comments) : commentaire écrit par n'importe quel
-- compte connecté, lisible par tous. Pas de FK profiles (résolution côté client
-- via _resolveProfilesByIds, comme post_comments/notifications — voir CLAUDE.md).
-- À appliquer en prod via `supabase db query --linked --file ...`.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS event_comments (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL,
  author_id   TEXT NOT NULL,
  author_name TEXT,
  text        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_comments_select" ON event_comments;
CREATE POLICY "event_comments_select" ON event_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "event_comments_insert_own" ON event_comments;
CREATE POLICY "event_comments_insert_own" ON event_comments FOR INSERT
  WITH CHECK (author_id = auth.uid()::text);

DROP POLICY IF EXISTS "event_comments_delete_own" ON event_comments;
CREATE POLICY "event_comments_delete_own" ON event_comments FOR DELETE
  USING (author_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_event_comments_event ON event_comments(event_id);

-- Realtime instantané (comme cdv_live_comments) : ajoute la table à la publication.
ALTER PUBLICATION supabase_realtime ADD TABLE event_comments;
