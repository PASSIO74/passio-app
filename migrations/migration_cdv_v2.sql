-- ═══════════════════════════════════════════════════════════════════════════
-- CDV v2 — géolocalisation réelle des étapes + carnets collaboratifs
-- 2026-07-21
--
-- 1) lat/lng sur les étapes de live. Jusqu'ici la carte reposait uniquement sur
--    cityToLatLng(), un dictionnaire de ~220 villes FRANÇAISES : « Lisbonne »,
--    « Kyoto » ou un nom de spot ne tombaient jamais dessus et l'étape était
--    simplement absente de la carte. On stocke désormais les vraies coordonnées
--    (GPS de l'appareil ou géocodage Nominatim), le dictionnaire ne servant plus
--    que de repli.
--
-- 2) cdv_live_collaborators : un voyage se fait rarement seul. Les co-voyageurs
--    ajoutés par l'auteur peuvent publier des étapes sur SON live. Aucune policy
--    à changer sur cdv_live_steps : son INSERT exige author_id = auth.uid(), ce
--    qui reste vrai pour un collaborateur (il signe ses propres étapes).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Coordonnées des étapes ──
ALTER TABLE cdv_live_steps ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE cdv_live_steps ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- ── 2. Co-voyageurs d'un live ──
CREATE TABLE IF NOT EXISTS cdv_live_collaborators (
  live_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  added_by   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (live_id, user_id)
);
ALTER TABLE cdv_live_collaborators ENABLE ROW LEVEL SECURITY;

-- Lecture ouverte : la liste des co-voyageurs s'affiche sous le titre du voyage.
DROP POLICY IF EXISTS "cdv_collab_select" ON cdv_live_collaborators;
CREATE POLICY "cdv_collab_select" ON cdv_live_collaborators FOR SELECT USING (true);

-- Seul l'auteur du live peut inviter (added_by = moi ET je possède le live).
DROP POLICY IF EXISTS "cdv_collab_insert_owner" ON cdv_live_collaborators;
CREATE POLICY "cdv_collab_insert_owner" ON cdv_live_collaborators FOR INSERT
  WITH CHECK (
    added_by = auth.uid()::text
    AND EXISTS (SELECT 1 FROM cdv_lives l WHERE l.id = live_id AND l.author_id = auth.uid()::text)
  );

-- Retrait : par l'auteur du live, ou par le collaborateur lui-même (il part).
DROP POLICY IF EXISTS "cdv_collab_delete" ON cdv_live_collaborators;
CREATE POLICY "cdv_collab_delete" ON cdv_live_collaborators FOR DELETE
  USING (
    user_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM cdv_lives l WHERE l.id = live_id AND l.author_id = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_cdv_collab_live ON cdv_live_collaborators(live_id);
CREATE INDEX IF NOT EXISTS idx_cdv_collab_user ON cdv_live_collaborators(user_id);

-- Realtime : un ajout de co-voyageur doit se propager comme le reste des cdv_*.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE cdv_live_collaborators;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Vérification :
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'cdv_live_steps' AND column_name IN ('lat','lng');
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='cdv_live_collaborators';
