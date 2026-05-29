-- PASSIO — Setup Supabase (SANS opération destructrice)
-- Colle tout dans : https://supabase.com/dashboard/project/njkiyoklssvefstljemx/sql
-- Aucune table ni donnée supprimée. Les politiques existantes sont ignorées.

-- ════════════════════════════════════════
-- TABLE : follows
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS follows (
  follower_id  TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique"   ON follows FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"    ON follows FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Suppression propre" ON follows FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : event_attendees
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_attendees (
  event_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique"   ON event_attendees FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"    ON event_attendees FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Suppression propre" ON event_attendees FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : profiles
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profiles (
  id         TEXT PRIMARY KEY,
  username   TEXT,
  emoji      TEXT,
  color      TEXT,
  passion_id TEXT,
  bio        TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON profiles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Upsert propre"    ON profiles FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Update propre"    ON profiles FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : posts
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  author_id  TEXT,
  passion_id TEXT,
  mood       TEXT DEFAULT 'all',
  content    TEXT,
  media_url  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON posts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"  ON posts FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : post_likes
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique"   ON post_likes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"    ON post_likes FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Suppression propre" ON post_likes FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : post_comments
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT,
  author_id  TEXT,
  content    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON post_comments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"  ON post_comments FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : stories
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stories (
  id         TEXT PRIMARY KEY,
  author_id  TEXT,
  passion_id TEXT,
  content    TEXT,
  emoji      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON stories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"  ON stories FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : events
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  author_id     TEXT,
  organizer_id  TEXT,
  title         TEXT,
  passion_id    TEXT,
  lat           FLOAT,
  lng           FLOAT,
  city          TEXT,
  emoji         TEXT,
  date_at       TIMESTAMPTZ,
  description   TEXT,
  venue         TEXT,
  address       TEXT,
  postal_code   TEXT,
  price         FLOAT DEFAULT 0,
  max_attendees INT,
  contact       TEXT,
  external_link TEXT,
  event_type    TEXT DEFAULT 'Autre',
  cover_url     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"  ON events FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : conversations
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  is_group   BOOLEAN DEFAULT FALSE,
  group_name TEXT,
  passion_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON conversations FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"  ON conversations FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : conv_members
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conv_members (
  conv_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (conv_id, user_id)
);
ALTER TABLE conv_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON conv_members FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"  ON conv_members FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : conv_messages
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conv_messages (
  id         TEXT PRIMARY KEY,
  conv_id    TEXT,
  from_id    TEXT,
  content    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE conv_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture publique" ON conv_messages FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture propre"  ON conv_messages FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- TABLE : notifications
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  kind       TEXT,
  from_id    TEXT,
  ref_id     TEXT,
  content    TEXT,
  seen       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Lecture propre" ON notifications FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Ecriture"       ON notifications FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Update propre"  ON notifications FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════
-- Realtime (ignoré si déjà actif)
-- ════════════════════════════════════════
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE posts;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conv_messages;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN others THEN NULL; END $$;
