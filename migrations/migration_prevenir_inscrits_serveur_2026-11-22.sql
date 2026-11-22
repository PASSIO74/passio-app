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
-- (mesuré au staging : 0 sur 69 ; le client, lui, écrit APRÈS l'effacement : refus 42501).
--
-- LE CORRECTIF :
--   ① `prevenir_inscrits_activite(p_event_id, p_genre, p_cle, p_message)`, SECURITY DEFINER : la base
--     prévient elle-même les inscrits (« je participe », « peut-être », liste d'attente ; jamais
--     l'appelant, ni un compte bloqué dans un sens ou l'autre), au nom de l'appelant, texte DÉRIVÉ
--     (nom du profil échappé + phrase fixe, ou message ≤ 200 échappé, 600 au total), et rend un
--     COMPTE : `destinataires`, `prevenues`. Réservée à l'organisation (`organise_activite`), refusée
--     à un compte en suppression ; `event_cancelled` exige l'activité ANNULÉE en base ;
--     `event_update` exige l'admission (`adult_access_allowed`, comme la modification d'une activité)
--     et une activité terminée depuis moins de 2 jours.
--     IDENTIFIANTS `n_pi_` (réservés au serveur, ⑤) : une annulation = md5(activité|genre|destinataire),
--     UNE par personne et par activité (une nouvelle annulation après réactivation remet la ligne en
--     « non lue ») ; une mise à jour = md5(activité|genre|clé|destinataire), la clé étant tirée par le
--     client une fois par geste et réutilisée à son réessai — un rejeu ne double rien.
--     BORNES (relecture red team du 22/11, P1 : « le débit comptait les APPELS, pas les lignes ») :
--       · 3 diffusions par heure, par ACTIVITÉ et par genre (`debit_ecritures`, fenêtre glissante) ;
--       · 20 diffusions par minute et par compte (`debit_compter`, plafond du jour compris) ;
--       · un budget du jour en LIGNES diffusées, par compte : 6 000 (1 500 la première semaine)
--         (`debit_jour_compter('notifications_diffusion', …)`).
--     Écriture ensembliste (un seul INSERT … ON CONFLICT), sans sous-transaction par ligne. Un compte
--     en suppression est compté comme prévenu, sans ligne écrite : un écart d'une unité révélerait
--     qu'un inscrit supprime son compte (ASTRA-25). Refus = `{ok:false, motif}`, jamais une exception.
--   ② `trg_rate_limit` de `notifications` passe par `notifications_limiter_debit()` : même plafond
--     (60/min/émetteur, `debit_compter`, `created_at = now()`), sauf pour une ligne d'origine SERVEUR
--     écrite pendant une DIFFUSION (`passio.diffusion_inscrits = '1'`, posé LOCALEMENT par ① et par la
--     suppression, puis rendu à sa valeur précédente). Une diffusion ne consomme plus le plafond des
--     notifications ordinaires de l'organisateur. PostgREST n'expose aucun moyen de poser ce réglage
--     (même confiance que `passio.notification_serveur`, qui décide déjà de l'origine).
--   ③ `events_prevenir_suppression` pose ce même réglage, écarte les comptes en suppression, ceux qui
--     ont décliné et les blocages : une activité de 99 inscrits supprimée prévient les 99.
--   ⑤ `identifiant_reserve_au_serveur` réserve aussi `n_pi_` et `n_sup_` : un inscrit pouvait
--     pré-occuper `n_sup_<md5(activité||destinataire)>` (calculable par tous) et faire sauter l'avis
--     de suppression d'un autre (défaut du 12/11, relevé par la relecture red team).
--   Gardes : les corps remplacés doivent être ceux relus (md5 normalisé, production ou v1 du
--   staging), et `trg_rate_limit` lié à `rate_limit_insert('from_id','60')` ou à
--   `notifications_limiter_debit()` — sinon RIEN n'est appliqué.
--
-- RETOUR ARRIÈRE (éditeur SQL) — rend le plafond générique, la suppression du 12/11 et la réserve
-- d'identifiants du 03/11 (textes de production relus le 2026-11-22) :
--| begin;
--| drop function if exists public.prevenir_inscrits_activite(text, text, text, text);
--| drop trigger if exists trg_rate_limit on public.notifications;
--| create trigger trg_rate_limit before insert on public.notifications
--|   for each row execute function public.rate_limit_insert('from_id', '60');
--| drop function if exists public.notifications_limiter_debit();
--| create or replace function public.identifiant_reserve_au_serveur(p_id text) returns boolean
--|   language sql immutable set search_path to '' as $f$
--|   select p_id like 'n\_m\_%' or p_id like 'n\_pa\_%' or p_id like 'n\_fw\_%'
--|       or p_id like 'n\_fr\_%' or p_id like 'n\_fa\_%'
--| $f$;
--| create or replace function public.events_prevenir_suppression() returns trigger
--|   language plpgsql security definer set search_path to '' as $f$
--| declare
--|   orga text := coalesce(old.organizer_id, old.author_id);
--|   nom  text;
--| begin
--|   if orga is null then return old; end if;
--|   select p.username into nom from public.profiles p where p.id = orga;
--|   begin
--|     perform set_config('passio.notification_serveur', '1', true);
--|     insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
--|     select 'n_sup_' || left(md5(old.id || a.user_id), 20), a.user_id, 'event_cancelled', orga, old.id,
--|            public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'))
--|              || ' a supprimé « ' || public.passio_echapper_html(left(coalesce(old.title, 'une activité'), 60)) || ' »',
--|            false
--|       from public.event_attendees a
--|      where a.event_id = old.id and a.user_id is distinct from orga
--|     on conflict (id) do nothing;
--|     perform set_config('passio.notification_serveur', '', true);
--|   exception when others then
--|     perform set_config('passio.notification_serveur', '', true);
--|   end;
--|   return old;
--| end
--| $f$;
--| commit;
-- (Le client retombe seul sur l'ancien chemin : fonction absente = PGRST202.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── GARDES : on ne remplace que ce qu'on a relu ──────────────────────────────────────────────────
do $g$
declare
  f record;
  h text;
  marque constant text := 'PASSIO prevenir-inscrits v2';
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notifications_origine' and not tgisinternal) then
    raise exception 'notifications : le déclencheur d''origine manque — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if to_regprocedure('public.debit_compter(text, text, integer)') is null
     or to_regprocedure('public.debit_jour_compter(text, text, bigint, bigint)') is null
     or to_regprocedure('public.compte_recent(text)') is null
     or to_regprocedure('public.organise_activite(text)') is null
     or to_regprocedure('public.is_blocked_with(text)') is null
     or to_regprocedure('public.passio_echapper_html(text)') is null
     or to_regprocedure('public.suppression_de_mon_compte()') is null
     or to_regprocedure('public.adult_access_allowed()') is null
     or to_regclass('public.comptes_en_suppression') is null
     or to_regclass('public.debit_ecritures') is null then
    raise exception 'une fonction ou une table prérequise manque — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- L'ordre des déclencheurs est alphabétique : le plafond lit `new.origine`, posé par l'origine.
  if not ('trg_notifications_origine' < 'trg_rate_limit') then
    raise exception 'ordre des déclencheurs inattendu' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- Corps remplacés : production relue le 22/11, ou v1 de cette migration (staging), ou v2 (rejeu).
  for f in select * from (values
      ('public.events_prevenir_suppression()', 'b9767e8210b46598ff8a68437acafd3b', '1e13f963d33270fc2219ed2f66b6931a'),
      ('public.identifiant_reserve_au_serveur(text)', '5214adbb9c88ffd7800c75547e498258', '5214adbb9c88ffd7800c75547e498258')
    ) as x(signature, prod, v1) loop
    if to_regprocedure(f.signature) is null then
      raise exception '% absente — RIEN n''est appliqué', f.signature using errcode = 'object_not_in_prerequisite_state';
    end if;
    select md5(btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')))
      into h from pg_proc p where p.oid = to_regprocedure(f.signature);
    if h not in (f.prod, f.v1)
       and not exists (select 1 from pg_proc p where p.oid = to_regprocedure(f.signature) and p.prosrc like '%' || marque || '%') then
      raise exception '% : corps différent de celui relu (md5 %) — RIEN n''est appliqué', f.signature, h using errcode = 'object_not_in_prerequisite_state';
    end if;
  end loop;
  -- `trg_rate_limit` : la liaison de production, ou celle de cette migration.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'trg_rate_limit' and not t.tgisinternal
                    and t.tgenabled = 'O' and t.tgtype = 7
                    and ((t.tgfoid = 'public.rate_limit_insert()'::regprocedure and t.tgnargs = 2
                          and encode(t.tgargs, 'escape') = 'from_id\00060\000')
                      or (t.tgfoid = to_regprocedure('public.notifications_limiter_debit()') and t.tgnargs = 0))) then
    raise exception 'notifications : trg_rate_limit différent de la liaison relue — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if to_regprocedure('public.notifications_limiter_debit()') is not null then
    select md5(btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))) into h from pg_proc p where p.oid = 'public.notifications_limiter_debit()'::regprocedure;
    if h <> '110d7bfae9b5a209c5100151ca38c99a'
       and not exists (select 1 from pg_proc p where p.oid = 'public.notifications_limiter_debit()'::regprocedure and p.prosrc like '%' || marque || '%') then
      raise exception 'notifications_limiter_debit : corps inconnu (md5 %) — RIEN n''est appliqué', h using errcode = 'object_not_in_prerequisite_state';
    end if;
  end if;
