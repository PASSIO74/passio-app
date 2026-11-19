import {exigerAutorisation,contexteAutorise,refuser} from './contexte.mjs';
import {selectionFigee} from './core/cadre.mjs';import * as base from './core/classificateur.mjs';import {projeter} from './core/cohorte.mjs';
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
export async function retraitProduction(cap,chargerClesServeur){
 let io,anonyme,cles,plan,payload;
 try {
  const ctx=contexteAutorise(cap,'RETRAIT_PUBLIC');
  
  const budget=creerBudgetRetrait(),journal=creerJournalRetrait({nonce:ctx.autorisation.nonce});
  cles=chargerClesServeur(cap,'RETRAIT_PUBLIC');io=await creerTransportRetrait(cap,cles,{budget,journal,sqlCatalogue:base.SQL});
  const actions={...io,async probe(d){if(!anonyme)anonyme=await creerTransportAnonyme(cap,{plan,budget,journal});return anonyme.probe(d);},arreterIO(){io.arreterIO();anonyme?.fermer();},async attendre(ms){
   if(ms!==60000)refuser('ATTENTE_REFUSEE');journal.autoriserIO('ATTENTE_CDN');exigerAutorisation(cap,'RETRAIT_PUBLIC');await new Promise(resolve=>setTimeout(resolve,ms));exigerAutorisation(cap,'RETRAIT_PUBLIC');
  }};
  return await retirerAvecIO({io:actions,journal,budget,
   attendu:{stage:ctx.autorisation.preuve_stage_sha256,copies:ctx.autorisation.copies_qualifiees_sha256,mandat:ctx.autorisation_sha256,maintenance:ctx.prevol.maintenance_exclusive_sha256},
   preparerSelection:p=>{payload=p;return selectionFigee(p,base,projeter);},
   preparerPlan:(selection,etats)=>{const variantes=variantesConnues(payload,selection.sources,base.reference);plan=planCanonique(selection,etats.map(e=>e.copie),ctx.copies.copies);for(const x of plan)x.variantes=variantes.get(x.source.name);payload=null;return plan;}});
 } finally {anonyme?.fermer();io?.fermer();cles=null;payload=null;plan=null;}
}
