import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {verifierPlan,cadre} from './contexte.mjs';
import {examiner,conduire} from './operateur.mjs';
import {preparerAssociationLocale} from './generer-seed.mjs';
import {verifierAudience} from './audience.mjs';
import {verifierAck} from './sceller.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),pin=i=>sha(String(i)),hex=(x)=>Buffer.from(JSON.stringify(x)),head='a'.repeat(40),target='njkiyoklssvefstljemx';
const exec={run_id:'1',run_attempt:'1',head,workflow_ref:'PASSIO74/passio-app/.github/workflows/maintenance-photos.yml@refs/heads/main',job:'photos_associees'};
function source(){
 const e={...exec},fps=Array.from({length:14},(_,i)=>pin('source'+i)),copies=fps.map((source_fp,i)=>({source_fp,echo_uuid_fp:pin('echo'+i),copie_identite_fp:pin('id'+i),sha256:pin('data'+i),md5:'1'.repeat(32),octets:3}));
 return {format:'passio-plan-photos/1',operation:'DEUX_COPIES',cible:target,execution:e,nonce:'11111111-2222-4333-8444-555555555555',issued_utc:'2026-11-18T10:00:00.000Z',expires_utc:'2026-11-18T10:15:00.000Z',manifest_sha256:pin('code'),instruction_sha256:pin('test'),revues:[pin('A'),pin('B')],maintenance_sha256:pin('m'),lecture_catalogue_sha256:pin('l'),catalogue_attendu_sha256:pin('c'),cohorte:{empreintes_cohorte:fps,empreinte_contexte:pin('cond'),objets_observes:14},copies,actives:fps.slice(0,2),admission:{copies:pin('14'),qualification_stage:pin('stage'),prevol:pin('prevol'),completed_utc:'2026-11-18T09:50:00.000Z'}};
}
test('plan fermé au job/run/main, délai et preuves distinctes',()=>{
 const f=source(),now=Date.parse(f.issued_utc)+1000;assert.equal(verifierPlan(JSON.stringify(f),exec,now).operation,'DEUX_COPIES');
 f.cible='staging';assert.throws(()=>verifierPlan(JSON.stringify(f),exec,now));
 for(const updater of [x=>x.execution.job='retrait_sources',x=>x.execution.run_id='2',x=>x.operation='RETRAIT_PUBLIC',x=>x.actives.reverse().fill(x.actives[0]),x=>x.nonce='invalide',x=>x.expires_utc='2026-11-18T12:00:00.000Z',x=>x.revues.fill(pin('A')),x=>x.copies[0].source_fp=x.copies[1].source_fp]){const x=source();updater(x);assert.throws(()=>verifierPlan(JSON.stringify(x),exec,now));}
 const env={GITHUB_JOB:'photos_associees',GITHUB_ACTIONS:'true',GITHUB_SERVER_URL:'https://github.com',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'PASSIO74/passio-app',GITHUB_ACTOR:'PASSIO74',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',PASSIO_ENVIRONNEMENT:'maintenance-medias',GITHUB_WORKFLOW_REF:exec.workflow_ref,GITHUB_RUN_ID:'1',GITHUB_SHA:head};
 assert.deepEqual(cadre(env),exec);for(const k of ['GITHUB_ACTOR','GITHUB_REF','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_WORKFLOW_REF','PASSIO_ENVIRONNEMENT'])assert.throws(()=>cadre({...env,[k]:'autre'}));
});
test('un ACK absent arrête le chemin réel avant le prévol et toute écriture',()=>{
 const ack=process.env.PASSIO_ACK_ID;delete process.env.PASSIO_ACK_ID;
 try{assert.throws(()=>verifierAck(),/CHECKPOINT_ACK/);}finally{if(ack!==undefined)process.env.PASSIO_ACK_ID=ack;}
});
test('les deux refus exigent simultanément un témoin autorisé disponible',()=>{
 const routes=[pin('r1'),pin('r2')],photos=routes.map((route_sha256,i)=>({route_sha256,sha256:pin('img'+i)}));
 const utc='2026-11-18T09:00:00.000Z',debut=utc,fin=utc;
 const refus={cible:target,head,association_sha256:pin('a'),debut,fin,medias_ouverts:true,relais:'private-media',
  anonymes:routes.map(route_sha256=>({route_sha256,utc,methode:'GET',statut:404,octets:0,anonyme:true})),
  temoin_autorise:{route_sha256:routes[0],utc,methode:'GET',statut:200,mime:'image/png',sha256:photos[0].sha256,session_ordinaire:true}};
 const dossier={refus,target,head,pins:{association:pin('a')},a:{completed_utc:debut},u:{completed_utc:fin},routes,photos,start:Date.parse(fin)+100,end:Date.parse(fin)+200};
 verifierAudience(dossier);
 for(const change of [x=>x.refus.temoin_autorise.statut=503,x=>x.refus.anonymes[1].statut=503,x=>x.refus.temoin_autorise.sha256=pin('autre'),x=>x.refus.medias_ouverts=false]){
  const bad=structuredClone(dossier);change(bad);assert.throws(()=>verifierAudience(bad));
 }
});
function documents(){
 const ps=[],lines=[],routes=[],ids=(s,i)=>s+'-0000-4000-8000-'+String(i).padStart(12,'0');
 for(const i of [1,2]){
  const post='test_'+i,asset=ids('44444444',i),owner=ids('11111111',i),common={owner,owner_id:owner,byte_size:4,mime_type:'image/png',etag:null};
  const parent={post_id:post,owner_id:owner,reference_sha256:pin('url'+i)};
  const cop={...common,id:ids('77777777',i),bucket:'content-protected',key:owner+'/'+asset+'/original.png',version:'v1'},s={...common,id:ids('22222222',i),bucket:'content',key:'photos/'+owner+'/i.png',version:'v1'};
  ps.push(parent);lines.push({...parent,asset_id:asset,source:s,copy:cop,echo_id:cop.id,source_sha256:pin('png'+i),copy_sha256:pin('png'+i),source_md5:'1'.repeat(32),copy_md5:'1'.repeat(32),source_bytes:4,copy_bytes:4});
  routes.push(sha('/private-media/posts/'+post+'/'+asset+'/original'));
 }
 const proof=hex({format:'passio-preuves-copies-protegees/1',copies:lines}),seed=preparerAssociationLocale({parents:ps,preuveCopies:proof,empreintePreuveAttendue:sha(proof)});
 const doc={format:'passio-photos-chiffre/1',execution:exec,plan_sha256:pin('plan'),objet:{format:'passio-deux-copies-preparees/1',copies_sha256:pin('copies'),parents:ps,preuve_copies:proof.toString('base64'),routes,sql_sha256:seed.sql_sha256,sql_applique:false}};
 return {doc,lines,seed};
}
test('examen local et relecture après réponse de transaction perdue, sans deuxième écriture',async()=>{
 const {doc,lines,seed}=documents(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'passio-operateur-')),f=path.join(dir,'synthetique.json');
 fs.writeFileSync(f,hex(doc));const pin=sha(hex(doc));assert.equal(examiner(hex(doc),pin).seed.parents,2);assert.throws(()=>examiner(hex(doc),sha('diff')));
 const cfg={file:f,pin,sqlPin:seed.sql_sha256,out:dir};
 const previous=process.env.GITHUB_ACTIONS;delete process.env.GITHUB_ACTIONS;process.env.SUPABASE_ACCESS_TOKEN='sbp_synthetique_local';
 let writes=0;try{
  assert.equal((await conduire({...cfg,mode:'--examiner'})).sql_applique,false);
  const fetchSQL=async(_tok,q,ro)=>{if(!ro){writes++;throw Error('REPONSE_PERDUE');}return lines.map(c=>({parent:c.post_id,author_id:c.owner_id,asset:c.asset_id,reference:c.reference_sha256,key:c.copy.key,id:c.copy.id,size:'4',version:'v1'}));};
  await assert.rejects(conduire({...cfg,mode:'--appliquer',fetchSQL}));await assert.rejects(conduire({...cfg,mode:'--appliquer',fetchSQL}));
  const foreign=path.join(dir,'TRANSACTION-'+seed.sql_sha256+'.json');
  fs.writeFileSync(foreign,JSON.stringify({archive_sha256:sha('autre archive'),sql_sha256:seed.sql_sha256,retour_sha256:sha('retour')}));
  await assert.rejects(conduire({...cfg,mode:'--relire',fetchSQL}));
  assert.equal(fs.existsSync(path.join(dir,'RECU-ASSOCIATIONS-PRODUCTION.json')),false);
  fs.unlinkSync(foreign);
  const r=await conduire({...cfg,mode:'--relire',fetchSQL});assert.equal(writes,1);assert.equal(r.transaction_reponse_connue,false);assert.equal(r.associations_relues,2);
 }finally{delete process.env.SUPABASE_ACCESS_TOKEN;if(previous!==undefined)process.env.GITHUB_ACTIONS=previous;}
});
