-- Accusés de lecture réels : dernier instant de lecture par membre et par conv.
-- Lecture publique (chaque membre voit l'état de lecture des autres) ; écriture
-- limitée au propriétaire (user_id = auth.uid()). Ajoutée à la publication realtime.
CREATE TABLE IF NOT EXISTS conv_reads (
  conv_id      text NOT NULL,
  user_id      text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conv_id, user_id)
);
ALTER TABLE conv_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reads_select" ON conv_reads;
CREATE POLICY "reads_select" ON conv_reads FOR SELECT USING (true);
DROP POLICY IF EXISTS "reads_upsert" ON conv_reads;
CREATE POLICY "reads_upsert" ON conv_reads FOR INSERT WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "reads_update" ON conv_reads;
CREATE POLICY "reads_update" ON conv_reads FOR UPDATE USING (user_id = auth.uid()::text);

-- Realtime (idempotent : ignore si déjà ajoutée).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conv_reads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
