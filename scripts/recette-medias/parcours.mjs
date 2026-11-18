import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

export const CIBLE='https://fcksxofaelcdmmifnwjo.supabase.co';
export const APERCU='https://6afd9a462a4c24bdded6b1b7--passio-app.netlify.app';
export const HEAD='6e4c4e1c5c2efe21e27f6a579191ef3bb1477960';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const fingerprint=data=>createHash('sha256').update(data).digest('hex');
function requireThat(test,category){if(!test)throw new Error(category);}
function u32(n){const buf=Buffer.alloc(4);buf.writeUInt32BE(n>>>0);return buf;}
function chunk(tag,content){
  const bytes=Buffer.concat([Buffer.from(tag),content]);let crc=0xffffffff;
  for(const n of bytes){crc^=n;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return Buffer.concat([u32(content.length),bytes,u32(~crc)]);
}
function pixel(r,g,b){
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',Buffer.concat([u32(1),u32(1),Buffer.from([8,2,0,0,0])])),
    chunk('IDAT',deflateSync(Buffer.from([0,r,g,b]))),chunk('IEND',Buffer.alloc(0))]);
}
export function fixture(run,owner,reader){
  for(const id of [run,owner,reader])requireThat(typeof id==='string'&&uuid.test(id),'UUID_FIXTURE');
  requireThat(new Set([run,owner,reader]).size===3,'UUID_DISTINCTS');
  const make=(kind,r,g,b)=>{const bytes=pixel(r,g,b);return {kind,id:'q969_'+run.replaceAll('-','')+'_'+kind,bytes,sha:fingerprint(bytes)};};
  return {run,owner,reader,sources:[make('posts',226,94,33),make('stories',32,121,211)]};
}
function proof(f,entry,asset){
  requireThat(f.sources.includes(entry)&&uuid.test(asset)&&![f.run,f.owner,f.reader].includes(asset),'LIAISON');
  const path='/private-media/'+entry.kind+'/'+entry.id+'/'+asset+'/original';
  return {kind:entry.kind,id:entry.id,asset,owner:f.owner,path,key:f.owner+'/'+asset+'/original.png',sha:entry.sha,bytes:entry.bytes.length};
}
export function overlays(kind){
  return kind==='posts'?[{type:'text',text:'Ma bobine',color:'#ffffff',x:50,y:30,size:24}]:
    [{type:'text',text:'Coucou',color:'#ffffff',x:50,y:40,size:26},{type:'emoji',emoji:'🔥',x:60,y:60,size:52}];
}
export function memesOverlays(v,kind){
  const want=overlays(kind);return Array.isArray(v)&&v.length===want.length&&v.every((item,i)=>item&&Object.keys(item).length===Object.keys(want[i]).length
    &&Object.entries(want[i]).every(([k,x])=>Object.hasOwn(item,k)&&item[k]===x));
}
export async function publierEtLire(page,f,entry){
  requireThat(f.sources.includes(entry)&&new URL(page.url()).origin===APERCU,'PAGE_INCONNUE');
  const input={origin:APERCU,project:CIBLE,owner:f.owner,kind:entry.kind,id:entry.id,
    data:'data:image/png;base64,'+entry.bytes.toString('base64'),size:entry.bytes.length,sha:entry.sha,overlays:overlays(entry.kind)};
  const returned=await page.evaluate(async p=>{
    const gate=(ok,cat)=>{if(!ok)throw Error(cat);};
    gate(location.origin===p.origin && window.PASSIO_SUPABASE_CIBLE?.url===p.project
      && typeof SUPABASE_URL!=='undefined' && SUPABASE_URL===p.project && window._supaReal===true,'CIBLE_PAGE');
    gate(typeof passioMediaProteges!=='undefined'&&passioMediaProteges.capture().uid===p.owner,'IDENTITE_PAGE');
    const post=p.kind==='posts';
    const item=post?{id:p.id,type:'photo',image:p.data,text:'recette',passion:'photo',createdAt:Date.now(),authorId:p.owner,isReel:true,overlays:p.overlays}:
      {id:p.id,mediaType:'photo',media:p.data,text:'recette',passion:'photo',overlays:p.overlays};
    const ok=post?await supaPublishPostWithRetry(item,1):await supaPublishStory(item);
    gate(ok===true,'PUBLICATION_REFUSEE');
    const ref=post?item.image:item.media;
    const v=passioMediaProteges.parser(ref);
    gate(v&&v.type===p.kind&&v.id===p.id&&v.variant==='original','REFERENCE_CLIENT');
    const local=await passioMediaProteges.charger(ref,'image',null,null);
    gate(typeof local==='string'&&local.startsWith('blob:'+p.origin+'/'),'BLOB_ATTENDU');
    const response=await fetch(local);
    const blob=await response.blob();
    gate(blob.type==='image/png'&&blob.size===p.size,'BLOB_FORMAT');
    const bytes=await blob.arrayBuffer();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    gate(hash===p.sha,'BLOB_OCTETS');
    return {asset:v.asset};
  },input);
  requireThat(returned&&Object.keys(returned).join(',')==='asset','PROJECTION_PAGE');
  return proof(f,entry,returned.asset);
}
