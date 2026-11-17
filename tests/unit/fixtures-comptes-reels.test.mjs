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

const PAIRE={conv_id:'conv_fixture',user_id:AUTRE};
const JWT='jwt-acteur-synthetique';
function transportIRL(fetchImpl){
  // Exercer le transport réel de la suite, y compris sa projection {status,body}.
  const spec=fs.readFileSync(new URL('../e2e/irl-trust-safety-reel.spec.js',import.meta.url),'utf8');
  const debut=spec.indexOf('    const rest = '),fin=spec.indexOf('    const rpc = ',debut);
  assert.ok(debut>=0&&fin>debut,'transport réel introuvable');
  const browser=vm.createContext({window:{PASSIO_SUPABASE:{url:'https://synthetique.invalid',anon:'anon-synthetique'}},fetch:fetchImpl});
  const transport=vm.createContext({page:{evaluate:async(fn,args)=>{browser.__args=args;return vm.runInContext('('+fn.toString()+')(__args)',browser);}}});
  vm.runInContext(spec.slice(debut,fin)+';globalThis.transportReel=rest;',transport);
  return transport.transportReel;
}
function membre({lectures=[{body:[]},{body:[PAIRE]}],post={status:201}}={}){
  const calls=[];let lecture=0;
  const rest=transportIRL(async(url,options={})=>{
    assert.equal(options.headers.Authorization,'Bearer '+JWT);
    assert.equal(options.headers.apikey,'anon-synthetique');
    const table=url.slice('https://synthetique.invalid/rest/v1/'.length);calls.push({table,options});
    let reponse;
    if(options.method==='POST'){
      assert.equal(table,'conv_members');
      assert.equal(options.headers.Prefer,'return=minimal');
      assert.deepEqual(JSON.parse(options.body),PAIRE);
      reponse=post;
    }else{
      assert.equal(table,'conv_members?conv_id=eq.conv_fixture&user_id=eq.'+AUTRE+'&select=conv_id,user_id');
      assert.ok(lecture<lectures.length,'lecture supplémentaire inattendue');
      reponse=lectures[lecture++];
    }
    if(reponse.exception)throw new Error('transport_synthetique');
    return {status:Object.hasOwn(reponse,'status')?reponse.status:200,json:async()=>{
      if(reponse.jsonInvalide)throw new Error('json_synthetique_invalide');
      return reponse.body??null;
    }};
  });
  return {calls,rest,assurer:()=>fixture().helper.assurerMembreE2E(rest,JWT,PAIRE.conv_id,PAIRE.user_id)};
}
const methodes=b=>b.calls.map(x=>x.options.method||'GET');
const CORPS_INVALIDES=[null,{},'synthetique',[null],[{...PAIRE,user_id:UID}],[{...PAIRE,conv_id:'autre'}],[PAIRE,PAIRE]];
const STATUTS_REFUSES=[401,403,409,429,500,undefined,'200',NaN];

test('adhésion déjà lisible : le couple exact sous le JWT acteur suffit, aucune écriture',async()=>{
  const b=membre({lectures:[{body:[PAIRE]}],post:{status:403}});
  await b.assurer();assert.deepEqual(methodes(b),['GET']);
});

