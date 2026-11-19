// Machine à IO injectés. Aucun transport natif, clé, HTTPS ou reprise activable.
import {createHash} from 'node:crypto';
import {C,ERREUR400,stop,sha,UUID,empreintePhysique,identite,descriptorDelete} from './contrat.mjs';
import {sondes,observerChaine} from './sondes.mjs';
const VIVANT=x=>x?.auth===true&&x.profil===true&&x.suppression_active===false;
async function hacher(flux,b){const s=createHash('sha256'),m=createHash('md5');let n=0;for await(const c of flux){if(!Buffer.isBuffer(c))stop('FLUX_REFUSE');b.reste();n+=c.length;s.update(c);m.update(c);}b.reste();return {sha256:s.digest('hex'),md5:m.digest('hex'),octets:n};}
function verifCopie(entree,e){const {source:s,copie:c}=entree;if(!e?.copie||empreintePhysique(e.copie)!==empreintePhysique(c)||c.owner!==s.owner||c.owner_id!==s.owner_id)stop('COPIE_DERIVEE');if(!VIVANT(e.owner))stop('OWNER_DISPARU');}
function verifEtat(entree,e){if(!e?.source||empreintePhysique(e.source)!==empreintePhysique(entree.source))stop('SOURCE_DERIVEE');verifCopie(entree,e);}
function echoDelete(e,s){return Array.isArray(e)&&e.length===1&&e[0]?.id===s.id&&e[0]?.name===s.name&&(e[0].bucket_id===undefined||e[0].bucket_id==='content');}
const CODES=['PREREQUIS_REFUSES','PLAN_REFUSE','PREUVE_COPIE_REFUSEE','SOURCE_DERIVEE','COPIE_DERIVEE','OWNER_DISPARU','HASH_DIVERGENT','DELETE_AMBIGU','ABSENCE_NON_ETABLIE','RECREATION','BUDGET_REQUETES','BUDGET_OCTETS','BUDGET_DELETE','DELAI','JOURNAL_PERSISTANCE','JOURNAL_EMPOISONNE','JOURNAL_INTENTION','VARIANTES_REFUSEES','SONDE_FORME','SONDE_BORNE','SONDE_NON_QUALIFIEE','ATTENTE_NON_ECOULEE'];
export async function retirerAvecIO({io,journal,budget,preparerSelection,preparerPlan,attendu,erreurs400=[ERREUR400.sha256],erreurs403=[]}){
 if(!attendu||['stage','copies','mandat','maintenance'].some(k=>!/^[0-9a-f]{64}$/.test(attendu[k]||'')))stop('PREREQUIS_REFUSES');
 if([erreurs400,erreurs403].some(a=>!Array.isArray(a)||a.length>8||a.some(x=>typeof x!=='string'||!/^[0-9a-f]{64}$/.test(x))))stop('PREREQUIS_REFUSES');
 let plan=[],supprimees=0,demandeAmbigue=false,sondesEffectuees=0,reponses200=0;const traces=s=>({source_fp:empreintePhysique(s),identite_fp:identite(s)});
 const log=(type,action,extra={})=>{budget.reste();if(journal.ajouter({type,action,phase:budget.phase(),...extra})?.durable!==true)stop('JOURNAL_PERSISTANCE');budget.reste();};
 const call=async(action,fn,trace={})=>{log('INTENTION',action,trace);const ticket=journal.consommer(action,trace);let r;try{r=await fn(ticket);}catch(e){throw e;}budget.reste();log('RETOUR',action,{...trace,statut:'OK'});return r;};
 // Les transports sont seuls propriétaires des débits physiques et des octets.
 // La lane anonyme possède aussi l'intention/ticket de chaque saut HTTP.
 const lireSonde=async(x,desc)=>{const r=await io.probe(desc);if(!r||typeof r.annuler!=='function'||typeof r.lireErreurBornee!=='function')stop('SONDE_FORME');return r;};
 const absenceGroupee=async()=>{const es=await call('ABSENCE',()=>io.absences(plan));if(!Array.isArray(es)||es.length!==14||new Set(es.map(e=>e.cle)).size!==14)stop('RECREATION');
  for(const x of plan){const e=es.find(r=>r.cle===x.source.name);if(!e||e.source!==null)stop('RECREATION');verifCopie(x,e);}};
 try{
  log('DEBUT','PREVOL');const pre=await call('PREVOL',()=>io.prevol());
  if(pre?.fence_sha256!==C.fence_sha256||['stage','copies','mandat','maintenance'].some(k=>pre[k]!==attendu[k]))stop('PREREQUIS_REFUSES');
  const selection=preparerSelection(await call('CATALOGUE',()=>io.catalogue()));
  const etats=await call('SOURCE_ETAT',()=>io.etatsInitiaux(selection.sources));
  plan=preparerPlan(selection,etats);if(!Array.isArray(plan)||plan.length!==14||new Set(plan.map(x=>x.source?.name)).size!==14)stop('PLAN_REFUSE');io.lierPlan(plan);
  const matrices=plan.map(x=>sondes(x.source,x.variantes||[]));
  if(!Array.isArray(etats)||etats.length!==14)stop('PLAN_REFUSE');
  const parId=new Map(etats.map(e=>[e.source?.id,e]));if(parId.size!==14)stop('SOURCE_DERIVEE');
  for(const x of plan){const {source:s,copie:c,preuve:p}=x;if(s.bucket!=='content'||c.bucket!==C.copie||s.name!==c.name||!UUID.test(s.id)||!UUID.test(c.id)||s.id===c.id||p?.source_fp!==empreintePhysique(s)||p.echo_uuid_fp!==sha(c.id)||p.copie_identite_fp!==identite(c)||!/^[0-9a-f]{64}$/.test(p.sha256||'')||!/^[0-9a-f]{32}$/.test(p.md5||''))stop('PREUVE_COPIE_REFUSEE');
   verifEtat(x,parId.get(s.id));
   const a=await call('GET_SOURCE',async()=>hacher(await io.getSource(x),budget),traces(s));
   const b=await call('GET_COPIE',async()=>hacher(await io.getCopie(x),budget),{...traces(s),dest_fp:identite(c)});
   if(a.sha256!==p.sha256||a.md5!==p.md5||a.octets!==p.octets||a.sha256!==b.sha256||a.octets!==b.octets||a.octets!==Number(s.size))stop('HASH_DIVERGENT');
   log('VERIFIE','GET_COPIE',{...traces(s),sha256:a.sha256,md5:a.md5,octets:a.octets});
  }
  if(budget.compteurs().appels+44+matrices.reduce((n,m)=>n+m.demandes.length,0)>160)stop('BUDGET_REQUETES');
  for(const x of plan){const s=x.source;verifEtat(x,await call('SOURCE_ETAT',()=>io.etat(x),traces(s)));budget.supprimer();
   const e=await call('DELETE_SOURCE',ticket=>{demandeAmbigue=true;return io.supprimerSource(x,descriptorDelete(s),ticket);},traces(s));
   if(!echoDelete(e,s))stop('DELETE_AMBIGU');
   const apres=await call('ABSENCE',()=>io.absence(x),traces(s));if(apres?.cle!==s.name||apres.source!==null)stop(apres?.source?.id&&apres.source.id!==s.id?'RECREATION':'ABSENCE_NON_ETABLIE');verifCopie(x,apres);
   demandeAmbigue=false;supprimees++;log('VERIFIE','ABSENCE',{...traces(s),statut:'OK'});
  }
  await absenceGroupee();
  const resteSondes=[];
  for(let i=0;i<plan.length;i++){const x=plan[i],matrice=matrices[i];for(const d of matrice.demandes){
   const lire=desc=>lireSonde(x,desc);
   const r=await observerChaine({descripteur:d,matrice,requete:lire,body400Connus:erreurs400,body403Connus:erreurs403});sondesEffectuees++;
   if(!r.absent){if(r.categorie!=='REPONSE_MEDIA_POSSIBLE')stop('SONDE_NON_QUALIFIEE');reponses200++;resteSondes.push({x,d,matrice});}
  }}
  if(resteSondes.length){budget.observer();budget.attendre();log('INTENTION','ATTENTE_CDN',{objets:resteSondes.length});
   journal.consommer('ATTENTE_CDN');await io.attendre(C.attente_cdn_ms);budget.attenteEcoulee();log('RETOUR','ATTENTE_CDN',{statut:'OK'});
   for(const {x,d,matrice}of resteSondes){const lire=desc=>lireSonde(x,desc);
    const r=await observerChaine({descripteur:d,matrice,requete:lire,body400Connus:erreurs400,body403Connus:erreurs403});sondesEffectuees++;if(!r.absent)stop('ABSENCE_NON_ETABLIE');}
  }
  await absenceGroupee();
  log('FIN','FIN',{statut:'OK',objets:supprimees});return {ok:true,sources_absentes_observees:supprimees,sondes_effectuees:sondesEffectuees,reponses_media_possibles_initiales:reponses200,controles_finis_uniquement:true,purge_globale_cdn_prouvee:false,copies_non_supprimees_par_programme:true,copies_conformes_observees:true,compteurs:budget.compteurs(),go:false};
 }catch(e){io.arreterIO?.();try{log('BLOQUE','FIN',{statut:'NON_GO',objets:supprimees});}catch{}
  return {ok:false,categorie:CODES.includes(e?.code)?e.code:'IO_INDETERMINE',sources_absentes_observees:supprimees,delete_ambigu:demandeAmbigue,sondes_effectuees:sondesEffectuees,copies_non_supprimees_par_programme:true,copies_conformes_observees:false,reprise_sans_replay_automatique:true,compteurs:budget.compteurs(),go:false};}
}
