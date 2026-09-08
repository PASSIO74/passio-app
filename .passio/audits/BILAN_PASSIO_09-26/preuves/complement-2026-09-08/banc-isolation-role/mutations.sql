\pset format unaligned
\pset tuples_only on
-- M1 retirer la garde de lecture des notifications : A ne voit plus la sienne (prouve que le banc mesure bien la policy)
drop policy "Lecture propre" on notifications;
begin; set local role authenticated; set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; select 'M1 sans policy, A voit ses notifs|' || count(*) from notifications; rollback;
-- M2 retirer reads_select : la fuite anon de conv_reads disparaît (prouve que la fuite EST cette policy)
drop policy "reads_select" on conv_reads;
begin; set local role anon; select 'M2 sans reads_select, anon conv_reads|' || count(*) from conv_reads; rollback;
-- M3 retirer passio_media_read : anon ne liste plus attachments
drop policy "passio_media_read" on storage.objects;
begin; set local role anon; select 'M3 sans passio_media_read, anon attachments|' || count(*) from storage.objects where bucket_id='attachments'; rollback;
