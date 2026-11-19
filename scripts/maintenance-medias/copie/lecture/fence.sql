WITH d AS MATERIALIZED (select 'fonction:'||v.signature as identite,p.oid is not null as presente,
  pg_catalog.obj_description(p.oid,'pg_proc') as marque,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as empreinte,
  null::text as definition,null::text as etat,
  case when p.oid is null then false when v.signature in ('public.media_heritage_stockage_public(text,text)','public.media_heritage_ref_categorie(text)','public.media_heritage_refs(jsonb)') then
    not exists(select 1 from pg_catalog.pg_class c
      where c.oid in (pg_catalog.to_regclass('storage.objects'),pg_catalog.to_regclass('public.posts'),pg_catalog.to_regclass('public.stories'))
        and not pg_catalog.has_function_privilege(pg_catalog.pg_get_userbyid(c.relowner),p.oid,'EXECUTE'))
    else true end as proprietaires_ok,true as roles_ok
from (values ('public.media_heritage_stockage_public(text,text)','5fffeefbabb107c0724afd682331d7bb'),('public.media_heritage_ref_categorie(text)','5efdfd83881c420de19ac9c558dc10a2'),('public.media_heritage_refs(jsonb)','755aa2a97100d677a60f0b7050a5fd9c'),('public.media_heritage_stockage()','3c0fd7dc87072e1b997423a9f71cccdb'),('public.media_heritage_references()','f49cbb2b1a5e5b8bc7bd722d923841dc')) v(signature,attendue)
left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(v.signature)
union all
select 'policy:'||v.nom,p.oid is not null,pg_catalog.obj_description(p.oid,'pg_policy'),
  pg_catalog.md5(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'')||'|'||p.polcmd::text||'|'||p.polpermissive::text),
  null::text,null::text,true,p.polroles=array['authenticated'::pg_catalog.regrole::oid]
from (values ('media_heritage_insert','b63461b258283aa19bb3ea5f1aa01f5a'),('media_heritage_update','206de6743af1c940172428d941f39492')) v(nom,attendue)
left join pg_catalog.pg_policy p on p.polrelid=pg_catalog.to_regclass('storage.objects') and p.polname=v.nom
union all
select 'trigger:'||v.tableau||'.'||v.nom,t.oid is not null,pg_catalog.obj_description(t.oid,'pg_trigger'),
  pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid)),pg_catalog.pg_get_triggerdef(t.oid),t.tgenabled::text,true,true
from (values ('storage.objects','media_heritage_stockage','d3a91cb38d1af877ef2d734227594877'),('public.posts','media_heritage_references','be8128742749f087291aa8abd1f27917'),('public.stories','media_heritage_references','7b8048a59ac788218d20bba433dd04df')) v(tableau,nom,attendue)
left join pg_catalog.pg_trigger t on t.tgrelid=pg_catalog.to_regclass(v.tableau) and t.tgname=v.nom and not t.tgisinternal) SELECT pg_catalog.current_setting('transaction_read_only')='on' AS lecture_seule, count(*)=10 AND count(DISTINCT d.identite)=10 AND bool_and(d.presente IS TRUE AND (d.empreinte is distinct from (case d.identite when 'fonction:public.media_heritage_stockage_public(text,text)' then '5fffeefbabb107c0724afd682331d7bb' when 'fonction:public.media_heritage_ref_categorie(text)' then '5efdfd83881c420de19ac9c558dc10a2' when 'fonction:public.media_heritage_refs(jsonb)' then '755aa2a97100d677a60f0b7050a5fd9c' when 'fonction:public.media_heritage_stockage()' then '3c0fd7dc87072e1b997423a9f71cccdb' when 'fonction:public.media_heritage_references()' then 'f49cbb2b1a5e5b8bc7bd722d923841dc' when 'policy:media_heritage_insert' then 'b63461b258283aa19bb3ea5f1aa01f5a' when 'policy:media_heritage_update' then '206de6743af1c940172428d941f39492' when 'trigger:storage.objects.media_heritage_stockage' then 'd3a91cb38d1af877ef2d734227594877' when 'trigger:public.posts.media_heritage_references' then 'be8128742749f087291aa8abd1f27917' when 'trigger:public.stories.media_heritage_references' then '7b8048a59ac788218d20bba433dd04df' end)
        or d.roles_ok is distinct from true
        or (d.identite like 'trigger:%' and d.etat is distinct from (case when d.identite='trigger:storage.objects.media_heritage_stockage' then 'O' else 'A' end))
        or d.marque is distinct from (case when d.identite='trigger:storage.objects.media_heritage_stockage' then null::text else 'PASSIO protected-media heritage fence v1 2026-11-16' end) or not d.proprietaires_ok) IS FALSE) AS cloture_exacte, pg_catalog.has_table_privilege(current_user,'public.migrations_appliquees','SELECT') AND NOT pg_catalog.row_security_active('public.migrations_appliquees'::regclass) AND (SELECT count(*)=1 AND bool_and(empreinte='31f28ee35922ec2d8bd48ddee09ca1768ac38b2759d8b225f8e5c07b20112435' AND outil='appliquer-migration.mjs' AND statut='applique') FROM public.migrations_appliquees WHERE cible='njkiyoklssvefstljemx' AND fichier='migrations/migration_cloture_medias_herites_go_2026-11-16.sql') AS journal_cible FROM d