end $g$;

-- ── ② LE PLAFOND DE `notifications` NE COMPTE PLUS UNE DIFFUSION DU SERVEUR ──────────────────────
create or replace function public.notifications_limiter_debit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
-- PASSIO prevenir-inscrits v2
begin
  -- L'horodatage serveur fait foi (le client n'antidate pas pour échapper au compte).
  new.created_at := pg_catalog.now();
  -- Une diffusion aux inscrits, écrite par la base (`prevenir_inscrits_activite`,
  -- `events_prevenir_suppression`) : bornée en amont (par activité, par compte, en lignes par jour).
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

-- ── ⑤ `n_pi_` ET `n_sup_` SONT RÉSERVÉS AU SERVEUR ────────────────────────────────────────────────
-- Lue par la policy d'INSERT client `notifications_insert_own_author`.
create or replace function public.identifiant_reserve_au_serveur(p_id text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  -- PASSIO prevenir-inscrits v2
  select p_id like 'n\_m\_%'
      or p_id like 'n\_pa\_%'
      or p_id like 'n\_fw\_%'
      or p_id like 'n\_fr\_%'
      or p_id like 'n\_fa\_%'
      or p_id like 'n\_pi\_%'
      or p_id like 'n\_sup\_%'
$fn$;

-- ── ① LA BASE PRÉVIENT LES INSCRITS ──────────────────────────────────────────────────────────────
create or replace function public.prevenir_inscrits_activite(p_event_id text, p_genre text, p_cle text, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
-- PASSIO prevenir-inscrits v2
declare
  moi      text := (auth.uid())::text;
  ev       record;
  nom      text;
  texte    text;
  msg      text := nullif(btrim(coalesce(p_message, '')), '');
  dest     integer := 0;
  partis   integer := 0;
  ecrites  integer := 0;
  heure    integer := 0;
  prec_srv text := pg_catalog.current_setting('passio.notification_serveur', true);
  prec_dif text := pg_catalog.current_setting('passio.diffusion_inscrits', true);
begin
  if moi is null then return jsonb_build_object('ok', false, 'motif', 'non_connecte'); end if;
  if public.suppression_de_mon_compte() then return jsonb_build_object('ok', false, 'motif', 'compte_en_suppression'); end if;
  if p_genre is null or p_genre not in ('event_cancelled', 'event_update') then
    return jsonb_build_object('ok', false, 'motif', 'genre_inconnu');
  end if;
  if p_cle is null or p_cle !~ '^[A-Za-z0-9_-]{8,64}$' then
    return jsonb_build_object('ok', false, 'motif', 'cle_invalide');
  end if;
  if p_genre = 'event_cancelled' and msg is not null then
    return jsonb_build_object('ok', false, 'motif', 'message_hors_genre');
  end if;
  select e.id, e.status, e.date_at, e.end_at into ev from public.events e where e.id = p_event_id;
  if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
  -- L'organisation a UNE définition (R24) : auteur, organisateur, co-organisateur.
  if not coalesce(public.organise_activite(p_event_id), false) then
    return jsonb_build_object('ok', false, 'motif', 'non_autorise');
  end if;
  if p_genre = 'event_cancelled' then
    -- « Annulée » ne se dit que d'une activité annulée EN BASE.
    if ev.status is distinct from 'cancelled' then return jsonb_build_object('ok', false, 'motif', 'pas_annulee'); end if;
  else
    -- Comme la modification d'une activité (`events_admission_gardee`) : l'admission est requise.
    if not coalesce(public.adult_access_allowed(), false) then
      return jsonb_build_object('ok', false, 'motif', 'admission_requise');
    end if;
    -- Les inscrits d'une activité passée ne deviennent pas une liste de diffusion permanente.
    if coalesce(ev.end_at, ev.date_at + interval '3 hours') < pg_catalog.now() - interval '2 days' then
      return jsonb_build_object('ok', false, 'motif', 'activite_terminee');
    end if;
  end if;

  -- Le texte est DÉRIVÉ : le nom du profil, puis une phrase fixe, ou le message de l'organisation,
  -- borné AVANT échappement à 200, et refusé si, échappé, il dépasse la borne de la table (600).
  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = moi;
  texte := public.passio_echapper_html(coalesce(nom, 'Quelqu''un')) || ' ' || case
    when p_genre = 'event_cancelled' then 'a annulé un événement auquel tu participais'
    when msg is null then 'a modifié un événement auquel tu participes'
    else public.passio_echapper_html(left(msg, 200))
  end;
  if char_length(texte) > 600 then return jsonb_build_object('ok', false, 'motif', 'message_trop_long'); end if;

  -- 3 diffusions par heure, par activité et par genre (fenêtre glissante de 60 minutes).
  select coalesce(sum(d.n), 0) into heure from public.debit_ecritures d
   where d.table_nom = 'prevenir_activite' and d.source = p_event_id || '|' || p_genre
     and d.minute > pg_catalog.date_trunc('minute', pg_catalog.now()) - interval '60 minutes';
  if heure >= 3 then return jsonb_build_object('ok', false, 'motif', 'debit_activite'); end if;

  -- Destinataires : venants, « peut-être », liste d'attente ; jamais l'appelant ni un blocage.
  select count(*) filter (where c.user_id is null), count(*) filter (where c.user_id is not null)
    into dest, partis
    from public.event_attendees a
    left join public.comptes_en_suppression c on c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee')
   where a.event_id = p_event_id and a.rsvp in ('going', 'maybe', 'waitlist')
     and a.user_id is distinct from moi and not public.is_blocked_with(a.user_id);

  -- Débits : la diffusion compte pour l'activité et pour le compte (par minute, plafond du jour
  -- compris) ; les LIGNES comptent dans un budget du jour, par compte.
  begin
    perform public.debit_compter('prevenir_activite', p_event_id || '|' || p_genre, 1000);
    perform public.debit_compter('prevenir_inscrits', moi, 20);
    if dest > 0 then
      perform public.debit_jour_compter('notifications_diffusion', moi, dest::bigint,
        case when public.compte_recent(moi) then 1500 else 6000 end);
    end if;
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'motif', 'debit');
  end;

  if dest > 0 then
    begin
      perform pg_catalog.set_config('passio.notification_serveur', '1', true);
      perform pg_catalog.set_config('passio.diffusion_inscrits', '1', true);
      insert into public.notifications as n (id, user_id, kind, from_id, ref_id, content, seen)
      select 'n_pi_' || left(md5(case when p_genre = 'event_cancelled'
                                      then p_event_id || '|' || p_genre || '|' || a.user_id
                                      else p_event_id || '|' || p_genre || '|' || p_cle || '|' || a.user_id end), 20),
             a.user_id, p_genre, moi, p_event_id, texte, false
        from public.event_attendees a
       where a.event_id = p_event_id and a.rsvp in ('going', 'maybe', 'waitlist')
         and a.user_id is distinct from moi and not public.is_blocked_with(a.user_id)
         and not exists (select 1 from public.comptes_en_suppression c
                          where c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee'))
      -- Rejeu d'un même geste, ou nouvelle annulation après réactivation : la ligne de CETTE
      -- personne, de CET émetteur, redevient non lue — jamais une ligne d'autrui.
      on conflict (id) do update set content = excluded.content, seen = false, created_at = pg_catalog.now()
        where n.user_id = excluded.user_id and n.from_id = excluded.from_id and n.kind = excluded.kind
          and n.ref_id = excluded.ref_id and n.origine = 'serveur';
      get diagnostics ecrites = row_count;
      perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
      perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
    exception when others then
      perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
      perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
      raise warning 'prevenir_inscrits_activite : diffusion non écrite (%)', sqlstate;
      return jsonb_build_object('ok', false, 'motif', 'echec_ecriture', 'destinataires', dest + partis);
    end;
  end if;
  -- Un COMPTE, jamais la liste. Un compte en suppression est compté comme prévenu (aucune ligne :
  -- il n'a plus de cloche) — l'écart d'une unité révélerait sa suppression (ASTRA-25).
  return jsonb_build_object('ok', true, 'destinataires', dest + partis, 'prevenues', ecrites + partis);
end
$fn$;

revoke all on function public.prevenir_inscrits_activite(text, text, text, text) from public, anon;
grant execute on function public.prevenir_inscrits_activite(text, text, text, text) to authenticated;

-- ── ③ LA SUPPRESSION PRÉVIENT TOUT LE MONDE, PAS « 60 OU PERSONNE » ──────────────────────────────
create or replace function public.events_prevenir_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
-- PASSIO prevenir-inscrits v2
declare
  orga     text := coalesce(old.organizer_id, old.author_id);
  nom      text;
  prec_srv text := pg_catalog.current_setting('passio.notification_serveur', true);
  prec_dif text := pg_catalog.current_setting('passio.diffusion_inscrits', true);
begin
  if orga is null then return old; end if;
  select p.username into nom from public.profiles p where p.id = orga;
  begin
    perform pg_catalog.set_config('passio.notification_serveur', '1', true);
    perform pg_catalog.set_config('passio.diffusion_inscrits', '1', true);
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
    select 'n_sup_' || left(md5(old.id || a.user_id), 20), a.user_id, 'event_cancelled', orga, old.id,
           public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'))
             || ' a supprimé « ' || public.passio_echapper_html(left(coalesce(old.title, 'une activité'), 60)) || ' »',
           false
      from public.event_attendees a
     where a.event_id = old.id and a.user_id is distinct from orga
       and a.rsvp in ('going', 'maybe', 'waitlist')
       and not public.is_blocked_with(a.user_id)
       and not exists (select 1 from public.comptes_en_suppression c
                        where c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee'))
    on conflict (id) do nothing;
    perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
    perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
  exception when others then
    perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
    perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
  end;
  return old;
end
$fn$;

revoke all on function public.events_prevenir_suppression() from public, anon, authenticated;

-- ── ④ L'ÉPREUVE, sous le vrai rôle `authenticated`, ANNULÉE ──────────────────────────────────────
-- 70 inscrits (20 venants, 45 en attente, 4 « peut-être », 1 « ne vient pas ») dont un qui a BLOQUÉ
-- l'organisatrice et un compte en suppression : au-delà des 60 du plafond.
do $epreuve$
declare
  sfx   constant text := left(md5(clock_timestamp()::text || random()::text), 8);
  a     constant text := '00000000-0000-4000-8000-0000000d0a01';   -- organise
  x     constant text := '00000000-0000-4000-8000-0000000d0a02';   -- étrangère
  bloq  constant text := '00000000-0000-4000-8000-0000000d0a03';   -- inscrite, a bloqué l'organisatrice
  part  constant text := '00000000-0000-4000-8000-0000000d0a04';   -- inscrite, compte en suppression
  evt   constant text := 'zz_pi_evt_' || sfx;
  evs   constant text := 'zz_pi_sup_' || sfx;
  evo   constant text := 'zz_pi_old_' || sfx;
  mes   jsonb := '{}'::jsonb;
  i     integer;
  u     text;
  etat  text;
  cle1  constant text := 'zzcle1' || sfx;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private) values
      (a, 'zz Lé&a ' || sfx, false), (x, 'zz Xavier ' || sfx, false), (bloq, 'zz Bloque ' || sfx, false), (part, 'zz Part ' || sfx, false);
    insert into public.events (id, organizer_id, author_id, title, status, date_at) values
      (evt, a, a, 'Rando ' || sfx, 'active', now() + interval '2 days'),
      (evs, a, a, 'Pique nique', 'active', now() + interval '3 days'),
      (evo, a, a, 'Vieille sortie', 'active', now() - interval '5 days');
    insert into public.event_attendees (event_id, user_id, rsvp) values (evt, a, 'going'), (evs, a, 'going'), (evo, a, 'going');
    for i in 1..69 loop
      u := '00000000-0000-4000-8000-0000000d' || lpad(to_hex(4096 + i), 4, '0');
      insert into public.profiles (id, username, is_private) values (u, 'zz p' || i || ' ' || sfx, false);
      insert into public.event_attendees (event_id, user_id, rsvp) values
        (evt, u, case when i <= 19 then 'going' when i <= 64 then 'waitlist' when i <= 68 then 'maybe' else 'declined' end),
        (evs, u, 'going');
    end loop;
    insert into public.event_attendees (event_id, user_id, rsvp) values (evt, bloq, 'going'), (evt, part, 'going'), (evo, part, 'going');
    insert into public.blocks (blocker_id, blocked_id) values (bloq, a);
    insert into public.comptes_en_suppression (user_id, statut) values (part, 'en_cours');

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', a, true);
    -- Pas encore annulée : refus.
    mes := mes || jsonb_build_object('pas_annulee', public.prevenir_inscrits_activite(evt, 'event_cancelled', cle1));
    -- Sans admission : pas de mise à jour.
    mes := mes || jsonb_build_object('sans_admission', public.prevenir_inscrits_activite(evt, 'event_update', 'zzcle0' || sfx));
    execute 'reset role';
    update public.events set status = 'cancelled' where id = evt;
    insert into public.user_safety (user_id, majority_at) values (a, date '2000-01-01')
      on conflict (user_id) do update set majority_at = excluded.majority_at;
    execute 'set local role authenticated';
    -- Un réglage posé AVANT l'appel lui survit (rendu, jamais vidé).
    perform set_config('passio.notification_serveur', 'temoin', true);
    -- L'annulation : 69 personnes (71 − « ne vient pas » − la personne qui a bloqué), dont 68 lignes
    -- (le compte en suppression est compté, sans ligne).
    mes := mes || jsonb_build_object('annule', public.prevenir_inscrits_activite(evt, 'event_cancelled', cle1));
    mes := mes || jsonb_build_object('reglage_rendu', current_setting('passio.notification_serveur', true));
    perform set_config('passio.notification_serveur', '', true);
    -- Une NOUVELLE annulation, clé neuve : aucune ligne de plus (une par personne et par activité).
    mes := mes || jsonb_build_object('reannule', public.prevenir_inscrits_activite(evt, 'event_cancelled', 'zzcle9' || sfx));
    -- Une 4ᵉ annulation dans l'heure : refusée (3 par heure et par activité).
    mes := mes || jsonb_build_object('annule_4', (select public.prevenir_inscrits_activite(evt, 'event_cancelled', 'zzcleA' || sfx)
                                                    from (select public.prevenir_inscrits_activite(evt, 'event_cancelled', 'zzcleB' || sfx)) z));
    -- Le message de l'organisation, échappé.
    mes := mes || jsonb_build_object('message', public.prevenir_inscrits_activite(evt, 'event_update', 'zzcle2' || sfx, '  <b>RDV</b> à l''entrée nord  '));
    -- 200 guillemets : 1 200 caractères une fois échappés — refusé AVANT toute écriture.
    mes := mes || jsonb_build_object('trop_long', public.prevenir_inscrits_activite(evt, 'event_update', 'zzcle3' || sfx, repeat('"', 200)));
    -- Une activité terminée depuis 5 jours n'est plus une liste de diffusion.
    mes := mes || jsonb_build_object('terminee', public.prevenir_inscrits_activite(evo, 'event_update', 'zzcle4' || sfx));
    -- Une notification ORDINAIRE de l'organisatrice passe encore : la diffusion n'a pas mangé son plafond.
    begin
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
        values ('zz_pi_client_' || sfx, '00000000-0000-4000-8000-0000000d1001', 'event_update', a, evt, 'x a modifié un événement auquel tu participes', false);
      etat := 'ok';
    exception when others then etat := sqlstate;
    end;
    mes := mes || jsonb_build_object('client_apres', etat);
    -- Un client ne peut pas occuper un identifiant `n_sup_` ni `n_pi_` (réservés).
    begin
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
        values ('n_sup_' || left(md5(evs || '00000000-0000-4000-8000-0000000d1002'), 20), '00000000-0000-4000-8000-0000000d1002',
                'event_update', a, evs, 'x a modifié un événement auquel tu participes', false);
      etat := 'ok';
    exception when others then etat := sqlstate;
    end;
    mes := mes || jsonb_build_object('squat_sup', etat);
    -- Une étrangère ne prévient personne.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', x, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', x, true);
    mes := mes || jsonb_build_object('etrangere', public.prevenir_inscrits_activite(evt, 'event_update', 'zzcle5' || sfx));
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);

    mes := mes || jsonb_build_object(
      'lignes_annule', (select count(*) from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled'),
      'personnes_annule', (select count(distinct n.user_id) from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled'),
      'origine_annule', (select string_agg(distinct n.origine, ',') from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled'),
      'exclus_prevenus', (select count(*) from public.notifications n where n.ref_id = evt and n.user_id in (a, bloq, part) and n.id like 'n\_pi\_%'),
      'texte_annule', (select n.content from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled' limit 1),
      'texte_message', (select n.content from public.notifications n where n.ref_id = evt and n.kind = 'event_update' and n.id like 'n\_pi\_%' limit 1));

    -- La suppression d'une activité de 70 inscrits les prévient TOUS (69 + l'organisatrice exclue).
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

-- ── ⑥ VERDICT ────────────────────────────────────────────────────────────────────────────────────
create temp table passio_pi_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
with v as (select current_setting('passio.verdict_pi', true)::jsonb j)
insert into pg_temp.passio_pi_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout', case when j ? 'erreur' then 'ECHEC — ' || (j ->> 'erreur') else 'OK' end from v
union all select 2, true, 'une activité NON annulée ne s''annonce pas annulée ; sans admission, pas de mise à jour',
  case when j #>> '{pas_annulee,motif}' = 'pas_annulee' and j #>> '{sans_admission,motif}' = 'admission_requise' then 'OK'
       else 'ECHEC — ' || coalesce((j -> 'pas_annulee')::text, '-') || ' / ' || coalesce((j -> 'sans_admission')::text, '-') end from v
union all select 3, true, 'l''annulation : 69 sur 69 (au-delà des 60 du plafond), le compte en suppression compté sans ligne',
  case when (j #>> '{annule,destinataires}') = '69' and (j #>> '{annule,prevenues}') = '69' then 'OK' else 'ECHEC — ' || coalesce((j -> 'annule')::text, '-') end from v
union all select 4, true, 'une ligne par personne, d''origine serveur, jamais l''organisatrice, qui l''a bloquée, ni le compte en suppression',
  case when (j ->> 'lignes_annule') = '68' and (j ->> 'personnes_annule') = '68' and (j ->> 'origine_annule') = 'serveur'
        and (j ->> 'exclus_prevenus') = '0'
       then 'OK' else 'ECHEC — lignes ' || coalesce(j ->> 'lignes_annule', '-') || ', personnes ' || coalesce(j ->> 'personnes_annule', '-')
                       || ', origine ' || coalesce(j ->> 'origine_annule', '-') || ', exclus ' || coalesce(j ->> 'exclus_prevenus', '-') end from v
union all select 5, true, 'une nouvelle annulation (clé neuve) n''ajoute aucune ligne ; la 4ᵉ de l''heure est refusée',
  case when (j #>> '{reannule,prevenues}') = '69' and (j ->> 'lignes_annule') = '68' and j #>> '{annule_4,motif}' = 'debit_activite'
       then 'OK' else 'ECHEC — ' || coalesce((j -> 'reannule')::text, '-') || ' / ' || coalesce((j -> 'annule_4')::text, '-') end from v
union all select 6, true, 'un réglage posé avant l''appel lui survit (rendu, jamais vidé)',
  case when j ->> 'reglage_rendu' = 'temoin' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'reglage_rendu', '-') end from v
union all select 7, true, 'le texte est dérivé : le nom ÉCHAPPÉ du profil, la phrase fixe',
  case when j ->> 'texte_annule' = 'zz Lé&amp;a ' || (j ->> 'sfx') || ' a annulé un événement auquel tu participais' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'texte_annule', '-') end from v
union all select 8, true, 'le message de l''organisation est échappé ; trop long une fois échappé, il est refusé avant écriture',
  case when (j #>> '{message,prevenues}') = '69'
        and j ->> 'texte_message' = 'zz Lé&amp;a ' || (j ->> 'sfx') || ' &lt;b&gt;RDV&lt;/b&gt; à l&#39;entrée nord'
        and j #>> '{trop_long,motif}' = 'message_trop_long'
       then 'OK' else 'ECHEC — ' || coalesce(j ->> 'texte_message', (j -> 'message')::text, '-') || ' / ' || coalesce((j -> 'trop_long')::text, '-') end from v
union all select 9, true, 'une activité terminée depuis plus de 2 jours n''est plus une liste de diffusion',
  case when j #>> '{terminee,motif}' = 'activite_terminee' then 'OK' else 'ECHEC — ' || coalesce((j -> 'terminee')::text, '-') end from v
union all select 10, true, 'après les diffusions, une notification ordinaire de l''organisatrice passe encore',
  case when j ->> 'client_apres' = 'ok' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'client_apres', '-') end from v
union all select 11, true, 'un client ne peut pas occuper un identifiant n_sup_ (42501)',
  case when j ->> 'squat_sup' = '42501' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'squat_sup', '-') end from v
union all select 12, true, 'une personne étrangère à l''organisation ne prévient personne',
  case when j #>> '{etrangere,motif}' = 'non_autorise' then 'OK' else 'ECHEC — ' || coalesce((j -> 'etrangere')::text, '-') end from v
union all select 13, true, 'la suppression d''une activité de 70 inscrits prévient les 69 autres',
  case when j ->> 'suppression' = '69' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'suppression', '-') end from v
union all select 14, true, 'aucune ligne d''essai ne reste',
  (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.notifications
    where id like 'zz\_pi\_%' or ref_id like 'zz\_pi\_%')
union all select 15, true, 'la fonction : SECURITY DEFINER, search_path vide, exécutable par authenticated seulement',
  (select case when p.prosecdef and p.proconfig @> array['search_path=""']
                and has_function_privilege('authenticated', p.oid, 'execute')
                and not has_function_privilege('anon', p.oid, 'execute')
               then 'OK' else 'ECHEC' end
     from pg_proc p where p.oid = 'public.prevenir_inscrits_activite(text, text, text, text)'::regprocedure)
union all select 16, true, 'trg_rate_limit de notifications passe par notifications_limiter_debit, après l''origine',
  (select case when count(*) = 1 and min(p.proname) = 'notifications_limiter_debit'
                and not has_function_privilege('authenticated', min(p.oid), 'execute')
               then 'OK' else 'ECHEC' end
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'trg_rate_limit' and not t.tgisinternal)
union all select 17, true, 'les réglages ne sont posés que LOCAUX (set_config(…, true)), jamais pour la session',
  (select case when count(*) = 2 and bool_and(p.prosrc like '%set_config(''passio.diffusion_inscrits'', ''1'', true)%')
                and not bool_or(p.prosrc ~ 'set_config\([^)]*,[[:space:]]*false[[:space:]]*\)')
                and not bool_or(p.prosrc ~ 'set_config\([^)]*,[[:space:]]*''''[[:space:]]*,')
               then 'OK' else 'ECHEC' end
     from pg_proc p where p.oid in ('public.prevenir_inscrits_activite(text, text, text, text)'::regprocedure,
                                    'public.events_prevenir_suppression()'::regprocedure))
union all select 18, true, 'n_pi_ et n_sup_ sont réservés au serveur',
  case when public.identifiant_reserve_au_serveur('n_pi_x') and public.identifiant_reserve_au_serveur('n_sup_x')
        and public.identifiant_reserve_au_serveur('n_m_x') and not public.identifiant_reserve_au_serveur('n_x')
       then 'OK' else 'ECHEC' end;

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
