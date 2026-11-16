-- PostgreSQL LOCAL JETABLE, base vide nommée passio_test_rencontres.
-- psql -X -v ON_ERROR_STOP=1 -d passio_test_rencontres -f tests/sql/migration-rencontres-validation.test.sql
-- Socle isolé, triggers métier réels dans fixtures/rencontres-fonctions-prod.sql.
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
 status text default 'active',conv_id text,created_at timestamp default now(),address text,contact text, max_attendees integer, date_at timestamp default (now()+interval '3 days'), end_at timestamp);
create table public.event_attendees(event_id text references public.events on delete cascade,user_id text references public.profiles,
 rsvp text default 'going',created_at timestamptz default now(),checked_in_at timestamp, rating smallint, feedback text, rated_at timestamptz,primary key(event_id,user_id));
create table public.conversations(id text primary key,is_group boolean default true,created_by text,created_at timestamp default now());
create table public.conv_members(conv_id text references public.conversations,user_id text,primary key(conv_id,user_id));
create table public.conv_messages(id text primary key,conv_id text references public.conversations,content text);
create table public.conv_reads(conv_id text,user_id text);
create table public.blocks(blocker_id text,blocked_id text,primary key(blocker_id,blocked_id));
create table public.notifications(id text primary key,user_id text,kind text,from_id text,ref_id text,content text,seen boolean,created_at timestamptz default now());
create function public.adult_access_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
create function public.suppression_de_mon_compte() returns boolean language sql stable as $$select false$$;
create function public.is_blocked_with(u text) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.blocks where (blocker_id=auth.uid()::text and blocked_id=u) or (blocked_id=auth.uid()::text and blocker_id=u))$$;
create function public.organise_activite(e text) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.events where id=e and auth.uid()::text in(author_id,organizer_id))$$;
alter table public.event_attendees enable row level security;
create policy propre on public.event_attendees for all to authenticated using(user_id=auth.uid()::text) with check(user_id=auth.uid()::text);
grant select,insert,update,delete on public.event_attendees to authenticated;
grant select,insert,update on public.events,public.conversations,public.conv_members to authenticated;
create table public.stories(id text,created_at timestamptz);
create table public.story_views(story_id text);
create table public.video_lives(status text,ended_at timestamptz,last_seen timestamptz,started_at timestamptz);
\ir fixtures/rencontres-fonctions-prod.sql
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
\ir fixtures/rencontres-policies-prod.sql
-- Chemin client réel : conversation, lien d'activité, créateur, puis lecture.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
insert into public.events(id,author_id,organizer_id) values('creation','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');
insert into public.conversations(id,created_by) values('evgrp_creation','11111111-1111-4111-8111-111111111111');
do $$ begin
 begin
   insert into public.conv_members values('evgrp_creation',auth.uid()::text);
   raise exception 'ordre ancien admis';
 exception when insufficient_privilege then null; end;
end $$;
update public.events set conv_id='evgrp_creation' where id='creation';
insert into public.conv_members values('evgrp_creation','11111111-1111-4111-8111-111111111111');
select id,created_by,is_group from public.conversations where id='evgrp_creation';
select conv_id,user_id from public.conv_members where conv_id='evgrp_creation';
do $$ begin
 if not public.can_join_event_conversation('evgrp_creation') then raise exception 'creation sans acces'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
