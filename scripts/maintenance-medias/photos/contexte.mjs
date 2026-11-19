import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export const ROOT=path.dirname(fileURLToPath(import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const ops={photos_associees:'DEUX_COPIES',retrait_sources:'RETRAIT_PUBLIC'};
export const refuser=code=>{throw Object.assign(Error(code),{code});};
const ok=(x,c)=>{if(!x)refuser(c);},hex=/^[0-9a-f]{64}$/,uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const fields=(o,k)=>ok(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===[...k].sort().join('|'),'FORME');
const deepFreeze=o=>{if(o&&typeof o==='object'){for(const x of Object.values(o))deepFreeze(x);Object.freeze(o);}return o;};
const date=v=>{const n=Date.parse(v);ok(Number.isFinite(n)&&new Date(n).toISOString()===v,'DATE');return n;};
let current;const caps=new WeakMap();
export function cadre(env=process.env){
 const job=env.GITHUB_JOB;ok(Object.hasOwn(ops,job)&&env.GITHUB_ACTIONS==='true'&&env.GITHUB_SERVER_URL==='https://github.com'&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REPOSITORY==='PASSIO74/passio-app'&&env.GITHUB_ACTOR==='PASSIO74'&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_RUN_ATTEMPT==='1'&&env.PASSIO_ENVIRONNEMENT==='maintenance-medias'&&env.GITHUB_WORKFLOW_REF==='PASSIO74/passio-app/.github/workflows/maintenance-photos.yml@refs/heads/main'&&/^[1-9]\d{0,18}$/.test(env.GITHUB_RUN_ID)&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA),'CONTEXTE');
 return {job,run_id:env.GITHUB_RUN_ID,head:env.GITHUB_SHA,workflow_ref:env.GITHUB_WORKFLOW_REF,run_attempt:'1'};
}
export function verifierPlan(brut,e,now=Date.now()){
 ok(typeof brut==='string'&&Buffer.byteLength(brut)<=40960,'PLAN_TAILLE');const p=JSON.parse(brut);
 fields(p,['format','operation','cible','execution','nonce','issued_utc','expires_utc','manifest_sha256','instruction_sha256','revues','maintenance_sha256','lecture_catalogue_sha256','catalogue_attendu_sha256','cohorte','copies','actives','admission']);
 ok(p.format==='passio-plan-photos/1'&&p.operation===ops[e.job]&&p.cible==='njkiyoklssvefstljemx'&&uuid.test(p.nonce),'PLAN');
 fields(p.execution,Object.keys(e));ok(Object.keys(e).every(k=>e[k]===p.execution[k]),'RUN');
 for(const k of ['manifest_sha256','instruction_sha256','maintenance_sha256','lecture_catalogue_sha256','catalogue_attendu_sha256'])ok(typeof p[k]==='string'&&hex.test(p[k]),'PIN');
 ok(Array.isArray(p.revues)&&p.revues.length===2&&p.revues.every(x=>typeof x==='string'&&hex.test(x))&&new Set(p.revues).size===2,'REVUES');
 const i=date(p.issued_utc),t=date(p.expires_utc);ok(i<=now&&now<t&&t-i<=1800000,'EXPIRE');
 const c=p.cohorte;fields(c,['empreintes_cohorte','empreinte_contexte','objets_observes']);ok(Number.isSafeInteger(c.objets_observes)&&c.objets_observes>=14&&c.objets_observes<=256&&hex.test(c.empreinte_contexte)&&Array.isArray(c.empreintes_cohorte)&&c.empreintes_cohorte.length===14&&new Set(c.empreintes_cohorte).size===14&&c.empreintes_cohorte.every(x=>typeof x==='string'&&hex.test(x)),'COHORTE');
 ok(Array.isArray(p.actives)&&p.actives.length===2&&new Set(p.actives).size===2&&p.actives.every(fp=>c.empreintes_cohorte.includes(fp)),'PHOTOS');
 ok(Array.isArray(p.copies)&&p.copies.length===14&&new Set(p.copies.map(x=>x.source_fp)).size===14,'COPIES');
 const ids=new Set(),echos=new Set();let total=0;
 for(const x of p.copies){fields(x,['source_fp','echo_uuid_fp','copie_identite_fp','sha256','md5','octets']);ok(c.empreintes_cohorte.includes(x.source_fp)&&[x.sha256,x.echo_uuid_fp,x.copie_identite_fp].every(v=>typeof v==='string'&&hex.test(v))&&typeof x.md5==='string'&&/^[a-f0-9]{32}$/.test(x.md5)&&Number.isSafeInteger(x.octets)&&x.octets>0,'COPIE');total+=x.octets;ids.add(x.copie_identite_fp);echos.add(x.echo_uuid_fp);}
 ok(total<=25165824&&ids.size===14&&echos.size===14,'COPIES');
 const a=p.admission;fields(a,p.operation==='RETRAIT_PUBLIC'?['copies','association','audience','sauvegarde','dossier','prevol','completed_utc']:['copies','qualification_stage','prevol','completed_utc']);
 for(const [k,v]of Object.entries(a))if(k!=='completed_utc')ok(typeof v==='string'&&hex.test(v),'PREUVE');
 ok(date(a.completed_utc)<=i,'PREUVE_DATE');return deepFreeze(p);
}
export function initialiser(){ok(!current,'DEJA_INITIALISE');const e=cadre();const brut=process.env.PASSIO_COPIE_PLAN_PRIVE;
 const p=verifierPlan(brut,e),manifest=fs.readFileSync(path.join(ROOT,'MANIFEST.json'));ok(sha(manifest)===p.manifest_sha256,'MANIFEST');
 const m=JSON.parse(manifest);ok(m.format==='passio-photos-public/1'&&Object.keys(m.fichiers).length>=10&&Object.keys(m.fichiers).length<=64,'MANIFEST');
 for(const [name,h]of Object.entries(m.fichiers)){ok(/^[a-z0-9_./-]+$/i.test(name)&&name.split('/').every(s=>s&&s!=='.'&&s!=='..'),'MANIFEST');const file=path.join(ROOT,name);ok(fs.realpathSync(file)===file&&fs.lstatSync(file).isFile()&&sha(fs.readFileSync(file))===h,'MANIFEST');}
 ok(sha(fs.readFileSync(path.resolve(ROOT,'../../../.github/workflows/maintenance-photos.yml')))===m.workflow,'WORKFLOW');
 current={p,e,pin:sha(brut),last:Date.now(),mono:performance.now(),start:performance.now()};return p;
}
export function contexte(){ok(current,'PLAN_ABSENT');const t=Date.now(),m=performance.now();ok(t>=current.last&&t<date(current.p.expires_utc)&&m>=current.mono&&m-current.start<=900000&&JSON.stringify(cadre())===JSON.stringify(current.e),'EXPIRE');current.last=t;current.mono=m;return current.p;}
export function contratPrive(){return contexte().cohorte;}
export function ouvrir(){const p=contexte(),cap=Object.freeze({});caps.set(cap,{p,lanes:new Set()});return cap;}
export function exigerAutorisation(cap,op){const p=contexte();ok(caps.get(cap)?.p===p&&p.operation===op,'AUTORISATION_ABSENTE');return p;}
export function engagerTransport(cap,op,lane){exigerAutorisation(cap,op);const c=caps.get(cap);ok(op==='RETRAIT_PUBLIC'&&['PRIVE','ANONYME'].includes(lane)&&!c.lanes.has(lane),'TRANSPORT');c.lanes.add(lane);}
export function contexteAutorise(cap,op){const p=exigerAutorisation(cap,op);return {autorisation:{...p,preuve_stage_sha256:p.admission.dossier,copies_qualifiees_sha256:p.admission.copies},prevol:{cloture_sha256:'31f28ee35922ec2d8bd48ddee09ca1768ac38b2759d8b225f8e5c07b20112435',maintenance_exclusive_sha256:p.maintenance_sha256},copies:{copies:p.copies},autorisation_sha256:current.pin};}
export function pinPlan(){contexte();return current.pin;}
export function chargerClesServeur(cap,op){exigerAutorisation(cap,op);const pat=process.env.SUPABASE_ACCESS_TOKEN,service=process.env.SUPABASE_SERVICE_ROLE_KEY;ok(typeof pat==='string'&&/^sbp_[a-zA-Z0-9_-]+$/.test(pat)&&typeof service==='string'&&service.length>=32&&service.length<=16384&&!/[\r\n\0]/.test(service)&&pat!==service,'CREDENTIALS');return {pat,service};}
