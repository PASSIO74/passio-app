-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS : LES INSCRITS SONT PRÉVENUS PAR LE SERVEUR, TOUS (2026-11-22, village à 100, contrôle A3)
--
-- Une transaction, REJOUABLE, FERMÉE SUR ÉCHEC (SQLSTATE 55000 avant `commit;`), épreuve intégrée
-- sous le vrai rôle `authenticated`, ANNULÉE. Banc : tests/sql/migration-prevenir-inscrits-serveur.test.sh.
-- Aucun PREREQUIS-CLIENT : l'ancien client continue d'écrire ses notifications lui-même (rien ne lui
-- est retiré, son plafond ne change pas) ; le nouveau client essaie la fonction et, ABSENTE
-- (PGRST202), retombe sur l'ancien chemin. Les deux ordres de mise en ligne sont sûrs.
--
-- LE DÉFAUT (mesuré deux fois sur le staging, `npm run village:100`, séances 3 et 4) : l'organisatrice
-- annule une activité de 99 inscrits, 60 seulement sont prévenus — 39 refus 400 — et son écran dit
-- « inscrits prévenus ». `toggleCancelEvent` → `_notifyEventAttendees` (app-07) écrivait UNE ligne
-- `notifications` par destinataire DEPUIS SON NAVIGATEUR, en parallèle, sans réessai, alors que
-- `trg_rate_limit` plafonne `notifications` à 60 insertions par minute et par `from_id`
-- (`debit_compter`). Même chemin pour la modification (`event_update`) et le message groupé.
-- ET LA SUPPRESSION ÉTAIT PIRE : `events_prevenir_suppression` (12/11) écrit d'un seul INSERT… SELECT
-- au nom de l'organisateur ; la 61ᵉ ligne lève dans `debit_compter`, l'exception est avalée — et
-- l'INSERT entier est défait. Une activité de plus de 60 inscrits supprimée ne prévenait PERSONNE
-- (le client, lui, écrit APRÈS l'effacement : le lien métier n'existe plus, refus 42501).
--
-- LE CORRECTIF :
--   ① `prevenir_inscrits_activite(p_event_id, p_genre, p_cle, p_message)`, SECURITY DEFINER : la base
--     prévient elle-même les inscrits (« je participe », « peut-être », liste d'attente ; jamais
--     l'appelant, ni un compte bloqué dans un sens ou l'autre, ni un compte en suppression), au nom
--     de l'appelant, texte DÉRIVÉ (nom du profil échappé + phrase fixe, ou message ≤ 200 échappé), et
--     rend un COMPTE : `destinataires`, `prevenues`. Réservée à l'organisation (`organise_activite` :
--     auteur, organisateur, co-organisateur). `event_cancelled` exige l'activité ANNULÉE en base.
--     Identifiant DÉTERMINISTE `n_pi_` + md5(activité|genre|clé|destinataire) : la clé `p_cle` est
--     tirée au hasard par le client UNE fois par geste et réutilisée à son réessai — un rejeu ne
--     double rien. Elle n'est connue que de l'appelant : personne ne peut pré-occuper l'identifiant
--     (et si c'était le cas, un identifiant de repli, déterministe lui aussi, prend le relais).
--     Une ligne qui échoue (barrière d'un compte en suppression…) n'emporte pas les autres.
--     Débit : 12 diffusions par minute et par compte (une série récurrente compte 12 dates au plus),
--     plafond du jour de `debit_compter` en plus. Refus = `{ok:false, motif}`, jamais une exception.
--   ② `trg_rate_limit` de `notifications` passe par `notifications_limiter_debit()` : même plafond
--     (60/min/émetteur, `debit_compter`, `created_at = now()`), sauf pour une ligne d'origine SERVEUR
--     écrite pendant une DIFFUSION (`passio.diffusion_inscrits = '1'`, posé par ① et par la
--     suppression, remis à vide aussitôt). Une diffusion ne consomme plus non plus le plafond des
--     notifications ordinaires de l'organisateur. Le réglage n'est lisible que par une fonction de
--     la base : PostgREST n'expose aucun moyen de le poser (même confiance que
--     `passio.notification_serveur`, qui décide déjà de l'origine).
--   ③ `events_prevenir_suppression` pose ce même réglage et écarte les comptes en suppression : une
--     activité de 99 inscrits supprimée prévient les 99.
--
-- RETOUR ARRIÈRE (éditeur SQL) — rend le plafond générique et la suppression du 12/11 :
--| begin;
--| drop function if exists public.prevenir_inscrits_activite(text, text, text, text);
--| drop trigger if exists trg_rate_limit on public.notifications;
--| create trigger trg_rate_limit before insert on public.notifications
--|   for each row execute function public.rate_limit_insert('from_id', '60');
--| drop function if exists public.notifications_limiter_debit();
--| -- puis recoller `events_prevenir_suppression` de migrations/migration_notifications_texte_serveur_2026-11-12.sql (②bis)
--| commit;
-- (Le client retombe seul sur l'ancien chemin : fonction absente = PGRST202.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $g$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notifications_origine' and not tgisinternal) then
    raise exception 'notifications : le déclencheur d''origine manque — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_rate_limit' and not tgisinternal) then
    raise exception 'notifications : trg_rate_limit manque — relire le catalogue' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'trg_events_prevenir_suppression' and not tgisinternal) then
    raise exception 'events : l''avis de suppression du 12/11 manque — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if to_regprocedure('public.debit_compter(text, text, integer)') is null
     or to_regprocedure('public.organise_activite(text)') is null
     or to_regprocedure('public.is_blocked_with(text)') is null
     or to_regprocedure('public.passio_echapper_html(text)') is null
     or to_regclass('public.comptes_en_suppression') is null then
    raise exception 'debit_compter / organise_activite / is_blocked_with / passio_echapper_html / comptes_en_suppression manquent' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- L'ordre des déclencheurs est alphabétique : le plafond lit `new.origine`, posé par l'origine.
  if not ('trg_notifications_origine' < 'trg_rate_limit') then
    raise exception 'ordre des déclencheurs inattendu' using errcode = 'object_not_in_prerequisite_state';
  end if;
