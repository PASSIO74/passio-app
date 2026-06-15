-- ════════════════════════════════════════════════════════════════════════
-- Monitoring — agrégation des erreurs client (scaling P2.9) — 2026-06-15
-- La table client_errors existe déjà (migration_indexes_et_monitoring.sql).
-- On ajoute des vues de lecture pour le triage (service role / dashboard).
-- Non destructif, idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- Index pour le triage par date / message.
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors (created_at DESC);

-- Top des erreurs des dernières 24 h (message normalisé → fréquence + users touchés).
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

-- Volume horaire (pour repérer un pic après un déploiement).
CREATE OR REPLACE VIEW client_errors_par_heure AS
SELECT
  date_trunc('hour', created_at) AS heure,
  count(*)                       AS erreurs
FROM client_errors
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Alerting : à brancher au dashboard (Supabase n'a pas d'alerting natif sur vue).
-- Option simple : une scheduled Edge Function quotidienne qui SELECT sur
-- client_errors_top_24h et envoie un mail/webhook si occurrences > seuil.
-- (Voir docs/SCALE_RUNBOOK.md P2.9.)
