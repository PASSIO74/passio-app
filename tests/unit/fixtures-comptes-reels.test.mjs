import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const fichier=fileURLToPath(new URL('../e2e/compte-e2e.js',import.meta.url));
const source=fs.readFileSync(fichier,'utf8');
const UID='00000000-0000-4000-8000-000000000001';
const AUTRE='00000000-0000-4000-8000-000000000002';
function fixture(reponses=[{uid:UID,token:'session-synthetique'}]){
  const appels=[],attentes=[],sessions=[];
  const pageContext=vm.createContext({window:{},localStorage:{setItem:(k,v)=>sessions.push([k,v])},MY_UID:null,
    supa:{auth:{verifyOtp:async options=>{
      appels.push({type:'verify',tokenHash:options.token_hash});
      const item=reponses[Math.min(appels.filter(a=>a.type==='verify').length-1,reponses.length-1)];
      if(item.exception)throw new Error('transport_synthetique');
      if(item.status)return {error:{status:item.status,code:'categorie_synthetique',message:'refus_synthetique'}};
      if(item.sansSession)return {data:{session:null},error:null};
      return {data:{session:{user:{id:item.uid},access_token:item.token}},error:null};
    },signInWithPassword:async()=>{throw new Error('REPLI_MOT_DE_PASSE_NON_PREVU');}}}});
  const contexte=vm.createContext({module:{exports:{}},__dirname:path.dirname(fichier),
    process:{env:{SUPABASE_URL:'https://synthetique.invalid',SUPABASE_SERVICE_ROLE_KEY:'admin-synthetique'}},
    require:n=>n==='node:fs'?{existsSync:()=>false,readFileSync:()=>{throw new Error('LECTURE_HORS_FIXTURE');}}:n==='node:path'?path:(()=>{throw new Error('MODULE_HORS_FIXTURE');})(),
    setTimeout:(fn,ms)=>{attentes.push(ms);queueMicrotask(fn);return 0;},
    fetch:async(url,options)=>{
      assert.equal(options.method,'POST');
      if(url==='https://synthetique.invalid/auth/v1/admin/users'){
        appels.push({type:'create',emailConfirm:JSON.parse(options.body).email_confirm});
        return {ok:true,json:async()=>({id:UID})};
      }
      assert.equal(url,'https://synthetique.invalid/auth/v1/admin/generate_link');
      appels.push({type:'link'});return {ok:true,json:async()=>({hashed_token:'jeton-synthetique-unique'})};
    }});
  vm.runInContext(source,contexte,{filename:fichier});
  const page={evaluate:async(fn,args)=>{pageContext.__args=args;return vm.runInContext('('+fn.toString()+')(__args)',pageContext);}};
  return {helper:contexte.module.exports,page,appels,attentes,sessions};
}
test('Auth429 : même compte et même jeton repris, puis identité réellement créée mémorisée',async()=>{
  const f=fixture([{status:429},{uid:UID,token:'session-synthetique'}]);
  const r=await f.helper.creerCompteE2E(f.page,'fixture');
  assert.equal(r.uid,UID);assert.equal(r.token,'session-synthetique');
  assert.equal(f.appels.filter(x=>x.type==='create').length,1);
  assert.equal(f.appels.find(x=>x.type==='create').emailConfirm,true);
  assert.equal(f.appels.filter(x=>x.type==='link').length,1);
  assert.deepEqual(f.appels.filter(x=>x.type==='verify').map(x=>x.tokenHash),['jeton-synthetique-unique','jeton-synthetique-unique']);
  assert.deepEqual(f.attentes,[1000]);assert.deepEqual(f.sessions,[['passio_uid',UID]]);
});
test('429 persistant : quatre essais, dix secondes bornées, échec et aucune session mémorisée',async()=>{
  const f=fixture([{status:429}]);
  await assert.rejects(f.helper.creerCompteE2E(f.page),/connexion du compte e2e/);
  assert.equal(f.appels.filter(x=>x.type==='verify').length,4);
  assert.deepEqual(f.attentes,[1000,3000,6000]);assert.deepEqual(f.sessions,[]);
  assert.equal(f.appels.filter(x=>x.type==='create').length,1);
});
test('refus Auth hors429, transport incertain et absence de session ne sont jamais repris',async()=>{
  for(const item of [{status:400},{status:401},{status:403},{status:500},{exception:true},{sansSession:true}]){
    const f=fixture([item]);await assert.rejects(f.helper.creerCompteE2E(f.page),/connexion du compte e2e/);
    assert.equal(f.appels.filter(x=>x.type==='verify').length,1);
    assert.deepEqual(f.attentes,[]);assert.deepEqual(f.sessions,[]);
  }
});
test('session d’un autre compte ou sans bearer : refus avant mémorisation',async()=>{
  for(const item of [{uid:AUTRE,token:'session-synthetique'},{uid:UID,token:''}]){
    const f=fixture([item]);await assert.rejects(f.helper.creerCompteE2E(f.page),/connexion du compte e2e/);
    assert.deepEqual(f.sessions,[]);assert.equal(f.appels.filter(x=>x.type==='verify').length,1);
  }
});

