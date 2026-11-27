-- Cas du banc tests/sql/migration-bobine-sondage.test.sh. Identités simulées, données synthétiques.
-- Tout passe par anon / authenticated : un test sous un compte administrateur ne prouve rien.
-- ⚠️ Un « faire puis compter » s'écrit en DEUX cas : dans `select f() || (select count(*) …)`, la
-- sous-requête non corrélée est évaluée AVANT f() (piège du banc des stories « proches »).
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
  select case c
    when 'A' then 'aaaaaaaa-0000-4000-8000-000000000001' when 'P' then '22222222-0000-4000-8000-000000000002'
    when 'F' then '44444444-0000-4000-8000-000000000003' when 'W' then '55555555-0000-4000-8000-000000000004'
    when 'B' then 'bbbbbbbb-0000-4000-8000-000000000005' when 'M' then 'cccccccc-0000-4000-8000-000000000006'
    when 'N' then 'dddddddd-0000-4000-8000-000000000007' when 'K' then '33333333-0000-4000-8000-000000000008'
    when 'J' then '66666666-0000-4000-8000-000000000009' when 'S' then '77777777-0000-4000-8000-00000000000a'
    when 'U' then '88888888-0000-4000-8000-00000000000b' when 'I' then '99999999-0000-4000-8000-00000000000c' end
$f$;
-- Le vote d'un compte dont le compteur de la minute est déjà au plafond (même transaction : même minute).
create function banc.vote_au_plafond(p_uid text, p_post text) returns text language plpgsql as $f$
begin
  insert into public.debit_ecritures (minute, table_nom, source, n)
  values (date_trunc('minute', now()), 'bobine_sondage_votes', p_uid, 120)
  on conflict (minute, table_nom, source) do update set n = 120;
  return banc.sous(p_uid, format('insert into public.bobine_sondage_votes (post_id, choix) values (%L, 0)', p_post));
end $f$;

-- La MÊME règle que la lecture de `posts` : pour chaque identité et chaque bobine à sondage, l'aide
-- dit « je la vois » si et seulement si la LIGNE se lit sous la RLS de `posts`. Rend « écarts/vues ».
create function banc.aide_contre_rls() returns text language sql as $f$
  select count(*) filter (where aide is distinct from rls)::text || '/' || count(*) filter (where aide = 'true')::text
    from (select banc.val(banc.id(c), format('select public.bobine_sondage_visible(%L)::text', b)) as aide,
                 banc.val(banc.id(c), format('select exists (select 1 from public.posts where id = %L)::text', b)) as rls
            from unnest(array['A','P','F','W','B','M','N','K','J','S','U','I']) c,
                 unnest(array['bA','bM','bE','bP','reel_seed_prive_1']) b) t
$f$;

-- ── Décor ────────────────────────────────────────────────────────────────────────────────────
-- A : auteur public · P : auteur PRIVÉ · F : abonné ACCEPTÉ de P · W : abonné EN ATTENTE de P
-- B, M, N : inconnus · K : bloqué PAR A · J : a bloqué A · S : compte en suppression
-- U : compte suspendu · I : invité de l'activité privée de A · visiteur : anon (identité nulle)
insert into auth.users (id, email, email_confirmed_at, created_at)
  select banc.id(c)::uuid, lower(c) || '@passio-e2e.test', now(), now() - interval '30 days'
    from unnest(array['A','P','F','W','B','M','N','K','J','S','U','I']) c;
insert into public.profiles (id, username, is_private)
  select banc.id(c), 'compte' || lower(c), c = 'P' from unnest(array['A','P','F','W','B','M','N','K','J','S','U','I']) c;
insert into public.follows (follower_id, following_id, status) values
  (banc.id('F'), banc.id('P'), 'accepted'), (banc.id('W'), banc.id('P'), 'accepted');
