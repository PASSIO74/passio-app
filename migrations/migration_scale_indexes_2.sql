-- Scalabilité (audit 2026-07-02) : deux ajustements d'index sur les tables chaudes.
--
-- 1) event_attendees(user_id) : supaLoadJoinedEvents fait
--    `.select("event_id").eq("user_id", MY_UID)` (mes événements rejoints, chargé
--    au boot/à l'ouverture d'IRL). La PK est (event_id, user_id) → user_id n'est
--    PAS en tête → scan séquentiel de toute la table à l'échelle. Index dédié.
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees (user_id);

-- 2) conv_messages avait DEUX index quasi identiques sur (conv_id, created_at) :
--    idx_conv_messages_conv (…DESC) et idx_conv_messages_conv_created (…ASC).
--    Un btree se parcourt dans les deux sens → l'index ASC est redondant avec le
--    DESC (qui correspond à l'ORDER BY created_at DESC des requêtes). On retire le
--    doublon pour alléger le coût d'écriture (chaque message maintenait 2 index).
DROP INDEX IF EXISTS idx_conv_messages_conv_created;
