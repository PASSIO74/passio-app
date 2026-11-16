-- Rencontres : accès privés validés par l'organisation (2026-11-16).
-- PREREQUIS-CLIENT: rencontres:validation-organisation-v1
-- Une transaction rejouable. Ne pas rejouer les anciennes migrations après celle-ci.
-- Les nouvelles données restent dans un schéma non exposé, FK vers profils/activité.
-- Aucun consentement historique n'est présumé : les co-organisateurs sont suspendus.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create schema if not exists rencontres_prive;
revoke all on schema rencontres_prive from public, anon, authenticated;
create table if not exists rencontres_prive.coorganisations_anterieures (
  event_id text primary key references public.events(id) on delete cascade,
  valeur jsonb not null
);
alter table rencontres_prive.coorganisations_anterieures enable row level security;
create table if not exists rencontres_prive.identifiants_retires (
  event_id text primary key
);
create table if not exists rencontres_prive.accords (
  event_id text not null references public.events(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  primary key(event_id, user_id),
  foreign key(event_id, user_id) references public.event_attendees(event_id, user_id) on delete cascade
);
create table if not exists rencontres_prive.inscriptions (
  id uuid primary key default gen_random_uuid(),
  event_id text references public.events(id) on delete set null,
  user_id text not null references public.profiles(id) on delete cascade,
  rsvp text, created_at timestamptz not null default now()
);
create index if not exists inscriptions_compte_date on rencontres_prive.inscriptions(user_id, created_at);
alter table rencontres_prive.identifiants_retires enable row level security;
alter table rencontres_prive.accords enable row level security;
alter table rencontres_prive.inscriptions enable row level security;
revoke all on all tables in schema rencontres_prive from public, anon, authenticated;

-- Le compte public est identique pour tous les appelants, blocage compris.
create or replace function public.participants_compte(p_event_ids text[])
returns table(event_id text, going integer, maybe integer, waitlist integer, checked_in integer)
language sql stable security definer set search_path = '' as $f$
  select a.event_id,
    count(*) filter (where coalesce(a.rsvp, 'going') not in ('maybe','waitlist','declined'))::int,
    count(*) filter (where a.rsvp = 'maybe')::int,
    count(*) filter (where a.rsvp = 'waitlist')::int,
    count(*) filter (where a.checked_in_at is not null)::int
  from public.event_attendees a where auth.uid() is not null
    and a.event_id = any(p_event_ids[1:200]) group by a.event_id
$f$;

create or replace function rencontres_prive.bloque(p_event text, p_user text)
returns boolean language sql stable security definer set search_path = '' as $f$
  select exists(select 1 from public.events e join public.blocks b
    on (b.blocker_id = p_user and (b.blocked_id = e.author_id or b.blocked_id = e.organizer_id))
    or (b.blocked_id = p_user and (b.blocker_id = e.author_id or b.blocker_id = e.organizer_id))
    where e.id = p_event)
$f$;
create or replace function public.vient_a_activite(p_event_id text)
returns boolean language sql stable security definer set search_path = '' as $f$
  select auth.uid() is not null and not rencontres_prive.bloque(p_event_id, auth.uid()::text)
    and exists(select 1 from public.event_attendees a
      join rencontres_prive.accords v using(event_id,user_id)
      join public.events e on e.id = a.event_id
      where a.event_id = p_event_id and a.user_id = auth.uid()::text
        and a.rsvp = 'going' and e.status = 'active')
$f$;
create or replace function public.adresses_activites(p_event_ids text[])
returns table(event_id text, address text, contact text)
language sql stable security definer set search_path = '' as $f$
 select e.id,e.address,e.contact from public.events e
 where auth.uid() is not null and e.id = any(p_event_ids[1:200])
   and (public.organise_activite(e.id) or public.vient_a_activite(e.id))
$f$;
-- La liste fermée ne s'ouvre plus via une inscription que l'appelant écrit seul.
drop policy if exists event_attendees_select_lien on public.event_attendees;
create policy event_attendees_select_lien on public.event_attendees for select to authenticated using (
 user_id = (select auth.uid())::text or public.organise_activite(event_id)
 or (rsvp = 'going' and public.vient_a_activite(event_id) and not public.is_blocked_with(user_id))
);

-- Chaque lecture de message, de pièce jointe et chaque entrée de canal relit l'accès.
create or replace function public.can_join_event_conversation(_conv_id text)
returns boolean language sql stable security definer set search_path = '' as $f$
 select auth.uid() is not null and public.adult_access_allowed() and exists(
   select 1 from public.events e join public.conversations c on c.id = e.conv_id
   where e.conv_id = _conv_id and e.conv_id = 'evgrp_' || e.id
     and e.status = 'active' and c.created_at >= e.created_at
     and c.created_by in (e.author_id,e.organizer_id)
     and (public.organise_activite(e.id) or public.vient_a_activite(e.id)))
$f$;
create or replace function public.is_conv_member(_conv_id text, _uid text)
returns boolean language sql stable security definer set search_path = '' as $f$
 -- Même garde C-02 que la photographie de production : autrui refusé avec session ;
 -- postgres/service_role sans session conserve la recherche explicite par _uid.
 select (_uid = auth.uid()::text or auth.uid() is null)
   and exists(select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)
   and (left(_conv_id,6) <> 'evgrp_' or auth.uid() is null or public.can_join_event_conversation(_conv_id))
$f$;
create or replace function public.is_conversation_creator(_conv_id text)
returns boolean language sql stable security definer set search_path = '' as $f$
 select auth.uid() is not null and exists(select 1 from public.conversations c
   where c.id = _conv_id and c.created_by = auth.uid()::text)
   and (left(_conv_id,6) <> 'evgrp_' or public.organise_activite(substr(_conv_id,7)))
$f$;
-- Même le créateur ne peut imposer un membre non approuvé dans un groupe d'activité.
create or replace function rencontres_prive.membre_garde() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
 if left(new.conv_id,6) = 'evgrp_' and not exists(
   select 1 from public.events e join public.conversations c on c.id = e.conv_id
   where e.id = substr(new.conv_id,7) and e.conv_id = new.conv_id and e.status = 'active'
     and c.created_at >= e.created_at and c.created_by in(e.author_id,e.organizer_id)
     and (new.user_id in(e.author_id,e.organizer_id) or
       (not rencontres_prive.bloque(e.id,new.user_id) and exists(
         select 1 from public.event_attendees a join rencontres_prive.accords v using(event_id,user_id)
         where a.event_id = e.id and a.user_id = new.user_id and a.rsvp = 'going')))) then
   raise exception 'acces_activite_non_valide' using errcode = '42501';
 end if;
 return new;
end $f$;
drop trigger if exists aa_rencontres_membre on public.conv_members;
create trigger aa_rencontres_membre before insert or update on public.conv_members
 for each row execute function rencontres_prive.membre_garde();

-- Aucun nouveau rôle d'organisation sans dispositif de consentement.
-- Suspension explicite, y compris des rôles historiques non prouvés.
insert into rencontres_prive.coorganisations_anterieures(event_id,valeur)
 select id,co_organizers from public.events where coalesce(co_organizers,'[]'::jsonb) <> '[]'::jsonb
 on conflict(event_id) do nothing;
update public.events set co_organizers = '[]'::jsonb where coalesce(co_organizers,'[]'::jsonb) <> '[]'::jsonb;
create or replace function rencontres_prive.activite_garde() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
 if tg_op = 'INSERT' and new.organizer_id is not null and new.organizer_id is distinct from new.author_id then
   raise exception 'organisateur_principal_invalide' using errcode = '42501';
 end if;
 new.co_organizers := coalesce(new.co_organizers,'[]'::jsonb);
 if new.co_organizers <> '[]'::jsonb then
   raise exception 'coorganisation_suspendue' using errcode = '42501';
 end if;
 if tg_op = 'INSERT' and (exists(select 1 from rencontres_prive.identifiants_retires where event_id = new.id)
   or exists(select 1 from public.conversations where id = 'evgrp_' || new.id)) then
   raise exception 'identifiant_activite_reserve' using errcode = '23514';
 end if;
 if new.conv_id is not null and new.conv_id <> 'evgrp_' || new.id then
   raise exception 'discussion_activite_invalide' using errcode = '23514';
 end if;
 return new;
end $f$;
drop trigger if exists aa_rencontres_activite on public.events;
create trigger aa_rencontres_activite before insert or update on public.events
 for each row execute function rencontres_prive.activite_garde();
create or replace function rencontres_prive.activite_supprimee() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
 insert into rencontres_prive.identifiants_retires values(old.id) on conflict do nothing;
 delete from public.conv_messages where conv_id = 'evgrp_' || old.id;
 delete from public.conv_reads where conv_id = 'evgrp_' || old.id;
 delete from public.conv_members where conv_id = 'evgrp_' || old.id;
 delete from public.conversations where id = 'evgrp_' || old.id;
 return old;
end $f$;
drop trigger if exists zz_rencontres_suppression on public.events;
create trigger zz_rencontres_suppression after delete on public.events
 for each row execute function rencontres_prive.activite_supprimee();

create or replace function rencontres_prive.inscription_gardee() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
 -- Le même verrou de paire est pris par la pose du blocage.
 perform pg_advisory_xact_lock(hashtextextended('rencontre-paire:' || least(new.user_id,e.author_id) || ':' || greatest(new.user_id,e.author_id),0))
   from public.events e where e.id = new.event_id;
 if new.rsvp <> 'declined' and rencontres_prive.bloque(new.event_id,new.user_id) then
   raise exception 'organisateur_bloque' using errcode = '42501';
 end if;
 if auth.uid() is not null and new.rsvp <> 'declined'
   and (tg_op = 'INSERT' or new.rsvp is distinct from old.rsvp) then
   perform pg_advisory_xact_lock(hashtextextended('rencontres:' || new.user_id,0));
   if (select count(*) from rencontres_prive.inscriptions where user_id = new.user_id
       and created_at >= now() - interval '1 day' and rsvp is not null and rsvp <> 'declined') >= 20 then
     raise exception 'inscriptions_jour_limite' using errcode = 'P0001';
   end if;
 end if;
 return new;
end $f$;
drop trigger if exists aa_rencontres_inscription on public.event_attendees;
create trigger aa_rencontres_inscription before insert or update on public.event_attendees
 for each row execute function rencontres_prive.inscription_gardee();
create or replace function rencontres_prive.inscription_tracee() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare ev text; qui text; reponse text; orga text; precedent text;
begin
 if tg_op = 'UPDATE' and new.rsvp is not distinct from old.rsvp then return null; end if;
 if tg_op = 'DELETE' then ev := old.event_id; qui := old.user_id; reponse := null;
 else ev := new.event_id; qui := new.user_id; reponse := new.rsvp; end if;
 select coalesce(organizer_id,author_id) into orga from public.events where id = ev;
 if not found or not exists(select 1 from public.profiles where id = qui) then return null; end if;
 insert into rencontres_prive.inscriptions(event_id,user_id,rsvp) values(ev,qui,reponse);
 if reponse is distinct from 'going' then
   delete from rencontres_prive.accords where event_id = ev and user_id = qui;
   delete from public.conv_members where conv_id = 'evgrp_' || ev and user_id = qui
     and qui is distinct from orga;
 end if;
 if reponse = 'going' and qui is distinct from orga and orga is not null then
   precedent := current_setting('passio.notification_serveur',true);
   perform set_config('passio.notification_serveur','1',true);
   insert into public.notifications(id,user_id,kind,from_id,ref_id,content,seen)
   values('n_rv_' || gen_random_uuid()::text,orga,'event_join',qui,ev,'demande à participer à ton activité',false);
   perform set_config('passio.notification_serveur',coalesce(precedent,''),true);
 end if;
 return null;
end $f$;
drop trigger if exists zz_rencontres_trace on public.event_attendees;
create trigger zz_rencontres_trace after insert or update or delete on public.event_attendees
 for each row execute function rencontres_prive.inscription_tracee();

-- RPC unique : pas de droit direct de mutation sur l'accord ou son journal.
create or replace function public.valider_participant(p_event_id text,p_user_id text,p_accepter boolean)
returns boolean language plpgsql security definer set search_path = '' as $f$
begin
 if auth.uid() is null or public.suppression_de_mon_compte() or not public.organise_activite(p_event_id) then
   raise exception 'organisation_requise' using errcode = '42501';
 end if;
 perform 1 from public.events where id = p_event_id and status = 'active' for update;
 if not found then return false; end if;
 if p_accepter then
   if rencontres_prive.bloque(p_event_id,p_user_id) then raise exception 'organisateur_bloque' using errcode = '42501'; end if;
   perform 1 from public.event_attendees where event_id = p_event_id and user_id = p_user_id and rsvp = 'going' for update;
   if not found then return false; end if;
   insert into rencontres_prive.accords values(p_event_id,p_user_id) on conflict do nothing;
 else
   if exists(select 1 from public.events where id = p_event_id and p_user_id in(author_id,organizer_id)) then
     raise exception 'organisateur_non_retirable' using errcode = '42501';
   end if;
   delete from rencontres_prive.accords where event_id = p_event_id and user_id = p_user_id;
   delete from public.conv_members where conv_id = 'evgrp_' || p_event_id and user_id = p_user_id;
   delete from public.event_attendees where event_id = p_event_id and user_id = p_user_id;
   return found;
 end if;
 return true;
end $f$;
create or replace function public.journal_participation(p_event_id text)
returns table(user_id text,rsvp text,created_at timestamptz)
language sql stable security definer set search_path = '' as $f$
 select j.user_id,j.rsvp,j.created_at from rencontres_prive.inscriptions j
 where auth.uid() is not null and j.event_id = p_event_id
 and (public.organise_activite(p_event_id) or j.user_id = auth.uid()::text)
 order by j.created_at desc limit 200
$f$;

create or replace function public.participants_validation(p_event_id text)
returns table(user_id text,rsvp text,valide boolean)
language sql stable security definer set search_path = '' as $f$
 select a.user_id,a.rsvp,(v.user_id is not null) from public.event_attendees a
 left join rencontres_prive.accords v using(event_id,user_id)
 where auth.uid() is not null and public.organise_activite(p_event_id)
   and a.event_id = p_event_id order by a.created_at
$f$;
revoke all on function public.participants_validation(text) from public,anon;
grant execute on function public.participants_validation(text) to authenticated,service_role;

-- Un blocage révoque l'accord et la place dans les deux sens.
create or replace function rencontres_prive.blocage_pose() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
 perform pg_advisory_xact_lock(hashtextextended('rencontre-paire:' || least(new.blocker_id,new.blocked_id) || ':' || greatest(new.blocker_id,new.blocked_id),0));
 delete from public.event_attendees a using public.events e where a.event_id = e.id and (
   (a.user_id = new.blocked_id and new.blocker_id in(e.author_id,e.organizer_id)) or
   (a.user_id = new.blocker_id and new.blocked_id in(e.author_id,e.organizer_id)));
 return new;
end $f$;
drop trigger if exists zz_rencontres_blocage on public.blocks;
create trigger zz_rencontres_blocage after insert or update on public.blocks
 for each row execute function rencontres_prive.blocage_pose();

-- Fermer les appartenances héritées ; les conversations orphelines restent inaccessibles.
delete from public.conv_members m where left(m.conv_id,6) = 'evgrp_'
 and not exists(select 1 from public.events e where e.id = substr(m.conv_id,7)
   and (m.user_id in(e.author_id,e.organizer_id) or
     (e.status = 'active' and not rencontres_prive.bloque(e.id,m.user_id) and exists(
       select 1 from public.event_attendees a join rencontres_prive.accords v using(event_id,user_id)
       where a.event_id = e.id and a.user_id = m.user_id and a.rsvp = 'going'))));
delete from public.event_attendees a using public.events e where a.event_id = e.id
 and rencontres_prive.bloque(e.id,a.user_id);

-- Tous les droits sont nommés, même avec des privilèges Supabase par défaut.
revoke all on all functions in schema rencontres_prive from public,anon,authenticated;
revoke all on function public.valider_participant(text,text,boolean),public.journal_participation(text),
 public.participants_compte(text[]),public.vient_a_activite(text),public.adresses_activites(text[]),
 public.can_join_event_conversation(text),public.is_conv_member(text,text),public.is_conversation_creator(text) from public,anon;
grant execute on function public.valider_participant(text,text,boolean),public.journal_participation(text),
 public.participants_compte(text[]),public.vient_a_activite(text),public.adresses_activites(text[]),
 public.can_join_event_conversation(text),public.is_conv_member(text,text),public.is_conversation_creator(text) to authenticated,service_role;
-- FERMÉ SUR ÉCHEC, pas seulement un tableau imprimé.
do $f$
begin
 if has_schema_privilege('authenticated','rencontres_prive','usage')
   or has_function_privilege('anon','public.valider_participant(text,text,boolean)','execute')
   or exists(select 1 from public.events where co_organizers <> '[]'::jsonb) then
   raise exception 'rencontres: droits ou état inattendus' using errcode = '55000';
 end if;
end $f$;
notify pgrst, 'reload schema';
select 'rencontres : validation, blocage et discussions' as controle,'OK' as valeur;
commit;
