// Générateur privé de PROPOSITION SQL. Aucun transport, credential ni accès distant.
import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,HEX=/^[0-9a-f]{64}$/,MD5=/^[0-9a-f]{32}$/;
const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
const besoin=x=>{if(!x)throw Error('ASSOCIATION_PREUVE_REFUSEE');};
function cles(x,liste){besoin(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===liste.split(' ').sort().join('|'));}
function texte(x,max=8192){besoin(typeof x==='string'&&x.length>0&&Buffer.byteLength(x)<=max&&!/[\x00-\x1f\x7f\\]/.test(x));return x;}
function cle(x){texte(x);besoin(x.split('/').every(s=>s&&s!=='.'&&s!=='..'));return x;}
function objet(o,owner,bucket){
 cles(o,'id bucket key version owner owner_id mime_type byte_size etag');
 besoin(UUID.test(o.id)&&o.bucket===bucket&&o.owner===owner&&o.owner_id===owner&&Object.hasOwn(extensions,o.mime_type));
 cle(o.key);texte(o.version,512);besoin(Number.isSafeInteger(o.byte_size)&&o.byte_size>=1&&o.byte_size<=27262976);
 besoin(o.etag===null||typeof o.etag==='string'&&Buffer.byteLength(o.etag)<=512&&!/[\x00-\x1f\x7f]/.test(o.etag));
}
export function preparerAssociationLocale({parents,preuveCopies,empreintePreuveAttendue}){
 besoin(Array.isArray(parents)&&parents.length>=1&&parents.length<=2&&Buffer.isBuffer(preuveCopies)&&preuveCopies.length<=65536&&HEX.test(empreintePreuveAttendue||'')&&sha(preuveCopies)===empreintePreuveAttendue);
 for(const p of parents){cles(p,'post_id owner_id reference_sha256');besoin(/^[A-Za-z0-9_-]{1,120}$/.test(p.post_id)&&UUID.test(p.owner_id)&&HEX.test(p.reference_sha256));}
 besoin(new Set(parents.map(p=>p.post_id)).size===parents.length&&new Set(parents.map(p=>p.reference_sha256)).size===parents.length);
 let preuve;try{preuve=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(preuveCopies));}catch{besoin(false);}
 cles(preuve,'format copies');besoin(preuve.format==='passio-preuves-copies-protegees/1'&&Array.isArray(preuve.copies)&&preuve.copies.length===parents.length);
 const rows=[],vus=new Set(),assets=new Set(),sources=new Set(),copies=new Set();
 for(const p of preuve.copies){
  cles(p,'post_id owner_id reference_sha256 asset_id source copy echo_id source_sha256 copy_sha256 source_md5 copy_md5 source_bytes copy_bytes');
  const parent=parents.find(x=>x.post_id===p.post_id);besoin(parent&&parent.owner_id===p.owner_id&&parent.reference_sha256===p.reference_sha256&&!vus.has(p.post_id));vus.add(p.post_id);
  besoin(UUID.test(p.asset_id)&&!assets.has(p.asset_id));assets.add(p.asset_id);objet(p.source,p.owner_id,'content');objet(p.copy,p.owner_id,'content-protected');
  besoin(!sources.has(p.source.id)&&!copies.has(p.copy.id));sources.add(p.source.id);copies.add(p.copy.id);
  besoin(p.echo_id===p.copy.id&&p.copy.id!==p.source.id&&p.source.mime_type===p.copy.mime_type&&p.source.byte_size===p.copy.byte_size);
  besoin(p.copy.key===p.owner_id+'/'+p.asset_id+'/original.'+extensions[p.copy.mime_type]);
  besoin(HEX.test(p.source_sha256)&&p.source_sha256===p.copy_sha256&&MD5.test(p.source_md5)&&p.source_md5===p.copy_md5&&p.source_bytes===p.source.byte_size&&p.copy_bytes===p.copy.byte_size);
  for(const o of [p.source,p.copy]){const etag=String(o.etag||'').replace(/^"|"$/g,'').toLowerCase();if(MD5.test(etag))besoin(etag===p.source_md5);}
  rows.push({post_id:p.post_id,owner_id:p.owner_id,reference_sha256:p.reference_sha256,asset_id:p.asset_id,mime_type:p.copy.mime_type,byte_size:p.copy.byte_size,
   source_id:p.source.id,source_key:p.source.key,source_version:p.source.version,source_etag:p.source.etag,copy_id:p.copy.id,copy_key:p.copy.key,copy_version:p.copy.version,copy_etag:p.copy.etag});
 }
 besoin([...copies].every(id=>!sources.has(id)));
 let sql=fs.readFileSync(new URL('./seed.sql.source',import.meta.url),'utf8');
 const valeurs={__PARAMETRES_HEX__:Buffer.from(JSON.stringify(rows)).toString('hex'),__NOMBRE__:String(rows.length),__PREUVE_SHA__:empreintePreuveAttendue};
 for(const [marqueur,valeur]of Object.entries(valeurs)){besoin(sql.split(marqueur).length===2);sql=sql.replace(marqueur,valeur);}
 return {sql,sql_sha256:sha(sql),preuve_copie_sha256:empreintePreuveAttendue,parents:rows.length,execution_distante:false,autorisation_reelle:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length===3&&process.argv[2]==='--controle-local')console.log(JSON.stringify({proposition_seule:true,parents_max:2,reseau:false,credential:false,sql_execute:false}));
 else{console.error('PROPOSITION_LOCALE_SEULEMENT');process.exitCode=2;}
}
