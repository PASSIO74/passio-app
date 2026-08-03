-- Interactions cross-compte PAR ÉTAPE / PAR JOUR d'un voyage (CDV live & carnet).
-- Avant : commentaires + réactions d'étape vivaient uniquement en local
-- (state.user.stepComments / stepReactions) → invisibles des autres comptes.
-- Table GÉNÉRIQUE clé par « thread_id » (chaîne) pour couvrir les deux formats
-- sans FK (les étapes de carnet n'ont pas d'id serveur propre, juste un index) :
--   · « cdvstep:<liveId>:<stepId> »      → étape d'un live
--   · « carnetstep:<postId>:<index> »    → jour d'un carnet
-- Même esprit que comment_interactions (journal append-only, RLS owner, realtime).
CREATE TABLE IF NOT EXISTS step_interactions (
  id           text PRIMARY KEY,
  thread_id    text NOT NULL,
  user_id      text NOT NULL,
  kind         text NOT NULL,   -- 'comment' | 'reaction'
  content      text,            -- texte du commentaire OU emoji de la réaction
  author_name  text,
  author_emoji text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE step_interactions ENABLE ROW LEVEL SECURITY;

-- Lecture ouverte (comme comment_interactions/event_reactions) : le contenu d'un
-- voyage est déjà filtré côté client par la visibilité du voyage (canSeeCdvLive /
-- canSeeCarnet) ; un commentaire/réaction d'étape n'expose rien de plus.
DROP POLICY IF EXISTS "si_select" ON step_interactions;
CREATE POLICY "si_select" ON step_interactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "si_insert" ON step_interactions;
CREATE POLICY "si_insert" ON step_interactions FOR INSERT WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "si_delete" ON step_interactions;
CREATE POLICY "si_delete" ON step_interactions FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_si_thread ON step_interactions(thread_id);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE step_interactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
