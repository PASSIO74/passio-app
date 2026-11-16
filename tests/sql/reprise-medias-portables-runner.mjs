// Banc PostgreSQL local synthétique. Management/REST sont doublés par psql ;
// ce n'est pas une preuve HTTP Storage/Auth hébergée.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),R=require('../../scripts/restaurer-donnees.js'),{ETAPES}=require('../../scripts/schema-executable.js');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?null:args[i+1];};
const client=arg('--psql'),passwordFile=arg('--password-file'),output=arg('--output');
const dataDirectory=arg('--data-directory'),clusterMarker=arg('--cluster-marker');
const database='passio_urls_go_20261116',port='55472';
if(!client||!path.isAbsolute(client)||!passwordFile||!path.isAbsolute(passwordFile)||!output||!path.isAbsolute(output))throw new Error('native_arguments_refused');
if(process.env.GITHUB_ACTIONS==='true'&&(!dataDirectory||!clusterMarker||!process.versions.node.startsWith('22.')))throw new Error('native_ci_protocol_refused');
if((dataDirectory||clusterMarker)&&(!path.isAbsolute(dataDirectory||'')||!path.isAbsolute(clusterMarker||'')
  ||path.dirname(path.resolve(dataDirectory))!==path.dirname(path.resolve(clusterMarker))
  ||path.basename(clusterMarker)!=='PASSIO_REPRISE_URLS_CI'
  ||!/^PASSIO_REPRISE_URLS_CI_[0-9a-f-]{36}\n$/.test(readFileSync(clusterMarker,'utf8'))))throw new Error('native_cluster_marker_refused');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG/i.test(k)));
