import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {C,budget,empreintePhysique,identite,sha} from './contrat.mjs';
import {analyser} from './core/classificateur.mjs';
import {selectionRetrait} from './retrait.mjs';
import {retirerAvecIO} from './noyau-retrait.mjs';

const restant='RETRAIT_PHOTOS_RESTANTES',douze='RETRAIT_SANS_USAGE';
const uuid=n=>'12345678-0000-4000-8000-'+String(n).padStart(12,'0');
function montage(operation,{prefixe,index=0}={}){
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
 const journal={ajouter(){return {durable:true};},consommer(){return {};}};
 const go=()=>retirerAvecIO({operation,io,journal,budget:b,attendu,archives:p.archives,
  preparerSelection:cat=>selectionRetrait(cat,p,[],sources),preparerPlan:()=>plan,
  verifierCatalogue:(cat,r,ss)=>selectionRetrait(cat,p,r,ss)});
 return {go,actuels,posts,profils,p,sources,sondes,paquets,io,plan,b};
}
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
  if(d.famille==='ALIAS'&&redirections++<4)return {...r,status:302,location:d.url.replace('https://'+C.netlify+'/media/content/','https://'+C.hote+'/storage/v1/object/public/content/')};
  return r;};
 assert.equal((await n.go()).categorie,'BUDGET_REQUETES');assert.deepEqual(n.paquets,[]);
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
