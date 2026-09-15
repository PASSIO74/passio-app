-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — auth.uid() calculé une fois par requête, pas par ligne (PERF-03, 2026-09-14)
--
-- GÉNÉRÉ par scripts/generer-migration-initplan.mjs depuis les policies de
-- production : 69 policies réécrites, à l'identique sauf
-- `auth.uid()` → `(select auth.uid())`. Une transaction, rejouable, verdict
-- en fin (policies qui appellent encore auth.uid() nu : attendu 0).
-- Vérification après application : get_advisors(performance) — auth_rls_initplan
-- = 0 — et les suites à comptes réels de la CI (authz-critical), qui exercent
-- ces policies. Ne pas retoucher à la main : régénérer.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- analytics_events · analytics_insert_own (INSERT)
drop policy if exists "analytics_insert_own" on public."analytics_events";
create policy "analytics_insert_own" on public."analytics_events"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- blocks · blocks_delete_own (DELETE)
drop policy if exists "blocks_delete_own" on public."blocks";
create policy "blocks_delete_own" on public."blocks"
  as permissive for delete to public
  using ((blocker_id = ((select auth.uid()))::text));

-- blocks · blocks_insert_own (INSERT)
drop policy if exists "blocks_insert_own" on public."blocks";
create policy "blocks_insert_own" on public."blocks"
  as permissive for insert to public
  with check ((blocker_id = ((select auth.uid()))::text));

-- cdv_live_collaborators · cdv_collab_delete (DELETE)
drop policy if exists "cdv_collab_delete" on public."cdv_live_collaborators";
create policy "cdv_collab_delete" on public."cdv_live_collaborators"
  as permissive for delete to public
  using (((user_id = ((select auth.uid()))::text) OR (EXISTS ( SELECT 1
   FROM cdv_lives l
  WHERE ((l.id = cdv_live_collaborators.live_id) AND (l.author_id = ((select auth.uid()))::text))))));

-- cdv_live_collaborators · cdv_collab_insert_owner (INSERT)
drop policy if exists "cdv_collab_insert_owner" on public."cdv_live_collaborators";
create policy "cdv_collab_insert_owner" on public."cdv_live_collaborators"
  as permissive for insert to public
  with check (((added_by = ((select auth.uid()))::text) AND (EXISTS ( SELECT 1
   FROM cdv_lives l
  WHERE ((l.id = cdv_live_collaborators.live_id) AND (l.author_id = ((select auth.uid()))::text))))));

-- cdv_live_comments · cdv_comments_delete_own (DELETE)
drop policy if exists "cdv_comments_delete_own" on public."cdv_live_comments";
create policy "cdv_comments_delete_own" on public."cdv_live_comments"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- cdv_live_comments · cdv_comments_insert_own (INSERT)
drop policy if exists "cdv_comments_insert_own" on public."cdv_live_comments";
create policy "cdv_comments_insert_own" on public."cdv_live_comments"
  as permissive for insert to public
  with check ((author_id = ((select auth.uid()))::text));

-- cdv_live_followers · cdv_followers_delete_own (DELETE)
drop policy if exists "cdv_followers_delete_own" on public."cdv_live_followers";
create policy "cdv_followers_delete_own" on public."cdv_live_followers"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- cdv_live_followers · cdv_followers_insert_own (INSERT)
drop policy if exists "cdv_followers_insert_own" on public."cdv_live_followers";
create policy "cdv_followers_insert_own" on public."cdv_live_followers"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- cdv_live_reactions · cdv_reactions_delete_own (DELETE)
drop policy if exists "cdv_reactions_delete_own" on public."cdv_live_reactions";
create policy "cdv_reactions_delete_own" on public."cdv_live_reactions"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- cdv_live_reactions · cdv_reactions_insert_own (INSERT)
drop policy if exists "cdv_reactions_insert_own" on public."cdv_live_reactions";
create policy "cdv_reactions_insert_own" on public."cdv_live_reactions"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- cdv_live_steps · cdv_steps_delete_own (DELETE)
drop policy if exists "cdv_steps_delete_own" on public."cdv_live_steps";
create policy "cdv_steps_delete_own" on public."cdv_live_steps"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- cdv_live_steps · cdv_steps_insert_own (INSERT)
drop policy if exists "cdv_steps_insert_own" on public."cdv_live_steps";
create policy "cdv_steps_insert_own" on public."cdv_live_steps"
  as permissive for insert to public
  with check ((author_id = ((select auth.uid()))::text));

