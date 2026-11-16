// Banc PostgreSQL local synthétique. Management/REST sont doublés par psql ;
// ce n'est pas une preuve HTTP Storage/Auth hébergée.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
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
  let ecritures=0,dernierEtatLo=null;
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
    let resultat;
    try { resultat=psql(q); }
    catch(e) {
      if(!q.includes('insert into')||!q.includes('lo_get('))throw e;
      dernierEtatLo=(e.message.match(/native_sql_failed_([A-Z0-9]{5})/)||[])[1]||null;
      if(!dernierEtatLo)throw e;
      return new Response('{}',{status:400});
    }
    return new Response(q.includes(" passio_lo")&&resultat?'[{"passio_lo":'+resultat+'}]':'[]');
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
  {
  // Compatibilité des triggers de clôture, sur le même PostgreSQL synthétique.
  // Les rôles de fixture ne sont créés que dans le cluster CI neuf attesté.
  for(const role of ['anon','authenticated','service_role']) {
    if(lire('select count(*)::int as n from pg_roles where rolname='+lit(role))[0].n===0) {
      if(!report.cluster_directory_checked)throw new Error('native_fixture_roles_require_owned_cluster');
      psql('create role "'+role+'" nologin;');
    }
  }
  psql(`update reglages_distants set valeur='{"actif":false}'::jsonb where cle='medias_proteges';
    create function reprise_refuser_client() returns trigger language plpgsql as $$begin raise exception 'synthetic_client_trigger';end$$;`);
  const nomSql=x=>'"'+x.replace(/"/g,'""')+'"';
  const nomsTriggers=['a"toujours','d_inactif','o_ordinaire','r_replica'];
  function definirEtats(table,modes=['A','D','O','R'],creer=true){
    for(let i=0;i<nomsTriggers.length;i++) {
      const nom=nomSql(nomsTriggers[i]);
      if(creer)psql('create trigger '+nom+' before insert on public.'+nomSql(table)+' for each row execute function reprise_refuser_client();');
      const action={A:'enable always',D:'disable',O:'enable',R:'enable replica'}[modes[i]];
      psql('alter table only public.'+nomSql(table)+' '+action+' trigger '+nom+';');
    }
  }
  const etats=table=>lire(`with recursive r(oid) as (select ${lit('public.'+nomSql(table))}::regclass::oid union select i.inhrelid from pg_inherits i join r on i.inhparent=r.oid)
    select t.tgrelid::regclass::text as relation,t.oid,t.tgname,t.tgenabled::text as etat,t.tgisinternal as interne
    from pg_trigger t where t.tgrelid in(select oid from r) order by t.oid`);
  const egaux=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  for(const t of ['reprise_tg_classique','reprise_tg_ligne','reprise_tg_lo']){
    psql('create table public.'+nomSql(t)+"(id text primary key,owner_id text references profiles(id),payload text check(left(payload,5)<>'refus'));");definirEtats(t);
  }
  psql("create table reprise_tg_parent(id text,payload text);create table reprise_tg_enfant() inherits(reprise_tg_parent);");
  definirEtats('reprise_tg_parent');definirEtats('reprise_tg_enfant',['D','R','A','O']);
  psql("create table reprise_tg_partition(id text primary key,payload text) partition by range(id);create table reprise_tg_p1 partition of reprise_tg_partition for values from('a') to('m');create table reprise_tg_p2 partition of reprise_tg_partition for values from('m') to('z');");
  definirEtats('reprise_tg_partition');definirEtats('reprise_tg_p1',['D','R','A','O'],false);definirEtats('reprise_tg_p2',['R','A','D','O'],false);
  const internesProfil=etats('profiles').filter(x=>x.interne),replicationAvant=psql("show session_replication_role;");
  const colonnes=['id','owner_id','payload'],payload="synthetic $r$ $$ $reprise_tg$ ' ",jsonLigne=JSON.stringify({id:'ok',owner_id:'u',payload});
  for(const [mode,table]of [['classique','reprise_tg_classique'],['ligne','reprise_tg_ligne']]){
    const avant=etats(table);psql((mode==='classique'?R.ordreInsert:R.ordreLigneALigne)(table,colonnes,'['+jsonLigne+']',['id']));
    check('triggers_'+mode+'_adro',egaux(avant,etats(table))&&avant.filter(x=>!x.interne).map(x=>x.etat).sort().join('')==='ADOR');
  }
  const journal=path.join(archive,'_journal_lo_triggers');mkdirSync(journal);
  const ctxLo={...ctx,man:{tables:{reprise_tg_lo:{}}},journalGrandsObjets:journal};
  const avantLo=etats('reprise_tg_lo');
  await R._phases.insererGrandObjet(ctxLo,'reprise_tg_lo',colonnes,JSON.stringify({id:'lo',owner_id:'u',payload:'x'.repeat(R.LOT_OCTETS+100)}),['id']);
  check('triggers_lo_adro',egaux(avantLo,etats('reprise_tg_lo'))&&avantLo.filter(x=>!x.interne).map(x=>x.etat).sort().join('')==='ADOR');
  check('triggers_nom_guillemet',avantLo.some(x=>x.tgname==='a"toujours'&&x.etat==='A'));
  check('triggers_payload_tokens_preserves',lire("select payload from reprise_tg_classique where id='ok'")[0].payload===payload);
  let avant=etats('reprise_tg_parent');psql(R.ordreInsert('reprise_tg_parent',['id','payload'],'[{"id":"parent","payload":"fixture"}]',[]));
  check('triggers_descendants_etats_differents',egaux(avant,etats('reprise_tg_parent'))&&avant.some(x=>x.relation==='reprise_tg_parent'&&x.tgname==='a"toujours'&&x.etat==='A')&&avant.some(x=>x.relation==='reprise_tg_enfant'&&x.tgname==='a"toujours'&&x.etat==='D'));
  avant=etats('reprise_tg_partition');psql(R.ordreInsert('reprise_tg_partition',['id','payload'],'[{"id":"b","payload":"fixture"},{"id":"n","payload":"fixture"}]',['id']));
  check('triggers_partitions_etats_differents',egaux(avant,etats('reprise_tg_partition'))&&avant.some(x=>x.relation==='reprise_tg_partition'&&x.tgname==='a"toujours'&&x.etat==='A')&&avant.some(x=>x.relation==='reprise_tg_p1'&&x.tgname==='a"toujours'&&x.etat==='D')&&avant.some(x=>x.relation==='reprise_tg_p2'&&x.tgname==='a"toujours'&&x.etat==='R')&&lire('select count(*)::int as n from reprise_tg_p1')[0].n===1&&lire('select count(*)::int as n from reprise_tg_p2')[0].n===1);
  function echecSql(q,etat){const r=spawnSync(client,['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-qtA','-v','ON_ERROR_STOP=1'],
    {env,input:'\\set VERBOSITY verbose\n'+q,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:4*1024*1024});return r.status===3&&(r.stderr.match(/ERROR:\s+([A-Z0-9]{5})/)||[])[1]===etat;}
  avant=etats('reprise_tg_classique');
  check('triggers_check_rollback',echecSql(R.ordreInsert('reprise_tg_classique',colonnes,'[{"id":"check","owner_id":"u","payload":"refus"}]',['id']),'23514')&&egaux(avant,etats('reprise_tg_classique')));
  avant=etats('reprise_tg_ligne');const refusLigne=psql(R.ordreLigneALigne('reprise_tg_ligne',colonnes,'[{"id":"check","owner_id":"u","payload":"refus"}]',['id']));
  check('triggers_ligne_refus_etats_preserves',/\|1$/.test(refusLigne)&&egaux(avant,etats('reprise_tg_ligne')));
  avant=etats('reprise_tg_classique');
  check('triggers_fk_rollback',echecSql(R.ordreInsert('reprise_tg_classique',colonnes,'[{"id":"fk","owner_id":"absent","payload":"fixture"}]',['id']),'23503')&&egaux(avant,etats('reprise_tg_classique')));
  let echecLo=false;try{await R._phases.insererGrandObjet(ctxLo,'reprise_tg_lo',colonnes,JSON.stringify({id:'refuslo',owner_id:'u',payload:'refus'+'x'.repeat(R.LOT_OCTETS+100)}),['id']);}catch(e){echecLo=e.message==='LO_HTTP_400'&&dernierEtatLo==='23514';report.lo_check_sqlstate=dernierEtatLo;report.lo_check_diagnostic=e.message==='LO_HTTP_400'?'LO_HTTP_400':'LO_ERREUR_INATTENDUE';}
  report.lo_check_states_preserved=egaux(avantLo,etats('reprise_tg_lo'));
  check('triggers_lo_check_rollback',echecLo&&egaux(avantLo,etats('reprise_tg_lo')));
  const holder=spawn(client,['-X','--no-password','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-qtA','-v','ON_ERROR_STOP=1'],{env,windowsHide:true,stdio:['pipe','ignore','ignore']});
  const finHolder=new Promise(resolve=>holder.once('exit',code=>resolve(code)));
  holder.stdin.end("set application_name='passio_reprise_lock';begin;lock table reprise_tg_classique in access exclusive mode;select pg_sleep(6);commit;");
  try{
    let pret=false;for(let i=0;i<50;i++){if(lire("select count(*)::int as n from pg_stat_activity where application_name='passio_reprise_lock' and wait_event='PgSleep'")[0].n===1){pret=true;break;}await new Promise(r=>setTimeout(r,20));}
    if(!pret)throw new Error('native_lock_holder_not_ready');
    avant=etats('reprise_tg_classique');const refuse=echecSql(R.ordreInsert('reprise_tg_classique',colonnes,'[{"id":"timeout","owner_id":"u","payload":"fixture"}]',['id']),'55P03');
    const holderOk=await finHolder;check('triggers_lock_timeout_rollback',refuse&&holderOk===0&&egaux(avant,etats('reprise_tg_classique')));
  }finally{if(holder.exitCode===null)holder.kill();}
  check('triggers_internes_fk_preserves',internesProfil.length>0&&egaux(internesProfil,etats('profiles').filter(x=>x.interne)));
  const roleSql=psql("show session_replication_role;"+R.ordreInsert('reprise_tg_classique',colonnes,'[{"id":"role","owner_id":"u","payload":"fixture"}]',['id'])+"show session_replication_role;");
  check('triggers_replication_role_inchange',replicationAvant==='origin'&&roleSql.split(/\r?\n/).filter(Boolean).join(',')==='origin,origin');
  check('triggers_lo_zero',psql('select count(*) from pg_largeobject_metadata;')==='0');
  check('triggers_journaux_nettoyes',readdirSync(journal).every(f=>JSON.parse(readFileSync(path.join(journal,f),'utf8')).etape==='nettoye'));
  check('triggers_fence_active_apres_commit',echecSql("insert into reprise_tg_classique values('client','u','fixture');",'P0001'));

  }
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
