-- Cas APRÈS le lot 4, joués sur la base des trois premiers lots (schéma `banc` et comptes déjà là).
create table banc.resultats_lot4 (n serial primary key, cas text not null, obtenu text, attendu text, ok boolean);
create function banc.c4(p_cas text, p_obtenu text, p_attendu text) returns void language plpgsql as $f$
begin
  insert into banc.resultats_lot4 (cas, obtenu, attendu, ok) values (p_cas, p_obtenu, p_attendu, p_obtenu is not distinct from p_attendu);
end $f$;
delete from public.debit_ecritures;

select banc.c4('L''organisation publie : le point est arrondi, l''adresse gardée',
  banc.sous(banc.id('A'), format($s$insert into public.events (id, author_id, organizer_id, title, date_at, status, lat, lng, address, contact, co_organizers)
    values ('ev_lieu', %L, %L, 'Chez moi', now() + interval '2 days', 'active', 45.76404, 4.83566, '12 rue du Domicile', '0600000000', '[]'::jsonb)$s$, banc.id('A'), banc.id('A'))), 'ok:1');
select banc.c4('Le point stocké est à 1 km', (select lat || ',' || lng from public.events where id = 'ev_lieu'), '45.76,4.84');
select banc.c4('Le visiteur lit le point arrondi', banc.val(null, $s$select lat::text from public.events where id = 'ev_lieu'$s$), '45.76');

select banc.c4('Un compte ne lit plus l''adresse dans la table', banc.val(banc.id('M'), $s$select address from public.events where id = 'ev_lieu'$s$), 'err:42501');
select banc.c4('Un compte ne lit plus le contact dans la table', banc.val(banc.id('M'), $s$select contact from public.events where id = 'ev_lieu'$s$), 'err:42501');
select banc.c4('Un compte lit toujours le titre', banc.val(banc.id('M'), $s$select title from public.events where id = 'ev_lieu'$s$), 'Chez moi');
select banc.c4('Un select étoile est refusé, le client n''en fait plus', banc.val(banc.id('M'), $s$select count(*) from (select * from public.events where id = 'ev_lieu') x$s$), 'err:42501');
select banc.c4('L''organisation non plus, en direct', banc.val(banc.id('A'), $s$select address from public.events where id = 'ev_lieu'$s$), 'err:42501');
select banc.c4('Un visiteur n''a pas la fonction', banc.val(null, $s$select count(*)::text from public.adresses_activites(array['ev_lieu'])$s$), 'err:42501');

select banc.c4('Un compte sans lien : rien', banc.val(banc.id('M'), $s$select count(*)::text from public.adresses_activites(array['ev_lieu'])$s$), '0');
select banc.c4('L''organisation lit son adresse', banc.val(banc.id('A'), $s$select address from public.adresses_activites(array['ev_lieu'])$s$), '12 rue du Domicile');
select banc.c4('L''organisation lit son contact', banc.val(banc.id('A'), $s$select contact from public.adresses_activites(array['ev_lieu'])$s$), '0600000000');

select banc.c4('« Peut-être » ne donne pas l''adresse', (select banc.sous(banc.id('M'), $s$insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_lieu', (auth.uid())::text, 'maybe')$s$) || '|' ||
    banc.val(banc.id('M'), $s$select count(*)::text from public.adresses_activites(array['ev_lieu'])$s$)), 'ok:1|0');
select banc.c4('La liste d''attente ne la donne pas', (select banc.sous(banc.id('M'), $s$update public.event_attendees set rsvp = 'waitlist' where event_id = 'ev_lieu' and user_id = (auth.uid())::text$s$) || '|' ||
    banc.val(banc.id('M'), $s$select count(*)::text from public.adresses_activites(array['ev_lieu'])$s$)), 'ok:1|0');
select banc.c4('Venir la donne', (select banc.sous(banc.id('M'), $s$update public.event_attendees set rsvp = 'going' where event_id = 'ev_lieu' and user_id = (auth.uid())::text$s$) || '|' ||
    banc.val(banc.id('M'), $s$select address from public.adresses_activites(array['ev_lieu'])$s$)), 'ok:1|12 rue du Domicile');

do $d$
declare r text;
begin
  perform set_config('session_replication_role', 'replica', true);
  insert into public.blocks (blocker_id, blocked_id) values (banc.id('A'), banc.id('M')) on conflict do nothing;
  perform set_config('session_replication_role', 'origin', true);
  r := banc.val(banc.id('M'), $s$select count(*)::text from public.adresses_activites(array['ev_lieu'])$s$);
  perform banc.c4('Un compte bloqué ne la lit plus, même inscrit', r, '0');
  perform set_config('session_replication_role', 'replica', true);
  delete from public.blocks where blocker_id = banc.id('A') and blocked_id = banc.id('M');
  perform set_config('session_replication_role', 'origin', true);
end $d$;

select banc.c4('Se désinscrire la retire', (select banc.sous(banc.id('M'), $s$delete from public.event_attendees where event_id = 'ev_lieu' and user_id = (auth.uid())::text$s$) || '|' ||
    banc.val(banc.id('M'), $s$select count(*)::text from public.adresses_activites(array['ev_lieu'])$s$)), 'ok:1|0');

select banc.c4('L''organisation modifie l''adresse, comme avant',
  banc.sous(banc.id('A'), $s$update public.events set address = '14 rue du Domicile', contact = null where id = 'ev_lieu'$s$), 'ok:1');
select banc.c4('La modification du point passe',
  banc.sous(banc.id('A'), $s$update public.events set lat = 48.85661, lng = 2.35222 where id = 'ev_lieu'$s$), 'ok:1');
select banc.c4('La modification du point est arrondie', (select lat || ',' || lng from public.events where id = 'ev_lieu'), '48.86,2.35');
select banc.c4('La demande est bornée à 200 activités', (select pg_get_functiondef('public.adresses_activites(text[])'::regprocedure) like '%[1:200]%')::text, 'true');
