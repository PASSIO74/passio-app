import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {chargerFonction} from './lib/executer-fonction.mjs';
import {parse} from './lib/yaml-mini.mjs';
import {evaluer} from './lib/expression-github.mjs';
import {createPrivateMediaHandler} from '../../supabase/functions/_shared/medias-proteges.js';
import {createSupabaseMediaDependencies} from '../../supabase/functions/_shared/medias-proteges-supabase.js';
import {verifierMediaPrive} from '../../scripts/fumee-private-media.mjs';
const SOURCE=fs.readFileSync('supabase/functions/private-media/index.ts','utf8');
const REVISION='1'.repeat(40),BASE='https://fcksxofaelcdmmifnwjo.supabase.co';
async function load({missing=false,active=false,user=false,session=false}={}){
  const calls=[];
  const createClient=(url,key,options)=>{calls.push({kind:'client',url,key,options});return{
    auth:{getUser:async token=>{calls.push({kind:'verify',token});return{data:{user:user?{id:'11111111-1111-4111-8111-111111111111'}:null},error:null};}},
    rpc:name=>({abortSignal:async()=>{calls.push({kind:'rpc',name});return{data:name==='media_proteges_actifs'?active:session,error:null};}}),
  };};
  const config={SUPABASE_URL:BASE,SUPABASE_ANON_KEY:'SYNTHETIC_ANON',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_SERVICE'};
  const handler=await chargerFonction(SOURCE,{env:n=>missing?undefined:config[n],modules:{
    'https://esm.sh/@supabase/supabase-js@2.118.0':{createClient},
    '../_shared/medias-proteges.js':{createPrivateMediaHandler},
    '../_shared/medias-proteges-supabase.js':{createSupabaseMediaDependencies:args=>{
      assert.equal(args.serviceKey,'SYNTHETIC_SERVICE');return createSupabaseMediaDependencies({...args,fetchImpl:()=>{throw Error('NETWORK_FORBIDDEN');}});
    }},
    '../_shared/revision.js':{REVISION},
  }});return{handler,calls};
}
test('vrai index : capabilities désactivées et cinq probes sans données ni réseau',async()=>{
  const {handler,calls}=await load();let n=0;
  const result=await verifierMediaPrive({baseUrl:BASE,revision:REVISION,fetchFn:(url,init)=>{n++;return handler(new Request(url,init));}});
  assert.equal(result.status,'PRIVATE_MEDIA_PREPARATION_VERIFIED');assert.equal(n,5);
  assert.equal(result.uploads_enabled,false);assert.equal(calls.filter(c=>c.kind==='rpc').length,2);
  assert.ok(calls.filter(c=>c.kind==='client').every(c=>c.key==='SYNTHETIC_ANON'&&!Object.values(c.options.global.headers).includes('SYNTHETIC_SERVICE')));
});
test('JWT fourni invalide : aucun repli anon, vérification utilisateur requise',async()=>{
  const {handler,calls}=await load();const r=await handler(new Request(BASE+'/functions/v1/private-media/capabilities',{headers:{Authorization:'Bearer x.y.z'}}));
  assert.equal(r.status,401);assert.equal(await r.text(),'');assert.equal(calls.filter(c=>c.kind==='verify').length,1);assert.equal(calls.filter(c=>c.kind==='rpc').length,0);
});
test('session révoquée : même un getUser valide ne suffit pas',async()=>{
  const {handler,calls}=await load({user:true,session:false});const r=await handler(new Request(BASE+'/functions/v1/private-media/capabilities',{headers:{Authorization:'Bearer x.y.z'}}));
  assert.equal(r.status,401);assert.deepEqual(calls.filter(c=>c.kind==='rpc').map(c=>c.name),['media_session_active']);
});
test('configuration absente : 503, révision et journaux fermés',async()=>{
  const previous=console.warn,logs=[];console.warn=x=>logs.push(JSON.parse(x));
  try{const {handler,calls}=await load({missing:true});const r=await handler(new Request(BASE+'/functions/v1/private-media/capabilities'));
    assert.equal(r.status,503);assert.equal(r.headers.get('X-Passio-Revision'),REVISION);assert.equal(await r.text(),'');assert.deepEqual(calls,[]);
    assert.deepEqual(logs,[{event:'private_media_unavailable',status:503}]);
  }finally{console.warn=previous;}
});
test('la fumée refuse activation prématurée, mauvaise révision ou cache permissif',async()=>{
  const {handler}=await load({active:true});await assert.rejects(verifierMediaPrive({baseUrl:BASE,revision:REVISION,fetchFn:(u,i)=>handler(new Request(u,i))}));
  for(const change of [r=>r.headers.set('X-Passio-Revision','2'.repeat(40)),r=>r.headers.delete('Cache-Control')]){
    const {handler:h}=await load();await assert.rejects(verifierMediaPrive({baseUrl:BASE,revision:REVISION,fetchFn:async(u,i)=>{const r=await h(new Request(u,i));change(r);return r;}}));
  }
});
test('la fumée refuse cible libre et surplus de contenu public avant de qualifier',async()=>{
  let calls=0;await assert.rejects(verifierMediaPrive({baseUrl:'https://outside.invalid',revision:REVISION,fetchFn:()=>{calls++;}}));assert.equal(calls,0);
  const headers={'Cache-Control':'no-store','CDN-Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Passio-Revision':REVISION};
  await assert.rejects(verifierMediaPrive({baseUrl:BASE,revision:REVISION,fetchFn:async()=>new Response('x'.repeat(8193),{headers})}));
});
test('cible Edge : seuls deux couples fixes, staging seulement sur demande manuelle',()=>{
  const w=parse(fs.readFileSync('.github/workflows/edge-functions.yml','utf8'));
  const expr=x=>x.slice(3,-2).trim();
  for(const [event,target,ref]of[['push',undefined,'njkiyoklssvefstljemx'],['workflow_dispatch','production','njkiyoklssvefstljemx'],['workflow_dispatch','staging','fcksxofaelcdmmifnwjo'],['push','staging','njkiyoklssvefstljemx']]){
    const c={github:{event_name:event,event:{inputs:{cible:target}}}};
    assert.equal(evaluer(expr(w.env.PROJECT_REF),c),ref);assert.equal(evaluer(expr(w.env.SUPABASE_URL),c),'https://'+ref+'.supabase.co');
  }
  assert.deepEqual(w.on.workflow_dispatch.inputs.cible.options,['production','staging']);
  const guard=w.jobs.deployer.steps.find(s=>String(s.name).startsWith('Cible —'));
  assert.ok(guard);assert.ok(w.jobs.deployer.steps.indexOf(guard)<w.jobs.deployer.steps.findIndex(s=>s.env?.SUPABASE_ACCESS_TOKEN));
  for(const [target,event,status]of[['','push',0],['','workflow_dispatch',1],['production','workflow_dispatch',0],['staging','workflow_dispatch',0],['staging','push',1],['other','workflow_dispatch',1],['staging;echo injected','workflow_dispatch',1]]){
    const r=runBash(guard.run,{ENTREE_CIBLE:target,GITHUB_EVENT_NAME:event});
    assert.equal(r.status,status,r.stderr);assert.doesNotMatch(r.stdout,/^injected$/m);
  }
});

function runBash(script, variables) {
  const env = { PATH: process.env.PATH, ...variables };
  for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync('bash', ['--noprofile', '--norc', '-c', script], {
    env, encoding: 'utf8', windowsHide: true, timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
}

test('la commande de déploiement réserve la vérification JWT dans le handler au seul private-media', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/edge-functions.yml', 'utf8'));
  const deploy = workflow.jobs.deployer.steps.find(step => step.name === 'Déployer');
  // CLI synthétique, aucun exécutable ni secret de déploiement accessible dans ce shell.
  const local = 'PATH=/nonexistent\nsupabase() { printf "CLI %s\\n" "$*"; }\n' + deploy.run;
  const result = runBash(local, { PROJECT_REF: 'fixture', SUPABASE_ACCESS_TOKEN: 'fixture', GITHUB_ENV: '/dev/null' });
  assert.equal(result.status, 0, result.stderr);
  const calls = result.stdout.split(/\r?\n/).filter(line => line.startsWith('CLI '));
  const functions = Object.keys(JSON.parse(fs.readFileSync('.passio/deploiement/prerequis-fonctions.json', 'utf8')).fonctions);
  assert.deepEqual(calls.sort(), functions.map(name =>
    'CLI functions deploy ' + name + ' --project-ref fixture --yes' + (name === 'private-media' ? ' --no-verify-jwt' : '')
  ).sort());
});
