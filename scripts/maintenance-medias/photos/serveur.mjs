import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {ROOT,initialiser,contexte,ouvrir,chargerClesServeur,sha,pinPlan,cadre,refuser,estRetrait} from './contexte.mjs';
import {local,ouvrirDossier,exclusivement,sceller,verifierAck} from './sceller.mjs';
import * as base from './core/classificateur.mjs';import {projeter} from './core/cohorte.mjs';import {selectionFigee,empreintePhysique} from './core/cadre.mjs';import {SQL_PREFLIGHT,observation} from './core/requetes.mjs';
import {construirePlan,copierEtPreparer} from './copier.mjs';import {creerIO} from './transport-photos.mjs';
import {retraitProduction,selectionRetrait} from './retrait.mjs';
const ok=(x,c)=>{if(!x)refuser(c);};
const management='api.supabase.com',target='njkiyoklssvefstljemx',sqlPath='/v1/projects/'+target+'/database/query',storage=target+'.supabase.co';
export function canon(o){return o&&typeof o==='object'?Array.isArray(o)?o.map(canon):Object.fromEntries(Object.keys(o).sort().map(k=>[k,canon(o[k])])):o;}
const canonPin=o=>sha(JSON.stringify(canon(o)));
const lectureSQL=nom=>fs.readFileSync(path.join(ROOT,'lecture',nom),'utf8');
const basePrevol="'lecture',(select metadata from ("+lectureSQL('metadata.sql')+") m),'fence',(select row_to_json(f) from ("+lectureSQL('fence.sql')+") f),'base',(select observation from ("+SQL_PREFLIGHT+") p)";
const extensionPrevol=",'profils_evenements',(select row_to_json(g) from ("+lectureSQL('fence-profils-evenements.sql')+") g)";
function lotPartiel(p){return p.operation==='RETRAIT_SANS_USAGE'||p.operation==='RETRAIT_PHOTOS_RESTANTES';}
function requetePrevol(p){return 'select jsonb_build_object('+basePrevol+(lotPartiel(p)?extensionPrevol:'')+') as observation';}
function transport(p,phase){
 let calls=0,total=0;const debut=performance.now(),max=phase==='reservation'?3:28;const pat=process.env.SUPABASE_ACCESS_TOKEN;
 ok(typeof pat==='string'&&/^sbp_[A-Za-z0-9_-]+$/.test(pat),'AUTH');
 const allowed=()=>{contexte();ok(performance.now()-debut<=600000,'DELAI');};
 async function requete(q){allowed();ok(++calls<=max,'APPELS');const manage=q.host===management;
  ok(manage?q.path===sqlPath&&q.method==='POST'&&q.body&&(q.body.read_only===true||p.operation==='DEUX_COPIES'&&phase==='execution'&&q.body.read_only===false):p.operation==='DEUX_COPIES'&&phase==='execution'&&q.host===storage&&(q.path==='/storage/v1/object/copy'&&q.method==='POST'||q.path.startsWith('/storage/v1/object/authenticated/')&&q.method==='GET'),'ROUTE');
  const key=manage?pat:process.env.SUPABASE_SERVICE_ROLE_KEY;ok(typeof key==='string'&&key.length>=32&&!/[\r\n\0]/.test(key),'AUTH');
  const r=await fetch('https://'+q.host+q.path,{method:q.method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+key,...(!manage?{apikey:key}:{}),...(q.body?{'Content-Type':'application/json'}:{}),'accept-encoding':'identity'},...(q.body?{body:JSON.stringify(q.body)}:{})});
  async function* stream(){let n=0;try{ok(r.status===q.http&&(!r.headers.get('content-encoding')||r.headers.get('content-encoding')==='identity'),'HTTP');for await(const b of r.body){allowed();n+=b.length;total+=b.length;ok(n<=q.max_octets&&total<=41943040,'OCTETS');yield b;}}finally{if(!r.bodyUsed)await r.body?.cancel();}}
  if(q.flux)return stream();const chunks=[];for await(const b of stream())chunks.push(b);return JSON.parse(Buffer.concat(chunks));
 }
 const lire=(query,parameters,cap=1048576)=>requete({host:management,path:sqlPath,method:'POST',body:{query,read_only:true,...(parameters?{parameters}:{})},http:201,max_octets:cap});
 return {requete,lire};
}
export async function prevol(p,http){const v=observation(await http.lire(requetePrevol(p)));const b=v.base;
 if(lotPartiel(p)){
  const g=v.profils_evenements;
  ok(g?.lecture_seule===true&&g.cloture_exacte===true&&g.journal_cible===true,'CLOTURE_PROFILS_EVENEMENTS');
 }
 ok(v.fence?.lecture_seule===true&&v.fence?.cloture_exacte===true&&v.fence?.journal_cible===true&&canonPin(v.lecture)===p.lecture_catalogue_sha256&&b?.ro===true&&b.bypass===true&&b.structure_ok===true&&b.privacy_catalogue===true&&b.catalogue_fp===p.catalogue_attendu_sha256&&b.bucket?.nombre===1&&b.bucket.prive===true&&b.bucket.objets===14,'PREVOL');
}
async function reserver(p){ouvrirDossier();const http=transport(p,'reservation');await prevol(p,http);
 const catalogue=observation(await http.lire(base.SQL)),cohorte=estRetrait(p.operation)?selectionRetrait(catalogue,p):selectionFigee(catalogue,base,projeter),sources=cohorte.sources;
 const data={sources,cohorte:p.cohorte,actives:p.actives,copies:p.copies,mandat:p.admission};
 if(p.operation==='DEUX_COPIES'){
  const act=sources.filter(s=>p.actives.includes(empreintePhysique(s)));const ids=act.map(s=>{const ps=catalogue.tables.posts.rows.filter(t=>{const r=base.reference(t.media);return r.type==='CONTENT'&&r.key===s.name;});ok(ps.length===1&&ps[0].owner===s.owner,'PARENT');return ps[0].id;});
  const parents=await http.lire("select p.id,p.author_id,p.media_url,p.shared_from_post_id,p.vlog from public.posts p join public.profiles f on f.id=p.author_id where f.is_private is true and p.id in ($1,$2) order by p.id",ids,65536);
  ok(parents.length===2,'PARENTS');data.selection=act.map((s,i)=>({source:s,parent:parents.find(x=>x.id===ids[i])}));
  const plan=construirePlan(data.selection,p.actives);data.assets=Object.fromEntries(plan.map(x=>[x.fp,x.asset]));
 }
 const cipher=sceller('checkpoint.age',data),raw=Buffer.from(JSON.stringify({plan_sha256:pinPlan(),execution:cadre(),cipher_sha256:cipher,data}));
 exclusivement(local('preparation'),raw);fs.appendFileSync(process.env.GITHUB_OUTPUT,'empreinte='+sha(raw)+'\n');
}
async function executer(p){const reserved=verifierAck();const http=transport(p,'execution');await prevol(p,http);const cap=ouvrir();
 if(estRetrait(p.operation)){
  const r=await retraitProduction(cap,chargerClesServeur),d=path.join(process.env.RUNNER_TEMP,'passio-retrait-journal',p.nonce);
  ok(fs.realpathSync(d)===d&&fs.lstatSync(d).isDirectory(),'JOURNAL');
  const noms=fs.readdirSync(d).filter(n=>/^event-[0-9]{5}\.json$/.test(n)).sort();ok(noms.length>0&&noms.length<=700,'JOURNAL');
  let prev='0'.repeat(64);const events=noms.map((n,i)=>{ok(n==='event-'+String(i+1).padStart(5,'0')+'.json','JOURNAL');const f=path.join(d,n);ok(fs.realpathSync(f)===f&&fs.lstatSync(f).isFile()&&fs.statSync(f).size<=4096,'JOURNAL');const bytes=fs.readFileSync(f),v=JSON.parse(bytes);ok(v.sequence===i+1&&v.precedent===prev&&v.nonce_fp===sha(p.nonce),'JOURNAL');prev=sha(bytes);return v;});
  sceller('resultat.age',{resultat:r,evenements:events,dernier_sha256:prev,admission:p.admission});ok(r.ok,'RETRAIT_INCOMPLET');return;
 }
 const {selection,assets}=reserved.data,plan=construirePlan(selection,p.actives,assets);
 const io=creerIO(plan,{requete:http.requete,async intentionDurable(trace){const i=plan.findIndex(x=>x.fp===trace.source_fp);ok(i>=0&&assets[trace.source_fp]===trace.asset,'INTENTION');const op=trace.operation==='COPY_APPLICATIVE'?'copie':trace.operation==='OWNER_COPIE_NULL'?'owner':null;ok(op,'INTENTION');exclusivement(local('intention-'+op+'-'+(i+1)),Buffer.from(JSON.stringify(trace)));return {durable:true};}});
 const resultat=await copierEtPreparer({plan,io,projections:p.copies.filter(x=>p.actives.includes(x.source_fp)),mandat:{correction_null_autorisee:true}});
 sceller('resultat.age',{format:'passio-deux-copies-preparees/1',copies_sha256:p.admission.copies,parents:selection.map((_,i)=>plan[i].parent),preuve_copies:resultat.preuveCopies.toString('base64'),sql_sha256:resultat.association.sql_sha256,routes:resultat.routes,sql_applique:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const p=initialiser();ok(process.argv.length===3,'ARG');if(process.argv[2]==='reservation')await reserver(p);else if(process.argv[2]==='execution')await executer(p);else refuser('ARG');}
 catch{console.error('Phase interrompue. Réconcilier les empreintes avant nouvelle mutation.');process.exitCode=1;}
}
