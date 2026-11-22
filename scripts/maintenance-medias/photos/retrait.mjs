import {exigerAutorisation,contexteAutorise,operationRetrait,refuser} from './contexte.mjs';
import {selectionFigee,empreintePhysique,sha} from './core/cadre.mjs';import * as base from './core/classificateur.mjs';import {projeter,prefixeRemplacable} from './core/cohorte.mjs';
import {creerJournal as creerJournalRetrait} from './journal-retrait.mjs';import {creerTransportRetrait} from './transport-retrait.mjs';
import {creerTransportAnonyme} from './transport-anonyme.mjs';import {retirerAvecIO} from './noyau-retrait.mjs';
import {budget as creerBudgetRetrait,planCanonique,C} from './contrat.mjs';import {sondes} from './sondes.mjs';
export function variantesConnues(payload,sources,reference){
 const parCle=new Map(sources.map(s=>[s.name,{source:s,urls:new Set()}]));let n=0;
 const visiter=(x,d=0)=>{if(++n>200000||d>32)refuser('VARIANTES_REFUSEES');
  if(typeof x==='string'){const r=reference(x),p=r.type==='CONTENT'?parCle.get(r.key):null;if(p){const u=x.startsWith('/media/content/')?'https://'+C.netlify+x:x;sondes(p.source,[u]);p.urls.add(u);}return;}
  if(x&&typeof x==='object'){for(const v of Object.values(x))visiter(v,d+1);}
 };
 for(const k of ['posts','stories','profiles','events'])visiter(payload.tables[k].rows);
 for(const p of payload.tables.posts.rows)if(p.shared!==null&&p.shared!==''){let j;try{j=JSON.parse(p.shared);}catch{refuser('VARIANTES_REFUSEES');}visiter(j);}
 return new Map([...parCle].map(([k,v])=>[k,[...v.urls]]));
}
// Les lignes absentes restent des attentes issues du reçu. Elles ne sont jamais
// injectées dans le catalogue réellement lu ni proposées au DELETE.
export function selectionRetrait(payload,p,retirees=[],sourcesInitiales){
 if(p.operation==='RETRAIT_PUBLIC')return selectionFigee(payload,base,projeter);
 const douze=p.operation==='RETRAIT_SANS_USAGE';
 if(!douze&&p.operation!=='RETRAIT_PHOTOS_RESTANTES')refuser('PLAN_REFUSE');
 const sources=sourcesInitiales??(douze?selectionFigee(payload,base,projeter).sources:p.sources_scellees);
 const egal=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 const fps=sources.map(empreintePhysique),actives=new Set(p.actives),attendues=p.cohorte.empreintes_cohorte;
 if(fps.length!==14||new Set(fps).size!==14||!egal(fps,attendues)||actives.size!==2||
    ![...actives].every(x=>fps.includes(x))||!egal(p.parents_actifs.map(x=>x.source_fp),actives))refuser('PLAN_REFUSE');
 const cibles=fps.filter(fp=>douze?!actives.has(fp):actives.has(fp));
 if(sources.some(s=>cibles.includes(empreintePhysique(s))&&prefixeRemplacable(s.name)))refuser('PREFIXE_REMPLACABLE');
 if(new Set(retirees).size!==retirees.length||!retirees.every(fp=>cibles.includes(fp)))refuser('PLAN_REFUSE');
 const absentes=new Set([...(douze?[]:fps.filter(fp=>!actives.has(fp))),...retirees]);
 const analyse=base.analyser(payload),projection=projeter(payload,base);
 if(analyse.objets!==p.cohorte.objets_observes-absentes.size||
    analyse.empreinte_contexte!==p.cohorte.empreinte_contexte||
    !egal(projection.objets_cohorte.map(x=>x.empreinte),fps.filter(fp=>!absentes.has(fp))))refuser('CATALOGUE_DERIVE');
 const objets=payload.tables.objects.rows,liens=variantesConnues(payload,sources,base.reference);
 for(const s of sources){
  const fp=empreintePhysique(s),presents=objets.filter(o=>o.id===s.id||o.name===s.name);
  if(absentes.has(fp)){
   if(presents.length)refuser('RECREATION');
  }else if(presents.length!==1||empreintePhysique(presents[0])!==fp||presents[0].auth_presente!==true)refuser('SOURCE_DERIVEE');
  const classe=analyse.objets_classes.find(x=>x.empreinte===fp);
  if(!actives.has(fp)){
   if(liens.get(s.name).length||(!absentes.has(fp)&&(!classe?.sans_usage_dans_perimetre||classe.classe!=='INDETERMINE')))refuser('USAGE_DERIVE');
  }else{
   const ref=p.parents_actifs.find(x=>x.source_fp===fp);
   const parents=payload.tables.posts.rows.filter(row=>{const r=base.reference(row.media);return r.type==='CONTENT'&&r.key===s.name;});
   if(parents.length!==1||parents[0].owner!==s.owner||sha(parents[0].id)!==ref.parent_fp||
      sha(s.owner)!==ref.owner_fp||sha(parents[0].media)!==ref.reference_sha256||
      (!absentes.has(fp)&&(classe?.classe!=='PERSONNEL'||classe.usages.personnel!==1||
      classe.usages.public_owner!==0||classe.usages.passio!==0||classe.usages.owner_non_etabli!==0)))refuser('PARENT_DERIVE');
  }
 }
 return {sources,contexte:analyse.empreinte_contexte,cibles,absentes:[...absentes]};
}
export async function retraitProduction(cap,chargerClesServeur){
 let io,anonyme,cles,plan,payload;
 try {
  const operation=operationRetrait(cap),ctx=contexteAutorise(cap,operation),partiel=operation!=='RETRAIT_PUBLIC';
  
  const limite=operation==='RETRAIT_SANS_USAGE'?12:operation==='RETRAIT_PHOTOS_RESTANTES'?2:14;
  const budget=creerBudgetRetrait(undefined,limite),journal=creerJournalRetrait({nonce:ctx.autorisation.nonce});
  cles=chargerClesServeur(cap,operation);io=await creerTransportRetrait(cap,cles,{budget,journal,sqlCatalogue:base.SQL});
  const actions={...io,async probe(d){if(!anonyme)anonyme=await creerTransportAnonyme(cap,{plan,budget,journal});return anonyme.probe(d);},arreterIO(){io.arreterIO();anonyme?.fermer();},async attendre(ms){
   if(ms!==60000)refuser('ATTENTE_REFUSEE');journal.autoriserIO('ATTENTE_CDN');exigerAutorisation(cap,operation);await new Promise(resolve=>setTimeout(resolve,ms));exigerAutorisation(cap,operation);
  }};
  return await retirerAvecIO({io:actions,journal,budget,
   attendu:{stage:ctx.autorisation.preuve_stage_sha256,copies:ctx.autorisation.copies_qualifiees_sha256,mandat:ctx.autorisation_sha256,maintenance:ctx.prevol.maintenance_exclusive_sha256},
   operation,archives:ctx.autorisation.archives,
   verifierCatalogue:partiel?(cat,retirees,originales)=>selectionRetrait(cat,ctx.autorisation,retirees,originales):undefined,
   preparerSelection:p=>{payload=p;return selectionRetrait(p,ctx.autorisation);},
   preparerPlan:(selection,etats)=>{const variantes=variantesConnues(payload,selection.sources,base.reference);plan=planCanonique(selection,etats.map(e=>e.copie),ctx.copies.copies);for(const x of plan)x.variantes=variantes.get(x.source.name);payload=null;return plan;}});
 } finally {anonyme?.fermer();io?.fermer();cles=null;payload=null;plan=null;}
}
