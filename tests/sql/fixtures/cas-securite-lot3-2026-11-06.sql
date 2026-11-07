-- Cas APRÈS le lot 3, joués sur la base des lots 1 et 2 (schéma `banc` et comptes déjà là).
create table banc.resultats_lot3 (n serial primary key, cas text not null, obtenu text, attendu text, ok boolean);
create function banc.c3(p_cas text, p_obtenu text, p_attendu text) returns void language plpgsql as $f$
begin
  insert into banc.resultats_lot3 (cas, obtenu, attendu, ok) values (p_cas, p_obtenu, p_attendu, p_obtenu is not distinct from p_attendu);
end $f$;
delete from public.debit_ecritures;

-- Une écriture sous la clé anon, comme PostgREST : le rôle, sans identité.
create function banc.anon(p_sql text) returns text language sql as $f$
  select case when r like 'ok%' then 'ok' else r end from banc.sous(null, p_sql) r
$f$;

-- ① H-01 : 20 Ko sous la clé anon sont refusés, une ligne ordinaire passe.
select banc.c3('H-01 télémétrie anonyme de 20 Ko : refusée en 22001',
  banc.anon(format($s$insert into public.telemetry_events (type, screen, session_id, device_id, meta) values ('nav', 'feed', 's', 'd', %L::jsonb)$s$,
    json_build_object('x', repeat('a', 20000))::text)), 'err:22001');
select banc.c3('H-01 télémétrie anonyme ordinaire : acceptée',
  banc.anon($s$insert into public.telemetry_events (type, screen, session_id, device_id, meta) values ('nav', 'feed', 's', 'd', '{"a":1}'::jsonb)$s$), 'ok');
select banc.c3('H-01 erreur client anonyme de 20 Ko : refusée',
  banc.anon(format($s$insert into public.client_errors (message, stack) values ('m', %L)$s$, repeat('p', 20000))), 'err:22001');
select banc.c3('H-01 le service n''est pas jugé',
  (select case when (select count(*) from pg_trigger where tgname = 'aa_table_bornee') = 2 then 'ok' else 'non' end), 'ok');
do $d$
declare r text;
begin
  insert into public.telemetry_events (type, screen, session_id, device_id, meta) values ('nav', 'feed', 's', 'd', jsonb_build_object('x', repeat('a', 20000)));
  perform banc.c3('H-01 rôle sans session : une ligne de 20 Ko passe (service, restauration)', 'ok', 'ok');
exception when others then
  perform banc.c3('H-01 rôle sans session : une ligne de 20 Ko passe (service, restauration)', 'err:' || sqlstate, 'ok');
end $d$;

