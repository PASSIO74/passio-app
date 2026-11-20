-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 2026-11-20 — D10-01 : LE BUDGET TEMPS RÉEL SUIT LE COMPTE, PAS LE PROFIL
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Se joue APRÈS
-- migration_realtime_budget_2026-11-16.sql. Aucun PREREQUIS-CLIENT : sujets, événements et
-- charges diffusés ne changent pas.
-- Banc : tests/sql/migration-securite-p1-2026-11-20.test.sh.
--
-- CE QUI MANQUAIT (contre-vérification du 2026-11-20) :
--   ① `passio_realtime_budget.compteurs.compte` référençait `profiles(id) ON DELETE CASCADE`. Or un
--     compte peut supprimer puis recréer son propre profil : les trois fenêtres (minute, heure, jour)
--     disparaissaient avec lui, et le budget repartait de zéro à volonté.
--   ② Un accusé de lecture n'avait pas de plafond propre : seule la part « effets » du budget commun
--     le bornait, et chaque avancée était poussée à tous les membres.
--
-- CE QUI CHANGE :
--   ① Le compteur est indexé par l'identifiant d'AUTHENTIFICATION (`uuid`, clé étrangère vers
--     `auth.users ON DELETE CASCADE`) : supprimer ou recréer son profil ne touche plus le budget ;
--     seule la suppression réelle du compte l'efface. Un auteur sans compte d'authentification est
--     refusé (il n'existe pas en production : 0 profil sans compte, relu le 2026-11-20).
--   ② Un accusé est POUSSÉ au plus une fois toutes les 2 secondes par conversation et par compte
--     (`passio_realtime_budget.accuses`). Au-delà, la lecture est ENREGISTRÉE (la ligne avance) mais
--     n'est pas poussée : les autres membres la relisent à l'ouverture, ou la reçoivent avec
--     l'accusé suivant. L'avancée coûte toujours un effet du budget commun.
--
-- RETOUR ARRIÈRE (éditeur SQL), dans une transaction : remettre les corps de `consommer` et de
-- `diffuser_lecture` de migration_realtime_budget_2026-11-16.sql, puis :
--| begin;
--| select cron.unschedule('purge_accuses_realtime');
--| drop function if exists passio_realtime_budget.accuse_autorise(text, text);
--| drop table if exists passio_realtime_budget.accuses;
--| alter table passio_realtime_budget.compteurs drop constraint if exists compteurs_compte_auth_fkey;
--| alter table passio_realtime_budget.compteurs alter column compte type text using compte::text;
--| alter table passio_realtime_budget.compteurs add constraint compteurs_compte_fkey
--|   foreign key (compte) references public.profiles(id) on delete cascade;
--| commit;
-- (le retour remet le défaut ①, ne le jouer qu'en cas de panne avérée.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Refuser la dérive de corps plutôt que remplacer un correctif inconnu.
do $g$ declare f record; h text; begin
 if to_regclass('passio_realtime_budget.compteurs') is null or to_regclass('auth.users') is null then
  raise exception 'budget realtime du 2026-11-16 requis avant ce lot';
 end if;
 for f in select * from (values
   ('passio_realtime_budget.consommer(text,bigint,bigint)', '29a5a0186715c523654c8fc2e78fdf4f', 'a555b378aa795ae2e12ee5bc02058161'),
   ('public.diffuser_lecture()', '28d8f71c2f3ad9cc52720c4e4c5fddd6', '6f7daabfa2f740c8028b21ff3d0289fa')
 ) as x(signature,avant,apres) loop
  if to_regprocedure(f.signature) is null then raise exception 'budget realtime du 2026-11-16 requis avant ce lot'; end if;
  select md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g'))) into h
   from pg_proc p where p.oid=to_regprocedure(f.signature);
  if h not in (f.avant,f.apres) then raise exception 'corps different du catalogue relu : %', f.signature; end if;
 end loop;
end $g$;

-- ── ① Le budget suit le compte d'authentification ──────────────────────────────────────────────
alter table passio_realtime_budget.compteurs drop constraint if exists compteurs_compte_fkey;
do $t$ begin
 if (select format_type(a.atttypid,a.atttypmod) from pg_attribute a
      where a.attrelid='passio_realtime_budget.compteurs'::regclass and a.attname='compte' and not a.attisdropped) = 'text' then
  -- Un compteur sans compte d'authentification ne porte aucun contenu : il est écarté, et se
  -- recrée au prochain envoi (0 ligne de cette sorte en production le 2026-11-20).
  delete from passio_realtime_budget.compteurs c
   where c.compte !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not exists (select 1 from auth.users u where u.id::text = lower(c.compte));
  alter table passio_realtime_budget.compteurs alter column compte type uuid using compte::uuid;
 end if;
 if not exists (select 1 from pg_constraint where conrelid='passio_realtime_budget.compteurs'::regclass
                 and conname='compteurs_compte_auth_fkey') then
  alter table passio_realtime_budget.compteurs add constraint compteurs_compte_auth_fkey
   foreign key (compte) references auth.users(id) on delete cascade;
 end if;
end $t$;

-- ── ② Un accusé poussé par conversation et par compte toutes les 2 secondes ───────────────────
create table if not exists passio_realtime_budget.accuses (
 compte uuid not null references auth.users(id) on delete cascade,
 conv_id text not null,
 dernier timestamptz not null,
 primary key (compte, conv_id)
);
alter table passio_realtime_budget.accuses enable row level security;
revoke all on all tables in schema passio_realtime_budget from public,anon,authenticated,service_role;

create or replace function passio_realtime_budget.consommer(p_compte text,p_trames bigint,p_octets bigint)
returns void language plpgsql security definer set search_path = '' as $f$
declare i integer; moment timestamptz := clock_timestamp(); debut_f timestamptz; compte_id uuid;
 fin timestamptz; periode interval; v record; max_effets bigint; max_trames bigint; max_octets bigint;
begin
 if p_compte is null or p_trames is null or p_octets is null or p_trames < 0 or p_octets < 0
 or p_compte !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception 'budget de diffusion invalide' using errcode='22023';
 end if;
 -- L'identité d'authentification, jamais le profil : le budget survit à sa suppression.
 compte_id := p_compte::uuid;
 for i in 1..3 loop
  periode := case i when 1 then interval '1 minute' when 2 then interval '1 hour' else interval '24 hours' end;
  debut_f := date_trunc(case i when 1 then 'minute' when 2 then 'hour' else 'day' end,
   moment at time zone 'UTC') at time zone 'UTC';
  max_effets := case i when 1 then 120 when 2 then 2000 else 6000 end;
  max_trames := case i when 1 then 3000 when 2 then 30000 else 100000 end;
  max_octets := case i when 1 then 16777216 when 2 then 67108864 else 268435456 end;
  insert into passio_realtime_budget.compteurs as c(compte,fenetre,debut,effets,trames,octets)
   values(compte_id,i,debut_f,1,p_trames,p_octets)
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

-- Vrai si l'accusé peut être poussé : la ligne n'avance que si 2 secondes sont passées depuis le
-- dernier accusé poussé. Deux transactions concurrentes se sérialisent sur la ligne.
create or replace function passio_realtime_budget.accuse_autorise(p_compte text,p_conv text)
returns boolean language plpgsql security definer set search_path = '' as $f$
declare pousse boolean;
begin
 if p_compte is null or p_conv is null
 or p_compte !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception 'accuse de lecture invalide' using errcode='22023';
 end if;
 insert into passio_realtime_budget.accuses as a(compte,conv_id,dernier)
  values(p_compte::uuid,p_conv,clock_timestamp())
  on conflict(compte,conv_id) do update set dernier=excluded.dernier
   where a.dernier <= excluded.dernier - interval '2 seconds'
  returning true into pousse;
 return coalesce(pousse,false);
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
 -- Plafond propre aux accusés : un poussé par conversation et par compte toutes les 2 s.
 if not passio_realtime_budget.accuse_autorise(acteur,new.conv_id) then
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
revoke all on function public.diffuser_lecture() from public,anon,authenticated,service_role;

-- Une ligne d'accusé de plus d'un jour ne règle plus rien.
do $c$ begin
 perform cron.schedule('purge_accuses_realtime','41 2 * * *',
  $q$delete from passio_realtime_budget.accuses where dernier < now() - interval '1 day'$q$);
end $c$;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'budget realtime : indexé par le compte d''authentification' as controle,
       case when exists (select 1 from pg_constraint where conrelid='passio_realtime_budget.compteurs'::regclass
                          and contype='f' and confrelid='auth.users'::regclass and confdeltype='c')
             and (select format_type(atttypid,atttypmod) from pg_attribute
                   where attrelid='passio_realtime_budget.compteurs'::regclass and attname='compte') = 'uuid'
            then 'OK' else 'ECHEC' end as valeur
union all select 'budget realtime : survit à la suppression du profil',
       case when not exists (select 1 from pg_constraint where conrelid='passio_realtime_budget.compteurs'::regclass
                              and contype='f' and confrelid='public.profiles'::regclass) then 'OK' else 'ECHEC' end
union all select 'accusés : un poussé par conversation et par compte toutes les 2 s',
       case when (select relrowsecurity from pg_class where oid='passio_realtime_budget.accuses'::regclass)
             and (select prosrc from pg_proc where oid='public.diffuser_lecture()'::regprocedure) like '%accuse_autorise%'
             and (select prosrc from pg_proc where oid='passio_realtime_budget.accuse_autorise(text,text)'::regprocedure) like '%2 seconds%'
            then 'OK' else 'ECHEC' end
union all select 'accusés : effacés avec le compte d''authentification',
       case when exists (select 1 from pg_constraint where conrelid='passio_realtime_budget.accuses'::regclass
                          and contype='f' and confrelid='auth.users'::regclass and confdeltype='c') then 'OK' else 'ECHEC' end
union all select 'budget et accusés : aucun droit client',
       case when not has_schema_privilege('authenticated','passio_realtime_budget','usage')
             and not has_schema_privilege('anon','passio_realtime_budget','usage')
             and not has_table_privilege('authenticated','passio_realtime_budget.accuses','select')
             and not has_function_privilege('authenticated','passio_realtime_budget.accuse_autorise(text,text)','execute')
             and not has_function_privilege('anon','public.diffuser_lecture()','execute') then 'OK' else 'ECHEC' end
union all select 'accusés : purge quotidienne planifiée',
       case when exists (select 1 from cron.job where jobname='purge_accuses_realtime') then 'OK' else 'ECHEC' end;

commit;
