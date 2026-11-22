// Canal opérateur local. Le runner ne charge pas ce module et ne reçoit jamais de mandat de liaison SQL.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {preparerAssociationLocale} from './generer-seed.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ok=v=>{if(!v)throw Error('REFUS_OPERATEUR');},hex=/^[0-9a-f]{64}$/;
const canon=x=>Buffer.from(JSON.stringify(x)+'\n');
function lire(p,lim=1048576){const s=fs.lstatSync(p);ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=lim);const b=fs.readFileSync(p);ok(b.length===s.size);return b;}
export function examiner(raw,pin){
 ok(Buffer.isBuffer(raw)&&sha(raw)===pin);const doc=JSON.parse(raw);ok(doc.format==='passio-photos-chiffre/1'&&doc.execution.job==='photos_associees'&&doc.execution.run_attempt==='1'&&/^[0-9a-f]{40}$/.test(doc.execution.head)&&/^[1-9]\d*$/.test(doc.execution.run_id)&&doc.execution.workflow_ref==='PASSIO74/passio-app/.github/workflows/maintenance-photos.yml@refs/heads/main'&&hex.test(doc.plan_sha256));
 const x=doc.objet;ok(x.format==='passio-deux-copies-preparees/1'&&x.sql_applique===false&&Array.isArray(x.parents)&&x.parents.length===2);
 const proof=Buffer.from(x.preuve_copies,'base64');ok(proof.toString('base64')===x.preuve_copies);
 ok(typeof x.sql_sha256==='string'&&hex.test(x.sql_sha256));
 const seed=preparerAssociationLocale({parents:x.parents,preuveCopies:proof,empreintePreuveAttendue:sha(proof),empreinteSqlRecu:x.sql_sha256});ok(seed.parents===2);
 const copies=JSON.parse(proof).copies;const routes=copies.map(c=>sha('/private-media/posts/'+c.post_id+'/'+c.asset_id+'/original'));ok(JSON.stringify(routes)===JSON.stringify(x.routes));
 ok(hex.test(x.copies_sha256));return {doc,x,seed,copies,routes};
}
const auditSQL=`select p.id as parent,p.author_id,a.id::text as asset,a.heritage_ref_sha256 as reference,
 o.object_key as key,o.storage_object_id::text as id,o.byte_size::text as size,s.version::text as version
 from public.posts p join public.profiles pr on pr.id=p.author_id and pr.is_private is true
 join public.media_assets a on a.post_id=p.id and a.owner_id=p.author_id join public.media_objects o on o.asset_id=a.id and o.variant='original'
 join storage.objects s on s.id=o.storage_object_id and s.bucket_id=o.bucket_id and s.name=o.object_key and s.owner::text=p.author_id and s.owner_id=p.author_id
 join storage.buckets b on b.id=s.bucket_id and b.public=false where o.bucket_id='content-protected' and p.id in ($1,$2) order by p.id`;
