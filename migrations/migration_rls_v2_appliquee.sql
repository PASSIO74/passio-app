-- ════════════════════════════════════════════════════════════════
-- MIGRATION RLS v2 — appliquée le 2026-06-10 via dashboard
-- Corrige la v1 : (1) supprime les VRAIES policies permissives
-- quel que soit leur nom, (2) cast auth.uid()::text (colonnes TEXT),
-- (3) ajoute les policies DELETE manquantes pour ne pas casser l'app.
-- ════════════════════════════════════════════════════════════════

-- 1) Supprimer toutes les policies d'écriture permissives (true),
--    sauf conversations.INSERT et notifications.INSERT (voulues ouvertes)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND ((cmd = 'INSERT' AND with_check = 'true')
        OR (cmd IN ('UPDATE','DELETE') AND qual = 'true')
        OR (tablename = 'notifications' AND cmd = 'SELECT' AND qual = 'true'))
      AND NOT (tablename = 'conversations' AND cmd = 'INSERT')
      AND NOT (tablename = 'notifications' AND cmd = 'INSERT')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2) Policies strictes basées sur la propriété

-- posts
DROP POLICY IF EXISTS "Ecriture propre" ON posts;
CREATE POLICY "Ecriture propre"    ON posts FOR INSERT WITH CHECK (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "Update propre" ON posts;
CREATE POLICY "Update propre"      ON posts FOR UPDATE USING (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON posts;
CREATE POLICY "Suppression propre" ON posts FOR DELETE USING (author_id = auth.uid()::text);

-- post_likes
DROP POLICY IF EXISTS "Ecriture propre" ON post_likes;
CREATE POLICY "Ecriture propre"    ON post_likes FOR INSERT WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON post_likes;
CREATE POLICY "Suppression propre" ON post_likes FOR DELETE USING (user_id = auth.uid()::text);

-- post_comments
DROP POLICY IF EXISTS "Ecriture propre" ON post_comments;
CREATE POLICY "Ecriture propre"    ON post_comments FOR INSERT WITH CHECK (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "Update propre" ON post_comments;
CREATE POLICY "Update propre"      ON post_comments FOR UPDATE USING (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON post_comments;
CREATE POLICY "Suppression propre" ON post_comments FOR DELETE USING (author_id = auth.uid()::text);

-- stories
DROP POLICY IF EXISTS "Ecriture propre" ON stories;
CREATE POLICY "Ecriture propre"    ON stories FOR INSERT WITH CHECK (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON stories;
CREATE POLICY "Suppression propre" ON stories FOR DELETE USING (author_id = auth.uid()::text);

-- events
DROP POLICY IF EXISTS "Ecriture propre" ON events;
CREATE POLICY "Ecriture propre"    ON events FOR INSERT WITH CHECK (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "Update propre" ON events;
CREATE POLICY "Update propre"      ON events FOR UPDATE USING (author_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON events;
CREATE POLICY "Suppression propre" ON events FOR DELETE USING (author_id = auth.uid()::text);

-- follows
DROP POLICY IF EXISTS "Ecriture propre" ON follows;
CREATE POLICY "Ecriture propre"    ON follows FOR INSERT WITH CHECK (follower_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON follows;
CREATE POLICY "Suppression propre" ON follows FOR DELETE USING (follower_id = auth.uid()::text);

-- event_attendees
DROP POLICY IF EXISTS "Ecriture propre" ON event_attendees;
CREATE POLICY "Ecriture propre"    ON event_attendees FOR INSERT WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON event_attendees;
CREATE POLICY "Suppression propre" ON event_attendees FOR DELETE USING (user_id = auth.uid()::text);

-- profiles
DROP POLICY IF EXISTS "Upsert propre" ON profiles;
CREATE POLICY "Upsert propre"      ON profiles FOR INSERT WITH CHECK (id = auth.uid()::text);
DROP POLICY IF EXISTS "Update propre" ON profiles;
CREATE POLICY "Update propre"      ON profiles FOR UPDATE USING (id = auth.uid()::text);

-- conversations : INSERT reste ouvert (par design)

-- conv_members
DROP POLICY IF EXISTS "Ecriture propre" ON conv_members;
CREATE POLICY "Ecriture propre"    ON conv_members FOR INSERT WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON conv_members;
CREATE POLICY "Suppression propre" ON conv_members FOR DELETE USING (user_id = auth.uid()::text);

-- conv_messages
DROP POLICY IF EXISTS "Ecriture propre" ON conv_messages;
CREATE POLICY "Ecriture propre"    ON conv_messages FOR INSERT WITH CHECK (from_id = auth.uid()::text);
DROP POLICY IF EXISTS "Update propre" ON conv_messages;
CREATE POLICY "Update propre"      ON conv_messages FOR UPDATE USING (from_id = auth.uid()::text);
DROP POLICY IF EXISTS "Suppression propre" ON conv_messages;
CREATE POLICY "Suppression propre" ON conv_messages FOR DELETE USING (from_id = auth.uid()::text);

-- notifications : lecture/update réservées au destinataire, INSERT ouvert
DROP POLICY IF EXISTS "Lecture propre" ON notifications;
CREATE POLICY "Lecture propre" ON notifications FOR SELECT USING (user_id = auth.uid()::text);
DROP POLICY IF EXISTS "Update propre" ON notifications;
CREATE POLICY "Update propre"  ON notifications FOR UPDATE USING (user_id = auth.uid()::text);
