-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE reproduisant la partie de la PROD PASSIO que touche #136.
--
-- Recopié depuis `migrations/SCHEMA_PROD_REFERENCE.sql` (policies exactes) :
-- c'est ce qui rend le banc probant. Un socle approximatif ferait passer les
-- assertions pour de mauvaises raisons — mesuré : sans la policy SELECT de
-- `conversations`, la branche « le créateur ajoute un membre » échouait pour
-- TOUT LE MONDE, et le test « un compte bloqué ne peut pas être ajouté »
-- passait sans rien prouver.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE SCHEMA IF NOT EXISTS auth;
-- auth.uid() de Supabase : lit le claim JWT de la requête courante.
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

CREATE OR REPLACE FUNCTION public.is_conv_member(_conv_id TEXT, _uid TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.conv_members m WHERE m.conv_id = _conv_id AND m.user_id = _uid)
$$;
REVOKE EXECUTE ON FUNCTION public.is_conv_member(TEXT, TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION public.is_conv_member(TEXT, TEXT) TO anon, authenticated;

CREATE POLICY "conversations_select_member" ON public.conversations
  FOR SELECT USING (public.is_conv_member(id, ((SELECT auth.uid()))::text));
CREATE POLICY "Ecriture propre" ON public.conversations FOR INSERT WITH CHECK (true);

CREATE POLICY "conv_members_select_member" ON public.conv_members
  FOR SELECT USING (public.is_conv_member(conv_id, ((SELECT auth.uid()))::text));

-- ⚠️ LA POLICY DE PROD, TELLE QUELLE — c'est le trou que la migration ferme.
CREATE POLICY "Ecriture propre" ON public.conv_members FOR INSERT WITH CHECK (
  (user_id = (auth.uid())::text)
  OR (EXISTS (SELECT 1 FROM public.conversations c
              WHERE c.id = conv_members.conv_id AND c.created_by = (auth.uid())::text)));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
