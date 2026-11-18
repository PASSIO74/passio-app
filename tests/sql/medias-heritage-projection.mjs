// Sur la seule base synthétique possédée par le runner ; aucun transport propre.
import {readFileSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export function verifierProjectionHeritage({sql,root}){
 const migration=readFileSync(path.join(root,'migrations/migration_projection_medias_herites_2026-11-18.sql'),'utf8');
 const ancienFlag=sql("select valeur::text from public.reglages_distants where cle='medias_proteges';").text;
 const avant=sql("select md5(pg_get_functiondef('public.media_lier_source()'::regprocedure));").text;
 const uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0'),sid=n=>'91000000-0000-4000-8000-'+String(n).padStart(12,'0'),aid=n=>'92000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const quote=s=>"'"+s.replaceAll("'","''")+"'",sha=s=>createHash('sha256').update(s).digest('hex');
 const old=n=>'https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/'+uid(n)+'/projection-synthetique.webp';
 const refs=[1,2].map(n=>({id:'heritage_projection_'+n,reference_sha256:sha(old(n))}));
 const compte=rs=>'select count(*) from public.media_projeter_heritage('+quote(JSON.stringify(rs))+'::jsonb);';
 function lire(n,q){return sql('begin;set local role '+(n?'authenticated':'anon')+';set local request.jwt.claims='+quote(JSON.stringify(n?{sub:uid(n),role:'authenticated',session_id:sid(n)}:{}))+';'+q+'rollback;').text;}
 function cas(nom,obtenu,attendu){sql('select banc_medias.cas('+quote('projection heritage '+nom)+','+quote(obtenu)+','+quote(attendu)+');');}
 try{
  sql(migration);
  sql("update public.reglages_distants set valeur='{\"actif\":true}' where cle='medias_proteges';");
  for(const n of [1,2,3])sql(`insert into auth.users(id,email) values('${uid(n)}','projection-${n}@invalid.test');
   insert into public.profiles(id,username,is_private) values('${uid(n)}','projection_${n}',${n===1});
   insert into auth.sessions(id,user_id) values('${sid(n)}','${uid(n)}');`);
  sql(`insert into public.follows(follower_id,following_id,status) values('${uid(3)}','${uid(1)}','pending');
   begin;set local request.jwt.claims=${quote(JSON.stringify({sub:uid(1),role:'authenticated',session_id:sid(1)}))};set local role authenticated;
   update public.follows set status='accepted' where follower_id='${uid(3)}' and following_id='${uid(1)}';commit;`);
  for(const n of [1,2])sql(`insert into public.posts(id,author_id,media_url) values('heritage_projection_${n}','${uid(n)}',${quote(old(n))});
   insert into storage.objects(id,bucket_id,name,owner,owner_id,metadata) values('${uid(100+n)}','content-protected','${uid(n)}/${aid(n)}/original.webp','${uid(n)}','${uid(n)}','{"mimetype":"image/webp","size":8}');
   insert into public.media_reservations(id,owner_id,source_type,source_id,variants,created_at,expires_at,linked_at)
    values('${aid(n)}','${uid(n)}','posts','heritage_projection_${n}','[{"variant":"original","mime_type":"image/webp","byte_size":8}]',statement_timestamp(),statement_timestamp()+interval '15 minutes',statement_timestamp());
   insert into public.media_assets(id,owner_id,post_id,heritage_ref_sha256) values('${aid(n)}','${uid(n)}','heritage_projection_${n}','${sha(old(n))}');
   insert into public.media_objects(asset_id,variant,storage_object_id,object_key,mime_type,byte_size) values('${aid(n)}','original','${uid(100+n)}','${uid(n)}/${aid(n)}/original.webp','image/webp',8);`);
  cas('proprietaire prive',lire(1,compte([refs[0]])),'1');cas('proprietaire public',lire(2,compte([refs[1]])),'1');
  cas('destinataire normal',lire(3,compte(refs)),'2');cas('visiteur public',lire(null,compte([refs[1]])),'1');
  cas('ancienne reference differente',lire(1,compte([{...refs[0],reference_sha256:'0'.repeat(64)}])),'0');
  cas('invoker',sql("select (not prosecdef)::text from pg_proc where oid='public.media_projeter_heritage(jsonb)'::regprocedure;").text,'true');
  cas('pas de droit ecriture',sql("select has_column_privilege('authenticated','public.media_assets','heritage_ref_sha256','UPDATE')::text;").text,'false');
  cas('validateur inchange',sql("select md5(pg_get_functiondef('public.media_lier_source()'::regprocedure));").text,avant);
  const rejeu=sql(migration,{failure:true});cas('rejeu ferme',String(rejeu.status!==0&&rejeu.error.includes('42501')),'true');
  sql("update public.reglages_distants set valeur='{\"actif\":false}' where cle='medias_proteges';");cas('coupure effective',lire(1,compte([refs[0]])),'0');
 }finally{sql('update public.reglages_distants set valeur='+quote(ancienFlag)+'::jsonb where cle=\'medias_proteges\';');}
}
