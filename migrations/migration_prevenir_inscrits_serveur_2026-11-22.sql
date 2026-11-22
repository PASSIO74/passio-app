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
--     `event_update` exige l'admission (`adult_access_allowed`, comme la modification d'une activité),
--     une date, une fin passée de moins de 2 jours ET une création de moins de 18 mois (`created_at`,
--     posé par le serveur et figé : la date de l'activité, elle, se réécrit — red team, D). Dix-huit
--     mois, pas un an : une série mensuelle de 12 dates commencée deux mois après sa création, ou un
--     festival annoncé 14 mois à l'avance, se modifient encore à leur dernière date (relecture v3, P2-b).
--     IDENTIFIANTS `n_pi_` (réservés au serveur, ⑤) : une annulation = md5(activité|genre|destinataire),
--     UNE par personne et par activité : une nouvelle annulation ne remet la ligne en « non lue » (au
--     nom de qui annule, co-organisation comprise — red team, C) QUE si l'activité a été RÉACTIVÉE
--     depuis, d'après une date tenue par le serveur (⑦, red team B) ; sinon rien ne bouge. Une mise
--     à jour = md5(activité|genre|clé|destinataire), la clé étant tirée par le client une fois par
--     geste et réutilisée à son réessai — un rejeu ne double ni ne réécrit rien. Une ligne d'une
--     autre personne, d'un autre genre ou d'origine client n'est JAMAIS reprise (garde ON CONFLICT,
--     éprouvée par le verdict 19 et une mutation du banc — red team, E).
--     BORNES (relecture red team du 22/11, P1 : « le débit comptait les APPELS, pas les lignes ») :
--       · 3 diffusions par heure, par ACTIVITÉ et par genre (`debit_ecritures`, fenêtre glissante),
--         lues et débitées SOUS VERROU consultatif (sinon N appels parallèles passaient — red team, A) ;
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
--     ont décliné et les blocages (lus par rapport à l'ORGANISATION, pas à qui supprime) : une
--     activité de 99 inscrits supprimée prévient les 99.
--   ⑤ `identifiant_reserve_au_serveur` réserve aussi `n_pi_` et `n_sup_` : un inscrit pouvait
--     pré-occuper `n_sup_<md5(activité||destinataire)>` (calculable par tous) et faire sauter l'avis
--     de suppression d'un autre (défaut du 12/11, relevé par la relecture red team).
--   ⑦ `events.reactivee_le` : posée par un déclencheur quand une activité annulée est réactivée,
--     réécrite à chaque INSERT/UPDATE (un client ne la pose jamais), illisible par les clients.
--   ⑧ Les lignes d'origine CLIENT déjà posées sous un identifiant `n_pi_` ou `n_sup_` sont EFFACÉES
--     (relecture v3, P2-a) : jusqu'ici réservés à personne, ces identifiants sont calculables ; une
--     ligne posée d'avance (vers un second compte de l'attaquant) aurait fait perdre l'avis de
--     l'inscrit visé, la garde ON CONFLICT ne reprenant jamais la ligne d'autrui. Mesuré le 22/11 :
--     0 en production comme au staging. Sous verrou, juste avant le verdict : aucune écriture ne
--     se glisse entre l'effacement et le COMMIT, qui rend la réserve ⑤ effective. Le verdict 22
--     exige 0 après coup. (Ces lignes ne reviennent pas au retour arrière : elles n'avaient pas
--     d'auteur légitime — aucun client n'écrit `n_pi_` ni `n_sup_`.)
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
--| drop trigger if exists trg_events_reactivee_le on public.events;
--| drop function if exists public.events_reactivee_le();
--| alter table public.events drop column if exists reactivee_le;
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
  marque constant text := 'PASSIO prevenir-inscrits v4';
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
  -- Corps remplacés : production relue le 22/11, ou v1 de cette migration (staging), ou un corps
  -- portant la marque de CETTE version (rejeu). Une v2 ou une v3 n'a été appliquée nulle part.
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
-- PASSIO prevenir-inscrits v4
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

-- ── ⑦ LA DATE DE RÉACTIVATION EST TENUE PAR LE SERVEUR ───────────────────────────────────────────
-- Une NOUVELLE annulation ne remet les avis en « non lu » que si l'activité a été réactivée depuis
-- (relecture red team du 22/11, B). La colonne n'est lisible par aucun client (droits de colonne de
-- `events`) ; elle est réécrite à chaque INSERT et UPDATE : un client ne la pose jamais.
alter table public.events add column if not exists reactivee_le timestamptz;