-- cdv_live_steps · cdv_steps_update_own (UPDATE)
drop policy if exists "cdv_steps_update_own" on public."cdv_live_steps";
create policy "cdv_steps_update_own" on public."cdv_live_steps"
  as permissive for update to public
  using ((author_id = ((select auth.uid()))::text))
  with check ((author_id = ((select auth.uid()))::text));

-- cdv_lives · cdv_lives_delete_own (DELETE)
drop policy if exists "cdv_lives_delete_own" on public."cdv_lives";
create policy "cdv_lives_delete_own" on public."cdv_lives"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- cdv_lives · cdv_lives_insert_own (INSERT)
drop policy if exists "cdv_lives_insert_own" on public."cdv_lives";
create policy "cdv_lives_insert_own" on public."cdv_lives"
  as permissive for insert to public
  with check ((author_id = ((select auth.uid()))::text));

-- cdv_lives · cdv_lives_update_own (UPDATE)
drop policy if exists "cdv_lives_update_own" on public."cdv_lives";
create policy "cdv_lives_update_own" on public."cdv_lives"
  as permissive for update to public
  using ((author_id = ((select auth.uid()))::text));

-- comment_interactions · ci_delete (DELETE)
drop policy if exists "ci_delete" on public."comment_interactions";
create policy "ci_delete" on public."comment_interactions"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- comment_interactions · ci_insert (INSERT)
drop policy if exists "ci_insert" on public."comment_interactions";
create policy "ci_insert" on public."comment_interactions"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- comment_likes · comment_likes_delete_own (DELETE)
drop policy if exists "comment_likes_delete_own" on public."comment_likes";
create policy "comment_likes_delete_own" on public."comment_likes"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- comment_likes · comment_likes_insert_own (INSERT)
drop policy if exists "comment_likes_insert_own" on public."comment_likes";
create policy "comment_likes_insert_own" on public."comment_likes"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- conv_members · Suppression admin (DELETE)
drop policy if exists "Suppression admin" on public."conv_members";
create policy "Suppression admin" on public."conv_members"
  as permissive for delete to public
  using (((user_id = ((select auth.uid()))::text) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conv_members.conv_id) AND (c.created_by = ((select auth.uid()))::text))))));

-- conv_members · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."conv_members";
create policy "Suppression propre" on public."conv_members"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- conv_messages · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."conv_messages";
create policy "Suppression propre" on public."conv_messages"
  as permissive for delete to public
  using ((from_id = ((select auth.uid()))::text));

-- conv_reads · reads_update (UPDATE)
drop policy if exists "reads_update" on public."conv_reads";
create policy "reads_update" on public."conv_reads"
  as permissive for update to public
  using ((user_id = ((select auth.uid()))::text));

-- conv_reads · reads_upsert (INSERT)
drop policy if exists "reads_upsert" on public."conv_reads";
create policy "reads_upsert" on public."conv_reads"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- event_attendees · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."event_attendees";
create policy "Suppression propre" on public."event_attendees"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- event_checkin_secrets · secret_lisible_par_organisateurs (SELECT)
drop policy if exists "secret_lisible_par_organisateurs" on public."event_checkin_secrets";
create policy "secret_lisible_par_organisateurs" on public."event_checkin_secrets"
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_checkin_secrets.event_id) AND ((e.author_id = ((select auth.uid()))::text) OR ((e.co_organizers IS NOT NULL) AND (jsonb_typeof(e.co_organizers) = 'array'::text) AND (e.co_organizers ? ((select auth.uid()))::text)))))));

-- event_comments · event_comments_delete_own (DELETE)
drop policy if exists "event_comments_delete_own" on public."event_comments";
create policy "event_comments_delete_own" on public."event_comments"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- event_reactions · event_reactions_delete (DELETE)
drop policy if exists "event_reactions_delete" on public."event_reactions";
create policy "event_reactions_delete" on public."event_reactions"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- event_reactions · event_reactions_insert (INSERT)
drop policy if exists "event_reactions_insert" on public."event_reactions";
create policy "event_reactions_insert" on public."event_reactions"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- events · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."events";
create policy "Suppression propre" on public."events"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- events · Update organisateurs (UPDATE)
drop policy if exists "Update organisateurs" on public."events";
create policy "Update organisateurs" on public."events"
  as permissive for update to public
  using (((author_id = ((select auth.uid()))::text) OR jsonb_exists(co_organizers, ((select auth.uid()))::text)));

