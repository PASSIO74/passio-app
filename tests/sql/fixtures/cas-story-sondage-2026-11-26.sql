-- Cas du banc tests/sql/migration-story-sondage.test.sh. Identités simulées, données synthétiques.
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
insert into public.stories (id, author_id, content, overlays) values
  ('sA', banc.id('A'), 'sondage public', '[{"type":"text","text":"x"},{"type":"sondage","q":"Plage ou montagne ?","a":"Plage","b":"Montagne"}]'::jsonb),
  ('sN', banc.id('A'), 'sans sondage', '[{"type":"text","text":"x"}]'::jsonb),
  ('sP', banc.id('P'), 'sondage privé', '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb);

-- ── Voter ────────────────────────────────────────────────────────────────────────────────────
select banc.cas('B ne voit pas les résultats AVANT de voter', banc.val(banc.id('B'), $s$select public.story_sondage_resultats('sA')::text$s$), '{"a_vote": false}');
select banc.cas('B vote Plage sur la story publique de A', banc.sous(banc.id('B'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sA', 0)$s$), 'ok:1');
select banc.cas('B ne vote pas deux fois', banc.sous(banc.id('B'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sA', 1)$s$), 'err:23505');
select banc.cas('B ne change pas son vote (aucun UPDATE)', banc.sous(banc.id('B'), $s$update public.story_sondage_votes set choix = 1 where story_id = 'sA'$s$), 'err:42501');
select banc.cas('B ne retire pas son vote (aucun DELETE)', banc.sous(banc.id('B'), $s$delete from public.story_sondage_votes where story_id = 'sA'$s$), 'err:42501');
select banc.cas('B ne vote pas AU NOM de M', banc.sous(banc.id('B'), $s$insert into public.story_sondage_votes (story_id, user_id, choix) values ('sA', 'cccccccc-0000-4000-8000-000000000003', 1)$s$), 'err:42501');
select banc.cas('un choix hors 0/1 est refusé', banc.sous(banc.id('M'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sA', 2)$s$), 'err:23514');
select banc.cas('M vote Montagne', banc.sous(banc.id('M'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sA', 1)$s$), 'ok:1');
select banc.cas('pas de vote sur une story SANS sondage', banc.sous(banc.id('B'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sN', 0)$s$), 'err:42501');
select banc.cas('l''auteur ne vote pas à son propre sondage', banc.sous(banc.id('A'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sA', 0)$s$), 'err:42501');
select banc.cas('pas de vote sur la story d''un compte PRIVÉ non suivi', banc.sous(banc.id('B'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sP', 0)$s$), 'err:42501');
select banc.cas('l''abonné accepté vote sur la story privée', banc.sous(banc.id('F'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sP', 1)$s$), 'ok:1');
select banc.cas('le compte bloqué par A ne vote pas', banc.sous(banc.id('K'), $s$insert into public.story_sondage_votes (story_id, choix) values ('sA', 0)$s$), 'err:42501');
select banc.cas('un visiteur (anon) ne vote pas', banc.sous(null, $s$insert into public.story_sondage_votes (story_id, choix) values ('sA', 0)$s$), 'err:42501');
-- ── Lire ─────────────────────────────────────────────────────────────────────────────────────
select banc.cas('B lit SON vote seulement', banc.val(banc.id('B'), $s$select count(*)::text from public.story_sondage_votes$s$), '1');
select banc.cas('l''auteur A lit qui a voté quoi', banc.val(banc.id('A'), $s$select string_agg(choix::text, ',' order by choix) from public.story_sondage_votes where story_id = 'sA'$s$), '0,1');
select banc.cas('après son vote, B voit les comptes et son choix', banc.val(banc.id('B'), $s$select public.story_sondage_resultats('sA')::text$s$), '{"a": 1, "b": 1, "a_vote": true, "mon_choix": 0}');
select banc.cas('l''auteur voit les comptes sans voter', banc.val(banc.id('A'), $s$select (public.story_sondage_resultats('sA') ->> 'a') || '/' || (public.story_sondage_resultats('sA') ->> 'b')$s$), '1/1');
select banc.cas('un inconnu ne lit pas les résultats d''une story privée', banc.val(banc.id('B'), $s$select coalesce(public.story_sondage_resultats('sP')::text, 'nul')$s$), 'nul');
select banc.cas('anon n''appelle pas la fonction de résultats', banc.val(null, $s$select public.story_sondage_resultats('sA')::text$s$), 'err:42501');
select banc.cas('anon ne lit pas les votes', banc.val(null, $s$select count(*)::text from public.story_sondage_votes$s$), 'err:42501');
