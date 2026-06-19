-- ════════════════════════════════════════════════════════════════════════
-- BOBINES (Reels) + STORIES façon Instagram — colonnes média/overlays
-- Appliquée en prod le 2026-06-19 via `supabase db query --linked`.
-- ════════════════════════════════════════════════════════════════════════

-- posts : distinguer les bobines (is_reel) du fil + overlays d'édition (texte,
-- stickers/GIF positionnés) pour l'éditeur façon Instagram.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_reel  boolean DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS overlays jsonb;

-- stories : média (photo/vidéo en Storage) + overlays personnalisables.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS media_url  text;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS overlays   jsonb;
