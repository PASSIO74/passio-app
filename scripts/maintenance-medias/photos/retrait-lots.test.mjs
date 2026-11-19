import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {C,budget,empreintePhysique,identite,sha} from './contrat.mjs';
import {analyser} from './core/classificateur.mjs';
import {selectionRetrait} from './retrait.mjs';
import {retirerAvecIO} from './noyau-retrait.mjs';
import {sondes,observerSerie} from './sondes.mjs';

const restant='RETRAIT_PHOTOS_RESTANTES',douze='RETRAIT_SANS_USAGE';
const uuid=n=>'12345678-0000-4000-8000-'+String(n).padStart(12,'0');
function montage(operation,{prefixe,index=0,journalDisque}={}){
 const bytes=Buffer.from('fixture'),md5=createHash('md5').update(bytes).digest('hex');
 const owner=uuid(99);
 const sources=Array.from({length:14},(_,i)=>({id:uuid(i+1),bucket:'content',name:'photos/fixture-'+i+'.png',
  version:'v1',owner,owner_id:owner,auth_presente:true,mime:'image/png',size:String(bytes.length),etag:null}));
 if(prefixe)sources[index].name=prefixe+'/fixture/'+index+'.png';
 const plan=sources.map((source,i)=>{
  const copie={...source,id:uuid(30+i),bucket:C.copie};
  const preuve={source_fp:empreintePhysique(source),echo_uuid_fp:sha(copie.id),copie_identite_fp:identite(copie),
   sha256:sha(bytes),md5,octets:bytes.length};
  return {source,copie,preuve};
 });
 const posts=sources.slice(0,2).map((s,i)=>({id:'test'+i,owner,media:'https://'+C.hote+'/storage/v1/object/public/content/'+s.name,
  shared_from:null,shared:null,overlays:null}));
 const profils=[{id:owner,avatar:null,cover:null,passions:[]}];
 const actuels=new Map(sources.map(s=>[s.name,s])),paquets=[],sondes=[];
 const table=rows=>({count:rows.length,rows});
 const catalogue=()=>({lecture_seule:true,role_bypass:true,tables_ordinaires:true,colonnes_builtin:true,timeout_ms:5000,
  tables:{objects:table([...actuels.values()]),posts:table(posts),profiles:table(profils),stories:table([]),events:table([])}});
 const fps=sources.map(empreintePhysique);
 const p={operation,cohorte:{objets_observes:14,empreinte_contexte:analyser(catalogue()).empreinte_contexte,empreintes_cohorte:fps},
  actives:fps.slice(0,2),archives:plan.map(x=>({source_fp:x.preuve.source_fp,sha256:x.preuve.sha256,octets:x.preuve.octets})),
  sources_scellees:sources,parents_actifs:posts.map((row,i)=>({source_fp:fps[i],parent_fp:sha(row.id),owner_fp:sha(owner),reference_sha256:sha(row.media)}))};
 if(operation===restant)for(const s of sources.slice(2))actuels.delete(s.name);
 const etat=x=>({cle:x.source.name,source:actuels.get(x.source.name)??null,copie:x.copie,owner:{auth:true,profil:true,suppression_active:false}});
 const attendu=Object.fromEntries(['stage','copies','mandat','maintenance'].map(k=>[k,sha(k)]));
 let temps=0;const b=budget(()=>({wall:temps,mono:temps}));
 const io={prevol:async()=>({fence_sha256:C.fence_sha256,...attendu}),catalogue,etatsInitiaux:async()=>plan.map(etat),lierPlan(){},
  etat:async x=>etat(x),getSource:async()=>[bytes],getCopie:async()=>[bytes],
  supprimerSource:async x=>{paquets.push(x.source.name);actuels.delete(x.source.name);return [{id:x.source.id,name:x.source.name}];},
  absence:async x=>etat(x),absences:async()=>plan.map(etat),
  attendre:async ms=>{temps+=ms;},
  probe:async d=>{sondes.push({...d,temps});return {status:404,annuler(){},lireErreurBornee(){throw Error();}};}};
 for(const k of ['prevol','catalogue','etatsInitiaux','etat','getSource','getCopie','supprimerSource','absence','absences','probe']){
  const f=io[k];io[k]=(...args)=>{b.appel();return f(...args);};
 }
 const evenements=[];
 const journal=journalDisque??{ajouter(e){evenements.push(e);return {durable:true};},consommer(){return {};}};
 const go=()=>retirerAvecIO({operation,io,journal,budget:b,attendu,archives:p.archives,
  preparerSelection:cat=>selectionRetrait(cat,p,[],sources),preparerPlan:()=>plan,
  verifierCatalogue:(cat,r,ss)=>selectionRetrait(cat,p,r,ss)});
 return {go,actuels,posts,profils,p,sources,sondes,paquets,io,plan,b,evenements};
}
test('journal disque : 72 GET et 72 résultats logiques, 301→origine, un média à T0 puis fermeture à T+60',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'passio-journal-lot-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const avant=process.env.RUNNER_TEMP;process.env.RUNNER_TEMP=dir;
 let journal;
 try{const mod=await import('./journal-retrait.mjs?test-disque');journal=mod.creerJournal({nonce:uuid(9999)});}
 finally{if(avant===undefined)delete process.env.RUNNER_TEMP;else process.env.RUNNER_TEMP=avant;}
 const m=montage(douze,{journalDisque:journal}),lire=m.io.probe;
 m.io.probe=async d=>{
  const x=m.plan.find(x=>sondes(x.source).demandes.some(z=>z.url===d.url));
  const trace={source_fp:x.preuve.source_fp,identite_fp:identite(x.source),dest_fp:d.empreinte};
  assert.equal(journal.ajouter({type:'INTENTION',action:'PROBE_PUBLIC',phase:m.b.phase(),...trace}).durable,true);
  const ticket=journal.consommer('PROBE_PUBLIC',trace);journal.autoriserIO('PROBE_PUBLIC',trace,ticket);
  const r=await lire(d);
  if(d.famille==='ALIAS')return {...r,status:301,location:sondes(x.source).demandes[0].url};
  if(d.famille==='TRANSFORMATION'&&x===m.plan[2]&&m.b.phase()==='PRINCIPAL')return {...r,status:200};
  return r;
 };
 const resultat=await m.go();assert.equal(resultat.ok,true,resultat.categorie);
 assert.equal(resultat.sources_fermees_t0,11);assert.equal(resultat.sources_fermees_apres_delai,12);
 const fichiers=fs.readdirSync(journal.repertoire).filter(n=>/^event-/.test(n)).sort();
 assert.ok(fichiers.length<700);let precedent='0'.repeat(64);
 const events=fichiers.map(n=>{const b=fs.readFileSync(path.join(journal.repertoire,n)),e=JSON.parse(b);assert.equal(e.precedent,precedent);precedent=sha(b);return e;});
 const probes=events.filter(e=>e.action==='PROBE_PUBLIC');
 for(const type of ['INTENTION','RETOUR','VERIFIE'])assert.equal(probes.filter(e=>e.type===type).length,72);
 for(const [i,e] of probes.entries())if(e.type==='RETOUR'){
  const demande=probes[i-1];assert.equal(demande.type,'INTENTION');assert.equal(demande.dest_fp,e.dest_fp);
  assert.equal(demande.source_fp,e.source_fp);assert.equal(demande.phase,e.phase);
  if(e.http===301){assert.equal(probes[i+1].type,'INTENTION');assert.equal(probes[i+1].dest_fp,e.sha256);}
 }
 assert.equal(probes.filter(e=>e.type==='VERIFIE'&&e.statut==='REFUSE').length,1);
 assert.equal(events.find(e=>e.action==='ATTENTE_CDN'&&e.type==='RETOUR').duree_ms,60000);
});
test('douze seuls puis deux seules : ensembles, copies et sondes finis',async()=>{
 for(const op of [douze,restant]){
  const m=montage(op),r=await m.go();assert.equal(r.ok,true,r.categorie);
  const attendues=op===douze?m.sources.slice(2):m.sources.slice(0,2);
  assert.deepEqual(m.paquets,attendues.map(s=>s.name));
  assert.equal(r.sources_retires.length,attendues.length);assert.equal(r.sources_preservees.length,op===douze?2:0);
  assert.equal(r.sources_deja_absentes.length,op===douze?0:12);
  const parPassage=3*attendues.length;
  assert.equal(r.sondes_par_passage,parPassage);assert.equal(m.sondes.length,op===douze?72:48);
  const phases=m.sondes.slice(-2*parPassage);
  assert.deepEqual(phases.slice(0,parPassage).map(d=>d.url),phases.slice(parPassage).map(d=>d.url));
  assert.ok(phases.slice(0,parPassage).every(d=>d.temps===0)&&phases.slice(parPassage).every(d=>d.temps>=60000));
  assert.equal(r.compteurs.appels,op===douze?155:79);
 }
});
test('les cinq préfixes Storage remplaçables sont exclus des deux lots, avant le premier DELETE',async()=>{
 for(const op of [douze,restant])for(const prefixe of ['avatars','covers','passion_photos','passion_covers','events']){
  const m=montage(op,{prefixe,index:op===douze?3:0});const r=await m.go();
  assert.equal(r.categorie,'PREFIXE_REMPLACABLE');assert.deepEqual(m.paquets,[]);
 }
});
test('deux passages inclus dans le budget minimal avant mutation, y compris les sauts déjà consommés',async()=>{
 const m=montage(douze);
 for(let i=0;i<6;i++)m.b.appel();
 assert.equal((await m.go()).categorie,'BUDGET_REQUETES');assert.deepEqual(m.paquets,[]);
 const n=montage(restant),probe=n.io.probe;
 let redirections=0;
 // Occupation préalable bornée ; les redirections lors des sondes des douze
 // déjà absentes consomment le reste avant la seconde vérification de budget.
 for(let i=0;i<79;i++)n.b.appel();
 n.io.probe=async d=>{const r=await probe(d);
  if(d.famille==='ALIAS'&&redirections++<4)return {...r,status:302,location:d.url.replace('https://'+C.netlify+'/media/content/','https://'+C.hote+'/storage/v1/render/image/public/content/')+'?width=352&quality=75'};
  return r;};
 assert.equal((await n.go()).categorie,'BUDGET_REQUETES');assert.deepEqual(n.paquets,[]);
});
test('301 vers origine et deux 400 qualifiés : 155 appels, chaque chemin physiquement demandé une fois par source et série',async()=>{
 const m=montage(douze),initial=m.io.probe;
 const erreur=Buffer.from('{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}');
 m.io.probe=async d=>{const r=await initial(d);
  if(d.famille==='ALIAS')return {...r,status:301,location:d.url.replace('https://'+C.netlify+'/media/content/','https://'+C.hote+'/storage/v1/object/public/content/')};
  return {...r,status:400,lireErreurBornee:async()=>erreur};
 };
 const resultat=await m.go();
 assert.equal(resultat.ok,true,resultat.categorie);assert.equal(resultat.compteurs.appels,155);
 assert.equal(resultat.compteurs.deletes_demandes,12);assert.equal(resultat.sondes_effectuees,72);
 const controles=m.evenements.filter(e=>e.type==='VERIFIE'&&e.action==='PROBE_PUBLIC');
 assert.equal(controles.length,72);
 for(const t of [0,60000]){
  const appels=m.sondes.filter(d=>d.temps===t),preuves=controles.filter(e=>e.phase===(t?'OBSERVATION':'PRINCIPAL'));
  assert.equal(appels.length,36);assert.equal(new Set(appels.map(x=>x.url)).size,36);
  assert.equal(preuves.length,36);
  for(const d of appels){
   const preuve=preuves.find(e=>e.dest_fp===d.empreinte);
   assert.ok(preuve);assert.equal(preuve.http,400);
   const url=d.famille==='ALIAS'?d.url.replace('https://'+C.netlify+'/media/content/','https://'+C.hote+'/storage/v1/object/public/content/'):d.url;
   assert.equal(preuve.sha256,sha(url));
   assert.ok(appels.some(x=>x.url===url));
  }
 }
});
test('partage limité à une absence terminale exacte : autre largeur, 200, erreur inconnue et boucle',async()=>{
 const m=sondes({name:'photos/test.png'}),origine=m.demandes[0],alias=m.demandes[1],render=m.demandes[2];
 for(const [destination,statut,nb] of [[render.url,404,3],[render.url.replace('720','352'),404,4],
  [origine.url,200,4],[origine.url,500,4],[alias.url,301,3]]){
  const urls=[],resultats=[];
  const requete=async d=>{urls.push(d.url);return {status:d.famille==='ALIAS'?301:urls.length===2&&d.url===destination?statut:404,location:destination,annuler(){}};};
  for await(const entry of observerSerie({matrice:m,demandes:m.demandes,partager:true,requete}))resultats.push(entry);
  assert.equal(urls.length,nb);
  assert.equal(urls[0],alias.url);assert.ok(urls.includes(origine.url));assert.ok(urls.includes(render.url));
  if(statut!==404)assert.equal(resultats[0].r.absent,false);
 }
});
test('dérives avant mutation : archive, owner, octets, usage, parent ou ancien objet recréé',async()=>{
 for(const [op,modifier] of [
  [douze,m=>m.p.archives[13].sha256=sha('autre')],
  [douze,m=>m.io.getCopie=async()=>[Buffer.from('autres')]],
  [douze,m=>m.plan[6].copie.owner_id=uuid(86)],
  [douze,m=>m.profils[0].cover='https://'+C.hote+'/storage/v1/object/public/content/'+m.sources[5].name],
  [douze,m=>m.p.parents_actifs[1].parent_fp=sha('autre')],
  [restant,m=>m.actuels.set(m.sources[4].name,{...m.sources[4],id:uuid(888)})],
  [restant,m=>m.io.probe=async()=>({status:200,annuler(){},lireErreurBornee(){throw Error();}})]
 ]){
  const m=montage(op);modifier(m);assert.equal((await m.go()).ok,false);assert.deepEqual(m.paquets,[]);
 }
});
test('usage apparu entre deux retraits : aucune suite ni relance automatique',async()=>{
 const m=montage(douze),supprimer=m.io.supprimerSource;
 m.io.supprimerSource=async x=>{const echo=await supprimer(x);m.posts[0].media='https://'+C.hote+'/storage/v1/object/public/content/'+m.sources[3].name;return echo;};
 const r=await m.go();assert.equal(r.ok,false);assert.equal(r.sources_absentes_observees,1);assert.equal(m.paquets.length,1);
 assert.equal((await m.go()).ok,false);assert.equal(m.paquets.length,1);
});
test('un retour physique non durable ferme la réponse et arrête les GET',async()=>{
 let fermetures=0;
 const journal={ajouter(e){return {durable:!(e.type==='RETOUR'&&e.action==='PROBE_PUBLIC')};},consommer(){return {};}};
 const m=montage(douze,{journalDisque:journal}),lire=m.io.probe;
 m.io.probe=async d=>({...await lire(d),annuler(){fermetures++;}});
 const r=await m.go();
 assert.equal(r.ok,false);assert.equal(r.categorie,'JOURNAL_PERSISTANCE');assert.equal(fermetures,1);assert.equal(m.sondes.length,1);
});
