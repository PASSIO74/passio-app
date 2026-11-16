-- B06-N1 / D06-03 : chaque enveloppe est validée avant écriture.
-- Client robuste d'abord ; aucune ligne historique modifiée ou supprimée.
-- PREREQUIS-CLIENT: msg_forme_invalide
-- Corps/policies/triggers confrontés aux photographies LEAD du 2026-11-16.
-- Aucun remplacement des policies, grants de table, débit ou diffuseurs existants.
-- json (pas jsonb) conserve les aperçus rt.t coupés au milieu d'un emoji.
-- Retour arrière : supprimer aa_conv_message_forme puis les deux fonctions,
-- dans une transaction. Garder le client robuste, même après ce retrait.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create or replace function public.conv_message_forme_valide(contenu text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $fn$
declare d json; k text; nom text; typ text;
begin
  if contenu is null or contenu = '' then return true; end if;
  begin
    -- Copie de validation seulement : PG décode aussi les champs non sélectionnés.
    -- Remplacer les unités UTF-16 / NUL que JS accepte et PG refuse garde les
    -- types JSON, les doublons et les échappements ; NEW.content reste intact.
    d := regexp_replace(contenu, '\\u([dD][89a-fA-F][0-9a-fA-F]{2}|0000)', '\\ufffd', 'g')::json;
  exception when invalid_text_representation then
    -- Compatibilité texte brut : une enveloppe cassée n'est pas du texte ancien.
    return contenu !~ '^[[:space:]]*[\[{]';
  end;
  if json_typeof(d) = 'array' then return false; end if;
  if json_typeof(d) is distinct from 'object' then return true; end if;
  typ := d->>'type';
  if typ is null or typ not in ('text','t','gif','location','media','audio','doc','react','del') then return false; end if;
  foreach k in array array['text','url','fileType','filename','target','emoji','op'] loop
    if d->k is not null and json_typeof(d->k) not in ('string','null') then return false; end if;
  end loop;
  foreach nom in array array['sp','rt'] loop
    if d->nom is null or json_typeof(d->nom) = 'null' then continue; end if;
    if json_typeof(d->nom) <> 'object' then return false; end if;
    foreach k in array case when nom = 'sp' then array['e','c','n','ph'] else array['id','t','n'] end loop
      if d->nom->k is not null and json_typeof(d->nom->k) not in ('string','null') then return false; end if;
    end loop;
  end loop;
  if typ in ('gif','media','audio','doc') and json_typeof(d->'url') is distinct from 'string' then return false; end if;
  if typ = 'location' then
    if json_typeof(d->'lat') is distinct from 'number' or json_typeof(d->'lng') is distinct from 'number' then return false; end if;
    if (d->>'lat')::numeric not between -90 and 90 or (d->>'lng')::numeric not between -180 and 180 then return false; end if;
  end if;
  if typ in ('react','del') and (json_typeof(d->'target') is distinct from 'string' or (d->>'target') !~ '^[A-Za-z0-9_-]{1,120}$') then return false; end if;
  if typ = 'react' and (json_typeof(d->'emoji') is distinct from 'string' or d->>'emoji' = '' or
      (d->>'op' is not null and d->>'op' not in ('add','remove'))) then return false; end if;
  return true;
exception when data_exception then
  return false;
end $fn$;
revoke all on function public.conv_message_forme_valide(text) from public, anon, authenticated;

create or replace function public.conv_message_forme_garde()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if not public.conv_message_forme_valide(new.content) then
    raise exception 'forme de message invalide' using errcode = '23514', constraint = 'conv_messages_content_forme';
  end if;
  return new;
end $fn$;
revoke all on function public.conv_message_forme_garde() from public, anon, authenticated;

drop trigger if exists aa_conv_message_forme on public.conv_messages;
create trigger aa_conv_message_forme before insert or update of content on public.conv_messages
  for each row execute function public.conv_message_forme_garde();

-- Verdict comportemental sans donnée ni diffusion : une fonction pure seulement.
do $verdict$
declare c text;
begin
  foreach c in array array['{"type":"media","fileType":1,"url":"https://example.test/a"}',
    '{"type":"text","text":{}}', '{"type":"audio","filename":1,"url":"https://example.test/a"}',
    '{"type":"text","rt":{"t":[]}}', '{"type":"gif","url":{}}', '{bad', '[]'] loop
    if public.conv_message_forme_valide(c) then raise exception 'forme : cas invalide accepté'; end if;
  end loop;
  foreach c in array array['texte ancien', '42', 'null', '"texte"', '{"type":"t","text":"ancien"}', '{"type":"text","text":"bonjour"}',
    '{"type":"text","text":"ok","rt":{"id":"m1","t":"\ud83d","n":"Test"}}',
    '{"type":"media","url":"https://example.test/a","fileType":"video/mp4"}',
    '{"type":"react","target":"msg_1","emoji":"x","op":"add"}',
    '{"type":"del","target":"msg_1"}', '{"type":"location","lat":48,"lng":2}'] loop
    if not public.conv_message_forme_valide(c) then raise exception 'forme : cas valide refusé'; end if;
  end loop;
  if has_function_privilege('anon', 'public.conv_message_forme_garde()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.conv_message_forme_garde()', 'EXECUTE')
    or has_function_privilege('anon', 'public.conv_message_forme_valide(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.conv_message_forme_valide(text)', 'EXECUTE') then
    raise exception 'forme : fonction interne exposée';
  end if;
end $verdict$;
select 'forme des messages : contrôles exécutés, fonctions internes fermées' as controle, 'OK' as valeur;
commit;
