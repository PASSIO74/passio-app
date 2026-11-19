import {DEST,REF,UUID,cle,refuser} from './cadre.mjs';
export const utf8=s=>{if(typeof s!=='string'||Buffer.byteLength(s)>8192||s.includes('\0'))refuser('FORME');return `pg_catalog.convert_from(pg_catalog.decode('${Buffer.from(s).toString('hex')}','hex'),'UTF8')`;};
const definitions={
 'storage.objects':[['id',2950],['bucket_id',25],['name',25],['version',25],['owner',2950],['owner_id',25],['metadata',3802]],
 'storage.buckets':[['id',25],['public',16]],'auth.users':[['id',2950]],'public.profiles':[['id',25]],'public.comptes_en_suppression':[['user_id',25],['statut',25]],
};
const gardes=`SELECT pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' AS ro,
 (SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname OPERATOR(pg_catalog.=) current_user) AS bypass,
 NOT EXISTS(SELECT 1 FROM (VALUES ${Object.keys(definitions).map(t=>`('${t}')`).join(',')}) v(n)
 WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(v.n) AND c.relkind OPERATOR(pg_catalog.=) 'r' AND NOT c.relispartition AND NOT c.relhassubclass))
 AND NOT EXISTS(SELECT 1 FROM (VALUES ${Object.entries(definitions).flatMap(([t,cols])=>cols.map(([c,oid])=>`('${t}','${c}',${oid})`)).join(',')}) v(t,c,oid)
 WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(v.t) AND a.attname OPERATOR(pg_catalog.=) v.c AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped AND a.atttypid OPERATOR(pg_catalog.=) v.oid::pg_catalog.oid)) AS structure_ok`;
// Empreintes de catalogue direct uniquement : aucun déparseur, corps retourné,
// fonction utilisateur invoquée ou valeur de secret. Le SHA attendu reste à
// établir/revoir par le futur prévol ; un SHA saisi n'est pas cette preuve.
 const catalogue=`pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.concat_ws('\n',
 coalesce((SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',p.polname::pg_catalog.text,p.polcmd::pg_catalog.text,p.polroles::pg_catalog.text,p.polpermissive::pg_catalog.text,coalesce(p.polqual::pg_catalog.text,''),coalesce(p.polwithcheck::pg_catalog.text,'')),'\n' ORDER BY p.polname) FROM pg_catalog.pg_policy p WHERE p.polrelid OPERATOR(pg_catalog.=) 'storage.objects'::pg_catalog.regclass),''),
 coalesce((SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',p.proname::pg_catalog.text,p.proargtypes::pg_catalog.text,p.prosrc,p.prosecdef::pg_catalog.text,coalesce(p.proconfig::pg_catalog.text,''),coalesce(p.proacl::pg_catalog.text,'')),'\n' ORDER BY p.proname,p.oid) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) p.pronamespace WHERE n.nspname OPERATOR(pg_catalog.=) 'public' AND (p.proname OPERATOR(pg_catalog.~~) 'media_heritage_%' OR p.proname IN ('storage_chemin_autorise','suppression_de_mon_compte','quota_stockage_ok'))),''),
 coalesce((SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',t.tgname::pg_catalog.text,t.tgenabled::pg_catalog.text,t.tgtype::pg_catalog.text,t.tgfoid::pg_catalog.text),'\n' ORDER BY t.tgrelid,t.tgname) FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN ('storage.objects'::pg_catalog.regclass,'public.posts'::pg_catalog.regclass,'public.stories'::pg_catalog.regclass) AND NOT t.tgisinternal AND t.tgname OPERATOR(pg_catalog.~~) 'media_heritage_%'),''),
 (SELECT pg_catalog.concat_ws('|',c.relrowsecurity::pg_catalog.text,c.relforcerowsecurity::pg_catalog.text) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) 'storage.objects'::pg_catalog.regclass),
 (SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',r.rolname::pg_catalog.text,r.rolsuper::pg_catalog.text,r.rolbypassrls::pg_catalog.text),'\n' ORDER BY r.rolname) FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated'))
 ),'UTF8')),'hex')`;
