-- ════════════════════════════════════════════════════════════════════════
-- Migration SCALE v3 — montée en charge (2026-06-15)
-- Complément de migration_indexes_et_monitoring.sql (la plupart des index
-- de perf existent déjà). À appliquer via le Dashboard Supabase (SQL Editor).
-- Tout est idempotent (IF NOT EXISTS) : ré-exécutable sans risque.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Index complémentaires ────────────────────────────────────────────────
-- « Qui me suit » (l'index PK follows(follower_id, following_id) couvre déjà
--   « qui je suis » ; on ajoute l'autre sens pour les compteurs d'abonnés).
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);

-- from_id sert au filtrage realtime applicatif et au WITH CHECK de la RLS v2.
CREATE INDEX IF NOT EXISTS idx_conv_messages_from ON conv_messages (from_id);

-- Pièces jointes / médias d'une conv chargées par created_at (galerie).
CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_created ON conv_messages (conv_id, created_at);

-- ════════════════════════════════════════════════════════════════════════
-- 2) REALTIME AUTHORIZATION (le point n°1 du scaling) — À FAIRE AU DASHBOARD
-- ════════════════════════════════════════════════════════════════════════
-- PROBLÈME : le canal `realtime:my_messages` (app-08) s'abonne à TOUS les
-- INSERT de conv_messages et filtre l'appartenance côté client. À grande
-- échelle = bande passante × nombre d'utilisateurs + un message transite
-- (chiffré en transport, mais transite) chez des non-membres avant filtrage.
--
-- SOLUTION : Supabase applique la RLS aux `postgres_changes` LORSQUE la
-- réplication realtime est configurée pour la vérifier. La table conv_messages
-- a déjà une RLS SELECT « membre de la conv ». Étapes :
--
--   a) Dashboard → Database → Replication → publication `supabase_realtime` :
--      vérifier que conv_messages y est, AVEC l'option « RLS enabled » pour la
--      diffusion (ou activer Realtime Authorization dans Database → Realtime).
--   b) NE PAS modifier le client tant que (a) n'est pas vérifié avec 2 comptes
--      réels — sinon plus aucun message n'arrive. Voir docs/SCALE_RUNBOOK.md
--      pour le diff client exact (canaux privés) et le protocole de test.
--
-- Vérification (psql / SQL Editor) : la table est-elle dans la publication ?
--   SELECT * FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'conv_messages';
