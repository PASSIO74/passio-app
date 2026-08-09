-- ═══════════════════════════════════════════════════════════════════════════
-- CONFIDENTIALITÉ — fermeture d'une fuite CRITIQUE (2026-08-09).
--
-- Constat (audit RLS) : conv_messages / conv_members / conversations avaient une
-- policy SELECT « USING true » → N'IMPORTE QUEL utilisateur authentifié pouvait
-- lire TOUS les messages privés (texte + URLs de vocaux) de TOUT LE MONDE via un
-- simple `supa.from('conv_messages').select('*')`. + stories en SELECT true
-- (les stories d'un compte privé fuyaient, contrairement à ses posts).
--
-- Correctif : lecture réservée aux MEMBRES de la conversation (helper SECURITY
-- DEFINER anti-récursion) ; stories alignées sur la policy « comptes privés » des
-- posts. supaCreateConversation insère déjà les DEUX membres → aucun impact sur
-- la messagerie légitime (vérifié : multi-comptes messagerie + test dédié
-- confidentialite.spec.js). Le realtime respecte la RLS du SELECT → un membre
-- reçoit, un non-membre non.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.is_conv_member(_conv_id text, _uid text)
returns boolean language sql security definer stable set search_path = ''
as $$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $$;
revoke execute on function public.is_conv_member(text, text) from public;
grant execute on function public.is_conv_member(text, text) to anon, authenticated;

drop policy if exists "Lecture publique" on public.conv_messages;
drop policy if exists "Read conv_messages" on public.conv_messages;
create policy "Membres lisent les messages" on public.conv_messages
  for select using (public.is_conv_member(conv_id, (auth.uid())::text));

drop policy if exists "Lecture publique" on public.conv_members;
drop policy if exists "Read conv_members" on public.conv_members;
create policy "Membres lisent les membres" on public.conv_members
  for select using (public.is_conv_member(conv_id, (auth.uid())::text));

drop policy if exists "Lecture publique" on public.conversations;
drop policy if exists "Read conversations" on public.conversations;
create policy "Membres lisent la conversation" on public.conversations
  for select using (public.is_conv_member(id, (auth.uid())::text));

drop policy if exists "Lecture publique" on public.stories;
drop policy if exists "Read stories" on public.stories;
create policy "Lecture stories respectant les comptes prives" on public.stories
  for select using (
    author_id = (auth.uid())::text
    or not exists (select 1 from public.profiles pr where pr.id = stories.author_id and pr.is_private = true)
    or exists (select 1 from public.follows f where f.follower_id = (auth.uid())::text and f.following_id = stories.author_id)
  );
