// PostgreSQL NATIF exclusivement ; hote fixe loopback, base jetable nommee, jamais DATABASE_URL.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const i=args.indexOf(name); return i<0 ? fallback : args[i+1]; };
const database=option('--database',''), port=option('--port',''), client=option('--psql','psql');
if (!/^passio_medias_go_\d{8}(?:_[a-z0-9_]+)?$/.test(database) || !/^\d{4,5}$/.test(port) || Number(port)>65535) throw new Error('native_target_refused');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/i.test(key)));
env.PGTZ='UTC'; // Timestamp sans fuseau des sources : meme horloge/fuseau que Supabase, sans ALTER du cluster partage.
const passwordFile=option('--password-file','');
if(passwordFile) env.PGPASSFILE=passwordFile; // libpq lit uniquement le fichier local fourni ; jamais lu/imprime par ce banc.
const base=['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-tAq','-F','|','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'];
const out=path.join(root,'work','medias-proteges-native'); mkdirSync(out,{recursive:true});
function sql(text,{failure=false}={}) {
  const result=spawnSync(client,base,{env,input:'set client_min_messages=warning;\n'+text.replace(/\r\n/g,'\n'),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if(result.error) throw result.error;
  if(result.status!==0&&!failure) {
    writeFileSync(path.join(out,'erreur-locale.txt'),result.stderr||'');
    throw new Error('native_sql_failed_status_'+result.status+'; detail prive dans work/medias-proteges-native/erreur-locale.txt');
  }
  return {status:result.status,text:(result.stdout||'').trim(),error:result.stderr||''};
}
function expand(file,visited=new Set()) {
  const absolute=path.resolve(file);
  if(visited.has(absolute)) throw new Error('fixture_include_cycle');
  const next=new Set(visited);next.add(absolute);
  return readFileSync(absolute,'utf8').replace(/\r\n/g,'\n').split('\n').map(line=>{
    const match=/^\s*\\ir\s+(.+?)\s*$/.exec(line);
    return match?expand(path.resolve(path.dirname(absolute),match[1]),next):line;
  }).join('\n');
}
const migration=readFileSync(path.join(root,'migrations/migration_medias_proteges_go_2026-11-16.sql'),'utf8').replace(/\r\n/g,'\n');
const report={kind:'native-local-synthetic',database,port:Number(port),migrationSha256:createHash('sha256').update(migration).digest('hex'),concurrency:[]};
report.version=sql('select version()').text.split(',')[0];
const tables=Number(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'").text);
if(tables) {
  if(!args.includes('--rebuild-fixture')||sql("select to_regclass('banc_medias.resultats') is not null").text!=='t') throw new Error('nonempty_local_database_refused');
  // Cette destruction exige opt-in, cible loopback nommee et marqueur de NOS fixtures.
  sql('drop publication if exists supabase_realtime; drop schema banc_medias,public,auth,storage,realtime,extensions,net,cron,vault cascade; create schema public;');
}
sql(expand(path.join(root,'tests/sql/fixtures/medias-proteges-socle.sql')));
const original=sql("select pg_get_functiondef('public.quota_stockage_ok()'::regprocedure)").text;
if(!original.includes("interval '1 hour'")) throw new Error('literal_mutation_anchor_absent');
sql(original.replace("interval '1 hour'","interval '2 hours'"));
const refused=sql(migration,{failure:true});
report.prerequisiteMutationRefused=refused.status!==0&&sql("select to_regclass('public.media_assets') is null").text==='t';
if(!report.prerequisiteMutationRefused) throw new Error('prerequisite_mutation_not_detected');
sql(original);
sql('create policy fixture_unreviewed_source on public.posts for select to anon using(true);');
const refusedAcl=sql(migration,{failure:true});
report.sourceAclMutationRefused=refusedAcl.status!==0&&sql("select to_regclass('public.media_assets') is null").text==='t';
sql('drop policy fixture_unreviewed_source on public.posts;');
if(!report.sourceAclMutationRefused) throw new Error('source_acl_mutation_not_detected');
sql('create table public.media_assets(id uuid);');
const refusedCollision=sql(migration,{failure:true});
report.collisionMutationRefused=refusedCollision.status!==0&&sql("select to_regclass('public.media_objects') is null and not exists(select 1 from storage.buckets where id='content-protected')").text==='t';
sql('drop table public.media_assets;');
if(!report.collisionMutationRefused) throw new Error('collision_mutation_not_detected');
const originalFlag = sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.reglages_distants'::regclass and conname='reglages_distants_cle_check'").text;
sql("alter table public.reglages_distants drop constraint reglages_distants_cle_check; alter table public.reglages_distants add constraint reglages_distants_cle_check check(true);");
report.flagAuthorityMutationRefused=sql(migration,{failure:true}).status!==0&&sql("select to_regclass('public.media_assets') is null").text==='t';
sql('alter table public.reglages_distants drop constraint reglages_distants_cle_check; alter table public.reglages_distants add constraint reglages_distants_cle_check '+originalFlag+';');
if(!report.flagAuthorityMutationRefused) throw new Error('flag_authority_mutation_not_detected');
for(const phase of ['application','rejeu']) {
  const result=sql(migration);
  if(!result.text.split('\n').some(line=>line.endsWith('|OK'))) throw new Error('migration_verdict_missing_'+phase);
  report[phase]=true;
}
sql(readFileSync(path.join(root,'tests/sql/fixtures/medias-proteges-cas.sql'),'utf8'));
sql(readFileSync(path.join(root,'tests/sql/fixtures/medias-proteges-p1.sql'),'utf8'));
const [cases,failed]=sql('select count(*),count(*) filter(where not ok) from banc_medias.resultats').text.split('|').map(Number);
report.cases=cases;report.failed=failed;
if(cases<180||failed) throw new Error('native_cases_incomplete_or_red');

const uid='00000000-0000-4000-8000-000000000006';
const claims=JSON.stringify({sub:uid,role:'authenticated',session_id:'10000000-0000-4000-8000-000000000006'});
const spec='[{"variant":"original","mime_type":"image/webp","byte_size":8}]';
const reserve=(id,target)=>`select public.media_reserver('posts','${target}','${spec}'::jsonb,'${id}'::uuid);`;
function child(name) {
  const process=spawn(client,base,{env:{...env,PGAPPNAME:name},stdio:['pipe','pipe','pipe'],windowsHide:true});
  const state={process,stdout:'',stderr:'',closed:false};
  process.stdout.on('data',chunk=>{state.stdout+=chunk;});process.stderr.on('data',chunk=>{state.stderr+=chunk;});
  state.done=new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',code=>{state.closed=true;resolve(code);});});
  return state;
}
async function until(predicate,timeout=7000) {
  const end=Date.now()+timeout;
  while(!await predicate()) {if(Date.now()>end)throw new Error('concurrency_handshake_timeout');await new Promise(r=>setTimeout(r,25));}
}
for(const mode of ['idempotence','capacity','byte-budget']) {
  sql(`delete from public.media_reservations where owner_id='${uid}' and linked_at is null;`);
  if(mode==='capacity') for(let i=1;i<=7;i++) sql(`select banc_medias.reserver(6,'parallel_pre_${i}',${70+i});`);
  if(mode==='byte-budget') sql(`insert into storage.objects(bucket_id,name,owner_id,metadata) values('attachments','concurrency_budget_fixture','${uid}','{"size":2120220672}');`);
  const suffix=randomBytes(4).toString('hex'), nameA='media_A_'+suffix,nameB='media_B_'+suffix;
  const idA='20000000-0000-4000-8000-000000000090',idB=mode==='idempotence'?idA:'20000000-0000-4000-8000-000000000091';
  const targetA='parallel_'+mode+'_A',targetB=mode==='idempotence'?targetA:'parallel_capacity_B';
  const a=child(nameA);let b;
  try {
    a.process.stdin.write(`begin;set local role authenticated;set local request.jwt.claims='${claims}';${reserve(idA,targetA)}select 'READY_A';\n`);
    await until(()=>a.stdout.includes('READY_A')||a.closed);
    if(a.closed) throw new Error('concurrency_A_exited');
    b=child(nameB);b.process.stdin.end(`set role authenticated;set request.jwt.claims='${claims}';${reserve(idB,targetB)}`);
    await until(()=>sql(`select exists(select 1 from pg_stat_activity b join pg_stat_activity a on a.application_name='${nameA}' where b.application_name='${nameB}' and b.wait_event_type='Lock' and a.pid=any(pg_blocking_pids(b.pid)))`).text==='t');
    a.process.stdin.end('commit;\n');
    const codeA=await a.done,codeB=await b.done;
    if(codeA!==0||(mode==='idempotence'?codeB!==0:codeB===0||!b.stderr.includes('54000'))) throw new Error('concurrency_verdict_failed_'+mode);
    const count=Number(sql(`select count(*) from public.media_reservations where owner_id='${uid}' and linked_at is null`).text);
    if(count!==(mode==='capacity'?8:1)) throw new Error('concurrency_row_count_'+mode);
    report.concurrency.push({category:mode,realLockObserved:true,rows:count,ok:true});
  } finally {if(!a.closed)a.process.kill();if(b&&!b.closed)b.process.kill();if(mode==='byte-budget')sql("delete from storage.objects where bucket_id='attachments' and name='concurrency_budget_fixture';");}
}
sql(`delete from public.media_reservations where owner_id='${uid}' and linked_at is null;`);
sql(migration);report.replayAfterData=true;
writeFileSync(path.join(out,'resultat.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
