-- Index de performance (appliqué le 2026-06-10 via dashboard)
CREATE INDEX IF NOT EXISTS idx_posts_created_at    ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author        ON posts (author_id);
CREATE INDEX IF NOT EXISTS idx_comments_post       ON post_comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post          ON post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_conv  ON conv_messages (conv_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_members_user   ON conv_members (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_created     ON stories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_created      ON events (created_at DESC);

-- Monitoring : erreurs JS remontées par les clients
CREATE TABLE IF NOT EXISTS client_errors (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message    TEXT,
  source     TEXT,
  line       INT,
  stack      TEXT,
  url        TEXT,
  ua         TEXT,
  uid        TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Insert erreurs" ON client_errors;
CREATE POLICY "Insert erreurs" ON client_errors FOR INSERT WITH CHECK (true);
-- Pas de policy SELECT : lecture réservée au dashboard (service role)
