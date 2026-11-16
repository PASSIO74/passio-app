// PostgreSQL natif existant, données synthétiques seulement, aucun serveur démarré.
// --medias-root désigne le checkout contenant le candidat médias et ses fixtures.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url)), require=createRequire(import.meta.url);
const {ETAPES}=require('../../scripts/schema-executable.js');
const R=require('../../scripts/restaurer-donnees.js');
const args=process.argv.slice(2), option=(n,d='')=>{const i=args.indexOf(n);return i<0?d:args[i+1];};
const database=option('--database'),port=option('--port'),client=option('--psql'),medias=option('--medias-root',root);
if(database!=='passio_medias_go_20261116_reprise'||port!=='55472'||!path.isAbsolute(client)) throw new Error('native_target_refused');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)));
env.PGPASSFILE=option('--password-file');env.PGCONNECT_TIMEOUT='5';env.PGTZ='UTC';
env.PGCLIENTENCODING='UTF8';
const base=['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const checks=[];const check=(category,ok)=>{checks.push({category,ok:!!ok});if(!ok)throw new Error('native_check_failed_'+category);};
function sql(query,{db=database,failure=false,csv=false}={}) {
  const r=spawnSync(client,[...base,...(csv?['--csv']:['-tA']),'-d',db],{env,input:'set client_min_messages=warning;\n'+query,encoding:'utf8',windowsHide:true,maxBuffer:90*1024*1024,timeout:30000});
  // psql peut fermer stdin dès l'erreur attendue : EPIPE avec status=3
  // reste une erreur SQL, jamais un succès. Le SQLSTATE est ensuite exigé.
  if((r.error&&r.status===null)||(!failure&&(r.error||r.status!==0))) {report.error={category:'native_sql_failed',status:r.status,state:(r.stderr.match(/ERROR:\s+([0-9A-Z]{5})/)||[])[1]||null,querySha256:sha(query),position:Number((r.stderr.match(/LINE (\d+)/)||[])[1]||0)};const signature=(r.stderr.match(/function ([a-zA-Z0-9_."(), ]+) does not exist/)||[])[1];if(signature)report.error.signature=signature;throw new Error('native_sql_failed_'+(report.error.state??'transport'));}
  return {status:r.status,text:r.stdout.trim(),state:(r.stderr.match(/ERROR:\s+([0-9A-Z]{5})/)||[])[1]||null,signature:(r.stderr.match(/function ([a-zA-Z0-9_."(), ]+) does not exist/)||[])[1]||null,constraint:(r.stderr.match(/constraint "([a-z0-9_]+)"/)||[])[1]||null};
}
const json=(q)=>JSON.parse(sql(`select coalesce(json_agg(x),'[]') from (${q}) x`).text);
function csvRows(text) {
  if(!text)return [];
  text=text.replace(/\r\n/g,'\n');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}
    else cell+=c;
  }
  row.push(cell);rows.push(row);const headers=rows.shift();
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,h==='passio_lo'?JSON.parse(r[i]):r[i]])));
}
function expand(file,seen=new Set()) {
  const p=path.resolve(file);if(seen.has(p))throw new Error('fixture_include_cycle');
  return readFileSync(p,'utf8').replace(/\r\n/g,'\n').split('\n').map(l=>{
    const m=/^\s*\\ir\s+(.+?)\s*$/.exec(l);return m?expand(path.resolve(path.dirname(p),m[1]),new Set([...seen,p])):l;
  }).join('\n');
}
const output=path.resolve(option('--output',path.join(root,'work/reprise-medias-native.json')));
const marker='PASSIO reprise synthetic '+randomUUID();
const migration=readFileSync(path.join(medias,'migrations/migration_medias_proteges_go_2026-11-16.sql'),'utf8').replace(/\r\n/g,'\n');
const archive=mkdtempSync(path.join(os.tmpdir(),'passio-reprise-medias-native-'));
let created=false;
const report={kind:'native-local-synthetic-reprise',database,port:Number(port),migrationSha256:sha(migration),checks};
try {
  check('endpoint',sql("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=55472 and current_database()='postgres'",{db:'postgres'}).text==='t');
  check('database_absent',sql(`select not exists(select 1 from pg_database where datname='${database}')`,{db:'postgres'}).text==='t');
  sql(`create database ${database}`,{db:'postgres'});created=true;
  sql(`comment on database ${database} is '${marker}'`,{db:'postgres'});
  report.version=sql("select current_setting('server_version')").text;
  sql(expand(path.join(medias,'tests/sql/fixtures/medias-proteges-socle.sql')));
  sql(migration);
  sql("create function public.reprise_check(text) returns boolean language sql immutable as $f$select $1<>''$f$;create table public.reprise_check_fixture(value text check(public.reprise_check(value)));");
  const commentHostile="marqueur'\\'; drop table public.profiles; --\n$r$\né";
  sql('comment on table public.reprise_check_fixture is '+R.litteral(commentHostile));
  check('no_sql_begin_atomic_body',sql("select not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prosqlbody is not null)").text==='t');
  check('no_unexported_custom_return_type',sql("select not exists(select 1 from pg_proc p join pg_type t on t.oid=p.prorettype where p.pronamespace='public'::regnamespace and t.typnamespace='public'::regnamespace and t.typtype not in ('c','b'))").text==='t');
  const sections=ETAPES.map(e=>({titre:e.titre,lignes:e.rendu(json(e.sql))}));
  const functionsSql="select p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash from pg_proc p where p.pronamespace='public'::regnamespace order by 1";
  const sourceFunctions=json(functionsSql);
  const ddl=sections=>['begin;',...sections.flatMap(e=>e.lignes),'commit;'].join('\n');
  const actual=ddl(sections),old=ddl(sections.filter(e=>e.titre!=='Commentaires des tables'));
  report.schemaSha256=sha(actual);
  const reset=()=>sql('drop schema public cascade; create schema public;');
  const oldOrder=sections.filter(e=>!e.titre.startsWith('Fonctions ('));
  oldOrder.splice(oldOrder.findIndex(e=>e.titre.startsWith('Vues (')),0,sections.find(e=>e.titre.startsWith('Fonctions (')));
  reset();const oldOrderResult=sql(ddl(oldOrder),{failure:true});
  check('old_function_order_refused_42883',oldOrderResult.status!==0&&oldOrderResult.state==='42883');
  reset();sql(old);
  check('old_ddl_loses_three_comments',sql("select count(*)=0 from pg_class where oid=any(array['public.media_reservations'::regclass,'public.media_assets'::regclass,'public.media_objects'::regclass]) and obj_description(oid,'pg_class')='PASSIO protected-media v1 2026-11-16'").text==='t');
  check('old_ddl_replay_refused',sql(migration,{failure:true}).status!==0);
  reset();sql(actual);
  check('function_bodies_exact',JSON.stringify(json(functionsSql))===JSON.stringify(sourceFunctions));
  sql("begin;set local standard_conforming_strings=off;"+sections.find(e=>e.titre==='Commentaires des tables').lignes.join('\n')+'commit;');
  check('comment_strict_escape_on_off',sql("select encode(sha256(convert_to(obj_description('public.reprise_check_fixture'::regclass,'pg_class'),'UTF8')),'hex')='"+sha(Buffer.from(commentHostile))+"' and to_regclass('public.profiles') is not null").text==='t');
  check('comments_restored',sql("select count(*)=3 from pg_class where oid=any(array['public.media_reservations'::regclass,'public.media_assets'::regclass,'public.media_objects'::regclass]) and obj_description(oid,'pg_class')='PASSIO protected-media v1 2026-11-16'").text==='t');
  sql(migration);check('candidate_replay_after_ddl',true);
  const owner='00000000-0000-4000-8000-000000000001',asset='20000000-0000-4000-8000-000000000901';
  sql(R.ordreInsert('profiles',['id','username'],JSON.stringify([{id:owner,username:'reprise_fixture'}]),['id']));
  const row={id:'reprise_large',author_id:owner,media_url:`https://media.passio.invalid/private-media/posts/reprise_large/${asset}/original`,overlays:{fixture:'x'.repeat(720*1024)},created_at:'2026-11-16T00:00:00'};
  const line=JSON.stringify(row);
  const refused=sql(`begin;set local role service_role;set local request.jwt.claims='{}';insert into public.posts(id,author_id,media_url,overlays) values('reprise_large','${owner}','${row.media_url}',jsonb_build_object('fixture',repeat('x',${720*1024})));commit;`,{failure:true});
  check('service_without_session_refused_42501',refused.status!==0&&refused.state==='42501');
  check('service_refusal_preserves_triggers_and_rows',sql("select not exists(select 1 from public.posts where id='reprise_large') and not exists(select 1 from pg_trigger where tgrelid='public.posts'::regclass and not tgisinternal and tgenabled<>'O')").text==='t');
  report.largeRowOctets=Buffer.byteLength(line);
  if(!args.includes('--red-only')) {
    const vraiFetch=globalThis.fetch;
    let mode='normal',once=false,caseError=null,privateReadChecked=false;
    const bodySizes=[];
    globalThis.fetch=async(url,init)=>{
      if(!String(url).endsWith('/database/query'))throw new Error('native_rest_forbidden');
      bodySizes.push(Buffer.byteLength(init.body));
      let {query}=JSON.parse(init.body);
      check('no_client_claim_or_filesystem_import',!/request\.jwt|lo_import/i.test(query));
      if(query.includes('perform lo_put(')&&!privateReadChecked) {
        const oid=query.match(/lo_put\((\d+)::oid/)[1];
        for(const role of ['anon','authenticated','service_role']) {
          const denied=sql(`begin;set local role ${role};select lo_get(${oid}::oid);rollback;`,{failure:true});
          check('lo_private_'+role,denied.status!==0&&denied.state==='42501');
        }
        privateReadChecked=true;
      }
      if(mode==='hash'&&query.includes('perform lo_put(')&&!once){query=query.replace(/decode\('([0-9a-f])/,(_,c)=>"decode('"+(c==='0'?'1':'0'));once=true;}
      if(mode==='timeout'&&query.includes('insert into public.'))query=query.replace(/disable trigger user;/,"disable trigger user;set local statement_timeout='10ms';select pg_sleep(1);");
      if(mode==='interruption-fragment'&&query.includes('perform lo_put(')&&!once){once=true;throw new Error('owned_transport_interruption');}
      const result=sql(query,{failure:true,csv:true});
      if(result.status!==0){caseError={state:result.state,constraint:result.constraint};return new Response('{}',{status:400});}
      const perdu=!once&&[
        mode==='creation-ambigue'&&query.includes('perform lo_create('),
        mode==='fragment-ambigu'&&query.includes('perform lo_put('),
        mode==='commit-ambigu'&&query.includes('insert into public.'),
        mode==='cleanup-ambigu'&&query.includes('perform lo_unlink(')
      ].some(Boolean);
      if(perdu){once=true;throw new Error('owned_response_lost_after_commit');}
      return new Response(JSON.stringify(csvRows(result.text)),{status:200});
    };
    const residual=()=>sql('select count(*) from pg_largeobject_metadata').text==='0';
    const triggers=()=>sql("select not exists(select 1 from pg_trigger where tgrelid in ('public.posts'::regclass,'public.profiles'::regclass) and not tgisinternal and tgenabled<>'O')").text==='t';
    async function charger(category,raw,{table='posts',transport='normal',ok=true,state=null}={}) {
      mode=transport;once=false;caseError=null;
      writeFileSync(path.join(archive,table+'.ndjson'),raw+'\n');
      const ctx={archive,ref:'dddddddddddddddddddd',jeton:'sbp_synthetic',url:'https://cible.invalid',man:{tables:{[table]:{}}},journalGrandsObjets:path.join(archive,'journaux-'+category)};
      const b={notes:[],refus:[]};
      try {await R._phases.chargerTable(ctx,table,b);}
      catch(e) {
        if(transport!=='creation-ambigue'||ok)throw e;
        check(category+'_indeterminate',ctx._grandObjetCreationAmbigue===true&&b.phases?.tables?.ok===false&&b.phases?.tables?.indetermine===true);
        const jf=path.join(ctx.journalGrandsObjets,readdirSync(ctx.journalGrandsObjets).find(n=>n.endsWith('.json')));
        check(category+'_journal_still_blocking',JSON.parse(readFileSync(jf,'utf8')).etape==='creation_ambigue');
      }
      check(category+'_result',ok?b.refus.length===0:b.refus.length>0);
      if(state)check(category+'_sqlstate',caseError?.state===state);
      if(!ok&&transport!=='commit-ambigu')check(category+'_no_partial_row',sql(`select not exists(select 1 from public."${table}" where id=${R.litteral(JSON.parse(raw).id)})`).text==='t');
      check(category+'_lo_residual_zero',residual());check(category+'_triggers_enabled',triggers());
      console.log(JSON.stringify({nativeCase:category,expectedResult:ok?'success':'refusal',ok:true}));
      return {ctx,b};
    }
    try {
      const first=await charger('large_row',line);
      check('large_row_exact',sql(`select created_at='2026-11-16 00:00:00'::timestamp and media_url='${row.media_url}' and encode(sha256(convert_to(overlays->>'fixture','UTF8')),'hex')='${sha(Buffer.from(row.overlays.fixture))}' from public.posts where id='reprise_large'`).text==='t');
      // Journal d'arrêt simulé : seul l'OID réellement lié à CE dossier est
      // nettoyé. Ce contrôle n'est pas une mesure de kill brutal du processus.
      const journalFile=path.join(first.ctx.journalGrandsObjets,readdirSync(first.ctx.journalGrandsObjets)[0]);
      const j=JSON.parse(readFileSync(journalFile,'utf8'));
      const label=`PASSIO_REPRISE_LO_V1:${j.ref}:${j.run}:${j.table}:${j.octets}:${j.sha256}`;
      sql(`select lo_create(${j.oid}::oid);comment on large object ${j.oid} is ${R.litteral(label)};revoke all on large object ${j.oid} from public,anon,authenticated,service_role;`);
      const unrelated=Number(sql('select lo_create(0)').text);
      j.etape='fragments';writeFileSync(journalFile,JSON.stringify(j));
      let pending=false;try{await R._phases.insererGrandObjet(first.ctx,'posts',['id'],line,['id']);}catch(e){pending=e.message==='LO_JOURNAL_EN_ATTENTE_NETTOYAGE';}
      check('pending_journal_prevents_new_lo',pending);
      await R._phases.nettoyerGrandObjet(first.ctx,journalFile);
      check('resume_cleanup_exact_oid_only',sql(`select not exists(select 1 from pg_largeobject_metadata where oid=${j.oid}::oid) and exists(select 1 from pg_largeobject_metadata where oid=${unrelated}::oid)`).text==='t');
      sql(`select lo_unlink(${unrelated}::oid)`);
      sql(`select lo_create(${j.oid}::oid);comment on large object ${j.oid} is 'FOREIGN_SYNTHETIC_MARKER';`);
      let foreignRefused=false;try{await R._phases.nettoyerGrandObjet(first.ctx,journalFile);}catch(e){foreignRefused=e.message==='LO_LIAISON_REFUSEE';}
      check('foreign_marker_cleanup_refused',foreignRefused&&sql(`select exists(select 1 from pg_largeobject_metadata where oid=${j.oid}::oid)`).text==='t');
      sql(`select lo_unlink(${j.oid}::oid)`);
      check('resume_fixture_lo_residual_zero',residual());
      await charger('large_row_replay',line);
      const variant=(id,extra={})=>JSON.stringify({...row,id,media_url:null,...extra});
      await charger('create_ambiguous',variant('reprise_create_ambiguous'),{transport:'creation-ambigue',ok:false});
      await charger('chunk_ambiguous',variant('reprise_chunk_ambiguous'),{transport:'fragment-ambigu'});
      await charger('commit_ambiguous',variant('reprise_commit_ambiguous'),{transport:'commit-ambigu',ok:false});
      check('commit_ambiguous_row_present',sql("select count(*)=1 from public.posts where id='reprise_commit_ambiguous'").text==='t');
      await charger('fk',variant('reprise_fk',{author_id:'00000000-0000-4000-8000-999999999999'}),{ok:false,state:'23503'});
      await charger('check',JSON.stringify({id:'00000000-0000-4000-8000-000000000902',username:'admin',bio:'x'.repeat(720*1024)}),{table:'profiles',ok:false,state:'23514'});
      check('actual_profiles_check_preserved',caseError?.constraint==='profiles_username_forme');
      await charger('hash',variant('reprise_hash'),{transport:'hash',ok:false,state:'23514'});
      await charger('timeout',variant('reprise_timeout'),{transport:'timeout',ok:false,state:'57014'});
      await charger('interruption_fragment',variant('reprise_interrupted'),{transport:'interruption-fragment',ok:false});
      await charger('cleanup_ambiguous',variant('reprise_cleanup_ambiguous',{author_id:'00000000-0000-4000-8000-999999999999'}),{transport:'cleanup-ambigu',ok:false,state:'23503'});
      const template={...row,id:'reprise_32m',media_url:null,overlays:{fixture:''}};
      template.overlays.fixture='x'.repeat(R.LIGNE_MAX_OCTETS-Buffer.byteLength(JSON.stringify(template)));
      const maxLine=JSON.stringify(template);
      check('line_32m_exact_boundary',Buffer.byteLength(maxLine)===R.LIGNE_MAX_OCTETS);
      await charger('line_32m',maxLine);
      check('line_32m_exact_content',sql(`select octet_length(overlays->>'fixture')=${template.overlays.fixture.length} and encode(sha256(convert_to(overlays->>'fixture','UTF8')),'hex')='${sha(Buffer.from(template.overlays.fixture))}' from public.posts where id='reprise_32m'`).text==='t');
      const requestsBefore=bodySizes.length;
      await charger('line_33m',variant('reprise_33m',{overlays:{fixture:'x'.repeat(33*1024*1024)}}),{ok:false});
      check('line_33m_no_lo_created',bodySizes.length-requestsBefore===2); // catalogue colonnes+PK seulement
      check('all_api_bodies_bounded',bodySizes.every(n=>n<=R.LOT_OCTETS));
      report.maxApiBodyOctets=Math.max(...bodySizes);
      // Les trois registres sont restaurés APRÈS leurs parents ; aucun binder
      // client n'est modifié. Storage HTTP/blobs et Auth restent hors de ce banc.
      const moment='2026-11-16T00:00:00Z';
      for(const [table,data] of [
        ['media_reservations',{id:asset,owner_id:owner,source_type:'posts',source_id:row.id,variants:[{variant:'original',mime_type:'image/webp',byte_size:8}],created_at:moment,expires_at:'2026-11-16T00:15:00Z',linked_at:moment}],
        ['media_assets',{id:asset,owner_id:owner,post_id:row.id,story_id:null,created_at:moment}],
        ['media_objects',{asset_id:asset,variant:'original',storage_object_id:'30000000-0000-4000-8000-000000000901',bucket_id:'content-protected',object_key:owner+'/'+asset+'/original.webp',mime_type:'image/webp',byte_size:8}]
      ]) {writeFileSync(path.join(archive,table+'.ndjson'),JSON.stringify(data)+'\n');const ctx={archive,ref:'dddddddddddddddddddd',jeton:'sbp_synthetic',man:{tables:{[table]:{}}}};const b={notes:[],refus:[]};await R._phases.chargerTable(ctx,table,b);check(table+'_restored',b.refus.length===0);}
      sql(migration);check('candidate_replay_after_data',true);
      check('registry_counts_preserved',sql('select (select count(*) from public.media_reservations)=1 and (select count(*) from public.media_assets)=1 and (select count(*) from public.media_objects)=1').text==='t');
      sql(actual);sql(migration);check('ddl_and_candidate_replay_after_data',true);
      check('function_setting_restored',sql("select current_setting('check_function_bodies')='on'").text==='t');
      report.hardProcessKillCleanup='NON_MESURE';
    } finally {globalThis.fetch=vraiFetch;}
  }
} finally {
  if(created) {
    const own=sql(`select shobj_description(oid,'pg_database')='${marker}' and not exists(select 1 from pg_stat_activity where datname='${database}') from pg_database where datname='${database}'`,{db:'postgres'}).text==='t';
    check('cleanup_exact_database',own);
    sql(`drop database ${database}`,{db:'postgres'});
    check('database_residual_zero',sql(`select not exists(select 1 from pg_database where datname='${database}')`,{db:'postgres'}).text==='t');
  }
  rmSync(archive,{recursive:true,force:true});
  mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:checks.length,failed:checks.filter(x=>!x.ok).length,proofSha256:sha(readFileSync(output))}));
}
