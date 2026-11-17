-- Export des trois registres propres, sous le même snapshot que le socle et les rencontres.
-- Risque critique ; Codex. Dépend de migration_medias_proteges_go_2026-11-16.sql.
-- Aucune activation, aucun droit client nouveau, aucun objet Storage lu/modifié.
-- Sources réelles PROD/STAGING relevées readonly le16/11 : wrapper da359929fd5a986c06a481e322c5ab1c,
-- socle 81579ca946a5ae585e60ce3c6a29ccc6. Rejeu borné à la définition nouvelle exacte.
-- Retour arrière : conserver le bucket fermé ; ne pas supprimer les registres.
-- L'ancien export doit être présenté incomplet tant qu'il ne couvre pas ce périmètre.
begin;
set local search_path='';
set local lock_timeout='5s';
set local statement_timeout='30s';

do $guard$
declare
 t text; relation oid; colonnes text[]; attendues text[]; liaison record;
 wrapper oid := to_regprocedure('public.export_compte_instantane(text,integer,bigint)');
 socle oid := to_regprocedure('rencontres_prive.export_compte_socle(text,integer,bigint)');
begin
 if coalesce((select md5(pg_get_functiondef(wrapper))),'') not in ('da359929fd5a986c06a481e322c5ab1c','1ca6dbf6269c9441b83d8461fa8a1914')
    or coalesce((select md5(pg_get_functiondef(socle))),'') <> '81579ca946a5ae585e60ce3c6a29ccc6' then
   raise exception using errcode='55000',message='export_medias_definition_inconnue';
 end if;
 if exists(select 1 from pg_proc p where p.oid in (wrapper,socle)
     and (p.proowner <> 'postgres'::regrole or p.provolatile <> 's' or not p.prosecdef
       or p.proconfig is distinct from array['search_path=""']::text[]))
    or has_function_privilege('anon',wrapper,'execute') or has_function_privilege('authenticated',wrapper,'execute')
    or not has_function_privilege('service_role',wrapper,'execute') then
   raise exception using errcode='55000',message='export_medias_frontiere_inconnue';
 end if;
 foreach t in array array['media_reservations','media_assets','media_objects'] loop
   relation := to_regclass(format('public.%I',t));
   if relation is null or not exists(select 1 from pg_class c where c.oid=relation and c.relkind='r' and c.relrowsecurity)
      or obj_description(relation,'pg_class') is distinct from 'PASSIO protected-media v1 2026-11-16' then
     raise exception using errcode='55000',message='export_medias_registre_inconnu';
   end if;
   select array_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text order by a.attnum)
     into colonnes from pg_attribute a where a.attrelid=relation and a.attnum>0 and not a.attisdropped;
   attendues := case t
     when 'media_reservations' then array['id:uuid:true','owner_id:text:true','source_type:text:true','source_id:text:true',
       'variants:jsonb:true','created_at:timestamp with time zone:true','expires_at:timestamp with time zone:true','linked_at:timestamp with time zone:false']
     when 'media_assets' then array['id:uuid:true','owner_id:text:true','post_id:text:false','story_id:text:false','created_at:timestamp with time zone:true']
     else array['asset_id:uuid:true','variant:text:true','storage_object_id:uuid:true','bucket_id:text:true','object_key:text:true','mime_type:text:true','byte_size:bigint:true'] end;
   if colonnes is distinct from attendues or not exists(select 1 from pg_constraint c where c.conrelid=relation and c.contype='p'
     and (select array_agg(a.attname::text order by x.n) from unnest(c.conkey) with ordinality x(attnum,n)
       join pg_attribute a on a.attrelid=relation and a.attnum=x.attnum)
       = case t when 'media_objects' then array['asset_id','variant'] else array['id'] end) then
     raise exception using errcode='55000',message='export_medias_forme_inconnue';
   end if;
 end loop;
 for liaison in select * from (values
    ('media_reservations','owner_id','profiles','id'),('media_assets','owner_id','profiles','id'),
    ('media_assets','id','media_reservations','id'),('media_objects','asset_id','media_assets','id')) v(t,c,ref,rc) loop
   if not exists(select 1 from pg_constraint fk
     where fk.conrelid=to_regclass(format('public.%I',liaison.t)) and fk.contype='f' and fk.convalidated and fk.confdeltype='c'
       and fk.confrelid=to_regclass(format('public.%I',liaison.ref))
       and fk.conkey=array[(select a.attnum from pg_attribute a where a.attrelid=fk.conrelid and a.attname=liaison.c and not a.attisdropped)]::smallint[]
       and fk.confkey=array[(select a.attnum from pg_attribute a where a.attrelid=fk.confrelid and a.attname=liaison.rc and not a.attisdropped)]::smallint[]) then
     raise exception using errcode='55000',message='export_medias_liaison_inconnue';
   end if;
 end loop;
