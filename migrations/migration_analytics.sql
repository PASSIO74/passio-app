-- ═══════════════════════════════════════════════════════════
-- ANALYTICS LÉGÈRES — événements clés par utilisateur
-- Table append-only, lecture réservée à l'admin (service_role).
-- Permet de suivre DAU, funnel d'activation et features populaires
-- sans dépendance externe.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  event       text NOT NULL,          -- ex: 'publish_post', 'open_irl', 'like_post'
  properties  jsonb DEFAULT '{}',     -- données contextuelles optionnelles
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index pour requêtes analytiques courantes
CREATE INDEX IF NOT EXISTS idx_analytics_user_id   ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event      ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);

-- RLS : chaque utilisateur peut insérer SES propres événements,
-- personne ne peut lire (lecture réservée au service_role / dashboard admin).
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_insert_own"
  ON analytics_events FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Lecture : aucun utilisateur ne peut lire les analytics des autres
-- (pas de SELECT policy → seul service_role peut requêter).

-- Pour requêter en admin :
-- supabase db query --linked "SELECT event, COUNT(*) as n FROM analytics_events GROUP BY event ORDER BY n DESC LIMIT 20;"
-- supabase db query --linked "SELECT COUNT(DISTINCT user_id) as dau FROM analytics_events WHERE created_at > now() - interval '24 hours';"
