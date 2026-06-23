-- ════════════════════════════════════════════════════════════════════════
-- PASSIO — Photos de profil partagées + synchronisation d'état cross-appareil
-- (2026-06-23)
--
-- Sujet 2 : la photo de profil (avatar) et la photo de couverture n'étaient
--   stockées qu'en base64 dans le localStorage → invisibles pour les autres.
--   On ajoute avatar_url / cover_url à `profiles` (l'image vit dans Storage,
--   seule l'URL est en DB), pour que tout le monde voie la vraie photo.
--
-- Sujet 1 : « enregistrer tout ce qu'on modifie/ajoute, retrouvable sur un
--   autre appareil ». On ajoute une table `user_state` : un blob JSON par
--   compte (personas, carnets, passions custom, réglages…), RLS owner-only.
--   Le contenu partagé (posts/stories/events/messages/notifs) reste dans ses
--   propres tables ; user_state ne porte QUE les données personnelles privées.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Photos de profil partagées ------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_url  text;

-- 2) Sauvegarde d'état par compte (cross-appareil) -----------------------------
CREATE TABLE IF NOT EXISTS user_state (
  user_id    text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_state ENABLE ROW LEVEL SECURITY;

-- RLS owner-only : chaque compte ne lit/écrit QUE sa propre ligne.
DROP POLICY IF EXISTS user_state_select_own ON user_state;
CREATE POLICY user_state_select_own ON user_state
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS user_state_insert_own ON user_state;
CREATE POLICY user_state_insert_own ON user_state
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS user_state_update_own ON user_state;
CREATE POLICY user_state_update_own ON user_state
  FOR UPDATE USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS user_state_delete_own ON user_state;
CREATE POLICY user_state_delete_own ON user_state
  FOR DELETE USING (auth.uid()::text = user_id);
