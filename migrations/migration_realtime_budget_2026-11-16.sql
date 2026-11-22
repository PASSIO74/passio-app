-- D10-01 : borner le travail de diffusion, pas tronquer les messages.
-- PREREQUIS-CLIENT: conv_reads_budget_reprise_v1
-- Catalogue relu le 16/11 : seuls les deux diffuseurs existants sont remplacés.
-- Les policies, sujets, événements et enveloppes restent ceux du catalogue.
-- Une limite refuse la transaction AVANT sa première émission, hors catch.
-- Cela ne constitue pas une garantie de livraison du fournisseur Realtime.
-- Banc natif jetable : tests/sql/migration-realtime-budget.test.sh.
-- Retour arrière : remettre les deux corps du socle et retirer le trigger
-- aa_lecture_budget ; garder le client et les compteurs pour diagnostic.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Refuser la dérive de corps plutôt que remplacer un correctif inconnu.
do $g$ declare f record; h text; begin
 for f in select * from (values
   ('public.broadcast_conv_message_to_users()', '40bb526c4e23a6dae1d20e322b2e4fd4', 'd9b5e155ae80c1de96b61143395df6a7'),
   ('public.diffuser_lecture()', 'c928f98ddb8b3e9a5e1c3a28cc6b73e0', '28d8f71c2f3ad9cc52720c4e4c5fddd6')
 ) as x(signature,avant,apres) loop
  if to_regprocedure(f.signature) is null then raise exception 'diffuseur prerequisite absent'; end if;
  select md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g'))) into h
   from pg_proc p where p.oid=to_regprocedure(f.signature);
  if h not in (f.avant,f.apres) then raise exception 'diffuseur different du catalogue relu'; end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.conv_messages'::regclass
   and tgname='broadcast_conv_message_users_trigger'
   and tgfoid='public.broadcast_conv_message_to_users()'::regprocedure and not tgisinternal
   and tgenabled='O' and tgtype=5 and tgnargs=0 and tgattr::text='')
 or not exists(select 1 from pg_trigger where tgrelid='public.conv_reads'::regclass
   and tgname='trg_diffuser_lecture' and tgfoid='public.diffuser_lecture()'::regprocedure and not tgisinternal
   and tgenabled='O' and tgtype=21 and tgnargs=0 and tgattr::text=(select attnum::text from pg_attribute
     where attrelid='public.conv_reads'::regclass and attname='last_read_at' and not attisdropped)) then
  raise exception 'liaison de diffusion differente du catalogue relu';
 end if;
end $g$;

create schema if not exists passio_realtime_budget;
revoke all on schema passio_realtime_budget from public,anon,authenticated,service_role;
-- Trois lignes au plus par profil ; disparition avec le compte, aucun contenu.
create table if not exists passio_realtime_budget.compteurs (
 compte text not null references public.profiles(id) on delete cascade,
 fenetre smallint not null check(fenetre between 1 and 3),
 debut timestamptz not null,
 effets bigint not null check(effets >= 0),
 trames bigint not null check(trames >= 0),
 octets bigint not null check(octets >= 0),
 primary key(compte,fenetre)
);
alter table passio_realtime_budget.compteurs enable row level security;
revoke all on all tables in schema passio_realtime_budget from public,anon,authenticated,service_role;

create or replace function passio_realtime_budget.consommer(p_compte text,p_trames bigint,p_octets bigint)
returns void language plpgsql security definer set search_path = '' as $f$
declare i integer; moment timestamptz := clock_timestamp(); debut_f timestamptz;
 fin timestamptz; periode interval; v record; max_effets bigint; max_trames bigint; max_octets bigint;
begin
 if p_compte is null or p_trames is null or p_octets is null or p_trames < 0 or p_octets < 0 then
  raise exception 'budget de diffusion invalide' using errcode='22023';
 end if;
 -- Ordre de verrouillage identique, source issue du serveur, jamais d'une clé client.
 for i in 1..3 loop
  periode := case i when 1 then interval '1 minute' when 2 then interval '1 hour' else interval '24 hours' end;
  debut_f := date_trunc(case i when 1 then 'minute' when 2 then 'hour' else 'day' end,
   moment at time zone 'UTC') at time zone 'UTC';
  max_effets := case i when 1 then 120 when 2 then 2000 else 6000 end;
  max_trames := case i when 1 then 3000 when 2 then 30000 else 100000 end;
  max_octets := case i when 1 then 16777216 when 2 then 67108864 else 268435456 end;
  insert into passio_realtime_budget.compteurs as c(compte,fenetre,debut,effets,trames,octets)
   values(p_compte,i,debut_f,1,p_trames,p_octets)
   on conflict(compte,fenetre) do update set
    debut=greatest(c.debut,excluded.debut),
    effets=case when c.debut < excluded.debut then excluded.effets else c.effets+excluded.effets end,
    trames=case when c.debut < excluded.debut then excluded.trames else c.trames+excluded.trames end,
    octets=case when c.debut < excluded.debut then excluded.octets else c.octets+excluded.octets end
   returning c.* into v;
  if v.effets > max_effets or v.trames > max_trames or v.octets > max_octets then
   fin := v.debut+periode;
   raise exception 'rate limit realtime' using errcode='P0001',
    detail=jsonb_build_object('budget','realtime','reessai_ms',
      greatest(1000,ceil(extract(epoch from (fin-clock_timestamp()))*1000)::bigint))::text;
  end if;
 end loop;
