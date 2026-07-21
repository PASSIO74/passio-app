-- ════════════════════════════════════════════════════════════════════════
-- IRL v2 — RSVP, liste d'attente, check-in, co-organisateurs, récurrence,
--          discussion de groupe et album d'événement (2026-07-21)
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) RSVP en 3 états + liste d'attente + check-in ────────────────────────
-- `event_attendees` ne stockait qu'un booléen implicite (ligne présente = vient).
-- Un « peut-être » honnête vaut mieux qu'un faux « je viens » (cf. Partiful/Luma),
-- et un événement complet renvoyait les gens sans rien leur proposer.
--   rsvp : 'going' | 'maybe' | 'declined' | 'waitlist'
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS rsvp          text NOT NULL DEFAULT 'going';
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS checked_in_at timestamp;

-- Les lignes existantes sont toutes des inscriptions fermes.
UPDATE event_attendees SET rsvp = 'going' WHERE rsvp IS NULL;

-- La promotion depuis la liste d'attente se fait dans l'ordre d'inscription.
CREATE INDEX IF NOT EXISTS idx_event_attendees_waitlist
  ON event_attendees (event_id, rsvp, created_at);

-- ⚠️ Sans policy UPDATE, changer son RSVP ou pointer son arrivée était bloqué
-- SILENCIEUSEMENT par la RLS (0 ligne modifiée, aucune erreur remontée).
DO $$ BEGIN
  CREATE POLICY "Maj de sa propre participation" ON event_attendees
    FOR UPDATE USING (user_id = (auth.uid())::text)
    WITH CHECK (user_id = (auth.uid())::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2) Événements : co-organisateurs, récurrence, discussion de groupe ─────
ALTER TABLE events ADD COLUMN IF NOT EXISTS co_organizers    jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id        text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence       text NOT NULL DEFAULT 'none';
ALTER TABLE events ADD COLUMN IF NOT EXISTS conv_id          text;

CREATE INDEX IF NOT EXISTS idx_events_series ON events (series_id);

-- Un co-organisateur doit pouvoir corriger l'événement : la policy UPDATE
-- « propre » (author_id only) le lui interdisait. jsonb_exists() plutôt que
-- l'opérateur `?`, que les clients SQL interprètent comme un paramètre lié.
DROP POLICY IF EXISTS "Update propre" ON events;
CREATE POLICY "Update organisateurs" ON events
  FOR UPDATE USING (
    author_id = (auth.uid())::text
    OR jsonb_exists(co_organizers, (auth.uid())::text)
  );

-- ── 3) Album d'événement : rattacher un post à un événement ────────────────
-- Le chaînon manquant entre « j'y étais » et « je publie » : les photos
-- publiées après coup remontent sur la fiche de l'événement.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_id text;
CREATE INDEX IF NOT EXISTS idx_posts_event ON posts (event_id) WHERE event_id IS NOT NULL;
