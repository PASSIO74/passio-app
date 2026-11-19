import {exigerAutorisation,engagerTransport,contexteAutorise,operationRetrait,refuser} from './contexte.mjs';
import {CONTRAT,empreintePhysique,identite,chemin,sha,UUID} from './core/cadre.mjs';
import {SQL_PREFLIGHT,sqlEtats,routeManagement,observation,validerEtats} from './core/requetes.mjs';
import {C,descriptorDelete} from './contrat.mjs';
import {prefixeRemplacable} from './core/cohorte.mjs';
// Après retrait, le même nom avec un nouvel UUID doit être vu, pas filtré par
// l'ancien UUID. Transformation unique et fermée de la requête épinglée ef91.
export function sqlEtatsParCle(sources){
 const s=sqlEtats(sources),needle='s.id OPERATOR(pg_catalog.=) p.id AND s.bucket_id';
 if(s.split(needle).length!==2)refuser('SOURCE_PIN');return s.replace(needle,'s.bucket_id');
}
export async function creerTransportRetrait(cap,cles,{budget,journal,sqlCatalogue}){
 const operation=operationRetrait(cap);
 exigerAutorisation(cap,operation);engagerTransport(cap,operation,'PRIVE');
 if(sha(sqlCatalogue)!==CONTRAT.sql_lecture_sha256)refuser('SOURCE_PIN');
 const contexte=contexteAutorise(cap,operation);
 const {default:https}=await import('node:https');exigerAutorisation(cap,operation);
 let pat=cles.pat,service=cles.service,ferme=false,selection=null,plan=null;
 if(typeof pat!=='string'||!/^sbp_[A-Za-z0-9_-]+$/.test(pat)||typeof service!=='string'||service.length<32||service.length>16384||/[\r\n\0]/.test(service)||service===pat)refuser('CREDENTIAL_FORME');
 const actifs=new Set();
 const garde=()=>{exigerAutorisation(cap,operation);if(ferme||!journal.valide())refuser('TRANSPORT_FERME');const r=budget.reste();if(!Number.isFinite(r)||r<1)refuser('DELAI');return Math.floor(Math.min(r,15000));};
 const traces=s=>({source_fp:empreintePhysique(s),identite_fp:identite(s)});
 function source(s){const x=selection?.get(s?.name);if(!x||empreintePhysique(x)!==empreintePhysique(s))refuser('OBJET_HORS_COHORTE');return x;}
 function entree(x){source(x?.source);const p=plan?.get(x.source.name);if(!p||identite(p.copie)!==identite(x.copie))refuser('COPIE_DERIVEE');return p;}
 async function requete(action,host,method,url,body,trace={},opts={}){
  const management=host==='api.supabase.com';
  if(management){if(method!=='POST'||url!==routeManagement||body?.read_only!==true||typeof body.query!=='string')refuser('ROUTE_REFUSEE');}
  else if(host!==C.hote||!['GET','DELETE'].includes(method)||!url.startsWith('/storage/v1/object/'))refuser('ROUTE_REFUSEE');
  const payload=body===undefined?null:Buffer.from(JSON.stringify(body));if(payload?.length>1048576)refuser('REQUETE_BORNE');
  garde();journal.autoriserIO(action,trace,opts.ticket);budget.appel();const timeout=garde();
  return await new Promise((resolve,reject)=>{
   const headers={Authorization:'Bearer '+(management?pat:service),'Accept-Encoding':'identity','Cache-Control':'no-cache, no-store',...(management?{}:{apikey:service}),...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{})};
   const req=https.request({hostname:host,protocol:'https:',port:443,path:url,method,headers,agent:false,rejectUnauthorized:true,signal:AbortSignal.timeout(timeout)},res=>{
    actifs.add(res);res.once('close',()=>actifs.delete(res));res.on('error',()=>{});
    try{garde();if(!(opts.ok||[200,201]).includes(res.statusCode)||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')refuser('HTTP_REFUS');}catch(e){res.destroy();reject(e);return;}
    if(opts.flux){resolve((async function*(){let n=0;try{for await(const b of res){garde();budget.lire(b.length);n+=b.length;if(n>25165824)refuser('REPONSE_BORNE');yield b;}garde();}finally{res.destroy();req.destroy();}})());return;}
    const chunks=[];let n=0;res.on('data',b=>{try{garde();budget.lire(b.length);n+=b.length;if(n>(opts.cap||262144))refuser('REPONSE_BORNE');chunks.push(b);}catch(e){res.destroy();reject(e);}});
    res.on('error',()=>reject(Object.assign(Error('HTTP_IO'),{code:'HTTP_IO'})));
    res.on('end',()=>{try{garde();const x=JSON.parse(Buffer.concat(chunks).toString('utf8'));garde();resolve(x);}catch{reject(Object.assign(Error('REPONSE_FORME'),{code:'REPONSE_FORME'}));}});
   });actifs.add(req);req.once('close',()=>actifs.delete(req));req.on('error',()=>reject(Object.assign(Error('HTTP_IO'),{code:'HTTP_IO'})));req.end(payload||undefined);
  });
 }
 const lire=async(action,sources,trace={})=>validerEtats(observation(await requete(action,'api.supabase.com','POST',routeManagement,{query:sqlEtatsParCle(sources),read_only:true},trace)),sources.length);
 const projeter=e=>({cle:e.cle,source:e.source,copie:e.destination,owner:e.owner});
 return {
  fermer(){ferme=true;for(const x of actifs)x.destroy();actifs.clear();pat=null;service=null;selection=null;plan=null;},
  arreterIO(){for(const x of actifs)x.destroy();actifs.clear();},
  async prevol(){const p=observation(await requete('PREVOL','api.supabase.com','POST',routeManagement,{query:SQL_PREFLIGHT,read_only:true}));
   if(p?.ro!==true||p.bypass!==true||p.structure_ok!==true||p.privacy_catalogue!==true||p.catalogue_fp!==contexte.autorisation.catalogue_attendu_sha256||p.bucket?.nombre!==1||p.bucket.prive!==true||p.bucket.objets!==14)refuser('PREREQUIS_REFUSES');
   return {fence_sha256:contexte.prevol.cloture_sha256,stage:contexte.autorisation.preuve_stage_sha256,copies:contexte.autorisation.copies_qualifiees_sha256,mandat:contexte.autorisation_sha256,maintenance:contexte.prevol.maintenance_exclusive_sha256};},
  async catalogue(){if(selection&&operation==='RETRAIT_PUBLIC')refuser('CATALOGUE_DEJA_LU');return observation(await requete('CATALOGUE','api.supabase.com','POST',routeManagement,{query:sqlCatalogue,read_only:true},{},{cap:1048576}));},
  async etatsInitiaux(sources){if(selection||!Array.isArray(sources)||sources.length!==14)refuser('PLAN_REFUSE');const fps=sources.map(empreintePhysique).sort();if(new Set(fps).size!==14||JSON.stringify(fps)!==JSON.stringify([...CONTRAT.empreintes_cohorte].sort()))refuser('PLAN_REFUSE');selection=new Map(sources.map(s=>[s.name,{...s}]));return (await lire('SOURCE_ETAT',sources)).map(projeter);},
  lierPlan(p){if(plan||!selection||!Array.isArray(p)||p.length!==14)refuser('PLAN_REFUSE');for(const x of p){source(x.source);if(x.copie?.bucket!==C.copie||x.copie.name!==x.source.name||!UUID.test(x.copie.id))refuser('PLAN_REFUSE');}plan=new Map(p.map(x=>[x.source.name,x]));if(plan.size!==14)refuser('PLAN_REFUSE');},
  async etat(x){const p=entree(x);return projeter((await lire('SOURCE_ETAT',[p.source],traces(p.source)))[0]);},
  async getSource(x){const p=entree(x);return requete('GET_SOURCE',C.hote,'GET','/storage/v1/object/authenticated/content/'+chemin(p.source.name),undefined,traces(p.source),{flux:true,ok:[200]});},
  async getCopie(x){const p=entree(x);return requete('GET_COPIE',C.hote,'GET','/storage/v1/object/authenticated/'+C.copie+'/'+chemin(p.source.name),undefined,{...traces(p.source),dest_fp:identite(p.copie)},{flux:true,ok:[200]});},
  async supprimerSource(x,descriptor,ticket){const p=entree(x),d=descriptorDelete(p.source);
   const active=contexte.autorisation.actives.includes(empreintePhysique(p.source));
   if((operation!=='RETRAIT_PUBLIC'&&prefixeRemplacable(p.source.name))||
      (operation==='RETRAIT_SANS_USAGE'&&active)||(operation==='RETRAIT_PHOTOS_RESTANTES'&&!active)||
      JSON.stringify(descriptor)!==JSON.stringify(d))refuser('DELETE_REFUSE');
   return requete('DELETE_SOURCE',d.host,d.method,d.path,d.body,traces(p.source),{cap:65536,ok:[200],ticket});},
  async absence(x){const p=entree(x);return projeter((await lire('ABSENCE',[p.source],traces(p.source)))[0]);},
  async absences(p){if(!Array.isArray(p)||p.length!==14)refuser('PLAN_REFUSE');return (await lire('ABSENCE',p.map(x=>entree(x).source))).map(projeter);},
 };
}