function membre({status=201,rows,readStatus=200}={}){
  const calls=[];let ligne;
  // Exercer le transport réel de la suite, y compris sa projection {status,body}.
  const spec=fs.readFileSync(new URL('../e2e/irl-trust-safety-reel.spec.js',import.meta.url),'utf8');
  const debut=spec.indexOf('    const rest = '),fin=spec.indexOf('    const rpc = ',debut);
  assert.ok(debut>=0&&fin>debut,'transport réel introuvable');
  const browser=vm.createContext({window:{PASSIO_SUPABASE:{url:'https://synthetique.invalid',anon:'anon-synthetique'}},fetch:async(url,options={})=>{
    assert.equal(options.headers.Authorization,'Bearer jwt-acteur-synthetique');
    const table=url.slice('https://synthetique.invalid/rest/v1/'.length);calls.push({table,options});
    if(options.method==='POST'){
      assert.equal(table,'conv_members?on_conflict=conv_id,user_id');
      assert.match(options.headers.Prefer,/(^|,)\s*resolution=ignore-duplicates(,|$)/);
      ligne=JSON.parse(options.body);return {status,json:async()=>null};
    }
    assert.equal(table,'conv_members?conv_id=eq.conv_fixture&user_id=eq.'+AUTRE+'&select=conv_id,user_id');
    return {status:readStatus,json:async()=>rows===undefined?[ligne]:rows};
  }});
  const transport=vm.createContext({page:{evaluate:async(fn,args)=>{browser.__args=args;return vm.runInContext('('+fn.toString()+')(__args)',browser);}}});
  vm.runInContext(spec.slice(debut,fin)+';globalThis.transportReel=rest;',transport);
  return {calls,rest:transport.transportReel};
}
test('adhésion de fixture nouvelle ou préexistante : insertion idempotente ET relecture sous le même JWT',async()=>{
  const f=fixture();
  for(const status of [201,200]){
    const b=membre({status});await f.helper.assurerMembreE2E(b.rest,'jwt-acteur-synthetique','conv_fixture',AUTRE);
    assert.equal(b.calls.length,2);assert.deepEqual(JSON.parse(b.calls[0].options.body),{conv_id:'conv_fixture',user_id:AUTRE});
  }
});
test('aucun409/403 ou refus de relecture n’est transformé en succès',async()=>{
  const f=fixture();
  for(const options of [{status:409},{status:403},{readStatus:403},{rows:[]},{rows:[{conv_id:'conv_fixture',user_id:UID}]},{rows:[{conv_id:'autre',user_id:AUTRE}]},{rows:[{conv_id:'conv_fixture',user_id:AUTRE},{conv_id:'conv_fixture',user_id:AUTRE}]},{rows:{error:'synthetique'}}]){
    const b=membre(options);await assert.rejects(f.helper.assurerMembreE2E(b.rest,'jwt-acteur-synthetique','conv_fixture',AUTRE),/adhésion de fixture/);
    assert.equal(b.calls.filter(x=>x.options.method==='POST').length,1);
  }
});