-- follows · Suppression cote suivi (DELETE)
drop policy if exists "Suppression cote suivi" on public."follows";
create policy "Suppression cote suivi" on public."follows"
  as permissive for delete to public
  using ((following_id = ((select auth.uid()))::text));

-- follows · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."follows";
create policy "Suppression propre" on public."follows"
  as permissive for delete to public
  using ((follower_id = ((select auth.uid()))::text));

-- notifications · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."notifications";
create policy "Suppression propre" on public."notifications"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- notifications · Update propre (UPDATE)
drop policy if exists "Update propre" on public."notifications";
create policy "Update propre" on public."notifications"
  as permissive for update to public
  using ((user_id = ((select auth.uid()))::text));

-- passion_quotas · passion_quotas_select_own (SELECT)
drop policy if exists "passion_quotas_select_own" on public."passion_quotas";
create policy "passion_quotas_select_own" on public."passion_quotas"
  as permissive for select to public
  using ((user_id = (select auth.uid())));

-- passion_requests · passion_requests_insert_own (INSERT)
drop policy if exists "passion_requests_insert_own" on public."passion_requests";
create policy "passion_requests_insert_own" on public."passion_requests"
  as permissive for insert to public
  with check (((user_id = ((select auth.uid()))::text) AND (status = 'pending'::text) AND (resolved_passion_id IS NULL) AND (( SELECT count(*) AS count
   FROM passion_requests r
  WHERE ((r.user_id = ((select auth.uid()))::text) AND (r.created_at > (now() - '24:00:00'::interval)))) < 5)));

-- passion_requests · passion_requests_select_own (SELECT)
drop policy if exists "passion_requests_select_own" on public."passion_requests";
create policy "passion_requests_select_own" on public."passion_requests"
  as permissive for select to public
  using ((user_id = ((select auth.uid()))::text));

-- post_collaborators · post_collab_delete (DELETE)
drop policy if exists "post_collab_delete" on public."post_collaborators";
create policy "post_collab_delete" on public."post_collaborators"
  as permissive for delete to public
  using (((user_id = ((select auth.uid()))::text) OR (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_collaborators.post_id) AND (p.author_id = ((select auth.uid()))::text))))));

-- post_collaborators · post_collab_insert_owner (INSERT)
drop policy if exists "post_collab_insert_owner" on public."post_collaborators";
create policy "post_collab_insert_owner" on public."post_collaborators"
  as permissive for insert to public
  with check (((added_by = ((select auth.uid()))::text) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_collaborators.post_id) AND (p.author_id = ((select auth.uid()))::text))))));

-- post_comments · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."post_comments";
create policy "Suppression propre" on public."post_comments"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- post_likes · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."post_likes";
create policy "Suppression propre" on public."post_likes"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- posts · Ecriture propre (INSERT)
drop policy if exists "Ecriture propre" on public."posts";
create policy "Ecriture propre" on public."posts"
  as permissive for insert to public
  with check ((author_id = ((select auth.uid()))::text));

-- posts · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."posts";
create policy "Suppression propre" on public."posts"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- profiles · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."profiles";
create policy "Suppression propre" on public."profiles"
  as permissive for delete to public
  using ((id = ((select auth.uid()))::text));

-- profiles · Update propre (UPDATE)
drop policy if exists "Update propre" on public."profiles";
create policy "Update propre" on public."profiles"
  as permissive for update to public
  using ((id = ((select auth.uid()))::text));

-- profiles · Upsert propre (INSERT)
drop policy if exists "Upsert propre" on public."profiles";
create policy "Upsert propre" on public."profiles"
  as permissive for insert to public
  with check ((id = ((select auth.uid()))::text));

-- push_subscriptions · push_delete_own (DELETE)
drop policy if exists "push_delete_own" on public."push_subscriptions";
create policy "push_delete_own" on public."push_subscriptions"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- push_subscriptions · push_insert_own (INSERT)
drop policy if exists "push_insert_own" on public."push_subscriptions";
create policy "push_insert_own" on public."push_subscriptions"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- push_subscriptions · push_update_own (UPDATE)
drop policy if exists "push_update_own" on public."push_subscriptions";
create policy "push_update_own" on public."push_subscriptions"
  as permissive for update to public
  using ((user_id = ((select auth.uid()))::text));

