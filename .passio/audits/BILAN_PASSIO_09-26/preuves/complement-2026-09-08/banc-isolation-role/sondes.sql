\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP off
-- S01 anon liste les pièces jointes privées du bucket attachments (SUP-01/MSG-03)
begin; set local role anon; select 'S01 anon liste attachments|' || string_agg(name, ',') from storage.objects where bucket_id='attachments'; rollback;
-- S02 anon lit les accusés de lecture de conversations privées (SUP-02/MSG-05)
begin; set local role anon; select 'S02 anon conv_reads|' || count(*) || ' lignes, conv=' || string_agg(distinct conv_id, ',') from conv_reads; rollback;
-- S03 anon lit adresse exacte + téléphone + participants d'une rencontre (IRL-01/IRL-03)
begin; set local role anon; select 'S03 anon events|' || address || ' / ' || contact from events; select 'S03 anon participants|' || string_agg(user_id||':'||rsvp, ',') from event_attendees; rollback;
-- S04 oracle d'appartenance sans compte (is_conv_member exécutable par anon)
begin; set local role anon; select 'S04 anon is_conv_member(conv1,A)|' || is_conv_member('conv1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); rollback;
-- S05 B (tiers) publie sous l'identité de A → attendu refus
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into posts(id,author_id,content) values ('x','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','usurpe'); select 'S05 B insert post as A|ACCEPTE'; rollback;
-- S06 B s'invite dans la conversation privée de A → attendu refus
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into conv_members values ('conv1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); select 'S06 B join conv1|ACCEPTE'; rollback;
-- S07 B écrit dans conv1 sans en être membre → attendu refus
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into conv_messages(id,conv_id,from_id,content) values ('mx','conv1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','intrus'); select 'S07 B message conv1|ACCEPTE'; rollback;
-- S08 compte privé : B (non abonné) ne voit pas le post de C ; A (abonné) le voit
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select 'S08 B voit post_C|' || count(*) from posts where id='post_C'; rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; select 'S08 A voit post_C|' || count(*) from posts where id='post_C'; rollback;
begin; set local role anon; select 'S08 anon voit post_C|' || count(*) from posts where id='post_C'; rollback;
-- S09 B tente de changer l'auteur du post de A → 0 ligne
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; with u as (update posts set author_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='post_A' returning 1) select 'S09 B update post_A|' || count(*) from u; rollback;
-- S10 signalements : aucun SELECT possible côté client (ni anon ni auteur)
begin; set local role authenticated; set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; select 'S10 A lit ses reports|' || count(*) from reports; rollback;
-- S11 télémétrie / user_state / user_safety / push / notifications d'autrui par B
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select 'S11 B telemetry|' || (select count(*) from telemetry_events) || ' user_state|' || (select count(*) from user_state) || ' user_safety|' || (select count(*) from user_safety) || ' push|' || (select count(*) from push_subscriptions) || ' notifs|' || (select count(*) from notifications) || ' messages|' || (select count(*) from conv_messages); rollback;
-- S12 B fabrique une notification signée par A → refus ; signée par lui-même → accepté
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into notifications(id,user_id,kind,from_id) values ('nx','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','like','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); select 'S12 B notif from=A|ACCEPTE'; rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into notifications(id,user_id,kind,from_id) values ('ny','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','like','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); select 'S12 B notif from=B|ACCEPTE'; rollback;
-- S13 B dépose une pièce jointe dans la conversation de A → refus ; dans son propre dossier content → accepté
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into storage.objects(bucket_id,name,owner) values ('attachments','conv/conv1/intrus.webm','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); select 'S13 B upload attachments conv1|ACCEPTE'; rollback;
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into storage.objects(bucket_id,name,owner) values ('content','u/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/ok.jpg','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); select 'S13 B upload content propre|ACCEPTE'; rollback;
-- S14 B supprime la pièce jointe de A → 0 ligne
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; with d as (delete from storage.objects where owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1) select 'S14 B delete objets de A|' || count(*) from d; rollback;
-- S15 anon lit le profil complet (bio, rs_links) et les abonnements
begin; set local role anon; select 'S15 anon profiles|' || count(*) || ' rs_links=' || count(rs_links) from profiles; select 'S15 anon follows|' || count(*) from follows; select 'S15 anon user_passions|' || count(*) from user_passions; rollback;
-- S16 anon : oracles post_is_visible / comment_target_visible sur un post privé
begin; set local role anon; select 'S16 anon post_is_visible(post_C)|' || post_is_visible('post_C') || ' inconnu|' || post_is_visible('nexistepas'); rollback;
-- S17 B écrit une insertion telemetry avec user_id=A → refus ; user_id NULL → accepté
begin; set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; insert into telemetry_events(type,user_id) values ('x','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); select 'S17 B telemetry as A|ACCEPTE'; rollback;
begin; set local role anon; insert into telemetry_events(type,user_id) values ('x',null); select 'S17 anon telemetry null|ACCEPTE'; rollback;
-- S18 anon insère un signalement / une erreur client sans compte
begin; set local role anon; insert into reports(id,reporter_id) values ('rz',null); select 'S18 anon report reporter=null|ACCEPTE'; rollback;
begin; set local role anon; insert into client_errors(message) values ('spam'); select 'S18 anon client_errors|ACCEPTE'; rollback;
