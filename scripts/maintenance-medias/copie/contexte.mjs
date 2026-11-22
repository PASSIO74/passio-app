import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export const ENVIRONNEMENT='maintenance-medias',ROOT=path.dirname(fileURLToPath(import.meta.url));
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const refuser=c=>{throw Object.assign(Error(c),{code:c});};
const SHA=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const FICHIERS_EXECUTABLES=['action.mjs','action.yml','serveur.mjs','contexte.mjs','autorisation.mjs','campagne.mjs','transport-copie.mjs','prevol.mjs','core/noyau.mjs','core/cadre.mjs','core/requetes.mjs','core/classificateur.mjs','core/cohorte.mjs','lecture/verifier.mjs','lecture/metadata.sql','lecture/fence.sql','journal/contrat.mjs','journal/journal.mjs','extraire-preuve.mjs'];
const exacte=(o,ks)=>{if(!o||Array.isArray(o)||typeof o!=='object'||Object.keys(o).sort().join('|')!==[...ks].sort().join('|'))refuser('PLAN_FORME');};
const figer=o=>{if(o&&typeof o==='object'){for(const v of Object.values(o))figer(v);Object.freeze(o);}return o;};
const date=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)||new Date(Date.parse(s)).toISOString()!==s)refuser('PLAN_FORME');return Date.parse(s);};
let courant=null;
export function cadreGitHub(env=process.env){
 const fixes={GITHUB_ACTIONS:'true',GITHUB_SERVER_URL:'https://github.com',GITHUB_REPOSITORY:'PASSIO74/passio-app',GITHUB_ACTOR:'PASSIO74',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_JOB:'copie_heritage',GITHUB_RUN_ATTEMPT:'1',PASSIO_ENVIRONNEMENT:ENVIRONNEMENT};
 if(Object.entries(fixes).some(([k,v])=>env[k]!==v)||!/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID||'')||!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA||'')||env.GITHUB_WORKFLOW_REF!=='PASSIO74/passio-app/.github/workflows/maintenance-copie-medias.yml@refs/heads/main')refuser('CONTEXTE_SERVEUR_REFUSE');
 return {run_id:env.GITHUB_RUN_ID,run_attempt:env.GITHUB_RUN_ATTEMPT,job:env.GITHUB_JOB,head:env.GITHUB_SHA,workflow_ref:env.GITHUB_WORKFLOW_REF};
}
export function installerPlan(brut,execution,maintenant=Date.now()){
 if(courant)refuser('PLAN_DEJA_CHARGE');if(typeof brut!=='string'||Buffer.byteLength(brut)>40960||Buffer.byteLength(brut)<2)refuser('PLAN_TAILLE');
 let p;try{p=JSON.parse(brut);}catch{refuser('PLAN_FORME');}
 exacte(p,['format','cible','operation','environnement','nonce','issued_utc','expires_utc','execution','code_manifest_sha256','instruction_humaine_sha256','revue_root_sha256','revue_distincte_sha256','preuve_staging_sha256','reservation_ecrivains_sha256','cohorte','reference_stage_json','reference_stage_sha256','reference_avant_cloture','empreinte_etendue_avant_cloture','reference_apres_cloture','nettoyage_copies_autorise']);
 if(p.format!=='passio-plan-prive-copie/2'||p.cible!=='njkiyoklssvefstljemx'||p.operation!=='COPIE_SEULE'||p.environnement!==ENVIRONNEMENT||!UUID.test(p.nonce||'')||typeof p.nettoyage_copies_autorise!=='boolean')refuser('PLAN_FORME');
 exacte(p.execution,['run_id','run_attempt','job','head','workflow_ref']);if(Object.keys(execution).some(k=>p.execution[k]!==execution[k]))refuser('PLAN_AUTRE_EXECUTION');
 for(const k of ['code_manifest_sha256','instruction_humaine_sha256','revue_root_sha256','revue_distincte_sha256','preuve_staging_sha256','reservation_ecrivains_sha256','reference_stage_sha256','empreinte_etendue_avant_cloture'])if(!SHA.test(p[k]||''))refuser('PLAN_FORME');
 if(p.revue_root_sha256===p.revue_distincte_sha256||typeof p.reference_stage_json!=='string'||Buffer.byteLength(p.reference_stage_json)>12288||sha(p.reference_stage_json)!==p.reference_stage_sha256)refuser('PLAN_FORME');
 const c=p.cohorte;exacte(c,['objets_observes','empreinte_contexte','empreintes_cohorte','recu_cohorte_sha256']);if(!Number.isSafeInteger(c.objets_observes)||c.objets_observes<14||c.objets_observes>256||!SHA.test(c.empreinte_contexte||'')||!SHA.test(c.recu_cohorte_sha256||'')||!Array.isArray(c.empreintes_cohorte)||c.empreintes_cohorte.length!==14||new Set(c.empreintes_cohorte).size!==14||c.empreintes_cohorte.some(h=>!SHA.test(h)))refuser('PLAN_FORME');
 const issued=date(p.issued_utc),expires=date(p.expires_utc);if(!Number.isFinite(maintenant)||issued>maintenant||expires<=maintenant||expires<=issued||expires-issued>1800000)refuser('PLAN_EXPIRE');
 for(const e of [p.reference_avant_cloture,p.reference_apres_cloture]){exacte(e,['date_utc','query_sha256','read_only','http','metadata']);if(e.read_only!==true||![200,201].includes(e.http)||e.query_sha256!=='669bcfe6c7e6b781e7af6a41e885c489f6481422eb79b10b6df86a1adab9e843'||date(e.date_utc)>issued)refuser('REFERENCE_INVALIDE');}
 const apres=date(p.reference_apres_cloture.date_utc);if(apres<date(p.reference_avant_cloture.date_utc)||maintenant-apres>300000)refuser('REFERENCE_APRES_EXPIREE');
 courant={plan:figer(p),empreinte:sha(brut),expires,execution:{...execution},mono:performance.now(),dernierWall:maintenant,dernierMono:performance.now()};return courant.plan;
}
export function verifierManifest(){
 const p=planPrive(),f=path.join(ROOT,'MANIFEST-PUBLIC.json');if(fs.lstatSync(f).isSymbolicLink()||fs.statSync(f).size>65536)refuser('CODE_DERIVE');const b=fs.readFileSync(f);if(sha(b)!==p.code_manifest_sha256)refuser('CODE_DERIVE');const m=JSON.parse(b);
 if(m.format!=='passio-code-copie-public/1'||!m.fichiers||Object.keys(m.fichiers).sort().join('|')!==[...FICHIERS_EXECUTABLES].sort().join('|'))refuser('CODE_DERIVE');
 for(const [n,h]of Object.entries(m.fichiers)){if(!/^[A-Za-z0-9_./-]+$/.test(n)||n.startsWith('/')||n.split('/').some(x=>!x||x==='..'||x==='.')||!SHA.test(h))refuser('CODE_DERIVE');const f=path.resolve(ROOT,n);if(!f.startsWith(ROOT+path.sep)||fs.lstatSync(f).isSymbolicLink()||!fs.statSync(f).isFile()||fs.statSync(f).size>262144||sha(fs.readFileSync(f))!==h)refuser('CODE_DERIVE');}
 return true;
}
export function planPrive(){if(!courant)refuser('PLAN_ABSENT');return courant.plan;}
export function contratPrive(){return planPrive().cohorte;}
export function exigerContexte(){
 if(!courant)refuser('PLAN_ABSENT');const t=Date.now(),m=performance.now();if(!Number.isFinite(t)||!Number.isFinite(m)||t<courant.dernierWall||m<courant.dernierMono||t>=courant.expires||m-courant.mono>=900000){courant=null;refuser('PLAN_EXPIRE');}
 const e=cadreGitHub();if(Object.keys(e).some(k=>e[k]!==courant.execution[k])){courant=null;refuser('CONTEXTE_SERVEUR_REFUSE');}courant.dernierWall=t;courant.dernierMono=m;return courant.plan;
}
export function fermerContexte(){courant=null;}
