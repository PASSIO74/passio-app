-- Purge des comptes e2e jetables (%@passio-e2e.test) créés par la suite
-- multi-comptes (PASSIO_E2E_MULTI=1). Enfants d'abord (FK vers profiles/auth).
-- Usage : npm run purge:e2e  (ou : supabase db query --linked --file scripts/purge_e2e_accounts.sql)
-- ⚠️ Nécessite la CLI Supabase LIÉE au projet (répertoire principal du repo).
create temporary table _e2e_uids as
  select id::text as tid, id as uid from auth.users where email like '%@passio-e2e.test';

delete from conv_messages where from_id in (select tid from _e2e_uids)
  or conv_id in (select conv_id from conv_members where user_id in (select tid from _e2e_uids));
delete from conv_reads where user_id in (select tid from _e2e_uids);
delete from conv_members where user_id in (select tid from _e2e_uids);
delete from notifications where user_id in (select tid from _e2e_uids) or from_id in (select tid from _e2e_uids);
delete from comment_interactions where user_id in (select tid from _e2e_uids);
delete from post_comments where author_id in (select tid from _e2e_uids);
delete from post_likes where user_id in (select tid from _e2e_uids);
delete from follows where follower_id in (select tid from _e2e_uids) or following_id in (select tid from _e2e_uids);
delete from posts where author_id in (select tid from _e2e_uids);
delete from stories where author_id in (select tid from _e2e_uids);
delete from event_attendees where user_id in (select tid from _e2e_uids);
delete from event_reactions where user_id in (select tid from _e2e_uids);
delete from events where author_id in (select tid from _e2e_uids);
delete from cdv_live_comments where author_id in (select tid from _e2e_uids);
delete from cdv_live_reactions where user_id in (select tid from _e2e_uids);
delete from cdv_live_followers where user_id in (select tid from _e2e_uids);
delete from cdv_lives where author_id in (select tid from _e2e_uids);
delete from blocks where blocker_id in (select tid from _e2e_uids) or blocked_id in (select tid from _e2e_uids);
delete from push_subscriptions where user_id in (select tid from _e2e_uids);
delete from user_state where user_id in (select tid from _e2e_uids);
delete from profiles where id in (select tid from _e2e_uids);
delete from auth.users where id in (select uid from _e2e_uids);

select count(*) as comptes_e2e_restants from auth.users where email like '%@passio-e2e.test';
