// PostgreSQL réel, jeu exclusivement synthétique, cible locale neuve gardée.
// Aucun HTTP Auth/Storage ni contrôle des véritables politiques médias ici.
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tablesExport} from '../../supabase/functions/_shared/export-compte.js';

const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
const psql=arg('--psql'),port=arg('--port'),passwordFile=arg('--password-file'),output=arg('--output');
if(!psql||!path.isAbsolute(psql)||!/^\d{4,5}$/.test(port||'')||Number(port)>65535||
   (passwordFile&&!path.isAbsolute(passwordFile))||!output||!path.isAbsolute(output))throw Error('export_native_arguments_refused');
const root=fileURLToPath(new URL('../../',import.meta.url)),database='passio_export_medias_go_20261116';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)));
Object.assign(env,{PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8',PGTZ:'UTC'});if(passwordFile)env.PGPASSFILE=passwordFile;
const migration=readFileSync(path.join(root,'migrations/migration_export_medias_proteges_go_2026-11-16.sql'),'utf8');
const fixture=readFileSync(path.join(root,'tests/sql/fixtures/export-medias-fonctions-source.sql'),'utf8');
const registers=readFileSync(path.join(root,'tests/sql/fixtures/export-medias-registres.sql'),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex'),lit=s=>"'"+String(s).replace(/'/g,"''")+"'";
const checks=[],marker='PASSIO export media synthetic '+randomUUID(),children=new Set();let created=false;
const report={kind:'native-local-synthetic-export-media',database,migration_sha256:sha(migration),checks};
const base=db=>['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-d',db,'-qtA','-v','ON_ERROR_STOP=1'];
const prefix='\\set VERBOSITY verbose\nset client_min_messages=warning;set statement_timeout=\'20s\';\n';
function raw(sql,db=database){return spawnSync(psql,base(db),{env,input:prefix+sql,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});}
function q(sql,db=database){const r=raw(sql,db);if(r.error||r.status!==0)throw Error('export_native_sql_'+((r.stderr?.match(/ERROR:\s+([A-Z0-9]{5})/)||[])[1]||'transport')+'_'+sha(sql).slice(0,12));return r.stdout.trim();}
function check(categorie,ok){checks.push({categorie,ok:!!ok});if(!ok)throw Error('export_native_check_'+categorie);}
function prerequisite(expected,category){
 const cliEnv=Object.fromEntries(Object.entries(env).filter(([k])=>k.toLowerCase()!=='path'));
 cliEnv.PATH=path.dirname(psql)+path.delimiter+(env.PATH||env.Path||'');
 const r=spawnSync(process.execPath,[path.join(root,'scripts/verifier-prerequis-fonctions.mjs'),'--fonctions','export-account','--psql',`host=127.0.0.1 port=${port} user=postgres dbname=${database}`],{env:cliEnv,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536});
 const verdict = expected === 0 ? 'export-account : prérequis présents' : 'export-account : RETENUE';
 check(category,!r.error && r.status === expected && r.stdout.includes(verdict));
}
function refused(categorie,sql,code='55000'){const r=raw(sql);check(categorie,!r.error&&r.status!==0&&new RegExp('ERROR:\\s+'+code+'\\b').test(r.stderr));}
const doc=(uid,plafond=5000,lock='null')=>JSON.parse(q(`select public.export_compte_instantane(${lit(uid)},${plafond},${lock})::text;`));
const hashFn=()=>q("select md5(pg_get_functiondef('public.export_compte_instantane(text,integer,bigint)'::regprocedure));");
function background(sql,keepOpen=false){
 const child=spawn(psql,base(database),{env,windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(child);
 const s={child,stdout:'',stderr:'',closed:false};child.stdout.on('data',b=>{s.stdout+=b;if(s.stdout.length>4*1024*1024)child.kill();});child.stderr.on('data',b=>{s.stderr+=b;if(s.stderr.length>1024*1024)child.kill();});
 s.done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{s.closed=true;children.delete(child);code===0?resolve(s.stdout.trim()):reject(Error('export_native_background_refused'));});});
 // Chaque rejet est observé immédiatement, même si l'attente se fait ensuite.
 s.done.catch(()=>{});child.stdin.write(prefix+sql);if(!keepOpen)child.stdin.end();return s;
}
async function until(predicate){const end=Date.now()+10000;while(Date.now()<end){if(predicate())return true;await new Promise(r=>setTimeout(r,20));}return false;}
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const asset=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const object=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
function insertAsset(n,owner,post){return `insert into media_reservations values(${lit(asset(n))},${lit(owner)},'posts',${lit(post)},'[{}]',now(),now()+interval '15 minutes',now());
 insert into media_assets(id,owner_id,post_id) values(${lit(asset(n))},${lit(owner)},${lit(post)});
 insert into media_objects values(${lit(asset(n))},'original',${lit(object(n))},'content-protected',${lit(owner+'/'+asset(n)+'/original.webp')},'image/webp',8);`;}

try{
 check('cible_initialement_absente',q('select count(*) from pg_database where datname='+lit(database)+';','postgres')==='0');
 q('create database '+database+';','postgres');created=true;q('comment on database '+database+' is '+lit(marker)+';','postgres');
 q("do $$begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role;end if;end$$; grant usage on schema public to anon,authenticated,service_role; create schema rencontres_prive;");
 const tables=new Map();for(const [t,c]of tablesExport()){if(!tables.has(t))tables.set(t,new Set());tables.get(t).add(c);}
 q([...tables].map(([t,cols])=>`create table public.${t}(id text primary key,${[...cols].filter(c=>c!=='id').map(c=>c+' text,').join('')}created_at timestamptz default now());`).join('\n')+
 `create table rencontres_prive.inscriptions(id text primary key,user_id text,created_at timestamptz default now());
 create table rencontres_prive.accords(event_id text,user_id text,primary key(event_id,user_id));
 create table rencontres_prive.decisions(id text primary key,user_id text,decideur_id text,created_at timestamptz default now());
 create table rencontres_prive.coorganisations_anterieures(event_id text primary key,valeur jsonb,created_at timestamptz default now());`+fixture);
 check('empreinte_source_reelle',hashFn()==='da359929fd5a986c06a481e322c5ab1c');
 prerequisite(1,'deploiement_retenu_registres_absents');
 refused('absence_registres_refuse_avant_ddl',migration);
 check('absence_registres_wrapper_inchange',hashFn()==='da359929fd5a986c06a481e322c5ab1c');
 q(registers+`insert into profiles(id) values(${lit(A)}),(${lit(B)});
 insert into posts(id,author_id) values('export_A',${lit(A)}),('export_B',${lit(B)});
 insert into rencontres_prive.inscriptions(id,user_id) values('irl_A',${lit(A)}),('irl_B',${lit(B)});`+
 insertAsset(1,A,'export_A')+insertAsset(2,B,'export_B')+
 `insert into media_objects values(${lit(asset(1))},'v720',${lit(object(3))},'content-protected',${lit(A+'/'+asset(1)+'/v720.webp')},'image/webp',4);`);
 const old=doc(A);check('rouge_historique_registres_absents',!old.medias_proteges&&!old.tables.media_assets);
 prerequisite(1,'deploiement_retenu_wrapper_historique');
 q(migration);check('empreinte_nouvelle_exacte',hashFn()==='1ca6dbf6269c9441b83d8461fa8a1914');
 prerequisite(0,'deploiement_autorise_wrapper_medias');
 const afterHash=hashFn();q(migration);check('rejeu_identique',hashFn()===afterHash);
 const d=doc(A);check('trois_registres_versions',d.medias_proteges===1&&['media_reservations','media_assets','media_objects'].every(t=>d.tables[t]?.ordre_total===true));
 check('socle_et_rencontres_preserves',d.rencontres_prive===1&&d.tables['posts.author_id'].lignes[0].id==='export_A'&&d.tables['rencontres_prive.inscriptions'].lignes[0].id==='irl_A');
 check('isolation_reservations_assets',d.tables.media_reservations.lignes.every(r=>r.owner_id===A)&&d.tables.media_assets.lignes.every(r=>r.owner_id===A)&&d.tables.media_assets.attendu===1);
 check('objects_via_asset_propre',d.tables.media_objects.attendu===2&&d.tables.media_objects.lignes.every(r=>r.asset_id===asset(1)));
 check('ordre_pk_total',d.tables.media_objects.lignes.map(r=>r.variant).join(',')==='original,v720');
 const limited=doc(A,1);check('troncature_compte_exact',limited.tables.media_objects.attendu===2&&limited.tables.media_objects.lignes.length===1&&limited.tables.media_objects.tronque===true);
 check('plafond_global_borne',doc(A,999999).plafond===5000);
 check('uid_ne_devient_pas_sql',Object.values(doc("x' or true --").tables).every(e=>e.lignes.length===0));
 refused('anon_sans_export',`begin;set local role anon;select public.export_compte_instantane(${lit(A)});rollback;`,'42501');
 refused('authenticated_sans_export',`begin;set local role authenticated;select public.export_compte_instantane(${lit(A)});rollback;`,'42501');
 check('service_role_scope',JSON.parse(q(`begin;set local role service_role;select (public.export_compte_instantane(${lit(A)})->'tables'->'media_assets')::text;rollback;`)).attendu===1);
 const lock=randomInt(1000000000,2000000000),holder=background(`select pg_advisory_lock(${lock});select 'LOCK_READY';\n`,true);
 check('verrou_detenu',await until(()=>holder.stdout.includes('LOCK_READY')));
 const reader=background(`set statement_timeout='15s';select public.export_compte_instantane(${lit(A)},5000,${lock})::text;`);
 check('export_bloque_apres_lecture_socle',await until(()=>q(`select count(*) from pg_locks where locktype='advisory' and objid=${lock} and not granted;`)==='1'));
 q(`update media_objects set byte_size=16 where asset_id=${lit(asset(1))};insert into posts(id,author_id) values('export_A_new',${lit(A)});`+insertAsset(4,A,'export_A_new')+`delete from rencontres_prive.inscriptions where id='irl_A';insert into rencontres_prive.inscriptions(id,user_id) values('irl_A_new',${lit(A)});`);
 holder.child.stdin.end(`select pg_advisory_unlock(${lock});\n`);await holder.done;
 const during=JSON.parse(await reader.done);
 check('meme_snapshot_media_compte',during.tables.media_assets.attendu===1&&during.tables.media_objects.lignes.find(r=>r.variant==='original').byte_size===8&&during.tables['posts.author_id'].attendu===1);
 check('meme_snapshot_rencontres',during.tables['rencontres_prive.inscriptions'].lignes[0].id==='irl_A');
 check('export_apres_voit_modifications',doc(A).tables.media_assets.attendu===2&&doc(A).tables['rencontres_prive.inscriptions'].lignes[0].id==='irl_A_new');
 const current=q("select pg_get_functiondef('public.export_compte_instantane(text,integer,bigint)'::regprocedure);");
 q('alter function public.export_compte_instantane(text,integer,bigint) volatile;');refused('derive_wrapper_refusee',migration);q(current+';');
 q("comment on table media_objects is 'foreign';");refused('marqueur_etranger_refuse',migration);q("comment on table media_objects is 'PASSIO protected-media v1 2026-11-16';");
 q('alter table media_objects add column extra text;');refused('derive_colonne_refusee',migration);q('alter table media_objects drop column extra;');
 q('alter table media_assets disable row level security;');refused('rls_absente_refusee',migration);q('alter table media_assets enable row level security;');
 q('alter table media_assets drop constraint media_assets_owner_id_fkey;');refused('fk_profil_absente_refusee',migration);q('alter table media_assets add constraint media_assets_owner_id_fkey foreign key(owner_id) references profiles(id) on delete cascade;');
 q('alter function rencontres_prive.export_compte_socle(text,integer,bigint) volatile;');refused('derive_socle_refusee',migration);q(fixture);q(migration);
 q(`delete from profiles where id=${lit(A)};`);
 check('cascade_profil_registres_A_absents',q(`select (select count(*) from media_reservations where owner_id=${lit(A)})+(select count(*) from media_assets where owner_id=${lit(A)})+(select count(*) from media_objects where asset_id in(${lit(asset(1))},${lit(asset(4))}));`)==='0');
 check('cascade_compte_B_preserve',doc(B).tables.media_assets.attendu===1&&doc(B).tables.media_objects.attendu===1);
 report.ok=true;
}catch(e){report.ok=false;report.erreur=String(e.message);process.exitCode=1;}
finally{
 const arrets=[...children].map(child=>new Promise(resolve=>{child.once('close',resolve);child.kill();}));
 if(arrets.length)await Promise.race([Promise.all(arrets),new Promise(r=>setTimeout(r,3000))]);
 if(created)try{if(q('select shobj_description(oid,\'pg_database\') from pg_database where datname='+lit(database)+';','postgres')!==marker)throw Error('export_cleanup_marker_mismatch');q('drop database '+database+';','postgres');report.nettoyage_absence=q('select count(*) from pg_database where datname='+lit(database)+';','postgres')==='0';}catch(e){report.nettoyage_absence=false;report.erreur_nettoyage=String(e.message);process.exitCode=1;}
 report.ok=report.ok&&report.nettoyage_absence===true;writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
