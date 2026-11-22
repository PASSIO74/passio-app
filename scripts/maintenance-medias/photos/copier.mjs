import {createHash,randomUUID} from 'node:crypto';
import {empreintePhysique} from './core/noyau.mjs';
import {preparerAssociationLocale} from './generer-seed.mjs';
import {reference} from './core/classificateur.mjs';
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};

const sha=x=>createHash('sha256').update(x).digest('hex');
const refuse=()=>{throw Error('COPIES_APPLICATIVES_REFUSEES');};
function ok(v){if(!v)refuse();}
const forme=o=>({id:o.id,bucket:o.bucket,key:o.name,version:o.version,owner:o.owner,owner_id:o.owner_id,mime_type:o.mime,byte_size:Number(o.size),etag:o.etag});
function sourceValide(o){ok(o&&o.bucket==='content'&&uuid.test(o.id)&&uuid.test(o.owner)&&o.owner_id===o.owner&&o.version&&Object.hasOwn(ext,o.mime)&&typeof o.size==='string'&&/^[1-9]\d{0,7}$/.test(o.size)&&Number(o.size)<=16075552&&typeof o.name==='string'&&o.name.split('/').every(p=>p&&p!=='.'&&p!=='..')&&!/[\\\x00-\x1f]/.test(o.name));}
function canonCopie(o,p){ok(o&&uuid.test(o.id)&&o.id!==p.s.id&&o.bucket==='content-protected'&&o.name===p.key&&o.mime===p.s.mime&&o.size===p.s.size&&typeof o.version==='string'&&o.version.length>0);}
const notOwned=o=>o.owner===null&&o.owner_id===null;
function echo(r,p){ok(r&&r.Key==='content-protected/'+p.key);const ids=['Id','id'].filter(k=>Object.hasOwn(r,k)).map(k=>r[k]);ok(ids.length&&ids.every(x=>uuid.test(x)&&x===ids[0]&&x!==p.s.id));return ids[0];}
async function digester(flux,size){
 const s=createHash('sha256'),m=createHash('md5');let n=0;
 for await(const chunk of flux){ok(chunk instanceof Uint8Array);n+=chunk.length;ok(n<=size);s.update(chunk);m.update(chunk);}
 ok(n===size);return {sha256:s.digest('hex'),md5:m.digest('hex'),octets:n};
}
// La fonction produit les deux seuls descripteurs que le transport de production peut utiliser.
export function preparerDeux(selection,empreintesActives){
 return construirePlan(selection,empreintesActives);
}
export function construirePlan(selection,attendues,assets){
 ok(Array.isArray(selection)&&selection.length===2&&Array.isArray(attendues)&&attendues.length===2);
 const plan=selection.map(({source:s,parent})=>{
  sourceValide(s);const fp=empreintePhysique(s);
  ok(attendues.includes(fp)&&parent&&/^[A-Za-z0-9_-]{1,120}$/.test(parent.id)&&parent.author_id===s.owner&&parent.shared_from_post_id===null&&parent.vlog===null);
  const ref=reference(parent.media_url);ok(ref.type==='CONTENT'&&ref.key===s.name);
  const asset=assets?.[fp]??randomUUID();ok(uuid.test(asset));const key=s.owner+'/'+asset+'/original.'+ext[s.mime];
  return Object.freeze({fp,s:Object.freeze({...s}),parent:Object.freeze({post_id:parent.id,owner_id:s.owner,reference_sha256:sha(parent.media_url)}),asset,key,
   route_sha256:sha('/private-media/posts/'+parent.id+'/'+asset+'/original')});
 });
 ok(new Set(plan.map(p=>p.fp)).size===2&&new Set(plan.map(p=>p.parent.post_id)).size===2&&new Set(plan.map(p=>p.asset)).size===2);
 return Object.freeze(plan);
}
// Le transport charge ses secrets/autorité en amont. Le moteur n'applique jamais le SQL produit.
export async function copierEtPreparer({plan,io,projections,mandat}){
 const result=[];const etat=async(p)=>{const e=await io.etat(p);ok(e&&e.prive===true&&e.parent_conforme===true&&e.owner_vivant===true&&e.asset_libre===true&&e.source&&empreintePhysique(e.source)===p.fp);return e;};
 ok(plan.length===2&&projections.length===2&&new Set(projections.map(x=>x.source_fp)).size===2&&typeof mandat?.correction_null_autorisee==='boolean');
 const pre=new Map();for(const p of plan){const c=projections.find(x=>x.source_fp===p.fp);ok(c&&/^[0-9a-f]{64}$/.test(c.sha256)&&/^[0-9a-f]{32}$/.test(c.md5)&&c.octets===Number(p.s.size));ok((await etat(p)).copie===null);pre.set(p.fp,c);}
 for(const p of plan){
  const c=pre.get(p.fp),n=Number(p.s.size),source=await digester(await io.flux(p,'source'),n);
  ok(source.sha256===c.sha256&&source.md5===c.md5&&(await etat(p)).copie===null);
  const id=echo(await io.copy(p),p);let d=(await etat(p)).copie;canonCopie(d,p);ok(d.id===id);const version=d.version;
  if(notOwned(d)){
   ok(mandat.correction_null_autorisee);await io.corrigerProprietaire(p,d);d=(await etat(p)).copie;canonCopie(d,p);
  }
  ok(d.id===id&&d.version===version&&d.owner===p.s.owner&&d.owner_id===p.s.owner);
  const copie=await digester(await io.flux(p,'copie'),n);ok(source.sha256===copie.sha256&&source.md5===copie.md5);
  const finale=(await etat(p)).copie;ok(finale&&empreintePhysique(finale)===empreintePhysique(d));
  result.push({...p.parent,asset_id:p.asset,source:forme(p.s),copy:forme(d),echo_id:id,source_sha256:source.sha256,copy_sha256:copie.sha256,source_md5:source.md5,copy_md5:copie.md5,source_bytes:n,copy_bytes:n});
 }
 const preuveCopies=Buffer.from(JSON.stringify({format:'passio-preuves-copies-protegees/1',copies:result}));
 const association=preparerAssociationLocale({parents:plan.map(p=>p.parent),preuveCopies,empreintePreuveAttendue:sha(preuveCopies)});
 return {association,preuveCopies,routes:plan.map(p=>p.route_sha256)};
}