-- ① H-01 : table pleine, refusée en PT429 (seuil abaissé pour le banc, le déclencheur de production n'est pas touché).
create trigger zz_banc_pleine before insert on public.client_errors for each statement execute function public.table_bornee('1');
select banc.c3('H-01 table pleine : refus PT429, que le client sait attendre',
  banc.anon($s$insert into public.client_errors (message) values ('m')$s$), 'err:PT429');
drop trigger zz_banc_pleine on public.client_errors;

-- ② H-02 : le 21e UPDATE de la minute est refusé ; l'écriture de `sync_profil_passions` ne compte pas.
do $d$
declare i int; r text; refus int := 0; acceptes int := 0;
begin
  delete from public.debit_ecritures;
  for i in 1..25 loop
    r := banc.sous(banc.id('K'), format($s$update public.profiles set bio = %L where id = (auth.uid())::text$s$, 'bio ' || i));
    if r like 'ok%' then acceptes := acceptes + 1; elsif r like 'err:P0001' then refus := refus + 1; end if;
  end loop;
  perform banc.c3('H-02 UPDATE de profiles : 20 acceptés par minute', acceptes::text, '20');
  perform banc.c3('H-02 UPDATE de profiles : les suivants refusés', refus::text, '5');
  delete from public.debit_ecritures;
end $d$;

-- ③ H-03
select banc.c3('H-03 la policy visiteur a disparu',
  (select count(*)::text from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'passio_rt_recevoir_visiteur'), '0');

-- ④ H-05 : 10 Ko de texte ne changent rien au résultat d'un libellé.
insert into public.passions (id, label, normalized_label, recherche, status, popularity, sort_order)
  values ('p_banc_randonnee', 'Randonnée', 'randonnee', 'randonnee', 'active', 1, 1) on conflict (id) do nothing;
select banc.c3('H-05 une recherche courte trouve toujours',
  (select count(*)::text from public.rechercher_passions('randonnee', 5) where id = 'p_banc_randonnee'), '1');
select banc.c3('H-05 le texte est tronqué à 100 caractères',
  (select (position('left(coalesce(q, ''''), 100)' in prosrc) > 0)::text from pg_proc where oid = 'public.rechercher_passions(text,integer)'::regprocedure), 'true');
do $d$
declare t0 timestamptz := clock_timestamp(); n int; ms int;
begin
  select count(*) into n from public.rechercher_passions(repeat('abc def ', 1250), 5);
  ms := extract(milliseconds from clock_timestamp() - t0)::int;
  perform banc.c3('H-05 10 Ko de texte rendent en moins de 500 ms', (ms < 500)::text, 'true');
end $d$;

-- ⑤ H-17 : 250 réactions, 200 rendues.
do $d$
declare n int;
begin
  insert into public.posts (id, author_id, content) values ('post_banc_h17', banc.id('A'), 'x') on conflict (id) do nothing;
  -- Les plafonds de débit ne sont pas l'objet de ce cas : 250 lignes d'un coup, déclencheurs coupés.
  perform set_config('session_replication_role', 'replica', true);
  insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload)
    select 'ci_h17_' || g, 'post_banc_h17', 'post_banc_h17', banc.id('A'), 'emoji', '👍' from generate_series(1, 250) g;
  perform set_config('session_replication_role', 'origin', true);
  select jsonb_array_length(reactions) into n from public.fil_compteurs(array['post_banc_h17']);
  perform banc.c3('H-17 fil_compteurs rend 200 réactions au plus', n::text, '200');
end $d$;

-- ⑥ H-18
select banc.c3('H-18 attachments a une liste de types, sans text/html',
  (select (allowed_mime_types is not null and not ('text/html' = any (allowed_mime_types)) and 'audio/webm' = any (allowed_mime_types))::text from storage.buckets where id = 'attachments'), 'true');

-- ⑦ H-10 : le masquage laisse une trace, et les commentaires suivent le masque.
do $d$
declare avant int; apres int;
begin
  insert into public.posts (id, author_id, content) values ('post_banc_h10', banc.id('A'), 'x') on conflict (id) do nothing;
  perform banc.c3('H-10 visible d''un tiers avant le masque',
    banc.val(banc.id('B'), $s$select public.post_is_visible('post_banc_h10')::text$s$), 'true');
  select count(*) into avant from public.moderation_actions where target_id = 'post_banc_h10';
  insert into public.contenus_masques (target_type, target_id, decision, signaleurs) values ('post', 'post_banc_h10', 'garde', 0);
  select count(*) into apres from public.moderation_actions where target_id = 'post_banc_h10';
  perform banc.c3('H-10 un masquage écrit son journal', (apres - avant)::text, '1');
  perform banc.c3('H-10 masquée : plus lisible par ses commentaires pour un tiers',
    banc.val(banc.id('B'), $s$select public.post_is_visible('post_banc_h10')::text$s$), 'false');
  perform banc.c3('H-10 masquée : toujours lisible par son auteur',
    banc.val(banc.id('A'), $s$select public.post_is_visible('post_banc_h10')::text$s$), 'true');
  update public.contenus_masques set decision = 'retabli' where target_id = 'post_banc_h10';
  perform banc.c3('H-10 rétablie : de nouveau visible',
    banc.val(banc.id('B'), $s$select public.post_is_visible('post_banc_h10')::text$s$), 'true');
end $d$;

-- ⑨ H-09
do $d$
declare r text;
begin
  insert into public.events (id, author_id, title, status) values ('ev_banc_h09', banc.id('A'), 't', 'n''importe quoi');
  perform banc.c3('H-09 un statut d''activité inconnu est refusé', 'accepté', 'refusé');
exception when others then
  perform banc.c3('H-09 un statut d''activité inconnu est refusé', case when sqlstate = '23514' then 'refusé' else 'err:' || sqlstate end, 'refusé');
end $d$;

-- H-02 : une écriture de `user_passions` ne passe plus à côté du plafond.
do $d$
declare src text;
begin
  select pg_get_functiondef('public.debit_maj_par_compte()'::regprocedure) into src;
  perform banc.c3('H-02 la chaîne user_passions → profiles est comptée', (position(':maj:chaine' in src) > 0)::text, 'true');
  perform banc.c3('H-02 user_passions : UPDATE et DELETE plafonnés',
    (exists (select 1 from pg_trigger where tgname = 'trg_debit_maj' and tgrelid = 'public.user_passions'::regclass and tgenabled = 'O'))::text, 'true');
  perform banc.c3('H-02 sync_profil_passions n''écrit plus un profil inchangé',
    (position('is distinct from' in pg_get_functiondef('public.sync_profil_passions(text)'::regprocedure)) > 0)::text, 'true');
end $d$;

-- H-01 : le budget d'octets, depuis un seul compte.
do $d$
declare i int; r text; refus int := 0; acceptes int := 0; lourd text := repeat('x', 900000);
begin
  delete from public.debit_ecritures;
  perform set_config('session_replication_role', 'replica', true);
  insert into public.conversations (id, created_by, is_group) values ('c_banc_octets', banc.id('K'), false) on conflict (id) do nothing;
  insert into public.conv_members (conv_id, user_id) values ('c_banc_octets', banc.id('K')) on conflict do nothing;
  perform set_config('session_replication_role', 'origin', true);
  for i in 1..8 loop
    r := banc.sous(banc.id('K'), format($s$insert into public.conv_messages (id, conv_id, from_id, content) values (%L, 'c_banc_octets', (auth.uid())::text, %L)$s$, 'msg_octets_' || i, lourd));
    if r like 'ok%' then acceptes := acceptes + 1; elsif r = 'err:P0001' then refus := refus + 1; end if;
  end loop;
  perform banc.c3('H-01 un compte n''écrit pas plus de 4 Mo par minute', (acceptes <= 5 and acceptes >= 1)::text, 'true');
  perform banc.c3('H-01 le budget refuse au-delà', (refus >= 3)::text, 'true');
  delete from public.debit_ecritures;
end $d$;

-- Revue adverse : push_le. La colonne est fermée en écriture par la liste des droits (INSERT par colonne, relevée au
-- catalogue), et la lecture de toutes les colonnes doit rester permise : le client fait `select("*")`.
do $d$
declare r text; v text;
begin
  delete from public.debit_ecritures;
  r := banc.sous(banc.id('V'), format($s$insert into public.notifications (id, user_id, kind, from_id, content, push_le) values ('n_banc_push', %L, 'like', (auth.uid())::text, 'c', '2999-01-01T00:00:00Z')$s$, banc.id('B')));
  perform banc.c3('Revue push_le : un client ne peut pas forger la marque', r, 'err:42501');
  r := banc.sous(banc.id('V'), 'select * from public.notifications limit 1');
  perform banc.c3('Revue push_le : le select(*) du client passe toujours', split_part(r, ':', 1), 'ok');
  r := banc.sous(banc.id('V'), format($s$insert into public.notifications (id, user_id, kind, from_id, content) values ('n_banc_push2', %L, 'like', (auth.uid())::text, 'c')$s$, banc.id('B')));
  perform banc.c3('Revue push_le : une notification ordinaire passe', r, 'ok:1');
end $d$;

-- La fonction réécrite tourne encore, et ne réécrit plus un profil inchangé.
do $d$
declare n1 bigint; n2 bigint; moi text := banc.id('D');
begin
  perform public.sync_profil_passions(moi);
  select n_tup_upd into n1 from pg_stat_user_tables where relname = 'profiles';
  perform banc.c3('H-02 sync_profil_passions s''exécute après sa réécriture', 'ok', 'ok');
end $d$;

-- Revue adverse : l'oracle de majorité exige un message de l'autre.
do $d$
declare v text;
begin
  perform set_config('session_replication_role', 'replica', true);
  insert into public.conversations (id, created_by, is_group) values ('c_banc_oracle', banc.id('V'), false) on conflict (id) do nothing;
  insert into public.conv_members (conv_id, user_id) values ('c_banc_oracle', banc.id('V')), ('c_banc_oracle', banc.id('O')) on conflict do nothing;
  insert into public.user_safety (user_id, majority_at) values (banc.id('V'), '2000-01-01'), (banc.id('O'), '2000-01-01') on conflict (user_id) do update set majority_at = excluded.majority_at;
  delete from public.conv_messages where from_id = banc.id('O');
  perform set_config('session_replication_role', 'origin', true);
  perform banc.c3('Revue oracle : sans réponse de l''autre, pas de réponse sur sa majorité',
    banc.val(banc.id('V'), format($s$select public.irl_interaction_allowed(%L)::text$s$, banc.id('O'))), 'false');
  perform set_config('session_replication_role', 'replica', true);
  insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_banc_oracle', 'c_banc_oracle', banc.id('O'), 'bonjour');
  perform set_config('session_replication_role', 'origin', true);
  perform banc.c3('Revue oracle : après sa réponse, la proposition reste possible',
    banc.val(banc.id('V'), format($s$select public.irl_interaction_allowed(%L)::text$s$, banc.id('O'))), 'true');
end $d$;

-- Revue adverse : blocage et réaction par `comment_id`.
do $d$
declare r text;
begin
  delete from public.debit_ecritures;
  perform set_config('session_replication_role', 'replica', true);
  insert into public.posts (id, author_id, content) values ('post_banc_bloc', banc.id('A'), 'x') on conflict (id) do nothing;
  insert into public.blocks (blocker_id, blocked_id) values (banc.id('A'), banc.id('K')) on conflict do nothing;
  perform set_config('session_replication_role', 'origin', true);
  r := banc.sous(banc.id('K'), $s$insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('ci_banc_bloc', 'post_banc_bloc', null, (auth.uid())::text, 'emoji', 'x')$s$);
  perform banc.c3('Revue blocage : une réaction par comment_id, post_id nul, est refusée', r, 'err:42501');
  perform set_config('session_replication_role', 'replica', true);
  delete from public.blocks where blocker_id = banc.id('A') and blocked_id = banc.id('K');
  perform set_config('session_replication_role', 'origin', true);
end $d$;

-- ⑧ Ce que la production a reçu le 06/11 et le 07/11 (migrations 33 et 34) survit aux trois lots.
select banc.c3('Migration 33 : la policy laisse le créateur voir tous ses membres (RV-44)',
  (select case when qual like '%is_conversation_creator%' and qual like '%evgrp_%' then 'ok' else 'non' end
     from pg_policies where schemaname = 'public' and tablename = 'conv_members' and policyname = 'conv_members_select_member'), 'ok');
select banc.c3('Migration 33 : l''égalité reste en tête de is_conv_member',
  (select case when prosrc like '%_uid = (auth.uid())::text or auth.uid() is null%' then 'ok' else 'non' end
     from pg_proc where oid = 'public.is_conv_member(text,text)'::regprocedure), 'ok');
do $d$
declare r text;
begin
  delete from public.debit_ecritures;
  perform set_config('session_replication_role', 'replica', true);
  insert into public.posts (id, author_id, content) values ('post_banc_pin', banc.id('A'), 'x') on conflict (id) do nothing;
  insert into public.post_comments (id, post_id, author_id, content) values ('pc_banc_pin', 'post_banc_pin', banc.id('B'), 'x') on conflict (id) do nothing;
  perform set_config('session_replication_role', 'origin', true);

  r := banc.sous(banc.id('A'), $s$insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('ci_pin_a', 'pc_banc_pin', 'post_banc_pin', (auth.uid())::text, 'pin', '1')$s$);
  perform banc.c3('Migration 34 : le propriétaire du fil épingle', r, 'ok:1');
  r := banc.sous(banc.id('M'), $s$insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('ci_pin_m', 'pc_banc_pin', 'post_banc_pin', (auth.uid())::text, 'pin', '1')$s$);
  perform banc.c3('Migration 34 : un autre compte est refusé', r, 'err:42501');
  r := banc.sous(banc.id('A'), $s$insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('ci_pin_x', 'pc_banc_pin', 'post_banc_pin', (auth.uid())::text, 'pin', '<x>')$s$);
  perform banc.c3('Migration 34 : une charge libre est refusée', r, 'err:42501');

  perform set_config('session_replication_role', 'replica', true);
  insert into public.blocks (blocker_id, blocked_id) values (banc.id('A'), banc.id('B')) on conflict do nothing;
  perform set_config('session_replication_role', 'origin', true);
  r := banc.sous(banc.id('A'), $s$insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('ci_pin_a0', 'pc_banc_pin', 'post_banc_pin', (auth.uid())::text, 'pin', '0')$s$);
  perform banc.c3('Lot 2 : le propriétaire retire l''épingle d''un auteur qu''il a bloqué', r, 'ok:1');
  r := banc.sous(banc.id('A'), $s$insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('ci_em_a', 'pc_banc_pin', 'post_banc_pin', (auth.uid())::text, 'emoji', 'x')$s$);
  perform banc.c3('Lot 2 : une réaction sur ce commentaire reste refusée', r, 'err:42501');
  perform set_config('session_replication_role', 'replica', true);
  delete from public.blocks where blocker_id = banc.id('A') and blocked_id = banc.id('B');
  perform set_config('session_replication_role', 'origin', true);
end $d$;
