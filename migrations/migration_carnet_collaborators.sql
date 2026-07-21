-- ═══════════════════════════════════════════════════════════════════════════
-- Carnets collaboratifs — 2026-07-21
--
-- Les co-voyageurs existaient déjà sur les LIVES (cdv_live_collaborators). Un
-- carnet, lui, restait mono-auteur : impossible d'écrire à deux le récit d'un
-- voyage fait à deux. Cette migration étend la co-écriture aux carnets (posts
-- de type vlog).
--
-- Le partage d'écriture passe par une fonction SECURITY DEFINER plutôt que par
-- une sous-requête inline : la policy UPDATE de `posts` doit pouvoir lire
-- post_collaborators SANS être elle-même filtrée par la RLS de cette table
-- (sinon récursion / résultat vide selon le contexte).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS post_collaborators (
  post_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  added_by   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE post_collaborators ENABLE ROW LEVEL SECURITY;

-- Lecture ouverte : les co-auteurs sont crédités sur la fiche du carnet.
DROP POLICY IF EXISTS "post_collab_select" ON post_collaborators;
CREATE POLICY "post_collab_select" ON post_collaborators FOR SELECT USING (true);

-- Seul l'auteur du carnet invite.
DROP POLICY IF EXISTS "post_collab_insert_owner" ON post_collaborators;
CREATE POLICY "post_collab_insert_owner" ON post_collaborators FOR INSERT
  WITH CHECK (
    added_by = auth.uid()::text
    AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid()::text)
  );

-- Retrait : par l'auteur du carnet, ou par le co-auteur lui-même.
DROP POLICY IF EXISTS "post_collab_delete" ON post_collaborators;
CREATE POLICY "post_collab_delete" ON post_collaborators FOR DELETE
  USING (
    user_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_post_collab_post ON post_collaborators(post_id);
CREATE INDEX IF NOT EXISTS idx_post_collab_user ON post_collaborators(user_id);

-- ── Droit d'écriture partagé sur le carnet ──
-- SECURITY DEFINER (owner postgres) : contourne la RLS de post_collaborators
-- pour répondre à la seule question « ai-je le droit d'écrire ce post ? ».
-- Ne prend PAS l'uid en paramètre — auth.uid() est lu en interne, donc aucun
-- compte ne peut sonder les droits d'un autre (même règle que post_is_visible).
CREATE OR REPLACE FUNCTION can_edit_post(pid TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = pid AND p.author_id = auth.uid()::text)
      OR EXISTS (SELECT 1 FROM post_collaborators c WHERE c.post_id = pid AND c.user_id = auth.uid()::text);
$$;

REVOKE ALL ON FUNCTION can_edit_post(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_edit_post(TEXT) TO authenticated, anon;

-- La policy UPDATE de `posts` accepte désormais les co-auteurs.
-- Ancienne définition : USING (author_id = auth.uid()::text), sans WITH CHECK.
DROP POLICY IF EXISTS "Update propre" ON posts;
CREATE POLICY "Update propre" ON posts FOR UPDATE
  USING (can_edit_post(id))
  WITH CHECK (can_edit_post(id));

-- ⚠️ Un WITH CHECK sur can_edit_post(id) NE protège PAS la propriété : l'id ne
-- changeant pas, un co-auteur pourrait réécrire author_id et s'approprier le
-- carnet. La propriété est donc rendue IMMUABLE par trigger — elle ne change
-- jamais via l'API, quel que soit l'appelant.
CREATE OR REPLACE FUNCTION posts_freeze_author()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    NEW.author_id := OLD.author_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_freeze_author ON posts;
CREATE TRIGGER trg_posts_freeze_author
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_freeze_author();

-- Realtime : un ajout de co-auteur se propage comme le reste.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_collaborators;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Vérification :
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='post_collaborators';
--   SELECT pg_get_functiondef('can_edit_post(text)'::regprocedure);
