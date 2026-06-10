-- ================================================================
-- PASSIO — MIGRATION CRITIQUE : Fix partage inter-comptes
-- ================================================================
-- À APPLIQUER dans :
--   https://supabase.com/dashboard/project/njkiyoklssvefstljemx/sql
--
-- PROBLÈME : La table posts ne contenait pas les colonnes
--            shared_from_post_id et shared_data, ce qui causait
--            l'échec silencieux de tous les partages vers Supabase.
--            Le partage s'affichait en local mais était invisible
--            depuis un autre compte ou appareil.
-- ================================================================

-- 1. Ajouter les colonnes manquantes (safe : IF NOT EXISTS)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_from_post_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_data TEXT;

-- 2. Vérification : afficher la structure mise à jour
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'posts'
ORDER BY ordinal_position;