end $g$;

-- ── ② LE PLAFOND DE `notifications` NE COMPTE PLUS UNE DIFFUSION DU SERVEUR ──────────────────────
create or replace function public.notifications_limiter_debit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- L'horodatage serveur fait foi (le client n'antidate pas pour échapper au compte).
  new.created_at := pg_catalog.now();
  -- Une diffusion aux inscrits, écrite par la base (`prevenir_inscrits_activite`,
  -- `events_prevenir_suppression`) : bornée en amont, une fois par geste.
  if new.origine = 'serveur' and pg_catalog.current_setting('passio.diffusion_inscrits', true) = '1' then
    return new;
  end if;
  if new.from_id is null then return new; end if;
  perform public.debit_compter('notifications', new.from_id, 60);
  return new;
end
$fn$;

revoke all on function public.notifications_limiter_debit() from public, anon, authenticated;

drop trigger if exists trg_rate_limit on public.notifications;
create trigger trg_rate_limit before insert on public.notifications
  for each row execute function public.notifications_limiter_debit();

-- ── ① LA BASE PRÉVIENT LES INSCRITS ──────────────────────────────────────────────────────────────
create or replace function public.prevenir_inscrits_activite(p_event_id text, p_genre text, p_cle text, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  moi    text := (auth.uid())::text;
  ev     record;
  nom    text;
  texte  text;
  msg    text := nullif(btrim(coalesce(p_message, '')), '');
  r      record;
  ident  text;
  dest   integer := 0;
  prev   integer := 0;
begin
  if moi is null then return jsonb_build_object('ok', false, 'motif', 'non_connecte'); end if;
  if p_genre is null or p_genre not in ('event_cancelled', 'event_update') then
    return jsonb_build_object('ok', false, 'motif', 'genre_inconnu');
  end if;
  if p_cle is null or p_cle !~ '^[A-Za-z0-9_-]{8,64}$' then
    return jsonb_build_object('ok', false, 'motif', 'cle_invalide');
  end if;
  if p_genre = 'event_cancelled' and msg is not null then
    return jsonb_build_object('ok', false, 'motif', 'message_hors_genre');
  end if;
  select e.id, e.status into ev from public.events e where e.id = p_event_id;
  if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
  -- L'organisation a UNE définition (R24) : auteur, organisateur, co-organisateur.
  if not coalesce(public.organise_activite(p_event_id), false) then
    return jsonb_build_object('ok', false, 'motif', 'non_autorise');
  end if;
  -- « Annulée » ne se dit que d'une activité annulée EN BASE.
  if p_genre = 'event_cancelled' and ev.status is distinct from 'cancelled' then
    return jsonb_build_object('ok', false, 'motif', 'pas_annulee');
  end if;
  -- Une diffusion = un compte de plus, 12 par minute (plafond du jour compris).
  begin
    perform public.debit_compter('prevenir_inscrits', moi, 12);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'motif', 'debit');
  end;

  -- Le texte est DÉRIVÉ : le nom du profil, puis une phrase fixe (celles que l'application
  -- écrivait), ou le message de l'organisation, borné et échappé.
  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = moi;
  texte := public.passio_echapper_html(coalesce(nom, 'Quelqu''un')) || ' ' || case
    when p_genre = 'event_cancelled' then 'a annulé un événement auquel tu participais'
    when msg is null then 'a modifié un événement auquel tu participes'
    else public.passio_echapper_html(left(msg, 200))
  end;

  perform set_config('passio.notification_serveur', '1', true);
  perform set_config('passio.diffusion_inscrits', '1', true);
  for r in
    select a.user_id
      from public.event_attendees a
     where a.event_id = p_event_id
       and a.rsvp in ('going', 'maybe', 'waitlist')
       and a.user_id is distinct from moi
       and not public.is_blocked_with(a.user_id)
       and not exists (select 1 from public.comptes_en_suppression c
                        where c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee'))
     order by (a.rsvp = 'going') desc, a.created_at, a.user_id
  loop
    dest := dest + 1;
    ident := 'n_pi_' || left(md5(p_event_id || '|' || p_genre || '|' || p_cle || '|' || r.user_id), 20);
    begin
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
        values (ident, r.user_id, p_genre, moi, p_event_id, texte, false)
        on conflict (id) do nothing;
      if not found then
        -- Déjà là : le rejeu du même geste (même clé) — compté, pas réécrit. Une ligne qui ne
        -- serait PAS la nôtre (identifiant occupé) laisse la place à l'identifiant de repli.
        if not exists (select 1 from public.notifications n
                        where n.id = ident and n.user_id = r.user_id and n.from_id = moi and n.kind = p_genre
                          and n.ref_id = p_event_id and n.origine = 'serveur') then
          ident := 'n_pi_' || left(md5(ident || '|repli'), 20);
          insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
            values (ident, r.user_id, p_genre, moi, p_event_id, texte, false)
            on conflict (id) do nothing;
          if not found and not exists (select 1 from public.notifications n
                                        where n.id = ident and n.user_id = r.user_id and n.from_id = moi and n.kind = p_genre
                                          and n.ref_id = p_event_id and n.origine = 'serveur') then
            raise exception 'identifiant occupé';
          end if;
        end if;
      end if;
      prev := prev + 1;
    exception when others then
      -- Une personne non prévenue n'emporte pas les autres ; le compte rendu le dit.
      raise warning 'prevenir_inscrits_activite : une notification non écrite (%)', sqlstate;
    end;
  end loop;
  perform set_config('passio.diffusion_inscrits', '', true);
  perform set_config('passio.notification_serveur', '', true);
  -- Un COMPTE, jamais la liste : qui a été écarté (blocage) ne se dit pas.
  return jsonb_build_object('ok', true, 'destinataires', dest, 'prevenues', prev);
end
$fn$;

revoke all on function public.prevenir_inscrits_activite(text, text, text, text) from public, anon;
grant execute on function public.prevenir_inscrits_activite(text, text, text, text) to authenticated;

-- ── ③ LA SUPPRESSION PRÉVIENT TOUT LE MONDE, PAS « 60 OU PERSONNE » ──────────────────────────────
-- La définition du 12/11, plus : le réglage de diffusion (② ne compte pas ces lignes) et l'écart
-- des comptes en suppression (leur barrière faisait échouer l'INSERT entier).
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
    perform set_config('passio.diffusion_inscrits', '1', true);
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
    select 'n_sup_' || left(md5(old.id || a.user_id), 20), a.user_id, 'event_cancelled', orga, old.id,
           public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'))
             || ' a supprimé « ' || public.passio_echapper_html(left(coalesce(old.title, 'une activité'), 60)) || ' »',
           false
      from public.event_attendees a
     where a.event_id = old.id and a.user_id is distinct from orga
       and not exists (select 1 from public.comptes_en_suppression c
                        where c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee'))
    on conflict (id) do nothing;
    perform set_config('passio.diffusion_inscrits', '', true);
    perform set_config('passio.notification_serveur', '', true);
  exception when others then
    perform set_config('passio.diffusion_inscrits', '', true);
    perform set_config('passio.notification_serveur', '', true);
  end;
  return old;
end
$fn$;

revoke all on function public.events_prevenir_suppression() from public, anon, authenticated;

-- ── ④ L'ÉPREUVE, sous le vrai rôle `authenticated`, ANNULÉE ──────────────────────────────────────
-- 70 inscrits (20 venants, 45 en attente, 4 « peut-être », 1 « ne vient pas ») dont un qui a BLOQUÉ
-- l'organisatrice : au-delà des 60 du plafond.
do $epreuve$
declare
  sfx   constant text := left(md5(clock_timestamp()::text || random()::text), 8);
  a     constant text := '00000000-0000-4000-8000-0000000d0a01';   -- organise
  x     constant text := '00000000-0000-4000-8000-0000000d0a02';   -- étrangère
  bloq  constant text := '00000000-0000-4000-8000-0000000d0a03';   -- inscrite, a bloqué l'organisatrice
  evt   constant text := 'zz_pi_evt_' || sfx;
  evs   constant text := 'zz_pi_sup_' || sfx;
  mes   jsonb := '{}'::jsonb;
  i     integer;
  u     text;
  j     jsonb;
  etat  text;
  cle1  constant text := 'zzcle1' || sfx;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private) values
      (a, 'zz Lé&a ' || sfx, false), (x, 'zz Xavier ' || sfx, false), (bloq, 'zz Bloque ' || sfx, false);
    insert into public.events (id, organizer_id, author_id, title, status, date_at) values
      (evt, a, a, 'Rando ' || sfx, 'active', now() + interval '2 days'),
      (evs, a, a, 'Pique <nique>', 'active', now() + interval '3 days');
    insert into public.event_attendees (event_id, user_id, rsvp) values (evt, a, 'going'), (evs, a, 'going');
    for i in 1..69 loop
      u := '00000000-0000-4000-8000-0000000d' || lpad(to_hex(4096 + i), 4, '0');
      insert into public.profiles (id, username, is_private) values (u, 'zz p' || i || ' ' || sfx, false);
      insert into public.event_attendees (event_id, user_id, rsvp) values
        (evt, u, case when i <= 19 then 'going' when i <= 64 then 'waitlist' when i <= 68 then 'maybe' else 'declined' end),
        (evs, u, 'going');
    end loop;
    insert into public.event_attendees (event_id, user_id, rsvp) values (evt, bloq, 'going');
    insert into public.blocks (blocker_id, blocked_id) values (bloq, a);

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', a, true);
    -- Pas encore annulée : refus.
    mes := mes || jsonb_build_object('pas_annulee', public.prevenir_inscrits_activite(evt, 'event_cancelled', cle1));
    execute 'reset role';
    update public.events set status = 'cancelled' where id = evt;
    execute 'set local role authenticated';
    -- L'annulation : 68 personnes (70 − « ne vient pas » − la personne qui a bloqué).
    mes := mes || jsonb_build_object('annule', public.prevenir_inscrits_activite(evt, 'event_cancelled', cle1));
    -- Le rejeu du même geste ne double rien.
    mes := mes || jsonb_build_object('rejeu', public.prevenir_inscrits_activite(evt, 'event_cancelled', cle1));
    -- Le message de l'organisation, échappé.
    mes := mes || jsonb_build_object('message', public.prevenir_inscrits_activite(evt, 'event_update', 'zzcle2' || sfx, '  <b>RDV</b> à l''entrée nord  '));
    -- Une notification ORDINAIRE de l'organisatrice passe encore : la diffusion n'a pas mangé son plafond.
    begin
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
        values ('zz_pi_client_' || sfx, '00000000-0000-4000-8000-0000000d1001', 'event_update', a, evt, 'x a modifié un événement auquel tu participes', false);
      etat := 'ok';
    exception when others then etat := sqlstate;
    end;
    mes := mes || jsonb_build_object('client_apres', etat);
    -- Une étrangère ne prévient personne.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', x, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', x, true);
    mes := mes || jsonb_build_object('etrangere', public.prevenir_inscrits_activite(evt, 'event_update', 'zzcle3' || sfx));
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);

    mes := mes || jsonb_build_object(
      'lignes_annule', (select count(*) from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled'),
      'personnes_annule', (select count(distinct n.user_id) from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled'),
      'origine_annule', (select string_agg(distinct n.origine, ',') from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled'),
      'orga_prevenue', (select count(*) from public.notifications n where n.ref_id = evt and n.user_id = a and n.kind in ('event_cancelled', 'event_update') and n.id like 'n\_pi\_%'),
      'bloq_prevenue', (select count(*) from public.notifications n where n.ref_id = evt and n.user_id = bloq and n.id like 'n\_pi\_%'),
      'texte_annule', (select n.content from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled' limit 1),
      'texte_message', (select n.content from public.notifications n where n.ref_id = evt and n.kind = 'event_update' and n.id like 'n\_pi\_%' limit 1));

    -- La suppression d'une activité de 70 inscrits les prévient TOUS (69 + la personne de l'organisatrice exclue).
    delete from public.events where id = evs;
    mes := mes || jsonb_build_object('suppression', (select count(*) from public.notifications n where n.ref_id = evs and n.id like 'n\_sup\_%'));
    mes := mes || jsonb_build_object('sfx', sfx);
    raise exception 'zz_pi_annule';
  exception when others then
    if sqlerrm <> 'zz_pi_annule' then
      mes := mes || jsonb_build_object('erreur', sqlstate || ' ' || sqlerrm);
    end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('passio.notification_serveur', '', true);
  perform set_config('passio.diffusion_inscrits', '', true);
  perform set_config('passio.verdict_pi', mes::text, true);
end $epreuve$;

-- ── ⑤ VERDICT ────────────────────────────────────────────────────────────────────────────────────
create temp table passio_pi_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
with v as (select current_setting('passio.verdict_pi', true)::jsonb j)
insert into pg_temp.passio_pi_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout', case when j ? 'erreur' then 'ECHEC — ' || (j ->> 'erreur') else 'OK' end from v
union all select 2, true, 'une activité NON annulée ne s''annonce pas annulée',
  case when j #>> '{pas_annulee,motif}' = 'pas_annulee' then 'OK' else 'ECHEC — ' || coalesce((j -> 'pas_annulee')::text, '-') end from v
union all select 3, true, 'l''annulation prévient 68 personnes sur 68 (au-delà des 60 du plafond)',
  case when (j #>> '{annule,destinataires}') = '68' and (j #>> '{annule,prevenues}') = '68' then 'OK' else 'ECHEC — ' || coalesce((j -> 'annule')::text, '-') end from v
union all select 4, true, 'une ligne par personne, d''origine serveur, jamais l''organisatrice ni qui l''a bloquée',
  case when (j ->> 'lignes_annule') = '68' and (j ->> 'personnes_annule') = '68' and (j ->> 'origine_annule') = 'serveur'
        and (j ->> 'orga_prevenue') = '0' and (j ->> 'bloq_prevenue') = '0'
       then 'OK' else 'ECHEC — lignes ' || coalesce(j ->> 'lignes_annule', '-') || ', personnes ' || coalesce(j ->> 'personnes_annule', '-')
                       || ', origine ' || coalesce(j ->> 'origine_annule', '-') || ', orga ' || coalesce(j ->> 'orga_prevenue', '-') || ', bloquée ' || coalesce(j ->> 'bloq_prevenue', '-') end from v
union all select 5, true, 'le rejeu du même geste ne double rien (68 comptées, aucune ligne de plus)',
  case when (j #>> '{rejeu,prevenues}') = '68' and (j ->> 'lignes_annule') = '68' then 'OK' else 'ECHEC — ' || coalesce((j -> 'rejeu')::text, '-') end from v
union all select 6, true, 'le texte est dérivé : le nom ÉCHAPPÉ du profil, la phrase fixe',
  case when j ->> 'texte_annule' = 'zz Lé&amp;a ' || (j ->> 'sfx') || ' a annulé un événement auquel tu participais' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'texte_annule', '-') end from v
union all select 7, true, 'le message de l''organisation est borné et échappé',
  case when (j #>> '{message,prevenues}') = '68'
        and j ->> 'texte_message' = 'zz Lé&amp;a ' || (j ->> 'sfx') || ' &lt;b&gt;RDV&lt;/b&gt; à l&#39;entrée nord'
       then 'OK' else 'ECHEC — ' || coalesce(j ->> 'texte_message', (j -> 'message')::text, '-') end from v
union all select 8, true, 'après 136 lignes diffusées, une notification ordinaire de l''organisatrice passe encore',
  case when j ->> 'client_apres' = 'ok' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'client_apres', '-') end from v
union all select 9, true, 'une personne étrangère à l''organisation ne prévient personne',
  case when j #>> '{etrangere,motif}' = 'non_autorise' then 'OK' else 'ECHEC — ' || coalesce((j -> 'etrangere')::text, '-') end from v
union all select 10, true, 'la suppression d''une activité de 70 inscrits prévient les 69 autres',
  case when j ->> 'suppression' = '69' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'suppression', '-') end from v
union all select 11, true, 'aucune ligne d''essai ne reste',
  (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.notifications
    where id like 'zz\_pi\_%' or ref_id like 'zz\_pi\_%')
union all select 12, true, 'la fonction : SECURITY DEFINER, search_path vide, exécutable par authenticated seulement',
  (select case when p.prosecdef and p.proconfig @> array['search_path=""']
                and has_function_privilege('authenticated', p.oid, 'execute')
                and not has_function_privilege('anon', p.oid, 'execute')
               then 'OK' else 'ECHEC' end
     from pg_proc p where p.oid = 'public.prevenir_inscrits_activite(text, text, text, text)'::regprocedure)
union all select 13, true, 'trg_rate_limit de notifications passe par notifications_limiter_debit, après l''origine',
  (select case when count(*) = 1 and min(p.proname) = 'notifications_limiter_debit'
                and not has_function_privilege('authenticated', min(p.oid), 'execute')
               then 'OK' else 'ECHEC' end
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'trg_rate_limit' and not t.tgisinternal)
union all select 14, true, 'la suppression pose le réglage de diffusion',
  (select case when p.prosrc like '%passio.diffusion_inscrits%' then 'OK' else 'ECHEC' end
     from pg_proc p where p.oid = 'public.events_prevenir_suppression()'::regprocedure);

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_pi_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'prévenir les inscrits : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_pi_verdict order by n;

commit;