export const SQL_PREFLIGHT=`WITH g AS (${gardes}) SELECT pg_catalog.jsonb_build_object('ro',g.ro,'bypass',g.bypass,'structure_ok',g.structure_ok,
 'catalogue_fp',${catalogue},'privacy_catalogue',NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated') AND (r.rolsuper OR r.rolbypassrls))
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) 'storage.objects'::pg_catalog.regclass AND c.relrowsecurity),
 'bucket',CASE WHEN g.ro AND g.bypass AND g.structure_ok THEN pg_catalog.jsonb_build_object(
 'nombre',(SELECT pg_catalog.count(*) FROM ONLY storage.buckets b WHERE b.id OPERATOR(pg_catalog.=) '${DEST}'),
 'prive',(SELECT b.public IS FALSE FROM ONLY storage.buckets b WHERE b.id OPERATOR(pg_catalog.=) '${DEST}'),
 'objets',(SELECT pg_catalog.count(*) FROM ONLY storage.objects s WHERE s.bucket_id OPERATOR(pg_catalog.=) '${DEST}')) ELSE NULL END) AS observation FROM g`;
const objet=a=>`pg_catalog.jsonb_build_object('id',${a}.id::pg_catalog.text,'bucket',${a}.bucket_id,'name',${a}.name,'version',${a}.version,'owner',${a}.owner::pg_catalog.text,'owner_id',${a}.owner_id,'mime',${a}.metadata OPERATOR(pg_catalog.->>) 'mimetype','size',${a}.metadata OPERATOR(pg_catalog.->>) 'size','etag',${a}.metadata OPERATOR(pg_catalog.->>) 'eTag')`;
export function sqlEtats(sources){
 if(!Array.isArray(sources)||sources.length<1||sources.length>14)refuser('FORME');
 const valeurs=sources.map(s=>{if(!UUID.test(s.id)||!UUID.test(s.owner)||s.owner!==s.owner_id||s.bucket!=='content')refuser('PROPRIETAIRE');return `('${s.id}'::pg_catalog.uuid,'${s.owner}'::pg_catalog.uuid,${utf8(s.owner_id)},${utf8(cle(s.name))})`;}).join(',');
 return `WITH g AS (${gardes}),p(id,owner,owner_id,name) AS (VALUES ${valeurs})
 SELECT pg_catalog.jsonb_build_object('ro',g.ro,'bypass',g.bypass,'structure_ok',g.structure_ok,'etats',CASE WHEN g.ro AND g.bypass AND g.structure_ok THEN
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('cle',p.name,'source',(SELECT ${objet('s')} FROM ONLY storage.objects s WHERE s.id OPERATOR(pg_catalog.=) p.id AND s.bucket_id OPERATOR(pg_catalog.=) 'content' AND s.name OPERATOR(pg_catalog.=) p.name),
 'destination',(SELECT ${objet('d')} FROM ONLY storage.objects d WHERE d.bucket_id OPERATOR(pg_catalog.=) '${DEST}' AND d.name OPERATOR(pg_catalog.=) p.name),
 'owner',pg_catalog.jsonb_build_object('auth',EXISTS(SELECT 1 FROM ONLY auth.users u WHERE u.id OPERATOR(pg_catalog.=) p.owner),
 'profil',EXISTS(SELECT 1 FROM ONLY public.profiles pr WHERE pr.id OPERATOR(pg_catalog.=) p.owner_id),
 'suppression_active',EXISTS(SELECT 1 FROM ONLY public.comptes_en_suppression c WHERE c.user_id OPERATOR(pg_catalog.=) p.owner_id AND c.statut IN ('en_cours','purgee','supprimee')))) ORDER BY p.name) FROM p) ELSE NULL END) AS observation FROM g`;
}
export function observation(rows){if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.observation)refuser('REPONSE_FORME');return rows[0].observation;}
export function validerEtats(x,n){if(x?.ro!==true||x.bypass!==true||x.structure_ok!==true||!Array.isArray(x.etats)||x.etats.length!==n)refuser('ETATS_REFUSES');return x.etats;}
export const routeManagement='/v1/projects/'+REF+'/database/query';
