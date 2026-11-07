-- Cas du banc tests/sql/migration-securite-2026-11-06.test.sh. Identités simulées, données synthétiques.
-- Chaque cas écrit ce qu'il obtient, ce qu'on attend AVANT le lot (le défaut mesuré) et APRÈS.
-- Un test sous un compte administrateur de base ne prouve rien : tout passe par anon / authenticated.
set client_min_messages = warning;
create schema banc;
create table banc.resultats (n serial primary key, cas text not null, obtenu text, attendu text, ok boolean);
create function banc.phase() returns text language sql stable as $f$ select current_setting('banc.phase') $f$;

-- Exécute une instruction sous une identité : `ok:<lignes>` ou `err:<sqlstate>`. uid nul = visiteur.
create function banc.sous(p_uid text, p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  begin
    perform set_config('passio.notification_serveur', '', true);
    perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute p_sql;
    get diagnostics n = row_count;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return 'ok:' || n;
  exception when others then
    return 'err:' || sqlstate;
  end;
end $f$;

-- Lit une valeur sous une identité.
create function banc.val(p_uid text, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  begin
    perform set_config('passio.notification_serveur', '', true);
    perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute p_sql into v;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v, 'nul');
  exception when others then
    return 'err:' || sqlstate;
  end;
end $f$;

create function banc.cas(p_cas text, p_obtenu text, p_avant text, p_apres text) returns void language plpgsql as $f$
declare attendu text := case when banc.phase() = 'avant' then p_avant else p_apres end;
begin
  insert into banc.resultats (cas, obtenu, attendu, ok) values (p_cas, p_obtenu, attendu, p_obtenu is not distinct from attendu);
end $f$;

-- ── Décor : identités fixes ───────────────────────────────────────────────────────────────────
create function banc.id(c text) returns text language sql immutable as $f$
  select case c when 'A' then 'aaaaaaaa-0000-4000-8000-000000000001' when 'B' then 'bbbbbbbb-0000-4000-8000-000000000002'
    when 'M' then 'cccccccc-0000-4000-8000-000000000003' when 'O' then 'dddddddd-0000-4000-8000-000000000004'
    when 'V' then 'eeeeeeee-0000-4000-8000-000000000005' when 'S' then 'ffffffff-0000-4000-8000-000000000006'
    when 'D' then '11111111-0000-4000-8000-000000000007' when 'P' then '22222222-0000-4000-8000-000000000008'
    when 'K' then '33333333-0000-4000-8000-000000000009' end
$f$;
insert into auth.users (id, email, email_confirmed_at, created_at)
  select banc.id(c)::uuid, lower(c) || '@passio-e2e.test', now(), now() - interval '30 days' from unnest(array['A','B','M','O','V','S','D','P','K']) c;
update auth.users set banned_until = now() + interval '1 day' where id = banc.id('S')::uuid;
insert into public.profiles (id, username, is_private)
  select banc.id(c), 'compte' || lower(c), c = 'P' from unnest(array['A','B','M','O','V','S','D','P','K']) c;
insert into public.access_policies (key, enabled, note) values ('irl_adult_only', true, 'banc');
insert into public.user_safety (user_id, majority_at)
  select banc.id(c), date '2000-01-01' from unnest(array['A','B','M','O','V','S','D','P','K']) c;
insert into public.comptes_en_suppression (user_id, statut) values (banc.id('D'), 'en_cours');

insert into public.events (id, author_id, title, date_at, status, conv_id, organizer_id, co_organizers)
  values ('evbanc1', banc.id('O'), 'Activité 1', now() + interval '2 days', 'active', 'evgrp_evbanc1', banc.id('O'), '[]'::jsonb),
         ('evbanc2', banc.id('O'), 'Activité 2', now() + interval '2 days', 'active', null, banc.id('O'), '[]'::jsonb),
         ('evbanc3', banc.id('O'), 'Activité 3', now() + interval '2 days', 'active', null, banc.id('O'), '[]'::jsonb);
insert into public.conversations (id, is_group, created_by) values ('evgrp_evbanc1', true, banc.id('O'));
insert into public.conv_members (conv_id, user_id) values ('evgrp_evbanc1', banc.id('O')), ('evgrp_evbanc1', banc.id('V'));

insert into public.follows (follower_id, following_id, status) values
  (banc.id('K'), banc.id('P'), 'accepted'), (banc.id('A'), banc.id('B'), 'accepted');
update public.follows set status = 'accepted' where follower_id = banc.id('K') and following_id = banc.id('P');
insert into storage.objects (bucket_id, name, owner) values ('content', 'photos/' || banc.id('P') || '/p1.jpg', banc.id('P')::uuid);
insert into public.posts (id, author_id, content) values
  ('post_banc_m', banc.id('M'), 'publication de M'), ('post_banc_a', banc.id('A'), 'publication de A');
insert into public.post_comments (id, post_id, author_id, content) values
  ('pc_banc_1', 'post_banc_m', banc.id('M'), 'commentaire sans mention');

-- ═══ ① Un tiers ne s'introduit pas dans un 1:1 ═══════════════════════════════════════════════
select banc.cas('B-01 M crée une conversation 1:1 vide', banc.sous(banc.id('M'), $s$insert into public.conversations (id, is_group, created_by) values ('conv_x', false, (auth.uid())::text)$s$), 'ok:1', 'ok:1');
select banc.cas('B-01 M y inscrit B sans en être', banc.sous(banc.id('M'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_x', %L)$s$, banc.id('B'))), 'ok:1', 'err:42501');
select banc.cas('B-01 M y inscrit A sans en être', banc.sous(banc.id('M'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_x', %L)$s$, banc.id('A'))), 'ok:1', 'err:42501');
select banc.cas('B-01 M s''y inscrit', banc.sous(banc.id('M'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_x', %L)$s$, banc.id('M'))), 'ok:1', 'ok:1');
select banc.cas('B-01 A écrit dans la conversation préparée', banc.sous(banc.id('A'), $s$insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_banc_a1', 'conv_x', (auth.uid())::text, 'message privé')$s$), 'ok:1', 'err:42501');
select banc.cas('B-01 M lit le message de A', banc.val(banc.id('M'), $s$select count(*) from public.conv_messages where id = 'msg_banc_a1'$s$), '1', '0');
select banc.cas('B-01 un 1:1 ne prend pas de troisième membre', (select banc.sous(banc.id('M'), $s$insert into public.conversations (id, is_group, created_by) values ('conv_y', false, (auth.uid())::text)$s$) || '|' ||
    banc.sous(banc.id('M'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_y', %L)$s$, banc.id('M'))) || '|' ||
    banc.sous(banc.id('M'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_y', %L)$s$, banc.id('A'))) || '|' ||
    banc.sous(banc.id('M'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_y', %L)$s$, banc.id('B')))),
  'ok:1|ok:1|ok:1|ok:1', 'ok:1|ok:1|ok:1|err:42501');

-- Ce qui doit continuer de marcher : un vrai 1:1, un groupe, le rejeu de l'appartenance.
select banc.cas('Client : A crée un 1:1, s''inscrit, inscrit B', (select banc.sous(banc.id('A'), $s$insert into public.conversations (id, is_group, created_by) values ('conv_l', false, (auth.uid())::text)$s$) || '|' ||
    banc.sous(banc.id('A'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_l', %L)$s$, banc.id('A'))) || '|' ||
    banc.sous(banc.id('A'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_l', %L)$s$, banc.id('B')))),
  'ok:1|ok:1|ok:1', 'ok:1|ok:1|ok:1');
select banc.cas('Client : rejeu de son appartenance = doublon, pas un refus', banc.sous(banc.id('A'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_l', %L)$s$, banc.id('A'))), 'err:23505', 'err:23505');
select banc.cas('Client : A écrit, B lit', (select banc.sous(banc.id('A'), $s$insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_banc_l1', 'conv_l', (auth.uid())::text, 'bonjour')$s$) || '|' ||
    banc.val(banc.id('B'), $s$select count(*) from public.conv_messages where id = 'msg_banc_l1'$s$)), 'ok:1|1', 'ok:1|1');
select banc.cas('Isolation : M ne lit pas le 1:1 de A et B', banc.val(banc.id('M'), $s$select count(*) from public.conv_messages where conv_id = 'conv_l'$s$), '0', '0');
select banc.cas('Isolation : M ne s''inscrit pas dans le 1:1 de A', banc.sous(banc.id('M'), format($s$insert into public.conv_members (conv_id, user_id) values ('conv_l', %L)$s$, banc.id('M'))), 'err:42501', 'err:42501');
select banc.cas('Client : A crée un groupe et y inscrit trois comptes', (select banc.sous(banc.id('A'), $s$insert into public.conversations (id, is_group, created_by, group_name) values ('grp_1', true, (auth.uid())::text, 'Groupe')$s$) || '|' ||
    banc.sous(banc.id('A'), format($s$insert into public.conv_members (conv_id, user_id) values ('grp_1', %L), ('grp_1', %L), ('grp_1', %L)$s$, banc.id('A'), banc.id('B'), banc.id('M')))), 'ok:1|ok:3', 'ok:1|ok:3');
select banc.cas('Client : le créateur efface une conversation sans membre', (select banc.sous(banc.id('A'), $s$insert into public.conversations (id, is_group, created_by) values ('conv_vide', false, (auth.uid())::text)$s$) || '|' ||
    banc.sous(banc.id('A'), $s$delete from public.conversations where id = 'conv_vide'$s$)), 'ok:1|ok:0', 'ok:1|ok:1');

-- ═══ ② L'oracle de la liste des venants : fermé en production le 06/11 (migration id 33), hors des lots ═══
select banc.cas('B-02 M demande si V vient à une activité', banc.val(banc.id('M'), format($s$select public.is_conv_member('evgrp_evbanc1', %L)$s$, banc.id('V'))), 'false', 'false');
select banc.cas('B-02 V se pose la question pour lui-même', banc.val(banc.id('V'), format($s$select public.is_conv_member('evgrp_evbanc1', %L)$s$, banc.id('V'))), 'true', 'true');
select banc.cas('B-02 sans session, la question reste entière', public.is_conv_member('evgrp_evbanc1', banc.id('V'))::text, 'true', 'true');

-- ═══ ③ Le préfixe d'une discussion d'activité ════════════════════════════════════════════════
select banc.cas('B-08 M squatte la discussion d''une activité d''autrui', banc.sous(banc.id('M'), $s$insert into public.conversations (id, is_group, created_by) values ('evgrp_evbanc2', true, (auth.uid())::text)$s$), 'ok:1', 'err:42501');
select banc.cas('Client : l''organisateur crée sa discussion', banc.sous(banc.id('O'), $s$insert into public.conversations (id, is_group, created_by) values ('evgrp_evbanc3', true, (auth.uid())::text)$s$), 'ok:1', 'ok:1');

-- ═══ ④ Une activité ne s'attribue pas à autrui ═══════════════════════════════════════════════
select banc.cas('B-04 M publie une activité organisée par V', banc.sous(banc.id('M'), format($s$insert into public.events (id, author_id, title, date_at, status, organizer_id, co_organizers) values ('evmal1', (auth.uid())::text, 'Piège', now() + interval '1 day', 'active', %L, '[]'::jsonb)$s$, banc.id('V'))), 'ok:1', 'err:23514');
select banc.cas('Client : M publie sa propre activité', banc.sous(banc.id('M'), $s$insert into public.events (id, author_id, title, date_at, status, organizer_id, co_organizers) values ('evok1', (auth.uid())::text, 'Sortie', now() + interval '1 day', 'active', (auth.uid())::text, '[]'::jsonb)$s$), 'ok:1', 'ok:1');
select banc.cas('B-04 M se nomme co-organisateur puis cède l''auteur à V', (select banc.sous(banc.id('M'), format($s$update public.events set co_organizers = %L::jsonb where id = 'evok1'$s$, json_build_array(banc.id('M'))::text)) || '|' ||
    banc.sous(banc.id('M'), format($s$update public.events set author_id = %L, organizer_id = %L where id = 'evok1'$s$, banc.id('V'), banc.id('V')))), 'ok:1|ok:1', 'ok:1|err:23514');

-- ═══ ⑤ Comptes privés, seau public ═══════════════════════════════════════════════════════════
select banc.cas('B-06 un visiteur lit les abonnés d''un compte privé', banc.val(null, format($s$select count(*) from public.follows where following_id = %L$s$, banc.id('P'))), '1', '0');
select banc.cas('B-06 un tiers connecté les lit aussi', banc.val(banc.id('M'), format($s$select count(*) from public.follows where following_id = %L$s$, banc.id('P'))), '1', '0');
select banc.cas('Reste vrai : l''abonné accepté et le titulaire les lisent', (banc.val(banc.id('K'), format($s$select count(*) from public.follows where following_id = %L$s$, banc.id('P'))) || '|' || banc.val(banc.id('P'), format($s$select count(*) from public.follows where following_id = %L$s$, banc.id('P')))), '1|1', '1|1');
select banc.cas('Reste vrai : un compte public garde ses abonnés publics', banc.val(null, format($s$select count(*) from public.follows where following_id = %L$s$, banc.id('B'))), '1', '1');
select banc.cas('B-07 un visiteur liste le seau content', banc.val(null, $s$select count(*) from storage.objects where bucket_id = 'content'$s$), '1', '0');
select banc.cas('Reste vrai : le titulaire voit son objet', banc.val(banc.id('P'), $s$select count(*) from storage.objects where bucket_id = 'content'$s$), '1', '1');
select banc.cas('Isolation : dépôt dans le dossier d''autrui refusé', banc.sous(banc.id('M'), format($s$insert into storage.objects (bucket_id, name, owner) values ('content', %L, (auth.uid()))$s$, 'photos/' || banc.id('A') || '/x.jpg')), 'err:42501', 'err:42501');
select banc.cas('Client : dépôt dans son propre dossier', banc.sous(banc.id('M'), format($s$insert into storage.objects (bucket_id, name, owner) values ('content', %L, (auth.uid()))$s$, 'photos/' || banc.id('M') || '/x.jpg')), 'ok:1', 'ok:1');

-- ═══ ⑥ Suspension et suppression ═════════════════════════════════════════════════════════════
select banc.cas('B-12 un compte suspendu publie', banc.sous(banc.id('S'), $s$insert into public.posts (id, author_id, content) values ('post_banc_s', (auth.uid())::text, 'encore là')$s$), 'ok:1', 'err:42501');
select banc.cas('Reste vrai : un compte suspendu lit jusqu''à l''expiration du jeton', banc.val(banc.id('S'), $s$select count(*) >= 1 from public.posts$s$), 'true', 'true');
select banc.cas('B-12 un compte en suppression crée une conversation', banc.sous(banc.id('D'), $s$insert into public.conversations (id, is_group, created_by) values ('conv_d', false, (auth.uid())::text)$s$), 'ok:1', 'err:42501');
select banc.cas('B-12 un compte en suppression signale', banc.sous(banc.id('D'), $s$insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('rep_d', (auth.uid())::text, 'post', 'post_banc_a', 'motif')$s$), 'ok:1', 'err:42501');
select banc.cas('B-12 un compte en suppression crée une passion', banc.sous(banc.id('D'), $s$select * from public.creer_passion('Passion du banc', '✨', null::text[])$s$), 'ok:1', 'err:42501');

-- ═══ ⑦ Notifications ═════════════════════════════════════════════════════════════════════════
select banc.cas('B-09 M écrit une fausse décision de modération à V', banc.sous(banc.id('M'), format($s$insert into public.notifications (id, user_id, kind, from_id, content) values ('n_xbanc1', %L, 'moderation', (auth.uid())::text, 'PASSIO : ton compte sera supprimé')$s$, banc.id('V'))), 'ok:1', 'err:42501');
select banc.cas('Client : un « j''aime » notifie', banc.sous(banc.id('M'), format($s$insert into public.notifications (id, user_id, kind, from_id, content) values ('n_xbanc2', %L, 'like', (auth.uid())::text, 'a aimé')$s$, banc.id('V'))), 'ok:1', 'ok:1');
select banc.cas('B-09 une notification de 1 Ko', banc.sous(banc.id('M'), format($s$insert into public.notifications (id, user_id, kind, from_id, content) values ('n_xbanc3', %L, 'like', (auth.uid())::text, repeat('x', 1000))$s$, banc.id('K'))), 'ok:1', 'err:23514');
do $d$
declare i int; dernier text;
begin
  for i in 1..11 loop
    dernier := banc.sous(banc.id('M'), format($s$insert into public.notifications (id, user_id, kind, from_id, content) values (%L, %L, 'like', (auth.uid())::text, 'a aimé')$s$, 'n_xdel' || i, banc.id('O')));
  end loop;
  perform banc.cas('B-09 onzième notification en une minute vers la même personne', dernier, 'ok:1', 'err:P0001');
end $d$;
select banc.cas('B-09 M « mentionne » V sans que son commentaire la cite', banc.val(banc.id('M'), format($s$select (public.notifier_mentions('commentaire', 'post_banc_m', array[%L]) ->> 'notifiees')$s$, banc.id('V'))), '1', '0');
insert into public.post_comments (id, post_id, author_id, content) values ('pc_banc_2', 'post_banc_m', banc.id('M'), 'Salut @comptek !');
select banc.cas('Client : une vraie mention notifie', banc.val(banc.id('M'), format($s$select (public.notifier_mentions('commentaire', 'post_banc_m', array[%L]) ->> 'notifiees')$s$, banc.id('K'))), '1', '1');
insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_banc_g1', 'grp_1', banc.id('A'), 'Dans le groupe');
select banc.cas('R36 une mention dans un groupe ne lève plus 42703', banc.val(banc.id('A'), format($s$select (public.notifier_mentions('message', 'grp_1', array[%L]) ->> 'notifiees')$s$, banc.id('B'))), 'err:42703', '1');

-- ═══ ⑧ Champs libres ═════════════════════════════════════════════════════════════════════════
select banc.cas('Emoji de profil : une balise', banc.sous(banc.id('M'), $s$update public.profiles set emoji = '<img src=x>' where id = (auth.uid())::text$s$), 'ok:1', 'err:23514');
select banc.cas('Client : un vrai emoji', banc.sous(banc.id('M'), $s$update public.profiles set emoji = '🙂' where id = (auth.uid())::text$s$), 'ok:1', 'ok:1');
select banc.cas('Couleur de profil : sortie de la déclaration CSS', banc.sous(banc.id('M'), $s$update public.profiles set color = 'red&#59position:fixed' where id = (auth.uid())::text$s$), 'ok:1', 'err:23514');
select banc.cas('Client : une couleur', banc.sous(banc.id('M'), $s$update public.profiles set color = '#7c3aed' where id = (auth.uid())::text$s$), 'ok:1', 'ok:1');
select banc.cas('Photo de profil : javascript:', banc.sous(banc.id('M'), $s$update public.profiles set avatar_url = 'javascript:alert(1)' where id = (auth.uid())::text$s$), 'ok:1', 'err:23514');
select banc.cas('Pseudo : mot réservé', banc.sous(banc.id('M'), $s$update public.profiles set username = 'Modération PASSIO' where id = (auth.uid())::text$s$), 'ok:1', 'err:23514');
select banc.cas('Client : un pseudo', banc.sous(banc.id('M'), $s$update public.profiles set username = 'Camille Durand' where id = (auth.uid())::text$s$), 'ok:1', 'ok:1');
select banc.cas('Identifiant de commentaire : balise', banc.sous(banc.id('M'), $s$insert into public.post_comments (id, post_id, author_id, content) values ('x"><img src=x>', 'post_banc_m', (auth.uid())::text, 'texte')$s$), 'ok:1', 'err:23514');
select banc.cas('Client : identifiant de commentaire', banc.sous(banc.id('M'), $s$insert into public.post_comments (id, post_id, author_id, content) values ('xabc123_def', 'post_banc_m', (auth.uid())::text, 'texte')$s$), 'ok:1', 'ok:1');
select banc.cas('Emoji d''activité : balise', banc.sous(banc.id('M'), $s$update public.events set emoji = '<svg onload=x>' where id = 'evok1'$s$), 'ok:1', 'err:23514');
select banc.cas('Média de publication : javascript:', banc.sous(banc.id('M'), $s$insert into public.posts (id, author_id, content, media_url) values ('post_banc_j', (auth.uid())::text, 'x', 'javascript:alert(1)')$s$), 'ok:1', 'err:23514');

-- ═══ ⑨ Abonnements push ═══════════════════════════════════════════════════════════════════════
select banc.cas('D-01 un abonnement vers un hôte libre', banc.sous(banc.id('M'), $s$insert into public.push_subscriptions (endpoint, user_id, subscription) values ('https://collecteur.exemple.test/a', (auth.uid())::text, '{"endpoint":"https://collecteur.exemple.test/a"}'::jsonb)$s$), 'ok:1', 'err:23514');
select banc.cas('D-01 colonne et objet divergents', banc.sous(banc.id('M'), $s$insert into public.push_subscriptions (endpoint, user_id, subscription) values ('https://fcm.googleapis.com/fcm/send/z', (auth.uid())::text, '{"endpoint":"https://collecteur.exemple.test/a"}'::jsonb)$s$), 'ok:1', 'err:23514');
select banc.cas('Client : un abonnement FCM', banc.sous(banc.id('K'), $s$insert into public.push_subscriptions (endpoint, user_id, subscription) values ('https://fcm.googleapis.com/fcm/send/k1', (auth.uid())::text, '{"endpoint":"https://fcm.googleapis.com/fcm/send/k1"}'::jsonb)$s$), 'ok:1', 'ok:1');
do $d$
declare i int; dernier text;
begin
  for i in 1..11 loop
    dernier := banc.sous(banc.id('V'), format($s$insert into public.push_subscriptions (endpoint, user_id, subscription) values (%L, (auth.uid())::text, %L::jsonb)$s$,
      'https://fcm.googleapis.com/fcm/send/v' || i, json_build_object('endpoint', 'https://fcm.googleapis.com/fcm/send/v' || i)::text));
  end loop;
  perform banc.cas('D-01 onzième abonnement d''un même compte', dernier, 'ok:1', 'err:P0001');
end $d$;

-- ═══ ⑩ Plafond atomique ═══════════════════════════════════════════════════════════════════════
select banc.cas('D-03 la fonction existe, service_role seul',
  (to_regprocedure('public.plafond_consommer(text,text,integer,integer)') is not null)::text || '|' ||
  case when to_regprocedure('public.plafond_consommer(text,text,integer,integer)') is null then 'sans objet'
       else (has_function_privilege('anon', 'public.plafond_consommer(text,text,integer,integer)', 'execute') or has_function_privilege('authenticated', 'public.plafond_consommer(text,text,integer,integer)', 'execute'))::text end,
  'false|sans objet', 'true|false');

-- ═══ ⑪ Privilèges par défaut ══════════════════════════════════════════════════════════════════
create table public.objet_futur_du_banc (i int);
create function public.fonction_future_du_banc() returns int language sql as $f$ select 1 $f$;
select banc.cas('B-18 un futur objet ne naît plus ouvert à anon',
  has_table_privilege('anon', 'public.objet_futur_du_banc', 'SELECT')::text || '|' || has_function_privilege('anon', 'public.fonction_future_du_banc()', 'EXECUTE')::text,
  'true|true', 'false|false');

-- ═══ Isolation : ce qui tenait doit tenir ═════════════════════════════════════════════════════
insert into public.notifications (id, user_id, kind, from_id, content) values ('n_xiso', banc.id('A'), 'like', banc.id('O'), 'a aimé');
insert into public.user_state (user_id, data) values (banc.id('A'), '{}'::jsonb);
insert into public.blocks (blocker_id, blocked_id) values (banc.id('A'), banc.id('K'));
select banc.cas('Isolation : B ne lit ni les notifications, ni l''état, ni les blocages de A',
  banc.val(banc.id('B'), format($s$select (select count(*) from public.notifications where user_id = %L) + (select count(*) from public.user_state where user_id = %L) + (select count(*) from public.blocks where blocker_id = %L)$s$, banc.id('A'), banc.id('A'), banc.id('A'))), '0', '0');
select banc.cas('Isolation : B ne modifie ni le profil ni la publication de A', (banc.sous(banc.id('B'), format($s$update public.profiles set bio = 'x' where id = %L$s$, banc.id('A'))) || '|' || banc.sous(banc.id('B'), $s$update public.posts set content = 'x' where id = 'post_banc_a'$s$)), 'ok:0|ok:0', 'ok:0|ok:0');
select banc.cas('Isolation : B n''efface pas la publication de A', banc.sous(banc.id('B'), $s$delete from public.posts where id = 'post_banc_a'$s$), 'ok:0', 'ok:0');
select banc.cas('Isolation : un visiteur n''écrit ni publication ni conversation', (banc.sous(null, $s$insert into public.posts (id, author_id, content) values ('post_anon', 'x', 'x')$s$) || '|' || banc.sous(null, $s$insert into public.conversations (id, is_group, created_by) values ('conv_anon', false, 'x')$s$)), 'err:42501|err:42501', 'err:42501|err:42501');
