-- Compléments du socle de rencontres isolé, puis utilisation de la vraie RPC de validation.
alter table public.events add title text;
alter table public.notifications add push_le timestamptz, add origine text;
create table public.push_subscriptions (user_id text, endpoint text primary key);
create function public.passio_echapper_html(text) returns text language sql immutable as $$select replace($1,'<','&lt;')$$;
create function public.genres_reserves_au_serveur(text) returns boolean language sql as $$select $1='event_accepted'$$;
create function public.identifiant_reserve_au_serveur(text) returns boolean language sql as $$select starts_with($1,'n_pi_')$$;
create function public.origine_confirmation_de_test() returns trigger language plpgsql as $$
begin new.origine := case when current_setting('passio.notification_serveur',true)='1' then 'serveur' else 'client' end; return new; end $$;
create trigger origine_confirmation before insert on public.notifications for each row execute function public.origine_confirmation_de_test();
\ir ../../migrations/migration_confirmation_participation_2026-11-25.sql
\ir ../../migrations/migration_confirmation_participation_2026-11-25.sql
delete from public.blocks where blocker_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')
 and blocked_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
insert into public.events(id,title,author_id,organizer_id)
values('confirmation','Ma sortie','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');
insert into public.event_attendees(event_id,user_id,rsvp) values('confirmation','22222222-2222-4222-8222-222222222222','going');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.valider_participant('confirmation','22222222-2222-4222-8222-222222222222',true);
select public.valider_participant('confirmation','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (select count(*) from public.notifications where ref_id='confirmation' and kind='event_accepted' and origine='serveur') <> 1
 then raise exception 'confirmation absente ou dupliquée'; end if;
 if exists(select from public.confirmations_a_pousser(null,null,null)) then raise exception 'aucun appareil abonné'; end if;
end $$;
insert into public.push_subscriptions values('22222222-2222-4222-8222-222222222222','test');
do $$ begin
 if exists(select from public.confirmations_a_pousser('autre',null,null)) then raise exception 'mauvaise sortie'; end if;
 if (select count(*) from public.confirmations_a_pousser('confirmation',null,null)) <> 1 then raise exception 'push absente'; end if;
 if exists(select from public.confirmations_a_pousser(null,null,null)) then raise exception 'décision réservée deux fois'; end if;
end $$;
select public.valider_participant('confirmation','22222222-2222-4222-8222-222222222222',false);
update public.notifications set confirmation_essai_apres=null where ref_id='confirmation';
do $$ begin
 if exists(select from public.confirmations_a_pousser(null,null,null)) then raise exception 'accord retiré'; end if;
end $$;