Object.assign(env,{PGPASSFILE:passwordFile,PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8',PGTZ:'UTC'});
const sha=x=>createHash('sha256').update(x).digest('hex'),lit=s=>"'"+s.replace(/'/g,"''")+"'";
const marker='PASSIO URL recovery synthetic '+randomUUID(),checks=[];
const report={kind:'native-local-synthetic-url-recovery',database,node_version:process.versions.node,cluster_directory_checked:false,management_http_doubled:true,storage_http_tested:false,auth_http_tested:false,checks};
let created=false;
const archive=mkdtempSync(path.join(tmpdir(),'passio-reprise-urls-native-'));
const psql=(query,db=database)=>{
  const r=spawnSync(client,['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-d',db,'-qtA','-v','ON_ERROR_STOP=1'],
    {env,input:'\\set VERBOSITY verbose\nset client_min_messages=warning;\n'+query,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024});
  if(r.error||r.status!==0)throw new Error('native_sql_failed_'+((r.stderr.match(/ERROR:\s+([A-Z0-9]{5})/)||[])[1]||'transport')+'_'+sha(query).slice(0,12));
  return r.stdout.trim();
};
const lireTexte=q=>psql('select coalesce(json_agg(x),\'[]\') from ('+q.replace(/;\s*$/,'')+') x;');
const lire=q=>JSON.parse(lireTexte(q));
const check=(categorie,ok)=>{checks.push({categorie,ok:!!ok});if(!ok)throw new Error('native_check_failed_'+categorie);};
const originalFetch=globalThis.fetch;
try {
  if(dataDirectory&&path.resolve(psql('show data_directory;','postgres'))!==path.resolve(dataDirectory))throw new Error('native_cluster_directory_mismatch');
  report.cluster_directory_checked=!!dataDirectory;
  const version=Number(psql('show server_version_num;','postgres'));
  if(![17,18].includes(Math.floor(version/10000)))throw new Error('native_postgres_major_refused');
  report.postgres_version_num=version;
  check('cible_initialement_absente',psql('select count(*) from pg_database where datname='+lit(database)+';','postgres')==='0');
  psql('create database '+database+';','postgres');created=true;
  psql('comment on database '+database+' is '+lit(marker)+';','postgres');
  psql(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,metadata jsonb,owner uuid,owner_id text);
    create table profiles(id text primary key,avatar_url text,passions jsonb);
    create table posts(id text primary key,owner_id text references profiles(id),media_url text,content text,shared_data text,n numeric);
    create table conv_messages(id text primary key,content text);
    create table reglages_distants(cle text primary key,valeur jsonb,motif text);
    create table media_reservations(id text primary key);
    create table media_assets(id text primary key);
    create table media_objects(id text primary key);
    create function refuser_client() returns trigger language plpgsql as $$begin raise exception 'synthetic_client_trigger';end$$;
    create trigger refuser_client before insert on posts for each row execute function refuser_client();`);
  const source='https://ssssssssssssssssssss.supabase.co',cible='https://dddddddddddddddddddd.supabase.co';
  const publicKey='content/photos/u/image.png',privateKey='attachments/attachments/conv/document.pdf';
  const url=source+'/storage/v1/object/public/'+publicKey,target=cible+url.slice(source.length);
  const signed=source+'/storage/v1/object/sign/'+privateKey+'?token=PORTEUR_SYNTHETIQUE_SOURCE';
  const rows={profiles:'{"id":"u","avatar_url":'+JSON.stringify(url)+',"passions":[{"photoUrl":'+JSON.stringify(url)+'}]}',
    posts:'{"id":"p","owner_id":"u","media_url":'+JSON.stringify(url)+',"content":'+JSON.stringify(url)+',"shared_data":'+JSON.stringify('{"media":'+JSON.stringify(url)+',"n":2906581903110193585}')+',"n":2906581903110193585}',
    conv_messages:JSON.stringify({id:'m',content:JSON.stringify({type:'doc',url:signed,text:signed})}),
    media_reservations:'',media_assets:'',media_objects:'',
    reglages_distants:'{"cle":"medias_proteges","valeur":{"actif":true},"motif":"source active"}\n'
      +'{"cle":"autre","valeur":{"n":2906581903110193585,"actif":true},"motif":"conserver"}'};
  const seaux=[{id:'content',name:'content',public:true,file_size_limit:27262976,allowed_mime_types:null},
    {id:'attachments',name:'attachments',public:false,file_size_limit:27262976,allowed_mime_types:null}];
  const objets={},owners={};
  for(const key of [publicKey,privateKey]) {
    const bytes=Buffer.from('AAA'),md5=createHash('md5').update(bytes).digest('hex');objets[key]={taille:bytes.length,md5};owners[key]={owner:null,owner_id:null};
    const f=path.join(archive,'_storage',...key.split('/'));mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,bytes);
    const split=key.indexOf('/');psql('insert into storage.objects values ('+lit(key.slice(0,split))+','+lit(key.slice(split+1))+','+lit(JSON.stringify({size:3,eTag:md5}))+'::jsonb,null,null);');
  }
  const index=JSON.stringify({format:'passio-index-medias/1',total:2,objets}),inventaire=JSON.stringify({format:'passio-proprietaires/1',total:2,objets:owners});
  const ddl='begin;\n'+ETAPES.find(e=>e.titre==='Seaux de stockage').rendu(seaux).join('\n')+'\ncommit;\n';
  writeFileSync(path.join(archive,'_storage_index.json'),index);writeFileSync(path.join(archive,'_storage_proprietaires.json'),inventaire);writeFileSync(path.join(archive,'schema.sql'),ddl);
  const man={projet:source,schema_sha256:sha(ddl),tables:{},medias:{fichiers:2,index_sha256:sha(index),proprietaires_sha256:sha(inventaire),proprietaires_lus:2}};
  for(const [t,ligne]of Object.entries(rows)){writeFileSync(path.join(archive,t+'.ndjson'),ligne?ligne+'\n':'');man.tables[t]={exporte:ligne.split('\n').filter(Boolean).length,tri:t==='reglages_distants'?'cle':'id'};}
  for(const b of seaux)psql('insert into storage.buckets values ('+lit(b.id)+','+lit(b.name)+','+b.public+','+b.file_size_limit+',null);');
  const ctx={archive,man,url:cible,ref:'dddddddddddddddddddd',jeton:'sbp_synthetic',cle:'synthetic'};
  const empreintes=Object.fromEntries(Object.keys(rows).map(t=>[t,sha(readFileSync(path.join(archive,t+'.ndjson')))]));
  let ecritures=0;
  globalThis.fetch=async(u,init={})=>{
    if(String(u).startsWith(cible+'/rest/v1/')) {
      const table=new URL(u).pathname.split('/').pop();if(!Object.hasOwn(rows,table))throw new Error('native_rest_table_refused');
      return new Response(lireTexte('select * from public."'+table+'" order by '+(table==='reglages_distants'?'cle':'id')));
    }
    if(u!=='https://api.supabase.com/v1/projects/dddddddddddddddddddd/database/query')throw new Error('native_network_refused');
    const body=JSON.parse(init.body);let q=body.query;
    for(let i=(body.parameters?.length||0);i>0;i--)q=q.replaceAll('$'+i,lit(body.parameters[i-1]));
    const readonly=body.read_only===true;
    if(!readonly&&!/^\s*select\b/i.test(q))ecritures++;
    if(/^\s*select\b/i.test(q)) {
      const wrapped='select coalesce(json_agg(x),\'[]\') from ('+q.replace(/;\s*$/,'')+') x;';
      return new Response(psql((readonly?'begin read only;\n':'')+wrapped+(readonly?'\ncommit;':'')));
    }
    if(readonly)throw new Error('native_readonly_write_refused');
    psql(q);return new Response('[]');
  };
  check('activation_source_active',JSON.parse(rows.reglages_distants.split('\n')[0]).valeur.actif===true);
  check('garde_initiale_absente',await R._phases.preparerRepriseMedias(ctx)==='ABSENTE');
  check('archive_validee',R._phases.validerArchive(ctx).ok);
  for(const table of Object.keys(rows))check('chargement_'+table,(await R._phases.chargerTable(ctx,table,{notes:[],refus:[]})).lignes===man.tables[table].exporte);
  check('post_media_cible',lire('select media_url from posts')[0].media_url===target);
  check('texte_libre_source_conserve',lire('select content from posts')[0].content===url);
  check('numeric_exact',lire('select n::text from posts')[0].n==='2906581903110193585');
  check('partage_nombre_exact',lire('select shared_data from posts')[0].shared_data.includes('2906581903110193585'));
  const message=JSON.parse(lire('select content from conv_messages')[0].content);
  check('piece_jointe_sans_token',message.url===cible+'/storage/v1/object/authenticated/'+privateKey);
  check('piece_jointe_texte_libre',message.text===signed);
  check('profil_et_passion_cibles',lire('select avatar_url,passions from profiles')[0].passions[0].photoUrl===target);
  check('trigger_reactive',lire("select tgenabled from pg_trigger where tgname='refuser_client'")[0].tgenabled==='O');
  check('activation_importee_fermee',lire("select valeur from reglages_distants where cle='medias_proteges'")[0].valeur.actif===false);
  check('autre_reglage_nombre_exact',lire("select valeur->>'n' as n from reglages_distants where cle='autre'")[0].n==='2906581903110193585');
  check('autre_reglage_bool_preserve',lire("select valeur from reglages_distants where cle='autre'")[0].valeur.actif===true);
  check('verdict_positif_projete',await R._phases.verdict(ctx));
  psql('update posts set media_url='+lit(url)+';');
  check('verdict_refuse_source_residuelle',!await R._phases.verdict(ctx));
  psql('update posts set media_url='+lit(target)+';');
  psql(`update reglages_distants set valeur='{"actif":true}'::jsonb where cle='medias_proteges';`);
  check('verdict_refuse_activation_cible',!await R._phases.verdict(ctx));
  let avant=ecritures,refus=null;
  try{await R._phases.tables(ctx);}catch(e){refus=e.message;}
  check('cible_active_refuse_tables_avant_write',refus==='Reprise médias fermés : CIBLE_ACTIVE'&&ecritures===avant);
  writeFileSync(path.join(archive,'_auth_users.ndjson'),JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid'})+'\n');
  avant=ecritures;refus=null;
  try{await R._phases.comptes(ctx);}catch(e){refus=e.message;}
  check('cible_active_refuse_auth_avant_write',refus==='Reprise médias fermés : CIBLE_ACTIVE'&&ecritures===avant);
  psql(`update reglages_distants set valeur='{"actif":"false"}'::jsonb where cle='medias_proteges';`);
  avant=ecritures;refus=null;
  try{await R._phases.tables(ctx);}catch(e){refus=e.message;}
  check('cible_malformee_refuse_avant_write',refus==='Reprise médias fermés : CIBLE_REGLAGE_INVALIDE'&&ecritures===avant);
  for(const t of Object.keys(rows))check('archive_immuable_'+t,sha(readFileSync(path.join(archive,t+'.ndjson')))===empreintes[t]);
  report.ok=true;
} catch(e) {report.ok=false;report.erreur=e.message;process.exitCode=1;}
finally {
  globalThis.fetch=originalFetch;
  if(created)try {
    if(psql('select shobj_description(oid,\'pg_database\') from pg_database where datname='+lit(database)+';','postgres')!==marker)throw new Error('native_cleanup_marker_mismatch');
    psql('drop database '+database+';','postgres');
    report.nettoyage_absence=psql('select count(*) from pg_database where datname='+lit(database)+';','postgres')==='0';
  }catch(e){report.nettoyage_absence=false;report.erreur_nettoyage=e.message;process.exitCode=1;}
  if(path.dirname(path.resolve(archive))!==path.resolve(tmpdir())||!path.basename(archive).startsWith('passio-reprise-urls-native-'))throw new Error('native_temp_cleanup_target_refused');
  rmSync(archive,{recursive:true,force:true});
  report.ok=report.ok&&report.nettoyage_absence===true;
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
