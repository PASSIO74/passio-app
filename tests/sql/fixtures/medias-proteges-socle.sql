-- Banc natif uniquement : catalogue sans donnees + definitions actuelles deja figees par le lot social.
\ir socle-production-2026-11-06.sql
\ir ../../../migrations/migration_securite_lot1_2026-11-06.sql
\ir cas-social-visibilite-definitions.sql
\ir ../../../migrations/migration_story_interactions_2026-11-14.sql
\ir cas-social-visibilite-socle-recent.sql
\ir ../../../migrations/migration_social_visibilite_2026-11-16.sql

-- Colonnes fournisseur relevees le 16/11 ; aucune vraie session ni ligne Storage.
create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,not_after timestamptz);
alter table auth.sessions enable row level security;
revoke all on auth.sessions from public,anon,authenticated;
alter table storage.objects add column user_metadata jsonb,add column archived_at timestamptz,
  add column is_delete_marker boolean not null default false,add column is_versioned boolean not null default false;

create schema banc_medias;
create table banc_medias.resultats(n serial,cas text,ok boolean not null,obtenu text,attendu text);
grant usage on schema banc_medias to anon,authenticated,service_role;
grant insert,select on banc_medias.resultats to anon,authenticated,service_role;
grant usage on all sequences in schema banc_medias to anon,authenticated,service_role;
create function banc_medias.verifier(p_cas text,p_ok boolean) returns void language plpgsql security invoker as $$
begin insert into banc_medias.resultats(cas,ok) values(p_cas,coalesce(p_ok,false)); end $$;
grant execute on function banc_medias.verifier(text,boolean) to anon,authenticated,service_role;

-- UUID de fixture uniquement, stubs Auth documentes par le socle ; RLS et verrous sont reels.
insert into auth.users(id,email) select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'synthetic-'||i||'@invalid.test' from generate_series(1,15) i;
insert into public.profiles(id,username,is_private) select '00000000-0000-4000-8000-'||lpad(i::text,12,'0'),'fixture_'||i,i<=6 and i<>2 from generate_series(1,15) i;
insert into auth.sessions(id,user_id) select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,6) i;
insert into public.follows(follower_id,following_id,status) values
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','accepted'),
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','pending'),
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','accepted');
-- L'INSERT reel remet une demande en pending : acceptation explicite sous le role du suivi.
do $acceptation$ begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  execute 'set local role authenticated';
  update public.follows set status='accepted' where following_id='00000000-0000-4000-8000-000000000001'
    and follower_id in ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000005');
  reset role;
end $acceptation$;
insert into public.blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005');
