import {APERCU,CIBLE,fingerprint,memesOverlays} from './parcours.mjs';
import {verifierProprieteAuth} from './session-synthetique.mjs';

const v4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const local='https://media.passio.invalid';
function ok(value){if(!value)throw Error('REQUETE_HORS_FIXTURE');}
function exactly(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');}
function readBody(buf){
  ok(Buffer.isBuffer(buf)&&buf.length>0&&buf.length<6144);
  try{return JSON.parse(buf.toString('utf8'));}catch{throw Error('REQUETE_HORS_FIXTURE');}
}
export function barriere(f){
  const {run:RUN,owner:A,reader:B}=f;
  ok([RUN,A,B].every(id=>v4.test(id))&&new Set([RUN,A,B]).size===3&&f.sources.length===2);
  const pending=new Map(),accepted=new Map(),uploads=new Set();

  const src=id=>f.sources.find(s=>s.id===id);
  const byKind=k=>f.sources.find(s=>s.kind===k);
  const deny=()=>({action:'fermer'});
  const empty=()=>({action:'vide_local'}); // Jamais transmis à staging.
  function prepare({url,method,headers,body=Buffer.alloc(0),actor,token}){
    try{
      const u=new URL(url);
      ok([APERCU,CIBLE].includes(u.origin)&&!u.username&&!u.password&&!u.hash&&[A,B,null].includes(actor));
      const h=new Headers(headers),path=u.pathname;
      if(u.origin===CIBLE && method==='GET' && path.startsWith('/rest/v1/') &&
        !['/rest/v1/profiles','/rest/v1/posts','/rest/v1/stories'].includes(path))return empty();
      ok(actor===null?!h.has('authorization'):(typeof token==='string'&&token.length>0&&h.get('authorization')==='Bearer '+token));
      if(u.origin===APERCU){
        ok(method==='POST'&&!u.search&&body.length===0&&h.get('x-passio-media-read')==='1');
        if(path==='/private-media/capabilities'){ok(!h.has('range'));return {action:'capacites'};}
        const asset=[...accepted.values()].find(l=>l.path===path);
        ok(asset&&uploads.has(asset.asset)&&[null,'bytes=0-7'].includes(h.get('range')));
        return {action:'lecture_media',kind:asset.kind};
      }
      if(method==='GET'&&path==='/auth/v1/user'&&!u.search&&[A,B].includes(actor)&&body.length===0)return {action:'utilisateur_fixture',actor};
      if(method==='GET'&&path.startsWith('/rest/v1/')) {
        const table=path.slice('/rest/v1/'.length);
        if(actor===B&&['posts','stories'].includes(table)&&body.length===0&&u.searchParams.size===3&&u.searchParams.get('select')==='id,author_id,media_url'&&u.searchParams.get('id')==='eq.'+byKind(table).id&&u.searchParams.get('author_id')==='eq.'+A)return {action:'projection_parent'};
        if(table==='profiles'&&actor!==null&&u.searchParams.get('id')==='eq.'+actor&&
          u.searchParams.getAll('id').length===1&&u.searchParams.get('select')==='id'&&
          ![...u.searchParams.keys()].some(k=>!['id','select'].includes(k)))return {action:'profil_possede'};
        return empty();
      }
      ok(actor===A&&method==='POST');
      if(path==='/rest/v1/rpc/media_reserver'){
        const r=readBody(body),s=src(r.p_source_id);
        ok(!u.search&&exactly(r,['p_type','p_source_id','p_cle_idempotence','p_variantes'])
          &&s?.kind===r.p_type&&v4.test(r.p_cle_idempotence)&&![RUN,A,B].includes(r.p_cle_idempotence)
          &&r.p_variantes?.length===1);
        const v=r.p_variantes[0];
        ok(exactly(v,['variant','byte_size','mime_type'])&&v.variant==='original'&&v.mime_type==='image/png'&&v.byte_size===s.bytes.length);
        ok(!pending.has(s.kind)&&![...pending.values()].includes(r.p_cle_idempotence));
        pending.set(s.kind,r.p_cle_idempotence);
        return {action:'reservation',kind:s.kind,asset:r.p_cle_idempotence};
      }
      for(const [kind,asset] of accepted){
        const s=byKind(kind);
        if(path==='/storage/v1/object/content-protected/'+asset.key){
          ok(!u.search&&!uploads.has(asset.asset)&&h.get('x-upsert')==='false'&&h.get('content-type')==='image/png'
            &&body.length===s.bytes.length&&fingerprint(body)===s.sha);
          return {action:'depot',kind,asset:asset.asset};
        }
        if(path==='/rest/v1/'+kind){
          const select='id,author_id,media_url';
          ok(uploads.has(asset.asset)&&u.searchParams.getAll('select').length===1&&u.searchParams.get('select')===select
            &&u.searchParams.getAll('columns').length<=1&&[...u.searchParams.keys()].every(k=>k==='select'||k==='columns'));
          const raw=readBody(body);
          const row=kind==='posts'&&Array.isArray(raw)&&raw.length===1?raw[0]:raw;
          if(u.searchParams.has('columns'))ok(Array.isArray(raw)&&raw.length===1&&row
            &&u.searchParams.get('columns')===Object.keys(row).map(k=>'"'+k+'"').join(','));
          ok(row&&row.id===s.id&&row.author_id===A&&row.media_url===local+asset.path&&row.content==='recette'
            &&row.passion_id==='photo'&&typeof row.created_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.created_at));
          if(kind==='posts')ok(exactly(row,['id','author_id','passion_id','mood','content','media_url','created_at','is_reel','shared_data','overlays'])
            &&row.is_reel===true&&memesOverlays(row.overlays,kind)&&row.mood==='all'&&exactly(row.shared_data,['passio_media'])&&
            exactly(row.shared_data.passio_media,['protocol','type','poster'])&&row.shared_data.passio_media.protocol===1
            &&row.shared_data.passio_media.type==='photo'&&row.shared_data.passio_media.poster===null);
          else ok(exactly(row,['id','author_id','passion_id','content','emoji','media_url','media_type','overlays','created_at'])
            &&row.media_type==='photo'&&row.emoji==='✨'&&memesOverlays(row.overlays,kind));
          return {action:'parent',kind};
        }
      }
    }catch{return deny();}
    return deny();
  }
  function acknowledge(plan,status,value){
    if(plan.action==='utilisateur_fixture'){
      ok(status===200);verifierProprieteAuth(value,plan.actor,RUN);
    }else if(plan.action==='reservation'){
      const s=byKind(plan.kind),asset=pending.get(plan.kind);
      const key=A+'/'+asset+'/original.png',path='/private-media/'+s.kind+'/'+s.id+'/'+asset+'/original';
      ok(status===200&&v4.test(asset)&&value?.asset_id===asset&&value.bucket_id==='content-protected'&&value.linked===false
        &&value.objects?.length===1&&value.objects[0].variant==='original'&&value.objects[0].object_key===key
        &&value.objects[0].reference===local+path&&value.objects[0].mime_type==='image/png'&&value.objects[0].byte_size===s.bytes.length);
      accepted.set(s.kind,{kind:s.kind,asset,key,path});
    }else if(plan.action==='depot'){
      ok([200,201].includes(status)&&accepted.has(plan.kind));uploads.add(accepted.get(plan.kind).asset);
    }else if(plan.action==='parent'){
      const s=byKind(plan.kind),link=accepted.get(plan.kind);
      ok(status===201&&Array.isArray(value)&&value.length===1&&exactly(value[0],['id','author_id','media_url'])&&
        value[0].id===s.id&&value[0].author_id===A&&value[0].media_url===local+link.path);
    }
  }
  return {prepare,acknowledge};
}
