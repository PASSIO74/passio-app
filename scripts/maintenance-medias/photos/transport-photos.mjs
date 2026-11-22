// Transport étroit sur le courtier de requêtes du workflow : une mutation réservée avant son émission,
// un seul essai, une réponse réseau bornée et vérifiée par le courtier. Aucun secret lu par ce module.
import {preparerDeux,copierEtPreparer} from './copier.mjs';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const target='njkiyoklssvefstljemx',sqlPath='/v1/projects/'+target+'/database/query';
const stateSQL=`WITH p AS (SELECT $1::uuid AS src,$2::text AS srcname,$3::text AS dstname,$4::text AS parent,$5::text AS owner,$6::uuid AS asset,$7::text AS ref),
 objects AS (SELECT o.*, jsonb_build_object('id',o.id::text,'bucket',o.bucket_id,'name',o.name,'owner',o.owner::text,'owner_id',o.owner_id,
 'version',o.version::text,'mime',o.metadata->>'mimetype','size',o.metadata->>'size','etag',o.metadata->>'eTag') AS objet FROM storage.objects o,p
 WHERE (o.bucket_id='content' AND o.name=p.srcname OR o.bucket_id='content-protected' AND o.name=p.dstname))
 SELECT jsonb_build_object('prive',exists(select 1 from storage.buckets where id='content-protected' and public=false),
 'source',(select objet from objects where bucket_id='content' and archived_at is null and is_delete_marker is false),
 'copie',(select objet from objects where bucket_id='content-protected'),
 'parent_conforme',exists(select 1 from public.posts t join public.profiles pr on pr.id=t.author_id,p where pr.is_private=true and t.id=p.parent and t.author_id=p.owner and t.shared_from_post_id is null and (t.vlog is null or t.vlog='null'::jsonb) and encode(sha256(convert_to(t.media_url,'UTF8')),'hex')=p.ref),
 'owner_vivant',exists(select 1 from auth.users u,p where u.id::text=p.owner and (u.banned_until is null or u.banned_until<=current_timestamp)) and not exists(select 1 from public.comptes_en_suppression c,p where c.user_id::text=p.owner and c.statut in ('en_cours','purgee','supprimee')),
 'asset_libre',not exists(select 1 from public.media_assets a,p where a.id=p.asset or a.post_id=p.parent)
 and not exists(select 1 from public.media_reservations r,p where r.id=p.asset)
 and not exists(select 1 from public.media_objects o,p where o.object_key=p.dstname or o.asset_id=p.asset)
 and not exists(select 1 from objects where archived_at is not null or is_delete_marker is distinct from false)) as etat`;
const ownerSQL=`update storage.objects d set owner=$1::uuid,owner_id=$1::text
 where d.bucket_id='content-protected' and d.name=$2 and d.id=$3::uuid and d.version::text=$4 and d.owner is null and d.owner_id is null and d.archived_at is null and d.is_delete_marker is false
 and d.metadata->>'mimetype'=$5 and d.metadata->>'size'=$6 and d.metadata->>'eTag' is not distinct from $7
 and exists(select 1 from storage.buckets b where b.id=d.bucket_id and b.public=false)
 and exists(select 1 from storage.objects s where s.bucket_id='content' and s.id=$8::uuid and s.name=$9 and s.version::text=$10 and s.owner=$1::uuid and s.owner_id=$1 and s.archived_at is null and s.is_delete_marker is false)
 returning d.id::text as id`;
// Paramètre $1 typé text partout, y compris pour la colonne UUID.
const casSQL=ownerSQL.replaceAll('$1::uuid','($1::text)::uuid');
const ok=v=>{if(!v)throw Error('TRANSPORT_DEUX_COPIES_REFUSE');};
const escapeKey=k=>k.split('/').map(encodeURIComponent).join('/');
export function creerIO(plan,courtier){
 const scope=new Set(plan),copied=new Set(),attempted=new Set(),adopted=new Set();let calls=0;
 const request=(p,lane,desc)=>{ok(scope.has(p)&&++calls<=26);return courtier.requete({cible:target,...desc,lane,source_fp:p.fp,route_fp:p.route_sha256,timeout_ms:15000,relance:false});};
 const sql=(p,query,parameters,ro)=>request(p,'management',{host:'api.supabase.com',method:'POST',path:sqlPath,body:{query,parameters,read_only:ro},http:201,max_octets:16384});
 return {
  async etat(p){const rows=await sql(p,stateSQL,[p.s.id,p.s.name,p.key,p.parent.post_id,p.s.owner,p.asset,p.parent.reference_sha256],true);ok(Array.isArray(rows)&&rows.length===1);return rows[0].etat;},
  async flux(p,side){ok(side==='source'||side==='copie'&&copied.has(p));const key=side==='source'?'content/'+escapeKey(p.s.name):'content-protected/'+escapeKey(p.key);return request(p,'storage',{host:target+'.supabase.co',method:'GET',path:'/storage/v1/object/authenticated/'+key,http:200,flux:true,max_octets:Number(p.s.size)});},
  async copy(p){ok(!attempted.has(p));attempted.add(p);ok((await courtier.intentionDurable({operation:'COPY_APPLICATIVE',source_fp:p.fp,asset:p.asset,destination_fp:sha(p.key)}))?.durable===true);
   const r=await request(p,'storage',{host:target+'.supabase.co',method:'POST',path:'/storage/v1/object/copy',body:{bucketId:'content',sourceKey:p.s.name,destinationBucket:'content-protected',destinationKey:p.key},http:200,max_octets:2048});copied.add(p);return r;},
  async corrigerProprietaire(p,d){ok(copied.has(p)&&!adopted.has(p)&&d.name===p.key&&d.owner===null&&d.owner_id===null);adopted.add(p);
   ok((await courtier.intentionDurable({operation:'OWNER_COPIE_NULL',source_fp:p.fp,asset:p.asset,destination_fp:sha(p.key),identite_fp:sha(d.id+'|'+d.version)}))?.durable===true);
   const r=await sql(p,casSQL,[p.s.owner,p.key,d.id,d.version,d.mime,d.size,d.etag,p.s.id,p.s.name,p.s.version],false);ok(Array.isArray(r)&&r.length===1&&r[0].id===d.id);}
 };
}
