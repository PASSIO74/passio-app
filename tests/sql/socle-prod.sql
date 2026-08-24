-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE reproduisant la partie de la PROD PASSIO que touche #136.
-- Recopié depuis `migrations/SCHEMA_PROD_REFERENCE.sql` : notamment les DEUX
-- policies INSERT permissives de `conversations`, détail important car les
-- policies PostgreSQL permissives se combinent en OR.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TABLE public.blocks (
  blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (blocker_id, blocked_id));
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_select_own" ON public.blocks FOR SELECT USING (blocker_id = (auth.uid())::text);
CREATE POLICY "blocks_insert_own" ON public.blocks FOR INSERT WITH CHECK (blocker_id = (auth.uid())::text);
CREATE POLICY "blocks_delete_own" ON public.blocks FOR DELETE USING (blocker_id = (auth.uid())::text);

CREATE TABLE public.conversations (
  id TEXT PRIMARY KEY, is_group BOOLEAN DEFAULT FALSE, passion_id TEXT,
  created_by TEXT, created_at TIMESTAMP DEFAULT NOW());
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conv_members (
  conv_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (conv_id, user_id));
ALTER TABLE public.conv_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conv_messages (
  id TEXT PRIMARY KEY, conv_id TEXT NOT NULL, from_id TEXT NOT NULL,
  text TEXT, created_at TIMESTAMP DEFAULT NOW());
ALTER TABLE public.conv_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conv_member(_conv_id TEXT, _uid TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.conv_members m WHERE m.conv_id = _conv_id AND m.user_id = _uid)
$$;
REVOKE EXECUTE ON FUNCTION public.is_conv_member(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.is_conv_member(TEXT, TEXT) TO anon, authenticated;

CREATE POLICY "conversations_select_member" ON public.conversations
  FOR SELECT USING (public.is_conv_member(id, ((SELECT auth.uid()))::text));
CREATE POLICY "Ecriture propre" ON public.conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Insert conversations" ON public.conversations FOR INSERT WITH CHECK (true);

CREATE POLICY "conv_members_select_member" ON public.conv_members
  FOR SELECT USING (public.is_conv_member(conv_id, ((SELECT auth.uid()))::text));
CREATE POLICY "Ecriture propre" ON public.conv_members FOR INSERT WITH CHECK (
  (user_id = (auth.uid())::text)
  OR (EXISTS (SELECT 1 FROM public.conversations c
              WHERE c.id = conv_members.conv_id AND c.created_by = (auth.uid())::text)));

CREATE POLICY "conv_messages_select_member" ON public.conv_messages
  FOR SELECT USING (public.is_conv_member(conv_id, ((SELECT auth.uid()))::text));
CREATE POLICY "Ecriture propre" ON public.conv_messages
  FOR INSERT WITH CHECK (from_id = (auth.uid())::text);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
