-- ════════════════════════════════════════════════════════════════════════
-- PASSIO — À COLLER EN UNE FOIS dans Supabase → SQL Editor → Run (2026-06-15)
-- Regroupe les 3 migrations de scaling. Idempotent, non destructif, ré-exécutable.
-- Après ce script : Database → Realtime → activer « Realtime Authorization »,
-- puis tester v2 sur un device avec  localStorage.passio_realtime_v2 = "1".
-- Détail : docs/SCALE_RUNBOOK.md (P0.1).
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) Index complémentaires (migration_scale_v3.sql) ─────────────────────
CREATE INDEX IF NOT EXISTS idx_follows_following        ON follows (following_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_from       ON conv_messages (from_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_created ON conv_messages (conv_id, created_at);

-- ─── 2) Monitoring (migration_monitoring_view.sql) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors (created_at DESC);

CREATE OR REPLACE VIEW client_errors_top_24h AS
SELECT
  left(coalesce(message, '(sans message)'), 200) AS message,
  count(*)                                        AS occurrences,
  count(DISTINCT uid)                             AS utilisateurs,
  max(created_at)                                 AS derniere_occurrence
FROM client_errors
WHERE created_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY occurrences DESC;

CREATE OR REPLACE VIEW client_errors_par_heure AS
SELECT date_trunc('hour', created_at) AS heure, count(*) AS erreurs
FROM client_errors
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ─── 3) Realtime Authorization (migration_realtime_authorization.sql) ──────
-- Diffusion privée par conversation. Non destructif : diffuse EN PLUS de
-- l'ancien canal tant que le client reste en v1 (flag OFF).
CREATE OR REPLACE FUNCTION public.broadcast_conv_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'conv:' || NEW.conv_id, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_conv_message_trigger ON public.conv_messages;
CREATE TRIGGER broadcast_conv_message_trigger
AFTER INSERT ON public.conv_messages
FOR EACH ROW EXECUTE FUNCTION public.broadcast_conv_message();

DROP POLICY IF EXISTS "Membres reçoivent les broadcasts de leur conv" ON realtime.messages;
CREATE POLICY "Membres reçoivent les broadcasts de leur conv"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conv_members cm
    WHERE cm.user_id = auth.uid()::text
      AND ('conv:' || cm.conv_id) = (realtime.topic())
  )
);

-- ─── Vérifications ─────────────────────────────────────────────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname = 'broadcast_conv_message_trigger';
-- SELECT polname FROM pg_policy WHERE polname LIKE 'Membres reçoivent%';
