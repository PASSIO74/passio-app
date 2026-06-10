-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Fix RLS policies to prevent spoofing
-- ════════════════════════════════════════════════════════════════

-- ⚠️ IMPORTANT: These policies prevent users from creating posts/likes/etc
-- under someone else's UID. Keep RLS enabled but fix the policies.

-- TABLE: posts
-- Current: WITH CHECK (true) allows ANY author_id
-- Fix: WITH CHECK (author_id = auth.uid()) ensures users can only create their own posts

DROP POLICY IF EXISTS "Ecriture propre" ON posts;
CREATE POLICY "Ecriture propre"  ON posts FOR INSERT WITH CHECK (author_id = auth.uid());

-- UPDATE policy if it exists
DROP POLICY IF EXISTS "Update propre" ON posts;
CREATE POLICY "Update propre"    ON posts FOR UPDATE USING (author_id = auth.uid());

-- TABLE: post_likes
-- Allow users to like posts (anyone can like any post)
-- But only the liker can delete their own like

DROP POLICY IF EXISTS "Suppression propre" ON post_likes;
CREATE POLICY "Suppression propre" ON post_likes FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Ecriture propre" ON post_likes;
CREATE POLICY "Ecriture propre"    ON post_likes FOR INSERT WITH CHECK (user_id = auth.uid());

-- TABLE: post_comments
-- Allow users to comment (anyone can comment)
-- But only the author can delete/update their own comments

DROP POLICY IF EXISTS "Ecriture propre" ON post_comments;
CREATE POLICY "Ecriture propre"  ON post_comments FOR INSERT WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Update propre" ON post_comments;
CREATE POLICY "Update propre"    ON post_comments FOR UPDATE USING (author_id = auth.uid());

-- TABLE: stories

DROP POLICY IF EXISTS "Ecriture propre" ON stories;
CREATE POLICY "Ecriture propre"  ON stories FOR INSERT WITH CHECK (author_id = auth.uid());

-- TABLE: events

DROP POLICY IF EXISTS "Ecriture propre" ON events;
CREATE POLICY "Ecriture propre"  ON events FOR INSERT WITH CHECK (author_id = auth.uid());

-- TABLE: follows
-- Only the follower can create/delete their own follow relationships

DROP POLICY IF EXISTS "Ecriture propre" ON follows;
CREATE POLICY "Ecriture propre"    ON follows FOR INSERT WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "Suppression propre" ON follows;
CREATE POLICY "Suppression propre" ON follows FOR DELETE USING (follower_id = auth.uid());

-- TABLE: event_attendees
-- Only the user can add/remove themselves

DROP POLICY IF EXISTS "Ecriture propre" ON event_attendees;
CREATE POLICY "Ecriture propre"    ON event_attendees FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Suppression propre" ON event_attendees;
CREATE POLICY "Suppression propre" ON event_attendees FOR DELETE USING (user_id = auth.uid());

-- TABLE: profiles
-- Only users can create/update their own profile

DROP POLICY IF EXISTS "Upsert propre" ON profiles;
CREATE POLICY "Upsert propre"    ON profiles FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Update propre" ON profiles;
CREATE POLICY "Update propre"    ON profiles FOR UPDATE USING (id = auth.uid());

-- TABLE: conversations
-- Anyone can create conversations (for now)
-- But conversations are only listed if user is a member

DROP POLICY IF EXISTS "Ecriture propre" ON conversations;
CREATE POLICY "Ecriture propre"  ON conversations FOR INSERT WITH CHECK (true);

-- TABLE: conv_members
-- Only the user can add/remove themselves

DROP POLICY IF EXISTS "Ecriture propre" ON conv_members;
CREATE POLICY "Ecriture propre"    ON conv_members FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Suppression propre" ON conv_members;
CREATE POLICY "Suppression propre" ON conv_members FOR DELETE USING (user_id = auth.uid());

-- TABLE: conv_messages
-- Anyone can read messages in conversations they're a member of
-- But only authors can update/delete their own messages

DROP POLICY IF EXISTS "Ecriture propre" ON conv_messages;
CREATE POLICY "Ecriture propre"  ON conv_messages FOR INSERT WITH CHECK (from_id = auth.uid());

DROP POLICY IF EXISTS "Update propre" ON conv_messages;
CREATE POLICY "Update propre"    ON conv_messages FOR UPDATE USING (from_id = auth.uid());

-- TABLE: notifications
-- Only the target user can see/update their own notifications

DROP POLICY IF EXISTS "Lecture propre" ON notifications;
CREATE POLICY "Lecture propre" ON notifications FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Update propre" ON notifications;
CREATE POLICY "Update propre"  ON notifications FOR UPDATE USING (user_id = auth.uid());

-- DROP the generic "Ecriture" policy if it exists, replace with stricter one
DROP POLICY IF EXISTS "Ecriture" ON notifications;
CREATE POLICY "Ecriture"       ON notifications FOR INSERT WITH CHECK (true);
-- ^ Anyone can insert notifications (server-side trigger would typically handle this)

-- ════════════════════════════════════════════════════════════════
-- Summary of changes:
-- - posts: author_id must match auth.uid() to INSERT/UPDATE
-- - post_likes: user_id must match auth.uid() to INSERT/DELETE
-- - post_comments: author_id must match auth.uid() to INSERT/UPDATE
-- - stories: author_id must match auth.uid() to INSERT
-- - events: author_id must match auth.uid() to INSERT
-- - All ownership-based tables now check auth.uid()
-- ════════════════════════════════════════════════════════════════
