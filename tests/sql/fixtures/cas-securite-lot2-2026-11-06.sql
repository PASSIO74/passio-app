-- Cas APRÈS le lot 2, joués sur la base du lot 1 (schéma `banc` et comptes déjà là).
create table banc.resultats_lot2 (n serial primary key, cas text not null, obtenu text, attendu text, ok boolean);
create function banc.c2(p_cas text, p_obtenu text, p_attendu text) returns void language plpgsql as $f$
begin
  insert into banc.resultats_lot2 (cas, obtenu, attendu, ok) values (p_cas, p_obtenu, p_attendu, p_obtenu is not distinct from p_attendu);
end $f$;
-- Rend le compteur muet entre deux séries : ce banc tient en une minute.
delete from public.debit_ecritures;

-- ① Plafond incontournable : insérer puis effacer ne libère rien.
do $d$
declare i int; r text; refus int := 0;
begin
  for i in 1..70 loop
    r := banc.sous(banc.id('K'), format($s$insert into public.follows (follower_id, following_id) values ((auth.uid())::text, %L)$s$, banc.id('O')));
    if r like 'err:P0001' then refus := refus + 1; end if;
    perform banc.sous(banc.id('K'), format($s$delete from public.follows where follower_id = (auth.uid())::text and following_id = %L$s$, banc.id('O')));
  end loop;
  perform banc.c2('B-10 suivre puis retirer en boucle : le plafond tient', (refus > 0)::text, 'true');