-- `trg_follows_statut` pose `pending` vers un compte privé : P n'ACCEPTE que F, comme en vrai.
update public.follows set status = 'accepted' where follower_id = banc.id('F') and following_id = banc.id('P');
select banc.cas('décor : F est abonné ACCEPTÉ de P', (select status from public.follows where follower_id = banc.id('F') and following_id = banc.id('P')), 'accepted');
select banc.cas('décor : W est abonné EN ATTENTE de P', (select status from public.follows where follower_id = banc.id('W') and following_id = banc.id('P')), 'pending');
insert into public.blocks (blocker_id, blocked_id) values (banc.id('A'), banc.id('K')), (banc.id('J'), banc.id('A'));
insert into public.comptes_en_suppression (user_id, statut) values (banc.id('S'), 'en_cours');
update auth.users set banned_until = now() + interval '1 day' where id = banc.id('U')::uuid;
insert into public.events (id, author_id, organizer_id, title, visibilite) values ('evPrivee', banc.id('A'), banc.id('A'), 'Sortie privée', 'privee');
insert into public.event_invites (event_id, user_id, invited_by) values ('evPrivee', banc.id('I'), banc.id('A'));
insert into public.posts (id, author_id, content, is_reel, overlays, event_id) values
  ('bA', banc.id('A'), 'bobine à sondage',      true,  '[{"type":"text","text":"x"},{"type":"sondage","q":"Plage ou montagne ?","a":"Plage","b":"Montagne"}]'::jsonb, null),
  ('bN', banc.id('A'), 'bobine sans sondage',   true,  '[{"type":"text","text":"x"}]'::jsonb, null),
  ('pA', banc.id('A'), 'publication ordinaire', false, '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb, null),
  ('pZ', banc.id('A'), 'is_reel nul',           null,  '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb, null),
  ('bO', banc.id('A'), 'overlays objet',        true,  '{"type":"sondage","q":"?","a":"Oui","b":"Non"}'::jsonb, null),
  ('bV', banc.id('A'), 'overlays nul',          true,  null, null),
  ('bM', banc.id('A'), 'bobine bientôt masquée', true, '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb, null),
  ('bE', banc.id('A'), 'album d''activité privée', true, '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb, 'evPrivee'),
  ('bP', banc.id('P'), 'bobine privée',         true,  '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb, null),
  ('reel_seed_prive_1', banc.id('P'), 'bobine privée à identifiant d''exemple', true, '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb, null);

-- ── Voter ────────────────────────────────────────────────────────────────────────────────────
select banc.cas('B ne voit pas les résultats AVANT de voter', banc.val(banc.id('B'), $s$select public.bobine_sondage_resultats('bA')::text$s$), '{"a_vote": false}');
select banc.cas('B vote Plage sur la bobine publique de A', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'ok:1');
select banc.cas('le vote porte l''identité de B, posée par le serveur', (select user_id from public.bobine_sondage_votes where post_id = 'bA'), banc.id('B'));
select banc.cas('le vote porte l''heure du serveur', (select (created_at between now() - interval '1 minute' and now() + interval '1 minute')::text from public.bobine_sondage_votes where post_id = 'bA'), 'true');
select banc.cas('B ne vote pas deux fois', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 1)$s$), 'err:23505');
select banc.cas('B ne change pas son vote (aucun UPDATE)', banc.sous(banc.id('B'), $s$update public.bobine_sondage_votes set choix = 1 where post_id = 'bA'$s$), 'err:42501');
select banc.cas('B ne change pas son vote par un upsert', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 1) on conflict (post_id, user_id) do update set choix = 1$s$), 'err:42501');
select banc.cas('rejouer son vote en « ignorer les doublons » n''écrit rien', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 1) on conflict do nothing$s$), 'ok:0');
select banc.cas('B ne retire pas son vote (aucun DELETE)', banc.sous(banc.id('B'), $s$delete from public.bobine_sondage_votes where post_id = 'bA'$s$), 'err:42501');
select banc.cas('B ne vide pas la table (aucun TRUNCATE)', banc.sous(banc.id('B'), $s$truncate public.bobine_sondage_votes$s$), 'err:42501');
select banc.cas('le vote de B est resté Plage', (select choix::text from public.bobine_sondage_votes where post_id = 'bA' and user_id = banc.id('B')), '0');
select banc.cas('M ne fournit pas la date de son vote', banc.sous(banc.id('M'), $s$insert into public.bobine_sondage_votes (post_id, choix, created_at) values ('bA', 1, '2000-01-01')$s$), 'err:42501');
select banc.cas('B ne vote pas AU NOM de M', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, user_id, choix) values ('bA', 'cccccccc-0000-4000-8000-000000000006', 1)$s$), 'err:42501');
select banc.cas('M ne fournit pas user_id, même le sien', banc.sous(banc.id('M'), $s$insert into public.bobine_sondage_votes (post_id, user_id, choix) values ('bA', 'cccccccc-0000-4000-8000-000000000006', 1)$s$), 'err:42501');
select banc.cas('un choix hors 0/1 est refusé', banc.sous(banc.id('M'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 2)$s$), 'err:23514');
select banc.cas('M vote Montagne et relit SA ligne (INSERT … RETURNING, comme return=representation)', banc.val(banc.id('M'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 1) returning choix::text$s$), '1');
select banc.cas('N, qui n''a pas voté, ne voit toujours pas la tendance (2 votes en base)', banc.val(banc.id('N'), $s$select public.bobine_sondage_resultats('bA')::text$s$), '{"a_vote": false}');
select banc.cas('pas de vote sur une bobine SANS sondage', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bN', 0)$s$), 'err:42501');
select banc.cas('pas de vote sur une publication qui n''est PAS une bobine', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('pA', 0)$s$), 'err:42501');
select banc.cas('pas de vote si is_reel est nul', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('pZ', 0)$s$), 'err:42501');
select banc.cas('pas de vote si overlays n''est pas un tableau', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bO', 0)$s$), 'err:42501');
select banc.cas('pas de vote si overlays est nul', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bV', 0)$s$), 'err:42501');
select banc.cas('l''auteur ne vote pas à son propre sondage', banc.sous(banc.id('A'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'err:42501');
select banc.cas('pas de vote sur la bobine d''un compte PRIVÉ non suivi', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bP', 0)$s$), 'err:42501');
select banc.cas('pas de vote si la demande d''abonnement est EN ATTENTE', banc.sous(banc.id('W'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bP', 0)$s$), 'err:42501');
select banc.cas('l''abonné accepté vote sur la bobine privée', banc.sous(banc.id('F'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bP', 1)$s$), 'ok:1');
select banc.cas('le compte bloqué PAR A ne vote pas', banc.sous(banc.id('K'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'err:42501');
select banc.cas('le compte qui A BLOQUÉ A ne vote pas', banc.sous(banc.id('J'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'err:42501');
select banc.cas('un compte en suppression ne vote pas', banc.sous(banc.id('S'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'err:42501');
select banc.cas('un compte suspendu ne vote pas', banc.sous(banc.id('U'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'err:42501');
select banc.cas('un visiteur (anon) ne vote pas', banc.sous(null, $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'err:42501');
select banc.cas('un vote sur un identifiant INEXISTANT est refusé comme sur une bobine privée', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('nexistepas', 0)$s$), 'err:42501');
select banc.cas('un vote sur un identifiant d''EXEMPLE absent est refusé de même', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('reel_seed_absent_1', 0)$s$), 'err:42501');
select banc.cas('un choix invalide sur une bobine PRIVÉE répond comme un refus (pas 23514)', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bP', 2)$s$), 'err:42501');
-- Activité privée : la règle vient de `post_is_visible`, sans une ligne de plus ici.
select banc.cas('album d''une activité PRIVÉE : un non-invité ne vote pas', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bE', 0)$s$), 'err:42501');
select banc.cas('album d''une activité PRIVÉE : l''invité vote', banc.sous(banc.id('I'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bE', 0)$s$), 'ok:1');
select banc.cas('album d''une activité PRIVÉE : pas de résultats pour un non-invité', banc.val(banc.id('B'), $s$select coalesce(public.bobine_sondage_resultats('bE')::text, 'nul')$s$), 'nul');
-- Débit par compte : 120 votes par minute.
select banc.cas('au plafond de la minute, le vote de N est refusé (débit par compte)', banc.vote_au_plafond(banc.id('N'), 'bA'), 'err:P0001');
delete from public.debit_ecritures where table_nom = 'bobine_sondage_votes' and source = banc.id('N');
select banc.cas('N vote Plage', banc.sous(banc.id('N'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bA', 0)$s$), 'ok:1');
select banc.cas('le vote de N est compté à la minute', (select sum(n)::text from public.debit_ecritures where table_nom = 'bobine_sondage_votes' and source = banc.id('N')), '1');
select banc.cas('le vote de N est compté au jour', (select sum(n)::text from public.debit_jour where cle = 'bobine_sondage_votes' and source = banc.id('N')), '1');

-- ── Lire ─────────────────────────────────────────────────────────────────────────────────────
select banc.cas('B lit SON vote seulement', banc.val(banc.id('B'), $s$select count(*)::text from public.bobine_sondage_votes$s$), '1');
select banc.cas('l''auteur A lit qui a voté quoi', banc.val(banc.id('A'), $s$select string_agg(choix::text, ',' order by choix, user_id) from public.bobine_sondage_votes where post_id = 'bA'$s$), '0,0,1');
select banc.cas('A ne lit pas les votes de la bobine de P', banc.val(banc.id('A'), $s$select count(*)::text from public.bobine_sondage_votes where post_id = 'bP'$s$), '0');
select banc.cas('P lit le vote de sa bobine privée', banc.val(banc.id('P'), $s$select string_agg(user_id || ':' || choix, ',') from public.bobine_sondage_votes where post_id = 'bP'$s$), banc.id('F') || ':1');
select banc.cas('un tiers (K) ne lit aucun vote', banc.val(banc.id('K'), $s$select count(*)::text from public.bobine_sondage_votes$s$), '0');
select banc.cas('après son vote, B voit les comptes et son choix', banc.val(banc.id('B'), $s$select public.bobine_sondage_resultats('bA')::text$s$), '{"a": 2, "b": 1, "a_vote": true, "mon_choix": 0}');
select banc.cas('l''auteur voit les comptes sans voter', banc.val(banc.id('A'), $s$select public.bobine_sondage_resultats('bA')::text$s$), '{"a": 2, "b": 1, "a_vote": true, "mon_choix": null}');
select banc.cas('l''abonné accepté voit les résultats de la bobine privée', banc.val(banc.id('F'), $s$select public.bobine_sondage_resultats('bP')::text$s$), '{"a": 0, "b": 1, "a_vote": true, "mon_choix": 1}');
select banc.cas('un inconnu ne lit pas les résultats d''une bobine privée', banc.val(banc.id('B'), $s$select coalesce(public.bobine_sondage_resultats('bP')::text, 'nul')$s$), 'nul');
select banc.cas('l''abonné EN ATTENTE ne lit pas les résultats', banc.val(banc.id('W'), $s$select coalesce(public.bobine_sondage_resultats('bP')::text, 'nul')$s$), 'nul');
select banc.cas('le compte bloqué PAR A ne lit pas les résultats', banc.val(banc.id('K'), $s$select coalesce(public.bobine_sondage_resultats('bA')::text, 'nul')$s$), 'nul');
select banc.cas('le compte qui A BLOQUÉ A ne lit pas les résultats', banc.val(banc.id('J'), $s$select coalesce(public.bobine_sondage_resultats('bA')::text, 'nul')$s$), 'nul');
select banc.cas('pas de résultats pour une bobine sans sondage', banc.val(banc.id('B'), $s$select coalesce(public.bobine_sondage_resultats('bN')::text, 'nul')$s$), 'nul');
select banc.cas('pas de résultats pour une publication qui n''est pas une bobine', banc.val(banc.id('B'), $s$select coalesce(public.bobine_sondage_resultats('pA')::text, 'nul')$s$), 'nul');
select banc.cas('pas de résultats pour un identifiant nul', banc.val(banc.id('B'), $s$select coalesce(public.bobine_sondage_resultats(null)::text, 'nul')$s$), 'nul');
select banc.cas('anon n''appelle pas la fonction de résultats', banc.val(null, $s$select public.bobine_sondage_resultats('bA')::text$s$), 'err:42501');
select banc.cas('anon n''appelle pas bobine_sondage_visible', banc.val(null, $s$select public.bobine_sondage_visible('bA')::text$s$), 'err:42501');
select banc.cas('anon n''appelle pas bobine_est_a_moi', banc.val(null, $s$select public.bobine_est_a_moi('bA')::text$s$), 'err:42501');
select banc.cas('anon ne lit pas les votes', banc.val(null, $s$select count(*)::text from public.bobine_sondage_votes$s$), 'err:42501');

-- ── Aucun oracle d'existence ─────────────────────────────────────────────────────────────────
select banc.cas('résultats : bobine PRIVÉE et identifiant INEXISTANT répondent pareil', banc.val(banc.id('B'), $s$select (public.bobine_sondage_resultats('bP') is not distinct from public.bobine_sondage_resultats('nexistepas'))::text || '/' || coalesce(public.bobine_sondage_resultats('nexistepas')::text, 'nul')$s$), 'true/nul');
select banc.cas('prémisse : post_is_visible dit VRAI d''un identifiant d''exemple ABSENT', banc.val(banc.id('B'), $s$select public.post_is_visible('reel_seed_absent_1')::text$s$), 'true');
select banc.cas('prémisse : post_is_visible dit FAUX de la bobine privée au même format', banc.val(banc.id('B'), $s$select public.post_is_visible('reel_seed_prive_1')::text$s$), 'false');
select banc.cas('résultats : exemple ABSENT et bobine privée au même format répondent pareil', banc.val(banc.id('B'), $s$select coalesce(public.bobine_sondage_resultats('reel_seed_absent_1')::text, 'nul') || '/' || coalesce(public.bobine_sondage_resultats('reel_seed_prive_1')::text, 'nul')$s$), 'nul/nul');
select banc.cas('bobine_sondage_visible : privée, inexistante, exemple absent, sans sondage, pas une bobine → faux', banc.val(banc.id('B'), $s$select concat_ws(',', public.bobine_sondage_visible('bP'), public.bobine_sondage_visible('nexistepas'), public.bobine_sondage_visible('reel_seed_absent_1'), public.bobine_sondage_visible('reel_seed_prive_1'), public.bobine_sondage_visible('bN'), public.bobine_sondage_visible('pA'), public.bobine_sondage_visible(null))$s$), 'f,f,f,f,f,f,f');
select banc.cas('bobine_sondage_visible : vrai pour qui la voit (inconnu sur la publique, abonné sur la privée)', banc.val(banc.id('B'), $s$select public.bobine_sondage_visible('bA')::text$s$) || '/' || banc.val(banc.id('F'), $s$select public.bobine_sondage_visible('bP')::text$s$), 'true/true');
select banc.cas('bobine_sondage_visible : faux pour les comptes en blocage, dans les deux sens', banc.val(banc.id('K'), $s$select public.bobine_sondage_visible('bA')::text$s$) || '/' || banc.val(banc.id('J'), $s$select public.bobine_sondage_visible('bA')::text$s$), 'false/false');
select banc.cas('bobine_est_a_moi : la bobine d''autrui, privée ou inexistante → faux', banc.val(banc.id('B'), $s$select concat_ws(',', public.bobine_est_a_moi('bA'), public.bobine_est_a_moi('bP'), public.bobine_est_a_moi('nexistepas'), public.bobine_est_a_moi(null))$s$), 'f,f,f,f');
select banc.cas('bobine_est_a_moi : vrai pour sa bobine, faux pour sa publication ordinaire', banc.val(banc.id('A'), $s$select concat_ws(',', public.bobine_est_a_moi('bA'), public.bobine_est_a_moi('pA'))$s$), 't,f');

-- ── La même règle que la lecture de `posts` ─────────────────────────────────────────────────────
select banc.cas('12 identités × 5 bobines à sondage : l''aide et la RLS de posts disent la même chose (0 écart, 26 vues)', banc.aide_contre_rls(), '0/26');

-- ── Le blocage APRÈS le vote ─────────────────────────────────────────────────────────────────
insert into public.blocks (blocker_id, blocked_id) values (banc.id('A'), banc.id('M'));
select banc.cas('A bloque M : le vote de M sort de la LISTE de A', banc.val(banc.id('A'), $s$select string_agg(choix::text, ',' order by choix, user_id) from public.bobine_sondage_votes where post_id = 'bA'$s$), '0,0');
select banc.cas('A bloque M : le vote de M sort du SCORE de A', banc.val(banc.id('A'), $s$select public.bobine_sondage_resultats('bA')::text$s$), '{"a": 2, "b": 0, "a_vote": true, "mon_choix": null}');
select banc.cas('M, bloqué, ne lit plus les résultats', banc.val(banc.id('M'), $s$select coalesce(public.bobine_sondage_resultats('bA')::text, 'nul')$s$), 'nul');
select banc.cas('résidu assumé : M relit encore SA ligne', banc.val(banc.id('M'), $s$select count(*)::text from public.bobine_sondage_votes$s$), '1');
select banc.cas('résidu assumé : B, sans blocage avec M, compte encore le vote de M', banc.val(banc.id('B'), $s$select public.bobine_sondage_resultats('bA')::text$s$), '{"a": 2, "b": 1, "a_vote": true, "mon_choix": 0}');
insert into public.blocks (blocker_id, blocked_id) values (banc.id('N'), banc.id('A'));
select banc.cas('N bloque A : le vote de N sort aussi du score et de la liste de A', banc.val(banc.id('A'), $s$select public.bobine_sondage_resultats('bA')::text$s$) || ' ' || banc.val(banc.id('A'), $s$select count(*)::text from public.bobine_sondage_votes where post_id = 'bA'$s$), '{"a": 1, "b": 0, "a_vote": true, "mon_choix": null} 1');
select banc.cas('N, qui a bloqué A, ne lit plus les résultats', banc.val(banc.id('N'), $s$select coalesce(public.bobine_sondage_resultats('bA')::text, 'nul')$s$), 'nul');

-- ── L'abonnement retiré, la modération ───────────────────────────────────────────────────────
delete from public.follows where follower_id = banc.id('F') and following_id = banc.id('P');
select banc.cas('F n''est plus abonné : plus de résultats de la bobine privée', banc.val(banc.id('F'), $s$select coalesce(public.bobine_sondage_resultats('bP')::text, 'nul')$s$), 'nul');
select banc.cas('P, lui, lit toujours le vote de F', banc.val(banc.id('P'), $s$select public.bobine_sondage_resultats('bP')::text$s$), '{"a": 0, "b": 1, "a_vote": true, "mon_choix": null}');
select banc.cas('B vote sur la bobine bM avant son masquage', banc.sous(banc.id('B'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bM', 1)$s$), 'ok:1');
insert into public.contenus_masques (target_type, target_id, signaleurs) values ('post', 'bM', 3);
select banc.cas('bobine MASQUÉE par la modération : plus de vote', banc.sous(banc.id('I'), $s$insert into public.bobine_sondage_votes (post_id, choix) values ('bM', 0)$s$), 'err:42501');
select banc.cas('bobine MASQUÉE : plus de résultats, même pour qui a voté', banc.val(banc.id('B'), $s$select coalesce(public.bobine_sondage_resultats('bM')::text, 'nul')$s$), 'nul');
select banc.cas('bobine MASQUÉE : son auteur lit toujours les résultats', banc.val(banc.id('A'), $s$select public.bobine_sondage_resultats('bM')::text$s$), '{"a": 0, "b": 1, "a_vote": true, "mon_choix": null}');

select banc.cas('après blocages, désabonnement et masquage : l''aide et la RLS de posts disent toujours la même chose (0 écart, 13 vues)', banc.aide_contre_rls(), '0/13');

-- ── Ce qui part avec la bobine et avec le profil ─────────────────────────────────────────────
select banc.cas('A supprime sa bobine', banc.sous(banc.id('A'), $s$delete from public.posts where id = 'bA'$s$), 'ok:1');
select banc.cas('les votes de la bobine supprimée sont partis avec elle', (select count(*)::text from public.bobine_sondage_votes where post_id = 'bA'), '0');
select banc.cas('prémisse : le vote de F est encore en base', (select count(*)::text from public.bobine_sondage_votes where user_id = banc.id('F')), '1');
delete from public.profiles where id = banc.id('F');
select banc.cas('le profil supprimé emporte son vote', (select count(*)::text from public.bobine_sondage_votes where user_id = banc.id('F')), '0');
