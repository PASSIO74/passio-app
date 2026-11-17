-- Mutation native : ancienne definition vulnerable, injectee seulement sous BEGIN/ROLLBACK.
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
    if m is null then return 'tierce'; end if;
    autorite:=lower(m[2]);
    -- Une autorite encodee ou avec credentials n'est jamais une reference media canonique.
    if autorite ~ '[@%]' then return 'refusee'; end if;
    hote:=regexp_replace(autorite,':[0-9]+$','');canonique:=rtrim(hote,'.');
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