end $d$;
delete from public.debit_ecritures;
insert into auth.users (id, email, email_confirmed_at) select ('44444444-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'lot' || i || '@passio-e2e.test', now() from generate_series(1, 70) i;
insert into public.profiles (id, username) select '44444444-0000-4000-8000-' || lpad(i::text, 12, '0'), 'lot' || i from generate_series(1, 70) i;
do $d$
declare i int; r text; refus int := 0;
begin
  for i in 1..70 loop
    r := banc.sous(banc.id('A'), format($s$insert into public.conv_members (conv_id, user_id) values ('grp_1', %L)$s$, '44444444-0000-4000-8000-' || lpad(i::text, 12, '0')));
    if r = 'err:P0001' then refus := refus + 1; end if;
  end loop;
  perform banc.c2('B-05 ajouts en série à un groupe : le plafond tient', (refus > 0)::text, 'true');
end $d$;
delete from public.debit_ecritures;

-- ② Réécritures sans usage client.
select banc.c2('B-14 antidater sa publication', banc.sous(banc.id('M'), $s$update public.posts set created_at = '2099-01-01' where id = 'post_banc_m'$s$), 'ok:0');
select banc.c2('B-14 réécrire son message après coup', banc.sous(banc.id('A'), $s$update public.conv_messages set content = 'autre' where id = 'msg_banc_l1'$s$), 'ok:0');
select banc.c2('B-14 antidater son commentaire', banc.sous(banc.id('M'), $s$update public.post_comments set created_at = '2000-01-01' where id = 'xabc123_def'$s$), 'err:42501');
select banc.c2('Client : modifier le texte de son commentaire', banc.sous(banc.id('M'), $s$update public.post_comments set content = 'corrigé' where id = 'xabc123_def'$s$), 'ok:1');
select banc.c2('B-14 une bio de 2 000 caractères', banc.sous(banc.id('M'), $s$update public.profiles set bio = repeat('x', 2000) where id = (auth.uid())::text$s$), 'err:23514');
select banc.c2('Client : une bio', banc.sous(banc.id('M'), $s$update public.profiles set bio = 'Passionné de vélo' where id = (auth.uid())::text$s$), 'ok:1');
do $d$
declare r text; v text;
begin
  r := banc.sous(banc.id('M'), $s$insert into public.video_lives (id, author_id, last_seen) values ('vl_banc', (auth.uid())::text, '2099-01-01')$s$);
  select (last_seen < now() + interval '1 minute')::text into v from public.video_lives where id = 'vl_banc';
  perform banc.c2('B-14 un live daté de 2099 reste à sa date réelle', r || '|' || coalesce(v, 'absent'), 'ok:1|true');
end $d$;

-- ③ Masquage : l'auteur est prévenu.
insert into public.posts (id, author_id, content) values ('post_banc_msq', banc.id('A'), 'publication signalée');
insert into public.reports (id, reporter_id, target_type, target_id, reason, status) values
  ('r1', banc.id('B'), 'post', 'post_banc_msq', 'motif', 'open'), ('r2', banc.id('K'), 'post', 'post_banc_msq', 'motif', 'open'), ('r3', banc.id('O'), 'post', 'post_banc_msq', 'motif', 'open');
select banc.c2('B-11 trois signalements masquent et préviennent l''auteur, une fois', (select (public.post_masque('post_banc_msq'))::text || '|' || (select count(*) from public.notifications where user_id = banc.id('A') and kind = 'moderation' and ref_id = 'post_banc_msq')), 'true|1');

-- ④ Activités.
insert into public.event_attendees (event_id, user_id, rsvp) values ('evbanc1', banc.id('K'), 'going');
insert into public.conv_members (conv_id, user_id) values ('evgrp_evbanc1', banc.id('K'));
do $d$
declare r text; v text;
begin
  r := banc.sous(banc.id('K'), $s$update public.event_attendees set created_at = '2000-01-01' where event_id = 'evbanc1' and user_id = (auth.uid())::text$s$);
  select (created_at > '2020-01-01')::text into v from public.event_attendees where event_id = 'evbanc1' and user_id = banc.id('K');
  perform banc.c2('R28 la date d''entrée se fige', r || '|' || coalesce(v, 'absent'), 'ok:1|true');
  r := banc.sous(banc.id('K'), $s$update public.event_attendees set rsvp = 'maybe' where event_id = 'evbanc1' and user_id = (auth.uid())::text$s$);
  select count(*)::text into v from public.conv_members where conv_id = 'evgrp_evbanc1' and user_id = banc.id('K');
  perform banc.c2('R18 qui ne vient plus sort de la discussion', r || '|' || v, 'ok:1|0');
end $d$;
do $d$
declare i int; r text;
begin
  for i in 1..11 loop
    r := banc.val(banc.id('K'), $s$select public.pointer_par_code('evbanc1', 'FAUX')$s$);
  end loop;
  perform banc.c2('C-09 onzième essai de code', r, 'trop_d_essais');
end $d$;

-- ⑤ Oracle de majorité.
select banc.c2('B-16 sans conversation commune, la majorité d''un tiers ne se dit pas', banc.val(banc.id('M'), format($s$select public.irl_interaction_allowed(%L)$s$, banc.id('V'))), 'false');
-- Une conversation se crée sans l'accord de l'autre : seule sa réponse prouve un échange.
select banc.c2('B-16 sans réponse de l''autre, sa majorité ne se dit pas', banc.val(banc.id('A'), format($s$select public.irl_interaction_allowed(%L)$s$, banc.id('B'))), 'false');
do $d$ begin
  perform set_config('session_replication_role', 'replica', true);
  insert into public.conv_messages (id, conv_id, from_id, content)
    select 'msg_banc_reponse', a.conv_id, banc.id('B'), 'bonjour'
      from public.conv_members a join public.conv_members b on b.conv_id = a.conv_id and b.user_id = banc.id('B')
      join public.conversations c on c.id = a.conv_id and not coalesce(c.is_group, false)
     where a.user_id = banc.id('A') limit 1;
  perform set_config('session_replication_role', 'origin', true);
end $d$;
select banc.c2('Client : deux adultes en conversation', banc.val(banc.id('A'), format($s$select public.irl_interaction_allowed(%L)$s$, banc.id('B'))), 'true');

-- ⑥ Canaux.
select set_config('realtime.topic', 'vlive:inconnu', false);
select banc.c2('B-03 canal d''un live inexistant', banc.val(banc.id('M'), $s$select public.peut_voir_live('inconnu')$s$), 'false');
insert into public.video_lives (id, author_id, status) values ('vl_prive', banc.id('P'), 'live');
select banc.c2('B-03 live d''un compte privé : un tiers refusé, l''abonné accepté', (banc.val(banc.id('M'), $s$select public.peut_voir_live('vl_prive')$s$) || '|' || banc.val(banc.id('K'), $s$select public.peut_voir_live('vl_prive')$s$)), 'false|true');
insert into public.call_invites (id, from_id, to_id, kind) values ('appel_banc_01', banc.id('A'), banc.id('B'), 'voice');
select banc.c2('B-20 canal d''appel : les deux parties seulement', (banc.val(banc.id('A'), $s$select public.call_partie_prenante('appel_banc_01')$s$) || '|' || banc.val(banc.id('B'), $s$select public.call_partie_prenante('appel_banc_01')$s$) || '|' || banc.val(banc.id('M'), $s$select public.call_partie_prenante('appel_banc_01')$s$)), 'true|true|false');
select banc.c2('Le canal de sa propre conversation reste ouvert', banc.val(banc.id('A'), $s$select public.is_conv_member('conv_l', (auth.uid())::text)$s$), 'true');

-- ⑦ Fonctions retirées.
select banc.c2('B-22 un visiteur ne lit plus cdv_lives', banc.val(null, $s$select count(*) from public.cdv_lives$s$), 'err:42501');
select banc.c2('Un visiteur lit toujours les publications publiques', banc.val(null, $s$select count(*) > 0 from public.posts$s$), 'true');
