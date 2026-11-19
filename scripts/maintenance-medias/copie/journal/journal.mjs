// Journal générique Linux. Importer ce module n'ouvre aucun fichier/secret/processus.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ACTION_COMMIT,UUID,sha,refuser,exacte,validerEvent,traceEvent,cleIntention,validerAutorisations,MUTATIONS,lireAck} from './contrat.mjs';

const p=path.posix,MAX_CIPHER=1048576;
const natives={fs,spawn,env:process.env,platform:process.platform,nodePath:process.execPath,setTimeout,clearTimeout};
export function creerJournal(options){return creerJournalAvecDependances(options,natives);}

// Point d'injection explicite des tests : aucune dépendance injectée par JSON/CLI.
export function creerJournalAvecDependances(options,d){
 const {repertoire,nonce,recipient,actionRoot,agePath,execution:executionBrute,delaiRestant}=options;
 const execution=Object.freeze({...executionBrute});
 const mode=options.mode??'production';if(!['production','qualification'].includes(mode))refuser('JOURNAL_CONFIGURATION');
 const io=d.fs,env=d.env;
 if(d.platform!=='linux'||typeof delaiRestant!=='function'||typeof recipient!=='string'||!/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(recipient)||!UUID.test(nonce||'')||agePath!=='/usr/bin/age')refuser('JOURNAL_CONFIGURATION');
 exacte(execution,['run_id','run_attempt','job','workflow_ref','head']);
 if(!/^[1-9][0-9]{0,19}$/.test(execution.run_id||'')||!/^[1-9][0-9]{0,3}$/.test(execution.run_attempt||'')||execution.job!=='copie_heritage'||mode==='production'&&!/^PASSIO74\/passio-app\/\.github\/workflows\/[a-z0-9_-]+\.yml@refs\/heads\/main$/.test(execution.workflow_ref||'')||!/^[0-9a-f]{40}$/.test(execution.head||''))refuser('JOURNAL_CONFIGURATION');
 let event='workflow_dispatch',ref='refs/heads/main';
 if(mode==='qualification'){
  event=env.GITHUB_EVENT_NAME;ref=env.GITHUB_REF;
  if(execution.run_attempt!=='1'||!(event==='workflow_dispatch'&&ref==='refs/heads/main'||event==='pull_request'&&/^refs\/pull\/[1-9][0-9]*\/merge$/.test(ref||''))||execution.workflow_ref!==`PASSIO74/passio-app/.github/workflows/qualification-copie-medias.yml@${ref}`)refuser('JOURNAL_CONTEXTE');
 }
 const expected={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'PASSIO74/passio-app',GITHUB_EVENT_NAME:event,GITHUB_REF:ref,GITHUB_RUN_ID:execution.run_id,GITHUB_RUN_ATTEMPT:execution.run_attempt,GITHUB_JOB:execution.job,GITHUB_WORKFLOW_REF:execution.workflow_ref,GITHUB_SHA:execution.head,...(mode==='qualification'?{GITHUB_ACTOR:'PASSIO74'}:{})};
 const contexte=()=>{if(Object.entries(expected).some(([k,v])=>env[k]!==v))refuser('JOURNAL_CONTEXTE');};contexte();
 const temp=env.RUNNER_TEMP;
 const absolu=x=>typeof x==='string'&&p.isAbsolute(x)&&p.resolve(x)===x&&/^[A-Za-z0-9_./-]+$/.test(x);
 if(!absolu(temp)||!absolu(repertoire)||!absolu(actionRoot)||!absolu(d.nodePath))refuser('JOURNAL_CHEMIN');
 const enfant=(root,x)=>{const rel=p.relative(root,x);return rel!==''&&!rel.startsWith('../')&&rel!=='..'&&!p.isAbsolute(rel);};
 if(!enfant(temp,repertoire)||!enfant(temp,actionRoot))refuser('JOURNAL_CHEMIN');
 function ordinaire(file,kind){const st=io.lstatSync(file);if(st.isSymbolicLink()||!st[kind]()||io.realpathSync(file)!==file)refuser('JOURNAL_CHEMIN');return st;}
 function ascendants(file){let current=temp;ordinaire(current,'isDirectory');for(const part of p.relative(temp,file).split('/').filter(Boolean)){current=p.join(current,part);ordinaire(current,'isDirectory');}}
 ascendants(p.dirname(repertoire));ascendants(actionRoot);ordinaire(agePath,'isFile');ordinaire('/usr/bin/git','isFile');ordinaire(d.nodePath,'isFile');
 const entry=p.join(actionRoot,'dist/upload/index.js');ascendants(p.dirname(entry));ordinaire(entry,'isFile');
 const lireBorne=(file,max)=>{const st=ordinaire(file,'isFile');if(st.size>max)refuser('JOURNAL_BORNE');const b=io.readFileSync(file);if(b.length!==st.size||b.length>max)refuser('JOURNAL_BORNE');return b;};
 if(lireBorne(p.join(actionRoot,'.git/HEAD'),128).toString('utf8').trim()!==ACTION_COMMIT)refuser('ACTION_PIN');
 const lock=JSON.parse(lireBorne(p.join(actionRoot,'package-lock.json'),2097152));
 if(lock?.packages?.['node_modules/@actions/artifact']?.version!=='2.3.2')refuser('ACTION_PIN');
 io.mkdirSync(repertoire,{mode:0o700});ordinaire(repertoire,'isDirectory');
 let invalide=false,busy=false,sequence=0,precedent='0'.repeat(64),intention=null,checkpoints=0;
 let grants=new Set();const seenGrants=new Set(),records=[],acks=[],active=new Map();
 function empoisonner(){invalide=true;grants.clear();intention=null;for(const cancel of [...active.values()])cancel();}
 function garde(){if(invalide)refuser('JOURNAL_EMPOISONNE');contexte();const ms=delaiRestant();if(!Number.isFinite(ms)||ms<1)refuser('CHECKPOINT_DELAI');return Math.floor(ms);}
 function sauver(file,b){
  let fd,error;
  try{fd=io.openSync(file,'wx',0o600);let n=0;while(n<b.length){const k=io.writeSync(fd,b,n,b.length-n);if(!Number.isInteger(k)||k<1||k>b.length-n)refuser('JOURNAL_ECRITURE');n+=k;}io.fsyncSync(fd);}catch(e){error=e;}
  try{if(fd!==undefined)io.closeSync(fd);}catch(e){error??=e;}
  if(error)refuser('JOURNAL_PERSISTANCE');
 }
 const json=b=>Buffer.from(JSON.stringify(b)+'\n');
 const marqueur=json({format:'passio-journal-checkpoint/1',mode,nonce_fp:sha(nonce),execution,anti_troncature:false});
 function verifierDisque(){
  ordinaire(repertoire,'isDirectory');
  if(!lireBorne(p.join(repertoire,'RUN.json'),4096).equals(marqueur))refuser('JOURNAL_DERIVE');
  for(let i=0;i<records.length;i++)if(!lireBorne(p.join(repertoire,`event-${String(i+1).padStart(5,'0')}.json`),4096).equals(records[i]))refuser('JOURNAL_DERIVE');
 }
 try{sauver(p.join(repertoire,'RUN.json'),marqueur);}catch{empoisonner();refuser('JOURNAL_PERSISTANCE');}
 function ajouter(event){
  try{garde();if(busy)refuser('CHECKPOINT_EN_COURS');validerEvent(event);if(sequence>=1000)refuser('JOURNAL_BORNE');ordinaire(repertoire,'isDirectory');
   const record={sequence:sequence+1,precedent,nonce_fp:sha(nonce),...event},b=json(record);if(b.length>4096)refuser('JOURNAL_BORNE');
   sauver(p.join(repertoire,`event-${String(sequence+1).padStart(5,'0')}.json`),b);garde();
   records.push(b);sequence++;precedent=sha(b);intention=event.type==='INTENTION'?cleIntention(event.action,traceEvent(event)):null;
   return Object.freeze({durable:true,sequence,empreinte:precedent});
  }catch{empoisonner();refuser('JOURNAL_PERSISTANCE');}
 }
 function consommerIntention(action,trace={}){
  try{garde();if(busy)refuser('CHECKPOINT_EN_COURS');const key=cleIntention(action,trace);if(key!==intention)refuser('JOURNAL_INTENTION');
   if(MUTATIONS.includes(action)){if(!grants.has(key))refuser('ACK_MUTATION_ABSENT');grants.delete(key);}
   intention=null;return true;
  }catch{empoisonner();refuser('JOURNAL_INTENTION');}
 }
 function enfantFerme(executable,args,{cwd,childEnv,input,cap,timeout,avantSpawn}){
  garde();return new Promise((resolve,reject)=>{
   let child,timer,done=false,size=0;const stdout=[];
   const finish=(error)=>{if(done)return;done=true;if(timer!==undefined)d.clearTimeout(timer);if(child)active.delete(child);if(error){try{child?.kill('SIGKILL');}catch{}reject(Object.assign(Error('CHECKPOINT_PROCESSUS'),{code:'CHECKPOINT_PROCESSUS'}));}else resolve(Buffer.concat(stdout));};
   try{
    avantSpawn?.();child=d.spawn(executable,args,{cwd,env:childEnv,stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true});
    active.set(child,()=>finish(true));
    child.stdout.on('data',b=>{try{garde();const x=Buffer.from(b);size+=x.length;if(size>cap)throw Error();stdout.push(x);}catch{finish(true);}});
    child.stderr.on('data',b=>{size+=Buffer.byteLength(b);if(size>cap)finish(true);});
    child.on('error',()=>finish(true));child.on('close',(code,signal)=>finish(code!==0||signal!==null&&signal!==undefined||invalide));
    child.stdin.on('error',()=>finish(true));
    timer=d.setTimeout(()=>finish(true),Math.min(timeout,garde()));
    if(input)child.stdin.end(input);else child.stdin.end();
   }catch{finish(true);}
  });
 }
 function uploadEnv(dir,output,name,cipher){
  // Cette lecture paresseuse vient après intention durable et ciphertext écrit.
  const token=env.ACTIONS_RUNTIME_TOKEN,results=env.ACTIONS_RESULTS_URL;
  if(typeof token!=='string'||token.length<32||token.length>16384||/[\r\n\0]/.test(token)||typeof results!=='string'||results.length>2048)refuser('RUNTIME_FORME');
  let u;try{u=new URL(results);}catch{refuser('RUNTIME_FORME');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||!(u.hostname==='results-receiver.actions.githubusercontent.com'||u.hostname.endsWith('.actions.githubusercontent.com')))refuser('RUNTIME_FORME');
  return {ACTIONS_RUNTIME_TOKEN:token,ACTIONS_RESULTS_URL:results,GITHUB_WORKSPACE:dir,GITHUB_SERVER_URL:'https://github.com',GITHUB_REPOSITORY:'PASSIO74/passio-app',GITHUB_RUN_ID:execution.run_id,
   GITHUB_OUTPUT:output,PATH:`${p.dirname(d.nodePath)}:/usr/bin:/bin`,HOME:dir,TMPDIR:dir,
   INPUT_NAME:name,INPUT_PATH:cipher,'INPUT_IF-NO-FILES-FOUND':'error','INPUT_RETENTION-DAYS':'7','INPUT_COMPRESSION-LEVEL':'0',INPUT_OVERWRITE:'false','INPUT_INCLUDE-HIDDEN-FILES':'false'};
 }
 async function checkpoint(categorie,autorisations=[]){
  let plain;
  try{
   garde();if(busy)refuser('CHECKPOINT_EN_COURS');if(checkpoints>=8)refuser('CHECKPOINT_BORNE');
   const auth=validerAutorisations(categorie,autorisations),keys=auth.map(a=>cleIntention(a.action,traceEvent(a)));
   if(mode==='qualification'&&(!['FIN','ECHEC'].includes(categorie)||auth.length!==0))refuser('QUALIFICATION_SANS_MUTATION');
   if(keys.some(k=>seenGrants.has(k)))refuser('CHECKPOINT_DOUBLON');busy=true;grants.clear();checkpoints++;
   verifierDisque();const dir=p.join(repertoire,`checkpoint-${String(checkpoints).padStart(2,'0')}`);io.mkdirSync(dir,{mode:0o700});ordinaire(dir,'isDirectory');
   const intent={format:'passio-checkpoint-intention/1',categorie,numero:checkpoints,chaine:precedent,sequence,autorisations:auth};
   sauver(p.join(dir,'INTENTION.json'),json(intent));garde();
   // Lie le bundle de travail à l'objet du commit immuable, sans réseau ni token.
   const expectedBundle=await enfantFerme('/usr/bin/git',['--no-pager','-C',actionRoot,'show','--no-ext-diff','--no-textconv',`${ACTION_COMMIT}:dist/upload/index.js`],
    {cwd:dir,childEnv:{PATH:'/usr/bin:/bin',HOME:dir,TMPDIR:dir,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_NO_REPLACE_OBJECTS:'1'},input:null,cap:33554432,timeout:15000});
   if(expectedBundle.length===0)refuser('ACTION_PIN');const bundleSha=sha(expectedBundle);
   const verifierBundle=()=>{garde();if(sha(lireBorne(entry,33554432))!==bundleSha)refuser('ACTION_PIN');};verifierBundle();
   plain=json({format:'passio-checkpoint-chiffre/1',mode,nonce_fp:sha(nonce),execution,intention:intent,evenements:records.map(b=>JSON.parse(b)),acks_precedents:acks});
   if(plain.length>MAX_CIPHER-8192)refuser('CHECKPOINT_BORNE');
   const encrypted=await enfantFerme(agePath,['--encrypt','--recipient',recipient],{cwd:dir,childEnv:{PATH:'/usr/bin:/bin',HOME:dir,TMPDIR:dir,LANG:'C.UTF-8'},input:plain,cap:MAX_CIPHER,timeout:30000});
   plain.fill(0);plain=null;garde();
   if(encrypted.length<80||encrypted.length>MAX_CIPHER||!encrypted.subarray(0,22).equals(Buffer.from('age-encryption.org/v1\n')))refuser('CHIFFREMENT_FORME');
   // Le workspace du sous-processus ne contient ni intention ni journal clair.
   const uploadDir=p.join(dir,'upload');io.mkdirSync(uploadDir,{mode:0o700});ordinaire(uploadDir,'isDirectory');
   const cipher=p.join(uploadDir,'checkpoint.age'),output=p.join(uploadDir,'GITHUB_OUTPUT');sauver(cipher,encrypted);sauver(output,Buffer.alloc(0));garde();
   const name=`passio-journal-${mode}-${execution.run_id}-${execution.run_attempt}-${sha(nonce).slice(0,16)}-${checkpoints}`;
   verifierBundle();
   const childEnv=uploadEnv(uploadDir,output,name,cipher);
   await enfantFerme(d.nodePath,[entry],{cwd:uploadDir,childEnv,input:null,cap:2097152,timeout:30000,avantSpawn:verifierBundle});garde();
   const ack=lireAck(lireBorne(output,4096),execution);if(acks.some(a=>a.id===ack.id))refuser('ACK_REUTILISE');
   const rec={categorie,numero:checkpoints,nom:name,id:ack.id,digest:ack.digest,cipher_octets_locaux:encrypted.length,cipher_sha256:sha(encrypted),sequence,chaine:precedent};
   sauver(p.join(dir,'ACK.json'),json(rec));garde();acks.push(Object.freeze(rec));for(const k of keys)seenGrants.add(k);grants=new Set(keys);busy=false;
   return Object.freeze({...rec});
  }catch{empoisonner();refuser('CHECKPOINT_REFUSE');}
  finally{plain?.fill(0);busy=false;}
 }
 return Object.freeze({repertoire,nonce_fp:sha(nonce),ajouter,checkpoint,consommerIntention,valide:()=>!invalide,arreter:empoisonner,empoisonner,
  rapportPublic:()=>({format:'passio-journal-public/1',mode,valide:!invalide,evenements:sequence,checkpoints_tentes:checkpoints,checkpoints_acquittes:acks.length,artefacts:acks.map(a=>({categorie:a.categorie,id:a.id})),reprise_automatique:false})});
}
