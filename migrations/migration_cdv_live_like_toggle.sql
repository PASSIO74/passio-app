-- Permet le toggle-off du like ❤️ d'un live CDV (suppression de SA propre
-- réaction). cdv_live_reactions n'avait que SELECT + INSERT → le DELETE du
-- toggle était bloqué par la RLS. On ajoute une policy DELETE owner.
DROP POLICY IF EXISTS "cdv_reactions_delete_own" ON public.cdv_live_reactions;
CREATE POLICY "cdv_reactions_delete_own" ON public.cdv_live_reactions
  FOR DELETE USING (user_id = auth.uid()::text);
