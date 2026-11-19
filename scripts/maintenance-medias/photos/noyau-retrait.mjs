// Machine à IO injectés. Aucun transport natif, clé, HTTPS ou reprise activable.
import {createHash} from 'node:crypto';
import {C,ERREUR400,stop,sha,UUID,empreintePhysique,identite,descriptorDelete} from './contrat.mjs';
import {sondes,observerChaine} from './sondes.mjs';
import {prefixeRemplacable} from './core/cohorte.mjs';
const VIVANT=x=>x?.auth===true&&x.profil===true&&x.suppression_active===false;
async function hacher(flux,b){const s=createHash('sha256'),m=createHash('md5');let n=0;for await(const c of flux){if(!Buffer.isBuffer(c))stop('FLUX_REFUSE');b.reste();n+=c.length;s.update(c);m.update(c);}b.reste();return {sha256:s.digest('hex'),md5:m.digest('hex'),octets:n};}
function verifCopie(entree,e){const {source:s,copie:c}=entree;if(!e?.copie||empreintePhysique(e.copie)!==empreintePhysique(c)||c.owner!==s.owner||c.owner_id!==s.owner_id)stop('COPIE_DERIVEE');if(!VIVANT(e.owner))stop('OWNER_DISPARU');}
function verifEtat(entree,e){if(!e?.source||empreintePhysique(e.source)!==empreintePhysique(entree.source))stop('SOURCE_DERIVEE');verifCopie(entree,e);}
function echoDelete(e,s){return Array.isArray(e)&&e.length===1&&e[0]?.id===s.id&&e[0]?.name===s.name&&(e[0].bucket_id===undefined||e[0].bucket_id==='content');}
const CODES=['PREREQUIS_REFUSES','PLAN_REFUSE','PREUVE_COPIE_REFUSEE','SOURCE_DERIVEE','COPIE_DERIVEE','OWNER_DISPARU','HASH_DIVERGENT','DELETE_AMBIGU','ABSENCE_NON_ETABLIE','RECREATION','BUDGET_REQUETES','BUDGET_OCTETS','BUDGET_DELETE','DELAI','JOURNAL_PERSISTANCE','JOURNAL_EMPOISONNE','JOURNAL_INTENTION','VARIANTES_REFUSEES','SONDE_FORME','SONDE_BORNE','SONDE_NON_QUALIFIEE','ATTENTE_NON_ECOULEE'];
CODES.push('ARCHIVE_DERIVEE','CATALOGUE_DERIVE','PARENT_DERIVE','USAGE_DERIVE','PREFIXE_REMPLACABLE');
export async function retirerAvecIO({io,journal,budget,preparerSelection,preparerPlan,attendu,operation='RETRAIT_PUBLIC',archives,verifierCatalogue,erreurs400=[ERREUR400.sha256],erreurs403=[]}){
 if(!attendu||['stage','copies','mandat','maintenance'].some(k=>!/^[0-9a-f]{64}$/.test(attendu[k]||'')))stop('PREREQUIS_REFUSES');
 if([erreurs400,erreurs403].some(a=>!Array.isArray(a)||a.length>8||a.some(x=>typeof x!=='string'||!/^[0-9a-f]{64}$/.test(x))))stop('PREREQUIS_REFUSES');
 let plan=[],supprimees=0,demandeAmbigue=false,sondesEffectuees=0,reponses200=0;const traces=s=>({source_fp:empreintePhysique(s),identite_fp:identite(s)});
 const log=(type,action,extra={})=>{budget.reste();if(journal.ajouter({type,action,phase:budget.phase(),...extra})?.durable!==true)stop('JOURNAL_PERSISTANCE');budget.reste();};
 const call=async(action,fn,trace={})=>{log('INTENTION',action,trace);const ticket=journal.consommer(action,trace);let r;try{r=await fn(ticket);}catch(e){throw e;}budget.reste();log('RETOUR',action,{...trace,statut:'OK'});return r;};
 // Les transports sont seuls propriétaires des débits physiques et des octets.
 // La lane anonyme possède aussi l'intention/ticket de chaque saut HTTP.
 const lireSonde=async(x,desc)=>{const r=await io.probe(desc);if(!r||typeof r.annuler!=='function'||typeof r.lireErreurBornee!=='function')stop('SONDE_FORME');return r;};
 const partiel=operation!=='RETRAIT_PUBLIC',restantes=operation==='RETRAIT_PHOTOS_RESTANTES';
 const taille=restantes?2:partiel?12:14;
 let cibles,absentes,selection;
 const retirees=[];
 const controlerCatalogue=async()=>{if(partiel)verifierCatalogue(await call('CATALOGUE',()=>io.catalogue()),retirees,selection.sources);};
 const absenceGroupee=async()=>{const es=await call('ABSENCE',()=>io.absences(plan));if(!Array.isArray(es)||es.length!==14||new Set(es.map(e=>e.cle)).size!==14)stop('RECREATION');
  for(const x of plan){const e=es.find(r=>r.cle===x.source.name),fp=empreintePhysique(x.source);
   if(!e)stop('RECREATION');
   if(absentes.has(fp)||cibles.has(fp)){if(e.source!==null)stop('RECREATION');verifCopie(x,e);}
   else verifEtat(x,e);}};
 try{
  log('DEBUT','PREVOL');const pre=await call('PREVOL',()=>io.prevol());
  if(pre?.fence_sha256!==C.fence_sha256||['stage','copies','mandat','maintenance'].some(k=>pre[k]!==attendu[k]))stop('PREREQUIS_REFUSES');
  selection=preparerSelection(await call('CATALOGUE',()=>io.catalogue()));
  const etats=await call('SOURCE_ETAT',()=>io.etatsInitiaux(selection.sources));
  plan=preparerPlan(selection,etats);if(!Array.isArray(plan)||plan.length!==14||new Set(plan.map(x=>x.source?.name)).size!==14)stop('PLAN_REFUSE');io.lierPlan(plan);
  const fps=plan.map(x=>empreintePhysique(x.source));
  if(!['RETRAIT_PUBLIC','RETRAIT_SANS_USAGE','RETRAIT_PHOTOS_RESTANTES'].includes(operation))stop('PLAN_REFUSE');
  cibles=new Set(partiel?selection.cibles:fps);absentes=new Set(partiel?selection.absentes:[]);
  if(cibles.size!==taille||absentes.size!==(restantes?12:0)||[...cibles].some(fp=>!fps.includes(fp)||absentes.has(fp))||
     [...absentes].some(fp=>!fps.includes(fp))||(partiel&&typeof verifierCatalogue!=='function'))stop('PLAN_REFUSE');
  const candidats=plan.filter(x=>cibles.has(empreintePhysique(x.source)));
  if(partiel&&candidats.some(x=>prefixeRemplacable(x.source.name)))stop('PREFIXE_REMPLACABLE');
  const matrices=candidats.map(x=>sondes(x.source,x.variantes||[]));
  if(partiel&&(!Array.isArray(archives)||archives.length!==14||new Set(archives.map(a=>a.source_fp)).size!==14))stop('ARCHIVE_DERIVEE');
  if(!Array.isArray(etats)||etats.length!==14)stop('PLAN_REFUSE');
  const parCle=new Map(etats.map(e=>[e.cle??e.source?.name,e]));if(parCle.size!==14)stop('SOURCE_DERIVEE');
  for(const x of plan){const {source:s,copie:c,preuve:p}=x;if(s.bucket!=='content'||c.bucket!==C.copie||s.name!==c.name||!UUID.test(s.id)||!UUID.test(c.id)||s.id===c.id||p?.source_fp!==empreintePhysique(s)||p.echo_uuid_fp!==sha(c.id)||p.copie_identite_fp!==identite(c)||!/^[0-9a-f]{64}$/.test(p.sha256||'')||!/^[0-9a-f]{32}$/.test(p.md5||''))stop('PREUVE_COPIE_REFUSEE');
   const state=parCle.get(s.name),dejaAbsente=absentes.has(p.source_fp);
   if(dejaAbsente){if(state?.source!==null)stop('RECREATION');verifCopie(x,state);}else verifEtat(x,state);
   if(partiel){const ar=archives.find(z=>z.source_fp===p.source_fp);
    if(!ar||ar.sha256!==p.sha256||ar.octets!==p.octets)stop('ARCHIVE_DERIVEE');}
   const a=dejaAbsente?null:await call('GET_SOURCE',async()=>hacher(await io.getSource(x),budget),traces(s));
   const b=await call('GET_COPIE',async()=>hacher(await io.getCopie(x),budget),{...traces(s),dest_fp:identite(c)});
   if(b.sha256!==p.sha256||b.md5!==p.md5||b.octets!==p.octets||b.octets!==Number(s.size)||
      (a&&(a.sha256!==b.sha256||a.md5!==b.md5||a.octets!==b.octets)))stop('HASH_DIVERGENT');
   log('VERIFIE','GET_COPIE',{...traces(s),sha256:b.sha256,md5:b.md5,octets:b.octets});
  }
  const precedentes=plan.filter(x=>absentes.has(x.preuve.source_fp)).map(x=>sondes(x.source,x.variantes||[]));
  const compterSondes=ms=>ms.reduce((n,m)=>n+m.demandes.length,0);
  // Chaque redirection consomme aussi un appel physique (transport). Les lots
  // séparés contrôlent toutes les routes à T0 puis après les 60 s de délai.
  const minimumRetrait=3*taille+2+(partiel?taille+2:0)+(partiel?2:1)*compterSondes(matrices);
  const exigerBudget=min=>{if(budget.compteurs().appels+min>C.requete_max)stop('BUDGET_REQUETES');};
  exigerBudget(minimumRetrait+compterSondes(precedentes));
  for(const matrice of precedentes)for(const d of matrice.demandes){
   const r=await observerChaine({descripteur:d,matrice,requete:desc=>lireSonde(null,desc),body400Connus:erreurs400,body403Connus:erreurs403});sondesEffectuees++;
   if(!r.absent)stop('ABSENCE_NON_ETABLIE');
  }
  exigerBudget(minimumRetrait);
  for(const x of candidats){const s=x.source;await controlerCatalogue();verifEtat(x,await call('SOURCE_ETAT',()=>io.etat(x),traces(s)));budget.supprimer();
   const e=await call('DELETE_SOURCE',ticket=>{demandeAmbigue=true;return io.supprimerSource(x,descriptorDelete(s),ticket);},traces(s));
   if(!echoDelete(e,s))stop('DELETE_AMBIGU');
   const apres=await call('ABSENCE',()=>io.absence(x),traces(s));if(apres?.cle!==s.name||apres.source!==null)stop(apres?.source?.id&&apres.source.id!==s.id?'RECREATION':'ABSENCE_NON_ETABLIE');verifCopie(x,apres);
   demandeAmbigue=false;supprimees++;retirees.push(empreintePhysique(s));log('VERIFIE','ABSENCE',{...traces(s),statut:'OK'});
  }
  await absenceGroupee();await controlerCatalogue();
  const resteSondes=[];
  for(let i=0;i<candidats.length;i++){const x=candidats[i],matrice=matrices[i];for(const d of matrice.demandes){
   const lire=desc=>lireSonde(x,desc);
   const r=await observerChaine({descripteur:d,matrice,requete:lire,body400Connus:erreurs400,body403Connus:erreurs403});sondesEffectuees++;
   if(!r.absent){if(r.categorie!=='REPONSE_MEDIA_POSSIBLE')stop('SONDE_NON_QUALIFIEE');reponses200++;}
   if(partiel||!r.absent)resteSondes.push({x,d,matrice});
  }}
  if(resteSondes.length){budget.observer();budget.attendre();log('INTENTION','ATTENTE_CDN',{objets:resteSondes.length});
   journal.consommer('ATTENTE_CDN');await io.attendre(C.attente_cdn_ms);budget.attenteEcoulee();log('RETOUR','ATTENTE_CDN',{statut:'OK'});
   for(const {x,d,matrice}of resteSondes){const lire=desc=>lireSonde(x,desc);
    const r=await observerChaine({descripteur:d,matrice,requete:lire,body400Connus:erreurs400,body403Connus:erreurs403});sondesEffectuees++;if(!r.absent)stop('ABSENCE_NON_ETABLIE');}
  }
  await absenceGroupee();await controlerCatalogue();
  const lot=partiel?{operation,sondes_par_passage:compterSondes(matrices),intervalle_minimum_ms:C.attente_cdn_ms,sources_retires:[...retirees].sort(),sources_deja_absentes:[...absentes].sort(),
   sources_preservees:fps.filter(fp=>!absentes.has(fp)&&!cibles.has(fp)).sort()}:{};
  log('FIN','FIN',{statut:'OK',objets:supprimees});return {ok:true,...lot,sources_absentes_observees:supprimees,sondes_effectuees:sondesEffectuees,reponses_media_possibles_initiales:reponses200,controles_finis_uniquement:true,purge_globale_cdn_prouvee:false,copies_non_supprimees_par_programme:true,copies_conformes_observees:true,compteurs:budget.compteurs(),go:false};
 }catch(e){io.arreterIO?.();try{log('BLOQUE','FIN',{statut:'NON_GO',objets:supprimees});}catch{}
  return {ok:false,categorie:CODES.includes(e?.code)?e.code:'IO_INDETERMINE',sources_absentes_observees:supprimees,delete_ambigu:demandeAmbigue,sondes_effectuees:sondesEffectuees,copies_non_supprimees_par_programme:true,copies_conformes_observees:false,reprise_sans_replay_automatique:true,compteurs:budget.compteurs(),go:false};}
}
