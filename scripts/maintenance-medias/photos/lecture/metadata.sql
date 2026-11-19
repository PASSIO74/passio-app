WITH
g AS MATERIALIZED (
 SELECT pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' AS ro,
  (SELECT r.rolsuper OR r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname OPERATOR(pg_catalog.=) current_user) AS bypass,
  (pg_catalog.current_schemas(true))[1] OPERATOR(pg_catalog.=) 'pg_catalog'::pg_catalog.name AS path_ok,
  EXISTS(SELECT FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('storage.objects') AND c.relkind OPERATOR(pg_catalog.=) 'r' AND NOT c.relispartition AND NOT c.relhassubclass) AS objects_ok,
  EXISTS(SELECT FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('storage.buckets') AND c.relkind OPERATOR(pg_catalog.=) 'r' AND NOT c.relispartition AND NOT c.relhassubclass) AS buckets_ok,
  NOT EXISTS(SELECT FROM (VALUES ('storage.objects','bucket_id',25),('storage.objects','name',25),('storage.objects','owner',2950),('storage.buckets','id',25),('storage.buckets','public',16)) v(t,c,typ)
   WHERE NOT EXISTS(SELECT FROM pg_catalog.pg_attribute a WHERE a.attrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass(v.t) AND a.attname OPERATOR(pg_catalog.=) v.c AND a.atttypid OPERATOR(pg_catalog.=) v.typ::pg_catalog.oid AND a.attnum OPERATOR(pg_catalog.>) 0 AND NOT a.attisdropped)) AS cols_ok
), fonctions AS MATERIALIZED (
 SELECT v.signature,p.*,l.lanname FROM (VALUES ('auth.uid()'),('storage.foldername(text)'),('public.is_conv_member(text,text)')) v(signature)
 LEFT JOIN pg_catalog.pg_proc p ON p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(v.signature)
 LEFT JOIN pg_catalog.pg_language l ON l.oid OPERATOR(pg_catalog.=) p.prolang
), types_autorises AS MATERIALIZED (
 SELECT t.oid FROM pg_catalog.pg_type t
 JOIN pg_catalog.pg_proc o ON o.oid OPERATOR(pg_catalog.=) t.typoutput
 LEFT JOIN pg_catalog.pg_proc m ON m.oid OPERATOR(pg_catalog.=) t.typmodout
 WHERE t.typnamespace OPERATOR(pg_catalog.=) 'pg_catalog'::pg_catalog.regnamespace
  AND t.oid OPERATOR(pg_catalog.=) ANY(ARRAY[16,17,18,19,20,21,23,25,26,1000,1005,1007,1009,1016,1043,1700,2950,2951]::pg_catalog.oid[])
  AND o.pronamespace OPERATOR(pg_catalog.=) 'pg_catalog'::pg_catalog.regnamespace
  AND (t.typmodout OPERATOR(pg_catalog.=) 0 OR m.pronamespace OPERATOR(pg_catalog.=) 'pg_catalog'::pg_catalog.regnamespace)
), policies0 AS MATERIALIZED (
 SELECT p.* FROM pg_catalog.pg_policy p
 WHERE p.polrelid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('storage.objects')
  AND p.polcmd OPERATOR(pg_catalog.=) ANY(ARRAY['r','*']::pg_catalog."char"[])
), liens AS MATERIALIZED (
 SELECT DISTINCT d.objid AS policy_oid,d.refobjid AS fonction_oid
 FROM pg_catalog.pg_depend d JOIN policies0 p ON p.oid OPERATOR(pg_catalog.=) d.objid
 WHERE d.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_policy'::pg_catalog.regclass
  AND d.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_proc'::pg_catalog.regclass
), policies AS MATERIALIZED (
 SELECT p.*,
  NOT EXISTS(SELECT FROM pg_catalog.pg_depend d WHERE d.classid OPERATOR(pg_catalog.=) 'pg_catalog.pg_policy'::pg_catalog.regclass AND d.objid OPERATOR(pg_catalog.=) p.oid
    AND d.refclassid OPERATOR(pg_catalog.=) 'pg_catalog.pg_type'::pg_catalog.regclass AND NOT EXISTS(SELECT FROM types_autorises t WHERE t.oid OPERATOR(pg_catalog.=) d.refobjid))
  AND NOT EXISTS(SELECT FROM pg_catalog.regexp_matches(coalesce(p.polqual::pg_catalog.text,'')||'|'||coalesce(p.polwithcheck::pg_catalog.text,''),
    ':(consttype|vartype|paramtype|resulttype|funcresulttype|opresulttype|casetype|coalescetype|array_typeid|element_typeid|row_typeid) ([0-9]+)','g') m
    WHERE NOT EXISTS(SELECT FROM types_autorises t WHERE t.oid OPERATOR(pg_catalog.=) m[2]::pg_catalog.oid)) AS types_ok,
  NOT EXISTS(SELECT FROM liens d LEFT JOIN fonctions f ON f.oid OPERATOR(pg_catalog.=) d.fonction_oid
   WHERE d.policy_oid OPERATOR(pg_catalog.=) p.oid AND (f.oid IS NULL OR f.pronargdefaults OPERATOR(pg_catalog.<>) 0 OR f.proallargtypes IS NOT NULL OR NOT (
    f.signature OPERATOR(pg_catalog.=) 'auth.uid()' AND f.proargtypes::pg_catalog.text OPERATOR(pg_catalog.=) '' AND f.prorettype OPERATOR(pg_catalog.=) 2950
    OR f.signature OPERATOR(pg_catalog.=) 'storage.foldername(text)' AND f.proargtypes::pg_catalog.text OPERATOR(pg_catalog.=) '25' AND f.prorettype OPERATOR(pg_catalog.=) 1009
    OR f.signature OPERATOR(pg_catalog.=) 'public.is_conv_member(text,text)' AND f.proargtypes::pg_catalog.text OPERATOR(pg_catalog.=) '25 25' AND f.prorettype OPERATOR(pg_catalog.=) 16))) AS fonctions_ok
 FROM policies0 p ORDER BY p.polname LIMIT 17
)
SELECT pg_catalog.jsonb_build_object(
 'format','passio-storage-reference-metadata/1','cible','njkiyoklssvefstljemx',
 'catalogue_observe_sha256',CASE WHEN g.path_ok THEN pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.concat_ws('
',
 coalesce((SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',p.polname::pg_catalog.text,p.polcmd::pg_catalog.text,p.polroles::pg_catalog.text,p.polpermissive::pg_catalog.text,coalesce(p.polqual::pg_catalog.text,''),coalesce(p.polwithcheck::pg_catalog.text,'')),'
' ORDER BY p.polname) FROM pg_catalog.pg_policy p WHERE p.polrelid OPERATOR(pg_catalog.=) 'storage.objects'::pg_catalog.regclass),''),
 coalesce((SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',p.proname::pg_catalog.text,p.proargtypes::pg_catalog.text,p.prosrc,p.prosecdef::pg_catalog.text,coalesce(p.proconfig::pg_catalog.text,''),coalesce(p.proacl::pg_catalog.text,'')),'
' ORDER BY p.proname,p.oid) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) p.pronamespace WHERE n.nspname OPERATOR(pg_catalog.=) 'public' AND (p.proname OPERATOR(pg_catalog.~~) 'media_heritage_%' OR p.proname IN ('storage_chemin_autorise','suppression_de_mon_compte','quota_stockage_ok'))),''),
 coalesce((SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',t.tgname::pg_catalog.text,t.tgenabled::pg_catalog.text,t.tgtype::pg_catalog.text,t.tgfoid::pg_catalog.text),'
' ORDER BY t.tgrelid,t.tgname) FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN ('storage.objects'::pg_catalog.regclass,'public.posts'::pg_catalog.regclass,'public.stories'::pg_catalog.regclass) AND NOT t.tgisinternal AND t.tgname OPERATOR(pg_catalog.~~) 'media_heritage_%'),''),
 (SELECT pg_catalog.concat_ws('|',c.relrowsecurity::pg_catalog.text,c.relforcerowsecurity::pg_catalog.text) FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) 'storage.objects'::pg_catalog.regclass),
 (SELECT pg_catalog.string_agg(pg_catalog.concat_ws('|',r.rolname::pg_catalog.text,r.rolsuper::pg_catalog.text,r.rolbypassrls::pg_catalog.text),'
' ORDER BY r.rolname) FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated'))
 ),'UTF8')),'hex') ELSE NULL END,
 'lecture_seule',g.ro,'role_bypass',g.bypass,'search_path_catalogue_premier',g.path_ok,'objets_ordinaire',g.objects_ok,'bucket_ordinaire',g.buckets_ok,'colonnes_builtin',g.cols_ok,
 'rls',coalesce((SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('storage.objects')),false),
 'force_rls',coalesce((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('storage.objects')),false),
 'bucket_candidat',CASE WHEN g.ro AND g.bypass AND g.path_ok AND g.objects_ok AND g.buckets_ok AND g.cols_ok THEN
   CASE WHEN NOT EXISTS(SELECT FROM ONLY storage.buckets WHERE id OPERATOR(pg_catalog.=) 'content-heritage-prive'::pg_catalog.text) THEN 'ABSENT'
    WHEN (SELECT public IS FALSE FROM ONLY storage.buckets WHERE id OPERATOR(pg_catalog.=) 'content-heritage-prive'::pg_catalog.text) THEN 'PRIVE' ELSE 'PUBLIC' END ELSE 'INDETERMINE' END,
 'policies_total',(SELECT pg_catalog.count(*)::pg_catalog.int4 FROM policies0),
 'policies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'identite',CASE WHEN p.polname OPERATOR(pg_catalog.=) ANY(ARRAY['passio_content_read','passio_attachments_read_membre','media_protected_select_closed']) THEN p.polname::pg_catalog.text ELSE 'AUTRE:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.polname::pg_catalog.text,'UTF8')),'hex') END,
  'commande',CASE WHEN p.polcmd OPERATOR(pg_catalog.=) 'r' THEN 'SELECT' ELSE 'ALL' END,'permissive',p.polpermissive,
  'roles',(SELECT pg_catalog.jsonb_agg(CASE WHEN x OPERATOR(pg_catalog.=) 0 THEN 'PUBLIC' WHEN r.rolname OPERATOR(pg_catalog.=) ANY(ARRAY['anon','authenticated','service_role']) THEN r.rolname::pg_catalog.text ELSE 'AUTRE:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(x::pg_catalog.text,'UTF8')),'hex') END ORDER BY x) FROM pg_catalog.unnest(p.polroles) x LEFT JOIN pg_catalog.pg_roles r ON r.oid OPERATOR(pg_catalog.=) x),
  'types_builtin',p.types_ok,'fonctions_sures_pour_deparse',p.fonctions_ok,
  'qual_sha256',CASE WHEN g.path_ok AND p.types_ok AND p.fonctions_ok AND p.polname OPERATOR(pg_catalog.=) ANY(ARRAY['passio_content_read','passio_attachments_read_membre','media_protected_select_closed']) AND pg_catalog.octet_length(coalesce(p.polqual::pg_catalog.text,'')) OPERATOR(pg_catalog.<=) 16384
    THEN pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid),E'\r\n',E'\n'),'UTF8')),'hex') ELSE NULL END,
  'check_sha256',CASE WHEN g.path_ok AND p.types_ok AND p.fonctions_ok AND p.polname OPERATOR(pg_catalog.=) ANY(ARRAY['passio_content_read','passio_attachments_read_membre','media_protected_select_closed']) AND pg_catalog.octet_length(coalesce(p.polwithcheck::pg_catalog.text,'')) OPERATOR(pg_catalog.<=) 16384
    THEN pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),E'\r\n',E'\n'),'UTF8')),'hex') ELSE NULL END,
  'fonctions_directes',(SELECT coalesce(pg_catalog.jsonb_agg(coalesce(f.signature,'AUTRE:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(d.fonction_oid::pg_catalog.text,'UTF8')),'hex')) ORDER BY d.fonction_oid),'[]'::pg_catalog.jsonb) FROM liens d LEFT JOIN fonctions f ON f.oid OPERATOR(pg_catalog.=) d.fonction_oid WHERE d.policy_oid OPERATOR(pg_catalog.=) p.oid)
 ) ORDER BY p.polname),'[]'::pg_catalog.jsonb) FROM policies p),
 'roles_clients',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',v.nom,'present',r.oid IS NOT NULL,'superuser',coalesce(r.rolsuper,false),'bypass',coalesce(r.rolbypassrls,false),
  'owner_accessible',coalesce(pg_catalog.pg_has_role(r.oid,(SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid OPERATOR(pg_catalog.=) pg_catalog.to_regclass('storage.objects')),'MEMBER'),false),
  'role_privilegie_accessible',EXISTS(SELECT FROM pg_catalog.pg_roles b WHERE (b.rolsuper OR b.rolbypassrls) AND pg_catalog.pg_has_role(r.oid,b.oid,'MEMBER')),
  'select_table',coalesce(pg_catalog.has_table_privilege(r.oid,pg_catalog.to_regclass('storage.objects'),'SELECT'),false),
  'select_colonne',coalesce(pg_catalog.has_any_column_privilege(r.oid,pg_catalog.to_regclass('storage.objects'),'SELECT'),false)) ORDER BY v.nom)
  FROM (VALUES ('anon'),('authenticated')) v(nom) LEFT JOIN pg_catalog.pg_roles r ON r.rolname OPERATOR(pg_catalog.=) v.nom),
 'fonctions_documentaires',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('signature',f.signature,'presente',f.oid IS NOT NULL,
  'source_sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(f.prosrc,E'\r\n',E'\n'),'UTF8')),'hex'),
  'sql',coalesce(f.lanname OPERATOR(pg_catalog.=) 'sql',false),'stable',coalesce(f.provolatile OPERATOR(pg_catalog.=) 's',false),'volatilite',f.provolatile::pg_catalog.text,'security_definer',coalesce(f.prosecdef,false),
  'arguments_oid',f.proargtypes::pg_catalog.text,'retour_oid',f.prorettype::pg_catalog.int4,'defaults',f.pronargdefaults,'search_path_vide',coalesce('search_path=""' OPERATOR(pg_catalog.=) ANY(f.proconfig) OR 'search_path=' OPERATOR(pg_catalog.=) ANY(f.proconfig),false)) ORDER BY f.signature) FROM fonctions f)
) AS metadata FROM g
