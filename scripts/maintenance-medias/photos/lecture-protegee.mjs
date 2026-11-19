import {UUID,sha,stop} from './contrat.mjs';

// Seul le serveur de maintenance lit ces métadonnées. Le journal ne reçoit que des empreintes.
export const SQL_LECTURE_PROTEGEE = `select a.id::text as asset, o.id::text as objet, o.version::text as version, o.name as cle
 from public.media_assets a
 join public.posts p on p.id=a.post_id and p.author_id=a.owner_id and a.story_id is null
 join public.profiles pr on pr.id=p.author_id and pr.is_private is true
 join auth.users u on u.id::text=p.author_id and u.deleted_at is null and (u.banned_until is null or u.banned_until <= current_timestamp)
 join public.media_objects mo on mo.asset_id=a.id and mo.variant='original' and mo.bucket_id='content-protected'
 join storage.objects o on o.id=mo.storage_object_id and o.bucket_id=mo.bucket_id and o.name=mo.object_key
 join storage.buckets b on b.id=o.bucket_id and b.public=false
 where current_setting('transaction_read_only')='on'
 and p.shared_from_post_id is null and (p.vlog is null or p.vlog='null'::jsonb)
 and exists(select 1 from public.reglages_distants where cle='medias_proteges' and valeur->'actif'='true'::jsonb)
 and not exists(select 1 from public.comptes_en_suppression d where d.user_id::text=p.author_id and d.statut in ('en_cours','purgee','supprimee'))
 and p.author_id=$1 and encode(sha256(convert_to(p.id,'UTF8')),'hex')=$2
 and encode(sha256(convert_to(p.media_url,'UTF8')),'hex')=$3 and a.heritage_ref_sha256=$3
 and encode(sha256(convert_to(a.id::text,'UTF8')),'hex')=$4
 and o.owner::text=$1 and o.owner_id=$1 and not o.is_delete_marker and o.archived_at is null
 and mo.mime_type=$5 and o.metadata->>'mimetype'=$5 and mo.byte_size=$6::bigint and (o.metadata->>'size')::bigint=$6::bigint
 and (not $7::boolean or not exists(
   select 1 from public.follows f join public.profiles lecteur on lecteur.id=f.follower_id
   join auth.users uf on uf.id::text=lecteur.id and uf.deleted_at is null
   where f.following_id=p.author_id and f.status='accepted' and (uf.banned_until is null or uf.banned_until<=current_timestamp)
   and not exists(select 1 from public.comptes_en_suppression d where d.user_id::text=lecteur.id and d.statut in ('en_cours','purgee','supprimee'))
 )) limit 2`;

export function cleApplicative(rows,source,attendue){
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[source.mime];
 if(!Array.isArray(rows)||rows.length!==1||!ext)stop('PARENT_DERIVE');
 const {asset,objet,version,cle}=rows[0];
 if(!UUID.test(asset)||!UUID.test(objet)||!version||typeof version!=='string'||
    sha(asset)!==attendue.asset_fp||cle!==source.owner+'/'+asset+'/original.'+ext||
    sha(JSON.stringify([asset,'original',cle,objet]))!==attendue.registre_fp||
    sha(JSON.stringify([objet,'content-protected',cle,version]))!==attendue.object_fp)stop('PARENT_DERIVE');
 return cle;
}