create or replace function public.events_reactivee_le()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
-- PASSIO prevenir-inscrits v4
begin
  if tg_op = 'INSERT' then
    new.reactivee_le := null;
  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    new.reactivee_le := pg_catalog.clock_timestamp();
  else
    new.reactivee_le := old.reactivee_le;
  end if;
  return new;
end
$fn$;

revoke all on function public.events_reactivee_le() from public, anon, authenticated;

drop trigger if exists trg_events_reactivee_le on public.events;
create trigger trg_events_reactivee_le before insert or update on public.events
  for each row execute function public.events_reactivee_le();

-- ── ⑤ `n_pi_` ET `n_sup_` SONT RÉSERVÉS AU SERVEUR ────────────────────────────────────────────────
-- Lue par la policy d'INSERT client `notifications_insert_own_author`.
create or replace function public.identifiant_reserve_au_serveur(p_id text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  -- PASSIO prevenir-inscrits v4
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
-- PASSIO prevenir-inscrits v4
declare
  moi       text := (auth.uid())::text;
  ev        record;
  nom       text;
  texte     text;
  msg       text := nullif(btrim(coalesce(p_message, '')), '');
  ids       text[];
  idents    text[];
  partis    integer := 0;
  couverts  integer := 0;
  heure     integer := 0;
  reactivee timestamptz;
  prec_srv  text := pg_catalog.current_setting('passio.notification_serveur', true);
  prec_dif  text := pg_catalog.current_setting('passio.diffusion_inscrits', true);
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
  select e.id, e.status, e.date_at, e.end_at, e.created_at, e.reactivee_le into ev from public.events e where e.id = p_event_id;
  if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
  reactivee := ev.reactivee_le;
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
    -- Les inscrits d'une activité ne deviennent pas une liste de diffusion permanente (red team, D) :
    -- une date est exigée ; la fin (date que l'organisation réécrit) ne doit pas dater de plus de
    -- 2 jours ; et la CRÉATION (posée par le serveur, figée ensuite) de plus de 18 mois — une série
    -- mensuelle de 12 dates ou un festival annoncé longtemps à l'avance se modifient encore.
    if ev.date_at is null then return jsonb_build_object('ok', false, 'motif', 'activite_sans_date'); end if;
    if coalesce(ev.end_at, ev.date_at + interval '3 hours') < pg_catalog.now() - interval '2 days' then
      return jsonb_build_object('ok', false, 'motif', 'activite_terminee');
    end if;
    if ev.created_at is null or ev.created_at < pg_catalog.now() - interval '18 months' then
      return jsonb_build_object('ok', false, 'motif', 'activite_trop_ancienne');
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

  -- 3 diffusions par heure, par activité et par genre (fenêtre glissante de 60 minutes). La lecture
  -- et le débit se font SOUS VERROU (red team, A) : sans lui, N appels parallèles lisaient tous
  -- « 2 » et passaient tous. Le verrou tient jusqu'à la fin de la transaction de l'appel.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('prevenir|' || p_event_id || '|' || p_genre));
  select coalesce(sum(d.n), 0) into heure from public.debit_ecritures d
   where d.table_nom = 'prevenir_activite' and d.source = p_event_id || '|' || p_genre
     and d.minute > pg_catalog.date_trunc('minute', pg_catalog.now()) - interval '60 minutes';
  if heure >= 3 then return jsonb_build_object('ok', false, 'motif', 'debit_activite'); end if;

  -- Destinataires : venants, « peut-être », liste d'attente ; jamais l'appelant ni un blocage.
  -- Un compte en suppression est compté à part (aucune ligne : il n'a plus de cloche).
  select coalesce(array_agg(a.user_id order by a.user_id) filter (where c.user_id is null), '{}'),
         count(*) filter (where c.user_id is not null)
    into ids, partis
    from public.event_attendees a
    left join public.comptes_en_suppression c on c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee')
   where a.event_id = p_event_id and a.rsvp in ('going', 'maybe', 'waitlist')
     and a.user_id is distinct from moi and not public.is_blocked_with(a.user_id);
  -- Une annulation : UNE par personne et par activité (sans la clé). Une mise à jour : par geste.
  select coalesce(array_agg('n_pi_' || left(md5(case when p_genre = 'event_cancelled'
                                                     then p_event_id || '|' || p_genre || '|' || t.u
                                                     else p_event_id || '|' || p_genre || '|' || p_cle || '|' || t.u end), 20)
                            order by t.o), '{}')
    into idents from unnest(ids) with ordinality as t(u, o);

  -- Débits : la diffusion compte pour l'activité et pour le compte (par minute, plafond du jour
  -- compris) ; les LIGNES comptent dans un budget du jour, par compte.
  begin
    perform public.debit_compter('prevenir_activite', p_event_id || '|' || p_genre, 1000);
    perform public.debit_compter('prevenir_inscrits', moi, 20);
    if cardinality(ids) > 0 then
      perform public.debit_jour_compter('notifications_diffusion', moi, cardinality(ids)::bigint,
        case when public.compte_recent(moi) then 1500 else 6000 end);
    end if;
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'motif', 'debit');
  end;

  if cardinality(ids) > 0 then
    begin
      perform pg_catalog.set_config('passio.notification_serveur', '1', true);
      perform pg_catalog.set_config('passio.diffusion_inscrits', '1', true);
      insert into public.notifications as n (id, user_id, kind, from_id, ref_id, content, seen)
      select t.i, t.u, p_genre, moi, p_event_id, texte, false from unnest(idents, ids) as t(i, u)
      -- Une ligne déjà là n'est reprise QUE pour une annulation, et seulement si l'activité a été
      -- RÉACTIVÉE depuis (date tenue par le serveur, red team B) : elle redevient non lue, au nom de
      -- qui annule cette fois (co-organisation, red team C). Jamais la ligne d'une autre personne,
      -- d'un autre genre, d'une autre activité, ni une ligne d'origine client.
      on conflict (id) do update set content = excluded.content, from_id = excluded.from_id, seen = false, created_at = pg_catalog.now()
        where n.user_id = excluded.user_id and n.kind = excluded.kind and n.ref_id = excluded.ref_id and n.origine = 'serveur'
          and excluded.kind = 'event_cancelled' and reactivee is not null and reactivee > n.created_at;
      perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
      perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
    exception when others then
      perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
      perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
      raise warning 'prevenir_inscrits_activite : diffusion non écrite (%)', sqlstate;
      return jsonb_build_object('ok', false, 'motif', 'echec_ecriture', 'destinataires', cardinality(ids) + partis);
    end;
    -- Prévenue = une ligne serveur de CE genre, pour CETTE activité, à CETTE personne, sous son
    -- identifiant — écrite maintenant ou déjà là (rejeu, annulation déjà diffusée).
    select count(*) into couverts from unnest(idents, ids) as t(i, u)
      join public.notifications n on n.id = t.i and n.user_id = t.u and n.kind = p_genre
                                  and n.ref_id = p_event_id and n.origine = 'serveur';
  end if;
  -- Un COMPTE, jamais la liste. Un compte en suppression est compté comme prévenu (aucune ligne :
  -- il n'a plus de cloche) — l'écart d'une unité révélerait sa suppression (ASTRA-25).
  return jsonb_build_object('ok', true, 'destinataires', cardinality(ids) + partis, 'prevenues', couverts + partis);
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
-- PASSIO prevenir-inscrits v4
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
       -- Le blocage se lit par rapport à l'ORGANISATION, pas à qui supprime (une purge
       -- d'administration n'a pas d'`auth.uid()`).
       and not exists (select 1 from public.blocks b
                        where (b.blocker_id = orga and b.blocked_id = a.user_id)
                           or (b.blocker_id = a.user_id and b.blocked_id = orga))
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
  evc   constant text := 'zz_pi_cnf_' || sfx;
  evn   constant text := 'zz_pi_nul_' || sfx;
  evq   constant text := 'zz_pi_anc_' || sfx;
  evm   constant text := 'zz_pi_ser_' || sfx;
  q1    constant text := '00000000-0000-4000-8000-0000000d0a05';
  q2    constant text := '00000000-0000-4000-8000-0000000d0a06';
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
    -- evc : deux inscrits dont les identifiants d'annulation sont DÉJÀ occupés — par une ligne
    -- destinée à une autre personne, et par une ligne d'origine client — puis réactivée.
    insert into public.profiles (id, username, is_private) values (q1, 'zz q1 ' || sfx, false), (q2, 'zz q2 ' || sfx, false);
    insert into public.events (id, organizer_id, author_id, title, status, date_at) values
      (evc, a, a, 'Conflits', 'active', now() + interval '2 days'),
      (evn, a, a, 'Sans date', 'active', null),
      (evq, a, a, 'Ancienne', 'active', now() + interval '2 days'),
      (evm, a, a, 'Série mensuelle', 'active', now() + interval '17 days');
    update public.events set created_at = now() - interval '2 years' where id = evq;
    -- La dernière date d'une série mensuelle de 12, créée il y a un peu plus d'un an.
    update public.events set created_at = now() - interval '12 months 5 days' where id = evm;
    insert into public.event_attendees (event_id, user_id, rsvp) values (evc, a, 'going'), (evc, q1, 'going'), (evc, q2, 'going'),
      (evn, q1, 'going'), (evq, q1, 'going'), (evm, q1, 'going');
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen) values
      ('n_pi_' || left(md5(evc || '|event_cancelled|' || q1), 20), q2, 'event_cancelled', x, evc, 'zz intact', true),
      ('n_pi_' || left(md5(evc || '|event_cancelled|' || q2), 20), q2, 'event_cancelled', x, evc, 'zz intact', true);
    update public.events set status = 'cancelled' where id = evc;
    update public.events set status = 'active' where id = evc;
    update public.events set status = 'cancelled' where id = evc;

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
    -- Les 68 avis sont lus.
    execute 'reset role';
    update public.notifications set seen = true where ref_id = evt and kind = 'event_cancelled';
    execute 'set local role authenticated';
    -- Une NOUVELLE annulation SANS réactivation, clé neuve : rien ne bouge (ni ligne, ni « non lu »),
    -- et les 69 restent comptées prévenues.
    mes := mes || jsonb_build_object('reannule', public.prevenir_inscrits_activite(evt, 'event_cancelled', 'zzcle9' || sfx));
    -- (Mesures sous le rôle propriétaire : sous `authenticated`, la RLS ne montre à l'organisatrice que SES notifications.)
    execute 'reset role';
    mes := mes || jsonb_build_object('non_lues_sans_reactivation', (select count(*) from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled' and not n.seen));
    -- Réactivée puis annulée de nouveau : les avis redeviennent non lus, sans ligne de plus.
    update public.events set status = 'active' where id = evt;
    update public.events set status = 'cancelled' where id = evt;
    execute 'set local role authenticated';
    mes := mes || jsonb_build_object('reannule_apres', public.prevenir_inscrits_activite(evt, 'event_cancelled', 'zzcleR' || sfx));
    execute 'reset role';
    mes := mes || jsonb_build_object('non_lues_apres', (select count(*) from public.notifications n where n.ref_id = evt and n.kind = 'event_cancelled' and not n.seen));
    execute 'set local role authenticated';
    -- Une 4ᵉ annulation dans l'heure : refusée (3 par heure et par activité).
    mes := mes || jsonb_build_object('annule_4', public.prevenir_inscrits_activite(evt, 'event_cancelled', 'zzcleA' || sfx));
    -- La garde ON CONFLICT : sur evc (réactivée), une ligne d'une AUTRE personne et une ligne
    -- d'origine CLIENT occupent les identifiants des deux inscrits — aucune n'est reprise.
    mes := mes || jsonb_build_object('etrangeres', public.prevenir_inscrits_activite(evc, 'event_cancelled', 'zzcleC' || sfx));
    execute 'reset role';
    mes := mes || jsonb_build_object('etrangeres_intactes', (select count(*) from public.notifications n
                                       where n.ref_id = evc and n.content = 'zz intact' and n.from_id = x and n.origine = 'client'));
    execute 'set local role authenticated';
    -- Une date absente, une création de plus de 18 mois : pas de mise à jour. Une série créée il y a
    -- un peu plus d'un an, à sa dernière date : la mise à jour part.
    mes := mes || jsonb_build_object('sans_date', public.prevenir_inscrits_activite(evn, 'event_update', 'zzcleN' || sfx));
    mes := mes || jsonb_build_object('ancienne', public.prevenir_inscrits_activite(evq, 'event_update', 'zzcleQ' || sfx));
    mes := mes || jsonb_build_object('serie', public.prevenir_inscrits_activite(evm, 'event_update', 'zzcleM' || sfx));
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

-- ── ⑧ LES IDENTIFIANTS RÉSERVÉS SONT LIBÉRÉS DE CE QUI LES OCCUPAIT D'AVANCE ───────────────────────
-- Jusqu'ici, un client pouvait poser une ligne sous un identifiant `n_pi_`/`n_sup_` (calculable par
-- tous) ; la garde ON CONFLICT ne reprend jamais la ligne d'autrui : l'avis de l'inscrit visé serait
-- perdu (relecture v3, P2-a). Le verrou (pris ICI, pas avant l'épreuve, pour ne pas suspendre les
-- notifications plus que nécessaire) empêche toute écriture entre l'effacement et le COMMIT, qui rend
-- la réserve ⑤ effective. Aucun déclencheur DELETE sur `notifications` (relu le 22/11).
lock table public.notifications in share row exclusive mode;
do $liberer$
declare n integer;
begin
  delete from public.notifications
   where (id like 'n\_pi\_%' or id like 'n\_sup\_%') and origine is distinct from 'serveur';
  get diagnostics n = row_count;
  raise notice 'identifiants réservés libérés : % ligne(s) d''origine client effacée(s)', n;
end $liberer$;

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
union all select 5, true, 'ré-annuler SANS réactivation ne touche rien (69 comptées, 0 non lue) ; APRÈS réactivation, les 68 avis redeviennent non lus, sans ligne de plus ; la 4ᵉ de l''heure est refusée',
  case when (j #>> '{reannule,prevenues}') = '69' and (j ->> 'non_lues_sans_reactivation') = '0'
        and (j #>> '{reannule_apres,prevenues}') = '69' and (j ->> 'non_lues_apres') = '68'
        and (j ->> 'lignes_annule') = '68' and j #>> '{annule_4,motif}' = 'debit_activite'
       then 'OK' else 'ECHEC — ' || coalesce((j -> 'reannule')::text, '-') || ' / non lues ' || coalesce(j ->> 'non_lues_sans_reactivation', '-')
                       || ' / ' || coalesce((j -> 'reannule_apres')::text, '-') || ' / non lues ' || coalesce(j ->> 'non_lues_apres', '-')
                       || ' / ' || coalesce((j -> 'annule_4')::text, '-') end from v
union all select 19, true, 'garde ON CONFLICT : la ligne d''une autre personne et une ligne d''origine client ne sont jamais reprises (0 sur 2 prévenues)',
  case when (j #>> '{etrangeres,destinataires}') = '2' and (j #>> '{etrangeres,prevenues}') = '0' and (j ->> 'etrangeres_intactes') = '2'
       then 'OK' else 'ECHEC — ' || coalesce((j -> 'etrangeres')::text, '-') || ' / intactes ' || coalesce(j ->> 'etrangeres_intactes', '-') end from v
union all select 20, true, 'une activité sans date, ou créée il y a plus de 18 mois, ne reçoit plus de mise à jour ; la dernière date d''une série mensuelle, si',
  case when j #>> '{sans_date,motif}' = 'activite_sans_date' and j #>> '{ancienne,motif}' = 'activite_trop_ancienne'
        and j #>> '{serie,prevenues}' = '1' and j #>> '{serie,destinataires}' = '1'
       then 'OK' else 'ECHEC — ' || coalesce((j -> 'sans_date')::text, '-') || ' / ' || coalesce((j -> 'ancienne')::text, '-')
                       || ' / ' || coalesce((j -> 'serie')::text, '-') end from v
union all select 21, true, 'la date de réactivation est tenue par le serveur (déclencheur en place, illisible par les clients)',
  (select case when exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'trg_events_reactivee_le' and not tgisinternal)
                and not has_column_privilege('anon', 'public.events', 'reactivee_le', 'SELECT')
                and not has_column_privilege('authenticated', 'public.events', 'reactivee_le', 'SELECT')
               then 'OK' else 'ECHEC' end)
union all select 22, true, 'aucune ligne d''origine client n''occupe un identifiant n_pi_ ou n_sup_',
  (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.notifications
    where (id like 'n\_pi\_%' or id like 'n\_sup\_%') and origine is distinct from 'serveur')
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
