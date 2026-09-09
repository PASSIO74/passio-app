-- ═══════════════════════════════════════════════════════════════════════════
-- ADDENDUM au socle #136 pour le banc « admission 18+ ».
--
-- `socle-prod.sql` reproduit la partie de la prod que #136 touche. L'admission
-- touche en plus les policies UPDATE / DELETE de `event_attendees` et DELETE
-- de `events`, recopiées ici depuis pg_policies de la prod (2026-09-08) :
--   event_attendees : « Maj de sa propre participation » (UPDATE, public,
--                     using/with check user_id = auth.uid()), « Suppression
--                     propre » (DELETE, user_id = auth.uid()) ;
--   events          : « Suppression propre » (DELETE, author_id = auth.uid()).
-- Sans « Maj de sa propre participation », le garde de dérive de la migration
-- n'aurait rien à remplacer et le banc ne prouverait pas qu'il la retire.
--
-- ⚠️ Fichier SÉPARÉ, pas une retouche de socle-prod.sql : le banc #136 y
-- mesure ses propres prémisses, et un socle qui bouge sous un banc existant
-- est la façon la plus discrète de le rendre vert pour une autre raison.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Maj de sa propre participation" ON public.event_attendees
  FOR UPDATE USING (user_id = (auth.uid())::text) WITH CHECK (user_id = (auth.uid())::text);
CREATE POLICY "Suppression propre" ON public.event_attendees
  FOR DELETE USING (user_id = (auth.uid())::text);
CREATE POLICY "Suppression propre" ON public.events
  FOR DELETE USING (author_id = (auth.uid())::text);
-- Colonnes de prod que l'app écrit au check-in et au retour d'expérience :
-- le banc les exerce (pointer = UPDATE avec rsvp = 'going').
-- ⚠️ LES QUATRE, pas seulement deux. La prod porte `checked_in_at`, `rating`,
-- `feedback` ET `rated_at` : ce sont exactement les colonnes de PREUVE que le
-- trigger d'admission ramène à leur valeur d'avant. En oublier deux faisait
-- lever le trigger (« record "new" has no field "feedback" ») — un socle
-- infidèle qui accuse la migration.
ALTER TABLE public.event_attendees ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP;
ALTER TABLE public.event_attendees ADD COLUMN IF NOT EXISTS rating SMALLINT;
ALTER TABLE public.event_attendees ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE public.event_attendees ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;
-- ⚠️ La prod accorde à `anon` la TOTALITÉ des droits (`arwdDxtm`) sur ces deux
-- tables, pas seulement INSERT. Le socle #136 ne lui donnait que SELECT +
-- INSERT : le banc prouvait alors que la migration retire l'INSERT, mais
-- laissait croire que le resserrement était complet. Il ne l'est pas — `anon`
-- garde UPDATE et DELETE, couverts par la RLS seule (`auth.uid()` NULL). On
-- part donc de l'état RÉEL, et le banc le mesure explicitement.
GRANT ALL ON public.events, public.event_attendees TO anon;
-- La prod porte DEUX policies SELECT sur `events` (« Lecture publique » et
-- « Read events », doublon historique, toutes deux `using (true)`). Sans la
-- seconde, un futur garde de dérive sur `events SELECT` passerait au banc et
-- échouerait en production — exactement le mode d'échec que ces gardes servent
-- à attraper.
CREATE POLICY "Read events" ON public.events FOR SELECT USING (true);
-- « Update organisateurs » de prod couvre AUSSI les co-organisateurs. Le socle
-- #136 n'en gardait que l'auteur : plus étroit que la réalité, donc un banc qui
-- garderait un jour cette surface serait vert sur une porte encore ouverte.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS co_organizers JSONB DEFAULT '[]'::jsonb;
DROP POLICY IF EXISTS "Update organisateurs" ON public.events;
CREATE POLICY "Update organisateurs" ON public.events FOR UPDATE
  USING ((author_id = (auth.uid())::text) OR jsonb_exists(co_organizers, (auth.uid())::text));
-- `auth.users` n'existe pas sur un PostgreSQL nu : le preflight y compte les
-- comptes. Une coquille suffit pour l'exécuter tel quel dans le banc.
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);

-- ⚠️ Les colonnes de `events` que `socle-prod.sql` n'a pas, et que la PRODUCTION
-- porte (relevées le 2026-09-08). Elles sont nécessaires dès qu'une migration
-- nomme les colonnes une à une — ce que fait `migration_irl_donnees_privees.sql`
-- pour retirer `address` et `contact` à `anon` : un GRANT colonne par colonne
-- échoue sur la PREMIÈRE colonne absente, et le banc accuserait la migration
-- d'un défaut qui n'est que celui de son socle.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lat            DOUBLE PRECISION;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lng            DOUBLE PRECISION;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS city           TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS emoji          TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS max_attendees  INTEGER;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS date_at        TIMESTAMP;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue          TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS postal_code    TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS price          DOUBLE PRECISION;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS contact        TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_link  TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_type     TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cover_url      TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organizer_id   TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_at         TIMESTAMP;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS co_organizers  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS series_id      TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS recurrence     TEXT;