end $guard$;

CREATE OR REPLACE FUNCTION public.export_compte_instantane(p_uid text, p_plafond integer DEFAULT 5000, p_verrou bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare resultat jsonb; t text; filtre text; attendu bigint; lignes jsonb; source_sql text; ordre text;
 plafond integer := least(greatest(coalesce(p_plafond,5000),1),5000);
begin
 resultat := rencontres_prive.export_compte_socle(p_uid,plafond,p_verrou);
 foreach t in array array['inscriptions','accords','decisions','coorganisations_anterieures'] loop
   filtre := case t when 'coorganisations_anterieures' then 'valeur ? $1'
      when 'decisions' then 'user_id = $1 or decideur_id = $1' else 'user_id = $1' end;
   execute format('select count(*) from rencontres_prive.%I where %s',t,filtre) into attendu using p_uid;
   -- L'archive d'une coorganisation n'exporte jamais les identifiants des tiers.
   execute format('select coalesce(jsonb_agg(x),''[]''::jsonb) from
     (select %s from rencontres_prive.%I where %s order by %s limit $2) x',
     case t when 'coorganisations_anterieures' then 'event_id, jsonb_build_array($1::text) as valeur, created_at'
       else '*' end,t,filtre,case t when 'accords' then 'event_id,user_id'
       when 'coorganisations_anterieures' then 'created_at,event_id' else 'created_at,id' end)
     into lignes using p_uid,plafond;
   resultat := jsonb_set(resultat,array['tables'],(resultat->'tables') || jsonb_build_object(
     'rencontres_prive.' || t,jsonb_build_object('lignes',lignes,'attendu',attendu,
       'tronque',attendu > plafond,'ordre_total',true)));
 end loop;
 foreach t in array array['media_reservations','media_assets','media_objects'] loop
   source_sql := case t when 'media_objects'
     then 'public.media_objects m join public.media_assets a on a.id=m.asset_id'
     else format('public.%I m',t) end;
   filtre := case t when 'media_objects' then 'a.owner_id=$1' else 'm.owner_id=$1' end;
   ordre := case t when 'media_objects' then 'm.asset_id,m.variant' else 'm.id' end;
   execute format('select count(*) from %s where %s',source_sql,filtre) into attendu using p_uid;
   execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from
     (select m.* from %s where %s order by %s limit $2) x',source_sql,filtre,ordre)
     into lignes using p_uid,plafond;
   resultat := jsonb_set(resultat,array['tables'],(resultat->'tables') || jsonb_build_object(
     t,jsonb_build_object('lignes',lignes,'attendu',attendu,'tronque',attendu > plafond,'ordre_total',true)));
 end loop;
 return resultat || jsonb_build_object('rencontres_prive',1,'medias_proteges',1);
end $function$;

comment on function public.export_compte_instantane(text,integer,bigint) is
 'PASSIO export protected-media v1 2026-11-16 : socle, rencontres et trois registres sous un snapshot STABLE ; service_role seul.';
revoke all on function public.export_compte_instantane(text,integer,bigint) from public,anon,authenticated;
grant execute on function public.export_compte_instantane(text,integer,bigint) to service_role;

do $verdict$
begin
 if md5(pg_get_functiondef('public.export_compte_instantane(text,integer,bigint)'::regprocedure)) <> '1ca6dbf6269c9441b83d8461fa8a1914'
   or has_function_privilege('anon','public.export_compte_instantane(text,integer,bigint)','execute')
   or has_function_privilege('authenticated','public.export_compte_instantane(text,integer,bigint)','execute') then
   raise exception using errcode='55000',message='export_medias_verdict_invalide';
 end if;
end $verdict$;
select 'export_medias_snapshot_v1' as controle,'OK' as valeur;
commit;