-- reports · reports_insert (INSERT)
drop policy if exists "reports_insert" on public."reports";
create policy "reports_insert" on public."reports"
  as permissive for insert to public
  with check ((reporter_id = ((select auth.uid()))::text));

-- step_interactions · si_delete (DELETE)
drop policy if exists "si_delete" on public."step_interactions";
create policy "si_delete" on public."step_interactions"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- step_interactions · si_insert (INSERT)
drop policy if exists "si_insert" on public."step_interactions";
create policy "si_insert" on public."step_interactions"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- stories · Ecriture propre (INSERT)
drop policy if exists "Ecriture propre" on public."stories";
create policy "Ecriture propre" on public."stories"
  as permissive for insert to public
  with check ((author_id = ((select auth.uid()))::text));

-- stories · Suppression propre (DELETE)
drop policy if exists "Suppression propre" on public."stories";
create policy "Suppression propre" on public."stories"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- story_views · story_views_delete_own (DELETE)
drop policy if exists "story_views_delete_own" on public."story_views";
create policy "story_views_delete_own" on public."story_views"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- story_views · story_views_insert_own (INSERT)
drop policy if exists "story_views_insert_own" on public."story_views";
create policy "story_views_insert_own" on public."story_views"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- telemetry_events · telemetry_insert_own (INSERT)
drop policy if exists "telemetry_insert_own" on public."telemetry_events";
create policy "telemetry_insert_own" on public."telemetry_events"
  as permissive for insert to public
  with check (((user_id IS NULL) OR (user_id = ((select auth.uid()))::text)));

-- user_passions · user_passions_delete_own (DELETE)
drop policy if exists "user_passions_delete_own" on public."user_passions";
create policy "user_passions_delete_own" on public."user_passions"
  as permissive for delete to public
  using ((user_id = ((select auth.uid()))::text));

-- user_passions · user_passions_insert_own (INSERT)
drop policy if exists "user_passions_insert_own" on public."user_passions";
create policy "user_passions_insert_own" on public."user_passions"
  as permissive for insert to public
  with check ((user_id = ((select auth.uid()))::text));

-- user_passions · user_passions_update_own (UPDATE)
drop policy if exists "user_passions_update_own" on public."user_passions";
create policy "user_passions_update_own" on public."user_passions"
  as permissive for update to public
  using ((user_id = ((select auth.uid()))::text))
  with check ((user_id = ((select auth.uid()))::text));

-- user_state · user_state_delete_own (DELETE)
drop policy if exists "user_state_delete_own" on public."user_state";
create policy "user_state_delete_own" on public."user_state"
  as permissive for delete to public
  using ((((select auth.uid()))::text = user_id));

-- user_state · user_state_insert_own (INSERT)
drop policy if exists "user_state_insert_own" on public."user_state";
create policy "user_state_insert_own" on public."user_state"
  as permissive for insert to public
  with check ((((select auth.uid()))::text = user_id));

-- user_state · user_state_update_own (UPDATE)
drop policy if exists "user_state_update_own" on public."user_state";
create policy "user_state_update_own" on public."user_state"
  as permissive for update to public
  using ((((select auth.uid()))::text = user_id))
  with check ((((select auth.uid()))::text = user_id));

-- video_lives · video_lives_delete (DELETE)
drop policy if exists "video_lives_delete" on public."video_lives";
create policy "video_lives_delete" on public."video_lives"
  as permissive for delete to public
  using ((author_id = ((select auth.uid()))::text));

-- video_lives · video_lives_insert (INSERT)
drop policy if exists "video_lives_insert" on public."video_lives";
create policy "video_lives_insert" on public."video_lives"
  as permissive for insert to public
  with check ((author_id = ((select auth.uid()))::text));

-- video_lives · video_lives_update (UPDATE)
drop policy if exists "video_lives_update" on public."video_lives";
create policy "video_lives_update" on public."video_lives"
  as permissive for update to public
  using ((author_id = ((select auth.uid()))::text));

select 'policies avec auth.uid() nu' as controle, count(*)::text as valeur from pg_policies where schemaname = 'public' and (regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\(\s*(SELECT|select)\s+auth\.uid\(\)( AS uid)?\s*\)', '', 'g') ~ 'auth\.uid\(\)');
commit;
