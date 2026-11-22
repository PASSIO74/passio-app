-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 2026-11-22 — D10-04 : LE SEAU PUBLIC `content` N'ACCEPTE PLUS QUE CE QUE L'APPLICATION Y MET
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun PREREQUIS-CLIENT : le client ne
-- dépose dans `content` que des images (avatars, couvertures, photos et couvertures de passion,
-- couvertures d'activité — `supaUploadMedia`, app-08), redimensionnées à 2 048 px au plus. Les
-- publications, stories, vidéos et sons passent par le seau protégé depuis le 2026-11-16.
-- Banc : tests/sql/migration-securite-p1-seau-public-2026-11-22.test.sh.
--
-- CE QUI CHANGE : le seau public garde sa lecture publique (avatars et couvertures s'affichent aux
-- visiteurs) mais n'accepte plus, en dépôt comme en remplacement :
--   · que des types d'image (les types vidéo et audio sortent de la liste) ;
--   · que des fichiers de 8 Mio au plus (27 262 976 octets avant).
-- Mesuré en production le 2026-11-22 sur 120 jours : 17 dépôts, tous JPEG ou WebP, le plus gros à
-- 1,28 Mo. La borne laisse plus de six fois cette marge.
-- Les fichiers déjà en place ne changent pas : Storage applique ces bornes au dépôt.
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| update storage.buckets set file_size_limit = 27262976, allowed_mime_types = array[
--|   'image/jpeg','image/jpg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','image/bmp',
--|   'video/mp4','video/webm','video/quicktime','video/3gpp','video/x-m4v',
--|   'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/webm','audio/ogg','audio/wav','audio/x-wav','audio/flac'
--| ] where id = 'content';
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$ begin
 if not exists (select 1 from storage.buckets where id = 'content' and public) then
  raise exception 'seau public content absent : relire le catalogue';
 end if;
 -- Un dépôt récent hors de la nouvelle borne serait un usage réel que ce lot casserait : on s'arrête.
 if exists (select 1 from storage.objects o
             where o.bucket_id = 'content' and o.created_at > now() - interval '30 days'
               and (coalesce(o.metadata->>'mimetype', '') not like 'image/%'
                    or coalesce(nullif(o.metadata->>'size', '')::bigint, 0) > 8388608)) then
  raise exception 'un depot recent de content sort de la nouvelle borne : relire avant de serrer';
 end if;
end $g$;

update storage.buckets
   set file_size_limit = 8388608,
       allowed_mime_types = array['image/jpeg','image/jpg','image/png','image/webp','image/gif',
                                  'image/avif','image/heic','image/heif','image/bmp']
 where id = 'content';

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'seau content : toujours public (avatars et couvertures)' as controle,
       case when (select public from storage.buckets where id = 'content') then 'OK' else 'ECHEC' end as valeur
union all select 'seau content : 8 Mio au plus par fichier',
       case when (select file_size_limit from storage.buckets where id = 'content') = 8388608 then 'OK' else 'ECHEC' end
union all select 'seau content : images seulement',
       case when (select bool_and(m like 'image/%') and count(*) = 9
                    from storage.buckets b, unnest(b.allowed_mime_types) m where b.id = 'content') then 'OK' else 'ECHEC' end
union all select 'seaux privés inchangés',
       case when (select count(*) from storage.buckets where id in ('content-protected','attachments') and not public) = 2
            then 'OK' else 'ECHEC' end;

commit;
