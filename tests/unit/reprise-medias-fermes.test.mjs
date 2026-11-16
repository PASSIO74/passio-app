import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),M=require('../../scripts/lib/reprise-medias-fermes.js'),R=require('../../scripts/restaurer-donnees.js');
const {ETAPES}=require('../../scripts/schema-executable.js');
const sha=x=>createHash('sha256').update(x).digest('hex');
const flag=(actif=true)=>({cle:'medias_proteges',valeur:{actif}});
const tables=[...M.REGISTRES,'reglages_distants'];
function archive({registres=true,lignes=[JSON.stringify(flag())],auth=false}={}){
  const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'passio-reprise-fermee-'));
  const noms=registres?[...tables]:['reglages_distants'];
  const man={projet:'https://ssssssssssssssssssss.supabase.co',tables:{}};
  for(const t of noms){const l=t==='reglages_distants'?lignes:[];fs.writeFileSync(path.join(dossier,t+'.ndjson'),l.join('\n')+(l.length?'\n':''));man.tables[t]={exporte:l.length,tri:t==='reglages_distants'?'cle':'id'};}
  if(auth)fs.writeFileSync(path.join(dossier,'_auth_users.ndjson'),JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid'})+'\n');
  fs.mkdirSync(path.join(dossier,'_storage'));
  const ddl='begin;\n'+ETAPES.find(e=>e.titre==='Seaux de stockage').rendu([]).join('\n')+'\ncommit;\n';
  fs.writeFileSync(path.join(dossier,'schema.sql'),ddl);man.schema_sha256=sha(ddl);
  return {archive:dossier,man,jeton:'sbp_synthetic',ref:'dddddddddddddddddddd',url:'https://dddddddddddddddddddd.supabase.co',cle:'synthetic',
    _cols:new Map([['reglages_distants',['cle','valeur','motif']]]),_pk:new Map([['reglages_distants',['cle']]])};
}
function nettoyer(ctx){assert.equal(path.dirname(path.resolve(ctx.archive)),path.resolve(os.tmpdir()));assert.ok(path.basename(ctx.archive).startsWith('passio-reprise-fermee-'));fs.rmSync(ctx.archive,{recursive:true,force:true});}
async function avec(fetch,fn){const ancien=globalThis.fetch;globalThis.fetch=fetch;try{return await fn();}finally{globalThis.fetch=ancien;}}
function monde(ctx,{etat='FERMEE',catalogue=true,nonFiltree=true}={}){
  const appels=[],mutations=[],json=x=>new Response(JSON.stringify(x));
  let cible=fs.readFileSync(path.join(ctx.archive,'reglages_distants.ndjson'),'utf8').split('\n').filter(Boolean).map(l=>M.projeterReglage(l));
  const fetch=async(url,init={})=>{
    if(String(url).includes('/rest/v1/')){
      const t=new URL(url).pathname.split('/').pop();return new Response('['+(t==='reglages_distants'?cible.join(','):'')+']');
    }
    assert.equal(url,'https://api.supabase.com/v1/projects/dddddddddddddddddddd/database/query');
    const body=JSON.parse(init.body),q=body.query;appels.push(body);
    if(body.read_only){
      assert.match(q,/^select /);assert.equal(init.redirect,'error');
      if(q===M.SQL_CATALOGUE)return json([{lecture_seule:true,presente:catalogue,genre:catalogue?'r':null,non_filtree:nonFiltree}]);
      if(q===M.SQL_ETAT){const total=etat==='ABSENTE'?0:1;return json([{lecture_seule:true,total,fermes:etat==='FERMEE'?1:0,actifs:etat==='ACTIVE'?1:0}]);}
      if(q.includes('pg_namespace'))return json([{lecture_seule:true,rencontres:false,budget:false,tables:[]}]);
      throw new Error('unknown_readonly_query');
    }
    if(q.startsWith('select table_name'))return json(Object.keys(ctx.man.tables).map(table_name=>({table_name})));
    if(q.includes('count(*)::int n from public.'))return json(Object.keys(ctx.man.tables).map(t=>({t,n:ctx.man.tables[t].exporte})));
    if(q.includes('from storage.buckets'))return json([]);
    mutations.push(q);return json([]);
  };
  return {fetch,appels,mutations,setCible:l=>{cible=l;}};
}

