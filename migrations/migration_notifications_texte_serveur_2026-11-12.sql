-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS : LE NOM ET LA PHRASE VIENNENT DU SERVEUR (2026-11-12, SRV-02)
--
-- Une transaction, FERMÉE SUR ÉCHEC (SQLSTATE 55000 avant `commit;`).
--
-- LE DÉFAUT (audit de stabilisation du 10/11, SRV-02, P2). Pour 13 genres, la ligne
-- `notifications` est écrite par le client, et la cloche affiche son `content` tel
-- quel (balises neutralisées). La policy d'INSERT n'exige que `from_id = auth.uid()`
-- (plus blocage, suppression, genres et identifiants réservés) : RIEN ne lie le
-- destinataire, ni le texte. Un compte quelconque pouvait donc écrire à n'importe
-- quel inscrit « Équipe PASSIO : ton compte est suspendu, écris à … », sous le genre
-- `message` ou `event_cancelled`. La push, elle, était déjà protégée (gabarit
-- serveur, `_shared/lien-metier.js`) ; la cloche non.
--
-- LE CORRECTIF : un déclencheur BEFORE INSERT, pour les seules lignes d'origine
-- CLIENT (`notifications_origine` pose `origine` juste avant, ordre alphabétique) :
--  · le NOM est toujours relu dans `profiles` (échappé comme `escapeHtml` le fait) ;
--    le nom envoyé par le client est jeté ;
--  · la PHRASE doit appartenir à la liste FERMÉE de ce que l'application écrit
--    (relevée dans js/ le 12/11, et dans les 170 lignes de production) ; les
--    phrases qui portent un titre (invitation, avis, direct, groupe) sont
--    RECONSTRUITES depuis la base (`events.title`, `video_lives.title`,
--    `conversations.group_name`) ; toute autre phrase devient le gabarit du genre ;
--  · deux LIENS MÉTIER sont exigés là où un texte libre est légitime ou trompeur :
--    `message` exige que l'émetteur ET le destinataire soient membres de la
--    conversation `ref_id` (sinon refus 42501) ; le message libre d'un organisateur
--    à ses inscrits (`event_update`) n'est gardé que si l'émetteur organise ou
--    co-organise l'activité `ref_id` — sinon, gabarit.
-- Le client n'a rien à changer : il relit le `content` de la ligne.
--
-- CE QUI RESTE (assumé) : un compte peut encore écrire « X a aimé ton post » sans
-- avoir aimé — mais sous son VRAI nom, avec une phrase fixe. L'exigence de
-- l'événement métier pour chaque genre (comme `lienEvenement` de la push) est un
-- lot à part.
--
-- Canal ③ d'ADR-012 : `node scripts/appliquer-migration.mjs migrations/migration_notifications_texte_serveur_2026-11-12.sql --projet <ref>`
-- RETOUR ARRIÈRE :
--   begin;
--   drop trigger if exists trg_notifications_texte on public.notifications;
--   drop function if exists public.notifications_texte_serveur();
--   drop function if exists public.passio_echapper_html(text);
--   commit;
-- ═══════════════════════════════════════════════════════════
begin;

-- ── ⓪ PRÉREQUIS ──
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notifications_origine' and not tgisinternal) then
    raise exception 'notifications : le déclencheur d''origine manque — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

