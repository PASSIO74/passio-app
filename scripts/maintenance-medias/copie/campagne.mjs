// Copie seule : phases COPY puis CAS. Aucun retrait d'original, aucune reprise.
import {createHash} from 'node:crypto';
import {DEST,UUID,sha,refuser,empreintePhysique,identite,proprietaireVivant,tracerSource,empreinteLot} from './core/cadre.mjs';
const md5Valide=x=>typeof x==='string'&&/^[0-9a-f]{32}$/i.test(x);
async function hacher(flux,budget){const a=createHash('sha256'),b=createHash('md5');let bytes=0;for await(const c of flux){budget.reste();if(!Buffer.isBuffer(c)&&!(c instanceof Uint8Array))refuser('FLUX_REFUSE');bytes+=c.length;if(bytes>25165824)refuser('REPONSE_BORNE');a.update(c);b.update(c);}budget.reste();return {sha256:a.digest('hex'),md5:b.digest('hex'),bytes};}
function indexer(etats,sources){if(!Array.isArray(etats)||etats.length!==sources.length)refuser('ETATS_REFUSES');const noms=new Set(sources.map(s=>s.name)),m=new Map();for(const e of etats){if(!e||!noms.has(e.cle)||m.has(e.cle))refuser('ETATS_REFUSES');m.set(e.cle,e);}return m;}
function sourceStable(s,e){if(!e?.source||empreintePhysique(e.source)!==empreintePhysique(s))refuser('SOURCE_DERIVEE');if(!proprietaireVivant(e.owner))refuser('OWNER_DISPARU');}
function cibleStable(s,d,a,ownerRequis){if(!d||d.bucket!==DEST||d.name!==s.name||!UUID.test(d.id)||identite(d)!==identite(a)||d.mime!==a.mime||d.size!==a.size||d.etag!==a.etag)refuser('DESTINATION_DERIVEE');if(ownerRequis&&(d.owner!==s.owner||d.owner_id!==s.owner_id))refuser('OWNER_DESTINATION');}
const CODES=['DELAI','BUDGET_APPELS','BUDGET_NETTOYAGE','BUDGET_LECTURE','BUDGET_COPIE','SOURCE_DERIVEE','DESTINATION_DERIVEE','OWNER_DISPARU','OWNER_DESTINATION','ETATS_REFUSES','COHORTE_REFUSEE','PREFLIGHT_REFUSE','BUCKET_EXISTANT','BUCKET_PRIVE_REFUSE','COPY_ECHO_AMBIGU','IDENTITE_REFUSEE','CAS_REFUSE','INTEGRITE_SOURCE','INTEGRITE_DESTINATION','JOURNAL_PERSISTANCE','JOURNAL_EMPOISONNE','JOURNAL_INTENTION','CHECKPOINT_REFUSE','REPONSE_FORME','REPONSE_BORNE','HTTP_IO','HTTP_REFUS','HTTP_REDIRECTION'];
export async function executerCampagne({io,journal,budget,preparerPlan,catalogueAttendu,nettoyageAutorise=false}){
 if(!/^[0-9a-f]{64}$/.test(catalogueAttendu||''))refuser('PREFLIGHT_REFUSE');
 let plan=null,bucketIncertain=false,copiesVerifiees=0;const confirmees=new Map(),incertaines=new Set();
 const trace=s=>s?tracerSource(s):{};
 const inscrire=(type,action,extra={})=>{budget.reste();const r=journal.ajouter({type,action,phase:budget.phase(),...extra});if(r?.durable!==true)refuser('JOURNAL_PERSISTANCE');budget.reste();};
 const call=async(action,fn,s=null,extra={})=>{inscrire('INTENTION',action,{...trace(s),...extra});const r=await fn();budget.reste();inscrire('RETOUR',action,{...trace(s),...extra,statut:'OK'});return r;};
 const checkpoint=async(c,autorisations=[])=>{budget.reste();const r=await journal.checkpoint(c,autorisations);if(!r||!Number.isSafeInteger(r.id)||r.id<1||!/^[0-9a-f]{64}$/.test(r.digest||''))refuser('CHECKPOINT_REFUSE');budget.reste();};
 const validerPreflight=(p,n,objets)=>{if(p?.ro!==true||p.bypass!==true||p.structure_ok!==true||p.privacy_catalogue!==true||p.catalogue_fp!==catalogueAttendu)refuser('PREFLIGHT_REFUSE');if(p.bucket?.nombre!==n||p.bucket.objets!==objets||(n===1&&p.bucket.prive!==true))refuser(n?'BUCKET_PRIVE_REFUSE':'BUCKET_EXISTANT');};
 const lire=async s=>indexer(await call('ETAT',()=>io.etats([s]),s),[s]).get(s.name);
 async function compenser(){
  if(!journal.valide()||!nettoyageAutorise||confirmees.size===0)return {absentes:0,residus:confirmees.size};
  budget.nettoyer();const connus=[...confirmees.values()],sources=connus.map(x=>x.source),m=indexer(await call('ETAT_FINAL',()=>io.etatsFinaux(sources)),sources),effacables=[];let absentes=0;
  for(const c of connus){const d=m.get(c.source.name).destination;if(d===null){absentes++;continue;}try{cibleStable(c.source,d,c.destination,false);if(!((d.owner===null&&d.owner_id===null)||(d.owner===c.source.owner&&d.owner_id===c.source.owner_id)))continue;effacables.push({source:c.source,destination:d});}catch{}}
  if(effacables.length){const dest_fp=empreinteLot(effacables);await checkpoint('COMPENSATION',[{action:'DELETE_COPIE',dest_fp}]);
   // L'upload peut durer : une identité relue avant le checkpoint n'est pas fraîche.
   const justeAvant=indexer(await call('ETAT_FINAL',()=>io.etatsFinaux(effacables.map(x=>x.source))),effacables.map(x=>x.source));
   for(const c of effacables){const d=justeAvant.get(c.source.name).destination;cibleStable(c.source,d,c.destination,false);if(!((d.owner===null&&d.owner_id===null)||(d.owner===c.source.owner&&d.owner_id===c.source.owner_id)))refuser('OWNER_DESTINATION');}
   await call('DELETE_COPIE',()=>io.supprimerCopies(effacables),null,{dest_fp,objets:effacables.length});const apres=indexer(await call('ETAT_FINAL',()=>io.etatsFinaux(effacables.map(x=>x.source))),effacables.map(x=>x.source));absentes+=effacables.filter(c=>apres.get(c.source.name).destination===null).length;}
  return {absentes,residus:confirmees.size-absentes};
 }
 try{
  inscrire('DEBUT','CATALOGUE');const payload=await call('CATALOGUE',()=>io.catalogue());plan=preparerPlan(payload);
  if(!Array.isArray(plan.sources)||plan.sources.length!==14||new Set(plan.sources.map(s=>s.name)).size!==14||plan.sources.some(s=>s.bucket!=='content'||!UUID.test(s.id||'')||!UUID.test(s.owner||'')||s.owner!==s.owner_id||typeof s.version!=='string'||!s.version||typeof s.mime!=='string'||!s.mime||typeof s.size!=='string'||!/^\d{1,12}$/.test(s.size))||plan.sources.reduce((n,s)=>n+Number(s.size),0)>25165824)refuser('COHORTE_REFUSEE');
  io.lierPlan(plan.sources);validerPreflight(await call('PREFLIGHT',()=>io.preflight()),0,0);
  // Le checkpoint contient les14 intentions, sans noms/UID/URL ni valeurs SQL.
  for(const s of plan.sources)inscrire('DEBUT','COPY',trace(s));
  await checkpoint('BUCKET',[{action:'CREER_BUCKET'}]);bucketIncertain=true;await call('CREER_BUCKET',()=>io.creerBucket());validerPreflight(await call('BUCKET_PRIVE',()=>io.bucketPrive()),1,0);bucketIncertain=false;
  await checkpoint('COPIES',plan.sources.map(s=>({action:'COPY',...trace(s)})));
  for(const s of plan.sources){
   let e=await lire(s);sourceStable(s,e);if(e.destination!==null)refuser('BUCKET_EXISTANT');
   const avant=await call('GET_SOURCE',async()=>hacher(await io.getSource(s),budget),s);if(avant.bytes!==Number(s.size)||(md5Valide(s.etag)&&avant.md5!==s.etag.toLowerCase()))refuser('INTEGRITE_SOURCE');
   inscrire('VERIFIE','GET_SOURCE',{...trace(s),sha256:avant.sha256,md5:avant.md5,octets:avant.bytes});
   e=await lire(s);sourceStable(s,e);if(e.destination!==null)refuser('BUCKET_EXISTANT');budget.copie(avant.bytes);
   const echo=await call('COPY',()=>{incertaines.add(s.name);return io.copier(s);},s);if(!echo||!UUID.test(echo.id)||echo.id===s.id||!/^[0-9a-f]{64}$/.test(echo.echo_fp||''))refuser('COPY_ECHO_AMBIGU');
   inscrire('ECHO_COPY','COPY',{...trace(s),echo_fp:echo.echo_fp,identite_fp:sha(echo.id.toLowerCase())});
   e=await lire(s);const d=e.destination;if(!d||d.id!==echo.id||d.bucket!==DEST||d.name!==s.name||typeof d.version!=='string'||!d.version)refuser('IDENTITE_REFUSEE');
   inscrire('ECHO_COPY','COPY',{...trace(s),echo_fp:echo.echo_fp,identite_fp:identite(d)});io.fixerIdentite(s,d);confirmees.set(s.name,{source:s,destination:{...d},avant,echo});incertaines.delete(s.name);
   sourceStable(s,e);if(d.mime!==s.mime||d.size!==s.size)refuser('INTEGRITE_DESTINATION');if(!((d.owner===null&&d.owner_id===null)||(d.owner===s.owner&&d.owner_id===s.owner_id)))refuser('OWNER_DESTINATION');
  }
  validerPreflight(await call('PREFLIGHT',()=>io.preflight()),1,14);
  const cas=[...confirmees.values()].filter(c=>c.destination.owner===null&&c.destination.owner_id===null).map(c=>({action:'CAS',...trace(c.source),identite_fp:identite(c.destination)}));
  // Les14échos sont donc déjà dans le dépôt distant avant tout CAS.
  await checkpoint('ASSOCIATIONS',cas);
  for(const s of plan.sources){
   const c=confirmees.get(s.name),d=c.destination;let e=await lire(s);sourceStable(s,e);cibleStable(s,e.destination,d,false);
   if(d.owner===null&&d.owner_id===null){const r=await call('CAS',()=>io.cas(s,d),s,{identite_fp:identite(d)});if(!r||r.id!==d.id||r.version!==d.version||r.owner!==s.owner||r.owner_id!==s.owner_id)refuser('CAS_REFUSE');}
   e=await lire(s);sourceStable(s,e);cibleStable(s,e.destination,d,true);const stable={...e.destination};
   const apres=await call('GET_DESTINATION',async()=>hacher(await io.getDestination(s),budget),s);if(c.avant.sha256!==apres.sha256||c.avant.bytes!==apres.bytes||(md5Valide(stable.etag)&&apres.md5!==stable.etag.toLowerCase()))refuser('INTEGRITE_DESTINATION');
   e=await lire(s);sourceStable(s,e);if(!e.destination||empreintePhysique(e.destination)!==empreintePhysique(stable))refuser('DESTINATION_DERIVEE');
   c.finale=stable;copiesVerifiees++;inscrire('VERIFIE','GET_DESTINATION',{...trace(s),identite_fp:identite(stable),echo_fp:sha(c.echo.id.toLowerCase()),sha256:c.avant.sha256,md5:c.avant.md5,octets:c.avant.bytes});
  }
  const final=indexer(await call('ETAT_FINAL',()=>io.etatsFinaux(plan.sources)),plan.sources);for(const s of plan.sources){const e=final.get(s.name),d=confirmees.get(s.name).finale;sourceStable(s,e);if(!e.destination||empreintePhysique(e.destination)!==empreintePhysique(d))refuser('DESTINATION_DERIVEE');}
  validerPreflight(await call('PREFLIGHT',()=>io.preflight()),1,14);inscrire('FIN','ETAT_FINAL',{statut:'OK',objets:copiesVerifiees});await checkpoint('FIN');
  return {ok:true,copies_verifiees:copiesVerifiees,source_non_modifiee_par_programme:true,stabilite_observee:true,copies_incertaines:0,residus_non_etablis:0,compteurs:budget.compteurs(),go:false};
 }catch(e){
  io.arreterIO?.();let bilan={absentes:0,residus:confirmees.size};try{bilan=await compenser();}catch{io.arreterIO?.();}
  try{inscrire('BLOQUE','REPRISE',{statut:'RESIDU',objets:bilan.residus+incertaines.size});if(journal.valide())await checkpoint('ECHEC');}catch{io.arreterIO?.();}
  return {ok:false,categorie:CODES.includes(e?.code)?e.code:'IO_INDETERMINE',copies_verifiees:copiesVerifiees,copies_incertaines:incertaines.size,residus_non_etablis:bilan.residus+incertaines.size,bucket_incertain:bucketIncertain,source_non_modifiee_par_programme:true,stabilite_observee:false,compensation_absences_observees:bilan.absentes,compteurs:budget.compteurs(),reprise_root_requise:true,go:false};
 }
}
