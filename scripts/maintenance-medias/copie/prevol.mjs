import fs from 'node:fs';import {examiner} from './lecture/verifier.mjs';import {SQL_PREFLIGHT,observation} from './core/requetes.mjs';import {planPrive,sha,refuser,ROOT} from './contexte.mjs';
import path from 'node:path';
const metadataSQL=fs.readFileSync(path.join(ROOT,'lecture/metadata.sql'),'utf8'),fenceSQL=fs.readFileSync(path.join(ROOT,'lecture/fence.sql'),'utf8');
export const SQL_PREVOL="SELECT pg_catalog.jsonb_build_object('lecture',(SELECT metadata FROM ("+metadataSQL+") m),'fence',(SELECT pg_catalog.row_to_json(f) FROM ("+fenceSQL+") f),'preflight',(SELECT observation FROM ("+SQL_PREFLIGHT+') p)) AS observation';
const exact=(o,ks)=>{if(!o||Array.isArray(o)||typeof o!=='object'||Object.keys(o).sort().join('|')!==[...ks].sort().join('|'))refuser('PREFLIGHT_REFUSE');};
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
export function empreinteLectureSemantique(m){
 const ordre=(a,b)=>a<b?-1:a>b?1:0;
 return sha(JSON.stringify(canon({cible:m.cible,rls:m.rls,force_rls:m.force_rls,policies:m.policies.map(p=>({...p,roles:[...p.roles].sort(),fonctions_directes:[...p.fonctions_directes].sort()})).sort((a,b)=>ordre(a.identite,b.identite)),roles_clients:[...m.roles_clients].sort((a,b)=>ordre(a.role,b.role)),fonctions_documentaires:[...m.fonctions_documentaires].sort((a,b)=>ordre(a.signature,b.signature))})));
}
export function verifierReferencePrivee(p=planPrive()){
 const stage=Buffer.from(p.reference_stage_json),r=examiner(p.reference_avant_cloture.metadata,stage,p.reference_stage_sha256);
 if(r.empreinte_contrat_lecture_sha256!==p.empreinte_etendue_avant_cloture)refuser('REFERENCE_AVANT_DERIVEE');
 const apres=examiner(p.reference_apres_cloture.metadata,stage,p.reference_stage_sha256),semantique=empreinteLectureSemantique(p.reference_avant_cloture.metadata);
 if(empreinteLectureSemantique(p.reference_apres_cloture.metadata)!==semantique)refuser('LECTURE_SEMANTIQUE_DERIVEE');
 return {semantique,stage,stagePin:p.reference_stage_sha256,catalogueAttendu:apres.catalogue_observe_sha256};
}
export function projeterPrevol(x,p=planPrive()){
 exact(x,['lecture','fence','preflight']);exact(x.fence,['lecture_seule','cloture_exacte','journal_cible']);
 if(Object.values(x.fence).some(v=>v!==true))refuser('CLOTURE_NON_CONFORME');
 const r=examiner(x.lecture,Buffer.from(p.reference_stage_json),p.reference_stage_sha256),reference=verifierReferencePrivee(p);
 if(empreinteLectureSemantique(x.lecture)!==reference.semantique||x.lecture.catalogue_observe_sha256!==reference.catalogueAttendu)refuser('LECTURE_SEMANTIQUE_DERIVEE');
 const b=x.preflight;exact(b,['ro','bypass','structure_ok','catalogue_fp','privacy_catalogue','bucket']);exact(b.bucket,['nombre','prive','objets']);
 if(b.ro!==true||b.bypass!==true||b.structure_ok!==true||b.privacy_catalogue!==true||b.catalogue_fp!==x.lecture.catalogue_observe_sha256||!Number.isSafeInteger(b.bucket.nombre)||!Number.isSafeInteger(b.bucket.objets)||b.bucket.nombre<0||b.bucket.nombre>1||b.bucket.objets<0)refuser('PREFLIGHT_REFUSE');
 if(!(b.bucket.nombre===0&&b.bucket.prive===null&&b.bucket.objets===0||b.bucket.nombre===1&&b.bucket.prive===true))refuser('PREFLIGHT_REFUSE');
 return {...b,lecture_semantique_sha256:reference.semantique,lecture_etendue_sha256:r.empreinte_contrat_lecture_sha256,observed_wall:Date.now(),observed_mono:performance.now()};
}
export {observation};
