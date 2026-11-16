-- SOCLE RÉDUIT JETABLE : deux corps de diffuseurs du catalogue inchangés.
-- Les fonctions Realtime enregistrent leurs appels dans une table transactionnelle.
-- Elles ne simulent pas le service distant ni sa livraison effective.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'passio_test_realtime_budget' or to_regclass('public.conv_messages') is not null
 or coalesce(inet_server_addr()::text,'127.0.0.1') not in ('127.0.0.1','::1') then
  raise exception 'base locale vide passio_test_realtime_budget requise';
 end if;
end $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to anon,authenticated,service_role;
create table public.profiles(id text primary key);
create table public.conv_members(conv_id text,user_id text,primary key(conv_id,user_id));
create table public.blocks(blocker_id text,blocked_id text,primary key(blocker_id,blocked_id));
create table public.conv_messages(id text primary key,conv_id text,from_id text,content text,created_at timestamp default now());
create table public.conv_reads(conv_id text,user_id text,last_read_at timestamptz not null default now(),
 rid bigint generated always as identity,primary key(conv_id,user_id));
create schema realtime;
create table realtime.trames(topic text,event text,charge jsonb);
create function realtime.send(charge jsonb,event text,topic text,prive boolean default true)
returns void language plpgsql as $$begin insert into realtime.trames values(topic,event,charge);end$$;
create function realtime.broadcast_changes(topic text,event text,operation text,nom_table text,nom_schema text,n record,o record)
returns void language plpgsql as $$begin
 perform realtime.send(jsonb_build_object('record',to_jsonb(n),'old_record',to_jsonb(o),
  'schema',nom_schema,'table',nom_table,'operation',operation),event,topic,true);
end$$;
create function public.blocage_entre(a text,b text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blocks x where (x.blocker_id=a and x.blocked_id=b) or (x.blocker_id=b and x.blocked_id=a))$$;
create function public.is_conv_member(c text,u text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conv_members where conv_id=c and user_id=u)$$;
alter table public.conv_messages enable row level security;
alter table public.conv_reads enable row level security;
create policy messages_lire on public.conv_messages for select to authenticated
 using(public.is_conv_member(conv_id,auth.uid()::text));
create policy messages_ecrire on public.conv_messages for insert to authenticated
 with check(from_id=auth.uid()::text and public.is_conv_member(conv_id,auth.uid()::text));
create policy lectures_lire on public.conv_reads for select to authenticated
 using(public.is_conv_member(conv_id,auth.uid()::text));
create policy lectures_insert on public.conv_reads for insert to authenticated
 with check(user_id=auth.uid()::text and public.is_conv_member(conv_id,auth.uid()::text));
create policy lectures_update on public.conv_reads for update to authenticated
 using(user_id=auth.uid()::text and public.is_conv_member(conv_id,auth.uid()::text))
 with check(user_id=auth.uid()::text and public.is_conv_member(conv_id,auth.uid()::text));
grant select,insert on public.conv_messages to authenticated;
grant select,insert,update on public.conv_reads to authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on public.conv_messages,public.conv_reads to service_role;
grant usage on all sequences in schema public to service_role;
-- Reproduire aussi les grants nominaux Supabase qu'un simple REVOKE PUBLIC manquerait.
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
insert into public.profiles values
 ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
insert into public.conv_members select 'g',id from public.profiles;
insert into public.conv_members select 'autre',id from public.profiles where id like '2222%' or id like '4444%';
insert into public.blocks values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
-- DIFFUSEURS_CATALOGUE
CREATE OR REPLACE FUNCTION public.broadcast_conv_message_to_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'realtime'
AS $function$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
    -- ⚠️ LE COUPLE EXPLICITE (auteur, destinataire), et aucun état de session :
    -- voir l'en-tête pour ce que l'autre aide perd sur les chemins serveur.
    IF NOT public.blocage_entre(NEW.from_id, m.user_id) THEN
      PERFORM realtime.broadcast_changes(
        'user:' || m.user_id,
        TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
create or replace function public.diffuser_lecture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  charge jsonb;
begin
  if new.conv_id is null or new.user_id is null then return null; end if;
  if tg_op = 'UPDATE' and old.last_read_at is not distinct from new.last_read_at then return null; end if;
  if (select count(*) from public.conv_members cm where cm.conv_id = new.conv_id) > 50 then return null; end if;
  charge := jsonb_build_object(
    'table', 'conv_reads',
    'operation', tg_op,
    'record', jsonb_build_object('conv_id', new.conv_id, 'user_id', new.user_id, 'last_read_at', new.last_read_at)
  );
  begin
    for m in
      select cm.user_id from public.conv_members cm
       where cm.conv_id = new.conv_id
         and cm.user_id <> new.user_id
         and cm.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    loop
      if not public.blocage_entre(new.user_id, m.user_id) then
        perform realtime.send(charge, 'conv_reads:UPSERT', 'user:' || m.user_id, true);
      end if;
    end loop;
  exception when others then
    raise warning 'diffuser_lecture : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$$;
create trigger broadcast_conv_message_users_trigger after insert on public.conv_messages for each row execute function public.broadcast_conv_message_to_users();
create trigger trg_diffuser_lecture after insert or update of last_read_at on public.conv_reads for each row execute function public.diffuser_lecture();
