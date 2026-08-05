-- ═══════════════════════════════════════════════════════════════════════════
-- TÉLÉMÉTRIE — centre de pilotage temps réel de Passio
-- ---------------------------------------------------------------------------
-- Table d'événements structurés append-only, alimentée par js/telemetry.js.
-- Lue UNIQUEMENT par le backend du tableau de bord (clé service_role) : aucune
-- policy SELECT n'est créée → un client anon/authenticated ne peut RIEN lire.
-- Ajoutée à la publication realtime pour la diffusion instantanée au dashboard.
--
-- Confidentialité (RGPD, cf. section 28 du cahier des charges) :
--   • aucun contenu de message privé, mot de passe, token ou clé n'est stocké
--     (le filtrage est fait côté client dans telemetry.js AVANT l'insert) ;
--   • `meta` ne contient que des métadonnées non sensibles sur liste blanche ;
--   • `user_id` peut être anonymisé côté client ;
--   • rétention configurable via la fonction de purge ci-dessous.
--
-- Application : supabase db query --linked --file migrations/migration_telemetry.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telemetry_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       text,                       -- id généré côté client (dédup)
  received_at    timestamptz NOT NULL DEFAULT now(),
  client_ts      timestamptz,                -- horloge de l'appareil émetteur
  env            text NOT NULL DEFAULT 'production',  -- production|preview|development
  type           text NOT NULL,              -- nav|action|click|error|api|perf|session|lifecycle|db
  action         text,                       -- nom précis de l'action / événement
  screen         text,                       -- écran concerné (#screen-<x>)
  status         text,                       -- ok|error|pending|slow|warn
  severity       text NOT NULL DEFAULT 'info',-- debug|info|warn|error|critical
  duration_ms    integer,                    -- durée de l'opération si mesurée
  user_id        text,                       -- identifiant (anonymisable)
  user_label     text,                       -- pseudo affichable (déjà masqué si besoin)
  session_id     text,                       -- id de session logique (par onglet)
  device_id      text,                       -- id d'appareil persistant (localStorage)
  platform       text,                       -- ios|android|windows|mac|linux
  browser        text,                       -- chrome|safari|firefox|edge|...
  app_version    text,                       -- version applicative de Passio
  screen_size    text,                       -- ex "390x844"
  connection     text,                       -- 4g|wifi|... (navigator.connection)
  endpoint       text,                       -- endpoint API concerné
  http_status    integer,                    -- code réponse HTTP
  correlation_id text,                       -- corrèle une chaîne d'événements
  message        text,                       -- message court (jamais de contenu privé)
  stack          text,                       -- stack trace (erreurs)
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb  -- métadonnées filtrées
);

-- Index des chemins chauds du dashboard (flux chrono, filtres par dimension).
CREATE INDEX IF NOT EXISTS idx_tel_received_at ON telemetry_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tel_type        ON telemetry_events(type);
CREATE INDEX IF NOT EXISTS idx_tel_severity    ON telemetry_events(severity);
CREATE INDEX IF NOT EXISTS idx_tel_session     ON telemetry_events(session_id);
CREATE INDEX IF NOT EXISTS idx_tel_user        ON telemetry_events(user_id);
CREATE INDEX IF NOT EXISTS idx_tel_device      ON telemetry_events(device_id);
CREATE INDEX IF NOT EXISTS idx_tel_correlation ON telemetry_events(correlation_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- INSERT : un compte authentifié peut écrire SES propres événements.
-- (user_id NULL toléré pour la télémétrie pré-authentification / lifecycle boot.)
DROP POLICY IF EXISTS "telemetry_insert_own" ON telemetry_events;
CREATE POLICY "telemetry_insert_own"
  ON telemetry_events FOR INSERT
  WITH CHECK ( user_id IS NULL OR user_id = auth.uid()::text );

-- Aucune policy SELECT / UPDATE / DELETE : seul le service_role (backend
-- dashboard) peut lire, corriger ou purger. Les clients ne relisent jamais.

-- ─── Realtime ─────────────────────────────────────────────────────────────
-- Diffusion instantanée des INSERT au backend du dashboard (abonné en
-- service_role → voit tout, RLS bypassée). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'telemetry_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_events;
  END IF;
END $$;

-- ─── Rétention configurable ───────────────────────────────────────────────
-- Purge des événements plus vieux que N jours (défaut 30). À appeler
-- manuellement ou via un cron pg_cron :
--   SELECT purge_telemetry(30);
CREATE OR REPLACE FUNCTION purge_telemetry(keep_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM telemetry_events
  WHERE received_at < now() - (keep_days || ' days')::interval;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END $$;

-- ─── Vue d'agrégation légère (optionnelle, lecture service_role) ───────────
-- Compteurs par type sur les dernières 24 h, pour un démarrage rapide du
-- dashboard sans scanner toute la table.
CREATE OR REPLACE VIEW telemetry_last24h AS
  SELECT type, severity, COUNT(*) AS n,
         MAX(received_at) AS last_seen
  FROM telemetry_events
  WHERE received_at > now() - interval '24 hours'
  GROUP BY type, severity;
