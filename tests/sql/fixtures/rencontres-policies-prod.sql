-- Policies métier de la photographie fournie, installées après les fonctions.
alter table public.events enable row level security;
create policy "Lecture publique" on public.events as PERMISSIVE for SELECT to "public" using (true);
create policy "Suppression propre" on public.events as PERMISSIVE for DELETE to "public" using ((author_id = (( SELECT auth.uid() AS uid))::text));
create policy "Update organisateurs" on public.events as PERMISSIVE for UPDATE to "public" using (((author_id = (( SELECT auth.uid() AS uid))::text) OR jsonb_exists(co_organizers, (( SELECT auth.uid() AS uid))::text))) with check ((((author_id = (( SELECT auth.uid() AS uid))::text) OR jsonb_exists(co_organizers, (( SELECT auth.uid() AS uid))::text)) AND (NOT suppression_de_mon_compte())));
create policy "events_insert_author_adult" on public.events as PERMISSIVE for INSERT to "authenticated" with check (((author_id = (( SELECT auth.uid() AS uid))::text) AND adult_access_allowed() AND (NOT suppression_de_mon_compte())));
alter table public.conversations enable row level security;
create policy "Suppression conversation orpheline" on public.conversations as PERMISSIVE for DELETE to "public" using (((created_by = (( SELECT auth.uid() AS uid))::text) AND (NOT (EXISTS ( SELECT 1
   FROM conv_members m
  WHERE (m.conv_id = conversations.id))))));
create policy "conversations_insert_creator" on public.conversations as PERMISSIVE for INSERT to "authenticated" with check (((created_by = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte()) AND (("left"(id, 6) <> 'evgrp_'::text) OR organise_activite(substr(id, 7)))));
create policy "conversations_select_member" on public.conversations as PERMISSIVE for SELECT to "authenticated" using ((is_conv_member(id, (( SELECT auth.uid() AS uid))::text) OR (created_by = (( SELECT auth.uid() AS uid))::text)));
alter table public.conv_members enable row level security;
create policy "Ecriture propre" on public.conv_members as PERMISSIVE for INSERT to "authenticated" with check (((is_conversation_creator(conv_id) OR ((user_id = (( SELECT auth.uid() AS uid))::text) AND can_join_event_conversation(conv_id))) AND (NOT is_blocked_with(user_id)) AND (NOT suppression_de_mon_compte())));
create policy "Suppression admin" on public.conv_members as PERMISSIVE for DELETE to "public" using (((user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conv_members.conv_id) AND (c.created_by = (( SELECT auth.uid() AS uid))::text))))));
create policy "conv_members_select_member" on public.conv_members as PERMISSIVE for SELECT to "authenticated" using ((is_conv_member(conv_id, (( SELECT auth.uid() AS uid))::text) AND (("left"(conv_id, 6) <> 'evgrp_'::text) OR (user_id = (( SELECT auth.uid() AS uid))::text) OR (NOT is_blocked_with(user_id)) OR is_conversation_creator(conv_id))));
create policy "conv_members_sourdine_propre" on public.conv_members as PERMISSIVE for UPDATE to "authenticated" using ((user_id = (( SELECT auth.uid() AS uid))::text)) with check ((user_id = (( SELECT auth.uid() AS uid))::text));
