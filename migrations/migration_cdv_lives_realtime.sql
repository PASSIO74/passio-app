-- ════════════════════════════════════════════════════════════════════════
-- CDV LIVES — realtime : ajoute les 5 tables à la publication supabase_realtime
-- pour recevoir les postgres_changes (étapes/commentaires/réactions/suivis) en
-- direct (canal "realtime:cdv_lives", app-08). La RLS SELECT gouverne ce que
-- chaque client reçoit (public/own). Idempotent.
-- Appliquée en prod le 2026-06-24 via `supabase db query --linked`.
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cdv_lives','cdv_live_steps','cdv_live_comments','cdv_live_reactions','cdv_live_followers']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