test('source : un seul registre suffit à exiger le trio et une ligne unique strictement booléenne',()=>{
  assert.throws(()=>M.inspecterArchive({tables:[M.REGISTRES[0]],lignes:[flag()]}),/REGISTRES_INCOMPLETS/);
  assert.throws(()=>M.inspecterArchive({tables,lignes:[]}),/REGLAGE_ABSENT/);
  assert.throws(()=>M.inspecterArchive({tables,lignes:[flag(),flag(false)]}),/REGLAGE_MULTIPLE/);
  for(const valeur of [null,true,'{"actif":true}',[],{}, {actif:1},{actif:'false'},{actif:false,autre:false}])
    assert.throws(()=>M.inspecterArchive({tables,lignes:[{cle:'medias_proteges',valeur}]}),/REGLAGE_INVALIDE/);
  assert.equal(M.inspecterArchive({tables,lignes:[flag()]}).activation_attendue,'fermee');
});
test('projection : seul le booléen actif change, lexèmes/nombres/autres flags/texte intacts',()=>{
  const source='{ "cle":"medias_proteges", "valeur": { "actif": true }, "motif":"true 2906581903110193585", "n":2906581903110193585, "x":1e400, "autre":true }';
  assert.equal(M.projeterReglage(source),source.replace('"actif": true','"actif": false'));
  assert.equal(M.projeterReglage(source.replace('medias_proteges','autre_reglage')),source.replace('medias_proteges','autre_reglage'));
  assert.throws(()=>M.projeterReglage('{"cle":"medias_proteges","valeur":{"actif":true,"extra":0}}'),/INVALIDE/);
});
test('legacy : absence sans registre acceptée avec couverture NON attestée ; présent valide toujours fermé',()=>{
  const v=M.inspecterArchive({tables:['posts'],lignes:[]});
  assert.equal(v.couverture,'legacy_non_attestee');assert.equal(v.activation_source,'absente');
  assert.equal(M.inspecterArchive({tables:['reglages_distants'],lignes:[flag()]}).activation_attendue,'fermee');
  assert.throws(()=>M.inspecterArchive({tables:['reglages_distants'],lignes:[{cle:'medias_proteges',valeur:{actif:null}}]}),/INVALIDE/);
});
test('validation réelle : source nouvelle sans réglage, malformée ou avec doublon est invalide sans bypass historique',()=>{
  for(const lignes of [[],[JSON.stringify({cle:'medias_proteges',valeur:{actif:1}})],[JSON.stringify(flag()),JSON.stringify(flag(false))]]){
    const ctx=archive({lignes});try{
      const v=R._phases.validerArchive(ctx);assert.equal(v.ok,false);assert.equal(v.indetermine,false);
      assert.ok(v.bloquants.some(x=>x.startsWith(M.PREFIXE)));
    }finally{nettoyer(ctx);}
  }
});
test('vrai CLI --tables : une archive de registres médias ne devient pas une reprise partielle implicite',()=>{
  const ctx=archive(),preload=path.join(ctx.archive,'transport.cjs'),trace=path.join(ctx.archive,'trace.ndjson');
  try{
    fs.writeFileSync(path.join(ctx.archive,'manifeste.json'),JSON.stringify(ctx.man));
    fs.writeFileSync(preload,`const fs=require('node:fs');globalThis.fetch=async(url,init={})=>{fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({method:init.method||'GET'})+'\\n');return new Response(JSON.stringify(String(url).includes('/api-keys')?[{name:'service_role',api_key:'synthetic_fixture'}]:{status:'ACTIVE_HEALTHY',name:'fixture'}));};`);
    const r=spawnSync(process.execPath,['--require',preload,require.resolve('../../scripts/restaurer-donnees.js'),'--archive',ctx.archive,'--projet',ctx.ref,'--tables','profiles'],
      {encoding:'utf8',timeout:10000,env:{...process.env,SUPABASE_ACCESS_TOKEN:'sbp_synthetic',GITHUB_ACTIONS:'',CI:''}});
    assert.notEqual(r.status,0);assert.match(r.stderr,/ARCHIVE_PORTEE_PARTIELLE_REFUSEE/);
    assert.ok(fs.readFileSync(trace,'utf8').trim().split('\n').every(l=>JSON.parse(l).method==='GET'));
  }finally{nettoyer(ctx);}
});
test('cible : absente ou false admis, true/malformed/filtrage/lecture inconnue refusés en readonly',async()=>{
  for(const opts of [{catalogue:false},{etat:'ABSENTE'},{etat:'FERMEE'},{etat:'ACTIVE'},{etat:'INVALIDE'},{nonFiltree:false}]){
    const ctx=archive(),m=monde(ctx,opts);try{
      await avec(m.fetch,async()=>{
        if(opts.etat==='ACTIVE'||opts.etat==='INVALIDE'||opts.nonFiltree===false)await assert.rejects(R._phases.garderMediasFermes(ctx),/CIBLE_/);
        else await R._phases.garderMediasFermes(ctx);
      });
      assert.equal(m.mutations.length,0);assert.ok(m.appels.every(x=>x.read_only===true));
    }finally{nettoyer(ctx);}
  }
  await assert.rejects(M.garderCible(async()=>({lecture_seule:false})),/INDETERMINEE/);
  await assert.rejects(M.garderCible(async()=>{throw new Error('secret serveur non affiché');}),e=>e.message===M.PREFIXE+'CIBLE_LECTURE_INDETERMINEE');
});
test('cible préactive ou malformed : refus avant DDL/Auth/tables/Storage, même sans --schema',async()=>{
  for(const phase of ['schema','comptes','tables','medias'])for(const etat of ['ACTIVE','INVALIDE']){
    const ctx=archive({auth:true}),m=monde(ctx,{etat});try{
      await avec(m.fetch,()=>assert.rejects(R._phases[phase](ctx),/CIBLE_(?:ACTIVE|REGLAGE_INVALIDE)/));
      assert.equal(m.mutations.length,0,phase);assert.ok(m.appels.every(x=>x.read_only===true));
    }finally{nettoyer(ctx);}
  }
});
test('garde relue aux frontières : une cible activée depuis la lecture précédente refuse la phase suivante',async()=>{
  const ctx=archive(),ferme=monde(ctx),actif=monde(ctx,{etat:'ACTIVE'});try{
    await avec(ferme.fetch,()=>R._phases.preparerRepriseMedias(ctx));
    await avec(actif.fetch,()=>assert.rejects(R._phases.tables(ctx),/CIBLE_ACTIVE/));
    assert.equal(actif.mutations.length,0);assert.ok(actif.appels.length>=2);
  }finally{nettoyer(ctx);}
});
test('import et verdict réels : source active → cible fermée ; cible réactivée échoue ; archive hash identique',async()=>{
  const autre='{ "cle":"autre", "valeur":{"n":2906581903110193585,"x":1e400,"actif":true}, "motif":"ne pas modifier" }';
  const source='{ "cle":"medias_proteges", "valeur":{"actif":true}, "motif":"activation source" }';
  const ctx=archive({lignes:[source,autre]}),m=monde(ctx),f=path.join(ctx.archive,'reglages_distants.ndjson'),avant=sha(fs.readFileSync(f));
  try{
    await avec(m.fetch,async()=>{
      await R._phases.preparerRepriseMedias(ctx);
      await R._phases.chargerTable(ctx,'reglages_distants',{notes:[],refus:[]});
      assert.equal(m.mutations.length,1);assert.ok(m.mutations[0].includes('"actif":false'));assert.ok(m.mutations[0].includes(autre));
      assert.equal(await R._phases.verdict(ctx),true);
    });
    const mutant=monde(ctx,{etat:'ACTIVE'});mutant.setCible([source,autre]);
    await avec(mutant.fetch,async()=>assert.equal(await R._phases.verdict(ctx),false));
    assert.equal(sha(fs.readFileSync(f)),avant);
  }finally{nettoyer(ctx);}
});
