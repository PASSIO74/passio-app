-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS PRIVÉES — UN INVITÉ RETIRÉ NE REVIENT PAS PAR LE LIEN
-- (2026-11-26, après `migration_activites_privees_suite_2026-11-26.sql`,
-- appliquée en staging et en production le même jour)
--
-- `npm run migration:appliquer -- migrations/migration_activites_privees_retraits_2026-11-26.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict LÈVE si une
-- seule ligne est en ECHEC. AUCUN PRÉREQUIS CLIENT.
--
-- LE DÉFAUT (revue de sécurité automatique du même jour) : `retirer_invite_activite`
-- supprimait l'invitation, l'inscription et la place dans la discussion — mais
-- le CODE du lien restait valable. La personne retirée, qui a reçu le lien,
-- rappelait `rejoindre_par_code` et redevenait invitée, sans que
-- l'organisation le sache.
--
-- LE REMÈDE : `event_invites_retires (event_id, user_id)`, tenue par
-- `retirer_invite_activite` (aucun droit client, clés étrangères en cascade
-- vers l'activité et le profil). `rejoindre_par_code` refuse un compte retiré.
-- Seule l'ORGANISATION peut le faire revenir, en l'invitant explicitement
-- (`event_invites`, policy inchangée) : cette invitation efface la marque
-- (`trg_event_invites_retour`), pour qu'un retrait suivant reparte de zéro.
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $garde$
begin
  if to_regprocedure('public.retirer_invite_activite(text,text)') is null
     or to_regprocedure('public.rejoindre_par_code(text,text)') is null then
    raise exception 'activites_privees_retraits : la migration de suite (migration_activites_privees_suite_2026-11-26.sql) n''est pas appliquée';
  end if;
end
$garde$;

create table if not exists public.event_invites_retires (
  event_id  text not null references public.events(id) on delete cascade,
  user_id   text not null references public.profiles(id) on delete cascade,
  retire_le timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_invites_retires enable row level security;
revoke all on public.event_invites_retires from public, anon, authenticated;
grant all on public.event_invites_retires to service_role;

-- Définition de la suite + la marque de retrait.
create or replace function public.retirer_invite_activite(p_event_id text, p_user_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  e record;
begin
  if auth.uid() is null or p_event_id is null or p_user_id is null
     or not public.organise_activite(p_event_id) then
    return false;
  end if;
  select author_id, organizer_id, co_organizers, visibilite into e from public.events where id = p_event_id;
  if not found or e.visibilite is distinct from 'privee' then return false; end if;
  -- Jamais un membre de l'organisation (ni soi-même).
  if p_user_id = e.author_id or p_user_id = e.organizer_id
     or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array' and e.co_organizers ? p_user_id) then
    return false;
  end if;
  delete from public.event_invites where event_id = p_event_id and user_id = p_user_id;
  delete from public.event_attendees where event_id = p_event_id and user_id = p_user_id;
  delete from public.conv_members where conv_id = 'evgrp_' || p_event_id and user_id = p_user_id;
  -- Le lien d'invitation ne le fera pas revenir (profil requis par la clé étrangère).
  if exists (select 1 from public.profiles where id = p_user_id) then
    insert into public.event_invites_retires (event_id, user_id) values (p_event_id, p_user_id)
      on conflict (event_id, user_id) do update set retire_le = now();
  end if;
  return true;
end
$$;

-- Définition de la suite + le refus d'un compte retiré.
create or replace function public.rejoindre_par_code(p_event_id text, p_code text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  moi text := (auth.uid())::text;
  e record;
begin
  if moi is null or p_event_id is null or p_code is null or p_code !~ '^[0-9a-f]{64}$'
     or public.suppression_de_mon_compte() then
    return false;
  end if;
  select ev.author_id, ev.organizer_id into e
    from public.events ev
    join public.event_codes_invitation k on k.event_id = ev.id
   where ev.id = p_event_id and ev.visibilite = 'privee' and ev.status = 'active' and k.code = p_code;
  if not found then return false; end if;
  -- Un compte en blocage avec l'organisation n'entre pas par un lien.
  if public.is_blocked_with(e.author_id)
     or (e.organizer_id is not null and e.organizer_id is distinct from e.author_id and public.is_blocked_with(e.organizer_id)) then
    return false;
  end if;
  if moi = e.author_id or moi = e.organizer_id then return true; end if;
  -- Retiré par l'organisation : seule une invitation explicite le fait revenir.
  if exists (select 1 from public.event_invites_retires r where r.event_id = p_event_id and r.user_id = moi) then
    return false;
  end if;
  if not exists (select 1 from public.profiles where id = moi) then return false; end if;
  insert into public.event_invites (event_id, user_id, invited_by)
    values (p_event_id, moi, e.author_id)
    on conflict (event_id, user_id) do nothing;
  return true;
end
$$;

-- Une invitation EXPLICITE par l'organisation efface la marque de retrait.
-- `rejoindre_par_code` n'insère jamais pour un compte marqué : seule la policy
-- `event_invites_ecriture` (organisation) peut arriver ici avec une marque.
create or replace function public.event_invites_retour()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.event_invites_retires where event_id = new.event_id and user_id = new.user_id;
  return new;
end
$$;
revoke all on function public.event_invites_retour() from public, anon, authenticated;
drop trigger if exists trg_event_invites_retour on public.event_invites;
create trigger trg_event_invites_retour
  after insert on public.event_invites
  for each row execute function public.event_invites_retour();

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_activites_privees_retraits on commit drop as
select * from (values
  (1, 'event_invites_retires : RLS active, aucun droit client',
     (select relrowsecurity from pg_class where oid = 'public.event_invites_retires'::regclass)
     and not has_table_privilege('anon', 'public.event_invites_retires', 'select')
     and not has_table_privilege('authenticated', 'public.event_invites_retires', 'select')
     and not has_table_privilege('authenticated', 'public.event_invites_retires', 'insert')
     and not has_table_privilege('authenticated', 'public.event_invites_retires', 'delete')),
  (2, 'event_invites_retires : deux clés étrangères en cascade',
     (select count(*) from pg_constraint where conrelid = 'public.event_invites_retires'::regclass
       and contype = 'f' and confdeltype = 'c') = 2),
  (3, 'retirer_invite_activite marque le retrait',
     pg_get_functiondef('public.retirer_invite_activite(text,text)'::regprocedure) like '%event_invites_retires%'),
  (4, 'rejoindre_par_code refuse un compte retiré',
     pg_get_functiondef('public.rejoindre_par_code(text,text)'::regprocedure) like '%event_invites_retires r%'),
  (5, 'une invitation explicite efface la marque (déclencheur posé)',
     exists (select 1 from pg_trigger where tgname = 'trg_event_invites_retour'
              and tgrelid = 'public.event_invites'::regclass and not tgisinternal and tgenabled <> 'D')),
  (6, 'les deux fonctions restent SECURITY DEFINER, search_path figé, sans anon',
     (select count(*) from pg_proc where oid in ('public.retirer_invite_activite(text,text)'::regprocedure,
                                                  'public.rejoindre_par_code(text,text)'::regprocedure)
       and prosecdef and proconfig @> array['search_path=""']) = 2
     and not has_function_privilege('anon', 'public.retirer_invite_activite(text,text)', 'execute')
     and not has_function_privilege('anon', 'public.rejoindre_par_code(text,text)', 'execute'))
) as v(n, controle, ok_bool);

alter table _verdict_activites_privees_retraits add column verdict text;
update _verdict_activites_privees_retraits set verdict = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, verdict from _verdict_activites_privees_retraits order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_activites_privees_retraits where verdict <> 'OK') then
    raise exception 'activites_privees_retraits : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_activites_privees_retraits where verdict <> 'OK');
  end if;
end
$verdict$;

commit;
