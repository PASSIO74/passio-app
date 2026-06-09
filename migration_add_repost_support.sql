-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Add repost/share support to posts table
-- ════════════════════════════════════════════════════════════════

-- Add columns to posts table for repost tracking
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_from_post_id TEXT DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_data JSONB DEFAULT NULL;

-- Documentation:
-- shared_from_post_id: ID of the original post if this is a repost/share
-- shared_data: JSON object containing original post data
--   {
--     "id": "original_post_id",
--     "text": "original text",
--     "authorName": "original author",
--     "authorEmoji": "original emoji",
--     "authorColor": "original color",
--     "passion": "passion_id"
--   }
