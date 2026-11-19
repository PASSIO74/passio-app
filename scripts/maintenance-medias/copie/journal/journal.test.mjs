// IO, horloges, timers et enfants entièrement doublés. Aucun upload/AGE réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {creerJournalAvecDependances} from './journal.mjs';
import {ACTION_COMMIT,lireAck,sha} from './contrat.mjs';

const NONCE='12345678-1234-4123-8123-123456789abc',DIGEST='d'.repeat(64),S='a'.repeat(64),D='b'.repeat(64),I='c'.repeat(64);
const execution={run_id:'12345',run_attempt:'1',job:'copie_heritage',workflow_ref:'PASSIO74/passio-app/.github/workflows/copie-heritage.yml@refs/heads/main',head:'f'.repeat(40)};
const TRACE={source_fp:S,dest_fp:D};
const p=path.posix;
function environnement(){return {
 GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'PASSIO74/passio-app',GITHUB_ACTOR:'PASSIO74',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:execution.head,GITHUB_RUN_ID:execution.run_id,GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:execution.job,GITHUB_WORKFLOW_REF:execution.workflow_ref,RUNNER_TEMP:'/runner',
 ACTIONS_RUNTIME_TOKEN:'ARTIFACT_RUNTIME_SYNTHETIQUE_123456789',ACTIONS_RESULTS_URL:'https://results-receiver.actions.githubusercontent.com',SUPABASE_ACCESS_TOKEN:'PAT_CANARY_INTERDIT',SUPABASE_SERVICE_ROLE_KEY:'SERVICE_CANARY_INTERDIT',PLAN_PRIVE:'PLAN_CANARY_INTERDIT',NODE_OPTIONS:'NODE_CANARY_INTERDIT',HTTPS_PROXY:'PROXY_CANARY_INTERDIT'
};}
function banc(opts={}){
 const nodes=new Map(),fds=new Map(),calls=[],children=[],timers=new Map(),envReads=[];let nextFd=1,nextTimer=1,remaining=600000,fail=opts.fail;
 const addDir=n=>{if(n==='/'||nodes.has(n))return;addDir(p.dirname(n));nodes.set(n,{kind:'dir'});};
 const put=(n,b)=>{addDir(p.dirname(n));nodes.set(n,{kind:'file',bytes:Buffer.from(b)});};
 addDir('/runner/action/dist/upload');addDir('/runner/action/.git');addDir('/usr/bin');addDir('/node/bin');
 const bundle=Buffer.from('official action double');
 put('/usr/bin/age','synthetic age');put('/usr/bin/git','synthetic git');put('/node/bin/node','synthetic node');put('/runner/action/dist/upload/index.js',bundle);put('/runner/action/.git/HEAD',ACTION_COMMIT+'\n');put('/runner/action/package-lock.json',JSON.stringify({packages:{'node_modules/@actions/artifact':{version:'2.3.2'}}}));
 const missing=()=>{throw Object.assign(Error('DOUBLE_IO'),{code:'ENOENT'});};
 const stat=n=>{const v=nodes.get(n);if(!v)missing();return {size:v.bytes?.length??0,isFile:()=>v.kind==='file',isDirectory:()=>v.kind==='dir',isSymbolicLink:()=>v.kind==='link'};};
 const fault=(op,n)=>{calls.push({op,path:n});if(typeof fail==='function'&&fail(op,n)){throw Error('DOUBLE_IO_REFUSE');}};
 const io={
  lstatSync:stat,realpathSync:n=>{stat(n);return n;},readFileSync:n=>{const v=nodes.get(n);if(v?.kind!=='file')missing();return Buffer.from(v.bytes);},
  mkdirSync:n=>{fault('mkdir',n);if(nodes.has(n))throw Object.assign(Error('DOUBLE_IO'),{code:'EEXIST'});if(!nodes.has(p.dirname(n)))missing();nodes.set(n,{kind:'dir'});},
  openSync:(n,flags)=>{fault('open',n);assert.equal(flags,'wx');if(nodes.has(n))throw Object.assign(Error('DOUBLE_IO'),{code:'EEXIST'});if(!nodes.has(p.dirname(n)))missing();nodes.set(n,{kind:'file',bytes:Buffer.alloc(0)});const fd=nextFd++;fds.set(fd,n);return fd;},
  writeSync:(fd,b,offset,length)=>{const n=fds.get(fd);fault('write',n);const count=Math.min(length,opts.partial?7:length);nodes.get(n).bytes=Buffer.concat([nodes.get(n).bytes,b.subarray(offset,offset+count)]);return count;},
  fsyncSync:fd=>{const n=fds.get(fd);fault('fsync',n);if(opts.expireAtAck&&n.endsWith('/ACK.json'))remaining=0;},
  closeSync:fd=>{const n=fds.get(fd);fds.delete(fd);fault('close',n);}
 };
 const env=new Proxy(environnement(),{get:(o,k)=>{envReads.push(k);return o[k];}});
 function spawn(exe,args,options){
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kills=0;
  const call={exe,args:[...args],options:{...options,env:{...options.env}},child,input:null};children.push(call);
  child.kill=()=>{child.kills++;queueMicrotask(()=>child.emit('close',null,'SIGKILL'));return true;};
  child.stdin.end=input=>{call.input=input?Buffer.from(input):null;queueMicrotask(()=>{
   if(exe==='/usr/bin/git'){child.stdout.emit('data',bundle);child.emit('close',0,null);}
   else if(exe==='/usr/bin/age'){
    if(opts.ageHang)return;
    if(opts.ageFail){child.stderr.emit('data',Buffer.from('AGE_OUTPUT_CANARY'));child.emit('close',1,null);return;}
    child.stdout.emit('data',opts.badCipher?Buffer.from('not age'):Buffer.concat([Buffer.from('age-encryption.org/v1\n'),Buffer.alloc(opts.largeCipher?1048576:160,7)]));child.emit('close',0,null);
   }else{
    if(opts.uploadHang)return;
    const n=children.filter(x=>x.exe==='/node/bin/node').length;
    put(options.env.GITHUB_OUTPUT,opts.output??`artifact-id=${400+n}\nartifact-digest=${DIGEST}\nartifact-url=https://github.com/PASSIO74/passio-app/actions/runs/12345/artifacts/${400+n}\n`);
    child.stdout.emit('data',Buffer.from('UPLOAD_STDOUT_CANARY'));child.stderr.emit('data',Buffer.from('UPLOAD_STDERR_CANARY'));child.emit('close',opts.uploadFail?1:0,null);
   }
  });};return child;
 }
 const deps={fs:io,env,platform:'linux',nodePath:'/node/bin/node',spawn,setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
 const options={repertoire:'/runner/journal',nonce:NONCE,recipient:'age1'+'q'.repeat(58),actionRoot:'/runner/action',agePath:'/usr/bin/age',execution:{...execution},delaiRestant:()=>remaining};
 return {create:()=>creerJournalAvecDependances(options,deps),io,nodes,calls,children,env,envReads,options,deps,setFail:f=>fail=f,setRemaining:v=>remaining=v,fireTimer:()=>{assert.equal(timers.size,1);[...timers.values()][0].fn();}};
}
function intent(j,action,trace={}){j.ajouter({type:'INTENTION',action,phase:'PRINCIPAL',...trace});}
async function until(predicate){for(let i=0;i<20&&!predicate();i++)await Promise.resolve();assert.ok(predicate());}

test('journal complet : write partiel/fsync/close, GET sans ACK, mutation sans ACK fermée',()=>{
 const b=banc({partial:true}),j=b.create();intent(j,'GET_SOURCE',TRACE);assert.equal(j.consommerIntention('GET_SOURCE',TRACE),true);
 const file='/runner/journal/event-00001.json',ops=b.calls.filter(x=>x.path===file).map(x=>x.op);assert.equal(ops[0],'open');assert.ok(ops.filter(x=>x==='write').length>1);assert.deepEqual(ops.slice(-2),['fsync','close']);
 intent(j,'COPY',TRACE);assert.throws(()=>j.consommerIntention('COPY',TRACE),/JOURNAL_INTENTION/);assert.equal(j.valide(),false);assert.equal(b.children.length,0);
});
test('ACK distant + ACK local durables avant mutation ; une clé consommée une seule fois',async()=>{
 const b=banc(),j=b.create(),ack=await j.checkpoint('COPIES',[{action:'COPY',...TRACE}]);assert.equal(ack.id,401);assert.equal(ack.digest,DIGEST);assert.equal(ack.nom,b.children.find(c=>c.exe==='/node/bin/node').options.env.INPUT_NAME);assert.equal(ack.cipher_octets_locaux,182);assert.notEqual(ack.cipher_sha256,DIGEST);
 assert.deepEqual(b.calls.filter(x=>x.path.endsWith('/ACK.json')).map(x=>x.op),['open','write','fsync','close']);
 intent(j,'COPY',TRACE);assert.equal(j.consommerIntention('COPY',TRACE),true);intent(j,'COPY',TRACE);assert.throws(()=>j.consommerIntention('COPY',TRACE));assert.equal(j.valide(),false);
});
test('ticket lié à la cible exacte ; aucun renouvellement de clé de mutation',async()=>{
 const b=banc(),j=b.create();await j.checkpoint('ASSOCIATIONS',[{action:'CAS',...TRACE,identite_fp:I}]);intent(j,'CAS',{...TRACE,identite_fp:'e'.repeat(64)});assert.throws(()=>j.consommerIntention('CAS',{...TRACE,identite_fp:'e'.repeat(64)}));
 const c=banc(),k=c.create();await k.checkpoint('COPIES',[{action:'COPY',...TRACE}]);await assert.rejects(k.checkpoint('COPIES',[{action:'COPY',...TRACE}]));assert.equal(c.children.length,3);assert.equal(k.valide(),false);
});
test('échec write/fsync/close avant checkpoint ou de son intention : zéro AGE/token/upload',async()=>{
 for(const op of ['write','fsync','close']){
  const b=banc(),j=b.create();b.setFail((o,n)=>o===op&&n.endsWith('/event-00001.json'));assert.throws(()=>intent(j,'COPY',TRACE));assert.equal(j.valide(),false);assert.equal(b.children.length,0);assert.ok(!b.envReads.includes('ACTIONS_RUNTIME_TOKEN'));
 }
 const b=banc(),j=b.create();b.setFail((o,n)=>o==='fsync'&&n.endsWith('/INTENTION.json'));await assert.rejects(j.checkpoint('COPIES',[{action:'COPY',...TRACE}]));assert.equal(b.children.length,0);assert.ok(!b.envReads.includes('ACTIONS_RUNTIME_TOKEN'));
});
test('fsync/close ACK local ou échéance après ACK : artefact possible mais zéro autorisation mutante',async()=>{
 for(const op of ['fsync','close']){const b=banc(),j=b.create();b.setFail((o,n)=>o===op&&n.endsWith('/ACK.json'));await assert.rejects(j.checkpoint('COPIES',[{action:'COPY',...TRACE}]));assert.equal(j.valide(),false);assert.throws(()=>intent(j,'COPY',TRACE));assert.equal(b.children.length,3);}
 const b=banc({expireAtAck:true}),j=b.create();await assert.rejects(j.checkpoint('COPIES',[{action:'COPY',...TRACE}]));assert.equal(j.valide(),false);
});
test('timeout upload : enfant tué, poison définitif, aucune seconde tentative SDK',async()=>{
 const b=banc({uploadHang:true}),j=b.create(),promise=j.checkpoint('COPIES',[{action:'COPY',...TRACE}]);await until(()=>b.children.length===3);b.fireTimer();await assert.rejects(promise);assert.equal(j.valide(),false);assert.ok(b.children[2].child.kills>0);await assert.rejects(j.checkpoint('ECHEC',[]));assert.equal(b.children.length,3);
});
test('erreurs/ambiguïtés AGE ou upload : pas de mutation ni nouvel essai',async()=>{
 for(const options of [{ageFail:true},{badCipher:true},{largeCipher:true},{uploadFail:true}]){const b=banc(options),j=b.create();await assert.rejects(j.checkpoint('BUCKET',[{action:'CREER_BUCKET'}]));assert.equal(j.valide(),false);assert.throws(()=>intent(j,'CREER_BUCKET'));assert.equal(b.children.length,options.uploadFail?3:2);}
});
test('enfants fermés : AGE seul reçoit plaintext ; upload seul runtime artifact + cipher, stdout jamais persisté',async()=>{
 const b=banc(),j=b.create();j.ajouter({type:'DEBUT',action:'CATALOGUE'});await j.checkpoint('COPIES',[{action:'COPY',...TRACE}]);
 const age=b.children.find(c=>c.exe==='/usr/bin/age'),up=b.children.find(c=>c.exe==='/node/bin/node');assert.equal(up.input,null);assert.equal(JSON.parse(age.input).evenements.length,1);assert.equal(JSON.parse(age.input).intention.autorisations[0].source_fp,S);
 assert.equal(up.options.env['INPUT_RETENTION-DAYS'],'7');assert.equal(up.options.env['INPUT_COMPRESSION-LEVEL'],'0');assert.equal(up.options.env.INPUT_OVERWRITE,'false');assert.equal(up.options.env['INPUT_IF-NO-FILES-FOUND'],'error');assert.ok(up.options.env.INPUT_PATH.endsWith('/upload/checkpoint.age'));
 for(const child of b.children)for(const key of ['SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','PLAN_PRIVE','NODE_OPTIONS','HTTPS_PROXY'])assert.ok(!Object.hasOwn(child.options.env,key));
 assert.ok(!Object.hasOwn(age.options.env,'ACTIONS_RUNTIME_TOKEN'));assert.equal(up.options.env.ACTIONS_RUNTIME_TOKEN,b.env.ACTIONS_RUNTIME_TOKEN);assert.ok(!JSON.stringify(up).includes('PAT_CANARY_INTERDIT'));
 const all=Buffer.concat([...b.nodes.values()].filter(x=>x.kind==='file').map(x=>x.bytes)).toString('utf8');assert.ok(!all.includes('UPLOAD_STDOUT_CANARY'));assert.ok(!all.includes('UPLOAD_STDERR_CANARY'));assert.ok(!all.includes('ARTIFACT_RUNTIME_SYNTHETIQUE'));
 assert.deepEqual([...b.nodes.keys()].filter(k=>p.dirname(k)===up.options.cwd),[up.options.env.INPUT_PATH,up.options.env.GITHUB_OUTPUT]);
 const report=JSON.stringify(j.rapportPublic());assert.ok(!report.includes(S));assert.ok(!report.includes(DIGEST));assert.ok(!report.includes('/runner'));
});
test('GITHUB_OUTPUT multiline UUID accepté ; champs libres/duplication/URL ou digest ambigus refusés',async()=>{
 const delimiter='ghadelimiter_12345678-1234-4123-8123-123456789abc';const output=`artifact-id<<${delimiter}\n401\n${delimiter}\nartifact-digest<<${delimiter}\n${DIGEST}\n${delimiter}\n`;
 assert.equal(lireAck(Buffer.from(output),execution).id,401);
 for(const bad of [`artifact-id=0\nartifact-digest=${DIGEST}\n`,`artifact-id=401\nartifact-id=402\nartifact-digest=${DIGEST}\n`,`artifact-id=401\nartifact-digest=${DIGEST}\nsecret=free\n`,`artifact-id=401\nartifact-digest=bad\n`,`artifact-id=401\nartifact-digest=${DIGEST}\nartifact-url=https://evil.invalid\n`]){const b=banc({output:bad}),j=b.create();await assert.rejects(j.checkpoint('FIN',[]));assert.equal(j.valide(),false);}
 const b=banc({output}),j=b.create();assert.equal((await j.checkpoint('FIN',[])).id,401);
});
test('8 checkpoints maximum et artefacts distincts, aucun neuvième sous-processus',async()=>{
 const b=banc(),j=b.create();for(let i=0;i<8;i++)await j.checkpoint('FIN',[]);assert.equal(j.rapportPublic().checkpoints_acquittes,8);assert.equal(new Set(b.children.filter(x=>x.exe==='/node/bin/node').map(x=>x.options.env.INPUT_NAME)).size,8);await assert.rejects(j.checkpoint('FIN',[]));assert.equal(b.children.length,24);assert.equal(j.valide(),false);
});
test('snapshot complet vérifie les octets sur disque ; arreter tue le processus et interdit tout IO suivant',async()=>{
 const b=banc(),j=b.create();j.ajouter({type:'DEBUT',action:'CATALOGUE'});b.nodes.get('/runner/journal/event-00001.json').bytes=Buffer.from('altered');await assert.rejects(j.checkpoint('FIN',[]));assert.equal(b.children.length,0);
 const c=banc({ageHang:true}),k=c.create(),pending=k.checkpoint('FIN',[]);await until(()=>c.children.length===2);k.arreter();await assert.rejects(pending);assert.ok(c.children[1].child.kills>0);assert.equal(k.valide(),false);assert.throws(()=>k.ajouter({type:'DEBUT'}));
});
test('configuration/action/runtime fermés ; FIN ne peut accorder COPY, aucun secret lu en amont',async()=>{
 const b=banc();b.nodes.get('/runner/action/.git/HEAD').bytes=Buffer.from('0'.repeat(40));assert.throws(b.create,/ACTION_PIN/);assert.equal(b.children.length,0);
 const c=banc(),j=c.create();await assert.rejects(j.checkpoint('FIN',[{action:'COPY',...TRACE}]));assert.equal(c.children.length,0);assert.ok(!c.envReads.includes('ACTIONS_RUNTIME_TOKEN'));
 const d=banc(),k=d.create();d.env.ACTIONS_RESULTS_URL='https://evil.invalid';await assert.rejects(k.checkpoint('FIN',[]));assert.equal(d.children.length,2);assert.equal(k.valide(),false);
});
test('reçu distant réutilisé et marqueur modifié refusés ; contexte initial ne suit pas un objet appelant mutable',async()=>{
 const output=`artifact-id=401\nartifact-digest=${DIGEST}\n`,b=banc({output}),j=b.create();await j.checkpoint('FIN',[]);await assert.rejects(j.checkpoint('FIN',[]));assert.equal(j.valide(),false);assert.equal(j.rapportPublic().checkpoints_acquittes,1);
 const c=banc(),k=c.create();c.nodes.get('/runner/journal/RUN.json').bytes=Buffer.from('altered');await assert.rejects(k.checkpoint('FIN',[]));assert.equal(c.children.length,0);
 const d=banc(),l=d.create();d.options.execution.head='0'.repeat(40);await l.checkpoint('FIN',[]);assert.equal(JSON.parse(d.children.find(c=>c.exe==='/usr/bin/age').input).execution.head,execution.head);
});
test('bundle changé sous HEAD identique : aucun AGE/upload ni grant ; recontrôle juste avant spawn',async()=>{
 const b=banc(),j=b.create();b.nodes.get('/runner/action/dist/upload/index.js').bytes=Buffer.from('BUNDLE_MODIFIE');await assert.rejects(j.checkpoint('COPIES',[{action:'COPY',...TRACE}]));assert.equal(j.valide(),false);assert.equal(b.children.length,1);assert.equal(b.children[0].exe,'/usr/bin/git');assert.ok(!b.envReads.includes('ACTIONS_RUNTIME_TOKEN'));
 const c=banc(),k=c.create();c.setFail((op,n)=>{if(op==='close'&&n.endsWith('/checkpoint.age'))c.nodes.get('/runner/action/dist/upload/index.js').bytes=Buffer.from('BUNDLE_DERIVE_APRES_AGE');return false;});await assert.rejects(k.checkpoint('COPIES',[{action:'COPY',...TRACE}]));assert.equal(c.children.filter(x=>x.exe==='/node/bin/node').length,0);assert.equal(k.valide(),false);
});
function qualifier(b){b.options.mode='qualification';b.env.GITHUB_EVENT_NAME='pull_request';b.env.GITHUB_REF='refs/pull/123/merge';b.options.execution.workflow_ref='PASSIO74/passio-app/.github/workflows/qualification-copie-medias.yml@refs/pull/123/merge';b.env.GITHUB_WORKFLOW_REF=b.options.execution.workflow_ref;return b;}
test('qualification PR : vrai mécanisme doublé FIN, mais aucun ticket ni checkpoint de mutation',async()=>{
 const b=qualifier(banc()),j=b.create();await j.checkpoint('FIN',[]);assert.equal(j.rapportPublic().mode,'qualification');assert.equal(j.rapportPublic().checkpoints_acquittes,1);
 await assert.rejects(j.checkpoint('COPIES',[{action:'COPY',...TRACE}]));assert.equal(b.children.length,3);assert.equal(j.valide(),false);
 const c=qualifier(banc()),k=c.create();await assert.rejects(k.checkpoint('BUCKET',[]));assert.equal(c.children.length,0);
 const d=qualifier(banc()),l=d.create();intent(l,'COPY',TRACE);assert.throws(()=>l.consommerIntention('COPY',TRACE));assert.equal(d.children.length,0);
});
test('qualification : autre acteur, tentative, workflow, événement ou ref refusés avant enfant',()=>{
 for(const changer of [b=>b.env.GITHUB_ACTOR='AUTRE',b=>{b.options.execution.run_attempt='2';b.env.GITHUB_RUN_ATTEMPT='2';},b=>b.env.GITHUB_REF='refs/heads/feature',b=>b.env.GITHUB_EVENT_NAME='pull_request_target',b=>b.env.GITHUB_WORKFLOW_REF='PASSIO74/passio-app/.github/workflows/autre.yml@refs/pull/123/merge']){const b=qualifier(banc());changer(b);assert.throws(b.create);assert.equal(b.children.length,0);assert.ok(!b.envReads.includes('ACTIONS_RUNTIME_TOKEN'));}
});