end $f$;

-- L'upsert passe éventuellement par BEFORE INSERT puis BEFORE UPDATE : le
-- compteur est donc dans le diffuseur AFTER, une fois par effet effectif.
create or replace function passio_realtime_budget.lecture_gardee()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare maintenant timestamptz := clock_timestamp();
begin
 if auth.uid() is not null and new.user_id is distinct from auth.uid()::text then
  raise exception 'identite de lecture invalide' using errcode='42501';
 end if;
 if tg_op='UPDATE' and (new.conv_id is distinct from old.conv_id or new.user_id is distinct from old.user_id) then
  raise exception 'identifiants de lecture immuables' using errcode='23514';
 end if;
 new.last_read_at := least(coalesce(new.last_read_at,maintenant),maintenant);
 if tg_op='UPDATE' then
  new.last_read_at := greatest(new.last_read_at,least(old.last_read_at,maintenant));
 end if;
 return new;
end $f$;
drop trigger if exists aa_lecture_budget on public.conv_reads;
create trigger aa_lecture_budget before insert or update on public.conv_reads
 for each row execute function passio_realtime_budget.lecture_gardee();

create or replace function public.broadcast_conv_message_to_users()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare destinataires text[]; destinataire text; acteur text; octets bigint;
begin
 acteur := coalesce(auth.uid()::text,new.from_id);
 if auth.uid() is not null and new.from_id is distinct from acteur then
  raise exception 'identite de message invalide' using errcode='42501';
 end if;
 -- Liste capturée : un membre arrivé ensuite n'échappe pas au décompte.
 select coalesce(array_agg(cm.user_id order by cm.user_id),array[]::text[]) into destinataires
 from public.conv_members cm where cm.conv_id=new.conv_id
  and not public.blocage_entre(new.from_id,cm.user_id);
 -- NEW/OLD complets restent transmis par broadcast_changes. La majoration
 -- couvre aussi les noms de colonnes/schéma/table/opération de son enveloppe.
 octets := octet_length(jsonb_build_object('record',to_jsonb(new),'old_record',to_jsonb(old),
  'schema',tg_table_schema,'table',tg_table_name,'operation',tg_op)::text)+1024;
 perform passio_realtime_budget.consommer(acteur,cardinality(destinataires)::bigint,
  cardinality(destinataires)::bigint*octets);
 foreach destinataire in array destinataires loop
  if not public.blocage_entre(new.from_id,destinataire) then
   perform realtime.broadcast_changes('user:'||destinataire,tg_op,tg_op,tg_table_name,tg_table_schema,new,old);
  end if;
 end loop;
 return new;
end $f$;

create or replace function public.diffuser_lecture()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare destinataires text[]; destinataire text; charge jsonb; acteur text;
begin
 if new.conv_id is null or new.user_id is null then return null; end if;
 if tg_op='UPDATE' and new.last_read_at <= old.last_read_at then return null; end if;
 acteur := coalesce(auth.uid()::text,new.user_id);
 -- Limite historique conservée : au-delà, les accusés se relisent à l'ouverture.
 -- L'écriture avancée reste soumise au budget d'effets, même sans diffusion.
 if (select count(*) from public.conv_members cm where cm.conv_id=new.conv_id)>50 then
  perform passio_realtime_budget.consommer(acteur,0,0);
  return null;
 end if;
 select coalesce(array_agg(cm.user_id order by cm.user_id),array[]::text[]) into destinataires
 from public.conv_members cm where cm.conv_id=new.conv_id and cm.user_id<>new.user_id
  and cm.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not public.blocage_entre(new.user_id,cm.user_id);
 charge := jsonb_build_object('table','conv_reads','operation',tg_op,'record',
  jsonb_build_object('conv_id',new.conv_id,'user_id',new.user_id,'last_read_at',new.last_read_at));
 -- Impérativement HORS du savepoint best-effort : un refus ne devient pas un succès.
 perform passio_realtime_budget.consommer(acteur,cardinality(destinataires)::bigint,
  cardinality(destinataires)::bigint*(octet_length(charge::text)+1024));
 begin
  foreach destinataire in array destinataires loop
   if not public.blocage_entre(new.user_id,destinataire) then
    perform realtime.send(charge,'conv_reads:UPSERT','user:'||destinataire,true);
   end if;
  end loop;
 exception when others then
  raise warning 'diffuser_lecture : poussee sautee (%)',sqlerrm;
 end;
 return null;
end $f$;

revoke all on all functions in schema passio_realtime_budget from public,anon,authenticated,service_role;
revoke all on function public.broadcast_conv_message_to_users(),public.diffuser_lecture()
 from public,anon,authenticated,service_role;
do $v$ begin
 if has_schema_privilege('authenticated','passio_realtime_budget','usage')
 or has_table_privilege('authenticated','passio_realtime_budget.compteurs','select')
 or has_function_privilege('anon','public.diffuser_lecture()','execute') then
  raise exception 'budget realtime : droits inattendus';
 end if;
end $v$;
select 'realtime : budget avant diffusion' as controle,'OK' as valeur;
commit;