async function query(token,sql,ro,params){const r=await fetch('https://api.supabase.com/v1/projects/njkiyoklssvefstljemx/database/query',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:ro,...(params?{parameters:params}:{})})});ok(r.status===201);const chunks=[];let n=0;for await(const b of r.body){n+=b.length;ok(n<=16384);chunks.push(b);}return JSON.parse(Buffer.concat(chunks));}
function exclusive(p,b){const fd=fs.openSync(p,'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export async function conduire({mode,file,pin,sqlPin,out,fetchSQL=query}){
 ok(!process.env.GITHUB_ACTIONS&&['--examiner','--appliquer','--relire'].includes(mode)&&hex.test(pin));
 const {doc,x,seed,copies,routes}=examiner(lire(file),pin);if(mode==='--examiner')return {sql_sha256:seed.sql_sha256,parents:2,sql_applique:false};
 ok(seed.sql_sha256===sqlPin&&fs.lstatSync(out).isDirectory());
 const intent=path.join(out,'INTENTION-'+sqlPin+'.json'),trans=path.join(out,'TRANSACTION-'+sqlPin+'.json');
 let jeton;
 const auth=()=>{if(!jeton)jeton=(process.env.SUPABASE_ACCESS_TOKEN||lire(path.join(os.homedir(),'.supabase','access-token'),16384).toString('utf8')).trim();ok(/^sbp_[a-zA-Z0-9_-]+$/.test(jeton));return jeton;};
 if(mode==='--appliquer'){
  exclusive(intent,canon({format:'passio-liaison-intention/1',archive_sha256:pin,sql_sha256:sqlPin,utc:new Date().toISOString()}));
  const result=await fetchSQL(auth(),seed.sql,false);ok(Array.isArray(result));exclusive(trans,canon({archive_sha256:pin,sql_sha256:sqlPin,retour_sha256:sha(canon(result))}));
 }
 // Après une réponse perdue, le contrôle read-only accepte seulement le même reçu et la même intention.
 const attempt=JSON.parse(lire(intent));ok(attempt.archive_sha256===pin&&attempt.sql_sha256===sqlPin);
 const observed=await fetchSQL(auth(),auditSQL,true,copies.map(c=>c.post_id));ok(Array.isArray(observed)&&observed.length===2);
 const photos=copies.map((c,i)=>{const r=observed.find(v=>v.parent===c.post_id);ok(r&&r.author_id===c.owner_id&&r.asset===c.asset_id&&r.reference===c.reference_sha256&&r.key===c.copy.key&&r.id===c.copy.id&&r.size===String(c.copy.byte_size)&&r.version===c.copy.version);
  const s=c.source,source_fp=sha(JSON.stringify(['content-reference/1',s.id,s.bucket,s.key,s.version,s.owner,s.owner_id,s.mime_type,String(s.byte_size),s.etag]));
  return {source_fp,parent_fp:sha(c.post_id),owner_fp:sha(c.owner_id),asset_fp:sha(c.asset_id),registre_fp:sha(JSON.stringify([r.asset,'original',r.key,r.id])),object_fp:sha(JSON.stringify([r.id,'content-protected',r.key,r.version])),sha256:c.copy_sha256,bucket:'content-protected',route_sha256:routes[i]};
 });
 const readReceipt=canon({sql_sha256:sqlPin,query_sha256:sha(auditSQL),resultat_sha256:sha(canon(observed)),objets:2});
 const txn=fs.existsSync(trans)?lire(trans):canon({format:'passio-relecture-apres-issue-inconnue/1',intention_sha256:sha(lire(intent)),relecture_sha256:sha(readReceipt),sql_sha256:sqlPin});
 if(fs.existsSync(trans)){
  const receipt=JSON.parse(txn);
  ok(receipt.archive_sha256===pin&&receipt.sql_sha256===sqlPin&&hex.test(receipt.retour_sha256));
 }
 const evidenceDir=path.join(out,'justificatifs');fs.mkdirSync(evidenceDir,{recursive:true,mode:0o700});
 for(const data of [readReceipt,txn]){const f=path.join(evidenceDir,sha(data));if(fs.existsSync(f))ok(lire(f).equals(data));else exclusive(f,data);}
 const att={format:'passio-associations-appliquees/1',cible:'njkiyoklssvefstljemx',head:doc.execution.head,completed_utc:new Date().toISOString(),copies_sha256:x.copies_sha256,transaction_sha256:sha(txn),relecture_sha256:sha(readReceipt),photos};
 exclusive(path.join(out,'RECU-ASSOCIATIONS-PRODUCTION.json'),canon(att));return {associations_relues:2,transaction_reponse_connue:fs.existsSync(trans),recu_sha256:sha(canon(att))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const [mode,file,pin,sqlPin,out]=process.argv.slice(2);console.log(JSON.stringify(await conduire({mode,file,pin,sqlPin,out})));}catch{console.error('Liaison interrompue. Contrôler le reçu local avant toute reprise.');process.exitCode=1;}}
