-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS PRIVÉES — LES DEUX RESTES DÉCLARÉS
-- (2026-11-27, après `migration_activites_privees_retraits_2026-11-26.sql`,
-- appliquée en staging et en production le 2026-11-26)
--
-- `npm run migration:appliquer -- migrations/migration_activites_privees_restes_2026-11-27.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict LÈVE si une
-- seule ligne est en ECHEC. AUCUN PRÉREQUIS CLIENT.
--
-- ① LA NOTIFICATION D'UN INVITÉ RETIRÉ — « t'invite à <titre> » restait chez
--    la personne retirée (le titre d'une activité qui ne lui est plus
--    visible). `retirer_invite_activite` supprime désormais ses
--    notifications `event_invite` de cette activité.
--
-- ② UN VISITEUR SANS COMPTE ET LES PUBLICATIONS D'UNE ACTIVITÉ PRIVÉE — un
--    album relié à une activité privée (`posts.event_id`), une carte ou un
--    repartage qui la cite (`shared_data`, ou la publication citée) restaient
--    lisibles par la clé anon, avec leurs commentaires, « j'aime » et
--    réponses. `publication_privee_pour_visiteur(id)` (SECURITY DEFINER : un
--    visiteur ne lit pas `events` privée, il ne pourrait donc pas en juger)
--    et des policies RESTRICTIVES au seul rôle anon sur `posts`,
--    `post_comments`, `post_likes`, `comment_interactions`. Un compte est
--    déjà couvert par `publication_masquee_pour_moi` (premier lot).
--    La fonction est exécutable par anon : elle dit si une publication cite
--    une activité privée — ce qu'un visiteur constate déjà en ne la voyant
--    pas. Aucun titre, aucun identifiant d'activité n'en sort.
--
-- RESTE (déclaré) : les « j'aime » d'un COMMENTAIRE (`comment_likes`, des
--    identifiants de compte) sous une telle publication, par la clé anon.
--
-- VERROUS : `lock_timeout` 3 s, `statement_timeout` 30 s.
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $garde$
begin
  if to_regclass('public.event_invites_retires') is null
     or to_regprocedure('public.activite_de_partage(text)') is null
     or to_regclass('public.notifications') is null then
    raise exception 'activites_privees_restes : la migration des retraits (migration_activites_privees_retraits_2026-11-26.sql) n''est pas appliquée';
  end if;
end
$garde$;

-- ── ① RETRAIT : la notification part avec l'invitation ──────────────────────
create or replace function public.retirer_invite_activite(p_event_id text, p_user_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  e record;
begin
  if auth.uid() is null or p_event_id is null or p_user_id is null
     or not public.organise_activite(p_event_id) then
    return false;
  end if;
  select author_id, organizer_id, co_organizers, visibilite into e from public.events where id = p_event_id;
  if not found or e.visibilite is distinct from 'privee' then return false; end if;
  -- Jamais un membre de l'organisation (ni soi-même).
  if p_user_id = e.author_id or p_user_id = e.organizer_id
     or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array' and e.co_organizers ? p_user_id) then
    return false;
  end if;
  delete from public.event_invites where event_id = p_event_id and user_id = p_user_id;
  delete from public.event_attendees where event_id = p_event_id and user_id = p_user_id;
  delete from public.conv_members where conv_id = 'evgrp_' || p_event_id and user_id = p_user_id;
  -- Le titre ne reste pas chez la personne retirée.
  delete from public.notifications where user_id = p_user_id and kind = 'event_invite' and ref_id = p_event_id;
  -- Le lien d'invitation ne le fera pas revenir (profil requis par la clé étrangère).
  if exists (select 1 from public.profiles where id = p_user_id) then
    insert into public.event_invites_retires (event_id, user_id) values (p_event_id, p_user_id)
      on conflict (event_id, user_id) do update set retire_le = now();
  end if;
  return true;
end
$$;

-- ── ② VISITEUR : les publications d'une activité privée ─────────────────────
create or replace function public.publication_privee_pour_visiteur(p_post_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_post_id is not null and exists (
    select 1 from public.posts p
     where p.id = p_post_id
       and (
         exists (select 1 from public.events e
                  where e.visibilite = 'privee'
                    and e.id in (p.event_id, public.activite_de_partage(p.shared_data)))
         or (p.shared_from_post_id is not null and exists (
               select 1 from public.posts c join public.events e
                 on e.visibilite = 'privee' and e.id in (c.event_id, public.activite_de_partage(c.shared_data))
                where c.id = p.shared_from_post_id))
       )
  )
$$;
revoke all on function public.publication_privee_pour_visiteur(text) from public;
grant execute on function public.publication_privee_pour_visiteur(text) to anon, authenticated, service_role;

drop policy if exists posts_privee_lecture_anon on public.posts;
create policy posts_privee_lecture_anon on public.posts
  as restrictive for select to anon
  using (not public.publication_privee_pour_visiteur(id));

drop policy if exists post_comments_privee_lecture_anon on public.post_comments;
create policy post_comments_privee_lecture_anon on public.post_comments
  as restrictive for select to anon
  using (not public.publication_privee_pour_visiteur(post_id));

drop policy if exists post_likes_privee_lecture_anon on public.post_likes;
create policy post_likes_privee_lecture_anon on public.post_likes
  as restrictive for select to anon
  using (not public.publication_privee_pour_visiteur(post_id));

drop policy if exists comment_interactions_privee_lecture_anon on public.comment_interactions;
create policy comment_interactions_privee_lecture_anon on public.comment_interactions
  as restrictive for select to anon
  using (post_id is null or not public.publication_privee_pour_visiteur(post_id));

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_activites_privees_restes on commit drop as
select * from (values
  (1, 'retirer_invite_activite supprime la notification d''invitation',
     pg_get_functiondef('public.retirer_invite_activite(text,text)'::regprocedure) like '%delete from public.notifications%'
     and pg_get_functiondef('public.retirer_invite_activite(text,text)'::regprocedure) like '%event_invites_retires%'),
  (2, 'retirer_invite_activite : toujours SECURITY DEFINER, search_path figé, sans anon',
     exists (select 1 from pg_proc where oid = 'public.retirer_invite_activite(text,text)'::regprocedure
              and prosecdef and proconfig @> array['search_path=""'])
     and not has_function_privilege('anon', 'public.retirer_invite_activite(text,text)', 'execute')),
  (3, 'publication_privee_pour_visiteur : SECURITY DEFINER, search_path figé',
     exists (select 1 from pg_proc where oid = 'public.publication_privee_pour_visiteur(text)'::regprocedure
              and prosecdef and proconfig @> array['search_path=""'])),
  (4, 'quatre lectures anonymes restreintes (posts, commentaires, j''aime, réponses)',
     (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
       and roles = '{anon}'
       and policyname in ('posts_privee_lecture_anon', 'post_comments_privee_lecture_anon',
                          'post_likes_privee_lecture_anon', 'comment_interactions_privee_lecture_anon')) = 4)
) as v(n, controle, ok_bool);

alter table _verdict_activites_privees_restes add column verdict text;
update _verdict_activites_privees_restes set verdict = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, verdict from _verdict_activites_privees_restes order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_activites_privees_restes where verdict <> 'OK') then
    raise exception 'activites_privees_restes : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_activites_privees_restes where verdict <> 'OK');
  end if;
end
$verdict$;

commit;