-- ── ① L'ÉCHAPPEMENT, identique à `escapeHtml` (app-02) ──
create or replace function public.passio_echapper_html(s text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select replace(replace(replace(replace(replace(coalesce(s, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$fn$;

-- ── ② LE TEXTE SERVEUR ──
create or replace function public.notifications_texte_serveur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  c       text := coalesce(new.content, '');
  nom     text;
  phrase  text := null;
  fixes   text[];
  f       text;
  titre   text;
  note    text;
  ev      record;
begin
  -- Les lignes du serveur (follows_notifier, notifier_mentions…) ne passent pas ici.
  if new.origine is distinct from 'client' or auth.uid() is null then
    return new;
  end if;

  select p.username into nom from public.profiles p where p.id = new.from_id;
  nom := public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'));

  -- Ce que l'application écrit, phrase par phrase (après « <nom> »).
  fixes := case new.kind
    when 'like' then array['a aimé ton commentaire', 'a aimé ton post', 'a aimé ta réponse', 'a aimé ton événement',
                           'a aimé ton live', 'a réagi à ton événement']
    when 'comment' then array['a commenté avec un GIF', 'a commenté ton post', 'a répondu à ton commentaire',
                              'a répondu avec un GIF', 'a commenté ta bobine', 'a commenté ton live']
    when 'event_join' then array['a rejoint ton événement']
    when 'event_comment' then array['a commenté ton événement']
    when 'event_update' then array['t''a nommé·e co-organisateur·ice', 't''a inscrit·e depuis la liste d''attente !',
                                   'une place s''est libérée, tu es inscrit·e !', 'a modifié un événement auquel tu participes']
    when 'event_cancelled' then array['a annulé un événement auquel tu participais']
    when 'live_video' then array['est en direct — rejoins le live !']
    when 'message' then array['t''a envoyé un message']
    else array[]::text[]
  end;
  foreach f in array fixes loop
    if c = f or right(c, char_length(f) + 1) = ' ' || f then phrase := f; exit; end if;
  end loop;

  -- Lien métier d'un message : les DEUX comptes sont membres de la conversation.
  if new.kind = 'message' then
    if not exists (select 1 from public.conv_members m where m.conv_id = new.ref_id and m.user_id = new.from_id)
       or not exists (select 1 from public.conv_members m where m.conv_id = new.ref_id and m.user_id = new.user_id) then
      raise exception 'notification de message hors d''une conversation commune' using errcode = '42501';
    end if;
    if phrase is null and c ~ ' a écrit dans ' then
      select 'a écrit dans ' || public.passio_echapper_html(coalesce(nullif(btrim(cv.group_name), ''), 'un groupe'))
        into phrase from public.conversations cv where cv.id = new.ref_id and cv.is_group;
    end if;
  end if;

  -- Phrases à motif, reconstruites depuis la base.
  if phrase is null then
    if new.kind = 'like' and c ~ ' a réagi [^ <>&"]{1,16} à ton post$' then
      phrase := substring(c from ' (a réagi [^ <>&"]{1,16} à ton post)$');
    elsif new.kind = 'event_invite' then
      select left(e.title, 60) into titre from public.events e where e.id = new.ref_id;
      phrase := case when titre is not null and btrim(titre) <> ''
                     then 't''invite à <b>' || public.passio_echapper_html(titre) || '</b>' end;
    elsif new.kind = 'event_feedback' and c ~ ' ([1-5])/5$' then
      note := substring(c from ' ([1-5])/5$');
      select left(e.title, 60) into titre from public.events e where e.id = new.ref_id;
      phrase := 'a noté <b>' || public.passio_echapper_html(coalesce(nullif(btrim(titre), ''), 'ton événement')) || '</b> ' || note || '/5';
    elsif new.kind = 'live_video' and c ~ ' est en direct : « ' then
      select left(v.title, 60) into titre from public.video_lives v where v.id = new.ref_id and v.author_id = new.from_id;
      phrase := case when titre is not null and btrim(titre) <> ''
                     then 'est en direct : « ' || public.passio_echapper_html(titre) || ' » — rejoins !' end;
    elsif new.kind = 'event_update' then
      -- Le message libre d'un ORGANISATEUR à ses inscrits : gardé, sous son vrai nom.
      select e.organizer_id, e.author_id, e.co_organizers into ev from public.events e where e.id = new.ref_id;
      if found and (ev.organizer_id = new.from_id or ev.author_id = new.from_id
                    or coalesce(ev.co_organizers, '[]'::jsonb) ? new.from_id) then
        phrase := c;
        -- Le client préfixe SON nom : on le retire s'il est celui du profil.
        if left(c, char_length(nom) + 1) = nom || ' ' then phrase := substr(c, char_length(nom) + 2); end if;
        phrase := left(phrase, 240);
      end if;
    end if;
  end if;

  -- Tout le reste : le gabarit du genre.
  if phrase is null or btrim(phrase) = '' then
    phrase := case new.kind
      when 'like' then 'a aimé ta publication'
      when 'comment' then 'a commenté ta publication'
      when 'reaction' then 'a réagi à ta publication'
      when 'message' then 't''a envoyé un message'
      when 'event_join' then 's''est inscrit·e à ton activité'
      when 'event_comment' then 'a commenté ton activité'
      when 'event_update' then 'a mis à jour une activité où tu es inscrit·e'
      when 'event_cancelled' then 'a annulé une activité où tu étais inscrit·e'
      when 'event_reminder' then 'te rappelle une activité'
      when 'event_invite' then 't''invite à une activité'
      when 'event_feedback' then 'a laissé un avis sur ton activité'
      when 'live_video' then 'est en direct — rejoins le live !'
      when 'cdv_live_step' then 'a publié une étape'
      else 'a une nouvelle pour toi'
    end;
  end if;

  new.content := nom || ' ' || phrase;
  return new;
end
$fn$;

revoke all on function public.notifications_texte_serveur() from public, anon, authenticated;

drop trigger if exists trg_notifications_texte on public.notifications;
create trigger trg_notifications_texte before insert on public.notifications
  for each row execute function public.notifications_texte_serveur();

-- ── ③ L'ÉPREUVE, sous le vrai rôle `authenticated`, ANNULÉE ──
do $epreuve$
declare
  sfx  constant text := left(md5(clock_timestamp()::text || random()::text), 8);
  a    constant text := '00000000-0000-4000-8000-0000000c0201';
  b    constant text := '00000000-0000-4000-8000-0000000c0202';
  c3   constant text := '00000000-0000-4000-8000-0000000c0203';
  conv constant text := 'zz_srv02_conv_' || sfx;
  evt  constant text := 'zz_srv02_evt_' || sfx;
  mes  jsonb := '{}'::jsonb;
  t    record;
  etat text;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private) values
      (a, 'zz Alice ' || sfx, false), (b, 'zz Bob ' || sfx, false), (c3, 'zz Carol ' || sfx, false);
    insert into public.conversations (id, is_group, created_by) values (conv, false, a);
    insert into public.conv_members (conv_id, user_id) values (conv, a), (conv, b);
    insert into public.events (id, organizer_id, author_id, title) values (evt, a, a, 'Rando <du> lac');

    for t in
      select x.* from jsonb_to_recordset(jsonb_build_array(
        jsonb_build_object('cle', 'libre',     'de', a, 'a', b,  'kind', 'like',           'ref', 'p1', 'texte', 'Équipe PASSIO : ton compte est suspendu, écris à x@y.z'),
        jsonb_build_object('cle', 'faux_nom',  'de', a, 'a', b,  'kind', 'like',           'ref', 'p1', 'texte', 'Modération a aimé ton post'),
        jsonb_build_object('cle', 'reaction',  'de', a, 'a', b,  'kind', 'like',           'ref', 'p1', 'texte', 'x a réagi 💯 à ton post'),
        jsonb_build_object('cle', 'msg_hors',  'de', a, 'a', c3, 'kind', 'message',        'ref', conv, 'texte', 'x t''a envoyé un message'),
        jsonb_build_object('cle', 'msg_ok',    'de', a, 'a', b,  'kind', 'message',        'ref', conv, 'texte', 'x t''a envoyé un message'),
        jsonb_build_object('cle', 'invite',    'de', b, 'a', c3, 'kind', 'event_invite',   'ref', evt,  'texte', 'x t''invite à <b>Gagne un iPhone</b>'),
        jsonb_build_object('cle', 'orga',      'de', a, 'a', c3, 'kind', 'event_update',   'ref', evt,  'texte', 'zz Alice ' || sfx || ' RDV devant l''entrée nord'),
        jsonb_build_object('cle', 'pas_orga',  'de', b, 'a', c3, 'kind', 'event_update',   'ref', evt,  'texte', 'x Activité annulée, rembourse-toi sur ce lien'),
        jsonb_build_object('cle', 'annule',    'de', b, 'a', c3, 'kind', 'event_cancelled','ref', evt,  'texte', 'x « Concert » a été supprimé par l''organisateur')
      )) as x(cle text, de text, a text, kind text, ref text, texte text)
    loop
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', jsonb_build_object('sub', t.de, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', t.de, true);
      begin
        insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
          values ('zz_srv02_' || t.cle || '_' || sfx, t.a, t.kind, t.de, t.ref, t.texte, false);
        etat := 'ok';
      exception when others then etat := sqlstate;
      end;
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      mes := mes || jsonb_build_object(t.cle, jsonb_build_object('etat', etat,
        'texte', (select n.content from public.notifications n where n.id = 'zz_srv02_' || t.cle || '_' || sfx)));
    end loop;
    mes := mes || jsonb_build_object('sfx', sfx);
    raise exception 'zz_srv02_annule';
  exception when others then
    if sqlerrm <> 'zz_srv02_annule' then
      mes := mes || jsonb_build_object('erreur', sqlstate || ' ' || sqlerrm);
    end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('passio.verdict_srv02', mes::text, true);
end $epreuve$;

-- ── ④ VERDICT ──
create temp table passio_srv02_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
with v as (select current_setting('passio.verdict_srv02', true)::jsonb j)
insert into pg_temp.passio_srv02_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout', case when j ? 'erreur' then 'ECHEC — ' || (j ->> 'erreur') else 'OK' end from v
union all select 2, true, 'un texte libre devient le gabarit, sous le VRAI nom',
  case when j #>> '{libre,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' a aimé ta publication' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{libre,texte}', j #>> '{libre,etat}') end from v
union all select 3, true, 'un nom usurpé est remplacé, la phrase connue gardée',
  case when j #>> '{faux_nom,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' a aimé ton post' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{faux_nom,texte}', '-') end from v
union all select 4, true, 'une réaction emoji garde sa phrase',
  case when j #>> '{reaction,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' a réagi 💯 à ton post' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{reaction,texte}', '-') end from v
union all select 5, true, 'un message vers quelqu''un hors de la conversation est refusé (42501)',
  case when j #>> '{msg_hors,etat}' = '42501' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{msg_hors,etat}', '-') end from v
union all select 6, true, 'un message entre membres passe',
  case when j #>> '{msg_ok,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' t''a envoyé un message' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{msg_ok,texte}', j #>> '{msg_ok,etat}') end from v
union all select 7, true, 'une invitation porte le VRAI titre, échappé',
  case when j #>> '{invite,texte}' = 'zz Bob ' || (j ->> 'sfx') || ' t''invite à <b>Rando &lt;du&gt; lac</b>' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{invite,texte}', '-') end from v
union all select 8, true, 'le message libre de l''organisateur est gardé, sans doubler son nom',
  case when j #>> '{orga,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' RDV devant l''entrée nord' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{orga,texte}', '-') end from v
union all select 9, true, 'le message libre d''un NON-organisateur devient le gabarit',
  case when j #>> '{pas_orga,texte}' = 'zz Bob ' || (j ->> 'sfx') || ' a mis à jour une activité où tu es inscrit·e' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{pas_orga,texte}', '-') end from v
union all select 10, true, 'une annulation à titre libre devient le gabarit',
  case when j #>> '{annule,texte}' = 'zz Bob ' || (j ->> 'sfx') || ' a annulé une activité où tu étais inscrit·e' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{annule,texte}', '-') end from v
union all select 11, true, 'aucune ligne d''essai ne reste',
  (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.notifications where id like 'zz\_srv02\_%')
union all select 12, true, 'le déclencheur est en place, après celui de l''origine',
  (select case when exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notifications_texte' and tgenabled = 'O')
               and 'trg_notifications_origine' < 'trg_notifications_texte' then 'OK' else 'ECHEC' end);

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_srv02_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'notifications, texte serveur : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_srv02_verdict order by n;

commit;
