// Régression P1 REPRISE-LO-01 : vraie création PG non commitée, lectures MVCC
// vides puis COMMIT tardif. Aucun serveur, table, fonction, Auth ou cloud créés.
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url),R=require('../../scripts/restaurer-donnees.js');
const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?'':args[i+1];};
const database=option('--database'),port=option('--port'),client=option('--psql');
if(database!=='passio_medias_go_20261116_reprise'||port!=='55472'||!path.isAbsolute(client))throw new Error('native_target_refused');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)));
Object.assign(env,{PGPASSFILE:option('--password-file'),PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'});
const base=['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks=[],check=(category,ok)=>{checks.push({category,ok:!!ok});if(!ok)throw new Error('native_check_failed_'+category);};
function sql(query,{db=database,csv=false}={}) {
  const r=spawnSync(client,[...base,...(csv?['--csv']:['-tA']),'-d',db],{env,input:query,encoding:'utf8',windowsHide:true,maxBuffer:1024*1024,timeout:10000});
  if(r.error||r.status!==0)throw new Error('native_sql_failed');return r.stdout.trim();
}
function csvRows(text) {
  if(!text)return [];text=text.replace(/\r\n/g,'\n');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}else cell+=c;}
  row.push(cell);rows.push(row);const headers=rows.shift();
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,h==='passio_lo'?JSON.parse(r[i]):r[i]])));
}
async function until(fn) {const fin=Date.now()+5000;while(!fn()){if(Date.now()>fin)throw new Error('native_handshake_timeout');await new Promise(r=>setTimeout(r,10));}}
const marker='PASSIO reprise ambiguity '+randomUUID(),application='passio_lo_pending_'+randomUUID().replace(/-/g,'');
const dossier=mkdtempSync(path.join(os.tmpdir(),'reprise-lo-ambiguite-native-'));
const ctx={ref:'dddddddddddddddddddd',jeton:'sbp_synthetic',man:{tables:{posts:{}}},journalGrandsObjets:dossier};
const report={kind:'real-postgres-pending-creation-http-double',database,port:Number(port),checks,hardProcessKillCleanup:'NON_MESURE'};
let created=false,pending,finished=false,creationRequests=0,emptyReads=0,insertions=0,fragments=0;
const oldFetch=globalThis.fetch;
try {
  check('endpoint',sql("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=55472 and current_database()='postgres'",{db:'postgres'})==='t');
  check('database_absent',sql(`select not exists(select 1 from pg_database where datname='${database}')`,{db:'postgres'})==='t');
  sql(`create database ${database}`,{db:'postgres'});created=true;
  sql(`comment on database ${database} is '${marker}'`,{db:'postgres'});
  check('client_roles_preexisting',sql("select count(*)=3 from pg_roles where rolname in ('anon','authenticated','service_role')")==='t');
  check('no_business_tables_before',sql("select count(*)=0 from pg_class where relnamespace='public'::regnamespace and relkind='r'")==='t');
  const unrelated=Number(sql('select lo_create(0)'));
  globalThis.fetch=async(url,init)=>{
    if(!String(url).endsWith('/database/query'))throw new Error('native_only_management_double');
    const query=JSON.parse(init.body).query;
    if(query.includes('insert into public.'))insertions++;
    if(query.includes('perform lo_put('))fragments++;
    if(query.includes('perform lo_create(')) {
      creationRequests++;if(creationRequests!==1)throw new Error('native_second_creation_forbidden');
      const child=spawn(client,[...base,'-tA','-d',database],{env:{...env,PGAPPNAME:application},stdio:['pipe','pipe','pipe'],windowsHide:true});
      const state={child,stdout:'',closed:false};pending=state;
      child.stdout.on('data',b=>{state.stdout+=b.toString('utf8');});child.stderr.on('data',()=>{});
      state.done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{state.closed=true;resolve(code);});});
      child.stdin.write(query.replace(/commit;\s*$/,"select 'READY_PENDING_TX';\n"));
      await until(()=>state.stdout.includes('READY_PENDING_TX')||state.closed);
      check('creation_pending_real_transaction',!state.closed&&sql(`select exists(select 1 from pg_stat_activity where application_name='${application}' and state='idle in transaction' and backend_xid is not null)`)==='t');
      // Le transport échoue alors que la transaction serveur reste ouverte.
      throw new Error('owned_transport_lost_before_server_commit');
    }
    const rows=csvRows(sql(query,{csv:true}));
    if(query.includes("'prive'")&&!rows.length)emptyReads++;
    return new Response(JSON.stringify(rows),{status:200});
  };
  let rejected=false;try{await R._phases.insererGrandObjet(ctx,'posts',['id'],'{"id":"synthetic"}',['id']);}catch(e){rejected=/LO_CREATION_AMBIGUE_JOURNAL_/.test(e.message);}
  check('initial_call_indeterminate',rejected);
  const journalFile=path.join(dossier,readdirSync(dossier).find(n=>n.endsWith('.json'))),j=JSON.parse(readFileSync(journalFile,'utf8'));
  check('journal_creation_ambigue',j.etape==='creation_ambigue');
  let absentRefused=false;try{await R._phases.nettoyerGrandObjet(ctx,journalFile);}catch(e){absentRefused=e.message==='LO_CREATION_QUIESCENCE_NON_PROUVEE';}
  check('two_empty_reads_not_quiescence',emptyReads>=2&&absentRefused&&JSON.parse(readFileSync(journalFile)).etape==='creation_ambigue');
  report.emptyReadsBeforeLateCommit=emptyReads;
  check('oid_invisible_before_late_commit',sql(`select not exists(select 1 from pg_largeobject_metadata where oid=${j.oid}::oid)`)==='t');
  pending.child.stdin.end('commit;\n');await until(()=>pending.closed);check('late_server_commit_completed',await pending.done===0);finished=true;
  check('late_oid_now_visible',sql(`select exists(select 1 from pg_largeobject_metadata where oid=${j.oid}::oid)`)==='t');
  const fresh={...ctx,_grandObjetActif:false};
  let nextRefused=false;try{await R._phases.insererGrandObjet(fresh,'posts',['id'],'{"id":"second"}',['id']);}catch(e){nextRefused=e.message==='LO_JOURNAL_EN_ATTENTE_NETTOYAGE';}
  check('new_context_no_second_creation',nextRefused&&creationRequests===1);
  let cleanupBlocked=false;try{await R._phases.nettoyerGrandObjet(fresh,journalFile);}catch(e){cleanupBlocked=e.message==='LO_CREATION_QUIESCENCE_NON_PROUVEE';}
  check('visible_exact_oid_removed_only',sql(`select not exists(select 1 from pg_largeobject_metadata where oid=${j.oid}::oid) and exists(select 1 from pg_largeobject_metadata where oid=${unrelated}::oid)`)==='t');
  check('cleanup_stays_indeterminate',cleanupBlocked&&JSON.parse(readFileSync(journalFile)).etape==='creation_ambigue'&&fresh._grandObjetActif===true);
  check('no_payload_or_business_write',insertions===0&&fragments===0);
  check('no_business_tables_after',sql("select count(*)=0 from pg_class where relnamespace='public'::regnamespace and relkind='r'")==='t');
  sql(`select lo_unlink(${unrelated}::oid)`);
  check('test_lo_residual_zero',sql('select count(*)=0 from pg_largeobject_metadata')==='t');
  report.creationRequests=creationRequests;report.emptyReads=emptyReads;report.sourceSha256=sha(readFileSync(path.join(root,'scripts/restaurer-donnees.js')));
} finally {
  globalThis.fetch=oldFetch;
  if(pending&&!finished&&!pending.closed){pending.child.stdin.end('rollback;\n');await until(()=>pending.closed);}
  if(created) {
    check('cleanup_exact_database',sql(`select shobj_description(oid,'pg_database')='${marker}' and not exists(select 1 from pg_stat_activity where datname='${database}') from pg_database where datname='${database}'`,{db:'postgres'})==='t');
    sql(`drop database ${database}`,{db:'postgres'});
    check('database_residual_zero',sql(`select not exists(select 1 from pg_database where datname='${database}')`,{db:'postgres'})==='t');
  }
  const out=option('--output')||path.join(root,'work/reprise-lo-ambiguite-native.json');
  mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  rmSync(dossier,{recursive:true,force:true});
  console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.ok).length,proofSha256:sha(readFileSync(out))}));
}
