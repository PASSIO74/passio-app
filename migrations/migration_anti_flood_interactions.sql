-- ════════════════════════════════════════════════════════════════════════
-- ANTI-FLOOD & VALIDATION SERVEUR : comment_interactions, event_reactions, reports
-- Complément serveur des fixes XSS d'affichage du 2026-07-02 (escapeHtml au rendu).
-- Ces 3 tables acceptaient des insertions illimitées avec payload texte arbitraire.
--
-- Stratégie :
--  1. CHECK sur les valeurs (kind) et les longueurs (payload/reason ≤ 500,
--     ids ≤ 120) — ajoutés NOT VALID puis VALIDATE en best-effort pour ne pas
--     échouer si des lignes historiques dépassent (elles restent, seules les
--     NOUVELLES insertions sont contraintes).
--  2. Trigger générique de quota `rate_limit_insert(user_col, max_par_minute)` :
--     compte les insertions du même utilisateur dans la dernière minute et
--     rejette au-delà (comment_interactions 60/min, event_reactions 30/min,
--     reports 10/min). SECURITY DEFINER car `reports` n'a aucune policy SELECT.
--     Le trigger FORCE created_at = now() : le client envoyait son propre
--     created_at, un flooder pouvait antidater ses lignes pour sortir de la
--     fenêtre de comptage (et fausser l'ordre d'affichage chez les autres).
--  3. RLS reports resserrée : reporter_id = auth.uid() (avant : WITH CHECK (true)
--     → insert anonyme + reporter_id falsifiable).
--
-- Côté client : supaCommentInteract tronque payload à 500 (sinon une réponse
-- longue serait rejetée silencieusement — les erreurs y sont avalées).
-- Appliquer : supabase db query --linked --file migrations/migration_anti_flood_interactions.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Contraintes CHECK ──────────────────────────────────────────────────

-- comment_interactions : kinds réellement émis par le client (emoji-misc.js) :
-- 'like' | 'reply' | 'emoji' | 'gif'. payload = '' | texte réponse | emoji | URL GIF.
DO $$ BEGIN
  ALTER TABLE public.comment_interactions ADD CONSTRAINT ci_kind_check
    CHECK (kind IN ('like','reply','emoji','gif')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.comment_interactions ADD CONSTRAINT ci_payload_len_check
    CHECK (payload IS NULL OR char_length(payload) <= 500) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.comment_interactions ADD CONSTRAINT ci_ids_len_check
    CHECK (char_length(id) <= 120 AND char_length(comment_id) <= 120
       AND (post_id IS NULL OR char_length(post_id) <= 120)
       AND char_length(user_id) <= 120) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- event_reactions : emoji = un emoji OU une URL de GIF (applyEventGifReaction).
DO $$ BEGIN
  ALTER TABLE public.event_reactions ADD CONSTRAINT evr_emoji_len_check
    CHECK (char_length(emoji) <= 500) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.event_reactions ADD CONSTRAINT evr_ids_len_check
    CHECK (char_length(event_id) <= 120 AND char_length(user_id) <= 120) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- reports : le client tronque déjà reason à 500 (supaReport). Pas de CHECK sur
-- les VALEURS de target_type (une nouvelle surface signalable oublierait la
-- migration et perdrait les signalements en silence) — longueur seulement.
DO $$ BEGIN
  ALTER TABLE public.reports ADD CONSTRAINT rep_reason_len_check
    CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.reports ADD CONSTRAINT rep_ids_len_check
    CHECK (char_length(id) <= 120
       AND (target_type IS NULL OR char_length(target_type) <= 40)
       AND (target_id IS NULL OR char_length(target_id) <= 120)
       AND (reporter_id IS NULL OR char_length(reporter_id) <= 120)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Validation best-effort des lignes existantes (échec = simple NOTICE, les
-- contraintes restent actives pour les nouvelles lignes).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('comment_interactions','ci_kind_check'), ('comment_interactions','ci_payload_len_check'),
    ('comment_interactions','ci_ids_len_check'),
    ('event_reactions','evr_emoji_len_check'), ('event_reactions','evr_ids_len_check'),
    ('reports','rep_reason_len_check'), ('reports','rep_ids_len_check')
  ) AS t(tbl, con) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', c.tbl, c.con);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'Constraint % on % laissée NOT VALID (lignes historiques non conformes)', c.con, c.tbl;
    END;
  END LOOP;
END $$;

-- ── 2. Quota d'insertion par utilisateur/minute ──────────────────────────
-- Générique : args = (nom de la colonne utilisateur, max/minute).
-- SECURITY DEFINER : reports n'a pas de policy SELECT, le comptage doit
-- passer outre la RLS. Force created_at = now() (anti-antidatage, cf. entête).
CREATE OR REPLACE FUNCTION public.rate_limit_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_col    text := TG_ARGV[0];
  max_per_min int  := TG_ARGV[1]::int;
  uid         text;
  cnt         int;
BEGIN
  NEW.created_at := now();
  EXECUTE format('SELECT ($1).%I', user_col) INTO uid USING NEW;
  IF uid IS NULL THEN RETURN NEW; END IF;
  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - interval ''1 minute''',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, user_col
  ) INTO cnt USING uid;
  IF cnt >= max_per_min THEN
    RAISE EXCEPTION 'rate limit: max % insertions/minute sur %', max_per_min, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

-- Index (user, created_at) pour que le comptage du trigger reste O(log n).
CREATE INDEX IF NOT EXISTS idx_ci_user_created  ON public.comment_interactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evr_user_created ON public.event_reactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rep_user_created ON public.reports(reporter_id, created_at);

DROP TRIGGER IF EXISTS trg_rate_limit ON public.comment_interactions;
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.comment_interactions
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert('user_id', '60');

DROP TRIGGER IF EXISTS trg_rate_limit ON public.event_reactions;
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.event_reactions
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert('user_id', '30');

DROP TRIGGER IF EXISTS trg_rate_limit ON public.reports;
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert('reporter_id', '10');

-- ── 3. RLS reports : signalement authentifié et non falsifiable ──────────
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid()::text);
