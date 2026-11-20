-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 2026-11-20 — B06-N1 (résidu) : UNE ENVELOPPE CASSÉE PRÉCÉDÉE D'UN BOM N'EST PAS DU TEXTE
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Se joue APRÈS
-- migration_conv_messages_forme_2026-11-16.sql. Aucun PREREQUIS-CLIENT : le client refuse déjà
-- ces formes à l'affichage (`_messageContentData`, `\s` de JS comprend U+FEFF).
-- Banc : tests/sql/migration-securite-p1-2026-11-20.test.sh.
--
-- CE QUI MANQUAIT : `conv_message_forme_valide` n'accepte un contenu qui n'est pas du JSON que s'il
-- ne commence pas par `[` ou `{` après des blancs `[[:space:]]`. PostgreSQL n'y range pas U+FEFF
-- (BOM) : `U+FEFF{"type":"media","fileType":1,…}` passait pour du texte (201 sur le staging), et
-- seule la garde du client tenait. NBSP et la tabulation verticale dépendent de la locale.
--
-- CE QUI CHANGE : le test de tête saute EXACTEMENT les blancs de `\s` en JavaScript — ceux que saute
-- `_messageContentData` (app-04) avant de décider « enveloppe cassée » : tabulation, saut de ligne,
-- `\v`, `\f`, retour chariot, espace, NBSP, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F,
-- U+3000, U+FEFF — en liste explicite, indépendante de la locale (`[:space:]` en dépendait). Un
-- TEXTE qui commence par ces caractères reste accepté ; seule une enveloppe JSON cassée qu'ils
-- précèdent est refusée. Base et client tranchent désormais À L'IDENTIQUE : un caractère que le
-- client ne saute pas (U+200B, U+2060, U+00AD, un contrôle…) fait du contenu un TEXTE des deux
-- côtés — inoffensif, il s'affiche comme du texte — au lieu d'un refus en base d'un message que
-- le client aurait envoyé et affiché (contre-revue du 2026-11-20 : la version précédente était
-- plus large que le client).
-- Aucune ligne existante n'est touchée (0 contenu commençant par un BOM en production, relu le
-- 2026-11-20).
--
-- RETOUR ARRIÈRE : rejouer le corps de migration_conv_messages_forme_2026-11-16.sql.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $g$ declare h text; begin
 if to_regprocedure('public.conv_message_forme_valide(text)') is null
 or to_regprocedure('public.conv_message_forme_garde()') is null then
  raise exception 'migration_conv_messages_forme_2026-11-16.sql requise avant ce lot';
 end if;
 select md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g'))) into h
  from pg_proc p where p.oid='public.conv_message_forme_valide(text)'::regprocedure;
 if h not in ('dd20d5884a4a863d27dc5123d2aee5bf','2c90a7e4f3f68daefec9bac8717eedb6') then
  raise exception 'conv_message_forme_valide different du catalogue relu';
 end if;
end $g$;

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
    -- Les blancs en tête ne font pas d'une enveloppe cassée un texte (B06-N1, 2026-11-20) :
    -- EXACTEMENT les blancs de \s en JS, ceux que saute _messageContentData (app-04).
    return contenu !~ '^[\t\n\v\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*[\[{]';
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

-- ── TABLEAU DE VERDICT (fonction pure, aucune donnée) ────────────────────────────────────────────
with cas(contenu, attendu) as (values
  (chr(65279)||'{"type":"media","fileType":1}', false),
  (chr(65279)||'{"type":"text","text":7}', false),
  (chr(160)||'{"type":"media","fileType":1', false),
  (chr(11)||'{"type":"media","fileType":1', false),
  (chr(12288)||'{bad', false),
  (chr(8232)||'[1,', false),
  (chr(12)||chr(13)||'{bad', false),
  (chr(65279)||chr(160)||' '||chr(11)||'{bad', false),
  (chr(8203)||'[1,', true),
  (chr(8288)||'{bad', true),
  (chr(1)||'{bad', true),
  (chr(133)||'{bad', true),
  ('{bad', false),
  ('texte ancien', true),
  ('bonjour {', true),
  (chr(65279)||'bonjour', true),
  (chr(160)||'texte', true),
  ('  {"type":"text","text":"ok"}', true),
  ('{"type":"media","url":"https://example.test/a","fileType":"video/mp4"}', true))
select 'forme : enveloppe cassée précédée d''un blanc (\s du client) refusée, le reste reste du texte' as controle,
       case when (select bool_and(public.conv_message_forme_valide(contenu) = attendu) from cas) then 'OK' else 'ECHEC' end as valeur
union all select 'forme : fonction interne fermée',
       case when not has_function_privilege('anon','public.conv_message_forme_valide(text)','execute')
             and not has_function_privilege('authenticated','public.conv_message_forme_valide(text)','execute')
             and exists (select 1 from pg_trigger where tgname='aa_conv_message_forme'
                          and tgrelid='public.conv_messages'::regclass and tgenabled='O') then 'OK' else 'ECHEC' end;

commit;
