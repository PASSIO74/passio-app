-- Cas du banc tests/sql/migration-story-interactions.test.sh. Identités simulées, données synthétiques.
-- Tout passe par anon / authenticated : un test sous un compte administrateur ne prouve rien.
set client_min_messages = warning;
create schema banc;
create table banc.resultats (n serial primary key, cas text not null, obtenu text, attendu text, ok boolean);
create function banc.sous(p_uid text, p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  begin
    perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute p_sql;
    get diagnostics n = row_count;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return 'ok:' || n;
  exception when others then
    execute 'reset role';
    return 'err:' || sqlstate;
  end;
end $f$;
create function banc.val(p_uid text, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  begin
    perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute p_sql into v;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v, 'nul');
  exception when others then
    execute 'reset role';
    return 'err:' || sqlstate;
  end;
end $f$;
create function banc.cas(p_cas text, p_obtenu text, p_attendu text) returns void language sql as $f$
  insert into banc.resultats (cas, obtenu, attendu, ok) values (p_cas, p_obtenu, p_attendu, p_obtenu is not distinct from p_attendu);
$f$;
create function banc.id(c text) returns text language sql immutable as $f$
  select case c when 'A' then 'aaaaaaaa-0000-4000-8000-000000000001' when 'B' then 'bbbbbbbb-0000-4000-8000-000000000002'
    when 'M' then 'cccccccc-0000-4000-8000-000000000003' when 'P' then '22222222-0000-4000-8000-000000000008'
    when 'F' then '44444444-0000-4000-8000-00000000000a' when 'K' then '33333333-0000-4000-8000-000000000009' end
$f$;
-- A : auteur public · P : auteur PRIVÉ · F : abonné accepté de P · B, M : inconnus · K : bloqué par A
insert into auth.users (id, email, email_confirmed_at, created_at)
  select banc.id(c)::uuid, lower(c) || '@passio-e2e.test', now(), now() - interval '30 days' from unnest(array['A','B','M','P','F','K']) c;
insert into public.profiles (id, username, is_private)
  select banc.id(c), 'compte' || lower(c), c = 'P' from unnest(array['A','B','M','P','F','K']) c;
insert into public.follows (follower_id, following_id, status) values (banc.id('F'), banc.id('P'), 'accepted');
-- `trg_follows_statut` pose `pending` vers un compte privé : P ACCEPTE ensuite la demande, comme en vrai.
update public.follows set status = 'accepted' where follower_id = banc.id('F') and following_id = banc.id('P');
select banc.cas('décor : F est abonné ACCEPTÉ de P', (select status from public.follows where follower_id = banc.id('F') and following_id = banc.id('P')), 'accepted');
insert into public.blocks (blocker_id, blocked_id) values (banc.id('A'), banc.id('K'));
insert into public.stories (id, author_id, content) values ('sA', banc.id('A'), 'story publique'), ('sP', banc.id('P'), 'story privée');

-- ── J'aime ───────────────────────────────────────────────────────────────────────────────────
select banc.cas('B aime la story publique de A', banc.sous(banc.id('B'), $s$insert into public.story_likes (story_id, user_id) values ('sA', (auth.uid())::text)$s$), 'ok:1');
select banc.cas('B ne peut pas aimer AU NOM de M', banc.sous(banc.id('B'), $s$insert into public.story_likes (story_id, user_id) values ('sA', 'cccccccc-0000-4000-8000-000000000003')$s$), 'err:42501');
select banc.cas('B n''aime pas la story d''un compte PRIVÉ qu''il ne suit pas', banc.sous(banc.id('B'), $s$insert into public.story_likes (story_id, user_id) values ('sP', (auth.uid())::text)$s$), 'err:42501');
select banc.cas('F, abonné accepté, aime la story privée de P', banc.sous(banc.id('F'), $s$insert into public.story_likes (story_id, user_id) values ('sP', (auth.uid())::text)$s$), 'ok:1');
select banc.cas('K, bloqué par A, n''aime pas sa story', banc.sous(banc.id('K'), $s$insert into public.story_likes (story_id, user_id) values ('sA', (auth.uid())::text)$s$), 'err:42501');
select banc.cas('une story inexistante ne s''aime pas', banc.sous(banc.id('B'), $s$insert into public.story_likes (story_id, user_id) values ('s_absente', (auth.uid())::text)$s$), 'err:42501');
select banc.cas('A (auteur) lit le j''aime de B', banc.val(banc.id('A'), $s$select count(*)::text from public.story_likes where story_id = 'sA'$s$), '1');
select banc.cas('M (tiers) ne lit PAS les j''aime de la story de A', banc.val(banc.id('M'), $s$select count(*)::text from public.story_likes where story_id = 'sA'$s$), '0');
select banc.cas('B lit son propre j''aime', banc.val(banc.id('B'), $s$select count(*)::text from public.story_likes where user_id = (auth.uid())::text$s$), '1');
select banc.cas('le visiteur ne lit rien', banc.val(null, $s$select count(*)::text from public.story_likes$s$), 'err:42501');
select banc.cas('M ne retire pas le j''aime de B', banc.sous(banc.id('M'), $s$delete from public.story_likes where story_id = 'sA'$s$), 'ok:0');
select banc.cas('B retire son j''aime', banc.sous(banc.id('B'), $s$delete from public.story_likes where story_id = 'sA' and user_id = (auth.uid())::text$s$), 'ok:1');

-- ── « Vu par » ───────────────────────────────────────────────────────────────────────────────
select banc.cas('B marque la story de A comme vue', banc.sous(banc.id('B'), $s$insert into public.story_views (story_id, user_id) values ('sA', (auth.uid())::text)$s$), 'ok:1');
select banc.cas('K (bloqué) marque aussi la story vue', banc.sous(banc.id('K'), $s$insert into public.story_views (story_id, user_id) values ('sA', (auth.uid())::text)$s$), 'ok:1');
select banc.cas('A lit « Vu par » : B, mais PAS le compte qu''il a bloqué', banc.val(banc.id('A'), $s$select string_agg(user_id, ',') from public.story_views where story_id = 'sA'$s$), 'bbbbbbbb-0000-4000-8000-000000000002');
select banc.cas('M ne lit pas qui a vu la story de A', banc.val(banc.id('M'), $s$select count(*)::text from public.story_views where story_id = 'sA'$s$), '0');
select banc.cas('B lit toujours ses propres vues (policy d''origine gardée)', banc.val(banc.id('B'), $s$select count(*)::text from public.story_views where user_id = (auth.uid())::text$s$), '1');

-- ── Commentaires ─────────────────────────────────────────────────────────────────────────────
select banc.cas('B commente la story publique de A', banc.sous(banc.id('B'), $s$insert into public.story_comments (id, story_id, author_id, content) values ('c1', 'sA', (auth.uid())::text, 'Superbe')$s$), 'ok:1');
select banc.cas('B ne commente pas au nom de M', banc.sous(banc.id('B'), $s$insert into public.story_comments (id, story_id, author_id, content) values ('c2', 'sA', 'cccccccc-0000-4000-8000-000000000003', 'x')$s$), 'err:42501');
select banc.cas('un commentaire vide est refusé', banc.sous(banc.id('B'), $s$insert into public.story_comments (story_id, author_id, content) values ('sA', (auth.uid())::text, '   ')$s$), 'err:23514');
select banc.cas('un commentaire de 501 caractères est refusé', banc.sous(banc.id('B'), $s$insert into public.story_comments (story_id, author_id, content) values ('sA', (auth.uid())::text, repeat('a', 501))$s$), 'err:23514');
select banc.cas('M (tiers) LIT le commentaire public', banc.val(banc.id('M'), $s$select count(*)::text from public.story_comments where story_id = 'sA'$s$), '1');
select banc.cas('K (bloqué par A) ne lit pas les commentaires de sa story', banc.val(banc.id('K'), $s$select count(*)::text from public.story_comments where story_id = 'sA'$s$), '0');
select banc.cas('K ne commente pas la story de A', banc.sous(banc.id('K'), $s$insert into public.story_comments (story_id, author_id, content) values ('sA', (auth.uid())::text, 'x')$s$), 'err:42501');
select banc.cas('le visiteur ne lit pas les commentaires', banc.val(null, $s$select count(*)::text from public.story_comments$s$), 'err:42501');
select banc.cas('F commente la story privée de P', banc.sous(banc.id('F'), $s$insert into public.story_comments (id, story_id, author_id, content) values ('c3', 'sP', (auth.uid())::text, 'Bravo')$s$), 'ok:1');
select banc.cas('B ne lit pas les commentaires d''une story privée', banc.val(banc.id('B'), $s$select count(*)::text from public.story_comments where story_id = 'sP'$s$), '0');
select banc.cas('F les lit', banc.val(banc.id('F'), $s$select count(*)::text from public.story_comments where story_id = 'sP'$s$), '1');
select banc.cas('aucun commentaire ne se modifie', banc.sous(banc.id('B'), $s$update public.story_comments set content = 'modifié' where id = 'c1'$s$), 'err:42501');
select banc.cas('M ne supprime pas le commentaire de B', banc.sous(banc.id('M'), $s$delete from public.story_comments where id = 'c1'$s$), 'ok:0');
select banc.cas('A (auteur de la story) supprime le commentaire de B', banc.sous(banc.id('A'), $s$delete from public.story_comments where id = 'c1'$s$), 'ok:1');
select banc.cas('F supprime son propre commentaire', banc.sous(banc.id('F'), $s$delete from public.story_comments where id = 'c3'$s$), 'ok:1');

-- ── Fonctions et cascade ─────────────────────────────────────────────────────────────────────
select banc.cas('le visiteur n''exécute pas story_visible', banc.val(null, $s$select public.story_visible('sA')::text$s$), 'err:42501');
select banc.cas('story_est_a_moi : vrai pour A', banc.val(banc.id('A'), $s$select public.story_est_a_moi('sA')::text$s$), 'true');
select banc.cas('story_est_a_moi : faux pour B', banc.val(banc.id('B'), $s$select public.story_est_a_moi('sA')::text$s$), 'false');
insert into public.story_likes (story_id, user_id) values ('sA', banc.id('M'));
insert into public.story_comments (story_id, author_id, content) values ('sA', banc.id('M'), 'reste');
delete from public.stories where id = 'sA';
select banc.cas('supprimer la story emporte ses j''aime', (select count(*)::text from public.story_likes where story_id = 'sA'), '0');
select banc.cas('supprimer la story emporte ses commentaires', (select count(*)::text from public.story_comments where story_id = 'sA'), '0');
