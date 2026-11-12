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
  orga    boolean := false;
  ev_existe boolean := false;
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
    -- Un groupe s'annonce par le GABARIT, comme la push (`message_groupe`) : son nom
    -- est choisi par son créateur, qui peut y ajouter qui il veut — ce serait un
    -- texte libre par un détour (revue adversariale du 12/11).
    if phrase is null and c ~ ' a écrit dans ' then
      select 'a écrit dans un groupe' into phrase from public.conversations cv where cv.id = new.ref_id and cv.is_group;
    end if;
  end if;

  -- Lien métier d'une activité (mise à jour, annulation) : le DESTINATAIRE y est
  -- inscrit (tous statuts), et l'émetteur l'organise, la co-organise ou y est
  -- inscrit lui aussi (« une place s'est libérée » part du client de celui qui
  -- s'en va). Sans ce lien, n'importe qui disait à n'importe qui « tu es
  -- inscrit·e » ou « ton activité est annulée » (revue adversariale du 12/11).
  if new.kind in ('event_update', 'event_cancelled') then
    select e.organizer_id, e.author_id, e.co_organizers into ev from public.events e where e.id = new.ref_id;
    ev_existe := found;
    orga := ev_existe and (ev.organizer_id = new.from_id or ev.author_id = new.from_id
                       or coalesce(ev.co_organizers, '[]'::jsonb) ? new.from_id);
    if not ev_existe
       or not exists (select 1 from public.event_attendees a where a.event_id = new.ref_id and a.user_id = new.user_id)
       or not (orga or exists (select 1 from public.event_attendees a where a.event_id = new.ref_id and a.user_id = new.from_id)) then
      raise exception 'notification d''activité hors du lien organisateur / inscrits' using errcode = '42501';
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
      -- Le message libre d'un ORGANISATEUR à un INSCRIT (lien vérifié plus haut) :
      -- gardé, sous son vrai nom.
      if orga then
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

-- ── ②bis L'AVIS DE SUPPRESSION D'UNE ACTIVITÉ, écrit par le SERVEUR ──
-- Le client prévenait les inscrits APRÈS avoir effacé l'activité : la ligne n'existe
-- plus, ses inscriptions sont parties en cascade, et le lien métier exigé ci-dessus
-- ne peut plus se prouver. C'est donc la base qui prévient, AVANT l'effacement,
-- au nom de l'organisateur (origine 'serveur', texte dérivé). Un échec (plafond de
-- débit d'une très grande activité) n'empêche JAMAIS la suppression.
create or replace function public.events_prevenir_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  orga text := coalesce(old.organizer_id, old.author_id);
  nom  text;
begin
  if orga is null then return old; end if;
  select p.username into nom from public.profiles p where p.id = orga;
  begin
    perform set_config('passio.notification_serveur', '1', true);
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
    select 'n_sup_' || left(md5(old.id || a.user_id), 20), a.user_id, 'event_cancelled', orga, old.id,
           public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'))
             || ' a supprimé « ' || public.passio_echapper_html(left(coalesce(old.title, 'une activité'), 60)) || ' »',
           false
      from public.event_attendees a
     where a.event_id = old.id and a.user_id is distinct from orga
    on conflict (id) do nothing;
    perform set_config('passio.notification_serveur', '', true);
  exception when others then
    perform set_config('passio.notification_serveur', '', true);
  end;
  return old;
end
$fn$;

revoke all on function public.events_prevenir_suppression() from public, anon, authenticated;

drop trigger if exists trg_events_prevenir_suppression on public.events;
create trigger trg_events_prevenir_suppression before delete on public.events
  for each row execute function public.events_prevenir_suppression();

-- ── ③ L'ÉPREUVE, sous le vrai rôle `authenticated`, ANNULÉE ──
do $epreuve$
declare
  sfx  constant text := left(md5(clock_timestamp()::text || random()::text), 8);
  a    constant text := '00000000-0000-4000-8000-0000000c0201';   -- organise l'activité
  b    constant text := '00000000-0000-4000-8000-0000000c0202';   -- inscrit
  c3   constant text := '00000000-0000-4000-8000-0000000c0203';   -- inscrit
  d    constant text := '00000000-0000-4000-8000-0000000c0204';   -- étranger à tout
  conv constant text := 'zz_srv02_conv_' || sfx;
  grp  constant text := 'zz_srv02_grp_' || sfx;
  evt  constant text := 'zz_srv02_evt_' || sfx;
  mes  jsonb := '{}'::jsonb;
  t    record;
  etat text;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private) values
      (a, 'zz Alice ' || sfx, false), (b, 'zz Bob ' || sfx, false), (c3, 'zz Carol ' || sfx, false), (d, 'zz Dan ' || sfx, false);
    insert into public.conversations (id, is_group, created_by) values (conv, false, a);
    insert into public.conversations (id, is_group, created_by, group_name) values (grp, true, a, 'Équipe PASSIO compte suspendu');
    insert into public.conv_members (conv_id, user_id) values (conv, a), (conv, b), (grp, a), (grp, d);
    insert into public.events (id, organizer_id, author_id, title) values (evt, a, a, 'Rando <du> lac');
    insert into public.event_attendees (event_id, user_id, rsvp) values (evt, b, 'going'), (evt, c3, 'going');

    for t in
      select x.* from jsonb_to_recordset(jsonb_build_array(
        jsonb_build_object('cle', 'libre',     'de', a, 'a', d,  'kind', 'like',            'ref', 'p1', 'texte', 'Équipe PASSIO : ton compte est suspendu, écris à x@y.z'),
        jsonb_build_object('cle', 'faux_nom',  'de', a, 'a', d,  'kind', 'like',            'ref', 'p1', 'texte', 'Modération a aimé ton post'),
        jsonb_build_object('cle', 'reaction',  'de', a, 'a', d,  'kind', 'like',            'ref', 'p1', 'texte', 'x a réagi 💯 à ton post'),
        jsonb_build_object('cle', 'msg_hors',  'de', a, 'a', c3, 'kind', 'message',         'ref', conv, 'texte', 'x t''a envoyé un message'),
        jsonb_build_object('cle', 'msg_ok',    'de', a, 'a', b,  'kind', 'message',         'ref', conv, 'texte', 'x t''a envoyé un message'),
        jsonb_build_object('cle', 'groupe',    'de', a, 'a', d,  'kind', 'message',         'ref', grp,  'texte', 'x a écrit dans Équipe PASSIO compte suspendu'),
        jsonb_build_object('cle', 'invite',    'de', b, 'a', d,  'kind', 'event_invite',    'ref', evt,  'texte', 'x t''invite à <b>Gagne un iPhone</b>'),
        jsonb_build_object('cle', 'orga',      'de', a, 'a', c3, 'kind', 'event_update',    'ref', evt,  'texte', 'zz Alice ' || sfx || ' RDV devant l''entrée nord'),
        jsonb_build_object('cle', 'orga_hors', 'de', a, 'a', d,  'kind', 'event_update',    'ref', evt,  'texte', 'x Activité annulée, rembourse-toi sur ce lien'),
        jsonb_build_object('cle', 'inscrit',   'de', b, 'a', c3, 'kind', 'event_update',    'ref', evt,  'texte', 'x une place s''est libérée, tu es inscrit·e !'),
        jsonb_build_object('cle', 'inscrit_libre', 'de', b, 'a', c3, 'kind', 'event_update','ref', evt,  'texte', 'x Activité annulée, rembourse-toi sur ce lien'),
        jsonb_build_object('cle', 'etranger',  'de', d, 'a', c3, 'kind', 'event_cancelled', 'ref', evt,  'texte', 'x a annulé un événement auquel tu participais')
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

    -- Une ligne d'origine SERVEUR n'est pas touchée.
    perform set_config('passio.notification_serveur', '1', true);
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
      values ('zz_srv02_serveur_' || sfx, d, 'follow', a, a, 'texte serveur intact', false);
    perform set_config('passio.notification_serveur', '', true);
    mes := mes || jsonb_build_object('serveur', (select n.content from public.notifications n where n.id = 'zz_srv02_serveur_' || sfx));

    -- La suppression de l'activité prévient ses inscrits (b, c3), pas son organisatrice.
    delete from public.events where id = evt;
    mes := mes || jsonb_build_object('suppression', (select jsonb_agg(jsonb_build_object('a', n.user_id, 'texte', n.content, 'origine', n.origine) order by n.user_id)
                                                       from public.notifications n where n.ref_id = evt and n.id like 'n\_sup\_%'));
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
  perform set_config('passio.notification_serveur', '', true);
  perform set_config('passio.verdict_srv02', mes::text, true);
end $epreuve$;

-- ── ④ VERDICT ──
create temp table passio_srv02_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
with v as (select current_setting('passio.verdict_srv02', true)::jsonb j)
insert into pg_temp.passio_srv02_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout', case when j ? 'erreur' then 'ECHEC — ' || (j ->> 'erreur') else 'OK' end from v
union all select 2, true, 'un texte libre devient le gabarit, sous le VRAI nom',
  case when j #>> '{libre,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' a aimé ta publication' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{libre,texte}', j #>> '{libre,etat}', '-') end from v
union all select 3, true, 'un nom usurpé est remplacé, la phrase connue gardée',
  case when j #>> '{faux_nom,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' a aimé ton post' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{faux_nom,texte}', '-') end from v
union all select 4, true, 'une réaction emoji garde sa phrase',
  case when j #>> '{reaction,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' a réagi 💯 à ton post' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{reaction,texte}', '-') end from v
union all select 5, true, 'un message vers quelqu''un hors de la conversation est refusé (42501)',
  case when j #>> '{msg_hors,etat}' = '42501' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{msg_hors,etat}', '-') end from v
union all select 6, true, 'un message entre membres passe',
  case when j #>> '{msg_ok,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' t''a envoyé un message' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{msg_ok,texte}', j #>> '{msg_ok,etat}', '-') end from v
union all select 7, true, 'un groupe s''annonce par le gabarit, jamais par son nom',
  case when j #>> '{groupe,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' a écrit dans un groupe' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{groupe,texte}', j #>> '{groupe,etat}', '-') end from v
union all select 8, true, 'une invitation porte le VRAI titre, échappé',
  case when j #>> '{invite,texte}' = 'zz Bob ' || (j ->> 'sfx') || ' t''invite à <b>Rando &lt;du&gt; lac</b>' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{invite,texte}', '-') end from v
union all select 9, true, 'le message libre de l''organisateur à un INSCRIT est gardé, sans doubler son nom',
  case when j #>> '{orga,texte}' = 'zz Alice ' || (j ->> 'sfx') || ' RDV devant l''entrée nord' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{orga,texte}', j #>> '{orga,etat}', '-') end from v
union all select 10, true, 'l''organisateur ne peut pas écrire à un NON-inscrit (42501)',
  case when j #>> '{orga_hors,etat}' = '42501' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{orga_hors,texte}', j #>> '{orga_hors,etat}', '-') end from v
union all select 11, true, 'un inscrit prévient un inscrit par une phrase connue',
  case when j #>> '{inscrit,texte}' = 'zz Bob ' || (j ->> 'sfx') || ' une place s''est libérée, tu es inscrit·e !' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{inscrit,texte}', j #>> '{inscrit,etat}', '-') end from v
union all select 12, true, 'le texte libre d''un inscrit NON organisateur devient le gabarit',
  case when j #>> '{inscrit_libre,texte}' = 'zz Bob ' || (j ->> 'sfx') || ' a mis à jour une activité où tu es inscrit·e' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{inscrit_libre,texte}', j #>> '{inscrit_libre,etat}', '-') end from v
union all select 13, true, 'un étranger à l''activité ne peut pas l''annoncer annulée (42501)',
  case when j #>> '{etranger,etat}' = '42501' then 'OK' else 'ECHEC — ' || coalesce(j #>> '{etranger,texte}', j #>> '{etranger,etat}', '-') end from v
union all select 14, true, 'une ligne d''origine serveur n''est pas touchée',
  case when j ->> 'serveur' = 'texte serveur intact' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'serveur', '-') end from v
union all select 15, true, 'la suppression prévient les deux inscrits, au nom de l''organisatrice, d''origine serveur',
  case when jsonb_array_length(coalesce(j -> 'suppression', '[]'::jsonb)) = 2
        and (j #>> '{suppression,0,texte}') = 'zz Alice ' || (j ->> 'sfx') || ' a supprimé « Rando &lt;du&gt; lac »'
        and (j #>> '{suppression,0,origine}') = 'serveur'
       then 'OK' else 'ECHEC — ' || coalesce((j -> 'suppression')::text, '-') end from v
union all select 16, true, 'aucune ligne d''essai ne reste',
  (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.notifications
    where id like 'zz\_srv02\_%' or ref_id like 'zz\_srv02\_%')
union all select 17, true, 'les deux déclencheurs sont en place ; celui du texte passe après celui de l''origine',
  (select case when count(*) filter (where tgname = 'trg_notifications_texte') = 1
                and count(*) filter (where tgname = 'trg_notifications_origine') = 1
                and min(tgname) filter (where tgname in ('trg_notifications_origine', 'trg_notifications_texte')) = 'trg_notifications_origine'
                and exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'trg_events_prevenir_suppression')
               then 'OK' else 'ECHEC' end
     from pg_trigger where tgrelid = 'public.notifications'::regclass and not tgisinternal);

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
