// PostgreSQL natif uniquement : aucune URL distante, aucune interface Storage HTTP.
import fs from 'node:fs';
import {verifierRepriseCloture} from './reprise-cloture-native.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2);
const arg=n=>{const i=args.indexOf(n);return i<0?null:args[i+1];};
const client=arg('--psql'),passwordFile=arg('--password-file'),dataDirectory=arg('--data-directory'),output=arg('--output');
const port=arg('--port'),existing=args.includes('--existing-local');
if(!client||!path.isAbsolute(client)||!passwordFile||!path.isAbsolute(passwordFile)||!dataDirectory||!path.isAbsolute(dataDirectory)
  ||!output||!path.isAbsolute(output)||!/^\d{4,5}$/.test(port||'')||Number(port)>65535||!process.versions.node.startsWith('22.'))throw Error('heritage_native_arguments_refused');
const markerFile=arg('--cluster-marker');
if(!existing&&(!markerFile||!path.isAbsolute(markerFile)||!fs.readFileSync(markerFile,'utf8').startsWith('PASSIO_FENCE_HERITAGE_CI_')))throw Error('heritage_native_cluster_marker_refused');
const database='passio_fence_heritage_go_20261116_'+randomUUID().replaceAll('-','').slice(0,12),marker='PASSIO heritage synthetic '+randomUUID();
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)));
Object.assign(env,{PGPASSFILE:passwordFile,PGCONNECT_TIMEOUT:'5',PGTZ:'UTC',PGCLIENTENCODING:'UTF8',PGAPPNAME:'passio_fence_'+randomUUID().replaceAll('-','')});
const lit=s=>"'"+s.replaceAll("'","''")+"'",sha=x=>createHash('sha256').update(x).digest('hex');
const checks=[],report={kind:'native-local-synthetic-heritage-fence',database,existing_local_cluster:existing,checks,storage_http_tested:false,auth_http_tested:false,cloud:false};
let created=false,creationAttempted=false;
function sql(text,{db=database,failure=false}={}){
 const input='set client_min_messages=warning;\n'+text;
 const sqlFile=process.platform==='win32'?path.join(path.dirname(output),'requete-'+randomUUID()+'.sql'):null;
 const args=['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-d',db,'-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'];
 let r,owned=false,cleanupFailed=false;
 try{
  if(sqlFile){const fd=fs.openSync(sqlFile,'wx');owned=true;try{fs.writeFileSync(fd,input);}finally{fs.closeSync(fd);}args.push('--file',sqlFile);}
  r=spawnSync(client,args,{env,...(sqlFile?{}:{input}),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024});
 }finally{if(owned){try{fs.unlinkSync(sqlFile);}catch{cleanupFailed=true;}}}
 if(r.error)throw Error('heritage_native_transport_'+(['ETIMEDOUT','ENOBUFS','EPIPE','ENOENT','EPERM','EACCES'].includes(r.error.code)?r.error.code:'failed')+'_'+sha(text).slice(0,12));
 if(r.status!==0&&!failure)throw Error('heritage_native_sql_'+((r.stderr.match(/ERROR:\s+([A-Z0-9]{5})/)||[])[1]||'failed')+'_'+sha(text).slice(0,12));
 if(cleanupFailed)throw Error('heritage_native_temporary_file_cleanup_failed');
 return {status:r.status,text:(process.platform==='win32'?r.stdout.replaceAll('\r\n','\n'):r.stdout).trim(),error:r.stderr};
}
function expand(file,seen=new Set()){const f=path.resolve(file);if(seen.has(f))throw Error('fixture_cycle');const next=new Set(seen);next.add(f);return fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n').split('\n').map(l=>{const m=/^\s*\\ir\s+(.+?)\s*$/.exec(l);return m?expand(path.resolve(path.dirname(f),m[1]),next):l;}).join('\n');}
function check(categorie,ok){checks.push({categorie,ok:ok===true});if(ok!==true)throw Error('heritage_native_check_'+categorie);}
const migration=fs.readFileSync(path.join(root,'migrations/migration_cloture_medias_herites_go_2026-11-16.sql'),'utf8');
report.migration_sha256=sha(migration);
try{
 const ver=Number(sql('select current_setting(\'server_version_num\');',{db:'postgres'}).text);report.postgres_version_num=ver;
 check('postgres_17_ou_18',[17,18].includes(Math.floor(ver/10000)));
 const actual=sql('show data_directory;',{db:'postgres'}).text;
 check('cluster_directory_checked',fs.realpathSync(actual)===fs.realpathSync(dataDirectory));report.cluster_directory_checked=true;
 check('database_initialement_absente',sql('select count(*) from pg_database where datname='+lit(database)+';',{db:'postgres'}).text==='0');
 creationAttempted=true;sql('create database '+database+';',{db:'postgres'});created=true;
 sql('comment on database '+database+' is '+lit(marker)+';',{db:'postgres'});
 sql(expand(path.join(root,'tests/sql/fixtures/medias-proteges-socle.sql')));
 sql(fs.readFileSync(path.join(root,'migrations/migration_medias_proteges_go_2026-11-16.sql'),'utf8'));
 const sourceHelper=sql("select pg_get_functiondef('public.storage_chemin_autorise(text,text)'::regprocedure);").text;
 if(!sourceHelper.includes("_bucket = 'content'"))throw Error('source_anchor_absente');
 sql(sourceHelper.replace("_bucket = 'content'","_bucket = 'content' /* fixture drift */")+';');
 check('derive_source_refusee',sql(migration,{failure:true}).status!==0&&sql("select to_regprocedure('public.media_heritage_stockage()') is null;").text==='t');
 sql(sourceHelper+';');
 sql('create function public.media_heritage_stockage_public(text,text) returns boolean language sql as $$select true$$;');
 check('collision_fonction_refusee',sql(migration,{failure:true}).status!==0&&sql("select to_regprocedure('public.media_heritage_stockage()') is null;").text==='t');
 sql('drop function public.media_heritage_stockage_public(text,text);');
 sql('create policy media_heritage_insert on storage.objects for insert to authenticated with check(true);');
 check('collision_policy_refusee',sql(migration,{failure:true}).status!==0&&sql("select to_regprocedure('public.media_heritage_stockage()') is null;").text==='t');
 sql('drop policy media_heritage_insert on storage.objects;');
 sql(fs.readFileSync(path.join(root,'tests/sql/fixtures/medias-heritage-pre.sql'),'utf8'));
 sql(migration);check('application',true);sql(migration);check('rejeu_initial',true);
 const autorites=fs.readFileSync(path.join(root,'tests/sql/fixtures/medias-heritage-autorites.sql'),'utf8');
 const ancien=fs.readFileSync(path.join(root,'tests/sql/fixtures/medias-heritage-classificateur-avant.sql'),'utf8');
 const avantMutation=sql("select md5(pg_get_functiondef('public.media_heritage_ref_categorie(text)'::regprocedure))||':'||(select count(*) from public.posts);").text;
 const mutation=JSON.parse(sql('begin;'+ancien+';'+autorites+"select json_build_object('tierces_indues',count(*) filter(where cas like 'autorite classification %' and obtenu='tierce'),'insertions_indues',count(*) filter(where cas like 'autorite insertion %' and obtenu='ok:1')) from banc_heritage.resultats;rollback;").text);
 report.mutation_ancienne={classifications_indues:mutation.tierces_indues,insertions_indues:mutation.insertions_indues};
 check('ancien_classificateur_ambigu_rend_rouge',mutation.tierces_indues===5&&mutation.insertions_indues>=3);
 check('mutation_rollback_integral',sql("select md5(pg_get_functiondef('public.media_heritage_ref_categorie(text)'::regprocedure))||':'||(select count(*) from public.posts);").text===avantMutation);
 sql(autorites);
 sql(fs.readFileSync(path.join(root,'tests/sql/fixtures/medias-heritage-cas.sql'),'utf8'));
 const result=JSON.parse(sql("select json_build_object('cases',count(*),'failed',count(*) filter(where not ok),'categories_rouges',coalesce(json_agg(json_build_object('cas',cas,'obtenu',obtenu,'attendu',attendu)) filter(where not ok),'[]')) from banc_heritage.resultats;").text);
 report.cases=result.cases;report.failed=result.failed;report.categories_rouges=result.categories_rouges;
 check('cas_metier_complets',result.cases>=200&&result.failed===0);
 const quota=sql("select pg_get_functiondef('public.quota_stockage_ok()'::regprocedure);").text;
 sql("create or replace function public.quota_stockage_ok() returns boolean language sql stable security definer set search_path='' as $$select false$$;");
 check('quota_ancien_toujours_effectif',sql("select banc_heritage.sous('authenticated',1,'insert into storage.objects(bucket_id,name,owner,metadata) values(''content'',''avatars/00000000-0000-4000-8000-000000000001/quota.webp'',''00000000-0000-4000-8000-000000000001'',''{\"size\":8}'')');").text==='err:42501');
 sql(quota+';');
 sql("comment on trigger media_heritage_stockage on storage.objects is 'fixture etrangere';");
 const marqueEtrangereRefusee=sql(migration,{failure:true}).status!==0
   &&sql("select obj_description(oid,'pg_trigger') from pg_trigger where tgrelid='storage.objects'::regclass and tgname='media_heritage_stockage';").text==='fixture etrangere';
 sql('comment on trigger media_heritage_stockage on storage.objects is null;');
 sql('alter table storage.objects disable trigger media_heritage_stockage;');
 check('derive_trigger_refusee',marqueEtrangereRefusee&&sql(migration,{failure:true}).status!==0&&sql("select tgenabled from pg_trigger where tgrelid='storage.objects'::regclass and tgname='media_heritage_stockage';").text==='D');
 sql('alter table storage.objects enable trigger media_heritage_stockage;');
 sql('alter policy media_heritage_insert on storage.objects with check(true);');
 check('derive_policy_refusee',sql(migration,{failure:true}).status!==0);
 sql('alter policy media_heritage_insert on storage.objects with check(public.media_heritage_stockage_public(bucket_id,name));');
 const own=sql("select pg_get_functiondef('public.media_heritage_stockage_public(text,text)'::regprocedure);").text;
 sql('create or replace function public.media_heritage_stockage_public(p_bucket text,p_name text) returns boolean language sql immutable set search_path=\'\' as $$select true$$;');
 check('derive_fonction_propre_refusee',sql(migration,{failure:true}).status!==0);
 sql(own+';');sql(migration);check('rejeu_apres_donnees',true);
 check('stockage_origin_et_references_always',sql("select count(*) from pg_trigger where (tgrelid='storage.objects'::regclass and tgname='media_heritage_stockage' and tgenabled='O' or tgrelid in('public.posts'::regclass,'public.stories'::regclass) and tgname='media_heritage_references' and tgenabled='A');").text==='3');
 check('trigger_functions_invoker',sql("select count(*) from pg_proc where oid in('public.media_heritage_stockage()'::regprocedure,'public.media_heritage_references()'::regprocedure) and not prosecdef;").text==='2');
 const reprise=verifierRepriseCloture({root,sql});report.reprise_cloture=reprise;
 for(const {categorie,ok} of reprise.checks)check('reprise_'+categorie,ok);
 check('reprise_cloture_complete',reprise.ok);
 // Valide la protection sur le schéma complet et avec le rôle du client.
 sql(fs.readFileSync(path.join(root,'migrations/migration_cloture_references_profils_evenements_2026-11-19.sql'),'utf8'));
 sql(fs.readFileSync(path.join(root,'tests/sql/fixtures/medias-heritage-profils-evenements.sql'),'utf8'));
 report.ok=true;
}catch(e){report.ok=false;report.erreur=e.message;process.exitCode=1;}
finally{
 if(created){try{
  if(sql('select shobj_description(oid,\'pg_database\') from pg_database where datname='+lit(database)+';',{db:'postgres'}).text!==marker)throw Error('cleanup_marker_refused');
  sql('drop database '+database+';',{db:'postgres'});
  report.nettoyage_absence=sql('select count(*) from pg_database where datname='+lit(database)+';',{db:'postgres'}).text==='0';
 }catch(e){report.nettoyage_absence=false;report.erreur_nettoyage=e.message;process.exitCode=1;}}
 else report.nettoyage_absence=!creationAttempted;
 report.ok=report.ok===true&&report.nettoyage_absence===true;
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
