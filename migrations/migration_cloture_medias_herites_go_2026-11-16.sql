-- Fermeture des NOUVEAUX ecrits herites uniquement. Aucun objet ou contenu existant n'est migre.
-- Catalogue readonly PROD/STAGING22:38UTC SHA256 ed125de18c90aeae2e4b2c335a49b2259241e4a0244240d7b2420a87f9a638d7.
-- Depend du registre prive relu, migration_medias_proteges_go_2026-11-16.sql. Recette fournisseur requise avant application.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';

do $prerequis$
declare f record; t record; p record; presents integer;
begin
  if to_regprocedure('public.storage_chemin_autorise(text,text)') is null
    or md5(pg_get_functiondef('public.storage_chemin_autorise(text,text)'::regprocedure))<>'4487afd66b0036f826e3e3b4398c9954'
    or to_regprocedure('public.media_lier_source()') is null
    or md5(pg_get_functiondef('public.media_lier_source()'::regprocedure))<>'80156a61900889a6af8e36a51056d244'
    or md5(pg_get_functiondef('public.quota_stockage_ok()'::regprocedure))<>'5b033c8abd2c9b007f2d766ea1deb2ee'
    or md5(pg_get_functiondef('public.suppression_de_mon_compte()'::regprocedure))<>'4037c1c1536f9da3d11fb14fc225badb' then
    raise exception 'Prerequis medias heritage different';
  end if;
  if exists(select 1 from pg_roles where rolname in('anon','authenticated') and (rolsuper or rolbypassrls))
    or exists(select 1 from pg_class where oid in('storage.objects'::regclass,'public.posts'::regclass,'public.stories'::regclass) and not relrowsecurity)
    or not exists(select 1 from storage.buckets where id='content' and public and file_size_limit=27262976)
    or not exists(select 1 from storage.buckets where id='attachments' and not public)
    or not exists(select 1 from storage.buckets where id='content-protected' and not public) then
    raise exception 'Catalogue medias heritage incompatible';
  end if;
  for t in select unnest(array['media_reservations','media_assets','media_objects']) as nom loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||t.nom) and relkind='r' and relrowsecurity
       and obj_description(oid,'pg_class')='PASSIO protected-media v1 2026-11-16') then
      raise exception 'Registre media heritage absent ou inconnu';
    end if;
  end loop;
  for p in select * from(values
    ('passio_media_insert_cloisonne','a','(storage_chemin_autorise(bucket_id, name) AND (NOT suppression_de_mon_compte()) AND quota_stockage_ok())',null::text),
    ('passio_media_update_cloisonne','w','(storage_chemin_autorise(bucket_id, name) AND (NOT suppression_de_mon_compte()))',
     '((bucket_id = ANY (ARRAY[''content''::text, ''attachments''::text])) AND (owner = ( SELECT auth.uid() AS uid)))')
  ) as x(nom,commande,verification,filtre) loop
    if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname=p.nom
      and polcmd::text=p.commande and polpermissive and polroles=array['authenticated'::regrole::oid]
      and pg_get_expr(polwithcheck,polrelid) is not distinct from p.verification
      and pg_get_expr(polqual,polrelid) is not distinct from p.filtre) then
      raise exception 'Policy Storage prerequisite differente';
    end if;
  end loop;
  if exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polcmd in('a','w','*')
    and polname not in('passio_media_insert_cloisonne','passio_media_update_cloisonne',
      'media_protected_insert_guard','media_protected_update_closed','media_protected_insert_anon_closed','media_protected_insert',
      'media_heritage_insert','media_heritage_update')) then
    raise exception 'Policy Storage supplementaire non revue';
  end if;
  for p in select * from(values ('media_heritage_insert','b63461b258283aa19bb3ea5f1aa01f5a'),('media_heritage_update','206de6743af1c940172428d941f39492')) as x(nom,empreinte) loop
    if exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname=p.nom
      and (obj_description(oid,'pg_policy') is distinct from 'PASSIO protected-media heritage fence v1 2026-11-16'
        or polroles<>array['authenticated'::regrole::oid]
        or md5(coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')||'|'||polcmd::text||'|'||polpermissive::text)<>p.empreinte)) then
      raise exception 'Policy heritage homonyme ou derivee';
    end if;
  end loop;
  for t in select * from(values
    ('storage.objects','media_heritage_stockage','d3a91cb38d1af877ef2d734227594877'),('public.posts','media_heritage_references','be8128742749f087291aa8abd1f27917'),('public.stories','media_heritage_references','7b8048a59ac788218d20bba433dd04df')
  ) as x(tableau,nom,empreinte) loop
    if exists(select 1 from pg_trigger where tgrelid=to_regclass(t.tableau) and tgname=t.nom
      and (obj_description(oid,'pg_trigger') is distinct from 'PASSIO protected-media heritage fence v1 2026-11-16'
        or tgenabled<>'A' or md5(pg_get_triggerdef(oid))<>t.empreinte)) then
      raise exception 'Trigger heritage homonyme ou derive';
    end if;
  end loop;
  for f in select * from(values
    ('public.media_heritage_stockage_public(text,text)','5fffeefbabb107c0724afd682331d7bb'),('public.media_heritage_ref_categorie(text)','5efdfd83881c420de19ac9c558dc10a2'),
    ('public.media_heritage_refs(jsonb)','755aa2a97100d677a60f0b7050a5fd9c'),('public.media_heritage_stockage()','3c0fd7dc87072e1b997423a9f71cccdb'),('public.media_heritage_references()','f49cbb2b1a5e5b8bc7bd722d923841dc')
  ) as x(signature,empreinte) loop
    if to_regprocedure(f.signature) is not null and (obj_description(to_regprocedure(f.signature),'pg_proc')
      is distinct from 'PASSIO protected-media heritage fence v1 2026-11-16' or md5(pg_get_functiondef(to_regprocedure(f.signature)))<>f.empreinte) then
      raise exception 'Fonction heritage homonyme ou derivee';
    end if;
  end loop;
end $prerequis$;

-- Ce predicat classe une destination ; les policies existantes restent l'autorite de proprietaire/quota.
create or replace function public.media_heritage_stockage_public(p_bucket text,p_name text) returns boolean
language sql immutable security invoker set search_path='' as $fn$
  select p_bucket is not null and coalesce(p_bucket<>'content' or
    (split_part(p_name,'/',1)=any(array['avatars','covers','passion_photos','passion_covers','events'])
      and octet_length(p_name)<=8192 and split_part(p_name,'/',2)<>'' and split_part(p_name,'/',3)<>''
      and p_name !~ '[[:cntrl:]\\]' and p_name !~ '(^/|/$|//|(^|/)\.{1,2}(/|$))'
      and p_name !~* '%(2f|5c|2e|25|00|0[1-9a-f]|1[0-9a-f]|7f)'),false);
$fn$;

create or replace function public.media_heritage_stockage() returns trigger
language plpgsql volatile security invoker set search_path='' as $fn$
begin
  if not public.media_heritage_stockage_public(new.bucket_id,new.name)
    or (TG_OP='UPDATE' and not public.media_heritage_stockage_public(old.bucket_id,old.name)) then
    raise exception using errcode='42501',message='medias_heritage_ecriture_fermee';
  end if;
  return new;
end $fn$;

-- Aucune requete ou autorisation dans ce classificateur d'URL. Il ne signe ni ne transforme rien.
create or replace function public.media_heritage_ref_categorie(p_valeur text) returns text
language plpgsql immutable security invoker set search_path='' as $fn$
declare v text:=p_valeur; m text[]; autorite text; hote text; canonique text; chemin text; interne boolean:=false; alias_site boolean:=false; site boolean:=false;
begin
  if v is null or v='' then return 'absente'; end if;
  if octet_length(v)>8192 or v ~ '[[:cntrl:][:space:]\\]' then return 'refusee'; end if;
  if v ~ '^https://media\.passio\.invalid/private-media/(posts|stories)/[A-Za-z0-9_-]{1,120}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(original|v720|poster)$' then return 'protegee'; end if;
  if v like '/media/%' then alias_site:=true;chemin:=split_part(split_part(v,'?',1),'#',1);
  elsif v like '/storage/%' or v like '/private-media/%' then return 'refusee';
  else
    m:=regexp_match(v,'^(https?://|//)([^/?#]*)([^?#]*)','i');
    -- Pas de normalisation IDNA/WHATWG implicite : les autorites ambigues sont fermees.
    if m is null then
      if v ~* '^https?:' then return 'refusee'; end if;
      return 'tierce';
    end if;
    if m[2]='' or octet_length(m[2])<>length(m[2])
      or (m[2] collate "C") !~ '^[A-Za-z0-9.-]+(:[0-9]{1,5})?$' then return 'refusee'; end if;
    autorite:=lower(m[2] collate "C");
    -- Une autorite encodee ou avec credentials n'est jamais une reference media canonique.
    if autorite ~ '[@%]' then return 'refusee'; end if;
    hote:=regexp_replace(autorite,':[0-9]+$','');
    if octet_length(hote)>253 or (hote collate "C") !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
      or (autorite ~ ':[0-9]+$' and split_part(autorite,':',2)::integer>65535) then return 'refusee'; end if;
    canonique:=rtrim(hote,'.');
    if canonique='media.passio.invalid' then return 'refusee'; end if;
    interne:=canonique in('njkiyoklssvefstljemx.supabase.co','fcksxofaelcdmmifnwjo.supabase.co');
    site:=canonique ~ '^([a-z0-9-]+--)?passio-app\.netlify\.app$';
    if (interne or site) and (hote<>canonique or autorite not in(canonique,canonique||':443')) then return 'refusee'; end if;
    if site and (m[3] like '/private-media/%' or m[3] like '/storage/%') then return 'refusee'; end if;
    alias_site:=site and m[3] like '/media/%';
    if not interne and not alias_site then return 'tierce'; end if;
    if lower(m[1])<>'https://' then return 'refusee'; end if;
    chemin:=m[3];
    if not interne and not alias_site then return 'tierce'; end if;
  end if;
  if chemin ~* '%(2f|5c|2e|25|00|0[1-9a-f]|1[0-9a-f]|7f)' or chemin ~ '(^|/)\.{1,2}(/|$)' then return 'refusee'; end if;
  if alias_site then m:=regexp_match(chemin,'^/media/content/([^/]+)/[^/]+/[^/]+(/[^/]+)*$');
  else m:=regexp_match(chemin,'^/storage/v1/(object|render/image)/public/content/([^/]+)/[^/]+/[^/]+(/[^/]+)*$'); end if;
  if m is null then return 'refusee'; end if;
  if (case when alias_site then m[1] else m[2] end)=any(array['avatars','covers','passion_photos','passion_covers','events']) then return 'publique'; end if;
  return 'refusee';
end $fn$;

-- Chemins de presentation seulement : le texte libre et les enveloppes non rendues restent opaques.
create or replace function public.media_heritage_refs(p_ligne jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $fn$
declare refs jsonb:='{}'; j jsonb; a jsonb; champ text; element jsonb; i integer;
begin
  if jsonb_typeof(p_ligne->'media_url')='string' then refs:=refs||jsonb_build_object('media_url',p_ligne->>'media_url'); end if;
  j:=p_ligne->'shared_data';
  if jsonb_typeof(j)='string' then
    begin j:=(p_ligne->>'shared_data')::jsonb;
    exception when invalid_text_representation then j:=null; end;
  end if;
  if jsonb_typeof(j)='object' then
    foreach champ in array array['media','image','photo','video','audio','cover','poster','coverUrl','coverPhotoUrl'] loop
      if jsonb_typeof(j->champ)='string' then refs:=refs||jsonb_build_object('shared_data.'||champ,j->>champ); end if;
    end loop;
    if jsonb_typeof(j#>'{passio_media,poster}')='string' then
      refs:=refs||jsonb_build_object('shared_data.passio_media.poster',j#>>'{passio_media,poster}');
    end if;
  end if;
  a:=p_ligne->'overlays';
  if jsonb_typeof(a)='array' then
    if jsonb_array_length(a)>128 then raise exception using errcode='42501',message='medias_heritage_refs_hors_borne'; end if;
    i:=0;
    for element in select value from jsonb_array_elements(a) loop
      if element->>'type'='gif' and jsonb_typeof(element->'url')='string' then
        refs:=refs||jsonb_build_object('overlays.'||i::text||'.url',element->>'url');
      end if;
      i:=i+1;
    end loop;
  end if;
  return refs;
end $fn$;

create or replace function public.media_heritage_references() returns trigger
language plpgsql volatile security invoker set search_path='' as $fn$
declare avant jsonb:='{}'; apres jsonb; r record;
begin
  if TG_OP='UPDATE' and (to_jsonb(new)->'media_url') is not distinct from (to_jsonb(old)->'media_url')
    and (to_jsonb(new)->'shared_data') is not distinct from (to_jsonb(old)->'shared_data')
    and (to_jsonb(new)->'overlays') is not distinct from (to_jsonb(old)->'overlays') then return new; end if;
  apres:=public.media_heritage_refs(to_jsonb(new));
  if TG_OP='UPDATE' then avant:=public.media_heritage_refs(to_jsonb(old)); end if;
  for r in select key,value from jsonb_each_text(apres) loop
    if (avant->>r.key) is not distinct from r.value then continue; end if;
    if public.media_heritage_ref_categorie(r.value)='refusee' then
      raise exception using errcode='42501',message='medias_heritage_reference_fermee';
    end if;
  end loop;
  return new;
end $fn$;

comment on function public.media_heritage_stockage_public(text,text) is 'PASSIO protected-media heritage fence v1 2026-11-16';
comment on function public.media_heritage_stockage() is 'PASSIO protected-media heritage fence v1 2026-11-16';
comment on function public.media_heritage_ref_categorie(text) is 'PASSIO protected-media heritage fence v1 2026-11-16';
comment on function public.media_heritage_refs(jsonb) is 'PASSIO protected-media heritage fence v1 2026-11-16';
comment on function public.media_heritage_references() is 'PASSIO protected-media heritage fence v1 2026-11-16';
revoke all on function public.media_heritage_stockage_public(text,text),public.media_heritage_ref_categorie(text),
 public.media_heritage_refs(jsonb),public.media_heritage_stockage(),public.media_heritage_references() from public;
grant execute on function public.media_heritage_stockage_public(text,text),public.media_heritage_ref_categorie(text),public.media_heritage_refs(jsonb) to anon,authenticated,service_role;
do $proprietaires$
declare nom text;
begin
  for nom in select distinct pg_get_userbyid(relowner) from pg_class where oid in('storage.objects'::regclass,'public.posts'::regclass,'public.stories'::regclass) loop
    execute format('grant execute on function public.media_heritage_stockage_public(text,text),public.media_heritage_ref_categorie(text),public.media_heritage_refs(jsonb) to %I',nom);
  end loop;
end $proprietaires$;

drop policy if exists media_heritage_insert on storage.objects;
create policy media_heritage_insert on storage.objects as restrictive for insert to authenticated
  with check(public.media_heritage_stockage_public(bucket_id,name));
comment on policy media_heritage_insert on storage.objects is 'PASSIO protected-media heritage fence v1 2026-11-16';
drop policy if exists media_heritage_update on storage.objects;
create policy media_heritage_update on storage.objects as restrictive for update to authenticated
  using(public.media_heritage_stockage_public(bucket_id,name)) with check(public.media_heritage_stockage_public(bucket_id,name));
comment on policy media_heritage_update on storage.objects is 'PASSIO protected-media heritage fence v1 2026-11-16';

drop trigger if exists media_heritage_stockage on storage.objects;
create trigger media_heritage_stockage after insert or update on storage.objects for each row execute function public.media_heritage_stockage();
alter table storage.objects enable always trigger media_heritage_stockage;
comment on trigger media_heritage_stockage on storage.objects is 'PASSIO protected-media heritage fence v1 2026-11-16';
drop trigger if exists media_heritage_references on public.posts;
create trigger media_heritage_references after insert or update on public.posts for each row execute function public.media_heritage_references();
alter table public.posts enable always trigger media_heritage_references;
comment on trigger media_heritage_references on public.posts is 'PASSIO protected-media heritage fence v1 2026-11-16';
drop trigger if exists media_heritage_references on public.stories;
create trigger media_heritage_references after insert or update on public.stories for each row execute function public.media_heritage_references();
alter table public.stories enable always trigger media_heritage_references;
comment on trigger media_heritage_references on public.stories is 'PASSIO protected-media heritage fence v1 2026-11-16';

select 'heritage ferme sur nouveaux ecrits sans exception BYPASSRLS; contenu existant conserve' as controle,
  case when (select count(*) from pg_trigger where (tgrelid='storage.objects'::regclass and tgname='media_heritage_stockage'
     or tgrelid in('public.posts'::regclass,'public.stories'::regclass) and tgname='media_heritage_references') and tgenabled='A')=3
    and not (select prosecdef from pg_proc where oid='public.media_heritage_stockage()'::regprocedure) then 'OK' else 'ECHEC' end as verdict;
commit;
