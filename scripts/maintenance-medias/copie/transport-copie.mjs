import {exigerAutorisation,engagerTransport} from './autorisation.mjs';
import {HOST_STORAGE,HOST_MANAGEMENT,DEST,chemin,cle,refuser,verifierEchoCopy,UUID,sha,CONTRAT,preparerCasDestination,tracerSource,empreinteLot,identite} from './core/cadre.mjs';
import {SQL_PREFLIGHT,sqlEtats,observation,validerEtats,routeManagement} from './core/requetes.mjs';
// Le seul import natif réseau est après la garde conditionnelle. Aucun CLI,
// collecte de clés ou injection de fournisseur réseau dans ce module.
export async function creerTransportProduction(cap,cles,contexte){
 exigerAutorisation(cap,'COPIE_SEULE');
 engagerTransport(cap,'COPIE_SEULE','COPIE');
 const {default:https}=await import('node:https');
 exigerAutorisation(cap,'COPIE_SEULE');
 let pat=cles.pat,service=cles.service,ferme=false;
 if(typeof pat!=='string'||!/^sbp_[A-Za-z0-9_-]+$/.test(pat)||typeof service!=='string'||service.length<32||service.length>16384||/[\r\n\0]/.test(service)||service===pat)refuser('CREDENTIAL_FORME');
 const {budget,journal,sqlCatalogue}=contexte;if(sha(sqlCatalogue)!==CONTRAT.sql_lecture_sha256)refuser('SOURCE_PIN');
 let selection=null;const echoes=new Map(),identites=new Map(),actifs=new Set();
 const garde=()=>{exigerAutorisation(cap,'COPIE_SEULE');if(ferme)refuser('TRANSPORT_FERME');if(!journal.valide())refuser('JOURNAL_EMPOISONNE');return Math.max(1,Math.min(15000,budget.reste()));};
 async function requete(host,method,url,body,{action,trace={},flux=false,cap=262144,ok=[200,201]}={}){
  if(![HOST_STORAGE,HOST_MANAGEMENT].includes(host)||typeof url!=='string'||!url.startsWith('/')||/[\r\n#]/.test(url))refuser('ROUTE_REFUSEE');
  const management=host===HOST_MANAGEMENT;if(management&&(method!=='POST'||url!==routeManagement||flux))refuser('ROUTE_REFUSEE');
  if(!management&&!url.startsWith('/storage/v1/'))refuser('ROUTE_REFUSEE');
  const payload=body===undefined?null:Buffer.from(JSON.stringify(body));if(payload&&payload.length>262144)refuser('REQUETE_BORNE');
  journal.consommerIntention(action,trace);budget.appel();const timeout=garde();
  return await new Promise((resolve,reject)=>{
   const headers={Authorization:'Bearer '+(management?pat:service),'Accept-Encoding':'identity','Cache-Control':'no-cache, no-store',...(management?{}:{apikey:service,'x-upsert':'false'}),...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{})};
   const req=https.request({hostname:host,protocol:'https:',port:443,path:url,method,headers,agent:false,rejectUnauthorized:true,signal:AbortSignal.timeout(timeout)},res=>{
    actifs.add(res);res.once('close',()=>actifs.delete(res));
    if(res.statusCode>=300&&res.statusCode<400){res.destroy();reject(Object.assign(Error('HTTP_REDIRECTION'),{code:'HTTP_REDIRECTION'}));return;}
    if(!ok.includes(res.statusCode)||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();reject(Object.assign(Error('HTTP_REFUS'),{code:'HTTP_REFUS'}));return;}
    if(flux){
     const stream=(async function*(){let n=0;for await(const b of res){garde();n+=b.length;if(n>cap){res.destroy();refuser('REPONSE_BORNE');}budget.lecture(b.length);yield b;}garde();})();resolve(stream);return;
    }
    const chunks=[];let n=0;
    res.on('data',b=>{try{garde();n+=b.length;if(n>cap)refuser('REPONSE_BORNE');budget.lecture(b.length);chunks.push(b);}catch(e){res.destroy();reject(e);}});
    res.on('error',()=>reject(Object.assign(Error('HTTP_IO'),{code:'HTTP_IO'})));
    res.on('end',()=>{try{garde();const j=JSON.parse(Buffer.concat(chunks).toString('utf8'));garde();resolve(j);}catch{reject(Object.assign(Error('REPONSE_FORME'),{code:'REPONSE_FORME'}));}});
   });actifs.add(req);req.once('close',()=>actifs.delete(req));req.on('error',()=>reject(Object.assign(Error('HTTP_IO'),{code:'HTTP_IO'})));req.end(payload||undefined);
  });
 }
 const gestion=async(query,action,cap=262144,trace={})=>observation(await requete(HOST_MANAGEMENT,'POST',routeManagement,{query,read_only:true},{cap,action,trace}));
 const source=s=>{if(!selection||s?.bucket!=='content'||!selection.has(s.name)||selection.get(s.name).id!==s.id)refuser('OBJET_HORS_COHORTE');return selection.get(s.name);};
 return {
  fermer(){ferme=true;for(const x of actifs)x.destroy();actifs.clear();pat=null;service=null;selection=null;echoes.clear();identites.clear();},
  arreterIO(){for(const x of actifs)x.destroy();actifs.clear();},
  async catalogue(){if(selection)refuser('CATALOGUE_DEJA_LU');return gestion(sqlCatalogue,'CATALOGUE',1048576);},
  lierPlan(sources){if(selection||sources.length!==14)refuser('COHORTE_REFUSEE');selection=new Map(sources.map(s=>[cle(s.name),{...s}]));if(selection.size!==14)refuser('COHORTE_REFUSEE');},
  preflight:async()=>contexte.projeterPrevol(await gestion(contexte.sqlPrevol,'PREFLIGHT')),bucketPrive:async()=>contexte.projeterPrevol(await gestion(contexte.sqlPrevol,'BUCKET_PRIVE')),
  async creerBucket(){const r=await requete(HOST_STORAGE,'POST','/storage/v1/bucket',{id:DEST,name:DEST,public:false},{cap:8192,action:'CREER_BUCKET'});
   if(!r||!(r.id===DEST||r.name===DEST)||(r.id!==undefined&&r.id!==DEST)||(r.name!==undefined&&r.name!==DEST))refuser('BUCKET_ECHO_AMBIGU');return true;},
  async etats(sources){const fixes=sources.map(source);return validerEtats(await gestion(sqlEtats(fixes),'ETAT',262144,fixes.length===1?tracerSource(fixes[0]):{}),sources.length);},
  async etatsFinaux(sources){const fixes=sources.map(source);return validerEtats(await gestion(sqlEtats(fixes),'ETAT_FINAL'),sources.length);},
  async getSource(s){const fixe=source(s);return requete(HOST_STORAGE,'GET','/storage/v1/object/authenticated/content/'+chemin(s.name),undefined,{flux:true,cap:25165824,ok:[200],action:'GET_SOURCE',trace:tracerSource(fixe)});},
  async copier(s){source(s);if(echoes.has(s.name))refuser('COPY_DEJA_ENGAGEE');echoes.set(s.name,null);
   const r=await requete(HOST_STORAGE,'POST','/storage/v1/object/copy',{bucketId:'content',sourceKey:s.name,destinationBucket:DEST,destinationKey:s.name},{cap:65536,action:'COPY',trace:tracerSource(source(s))});
   const echo=verifierEchoCopy(r,s.name);if(echo.id===s.id)refuser('COPY_ECHO_AMBIGU');echoes.set(s.name,echo);return echo;},
  fixerIdentite(s,d){source(s);const echo=echoes.get(s.name);if(!echo||d?.id!==echo.id||d.bucket!==DEST||d.name!==s.name||!UUID.test(d.id)||typeof d.version!=='string'||!d.version)refuser('IDENTITE_REFUSEE');
   identites.set(s.name,{id:d.id,version:d.version});},
  async cas(s,d){const fixe=source(s),id=identites.get(s.name);if(!id||d?.id!==id.id||d.version!==id.version)refuser('IDENTITE_REFUSEE');
   const query=preparerCasDestination(fixe,d),r=await requete(HOST_MANAGEMENT,'POST',routeManagement,{query,read_only:false},{cap:8192,action:'CAS',trace:{...tracerSource(fixe),identite_fp:identite(d)}});if(!Array.isArray(r)||r.length!==1)refuser('CAS_REFUSE');return r[0];},
  async getDestination(s){const fixe=source(s);if(!identites.has(s.name))refuser('IDENTITE_REFUSEE');return requete(HOST_STORAGE,'GET','/storage/v1/object/authenticated/'+DEST+'/'+chemin(s.name),undefined,{flux:true,cap:25165824,ok:[200],action:'GET_DESTINATION',trace:tracerSource(fixe)});},
  async supprimerCopies(copies){if(!Array.isArray(copies)||!copies.length||copies.length>14)refuser('DELETE_COPIE_REFUSE');
   for(const {source:s,destination:d}of copies){source(s);const echo=echoes.get(s.name),id=identites.get(s.name);if(!echo||!id||d?.id!==echo.id||d.id!==id.id||d.version!==id.version||d.bucket!==DEST||d.name!==s.name)refuser('DELETE_COPIE_REFUSE');}
   if(new Set(copies.map(x=>x.source.name)).size!==copies.length)refuser('DELETE_COPIE_REFUSE');
   const r=await requete(HOST_STORAGE,'DELETE','/storage/v1/object/'+DEST,{prefixes:copies.map(x=>x.source.name)},{cap:65536,ok:[200],action:'DELETE_COPIE',trace:{dest_fp:empreinteLot(copies)}});
   if(!Array.isArray(r)||r.length>copies.length)refuser('DELETE_ECHO_AMBIGU');return true;
  },
 };
}
