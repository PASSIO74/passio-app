-- PostgreSQL LOCAL JETABLE, base vide nommée passio_test_rencontres.
-- psql -X -v ON_ERROR_STOP=1 -d passio_test_rencontres -f tests/sql/migration-rencontres-validation.test.sql
-- Socle volontairement réduit : ne valide pas les autres triggers Supabase.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'passio_test_rencontres' or to_regclass('public.events') is not null
   or coalesce(inet_server_addr()::text,'127.0.0.1') not in ('127.0.0.1','::1') then
   raise exception 'base locale vide passio_test_rencontres requise';
 end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon,service_role;
create table public.profiles(id text primary key);
create table public.events(id text primary key,author_id text,organizer_id text,co_organizers jsonb default '[]',
 status text default 'active',conv_id text,created_at timestamp default now(),address text,contact text);
create table public.event_attendees(event_id text references public.events on delete cascade,user_id text references public.profiles,
 rsvp text default 'going',created_at timestamptz default now(),checked_in_at timestamp,primary key(event_id,user_id));
create table public.conversations(id text primary key,created_by text,created_at timestamp default now());
create table public.conv_members(conv_id text references public.conversations,user_id text,primary key(conv_id,user_id));
create table public.conv_messages(id text primary key,conv_id text references public.conversations,content text);
create table public.conv_reads(conv_id text,user_id text);
create table public.blocks(blocker_id text,blocked_id text,primary key(blocker_id,blocked_id));
create table public.notifications(id text primary key,user_id text,kind text,from_id text,ref_id text,content text,seen boolean);
create function public.adult_access_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
create function public.suppression_de_mon_compte() returns boolean language sql stable as $$select false$$;
create function public.is_blocked_with(u text) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.blocks where (blocker_id=auth.uid()::text and blocked_id=u) or (blocked_id=auth.uid()::text and blocker_id=u))$$;
create function public.organise_activite(e text) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.events where id=e and auth.uid()::text in(author_id,organizer_id))$$;
alter table public.event_attendees enable row level security;
create policy propre on public.event_attendees for all to authenticated using(user_id=auth.uid()::text) with check(user_id=auth.uid()::text);
grant select,insert,update,delete on public.event_attendees to authenticated;
grant select on public.events,public.conv_members to authenticated;
insert into public.profiles values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
insert into public.events(id,author_id,organizer_id,co_organizers,conv_id,address,contact) values
 ('r1','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','["22222222-2222-4222-8222-222222222222"]','evgrp_r1','adresse-temoin','contact-temoin');
insert into public.conversations(id,created_by) values('evgrp_r1','11111111-1111-4111-8111-111111111111');
insert into public.conv_messages values('m1','evgrp_r1','message-temoin');
\ir ../../migrations/migration_rencontres_validation_2026-11-16.sql
\ir ../../migrations/migration_rencontres_validation_2026-11-16.sql
do $$ begin
 if (select valeur from rencontres_prive.coorganisations_anterieures where event_id='r1') <> '["22222222-2222-4222-8222-222222222222"]'::jsonb then raise exception 'historique perdu'; end if;
end $$;
-- Non approuvé : sa propre inscription ne donne ni adresse ni groupe.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
insert into public.event_attendees(event_id,user_id) values('r1',auth.uid()::text);
do $$ begin
 if public.vient_a_activite('r1') or public.can_join_event_conversation('evgrp_r1')
   or exists(select 1 from public.adresses_activites(array['r1'])) then raise exception 'accès avant accord'; end if;
 begin perform public.valider_participant('r1',auth.uid()::text,true); raise exception 'auto-validation acceptée';
 exception when insufficient_privilege then null; end;
end $$;
-- Accord donné par l'organisation, puis contrôle sous le rôle du participant.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$ begin
 if not public.valider_participant('r1','22222222-2222-4222-8222-222222222222',true) then raise exception 'validation refusée'; end if;
 if not (select valide from public.participants_validation('r1') where user_id='22222222-2222-4222-8222-222222222222') then raise exception 'état validé absent'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ begin
 if not public.vient_a_activite('r1') or not public.can_join_event_conversation('evgrp_r1')
   or not exists(select 1 from public.adresses_activites(array['r1'])) then raise exception 'accord sans accès'; end if;
end $$;
reset role;
insert into public.conv_members values('evgrp_r1','22222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub','',false);
\ir ../../migrations/migration_rencontres_validation_2026-11-16.sql
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $ begin
 if public.is_conv_member('evgrp_r1','11111111-1111-4111-8111-111111111111') then raise exception 'oracle autrui'; end if;
 if not public.is_conv_member('evgrp_r1','22222222-2222-4222-8222-222222222222') then raise exception 'membre rejeté'; end if;
end $$;
select set_config('request.jwt.claim.sub','',false);
set role service_role;
do $$ begin
 if not public.is_conv_member('evgrp_r1','22222222-2222-4222-8222-222222222222') then raise exception 'service sans session modifié'; end if;
end $$;
reset role;
-- Compteur indépendant d'un blocage sans lien avec l'organisation.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
create temp table compteur as select * from public.participants_compte(array['r1']);
insert into public.blocks values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222');
do $$ begin
 if exists((select * from compteur except select * from public.participants_compte(array['r1'])) union all
  (select * from public.participants_compte(array['r1']) except select * from compteur)) then raise exception 'oracle compteur'; end if;
end $$;
-- Un blocage de l'organisateur retire place, accord et appartenance.
insert into public.blocks values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
do $$ begin
 if exists(select 1 from public.event_attendees where event_id='r1') or exists(select 1 from rencontres_prive.accords)
  or exists(select 1 from public.conv_members) then raise exception 'blocage sans révocation'; end if;
 begin insert into public.event_attendees(event_id,user_id) values('r1','22222222-2222-4222-8222-222222222222'); raise exception 'bloqué admis';
 exception when insufficient_privilege then null; end;
 if (select count(*) from rencontres_prive.inscriptions) <> 2 then raise exception 'trace retrait perdue'; end if;
 if not exists(select 1 from public.notifications where kind='event_join') then raise exception 'notification absente'; end if;
 begin update public.events set co_organizers='["33333333-3333-4333-8333-333333333333"]'; raise exception 'coorganisation libre';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','',false);
delete from public.events where id='r1';
do $$ begin
 if exists(select 1 from public.conversations) or exists(select 1 from public.conv_messages) then raise exception 'discussion conservée'; end if;
 begin insert into public.events(id) values('r1'); raise exception 'identifiant réutilisé';
 exception when check_violation then null; end;
 if (select count(*) from rencontres_prive.inscriptions) <> 2 then raise exception 'plafond effacé avec activité'; end if;
end $$;
select 'OK : rejeu, attente/accord, blocage, compteur, historique, rôles, suppression' as verdict;
