-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION : abonnements Web Push (appels même app fermée)
-- ════════════════════════════════════════════════════════════════════════
-- Stocke l'abonnement push (endpoint + clés) de chaque appareil d'un compte.
-- L'Edge Function `notify-call` (service_role) lit ces lignes pour réveiller
-- le destinataire d'un appel quand son app est fermée.
--
-- Un compte peut avoir plusieurs appareils → plusieurs endpoints. `endpoint`
-- est unique (un abonnement par navigateur/appareil) ; on upsert dessus.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint     text PRIMARY KEY,
  user_id      text NOT NULL,
  subscription jsonb NOT NULL,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- L'utilisateur ne gère QUE ses propres abonnements (l'Edge Function passe en
-- service_role et contourne la RLS pour lire ceux des destinataires).
DO $$ BEGIN
  CREATE POLICY "push_select_own" ON push_subscriptions FOR SELECT USING (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "push_insert_own" ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "push_update_own" ON push_subscriptions FOR UPDATE USING (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "push_delete_own" ON push_subscriptions FOR DELETE USING (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