delete from public.events where id='creation';
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
reset role;
do $$ declare x jsonb; begin
 if not exists(select 1 from rencontres_prive.decisions where event_id='r1'
   and decideur_id='11111111-1111-4111-8111-111111111111' and accepter and created_at is not null) then
   raise exception 'preuve de decision absente'; end if;
 x := public.export_compte_instantane('22222222-2222-4222-8222-222222222222',1);
 if (x #>> '{tables,rencontres_prive.inscriptions,attendu}')::int <> 1
   or (x #>> '{tables,rencontres_prive.decisions,attendu}')::int <> 1
   or (x #>> '{tables,rencontres_prive.coorganisations_anterieures,attendu}')::int <> 1 then
   raise exception 'export prive incomplet'; end if;
end $$;
set role authenticated;
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
do $$ begin
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

-- Rétention : récentes gardées, expirées retirées, journal vivant et activité future gardés.
insert into rencontres_prive.inscriptions(event_id,user_id,rsvp,created_at) values
 (null,'33333333-3333-4333-8333-333333333333','going',now()-interval '31 days');
insert into rencontres_prive.decisions(event_id,user_id,decideur_id,accepter,created_at) values
 (null,'33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true,now()-interval '91 days');
insert into public.events(id,author_id) values('future','11111111-1111-4111-8111-111111111111');
insert into rencontres_prive.inscriptions(event_id,user_id,rsvp,created_at) values
 ('future','33333333-3333-4333-8333-333333333333','going',now()-interval '31 days');
insert into rencontres_prive.coorganisations_anterieures(event_id,valeur) values
 ('future','["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"]');
do $$ declare x jsonb; begin
 x:=public.export_compte_instantane('33333333-3333-4333-8333-333333333333',1);
 if not (x #>> '{tables,rencontres_prive.inscriptions,tronque}')::boolean then raise exception 'troncature invisible'; end if;
 if x #> '{tables,rencontres_prive.coorganisations_anterieures,lignes,0,valeur}' <> '["33333333-3333-4333-8333-333333333333"]'::jsonb then raise exception 'archive tiers exportee'; end if;
 x:=public.purger_donnees_expirees();
 if (x->>'rencontres_inscriptions')::int <> 1 or (x->>'rencontres_decisions')::int <> 1 then raise exception 'retention incorrecte'; end if;
 if not exists(select 1 from rencontres_prive.inscriptions where event_id='future') then raise exception 'activite future purgee'; end if;
 if (select count(*) from rencontres_prive.inscriptions) <> 3 then raise exception 'recentes perdues'; end if;
end $$;
-- RPC de purge réellement appelée, puis filet profil : tous les chemins retirent les UID JSON.
set role service_role;
select public.retirer_co_organisateur('22222222-2222-4222-8222-222222222222');
reset role;
do $$ begin
 if exists(select 1 from rencontres_prive.coorganisations_anterieures where valeur ? '22222222-2222-4222-8222-222222222222') then raise exception 'uid conserve apres rpc purge'; end if;
 if has_schema_privilege('service_role','rencontres_prive','usage')
   or has_function_privilege('authenticated','public.export_compte_instantane(text,integer,bigint)','execute') then raise exception 'privileges excessifs'; end if;
end $$;
delete from public.profiles where id='33333333-3333-4333-8333-333333333333';
do $$ begin
 if exists(select 1 from rencontres_prive.coorganisations_anterieures where valeur ? '33333333-3333-4333-8333-333333333333')
  or exists(select 1 from rencontres_prive.inscriptions where user_id='33333333-3333-4333-8333-333333333333') then raise exception 'uid conserve apres profil'; end if;
end $$;
select 'OK : cycle de vie prive, export, purge et retention' as verdict;

insert into public.events(id,author_id) values('archive_expiree','11111111-1111-4111-8111-111111111111');
insert into rencontres_prive.coorganisations_anterieures(event_id,valeur,created_at) values
 ('archive_expiree','["22222222-2222-4222-8222-222222222222"]',now()-interval '31 days');
do $$ declare x jsonb; begin
 x:=public.purger_donnees_expirees();
 if (x->>'rencontres_archives')::int <> 1 then raise exception 'archive expiree conservee'; end if;
 if not exists(select 1 from rencontres_prive.coorganisations_anterieures where event_id='future') then raise exception 'archive recente perdue'; end if;
end $$;
insert into rencontres_prive.decisions(event_id,user_id,decideur_id,accepter) values
 ('future','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',true);
delete from public.profiles where id='11111111-1111-4111-8111-111111111111';
do $$ begin
 if not exists(select 1 from rencontres_prive.decisions where user_id='22222222-2222-4222-8222-222222222222'
   and decideur_id is null) then raise exception 'effacement decideur detruit preuve participant'; end if;
end $$;
-- Restaurer seulement le profil synthétique pour les scénarios concurrents natifs.
insert into public.profiles values('11111111-1111-4111-8111-111111111111');