test('premier membre : ancien conflit explicite refusé par SELECT, INSERT simple autorisé au seul créateur',async()=>{
  for(const createur of [true,false]){
    const calls=[];let present=false;
    const rest=transportIRL(async(url,options={})=>{
      assert.equal(options.headers.Authorization,'Bearer '+JWT);
      const table=url.slice('https://synthetique.invalid/rest/v1/'.length);
      if(options.method!=='POST'){
        assert.equal(table,'conv_members?conv_id=eq.conv_fixture&user_id=eq.'+AUTRE+'&select=conv_id,user_id');
        calls.push('GET');return {status:200,json:async()=>present?[PAIRE]:[]};
      }
      assert.deepEqual(JSON.parse(options.body),PAIRE);
      const conflit=table==='conv_members?on_conflict=conv_id,user_id';
      assert.ok(conflit||table==='conv_members');calls.push(conflit?'POST_CONFLIT':'POST_SIMPLE');
      // Catalogue : INSERT autorise le créateur, SELECT exige déjà une adhésion.
      // PostgreSQL applique aussi SELECT à DO NOTHING avec un arbitre explicite.
      if(!createur||(conflit&&!present))return {status:403,json:async()=>null};
      assert.equal(options.headers.Prefer,'return=minimal');
      present=true;return {status:201,json:async()=>null};
    });
    const ancien=await rest(JWT,'conv_members?on_conflict=conv_id,user_id',{
      method:'POST',headers:{Prefer:'return=minimal,resolution=ignore-duplicates'},body:JSON.stringify(PAIRE),
    });
    assert.equal(ancien.status,403);assert.equal(present,false);
    const tentative=fixture().helper.assurerMembreE2E(rest,JWT,PAIRE.conv_id,PAIRE.user_id);
    if(createur){await tentative;assert.equal(present,true);assert.deepEqual(calls,['POST_CONFLIT','GET','POST_SIMPLE','GET']);}
    else{await assert.rejects(tentative,/adhésion de fixture : HTTP 403/);assert.equal(present,false);assert.deepEqual(calls,['POST_CONFLIT','GET','POST_SIMPLE']);}
  }
});

test('adhésion absente : GET puis INSERT simple puis preuve exacte sous le même JWT',async()=>{
  for(const status of [200,201,204]){
    const b=membre({post:{status}});await b.assurer();
    assert.deepEqual(methodes(b),['GET','POST','GET']);
  }
});

test('lecture initiale refusée ou statut malformé : échec sans POST',async()=>{
  for(const status of STATUTS_REFUSES){
    const b=membre({lectures:[{status,body:[]}]});
    await assert.rejects(b.assurer(),/adhésion de fixture/);assert.deepEqual(methodes(b),['GET']);
  }
});

test('lecture initiale malformée, multiple ou divergente : échec sans POST',async()=>{
  for(const reponse of [...CORPS_INVALIDES.map(body=>({body})),{jsonInvalide:true}]){
    const b=membre({lectures:[reponse]});
    await assert.rejects(b.assurer(),/adhésion de fixture/);assert.deepEqual(methodes(b),['GET']);
  }
});

test('aucun refus POST 403/409/429 ou statut malformé ne devient une lecture de récupération',async()=>{
  for(const status of STATUTS_REFUSES){
    const b=membre({post:{status}});
    await assert.rejects(b.assurer(),/adhésion de fixture/);assert.deepEqual(methodes(b),['GET','POST']);
  }
});

test('INSERT accepté sans preuve exacte à la relecture : reste rouge',async()=>{
  const reponses=[...STATUTS_REFUSES.map(status=>({status,body:[PAIRE]})),...CORPS_INVALIDES.map(body=>({body})),{body:[]},{jsonInvalide:true}];
  for(const reponse of reponses){
    const b=membre({lectures:[{body:[]},reponse]});
    await assert.rejects(b.assurer(),/adhésion de fixture/);assert.deepEqual(methodes(b),['GET','POST','GET']);
  }
});

test('course après lecture vide : même si la ligne apparaît, un POST 409 reste rouge',async()=>{
  const b=membre({post:{status:409},lectures:[{body:[]},{body:[PAIRE]}]});
  await assert.rejects(b.assurer(),/adhésion de fixture : HTTP 409/);
  assert.deepEqual(methodes(b),['GET','POST']);
});

test('transport ambigu à chaque étape : échec immédiat, aucune reprise du POST',async()=>{
  for(const [options,attendues] of [
    [{lectures:[{exception:true}]},['GET']],
    [{post:{exception:true}},['GET','POST']],
    [{lectures:[{body:[]},{exception:true}]},['GET','POST','GET']],
  ]){
    const b=membre(options);await assert.rejects(b.assurer(),/^Error: transport_synthetique$/);
    assert.deepEqual(methodes(b),attendues);
  }
});
