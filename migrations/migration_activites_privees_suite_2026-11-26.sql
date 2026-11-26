-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS PRIVÉES — SUITE : RETIRER UN INVITÉ, LIEN D'INVITATION, NOTES
-- (2026-11-26, après `migration_activites_privees_2026-11-26.sql`, appliquée
-- en staging et en production le même jour)
--
-- `npm run migration:appliquer -- migrations/migration_activites_privees_suite_2026-11-26.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict LÈVE si une
-- seule ligne est en ECHEC. AUCUN PRÉREQUIS CLIENT (fonctions nouvelles, que
-- seul le client neuf appelle ; `notes_evenement` garde sa signature).
-- PRÉREQUIS SERVEUR : la première migration (garde ci-dessous).
--
-- ① RETIRER UN INVITÉ — `retirer_invite_activite(event, user)`. Supprimer la
--    seule ligne `event_invites` ne suffisait pas : une inscription déjà faite
--    gardait la lecture (`activite_privee_fermee_pour_moi` admet l'inscrit),
--    et la discussion de l'activité (`evgrp_<id>`) restait ouverte. La
--    fonction, réservée à l'ORGANISATION d'une activité PRIVÉE, retire les
--    trois d'un geste. On ne retire jamais un membre de l'organisation.
--
-- ② LIEN D'INVITATION — un code secret par activité privée
--    (`event_codes_invitation`, aucune lecture client : la table n'est
--    accessible que par les deux fonctions). `code_invitation_activite` le
--    rend (et le crée, ou le renouvelle) pour l'ORGANISATION seule ;
--    `rejoindre_par_code` inscrit l'appelant comme invité si le code est le
--    bon. 128 bits aléatoires (deux `gen_random_uuid`) : ni devinable, ni
--    énumérable. Tout refus rend `false`, sans motif : la réponse ne dit pas
--    si l'identifiant désigne une activité privée. Renouveler le code rend
--    l'ancien lien inopérant (les invités déjà entrés le restent).
--
-- ③ NOTES — `notes_evenement` rendait la moyenne d'une activité privée à
--    qui connaissait son identifiant (reste déclaré du premier lot) : `null`
--    pour un non-admis.
--
-- VERROUS : `lock_timeout` 3 s, `statement_timeout` 30 s.
-- RETOUR ARRIÈRE : `drop function` des trois fonctions nouvelles, `drop table
-- public.event_codes_invitation`, et `notes_evenement` à sa définition d'avant
-- (citée ci-dessous sans la ligne « privée fermée »).
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $garde$
begin
  if to_regprocedure('public.activite_privee_fermee_pour_moi(text)') is null
     or to_regclass('public.event_invites') is null
     or to_regprocedure('public.notes_evenement(text)') is null then
    raise exception 'activites_privees_suite : la première migration (migration_activites_privees_2026-11-26.sql) n''est pas appliquée';
  end if;
end
$garde$;

-- ── ① RETIRER UN INVITÉ ─────────────────────────────────────────────────────
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
  return true;
end
$$;
revoke all on function public.retirer_invite_activite(text, text) from public, anon;
grant execute on function public.retirer_invite_activite(text, text) to authenticated, service_role;

-- ── ② LIEN D'INVITATION ─────────────────────────────────────────────────────
create table if not exists public.event_codes_invitation (
  event_id text primary key references public.events(id) on delete cascade,
  code     text not null check (code ~ '^[0-9a-f]{64}$'),
  cree_le  timestamptz not null default now()
);
alter table public.event_codes_invitation enable row level security;
revoke all on public.event_codes_invitation from public, anon, authenticated;
grant all on public.event_codes_invitation to service_role;

create or replace function public.code_invitation_activite(p_event_id text, p_renouveler boolean default false)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c text;
begin
  if auth.uid() is null or p_event_id is null or not public.organise_activite(p_event_id)
     or not exists (select 1 from public.events where id = p_event_id and visibilite = 'privee' and status = 'active') then
    return null;
  end if;
  if not coalesce(p_renouveler, false) then
    select code into c from public.event_codes_invitation where event_id = p_event_id;
    if c is not null then return c; end if;
  end if;
  c := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.event_codes_invitation (event_id, code) values (p_event_id, c)
    on conflict (event_id) do update set code = excluded.code, cree_le = now();
  return c;
end
$$;
revoke all on function public.code_invitation_activite(text, boolean) from public, anon;
grant execute on function public.code_invitation_activite(text, boolean) to authenticated, service_role;

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
  if not exists (select 1 from public.profiles where id = moi) then return false; end if;
  insert into public.event_invites (event_id, user_id, invited_by)
    values (p_event_id, moi, e.author_id)
    on conflict (event_id, user_id) do nothing;
  return true;
end
$$;
revoke all on function public.rejoindre_par_code(text, text) from public, anon;
grant execute on function public.rejoindre_par_code(text, text) to authenticated, service_role;

-- ── ③ NOTES ─────────────────────────────────────────────────────────────────
-- Définition de production du 2026-11-26 + la ligne « privée fermée ».
create or replace function public.notes_evenement(p_event_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is null or public.activite_privee_fermee_pour_moi(p_event_id) then null
    else (
      select jsonb_build_object(
        'avg', case when n.nb >= 3 or public.organise_activite(p_event_id) then n.moyenne end,
        'count', n.nb)
      from (
        select count(*)::integer as nb, avg(a.rating)::numeric(4,2) as moyenne
        from public.event_attendees a
        where a.event_id = p_event_id
          and a.rating is not null
          and a.rsvp = 'going'
      ) n)
  end;
$$;

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_activites_privees_suite on commit drop as
select * from (values
  (1, 'retirer_invite_activite : SECURITY DEFINER, search_path figé, pas pour anon',
     exists (select 1 from pg_proc where oid = 'public.retirer_invite_activite(text,text)'::regprocedure
              and prosecdef and proconfig @> array['search_path=""'])
     and not has_function_privilege('anon', 'public.retirer_invite_activite(text,text)', 'execute')),
  (2, 'retirer_invite_activite : réservée à l''organisation, jamais un organisateur',
     pg_get_functiondef('public.retirer_invite_activite(text,text)'::regprocedure) like '%organise_activite(p_event_id)%'
     and pg_get_functiondef('public.retirer_invite_activite(text,text)'::regprocedure) like '%co_organizers ? p_user_id%'),
  (3, 'event_codes_invitation : RLS active, aucun droit client',
     (select relrowsecurity from pg_class where oid = 'public.event_codes_invitation'::regclass)
     and not has_table_privilege('anon', 'public.event_codes_invitation', 'select')
     and not has_table_privilege('authenticated', 'public.event_codes_invitation', 'select')
     and not has_table_privilege('authenticated', 'public.event_codes_invitation', 'insert')),
  (4, 'code_invitation_activite / rejoindre_par_code : SECURITY DEFINER, search_path figé, pas pour anon',
     (select count(*) from pg_proc where oid in ('public.code_invitation_activite(text,boolean)'::regprocedure,
                                                  'public.rejoindre_par_code(text,text)'::regprocedure)
       and prosecdef and proconfig @> array['search_path=""']) = 2
     and not has_function_privilege('anon', 'public.code_invitation_activite(text,boolean)', 'execute')
     and not has_function_privilege('anon', 'public.rejoindre_par_code(text,text)', 'execute')),
  (5, 'code_invitation_activite : réservée à l''organisation d''une activité privée',
     pg_get_functiondef('public.code_invitation_activite(text,boolean)'::regprocedure) like '%organise_activite(p_event_id)%'
     and pg_get_functiondef('public.code_invitation_activite(text,boolean)'::regprocedure) like '%visibilite = ''privee''%'),
  (6, 'notes_evenement lit la privée fermée',
     pg_get_functiondef('public.notes_evenement(text)'::regprocedure) like '%activite_privee_fermee_pour_moi%'),
  (7, 'event_codes_invitation n''est pas publiée en temps réel',
     not exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'event_codes_invitation'))
) as v(n, controle, ok_bool);

alter table _verdict_activites_privees_suite add column verdict text;
update _verdict_activites_privees_suite set verdict = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, verdict from _verdict_activites_privees_suite order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_activites_privees_suite where verdict <> 'OK') then
    raise exception 'activites_privees_suite : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_activites_privees_suite where verdict <> 'OK');
  end if;
end
$verdict$;

commit;
