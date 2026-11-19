-- Candidat local. Cette transaction ne modifie aucune ligne existante.
begin;
set local lock_timeout = '3s';

do $prerequis$
begin
  if md5(pg_get_functiondef('public.media_heritage_ref_categorie(text)'::regprocedure))
       is distinct from '5efdfd83881c420de19ac9c558dc10a2' then
    raise exception 'classificateur_reference_inattendu';
  end if;
  if (select count(*) from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid=a.attrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and not c.relispartition
        and not a.attisdropped and (c.relname,a.attname,a.atttypid) in
        (('profiles','avatar_url','text'::regtype),('profiles','cover_url','text'::regtype),
         ('profiles','passions','jsonb'::regtype),('events','cover_url','text'::regtype))) <> 4 then
    raise exception 'colonnes_reference_inattendues';
  end if;
end
$prerequis$;

create function public.media_heritage_profils_evenements() returns trigger
language plpgsql volatile security invoker set search_path = ''
as $garde$
declare
  avatar text;
  ancien_avatar text;
  ancienne_couverture text;
  nouvelles jsonb;
  anciennes jsonb;
  valeur jsonb;
  url text;
  classe text;
  m text[];
  lien text;
  segment text;
  pile text[];
  cle text;
  stockage boolean;
  site boolean;
begin
  if tg_op = 'UPDATE' then ancienne_couverture := old.cover_url; end if;
  if tg_table_name = 'profiles' then
    avatar := new.avatar_url;
    if tg_op = 'UPDATE' then
      ancien_avatar := old.avatar_url;
      anciennes := old.passions;
    end if;
    if new.passions is distinct from anciennes and jsonb_typeof(new.passions) = 'array' then
      nouvelles := new.passions;
    end if;
  end if;
  -- Chaque emplacement modifie produit une valeur ; aucune concatenation du tableau des candidats.
  for valeur in
    select to_jsonb(avatar) where avatar is distinct from ancien_avatar
    union all select to_jsonb(new.cover_url) where new.cover_url is distinct from ancienne_couverture
    union all select p.obj->k.champ from jsonb_array_elements(nouvelles) with ordinality as p(obj,idx)
      cross join (values ('photoUrl'),('coverUrl')) as k(champ)
      where jsonb_typeof(p.obj->k.champ)='string'
        and p.obj->k.champ is distinct from anciennes->((p.idx-1)::integer)->k.champ
  loop
    if valeur is null or jsonb_typeof(valeur) <> 'string' then continue; end if;
    url := valeur#>>'{}';
    classe := public.media_heritage_ref_categorie(url);
    if classe in ('absente','publique','protegee') then continue; end if;

    -- On examine seulement le chemin, sur une origine prise en charge par le projet.
    lien := split_part(split_part(btrim(url),'?',1),'#',1);
    lien := replace(lien,chr(92),'/');
    -- L'origine ASCII explicite d'un tiers se decide avant toute normalisation du chemin.
    m := regexp_match(left(lien,300) collate "C", '^(?:https?:/*|//+)([a-z0-9.-]+)(?::[0-9]+)?/', 'i');
    if m is not null and lower(rtrim(m[1],'.') collate "C") not in
      ('njkiyoklssvefstljemx.supabase.co','fcksxofaelcdmmifnwjo.supabase.co') and
      lower(rtrim(m[1],'.') collate "C") !~ '^([a-z0-9-]+--)?passio-app[.]netlify[.]app$' then continue; end if;
    -- Decodage des seuls octets ASCII non reserves ; une passe, jamais de double decodage.
    select string_agg(case when t[1] ~ '^%[a-fA-F0-9]{2}$' then
      case when get_byte(decode(substr(t[1],2),'hex'),0) between 1 and 127 and
        chr(greatest(1,get_byte(decode(substr(t[1],2),'hex'),0))) collate "C" ~ '^[A-Za-z0-9._~-]$'
        then chr(greatest(1,get_byte(decode(substr(t[1],2),'hex'),0))) else t[1] end
        else t[1] end,'' order by ord) into lien
      from regexp_matches(lien,'(%[a-fA-F0-9]{2}|[^%]+|%)','g') with ordinality as r(t,ord);
    m := regexp_match(lien collate "C", '^(?:https?:/*|//+)([^/]+)(/.*)?$', 'i');
    if m is null then
      if lien ~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' then continue; end if;
      site := true;
      stockage := false;
    else
      -- NFKC couvre les formes pleine chasse et le separateur ideographique.
      m[1] := lower(translate(normalize(m[1],NFKC),'。','.') collate "C");
      m[1] := regexp_replace(m[1],'^.*@','');
      m[1] := regexp_replace(m[1],':[0-9]+$','');
      m[1] := rtrim(m[1],'.');
      stockage := m[1] in ('njkiyoklssvefstljemx.supabase.co','fcksxofaelcdmmifnwjo.supabase.co');
      site := m[1] ~ '^([a-z0-9-]+--)?passio-app[.]netlify[.]app$';
      lien := coalesce(m[2],'');
    end if;

    if not (site or stockage) then continue; end if;
    pile := '{}'::text[];
    foreach segment in array string_to_array(coalesce(lien,''),'/') loop
      if segment='' or segment='.' then continue; end if;
      if segment='..' then pile:=pile[1:greatest(0,cardinality(pile)-1)];
      else pile:=array_append(pile,segment); end if;
    end loop;
    lien := '/'||array_to_string(pile,'/');
    cle := case when site and lien like '/media/content/%' then substr(lien,length('/media/content/')+1)
      else substring(lien from '^/storage/v1/(?:object/(?:public|authenticated|sign)|render/image/(?:public|authenticated|sign))/content/(.+)$') end;
    if cle is not null and split_part(cle,'/',1) <> all(array['avatars','covers','passion_photos','passion_covers','events']) then
      raise exception using errcode='42501',message='medias_heritage_ecriture_fermee';
    end if;
  end loop;
  return null;
end
$garde$;
revoke all on function public.media_heritage_profils_evenements() from public;

create trigger media_heritage_profils_evenements after insert or update on public.profiles
for each row execute function public.media_heritage_profils_evenements();
alter table public.profiles enable always trigger media_heritage_profils_evenements;
create trigger media_heritage_profils_evenements after insert or update on public.events
for each row execute function public.media_heritage_profils_evenements();
alter table public.events enable always trigger media_heritage_profils_evenements;
commit;
