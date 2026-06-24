-- ════════════════════════════════════════════════════════════════════════
-- CDV LIVES : voyages en direct partagés cross-compte.
-- Avant : 100 % localStorage (`passio_cdv_lives`) → aucun Live visible par un
-- autre compte, spectateurs/réactions/commentaires fictifs (Math.random).
-- Modèle : le Live + ses étapes appartiennent à l'auteur ; commentaires /
-- réactions / followers sont écrits par n'importe quel compte (interaction).
-- Appliquée en prod le 2026-06-24 via `supabase db query --linked`.
-- ════════════════════════════════════════════════════════════════════════

-- ── cdv_lives : le voyage (propriété de l'auteur) ──
CREATE TABLE IF NOT EXISTS cdv_lives (
  id          TEXT PRIMARY KEY,
  author_id   TEXT NOT NULL,
  destination TEXT,
  description TEXT,
  duration    TEXT,
  visibility  TEXT DEFAULT 'public',   -- 'public' | 'followers' | 'private'
  status      TEXT DEFAULT 'live',     -- 'live' | 'ended'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cdv_lives ENABLE ROW LEVEL SECURITY;
-- Lecture : public + privé visible seulement par l'auteur. ('followers' visible
-- par tous, le client filtre déjà l'affichage — suffisant pour la beta.)
DROP POLICY IF EXISTS "cdv_lives_select" ON cdv_lives;
CREATE POLICY "cdv_lives_select" ON cdv_lives FOR SELECT
  USING (visibility <> 'private' OR author_id = auth.uid()::text);
DROP POLICY IF EXISTS "cdv_lives_insert_own" ON cdv_lives;
CREATE POLICY "cdv_lives_insert_own" ON cdv_lives FOR INSERT
  WITH CHECK (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "cdv_lives_update_own" ON cdv_lives;
CREATE POLICY "cdv_lives_update_own" ON cdv_lives FOR UPDATE
  USING (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "cdv_lives_delete_own" ON cdv_lives;
CREATE POLICY "cdv_lives_delete_own" ON cdv_lives FOR DELETE
  USING (author_id = auth.uid()::text);

-- ── cdv_live_steps : étapes publiées en direct (propriété de l'auteur) ──
CREATE TABLE IF NOT EXISTS cdv_live_steps (
  id         TEXT PRIMARY KEY,
  live_id    TEXT NOT NULL,
  author_id  TEXT NOT NULL,
  city       TEXT,
  emoji      TEXT,
  content    TEXT,
  photos     JSONB DEFAULT '[]'::jsonb,
  rating     INT DEFAULT 0,
  budget     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cdv_live_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cdv_steps_select" ON cdv_live_steps;
CREATE POLICY "cdv_steps_select" ON cdv_live_steps FOR SELECT USING (true);
DROP POLICY IF EXISTS "cdv_steps_insert_own" ON cdv_live_steps;
CREATE POLICY "cdv_steps_insert_own" ON cdv_live_steps FOR INSERT
  WITH CHECK (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "cdv_steps_delete_own" ON cdv_live_steps;
CREATE POLICY "cdv_steps_delete_own" ON cdv_live_steps FOR DELETE
  USING (author_id = auth.uid()::text);

-- ── cdv_live_comments : commentaires (par n'importe quel compte) ──
CREATE TABLE IF NOT EXISTS cdv_live_comments (
  id          TEXT PRIMARY KEY,
  live_id     TEXT NOT NULL,
  author_id   TEXT NOT NULL,
  author_name TEXT,
  text        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cdv_live_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cdv_comments_select" ON cdv_live_comments;
CREATE POLICY "cdv_comments_select" ON cdv_live_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "cdv_comments_insert_own" ON cdv_live_comments;
CREATE POLICY "cdv_comments_insert_own" ON cdv_live_comments FOR INSERT
  WITH CHECK (author_id = auth.uid()::text);

-- ── cdv_live_reactions : réactions emoji (par n'importe quel compte) ──
CREATE TABLE IF NOT EXISTS cdv_live_reactions (
  id         TEXT PRIMARY KEY,
  live_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  emoji      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cdv_live_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cdv_reactions_select" ON cdv_live_reactions;
CREATE POLICY "cdv_reactions_select" ON cdv_live_reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "cdv_reactions_insert_own" ON cdv_live_reactions;
CREATE POLICY "cdv_reactions_insert_own" ON cdv_live_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- ── cdv_live_followers : qui suit quel voyage ──
CREATE TABLE IF NOT EXISTS cdv_live_followers (
  live_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (live_id, user_id)
);
ALTER TABLE cdv_live_followers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cdv_followers_select" ON cdv_live_followers;
CREATE POLICY "cdv_followers_select" ON cdv_live_followers FOR SELECT USING (true);
DROP POLICY IF EXISTS "cdv_followers_insert_own" ON cdv_live_followers;
CREATE POLICY "cdv_followers_insert_own" ON cdv_live_followers FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "cdv_followers_delete_own" ON cdv_live_followers;
CREATE POLICY "cdv_followers_delete_own" ON cdv_live_followers FOR DELETE
  USING (user_id = auth.uid()::text);

-- Index de chargement
CREATE INDEX IF NOT EXISTS idx_cdv_steps_live ON cdv_live_steps(live_id);
CREATE INDEX IF NOT EXISTS idx_cdv_comments_live ON cdv_live_comments(live_id);
CREATE INDEX IF NOT EXISTS idx_cdv_reactions_live ON cdv_live_reactions(live_id);
CREATE INDEX IF NOT EXISTS idx_cdv_lives_status ON cdv_lives(status);
