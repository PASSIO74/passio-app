-- ════════════════════════════════════════════════════════════════════
-- CRÉATION DES BUCKETS STORAGE — 2026-06-12
-- À exécuter dans le SQL Editor Supabase.
-- ════════════════════════════════════════════════════════════════════
--
-- Cause racine d'un bug bloquant trouvé en test réel : AUCUN bucket Storage
-- n'existait (listBuckets() vide). Conséquences :
--   • partage de photo sur le feed → upload « Bucket not found » → fallback
--     base64 → media_url null → photo jamais persistée/partagée ;
--   • envoi de photo/document en messagerie → upload « Bucket not found » →
--     fallback base64 dans conv_messages.content → message KO.
--
-- Le code applicatif uploade les médias de posts dans le bucket « content »
-- (supaUploadMedia, app-08) et les pièces jointes de messagerie dans
-- « attachments » (handleAttachFile, app-09). On crée les deux, publics en
-- lecture (les URLs publiques sont servies par le CDN), écriture réservée aux
-- utilisateurs authentifiés.

-- 1) Buckets publics en lecture
insert into storage.buckets (id, name, public)
values ('content', 'content', true), ('attachments', 'attachments', true)
on conflict (id) do update set public = true;

-- 2) Policies RLS sur storage.objects (idempotent)
drop policy if exists "passio_media_read"   on storage.objects;
drop policy if exists "passio_media_insert" on storage.objects;
drop policy if exists "passio_media_update" on storage.objects;
drop policy if exists "passio_media_delete" on storage.objects;

-- Lecture publique des deux buckets (en plus du flag public, pour les SDK)
create policy "passio_media_read" on storage.objects
  for select using (bucket_id in ('content', 'attachments'));

-- Écriture réservée aux utilisateurs authentifiés (anonymes inclus)
create policy "passio_media_insert" on storage.objects
  for insert with check (bucket_id in ('content', 'attachments') and auth.role() = 'authenticated');

-- Mise à jour / suppression : uniquement le propriétaire du fichier
create policy "passio_media_update" on storage.objects
  for update using (bucket_id in ('content', 'attachments') and owner = auth.uid());

create policy "passio_media_delete" on storage.objects
  for delete using (bucket_id in ('content', 'attachments') and owner = auth.uid());

-- Vérification :
-- select id, public from storage.buckets where id in ('content','attachments');
-- select policyname, cmd from pg_policies where tablename = 'objects' and policyname like 'passio_%';
