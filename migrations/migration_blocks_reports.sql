-- ════════════════════════════════════════════════════════════════════════
-- MODÉRATION : tables `blocks` (blocage utilisateur) et `reports` (signalement)
-- Appliquée en prod le 2026-06-19 via `supabase db query --linked`.
-- ════════════════════════════════════════════════════════════════════════

-- ── blocks : qui a bloqué qui (persisté cross-device) ──
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
-- Le propriétaire (celui qui bloque) gère uniquement SES blocages.
DROP POLICY IF EXISTS "blocks_select_own" ON blocks;
CREATE POLICY "blocks_select_own" ON blocks FOR SELECT USING (blocker_id = auth.uid()::text);
DROP POLICY IF EXISTS "blocks_insert_own" ON blocks;
CREATE POLICY "blocks_insert_own" ON blocks FOR INSERT WITH CHECK (blocker_id = auth.uid()::text);
DROP POLICY IF EXISTS "blocks_delete_own" ON blocks;
CREATE POLICY "blocks_delete_own" ON blocks FOR DELETE USING (blocker_id = auth.uid()::text);

-- ── reports : signalements (lecture réservée à l'admin → aucune policy SELECT) ──
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT,
  target_type TEXT,   -- 'post' | 'user' | 'comment' | 'message'
  target_id TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
-- N'importe qui peut signaler ; personne ne peut lire (modération via Dashboard
-- avec service_role). Pas de policy SELECT/UPDATE/DELETE = accès public refusé.
DROP POLICY IF EXISTS "reports_insert" ON reports;
CREATE POLICY "reports_insert" ON reports FOR INSERT WITH CHECK (true);
